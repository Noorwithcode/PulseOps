export const findActiveServerForHeartbeat =
  async (connection, serverId) => {
    const [rows] = await connection.execute(
      `
        SELECT id, server_code AS serverCode
        FROM servers
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [serverId]
    );

    return rows[0] || null;
  };

export const ensureMonitoringState =
  async (connection, serverId) => {
    await connection.execute(
      `
        INSERT INTO server_monitoring_states (
          server_id
        )
        VALUES (?)
        ON DUPLICATE KEY UPDATE
          server_id = ?
      `,
      [serverId, serverId]
    );
  };

export const findMonitoringStateForUpdate =
  async (connection, serverId) => {
    const [rows] = await connection.execute(
      `
        SELECT
          server_id AS serverId,
          last_health_check_id AS lastHealthCheckId,
          observed_status AS observedStatus,
          last_reported_at AS lastReportedAt,
          last_received_at AS lastReceivedAt,
          last_online_at AS lastOnlineAt,
          last_response_time_ms AS lastResponseTimeMs,
          consecutive_successes AS consecutiveSuccesses,
          consecutive_failures AS consecutiveFailures,
          state_version AS stateVersion,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM server_monitoring_states
        WHERE server_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [serverId]
    );

    return rows[0] || null;
  };

export const findHealthCheckByKey =
  async (connection, serverId, checkKey) => {
    const [rows] = await connection.execute(
      `
        SELECT
          id,
          server_id AS serverId,
          check_key AS checkKey,
          check_type AS checkType,
          observed_status AS status,
          reported_at AS reportedAt,
          received_at AS receivedAt,
          response_time_ms AS responseTimeMs,
          CAST(cpu_usage_percent AS DOUBLE)
            AS cpuUsagePercent,
          CAST(memory_usage_percent AS DOUBLE)
            AS memoryUsagePercent,
          CAST(disk_usage_percent AS DOUBLE)
            AS diskUsagePercent,
          uptime_seconds AS uptimeSeconds,
          error_code AS errorCode,
          message
        FROM server_health_checks
        WHERE server_id = ?
          AND check_key = ?
        LIMIT 1
      `,
      [serverId, checkKey]
    );

    return rows[0] || null;
  };

export const findHealthCheckById =
  async (connection, healthCheckId) => {
    const [rows] = await connection.execute(
      `
        SELECT
          id,
          server_id AS serverId,
          check_key AS checkKey,
          check_type AS checkType,
          observed_status AS status,
          reported_at AS reportedAt,
          received_at AS receivedAt,
          response_time_ms AS responseTimeMs,
          CAST(cpu_usage_percent AS DOUBLE)
            AS cpuUsagePercent,
          CAST(memory_usage_percent AS DOUBLE)
            AS memoryUsagePercent,
          CAST(disk_usage_percent AS DOUBLE)
            AS diskUsagePercent,
          uptime_seconds AS uptimeSeconds,
          error_code AS errorCode,
          message
        FROM server_health_checks
        WHERE id = ?
        LIMIT 1
      `,
      [healthCheckId]
    );

    return rows[0] || null;
  };

export const insertHealthCheck =
  async (connection, data) => {
    const [result] = await connection.execute(
      `
        INSERT INTO server_health_checks (
          server_id,
          check_key,
          check_type,
          observed_status,
          reported_at,
          received_at,
          response_time_ms,
          cpu_usage_percent,
          memory_usage_percent,
          disk_usage_percent,
          uptime_seconds,
          error_code,
          message
        )
        VALUES (
          ?, ?, ?, ?, ?, UTC_TIMESTAMP(3),
          ?, ?, ?, ?, ?, ?, ?
        )
      `,
      [
        data.serverId,
        data.checkKey,
        data.checkType,
        data.status,
        data.reportedAt,
        data.responseTimeMs,
        data.cpuUsagePercent,
        data.memoryUsagePercent,
        data.diskUsagePercent,
        data.uptimeSeconds,
        data.errorCode,
        data.message,
      ]
    );

    return Number(result.insertId);
  };

export const updateMonitoringState =
  async (connection, data) => {
    await connection.execute(
      `
        UPDATE server_monitoring_states
        SET
          last_health_check_id = ?,
          observed_status = ?,
          last_reported_at = ?,
          last_received_at = ?,

          last_online_at = CASE
            WHEN ? = 'ONLINE'
              THEN ?
            ELSE last_online_at
          END,

          last_response_time_ms = ?,

          consecutive_successes = CASE
            WHEN ? = 'ONLINE'
              THEN consecutive_successes + 1
            ELSE 0
          END,

          consecutive_failures = CASE
            WHEN ? = 'OFFLINE'
              THEN consecutive_failures + 1
            ELSE 0
          END,

          state_version = state_version + 1
        WHERE server_id = ?
      `,
      [
        data.healthCheckId,
        data.status,
        data.reportedAt,
        data.receivedAt,
        data.status,
        data.reportedAt,
        data.responseTimeMs,
        data.status,
        data.status,
        data.serverId,
      ]
    );
  };

export const updateServerHeartbeatSnapshot =
  async (connection, data) => {
    await connection.execute(
      `
        UPDATE servers
        SET
          status = ?,

          last_seen_at = CASE
            WHEN ? IN ('ONLINE', 'DEGRADED')
              THEN ?
            ELSE last_seen_at
          END,

          updated_at = UTC_TIMESTAMP(3)
        WHERE id = ?
          AND deleted_at IS NULL
      `,
      [
        data.status,
        data.status,
        data.reportedAt,
        data.serverId,
      ]
    );
  };
