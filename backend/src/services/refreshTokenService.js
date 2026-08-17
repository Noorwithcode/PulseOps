import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

const getRefreshTokenExpiryDays = () => {
  const expiryDays = Number(
    process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7
  );

  if (
    !Number.isInteger(expiryDays) ||
    expiryDays < 1 ||
    expiryDays > 30
  ) {
    throw new Error(
      "REFRESH_TOKEN_EXPIRES_DAYS must be between 1 and 30."
    );
  }

  return expiryDays;
};

export const hashRefreshToken = (token) => {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("A refresh token is required.");
  }

  return createHash("sha256")
    .update(token)
    .digest("hex");
};

export const createRefreshTokenRecord = async ({
  connection,
  userId,
  ipAddress = null,
  userAgent = null,
  tokenFamily = randomUUID(),
}) => {
  if (!connection) {
    throw new Error("Database connection is required.");
  }

  if (!Number.isSafeInteger(Number(userId))) {
    throw new Error("A valid user ID is required.");
  }

  const expiryDays = getRefreshTokenExpiryDays();

  const refreshToken = randomBytes(64).toString("base64url");
  const tokenHash = hashRefreshToken(refreshToken);

  const safeIpAddress =
    typeof ipAddress === "string"
      ? ipAddress.trim().slice(0, 45)
      : null;

  const safeUserAgent =
    typeof userAgent === "string"
      ? userAgent.trim().slice(0, 500)
      : null;

  const [result] = await connection.execute(
    `
      INSERT INTO refresh_tokens (
        user_id,
        token_hash,
        token_family,
        expires_at,
        created_ip,
        user_agent
      )
      VALUES (
        ?,
        ?,
        ?,
        DATE_ADD(
          UTC_TIMESTAMP(),
          INTERVAL ${expiryDays} DAY
        ),
        ?,
        ?
      )
    `,
    [
      Number(userId),
      tokenHash,
      tokenFamily,
      safeIpAddress,
      safeUserAgent,
    ]
  );

  return {
    refreshToken,
    refreshTokenId: result.insertId,
    tokenFamily,
    expiresIn: `${expiryDays}d`,
  };
};