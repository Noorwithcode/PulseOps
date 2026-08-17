const VALID_NODE_ENVS = new Set([
  "development",
  "test",
  "production",
]);

const requireValue = (
  name,
  {
    productionOnly = false,
  } = {}
) => {
  const isProduction =
    process.env.NODE_ENV === "production";

  if (
    productionOnly &&
    !isProduction
  ) {
    return null;
  }

  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required.`
    );
  }

  return value;
};

const validateInteger = (
  name,
  {
    fallback,
    min,
    max,
  }
) => {
  const raw =
    process.env[name]?.trim();

  const value =
    raw === undefined ||
    raw === ""
      ? fallback
      : Number(raw);

  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}.`
    );
  }

  return value;
};

const validateBoolean = (
  name,
  {
    fallback = false,
  } = {}
) => {
  const raw =
    process.env[name]?.trim();

  if (
    raw === undefined ||
    raw === ""
  ) {
    return fallback;
  }

  const normalized =
    raw.toLowerCase();

  if (
    normalized !== "true" &&
    normalized !== "false"
  ) {
    throw new Error(
      `${name} must be true or false.`
    );
  }

  return normalized === "true";
};

const validateFrontendOrigins = () => {
  const isProduction =
    process.env.NODE_ENV === "production";

  const raw =
    process.env.FRONTEND_URL?.trim();

  if (!raw) {
    return;
  }

  const origins = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error(
      "FRONTEND_URL must contain at least one valid origin."
    );
  }

  for (const origin of origins) {
    let url;

    try {
      url = new URL(origin);
    } catch {
      throw new Error(
        `FRONTEND_URL contains an invalid URL: ${origin}`
      );
    }

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      throw new Error(
        `FRONTEND_URL origin must use http or https: ${origin}`
      );
    }

    if (
      isProduction &&
      url.protocol !== "https:"
    ) {
      throw new Error(
        `Production FRONTEND_URL must use HTTPS: ${origin}`
      );
    }
  }
};

export const validateEnvironment =
  () => {
    const nodeEnv =
      process.env.NODE_ENV?.trim() ||
      "development";

    if (
      !VALID_NODE_ENVS.has(nodeEnv)
    ) {
      throw new Error(
        "NODE_ENV must be development, test, or production."
      );
    }

    process.env.NODE_ENV =
      nodeEnv;

    requireValue("DB_HOST");
    requireValue("DB_USER");
    requireValue("DB_NAME");

    validateBoolean(
      "DB_SSL"
    );

    requireValue(
      "DB_PASSWORD",
      {
        productionOnly: true,
      }
    );

    const jwtSecret =
      requireValue("JWT_SECRET");

    if (jwtSecret.length < 64) {
      throw new Error(
        "JWT_SECRET must contain at least 64 characters."
      );
    }

    if (
      nodeEnv === "production" &&
      /replace|example|change_me/i.test(
        jwtSecret
      )
    ) {
      throw new Error(
        "JWT_SECRET appears to contain a placeholder value."
      );
    }

    if (
      nodeEnv === "production"
    ) {
      requireValue(
        "JWT_EXPIRES_IN"
      );

      requireValue(
        "REFRESH_TOKEN_EXPIRES_DAYS"
      );
    }

    validateFrontendOrigins();

    validateInteger(
      "PORT",
      {
        fallback: 5000,
        min: 1,
        max: 65535,
      }
    );

    validateInteger(
      "DB_PORT",
      {
        fallback: 3306,
        min: 1,
        max: 65535,
      }
    );

    validateInteger(
      "DB_CONNECTION_LIMIT",
      {
        fallback: 10,
        min: 1,
        max: 100,
      }
    );

    validateInteger(
      "REFRESH_TOKEN_EXPIRES_DAYS",
      {
        fallback: 7,
        min: 1,
        max: 30,
      }
    );

    const requestTimeout =
      validateInteger(
        "HTTP_REQUEST_TIMEOUT_MS",
        {
          fallback: 30000,
          min: 5000,
          max: 300000,
        }
      );

    const headersTimeout =
      validateInteger(
        "HTTP_HEADERS_TIMEOUT_MS",
        {
          fallback: 15000,
          min: 5000,
          max: 120000,
        }
      );

    const keepAliveTimeout =
      validateInteger(
        "HTTP_KEEP_ALIVE_TIMEOUT_MS",
        {
          fallback: 5000,
          min: 1000,
          max: 60000,
        }
      );

    validateInteger(
      "SHUTDOWN_TIMEOUT_MS",
      {
        fallback: 10000,
        min: 3000,
        max: 60000,
      }
    );

    if (
      headersTimeout >
      requestTimeout
    ) {
      throw new Error(
        "HTTP_HEADERS_TIMEOUT_MS must be less than or equal to HTTP_REQUEST_TIMEOUT_MS."
      );
    }

    if (
      headersTimeout <=
      keepAliveTimeout
    ) {
      throw new Error(
        "HTTP_HEADERS_TIMEOUT_MS must be greater than HTTP_KEEP_ALIVE_TIMEOUT_MS."
      );
    }
  };

export default validateEnvironment;
