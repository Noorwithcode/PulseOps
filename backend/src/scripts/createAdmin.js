import "dotenv/config";
import bcrypt from "bcryptjs";
import pool from "../config/db.js";

const BCRYPT_ROUNDS = 12;

const createAdmin = async () => {
  const fullName = process.env.ADMIN_FULL_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!fullName || !email || !password) {
    throw new Error(
      "ADMIN_FULL_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required."
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please provide a valid ADMIN_EMAIL.");
  }

  const strongPassword =
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);

  if (!strongPassword) {
    throw new Error(
      "Admin password must have at least 12 characters, uppercase, lowercase, number and special character."
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [roles] = await connection.execute(
      `
        SELECT id
        FROM roles
        WHERE code = ?
          AND is_active = TRUE
        LIMIT 1
        FOR UPDATE
      `,
      ["ADMIN"]
    );

    if (roles.length === 0) {
      throw new Error("Active ADMIN role was not found. Run npm run db:auth.");
    }

    const [existingUsers] = await connection.execute(
      `
        SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1
        FOR UPDATE
      `,
      [email]
    );

    if (existingUsers.length > 0) {
      throw new Error(`A user already exists with email: ${email}`);
    }

    const [result] = await connection.execute(
      `
        INSERT INTO users (
          role_id,
          full_name,
          email,
          password_hash,
          status
        )
        VALUES (?, ?, ?, ?, 'ACTIVE')
      `,
      [roles[0].id, fullName, email, passwordHash]
    );

    await connection.commit();
    transactionStarted = false;

    console.log("Admin user created successfully.");
    console.log(`Admin ID: ${result.insertId}`);
    console.log(`Admin email: ${email}`);
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    if (error.code === "ER_DUP_ENTRY") {
      throw new Error(`A user already exists with email: ${email}`);
    }

    throw error;
  } finally {
    connection.release();
  }
};

createAdmin()
  .catch((error) => {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });