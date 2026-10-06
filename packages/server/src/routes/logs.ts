import { Router, Request, Response } from "express";
import { query, execute } from "../db/connection.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { LogRequest, LogsQueryParams } from "../types.js";
import { logBroadcaster } from "../services/logBroadcaster.js";
import { computeFingerprint } from "../services/fingerprint.js";
import { issueAggregateSql } from "../services/issues.js";

const router: Router = Router();

/** Parse "path=value" filters into a nested JSON object for JSON_CONTAINS. */
function parseWhereClause(clause: string): Record<string, unknown> | null {
  const eq = clause.indexOf("=");
  if (eq <= 0) return null;

  const path = clause.slice(0, eq).trim();
  const value = clause.slice(eq + 1).trim();
  if (!path || value === "") return null;

  // Reject unsafe path segments
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(path)) {
    return null;
  }

  let parsedValue: unknown = value;
  if (value === "true") parsedValue = true;
  else if (value === "false") parsedValue = false;
  else if (value === "null") parsedValue = null;
  else if (/^-?\d+(\.\d+)?$/.test(value)) parsedValue = Number(value);

  const parts = path.split(".");
  const root: Record<string, unknown> = {};
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next: Record<string, unknown> = {};
    cursor[parts[i]] = next;
    cursor = next;
  }
  cursor[parts[parts.length - 1]] = parsedValue;
  return root;
}

function normalizeWhereParams(
  where: string | string[] | undefined
): string[] {
  if (!where) return [];
  return (Array.isArray(where) ? where : [where]).filter(
    (w) => typeof w === "string" && w.trim().length > 0
  );
}

const LOG_SORT_SQL: Record<string, string> = {
  timestamp: "timestamp",
  project: "project_id",
  level: "level",
  message: "message",
  metadata: "JSON_LENGTH(COALESCE(metadata, JSON_OBJECT()))",
};

const ISSUE_SORT_SQL: Record<string, string> = {
  issue: "agg.message",
  status: "COALESCE(s.status, 'open')",
  project: "agg.project_id",
  count: "agg.count",
  first_seen: "agg.first_seen",
  last_seen: "agg.last_seen",
};

function parseSortOrder(value: unknown): "ASC" | "DESC" {
  return value === "asc" || value === "ASC" ? "ASC" : "DESC";
}

function buildLogOrderBy(sort: unknown, order: unknown): string {
  const column =
    typeof sort === "string" && LOG_SORT_SQL[sort]
      ? LOG_SORT_SQL[sort]
      : LOG_SORT_SQL.timestamp;
  const dir = parseSortOrder(order);
  // Stable tie-breaker for pagination
  return ` ORDER BY ${column} ${dir}, id DESC`;
}

function buildIssueOrderBy(sort: unknown, order: unknown): string {
  const column =
    typeof sort === "string" && ISSUE_SORT_SQL[sort]
      ? ISSUE_SORT_SQL[sort]
      : ISSUE_SORT_SQL.last_seen;
  const dir = parseSortOrder(order);
  return ` ORDER BY ${column} ${dir}, agg.fingerprint ASC`;
}

function appendLogFilters(
  sql: string,
  params: unknown[],
  filters: LogsQueryParams
): { sql: string; params: unknown[] } {
  let nextSql = sql;
  const nextParams = [...params];

  if (filters["project-id"]) {
    nextSql += " AND project_id = ?";
    nextParams.push(filters["project-id"]);
  }

  if (filters.level) {
    nextSql += " AND level = ?";
    nextParams.push(filters.level);
  }

  if (filters.startDate) {
    nextSql += " AND timestamp >= ?";
    nextParams.push(new Date(filters.startDate));
  }

  if (filters.endDate) {
    nextSql += " AND timestamp <= ?";
    nextParams.push(new Date(filters.endDate));
  }

  if (filters.request_id) {
    nextSql += " AND JSON_CONTAINS(metadata, ?)";
    nextParams.push(JSON.stringify({ request_id: filters.request_id }));
  }

  const search = typeof filters.q === "string" ? filters.q.trim() : "";
  if (search) {
    // LIKE is case-insensitive under the default collation; backslash escapes
    const escaped = search.replace(/([\\%_])/g, "\\$1");
    nextSql += " AND message LIKE ?";
    nextParams.push(`%${escaped}%`);
  }

  for (const clause of normalizeWhereParams(filters.where)) {
    const filterObj = parseWhereClause(clause);
    if (!filterObj) continue;
    nextSql += " AND JSON_CONTAINS(metadata, ?)";
    nextParams.push(JSON.stringify(filterObj));
  }

  return { sql: nextSql, params: nextParams };
}

// POST /api/logs - Public endpoint for SDK to send logs (validates origin)
router.post("/", async (req: Request, res: Response) => {
  try {
    const logData: LogRequest = req.body;

    if (!logData["project-id"] || !logData.level || !logData.message) {
      return res
        .status(400)
        .json({ error: "Missing required fields: project-id, level, message" });
    }

    // Get the origin from the request
    const origin = req.headers.origin || req.headers.referer;

    // Verify project exists and check origin
    const projectRows = await query(
      "SELECT id, origins FROM projects WHERE id = ?",
      [logData["project-id"]]
    );

    if (projectRows.length === 0) {
      return res.status(401).json({ error: "Invalid project-id" });
    }

    const project = projectRows[0];
    const allowedOrigins: string[] = project.origins || [];

    // Require at least one origin (should be enforced by DB constraint, but check anyway)
    if (allowedOrigins.length === 0) {
      return res.status(500).json({
        error: "Project configuration error: no origins configured",
      });
    }

    // Check if origin is allowed (at least one origin is required)
    // For browser requests, origin header will be present and must match
    // For server-side requests (Node.js), origin may not be present - allow if no origin header
    if (origin) {
      // Extract origin from referer if needed
      let originToCheck = origin;
      if (origin.startsWith("http")) {
        try {
          const url = new URL(origin);
          originToCheck = url.origin;
        } catch (e) {
          // If URL parsing fails, use origin as-is
        }
      }

      // Check if origin matches any allowed origin (supports wildcards)
      const isAllowed = allowedOrigins.some((allowedOrigin) => {
        if (allowedOrigin === "*") return true;
        if (allowedOrigin.endsWith("*")) {
          const prefix = allowedOrigin.slice(0, -1);
          return originToCheck.startsWith(prefix);
        }
        return originToCheck === allowedOrigin;
      });

      if (!isAllowed) {
        return res.status(403).json({
          error: "Origin not allowed",
          detail: `Origin '${originToCheck}' is not in the allowed origins list for this project`,
        });
      }
    }
    // If no origin header, allow (server-side requests from Node.js SDK)

    // Extract metadata (everything except project-id, level, message, timestamp)
    const {
      "project-id": projectId,
      level,
      message,
      timestamp,
      ...metadata
    } = logData;

    const fingerprint = computeFingerprint(message, metadata);

    // Insert log
    const logTimestamp = timestamp ? new Date(timestamp) : new Date();
    const insertResult = await execute(
      `INSERT INTO logs (project_id, level, message, timestamp, metadata, fingerprint)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        level,
        message,
        logTimestamp,
        JSON.stringify(metadata),
        fingerprint,
      ]
    );

    const newLog = {
      id: insertResult.insertId,
      project_id: projectId,
      level,
      message,
      timestamp: logTimestamp,
      metadata,
      fingerprint,
    };

    let reopened = false;
    if (fingerprint) {
      const reopenResult = await execute(
        `UPDATE issue_states
         SET status = 'open',
             resolved_at = NULL,
             updated_at = CURRENT_TIMESTAMP(3)
         WHERE project_id = ?
           AND fingerprint = ?
           AND status = 'resolved'`,
        [projectId, fingerprint]
      );
      reopened = reopenResult.affectedRows > 0;
    }

    // Broadcast the new log to all connected SSE clients
    logBroadcaster.broadcastLog({
      id: newLog.id,
      "project-id": newLog.project_id,
      level: newLog.level,
      message: newLog.message,
      timestamp: newLog.timestamp,
      metadata: newLog.metadata,
      fingerprint: newLog.fingerprint,
      ...(reopened ? { reopened: true } : {}),
    });

    res.status(201).json({ success: true, fingerprint, reopened });
  } catch (error) {
    console.error("Error creating log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/logs - Get logs with filtering (JWT protected)
// Supports structured wide-event queries via ?where=user.id=123&where=outcome=error
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const filters: LogsQueryParams = req.query as any;

    const filtered = appendLogFilters(
      "SELECT * FROM logs WHERE 1=1",
      [],
      filters
    );
    let sql = filtered.sql + buildLogOrderBy(filters.sort, filters.order);
    const params = [...filtered.params];

    const limit = filters.limit ? parseInt(filters.limit.toString(), 10) : 100;
    const offset = filters.offset
      ? parseInt(filters.offset.toString(), 10)
      : 0;

    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = await query(sql, params);

    const countFiltered = appendLogFilters(
      "SELECT COUNT(*) AS total FROM logs WHERE 1=1",
      [],
      filters
    );
    const countRows = await query(countFiltered.sql, countFiltered.params);
    const total = Number(countRows[0].total);

    res.json({
      logs: rows.map((row) => ({
        id: row.id,
        "project-id": row.project_id,
        level: row.level,
        message: row.message,
        timestamp: row.timestamp,
        metadata: row.metadata,
        fingerprint: row.fingerprint,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

type StatsRange = "24h" | "7d" | "30d" | "all";

function parseStatsRange(value: unknown): StatsRange {
  if (
    value === "24h" ||
    value === "7d" ||
    value === "30d" ||
    value === "all"
  ) {
    return value;
  }
  return "7d";
}

function getStatsWindow(range: StatsRange): {
  startDate: Date;
  endDate: Date;
  unit: "hour" | "day";
} {
  const endDate = new Date();
  const startDate = new Date(endDate);
  if (range === "24h") {
    startDate.setTime(endDate.getTime() - 24 * 60 * 60 * 1000);
    return { startDate, endDate, unit: "hour" };
  }
  if (range === "all") {
    // Placeholder start; route replaces with earliest log timestamp
    startDate.setTime(0);
    return { startDate, endDate, unit: "day" };
  }
  if (range === "30d") {
    startDate.setTime(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    startDate.setTime(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return { startDate, endDate, unit: "day" };
}

// UTC bucket labels: "YYYY-MM-DDTHH" (hour) or "YYYY-MM-DD" (day)
function bucketLabel(date: Date, unit: "hour" | "day"): string {
  return date.toISOString().slice(0, unit === "hour" ? 13 : 10);
}

function bucketStart(label: string, unit: "hour" | "day"): Date {
  return new Date(unit === "hour" ? `${label}:00:00Z` : `${label}T00:00:00Z`);
}

// GET /api/logs/stats - Dashboard aggregates (JWT protected)
router.get(
  "/stats",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const range = parseStatsRange(req.query.range);
      const projectId = req.query["project-id"] as string | undefined;
      let { startDate, endDate, unit } = getStatsWindow(range);

      if (range === "all") {
        const minRows = await query(
          `SELECT MIN(timestamp) AS min_ts FROM logs${
            projectId ? " WHERE project_id = ?" : ""
          }`,
          projectId ? [projectId] : []
        );
        const minTs = minRows[0]?.min_ts;
        startDate = minTs ? new Date(minTs) : new Date(endDate);
      }

      const filterParams: unknown[] = [startDate, endDate];
      let projectClause = "";
      if (projectId) {
        projectClause = " AND project_id = ?";
        filterParams.push(projectId);
      }

      const totalsRows = await query(
        `
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN level = 'error' THEN 1 END) AS error,
          COUNT(CASE WHEN level = 'warn' THEN 1 END) AS warn,
          COUNT(CASE WHEN level = 'info' THEN 1 END) AS info
        FROM logs
        WHERE timestamp >= ? AND timestamp <= ?${projectClause}
        `,
        filterParams
      );

      const allTimeRows = await query(
        `SELECT COUNT(*) AS total FROM logs${
          projectId ? " WHERE project_id = ?" : ""
        }`,
        projectId ? [projectId] : []
      );

      // Timestamps are stored in UTC, so DATE_FORMAT yields UTC bucket labels
      const countRows = await query(
        `
        SELECT
          DATE_FORMAT(timestamp, '${
            unit === "hour" ? "%Y-%m-%dT%H" : "%Y-%m-%d"
          }') AS bucket,
          COUNT(CASE WHEN level = 'error' THEN 1 END) AS error,
          COUNT(CASE WHEN level = 'warn' THEN 1 END) AS warn,
          COUNT(CASE WHEN level = 'info' THEN 1 END) AS info
        FROM logs
        WHERE timestamp >= ? AND timestamp <= ?${projectClause}
        GROUP BY bucket
        `,
        filterParams
      );

      const counts = new Map(countRows.map((row) => [row.bucket, row]));
      const stepMs = unit === "hour" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const series: { bucket: string; error: number; warn: number; info: number }[] =
        [];
      const lastBucket = bucketStart(bucketLabel(endDate, unit), unit);
      for (
        let cursor = bucketStart(bucketLabel(startDate, unit), unit);
        cursor <= lastBucket;
        cursor = new Date(cursor.getTime() + stepMs)
      ) {
        const row = counts.get(bucketLabel(cursor, unit));
        series.push({
          bucket: cursor.toISOString(),
          error: Number(row?.error ?? 0),
          warn: Number(row?.warn ?? 0),
          info: Number(row?.info ?? 0),
        });
      }

      const totals = totalsRows[0];

      res.json({
        range,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totals: {
          total: Number(totals.total),
          error: Number(totals.error),
          warn: Number(totals.warn),
          info: Number(totals.info),
        },
        allTimeTotal: Number(allTimeRows[0]?.total ?? 0),
        series,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/logs/issues - Aggregated issues by fingerprint (JWT protected)
router.get(
  "/issues",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const filters = req.query as {
        "project-id"?: string;
        status?: string;
        sort?: string;
        order?: string;
        limit?: string;
        offset?: string;
      };

      const statusFilter =
        filters.status === "resolved" || filters.status === "all"
          ? filters.status
          : "open";

      const projectParams: unknown[] = [];
      let projectFilter = "";
      if (filters["project-id"]) {
        projectFilter = " AND project_id = ?";
        projectParams.push(filters["project-id"]);
      }

      let statusWhere = "";
      if (statusFilter === "open") {
        statusWhere = ` WHERE COALESCE(s.status, 'open') = 'open'`;
      } else if (statusFilter === "resolved") {
        statusWhere = ` WHERE s.status = 'resolved'`;
      }

      const limit = filters.limit ? parseInt(filters.limit.toString(), 10) : 50;
      const offset = filters.offset
        ? parseInt(filters.offset.toString(), 10)
        : 0;

      const rows = await query(
        `
        SELECT
          agg.*,
          COALESCE(s.status, 'open') AS status,
          s.resolved_at
        FROM (${issueAggregateSql(
          `fingerprint IS NOT NULL${projectFilter}`
        )}) agg
        LEFT JOIN issue_states s
          ON s.project_id = agg.project_id AND s.fingerprint = agg.fingerprint
        ${statusWhere}
        ${buildIssueOrderBy(filters.sort, filters.order)}
        LIMIT ? OFFSET ?
        `,
        [...projectParams, limit, offset]
      );

      const countRows = await query(
        `
        SELECT COUNT(*) AS total FROM (
          SELECT agg.fingerprint
          FROM (
            SELECT fingerprint, project_id
            FROM logs
            WHERE fingerprint IS NOT NULL${projectFilter}
            GROUP BY fingerprint, project_id
          ) agg
          LEFT JOIN issue_states s
            ON s.project_id = agg.project_id AND s.fingerprint = agg.fingerprint
          ${statusWhere}
        ) AS issues
        `,
        projectParams
      );
      const total = Number(countRows[0].total);

      res.json({
        issues: rows.map((row) => ({
          fingerprint: row.fingerprint,
          "project-id": row.project_id,
          level: row.level,
          message: row.message,
          count: Number(row.count),
          first_seen: row.first_seen,
          last_seen: row.last_seen,
          latest_metadata: row.latest_metadata || {},
          status: row.status,
          resolved_at: row.resolved_at,
        })),
        total,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Error fetching issues:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /api/logs/issues/:fingerprint/status - Resolve or reopen an issue (JWT)
router.patch(
  "/issues/:fingerprint/status",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { fingerprint } = req.params;
      const projectId =
        typeof req.body?.["project-id"] === "string"
          ? req.body["project-id"].trim()
          : "";
      const status = req.body?.status;

      if (!projectId) {
        return res.status(400).json({ error: "project-id is required" });
      }
      if (status !== "open" && status !== "resolved") {
        return res
          .status(400)
          .json({ error: 'status must be "open" or "resolved"' });
      }

      const existing = await query(
        `SELECT 1 FROM logs
         WHERE fingerprint = ? AND project_id = ?
         LIMIT 1`,
        [fingerprint, projectId]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: "Issue not found" });
      }

      const resolvedAt = status === "resolved" ? new Date() : null;
      await execute(
        `INSERT INTO issue_states (project_id, fingerprint, status, resolved_at, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3)) AS new
         ON DUPLICATE KEY UPDATE
           status = new.status,
           resolved_at = new.resolved_at,
           updated_at = CURRENT_TIMESTAMP(3)`,
        [projectId, fingerprint, status, resolvedAt]
      );

      res.json({
        fingerprint,
        "project-id": projectId,
        status,
        resolved_at: resolvedAt,
      });
    } catch (error) {
      console.error("Error updating issue status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/logs/issues/:fingerprint - Occurrences for an issue (JWT protected)
router.get(
  "/issues/:fingerprint",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { fingerprint } = req.params;
      const projectId = req.query["project-id"] as string | undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit.toString(), 10)
        : 50;
      const offset = req.query.offset
        ? parseInt(req.query.offset.toString(), 10)
        : 0;

      const params: unknown[] = [fingerprint];
      let projectFilter = "";
      if (projectId) {
        projectFilter = " AND project_id = ?";
        params.push(projectId);
      }

      const rows = await query(
        `
        SELECT id, project_id, level, message, timestamp, metadata, fingerprint
        FROM logs
        WHERE fingerprint = ?${projectFilter}
        ORDER BY timestamp DESC LIMIT ? OFFSET ?
        `,
        [...params, limit, offset]
      );

      const countRows = await query(
        `SELECT COUNT(*) AS total FROM logs WHERE fingerprint = ?${projectFilter}`,
        params
      );
      const total = Number(countRows[0].total);

      if (total === 0) {
        return res.status(404).json({ error: "Issue not found" });
      }

      res.json({
        fingerprint,
        logs: rows.map((row) => ({
          id: row.id,
          "project-id": row.project_id,
          level: row.level,
          message: row.message,
          timestamp: row.timestamp,
          metadata: row.metadata,
          fingerprint: row.fingerprint,
        })),
        total,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Error fetching issue occurrences:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/projects - Get all projects (JWT protected)
router.get(
  "/projects",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const rows = await query(
        "SELECT id, name, origins, created_at FROM projects ORDER BY name"
      );
      res.json({
        projects: rows.map((row) => ({
          id: row.id,
          name: row.name,
          origins: row.origins || [],
          created_at: row.created_at,
        })),
      });
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/logs/stream - SSE endpoint for real-time log updates (JWT protected)
router.get(
  "/stream",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    // Listen for new logs
    const onNewLog = (log: any) => {
      res.write(`data: ${JSON.stringify({ type: "log", log })}\n\n`);
    };

    logBroadcaster.on("new-log", onNewLog);

    // Clean up on client disconnect
    req.on("close", () => {
      logBroadcaster.removeListener("new-log", onNewLog);
      res.end();
    });
  }
);

// POST /api/projects - Create a new project (JWT protected)
router.post(
  "/projects",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id, name, origins } = req.body;

      if (!id || !name) {
        return res
          .status(400)
          .json({ error: "Missing required fields: id, name" });
      }

      // Validate origins array
      const originsArray = Array.isArray(origins) ? origins : [];
      if (!Array.isArray(originsArray)) {
        return res.status(400).json({ error: "Origins must be an array" });
      }

      // Require at least one origin
      if (originsArray.length === 0) {
        return res.status(400).json({
          error: "At least one origin is required",
        });
      }

      // Disallow '*' as a single origin to prevent abuse
      if (originsArray.length === 1 && originsArray[0] === "*") {
        return res.status(400).json({
          error:
            "Cannot use '*' as the only origin. Specify at least one valid origin.",
        });
      }

      // Check if project already exists
      const existingProject = await query(
        "SELECT id FROM projects WHERE id = ?",
        [id]
      );

      if (existingProject.length > 0) {
        return res.status(409).json({ error: "Project ID already exists" });
      }

      // Create project
      await execute(
        "INSERT INTO projects (id, name, origins) VALUES (?, ?, ?)",
        [id, name, JSON.stringify(originsArray)]
      );
      const [project] = await query(
        "SELECT id, name, origins, created_at FROM projects WHERE id = ?",
        [id]
      );

      res.status(201).json({
        project: {
          id: project.id,
          name: project.name,
          origins: project.origins,
          created_at: project.created_at,
        },
      });
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PUT /api/projects/:id - Update project origins (JWT protected)
router.put(
  "/projects/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { origins } = req.body;

      if (!Array.isArray(origins)) {
        return res.status(400).json({ error: "Origins must be an array" });
      }

      // Require at least one origin
      if (origins.length === 0) {
        return res.status(400).json({
          error: "At least one origin is required",
        });
      }

      // Disallow '*' as a single origin to prevent abuse
      if (origins.length === 1 && origins[0] === "*") {
        return res.status(400).json({
          error:
            "Cannot use '*' as the only origin. Specify at least one valid origin.",
        });
      }

      // Check if project exists
      const existingProject = await query(
        "SELECT id FROM projects WHERE id = ?",
        [id]
      );

      if (existingProject.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Update project origins
      await execute("UPDATE projects SET origins = ? WHERE id = ?", [
        JSON.stringify(origins),
        id,
      ]);
      const [project] = await query(
        "SELECT id, name, origins, created_at FROM projects WHERE id = ?",
        [id]
      );

      res.json({
        project: {
          id: project.id,
          name: project.name,
          origins: project.origins,
          created_at: project.created_at,
        },
      });
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/projects/:id - Delete a project (JWT protected)
router.delete(
  "/projects/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Check if project exists
      const existingProject = await query(
        "SELECT id FROM projects WHERE id = ?",
        [id]
      );

      if (existingProject.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Delete project (CASCADE will delete associated logs)
      await execute("DELETE FROM projects WHERE id = ?", [id]);

      res.json({ success: true, message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/projects/:id/logs - Clear all logs for a project (JWT protected)
router.delete(
  "/projects/:id/logs",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Check if project exists
      const existingProject = await query(
        "SELECT id FROM projects WHERE id = ?",
        [id]
      );

      if (existingProject.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Delete all logs for this project
      const deleteResult = await execute(
        "DELETE FROM logs WHERE project_id = ?",
        [id]
      );

      const deletedCount = deleteResult.affectedRows;

      res.json({
        success: true,
        message: `Successfully deleted ${deletedCount} log(s) for project ${id}`,
        deletedCount,
      });
    } catch (error) {
      console.error("Error clearing logs:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/logs/:id - Single log by id (JWT protected)
// Registered after static paths so /issues, /stats, /stream, /projects are not captured.
router.get(
  "/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).json({ error: "Log not found" });
      }

      const rows = await query(
        `SELECT id, project_id, level, message, timestamp, metadata, fingerprint
         FROM logs WHERE id = ?`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Log not found" });
      }

      const row = rows[0];
      res.json({
        log: {
          id: row.id,
          "project-id": row.project_id,
          level: row.level,
          message: row.message,
          timestamp: row.timestamp,
          metadata: row.metadata || {},
          fingerprint: row.fingerprint,
        },
      });
    } catch (error) {
      console.error("Error fetching log:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
