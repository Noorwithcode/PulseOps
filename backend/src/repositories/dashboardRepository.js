const normalizeLimit = (
  value,
  fallback = 10,
  maximum = 50
) => {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.min(parsed, maximum);
};

export const findServerSummary =
  async (connection) => {
    const [rows] =
      await connection.execute(`
        SELECT
          COUNT(*) AS totalServers,

          SUM(
            CASE
              WHEN status = 'ONLINE'
                THEN 1
              ELSE 0
            END
          ) AS onlineServers,

          SUM(
            CASE
              WHEN status = 'DEGRADED'
                THEN 1
              ELSE 0
            END
          ) AS degradedServers,

          SUM(
            CASE
              WHEN status = 'OFFLINE'
                THEN 1
              ELSE 0
            END
          ) AS offlineServers,

          SUM(
            CASE
              WHEN status = 'UNKNOWN'
                THEN 1
              ELSE 0
            END
          ) AS unknownServers

        FROM servers

        WHERE deleted_at IS NULL
      `);

    return rows[0];
  };

export const findIncidentSummary =
  async (connection) => {
    const [rows] =
      await connection.execute(`
        SELECT
          COUNT(*) AS totalIncidents,

          SUM(
            CASE
              WHEN status = 'OPEN'
                THEN 1
              ELSE 0
            END
          ) AS openIncidents,

          SUM(
            CASE
              WHEN status = 'ACKNOWLEDGED'
                THEN 1
              ELSE 0
            END
          ) AS acknowledgedIncidents,

          SUM(
            CASE
              WHEN status = 'RESOLVED'
                THEN 1
              ELSE 0
            END
          ) AS resolvedIncidents,

          SUM(
            CASE
              WHEN status = 'CLOSED'
                THEN 1
              ELSE 0
            END
          ) AS closedIncidents,

          SUM(
            CASE
              WHEN status IN (
                'OPEN',
                'ACKNOWLEDGED'
              )
                THEN 1
              ELSE 0
            END
          ) AS activeIncidents,

          SUM(
            CASE
              WHEN severity = 'CRITICAL'
                AND status IN (
                  'OPEN',
                  'ACKNOWLEDGED'
                )
                THEN 1
              ELSE 0
            END
          ) AS activeCriticalIncidents,

          SUM(
            CASE
              WHEN severity = 'HIGH'
                AND status IN (
                  'OPEN',
                  'ACKNOWLEDGED'
                )
                THEN 1
              ELSE 0
            END
          ) AS activeHighIncidents

        FROM incidents
      `);

    return rows[0];
  };

export const findAlertSummary =
  async (connection) => {
    const [rows] =
      await connection.execute(`
        SELECT
          COUNT(*) AS totalStates,

          SUM(
            CASE
              WHEN states.current_status =
                'NORMAL'
                THEN 1
              ELSE 0
            END
          ) AS normalStates,

          SUM(
            CASE
              WHEN states.current_status =
                'BREACHING'
                THEN 1
              ELSE 0
            END
          ) AS breachingStates,

          SUM(
            CASE
              WHEN states.current_status =
                'ALERTING'
                THEN 1
              ELSE 0
            END
          ) AS alertingStates,

          SUM(
            CASE
              WHEN states.current_status =
                'RECOVERING'
                THEN 1
              ELSE 0
            END
          ) AS recoveringStates,

          SUM(
            CASE
              WHEN states.current_status IN (
                'ALERTING',
                'RECOVERING'
              )
                THEN 1
              ELSE 0
            END
          ) AS activeAlerts

        FROM alert_rule_states
          AS states

        INNER JOIN alert_rules
          AS rules
          ON rules.id =
            states.rule_id

        INNER JOIN servers
          ON servers.id =
            states.server_id

        WHERE rules.deleted_at IS NULL
          AND servers.deleted_at IS NULL
      `);

    return rows[0];
  };

export const findEnabledRuleSummary =
  async (connection) => {
    const [rows] =
      await connection.execute(`
        SELECT
          COUNT(*) AS totalRules,

          SUM(
            CASE
              WHEN is_enabled = 1
                THEN 1
              ELSE 0
            END
          ) AS enabledRules,

          SUM(
            CASE
              WHEN is_enabled = 0
                THEN 1
              ELSE 0
            END
          ) AS disabledRules

        FROM alert_rules

        WHERE deleted_at IS NULL
      `);

    return rows[0];
  };

export const findRecentIncidents =
  async (
    connection,
    limitValue = 10
  ) => {
    const limit =
      normalizeLimit(
        limitValue,
        10,
        50
      );

    const [rows] =
      await connection.execute(`
        SELECT
          incidents.id,

          incidents.incident_number
            AS incidentNumber,

          incidents.server_id
            AS serverId,

          servers.server_code
            AS serverCode,

          servers.name
            AS serverName,

          incidents.incident_type
            AS incidentType,

          incidents.source,
          incidents.title,
          incidents.severity,
          incidents.status,

          incidents.occurrence_count
            AS occurrenceCount,

          incidents.opened_at
            AS openedAt,

          incidents.last_occurrence_at
            AS lastOccurrenceAt,

          incidents.acknowledged_at
            AS acknowledgedAt,

          incidents.resolved_at
            AS resolvedAt,

          incidents.closed_at
            AS closedAt,

          incidents.version,

          incidents.created_at
            AS createdAt,

          incidents.updated_at
            AS updatedAt

        FROM incidents

        INNER JOIN servers
          ON servers.id =
            incidents.server_id

        WHERE servers.deleted_at IS NULL

        ORDER BY
          incidents.created_at DESC,
          incidents.id DESC

        LIMIT ${limit}
      `);

    return rows;
  };

export const findLatestServerHealth =
  async (
    connection,
    limitValue = 10
  ) => {
    const limit =
      normalizeLimit(
        limitValue,
        10,
        50
      );

    const [rows] =
      await connection.execute(`
        SELECT
          servers.id AS serverId,

          servers.server_code
            AS serverCode,

          servers.name
            AS serverName,

          servers.hostname,
          servers.environment,
          servers.status,

          servers.last_seen_at
            AS lastSeenAt,

          monitoring.last_health_check_id
            AS lastHealthCheckId,

          monitoring.observed_status
            AS observedStatus,

          monitoring.last_reported_at
            AS lastReportedAt,

          monitoring.last_received_at
            AS lastReceivedAt,

          monitoring.last_online_at
            AS lastOnlineAt,

          monitoring.last_response_time_ms
            AS lastResponseTimeMs,

          monitoring.consecutive_successes
            AS consecutiveSuccesses,

          monitoring.consecutive_failures
            AS consecutiveFailures,

          health.check_type
            AS checkType,

          health.observed_status
            AS latestCheckStatus,

          CAST(
            health.cpu_usage_percent
            AS DOUBLE
          ) AS cpuUsagePercent,

          CAST(
            health.memory_usage_percent
            AS DOUBLE
          ) AS memoryUsagePercent,

          CAST(
            health.disk_usage_percent
            AS DOUBLE
          ) AS diskUsagePercent,

          health.response_time_ms
            AS responseTimeMs,

          health.uptime_seconds
            AS uptimeSeconds,

          health.message,

          health.reported_at
            AS healthReportedAt,

          health.received_at
            AS healthReceivedAt

        FROM servers

        LEFT JOIN server_monitoring_states
          AS monitoring
          ON monitoring.server_id =
            servers.id

        LEFT JOIN server_health_checks
          AS health
          ON health.id =
            monitoring.last_health_check_id

        WHERE servers.deleted_at IS NULL

        ORDER BY
          CASE servers.status
            WHEN 'OFFLINE' THEN 1
            WHEN 'DEGRADED' THEN 2
            WHEN 'UNKNOWN' THEN 3
            WHEN 'ONLINE' THEN 4
            ELSE 5
          END,

          monitoring.last_received_at
            DESC,

          servers.id DESC

        LIMIT ${limit}
      `);

    return rows;
  };

export const findIncidentSeverityDistribution =
  async (connection) => {
    const [rows] =
      await connection.execute(`
        SELECT
          severity,
          COUNT(*) AS count

        FROM incidents

        WHERE status IN (
          'OPEN',
          'ACKNOWLEDGED'
        )

        GROUP BY severity

        ORDER BY
          FIELD(
            severity,
            'CRITICAL',
            'HIGH',
            'MEDIUM',
            'LOW'
          )
      `);

    return rows;
  };

export const findIncidentTypeDistribution =
  async (connection) => {
    const [rows] =
      await connection.execute(`
        SELECT
          incident_type
            AS incidentType,

          COUNT(*) AS count

        FROM incidents

        GROUP BY incident_type

        ORDER BY
          count DESC,
          incident_type ASC
      `);

    return rows;
  };