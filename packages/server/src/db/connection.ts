import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.POSTGRES_URL ||
    "postgresql://postgres:postgres@localhost:5432/featherlog",
});

export async function initDatabase() {
  // Create tables if they don't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      origins JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (jsonb_array_length(origins) > 0)
    )
  `);

  // Add constraint if it doesn't exist (for existing databases)
  await pool.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'projects_origins_not_empty'
      ) THEN
        ALTER TABLE projects ADD CONSTRAINT projects_origins_not_empty 
          CHECK (jsonb_array_length(origins) > 0);
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      project_id VARCHAR(255) NOT NULL,
      level VARCHAR(10) NOT NULL,
      message TEXT NOT NULL,
      timestamp TIMESTAMP NOT NULL,
      metadata JSONB DEFAULT '{}',
      fingerprint VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Migrate existing databases that predate fingerprints
  await pool.query(`
    ALTER TABLE logs ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(64)
  `);

  // Create index on project_id and timestamp for faster queries
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_logs_project_id ON logs(project_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_logs_fingerprint
    ON logs(project_id, fingerprint)
    WHERE fingerprint IS NOT NULL
  `);

  // GIN index for structured metadata field queries (wide-event dimensions)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_logs_metadata_gin
    ON logs USING GIN (metadata jsonb_path_ops)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS share_links (
      token VARCHAR(64) PRIMARY KEY,
      resource_type VARCHAR(10) NOT NULL,
      log_id INTEGER REFERENCES logs(id) ON DELETE CASCADE,
      project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
      fingerprint VARCHAR(64),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_share_links_log_id
    ON share_links(log_id)
    WHERE log_id IS NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_share_links_issue
    ON share_links(project_id, fingerprint)
    WHERE fingerprint IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS issue_states (
      project_id VARCHAR(255) NOT NULL,
      fingerprint VARCHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      resolved_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, fingerprint),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CHECK (status IN ('open', 'resolved'))
    )
  `);

  console.log("Database initialized");
}
