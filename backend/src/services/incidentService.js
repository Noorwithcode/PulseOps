import { createHash, randomUUID } from "node:crypto";

import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

import {
  findIncidents,
  countIncidents,
  findIncidentDetailsById,
  findIncidentForUpdate,
  findIncidentTimeline,
  findActiveUserById,
  findServerForIncidentById,
  insertManualIncident,

  acknowledgeIncident,
  assignIncident,
  unassignIncident,
  updateIncidentSeverity,
  resolveIncident,
  closeIncident,
  reopenIncident,
  touchIncidentVersion,
} from "../repositories/incidentManagementRepository.js";

import {
  insertIncidentEvent,
  findActiveAutomaticIncidentForUpdate,
} from "../repositories/incidentRepository.js";

import {
  insertIncidentCreateIdempotency,
  findIncidentCreateIdempotencyForUpdate,
  attachIncidentToCreateIdempotency,
} from "../repositories/incidentIdempotencyRepository.js";

import {
  notifyIncidentCreated,
  notifyIncidentResolved,
} from "./notificationEventService.js";

/*
 * =========================================================
 * CONSTANTS
 * =========================================================
 */

const INCIDENT_STATUSES =
  new Set([
    "OPEN",
    "ACKNOWLEDGED",
    "RESOLVED",
    "CLOSED",
  ]);

const INCIDENT_SEVERITIES =
  new Set([
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ]);

const INCIDENT_SOURCES =
  new Set([
    "AUTOMATIC",
    "MANUAL",
  ]);

const INCIDENT_TYPES =
  new Set([
    "SERVER_OFFLINE",
    "SERVER_DEGRADED",
    "HIGH_CPU",
    "HIGH_MEMORY",
    "HIGH_DISK",
    "HIGH_RESPONSE_TIME",
    "MANUAL",
  ]);

const ACTIVE_STATUSES =
  new Set([
    "OPEN",
    "ACKNOWLEDGED",
  ]);

/*
 * =========================================================
 * VALIDATION HELPERS
 * =========================================================
 */

const requirePositiveInteger = (
  value,
  fieldName
) => {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    throw new AppError(
      400,
      `${fieldName} must be a positive integer.`
    );
  }

  return parsed;
};

const requireVersion = (
  value
) =>
  requirePositiveInteger(
    value,
    "Version"
  );

const normalizePage = (
  value
) => {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return 1;
  }

  return parsed;
};

const normalizeLimit = (
  value
) => {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return 20;
  }

  return Math.min(
    parsed,
    100
  );
};

const normalizeBoolean = (
  value
) => {
  return (
    value === true ||
    value === "true" ||
    value === "1" ||
    value === 1
  );
};

const normalizeEnum = (
  value,
  allowedValues,
  fieldName
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const normalized =
    String(value)
      .trim()
      .toUpperCase();

  if (
    !allowedValues.has(
      normalized
    )
  ) {
    throw new AppError(
      400,
      `${fieldName} is invalid.`
    );
  }

  return normalized;
};

const normalizeSearch = (
  value
) => {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized =
    String(value)
      .trim();

  if (!normalized) {
    return null;
  }

  if (
    normalized.length > 100
  ) {
    throw new AppError(
      400,
      "Search text cannot exceed 100 characters."
    );
  }

  return normalized;
};

const normalizeMessage = (
  value,
  {
    fieldName = "Message",
    required = false,
    minLength = 1,
    maxLength = 1000,
  } = {}
) => {
  if (
    value === undefined ||
    value === null
  ) {
    if (required) {
      throw new AppError(
        400,
        `${fieldName} is required.`
      );
    }

    return null;
  }

  const normalized =
    String(value)
      .trim();

  if (!normalized) {
    if (required) {
      throw new AppError(
        400,
        `${fieldName} is required.`
      );
    }

    return null;
  }

  if (
    normalized.length <
    minLength
  ) {
    throw new AppError(
      400,
      `${fieldName} must contain at least ${minLength} characters.`
    );
  }

  if (
    normalized.length >
    maxLength
  ) {
    throw new AppError(
      400,
      `${fieldName} cannot exceed ${maxLength} characters.`
    );
  }

  return normalized;
};


const isDuplicateKeyError = (
  error
) =>
  error?.errno === 1062 ||
  error?.code ===
    "ER_DUP_ENTRY";

const normalizeIdempotencyKey = (
  value
) => {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    throw new AppError(
      400,
      "Idempotency-Key header is required."
    );
  }

  const normalized =
    String(value).trim();

  if (
    normalized.length < 8 ||
    normalized.length > 191
  ) {
    throw new AppError(
      400,
      "Idempotency-Key must contain between 8 and 191 characters."
    );
  }

  if (
    !/^[A-Za-z0-9._:-]+$/.test(
      normalized
    )
  ) {
    throw new AppError(
      400,
      "Idempotency-Key may contain only letters, numbers, dot, underscore, colon, and hyphen."
    );
  }

  return normalized;
};

const buildManualIncidentRequestHash = ({
  serverId,
  incidentType,
  title,
  description,
  severity,
  assignedTo,
}) => {
  const canonicalPayload =
    JSON.stringify({
      serverId,
      incidentType,
      title,
      description,
      severity,
      assignedTo,
    });

  return createHash("sha256")
    .update(
      canonicalPayload,
      "utf8"
    )
    .digest("hex");
};

/*
 * =========================================================
 * EVENT HELPERS
 * =========================================================
 */

const buildEventKey = (
  incidentId,
  eventType
) =>
  [
    "MANUAL",
    "INCIDENT",
    incidentId,
    eventType,
    randomUUID(),
  ].join(":");

const buildManualIncidentNumber =
  () => {
    const timestamp =
      Date.now();

    const randomPart =
      randomUUID()
        .replaceAll("-", "")
        .slice(0, 8)
        .toUpperCase();

    return `INC-MAN-${timestamp}-${randomPart}`;
  };

/*
 * =========================================================
 * REOPEN DEDUP KEY
 * =========================================================
 */

const buildReopenActiveDedupKey = (
  incident
) => {
  /*
   * Manual incidents do not participate
   * in automatic deduplication.
   */
  if (
    incident.source ===
    "MANUAL"
  ) {
    return null;
  }

  /*
   * Automatic SERVER_OFFLINE incidents
   * use AUTO:<serverId>.
   */
  if (
    incident.source ===
    "AUTOMATIC" &&
    incident.incidentType ===
    "SERVER_OFFLINE"
  ) {
    return `AUTO:${incident.serverId}`;
  }

  /*
   * Threshold incidents are controlled
   * by the alert-rule state machine.
   */
  if (
    incident.source ===
    "AUTOMATIC"
  ) {
    throw new AppError(
      409,
      "Automatic threshold incidents cannot be manually reopened. A new alert cycle must control their lifecycle."
    );
  }

  return null;
};

/*
 * =========================================================
 * VERSION HELPERS
 * =========================================================
 */

const assertVersionMatches = (
  incident,
  expectedVersion
) => {
  const currentVersion =
    Number(
      incident.version
    );

  if (
    currentVersion !==
    expectedVersion
  ) {
    throw new AppError(
      409,
      `Incident was modified by another request. Current version is ${currentVersion}.`
    );
  }
};

const assertActiveIncident = (
  incident,
  actionName
) => {
  if (
    !ACTIVE_STATUSES.has(
      incident.status
    )
  ) {
    throw new AppError(
      409,
      `Incident cannot be ${actionName} while status is ${incident.status}.`
    );
  }
};

/*
 * =========================================================
 * LOAD HELPERS
 * =========================================================
 */

const loadIncidentDetailsOrFail =
  async (
    connection,
    incidentId
  ) => {
    const incident =
      await findIncidentDetailsById(
        connection,
        incidentId
      );

    if (!incident) {
      throw new AppError(
        404,
        "Incident not found."
      );
    }

    return incident;
  };

const lockIncidentOrFail =
  async (
    connection,
    incidentId
  ) => {
    const incident =
      await findIncidentForUpdate(
        connection,
        incidentId
      );

    if (!incident) {
      throw new AppError(
        404,
        "Incident not found."
      );
    }

    return incident;
  };

const loadActiveUserOrFail =
  async (
    connection,
    userId
  ) => {
    const user =
      await findActiveUserById(
        connection,
        userId
      );

    if (!user) {
      throw new AppError(
        404,
        "Active user not found."
      );
    }

    return user;
  };

/*
 * =========================================================
 * CREATE MANUAL INCIDENT
 * =========================================================
 */

export const createManualIncident =
  async ({
    serverId,
    incidentType = "MANUAL",
    title,
    description = null,
    severity = "MEDIUM",
    assignedTo = null,
    actorUserId,
    idempotencyKey,
  }) => {
    const safeServerId =
      requirePositiveInteger(
        serverId,
        "Server ID"
      );

    const safeActorUserId =
      requirePositiveInteger(
        actorUserId,
        "Actor user ID"
      );

    const safeIdempotencyKey =
      normalizeIdempotencyKey(
        idempotencyKey
      );

    const normalizedIncidentType =
      normalizeEnum(
        incidentType,
        INCIDENT_TYPES,
        "Incident type"
      ) || "MANUAL";

    if (
      normalizedIncidentType !==
      "MANUAL"
    ) {
      throw new AppError(
        400,
        "Manual incident creation only supports incidentType MANUAL."
      );
    }

    const normalizedSeverity =
      normalizeEnum(
        severity,
        INCIDENT_SEVERITIES,
        "Severity"
      ) || "MEDIUM";

    const safeTitle =
      normalizeMessage(
        title,
        {
          fieldName:
            "Title",

          required: true,

          minLength: 3,

          maxLength: 180,
        }
      );

    const safeDescription =
      normalizeMessage(
        description,
        {
          fieldName:
            "Description",

          required: false,

          maxLength: 1000,
        }
      );

    const safeAssignedTo =
      assignedTo === undefined ||
        assignedTo === null ||
        assignedTo === ""
        ? null
        : requirePositiveInteger(
          assignedTo,
          "Assigned user ID"
        );

    const requestHash =
      buildManualIncidentRequestHash({
        serverId:
          safeServerId,

        incidentType:
          normalizedIncidentType,

        title:
          safeTitle,

        description:
          safeDescription,

        severity:
          normalizedSeverity,

        assignedTo:
          safeAssignedTo,
      });

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      /*
       * Validate server.
       */
      const server =
        await findServerForIncidentById(
          connection,
          safeServerId
        );

      if (!server) {
        throw new AppError(
          404,
          "Server not found."
        );
      }

      /*
       * Validate actor.
       */
      const actor =
        await loadActiveUserOrFail(
          connection,
          safeActorUserId
        );

      /*
       * Validate optional assignee.
       */
      let assignee =
        null;

      if (safeAssignedTo) {
        assignee =
          await loadActiveUserOrFail(
            connection,
            safeAssignedTo
          );
      }

      /*
       * Reserve the actor-scoped idempotency key.
       *
       * The UNIQUE(actor_user_id, idempotency_key)
       * constraint is the final concurrency guard.
       * A concurrent request using the same key waits
       * for the winning transaction and then receives
       * a duplicate-key result.
       */
      let idempotencyReservationId;

      try {
        idempotencyReservationId =
          await insertIncidentCreateIdempotency(
            connection,
            {
              actorUserId:
                safeActorUserId,

              idempotencyKey:
                safeIdempotencyKey,

              requestHash,
            }
          );
      } catch (error) {
        if (
          !isDuplicateKeyError(
            error
          )
        ) {
          throw error;
        }

        const existingIdempotency =
          await findIncidentCreateIdempotencyForUpdate(
            connection,
            {
              actorUserId:
                safeActorUserId,

              idempotencyKey:
                safeIdempotencyKey,
            }
          );

        if (!existingIdempotency) {
          throw new AppError(
            409,
            "The idempotency key is already in use. Please retry the request."
          );
        }

        if (
          existingIdempotency.requestHash !==
          requestHash
        ) {
          throw new AppError(
            409,
            "This Idempotency-Key was already used with a different request payload."
          );
        }

        if (
          !existingIdempotency.incidentId
        ) {
          throw new AppError(
            409,
            "A request with this Idempotency-Key is still being processed."
          );
        }

        const existingIncident =
          await loadIncidentDetailsOrFail(
            connection,
            existingIdempotency.incidentId
          );

        await connection.commit();

        return {
          incident:
            existingIncident,

          replayed: true,

          idempotencyKey:
            safeIdempotencyKey,
        };
      }

      const incidentNumber =
        buildManualIncidentNumber();

      const openedAt =
        new Date();

      /*
       * Manual incidents:
       *
       * source = MANUAL
       * active_dedup_key = NULL
       * status = OPEN
       * version = 1
       */
      const incidentId =
        await insertManualIncident(
          connection,
          {
            incidentNumber,

            serverId:
              safeServerId,

            incidentType:
              normalizedIncidentType,

            title:
              safeTitle,

            description:
              safeDescription,

            severity:
              normalizedSeverity,

            assignedTo:
              safeAssignedTo,

            openedAt,
          }
        );

      if (!incidentId) {
        throw new AppError(
          500,
          "Manual incident could not be created."
        );
      }

      /*
       * Link the idempotency reservation to the
       * newly-created incident inside the SAME
       * transaction.
       */
      const idempotencyLinkedRows =
        await attachIncidentToCreateIdempotency(
          connection,
          {
            idempotencyId:
              idempotencyReservationId,

            incidentId,
          }
        );

      if (
        idempotencyLinkedRows !== 1
      ) {
        throw new AppError(
          500,
          "Manual incident idempotency state could not be finalized."
        );
      }

      /*
       * Immutable CREATED audit event.
       */
      await insertIncidentEvent(
        connection,
        {
          incidentId,

          eventKey:
            buildEventKey(
              incidentId,
              "CREATED"
            ),

          eventType:
            "CREATED",

          fromStatus:
            null,

          toStatus:
            "OPEN",

          sourceHealthCheckId:
            null,

          actorUserId:
            safeActorUserId,

          message:
            "Manual incident created.",

          metadata: {
            source:
              "MANUAL",

            serverId:
              safeServerId,

            serverCode:
              server.serverCode,

            incidentType:
              normalizedIncidentType,

            severity:
              normalizedSeverity,

            createdBy:
              safeActorUserId,

            createdByName:
              actor.fullName,

            assignedTo:
              safeAssignedTo,

            assignedToName:
              assignee
                ? assignee.fullName
                : null,

            idempotencyKey:
              safeIdempotencyKey,

            version: 1,
          },
        }
      );

      const incident =
        await loadIncidentDetailsOrFail(
          connection,
          incidentId
        );

      /*
       * Create the notification in the same
       * transaction as the incident, audit event,
       * and idempotency reservation.
       */
      await notifyIncidentCreated(
        connection,
        {
          incident,
          server,
        }
      );

      await connection.commit();

      return {
        incident,

        replayed: false,

        idempotencyKey:
          safeIdempotencyKey,
      };
    } catch (error) {
      await connection.rollback();

      /*
       * Any duplicate that reaches this outer catch
       * is not a handled idempotency replay.
       */
      if (
        isDuplicateKeyError(
          error
        )
      ) {
        throw new AppError(
          409,
          "A duplicate incident identifier was detected. Please retry the request."
        );
      }

      throw error;
    } finally {
      connection.release();
    }
  };


/*
 * =========================================================
 * LIST INCIDENTS
 * =========================================================
 */

export const getIncidents =
  async (
    query = {}
  ) => {
    const page =
      normalizePage(
        query.page
      );

    const limit =
      normalizeLimit(
        query.limit
      );

    const filters = {
      status:
        normalizeEnum(
          query.status,
          INCIDENT_STATUSES,
          "Status"
        ),

      severity:
        normalizeEnum(
          query.severity,
          INCIDENT_SEVERITIES,
          "Severity"
        ),

      source:
        normalizeEnum(
          query.source,
          INCIDENT_SOURCES,
          "Source"
        ),

      incidentType:
        normalizeEnum(
          query.incidentType,
          INCIDENT_TYPES,
          "Incident type"
        ),

      serverId:
        query.serverId
          ? requirePositiveInteger(
            query.serverId,
            "Server ID"
          )
          : null,

      assignedTo:
        query.assignedTo
          ? requirePositiveInteger(
            query.assignedTo,
            "Assigned user ID"
          )
          : null,

      activeOnly:
        normalizeBoolean(
          query.activeOnly
        ),

      unassignedOnly:
        normalizeBoolean(
          query.unassignedOnly
        ),

      search:
        normalizeSearch(
          query.search
        ),
    };

    if (
      filters.assignedTo &&
      filters.unassignedOnly
    ) {
      throw new AppError(
        400,
        "assignedTo and unassignedOnly cannot be used together."
      );
    }

    const [
      incidents,
      total,
    ] =
      await Promise.all([
        findIncidents(
          pool,
          {
            page,
            limit,
            filters,
          }
        ),

        countIncidents(
          pool,
          filters
        ),
      ]);

    return {
      incidents,

      pagination: {
        page,
        limit,
        total,

        totalPages:
          Math.ceil(
            total / limit
          ),
      },

      filters: {
        status:
          filters.status,

        severity:
          filters.severity,

        source:
          filters.source,

        incidentType:
          filters.incidentType,

        serverId:
          filters.serverId,

        assignedTo:
          filters.assignedTo,

        activeOnly:
          filters.activeOnly,

        unassignedOnly:
          filters.unassignedOnly,

        search:
          filters.search,
      },
    };
  };

/*
 * =========================================================
 * GET INCIDENT
 * =========================================================
 */

export const getIncidentById =
  async (
    incidentId
  ) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const incident =
      await findIncidentDetailsById(
        pool,
        safeIncidentId
      );

    if (!incident) {
      throw new AppError(
        404,
        "Incident not found."
      );
    }

    return incident;
  };

/*
 * =========================================================
 * GET TIMELINE
 * =========================================================
 */

export const getIncidentTimeline =
  async (
    incidentId
  ) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const incident =
      await findIncidentDetailsById(
        pool,
        safeIncidentId
      );

    if (!incident) {
      throw new AppError(
        404,
        "Incident not found."
      );
    }

    const timeline =
      await findIncidentTimeline(
        pool,
        safeIncidentId
      );

    return {
      incident: {
        id:
          incident.id,

        incidentNumber:
          incident.incidentNumber,

        title:
          incident.title,

        status:
          incident.status,

        version:
          incident.version,
      },

      timeline,
    };
  };

/*
 * =========================================================
 * ACKNOWLEDGE
 * =========================================================
 */

export const acknowledgeIncidentById =
  async ({
    incidentId,
    actorUserId,
    version,
  }) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const safeActorUserId =
      requirePositiveInteger(
        actorUserId,
        "Actor user ID"
      );

    const expectedVersion =
      requireVersion(
        version
      );

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const incident =
        await lockIncidentOrFail(
          connection,
          safeIncidentId
        );

      assertVersionMatches(
        incident,
        expectedVersion
      );

      if (
        incident.status !==
        "OPEN"
      ) {
        throw new AppError(
          409,
          `Only OPEN incidents can be acknowledged. Current status is ${incident.status}.`
        );
      }

      await loadActiveUserOrFail(
        connection,
        safeActorUserId
      );

      const affectedRows =
        await acknowledgeIncident(
          connection,
          {
            incidentId:
              safeIncidentId,

            userId:
              safeActorUserId,

            expectedVersion,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Incident changed while it was being acknowledged."
        );
      }

      await insertIncidentEvent(
        connection,
        {
          incidentId:
            safeIncidentId,

          eventKey:
            buildEventKey(
              safeIncidentId,
              "ACKNOWLEDGED"
            ),

          eventType:
            "ACKNOWLEDGED",

          fromStatus:
            incident.status,

          toStatus:
            "ACKNOWLEDGED",

          actorUserId:
            safeActorUserId,

          message:
            "Incident acknowledged.",

          metadata: {
            previousVersion:
              expectedVersion,

            newVersion:
              expectedVersion +
              1,
          },
        }
      );

      const updatedIncident =
        await loadIncidentDetailsOrFail(
          connection,
          safeIncidentId
        );

      await connection.commit();

      return updatedIncident;
    } catch (error) {
      await connection.rollback();

      throw error;
    } finally {
      connection.release();
    }
  };

/*
 * =========================================================
 * ASSIGN
 * =========================================================
 */

export const assignIncidentById =
  async ({
    incidentId,
    assignedTo,
    actorUserId,
    version,
  }) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const safeAssignedTo =
      requirePositiveInteger(
        assignedTo,
        "Assigned user ID"
      );

    const safeActorUserId =
      requirePositiveInteger(
        actorUserId,
        "Actor user ID"
      );

    const expectedVersion =
      requireVersion(
        version
      );

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const incident =
        await lockIncidentOrFail(
          connection,
          safeIncidentId
        );

      assertVersionMatches(
        incident,
        expectedVersion
      );

      assertActiveIncident(
        incident,
        "assigned"
      );

      const assignee =
        await loadActiveUserOrFail(
          connection,
          safeAssignedTo
        );

      await loadActiveUserOrFail(
        connection,
        safeActorUserId
      );

      const previousAssignedTo =
        incident.assignedTo
          ? Number(
            incident.assignedTo
          )
          : null;

      const affectedRows =
        await assignIncident(
          connection,
          {
            incidentId:
              safeIncidentId,

            assignedTo:
              safeAssignedTo,

            expectedVersion,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Incident changed while it was being assigned."
        );
      }

      await insertIncidentEvent(
        connection,
        {
          incidentId:
            safeIncidentId,

          eventKey:
            buildEventKey(
              safeIncidentId,
              "ASSIGNED"
            ),

          eventType:
            "ASSIGNED",

          fromStatus:
            incident.status,

          toStatus:
            incident.status,

          actorUserId:
            safeActorUserId,

          message:
            `Incident assigned to ${assignee.fullName}.`,

          metadata: {
            previousAssignedTo,

            assignedTo:
              safeAssignedTo,

            assignedToName:
              assignee.fullName,

            previousVersion:
              expectedVersion,

            newVersion:
              expectedVersion +
              1,
          },
        }
      );

      const updatedIncident =
        await loadIncidentDetailsOrFail(
          connection,
          safeIncidentId
        );

      await connection.commit();

      return updatedIncident;
    } catch (error) {
      await connection.rollback();

      throw error;
    } finally {
      connection.release();
    }
  };

/*
 * =========================================================
 * UNASSIGN
 * =========================================================
 */

export const unassignIncidentById =
  async ({
    incidentId,
    actorUserId,
    version,
  }) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const safeActorUserId =
      requirePositiveInteger(
        actorUserId,
        "Actor user ID"
      );

    const expectedVersion =
      requireVersion(
        version
      );

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const incident =
        await lockIncidentOrFail(
          connection,
          safeIncidentId
        );

      assertVersionMatches(
        incident,
        expectedVersion
      );

      assertActiveIncident(
        incident,
        "unassigned"
      );

      if (
        !incident.assignedTo
      ) {
        throw new AppError(
          409,
          "Incident is already unassigned."
        );
      }

      await loadActiveUserOrFail(
        connection,
        safeActorUserId
      );

      const previousAssignedTo =
        Number(
          incident.assignedTo
        );

      const affectedRows =
        await unassignIncident(
          connection,
          {
            incidentId:
              safeIncidentId,

            expectedVersion,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Incident changed while it was being unassigned."
        );
      }

      await insertIncidentEvent(
        connection,
        {
          incidentId:
            safeIncidentId,

          eventKey:
            buildEventKey(
              safeIncidentId,
              "UNASSIGNED"
            ),

          eventType:
            "UNASSIGNED",

          fromStatus:
            incident.status,

          toStatus:
            incident.status,

          actorUserId:
            safeActorUserId,

          message:
            "Incident assignment removed.",

          metadata: {
            previousAssignedTo,

            previousVersion:
              expectedVersion,

            newVersion:
              expectedVersion +
              1,
          },
        }
      );

      const updatedIncident =
        await loadIncidentDetailsOrFail(
          connection,
          safeIncidentId
        );

      await connection.commit();

      return updatedIncident;
    } catch (error) {
      await connection.rollback();

      throw error;
    } finally {
      connection.release();
    }
  };

/*
 * =========================================================
 * CHANGE SEVERITY
 * =========================================================
 */

export const changeIncidentSeverity =
  async ({
    incidentId,
    severity,
    actorUserId,
    version,
  }) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const safeActorUserId =
      requirePositiveInteger(
        actorUserId,
        "Actor user ID"
      );

    const expectedVersion =
      requireVersion(
        version
      );

    const normalizedSeverity =
      normalizeEnum(
        severity,
        INCIDENT_SEVERITIES,
        "Severity"
      );

    if (!normalizedSeverity) {
      throw new AppError(
        400,
        "Severity is required."
      );
    }

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const incident =
        await lockIncidentOrFail(
          connection,
          safeIncidentId
        );

      assertVersionMatches(
        incident,
        expectedVersion
      );

      assertActiveIncident(
        incident,
        "reprioritized"
      );

      if (
        incident.severity ===
        normalizedSeverity
      ) {
        throw new AppError(
          409,
          `Incident severity is already ${normalizedSeverity}.`
        );
      }

      await loadActiveUserOrFail(
        connection,
        safeActorUserId
      );

      const previousSeverity =
        incident.severity;

      const affectedRows =
        await updateIncidentSeverity(
          connection,
          {
            incidentId:
              safeIncidentId,

            severity:
              normalizedSeverity,

            expectedVersion,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Incident changed while severity was being updated."
        );
      }

      await insertIncidentEvent(
        connection,
        {
          incidentId:
            safeIncidentId,

          eventKey:
            buildEventKey(
              safeIncidentId,
              "SEVERITY_CHANGED"
            ),

          eventType:
            "STATUS_CHANGED",

          fromStatus:
            incident.status,

          toStatus:
            incident.status,

          actorUserId:
            safeActorUserId,

          message:
            `Incident severity changed from ${previousSeverity} to ${normalizedSeverity}.`,

          metadata: {
            changeType:
              "SEVERITY_CHANGED",

            previousSeverity,

            newSeverity:
              normalizedSeverity,

            previousVersion:
              expectedVersion,

            newVersion:
              expectedVersion +
              1,
          },
        }
      );

      const updatedIncident =
        await loadIncidentDetailsOrFail(
          connection,
          safeIncidentId
        );

      await connection.commit();

      return updatedIncident;
    } catch (error) {
      await connection.rollback();

      throw error;
    } finally {
      connection.release();
    }
  };

/*
 * =========================================================
 * RESOLVE
 * =========================================================
 */

export const resolveIncidentById =
  async ({
    incidentId,
    actorUserId,
    version,
    resolutionNotes,
  }) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const safeActorUserId =
      requirePositiveInteger(
        actorUserId,
        "Actor user ID"
      );

    const expectedVersion =
      requireVersion(
        version
      );

    const safeResolutionNotes =
      normalizeMessage(
        resolutionNotes,
        {
          fieldName:
            "Resolution notes",

          required: true,

          minLength: 3,

          maxLength: 1000,
        }
      );

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const incident =
        await lockIncidentOrFail(
          connection,
          safeIncidentId
        );

      assertVersionMatches(
        incident,
        expectedVersion
      );

      assertActiveIncident(
        incident,
        "resolved"
      );

      await loadActiveUserOrFail(
        connection,
        safeActorUserId
      );

      const affectedRows =
        await resolveIncident(
          connection,
          {
            incidentId:
              safeIncidentId,

            userId:
              safeActorUserId,

            resolutionNotes:
              safeResolutionNotes,

            expectedVersion,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Incident changed while it was being resolved."
        );
      }

      await insertIncidentEvent(
        connection,
        {
          incidentId:
            safeIncidentId,

          eventKey:
            buildEventKey(
              safeIncidentId,
              "RESOLVED"
            ),

          eventType:
            "RESOLVED",

          fromStatus:
            incident.status,

          toStatus:
            "RESOLVED",

          actorUserId:
            safeActorUserId,

          message:
            "Incident manually resolved.",

          metadata: {
            resolutionNotes:
              safeResolutionNotes,

            previousVersion:
              expectedVersion,

            newVersion:
              expectedVersion +
              1,
          },
        }
      );

      const updatedIncident =
        await loadIncidentDetailsOrFail(
          connection,
          safeIncidentId
        );

      /*
       * Manual incidents use the generic incident
       * resolved notification. Automatic incidents
       * remain controlled by their monitoring and
       * alert workflows so a manual action cannot be
       * incorrectly reported as server recovery.
       */
      if (
        updatedIncident.source ===
        "MANUAL"
      ) {
        await notifyIncidentResolved(
          connection,
          {
            incident:
              updatedIncident,
          }
        );
      }

      await connection.commit();

      return updatedIncident;
    } catch (error) {
      await connection.rollback();

      throw error;
    } finally {
      connection.release();
    }
  };

/*
 * =========================================================
 * CLOSE
 * =========================================================
 */

export const closeIncidentById =
  async ({
    incidentId,
    actorUserId,
    version,
  }) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const safeActorUserId =
      requirePositiveInteger(
        actorUserId,
        "Actor user ID"
      );

    const expectedVersion =
      requireVersion(
        version
      );

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const incident =
        await lockIncidentOrFail(
          connection,
          safeIncidentId
        );

      assertVersionMatches(
        incident,
        expectedVersion
      );

      if (
        incident.status !==
        "RESOLVED"
      ) {
        throw new AppError(
          409,
          `Only RESOLVED incidents can be closed. Current status is ${incident.status}.`
        );
      }

      await loadActiveUserOrFail(
        connection,
        safeActorUserId
      );

      const affectedRows =
        await closeIncident(
          connection,
          {
            incidentId:
              safeIncidentId,

            userId:
              safeActorUserId,

            expectedVersion,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Incident changed while it was being closed."
        );
      }

      await insertIncidentEvent(
        connection,
        {
          incidentId:
            safeIncidentId,

          eventKey:
            buildEventKey(
              safeIncidentId,
              "CLOSED"
            ),

          eventType:
            "CLOSED",

          fromStatus:
            incident.status,

          toStatus:
            "CLOSED",

          actorUserId:
            safeActorUserId,

          message:
            "Incident closed.",

          metadata: {
            previousVersion:
              expectedVersion,

            newVersion:
              expectedVersion +
              1,
          },
        }
      );

      const updatedIncident =
        await loadIncidentDetailsOrFail(
          connection,
          safeIncidentId
        );

      await connection.commit();

      return updatedIncident;
    } catch (error) {
      await connection.rollback();

      throw error;
    } finally {
      connection.release();
    }
  };

/*
 * =========================================================
 * REOPEN
 * =========================================================
 */

export const reopenIncidentById =
  async ({
    incidentId,
    actorUserId,
    version,
    reason,
  }) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const safeActorUserId =
      requirePositiveInteger(
        actorUserId,
        "Actor user ID"
      );

    const expectedVersion =
      requireVersion(
        version
      );

    const safeReason =
      normalizeMessage(
        reason,
        {
          fieldName:
            "Reopen reason",

          required: true,

          minLength: 3,

          maxLength: 1000,
        }
      );

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const incident =
        await lockIncidentOrFail(
          connection,
          safeIncidentId
        );

      assertVersionMatches(
        incident,
        expectedVersion
      );

      if (
        ![
          "RESOLVED",
          "CLOSED",
        ].includes(
          incident.status
        )
      ) {
        throw new AppError(
          409,
          `Only RESOLVED or CLOSED incidents can be reopened. Current status is ${incident.status}.`
        );
      }

      await loadActiveUserOrFail(
        connection,
        safeActorUserId
      );

      const previousStatus =
        incident.status;

      const activeDedupKey =
        buildReopenActiveDedupKey(
          incident
        );

      /*
       * Prevent two automatic SERVER_OFFLINE
       * incidents owning AUTO:<serverId>.
       */
      if (activeDedupKey) {
        const existingActiveIncident =
          await findActiveAutomaticIncidentForUpdate(
            connection,
            activeDedupKey
          );

        if (
          existingActiveIncident &&
          Number(
            existingActiveIncident.id
          ) !== safeIncidentId
        ) {
          throw new AppError(
            409,
            `Another active automatic incident already exists for this server: ${existingActiveIncident.incidentNumber}.`
          );
        }
      }

      let affectedRows;

      try {
        affectedRows =
          await reopenIncident(
            connection,
            {
              incidentId:
                safeIncidentId,

              expectedVersion,

              activeDedupKey,
            }
          );
      } catch (error) {
        if (
          error?.code ===
          "ER_DUP_ENTRY" ||
          error?.errno === 1062
        ) {
          throw new AppError(
            409,
            "Another active automatic incident already owns this server deduplication key."
          );
        }

        throw error;
      }

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Incident changed while it was being reopened."
        );
      }

      await insertIncidentEvent(
        connection,
        {
          incidentId:
            safeIncidentId,

          eventKey:
            buildEventKey(
              safeIncidentId,
              "REOPENED"
            ),

          eventType:
            "REOPENED",

          fromStatus:
            previousStatus,

          toStatus:
            "OPEN",

          actorUserId:
            safeActorUserId,

          message:
            safeReason,

          metadata: {
            reopenReason:
              safeReason,

            activeDedupKey,

            previousVersion:
              expectedVersion,

            newVersion:
              expectedVersion +
              1,
          },
        }
      );

      const updatedIncident =
        await loadIncidentDetailsOrFail(
          connection,
          safeIncidentId
        );

      await connection.commit();

      return updatedIncident;
    } catch (error) {
      await connection.rollback();

      throw error;
    } finally {
      connection.release();
    }
  };

/*
 * =========================================================
 * ADD COMMENT
 * =========================================================
 */

export const addIncidentComment =
  async ({
    incidentId,
    actorUserId,
    version,
    comment,
  }) => {
    const safeIncidentId =
      requirePositiveInteger(
        incidentId,
        "Incident ID"
      );

    const safeActorUserId =
      requirePositiveInteger(
        actorUserId,
        "Actor user ID"
      );

    const expectedVersion =
      requireVersion(
        version
      );

    const safeComment =
      normalizeMessage(
        comment,
        {
          fieldName:
            "Comment",

          required: true,

          minLength: 1,

          maxLength: 1000,
        }
      );

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const incident =
        await lockIncidentOrFail(
          connection,
          safeIncidentId
        );

      assertVersionMatches(
        incident,
        expectedVersion
      );

      if (
        incident.status ===
        "CLOSED"
      ) {
        throw new AppError(
          409,
          "Comments cannot be added to a CLOSED incident."
        );
      }

      await loadActiveUserOrFail(
        connection,
        safeActorUserId
      );

      const affectedRows =
        await touchIncidentVersion(
          connection,
          {
            incidentId:
              safeIncidentId,

            expectedVersion,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Incident changed while the comment was being added."
        );
      }

      const eventId =
        await insertIncidentEvent(
          connection,
          {
            incidentId:
              safeIncidentId,

            eventKey:
              buildEventKey(
                safeIncidentId,
                "COMMENT_ADDED"
              ),

            eventType:
              "COMMENT_ADDED",

            fromStatus:
              incident.status,

            toStatus:
              incident.status,

            actorUserId:
              safeActorUserId,

            message:
              safeComment,

            metadata: {
              previousVersion:
                expectedVersion,

              newVersion:
                expectedVersion +
                1,
            },
          }
        );

      const updatedIncident =
        await loadIncidentDetailsOrFail(
          connection,
          safeIncidentId
        );

      await connection.commit();

      return {
        eventId,

        incident:
          updatedIncident,
      };
    } catch (error) {
      await connection.rollback();

      throw error;
    } finally {
      connection.release();
    }
  };