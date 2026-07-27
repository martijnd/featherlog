import { Router, Request, Response } from "express";
import { pool } from "../db/connection.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { LogRequest, LogsQueryParams } from "../types.js";
import { logBroadcaster } from "../services/logBroadcaster.js";
import { computeFingerprint } from "../services/fingerprint.js";

const router: Router = Router();

/** Parse "path=value" filters into a nested JSON object for jsonb containment. */
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
  metadata:
    "(SELECT count(*)::int FROM jsonb_object_keys(COALESCE(metadata, '{}'::jsonb)))",
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
  query: LogsQueryParams
): { sql: string; params: unknown[] } {
  let paramIndex = params.length + 1;
  let nextSql = sql;
  const nextParams = [...params];

  if (query["project-id"]) {
    nextSql += ` AND project_id = $${paramIndex}`;
    nextParams.push(query["project-id"]);
    paramIndex++;
  }

  if (query.level) {
    nextSql += ` AND level = $${paramIndex}`;
    nextParams.push(query.level);
    paramIndex++;
  }

  if (query.startDate) {
    nextSql += ` AND timestamp >= $${paramIndex}`;
    nextParams.push(new Date(query.startDate));
    paramIndex++;
  }

  if (query.endDate) {
    nextSql += ` AND timestamp <= $${paramIndex}`;
    nextParams.push(new Date(query.endDate));
    paramIndex++;
  }

  if (query.request_id) {
    nextSql += ` AND metadata @> $${paramIndex}::jsonb`;
    nextParams.push(JSON.stringify({ request_id: query.request_id }));
    paramIndex++;
  }

  const search =
    typeof query.q === "string" ? query.q.trim() : "";
  if (search) {
    const escaped = search.replace(/([\\%_])/g, "\\$1");
    nextSql += ` AND message ILIKE $${paramIndex} ESCAPE '\\'`;
    nextParams.push(`%${escaped}%`);
    paramIndex++;
  }

  for (const clause of normalizeWhereParams(query.where)) {
    const filterObj = parseWhereClause(clause);
    if (!filterObj) continue;
    nextSql += ` AND metadata @> $${paramIndex}::jsonb`;
    nextParams.push(JSON.stringify(filterObj));
    paramIndex++;
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
    const projectResult = await pool.query(
      "SELECT id, origins FROM projects WHERE id = $1",
      [logData["project-id"]]
    );

    if (projectResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid project-id" });
    }

    const project = projectResult.rows[0];
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
    const insertResult = await pool.query(
      `INSERT INTO logs (project_id, level, message, timestamp, metadata, fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, project_id, level, message, timestamp, metadata, fingerprint`,
      [
        projectId,
        level,
        message,
        timestamp ? new Date(timestamp) : new Date(),
        JSON.stringify(metadata),
        fingerprint,
      ]
    );

    const newLog = insertResult.rows[0];

    let reopened = false;
    if (fingerprint) {
      const reopenResult = await pool.query(
        `UPDATE issue_states
         SET status = 'open',
             resolved_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $1
           AND fingerprint = $2
           AND status = 'resolved'
         RETURNING project_id`,
        [projectId, fingerprint]
      );
      reopened = reopenResult.rows.length > 0;
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
    const query: LogsQueryParams = req.query as any;

    const filtered = appendLogFilters("SELECT * FROM logs WHERE 1=1", [], query);
    let sql = filtered.sql + buildLogOrderBy(query.sort, query.order);
    const params = [...filtered.params];

    const limit = query.limit ? parseInt(query.limit.toString(), 10) : 100;
    const offset = query.offset ? parseInt(query.offset.toString(), 10) : 0;
    const paramIndex = params.length + 1;

    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(sql, params);

    const countFiltered = appendLogFilters(
      "SELECT COUNT(*) FROM logs WHERE 1=1",
      [],
      query
    );
    const countResult = await pool.query(
      countFiltered.sql,
      countFiltered.params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      logs: result.rows.map((row) => ({
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
  truncUnit: "hour" | "day";
  stepInterval: "1 hour" | "1 day";
} {
  const endDate = new Date();
  const startDate = new Date(endDate);
  if (range === "24h") {
    startDate.setTime(endDate.getTime() - 24 * 60 * 60 * 1000);
    return {
      startDate,
      endDate,
      truncUnit: "hour",
      stepInterval: "1 hour",
    };
  }
  if (range === "all") {
    // Placeholder start; route replaces with earliest log timestamp
    startDate.setTime(0);
    return {
      startDate,
      endDate,
      truncUnit: "day",
      stepInterval: "1 day",
    };
  }
  if (range === "30d") {
    startDate.setTime(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    startDate.setTime(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return {
    startDate,
    endDate,
    truncUnit: "day",
    stepInterval: "1 day",
  };
}

// GET /api/logs/stats - Dashboard aggregates (JWT protected)
router.get(
  "/stats",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const range = parseStatsRange(req.query.range);
      const projectId = req.query["project-id"] as string | undefined;
      let { startDate, endDate, truncUnit, stepInterval } =
        getStatsWindow(range);

      if (range === "all") {
        const minParams: unknown[] = [];
        let minClause = "";
        if (projectId) {
          minClause = " WHERE project_id = $1";
          minParams.push(projectId);
        }
        const minResult = await pool.query(
          `SELECT MIN(timestamp) AS min_ts FROM logs${minClause}`,
          minParams
        );
        const minTs = minResult.rows[0]?.min_ts;
        startDate = minTs ? new Date(minTs) : new Date(endDate);
      }

      // truncUnit / stepInterval are fixed literals from getStatsWindow
      const filterParams: unknown[] = [startDate, endDate];
      let projectClause = "";
      if (projectId) {
        projectClause = " AND project_id = $3";
        filterParams.push(projectId);
      }

      const totalsResult = await pool.query(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE level = 'error')::int AS error,
          COUNT(*) FILTER (WHERE level = 'warn')::int AS warn,
          COUNT(*) FILTER (WHERE level = 'info')::int AS info
        FROM logs
        WHERE timestamp >= $1 AND timestamp <= $2${projectClause}
        `,
        filterParams
      );

      const allTimeParams: unknown[] = [];
      let allTimeClause = "";
      if (projectId) {
        allTimeClause = " WHERE project_id = $1";
        allTimeParams.push(projectId);
      }
      const allTimeResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM logs${allTimeClause}`,
        allTimeParams
      );

      const seriesResult = await pool.query(
        `
        WITH buckets AS (
          SELECT generate_series(
            date_trunc('${truncUnit}', $1::timestamp),
            date_trunc('${truncUnit}', $2::timestamp),
            '${stepInterval}'::interval
          ) AS bucket
        ),
        counts AS (
          SELECT
            date_trunc('${truncUnit}', timestamp) AS bucket,
            COUNT(*) FILTER (WHERE level = 'error')::int AS error,
            COUNT(*) FILTER (WHERE level = 'warn')::int AS warn,
            COUNT(*) FILTER (WHERE level = 'info')::int AS info
          FROM logs
          WHERE timestamp >= $1 AND timestamp <= $2${projectClause}
          GROUP BY 1
        )
        SELECT
          b.bucket,
          COALESCE(c.error, 0)::int AS error,
          COALESCE(c.warn, 0)::int AS warn,
          COALESCE(c.info, 0)::int AS info
        FROM buckets b
        LEFT JOIN counts c ON c.bucket = b.bucket
        ORDER BY b.bucket ASC
        `,
        filterParams
      );

      const totals = totalsResult.rows[0] || {
        total: 0,
        error: 0,
        warn: 0,
        info: 0,
      };

      res.json({
        range,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totals: {
          total: totals.total,
          error: totals.error,
          warn: totals.warn,
          info: totals.info,
        },
        allTimeTotal: allTimeResult.rows[0]?.total ?? 0,
        series: seriesResult.rows.map((row) => ({
          bucket: new Date(row.bucket).toISOString(),
          error: row.error,
          warn: row.warn,
          info: row.info,
        })),
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
      const query = req.query as {
        "project-id"?: string;
        status?: string;
        sort?: string;
        order?: string;
        limit?: string;
        offset?: string;
      };

      const statusFilter =
        query.status === "resolved" || query.status === "all"
          ? query.status
          : "open";

      const params: any[] = [];
      let paramIndex = 1;
      let projectFilter = "";

      if (query["project-id"]) {
        projectFilter = ` AND project_id = $${paramIndex}`;
        params.push(query["project-id"]);
        paramIndex++;
      }

      let statusWhere = "";
      if (statusFilter === "open") {
        statusWhere = ` WHERE COALESCE(s.status, 'open') = 'open'`;
      } else if (statusFilter === "resolved") {
        statusWhere = ` WHERE s.status = 'resolved'`;
      }

      let sql = `
        SELECT
          agg.fingerprint,
          agg.project_id,
          agg.level,
          agg.message,
          agg.count,
          agg.first_seen,
          agg.last_seen,
          agg.latest_metadata,
          COALESCE(s.status, 'open') AS status,
          s.resolved_at
        FROM (
          SELECT
            fingerprint,
            project_id,
            (array_agg(level ORDER BY timestamp DESC))[1] AS level,
            (array_agg(message ORDER BY timestamp DESC))[1] AS message,
            COUNT(*)::int AS count,
            MIN(timestamp) AS first_seen,
            MAX(timestamp) AS last_seen,
            (array_agg(metadata ORDER BY timestamp DESC))[1] AS latest_metadata
          FROM logs
          WHERE fingerprint IS NOT NULL${projectFilter}
          GROUP BY fingerprint, project_id
        ) agg
        LEFT JOIN issue_states s
          ON s.project_id = agg.project_id AND s.fingerprint = agg.fingerprint
        ${statusWhere}
        ${buildIssueOrderBy(query.sort, query.order)}
      `;

      const limit = query.limit ? parseInt(query.limit.toString(), 10) : 50;
      const offset = query.offset ? parseInt(query.offset.toString(), 10) : 0;

      sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(sql, params);

      const countParams: any[] = [];
      let countParamIndex = 1;
      let countProjectFilter = "";

      if (query["project-id"]) {
        countProjectFilter = ` AND project_id = $${countParamIndex}`;
        countParams.push(query["project-id"]);
        countParamIndex++;
      }

      let countStatusWhere = "";
      if (statusFilter === "open") {
        countStatusWhere = ` WHERE COALESCE(s.status, 'open') = 'open'`;
      } else if (statusFilter === "resolved") {
        countStatusWhere = ` WHERE s.status = 'resolved'`;
      }

      const countSql = `
        SELECT COUNT(*) FROM (
          SELECT agg.fingerprint
          FROM (
            SELECT fingerprint, project_id
            FROM logs
            WHERE fingerprint IS NOT NULL${countProjectFilter}
            GROUP BY fingerprint, project_id
          ) agg
          LEFT JOIN issue_states s
            ON s.project_id = agg.project_id AND s.fingerprint = agg.fingerprint
          ${countStatusWhere}
        ) AS issues
      `;

      const countResult = await pool.query(countSql, countParams);
      const total = parseInt(countResult.rows[0].count, 10);

      res.json({
        issues: result.rows.map((row) => ({
          fingerprint: row.fingerprint,
          "project-id": row.project_id,
          level: row.level,
          message: row.message,
          count: row.count,
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

      const exists = await pool.query(
        `SELECT 1 FROM logs
         WHERE fingerprint = $1 AND project_id = $2
         LIMIT 1`,
        [fingerprint, projectId]
      );
      if (exists.rows.length === 0) {
        return res.status(404).json({ error: "Issue not found" });
      }

      const resolvedAt = status === "resolved" ? new Date() : null;
      await pool.query(
        `INSERT INTO issue_states (project_id, fingerprint, status, resolved_at, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (project_id, fingerprint) DO UPDATE
         SET status = EXCLUDED.status,
             resolved_at = EXCLUDED.resolved_at,
             updated_at = CURRENT_TIMESTAMP`,
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

      let sql = `
        SELECT id, project_id, level, message, timestamp, metadata, fingerprint
        FROM logs
        WHERE fingerprint = $1
      `;
      const params: any[] = [fingerprint];
      let paramIndex = 2;

      if (projectId) {
        sql += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      sql += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(sql, params);

      let countSql = `SELECT COUNT(*) FROM logs WHERE fingerprint = $1`;
      const countParams: any[] = [fingerprint];
      if (projectId) {
        countSql += ` AND project_id = $2`;
        countParams.push(projectId);
      }
      const countResult = await pool.query(countSql, countParams);
      const total = parseInt(countResult.rows[0].count, 10);

      if (total === 0) {
        return res.status(404).json({ error: "Issue not found" });
      }

      res.json({
        fingerprint,
        logs: result.rows.map((row) => ({
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
      const result = await pool.query(
        "SELECT id, name, origins, created_at FROM projects ORDER BY name"
      );
      res.json({
        projects: result.rows.map((row) => ({
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
      const existingProject = await pool.query(
        "SELECT id FROM projects WHERE id = $1",
        [id]
      );

      if (existingProject.rows.length > 0) {
        return res.status(409).json({ error: "Project ID already exists" });
      }

      // Create project
      const result = await pool.query(
        "INSERT INTO projects (id, name, origins) VALUES ($1, $2, $3) RETURNING id, name, origins, created_at",
        [id, name, JSON.stringify(originsArray)]
      );

      res.status(201).json({
        project: {
          id: result.rows[0].id,
          name: result.rows[0].name,
          origins: result.rows[0].origins,
          created_at: result.rows[0].created_at,
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
      const existingProject = await pool.query(
        "SELECT id FROM projects WHERE id = $1",
        [id]
      );

      if (existingProject.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Update project origins
      const result = await pool.query(
        "UPDATE projects SET origins = $1 WHERE id = $2 RETURNING id, name, origins, created_at",
        [JSON.stringify(origins), id]
      );

      res.json({
        project: {
          id: result.rows[0].id,
          name: result.rows[0].name,
          origins: result.rows[0].origins,
          created_at: result.rows[0].created_at,
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
      const existingProject = await pool.query(
        "SELECT id FROM projects WHERE id = $1",
        [id]
      );

      if (existingProject.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Delete project (CASCADE will delete associated logs)
      await pool.query("DELETE FROM projects WHERE id = $1", [id]);

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
      const existingProject = await pool.query(
        "SELECT id FROM projects WHERE id = $1",
        [id]
      );

      if (existingProject.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Delete all logs for this project
      const deleteResult = await pool.query(
        "DELETE FROM logs WHERE project_id = $1 RETURNING id",
        [id]
      );

      const deletedCount = deleteResult.rowCount || 0;

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

      const result = await pool.query(
        `SELECT id, project_id, level, message, timestamp, metadata, fingerprint
         FROM logs WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Log not found" });
      }

      const row = result.rows[0];
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
