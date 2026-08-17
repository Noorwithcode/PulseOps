

import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

import {
  countAlertRules,
  countAlertRuleStates,
  findActiveServerById,
  findAlertRuleByCode,
  findAlertRuleById,
  findAlertRuleByIdForUpdate,
  findAlertRules,
  findAlertRuleStates,
  hasActiveAlertStates,
  insertAlertRule,
  softDeleteAlertRule,
  updateAlertRule,
  updateAlertRuleStatus,
} from "../repositories/alertRuleManagementRepository.js";

const SCOPE_TYPES =
  new Set([
    "GLOBAL",
    "SERVER",
  ]);

const METRIC_TYPES =
  new Set([
    "CPU_USAGE_PERCENT",
    "MEMORY_USAGE_PERCENT",
    "DISK_USAGE_PERCENT",
    "RESPONSE_TIME_MS",
  ]);

const OPERATORS =
  new Set([
    "GT",
    "GTE",
    "LT",
    "LTE",
  ]);

const SEVERITIES =
  new Set([
    "WARNING",
    "HIGH",
    "CRITICAL",
  ]);

const STATE_STATUSES =
  new Set([
    "NORMAL",
    "BREACHING",
    "ALERTING",
    "RECOVERING",
  ]);

const CREATE_FIELDS =
  new Set([
    "ruleCode",
    "name",
    "description",
    "scopeType",
    "serverId",
    "metricType",
    "comparisonOperator",
    "thresholdValue",
    "recoveryValue",
    "severity",
    "consecutiveBreachesRequired",
    "consecutiveRecoveriesRequired",
    "isEnabled",
  ]);

const UPDATE_FIELDS =
  new Set([
    "name",
    "description",
    "scopeType",
    "serverId",
    "metricType",
    "comparisonOperator",
    "thresholdValue",
    "recoveryValue",
    "severity",
    "consecutiveBreachesRequired",
    "consecutiveRecoveriesRequired",
    "version",
  ]);

const validateObject = (
  value,
  message
) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new AppError(
      400,
      message
    );
  }

  return value;
};

const rejectUnsupportedFields = (
  input,
  allowedFields
) => {
  const unsupported =
    Object.keys(input).filter(
      (field) =>
        !allowedFields.has(field)
    );

  if (unsupported.length > 0) {
    throw new AppError(
      400,
      `Unsupported field(s): ${unsupported.join(
        ", "
      )}.`
    );
  }
};

const requiredText = (
  value,
  field,
  maximumLength
) => {
  const text =
    String(value ?? "").trim();

  if (!text) {
    throw new AppError(
      400,
      `${field} is required.`
    );
  }

  if (
    text.length >
    maximumLength
  ) {
    throw new AppError(
      400,
      `${field} cannot exceed ${maximumLength} characters.`
    );
  }

  return text;
};

const optionalText = (
  value,
  field,
  maximumLength
) => {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  if (
    text.length >
    maximumLength
  ) {
    throw new AppError(
      400,
      `${field} cannot exceed ${maximumLength} characters.`
    );
  }

  return text;
};

const requiredEnum = (
  value,
  field,
  allowed
) => {
  const normalized =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if (
    !allowed.has(normalized)
  ) {
    throw new AppError(
      400,
      `${field} must be one of: ${[
        ...allowed,
      ].join(", ")}.`
    );
  }

  return normalized;
};

const requiredNumber = (
  value,
  field,
  minimum,
  maximum
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    throw new AppError(
      400,
      `${field} is required.`
    );
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < minimum ||
    number > maximum
  ) {
    throw new AppError(
      400,
      `${field} must be between ${minimum} and ${maximum}.`
    );
  }

  return number;
};

const requiredPositiveInteger = (
  value,
  field,
  maximum =
    Number.MAX_SAFE_INTEGER
) => {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > maximum
  ) {
    throw new AppError(
      400,
      `${field} must be a positive integer.`
    );
  }

  return number;
};

const optionalPositiveInteger = (
  value,
  field
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return requiredPositiveInteger(
    value,
    field
  );
};

const requiredBoolean = (
  value,
  field
) => {
  if (
    typeof value !== "boolean"
  ) {
    throw new AppError(
      400,
      `${field} must be true or false.`
    );
  }

  return value;
};

const optionalBooleanQuery = (
  value
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
      .toLowerCase();

  if (
    ["true", "1"].includes(
      normalized
    )
  ) {
    return true;
  }

  if (
    ["false", "0"].includes(
      normalized
    )
  ) {
    return false;
  }

  throw new AppError(
    400,
    "isEnabled must be true or false."
  );
};

const normalizeRuleCode = (
  value
) => {
  const ruleCode =
    requiredText(
      value,
      "ruleCode",
      80
    )
      .toUpperCase()
      .replace(/\s+/g, "-");

  if (
    !/^[A-Z0-9][A-Z0-9:_-]*$/
      .test(ruleCode)
  ) {
    throw new AppError(
      400,
      "ruleCode may contain uppercase letters, numbers, colon, underscore and hyphen only."
    );
  }

  return ruleCode;
};

const validateMetricRange = (
  metricType,
  value,
  field
) => {
  const maximum =
    metricType ===
      "RESPONSE_TIME_MS"
      ? 86400000
      : 100;

  return requiredNumber(
    value,
    field,
    0,
    maximum
  );
};

const validateRecoveryDirection = (
  {
    comparisonOperator,
    thresholdValue,
    recoveryValue,
  }
) => {
  if (
    ["GT", "GTE"].includes(
      comparisonOperator
    ) &&
    recoveryValue >=
      thresholdValue
  ) {
    throw new AppError(
      400,
      "For GT/GTE rules, recoveryValue must be lower than thresholdValue."
    );
  }

  if (
    ["LT", "LTE"].includes(
      comparisonOperator
    ) &&
    recoveryValue <=
      thresholdValue
  ) {
    throw new AppError(
      400,
      "For LT/LTE rules, recoveryValue must be greater than thresholdValue."
    );
  }
};

const validateActorUserId = (
  value
) =>
  requiredPositiveInteger(
    value,
    "actorUserId"
  );

const validateRuleId = (
  value
) =>
  requiredPositiveInteger(
    value,
    "Rule ID"
  );

const validateRuleInput =
  async (
    connection,
    input,
    {
      actorUserId,
      existingRule = null,
      create = false,
    }
  ) => {
    validateObject(
      input,
      "A valid JSON request body is required."
    );

    rejectUnsupportedFields(
      input,
      create
        ? CREATE_FIELDS
        : UPDATE_FIELDS
    );

    const base =
      existingRule || {};

    const ruleCode =
      create
        ? normalizeRuleCode(
            input.ruleCode
          )
        : base.ruleCode;

    const name =
      requiredText(
        input.name ??
          base.name,
        "name",
        150
      );

    const description =
      optionalText(
        input.description !==
          undefined
          ? input.description
          : base.description,
        "description",
        500
      );

    const scopeType =
      requiredEnum(
        input.scopeType ??
          base.scopeType,
        "scopeType",
        SCOPE_TYPES
      );

    let serverId = null;

    if (
      scopeType === "SERVER"
    ) {
      serverId =
        requiredPositiveInteger(
          input.serverId ??
            base.serverId,
          "serverId"
        );

      const server =
        await findActiveServerById(
          connection,
          serverId
        );

      if (!server) {
        throw new AppError(
          404,
          "Active server not found."
        );
      }
    } else if (
      input.serverId !==
        undefined &&
      input.serverId !== null
    ) {
      throw new AppError(
        400,
        "serverId must be null or omitted for GLOBAL rules."
      );
    }

    const metricType =
      requiredEnum(
        input.metricType ??
          base.metricType,
        "metricType",
        METRIC_TYPES
      );

    const comparisonOperator =
      requiredEnum(
        input.comparisonOperator ??
          base.comparisonOperator,
        "comparisonOperator",
        OPERATORS
      );

    const thresholdValue =
      validateMetricRange(
        metricType,
        input.thresholdValue ??
          base.thresholdValue,
        "thresholdValue"
      );

    const recoveryValue =
      validateMetricRange(
        metricType,
        input.recoveryValue ??
          base.recoveryValue,
        "recoveryValue"
      );

    validateRecoveryDirection({
      comparisonOperator,
      thresholdValue,
      recoveryValue,
    });

    const severity =
      requiredEnum(
        input.severity ??
          base.severity,
        "severity",
        SEVERITIES
      );

    const consecutiveBreachesRequired =
      requiredPositiveInteger(
        input
          .consecutiveBreachesRequired ??
          base
            .consecutiveBreachesRequired,
        "consecutiveBreachesRequired",
        1000
      );

    const consecutiveRecoveriesRequired =
      requiredPositiveInteger(
        input
          .consecutiveRecoveriesRequired ??
          base
            .consecutiveRecoveriesRequired,
        "consecutiveRecoveriesRequired",
        1000
      );

    const isEnabled =
      create
        ? (
            input.isEnabled ===
              undefined
              ? true
              : requiredBoolean(
                  input.isEnabled,
                  "isEnabled"
                )
          )
        : Boolean(
            base.isEnabled
          );

    return {
      ruleCode,
      name,
      description,

      scopeType,
      serverId,

      metricType,
      comparisonOperator,

      thresholdValue,
      recoveryValue,

      severity,

      consecutiveBreachesRequired,
      consecutiveRecoveriesRequired,

      isEnabled,
      actorUserId:
        validateActorUserId(
          actorUserId
        ),
    };
  };

export const createAlertRule =
  async ({
    input,
    actorUserId,
  }) => {
    const connection =
      await pool.getConnection();

    let transactionStarted =
      false;

    try {
      await connection
        .beginTransaction();

      transactionStarted = true;

      const data =
        await validateRuleInput(
          connection,
          input,
          {
            actorUserId,
            create: true,
          }
        );

      const duplicate =
        await findAlertRuleByCode(
          connection,
          data.ruleCode
        );

      if (duplicate) {
        throw new AppError(
          409,
          duplicate.deletedAt
            ? "A deleted rule already uses this ruleCode."
            : "An alert rule already uses this ruleCode."
        );
      }

      const ruleId =
        await insertAlertRule(
          connection,
          data
        );

      const rule =
        await findAlertRuleById(
          connection,
          ruleId
        );

      if (!rule) {
        throw new AppError(
          500,
          "Alert rule was created but could not be loaded."
        );
      }

      await connection.commit();
      transactionStarted = false;

      return rule;
    } catch (error) {
      if (transactionStarted) {
        await connection
          .rollback();
      }

      if (
        error?.code ===
        "ER_DUP_ENTRY"
      ) {
        throw new AppError(
          409,
          "An alert rule already uses this ruleCode."
        );
      }

      throw error;
    } finally {
      connection.release();
    }
  };

export const listAlertRules =
  async (
    query = {}
  ) => {
    const search =
      optionalText(
        query.search,
        "search",
        150
      );

    const scopeType =
      query.scopeType
        ? requiredEnum(
            query.scopeType,
            "scopeType",
            SCOPE_TYPES
          )
        : null;

    const serverId =
      optionalPositiveInteger(
        query.serverId,
        "serverId"
      );

    const metricType =
      query.metricType
        ? requiredEnum(
            query.metricType,
            "metricType",
            METRIC_TYPES
          )
        : null;

    const severity =
      query.severity
        ? requiredEnum(
            query.severity,
            "severity",
            SEVERITIES
          )
        : null;

    const isEnabled =
      optionalBooleanQuery(
        query.isEnabled
      );

    const page =
      Math.max(
        Number.parseInt(
          query.page,
          10
        ) || 1,
        1
      );

    const limit =
      Math.min(
        Math.max(
          Number.parseInt(
            query.limit,
            10
          ) || 10,
          1
        ),
        100
      );

    const offset =
      (page - 1) * limit;

    const connection =
      await pool.getConnection();

    try {
      const filters = {
        search,
        scopeType,
        serverId,
        metricType,
        severity,
        isEnabled,
      };

      const [
        rules,
        total,
      ] =
        await Promise.all([
          findAlertRules(
            connection,
            {
              ...filters,
              limit,
              offset,
            }
          ),

          countAlertRules(
            connection,
            filters
          ),
        ]);

      return {
        rules,

        pagination: {
          page,
          limit,
          total,

          totalPages:
            Math.max(
              Math.ceil(
                total / limit
              ),
              1
            ),
        },
      };
    } finally {
      connection.release();
    }
  };

export const getAlertRuleById =
  async (
    ruleIdValue
  ) => {
    const ruleId =
      validateRuleId(
        ruleIdValue
      );

    const connection =
      await pool.getConnection();

    try {
      const rule =
        await findAlertRuleById(
          connection,
          ruleId
        );

      if (!rule) {
        throw new AppError(
          404,
          "Alert rule not found."
        );
      }

      return rule;
    } finally {
      connection.release();
    }
  };

export const modifyAlertRule =
  async ({
    ruleIdValue,
    input,
    actorUserId,
  }) => {
    validateObject(
      input,
      "A valid JSON request body is required."
    );

    const ruleId =
      validateRuleId(
        ruleIdValue
      );

    const expectedVersion =
      requiredPositiveInteger(
        input.version,
        "version"
      );

    const connection =
      await pool.getConnection();

    let transactionStarted =
      false;

    try {
      await connection
        .beginTransaction();

      transactionStarted = true;

      const existingRule =
        await findAlertRuleByIdForUpdate(
          connection,
          ruleId
        );

      if (!existingRule) {
        throw new AppError(
          404,
          "Alert rule not found."
        );
      }

      if (
        Number(
          existingRule.version
        ) !== expectedVersion
      ) {
        throw new AppError(
          409,
          `Alert rule was modified by another request. Current version is ${existingRule.version}.`
        );
      }

      const active =
        await hasActiveAlertStates(
          connection,
          ruleId
        );

      const data =
        await validateRuleInput(
          connection,
          input,
          {
            actorUserId,
            existingRule,
            create: false,
          }
        );

      const behaviorChanged =
        data.scopeType !==
          existingRule.scopeType ||
        Number(
          data.serverId || 0
        ) !==
          Number(
            existingRule.serverId ||
            0
          ) ||
        data.metricType !==
          existingRule.metricType ||
        data.comparisonOperator !==
          existingRule
            .comparisonOperator ||
        Number(
          data.thresholdValue
        ) !==
          Number(
            existingRule
              .thresholdValue
          ) ||
        Number(
          data.recoveryValue
        ) !==
          Number(
            existingRule
              .recoveryValue
          ) ||
        Number(
          data
            .consecutiveBreachesRequired
        ) !==
          Number(
            existingRule
              .consecutiveBreachesRequired
          ) ||
        Number(
          data
            .consecutiveRecoveriesRequired
        ) !==
          Number(
            existingRule
              .consecutiveRecoveriesRequired
          );

      if (
        active &&
        behaviorChanged
      ) {
        throw new AppError(
          409,
          "Threshold behavior cannot be changed while this rule has an active alert."
        );
      }

      const affectedRows =
        await updateAlertRule(
          connection,
          {
            ...data,

            ruleId,
            expectedVersion,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Alert rule changed while it was being updated."
        );
      }

      const updatedRule =
        await findAlertRuleById(
          connection,
          ruleId
        );

      await connection.commit();
      transactionStarted = false;

      return updatedRule;
    } catch (error) {
      if (transactionStarted) {
        await connection
          .rollback();
      }

      throw error;
    } finally {
      connection.release();
    }
  };

export const changeAlertRuleStatus =
  async ({
    ruleIdValue,
    input,
    actorUserId,
  }) => {
    validateObject(
      input,
      "A valid JSON request body is required."
    );

    const allowedFields =
      new Set([
        "isEnabled",
        "version",
      ]);

    rejectUnsupportedFields(
      input,
      allowedFields
    );

    const ruleId =
      validateRuleId(
        ruleIdValue
      );

    const expectedVersion =
      requiredPositiveInteger(
        input.version,
        "version"
      );

    const isEnabled =
      requiredBoolean(
        input.isEnabled,
        "isEnabled"
      );

    const validatedActorUserId =
      validateActorUserId(
        actorUserId
      );

    const connection =
      await pool.getConnection();

    let transactionStarted =
      false;

    try {
      await connection
        .beginTransaction();

      transactionStarted = true;

      const existingRule =
        await findAlertRuleByIdForUpdate(
          connection,
          ruleId
        );

      if (!existingRule) {
        throw new AppError(
          404,
          "Alert rule not found."
        );
      }

      if (
        Number(
          existingRule.version
        ) !== expectedVersion
      ) {
        throw new AppError(
          409,
          `Alert rule was modified by another request. Current version is ${existingRule.version}.`
        );
      }

      if (
        Boolean(
          existingRule.isEnabled
        ) === isEnabled
      ) {
        throw new AppError(
          409,
          `Alert rule is already ${isEnabled ? "enabled" : "disabled"}.`
        );
      }

      if (!isEnabled) {
        const active =
          await hasActiveAlertStates(
            connection,
            ruleId
          );

        if (active) {
          throw new AppError(
            409,
            "An alert rule with an active alert cannot be disabled."
          );
        }
      }

      const affectedRows =
        await updateAlertRuleStatus(
          connection,
          {
            ruleId,
            expectedVersion,
            isEnabled,

            actorUserId:
              validatedActorUserId,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Alert rule changed while its status was being updated."
        );
      }

      const updatedRule =
        await findAlertRuleById(
          connection,
          ruleId
        );

      await connection.commit();
      transactionStarted = false;

      return updatedRule;
    } catch (error) {
      if (transactionStarted) {
        await connection
          .rollback();
      }

      throw error;
    } finally {
      connection.release();
    }
  };

export const deleteAlertRule =
  async ({
    ruleIdValue,
    versionValue,
    actorUserId,
  }) => {
    const ruleId =
      validateRuleId(
        ruleIdValue
      );

    const expectedVersion =
      requiredPositiveInteger(
        versionValue,
        "version"
      );

    const validatedActorUserId =
      validateActorUserId(
        actorUserId
      );

    const connection =
      await pool.getConnection();

    let transactionStarted =
      false;

    try {
      await connection
        .beginTransaction();

      transactionStarted = true;

      const existingRule =
        await findAlertRuleByIdForUpdate(
          connection,
          ruleId
        );

      if (!existingRule) {
        throw new AppError(
          404,
          "Alert rule not found."
        );
      }

      if (
        Number(
          existingRule.version
        ) !== expectedVersion
      ) {
        throw new AppError(
          409,
          `Alert rule was modified by another request. Current version is ${existingRule.version}.`
        );
      }

      const active =
        await hasActiveAlertStates(
          connection,
          ruleId
        );

      if (active) {
        throw new AppError(
          409,
          "An alert rule with an active alert cannot be deleted."
        );
      }

      const affectedRows =
        await softDeleteAlertRule(
          connection,
          {
            ruleId,
            expectedVersion,

            actorUserId:
              validatedActorUserId,
          }
        );

      if (
        affectedRows !== 1
      ) {
        throw new AppError(
          409,
          "Alert rule changed while it was being deleted."
        );
      }

      await connection.commit();
      transactionStarted = false;

      return {
        id: ruleId,
        deletedVersion:
          expectedVersion + 1,
      };
    } catch (error) {
      if (transactionStarted) {
        await connection
          .rollback();
      }

      throw error;
    } finally {
      connection.release();
    }
  };

export const listAlertRuleStates =
  async ({
    ruleIdValue,
    query = {},
  }) => {
    const ruleId =
      validateRuleId(
        ruleIdValue
      );

    const status =
      query.status
        ? requiredEnum(
            query.status,
            "status",
            STATE_STATUSES
          )
        : null;

    const serverId =
      optionalPositiveInteger(
        query.serverId,
        "serverId"
      );

    const page =
      Math.max(
        Number.parseInt(
          query.page,
          10
        ) || 1,
        1
      );

    const limit =
      Math.min(
        Math.max(
          Number.parseInt(
            query.limit,
            10
          ) || 10,
          1
        ),
        100
      );

    const offset =
      (page - 1) * limit;

    const connection =
      await pool.getConnection();

    try {
      const rule =
        await findAlertRuleById(
          connection,
          ruleId
        );

      if (!rule) {
        throw new AppError(
          404,
          "Alert rule not found."
        );
      }

      const filters = {
        ruleId,
        status,
        serverId,
      };

      const [
        states,
        total,
      ] =
        await Promise.all([
          findAlertRuleStates(
            connection,
            {
              ...filters,
              limit,
              offset,
            }
          ),

          countAlertRuleStates(
            connection,
            filters
          ),
        ]);

      return {
        rule,
        states,

        pagination: {
          page,
          limit,
          total,

          totalPages:
            Math.max(
              Math.ceil(
                total / limit
              ),
              1
            ),
        },
      };
    } finally {
      connection.release();
    }
  };
