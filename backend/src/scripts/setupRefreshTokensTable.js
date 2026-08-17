import "dotenv/config";
import pool from "../config/db.js";

const setupRefreshTokensTable = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        token_hash CHAR(64) NOT NULL,
        token_family CHAR(36) NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        revoked_reason ENUM(
          'ROTATED',
          'LOGOUT',
          'REUSE_DETECTED',
          'PASSWORD_CHANGED',
          'ADMIN_REVOKED'
        ) NULL,
        replaced_by_token_id BIGINT UNSIGNED NULL,
        created_ip VARCHAR(45) NULL,
        user_agent VARCHAR(500) NULL,
        last_used_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (id),
        UNIQUE KEY uq_refresh_tokens_hash (token_hash),
        KEY idx_refresh_tokens_user (
          user_id,
          revoked_at,
          expires_at
        ),
        KEY idx_refresh_tokens_family (token_family),
        KEY idx_refresh_tokens_replacement (
          replaced_by_token_id
        ),

        CONSTRAINT fk_refresh_tokens_user
          FOREIGN KEY (user_id)
          REFERENCES users (id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,

        CONSTRAINT fk_refresh_tokens_replacement
          FOREIGN KEY (replaced_by_token_id)
          REFERENCES refresh_tokens (id)
          ON UPDATE RESTRICT
          ON DELETE SET NULL
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    console.log("Refresh token table created successfully.");
  } catch (error) {
    console.error(
      "Refresh token table setup failed:",
      error.message
    );
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
};

setupRefreshTokensTable();