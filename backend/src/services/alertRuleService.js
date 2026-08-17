import AppError from "../utils/AppError.js";

import {
  ensureAlertRuleState,
  findAlertEvaluationByKey,
  findAlertRuleStateForUpdate,
  findApplicableAlertRules,
  insertAlertRuleEvaluation,
  updateAlertRuleState,
} from "../repositories/alertRuleRepository.js";

import {
  processThresholdAlertIncident,
} from "./alertRuleIncidentService.js";
import {
  notifyAlertOpened,
  notifyAlertResolved,
} from "./notificationEventService.js";

const METRIC_FIELD_MAP = {
  CPU_USAGE_PERCENT:
    "cpuUsagePercent",

  MEMORY_USAGE_PERCENT:
    "memoryUsagePercent",

  DISK_USAGE_PERCENT:
    "diskUsagePercent",

  RESPONSE_TIME_MS:
    "responseTimeMs",
};

const ALERTING_STATES =
  new Set([
    "ALERTING",
    "RECOVERING",
  ]);

const toNumberOrNull = (
  value
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
};

const compareThreshold = (
  metricValue,
  operator,
  thresholdValue
) => {
  switch (operator) {
    case "GT":
      return (
        metricValue >
        thresholdValue
      );

    case "GTE":
      return (
        metricValue >=
        thresholdValue
      );

    case "LT":
      return (
        metricValue <
        thresholdValue
      );

    case "LTE":
      return (
        metricValue <=
        thresholdValue
      );

    default:
      throw new AppError(
        500,
        `Unsupported alert comparison operator: ${operator}.`
      );
  }
};

const isRecoveryValueReached = (
  metricValue,
  operator,
  recoveryValue
) => {
  switch (operator) {
    case "GT":
    case "GTE":
      return (
        metricValue <=
        recoveryValue
      );

    case "LT":
    case "LTE":
      return (
        metricValue >=
        recoveryValue
      );

    default:
      throw new AppError(
        500,
        `Unsupported alert comparison operator: ${operator}.`
      );
  }
};

const buildEvaluationKey = ({
  ruleId,
  serverId,
  healthCheckId,
}) =>
  [
    "RULE",
    ruleId,
    "SERVER",
    serverId,
    "CHECK",
    healthCheckId,
  ].join(":");

const buildActiveAlertKey = ({
  ruleId,
  serverId,
}) =>
  [
    "ACTIVE-RULE",
    ruleId,
    "SERVER",
    serverId,
  ].join(":");

const buildMessage = ({
  action,
  rule,
  metricValue,
  stateBefore,
  stateAfter,
}) => {
  const valueText =
    metricValue === null
      ? "not supplied"
      : String(metricValue);

  switch (action) {
    case "IGNORED_MISSING_METRIC":
      return (
        `${rule.name}: metric value was not supplied.`
      );

    case "BREACH_RECORDED":
      return (
        `${rule.name}: ${valueText} breached ` +
        `${rule.thresholdValue}. Waiting for additional consecutive breaches.`
      );

    case "BREACH_RESET":
      return (
        `${rule.name}: the pending breach sequence was reset.`
      );

    case "ALERT_OPENED":
      return (
        `${rule.name}: threshold alert opened at metric value ${valueText}.`
      );

    case "ALERT_STILL_ACTIVE":
      return (
        `${rule.name}: alert remains active at metric value ${valueText}.`
      );

    case "RECOVERY_RECORDED":
      return (
        `${rule.name}: recovery value reached. Waiting for additional consecutive recoveries.`
      );

    case "RECOVERY_INTERRUPTED":
      return (
        `${rule.name}: recovery sequence was interrupted at metric value ${valueText}.`
      );

    case "ALERT_RESOLVED":
      return (
        `${rule.name}: alert resolved after consecutive recovery checks.`
      );

    default:
      return (
        `${rule.name}: evaluated ${stateBefore} -> ${stateAfter} at metric value ${valueText}.`
      );
  }
};

const evaluateSingleRule =
  async (
    connection,
    {
      server,
      healthCheck,
      rule,
    }
  ) => {
    const metricField =
      METRIC_FIELD_MAP[
      rule.metricType
      ];

    if (!metricField) {
      throw new AppError(
        500,
        `Unsupported alert metric type: ${rule.metricType}.`
      );
    }

    await ensureAlertRuleState(
      connection,
      {
        ruleId: rule.id,
        serverId: server.id,
      }
    );

    const state =
      await findAlertRuleStateForUpdate(
        connection,
        {
          ruleId: rule.id,
          serverId: server.id,
        }
      );

    if (!state) {
      throw new AppError(
        500,
        `Alert state could not be loaded for rule ${rule.ruleCode}.`
      );
    }

    const evaluationKey =
      buildEvaluationKey({
        ruleId: rule.id,
        serverId: server.id,
        healthCheckId:
          healthCheck.id,
      });

    const existingEvaluation =
      await findAlertEvaluationByKey(
        connection,
        evaluationKey
      );

    if (existingEvaluation) {
      return {
        action:
          "ALREADY_EVALUATED",

        ruleId: rule.id,
        ruleCode:
          rule.ruleCode,

        metricType:
          rule.metricType,

        stateBefore:
          existingEvaluation
            .stateBefore,

        stateAfter:
          existingEvaluation
            .stateAfter,

        alertActive:
          ALERTING_STATES.has(
            existingEvaluation
              .stateAfter
          ),

        thresholdIncident: {
          action:
            "SKIPPED_ALREADY_EVALUATED",

          incident:
            null,
        },

        evaluation:
          existingEvaluation,
      };
    }

    const metricValue =
      toNumberOrNull(
        healthCheck[
        metricField
        ]
      );

    const stateBefore =
      state.currentStatus;

    if (metricValue === null) {
      const message =
        buildMessage({
          action:
            "IGNORED_MISSING_METRIC",

          rule,
          metricValue,
          stateBefore,
          stateAfter:
            stateBefore,
        });

      const evaluationId =
        await insertAlertRuleEvaluation(
          connection,
          {
            evaluationKey,

            ruleId: rule.id,
            serverId: server.id,

            healthCheckId:
              healthCheck.id,

            metricValue: null,

            thresholdValue:
              rule.thresholdValue,

            recoveryValue:
              rule.recoveryValue,

            evaluationResult:
              "IGNORED",

            stateBefore,
            stateAfter:
              stateBefore,

            message,
          }
        );

      return {
        action:
          "IGNORED_MISSING_METRIC",

        evaluationId,

        ruleId: rule.id,
        ruleCode:
          rule.ruleCode,

        metricType:
          rule.metricType,

        metricValue: null,

        stateBefore,
        stateAfter:
          stateBefore,

        alertActive:
          ALERTING_STATES.has(
            stateBefore
          ),

        thresholdIncident: {
          action:
            "NO_CHANGE",

          incident:
            null,
        },
      };
    }

    const breached =
      compareThreshold(
        metricValue,
        rule.comparisonOperator,
        rule.thresholdValue
      );

    const recovered =
      isRecoveryValueReached(
        metricValue,
        rule.comparisonOperator,
        rule.recoveryValue
      );

    let stateAfter =
      stateBefore;

    let evaluationResult =
      "NORMAL";

    let action =
      "NO_CHANGE";

    let consecutiveBreaches =
      Number(
        state.consecutiveBreaches ||
        0
      );

    let consecutiveRecoveries =
      Number(
        state.consecutiveRecoveries ||
        0
      );

    let firstBreachedAt =
      state.firstBreachedAt;

    let lastBreachedAt =
      state.lastBreachedAt;

    let alertStartedAt =
      state.alertStartedAt;

    let lastRecoveredAt =
      state.lastRecoveredAt;

    let activeAlertKey =
      state.activeAlertKey;

    const eventTime =
      healthCheck.reportedAt ||
      healthCheck.receivedAt;

    const requiredBreaches =
      Math.max(
        Number(
          rule
            .consecutiveBreachesRequired
        ) || 1,
        1
      );

    const requiredRecoveries =
      Math.max(
        Number(
          rule
            .consecutiveRecoveriesRequired
        ) || 1,
        1
      );

    if (
      stateBefore === "NORMAL"
    ) {
      if (breached) {
        evaluationResult =
          "BREACH";

        consecutiveBreaches = 1;
        consecutiveRecoveries = 0;

        firstBreachedAt =
          eventTime;

        lastBreachedAt =
          eventTime;

        alertStartedAt =
          null;

        lastRecoveredAt =
          state.lastRecoveredAt;

        activeAlertKey =
          null;

        if (
          consecutiveBreaches >=
          requiredBreaches
        ) {
          stateAfter =
            "ALERTING";

          alertStartedAt =
            eventTime;

          activeAlertKey =
            buildActiveAlertKey({
              ruleId: rule.id,
              serverId: server.id,
            });

          action =
            "ALERT_OPENED";
        } else {
          stateAfter =
            "BREACHING";

          action =
            "BREACH_RECORDED";
        }
      } else {
        stateAfter =
          "NORMAL";

        consecutiveBreaches = 0;
        consecutiveRecoveries = 0;

        firstBreachedAt =
          null;

        activeAlertKey =
          null;

        action =
          "NO_CHANGE";
      }
    } else if (
      stateBefore ===
      "BREACHING"
    ) {
      if (breached) {
        evaluationResult =
          "BREACH";

        consecutiveBreaches += 1;
        consecutiveRecoveries = 0;

        firstBreachedAt =
          firstBreachedAt ||
          eventTime;

        lastBreachedAt =
          eventTime;

        if (
          consecutiveBreaches >=
          requiredBreaches
        ) {
          stateAfter =
            "ALERTING";

          alertStartedAt =
            eventTime;

          activeAlertKey =
            buildActiveAlertKey({
              ruleId: rule.id,
              serverId: server.id,
            });

          action =
            "ALERT_OPENED";
        } else {
          stateAfter =
            "BREACHING";

          action =
            "BREACH_RECORDED";
        }
      } else {
        stateAfter =
          "NORMAL";

        consecutiveBreaches = 0;
        consecutiveRecoveries = 0;

        firstBreachedAt =
          null;

        activeAlertKey =
          null;

        action =
          "BREACH_RESET";
      }
    } else if (
      stateBefore ===
      "ALERTING"
    ) {
      if (recovered) {
        evaluationResult =
          "RECOVERY";

        consecutiveBreaches = 0;
        consecutiveRecoveries += 1;

        if (
          consecutiveRecoveries >=
          requiredRecoveries
        ) {
          stateAfter =
            "NORMAL";

          consecutiveRecoveries = 0;

          firstBreachedAt =
            null;

          lastRecoveredAt =
            eventTime;

          activeAlertKey =
            null;

          action =
            "ALERT_RESOLVED";
        } else {
          stateAfter =
            "RECOVERING";

          action =
            "RECOVERY_RECORDED";
        }
      } else {
        consecutiveRecoveries = 0;

        stateAfter =
          "ALERTING";

        if (breached) {
          evaluationResult =
            "BREACH";

          consecutiveBreaches += 1;

          lastBreachedAt =
            eventTime;
        }

        action =
          "ALERT_STILL_ACTIVE";
      }
    } else if (
      stateBefore ===
      "RECOVERING"
    ) {
      if (recovered) {
        evaluationResult =
          "RECOVERY";

        consecutiveBreaches = 0;
        consecutiveRecoveries += 1;

        if (
          consecutiveRecoveries >=
          requiredRecoveries
        ) {
          stateAfter =
            "NORMAL";

          consecutiveRecoveries = 0;

          firstBreachedAt =
            null;

          lastRecoveredAt =
            eventTime;

          activeAlertKey =
            null;

          action =
            "ALERT_RESOLVED";
        } else {
          stateAfter =
            "RECOVERING";

          action =
            "RECOVERY_RECORDED";
        }
      } else {
        consecutiveRecoveries = 0;

        stateAfter =
          "ALERTING";

        if (breached) {
          evaluationResult =
            "BREACH";

          consecutiveBreaches += 1;

          lastBreachedAt =
            eventTime;
        }

        action =
          "RECOVERY_INTERRUPTED";
      }
    } else {
      throw new AppError(
        500,
        `Unsupported alert state: ${stateBefore}.`
      );
    }

    const affectedRows =
      await updateAlertRuleState(
        connection,
        {
          stateId: state.id,

          expectedStateVersion:
            Number(
              state.stateVersion ||
              0
            ),

          healthCheckId:
            healthCheck.id,

          metricValue,
          currentStatus:
            stateAfter,

          consecutiveBreaches,
          consecutiveRecoveries,

          firstBreachedAt,
          lastBreachedAt,
          alertStartedAt,
          lastRecoveredAt,

          activeAlertKey,
        }
      );

    if (affectedRows !== 1) {
      throw new AppError(
        409,
        `Alert state changed while evaluating rule ${rule.ruleCode}.`
      );
    }

    const message =
      buildMessage({
        action,
        rule,
        metricValue,
        stateBefore,
        stateAfter,
      });

    const evaluationId =
      await insertAlertRuleEvaluation(
        connection,
        {
          evaluationKey,

          ruleId: rule.id,
          serverId: server.id,

          healthCheckId:
            healthCheck.id,

          metricValue,

          thresholdValue:
            rule.thresholdValue,

          recoveryValue:
            rule.recoveryValue,

          evaluationResult,

          stateBefore,
          stateAfter,

          message,
        }
      );

    const thresholdIncident =
      await processThresholdAlertIncident(
        connection,
        {
          server,
          healthCheck,
          rule,

          evaluation: {
            action,
            evaluationId,
            evaluationResult,
            metricValue,
            stateBefore,
            stateAfter,
            consecutiveBreaches,
            consecutiveRecoveries,
          },
        }
      );

    return {
      action,
      evaluationId,

      ruleId: rule.id,
      ruleCode:
        rule.ruleCode,

      ruleName:
        rule.name,

      severity:
        rule.severity,

      metricType:
        rule.metricType,

      metricValue,

      thresholdValue:
        rule.thresholdValue,

      recoveryValue:
        rule.recoveryValue,

      stateBefore,
      stateAfter,

      consecutiveBreaches,
      consecutiveRecoveries,

      alertActive:
        ALERTING_STATES.has(
          stateAfter
        ),

      activeAlertKey,
      message,

      thresholdIncident,
    };
  };

export const evaluateAlertRulesForHealthCheck =
  async (
    connection,
    {
      server,
      healthCheck,
    }
  ) => {
    if (
      !connection ||
      !server ||
      !healthCheck
    ) {
      throw new AppError(
        500,
        "Alert rule evaluation data is incomplete."
      );
    }

    const rules =
      await findApplicableAlertRules(
        connection,
        server.id
      );

    const summary = {
      action: "EVALUATED",

      totalRules:
        rules.length,

      evaluated: 0,
      ignored: 0,

      breachesRecorded: 0,
      alertsOpened: 0,

      recoveriesRecorded: 0,
      alertsResolved: 0,

      activeAlerts: 0,

      incidentsCreated: 0,
      incidentOccurrencesRecorded: 0,
      incidentsResolved: 0,

      results: [],
    };

    for (const rule of rules) {
      const result =
        await evaluateSingleRule(
          connection,
          {
            server,
            healthCheck,
            rule,
          }
        );

      let notification = null;

      /*
       * Create notification only when an alert
       * actually opens or resolves.
       *
       * The same database connection is used,
       * so the heartbeat + alert state +
       * evaluation + notification remain inside
       * the same transaction.
       */
      if (
        result.action ===
        "ALERT_OPENED"
      ) {
        notification =
          await notifyAlertOpened(
            connection,
            {
              server,
              alertResult: result,
            }
          );
      }

      if (
        result.action ===
        "ALERT_RESOLVED"
      ) {
        notification =
          await notifyAlertResolved(
            connection,
            {
              server,
              alertResult: result,
            }
          );
      }

      summary.results.push({
        ...result,
        notification,
      });
      if (
        result.action ===
        "IGNORED_MISSING_METRIC"
      ) {
        summary.ignored += 1;
      } else {
        summary.evaluated += 1;
      }

      if (
        result.action ===
        "BREACH_RECORDED"
      ) {
        summary.breachesRecorded += 1;
      }

      if (
        result.action ===
        "ALERT_OPENED"
      ) {
        summary.alertsOpened += 1;
      }

      if (
        result.action ===
        "RECOVERY_RECORDED"
      ) {
        summary.recoveriesRecorded += 1;
      }

      if (
        result.action ===
        "ALERT_RESOLVED"
      ) {
        summary.alertsResolved += 1;
      }

      if (
        result.thresholdIncident
          ?.action ===
        "CREATED"
      ) {
        summary.incidentsCreated += 1;
      }

      if (
        result.thresholdIncident
          ?.action ===
        "OCCURRENCE_RECORDED"
      ) {
        summary.incidentOccurrencesRecorded += 1;
      }

      if (
        result.thresholdIncident
          ?.action ===
        "RESOLVED"
      ) {
        summary.incidentsResolved += 1;
      }

      if (result.alertActive) {
        summary.activeAlerts += 1;
      }
    }

    return summary;
  };
