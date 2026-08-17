import { request } from "./apiClient.js";

const buildQueryString = (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

export const alertRuleApi = {
  list: (
    token,
    {
      page = 1,
      limit = 10,
      search,
      scopeType,
      serverId,
      metricType,
      severity,
      isEnabled,
    } = {}
  ) =>
    request(
      `/alert-rules${buildQueryString({
        page,
        limit,
        search,
        scopeType,
        serverId,
        metricType,
        severity,
        isEnabled,
      })}`,
      { token }
    ),

  getById: (token, ruleId) =>
    request(`/alert-rules/${ruleId}`, { token }),

  create: (token, input) =>
    request("/alert-rules", {
      method: "POST",
      token,
      body: {
        ruleCode: input.ruleCode,
        name: input.name,
        description: input.description ?? null,
        scopeType: input.scopeType,
        serverId:
          input.scopeType === "SERVER"
            ? Number(input.serverId)
            : null,
        metricType: input.metricType,
        comparisonOperator: input.comparisonOperator,
        thresholdValue: Number(input.thresholdValue),
        recoveryValue: Number(input.recoveryValue),
        severity: input.severity,
        consecutiveBreachesRequired: Number(
          input.consecutiveBreachesRequired
        ),
        consecutiveRecoveriesRequired: Number(
          input.consecutiveRecoveriesRequired
        ),
        isEnabled: input.isEnabled ?? true,
      },
    }),

  update: (token, ruleId, input) =>
    request(`/alert-rules/${ruleId}`, {
      method: "PATCH",
      token,
      body: {
        name: input.name,
        description: input.description ?? null,
        scopeType: input.scopeType,
        serverId:
          input.scopeType === "SERVER"
            ? Number(input.serverId)
            : null,
        metricType: input.metricType,
        comparisonOperator: input.comparisonOperator,
        thresholdValue: Number(input.thresholdValue),
        recoveryValue: Number(input.recoveryValue),
        severity: input.severity,
        consecutiveBreachesRequired: Number(
          input.consecutiveBreachesRequired
        ),
        consecutiveRecoveriesRequired: Number(
          input.consecutiveRecoveriesRequired
        ),
        version: Number(input.version),
      },
    }),

  updateStatus: (token, ruleId, { isEnabled, version }) =>
    request(`/alert-rules/${ruleId}/status`, {
      method: "PATCH",
      token,
      body: {
        isEnabled: Boolean(isEnabled),
        version: Number(version),
      },
    }),

  remove: (token, ruleId, version) =>
    request(`/alert-rules/${ruleId}`, {
      method: "DELETE",
      token,
      body: {
        version: Number(version),
      },
    }),

  listStates: (
    token,
    ruleId,
    {
      page = 1,
      limit = 10,
      status,
      serverId,
    } = {}
  ) =>
    request(
      `/alert-rules/${ruleId}/states${buildQueryString({
        page,
        limit,
        status,
        serverId,
      })}`,
      { token }
    ),
};

export const ALERT_RULE_SCOPE_TYPES = ["GLOBAL", "SERVER"];

export const ALERT_RULE_METRIC_TYPES = [
  "CPU_USAGE_PERCENT",
  "MEMORY_USAGE_PERCENT",
  "DISK_USAGE_PERCENT",
  "RESPONSE_TIME_MS",
];

export const ALERT_RULE_OPERATORS = ["GT", "GTE", "LT", "LTE"];

export const ALERT_RULE_SEVERITIES = [
  "WARNING",
  "HIGH",
  "CRITICAL",
];

export const ALERT_RULE_STATE_STATUSES = [
  "NORMAL",
  "BREACHING",
  "ALERTING",
  "RECOVERING",
];