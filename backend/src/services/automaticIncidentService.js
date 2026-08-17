import AppError from "../utils/AppError.js";

import {
  findActiveAutomaticIncidentForUpdate,
  findIncidentById,
  findIncidentEventByKey,
  insertAutomaticOfflineIncident,
  insertIncidentEvent,
  recordAutomaticIncidentOccurrence,
  resolveAutomaticIncident,
} from "../repositories/incidentRepository.js";
import {
  notifyIncidentCreated,
  notifyIncidentResolved,
} from "./notificationEventService.js";

const isDuplicateKeyError = (error) =>
  error?.errno === 1062 ||
  error?.code === "ER_DUP_ENTRY";

const buildActiveDedupKey = (
  serverId
) => `AUTO:${serverId}`;

const buildIncidentNumber = (
  serverId,
  healthCheckId
) =>
  `INC-AUTO-${serverId}-${healthCheckId}`;

const buildOfflineEventKey = (
  healthCheckId
) =>
  `AUTO:OFFLINE:${healthCheckId}`;

const buildOnlineEventKey = (
  healthCheckId
) =>
  `AUTO:ONLINE:${healthCheckId}`;

const loadIncidentOrFail = async (
  connection,
  incidentId
) => {
  const incident = await findIncidentById(
    connection,
    incidentId
  );

  if (!incident) {
    throw new AppError(
      500,
      "Automatic incident could not be loaded."
    );
  }

  return incident;
};

const buildMetadata = (
  server,
  healthCheck
) => ({
  serverCode: server.serverCode,
  checkKey: healthCheck.checkKey,
  checkType: healthCheck.checkType,
  observedStatus: healthCheck.status,
  responseTimeMs:
    healthCheck.responseTimeMs,
  errorCode: healthCheck.errorCode,
});

const recordOfflineIncident = async (
  connection,
  server,
  healthCheck
) => {
  const eventKey =
    buildOfflineEventKey(
      healthCheck.id
    );

  /*
   * Protect against accidentally processing the
   * same health check more than once.
   */
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
      action: "ALREADY_PROCESSED",
      incident,
    };
  }

  const activeDedupKey =
    buildActiveDedupKey(server.id);

  let incident =
    await findActiveAutomaticIncidentForUpdate(
      connection,
      activeDedupKey
    );

  let incidentCreated = false;

  if (!incident) {
    try {
      const incidentId =
        await insertAutomaticOfflineIncident(
          connection,
          {
            incidentNumber:
              buildIncidentNumber(
                server.id,
                healthCheck.id
              ),

            serverId: server.id,

            sourceCheckType:
              healthCheck.checkType,

            healthCheckId:
              healthCheck.id,

            activeDedupKey,

            title:
              `Server ${server.serverCode} is offline`,

            description:
              healthCheck.message
                ? `Automatic incident created from an OFFLINE health check. ${healthCheck.message}`
                : "Automatic incident created from an OFFLINE health check.",

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
       * The unique active_dedup_key is the final
       * concurrency guard. If another transaction
       * created the incident, lock and reuse it.
       */
      if (!isDuplicateKeyError(error)) {
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

  if (incidentCreated) {
    await insertIncidentEvent(
      connection,
      {
        incidentId: incident.id,
        eventKey,
        eventType: "CREATED",
        fromStatus: null,
        toStatus: "OPEN",
        sourceHealthCheckId:
          healthCheck.id,
        actorUserId: null,
        message:
          "Automatic offline incident created.",
        metadata: buildMetadata(
          server,
          healthCheck
        ),
      }
    );

    const notification =
      await notifyIncidentCreated(
        connection,
        {
          incident,
          server,
        }
      );

    return {
      action: "CREATED",
      incident,
      notification,
    };
  }

  const affectedRows =
    await recordAutomaticIncidentOccurrence(
      connection,
      {
        incidentId: incident.id,
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
      "The automatic incident changed while recording the occurrence."
    );
  }

  await insertIncidentEvent(
    connection,
    {
      incidentId: incident.id,
      eventKey,
      eventType:
        "OCCURRENCE_RECORDED",
      fromStatus: incident.status,
      toStatus: incident.status,
      sourceHealthCheckId:
        healthCheck.id,
      actorUserId: null,
      message:
        "Another OFFLINE health check was recorded.",
      metadata: buildMetadata(
        server,
        healthCheck
      ),
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

const resolveOfflineIncident = async (
  connection,
  server,
  healthCheck
) => {
  const eventKey =
    buildOnlineEventKey(
      healthCheck.id
    );

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
      action: "ALREADY_PROCESSED",
      incident,
    };
  }

  const activeDedupKey =
    buildActiveDedupKey(server.id);

  let incident =
    await findActiveAutomaticIncidentForUpdate(
      connection,
      activeDedupKey
    );

  if (!incident) {
    return {
      action:
        "NO_ACTIVE_INCIDENT",
      incident: null,
    };
  }

  const previousStatus =
    incident.status;

  const affectedRows =
    await resolveAutomaticIncident(
      connection,
      {
        incidentId: incident.id,
        activeDedupKey,
        healthCheckId:
          healthCheck.id,
        resolvedAt:
          healthCheck.reportedAt,
        resolutionNotes:
          "Automatically resolved after an ONLINE health check.",
      }
    );

  if (affectedRows !== 1) {
    throw new AppError(
      409,
      "The automatic incident changed while resolving it."
    );
  }

  await insertIncidentEvent(
    connection,
    {
      incidentId: incident.id,
      eventKey,
      eventType: "RESOLVED",
      fromStatus: previousStatus,
      toStatus: "RESOLVED",
      sourceHealthCheckId:
        healthCheck.id,
      actorUserId: null,
      message:
        "Incident automatically resolved after server recovery.",
      metadata: buildMetadata(
        server,
        healthCheck
      ),
    }
  );

  incident =
    await loadIncidentOrFail(
      connection,
      incident.id
    );

  const notification =
    await notifyIncidentResolved(
      connection,
      {
        incident,
        server,
      }
    );

  return {
    action: "RESOLVED",
    incident,
    notification,
  };
};

export const processAutomaticIncident =
  async (
    connection,
    {
      server,
      healthCheck,
    }
  ) => {
    if (
      !connection ||
      !server ||
      !healthCheck
    ) {
      throw new AppError(
        500,
        "Automatic incident processing data is incomplete."
      );
    }

    if (
      healthCheck.status ===
      "OFFLINE"
    ) {
      return recordOfflineIncident(
        connection,
        server,
        healthCheck
      );
    }

    if (
      healthCheck.status ===
      "ONLINE"
    ) {
      return resolveOfflineIncident(
        connection,
        server,
        healthCheck
      );
    }

    /*
     * DEGRADED and UNKNOWN do not create or
     * resolve SERVER_OFFLINE incidents.
     */
    return {
      action: "NO_CHANGE",
      incident: null,
    };
  };