import "dotenv/config";

import pool from "../config/db.js";

const defaultRules = [
  {
    ruleCode: "GLOBAL-CPU-CRITICAL",
    name: "Critical CPU usage",
    description:
      "Creates an alert when CPU usage remains at or above 90 percent.",
    metricType: "CPU_USAGE_PERCENT",
    comparisonOperator: "GTE",
    thresholdValue: 90,
    recoveryValue: 80,
    severity: "CRITICAL",
    consecutiveBreachesRequired: 3,
    consecutiveRecoveriesRequired: 2,
  },
  {
    ruleCode: "GLOBAL-MEMORY-CRITICAL",
    name: "Critical memory usage",
    description:
      "Creates an alert when memory usage remains at or above 90 percent.",
    metricType: "MEMORY_USAGE_PERCENT",
    comparisonOperator: "GTE",
    thresholdValue: 90,
    recoveryValue: 80,
    severity: "CRITICAL",
    consecutiveBreachesRequired: 3,
    consecutiveRecoveriesRequired: 2,
  },
  {
    ruleCode: "GLOBAL-DISK-HIGH",
    name: "High disk usage",
    description:
      "Creates an alert when disk usage remains at or above 85 percent.",
    metricType: "DISK_USAGE_PERCENT",
    comparisonOperator: "GTE",
    thresholdValue: 85,
    recoveryValue: 80,
    severity: "HIGH",
    consecutiveBreachesRequired: 2,
    consecutiveRecoveriesRequired: 2,
  },
  {
    ruleCode: "GLOBAL-RESPONSE-HIGH",
    name: "High response time",
    description:
      "Creates an alert when response time remains at or above 2000 milliseconds.",
    metricType: "RESPONSE_TIME_MS",
    comparisonOperator: "GTE",
    thresholdValue: 2000,
    recoveryValue: 1500,
    severity: "HIGH",
    consecutiveBreachesRequired: 3,
    consecutiveRecoveriesRequired: 2,
  },
];

const createAlertRulesTable = async (
  connection
) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

      rule_code VARCHAR(80) NOT NULL,
      name VARCHAR(150) NOT NULL,
      description VARCHAR(500) NULL,

      scope_type ENUM(
        'GLOBAL',
        'SERVER'
      ) NOT NULL DEFAULT 'GLOBAL',

      server_id BIGINT UNSIGNED NULL,

      metric_type ENUM(
        'CPU_USAGE_PERCENT',
        'MEMORY_USAGE_PERCENT',
        'DISK_USAGE_PERCENT',
        'RESPONSE_TIME_MS'
      ) NOT NULL,

      comparison_operator ENUM(
        'GT',
        'GTE',
        'LT',
        'LTE'
      ) NOT NULL DEFAULT 'GTE',

      threshold_value DECIMAL(14,3) NOT NULL,
      recovery_value DECIMAL(14,3) NOT NULL,

      severity ENUM(
        'WARNING',
        'HIGH',
        'CRITICAL'
      ) NOT NULL DEFAULT 'WARNING',

      consecutive_breaches_required
        SMALLINT UNSIGNED
        NOT NULL DEFAULT 1,

      consecutive_recoveries_required
        SMALLINT UNSIGNED
        NOT NULL DEFAULT 1,

      is_enabled TINYINT(1)
        NOT NULL DEFAULT 1,

      created_at DATETIME(3)
        NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

      updated_at DATETIME(3)
        NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

      PRIMARY KEY (id),

      UNIQUE KEY uq_alert_rules_rule_code (
        rule_code
      ),

      KEY idx_alert_rules_lookup (
        is_enabled,
        scope_type,
        metric_type
      ),

      KEY idx_alert_rules_server (
        server_id
      ),

      CONSTRAINT fk_alert_rules_server
        FOREIGN KEY (server_id)
        REFERENCES servers(id)
        ON DELETE CASCADE,

      CONSTRAINT chk_alert_rules_scope
        CHECK (
          (
            scope_type = 'GLOBAL'
            AND server_id IS NULL
          )
          OR
          (
            scope_type = 'SERVER'
            AND server_id IS NOT NULL
          )
        ),

      CONSTRAINT chk_alert_rules_breaches
        CHECK (
          consecutive_breaches_required >= 1
        ),

      CONSTRAINT chk_alert_rules_recoveries
        CHECK (
          consecutive_recoveries_required >= 1
        )

    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
  `);
};

const createAlertRuleStatesTable = async (
  connection
) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS alert_rule_states (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

      rule_id BIGINT UNSIGNED NOT NULL,
      server_id BIGINT UNSIGNED NOT NULL,

      current_status ENUM(
        'NORMAL',
        'BREACHING',
        'ALERTING',
        'RECOVERING'
      ) NOT NULL DEFAULT 'NORMAL',

      last_health_check_id
        BIGINT UNSIGNED NULL,

      last_metric_value
        DECIMAL(14,3) NULL,

      consecutive_breaches
        SMALLINT UNSIGNED
        NOT NULL DEFAULT 0,

      consecutive_recoveries
        SMALLINT UNSIGNED
        NOT NULL DEFAULT 0,

      first_breached_at
        DATETIME(3) NULL,

      last_breached_at
        DATETIME(3) NULL,

      alert_started_at
        DATETIME(3) NULL,

      last_recovered_at
        DATETIME(3) NULL,

      active_alert_key
        VARCHAR(180) NULL,

      state_version
        BIGINT UNSIGNED
        NOT NULL DEFAULT 0,

      created_at DATETIME(3)
        NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

      updated_at DATETIME(3)
        NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

      PRIMARY KEY (id),

      UNIQUE KEY uq_alert_rule_server (
        rule_id,
        server_id
      ),

      UNIQUE KEY uq_active_alert_key (
        active_alert_key
      ),

      KEY idx_alert_rule_states_status (
        current_status
      ),

      KEY idx_alert_rule_states_server (
        server_id
      ),

      KEY idx_alert_rule_states_health_check (
        last_health_check_id
      ),

      CONSTRAINT fk_alert_rule_states_rule
        FOREIGN KEY (rule_id)
        REFERENCES alert_rules(id)
        ON DELETE CASCADE,

      CONSTRAINT fk_alert_rule_states_server
        FOREIGN KEY (server_id)
        REFERENCES servers(id)
        ON DELETE CASCADE,

      CONSTRAINT fk_alert_rule_states_health_check
        FOREIGN KEY (last_health_check_id)
        REFERENCES server_health_checks(id)
        ON DELETE SET NULL

    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
  `);
};

const createAlertRuleEvaluationsTable =
  async (connection) => {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS alert_rule_evaluations (
        id BIGINT UNSIGNED
          NOT NULL AUTO_INCREMENT,

        evaluation_key
          VARCHAR(190) NOT NULL,

        rule_id BIGINT UNSIGNED NOT NULL,
        server_id BIGINT UNSIGNED NOT NULL,
        health_check_id BIGINT UNSIGNED NOT NULL,

        metric_value
          DECIMAL(14,3) NULL,

        threshold_value
          DECIMAL(14,3) NOT NULL,

        recovery_value
          DECIMAL(14,3) NOT NULL,

        evaluation_result ENUM(
          'NORMAL',
          'BREACH',
          'RECOVERY',
          'IGNORED'
        ) NOT NULL,

        state_before ENUM(
          'NORMAL',
          'BREACHING',
          'ALERTING',
          'RECOVERING'
        ) NOT NULL,

        state_after ENUM(
          'NORMAL',
          'BREACHING',
          'ALERTING',
          'RECOVERING'
        ) NOT NULL,

        message VARCHAR(500) NULL,

        created_at DATETIME(3)
          NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

        PRIMARY KEY (id),

        UNIQUE KEY uq_alert_evaluation_key (
          evaluation_key
        ),

        UNIQUE KEY uq_alert_evaluation_once (
          rule_id,
          server_id,
          health_check_id
        ),

        KEY idx_alert_evaluations_server (
          server_id,
          created_at
        ),

        KEY idx_alert_evaluations_rule (
          rule_id,
          created_at
        ),

        KEY idx_alert_evaluations_result (
          evaluation_result,
          created_at
        ),

        CONSTRAINT fk_alert_evaluations_rule
          FOREIGN KEY (rule_id)
          REFERENCES alert_rules(id)
          ON DELETE CASCADE,

        CONSTRAINT fk_alert_evaluations_server
          FOREIGN KEY (server_id)
          REFERENCES servers(id)
          ON DELETE CASCADE,

        CONSTRAINT fk_alert_evaluations_health_check
          FOREIGN KEY (health_check_id)
          REFERENCES server_health_checks(id)
          ON DELETE CASCADE

      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);
  };

const seedDefaultRules = async (
  connection
) => {
  for (const rule of defaultRules) {
    await connection.execute(
      `
        INSERT IGNORE INTO alert_rules (
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
          is_enabled
        )
        VALUES (
          ?, ?, ?,
          'GLOBAL',
          NULL,
          ?, ?, ?, ?, ?, ?, ?,
          1
        )
      `,
      [
        rule.ruleCode,
        rule.name,
        rule.description,
        rule.metricType,
        rule.comparisonOperator,
        rule.thresholdValue,
        rule.recoveryValue,
        rule.severity,
        rule.consecutiveBreachesRequired,
        rule.consecutiveRecoveriesRequired,
      ]
    );
  }
};

const showSetupSummary = async (
  connection
) => {
  const [ruleRows] =
    await connection.execute(`
      SELECT COUNT(*) AS total
      FROM alert_rules
    `);

  const [stateRows] =
    await connection.execute(`
      SELECT COUNT(*) AS total
      FROM alert_rule_states
    `);

  const [evaluationRows] =
    await connection.execute(`
      SELECT COUNT(*) AS total
      FROM alert_rule_evaluations
    `);

  console.log(
    "Alert rule tables created successfully."
  );

  console.log(
    `Configured alert rules: ${
      ruleRows[0]?.total || 0
    }`
  );

  console.log(
    `Current alert states: ${
      stateRows[0]?.total || 0
    }`
  );

  console.log(
    `Stored evaluations: ${
      evaluationRows[0]?.total || 0
    }`
  );
};

const setupAlertRules = async () => {
  const connection =
    await pool.getConnection();

  try {
    await createAlertRulesTable(
      connection
    );

    await createAlertRuleStatesTable(
      connection
    );

    await createAlertRuleEvaluationsTable(
      connection
    );

    await seedDefaultRules(
      connection
    );

    await showSetupSummary(
      connection
    );
  } finally {
    connection.release();
    await pool.end();
  }
};

setupAlertRules().catch(
  async (error) => {
    console.error(
      "Alert rule setup failed:",
      error.message
    );

    try {
      await pool.end();
    } catch {
      // Pool may already be closed.
    }

    process.exit(1);
  }
);