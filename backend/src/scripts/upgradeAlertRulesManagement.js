import "dotenv/config";

import pool from "../config/db.js";

const MIGRATION_LOCK =
  "pulseops:upgrade:alert-rules-management:v1";

const columnExists = async (
  connection,
  tableName,
  columnName
) => {
  const [rows] =
    await connection.execute(
      `
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1
      `,
      [
        tableName,
        columnName,
      ]
    );

  return rows.length > 0;
};

const indexExists = async (
  connection,
  tableName,
  indexName
) => {
  const [rows] =
    await connection.execute(
      `
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND INDEX_NAME = ?
        LIMIT 1
      `,
      [
        tableName,
        indexName,
      ]
    );

  return rows.length > 0;
};

const foreignKeyExists = async (
  connection,
  tableName,
  constraintName
) => {
  const [rows] =
    await connection.execute(
      `
        SELECT 1
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND CONSTRAINT_NAME = ?
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        LIMIT 1
      `,
      [
        tableName,
        constraintName,
      ]
    );

  return rows.length > 0;
};

const ensureColumn = async (
  connection,
  {
    tableName,
    columnName,
    definition,
  }
) => {
  const exists =
    await columnExists(
      connection,
      tableName,
      columnName
    );

  if (!exists) {
    await connection.query(
      `
        ALTER TABLE ${tableName}
        ADD COLUMN ${columnName} ${definition}
      `
    );
  }
};

const ensureIndex = async (
  connection,
  {
    tableName,
    indexName,
    definition,
  }
) => {
  const exists =
    await indexExists(
      connection,
      tableName,
      indexName
    );

  if (!exists) {
    await connection.query(
      `
        ALTER TABLE ${tableName}
        ADD ${definition}
      `
    );
  }
};

const ensureForeignKey = async (
  connection,
  {
    tableName,
    constraintName,
    definition,
  }
) => {
  const exists =
    await foreignKeyExists(
      connection,
      tableName,
      constraintName
    );

  if (!exists) {
    await connection.query(
      `
        ALTER TABLE ${tableName}
        ADD CONSTRAINT ${constraintName}
        ${definition}
      `
    );
  }
};

const runMigration = async () => {
  const connection =
    await pool.getConnection();

  let lockAcquired = false;

  try {
    const [lockRows] =
      await connection.execute(
        `
          SELECT GET_LOCK(?, 30)
            AS acquired
        `,
        [MIGRATION_LOCK]
      );

    lockAcquired =
      Number(
        lockRows[0]?.acquired
      ) === 1;

    if (!lockAcquired) {
      throw new Error(
        "Could not acquire alert-rule migration lock."
      );
    }

    await ensureColumn(
      connection,
      {
        tableName:
          "alert_rules",

        columnName:
          "version",

        definition:
          `
            INT UNSIGNED
            NOT NULL DEFAULT 1
            AFTER is_enabled
          `,
      }
    );

    await ensureColumn(
      connection,
      {
        tableName:
          "alert_rules",

        columnName:
          "created_by",

        definition:
          `
            BIGINT UNSIGNED NULL
            AFTER version
          `,
      }
    );

    await ensureColumn(
      connection,
      {
        tableName:
          "alert_rules",

        columnName:
          "updated_by",

        definition:
          `
            BIGINT UNSIGNED NULL
            AFTER created_by
          `,
      }
    );

    await ensureColumn(
      connection,
      {
        tableName:
          "alert_rules",

        columnName:
          "deleted_at",

        definition:
          `
            DATETIME(3) NULL
            AFTER updated_by
          `,
      }
    );

    await ensureIndex(
      connection,
      {
        tableName:
          "alert_rules",

        indexName:
          "idx_alert_rules_deleted",

        definition:
          `
            KEY idx_alert_rules_deleted (
              deleted_at,
              is_enabled
            )
          `,
      }
    );

    await ensureIndex(
      connection,
      {
        tableName:
          "alert_rules",

        indexName:
          "idx_alert_rules_created_by",

        definition:
          `
            KEY idx_alert_rules_created_by (
              created_by
            )
          `,
      }
    );

    await ensureIndex(
      connection,
      {
        tableName:
          "alert_rules",

        indexName:
          "idx_alert_rules_updated_by",

        definition:
          `
            KEY idx_alert_rules_updated_by (
              updated_by
            )
          `,
      }
    );

    await ensureForeignKey(
      connection,
      {
        tableName:
          "alert_rules",

        constraintName:
          "fk_alert_rules_created_by",

        definition:
          `
            FOREIGN KEY (created_by)
            REFERENCES users(id)
            ON DELETE SET NULL
            ON UPDATE RESTRICT
          `,
      }
    );

    await ensureForeignKey(
      connection,
      {
        tableName:
          "alert_rules",

        constraintName:
          "fk_alert_rules_updated_by",

        definition:
          `
            FOREIGN KEY (updated_by)
            REFERENCES users(id)
            ON DELETE SET NULL
            ON UPDATE RESTRICT
          `,
      }
    );

    console.log(
      "Alert-rule management migration completed."
    );

    console.log(
      "Added/verified: version"
    );

    console.log(
      "Added/verified: created_by"
    );

    console.log(
      "Added/verified: updated_by"
    );

    console.log(
      "Added/verified: deleted_at"
    );
  } finally {
    if (lockAcquired) {
      try {
        await connection.execute(
          "SELECT RELEASE_LOCK(?)",
          [MIGRATION_LOCK]
        );
      } catch (error) {
        console.error(
          "Migration lock release failed:",
          error.message
        );
      }
    }

    connection.release();
  }
};

try {
  await runMigration();
} catch (error) {
  console.error(
    "Alert-rule management migration failed:",
    error.message
  );

  process.exitCode = 1;
} finally {
  await pool.end();
}
