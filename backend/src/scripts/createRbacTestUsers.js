import "dotenv/config";
import bcrypt from "bcryptjs";

import pool from "../config/db.js";

const TEST_PASSWORD =
  process.env.RBAC_TEST_PASSWORD ||
  "PulseOps@Test2026!";

const TEST_USERS = [
  {
    fullName: "Test Responder",
    email: "responder@pulseops.local",
    roleCode: "RESPONDER",
  },
  {
    fullName: "Test Viewer",
    email: "viewer@pulseops.local",
    roleCode: "VIEWER",
  },
];

const main = async () => {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const passwordHash =
      await bcrypt.hash(
        TEST_PASSWORD,
        12
      );

    for (const testUser of TEST_USERS) {
      /*
       * Find requested role.
       */
      const [roleRows] =
        await connection.execute(
          `
            SELECT
              id,
              code,
              name
            FROM roles
            WHERE code = ?
            LIMIT 1
          `,
          [testUser.roleCode]
        );

      const role =
        roleRows[0];

      if (!role) {
        throw new Error(
          `Role ${testUser.roleCode} was not found.`
        );
      }

      /*
       * Check whether test account
       * already exists.
       */
      const [existingRows] =
        await connection.execute(
          `
            SELECT
              id
            FROM users
            WHERE email = ?
            LIMIT 1
            FOR UPDATE
          `,
          [testUser.email]
        );

      if (existingRows.length > 0) {
        /*
         * Reset only our dedicated test
         * account so repeated test runs
         * remain deterministic.
         */
        await connection.execute(
          `
            UPDATE users
            SET
              role_id = ?,
              full_name = ?,
              password_hash = ?,
              status = 'ACTIVE',
              failed_login_attempts = 0,
              locked_until = NULL,
              password_changed_at =
                UTC_TIMESTAMP(3),
              updated_at =
                UTC_TIMESTAMP(3)
            WHERE id = ?
          `,
          [
            role.id,
            testUser.fullName,
            passwordHash,
            existingRows[0].id,
          ]
        );

        console.log(
          `${testUser.roleCode} test user reset: ${testUser.email}`
        );

        continue;
      }

      /*
       * Create fresh test user.
       */
      const [result] =
        await connection.execute(
          `
            INSERT INTO users (
              role_id,
              full_name,
              email,
              password_hash,
              status,
              failed_login_attempts,
              locked_until,
              password_changed_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              'ACTIVE',
              0,
              NULL,
              UTC_TIMESTAMP(3)
            )
          `,
          [
            role.id,
            testUser.fullName,
            testUser.email,
            passwordHash,
          ]
        );

      console.log(
        `${testUser.roleCode} test user created:`,
        result.insertId,
        testUser.email
      );
    }

    await connection.commit();

    console.log("");
    console.log(
      "RBAC test accounts are ready."
    );

    console.log("");
    console.log(
      "RESPONDER:"
    );
    console.log(
      "Email: responder@pulseops.local"
    );

    console.log("");
    console.log(
      "VIEWER:"
    );
    console.log(
      "Email: viewer@pulseops.local"
    );

    console.log("");
    console.log(
      `Test password: ${TEST_PASSWORD}`
    );
  } catch (error) {
    await connection.rollback();

    console.error(
      "RBAC test user setup failed:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    connection.release();
  }
};

try {
  await main();
} finally {
  await pool.end();
}