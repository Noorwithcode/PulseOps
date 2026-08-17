import "dotenv/config";

import pool from "../config/db.js";

import {
  recordServerHeartbeat,
} from "../services/heartbeatService.js";

import {
  runMissedHeartbeatSweep,
} from "../services/missedHeartbeatService.js";

const serverId =
  Number(
    process.env.TEST_SERVER_ID ||
    1
  );

const createCheckKey = (
  label
) =>
  [
    "MISSED-HB-TEST",
    label,
    serverId,
    Date.now(),
  ].join("-");

const prepareMonitoringState =
  async () => {
    const connection =
      await pool.getConnection();

    let transactionStarted = false;

    try {
      await connection.beginTransaction();
      transactionStarted = true;

      const [servers] =
        await connection.execute(
          `
            SELECT
              id,
              server_code AS serverCode

            FROM servers

            WHERE id = ?
              AND deleted_at IS NULL

            LIMIT 1
            FOR UPDATE
          `,
          [serverId]
        );

      const server =
        servers[0];

      if (!server) {
        throw new Error(
          `Active server ${serverId} was not found.`
        );
      }

      await connection.execute(
        `
          INSERT INTO server_monitoring_states (
            server_id
          )
          VALUES (?)

          ON DUPLICATE KEY UPDATE
            server_id = ?
        `,
        [serverId, serverId]
      );

      /*
       * Make the next ONLINE heartbeat fresh
       * and in-order.
       */
      await connection.execute(
        `
          UPDATE server_monitoring_states

          SET
            observed_status = 'UNKNOWN',

            last_reported_at =
              DATE_SUB(
                UTC_TIMESTAMP(3),
                INTERVAL 1 DAY
              ),

            last_received_at =
              DATE_SUB(
                UTC_TIMESTAMP(3),
                INTERVAL 1 DAY
              )

          WHERE server_id = ?
        `,
        [serverId]
      );

      await connection.execute(
        `
          UPDATE servers

          SET
            status = 'UNKNOWN',
            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
        `,
        [serverId]
      );

      await connection.commit();
      transactionStarted = false;

      return server;
    } catch (error) {
      if (transactionStarted) {
        await connection.rollback();
      }

      throw error;
    } finally {
      connection.release();
    }
  };

const ageHeartbeat =
  async () => {
    const connection =
      await pool.getConnection();

    let transactionStarted = false;

    try {
      await connection.beginTransaction();
      transactionStarted = true;

      await connection.execute(
        `
          UPDATE server_monitoring_states

          SET
            observed_status = 'ONLINE',

            last_received_at =
              DATE_SUB(
                UTC_TIMESTAMP(3),
                INTERVAL 1 DAY
              )

          WHERE server_id = ?
        `,
        [serverId]
      );

      await connection.execute(
        `
          UPDATE servers

          SET
            status = 'ONLINE',
            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND deleted_at IS NULL
        `,
        [serverId]
      );

      await connection.commit();
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        await connection.rollback();
      }

      throw error;
    } finally {
      connection.release();
    }
  };

const main = async () => {
  if (
    !Number.isSafeInteger(serverId) ||
    serverId < 1
  ) {
    throw new Error(
      "TEST_SERVER_ID must be a positive integer."
    );
  }

  const server =
    await prepareMonitoringState();

  console.log(
    `Testing server: ${server.serverCode} (${server.id})`
  );

  /*
   * Resolve any previous active automatic
   * incident and establish ONLINE baseline.
   */
  const baseline =
    await recordServerHeartbeat({
      serverIdValue: serverId,

      input: {
        checkKey:
          createCheckKey(
            "BASELINE-ONLINE"
          ),

        checkType: "HEARTBEAT",
        status: "ONLINE",

        reportedAt:
          new Date().toISOString(),

        responseTimeMs: 25,

        message:
          "Baseline heartbeat for missed-heartbeat test.",
      },
    });

  console.log(
    "Baseline ONLINE:",
    baseline
      .automaticIncident
      .action
  );

  /*
   * Simulate that no heartbeat has arrived
   * for one day.
   */
  await ageHeartbeat();

  const sweep =
    await runMissedHeartbeatSweep({
      serverId,
      graceMultiplier: 1,
      minimumTimeoutSeconds: 1,
      batchSize: 10,
    });

  const missedResult =
    sweep.results.find(
      (result) =>
        result.serverId ===
        serverId
    );

  console.log(
    "Missed heartbeat:",
    missedResult?.action
  );

  console.log(
    "Automatic incident:",
    missedResult
      ?.automaticIncident
      ?.action
  );

  if (
    missedResult?.action !==
    "MARKED_OFFLINE"
  ) {
    throw new Error(
      `Expected MARKED_OFFLINE but received ${missedResult?.action || "NO_RESULT"}.`
    );
  }

  if (
    missedResult
      .automaticIncident
      .action !== "CREATED"
  ) {
    throw new Error(
      `Expected incident CREATED but received ${missedResult.automaticIncident.action}.`
    );
  }

  /*
   * Use a slightly future timestamp so it is
   * definitely newer than the scheduler-created
   * OFFLINE health check.
   */
  const recoveryTime =
    new Date(
      Date.now() + 5000
    );

  const recovery =
    await recordServerHeartbeat({
      serverIdValue: serverId,

      input: {
        checkKey:
          createCheckKey(
            "RECOVERY-ONLINE"
          ),

        checkType: "HEARTBEAT",
        status: "ONLINE",

        reportedAt:
          recoveryTime.toISOString(),

        responseTimeMs: 18,

        message:
          "Server recovered after missed heartbeat.",
      },
    });

  console.log(
    "Recovery ONLINE:",
    recovery
      .automaticIncident
      .action
  );

  if (
    recovery
      .automaticIncident
      .action !== "RESOLVED"
  ) {
    throw new Error(
      `Expected RESOLVED but received ${recovery.automaticIncident.action}.`
    );
  }

  console.log(
    "Missed heartbeat flow passed: MARKED_OFFLINE -> CREATED -> RESOLVED"
  );
};

main()
  .catch((error) => {
    console.error(
      "Missed heartbeat test failed:",
      error.message
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });