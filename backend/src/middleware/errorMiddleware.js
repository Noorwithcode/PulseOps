export const notFoundHandler = (
  req,
  res,
  next
) => {
  const error = new Error(
    `Route ${req.method} ${req.originalUrl} was not found.`
  );

  error.statusCode = 404;

  next(error);
};

export const errorHandler = (
  error,
  req,
  res,
  next
) => {
  /*
   * -------------------------------------------------------
   * Default error values
   * -------------------------------------------------------
   */

  let statusCode =
    Number(error?.statusCode) ||
    Number(error?.status) ||
    500;

  let message =
    error?.message ||
    "Internal server error.";

  /*
   * -------------------------------------------------------
   * MySQL duplicate key
   * -------------------------------------------------------
   */

  if (
    error?.code ===
    "ER_DUP_ENTRY"
  ) {
    statusCode = 409;

    message =
      "A duplicate database record was detected.";
  }

  /*
   * -------------------------------------------------------
   * MySQL foreign key reference error
   * -------------------------------------------------------
   */

  if (
    error?.code ===
    "ER_NO_REFERENCED_ROW_2"
  ) {
    statusCode = 400;

    message =
      "A referenced database record does not exist.";
  }

  /*
   * -------------------------------------------------------
   * MySQL foreign key delete/update restriction
   * -------------------------------------------------------
   */

  if (
    error?.code ===
    "ER_ROW_IS_REFERENCED_2"
  ) {
    statusCode = 409;

    message =
      "This record cannot be modified because another record depends on it.";
  }

  /*
   * -------------------------------------------------------
   * Bad database column/schema
   * -------------------------------------------------------
   */

  if (
    error?.code ===
    "ER_BAD_FIELD_ERROR"
  ) {
    statusCode = 500;

    message =
      process.env.NODE_ENV ===
        "production"
        ? "A database schema error occurred."
        : error.message;
  }

  /*
   * -------------------------------------------------------
   * Invalid database value
   * -------------------------------------------------------
   */

  if (
    error?.code ===
    "ER_TRUNCATED_WRONG_VALUE" ||
    error?.code ===
    "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD"
  ) {
    statusCode = 400;

    message =
      process.env.NODE_ENV ===
        "production"
        ? "An invalid value was supplied."
        : error.message;
  }

  /*
   * -------------------------------------------------------
   * Database connection errors
   * -------------------------------------------------------
   */

  if (
    [
      "ECONNREFUSED",
      "PROTOCOL_CONNECTION_LOST",
      "ER_CON_COUNT_ERROR",
      "ETIMEDOUT",
    ].includes(error?.code)
  ) {
    statusCode = 503;

    message =
      "Database service is temporarily unavailable.";
  }

  /*
   * -------------------------------------------------------
   * Ensure valid HTTP status
   * -------------------------------------------------------
   */

  if (
    !Number.isInteger(statusCode) ||
    statusCode < 400 ||
    statusCode > 599
  ) {
    statusCode = 500;
  }

  /*
   * -------------------------------------------------------
   * Build safe response
   * -------------------------------------------------------
   */

  const response = {
    success: false,
    message,
  };

  /*
   * -------------------------------------------------------
   * Development debugging only
   *
   * NEVER expose stack traces in production.
   * -------------------------------------------------------
   */

  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    response.stack =
      error?.stack || null;

    if (error?.code) {
      response.errorCode =
        error.code;
    }
  }

  /*
   * -------------------------------------------------------
   * Server-side logging
   * -------------------------------------------------------
   */

  if (statusCode >= 500) {
    console.error(
      "[PulseOps Error]",
      {
        method: req.method,
        path: req.originalUrl,
        statusCode,
        message:
          error?.message ||
          message,
        code:
          error?.code ||
          null,
        stack:
          error?.stack ||
          null,
      }
    );
  }

  /*
   * -------------------------------------------------------
   * If response already started,
   * delegate to Express.
   * -------------------------------------------------------
   */

  if (res.headersSent) {
    return next(error);
  }

  return res
    .status(statusCode)
    .json(response);
};