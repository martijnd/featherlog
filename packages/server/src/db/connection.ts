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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
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

  console.log("Database initialized");
}
