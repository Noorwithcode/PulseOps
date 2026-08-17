import pool from "../config/db.js";

const tables = [
  "servers",
  "server_health_checks",
  "server_monitoring_states",
  "users",
];

try {
  for (const table of tables) {
    try {
      const [rows] = await pool.query(
        `SHOW CREATE TABLE \`${table}\``
      );

      console.log(`\n===== ${table} =====\n`);
      console.log(rows[0]["Create Table"]);
    } catch (error) {
      console.log(`\n===== ${table} =====`);
      console.log(`Could not load: ${error.message}`);
    }
  }
} finally {
  await pool.end();
}