const INCIDENT_SELECT_FIELDS = `
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

export const findIncidentById =
  async (connection, incidentId) => {
    const [rows] = await connection.execute(
      `
        SELECT
          ${INCIDENT_SELECT_FIELDS}
        FROM incidents
        WHERE id = ?
        LIMIT 1
      `,
      [incidentId]
    );

    return rows[0] || null;
  };

export const findActiveAutomaticIncidentForUpdate =
  async (connection, activeDedupKey) => {
    const [rows] = await connection.execute(
      `
        SELECT
          ${INCIDENT_SELECT_FIELDS}
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
      [activeDedupKey]
    );

    return rows[0] || null;
  };

export const insertAutomaticOfflineIncident =
  async (connection, data) => {
    const [result] = await connection.execute(
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
          last_occurrence_at
        )
        VALUES (
          ?,
          ?,
          'SERVER_OFFLINE',
          'AUTOMATIC',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'CRITICAL',
          'OPEN',
          1,
          ?,
          ?
        )
      `,
      [
        data.incidentNumber,
        data.serverId,
        data.sourceCheckType,
        data.healthCheckId,
        data.healthCheckId,
        data.activeDedupKey,
        data.title,
        data.description,
        data.openedAt,
        data.openedAt,
      ]
    );

    return Number(result.insertId);
  };

export const insertAutomaticThresholdIncident =
  async (connection, data) => {
    const [result] = await connection.execute(
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
          last_occurrence_at
        )
        VALUES (
          ?,
          ?,
          ?,
          'AUTOMATIC',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'OPEN',
          1,
          ?,
          ?
        )
      `,
      [
        data.incidentNumber,
        data.serverId,
        data.incidentType,
        data.sourceCheckType,
        data.healthCheckId,
        data.healthCheckId,
        data.activeDedupKey,
        data.title,
        data.description,
        data.severity,
        data.openedAt,
        data.openedAt,
      ]
    );

    return Number(result.insertId);
  };

export const recordAutomaticIncidentOccurrence =
  async (connection, data) => {
    const [result] = await connection.execute(
      `
        UPDATE incidents
        SET
          latest_health_check_id = ?,
          last_occurrence_at = ?,
          occurrence_count =
            occurrence_count + 1,
          version = version + 1
        WHERE id = ?
          AND active_dedup_key = ?
          AND status IN (
            'OPEN',
            'ACKNOWLEDGED'
          )
      `,
      [
        data.healthCheckId,
        data.occurredAt,
        data.incidentId,
        data.activeDedupKey,
      ]
    );

    return Number(result.affectedRows);
  };

export const resolveAutomaticIncident =
  async (connection, data) => {
    const [result] = await connection.execute(
      `
        UPDATE incidents
        SET
          latest_health_check_id = ?,
          status = 'RESOLVED',
          resolved_at = ?,
          resolved_by = NULL,
          resolution_notes = ?,
          active_dedup_key = NULL,
          version = version + 1
        WHERE id = ?
          AND active_dedup_key = ?
          AND status IN (
            'OPEN',
            'ACKNOWLEDGED'
          )
      `,
      [
        data.healthCheckId,
        data.resolvedAt,
        data.resolutionNotes,
        data.incidentId,
        data.activeDedupKey,
      ]
    );

    return Number(result.affectedRows);
  };

export const findIncidentEventByKey =
  async (connection, eventKey) => {
    const [rows] = await connection.execute(
      `
        SELECT
          id,
          incident_id AS incidentId,
          event_key AS eventKey,
          event_type AS eventType,
          from_status AS fromStatus,
          to_status AS toStatus,
          source_health_check_id
            AS sourceHealthCheckId,
          actor_user_id AS actorUserId,
          message,
          metadata,
          created_at AS createdAt
        FROM incident_events
        WHERE event_key = ?
        LIMIT 1
      `,
      [eventKey]
    );

    return rows[0] || null;
  };

const isDuplicateKeyError = (error) =>
  error?.errno === 1062 ||
  error?.code === "ER_DUP_ENTRY";

export const insertIncidentEvent =
  async (connection, data) => {
    try {
      const [result] =
        await connection.execute(
          `
            INSERT INTO incident_events (
              incident_id,
              event_key,
              event_type,
              from_status,
              to_status,
              source_health_check_id,
              actor_user_id,
              message,
              metadata
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            data.incidentId,
            data.eventKey,
            data.eventType,
            data.fromStatus ?? null,
            data.toStatus ?? null,
            data.sourceHealthCheckId ??
            null,
            data.actorUserId ?? null,
            data.message ?? null,
            data.metadata
              ? JSON.stringify(
                data.metadata
              )
              : null,
          ]
        );

      return Number(result.insertId);
    } catch (error) {
      /*
       * The event_key unique constraint provides
       * event-level idempotency.
       */
      if (isDuplicateKeyError(error)) {
        return null;
      }

      throw error;
    }
  };
