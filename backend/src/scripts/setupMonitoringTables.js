import "dotenv/config";
import pool from "../config/db.js";

const SETUP_LOCK_NAME =
  "pulseops_monitoring_tables_setup";

const setupMonitoringTables = async () => {
  let connection;
  let lockAcquired = false;

  try {
    connection = await pool.getConnection();

    const [[lockResult]] = await connection.execute(
      "SELECT GET_LOCK(?, 10) AS acquired",
      [SETUP_LOCK_NAME]
    );

    if (Number(lockResult.acquired) !== 1) {
      throw new Error(
        "Could not acquire monitoring setup lock."
      );
    }

    lockAcquired = true;

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS servers (
        id BIGINT UNSIGNED AUTO_INCREMENT
          PRIMARY KEY,

        server_code VARCHAR(40) NOT NULL,
        name VARCHAR(120) NOT NULL,
        hostname VARCHAR(253) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,

        environment ENUM(
          'PRODUCTION',
          'STAGING',
          'DEVELOPMENT',
          'TEST'
        ) NOT NULL DEFAULT 'PRODUCTION',

        operating_system VARCHAR(120) NULL,
        location VARCHAR(150) NULL,
        description VARCHAR(500) NULL,

        status ENUM(
          'ONLINE',
          'OFFLINE',
          'DEGRADED',
          'MAINTENANCE',
          'UNKNOWN'
        ) NOT NULL DEFAULT 'UNKNOWN',

        check_interval_seconds
          SMALLINT UNSIGNED NOT NULL DEFAULT 60,

        last_seen_at DATETIME(3) NULL,

        version INT UNSIGNED NOT NULL DEFAULT 1,

        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME(3)
          NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

        updated_at DATETIME(3)
          NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ON UPDATE CURRENT_TIMESTAMP(3),

        deleted_at DATETIME(3) NULL,

        CONSTRAINT uq_servers_server_code
          UNIQUE (server_code),

        CONSTRAINT uq_servers_hostname_environment
          UNIQUE (hostname, environment),

        CONSTRAINT chk_servers_check_interval
          CHECK (
            check_interval_seconds
            BETWEEN 10 AND 3600
          ),

        CONSTRAINT fk_servers_created_by
          FOREIGN KEY (created_by)
          REFERENCES users(id)
          ON DELETE SET NULL,

        INDEX idx_servers_status (status),
        INDEX idx_servers_environment (environment),
        INDEX idx_servers_last_seen (last_seen_at),
        INDEX idx_servers_deleted_at (deleted_at)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS server_metrics (
        id BIGINT UNSIGNED AUTO_INCREMENT
          PRIMARY KEY,

        server_id BIGINT UNSIGNED NOT NULL,
        sample_id CHAR(36) NOT NULL,

        cpu_usage_percent
          DECIMAL(5,2) UNSIGNED NOT NULL,

        memory_usage_percent
          DECIMAL(5,2) UNSIGNED NOT NULL,

        disk_usage_percent
          DECIMAL(5,2) UNSIGNED NOT NULL,

        network_in_kbps
          DECIMAL(14,2) UNSIGNED NULL,

        network_out_kbps
          DECIMAL(14,2) UNSIGNED NULL,

        response_time_ms INT UNSIGNED NULL,
        uptime_seconds BIGINT UNSIGNED NULL,

        recorded_at DATETIME(3) NOT NULL,

        created_at DATETIME(3)
          NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

        CONSTRAINT uq_server_metrics_sample
          UNIQUE (server_id, sample_id),

        CONSTRAINT fk_server_metrics_server
          FOREIGN KEY (server_id)
          REFERENCES servers(id)
          ON DELETE CASCADE,

        CONSTRAINT chk_metrics_cpu
          CHECK (
            cpu_usage_percent BETWEEN 0 AND 100
          ),

        CONSTRAINT chk_metrics_memory
          CHECK (
            memory_usage_percent BETWEEN 0 AND 100
          ),

        CONSTRAINT chk_metrics_disk
          CHECK (
            disk_usage_percent BETWEEN 0 AND 100
          ),

        INDEX idx_metrics_server_recorded
          (server_id, recorded_at),

        INDEX idx_metrics_recorded_at
          (recorded_at)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    console.log(
      "PulseOps monitoring tables created successfully."
    );
  } finally {
    if (connection) {
      if (lockAcquired) {
        await connection.execute(
          "SELECT RELEASE_LOCK(?)",
          [SETUP_LOCK_NAME]
        );
      }

      connection.release();
    }

    await pool.end();
  }
};

setupMonitoringTables().catch((error) => {
  console.error(
    "Monitoring table setup failed:",
    error.message
  );

  process.exitCode = 1;
});