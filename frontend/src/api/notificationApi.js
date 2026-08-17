import {
  request,
} from "./apiClient.js";

const buildQueryString = (
  params = {}
) => {
  const searchParams =
    new URLSearchParams();

  Object.entries(params)
    .forEach(
      ([key, value]) => {
        if (
          value === undefined ||
          value === null ||
          value === ""
        ) {
          return;
        }

        searchParams.set(
          key,
          String(value)
        );
      }
    );

  const query =
    searchParams.toString();

  return query
    ? `?${query}`
    : "";
};

export const notificationApi = {
  list: (
    token,
    {
      page = 1,
      limit = 20,
      unreadOnly,
      notificationType,
      severity,
    } = {}
  ) =>
    request(
      `/notifications${buildQueryString({
        page,
        limit,
        unreadOnly,
        notificationType,
        severity,
      })}`,
      {
        token,
      }
    ),

  unreadCount: (
    token
  ) =>
    request(
      "/notifications/unread-count",
      {
        token,
      }
    ),

  getById: (
    token,
    notificationId
  ) =>
    request(
      `/notifications/${notificationId}`,
      {
        token,
      }
    ),

  markAsRead: (
    token,
    notificationId,
    version
  ) =>
    request(
      `/notifications/${notificationId}/read`,
      {
        method: "PATCH",
        token,
        body: {
          version,
        },
      }
    ),

  markAllAsRead: (
    token
  ) =>
    request(
      "/notifications/read-all",
      {
        method: "PATCH",
        token,
      }
    ),

  remove: (
    token,
    notificationId,
    version
  ) =>
    request(
      `/notifications/${notificationId}`,
      {
        method: "DELETE",
        token,
        body: {
          version,
        },
      }
    ),
};

export const NOTIFICATION_TYPES = [
  "INCIDENT_CREATED",
  "INCIDENT_UPDATED",
  "INCIDENT_RESOLVED",
  "ALERT_OPENED",
  "ALERT_RESOLVED",
  "SERVER_OFFLINE",
  "SERVER_RECOVERED",
  "SYSTEM",
];

export const NOTIFICATION_SEVERITIES = [
  "INFO",
  "WARNING",
  "HIGH",
  "CRITICAL",
];