import "dotenv/config";

import pool from "../config/db.js";

import {
  insertIncidentEvent,
} from "../repositories/incidentRepository.js";

import {
  recordServerHeartbeat,
} from "../services/heartbeatService.js";

const SERVER_ID =
  Number(
    process.env.TEST_SERVER_ID ||
    1
  );

const CPU_RULE_CODE =
  "GLOBAL-CPU-CRITICAL";

const createCheckKey = (
  label
) =>
  [
    "THRESHOLD-INCIDENT-TEST",
    label,
    SERVER_ID,
    Date.now(),
    Math.random()
      .toString(16)
      .slice(2),
  ].join("-");

const buildIncidentDedupKey = ({
  ruleId,
  serverId,
}) =>
  `AUTO:RULE:${ruleId}:SERVER:${serverId}`;

const prepareTestState =
  async () => {
    const connection =
      await pool.getConnection();

    let transactionStarted =
      false;

    try {
      await connection
        .beginTransaction();

      transactionStarted =
        true;

      const [serverRows] =
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
          [SERVER_ID]
        );

      const server =
        serverRows[0];

      if (!server) {
        throw new Error(
          `Active server ${SERVER_ID} was not found.`
        );
      }

      const [ruleRows] =
        await connection.execute(
          `
            SELECT
              id,
              rule_code AS ruleCode

            FROM alert_rules

            WHERE rule_code = ?
              AND is_enabled = 1

            LIMIT 1
            FOR UPDATE
          `,
          [CPU_RULE_CODE]
        );

      const rule =
        ruleRows[0];

      if (!rule) {
        throw new Error(
          `Alert rule ${CPU_RULE_CODE} was not found.`
        );
      }

      const incidentDedupKey =
        buildIncidentDedupKey({
          ruleId: rule.id,
          serverId: SERVER_ID,
        });

      const [activeIncidentRows] =
        await connection.execute(
          `
            SELECT
              id,
              status

            FROM incidents

            WHERE active_dedup_key = ?
              AND source = 'AUTOMATIC'
              AND status IN (
                'OPEN',
                'ACKNOWLEDGED'
              )

            LIMIT 1
            FOR UPDATE
          `,
          [incidentDedupKey]
        );

      const activeIncident =
        activeIncidentRows[0];

      if (activeIncident) {
        await connection.execute(
          `
            UPDATE incidents

            SET
              status = 'RESOLVED',
              resolved_at =
                UTC_TIMESTAMP(3),
              resolved_by = NULL,
              resolution_notes =
                'Reset before threshold incident integration test.',
              active_dedup_key = NULL,
              version = version + 1

            WHERE id = ?
          `,
          [activeIncident.id]
        );

        await insertIncidentEvent(
          connection,
          {
            incidentId:
              activeIncident.id,

            eventKey:
              `TEST:THRESHOLD:RESET:${activeIncident.id}:${Date.now()}`,

            eventType:
              "RESOLVED",

            fromStatus:
              activeIncident.status,

            toStatus:
              "RESOLVED",

            sourceHealthCheckId:
              null,

            actorUserId:
              null,

            message:
              "Threshold incident reset before automated integration test.",

            metadata: {
              test:
                "threshold-incident-flow",
            },
          }
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
        [
          SERVER_ID,
          SERVER_ID,
        ]
      );

      await connection.execute(
        `
          UPDATE server_monitoring_states

          SET
            observed_status =
              'ONLINE',

            last_reported_at =
              DATE_SUB(
                UTC_TIMESTAMP(3),
                INTERVAL 1 DAY
              ),

            last_received_at =
              DATE_SUB(
                UTC_TIMESTAMP(3),
                INTERVAL 1 DAY
              ),

            consecutive_successes = 0,
            consecutive_failures = 0

          WHERE server_id = ?
        `,
        [SERVER_ID]
      );

      await connection.execute(
        `
          UPDATE servers

          SET
            status = 'ONLINE',
            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
        `,
        [SERVER_ID]
      );

      await connection.execute(
        `
          INSERT INTO alert_rule_states (
            rule_id,
            server_id
          )
          VALUES (?, ?)

          ON DUPLICATE KEY UPDATE
            id = id
        `,
        [
          rule.id,
          SERVER_ID,
        ]
      );

      await connection.execute(
        `
          UPDATE alert_rule_states

          SET
            current_status =
              'NORMAL',

            last_health_check_id =
              NULL,

            last_metric_value =
              NULL,

            consecutive_breaches =
              0,

            consecutive_recoveries =
              0,

            first_breached_at =
              NULL,

            last_breached_at =
              NULL,

            alert_started_at =
              NULL,

            last_recovered_at =
              NULL,

            active_alert_key =
              NULL,

            state_version =
              state_version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE rule_id = ?
            AND server_id = ?
        `,
        [
          rule.id,
          SERVER_ID,
        ]
      );

      await connection.commit();
      transactionStarted = false;

      return {
        server,
        rule,
      };
    } catch (error) {
      if (transactionStarted) {
        await connection
          .rollback();
      }

      throw error;
    } finally {
      connection.release();
    }
  };

const findCpuEvaluation = (
  response
) =>
  response
    ?.alertEvaluation
    ?.results
    ?.find(
      (result) =>
        result.ruleCode ===
        CPU_RULE_CODE
    );

const sendCpuHeartbeat =
  async ({
    label,
    cpuUsagePercent,
    reportedAt,
  }) => {
    const response =
      await recordServerHeartbeat({
        serverIdValue:
          SERVER_ID,

        input: {
          checkKey:
            createCheckKey(
              label
            ),

          checkType:
            "HEARTBEAT",

          status:
            "ONLINE",

          reportedAt:
            reportedAt
              .toISOString(),

          responseTimeMs:
            100,

          cpuUsagePercent,

          memoryUsagePercent:
            40,

          diskUsagePercent:
            50,

          uptimeSeconds:
            86400,

          message:
            `Threshold incident test: ${label}`,
        },
      });

    return {
      response,

      evaluation:
        findCpuEvaluation(
          response
        ),
    };
  };

const assertEqual = (
  label,
  actual,
  expected
) => {
  console.log(
    `${label}: ${actual}`
  );

  if (actual !== expected) {
    throw new Error(
      `${label} expected ${expected} but received ${actual}.`
    );
  }
};

const main = async () => {
  if (
    !Number.isSafeInteger(
      SERVER_ID
    ) ||
    SERVER_ID < 1
  ) {
    throw new Error(
      "TEST_SERVER_ID must be a positive integer."
    );
  }

  const {
    server,
  } =
    await prepareTestState();

  console.log(
    `Testing server: ${server.serverCode} (${server.id})`
  );

  const baseTime =
    Date.now();

  const baseline =
    await sendCpuHeartbeat({
      label:
        "BASELINE",

      cpuUsagePercent:
        30,

      reportedAt:
        new Date(
          baseTime
        ),
    });

  assertEqual(
    "Baseline CPU",
    baseline.evaluation?.action,
    "NO_CHANGE"
  );

  const breach1 =
    await sendCpuHeartbeat({
      label:
        "BREACH-1",

      cpuUsagePercent:
        95,

      reportedAt:
        new Date(
          baseTime + 1000
        ),
    });

  assertEqual(
    "CPU breach 1",
    breach1.evaluation?.action,
    "BREACH_RECORDED"
  );

  const breach2 =
    await sendCpuHeartbeat({
      label:
        "BREACH-2",

      cpuUsagePercent:
        96,

      reportedAt:
        new Date(
          baseTime + 2000
        ),
    });

  assertEqual(
    "CPU breach 2",
    breach2.evaluation?.action,
    "BREACH_RECORDED"
  );

  const breach3 =
    await sendCpuHeartbeat({
      label:
        "BREACH-3",

      cpuUsagePercent:
        97,

      reportedAt:
        new Date(
          baseTime + 3000
        ),
    });

  assertEqual(
    "CPU breach 3",
    breach3.evaluation?.action,
    "ALERT_OPENED"
  );

  assertEqual(
    "Threshold incident open",
    breach3.evaluation
      ?.thresholdIncident
      ?.action,
    "CREATED"
  );

  const breach4 =
    await sendCpuHeartbeat({
      label:
        "BREACH-4",

      cpuUsagePercent:
        98,

      reportedAt:
        new Date(
          baseTime + 4000
        ),
    });

  assertEqual(
    "CPU active breach",
    breach4.evaluation?.action,
    "ALERT_STILL_ACTIVE"
  );

  assertEqual(
    "Threshold occurrence",
    breach4.evaluation
      ?.thresholdIncident
      ?.action,
    "OCCURRENCE_RECORDED"
  );

  const recovery1 =
    await sendCpuHeartbeat({
      label:
        "RECOVERY-1",

      cpuUsagePercent:
        70,

      reportedAt:
        new Date(
          baseTime + 5000
        ),
    });

  assertEqual(
    "CPU recovery 1",
    recovery1.evaluation?.action,
    "RECOVERY_RECORDED"
  );

  const recovery2 =
    await sendCpuHeartbeat({
      label:
        "RECOVERY-2",

      cpuUsagePercent:
        70,

      reportedAt:
        new Date(
          baseTime + 6000
        ),
    });

  assertEqual(
    "CPU recovery 2",
    recovery2.evaluation?.action,
    "ALERT_RESOLVED"
  );

  assertEqual(
    "Threshold incident recovery",
    recovery2.evaluation
      ?.thresholdIncident
      ?.action,
    "RESOLVED"
  );

  console.log(
    [
      "Threshold incident flow passed:",
      "ALERT_OPENED",
      "-> CREATED",
      "-> OCCURRENCE_RECORDED",
      "-> ALERT_RESOLVED",
      "-> RESOLVED",
    ].join(" ")
  );
};

main()
  .catch((error) => {
    console.error(
      "Threshold incident test failed:",
      error.message
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
