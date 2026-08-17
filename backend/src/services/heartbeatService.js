import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

import {
  ensureMonitoringState,
  findActiveServerForHeartbeat,
  findHealthCheckById,
  findHealthCheckByKey,
  findMonitoringStateForUpdate,
  insertHealthCheck,
  updateMonitoringState,
  updateServerHeartbeatSnapshot,
} from "../repositories/heartbeatRepository.js";

import {
  processAutomaticIncident,
} from "./automaticIncidentService.js";

import {
  evaluateAlertRulesForHealthCheck,
} from "./alertRuleService.js";

const MAX_HEARTBEAT_AGE_MS =
  5 * 60 * 1000;

const ALLOWED_FIELDS =
  new Set([
    "checkKey",
    "checkType",
    "status",
    "reportedAt",
    "responseTimeMs",
    "cpuUsagePercent",
    "memoryUsagePercent",
    "diskUsagePercent",
    "uptimeSeconds",
    "errorCode",
    "message",
  ]);

const CHECK_TYPES =
  new Set([
    "HEARTBEAT",
    "HTTP",
    "TCP",
    "MANUAL",
  ]);

const STATUSES =
  new Set([
    "ONLINE",
    "DEGRADED",
    "OFFLINE",
    "UNKNOWN",
  ]);

const createEmptyAlertEvaluation =
  (action = "NOT_EVALUATED") => ({
    action,

    totalRules: 0,

    evaluated: 0,
    ignored: 0,

    breachesRecorded: 0,
    alertsOpened: 0,

    recoveriesRecorded: 0,
    alertsResolved: 0,

    activeAlerts: 0,

    results: [],
  });

const validateServerId = (
  value
) => {
  const serverId =
    Number(value);

  if (
    !Number.isSafeInteger(
      serverId
    ) ||
    serverId < 1
  ) {
    throw new AppError(
      400,
      "Server ID must be a positive integer."
    );
  }

  return serverId;
};

const optionalNumber = (
  value,
  field,
  minimum,
  maximum,
  integer = false
) => {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === "string" &&
    value.trim() === ""
  ) {
    throw new AppError(
      400,
      `${field} must be a valid number.`
    );
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < minimum ||
    number > maximum ||
    (
      integer &&
      !Number.isSafeInteger(
        number
      )
    )
  ) {
    throw new AppError(
      400,
      `${field} must be between ${minimum} and ${maximum}.`
    );
  }

  return number;
};

const optionalText = (
  value,
  field,
  maximumLength
) => {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  if (
    text.length >
    maximumLength
  ) {
    throw new AppError(
      400,
      `${field} cannot exceed ${maximumLength} characters.`
    );
  }

  return text;
};

const toMysqlDateTime = (
  date
) =>
  date
    .toISOString()
    .slice(0, 23)
    .replace("T", " ");

const toTimestamp = (
  value
) => {
  if (
    value instanceof Date
  ) {
    return value.getTime();
  }

  const stringValue =
    String(value);

  const normalized =
    stringValue.includes("T")
      ? stringValue
      : `${stringValue.replace(
          " ",
          "T"
        )}Z`;

  return new Date(
    normalized
  ).getTime();
};

const validateHeartbeatInput = (
  input
) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new AppError(
      400,
      "A valid JSON request body is required."
    );
  }

  const unsupportedFields =
    Object.keys(input).filter(
      (field) =>
        !ALLOWED_FIELDS.has(
          field
        )
    );

  if (
    unsupportedFields.length >
    0
  ) {
    throw new AppError(
      400,
      `Unsupported heartbeat field(s): ${unsupportedFields.join(
        ", "
      )}.`
    );
  }

  const checkKey =
    String(
      input.checkKey || ""
    ).trim();

  if (
    !checkKey ||
    checkKey.length > 100
  ) {
    throw new AppError(
      400,
      "checkKey is required and cannot exceed 100 characters."
    );
  }

  const checkType =
    String(
      input.checkType ||
      "HEARTBEAT"
    )
      .trim()
      .toUpperCase();

  if (
    !CHECK_TYPES.has(
      checkType
    )
  ) {
    throw new AppError(
      400,
      `checkType must be one of: ${[
        ...CHECK_TYPES,
      ].join(", ")}.`
    );
  }

  const status =
    String(
      input.status || ""
    )
      .trim()
      .toUpperCase();

  if (
    !STATUSES.has(
      status
    )
  ) {
    throw new AppError(
      400,
      `status must be one of: ${[
        ...STATUSES,
      ].join(", ")}.`
    );
  }

  const reportedDate =
    new Date(
      input.reportedAt
    );

  if (
    !input.reportedAt ||
    Number.isNaN(
      reportedDate.getTime()
    )
  ) {
    throw new AppError(
      400,
      "reportedAt must be a valid ISO date and time."
    );
  }

  const maximumFutureTime =
    Date.now() +
    5 * 60 * 1000;

  if (
    reportedDate.getTime() >
    maximumFutureTime
  ) {
    throw new AppError(
      400,
      "reportedAt cannot be more than 5 minutes in the future."
    );
  }

  return {
    checkKey,
    checkType,
    status,

    reportedAt:
      toMysqlDateTime(
        reportedDate
      ),

    reportedAtTimestamp:
      reportedDate.getTime(),

    responseTimeMs:
      optionalNumber(
        input.responseTimeMs,
        "responseTimeMs",
        0,
        86400000,
        true
      ),

    cpuUsagePercent:
      optionalNumber(
        input.cpuUsagePercent,
        "cpuUsagePercent",
        0,
        100
      ),

    memoryUsagePercent:
      optionalNumber(
        input.memoryUsagePercent,
        "memoryUsagePercent",
        0,
        100
      ),

    diskUsagePercent:
      optionalNumber(
        input.diskUsagePercent,
        "diskUsagePercent",
        0,
        100
      ),

    uptimeSeconds:
      optionalNumber(
        input.uptimeSeconds,
        "uptimeSeconds",
        0,
        Number.MAX_SAFE_INTEGER,
        true
      ),

    errorCode:
      optionalText(
        input.errorCode,
        "errorCode",
        80
      ),

    message:
      optionalText(
        input.message,
        "message",
        500
      ),
  };
};

export const recordServerHeartbeat =
  async ({
    serverIdValue,
    input,
  }) => {
    const serverId =
      validateServerId(
        serverIdValue
      );

    const heartbeat =
      validateHeartbeatInput(
        input
      );

    const connection =
      await pool.getConnection();

    let transactionStarted =
      false;

    let automaticIncident = {
      action:
        "NOT_EVALUATED",

      incident:
        null,
    };

    let alertEvaluation =
      createEmptyAlertEvaluation();

    try {
      await connection
        .beginTransaction();

      transactionStarted =
        true;

      const server =
        await findActiveServerForHeartbeat(
          connection,
          serverId
        );

      if (!server) {
        throw new AppError(
          404,
          "Active server not found."
        );
      }

      await ensureMonitoringState(
        connection,
        serverId
      );

      let monitoringState =
        await findMonitoringStateForUpdate(
          connection,
          serverId
        );

      if (!monitoringState) {
        throw new AppError(
          500,
          "Monitoring state could not be initialized."
        );
      }

      /*
       * Idempotency protection.
       *
       * The server and monitoring-state rows
       * are already locked.
       */
      const existingCheck =
        await findHealthCheckByKey(
          connection,
          serverId,
          heartbeat.checkKey
        );

      if (existingCheck) {
        await connection.commit();

        transactionStarted =
          false;

        return {
          duplicate:
            true,

          stateChanged:
            false,

          reason:
            "DUPLICATE_CHECK_KEY",

          healthCheck:
            existingCheck,

          monitoringState,

          automaticIncident: {
            action:
              "SKIPPED_DUPLICATE_HEARTBEAT",

            incident:
              null,
          },

          alertEvaluation:
            createEmptyAlertEvaluation(
              "SKIPPED_DUPLICATE_HEARTBEAT"
            ),
        };
      }

      /*
       * Out-of-order protection.
       */
      const lastReportedTimestamp =
        monitoringState
          .lastReportedAt
          ? toTimestamp(
              monitoringState
                .lastReportedAt
            )
          : null;

      if (
        lastReportedTimestamp !==
          null &&
        !Number.isFinite(
          lastReportedTimestamp
        )
      ) {
        throw new AppError(
          500,
          "The current monitoring timestamp is invalid."
        );
      }

      const outOfOrder =
        lastReportedTimestamp !==
          null &&
        heartbeat
          .reportedAtTimestamp <=
          lastReportedTimestamp;

      /*
       * Always store the health check for
       * audit history.
       */
      const healthCheckId =
        await insertHealthCheck(
          connection,
          {
            serverId,
            ...heartbeat,
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
          "Health check was saved but could not be loaded."
        );
      }

      /*
       * Stale heartbeat protection.
       */
      const receivedAtTimestamp =
        toTimestamp(
          healthCheck.receivedAt
        );

      if (
        !Number.isFinite(
          receivedAtTimestamp
        )
      ) {
        throw new AppError(
          500,
          "The heartbeat received timestamp is invalid."
        );
      }

      const heartbeatAgeMs =
        receivedAtTimestamp -
        heartbeat
          .reportedAtTimestamp;

      const stale =
        heartbeatAgeMs >
        MAX_HEARTBEAT_AGE_MS;

      /*
       * Only fresh and in-order health checks
       * may change live state.
       */
      if (
        !outOfOrder &&
        !stale
      ) {
        await updateMonitoringState(
          connection,
          {
            serverId,
            healthCheckId,

            status:
              heartbeat.status,

            reportedAt:
              heartbeat.reportedAt,

            receivedAt:
              healthCheck.receivedAt,

            responseTimeMs:
              heartbeat.responseTimeMs,
          }
        );

        await updateServerHeartbeatSnapshot(
          connection,
          {
            serverId,

            status:
              heartbeat.status,

            reportedAt:
              heartbeat.reportedAt,
          }
        );

        /*
         * Offline incident processing uses the
         * same database transaction.
         */
        automaticIncident =
          await processAutomaticIncident(
            connection,
            {
              server,
              healthCheck,
            }
          );

        /*
         * CPU, memory, disk and response-time
         * rules are also evaluated in the same
         * transaction.
         */
        alertEvaluation =
          await evaluateAlertRulesForHealthCheck(
            connection,
            {
              server,
              healthCheck,
            }
          );

        monitoringState =
          await findMonitoringStateForUpdate(
            connection,
            serverId
          );

        if (!monitoringState) {
          throw new AppError(
            500,
            "Updated monitoring state could not be loaded."
          );
        }
      }

      await connection.commit();

      transactionStarted =
        false;

      let reason =
        null;

      if (outOfOrder) {
        reason =
          "OUT_OF_ORDER_HEARTBEAT";

        automaticIncident = {
          action:
            "SKIPPED_OUT_OF_ORDER_HEARTBEAT",

          incident:
            null,
        };

        alertEvaluation =
          createEmptyAlertEvaluation(
            "SKIPPED_OUT_OF_ORDER_HEARTBEAT"
          );
      } else if (stale) {
        reason =
          "STALE_HEARTBEAT";

        automaticIncident = {
          action:
            "SKIPPED_STALE_HEARTBEAT",

          incident:
            null,
        };

        alertEvaluation =
          createEmptyAlertEvaluation(
            "SKIPPED_STALE_HEARTBEAT"
          );
      }

      return {
        duplicate:
          false,

        stateChanged:
          !outOfOrder &&
          !stale,

        reason,

        healthCheck,
        monitoringState,

        automaticIncident,
        alertEvaluation,
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