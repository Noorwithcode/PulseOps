import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

import {
  countAlertEvaluations,
  countAlertStates,
  findAlertEvaluations,
  findAlertStateById,
  findAlertStates,
} from "../repositories/alertManagementRepository.js";

const ALERT_STATE_STATUSES = new Set([
  "NORMAL",
  "BREACHING",
  "ALERTING",
  "RECOVERING",
]);

const ALERT_SEVERITIES = new Set([
  "WARNING",
  "HIGH",
  "CRITICAL",
]);

const ALERT_METRIC_TYPES = new Set([
  "CPU_USAGE_PERCENT",
  "MEMORY_USAGE_PERCENT",
  "DISK_USAGE_PERCENT",
  "RESPONSE_TIME_MS",
]);

const optionalText = (value, field, maximumLength) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const text = String(value).trim();

  if (!text) return null;

  if (text.length > maximumLength) {
    throw new AppError(
      400,
      `${field} cannot exceed ${maximumLength} characters.`
    );
  }

  return text;
};

const optionalEnum = (value, field, allowed) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();

  if (!allowed.has(normalized)) {
    throw new AppError(
      400,
      `${field} must be one of: ${[...allowed].join(", ")}.`
    );
  }

  return normalized;
};

const positiveInteger = (value, field) => {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 1) {
    throw new AppError(
      400,
      `${field} must be a positive integer.`
    );
  }

  return number;
};

const optionalPositiveInteger = (value, field) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return positiveInteger(value, field);
};

const optionalBoolean = (value, field) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1"].includes(normalized)) return true;
  if (["false", "0"].includes(normalized)) return false;

  throw new AppError(
    400,
    `${field} must be true or false.`
  );
};

const parsePagination = (query = {}, defaultLimit = 20) => {
  const page = Math.max(
    Number.parseInt(query.page, 10) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      Number.parseInt(query.limit, 10) || defaultLimit,
      1
    ),
    100
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

const validateAlertStateId = (value) =>
  positiveInteger(value, "Alert state ID");

const normalizeAlertListFilters = (query = {}) => ({
  search: optionalText(
    query.search,
    "search",
    150
  ),

  status: optionalEnum(
    query.status,
    "status",
    ALERT_STATE_STATUSES
  ),

  severity: optionalEnum(
    query.severity,
    "severity",
    ALERT_SEVERITIES
  ),

  metricType: optionalEnum(
    query.metricType,
    "metricType",
    ALERT_METRIC_TYPES
  ),

  serverId: optionalPositiveInteger(
    query.serverId,
    "serverId"
  ),

  ruleId: optionalPositiveInteger(
    query.ruleId,
    "ruleId"
  ),

  isEnabled: optionalBoolean(
    query.isEnabled,
    "isEnabled"
  ),

  activeOnly:
    optionalBoolean(
      query.activeOnly,
      "activeOnly"
    ) ?? false,
});

export const listAlerts = async (query = {}) => {
  const filters = normalizeAlertListFilters(query);
  const { page, limit, offset } = parsePagination(query, 20);

  const connection = await pool.getConnection();

  try {
    const [alerts, total] = await Promise.all([
      findAlertStates(connection, {
        ...filters,
        limit,
        offset,
      }),
      countAlertStates(connection, filters),
    ]);

    return {
      alerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(
          Math.ceil(total / limit),
          1
        ),
      },
      filters,
    };
  } finally {
    connection.release();
  }
};

export const getAlertById = async (
  alertStateIdValue
) => {
  const alertStateId =
    validateAlertStateId(alertStateIdValue);

  const connection = await pool.getConnection();

  try {
    const alert =
      await findAlertStateById(
        connection,
        alertStateId
      );

    if (!alert) {
      throw new AppError(
        404,
        "Alert state not found."
      );
    }

    return alert;
  } finally {
    connection.release();
  }
};

export const listAlertEvaluations = async ({
  alertStateIdValue,
  query = {},
}) => {
  const alertStateId =
    validateAlertStateId(alertStateIdValue);

  const { page, limit, offset } =
    parsePagination(query, 20);

  const connection = await pool.getConnection();

  try {
    const alert =
      await findAlertStateById(
        connection,
        alertStateId
      );

    if (!alert) {
      throw new AppError(
        404,
        "Alert state not found."
      );
    }

    const evaluationFilters = {
      ruleId: positiveInteger(
        alert.ruleId,
        "ruleId"
      ),
      serverId: positiveInteger(
        alert.serverId,
        "serverId"
      ),
    };

    const [evaluations, total] =
      await Promise.all([
        findAlertEvaluations(
          connection,
          {
            ...evaluationFilters,
            limit,
            offset,
          }
        ),
        countAlertEvaluations(
          connection,
          evaluationFilters
        ),
      ]);

    return {
      alert,
      evaluations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(
          Math.ceil(total / limit),
          1
        ),
      },
    };
  } finally {
    connection.release();
  }
};

export const getAlertSummary = async () => {
  const connection = await pool.getConnection();

  try {
    const baseFilters = {
      search: null,
      severity: null,
      metricType: null,
      serverId: null,
      ruleId: null,
      isEnabled: null,
      activeOnly: false,
    };

    const [
      normalStates,
      breachingStates,
      alertingStates,
      recoveringStates,
      activeAlerts,
    ] = await Promise.all([
      countAlertStates(connection, {
        ...baseFilters,
        status: "NORMAL",
      }),
      countAlertStates(connection, {
        ...baseFilters,
        status: "BREACHING",
      }),
      countAlertStates(connection, {
        ...baseFilters,
        status: "ALERTING",
      }),
      countAlertStates(connection, {
        ...baseFilters,
        status: "RECOVERING",
      }),
      countAlertStates(connection, {
        ...baseFilters,
        status: null,
        activeOnly: true,
      }),
    ]);

    return {
      totalStates:
        normalStates +
        breachingStates +
        alertingStates +
        recoveringStates,
      activeAlerts,
      normalStates,
      breachingStates,
      alertingStates,
      recoveringStates,
    };
  } finally {
    connection.release();
  }
};