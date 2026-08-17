import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

import {
  countNotifications,
  countUnreadNotifications,
  createNotification,
  findActiveAdminUsers,
  findNotificationById,
  findNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  softDeleteNotification,
} from "../repositories/notificationRepository.js";

const NOTIFICATION_TYPES =
  new Set([
    "INCIDENT_CREATED",
    "INCIDENT_UPDATED",
    "INCIDENT_RESOLVED",
    "ALERT_OPENED",
    "ALERT_RESOLVED",
    "SERVER_OFFLINE",
    "SERVER_RECOVERED",
    "SYSTEM",
  ]);

const SOURCE_TYPES =
  new Set([
    "INCIDENT",
    "ALERT_RULE",
    "SERVER",
    "SYSTEM",
  ]);

const SEVERITIES =
  new Set([
    "INFO",
    "WARNING",
    "HIGH",
    "CRITICAL",
  ]);

const validatePositiveInteger = (
  value,
  fieldName
) => {
  const parsed = Number(value);

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

const validateVersion = (value) =>
  validatePositiveInteger(
    value,
    "Version"
  );

const normalizePage = (value) => {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return 1;
  }

  return parsed;
};

const normalizeLimit = (value) => {
  const parsed = Number(value);

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
  value,
  fallback = false
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  if (
    value === true ||
    value === "true" ||
    value === "1" ||
    value === 1
  ) {
    return true;
  }

  if (
    value === false ||
    value === "false" ||
    value === "0" ||
    value === 0
  ) {
    return false;
  }

  return fallback;
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
      `Invalid ${fieldName}.`
    );
  }

  return normalized;
};

const normalizeMetadata = (
  metadata
) => {
  if (
    metadata === null ||
    metadata === undefined
  ) {
    return null;
  }

  if (
    typeof metadata === "object"
  ) {
    return metadata;
  }

  if (
    typeof metadata === "string"
  ) {
    try {
      return JSON.parse(metadata);
    } catch {
      return metadata;
    }
  }

  return metadata;
};

const normalizeNotification = (
  notification
) => {
  if (!notification) {
    return null;
  }

  return {
    ...notification,

    recipientUserId:
      Number(
        notification
          .recipientUserId
      ),

    sourceId:
      notification.sourceId ===
      null
        ? null
        : Number(
            notification.sourceId
          ),

    serverId:
      notification.serverId ===
      null
        ? null
        : Number(
            notification.serverId
          ),

    incidentId:
      notification.incidentId ===
      null
        ? null
        : Number(
            notification.incidentId
          ),

    alertRuleId:
      notification.alertRuleId ===
      null
        ? null
        : Number(
            notification.alertRuleId
          ),

    isRead:
      Boolean(
        notification.isRead
      ),

    version:
      Number(
        notification.version
      ),

    metadata:
      normalizeMetadata(
        notification.metadata
      ),
  };
};

export const createAdminNotifications =
  async (
    connection,
    {
      dedupKey,
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
    if (!connection) {
      throw new AppError(
        500,
        "Database connection is required for notification creation."
      );
    }

    const normalizedDedupKey =
      String(
        dedupKey || ""
      ).trim();

    if (
      !normalizedDedupKey ||
      normalizedDedupKey.length >
        190
    ) {
      throw new AppError(
        500,
        "Notification dedup key is invalid."
      );
    }

    const normalizedType =
      normalizeEnum(
        notificationType,
        NOTIFICATION_TYPES,
        "notification type"
      );

    const normalizedSourceType =
      normalizeEnum(
        sourceType,
        SOURCE_TYPES,
        "source type"
      );

    const normalizedSeverity =
      normalizeEnum(
        severity,
        SEVERITIES,
        "notification severity"
      );

    const normalizedTitle =
      String(
        title || ""
      ).trim();

    if (
      !normalizedTitle ||
      normalizedTitle.length >
        180
    ) {
      throw new AppError(
        500,
        "Notification title is invalid."
      );
    }

    const adminUsers =
      await findActiveAdminUsers(
        connection
      );

    const results = [];

    for (
      const admin of adminUsers
    ) {
      const result =
        await createNotification(
          connection,
          {
            dedupKey:
              normalizedDedupKey,

            recipientUserId:
              Number(admin.id),

            notificationType:
              normalizedType,

            sourceType:
              normalizedSourceType,

            sourceId,

            serverId,

            incidentId,

            alertRuleId,

            severity:
              normalizedSeverity,

            title:
              normalizedTitle,

            message:
              message === null ||
              message === undefined
                ? null
                : String(message),

            metadata,
          }
        );

      results.push({
        recipientUserId:
          Number(admin.id),

        recipientName:
          admin.fullName,

        notificationId:
          result.notificationId,

        created:
          result.created,
      });
    }

    return {
      recipientCount:
        adminUsers.length,

      createdCount:
        results.filter(
          (item) =>
            item.created
        ).length,

      duplicateCount:
        results.filter(
          (item) =>
            !item.created
        ).length,

      notifications:
        results,
    };
  };

export const getMyNotifications =
  async (
    recipientUserIdValue,
    query = {}
  ) => {
    const recipientUserId =
      validatePositiveInteger(
        recipientUserIdValue,
        "Recipient user ID"
      );

    const page =
      normalizePage(
        query.page
      );

    const limit =
      normalizeLimit(
        query.limit
      );

    const offset =
      (page - 1) * limit;

    const unreadOnly =
      normalizeBoolean(
        query.unreadOnly,
        false
      );

    const notificationType =
      normalizeEnum(
        query.notificationType,
        NOTIFICATION_TYPES,
        "notification type"
      );

    const severity =
      normalizeEnum(
        query.severity,
        SEVERITIES,
        "notification severity"
      );

    const connection =
      await pool.getConnection();

    try {
      const [
        notifications,
        total,
        unreadCount,
      ] = await Promise.all([
        findNotifications(
          connection,
          {
            recipientUserId,
            unreadOnly,
            notificationType,
            severity,
            limit,
            offset,
          }
        ),

        countNotifications(
          connection,
          {
            recipientUserId,
            unreadOnly,
            notificationType,
            severity,
          }
        ),

        countUnreadNotifications(
          connection,
          recipientUserId
        ),
      ]);

      return {
        notifications:
          notifications.map(
            normalizeNotification
          ),

        unreadCount,

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
          unreadOnly,
          notificationType,
          severity,
        },
      };
    } finally {
      connection.release();
    }
  };

export const getMyNotificationById =
  async (
    recipientUserIdValue,
    notificationIdValue
  ) => {
    const recipientUserId =
      validatePositiveInteger(
        recipientUserIdValue,
        "Recipient user ID"
      );

    const notificationId =
      validatePositiveInteger(
        notificationIdValue,
        "Notification ID"
      );

    const connection =
      await pool.getConnection();

    try {
      const notification =
        await findNotificationById(
          connection,
          {
            notificationId,
            recipientUserId,
          }
        );

      if (!notification) {
        throw new AppError(
          404,
          "Notification not found."
        );
      }

      return normalizeNotification(
        notification
      );
    } finally {
      connection.release();
    }
  };

export const getMyUnreadCount =
  async (
    recipientUserIdValue
  ) => {
    const recipientUserId =
      validatePositiveInteger(
        recipientUserIdValue,
        "Recipient user ID"
      );

    const connection =
      await pool.getConnection();

    try {
      const unreadCount =
        await countUnreadNotifications(
          connection,
          recipientUserId
        );

      return {
        unreadCount,
      };
    } finally {
      connection.release();
    }
  };

export const readMyNotification =
  async (
    recipientUserIdValue,
    notificationIdValue,
    versionValue
  ) => {
    const recipientUserId =
      validatePositiveInteger(
        recipientUserIdValue,
        "Recipient user ID"
      );

    const notificationId =
      validatePositiveInteger(
        notificationIdValue,
        "Notification ID"
      );

    const expectedVersion =
      validateVersion(
        versionValue
      );

    const connection =
      await pool.getConnection();

    try {
      const affectedRows =
        await markNotificationAsRead(
          connection,
          {
            notificationId,
            recipientUserId,
            expectedVersion,
          }
        );

      if (affectedRows !== 1) {
        const current =
          await findNotificationById(
            connection,
            {
              notificationId,
              recipientUserId,
            }
          );

        if (!current) {
          throw new AppError(
            404,
            "Notification not found."
          );
        }

        throw new AppError(
          409,
          `Notification was modified by another request. Current version is ${current.version}.`
        );
      }

      const notification =
        await findNotificationById(
          connection,
          {
            notificationId,
            recipientUserId,
          }
        );

      return normalizeNotification(
        notification
      );
    } finally {
      connection.release();
    }
  };

export const readAllMyNotifications =
  async (
    recipientUserIdValue
  ) => {
    const recipientUserId =
      validatePositiveInteger(
        recipientUserIdValue,
        "Recipient user ID"
      );

    const connection =
      await pool.getConnection();

    try {
      const updatedCount =
        await markAllNotificationsAsRead(
          connection,
          recipientUserId
        );

      return {
        updatedCount,
        unreadCount: 0,
      };
    } finally {
      connection.release();
    }
  };

export const deleteMyNotification =
  async (
    recipientUserIdValue,
    notificationIdValue,
    versionValue
  ) => {
    const recipientUserId =
      validatePositiveInteger(
        recipientUserIdValue,
        "Recipient user ID"
      );

    const notificationId =
      validatePositiveInteger(
        notificationIdValue,
        "Notification ID"
      );

    const expectedVersion =
      validateVersion(
        versionValue
      );

    const connection =
      await pool.getConnection();

    try {
      const affectedRows =
        await softDeleteNotification(
          connection,
          {
            notificationId,
            recipientUserId,
            expectedVersion,
          }
        );

      if (affectedRows !== 1) {
        const current =
          await findNotificationById(
            connection,
            {
              notificationId,
              recipientUserId,
            }
          );

        if (!current) {
          throw new AppError(
            404,
            "Notification not found."
          );
        }

        throw new AppError(
          409,
          `Notification was modified by another request. Current version is ${current.version}.`
        );
      }

      return {
        notificationId,
        deletedVersion:
          expectedVersion + 1,
      };
    } finally {
      connection.release();
    }
  };