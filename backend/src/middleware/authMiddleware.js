import jwt from "jsonwebtoken";

import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

export const protect = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError(401, "Authentication token is required.");
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new AppError(401, "Authentication token is required.");
    }

    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 64) {
      throw new Error(
        "JWT_SECRET must contain at least 64 characters."
      );
    }

    let payload;

    try {
      payload = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: "pulseops-api",
        audience: "pulseops-web",
      });
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new AppError(401, "Access token has expired.");
      }

      throw new AppError(401, "Invalid access token.");
    }

    if (!payload || typeof payload !== "object") {
      throw new AppError(401, "Invalid access token.");
    }

    const userId = Number(payload.sub);
    const tokenIssuedAt = Number(payload.iat);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new AppError(401, "Invalid access token.");
    }

    if (!Number.isFinite(tokenIssuedAt)) {
      throw new AppError(401, "Invalid access token.");
    }

    const [users] = await pool.execute(
      `
        SELECT
          u.id,
          u.full_name,
          u.email,
          UNIX_TIMESTAMP(
            u.password_changed_at
          ) AS password_changed_at_epoch,
          r.code AS role_code,
          r.name AS role_name
        FROM users u
        INNER JOIN roles r
          ON r.id = u.role_id
        WHERE u.id = ?
          AND u.status = 'ACTIVE'
          AND r.is_active = TRUE
        LIMIT 1
      `,
      [userId]
    );

    if (users.length === 0) {
      throw new AppError(
        401,
        "User session is no longer valid."
      );
    }

    const user = users[0];

    const passwordChangedAt = Number(
      user.password_changed_at_epoch
    );

    if (
      Number.isFinite(passwordChangedAt) &&
      passwordChangedAt > tokenIssuedAt
    ) {
      throw new AppError(
        401,
        "Password was changed after this token was issued."
      );
    }

    if (payload.role !== user.role_code) {
      throw new AppError(
        401,
        "User role has changed. Please log in again."
      );
    }

    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: {
        code: user.role_code,
        name: user.role_name,
      },
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (...allowedRoles) => {
  const roleSet = new Set(
    allowedRoles.map((role) =>
      String(role).trim().toUpperCase()
    )
  );

  return (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError(401, "Authentication is required.")
      );
    }

    if (!roleSet.has(req.user.role.code)) {
      return next(
        new AppError(
          403,
          "You do not have permission for this action."
        )
      );
    }

    next();
  };
};