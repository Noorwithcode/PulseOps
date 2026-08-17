import "dotenv/config";
import pool from "../config/db.js";

const defaultRoles = [
  {
    code: "ADMIN",
    name: "Administrator",
    description: "Complete system access",
  },
  {
    code: "RESPONDER",
    name: "Incident Responder",
    description: "Manage monitors and respond to incidents",
  },
  {
    code: "VIEWER",
    name: "Viewer",
    description: "Read-only dashboard access",
  },
];

const setupAuthTables = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
        code VARCHAR(30) NOT NULL,
        name VARCHAR(60) NOT NULL,
        description VARCHAR(255) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL
          DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (id),
        UNIQUE KEY uq_roles_code (code)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        role_id TINYINT UNSIGNED NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        email VARCHAR(191) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,

        status ENUM(
          'ACTIVE',
          'INACTIVE',
          'LOCKED'
        ) NOT NULL DEFAULT 'ACTIVE',

        failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        locked_until DATETIME NULL,
        last_login_at DATETIME NULL,
        password_changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL
          DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,

        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email),
        KEY idx_users_role_status (role_id, status),

        CONSTRAINT fk_users_role
          FOREIGN KEY (role_id)
          REFERENCES roles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    await connection.beginTransaction();

    for (const role of defaultRoles) {
      await connection.execute(
        `
          INSERT INTO roles (
            code,
            name,
            description
          )
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = ?,
            description = ?,
            is_active = TRUE
        `,
        [
          role.code,
          role.name,
          role.description,
          role.name,
          role.description,
        ]
      );
    }

    await connection.commit();

    console.log("Authentication tables and default roles created successfully.");
  } catch (error) {
    await connection.rollback();
    console.error("Authentication table setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
};

setupAuthTables();