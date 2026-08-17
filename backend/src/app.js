import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

import healthRoutes from "./routes/healthRoutes.js";
import databaseRoutes from "./routes/databaseRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import serverRoutes from "./routes/serverRoutes.js";
import heartbeatRoutes from "./routes/heartbeatRoutes.js";
import alertRuleRoutes from "./routes/alertRuleRoutes.js";
import alertManagementRoutes from "./routes/alertManagementRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import incidentRoutes from "./routes/incidentRoutes.js";

import {
  errorHandler,
  notFoundHandler,
} from "./middleware/errorMiddleware.js";

import {
  apiLimiter,
  securityHeaders,
} from "./middleware/securityMiddleware.js";

const app = express();

const isProduction =
  process.env.NODE_ENV ===
  "production";

const currentDirectory =
  path.dirname(
    fileURLToPath(
      import.meta.url
    )
  );

const frontendDistPath =
  path.resolve(
    currentDirectory,
    "../../frontend/dist"
  );

const normalizeOrigin = (
  value
) => {
  const parsed =
    new URL(value);

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    throw new Error(
      `Unsupported frontend origin protocol: ${value}`
    );
  }

  return parsed.origin;
};

const getAllowedOrigins = () => {
  const rawFrontendUrl =
    process.env.FRONTEND_URL?.trim();

  if (!rawFrontendUrl) {
    return isProduction
      ? []
      : [
          "http://localhost:5173",
        ];
  }

  const origins =
    rawFrontendUrl
      .split(",")
      .map((value) =>
        value.trim()
      )
      .filter(Boolean)
      .map(normalizeOrigin);

  if (origins.length === 0) {
    throw new Error(
      "FRONTEND_URL must contain at least one valid origin."
    );
  }

  return origins;
};

const allowedOrigins =
  new Set(
    getAllowedOrigins()
  );

/*
 * Reverse proxy configuration.
 *
 * Leave TRUST_PROXY unset for direct/local access.
 * For one trusted reverse proxy, use:
 *
 * TRUST_PROXY=1
 */
const trustProxy =
  process.env.TRUST_PROXY?.trim();

if (trustProxy) {
  if (
    /^\d+$/.test(trustProxy)
  ) {
    app.set(
      "trust proxy",
      Number(trustProxy)
    );
  } else if (
    trustProxy === "true"
  ) {
    app.set(
      "trust proxy",
      true
    );
  } else if (
    trustProxy === "false"
  ) {
    app.set(
      "trust proxy",
      false
    );
  } else {
    app.set(
      "trust proxy",
      trustProxy
    );
  }
}

/*
 * Express hardening.
 */
app.disable("x-powered-by");

/*
 * Escape HTML-sensitive characters
 * inside JSON output.
 */
app.set(
  "json escape",
  true
);

/*
 * Security headers.
 */
app.use(securityHeaders);

/*
 * CORS.
 *
 * Requests without an Origin header
 * are allowed so trusted API tools,
 * server-to-server calls, and local
 * health checks continue to work.
 */
app.use(
  cors({
    origin: (
      origin,
      callback
    ) => {
      if (!origin) {
        return callback(
          null,
          true
        );
      }

      return callback(
        null,
        allowedOrigins.has(
          origin
        )
      );
    },

    credentials: true,

    maxAge: 600,

    exposedHeaders: [
      "RateLimit",
      "RateLimit-Policy",
      "Retry-After",
    ],
  })
);

/*
 * Request parsers.
 */
app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

app.use(cookieParser());

/*
 * General API rate limiter.
 */
app.use(
  "/api",
  apiLimiter
);

/*
 * API root route.
 */
app.get(
  "/api",
  (req, res) => {
    return res
      .status(200)
      .json({
        success: true,
        message:
          "Welcome to PulseOps API",
      });
  }
);

/*
 * Health routes.
 */
app.use(
  "/api/health",
  healthRoutes
);

/*
 * Database routes.
 */
app.use(
  "/api/database",
  databaseRoutes
);

/*
 * Authentication routes.
 */
app.use(
  "/api/auth",
  authRoutes
);

/*
 * Server management routes.
 */
app.use(
  "/api/servers",
  serverRoutes
);

/*
 * Heartbeat endpoint:
 * POST /api/servers/:serverId/heartbeat
 */
app.use(
  "/api/servers",
  heartbeatRoutes
);

/*
 * Incident routes.
 */
app.use(
  "/api/incidents",
  incidentRoutes
);

/*
 * Alert rule routes.
 */
app.use(
  "/api/alert-rules",
  alertRuleRoutes
);

/*
 * Global alert/state routes.
 */
app.use(
  "/api/alerts",
  alertManagementRoutes
);

/*
 * Dashboard routes.
 */
app.use(
  "/api/dashboard",
  dashboardRoutes
);

/*
 * Notification routes.
 */
app.use(
  "/api/notifications",
  notificationRoutes
);

/*
 * In production the Express service also
 * hosts the compiled React application.
 * API requests still receive JSON 404s,
 * while browser routes fall back to the
 * SPA entry point for React Router.
 */
if (isProduction) {
  app.use(
    express.static(
      frontendDistPath,
      {
        index: false,
        maxAge: "1y",
        immutable: true,
      }
    )
  );

  app.use(
    (req, res, next) => {
      if (
        req.method !== "GET" ||
        req.path.startsWith(
          "/api"
        )
      ) {
        next();
        return;
      }

      res.set(
        "Cache-Control",
        "no-store"
      );

      res.sendFile(
        path.join(
          frontendDistPath,
          "index.html"
        ),
        (error) => {
          if (error) {
            next(error);
          }
        }
      );
    }
  );
}

/*
 * Error middleware must remain last.
 */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
