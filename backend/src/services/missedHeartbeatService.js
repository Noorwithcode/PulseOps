import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

import {
  ensureMonitoringState,
  findHealthCheckById,
  findHealthCheckByKey,
  findMonitoringStateForUpdate,
  insertHealthCheck,
  updateServerHeartbeatSnapshot,
} from "../repositories/heartbeatRepository.js";

import {
  findMissedHeartbeatCandidates,
  findServerForMissedHeartbeatForUpdate,
  getDatabaseUtcNow,
  updateMonitoringStateForMissedHeartbeat,
} from "../repositories/missedHeartbeatRepository.js";

import {
  processAutomaticIncident,
} from "./automaticIncidentService.js";

const DEFAULT_GRACE_MULTIPLIER = 3;
const DEFAULT_MINIMUM_TIMEOUT_SECONDS = 90;
const DEFAULT_BATCH_SIZE = 100;

const toPositiveInteger = (
  value,
  fallback,
  maximum
) => {
  const parsedValue =
    Number.parseInt(value, 10);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1
  ) {
    return fallback;
  }

  return Math.min(
    parsedValue,
    maximum
  );
};

const toTimestamp = (value) => {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    value === undefined ||
    value === null
  ) {
    return Number.NaN;
  }

  const text = String(value);

  const normalized =
    text.includes("T")
      ? text
      : `${text.replace(" ", "T")}Z`;

  return new Date(normalized).getTime();
};

const toMysqlDateTime = (value) => {
  const timestamp = toTimestamp(value);

  if (!Number.isFinite(timestamp)) {
    throw new AppError(
      500,
      "The database timestamp is invalid."
    );
  }

  return new Date(timestamp)
    .toISOString()
    .slice(0, 23)
    .replace("T", " ");
};

const buildMissedHeartbeatCheckKey = ({
  serverId,
  stateVersion,
  referenceTimestamp,
}) => {
  const referenceSeconds =
    Math.floor(
      referenceTimestamp / 1000
    );

  return [
    "AUTO-MISSED",
    serverId,
    stateVersion,
    referenceSeconds,
  ].join(":");
};

const loadConfiguration = (
  overrides = {}
) => ({
  graceMultiplier:
    toPositiveInteger(
      overrides.graceMultiplier ??
        process.env
          .HEALTH_MONITOR_GRACE_MULTIPLIER,
      DEFAULT_GRACE_MULTIPLIER,
      100
    ),

  minimumTimeoutSeconds:
    toPositiveInteger(
      overrides.minimumTimeoutSeconds ??
        process.env
          .HEALTH_MONITOR_MIN_TIMEOUT_SECONDS,
      DEFAULT_MINIMUM_TIMEOUT_SECONDS,
      86400
    ),

  batchSize:
    toPositiveInteger(
      overrides.batchSize ??
        process.env
          .HEALTH_MONITOR_BATCH_SIZE,
      DEFAULT_BATCH_SIZE,
      500
    ),

  serverId:
    overrides.serverId === undefined ||
    overrides.serverId === null
      ? null
      : toPositiveInteger(
          overrides.serverId,
          null,
          Number.MAX_SAFE_INTEGER
        ),
});

const processMissedHeartbeatCandidate =
  async (
    candidate,
    configuration
  ) => {
    const connection =
      await pool.getConnection();

    let transactionStarted = false;

    try {
      await connection.beginTransaction();
      transactionStarted = true;

      /*
       * Lock order must match heartbeatService:
       *
       * 1. servers row
       * 2. monitoring-state row
       */
      const server =
        await findServerForMissedHeartbeatForUpdate(
          connection,
          candidate.serverId
        );

      if (!server) {
        await connection.commit();
        transactionStarted = false;

        return {
          action: "SKIPPED_SERVER_NOT_FOUND",
          serverId: candidate.serverId,
        };
      }

      await ensureMonitoringState(
        connection,
        server.id
      );

      let monitoringState =
        await findMonitoringStateForUpdate(
          connection,
          server.id
        );

      if (!monitoringState) {
        throw new AppError(
          500,
          "Monitoring state could not be loaded."
        );
      }

      const databaseNow =
        await getDatabaseUtcNow(
          connection
        );

      const currentTimestamp =
        toTimestamp(databaseNow);

      const referenceValue =
        monitoringState.lastReceivedAt ||
        server.createdAt;

      const referenceTimestamp =
        toTimestamp(referenceValue);

      if (
        !Number.isFinite(
          currentTimestamp
        ) ||
        !Number.isFinite(
          referenceTimestamp
        )
      ) {
        throw new AppError(
          500,
          `Heartbeat timestamps are invalid for server ${server.serverCode}.`
        );
      }

      const timeoutSeconds =
        Math.max(
          Number(
            server.checkIntervalSeconds
          ) *
            configuration
              .graceMultiplier,

          configuration
            .minimumTimeoutSeconds
        );

      const deadlineTimestamp =
        referenceTimestamp +
        timeoutSeconds * 1000;

      /*
       * A real heartbeat may have arrived after
       * candidate discovery but before this row
       * lock was acquired.
       */
      if (
        currentTimestamp <
        deadlineTimestamp
      ) {
        await connection.commit();
        transactionStarted = false;

        return {
          action:
            "SKIPPED_HEARTBEAT_RECOVERED",

          serverId: server.id,
          serverCode: server.serverCode,
        };
      }

      if (
        monitoringState.observedStatus ===
          "OFFLINE" &&
        server.status === "OFFLINE"
      ) {
        await connection.commit();
        transactionStarted = false;

        return {
          action:
            "SKIPPED_ALREADY_OFFLINE",

          serverId: server.id,
          serverCode: server.serverCode,
        };
      }

      const stateVersion =
        Number(
          monitoringState.stateVersion ||
          0
        );

      const checkKey =
        buildMissedHeartbeatCheckKey({
          serverId: server.id,
          stateVersion,
          referenceTimestamp,
        });

      /*
       * Additional idempotency protection.
       */
      const existingHealthCheck =
        await findHealthCheckByKey(
          connection,
          server.id,
          checkKey
        );

      if (existingHealthCheck) {
        await connection.commit();
        transactionStarted = false;

        return {
          action:
            "SKIPPED_ALREADY_PROCESSED",

          serverId: server.id,
          serverCode: server.serverCode,

          healthCheck:
            existingHealthCheck,
        };
      }

      const reportedAt =
        toMysqlDateTime(
          databaseNow
        );

      const overdueSeconds =
        Math.max(
          0,
          Math.floor(
            (
              currentTimestamp -
              deadlineTimestamp
            ) / 1000
          )
        );

      const healthCheckId =
        await insertHealthCheck(
          connection,
          {
            serverId: server.id,
            checkKey,
            checkType: "HEARTBEAT",
            status: "OFFLINE",
            reportedAt,

            responseTimeMs: null,
            cpuUsagePercent: null,
            memoryUsagePercent: null,
            diskUsagePercent: null,
            uptimeSeconds: null,

            errorCode:
              "MISSED_HEARTBEAT",

            message:
              `No heartbeat was received within ${timeoutSeconds} seconds. ` +
              `The heartbeat deadline was exceeded by ${overdueSeconds} seconds.`,
          }
        );

      const healthCheck =
        await findHealthCheckById(
          connection,
          healthCheckId
        );

      if (!healthCheck) {
        throw new AppError(
          500,
          "Missed-heartbeat health check was saved but could not be loaded."
        );
      }

      const monitoringRowsUpdated =
        await updateMonitoringStateForMissedHeartbeat(
          connection,
          {
            serverId: server.id,
            healthCheckId,
            reportedAt,
          }
        );

      if (
        monitoringRowsUpdated !== 1
      ) {
        throw new AppError(
          409,
          "Monitoring state changed while processing the missed heartbeat."
        );
      }

      await updateServerHeartbeatSnapshot(
        connection,
        {
          serverId: server.id,
          status: "OFFLINE",
          reportedAt,
        }
      );

      /*
       * Automatic incident creation occurs
       * inside this same transaction.
       */
      const automaticIncident =
        await processAutomaticIncident(
          connection,
          {
            server,
            healthCheck,
          }
        );

      monitoringState =
        await findMonitoringStateForUpdate(
          connection,
          server.id
        );

      if (!monitoringState) {
        throw new AppError(
          500,
          "Updated monitoring state could not be loaded."
        );
      }

      await connection.commit();
      transactionStarted = false;

      return {
        action: "MARKED_OFFLINE",

        serverId: server.id,
        serverCode: server.serverCode,

        timeoutSeconds,
        overdueSeconds,

        healthCheck,
        monitoringState,
        automaticIncident,
      };
    } catch (error) {
      if (transactionStarted) {
        await connection.rollback();
      }

      throw error;
    } finally {
      connection.release();
    }
  };

export const runMissedHeartbeatSweep =
  async (overrides = {}) => {
    const configuration =
      loadConfiguration(
        overrides
      );

    const discoveryConnection =
      await pool.getConnection();

    let candidates;

    try {
      candidates =
        await findMissedHeartbeatCandidates(
          discoveryConnection,
          {
            graceMultiplier:
              configuration
                .graceMultiplier,

            minimumTimeoutSeconds:
              configuration
                .minimumTimeoutSeconds,

            limit:
              configuration.batchSize,

            serverId:
              configuration.serverId,
          }
        );
    } finally {
      discoveryConnection.release();
    }

    const summary = {
      scanned: candidates.length,
      markedOffline: 0,
      skipped: 0,
      failed: 0,
      results: [],
      errors: [],
    };

    /*
     * Process sequentially to avoid consuming
     * the entire MySQL connection pool.
     */
    for (const candidate of candidates) {
      try {
        const result =
          await processMissedHeartbeatCandidate(
            candidate,
            configuration
          );

        summary.results.push(result);

        if (
          result.action ===
          "MARKED_OFFLINE"
        ) {
          summary.markedOffline += 1;
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.failed += 1;

        summary.errors.push({
          serverId:
            candidate.serverId,

          serverCode:
            candidate.serverCode,

          message:
            error.message,
        });
      }
    }

    return summary;
  };