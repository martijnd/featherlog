import mysql, {
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export const pool = mysql.createPool({
  uri:
    process.env.MYSQL_URL ||
    "mysql://featherlog:featherlog@localhost:3306/featherlog",
  // Read/write DATETIME values as UTC regardless of the server's local zone
  timezone: "Z",
});

// Keep CURRENT_TIMESTAMP consistent with the UTC handling above
pool.pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

/** Run a SELECT and return its rows. Use `?` placeholders. */
export async function query(
  sql: string,
  params: unknown[] = []
): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows;
}

/** Run an INSERT/UPDATE/DELETE; exposes `insertId` and `affectedRows`. */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<ResultSetHeader> {
  const [result] = await pool.query<ResultSetHeader>(sql, params);
  return result;
}

// Case-sensitive text, matching Postgres semantics for ids, tokens, and names
const BIN = "CHARACTER SET utf8mb4 COLLATE utf8mb4_bin";

export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(255) ${BIN} PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      origins JSON NOT NULL,
      created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT projects_origins_not_empty CHECK (JSON_LENGTH(origins) > 0)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) ${BIN} NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
    )
  `);

  // MySQL cannot index JSON containment queries (no GIN equivalent), so
  // metadata filters (`where=`) scan rows narrowed by the other indexes.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id VARCHAR(255) ${BIN} NOT NULL,
      level VARCHAR(10) NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME(3) NOT NULL,
      metadata JSON DEFAULT (JSON_OBJECT()),
      fingerprint VARCHAR(64) ${BIN},
      created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      INDEX idx_logs_project_id (project_id),
      INDEX idx_logs_timestamp (timestamp DESC),
      INDEX idx_logs_level (level),
      INDEX idx_logs_fingerprint (project_id, fingerprint)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS share_links (
      token VARCHAR(64) ${BIN} PRIMARY KEY,
      resource_type VARCHAR(10) NOT NULL,
      log_id INT,
      project_id VARCHAR(255) ${BIN},
      fingerprint VARCHAR(64) ${BIN},
      created_by INT,
      created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      expires_at DATETIME(3) NOT NULL,
      revoked_at DATETIME(3),
      FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_share_links_log_id (log_id),
      INDEX idx_share_links_issue (project_id, fingerprint)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS issue_states (
      project_id VARCHAR(255) ${BIN} NOT NULL,
      fingerprint VARCHAR(64) ${BIN} NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      resolved_at DATETIME(3),
      updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (project_id, fingerprint),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CHECK (status IN ('open', 'resolved'))
    )
  `);

  console.log("Database initialized");
}
