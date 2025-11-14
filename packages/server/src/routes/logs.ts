import { Router, Request, Response } from "express";
import { pool } from "../db/connection.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { LogRequest, LogsQueryParams } from "../types.js";
import { logBroadcaster } from "../services/logBroadcaster.js";

const router: Router = Router();

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

    // Insert log
    const insertResult = await pool.query(
      `INSERT INTO logs (project_id, level, message, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, project_id, level, message, timestamp, metadata`,
      [
        projectId,
        level,
        message,
        timestamp ? new Date(timestamp) : new Date(),
        JSON.stringify(metadata),
      ]
    );

    const newLog = insertResult.rows[0];

    // Broadcast the new log to all connected SSE clients
    logBroadcaster.broadcastLog({
      id: newLog.id,
      "project-id": newLog.project_id,
      level: newLog.level,
      message: newLog.message,
      timestamp: newLog.timestamp,
      metadata: newLog.metadata,
    });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Error creating log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/logs - Get logs with filtering (JWT protected)
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const query: LogsQueryParams = req.query as any;

    let sql = "SELECT * FROM logs WHERE 1=1";
    const params: any[] = [];
    let paramIndex = 1;

    if (query["project-id"]) {
      sql += ` AND project_id = $${paramIndex}`;
      params.push(query["project-id"]);
      paramIndex++;
    }

    if (query.level) {
      sql += ` AND level = $${paramIndex}`;
      params.push(query.level);
      paramIndex++;
    }

    if (query.startDate) {
      sql += ` AND timestamp >= $${paramIndex}`;
      params.push(new Date(query.startDate));
      paramIndex++;
    }

    if (query.endDate) {
      sql += ` AND timestamp <= $${paramIndex}`;
      params.push(new Date(query.endDate));
      paramIndex++;
    }

    sql += " ORDER BY timestamp DESC";

    const limit = query.limit ? parseInt(query.limit.toString(), 10) : 100;
    const offset = query.offset ? parseInt(query.offset.toString(), 10) : 0;

    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(sql, params);

    // Get total count for pagination
    let countSql = "SELECT COUNT(*) FROM logs WHERE 1=1";
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (query["project-id"]) {
      countSql += ` AND project_id = $${countParamIndex}`;
      countParams.push(query["project-id"]);
      countParamIndex++;
    }

    if (query.level) {
      countSql += ` AND level = $${countParamIndex}`;
      countParams.push(query.level);
      countParamIndex++;
    }

    if (query.startDate) {
      countSql += ` AND timestamp >= $${countParamIndex}`;
      countParams.push(new Date(query.startDate));
      countParamIndex++;
    }

    if (query.endDate) {
      countSql += ` AND timestamp <= $${countParamIndex}`;
      countParams.push(new Date(query.endDate));
      countParamIndex++;
    }

    const countResult = await pool.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      logs: result.rows.map((row) => ({
        id: row.id,
        "project-id": row.project_id,
        level: row.level,
        message: row.message,
        timestamp: row.timestamp,
        metadata: row.metadata,
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

export default router;
