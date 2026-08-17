import "dotenv/config";
import mysql from "mysql2";

const useDatabaseTls =
  process.env.DB_SSL
    ?.trim()
    .toLowerCase() ===
  "true";

const rawPool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: useDatabaseTls
    ? {
        minVersion:
          "TLSv1.2",
        rejectUnauthorized:
          true,
      }
    : undefined,

  waitForConnections: true,
  connectionLimit:
    Number(process.env.DB_CONNECTION_LIMIT) || 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,

  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  /*
   * Node.js ↔ MySQL date conversion uses UTC.
   */
  timezone: "Z",
  decimalNumbers: true,
});

/*
 * MySQL CURRENT_TIMESTAMP, NOW() এবং default
 * timestamp-গুলোও UTC-তে তৈরি হবে।
 *
 * এটি প্রত্যেকটি নতুন pooled connection-এর
 * জন্য একবার execute হবে।
 */
rawPool.on("connection", (connection) => {
  connection.query(
    "SET SESSION time_zone = '+00:00'",
    (error) => {
      if (error) {
        console.error(
          "Failed to set MySQL session timezone:",
          error.message
        );

        /*
         * UTC initialization fail করলে এই
         * connection ব্যবহার করা নিরাপদ নয়।
         */
        connection.destroy();
      }
    }
  );
});

/*
 * Existing project-এর async/await API বজায় থাকবে।
 */
const pool = rawPool.promise();

export const testDatabaseConnection = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.ping();

    const [rows] = await connection.query(`
      SELECT
        DATABASE() AS databaseName,
        UTC_TIMESTAMP(3) AS databaseTime,
        NOW(3) AS sessionTime,
        @@SESSION.time_zone AS sessionTimeZone
    `);

    if (rows[0]?.sessionTimeZone !== "+00:00") {
      throw new Error(
        "MySQL session timezone must be +00:00 (UTC)."
      );
    }

    return rows[0];
  } finally {
    connection.release();
  }
};

export default pool;
