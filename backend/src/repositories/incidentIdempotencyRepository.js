const IDEMPOTENCY_SELECT_FIELDS = `
  id,
  actor_user_id AS actorUserId,
  idempotency_key AS idempotencyKey,
  request_hash AS requestHash,
  incident_id AS incidentId,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export const insertIncidentCreateIdempotency =
  async (
    connection,
    {
      actorUserId,
      idempotencyKey,
      requestHash,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          INSERT INTO incident_create_idempotency (
            actor_user_id,
            idempotency_key,
            request_hash,
            incident_id
          )
          VALUES (?, ?, ?, NULL)
        `,
        [
          actorUserId,
          idempotencyKey,
          requestHash,
        ]
      );

    return Number(result.insertId);
  };

export const findIncidentCreateIdempotencyForUpdate =
  async (
    connection,
    {
      actorUserId,
      idempotencyKey,
    }
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            ${IDEMPOTENCY_SELECT_FIELDS}
          FROM incident_create_idempotency
          WHERE actor_user_id = ?
            AND idempotency_key = ?
          LIMIT 1
          FOR UPDATE
        `,
        [
          actorUserId,
          idempotencyKey,
        ]
      );

    return rows[0] || null;
  };

export const attachIncidentToCreateIdempotency =
  async (
    connection,
    {
      idempotencyId,
      incidentId,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE incident_create_idempotency
          SET
            incident_id = ?,
            updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?
            AND incident_id IS NULL
        `,
        [
          incidentId,
          idempotencyId,
        ]
      );

    return Number(result.affectedRows);
  };