import "dotenv/config";
import pool from "../config/db.js";

const setupHealthMonitoring = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS server_health_checks (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        server_id BIGINT UNSIGNED NOT NULL,
        check_key VARCHAR(100) NOT NULL,

        check_type ENUM(
          'HEARTBEAT',
          'HTTP',
          'TCP',
          'MANUAL'
        ) NOT NULL DEFAULT 'HEARTBEAT',

        observed_status ENUM(
          'ONLINE',
          'DEGRADED',
          'OFFLINE',
          'UNKNOWN'
        ) NOT NULL,

        reported_at DATETIME(3) NOT NULL,
        received_at DATETIME(3)
          NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

        response_time_ms INT UNSIGNED NULL,
        cpu_usage_percent DECIMAL(5, 2) NULL,
        memory_usage_percent DECIMAL(5, 2) NULL,
        disk_usage_percent DECIMAL(5, 2) NULL,
        uptime_seconds BIGINT UNSIGNED NULL,

        error_code VARCHAR(80) NULL,
        message VARCHAR(500) NULL,

        PRIMARY KEY (id),

        UNIQUE KEY uq_server_health_check (
          server_id,
          check_key
        ),

        KEY idx_health_server_reported (
          server_id,
          reported_at
        ),

        KEY idx_health_status_reported (
          observed_status,
          reported_at
        ),

        CONSTRAINT fk_health_check_server
          FOREIGN KEY (server_id)
          REFERENCES servers(id)
          ON DELETE CASCADE,

        CONSTRAINT chk_health_cpu
          CHECK (
            cpu_usage_percent IS NULL OR
            cpu_usage_percent BETWEEN 0 AND 100
          ),

        CONSTRAINT chk_health_memory
          CHECK (
            memory_usage_percent IS NULL OR
            memory_usage_percent BETWEEN 0 AND 100
          ),

        CONSTRAINT chk_health_disk
          CHECK (
            disk_usage_percent IS NULL OR
            disk_usage_percent BETWEEN 0 AND 100
          )
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS server_monitoring_states (
        server_id BIGINT UNSIGNED NOT NULL,
        last_health_check_id BIGINT UNSIGNED NULL,

        observed_status ENUM(
          'ONLINE',
          'DEGRADED',
          'OFFLINE',
          'UNKNOWN'
        ) NOT NULL DEFAULT 'UNKNOWN',

        last_reported_at DATETIME(3) NULL,
        last_received_at DATETIME(3) NULL,
        last_online_at DATETIME(3) NULL,
        last_response_time_ms INT UNSIGNED NULL,

        consecutive_successes INT UNSIGNED
          NOT NULL DEFAULT 0,

        consecutive_failures INT UNSIGNED
          NOT NULL DEFAULT 0,

        state_version BIGINT UNSIGNED
          NOT NULL DEFAULT 1,

        created_at DATETIME(3)
          NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

        updated_at DATETIME(3)
          NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ON UPDATE CURRENT_TIMESTAMP(3),

        PRIMARY KEY (server_id),

        KEY idx_monitoring_status (
          observed_status
        ),

        KEY idx_monitoring_last_reported (
          last_reported_at
        ),

        CONSTRAINT fk_monitoring_state_server
          FOREIGN KEY (server_id)
          REFERENCES servers(id)
          ON DELETE CASCADE,

        CONSTRAINT fk_monitoring_last_check
          FOREIGN KEY (last_health_check_id)
          REFERENCES server_health_checks(id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    console.log(
      "Health monitoring tables created successfully."
    );
  } finally {
    connection.release();
  }
};

setupHealthMonitoring()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(
      "Health monitoring setup failed:",
      error
    );

    await pool.end();
    process.exitCode = 1;
  });