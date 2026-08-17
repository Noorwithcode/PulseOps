import pool from "../config/db.js";

const MIGRATION_LOCK =
  "pulseops:setup:incidents:v2";

/*
 * Check whether a trigger already exists.
 */
const triggerExists = async (
  connection,
  triggerName
) => {
  const [rows] = await connection.execute(
    `
      SELECT TRIGGER_NAME
      FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND TRIGGER_NAME = ?
      LIMIT 1
    `,
    [triggerName]
  );

  return rows.length > 0;
};

/*
 * Create a trigger only when it does not
 * already exist.
 */
const ensureTrigger = async (
  connection,
  triggerName,
  createSql
) => {
  const exists = await triggerExists(
    connection,
    triggerName
  );

  if (!exists) {
    await connection.query(createSql);
  }
};

/*
 * MySQL may block CREATE TRIGGER when binary
 * logging is enabled and the application user
 * does not have the required privilege.
 */
const isBinaryLogPrivilegeError = (
  error
) =>
  error?.errno === 1419 ||
  error?.code ===
    "ER_BINLOG_CREATE_ROUTINE_NEED_SUPER";

const setupIncidentTables = async () => {
  const connection =
    await pool.getConnection();

  let lockAcquired = false;

  try {
    /*
     * Prevent two migration processes from
     * running concurrently.
     */
    const [lockRows] =
      await connection.execute(
        `
          SELECT GET_LOCK(?, 30) AS acquired
        `,
        [MIGRATION_LOCK]
      );

    lockAcquired =
      Number(lockRows[0]?.acquired) === 1;

    if (!lockAcquired) {
      throw new Error(
        "Could not acquire incident migration lock."
      );
    }

    /*
     * Main incident lifecycle table.
     *
     * active_dedup_key will contain:
     * AUTO:<serverId>
     *
     * Because it is unique, concurrent OFFLINE
     * heartbeats cannot create multiple active
     * incidents for the same server.
     */
    await connection.query(`
      CREATE TABLE IF NOT EXISTS incidents (
        id BIGINT UNSIGNED
          NOT NULL AUTO_INCREMENT,

        incident_number VARCHAR(40)
          COLLATE utf8mb4_unicode_ci
          NOT NULL,

        server_id BIGINT UNSIGNED
          NOT NULL,

        incident_type ENUM(
          'SERVER_OFFLINE',
          'SERVER_DEGRADED',
          'HIGH_CPU',
          'HIGH_MEMORY',
          'HIGH_DISK',
          'HIGH_RESPONSE_TIME',
          'MANUAL'
        ) COLLATE utf8mb4_unicode_ci
          NOT NULL DEFAULT 'SERVER_OFFLINE',

        source ENUM(
          'AUTOMATIC',
          'MANUAL'
        ) COLLATE utf8mb4_unicode_ci
          NOT NULL DEFAULT 'AUTOMATIC',

        source_check_type ENUM(
          'HEARTBEAT',
          'HTTP',
          'TCP',
          'MANUAL'
        ) COLLATE utf8mb4_unicode_ci
          DEFAULT NULL,

        first_health_check_id
          BIGINT UNSIGNED DEFAULT NULL,

        latest_health_check_id
          BIGINT UNSIGNED DEFAULT NULL,

        active_dedup_key VARCHAR(191)
          COLLATE utf8mb4_unicode_ci
          DEFAULT NULL,

        title VARCHAR(180)
          COLLATE utf8mb4_unicode_ci
          NOT NULL,

        description VARCHAR(1000)
          COLLATE utf8mb4_unicode_ci
          DEFAULT NULL,

        severity ENUM(
          'LOW',
          'MEDIUM',
          'HIGH',
          'CRITICAL'
        ) COLLATE utf8mb4_unicode_ci
          NOT NULL DEFAULT 'CRITICAL',

        status ENUM(
          'OPEN',
          'ACKNOWLEDGED',
          'RESOLVED',
          'CLOSED'
        ) COLLATE utf8mb4_unicode_ci
          NOT NULL DEFAULT 'OPEN',

        occurrence_count INT UNSIGNED
          NOT NULL DEFAULT 1,

        opened_at DATETIME(3)
          NOT NULL,

        last_occurrence_at DATETIME(3)
          NOT NULL,

        acknowledged_at DATETIME(3)
          DEFAULT NULL,

        acknowledged_by BIGINT UNSIGNED
          DEFAULT NULL,

        resolved_at DATETIME(3)
          DEFAULT NULL,

        resolved_by BIGINT UNSIGNED
          DEFAULT NULL,

        closed_at DATETIME(3)
          DEFAULT NULL,

        closed_by BIGINT UNSIGNED
          DEFAULT NULL,

        assigned_to BIGINT UNSIGNED
          DEFAULT NULL,

        resolution_notes VARCHAR(1000)
          COLLATE utf8mb4_unicode_ci
          DEFAULT NULL,

        version INT UNSIGNED
          NOT NULL DEFAULT 1,

        created_at DATETIME(3)
          NOT NULL
          DEFAULT CURRENT_TIMESTAMP(3),

        updated_at DATETIME(3)
          NOT NULL
          DEFAULT CURRENT_TIMESTAMP(3)
          ON UPDATE CURRENT_TIMESTAMP(3),

        PRIMARY KEY (id),

        UNIQUE KEY uq_incidents_number (
          incident_number
        ),

        UNIQUE KEY uq_incidents_active_dedup (
          active_dedup_key
        ),

        KEY idx_incidents_server_status (
          server_id,
          status
        ),

        KEY idx_incidents_status_severity (
          status,
          severity
        ),

        KEY idx_incidents_opened_at (
          opened_at
        ),

        KEY idx_incidents_latest_check (
          latest_health_check_id
        ),

        KEY idx_incidents_assigned_to (
          assigned_to
        ),

        CONSTRAINT fk_incidents_server
          FOREIGN KEY (server_id)
          REFERENCES servers (id)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT,

        CONSTRAINT fk_incidents_first_check
          FOREIGN KEY (
            first_health_check_id
          )
          REFERENCES server_health_checks (id)
          ON DELETE SET NULL
          ON UPDATE RESTRICT,

        CONSTRAINT fk_incidents_latest_check
          FOREIGN KEY (
            latest_health_check_id
          )
          REFERENCES server_health_checks (id)
          ON DELETE SET NULL
          ON UPDATE RESTRICT,

        CONSTRAINT fk_incidents_acknowledged_by
          FOREIGN KEY (acknowledged_by)
          REFERENCES users (id)
          ON DELETE SET NULL
          ON UPDATE RESTRICT,

        CONSTRAINT fk_incidents_resolved_by
          FOREIGN KEY (resolved_by)
          REFERENCES users (id)
          ON DELETE SET NULL
          ON UPDATE RESTRICT,

        CONSTRAINT fk_incidents_closed_by
          FOREIGN KEY (closed_by)
          REFERENCES users (id)
          ON DELETE SET NULL
          ON UPDATE RESTRICT,

        CONSTRAINT fk_incidents_assigned_to
          FOREIGN KEY (assigned_to)
          REFERENCES users (id)
          ON DELETE SET NULL
          ON UPDATE RESTRICT,

        CONSTRAINT chk_incidents_occurrence
          CHECK (occurrence_count >= 1),

        CONSTRAINT chk_incidents_version
          CHECK (version >= 1)

      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    /*
     * Append-only incident audit history.
     */
    await connection.query(`
      CREATE TABLE IF NOT EXISTS incident_events (
        id BIGINT UNSIGNED
          NOT NULL AUTO_INCREMENT,

        incident_id BIGINT UNSIGNED
          NOT NULL,

        event_key VARCHAR(191)
          COLLATE utf8mb4_unicode_ci
          NOT NULL,

        event_type ENUM(
          'CREATED',
          'OCCURRENCE_RECORDED',
          'STATUS_CHANGED',
          'ACKNOWLEDGED',
          'ASSIGNED',
          'UNASSIGNED',
          'RESOLVED',
          'CLOSED',
          'REOPENED',
          'COMMENT_ADDED'
        ) COLLATE utf8mb4_unicode_ci
          NOT NULL,

        from_status ENUM(
          'OPEN',
          'ACKNOWLEDGED',
          'RESOLVED',
          'CLOSED'
        ) COLLATE utf8mb4_unicode_ci
          DEFAULT NULL,

        to_status ENUM(
          'OPEN',
          'ACKNOWLEDGED',
          'RESOLVED',
          'CLOSED'
        ) COLLATE utf8mb4_unicode_ci
          DEFAULT NULL,

        source_health_check_id
          BIGINT UNSIGNED DEFAULT NULL,

        actor_user_id BIGINT UNSIGNED
          DEFAULT NULL,

        message VARCHAR(1000)
          COLLATE utf8mb4_unicode_ci
          DEFAULT NULL,

        metadata JSON DEFAULT NULL,

        created_at DATETIME(3)
          NOT NULL
          DEFAULT CURRENT_TIMESTAMP(3),

        PRIMARY KEY (id),

        UNIQUE KEY uq_incident_events_key (
          event_key
        ),

        KEY idx_incident_events_incident_created (
          incident_id,
          created_at
        ),

        KEY idx_incident_events_type_created (
          event_type,
          created_at
        ),

        KEY idx_incident_events_health_check (
          source_health_check_id
        ),

        KEY idx_incident_events_actor (
          actor_user_id
        ),

        CONSTRAINT fk_incident_events_incident
          FOREIGN KEY (incident_id)
          REFERENCES incidents (id)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT,

        CONSTRAINT fk_incident_events_check
          FOREIGN KEY (
            source_health_check_id
          )
          REFERENCES server_health_checks (id)
          ON DELETE SET NULL
          ON UPDATE RESTRICT,

        CONSTRAINT fk_incident_events_actor
          FOREIGN KEY (actor_user_id)
          REFERENCES users (id)
          ON DELETE SET NULL
          ON UPDATE RESTRICT

      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);


    /*
     * Manual incident create idempotency.
     *
     * The actor-scoped unique key prevents the same
     * authenticated user from creating two incidents
     * when the same request is retried concurrently.
     *
     * request_hash prevents a key from being reused
     * with a different payload.
     */
    await connection.query(`
      CREATE TABLE IF NOT EXISTS incident_create_idempotency (
        id BIGINT UNSIGNED
          NOT NULL AUTO_INCREMENT,

        actor_user_id BIGINT UNSIGNED
          NOT NULL,

        idempotency_key VARCHAR(191)
          CHARACTER SET utf8mb4
          COLLATE utf8mb4_bin
          NOT NULL,

        request_hash CHAR(64)
          CHARACTER SET ascii
          COLLATE ascii_bin
          NOT NULL,

        incident_id BIGINT UNSIGNED
          DEFAULT NULL,

        created_at DATETIME(3)
          NOT NULL
          DEFAULT CURRENT_TIMESTAMP(3),

        updated_at DATETIME(3)
          NOT NULL
          DEFAULT CURRENT_TIMESTAMP(3)
          ON UPDATE CURRENT_TIMESTAMP(3),

        PRIMARY KEY (id),

        UNIQUE KEY uq_incident_create_idempotency_actor_key (
          actor_user_id,
          idempotency_key
        ),

        UNIQUE KEY uq_incident_create_idempotency_incident (
          incident_id
        ),

        KEY idx_incident_create_idempotency_created (
          created_at
        ),

        CONSTRAINT fk_incident_create_idempotency_actor
          FOREIGN KEY (actor_user_id)
          REFERENCES users (id)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT,

        CONSTRAINT fk_incident_create_idempotency_incident
          FOREIGN KEY (incident_id)
          REFERENCES incidents (id)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT

      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    /*
     * Try to create database-level append-only
     * protection. If MySQL blocks CREATE TRIGGER,
     * migration continues and protection will be
     * applied through the application repository.
     */
    let appendOnlyTriggersCreated = false;

    try {
      await ensureTrigger(
        connection,
        "trg_incident_events_block_update",
        `
          CREATE TRIGGER
            trg_incident_events_block_update
          BEFORE UPDATE ON incident_events
          FOR EACH ROW
          SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT =
            'incident_events is append-only and cannot be updated'
        `
      );

      await ensureTrigger(
        connection,
        "trg_incident_events_block_delete",
        `
          CREATE TRIGGER
            trg_incident_events_block_delete
          BEFORE DELETE ON incident_events
          FOR EACH ROW
          SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT =
            'incident_events is append-only and cannot be deleted'
        `
      );

      appendOnlyTriggersCreated = true;
    } catch (error) {
      if (
        !isBinaryLogPrivilegeError(error)
      ) {
        throw error;
      }

      console.warn(
        "Append-only triggers skipped because the database user does not have the required binary-log privilege."
      );
    }

    console.log(
      "Incident tables created successfully."
    );

    console.log(
      "Created/verified: incidents"
    );

    console.log(
      "Created/verified: incident_events"
    );

    console.log(
      "Created/verified: incident_create_idempotency"
    );

    console.log(
      appendOnlyTriggersCreated
        ? "Append-only audit triggers verified."
        : "Append-only protection will be enforced by the application repository."
    );
  } finally {
    /*
     * GET_LOCK is connection-specific, so release
     * it before returning the connection to pool.
     */
    if (lockAcquired) {
      try {
        await connection.execute(
          "SELECT RELEASE_LOCK(?)",
          [MIGRATION_LOCK]
        );
      } catch (releaseError) {
        console.error(
          "Could not release migration lock:",
          releaseError.message
        );
      }
    }

    connection.release();
  }
};

try {
  await setupIncidentTables();
} catch (error) {
  console.error(
    "Incident setup failed:",
    error.message
  );

  process.exitCode = 1;
} finally {
  await pool.end();
}