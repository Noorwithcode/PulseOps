export const insertServer = async (
  connection,
  server
) => {
  const [result] = await connection.execute(
    `
      INSERT INTO servers (
        server_code,
        name,
        hostname,
        ip_address,
        environment,
        operating_system,
        location,
        description,
        check_interval_seconds,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      server.serverCode,
      server.name,
      server.hostname,
      server.ipAddress,
      server.environment,
      server.operatingSystem,
      server.location,
      server.description,
      server.checkIntervalSeconds,
      server.createdBy,
    ]
  );

  return result.insertId;
};

export const findServerById = async (
  connection,
  serverId
) => {
  const [rows] = await connection.execute(
    `
      SELECT
        s.id,
        s.server_code AS serverCode,
        s.name,
        s.hostname,
        s.ip_address AS ipAddress,
        s.environment,
        s.operating_system AS operatingSystem,
        s.location,
        s.description,
        s.status,
        s.check_interval_seconds AS checkIntervalSeconds,
        s.last_seen_at AS lastSeenAt,
        s.version,
        s.created_by AS createdBy,
        s.created_at AS createdAt,
        s.updated_at AS updatedAt
      FROM servers s
      WHERE s.id = ?
        AND s.deleted_at IS NULL
      LIMIT 1
    `,
    [serverId]
  );

  return rows[0] || null;
};

const SERVER_SORT_COLUMNS = {
  name: "s.name",
  serverCode: "s.server_code",
  hostname: "s.hostname",
  environment: "s.environment",
  status: "s.status",
  lastSeenAt: "s.last_seen_at",
  createdAt: "s.created_at",
  updatedAt: "s.updated_at",
};

const buildServerListWhere = ({
  environment,
  status,
  search,
}) => {
  const conditions = [
    "s.deleted_at IS NULL",
  ];

  const parameters = [];

  if (environment) {
    conditions.push("s.environment = ?");
    parameters.push(environment);
  }

  if (status) {
    conditions.push("s.status = ?");
    parameters.push(status);
  }

  if (search) {
    conditions.push(`
      (
        LOCATE(?, s.server_code) > 0
        OR LOCATE(?, s.name) > 0
        OR LOCATE(?, s.hostname) > 0
        OR LOCATE(?, s.ip_address) > 0
        OR LOCATE(
          ?,
          COALESCE(s.location, '')
        ) > 0
      )
    `);

    parameters.push(
      search,
      search,
      search,
      search,
      search
    );
  }

  return {
    whereClause:
      `WHERE ${conditions.join(" AND ")}`,
    parameters,
  };
};

export const countServers = async (
  connection,
  filters
) => {
  const {
    whereClause,
    parameters,
  } = buildServerListWhere(filters);

  const [rows] = await connection.execute(
    `
      SELECT COUNT(*) AS total
      FROM servers s
      ${whereClause}
    `,
    parameters
  );

  return Number(rows[0]?.total || 0);
};

export const findServers = async (
  connection,
  filters
) => {
  const {
    whereClause,
    parameters,
  } = buildServerListWhere(filters);

  const sortColumn =
    SERVER_SORT_COLUMNS[filters.sortBy] ||
    SERVER_SORT_COLUMNS.createdAt;

  const sortOrder =
    filters.sortOrder === "ASC"
      ? "ASC"
      : "DESC";

  const limit = Number(filters.limit);
  const offset = Number(filters.offset);

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new Error(
      "Invalid pagination values supplied to repository."
    );
  }

  /*
   * LIMIT ও OFFSET validated integers।
   * সরাসরি SQL-এ বসানোয় MySQL prepared
   * statement-এর ER_WRONG_ARGUMENTS সমস্যা হবে না।
   */
  const [rows] = await connection.query(
    `
      SELECT
        s.id,
        s.server_code AS serverCode,
        s.name,
        s.hostname,
        s.ip_address AS ipAddress,
        s.environment,
        s.operating_system AS operatingSystem,
        s.location,
        s.description,
        s.status,
        s.check_interval_seconds AS checkIntervalSeconds,
        s.last_seen_at AS lastSeenAt,
        s.version,
        s.created_by AS createdBy,
        s.created_at AS createdAt,
        s.updated_at AS updatedAt
      FROM servers s
      ${whereClause}
      ORDER BY
        ${sortColumn} ${sortOrder},
        s.id ${sortOrder}
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    parameters
  );

  return rows;
};

const SERVER_UPDATE_COLUMNS = {
  name: "name",
  hostname: "hostname",
  ipAddress: "ip_address",
  environment: "environment",
  operatingSystem: "operating_system",
  location: "location",
  description: "description",
  checkIntervalSeconds: "check_interval_seconds",
};

export const updateServerByVersion = async (
  connection,
  serverId,
  expectedVersion,
  changes
) => {
  const assignments = [];
  const parameters = [];

  for (const [field, value] of Object.entries(changes)) {
    const column = SERVER_UPDATE_COLUMNS[field];

    if (!column) {
      throw new Error(
        `Unsupported server update field: ${field}`
      );
    }

    assignments.push(`${column} = ?`);
    parameters.push(value);
  }

  assignments.push("version = version + 1");
  assignments.push(
    "updated_at = CURRENT_TIMESTAMP(3)"
  );

  const [result] = await connection.execute(
    `
      UPDATE servers
      SET ${assignments.join(", ")}
      WHERE id = ?
        AND version = ?
        AND deleted_at IS NULL
    `,
    [
      ...parameters,
      serverId,
      expectedVersion,
    ]
  );

  return Number(result.affectedRows);
};

export const updateServerStatusByVersion = async (
  connection,
  serverId,
  expectedVersion,
  status
) => {
  const [result] = await connection.execute(
    `
      UPDATE servers
      SET
        status = ?,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
        AND version = ?
        AND deleted_at IS NULL
    `,
    [
      status,
      serverId,
      expectedVersion,
    ]
  );

  return Number(result.affectedRows);
};

export const findServerRecordById = async (
  connection,
  serverId
) => {
  const [rows] = await connection.execute(
    `
      SELECT
        id,
        server_code AS serverCode,
        version,
        deleted_at AS deletedAt
      FROM servers
      WHERE id = ?
      LIMIT 1
    `,
    [serverId]
  );

  return rows[0] || null;
};

export const softDeleteServerByVersion = async (
  connection,
  serverId,
  expectedVersion
) => {
  const [result] = await connection.execute(
    `
      UPDATE servers
      SET
        deleted_at = CURRENT_TIMESTAMP(3),
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
        AND version = ?
        AND deleted_at IS NULL
    `,
    [
      serverId,
      expectedVersion,
    ]
  );

  return Number(result.affectedRows);
};

export const restoreServerByVersion = async (
  connection,
  serverId,
  expectedVersion
) => {
  const [result] = await connection.execute(
    `
      UPDATE servers
      SET
        deleted_at = NULL,
        status = 'UNKNOWN',
        last_seen_at = NULL,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
        AND version = ?
        AND deleted_at IS NOT NULL
    `,
    [
      serverId,
      expectedVersion,
    ]
  );

  return Number(result.affectedRows);
};