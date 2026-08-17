const ALERT_STATE_SELECT = `
  states.id,
  states.rule_id AS ruleId,
  rules.rule_code AS ruleCode,
  rules.name AS ruleName,
  rules.description AS ruleDescription,
  rules.scope_type AS scopeType,
  rules.server_id AS scopedServerId,
  rules.metric_type AS metricType,
  rules.comparison_operator AS comparisonOperator,
  CAST(rules.threshold_value AS DOUBLE) AS thresholdValue,
  CAST(rules.recovery_value AS DOUBLE) AS recoveryValue,
  rules.severity,
  rules.consecutive_breaches_required AS consecutiveBreachesRequired,
  rules.consecutive_recoveries_required AS consecutiveRecoveriesRequired,
  rules.is_enabled AS isEnabled,
  rules.version AS ruleVersion,
  states.server_id AS serverId,
  servers.server_code AS serverCode,
  servers.name AS serverName,
  servers.environment,
  servers.status AS serverStatus,
  states.current_status AS currentStatus,
  states.last_health_check_id AS lastHealthCheckId,
  CAST(states.last_metric_value AS DOUBLE) AS lastMetricValue,
  states.consecutive_breaches AS consecutiveBreaches,
  states.consecutive_recoveries AS consecutiveRecoveries,
  states.first_breached_at AS firstBreachedAt,
  states.last_breached_at AS lastBreachedAt,
  states.alert_started_at AS alertStartedAt,
  states.last_recovered_at AS lastRecoveredAt,
  states.active_alert_key AS activeAlertKey,
  states.state_version AS stateVersion,
  states.created_at AS createdAt,
  states.updated_at AS updatedAt,
  CASE
    WHEN states.current_status IN ('ALERTING','RECOVERING')
      OR states.active_alert_key IS NOT NULL
    THEN 1
    ELSE 0
  END AS isActive
`;

const buildAlertStateFilters = ({
  search,
  status,
  severity,
  metricType,
  serverId,
  ruleId,
  isEnabled,
  activeOnly,
}) => {
  const conditions = ["rules.deleted_at IS NULL"];
  const values = [];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(`
      (
        rules.rule_code LIKE ?
        OR rules.name LIKE ?
        OR rules.description LIKE ?
        OR servers.server_code LIKE ?
        OR servers.name LIKE ?
      )
    `);
    values.push(pattern, pattern, pattern, pattern, pattern);
  }

  if (status) {
    conditions.push("states.current_status = ?");
    values.push(status);
  }

  if (severity) {
    conditions.push("rules.severity = ?");
    values.push(severity);
  }

  if (metricType) {
    conditions.push("rules.metric_type = ?");
    values.push(metricType);
  }

  if (serverId !== null) {
    conditions.push("states.server_id = ?");
    values.push(serverId);
  }

  if (ruleId !== null) {
    conditions.push("states.rule_id = ?");
    values.push(ruleId);
  }

  if (isEnabled !== null) {
    conditions.push("rules.is_enabled = ?");
    values.push(isEnabled ? 1 : 0);
  }

  if (activeOnly) {
    conditions.push(`
      (
        states.current_status IN ('ALERTING','RECOVERING')
        OR states.active_alert_key IS NOT NULL
      )
    `);
  }

  return { conditions, values };
};

export const findAlertStates = async (
  connection,
  {
    search,
    status,
    severity,
    metricType,
    serverId,
    ruleId,
    isEnabled,
    activeOnly,
    limit,
    offset,
  }
) => {
  const { conditions, values } = buildAlertStateFilters({
    search,
    status,
    severity,
    metricType,
    serverId,
    ruleId,
    isEnabled,
    activeOnly,
  });

  const [rows] = await connection.execute(
    `
      SELECT
        ${ALERT_STATE_SELECT}
      FROM alert_rule_states AS states
      INNER JOIN alert_rules AS rules
        ON rules.id = states.rule_id
      INNER JOIN servers
        ON servers.id = states.server_id
      WHERE ${conditions.join("\n AND ")}
      ORDER BY
        CASE
          WHEN states.current_status = 'ALERTING' THEN 0
          WHEN states.current_status = 'RECOVERING' THEN 1
          WHEN states.current_status = 'BREACHING' THEN 2
          ELSE 3
        END,
        CASE rules.severity
          WHEN 'CRITICAL' THEN 0
          WHEN 'HIGH' THEN 1
          ELSE 2
        END,
        states.updated_at DESC,
        states.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    values
  );

  return rows;
};

export const countAlertStates = async (
  connection,
  filters
) => {
  const { conditions, values } = buildAlertStateFilters(filters);

  const [rows] = await connection.execute(
    `
      SELECT COUNT(*) AS total
      FROM alert_rule_states AS states
      INNER JOIN alert_rules AS rules
        ON rules.id = states.rule_id
      INNER JOIN servers
        ON servers.id = states.server_id
      WHERE ${conditions.join("\n AND ")}
    `,
    values
  );

  return Number(rows[0]?.total || 0);
};

export const findAlertStateById = async (
  connection,
  stateId
) => {
  const [rows] = await connection.execute(
    `
      SELECT
        ${ALERT_STATE_SELECT}
      FROM alert_rule_states AS states
      INNER JOIN alert_rules AS rules
        ON rules.id = states.rule_id
      INNER JOIN servers
        ON servers.id = states.server_id
      WHERE states.id = ?
        AND rules.deleted_at IS NULL
      LIMIT 1
    `,
    [stateId]
  );

  return rows[0] || null;
};

export const findAlertEvaluations = async (
  connection,
  {
    ruleId,
    serverId,
    limit,
    offset,
  }
) => {
  const [rows] = await connection.execute(
    `
      SELECT
        evaluations.id,
        evaluations.evaluation_key AS evaluationKey,
        evaluations.rule_id AS ruleId,
        evaluations.server_id AS serverId,
        evaluations.health_check_id AS healthCheckId,
        CAST(evaluations.metric_value AS DOUBLE) AS metricValue,
        CAST(evaluations.threshold_value AS DOUBLE) AS thresholdValue,
        CAST(evaluations.recovery_value AS DOUBLE) AS recoveryValue,
        evaluations.evaluation_result AS evaluationResult,
        evaluations.state_before AS stateBefore,
        evaluations.state_after AS stateAfter,
        evaluations.message,
        evaluations.created_at AS createdAt
      FROM alert_rule_evaluations AS evaluations
      WHERE evaluations.rule_id = ?
        AND evaluations.server_id = ?
      ORDER BY evaluations.created_at DESC, evaluations.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    [ruleId, serverId]
  );

  return rows;
};

export const countAlertEvaluations = async (
  connection,
  {
    ruleId,
    serverId,
  }
) => {
  const [rows] = await connection.execute(
    `
      SELECT COUNT(*) AS total
      FROM alert_rule_evaluations
      WHERE rule_id = ?
        AND server_id = ?
    `,
    [ruleId, serverId]
  );

  return Number(rows[0]?.total || 0);
};