import { Router, Request, Response } from "express";
import { pool } from "../db/connection.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { LogRequest, LogsQueryParams } from "../types.js";

const router: Router = Router();

// POST /api/logs - Public endpoint for SDK to send logs (validates secret)
router.post("/", async (req: Request, res: Response) => {
  try {
    const secret = req.headers["x-secret"] as string;

    if (!secret) {
      return res
        .status(401)
        .json({ error: "Secret required in X-Secret header" });
    }

    const logData: LogRequest = req.body;

    if (!logData["project-id"] || !logData.level || !logData.message) {
      return res
        .status(400)
        .json({ error: "Missing required fields: project-id, level, message" });
    }

    // Verify secret matches a project
    const projectResult = await pool.query(
      "SELECT id, secret FROM projects WHERE id = $1",
      [logData["project-id"]]
    );

    if (projectResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid project-id" });
    }

    const project = projectResult.rows[0];

    // Compare secret (assuming secrets are stored as plain text for now, or hashed)
    // For simplicity, we'll do plain text comparison, but in production you might want to hash
    if (project.secret !== secret) {
      return res.status(401).json({ error: "Invalid secret" });
    }

    // Extract metadata (everything except project-id, level, message, timestamp)
    const {
      "project-id": projectId,
      level,
      message,
      timestamp,
      ...metadata
    } = logData;

    // Insert log
    await pool.query(
      `INSERT INTO logs (project_id, level, message, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        projectId,
        level,
        message,
        timestamp ? new Date(timestamp) : new Date(),
        JSON.stringify(metadata),
      ]
    );

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
        "SELECT id, name, created_at FROM projects ORDER BY name"
      );
      res.json({ projects: result.rows });
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/projects - Create a new project (JWT protected)
router.post(
  "/projects",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id, name, secret } = req.body;

      if (!id || !name || !secret) {
        return res
          .status(400)
          .json({ error: "Missing required fields: id, name, secret" });
      }

      if (secret.length < 8) {
        return res
          .status(400)
          .json({ error: "Secret must be at least 8 characters" });
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
        "INSERT INTO projects (id, name, secret) VALUES ($1, $2, $3) RETURNING id, name, created_at",
        [id, name, secret]
      );

      res.status(201).json({ project: result.rows[0] });
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
