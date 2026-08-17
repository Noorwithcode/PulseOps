import "dotenv/config";

import pool from "../config/db.js";

import {
  changeAlertRuleStatus,
  createAlertRule,
  deleteAlertRule,
  getAlertRuleById,
  listAlertRules,
  listAlertRuleStates,
  modifyAlertRule,
} from "../services/alertRuleManagementService.js";

const ACTOR_USER_ID =
  Number(
    process.env
      .TEST_ADMIN_USER_ID ||
    1
  );

const uniqueCode =
  `TEST-API-RESPONSE-${Date.now()}`;

const main = async () => {
  if (
    !Number.isSafeInteger(
      ACTOR_USER_ID
    ) ||
    ACTOR_USER_ID < 1
  ) {
    throw new Error(
      "TEST_ADMIN_USER_ID must be a positive integer."
    );
  }

  const created =
    await createAlertRule({
      actorUserId:
        ACTOR_USER_ID,

      input: {
        ruleCode:
          uniqueCode,

        name:
          "Management API test response time",

        description:
          "Temporary rule created by automated management test.",

        scopeType:
          "GLOBAL",

        metricType:
          "RESPONSE_TIME_MS",

        comparisonOperator:
          "GTE",

        thresholdValue:
          9000,

        recoveryValue:
          7000,

        severity:
          "WARNING",

        consecutiveBreachesRequired:
          3,

        consecutiveRecoveriesRequired:
          2,

        isEnabled:
          true,
      },
    });

  console.log(
    "Created:",
    created.ruleCode,
    `version=${created.version}`
  );

  const loaded =
    await getAlertRuleById(
      created.id
    );

  console.log(
    "Loaded:",
    loaded.ruleCode
  );

  const updated =
    await modifyAlertRule({
      ruleIdValue:
        created.id,

      actorUserId:
        ACTOR_USER_ID,

      input: {
        name:
          "Management API test response time updated",

        thresholdValue:
          10000,

        recoveryValue:
          7500,

        version:
          created.version,
      },
    });

  console.log(
    "Updated:",
    `version=${updated.version}`
  );

  const disabled =
    await changeAlertRuleStatus({
      ruleIdValue:
        created.id,

      actorUserId:
        ACTOR_USER_ID,

      input: {
        isEnabled:
          false,

        version:
          updated.version,
      },
    });

  console.log(
    "Disabled:",
    disabled.isEnabled,
    `version=${disabled.version}`
  );

  const listResult =
    await listAlertRules({
      search:
        uniqueCode,

      page:
        1,

      limit:
        10,
    });

  if (
    listResult.rules.length !==
    1
  ) {
    throw new Error(
      "Created rule was not found in list result."
    );
  }

  console.log(
    "List:",
    listResult
      .rules[0]
      .ruleCode
  );

  const statesResult =
    await listAlertRuleStates({
      ruleIdValue:
        created.id,

      query: {
        page:
          1,

        limit:
          10,
      },
    });

  console.log(
    "States:",
    statesResult
      .pagination
      .total
  );

  const deleted =
    await deleteAlertRule({
      ruleIdValue:
        created.id,

      versionValue:
        disabled.version,

      actorUserId:
        ACTOR_USER_ID,
    });

  console.log(
    "Deleted:",
    `version=${deleted.deletedVersion}`
  );

  let notFoundConfirmed =
    false;

  try {
    await getAlertRuleById(
      created.id
    );
  } catch (error) {
    notFoundConfirmed =
      error.statusCode === 404;
  }

  if (!notFoundConfirmed) {
    throw new Error(
      "Deleted alert rule is still visible."
    );
  }

  console.log(
    "Alert-rule management flow passed: CREATED -> LOADED -> UPDATED -> DISABLED -> LISTED -> STATES_LOADED -> DELETED"
  );
};

main()
  .catch((error) => {
    console.error(
      "Alert-rule management test failed:",
      error.message
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

