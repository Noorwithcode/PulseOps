const ALERT_RULE_SELECT = `
  rules.id,

  rules.rule_code
    AS ruleCode,

  rules.name,
  rules.description,

  rules.scope_type
    AS scopeType,

  rules.server_id
    AS serverId,

  servers.server_code
    AS serverCode,

  servers.name
    AS serverName,

  rules.metric_type
    AS metricType,

  rules.comparison_operator
    AS comparisonOperator,

  CAST(
    rules.threshold_value AS DOUBLE
  ) AS thresholdValue,

  CAST(
    rules.recovery_value AS DOUBLE
  ) AS recoveryValue,

  rules.severity,

  rules.consecutive_breaches_required
    AS consecutiveBreachesRequired,

  rules.consecutive_recoveries_required
    AS consecutiveRecoveriesRequired,

  rules.is_enabled
    AS isEnabled,

  rules.version,

  rules.created_by
    AS createdBy,

  rules.updated_by
    AS updatedBy,

  rules.created_at
    AS createdAt,

  rules.updated_at
    AS updatedAt,

  rules.deleted_at
    AS deletedAt
`;

export const findActiveServerById =
  async (
    connection,
    serverId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            id,

            server_code
              AS serverCode,

            name,

            status

          FROM servers

          WHERE id = ?
            AND deleted_at IS NULL

          LIMIT 1
        `,
        [serverId]
      );

    return rows[0] || null;
  };

export const findAlertRuleById =
  async (
    connection,
    ruleId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            ${ALERT_RULE_SELECT}

          FROM alert_rules
            AS rules

          LEFT JOIN servers
            ON servers.id =
              rules.server_id

          WHERE rules.id = ?
            AND rules.deleted_at
              IS NULL

          LIMIT 1
        `,
        [ruleId]
      );

    return rows[0] || null;
  };

export const findAlertRuleByIdForUpdate =
  async (
    connection,
    ruleId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            ${ALERT_RULE_SELECT}

          FROM alert_rules
            AS rules

          LEFT JOIN servers
            ON servers.id =
              rules.server_id

          WHERE rules.id = ?
            AND rules.deleted_at
              IS NULL

          LIMIT 1
          FOR UPDATE
        `,
        [ruleId]
      );

    return rows[0] || null;
  };

export const findAlertRuleByCode =
  async (
    connection,
    ruleCode
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            id,

            rule_code
              AS ruleCode,

            deleted_at
              AS deletedAt

          FROM alert_rules

          WHERE rule_code = ?

          LIMIT 1
        `,
        [ruleCode]
      );

    return rows[0] || null;
  };

export const insertAlertRule =
  async (
    connection,
    data
  ) => {
    const [result] =
      await connection.execute(
        `
          INSERT INTO alert_rules (
            rule_code,
            name,
            description,

            scope_type,
            server_id,

            metric_type,
            comparison_operator,

            threshold_value,
            recovery_value,

            severity,

            consecutive_breaches_required,
            consecutive_recoveries_required,

            is_enabled,
            version,

            created_by,
            updated_by
          )
          VALUES (
            ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?,
            ?, ?,
            ?,
            1,
            ?, ?
          )
        `,
        [
          data.ruleCode,
          data.name,
          data.description,

          data.scopeType,
          data.serverId,

          data.metricType,
          data.comparisonOperator,

          data.thresholdValue,
          data.recoveryValue,

          data.severity,

          data.consecutiveBreachesRequired,
          data.consecutiveRecoveriesRequired,

          data.isEnabled,

          data.actorUserId,
          data.actorUserId,
        ]
      );

    return Number(
      result.insertId
    );
  };

export const findAlertRules =
  async (
    connection,
    {
      search,
      scopeType,
      serverId,
      metricType,
      severity,
      isEnabled,
      limit,
      offset,
    }
  ) => {
    const conditions = [
      "rules.deleted_at IS NULL",
    ];

    const values = [];

    if (search) {
      const pattern =
        `%${search}%`;

      conditions.push(
        `
          (
            rules.rule_code LIKE ?
            OR rules.name LIKE ?
            OR rules.description LIKE ?
            OR servers.server_code LIKE ?
            OR servers.name LIKE ?
          )
        `
      );

      values.push(
        pattern,
        pattern,
        pattern,
        pattern,
        pattern
      );
    }

    if (scopeType) {
      conditions.push(
        "rules.scope_type = ?"
      );

      values.push(
        scopeType
      );
    }

    if (serverId !== null) {
      conditions.push(
        "rules.server_id = ?"
      );

      values.push(
        serverId
      );
    }

    if (metricType) {
      conditions.push(
        "rules.metric_type = ?"
      );

      values.push(
        metricType
      );
    }

    if (severity) {
      conditions.push(
        "rules.severity = ?"
      );

      values.push(
        severity
      );
    }

    if (isEnabled !== null) {
      conditions.push(
        "rules.is_enabled = ?"
      );

      values.push(
        isEnabled ? 1 : 0
      );
    }

    const [rows] =
      await connection.execute(
        `
          SELECT
            ${ALERT_RULE_SELECT}

          FROM alert_rules
            AS rules

          LEFT JOIN servers
            ON servers.id =
              rules.server_id

          WHERE ${conditions.join(
            "\n AND "
          )}

          ORDER BY
            rules.created_at DESC,
            rules.id DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `,
        values
      );

    return rows;
  };

export const countAlertRules =
  async (
    connection,
    {
      search,
      scopeType,
      serverId,
      metricType,
      severity,
      isEnabled,
    }
  ) => {
    const conditions = [
      "rules.deleted_at IS NULL",
    ];

    const values = [];

    if (search) {
      const pattern =
        `%${search}%`;

      conditions.push(
        `
          (
            rules.rule_code LIKE ?
            OR rules.name LIKE ?
            OR rules.description LIKE ?
            OR servers.server_code LIKE ?
            OR servers.name LIKE ?
          )
        `
      );

      values.push(
        pattern,
        pattern,
        pattern,
        pattern,
        pattern
      );
    }

    if (scopeType) {
      conditions.push(
        "rules.scope_type = ?"
      );

      values.push(
        scopeType
      );
    }

    if (serverId !== null) {
      conditions.push(
        "rules.server_id = ?"
      );

      values.push(
        serverId
      );
    }

    if (metricType) {
      conditions.push(
        "rules.metric_type = ?"
      );

      values.push(
        metricType
      );
    }

    if (severity) {
      conditions.push(
        "rules.severity = ?"
      );

      values.push(
        severity
      );
    }

    if (isEnabled !== null) {
      conditions.push(
        "rules.is_enabled = ?"
      );

      values.push(
        isEnabled ? 1 : 0
      );
    }

    const [rows] =
      await connection.execute(
        `
          SELECT
            COUNT(*) AS total

          FROM alert_rules
            AS rules

          LEFT JOIN servers
            ON servers.id =
              rules.server_id

          WHERE ${conditions.join(
            "\n AND "
          )}
        `,
        values
      );

    return Number(
      rows[0]?.total || 0
    );
  };

export const hasActiveAlertStates =
  async (
    connection,
    ruleId
  ) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            id

          FROM alert_rule_states

          WHERE rule_id = ?

            AND (
              current_status IN (
                'ALERTING',
                'RECOVERING'
              )

              OR active_alert_key
                IS NOT NULL
            )

          LIMIT 1
          FOR UPDATE
        `,
        [ruleId]
      );

    return rows.length > 0;
  };

export const updateAlertRule =
  async (
    connection,
    data
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE alert_rules

          SET
            name = ?,
            description = ?,

            scope_type = ?,
            server_id = ?,

            metric_type = ?,
            comparison_operator = ?,

            threshold_value = ?,
            recovery_value = ?,

            severity = ?,

            consecutive_breaches_required = ?,
            consecutive_recoveries_required = ?,

            updated_by = ?,

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND deleted_at IS NULL
        `,
        [
          data.name,
          data.description,

          data.scopeType,
          data.serverId,

          data.metricType,
          data.comparisonOperator,

          data.thresholdValue,
          data.recoveryValue,

          data.severity,

          data.consecutiveBreachesRequired,
          data.consecutiveRecoveriesRequired,

          data.actorUserId,

          data.ruleId,
          data.expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

export const updateAlertRuleStatus =
  async (
    connection,
    {
      ruleId,
      expectedVersion,
      isEnabled,
      actorUserId,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE alert_rules

          SET
            is_enabled = ?,
            updated_by = ?,

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND deleted_at IS NULL
        `,
        [
          isEnabled ? 1 : 0,
          actorUserId,

          ruleId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

export const softDeleteAlertRule =
  async (
    connection,
    {
      ruleId,
      expectedVersion,
      actorUserId,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE alert_rules

          SET
            is_enabled = 0,
            updated_by = ?,

            deleted_at =
              UTC_TIMESTAMP(3),

            version =
              version + 1,

            updated_at =
              UTC_TIMESTAMP(3)

          WHERE id = ?
            AND version = ?
            AND deleted_at IS NULL
        `,
        [
          actorUserId,
          ruleId,
          expectedVersion,
        ]
      );

    return Number(
      result.affectedRows
    );
  };

export const findAlertRuleStates =
  async (
    connection,
    {
      ruleId,
      status,
      serverId,
      limit,
      offset,
    }
  ) => {
    const conditions = [
      "states.rule_id = ?",
    ];

    const values = [
      ruleId,
    ];

    if (status) {
      conditions.push(
        "states.current_status = ?"
      );

      values.push(
        status
      );
    }

    if (serverId !== null) {
      conditions.push(
        "states.server_id = ?"
      );

      values.push(
        serverId
      );
    }

    const [rows] =
      await connection.execute(
        `
          SELECT
            states.id,

            states.rule_id
              AS ruleId,

            states.server_id
              AS serverId,

            servers.server_code
              AS serverCode,

            servers.name
              AS serverName,

            states.current_status
              AS currentStatus,

            states.last_health_check_id
              AS lastHealthCheckId,

            CAST(
              states.last_metric_value
              AS DOUBLE
            ) AS lastMetricValue,

            states.consecutive_breaches
              AS consecutiveBreaches,

            states.consecutive_recoveries
              AS consecutiveRecoveries,

            states.first_breached_at
              AS firstBreachedAt,

            states.last_breached_at
              AS lastBreachedAt,

            states.alert_started_at
              AS alertStartedAt,

            states.last_recovered_at
              AS lastRecoveredAt,

            states.active_alert_key
              AS activeAlertKey,

            states.state_version
              AS stateVersion,

            states.created_at
              AS createdAt,

            states.updated_at
              AS updatedAt

          FROM alert_rule_states
            AS states

          INNER JOIN servers
            ON servers.id =
              states.server_id

          WHERE ${conditions.join(
            "\n AND "
          )}

          ORDER BY
            states.updated_at DESC,
            states.id DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `,
        values
      );

    return rows;
  };

export const countAlertRuleStates =
  async (
    connection,
    {
      ruleId,
      status,
      serverId,
    }
  ) => {
    const conditions = [
      "states.rule_id = ?",
    ];

    const values = [
      ruleId,
    ];

    if (status) {
      conditions.push(
        "states.current_status = ?"
      );

      values.push(
        status
      );
    }

    if (serverId !== null) {
      conditions.push(
        "states.server_id = ?"
      );

      values.push(
        serverId
      );
    }

    const [rows] =
      await connection.execute(
        `
          SELECT
            COUNT(*) AS total

          FROM alert_rule_states
            AS states

          WHERE ${conditions.join(
            "\n AND "
          )}
        `,
        values
      );

    return Number(
      rows[0]?.total || 0
    );
  };

  












