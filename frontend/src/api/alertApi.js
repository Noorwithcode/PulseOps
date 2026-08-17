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

export const alertApi = {
  list: (
    token,
    {
      page = 1,
      limit = 20,
      search,
      status,
      severity,
      metricType,
      serverId,
      ruleId,
      isEnabled,
      activeOnly,
    } = {}
  ) =>
    request(
      `/alerts${buildQueryString({
        page,
        limit,
        search,
        status,
        severity,
        metricType,
        serverId,
        ruleId,
        isEnabled,
        activeOnly,
      })}`,
      {
        token,
      }
    ),

  summary: (
    token
  ) =>
    request(
      "/alerts/summary",
      {
        token,
      }
    ),

  getById: (
    token,
    alertStateId
  ) =>
    request(
      `/alerts/${alertStateId}`,
      {
        token,
      }
    ),

  evaluations: (
    token,
    alertStateId,
    {
      page = 1,
      limit = 20,
    } = {}
  ) =>
    request(
      `/alerts/${alertStateId}/evaluations${buildQueryString({
        page,
        limit,
      })}`,
      {
        token,
      }
    ),
};

export const ALERT_STATE_STATUSES = [
  "NORMAL",
  "BREACHING",
  "ALERTING",
  "RECOVERING",
];

export const ALERT_SEVERITIES = [
  "WARNING",
  "HIGH",
  "CRITICAL",
];

export const ALERT_METRIC_TYPES = [
  "CPU_USAGE_PERCENT",
  "MEMORY_USAGE_PERCENT",
  "DISK_USAGE_PERCENT",
  "RESPONSE_TIME_MS",
];

export const ALERT_EVALUATION_RESULTS = [
  "NORMAL",
  "BREACH",
  "RECOVERY",
  "IGNORED",
];