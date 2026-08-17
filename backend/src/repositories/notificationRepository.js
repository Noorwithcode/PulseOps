const NOTIFICATION_SELECT = `
  notifications.id,

  notifications.dedup_key
    AS dedupKey,

  notifications.recipient_user_id
    AS recipientUserId,

  users.full_name
    AS recipientName,

  users.email
    AS recipientEmail,

  notifications.notification_type
    AS notificationType,

  notifications.source_type
    AS sourceType,

  notifications.source_id
    AS sourceId,

  notifications.server_id
    AS serverId,

  servers.server_code
    AS serverCode,

  servers.name
    AS serverName,

  notifications.incident_id
    AS incidentId,

  incidents.incident_number
    AS incidentNumber,

  notifications.alert_rule_id
    AS alertRuleId,

  alert_rules.rule_code
    AS alertRuleCode,

  notifications.severity,
  notifications.title,
  notifications.message,
  notifications.metadata,

  notifications.is_read
    AS isRead,

  notifications.read_at
    AS readAt,

  notifications.version,

  notifications.created_at
    AS createdAt,

  notifications.updated_at
    AS updatedAt
`;

export const createNotification =
  async (
    connection,
    {
      dedupKey,
      recipientUserId,
      notificationType,
      sourceType,
      sourceId = null,
      serverId = null,
      incidentId = null,
      alertRuleId = null,
      severity = "INFO",
      title,
      message = null,
      metadata = null,
    }
  ) => {
    /*
     * Duplicate notification হলে existing
     * notification ID return করবে।
     *
     * recipient_user_id এবং dedup_key unique
     * হওয়ায় notification creation idempotent।
     */
    const [result] =
      await connection.execute(
        `
          INSERT INTO notifications (
            dedup_key,
            recipient_user_id,
            notification_type,
            source_type,
            source_id,
            server_id,
            incident_id,
            alert_rule_id,
            severity,
            title,
            message,
            metadata
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )

          ON DUPLICATE KEY UPDATE
            id = LAST_INSERT_ID(id)
        `,
        [
          dedupKey,
          recipientUserId,
          notificationType,
          sourceType,
          sourceId,
          serverId,
          incidentId,
          alertRuleId,
          severity,
          title,
          message,
          metadata
            ? JSON.stringify(metadata)
            : null,
        ]
      );

    return {
      notificationId:
        Number(result.insertId),

      created:
        Number(result.affectedRows) === 1,
    };
  };

export const findNotificationById =
  async (
    connection,
    {
      notificationId,
      recipientUserId = null,
    }
  ) => {
    const conditions = [
      "notifications.id = ?",
      "notifications.deleted_at IS NULL",
    ];

    const values = [
      notificationId,
    ];

    if (recipientUserId !== null) {
      conditions.push(
        "notifications.recipient_user_id = ?"
      );

      values.push(
        recipientUserId
      );
    }

    const [rows] =
      await connection.execute(
        `
          SELECT
            ${NOTIFICATION_SELECT}

          FROM notifications

          INNER JOIN users
            ON users.id =
              notifications.recipient_user_id

          LEFT JOIN servers
            ON servers.id =
              notifications.server_id

          LEFT JOIN incidents
            ON incidents.id =
              notifications.incident_id

          LEFT JOIN alert_rules
            ON alert_rules.id =
              notifications.alert_rule_id

          WHERE ${conditions.join(
            "\n AND "
          )}

          LIMIT 1
        `,
        values
      );

    return rows[0] || null;
  };

export const findNotifications =
  async (
    connection,
    {
      recipientUserId,
      unreadOnly = false,
      notificationType = null,
      severity = null,
      limit = 20,
      offset = 0,
    }
  ) => {
    const conditions = [
      "notifications.recipient_user_id = ?",
      "notifications.deleted_at IS NULL",
    ];

    const values = [
      recipientUserId,
    ];

    if (unreadOnly) {
      conditions.push(
        "notifications.is_read = 0"
      );
    }

    if (notificationType) {
      conditions.push(
        "notifications.notification_type = ?"
      );

      values.push(
        notificationType
      );
    }

    if (severity) {
      conditions.push(
        "notifications.severity = ?"
      );

      values.push(
        severity
      );
    }

    const safeLimit =
      Number.isSafeInteger(Number(limit)) &&
      Number(limit) > 0
        ? Number(limit)
        : 20;

    const safeOffset =
      Number.isSafeInteger(Number(offset)) &&
      Number(offset) >= 0
        ? Number(offset)
        : 0;

    const [rows] =
      await connection.execute(
        `
          SELECT
            ${NOTIFICATION_SELECT}

          FROM notifications

          INNER JOIN users
            ON users.id =
              notifications.recipient_user_id

          LEFT JOIN servers
            ON servers.id =
              notifications.server_id

          LEFT JOIN incidents
            ON incidents.id =
              notifications.incident_id

          LEFT JOIN alert_rules
            ON alert_rules.id =
              notifications.alert_rule_id

          WHERE ${conditions.join(
            "\n AND "
          )}

          ORDER BY
            notifications.created_at DESC,
            notifications.id DESC

          LIMIT ${safeLimit}
          OFFSET ${safeOffset}
        `,
        values
      );

    return rows;
  };

export const countNotifications =
  async (
    connection,
    {
      recipientUserId,
      unreadOnly = false,
      notificationType = null,
      severity = null,
    }
  ) => {
    const conditions = [
      "recipient_user_id = ?",
      "deleted_at IS NULL",
    ];

    const values = [
      recipientUserId,
    ];

    if (unreadOnly) {
      conditions.push(
        "is_read = 0"
      );
    }

    if (notificationType) {
      conditions.push(
        "notification_type = ?"
      );

      values.push(
        notificationType
      );
    }

    if (severity) {
      conditions.push(
        "severity = ?"
      );

      values.push(
        severity
      );
    }

    const [rows] =
      await connection.execute(
        `
          SELECT
            COUNT(*) AS total

          FROM notifications

          WHERE ${conditions.join(
            "\n AND "
          )}
        `,
        values
      );

    return Number(
      rows[0]?.total || 0
    );
  };

export const countUnreadNotifications =
  async (
    connection,
    recipientUserId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            COUNT(*) AS unreadCount

          FROM notifications

          WHERE recipient_user_id = ?
            AND is_read = 0
            AND deleted_at IS NULL
        `,
        [
          recipientUserId,
        ]
      );

    return Number(
      rows[0]?.unreadCount || 0
    );
  };

export const markNotificationAsRead =
  async (
    connection,
    {
      notificationId,
      recipientUserId,
      expectedVersion,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE notifications

          SET
            is_read = 1,

            read_at = COALESCE(
              read_at,
              UTC_TIMESTAMP(3)
            ),

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND recipient_user_id = ?
            AND version = ?
            AND deleted_at IS NULL
        `,
        [
          notificationId,
          recipientUserId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

export const markAllNotificationsAsRead =
  async (
    connection,
    recipientUserId
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE notifications

          SET
            is_read = 1,

            read_at =
              UTC_TIMESTAMP(3),

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE recipient_user_id = ?
            AND is_read = 0
            AND deleted_at IS NULL
        `,
        [
          recipientUserId,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

export const softDeleteNotification =
  async (
    connection,
    {
      notificationId,
      recipientUserId,
      expectedVersion,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE notifications

          SET
            deleted_at =
              UTC_TIMESTAMP(3),

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND recipient_user_id = ?
            AND version = ?
            AND deleted_at IS NULL
        `,
        [
          notificationId,
          recipientUserId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

export const findActiveAdminUsers =
  async (connection) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            users.id,

            users.full_name
              AS fullName,

            users.email,

            roles.code
              AS roleCode

          FROM users

          INNER JOIN roles
            ON roles.id =
              users.role_id

          WHERE users.status = 'ACTIVE'
            AND roles.code = 'ADMIN'

          ORDER BY
            users.id ASC
        `
      );

    return rows;
  };