const toSafePositiveInteger = (
  value,
  fallback,
  maximum = Number.MAX_SAFE_INTEGER
) => {
  const parsedValue = Number.parseInt(value, 10);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1
  ) {
    return fallback;
  }

  return Math.min(parsedValue, maximum);
};

export const findMissedHeartbeatCandidates =
  async (
    connection,
    {
      graceMultiplier,
      minimumTimeoutSeconds,
      limit,
      serverId = null,
    }
  ) => {
    const safeGraceMultiplier =
      toSafePositiveInteger(
        graceMultiplier,
        3,
        100
      );

    const safeMinimumTimeoutSeconds =
      toSafePositiveInteger(
        minimumTimeoutSeconds,
        90,
        86400
      );

    const safeLimit =
      toSafePositiveInteger(
        limit,
        100,
        500
      );

    const conditions = [
      "servers.deleted_at IS NULL",

      `
        (
          COALESCE(
            monitoring_states.observed_status,
            'UNKNOWN'
          ) <> 'OFFLINE'

          OR servers.status <> 'OFFLINE'
        )
      `,

      `
        UTC_TIMESTAMP(3) >= TIMESTAMPADD(
          SECOND,

          GREATEST(
            COALESCE(
              servers.check_interval_seconds,
              60
            ) * ?,
            ?
          ),

          COALESCE(
            monitoring_states.last_received_at,
            servers.created_at
          )
        )
      `,
    ];

    const parameters = [
      safeGraceMultiplier,
      safeMinimumTimeoutSeconds,
    ];

    if (serverId !== null) {
      conditions.push("servers.id = ?");
      parameters.push(serverId);
    }

    const [rows] =
      await connection.execute(
        `
          SELECT
            servers.id AS serverId,

            servers.server_code
              AS serverCode,

            servers.status
              AS serverStatus,

            COALESCE(
              servers.check_interval_seconds,
              60
            ) AS checkIntervalSeconds,

            servers.created_at
              AS serverCreatedAt,

            monitoring_states.last_received_at
              AS lastReceivedAt,

            monitoring_states.observed_status
              AS observedStatus,

            monitoring_states.state_version
              AS stateVersion

          FROM servers

          LEFT JOIN server_monitoring_states
            AS monitoring_states
            ON monitoring_states.server_id =
              servers.id

          WHERE ${conditions.join("\n AND ")}

          ORDER BY
            COALESCE(
              monitoring_states.last_received_at,
              servers.created_at
            ) ASC,
            servers.id ASC

          LIMIT ${safeLimit}
        `,
        parameters
      );

    return rows;
  };

export const findServerForMissedHeartbeatForUpdate =
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

            status,

            COALESCE(
              check_interval_seconds,
              60
            ) AS checkIntervalSeconds,

            created_at
              AS createdAt

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

export const getDatabaseUtcNow =
  async (connection) => {
    const [rows] =
      await connection.execute(
        `
          SELECT
            UTC_TIMESTAMP(3) AS currentTime
        `
      );

    return rows[0]?.currentTime || null;
  };

export const updateMonitoringStateForMissedHeartbeat =
  async (
    connection,
    {
      serverId,
      healthCheckId,
      reportedAt,
    }
  ) => {
    const [result] =
      await connection.execute(
        `
          UPDATE server_monitoring_states

          SET
            last_health_check_id = ?,
            observed_status = 'OFFLINE',
            last_reported_at = ?,

            /*
             * Do not update last_received_at here.
             *
             * This is a scheduler-generated health
             * check, not a heartbeat received from
             * the monitored server.
             */
            last_response_time_ms = NULL,

            consecutive_successes = 0,

            consecutive_failures =
              consecutive_failures + 1,

            state_version =
              state_version + 1,

            updated_at =
              UTC_TIMESTAMP(3)
          WHERE server_id = ?
        `,
        [
          healthCheckId,
          reportedAt,
          serverId,
        ]
      );

    return Number(result.affectedRows);
  };
