import AppError from "../utils/AppError.js";

import {
  findActiveAutomaticIncidentForUpdate,
  findIncidentById,
  findIncidentEventByKey,
  insertAutomaticThresholdIncident,
  insertIncidentEvent,
  recordAutomaticIncidentOccurrence,
  resolveAutomaticIncident,
} from "../repositories/incidentRepository.js";

const INCIDENT_TYPE_MAP = {
  CPU_USAGE_PERCENT: "HIGH_CPU",
  MEMORY_USAGE_PERCENT: "HIGH_MEMORY",
  DISK_USAGE_PERCENT: "HIGH_DISK",
  RESPONSE_TIME_MS: "HIGH_RESPONSE_TIME",
};

const INCIDENT_SEVERITY_MAP = {
  WARNING: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

const isDuplicateKeyError = (error) =>
  error?.errno === 1062 ||
  error?.code === "ER_DUP_ENTRY";

const buildActiveDedupKey = ({
  ruleId,
  serverId,
}) =>
  `AUTO:RULE:${ruleId}:SERVER:${serverId}`;

const buildIncidentNumber = (
  healthCheckId
) =>
  `INC-TH-${healthCheckId}`;

const buildBreachEventKey = ({
  ruleId,
  healthCheckId,
}) =>
  `AUTO:RULE:BREACH:${ruleId}:${healthCheckId}`;

const buildRecoveryEventKey = ({
  ruleId,
  healthCheckId,
}) =>
  `AUTO:RULE:RECOVERY:${ruleId}:${healthCheckId}`;

const loadIncidentOrFail = async (
  connection,
  incidentId
) => {
  const incident =
    await findIncidentById(
      connection,
      incidentId
    );

  if (!incident) {
    throw new AppError(
      500,
      "Threshold incident could not be loaded."
    );
  }

  return incident;
};

const buildMetadata = ({
  server,
  healthCheck,
  rule,
  evaluation,
}) => ({
  serverCode:
    server.serverCode,

  ruleId:
    rule.id,

  ruleCode:
    rule.ruleCode,

  ruleName:
    rule.name,

  metricType:
    rule.metricType,

  metricValue:
    evaluation.metricValue,

  thresholdValue:
    rule.thresholdValue,

  recoveryValue:
    rule.recoveryValue,

  severity:
    rule.severity,

  evaluationAction:
    evaluation.action,

  evaluationResult:
    evaluation.evaluationResult,

  checkKey:
    healthCheck.checkKey,

  checkType:
    healthCheck.checkType,

  healthStatus:
    healthCheck.status,
});

const getIncidentType = (
  metricType
) => {
  const incidentType =
    INCIDENT_TYPE_MAP[
      metricType
    ];

  if (!incidentType) {
    throw new AppError(
      500,
      `No incident type is configured for alert metric ${metricType}.`
    );
  }

  return incidentType;
};

const getIncidentSeverity = (
  severity
) =>
  INCIDENT_SEVERITY_MAP[
    severity
  ] || "MEDIUM";

const buildTitle = ({
  server,
  rule,
}) =>
  `${rule.name} on ${server.serverCode}`;

const buildDescription = ({
  rule,
  evaluation,
}) =>
  [
    "Automatic incident created from a threshold alert.",
    `Rule: ${rule.ruleCode}.`,
    `Metric: ${rule.metricType}.`,
    `Observed value: ${evaluation.metricValue}.`,
    `Threshold: ${rule.thresholdValue}.`,
    `Recovery value: ${rule.recoveryValue}.`,
  ].join(" ");

const recordThresholdIncident = async (
  connection,
  {
    server,
    healthCheck,
    rule,
    evaluation,
  }
) => {
  const eventKey =
    buildBreachEventKey({
      ruleId: rule.id,
      healthCheckId:
        healthCheck.id,
    });

  const existingEvent =
    await findIncidentEventByKey(
      connection,
      eventKey
    );

  if (existingEvent) {
    const incident =
      await loadIncidentOrFail(
        connection,
        existingEvent.incidentId
      );

    return {
      action:
        "ALREADY_PROCESSED",
      incident,
    };
  }

  const activeDedupKey =
    buildActiveDedupKey({
      ruleId: rule.id,
      serverId: server.id,
    });

  let incident =
    await findActiveAutomaticIncidentForUpdate(
      connection,
      activeDedupKey
    );

  let incidentCreated = false;

  if (!incident) {
    try {
      const incidentId =
        await insertAutomaticThresholdIncident(
          connection,
          {
            incidentNumber:
              buildIncidentNumber(
                healthCheck.id
              ),

            serverId:
              server.id,

            incidentType:
              getIncidentType(
                rule.metricType
              ),

            sourceCheckType:
              healthCheck.checkType,

            healthCheckId:
              healthCheck.id,

            activeDedupKey,

            title:
              buildTitle({
                server,
                rule,
              }),

            description:
              buildDescription({
                rule,
                evaluation,
              }),

            severity:
              getIncidentSeverity(
                rule.severity
              ),

            openedAt:
              healthCheck.reportedAt,
          }
        );

      incident =
        await loadIncidentOrFail(
          connection,
          incidentId
        );

      incidentCreated = true;
    } catch (error) {
      /*
       * The unique active_dedup_key is the
       * final concurrency guard.
       */
      if (
        !isDuplicateKeyError(
          error
        )
      ) {
        throw error;
      }

      incident =
        await findActiveAutomaticIncidentForUpdate(
          connection,
          activeDedupKey
        );

      if (!incident) {
        throw error;
      }
    }
  }

  const metadata =
    buildMetadata({
      server,
      healthCheck,
      rule,
      evaluation,
    });

  if (incidentCreated) {
    await insertIncidentEvent(
      connection,
      {
        incidentId:
          incident.id,

        eventKey,

        eventType:
          "CREATED",

        fromStatus:
          null,

        toStatus:
          "OPEN",

        sourceHealthCheckId:
          healthCheck.id,

        actorUserId:
          null,

        message:
          "Automatic threshold incident created.",

        metadata,
      }
    );

    return {
      action:
        "CREATED",
      incident,
    };
  }

  const affectedRows =
    await recordAutomaticIncidentOccurrence(
      connection,
      {
        incidentId:
          incident.id,

        activeDedupKey,

        healthCheckId:
          healthCheck.id,

        occurredAt:
          healthCheck.reportedAt,
      }
    );

  if (affectedRows !== 1) {
    throw new AppError(
      409,
      "The threshold incident changed while recording the occurrence."
    );
  }

  await insertIncidentEvent(
    connection,
    {
      incidentId:
        incident.id,

      eventKey,

      eventType:
        "OCCURRENCE_RECORDED",

      fromStatus:
        incident.status,

      toStatus:
        incident.status,

      sourceHealthCheckId:
        healthCheck.id,

      actorUserId:
        null,

      message:
        "Another threshold breach was recorded.",

      metadata,
    }
  );

  incident =
    await loadIncidentOrFail(
      connection,
      incident.id
    );

  return {
    action:
      "OCCURRENCE_RECORDED",
    incident,
  };
};

const resolveThresholdIncident = async (
  connection,
  {
    server,
    healthCheck,
    rule,
    evaluation,
  }
) => {
  const eventKey =
    buildRecoveryEventKey({
      ruleId: rule.id,
      healthCheckId:
        healthCheck.id,
    });

  const existingEvent =
    await findIncidentEventByKey(
      connection,
      eventKey
    );

  if (existingEvent) {
    const incident =
      await loadIncidentOrFail(
        connection,
        existingEvent.incidentId
      );

    return {
      action:
        "ALREADY_PROCESSED",
      incident,
    };
  }

  const activeDedupKey =
    buildActiveDedupKey({
      ruleId: rule.id,
      serverId: server.id,
    });

  let incident =
    await findActiveAutomaticIncidentForUpdate(
      connection,
      activeDedupKey
    );

  if (!incident) {
    return {
      action:
        "NO_ACTIVE_INCIDENT",
      incident:
        null,
    };
  }

  const previousStatus =
    incident.status;

  const affectedRows =
    await resolveAutomaticIncident(
      connection,
      {
        incidentId:
          incident.id,

        activeDedupKey,

        healthCheckId:
          healthCheck.id,

        resolvedAt:
          healthCheck.reportedAt,

        resolutionNotes:
          `Automatically resolved after rule ${rule.ruleCode} met its recovery condition.`,
      }
    );

  if (affectedRows !== 1) {
    throw new AppError(
      409,
      "The threshold incident changed while resolving it."
    );
  }

  await insertIncidentEvent(
    connection,
    {
      incidentId:
        incident.id,

      eventKey,

      eventType:
        "RESOLVED",

      fromStatus:
        previousStatus,

      toStatus:
        "RESOLVED",

      sourceHealthCheckId:
        healthCheck.id,

      actorUserId:
        null,

      message:
        "Threshold incident automatically resolved after metric recovery.",

      metadata:
        buildMetadata({
          server,
          healthCheck,
          rule,
          evaluation,
        }),
    }
  );

  incident =
    await loadIncidentOrFail(
      connection,
      incident.id
    );

  return {
    action:
      "RESOLVED",
    incident,
  };
};

export const processThresholdAlertIncident =
  async (
    connection,
    {
      server,
      healthCheck,
      rule,
      evaluation,
    }
  ) => {
    if (
      !connection ||
      !server ||
      !healthCheck ||
      !rule ||
      !evaluation
    ) {
      throw new AppError(
        500,
        "Threshold incident processing data is incomplete."
      );
    }

    /*
     * Threshold incidents are intended for
     * live metric checks, not OFFLINE or
     * UNKNOWN heartbeat states.
     */
    if (
      ![
        "ONLINE",
        "DEGRADED",
      ].includes(
        healthCheck.status
      )
    ) {
      return {
        action:
          "SKIPPED_HEALTH_STATUS",
        incident:
          null,
      };
    }

    if (
      evaluation.action ===
      "ALERT_RESOLVED"
    ) {
      return resolveThresholdIncident(
        connection,
        {
          server,
          healthCheck,
          rule,
          evaluation,
        }
      );
    }

    const breachShouldCreateOrRecord =
      evaluation.action ===
        "ALERT_OPENED" ||
      (
        [
          "ALERT_STILL_ACTIVE",
          "RECOVERY_INTERRUPTED",
        ].includes(
          evaluation.action
        ) &&
        evaluation.evaluationResult ===
          "BREACH"
      );

    if (
      breachShouldCreateOrRecord
    ) {
      return recordThresholdIncident(
        connection,
        {
          server,
          healthCheck,
          rule,
          evaluation,
        }
      );
    }

    return {
      action:
        "NO_CHANGE",
      incident:
        null,
    };
  };
