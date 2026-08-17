import "dotenv/config";

import http from "node:http";

import app from "./app.js";

import pool, {
  testDatabaseConnection,
} from "./config/db.js";

import {
  startHealthMonitoringJob,
  stopHealthMonitoringJob,
} from "./jobs/healthMonitoringJob.js";

import {
  validateEnvironment,
} from "./config/envValidation.js";

validateEnvironment();

const PORT =
  Number(process.env.PORT) ||
  5000;

const HTTP_REQUEST_TIMEOUT_MS =
  Number(
    process.env
      .HTTP_REQUEST_TIMEOUT_MS
  ) || 30000;

const HTTP_HEADERS_TIMEOUT_MS =
  Number(
    process.env
      .HTTP_HEADERS_TIMEOUT_MS
  ) || 15000;

const HTTP_KEEP_ALIVE_TIMEOUT_MS =
  Number(
    process.env
      .HTTP_KEEP_ALIVE_TIMEOUT_MS
  ) || 5000;

const SHUTDOWN_TIMEOUT_MS =
  Number(
    process.env
      .SHUTDOWN_TIMEOUT_MS
  ) || 10000;

let server;
let isShuttingDown = false;
let monitoringStarted = false;

const closeHttpServer =
  async () => {
    if (
      !server ||
      !server.listening
    ) {
      return;
    }

    if (
      typeof server
        .closeIdleConnections ===
      "function"
    ) {
      server.closeIdleConnections();
    }

    await new Promise(
      (resolve, reject) => {
        server.close(
          (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          }
        );
      }
    );
  };

const startHttpServer =
  async () => {
    server =
      http.createServer(app);

    /*
     * Protect the API from excessively
     * slow or long-lived HTTP requests.
     */
    server.requestTimeout =
      HTTP_REQUEST_TIMEOUT_MS;

    server.headersTimeout =
      HTTP_HEADERS_TIMEOUT_MS;

    server.keepAliveTimeout =
      HTTP_KEEP_ALIVE_TIMEOUT_MS;

    server.maxHeadersCount = 100;

    await new Promise(
      (resolve, reject) => {
        const onError =
          (error) => {
            reject(error);
          };

        server.once(
          "error",
          onError
        );

        server.listen(
          PORT,
          "0.0.0.0",
          () => {
            server.off(
              "error",
              onError
            );

            resolve();
          }
        );
      }
    );
  };

const startServer = async () => {
  try {
    const database =
      await testDatabaseConnection();

    console.log(
      `Database connected: ${database.databaseName} at ${database.databaseTime}`
    );

    await startHttpServer();

    console.log(
      `PulseOps API running on http://localhost:${PORT}`
    );

    startHealthMonitoringJob();
    monitoringStarted = true;
  } catch (error) {
    console.error(
      "PulseOps startup failed:",
      error.message
    );

    try {
      if (monitoringStarted) {
        await stopHealthMonitoringJob();
        monitoringStarted = false;
      }

      await closeHttpServer();
      await pool.end();
    } catch (
    cleanupError
    ) {
      console.error(
        "Startup cleanup failed:",
        cleanupError.message
      );
    }

    process.exit(1);
  }
};

const shutdown = async (
  signal,
  exitCode = 0
) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(
    `${signal} received. Shutting down safely...`
  );

  const forceShutdownTimer =
    setTimeout(
      () => {
        console.error(
          "Graceful shutdown timed out. Forcing process exit."
        );

        process.exit(1);
      },
      SHUTDOWN_TIMEOUT_MS
    );

  forceShutdownTimer.unref();

  try {
    /*
     * Stop scheduler before closing
     * the database connection pool.
     */
    if (monitoringStarted) {
      await stopHealthMonitoringJob();
      monitoringStarted = false;
    }

    await closeHttpServer();

    if (server) {
      console.log(
        "HTTP server closed."
      );
    }

    await pool.end();

    console.log(
      "Database connection pool closed."
    );

    clearTimeout(
      forceShutdownTimer
    );

    process.exit(exitCode);
  } catch (error) {
    clearTimeout(
      forceShutdownTimer
    );

    console.error(
      "Shutdown error:",
      error.message
    );

    process.exit(1);
  }
};

process.on(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT",
      0
    )
);

process.on(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM",
      0
    )
);

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "Unhandled promise rejection:",
      reason
    );

    shutdown(
      "UNHANDLED_REJECTION",
      1
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught exception:",
      error
    );

    shutdown(
      "UNCAUGHT_EXCEPTION",
      1
    );
  }
);

startServer();