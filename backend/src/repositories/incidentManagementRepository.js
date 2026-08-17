const INCIDENT_DETAILS_FIELDS = `
  i.id,
  i.incident_number AS incidentNumber,

  i.server_id AS serverId,
  s.server_code AS serverCode,
  s.name AS serverName,

  i.incident_type AS incidentType,
  i.source,
  i.source_check_type AS sourceCheckType,

  i.first_health_check_id AS firstHealthCheckId,
  i.latest_health_check_id AS latestHealthCheckId,

  i.active_dedup_key AS activeDedupKey,

  i.title,
  i.description,
  i.severity,
  i.status,

  i.occurrence_count AS occurrenceCount,

  i.opened_at AS openedAt,
  i.last_occurrence_at AS lastOccurrenceAt,

  i.acknowledged_at AS acknowledgedAt,
  i.acknowledged_by AS acknowledgedBy,
  acknowledged_user.full_name AS acknowledgedByName,

  i.resolved_at AS resolvedAt,
  i.resolved_by AS resolvedBy,
  resolved_user.full_name AS resolvedByName,

  i.closed_at AS closedAt,
  i.closed_by AS closedBy,
  closed_user.full_name AS closedByName,

  i.assigned_to AS assignedTo,
  assigned_user.full_name AS assignedToName,
  assigned_user.email AS assignedToEmail,

  i.resolution_notes AS resolutionNotes,

  i.version,

  i.created_at AS createdAt,
  i.updated_at AS updatedAt
`;

const INCIDENT_BASE_FIELDS = `
  id,
  incident_number AS incidentNumber,
  server_id AS serverId,
  incident_type AS incidentType,
  source,
  source_check_type AS sourceCheckType,

  first_health_check_id AS firstHealthCheckId,
  latest_health_check_id AS latestHealthCheckId,

  active_dedup_key AS activeDedupKey,

  title,
  description,
  severity,
  status,

  occurrence_count AS occurrenceCount,

  opened_at AS openedAt,
  last_occurrence_at AS lastOccurrenceAt,

  acknowledged_at AS acknowledgedAt,
  acknowledged_by AS acknowledgedBy,

  resolved_at AS resolvedAt,
  resolved_by AS resolvedBy,

  closed_at AS closedAt,
  closed_by AS closedBy,

  assigned_to AS assignedTo,
  resolution_notes AS resolutionNotes,

  version,

  created_at AS createdAt,
  updated_at AS updatedAt
`;

const buildIncidentWhere = (
  filters = {}
) => {
  const conditions = [];
  const params = [];

  if (filters.status) {
    conditions.push(
      "i.status = ?"
    );

    params.push(
      filters.status
    );
  }

  if (filters.severity) {
    conditions.push(
      "i.severity = ?"
    );

    params.push(
      filters.severity
    );
  }

  if (filters.source) {
    conditions.push(
      "i.source = ?"
    );

    params.push(
      filters.source
    );
  }

  if (filters.incidentType) {
    conditions.push(
      "i.incident_type = ?"
    );

    params.push(
      filters.incidentType
    );
  }

  if (filters.serverId) {
    conditions.push(
      "i.server_id = ?"
    );

    params.push(
      filters.serverId
    );
  }

  if (filters.assignedTo) {
    conditions.push(
      "i.assigned_to = ?"
    );

    params.push(
      filters.assignedTo
    );
  }

  if (
    filters.unassignedOnly === true
  ) {
    conditions.push(
      "i.assigned_to IS NULL"
    );
  }

  if (
    filters.activeOnly === true
  ) {
    conditions.push(
      `
        i.status IN (
          'OPEN',
          'ACKNOWLEDGED'
        )
      `
    );
  }

  if (filters.search) {
    conditions.push(
      `
        (
          i.incident_number LIKE ?
          OR i.title LIKE ?
          OR i.description LIKE ?
          OR s.server_code LIKE ?
          OR s.name LIKE ?
        )
      `
    );

    const searchValue =
      `%${filters.search}%`;

    params.push(
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue
    );
  }

  const whereSql =
    conditions.length > 0
      ? `WHERE ${conditions.join(
        " AND "
      )}`
      : "";

  return {
    whereSql,
    params,
  };
};

/*
 * =========================================================
 * LIST INCIDENTS
 * =========================================================
 */

export const findIncidents =
  async (
    connection,
    {
      page = 1,
      limit = 20,
      filters = {},
    } = {}
  ) => {
    const safePage =
      Math.max(
        Number(page) || 1,
        1
      );

    const safeLimit =
      Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );

    const offset =
      (safePage - 1) *
      safeLimit;

    const {
      whereSql,
      params,
    } =
      buildIncidentWhere(
        filters
      );

    const [rows] =
      await connection.execute(
        `
          SELECT
            ${INCIDENT_DETAILS_FIELDS}

          FROM incidents i

          INNER JOIN servers s
            ON s.id = i.server_id

          LEFT JOIN users acknowledged_user
            ON acknowledged_user.id =
              i.acknowledged_by

          LEFT JOIN users resolved_user
            ON resolved_user.id =
              i.resolved_by

          LEFT JOIN users closed_user
            ON closed_user.id =
              i.closed_by

          LEFT JOIN users assigned_user
            ON assigned_user.id =
              i.assigned_to

          ${whereSql}

          ORDER BY
            i.opened_at DESC,
            i.id DESC

          LIMIT ${safeLimit}
          OFFSET ${offset}
        `,
        params
      );

    return rows;
  };

/*
 * =========================================================
 * COUNT INCIDENTS
 * =========================================================
 */

export const countIncidents =
  async (
    connection,
    filters = {}
  ) => {
    const {
      whereSql,
      params,
    } =
      buildIncidentWhere(
        filters
      );

    const [rows] =
      await connection.execute(
        `
          SELECT
            COUNT(*) AS total

          FROM incidents i

          INNER JOIN servers s
            ON s.id = i.server_id

          ${whereSql}
        `,
        params
      );

    return Number(
      rows[0]?.total || 0
    );
  };

/*
 * =========================================================
 * GET INCIDENT DETAILS
 * =========================================================
 */

export const findIncidentDetailsById =
  async (
    connection,
    incidentId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            ${INCIDENT_DETAILS_FIELDS}

          FROM incidents i

          INNER JOIN servers s
            ON s.id = i.server_id

          LEFT JOIN users acknowledged_user
            ON acknowledged_user.id =
              i.acknowledged_by

          LEFT JOIN users resolved_user
            ON resolved_user.id =
              i.resolved_by

          LEFT JOIN users closed_user
            ON closed_user.id =
              i.closed_by

          LEFT JOIN users assigned_user
            ON assigned_user.id =
              i.assigned_to

          WHERE i.id = ?

          LIMIT 1
        `,
        [incidentId]
      );

    return rows[0] || null;
  };

/*
 * =========================================================
 * LOCK INCIDENT
 * =========================================================
 */

export const findIncidentForUpdate =
  async (
    connection,
    incidentId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            ${INCIDENT_BASE_FIELDS}

          FROM incidents

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [incidentId]
      );

    return rows[0] || null;
  };

/*
 * =========================================================
 * INCIDENT TIMELINE
 * =========================================================
 */

export const findIncidentTimeline =
  async (
    connection,
    incidentId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            event.id,

            event.incident_id
              AS incidentId,

            event.event_key
              AS eventKey,

            event.event_type
              AS eventType,

            event.from_status
              AS fromStatus,

            event.to_status
              AS toStatus,

            event.source_health_check_id
              AS sourceHealthCheckId,

            event.actor_user_id
              AS actorUserId,

            actor.full_name
              AS actorName,

            actor.email
              AS actorEmail,

            event.message,
            event.metadata,

            event.created_at
              AS createdAt

          FROM incident_events event

          LEFT JOIN users actor
            ON actor.id =
              event.actor_user_id

          WHERE event.incident_id = ?

          ORDER BY
            event.created_at ASC,
            event.id ASC
        `,
        [incidentId]
      );

    return rows;
  };

/*
 * =========================================================
 * ACTIVE USER
 * =========================================================
 */

export const findActiveUserById =
  async (
    connection,
    userId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            users.id,

            users.full_name
              AS fullName,

            users.email,

            users.status,

            roles.code
              AS roleCode,

            roles.name
              AS roleName

          FROM users

          INNER JOIN roles
            ON roles.id =
              users.role_id

          WHERE users.id = ?
            AND users.status = 'ACTIVE'

          LIMIT 1
        `,
        [userId]
      );

    return rows[0] || null;
  };

/*
 * =========================================================
 * ACKNOWLEDGE
 * =========================================================
 */

export const acknowledgeIncident =
  async (
    connection,
    {
      incidentId,
      userId,
      expectedVersion,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE incidents

          SET
            status = 'ACKNOWLEDGED',

            acknowledged_at =
              UTC_TIMESTAMP(3),

            acknowledged_by = ?,

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND status = 'OPEN'
        `,
        [
          userId,
          incidentId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

/*
 * =========================================================
 * ASSIGN
 * =========================================================
 */

export const assignIncident =
  async (
    connection,
    {
      incidentId,
      assignedTo,
      expectedVersion,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE incidents

          SET
            assigned_to = ?,

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND status <> 'CLOSED'
        `,
        [
          assignedTo,
          incidentId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

/*
 * =========================================================
 * UNASSIGN
 * =========================================================
 */

export const unassignIncident =
  async (
    connection,
    {
      incidentId,
      expectedVersion,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE incidents

          SET
            assigned_to = NULL,

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND status <> 'CLOSED'
        `,
        [
          incidentId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

/*
 * =========================================================
 * CHANGE SEVERITY
 * =========================================================
 */

export const updateIncidentSeverity =
  async (
    connection,
    {
      incidentId,
      severity,
      expectedVersion,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE incidents

          SET
            severity = ?,

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND status <> 'CLOSED'
        `,
        [
          severity,
          incidentId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

/*
 * =========================================================
 * RESOLVE
 * =========================================================
 */

export const resolveIncident =
  async (
    connection,
    {
      incidentId,
      userId,
      resolutionNotes,
      expectedVersion,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE incidents

          SET
            status = 'RESOLVED',

            resolved_at =
              UTC_TIMESTAMP(3),

            resolved_by = ?,

            resolution_notes = ?,

            active_dedup_key = NULL,

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND status IN (
              'OPEN',
              'ACKNOWLEDGED'
            )
        `,
        [
          userId,
          resolutionNotes,
          incidentId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

/*
 * =========================================================
 * CLOSE
 * =========================================================
 */

export const closeIncident =
  async (
    connection,
    {
      incidentId,
      userId,
      expectedVersion,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE incidents

          SET
            status = 'CLOSED',

            closed_at =
              UTC_TIMESTAMP(3),

            closed_by = ?,

            active_dedup_key = NULL,

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND status = 'RESOLVED'
        `,
        [
          userId,
          incidentId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

/*
 * =========================================================
 * REOPEN
 * =========================================================
 */

export const reopenIncident =
  async (
    connection,
    {
      incidentId,
      expectedVersion,
      activeDedupKey = null,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE incidents

          SET
            status = 'OPEN',

            acknowledged_at = NULL,
            acknowledged_by = NULL,

            resolved_at = NULL,
            resolved_by = NULL,

            closed_at = NULL,
            closed_by = NULL,

            resolution_notes = NULL,

            active_dedup_key = ?,

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND status IN (
              'RESOLVED',
              'CLOSED'
            )
        `,
        [
          activeDedupKey,
          incidentId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

/*
 * =========================================================
 * COMMENT VERSION TOUCH
 * =========================================================
 */

export const touchIncidentVersion =
  async (
    connection,
    {
      incidentId,
      expectedVersion,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE incidents

          SET
            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND status <> 'CLOSED'
        `,
        [
          incidentId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

export const insertManualIncident =
  async (
    connection,
    {
      incidentNumber,
      serverId,
      incidentType,
      title,
      description,
      severity,
      assignedTo,
      openedAt,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          INSERT INTO incidents (
            incident_number,
            server_id,
            incident_type,
            source,
            source_check_type,

            first_health_check_id,
            latest_health_check_id,
            active_dedup_key,

            title,
            description,
            severity,
            status,

            occurrence_count,
            opened_at,
            last_occurrence_at,

            assigned_to,
            version
          )
          VALUES (
            ?,
            ?,
            ?,
            'MANUAL',
            'MANUAL',

            NULL,
            NULL,
            NULL,

            ?,
            ?,
            ?,
            'OPEN',

            1,
            ?,
            ?,

            ?,
            1
          )
        `,
        [
          incidentNumber,
          serverId,
          incidentType,
          title,
          description,
          severity,
          openedAt,
          openedAt,
          assignedTo ?? null,
        ]
      );

    return Number(
      result.insertId
    );
  };

export const findServerForIncidentById =
  async (
    connection,
    serverId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            id,

            server_code AS serverCode,

            name,

            hostname,

            status,

            deleted_at AS deletedAt

          FROM servers

          WHERE id = ?
            AND deleted_at IS NULL

          LIMIT 1
        `,
        [serverId]
      );

    return rows[0] || null;
  };