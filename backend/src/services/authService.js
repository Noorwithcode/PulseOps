import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import pool from "../config/db.js";
import AppError from "../utils/AppError.js";
import {
  createRefreshTokenRecord,
  hashRefreshToken,
} from "./refreshTokenService.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

const createAccessToken = (user) => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 64) {
    throw new Error(
      "JWT_SECRET must contain at least 64 characters."
    );
  }

  return jwt.sign(
    {
      role: user.roleCode,
    },
    secret,
    {
      subject: String(user.id),
      expiresIn: process.env.JWT_EXPIRES_IN || "15m",
      issuer: "pulseops-api",
      audience: "pulseops-web",
      algorithm: "HS256",
    }
  );
};

export const loginUser = async ({
  email,
  password,
  ipAddress = null,
  userAgent = null,
}) => {
  const normalizedEmail = email?.trim().toLowerCase();
  const suppliedPassword =
    typeof password === "string" ? password : "";

  if (!normalizedEmail || !suppliedPassword) {
    throw new AppError(
      400,
      "Email and password are required."
    );
  }

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [users] = await connection.execute(
      `
        SELECT
          u.id,
          u.full_name,
          u.email,
          u.password_hash,
          u.status,
          u.failed_login_attempts,
          u.locked_until,
          r.code AS role_code,
          r.name AS role_name,
          r.is_active AS role_is_active
        FROM users u
        INNER JOIN roles r
          ON r.id = u.role_id
        WHERE u.email = ?
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedEmail]
    );

    if (users.length === 0) {
      await connection.commit();
      transactionStarted = false;

      throw new AppError(
        401,
        "Invalid email or password."
      );
    }

    const user = users[0];

    if (!user.role_is_active) {
      throw new AppError(
        403,
        "Your assigned role is inactive."
      );
    }

    if (user.status === "INACTIVE") {
      throw new AppError(
        403,
        "Your account is inactive."
      );
    }

    const now = new Date();
    const lockedUntil = user.locked_until
      ? new Date(user.locked_until)
      : null;

    const activeLock =
      user.status === "LOCKED" &&
      (!lockedUntil ||
        lockedUntil.getTime() > now.getTime());

    if (activeLock) {
      throw new AppError(
        423,
        "Account is temporarily locked. Please try again later."
      );
    }

    let previousFailedAttempts = Number(
      user.failed_login_attempts || 0
    );

    if (
      user.status === "LOCKED" &&
      lockedUntil &&
      lockedUntil.getTime() <= now.getTime()
    ) {
      previousFailedAttempts = 0;

      await connection.execute(
        `
          UPDATE users
          SET
            status = 'ACTIVE',
            failed_login_attempts = 0,
            locked_until = NULL
          WHERE id = ?
        `,
        [user.id]
      );
    }

    const passwordMatches = await bcrypt.compare(
      suppliedPassword,
      user.password_hash
    );

    if (!passwordMatches) {
      const failedAttempts =
        previousFailedAttempts + 1;

      const shouldLock =
        failedAttempts >= MAX_FAILED_ATTEMPTS;

      const nextLockedUntil = shouldLock
        ? new Date(
            Date.now() +
              LOCK_DURATION_MINUTES * 60 * 1000
          )
        : null;

      await connection.execute(
        `
          UPDATE users
          SET
            failed_login_attempts = ?,
            status = ?,
            locked_until = ?
          WHERE id = ?
        `,
        [
          failedAttempts,
          shouldLock ? "LOCKED" : "ACTIVE",
          nextLockedUntil,
          user.id,
        ]
      );

      await connection.commit();
      transactionStarted = false;

      throw new AppError(
        401,
        "Invalid email or password."
      );
    }

    const authenticatedUser = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      roleCode: user.role_code,
      roleName: user.role_name,
    };

    /*
     * Older PulseOps installations could create
     * password_changed_at in the MySQL system
     * timezone while the application treated the
     * value as UTC. Such a value can appear several
     * hours in the future and invalidate every new
     * access token.
     *
     * A successful password login is a safe point to
     * repair only that impossible future timestamp.
     * Normal password-change timestamps are untouched.
     */
    await connection.execute(
      `
        UPDATE users
        SET password_changed_at = UTC_TIMESTAMP()
        WHERE id = ?
          AND password_changed_at >
            UTC_TIMESTAMP() + INTERVAL 5 MINUTE
      `,
      [user.id]
    );

    const accessToken =
      createAccessToken(authenticatedUser);

    await connection.execute(
      `
        UPDATE users
        SET
          failed_login_attempts = 0,
          locked_until = NULL,
          status = 'ACTIVE',
          last_login_at = UTC_TIMESTAMP()
        WHERE id = ?
      `,
      [user.id]
    );

    const refreshSession =
      await createRefreshTokenRecord({
        connection,
        userId: user.id,
        ipAddress,
        userAgent,
      });

    await connection.commit();
    transactionStarted = false;

    return {
      accessToken,
      refreshToken: refreshSession.refreshToken,
      tokenType: "Bearer",
      expiresIn:
        process.env.JWT_EXPIRES_IN || "15m",
      refreshTokenExpiresIn:
        refreshSession.expiresIn,
      user: {
        id: authenticatedUser.id,
        fullName: authenticatedUser.fullName,
        email: authenticatedUser.email,
        role: {
          code: authenticatedUser.roleCode,
          name: authenticatedUser.roleName,
        },
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
export const refreshUserSession = async ({
  refreshToken,
  ipAddress = null,
  userAgent = null,
}) => {
  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    throw new AppError(401, "Refresh token is required.");
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [sessions] = await connection.execute(
      `
        SELECT
          rt.id,
          rt.user_id,
          rt.token_family,
          rt.revoked_at,
          rt.revoked_reason,

          (
            rt.expires_at <= UTC_TIMESTAMP()
          ) AS is_expired,

          (
            u.password_changed_at IS NOT NULL
            AND rt.created_at < u.password_changed_at
          ) AS password_changed_after_issue,

          u.full_name,
          u.email,
          u.status AS user_status,

          r.code AS role_code,
          r.name AS role_name,
          r.is_active AS role_is_active

        FROM refresh_tokens rt

        INNER JOIN users u
          ON u.id = rt.user_id

        INNER JOIN roles r
          ON r.id = u.role_id

        WHERE rt.token_hash = ?
        LIMIT 1
        FOR UPDATE
      `,
      [tokenHash]
    );

    if (sessions.length === 0) {
      throw new AppError(401, "Invalid refresh token.");
    }

    const session = sessions[0];

    if (session.revoked_at) {
      if (session.revoked_reason === "ROTATED") {
        await connection.execute(
          `
            UPDATE refresh_tokens
            SET
              revoked_at = UTC_TIMESTAMP(),
              revoked_reason = 'REUSE_DETECTED'
            WHERE token_family = ?
              AND revoked_at IS NULL
          `,
          [session.token_family]
        );

        await connection.commit();
        transactionStarted = false;

        throw new AppError(
          401,
          "Refresh token reuse detected. Please log in again."
        );
      }

      throw new AppError(
        401,
        "Refresh session is no longer valid."
      );
    }

    if (Number(session.is_expired) === 1) {
      throw new AppError(
        401,
        "Refresh token has expired. Please log in again."
      );
    }

    if (
      session.user_status !== "ACTIVE" ||
      !session.role_is_active
    ) {
      await connection.execute(
        `
          UPDATE refresh_tokens
          SET
            revoked_at = UTC_TIMESTAMP(),
            revoked_reason = 'ADMIN_REVOKED'
          WHERE token_family = ?
            AND revoked_at IS NULL
        `,
        [session.token_family]
      );

      await connection.commit();
      transactionStarted = false;

      throw new AppError(
        401,
        "User session is no longer valid."
      );
    }

    if (Number(session.password_changed_after_issue) === 1) {
      await connection.execute(
        `
          UPDATE refresh_tokens
          SET
            revoked_at = UTC_TIMESTAMP(),
            revoked_reason = 'PASSWORD_CHANGED'
          WHERE token_family = ?
            AND revoked_at IS NULL
        `,
        [session.token_family]
      );

      await connection.commit();
      transactionStarted = false;

      throw new AppError(
        401,
        "Password has changed. Please log in again."
      );
    }

    const authenticatedUser = {
      id: session.user_id,
      fullName: session.full_name,
      email: session.email,
      roleCode: session.role_code,
      roleName: session.role_name,
    };

    const nextRefreshSession =
      await createRefreshTokenRecord({
        connection,
        userId: session.user_id,
        ipAddress,
        userAgent,
        tokenFamily: session.token_family,
      });

    const [rotationResult] = await connection.execute(
      `
        UPDATE refresh_tokens
        SET
          revoked_at = UTC_TIMESTAMP(),
          revoked_reason = 'ROTATED',
          replaced_by_token_id = ?,
          last_used_at = UTC_TIMESTAMP()
        WHERE id = ?
          AND revoked_at IS NULL
      `,
      [
        nextRefreshSession.refreshTokenId,
        session.id,
      ]
    );

    if (rotationResult.affectedRows !== 1) {
      throw new AppError(
        409,
        "Refresh session was already used."
      );
    }

    const accessToken =
      createAccessToken(authenticatedUser);

    await connection.commit();
    transactionStarted = false;

    return {
      accessToken,
      refreshToken: nextRefreshSession.refreshToken,
      tokenType: "Bearer",
      expiresIn: process.env.JWT_EXPIRES_IN || "15m",
      refreshTokenExpiresIn:
        nextRefreshSession.expiresIn,
      user: {
        id: authenticatedUser.id,
        fullName: authenticatedUser.fullName,
        email: authenticatedUser.email,
        role: {
          code: authenticatedUser.roleCode,
          name: authenticatedUser.roleName,
        },
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
export const logoutUser = async ({
  refreshToken,
}) => {
  // Logout idempotent রাখা হয়েছে।
  if (
    typeof refreshToken !== "string" ||
    !refreshToken.trim()
  ) {
    return;
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [sessions] = await connection.execute(
      `
        SELECT
          id,
          token_family
        FROM refresh_tokens
        WHERE token_hash = ?
        LIMIT 1
        FOR UPDATE
      `,
      [tokenHash]
    );

    if (sessions.length > 0) {
      await connection.execute(
        `
          UPDATE refresh_tokens
          SET
            revoked_at = COALESCE(
              revoked_at,
              UTC_TIMESTAMP()
            ),
            revoked_reason = CASE
              WHEN revoked_at IS NULL THEN 'LOGOUT'
              ELSE revoked_reason
            END,
            last_used_at = UTC_TIMESTAMP()
          WHERE token_family = ?
        `,
        [sessions[0].token_family]
      );
    }

    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    throw error;
  } finally {
    connection.release();
  }
};
