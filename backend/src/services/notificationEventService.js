import AppError from "../utils/AppError.js";

import {
  createAdminNotifications,
} from "./notificationService.js";

const INCIDENT_SEVERITY_MAP = {
  LOW: "INFO",
  MEDIUM: "WARNING",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
};

const normalizeId = (
  value,
  fieldName
) => {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    throw new AppError(
      500,
      `${fieldName} is invalid for notification creation.`
    );
  }

  return parsed;
};

const normalizeIncidentSeverity = (
  severity
) =>
  INCIDENT_SEVERITY_MAP[
    String(
      severity || "LOW"
    ).toUpperCase()
  ] || "INFO";

const getServerCode = (
  server,
  incident
) =>
  server?.serverCode ||
  incident?.serverCode ||
  `SERVER-${incident?.serverId}`;

/*
 * =========================================================
 * INCIDENT CREATED
 * =========================================================
 */
export const notifyIncidentCreated =
  async (
    connection,
    {
      incident,
      server = null,
    }
  ) => {
    if (
      !connection ||
      !incident
    ) {
      throw new AppError(
        500,
        "Incident notification data is incomplete."
      );
    }

    const incidentId =
      normalizeId(
        incident.id,
        "Incident ID"
      );

    const serverId =
      normalizeId(
        incident.serverId ||
          server?.id,
        "Server ID"
      );

    const serverCode =
      getServerCode(
        server,
        incident
      );

    return createAdminNotifications(
      connection,
      {
        dedupKey:
          `INCIDENT:CREATED:${incidentId}`,

        notificationType:
          incident.incidentType ===
          "SERVER_OFFLINE"
            ? "SERVER_OFFLINE"
            : "INCIDENT_CREATED",

        sourceType:
          "INCIDENT",

        sourceId:
          incidentId,

        serverId,

        incidentId,

        severity:
          normalizeIncidentSeverity(
            incident.severity
          ),

        title:
          incident.title ||
          `New incident on ${serverCode}`,

        message:
          incident.description ||
          `Incident ${
            incident.incidentNumber ||
            incidentId
          } was created for ${serverCode}.`,

        metadata: {
          incidentNumber:
            incident.incidentNumber ||
            null,

          incidentType:
            incident.incidentType ||
            null,

          incidentStatus:
            incident.status ||
            "OPEN",

          serverCode,

          occurrenceCount:
            Number(
              incident.occurrenceCount ||
              1
            ),
        },
      }
    );
  };

/*
 * =========================================================
 * INCIDENT RESOLVED
 * =========================================================
 */
export const notifyIncidentResolved =
  async (
    connection,
    {
      incident,
      server = null,
    }
  ) => {
    if (
      !connection ||
      !incident
    ) {
      throw new AppError(
        500,
        "Resolved incident notification data is incomplete."
      );
    }

    const incidentId =
      normalizeId(
        incident.id,
        "Incident ID"
      );

    const serverId =
      normalizeId(
        incident.serverId ||
          server?.id,
        "Server ID"
      );

    const serverCode =
      getServerCode(
        server,
        incident
      );

    return createAdminNotifications(
      connection,
      {
        dedupKey:
          `INCIDENT:RESOLVED:${incidentId}`,

        notificationType:
          incident.incidentType ===
          "SERVER_OFFLINE"
            ? "SERVER_RECOVERED"
            : "INCIDENT_RESOLVED",

        sourceType:
          "INCIDENT",

        sourceId:
          incidentId,

        serverId,

        incidentId,

        severity:
          "INFO",

        title:
          incident.incidentType ===
          "SERVER_OFFLINE"
            ? `Server ${serverCode} recovered`
            : `Incident ${
                incident.incidentNumber ||
                incidentId
              } resolved`,

        message:
          incident.resolutionNotes ||
          `Incident ${
            incident.incidentNumber ||
            incidentId
          } has been resolved.`,

        metadata: {
          incidentNumber:
            incident.incidentNumber ||
            null,

          incidentType:
            incident.incidentType ||
            null,

          incidentStatus:
            incident.status ||
            "RESOLVED",

          serverCode,

          resolvedAt:
            incident.resolvedAt ||
            null,
        },
      }
    );
  };

/*
 * =========================================================
 * ALERT OPENED
 * =========================================================
 */
export const notifyAlertOpened =
  async (
    connection,
    {
      server,
      alertResult,
      incident = null,
    }
  ) => {
    if (
      !connection ||
      !server ||
      !alertResult
    ) {
      throw new AppError(
        500,
        "Alert-opened notification data is incomplete."
      );
    }

    const ruleId =
      normalizeId(
        alertResult.ruleId,
        "Alert rule ID"
      );

    const serverId =
      normalizeId(
        server.id,
        "Server ID"
      );

    const evaluationId =
      normalizeId(
        alertResult.evaluationId,
        "Alert evaluation ID"
      );

    const incidentId =
      incident?.id
        ? normalizeId(
            incident.id,
            "Incident ID"
          )
        : null;

    const serverCode =
      server.serverCode ||
      `SERVER-${serverId}`;

    const ruleName =
      alertResult.ruleName ||
      alertResult.ruleCode ||
      `Rule ${ruleId}`;

    return createAdminNotifications(
      connection,
      {
        /*
         * evaluationId makes each alert cycle
         * unique while remaining idempotent.
         */
        dedupKey:
          `ALERT:OPENED:EVALUATION:${evaluationId}`,

        notificationType:
          "ALERT_OPENED",

        sourceType:
          "ALERT_RULE",

        sourceId:
          ruleId,

        serverId,

        incidentId,

        alertRuleId:
          ruleId,

        severity:
          normalizeIncidentSeverity(
            alertResult.severity
          ),

        title:
          `${ruleName} alert on ${serverCode}`,

        message:
          `${alertResult.metricType} crossed the configured threshold on ${serverCode}. Current value: ${alertResult.metricValue}.`,

        metadata: {
          evaluationId,

          ruleCode:
            alertResult.ruleCode ||
            null,

          ruleName:
            alertResult.ruleName ||
            null,

          metricType:
            alertResult.metricType ||
            null,

          metricValue:
            alertResult.metricValue ??
            null,

          thresholdValue:
            alertResult.thresholdValue ??
            null,

          recoveryValue:
            alertResult.recoveryValue ??
            null,

          stateBefore:
            alertResult.stateBefore ||
            null,

          stateAfter:
            alertResult.stateAfter ||
            null,

          activeAlertKey:
            alertResult.activeAlertKey ||
            null,

          serverCode,

          incidentId,
        },
      }
    );
  };

/*
 * =========================================================
 * ALERT RESOLVED
 * =========================================================
 */
export const notifyAlertResolved =
  async (
    connection,
    {
      server,
      alertResult,
      incident = null,
    }
  ) => {
    if (
      !connection ||
      !server ||
      !alertResult
    ) {
      throw new AppError(
        500,
        "Alert-resolved notification data is incomplete."
      );
    }

    const ruleId =
      normalizeId(
        alertResult.ruleId,
        "Alert rule ID"
      );

    const serverId =
      normalizeId(
        server.id,
        "Server ID"
      );

    const evaluationId =
      normalizeId(
        alertResult.evaluationId,
        "Alert evaluation ID"
      );

    const incidentId =
      incident?.id
        ? normalizeId(
            incident.id,
            "Incident ID"
          )
        : null;

    const serverCode =
      server.serverCode ||
      `SERVER-${serverId}`;

    const ruleName =
      alertResult.ruleName ||
      alertResult.ruleCode ||
      `Rule ${ruleId}`;

    return createAdminNotifications(
      connection,
      {
        dedupKey:
          `ALERT:RESOLVED:EVALUATION:${evaluationId}`,

        notificationType:
          "ALERT_RESOLVED",

        sourceType:
          "ALERT_RULE",

        sourceId:
          ruleId,

        serverId,

        incidentId,

        alertRuleId:
          ruleId,

        severity:
          "INFO",

        title:
          `${ruleName} recovered on ${serverCode}`,

        message:
          `${alertResult.metricType} returned to the configured recovery range on ${serverCode}. Current value: ${alertResult.metricValue}.`,

        metadata: {
          evaluationId,

          ruleCode:
            alertResult.ruleCode ||
            null,

          ruleName:
            alertResult.ruleName ||
            null,

          metricType:
            alertResult.metricType ||
            null,

          metricValue:
            alertResult.metricValue ??
            null,

          thresholdValue:
            alertResult.thresholdValue ??
            null,

          recoveryValue:
            alertResult.recoveryValue ??
            null,

          stateBefore:
            alertResult.stateBefore ||
            null,

          stateAfter:
            alertResult.stateAfter ||
            null,

          serverCode,

          incidentId,
        },
      }
    );
  };