import "dotenv/config";

import pool from "../config/db.js";

const MIGRATION_LOCK =
  "pulseops:setup:notifications:v1";

const setupNotifications =
  async () => {
    const connection =
      await pool.getConnection();

    let lockAcquired = false;

    try {
      const [lockRows] =
        await connection.execute(
          `
            SELECT
              GET_LOCK(?, 30)
                AS acquired
          `,
          [MIGRATION_LOCK]
        );

      lockAcquired =
        Number(
          lockRows[0]?.acquired
        ) === 1;

      if (!lockAcquired) {
        throw new Error(
          "Could not acquire notification migration lock."
        );
      }

      await connection.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id BIGINT UNSIGNED
            NOT NULL AUTO_INCREMENT,

          dedup_key VARCHAR(190)
            COLLATE utf8mb4_unicode_ci
            NOT NULL,

          recipient_user_id
            BIGINT UNSIGNED
            NOT NULL,

          notification_type ENUM(
            'INCIDENT_CREATED',
            'INCIDENT_UPDATED',
            'INCIDENT_RESOLVED',
            'ALERT_OPENED',
            'ALERT_RESOLVED',
            'SERVER_OFFLINE',
            'SERVER_RECOVERED',
            'SYSTEM'
          ) COLLATE utf8mb4_unicode_ci
            NOT NULL,

          source_type ENUM(
            'INCIDENT',
            'ALERT_RULE',
            'SERVER',
            'SYSTEM'
          ) COLLATE utf8mb4_unicode_ci
            NOT NULL,

          source_id BIGINT UNSIGNED
            NULL,

          server_id BIGINT UNSIGNED
            NULL,

          incident_id BIGINT UNSIGNED
            NULL,

          alert_rule_id BIGINT UNSIGNED
            NULL,

          severity ENUM(
            'INFO',
            'WARNING',
            'HIGH',
            'CRITICAL'
          ) COLLATE utf8mb4_unicode_ci
            NOT NULL DEFAULT 'INFO',

          title VARCHAR(180)
            COLLATE utf8mb4_unicode_ci
            NOT NULL,

          message TEXT
            COLLATE utf8mb4_unicode_ci
            NULL,

          metadata JSON
            NULL,

          is_read TINYINT(1)
            NOT NULL DEFAULT 0,

          read_at DATETIME(3)
            NULL,

          version INT UNSIGNED
            NOT NULL DEFAULT 1,

          created_at DATETIME(3)
            NOT NULL
            DEFAULT CURRENT_TIMESTAMP(3),

          updated_at DATETIME(3)
            NOT NULL
            DEFAULT CURRENT_TIMESTAMP(3)
            ON UPDATE CURRENT_TIMESTAMP(3),

          deleted_at DATETIME(3)
            NULL,

          PRIMARY KEY (id),

          UNIQUE KEY
            uq_notification_recipient_dedup (
              recipient_user_id,
              dedup_key
            ),

          KEY idx_notifications_recipient (
            recipient_user_id
          ),

          KEY idx_notifications_unread (
            recipient_user_id,
            is_read,
            deleted_at,
            created_at
          ),

          KEY idx_notifications_type (
            notification_type
          ),

          KEY idx_notifications_source (
            source_type,
            source_id
          ),

          KEY idx_notifications_server (
            server_id
          ),

          KEY idx_notifications_incident (
            incident_id
          ),

          KEY idx_notifications_alert_rule (
            alert_rule_id
          ),

          KEY idx_notifications_created_at (
            created_at
          ),

          CONSTRAINT
            fk_notifications_recipient
          FOREIGN KEY (
            recipient_user_id
          )
          REFERENCES users (id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,

          CONSTRAINT
            fk_notifications_server
          FOREIGN KEY (
            server_id
          )
          REFERENCES servers (id)
          ON DELETE SET NULL
          ON UPDATE CASCADE,

          CONSTRAINT
            fk_notifications_incident
          FOREIGN KEY (
            incident_id
          )
          REFERENCES incidents (id)
          ON DELETE SET NULL
          ON UPDATE CASCADE,

          CONSTRAINT
            fk_notifications_alert_rule
          FOREIGN KEY (
            alert_rule_id
          )
          REFERENCES alert_rules (id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
        )
        ENGINE = InnoDB
        DEFAULT CHARSET = utf8mb4
        COLLATE = utf8mb4_unicode_ci
      `);

      console.log(
        "Notifications table setup completed."
      );

      console.log(
        "Added: recipient-specific notifications"
      );

      console.log(
        "Added: unread/read tracking"
      );

      console.log(
        "Added: optimistic locking version"
      );

      console.log(
        "Added: duplicate notification protection"
      );
    } finally {
      if (lockAcquired) {
        await connection.execute(
          `
            SELECT
              RELEASE_LOCK(?)
          `,
          [MIGRATION_LOCK]
        );
      }

      connection.release();
    }
  };

setupNotifications()
  .catch((error) => {
    console.error(
      "Notification setup failed:",
      error.message
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });