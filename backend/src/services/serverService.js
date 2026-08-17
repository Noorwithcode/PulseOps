import { isIP } from "node:net";

import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

import {
  countServers,
  findServerById,
  findServerRecordById,
  findServers,
  insertServer,
  restoreServerByVersion,
  softDeleteServerByVersion,
  updateServerByVersion,
  updateServerStatusByVersion,
} from "../repositories/serverRepository.js";


const ALLOWED_ENVIRONMENTS = [
  "PRODUCTION",
  "STAGING",
  "DEVELOPMENT",
  "TEST",
];

const SERVER_CODE_PATTERN =
  /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

const requireString = (
  value,
  fieldName,
  maxLength
) => {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new AppError(
      400,
      `${fieldName} is required.`
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length > maxLength) {
    throw new AppError(
      400,
      `${fieldName} cannot exceed ${maxLength} characters.`
    );
  }

  return normalizedValue;
};

const optionalString = (
  value,
  fieldName,
  maxLength
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new AppError(
      400,
      `${fieldName} must be a string.`
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length > maxLength) {
    throw new AppError(
      400,
      `${fieldName} cannot exceed ${maxLength} characters.`
    );
  }

  return normalizedValue || null;
};

const validateCreateInput = (
  input,
  createdBy
) => {
  const serverCode = requireString(
    input.serverCode,
    "Server code",
    40
  ).toUpperCase();

  if (!SERVER_CODE_PATTERN.test(serverCode)) {
    throw new AppError(
      400,
      "Server code must contain 3-40 uppercase letters, numbers, hyphens or underscores."
    );
  }

  const name = requireString(
    input.name,
    "Server name",
    120
  );

  const hostname = requireString(
    input.hostname,
    "Hostname",
    253
  ).toLowerCase();

  if (!HOSTNAME_PATTERN.test(hostname)) {
    throw new AppError(
      400,
      "Please provide a valid hostname."
    );
  }

  const ipAddress = requireString(
    input.ipAddress,
    "IP address",
    45
  );

  if (isIP(ipAddress) === 0) {
    throw new AppError(
      400,
      "Please provide a valid IPv4 or IPv6 address."
    );
  }

  const environment = String(
    input.environment || "PRODUCTION"
  )
    .trim()
    .toUpperCase();

  if (
    !ALLOWED_ENVIRONMENTS.includes(environment)
  ) {
    throw new AppError(
      400,
      `Environment must be one of: ${ALLOWED_ENVIRONMENTS.join(
        ", "
      )}.`
    );
  }

  const checkIntervalSeconds = Number(
    input.checkIntervalSeconds ?? 60
  );

  if (
    !Number.isInteger(checkIntervalSeconds) ||
    checkIntervalSeconds < 10 ||
    checkIntervalSeconds > 3600
  ) {
    throw new AppError(
      400,
      "Check interval must be an integer between 10 and 3600 seconds."
    );
  }

  const authenticatedUserId = Number(createdBy);

  if (
    !Number.isInteger(authenticatedUserId) ||
    authenticatedUserId <= 0
  ) {
    throw new AppError(
      401,
      "Authenticated user could not be resolved."
    );
  }

  return {
    serverCode,
    name,
    hostname,
    ipAddress,
    environment,

    operatingSystem: optionalString(
      input.operatingSystem,
      "Operating system",
      120
    ),

    location: optionalString(
      input.location,
      "Location",
      150
    ),

    description: optionalString(
      input.description,
      "Description",
      500
    ),

    checkIntervalSeconds,
    createdBy: authenticatedUserId,
  };
};

const mapDuplicateError = (error) => {
  if (error.code !== "ER_DUP_ENTRY") {
    return error;
  }

  const databaseMessage = String(
    error.sqlMessage || error.message || ""
  );

  if (
    databaseMessage.includes(
      "uq_servers_server_code"
    )
  ) {
    return new AppError(
      409,
      "This server code already exists."
    );
  }

  if (
    databaseMessage.includes(
      "uq_servers_hostname_environment"
    )
  ) {
    return new AppError(
      409,
      "This hostname is already registered in the selected environment."
    );
  }

  return new AppError(
    409,
    "A server with the same unique information already exists."
  );
};

export const createServer = async ({
  input,
  createdBy,
}) => {
  const validatedServer = validateCreateInput(
    input,
    createdBy
  );

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const serverId = await insertServer(
      connection,
      validatedServer
    );

    const server = await findServerById(
      connection,
      serverId
    );

    if (!server) {
      throw new AppError(
        500,
        "Server was created but could not be loaded."
      );
    }

    await connection.commit();
    transactionStarted = false;

    return server;
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    throw mapDuplicateError(error);
  } finally {
    connection.release();
  }
};
const ALLOWED_SERVER_STATUSES = [
  "ONLINE",
  "OFFLINE",
  "DEGRADED",
  "MAINTENANCE",
  "UNKNOWN",
];

const SERVER_SORT_FIELD_MAP = {
  name: "name",
  servercode: "serverCode",
  hostname: "hostname",
  environment: "environment",
  status: "status",
  lastseenat: "lastSeenAt",
  createdat: "createdAt",
  updatedat: "updatedAt",
};

const parsePositiveInteger = (
  value,
  defaultValue,
  fieldName,
  maximum
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  const parsedValue = Number(value);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    parsedValue > maximum
  ) {
    throw new AppError(
      400,
      `${fieldName} must be between 1 and ${maximum}.`
    );
  }

  return parsedValue;
};

const normalizeListFilters = (query) => {
  const page = parsePositiveInteger(
    query.page,
    1,
    "Page",
    1000000
  );

  const limit = parsePositiveInteger(
    query.limit,
    10,
    "Limit",
    100
  );

  const environment = query.environment
    ? String(query.environment)
      .trim()
      .toUpperCase()
    : null;

  if (
    environment &&
    !ALLOWED_ENVIRONMENTS.includes(environment)
  ) {
    throw new AppError(
      400,
      `Environment must be one of: ${ALLOWED_ENVIRONMENTS.join(
        ", "
      )}.`
    );
  }

  const status = query.status
    ? String(query.status)
      .trim()
      .toUpperCase()
    : null;

  if (
    status &&
    !ALLOWED_SERVER_STATUSES.includes(status)
  ) {
    throw new AppError(
      400,
      `Status must be one of: ${ALLOWED_SERVER_STATUSES.join(
        ", "
      )}.`
    );
  }

  let search = null;

  if (query.search !== undefined) {
    if (typeof query.search !== "string") {
      throw new AppError(
        400,
        "Search must be a string."
      );
    }

    search = query.search.trim() || null;

    if (search && search.length > 100) {
      throw new AppError(
        400,
        "Search cannot exceed 100 characters."
      );
    }
  }

  const requestedSortField = String(
    query.sortBy || "createdAt"
  )
    .trim()
    .toLowerCase();

  const sortBy =
    SERVER_SORT_FIELD_MAP[requestedSortField];

  if (!sortBy) {
    throw new AppError(
      400,
      `Sort field must be one of: ${Object.values(
        SERVER_SORT_FIELD_MAP
      ).join(", ")}.`
    );
  }

  const sortOrder = String(
    query.sortOrder || "DESC"
  )
    .trim()
    .toUpperCase();

  if (!["ASC", "DESC"].includes(sortOrder)) {
    throw new AppError(
      400,
      "Sort order must be ASC or DESC."
    );
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    environment,
    status,
    search,
    sortBy,
    sortOrder,
  };
};

export const listServers = async (
  query = {}
) => {
  const filters = normalizeListFilters(query);
  const connection = await pool.getConnection();

  let transactionStarted = false;

  try {
    /*
     * COUNT এবং list query একই database
     * snapshot থেকে পড়বে।
     */
    await connection.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
    );

    await connection.query(
      "START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT"
    );

    transactionStarted = true;

    const total = await countServers(
      connection,
      filters
    );

    const servers = await findServers(
      connection,
      filters
    );

    await connection.commit();
    transactionStarted = false;

    const totalPages =
      total === 0
        ? 0
        : Math.ceil(total / filters.limit);

    return {
      servers,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages,
        hasNext: filters.page < totalPages,
        hasPrevious: filters.page > 1,
      },
    };
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    throw error;
  } finally {
    connection.release();
  }
};

const validateServerId = (value) => {
  const normalizedValue = String(value || "").trim();

  if (!/^[1-9]\d*$/.test(normalizedValue)) {
    throw new AppError(
      400,
      "Server ID must be a positive integer."
    );
  }

  const serverId = Number(normalizedValue);

  if (!Number.isSafeInteger(serverId)) {
    throw new AppError(
      400,
      "Server ID is invalid."
    );
  }

  return serverId;
};

export const getServerById = async (
  serverIdValue
) => {
  const serverId = validateServerId(
    serverIdValue
  );

  const connection = await pool.getConnection();

  try {
    const server = await findServerById(
      connection,
      serverId
    );

    if (!server) {
      throw new AppError(
        404,
        "Server not found."
      );
    }

    return server;
  } finally {
    connection.release();
  }
};

const SERVER_UPDATE_FIELDS = new Set([
  "name",
  "hostname",
  "ipAddress",
  "environment",
  "operatingSystem",
  "location",
  "description",
  "checkIntervalSeconds",
  "version",
]);

const hasOwnField = (object, field) =>
  Object.prototype.hasOwnProperty.call(
    object,
    field
  );

const validateServerUpdateInput = (input) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new AppError(
      400,
      "A valid JSON request body is required."
    );
  }

  const unsupportedFields = Object.keys(
    input
  ).filter(
    (field) => !SERVER_UPDATE_FIELDS.has(field)
  );

  if (unsupportedFields.length > 0) {
    throw new AppError(
      400,
      `Unsupported update field(s): ${unsupportedFields.join(
        ", "
      )}.`
    );
  }

  const expectedVersion = Number(input.version);

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw new AppError(
      400,
      "Version must be a positive integer."
    );
  }

  const changes = {};

  if (hasOwnField(input, "name")) {
    changes.name = requireString(
      input.name,
      "Server name",
      120
    );
  }

  if (hasOwnField(input, "hostname")) {
    const hostname = requireString(
      input.hostname,
      "Hostname",
      253
    ).toLowerCase();

    if (!HOSTNAME_PATTERN.test(hostname)) {
      throw new AppError(
        400,
        "Please provide a valid hostname."
      );
    }

    changes.hostname = hostname;
  }

  if (hasOwnField(input, "ipAddress")) {
    const ipAddress = requireString(
      input.ipAddress,
      "IP address",
      45
    );

    if (isIP(ipAddress) === 0) {
      throw new AppError(
        400,
        "Please provide a valid IPv4 or IPv6 address."
      );
    }

    changes.ipAddress = ipAddress;
  }

  if (hasOwnField(input, "environment")) {
    const environment = requireString(
      input.environment,
      "Environment",
      30
    ).toUpperCase();

    if (
      !ALLOWED_ENVIRONMENTS.includes(environment)
    ) {
      throw new AppError(
        400,
        `Environment must be one of: ${ALLOWED_ENVIRONMENTS.join(
          ", "
        )}.`
      );
    }

    changes.environment = environment;
  }

  if (hasOwnField(input, "operatingSystem")) {
    changes.operatingSystem = optionalString(
      input.operatingSystem,
      "Operating system",
      120
    );
  }

  if (hasOwnField(input, "location")) {
    changes.location = optionalString(
      input.location,
      "Location",
      150
    );
  }

  if (hasOwnField(input, "description")) {
    changes.description = optionalString(
      input.description,
      "Description",
      500
    );
  }

  if (
    hasOwnField(input, "checkIntervalSeconds")
  ) {
    const checkIntervalSeconds = Number(
      input.checkIntervalSeconds
    );

    if (
      !Number.isInteger(checkIntervalSeconds) ||
      checkIntervalSeconds < 10 ||
      checkIntervalSeconds > 3600
    ) {
      throw new AppError(
        400,
        "Check interval must be an integer between 10 and 3600 seconds."
      );
    }

    changes.checkIntervalSeconds =
      checkIntervalSeconds;
  }

  if (Object.keys(changes).length === 0) {
    throw new AppError(
      400,
      "Provide at least one server field to update."
    );
  }

  return {
    expectedVersion,
    changes,
  };
};

export const updateServerDetails = async ({
  serverIdValue,
  input,
}) => {
  const serverId = validateServerId(
    serverIdValue
  );

  const {
    expectedVersion,
    changes,
  } = validateServerUpdateInput(input);

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const affectedRows =
      await updateServerByVersion(
        connection,
        serverId,
        expectedVersion,
        changes
      );

    if (affectedRows !== 1) {
      const currentServer =
        await findServerById(
          connection,
          serverId
        );

      if (!currentServer) {
        throw new AppError(
          404,
          "Server not found."
        );
      }

      throw new AppError(
        409,
        `Server was modified by another request. Current version is ${currentServer.version}. Refresh the server data and try again.`
      );
    }

    const updatedServer =
      await findServerById(
        connection,
        serverId
      );

    if (!updatedServer) {
      throw new AppError(
        500,
        "Server was updated but could not be loaded."
      );
    }

    await connection.commit();
    transactionStarted = false;

    return updatedServer;
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    throw mapDuplicateError(error);
  } finally {
    connection.release();
  }
};

const SERVER_STATUS_FIELDS = new Set([
  "status",
  "version",
]);

const validateStatusUpdateInput = (input) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new AppError(
      400,
      "A valid JSON request body is required."
    );
  }

  const unsupportedFields = Object.keys(
    input
  ).filter(
    (field) => !SERVER_STATUS_FIELDS.has(field)
  );

  if (unsupportedFields.length > 0) {
    throw new AppError(
      400,
      `Unsupported status field(s): ${unsupportedFields.join(
        ", "
      )}.`
    );
  }

  const status = String(
    input.status || ""
  )
    .trim()
    .toUpperCase();

  if (!ALLOWED_SERVER_STATUSES.includes(status)) {
    throw new AppError(
      400,
      `Status must be one of: ${ALLOWED_SERVER_STATUSES.join(
        ", "
      )}.`
    );
  }

  const expectedVersion = Number(
    input.version
  );

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw new AppError(
      400,
      "Version must be a positive integer."
    );
  }

  return {
    status,
    expectedVersion,
  };
};

export const changeServerStatus = async ({
  serverIdValue,
  input,
}) => {
  const serverId = validateServerId(
    serverIdValue
  );

  const {
    status,
    expectedVersion,
  } = validateStatusUpdateInput(input);

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const affectedRows =
      await updateServerStatusByVersion(
        connection,
        serverId,
        expectedVersion,
        status
      );

    if (affectedRows !== 1) {
      const currentServer =
        await findServerById(
          connection,
          serverId
        );

      if (!currentServer) {
        throw new AppError(
          404,
          "Server not found."
        );
      }

      throw new AppError(
        409,
        `Server was modified by another request. Current version is ${currentServer.version}. Refresh the server data and try again.`
      );
    }

    const updatedServer =
      await findServerById(
        connection,
        serverId
      );

    if (!updatedServer) {
      throw new AppError(
        500,
        "Server status was updated but could not be loaded."
      );
    }

    await connection.commit();
    transactionStarted = false;

    return updatedServer;
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    throw error;
  } finally {
    connection.release();
  }
};


const validateServerDeleteInput = (input) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new AppError(
      400,
      "A valid JSON request body is required."
    );
  }

  const unsupportedFields = Object.keys(
    input
  ).filter((field) => field !== "version");

  if (unsupportedFields.length > 0) {
    throw new AppError(
      400,
      `Unsupported delete field(s): ${unsupportedFields.join(
        ", "
      )}.`
    );
  }

  const expectedVersion = Number(
    input.version
  );

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw new AppError(
      400,
      "Version must be a positive integer."
    );
  }

  return expectedVersion;
};

export const deleteServerSafely = async ({
  serverIdValue,
  input,
}) => {
  const serverId = validateServerId(
    serverIdValue
  );

  const expectedVersion =
    validateServerDeleteInput(input);

  const connection =
    await pool.getConnection();

  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const affectedRows =
      await softDeleteServerByVersion(
        connection,
        serverId,
        expectedVersion
      );

    if (affectedRows !== 1) {
      const currentRecord =
        await findServerRecordById(
          connection,
          serverId
        );

      if (!currentRecord) {
        throw new AppError(
          404,
          "Server not found."
        );
      }

      if (currentRecord.deletedAt) {
        throw new AppError(
          409,
          "Server has already been deleted."
        );
      }

      throw new AppError(
        409,
        `Server was modified by another request. Current version is ${currentRecord.version}. Refresh the server data and try again.`
      );
    }

    const deletedRecord =
      await findServerRecordById(
        connection,
        serverId
      );

    if (
      !deletedRecord?.deletedAt ||
      Number(deletedRecord.version) !==
        expectedVersion + 1
    ) {
      throw new AppError(
        500,
        "Server deletion verification failed."
      );
    }

    await connection.commit();
    transactionStarted = false;

    return {
      serverId: deletedRecord.id,
      serverCode: deletedRecord.serverCode,
      deletedVersion: Number(
        deletedRecord.version
      ),
      deletedAt: deletedRecord.deletedAt,
    };
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    throw error;
  } finally {
    connection.release();
  }
};

const validateServerRestoreInput = (input) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new AppError(
      400,
      "A valid JSON request body is required."
    );
  }

  const unsupportedFields = Object.keys(
    input
  ).filter((field) => field !== "version");

  if (unsupportedFields.length > 0) {
    throw new AppError(
      400,
      `Unsupported restore field(s): ${unsupportedFields.join(
        ", "
      )}.`
    );
  }

  const expectedVersion = Number(
    input.version
  );

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw new AppError(
      400,
      "Version must be a positive integer."
    );
  }

  return expectedVersion;
};

export const restoreServerSafely = async ({
  serverIdValue,
  input,
}) => {
  const serverId = validateServerId(
    serverIdValue
  );

  const expectedVersion =
    validateServerRestoreInput(input);

  const connection =
    await pool.getConnection();

  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const affectedRows =
      await restoreServerByVersion(
        connection,
        serverId,
        expectedVersion
      );

    if (affectedRows !== 1) {
      const currentRecord =
        await findServerRecordById(
          connection,
          serverId
        );

      if (!currentRecord) {
        throw new AppError(
          404,
          "Server not found."
        );
      }

      if (!currentRecord.deletedAt) {
        throw new AppError(
          409,
          "Server is already active."
        );
      }

      throw new AppError(
        409,
        `Server was modified by another request. Current version is ${currentRecord.version}. Refresh the server data and try again.`
      );
    }

    const restoredServer =
      await findServerById(
        connection,
        serverId
      );

    if (
      !restoredServer ||
      Number(restoredServer.version) !==
        expectedVersion + 1
    ) {
      throw new AppError(
        500,
        "Server restoration verification failed."
      );
    }

    await connection.commit();
    transactionStarted = false;

    return restoredServer;
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    throw error;
  } finally {
    connection.release();
  }
};

