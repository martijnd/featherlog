import pg from "pg";
import dotenv from "dotenv";
import { pool, query, execute, initDatabase } from "../db/connection.js";

dotenv.config();

// One-off: copy an existing Postgres featherlog database into MySQL.
// Usage: tsx src/scripts/migrate-from-postgres.ts [postgres-url] [--local-time]
//
// Target is MYSQL_URL. Source is the first argument or POSTGRES_URL.
// Safe to re-run: rows that already exist in MySQL are skipped.
//
// Postgres stored `timestamp without time zone`, which node-pg wrote in the
// server process's local zone. Docker deployments run in UTC, so values are
// read as UTC unless --local-time is passed.

interface TableSpec {
  name: string;
  columns: string[];
  key: string[];
  json?: string[];
}

// Parents before children so foreign keys are satisfied
const TABLES: TableSpec[] = [
  {
    name: "projects",
    columns: ["id", "name", "origins", "created_at"],
    key: ["id"],
    json: ["origins"],
  },
  {
    name: "users",
    columns: ["id", "username", "password_hash", "created_at"],
    key: ["id"],
  },
  {
    name: "logs",
    columns: [
      "id",
      "project_id",
      "level",
      "message",
      "timestamp",
      "metadata",
      "fingerprint",
      "created_at",
    ],
    key: ["id"],
    json: ["metadata"],
  },
  {
    name: "share_links",
    columns: [
      "token",
      "resource_type",
      "log_id",
      "project_id",
      "fingerprint",
      "created_by",
      "created_at",
      "expires_at",
      "revoked_at",
    ],
    key: ["token"],
  },
  {
    name: "issue_states",
    columns: [
      "project_id",
      "fingerprint",
      "status",
      "resolved_at",
      "updated_at",
    ],
    key: ["project_id", "fingerprint"],
  },
];

const BATCH_SIZE = 1000;
const PG_TIMESTAMP_OID = 1114;

async function copyTable(source: pg.Client, table: TableSpec): Promise<number> {
  const columnList = table.columns.join(", ");
  const keyList = table.key.join(", ");
  const keyPlaceholders = table.key.map((_, i) => `$${i + 1}`).join(", ");
  const keepKey = `${table.key[0]} = ${table.key[0]}`;

  let copied = 0;
  let after: unknown[] | null = null;

  for (;;) {
    // Keyset pagination: stable and fast on large log tables
    const result: pg.QueryResult = await source.query(
      `SELECT ${columnList} FROM ${table.name}
       ${after ? `WHERE (${keyList}) > (${keyPlaceholders})` : ""}
       ORDER BY ${keyList}
       LIMIT ${BATCH_SIZE}`,
      after ?? []
    );
    if (result.rows.length === 0) break;

    const values = result.rows.map((row) =>
      table.columns.map((column) =>
        table.json?.includes(column) && row[column] != null
          ? JSON.stringify(row[column])
          : row[column]
      )
    );
    await execute(
      `INSERT INTO ${table.name} (${columnList}) VALUES ?
       ON DUPLICATE KEY UPDATE ${keepKey}`,
      [values]
    );

    copied += result.rows.length;
    const last = result.rows[result.rows.length - 1];
    after = table.key.map((column) => last[column]);
  }

  return copied;
}

async function migrate() {
  const args = process.argv.slice(2);
  const useLocalTime = args.includes("--local-time");
  const sourceUrl =
    args.find((arg) => !arg.startsWith("--")) || process.env.POSTGRES_URL;

  if (!sourceUrl) {
    console.error(
      "Usage: tsx src/scripts/migrate-from-postgres.ts [postgres-url] [--local-time]"
    );
    console.error("Or set POSTGRES_URL. Target database is MYSQL_URL.");
    process.exit(1);
  }

  if (!useLocalTime) {
    pg.types.setTypeParser(
      PG_TIMESTAMP_OID,
      (value: string) => new Date(`${value.replace(" ", "T")}Z`)
    );
  }

  const source = new pg.Client({ connectionString: sourceUrl });
  let failed = false;

  try {
    await source.connect();
    await initDatabase();

    for (const table of TABLES) {
      const copied = await copyTable(source, table);
      const sourceCount = Number(
        (await source.query(`SELECT COUNT(*) AS n FROM ${table.name}`)).rows[0]
          .n
      );
      const targetCount = Number(
        (await query(`SELECT COUNT(*) AS n FROM ${table.name}`))[0].n
      );
      const ok = targetCount >= sourceCount;
      if (!ok) failed = true;
      console.log(
        `${ok ? "✓" : "✗"} ${table.name}: read ${copied}, postgres ${sourceCount}, mysql ${targetCount}`
      );
    }
  } catch (error) {
    console.error("Migration failed:", error);
    failed = true;
  } finally {
    await source.end().catch(() => {});
    await pool.end();
  }

  process.exit(failed ? 1 : 0);
}

migrate();
