export const findApplicableAlertRules =
  async (
    connection,
    serverId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            id,

            rule_code
              AS ruleCode,

            name,
            description,

            scope_type
              AS scopeType,

            server_id
              AS serverId,

            metric_type
              AS metricType,

            comparison_operator
              AS comparisonOperator,

            CAST(
              threshold_value AS DOUBLE
            ) AS thresholdValue,

            CAST(
              recovery_value AS DOUBLE
            ) AS recoveryValue,

            severity,

            consecutive_breaches_required
              AS consecutiveBreachesRequired,

            consecutive_recoveries_required
              AS consecutiveRecoveriesRequired,

            is_enabled
              AS isEnabled

          FROM alert_rules

          WHERE is_enabled = 1

            AND (
              (
                scope_type = 'GLOBAL'
                AND server_id IS NULL
              )

              OR

              (
                scope_type = 'SERVER'
                AND server_id = ?
              )
            )

          ORDER BY
            CASE
              WHEN scope_type = 'SERVER'
                THEN 0
              ELSE 1
            END,

            id ASC
        `,
        [serverId]
      );

    return rows;
  };

export const ensureAlertRuleState =
  async (
    connection,
    {
      ruleId,
      serverId,
    }
  ) => {
    await connection.execute(
      `
        INSERT INTO alert_rule_states (
          rule_id,
          server_id
        )
        VALUES (?, ?)

        ON DUPLICATE KEY UPDATE
          id = id
      `,
      [
        ruleId,
        serverId,
      ]
    );
  };

export const findAlertRuleStateForUpdate =
  async (
    connection,
    {
      ruleId,
      serverId,
    }
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            id,

            rule_id
              AS ruleId,

            server_id
              AS serverId,

            current_status
              AS currentStatus,

            last_health_check_id
              AS lastHealthCheckId,

            CAST(
              last_metric_value AS DOUBLE
            ) AS lastMetricValue,

            consecutive_breaches
              AS consecutiveBreaches,

            consecutive_recoveries
              AS consecutiveRecoveries,

            first_breached_at
              AS firstBreachedAt,

            last_breached_at
              AS lastBreachedAt,

            alert_started_at
              AS alertStartedAt,

            last_recovered_at
              AS lastRecoveredAt,

            active_alert_key
              AS activeAlertKey,

            state_version
              AS stateVersion,

            created_at
              AS createdAt,

            updated_at
              AS updatedAt

          FROM alert_rule_states

          WHERE rule_id = ?
            AND server_id = ?

          LIMIT 1
          FOR UPDATE
        `,
        [
          ruleId,
          serverId,
        ]
      );

    return rows[0] || null;
  };

export const findAlertEvaluationByKey =
  async (
    connection,
    evaluationKey
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            id,

            evaluation_key
              AS evaluationKey,

            rule_id
              AS ruleId,

            server_id
              AS serverId,

            health_check_id
              AS healthCheckId,

            CAST(
              metric_value AS DOUBLE
            ) AS metricValue,

            evaluation_result
              AS evaluationResult,

            state_before
              AS stateBefore,

            state_after
              AS stateAfter,

            message,

            created_at
              AS createdAt

          FROM alert_rule_evaluations

          WHERE evaluation_key = ?

          LIMIT 1
        `,
        [evaluationKey]
      );

    return rows[0] || null;
  };

export const updateAlertRuleState =
  async (
    connection,
    {
      stateId,
      expectedStateVersion,
      healthCheckId,
      metricValue,
      currentStatus,
      consecutiveBreaches,
      consecutiveRecoveries,
      firstBreachedAt,
      lastBreachedAt,
      alertStartedAt,
      lastRecoveredAt,
      activeAlertKey,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE alert_rule_states

          SET
            current_status = ?,
            last_health_check_id = ?,
            last_metric_value = ?,

            consecutive_breaches = ?,
            consecutive_recoveries = ?,

            first_breached_at = ?,
            last_breached_at = ?,
            alert_started_at = ?,
            last_recovered_at = ?,

            active_alert_key = ?,

            state_version =
              state_version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND state_version = ?
        `,
        [
          currentStatus,
          healthCheckId,
          metricValue,

          consecutiveBreaches,
          consecutiveRecoveries,

          firstBreachedAt,
          lastBreachedAt,
          alertStartedAt,
          lastRecoveredAt,

          activeAlertKey,

          stateId,
          expectedStateVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

export const insertAlertRuleEvaluation =
  async (
    connection,
    {
      evaluationKey,
      ruleId,
      serverId,
      healthCheckId,
      metricValue,
      thresholdValue,
      recoveryValue,
      evaluationResult,
      stateBefore,
      stateAfter,
      message,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          INSERT INTO alert_rule_evaluations (
            evaluation_key,
            rule_id,
            server_id,
            health_check_id,
            metric_value,
            threshold_value,
            recovery_value,
            evaluation_result,
            state_before,
            state_after,
            message
          )
          VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )
        `,
        [
          evaluationKey,
          ruleId,
          serverId,
          healthCheckId,
          metricValue,
          thresholdValue,
          recoveryValue,
          evaluationResult,
          stateBefore,
          stateAfter,
          message,
        ]
      );

    return Number(
      result.insertId
    );
  };