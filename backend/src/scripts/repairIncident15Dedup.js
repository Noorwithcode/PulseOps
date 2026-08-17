import { randomUUID } from "node:crypto";

import pool from "../config/db.js";

const INCIDENT_ID = 15;

const main = async () => {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    /*
     * Lock incident 15 so another request cannot
     * modify it during this repair.
     */
    const [incidentRows] =
      await connection.execute(
        `
          SELECT
            id,
            incident_number AS incidentNumber,
            server_id AS serverId,
            incident_type AS incidentType,
            source,
            status,
            active_dedup_key AS activeDedupKey,
            version
          FROM incidents
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [INCIDENT_ID]
      );

    const incident =
      incidentRows[0];

    if (!incident) {
      throw new Error(
        `Incident ${INCIDENT_ID} was not found.`
      );
    }

    console.log(
      "Current incident:",
      incident
    );

    /*
     * This repair is intentionally limited to the
     * exact automatic SERVER_OFFLINE incident case.
     */
    if (
      incident.source !== "AUTOMATIC"
    ) {
      throw new Error(
        "Repair aborted: incident is not AUTOMATIC."
      );
    }

    if (
      incident.incidentType !==
      "SERVER_OFFLINE"
    ) {
      throw new Error(
        "Repair aborted: incident is not SERVER_OFFLINE."
      );
    }

    if (
      ![
        "OPEN",
        "ACKNOWLEDGED",
      ].includes(
        incident.status
      )
    ) {
      throw new Error(
        `Repair aborted: incident status is ${incident.status}.`
      );
    }

    const expectedDedupKey =
      `AUTO:${incident.serverId}`;

    /*
     * Already repaired?
     */
    if (
      incident.activeDedupKey ===
      expectedDedupKey
    ) {
      console.log(
        "Incident already has the correct active dedup key."
      );

      await connection.rollback();

      return;
    }

    if (
      incident.activeDedupKey !==
      null
    ) {
      throw new Error(
        `Repair aborted: unexpected activeDedupKey ${incident.activeDedupKey}.`
      );
    }

    /*
     * Check whether another active automatic incident
     * already owns AUTO:<serverId>.
     */
    const [ownerRows] =
      await connection.execute(
        `
          SELECT
            id,
            incident_number AS incidentNumber,
            status,
            active_dedup_key AS activeDedupKey
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
        [expectedDedupKey]
      );

    const existingOwner =
      ownerRows[0];

    if (
      existingOwner &&
      Number(
        existingOwner.id
      ) !== INCIDENT_ID
    ) {
      throw new Error(
        `Repair aborted: ${expectedDedupKey} is already owned by incident ${existingOwner.incidentNumber}.`
      );
    }

    const previousVersion =
      Number(
        incident.version
      );

    /*
     * Optimistic version guard remains in the UPDATE
     * even though the row is already locked.
     */
    const [updateResult] =
      await connection.execute(
        `
          UPDATE incidents
          SET
            active_dedup_key = ?,
            version = version + 1,
            updated_at = UTC_TIMESTAMP(3)
          WHERE id = ?
            AND version = ?
            AND active_dedup_key IS NULL
            AND status IN (
              'OPEN',
              'ACKNOWLEDGED'
            )
        `,
        [
          expectedDedupKey,
          INCIDENT_ID,
          previousVersion,
        ]
      );

    if (
      Number(
        updateResult.affectedRows
      ) !== 1
    ) {
      throw new Error(
        "Repair failed because the incident changed concurrently."
      );
    }

    /*
     * Append audit event.
     *
     * STATUS_CHANGED is used because the existing
     * event schema has no dedicated REPAIR event.
     * Status itself remains unchanged.
     */
    const eventKey =
      [
        "SYSTEM",
        "INCIDENT",
        INCIDENT_ID,
        "DEDUP_REPAIR",
        randomUUID(),
      ].join(":");

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
        VALUES (
          ?,
          ?,
          'STATUS_CHANGED',
          ?,
          ?,
          NULL,
          NULL,
          ?,
          ?
        )
      `,
      [
        INCIDENT_ID,
        eventKey,
        incident.status,
        incident.status,
        "Automatic incident deduplication key repaired after lifecycle hardening.",
        JSON.stringify({
          changeType:
            "ACTIVE_DEDUP_KEY_REPAIR",

          previousActiveDedupKey:
            null,

          newActiveDedupKey:
            expectedDedupKey,

          previousVersion,

          newVersion:
            previousVersion + 1,
        }),
      ]
    );

    await connection.commit();

    console.log(
      "Incident dedup repair completed successfully."
    );

    console.log({
      incidentId:
        INCIDENT_ID,

      activeDedupKey:
        expectedDedupKey,

      previousVersion,

      newVersion:
        previousVersion + 1,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback failure.
    }

    console.error(
      "Incident dedup repair failed:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    connection.release();

    await pool.end();
  }
};

await main();