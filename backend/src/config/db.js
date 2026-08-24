import "dotenv/config";
import mysql from "mysql2";

const useDatabaseTls =
  process.env.DB_SSL
    ?.trim()
    .toLowerCase() === "true";

const getDatabaseTlsOptions = () => {
  if (!useDatabaseTls) {
    return undefined;
  }

  const caBase64 =
    process.env.DB_CA_CERT_BASE64?.trim();

  if (!caBase64) {
    throw new Error(
      "DB_CA_CERT_BASE64 is required when DB_SSL=true."
    );
  }

  const caCertificate = Buffer.from(
    caBase64,
    "base64"
  ).toString("utf8");

  if (
    !caCertificate.includes(
      "BEGIN CERTIFICATE"
    )
  ) {
    throw new Error(
      "DB_CA_CERT_BASE64 does not contain a valid CA certificate."
    );
  }

  return {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
    ca: caCertificate,
  };
};

const rawPool = mysql.createPool({
  host: process.env.DB_HOST,
  port:
    Number(process.env.DB_PORT) ||
    3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: getDatabaseTlsOptions(),

  waitForConnections: true,
  connectionLimit:
    Number(
      process.env.DB_CONNECTION_LIMIT
    ) || 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,

  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  timezone: "Z",
  decimalNumbers: true,
});

rawPool.on(
  "connection",
  (connection) => {
    connection.query(
      "SET SESSION time_zone = '+00:00'",
      (error) => {
        if (error) {
          console.error(
            "Failed to set MySQL session timezone:",
            error.message
          );

          connection.destroy();
        }
      }
    );
  }
);

const pool = rawPool.promise();

export const testDatabaseConnection =
  async () => {
    const connection =
      await pool.getConnection();

    try {
      await connection.ping();

      const [rows] =
        await connection.query(`
          SELECT
            DATABASE() AS databaseName,
            UTC_TIMESTAMP(3) AS databaseTime,
            NOW(3) AS sessionTime,
            @@SESSION.time_zone AS sessionTimeZone
        `);

      if (
        rows[0]?.sessionTimeZone !==
        "+00:00"
      ) {
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