import { Router, Response } from "express";
import crypto from "crypto";
import { query, execute } from "../db/connection.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { issueAggregateSql } from "../services/issues.js";

const router: Router = Router();

const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ISSUE_OCCURRENCE_LIMIT = 20;

function mapLogRow(row: {
  id: number;
  project_id: string;
  level: string;
  message: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  fingerprint: string | null;
}) {
  return {
    id: row.id,
    "project-id": row.project_id,
    level: row.level,
    message: row.message,
    timestamp: row.timestamp,
    metadata: row.metadata || {},
    fingerprint: row.fingerprint,
  };
}

function buildShareUrl(req: AuthRequest, token: string): string {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (base) {
    return `${base}/share/${token}`;
  }
  const host = req.get("host") || "localhost:5000";
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(
    ","
  )[0];
  return `${proto}://${host}/share/${token}`;
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// POST /api/share - Create a share link (JWT protected)
router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as {
      type?: string;
      logId?: number;
      fingerprint?: string;
      "project-id"?: string;
    };

    if (body.type !== "log" && body.type !== "issue") {
      return res
        .status(400)
        .json({ error: 'type must be "log" or "issue"' });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + SHARE_TTL_MS);
    const createdBy = req.user?.id ?? null;

    if (body.type === "log") {
      const logId = Number(body.logId);
      if (!Number.isInteger(logId) || logId <= 0) {
        return res.status(400).json({ error: "logId is required" });
      }

      const logRows = await query("SELECT id FROM logs WHERE id = ?", [
        logId,
      ]);
      if (logRows.length === 0) {
        return res.status(404).json({ error: "Log not found" });
      }

      await execute(
        `INSERT INTO share_links
          (token, resource_type, log_id, created_by, expires_at)
         VALUES (?, 'log', ?, ?, ?)`,
        [token, logId, createdBy, expiresAt]
      );
    } else {
      const fingerprint = body.fingerprint?.trim();
      const projectId = body["project-id"]?.trim();
      if (!fingerprint || !projectId) {
        return res.status(400).json({
          error: "fingerprint and project-id are required for issue shares",
        });
      }

      const issueRows = await query(
        `SELECT 1 FROM logs
         WHERE fingerprint = ? AND project_id = ?
         LIMIT 1`,
        [fingerprint, projectId]
      );
      if (issueRows.length === 0) {
        return res.status(404).json({ error: "Issue not found" });
      }

      await execute(
        `INSERT INTO share_links
          (token, resource_type, project_id, fingerprint, created_by, expires_at)
         VALUES (?, 'issue', ?, ?, ?, ?)`,
        [token, projectId, fingerprint, createdBy, expiresAt]
      );
    }

    res.status(201).json({
      token,
      url: buildShareUrl(req, token),
      expires_at: expiresAt.toISOString(),
      type: body.type,
    });
  } catch (error) {
    console.error("Error creating share link:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/share/:token - Public share payload
router.get("/:token", async (req, res: Response) => {
  try {
    const { token } = req.params;
    if (!token || token.length > 64) {
      return res.status(404).json({ error: "Share link not found" });
    }

    const shareRows = await query(
      `SELECT token, resource_type, log_id, project_id, fingerprint,
              expires_at, revoked_at
       FROM share_links
       WHERE token = ?`,
      [token]
    );

    if (shareRows.length === 0) {
      return res.status(404).json({ error: "Share link not found" });
    }

    const share = shareRows[0];
    if (share.revoked_at) {
      return res.status(404).json({ error: "Share link not found" });
    }
    if (new Date(share.expires_at).getTime() <= Date.now()) {
      return res.status(404).json({ error: "Share link not found" });
    }

    if (share.resource_type === "log") {
      const logRows = await query(
        `SELECT id, project_id, level, message, timestamp, metadata, fingerprint
         FROM logs WHERE id = ?`,
        [share.log_id]
      );
      if (logRows.length === 0) {
        return res.status(404).json({ error: "Share link not found" });
      }

      return res.json({
        type: "log",
        expires_at: share.expires_at,
        log: mapLogRow(logRows[0] as Parameters<typeof mapLogRow>[0]),
      });
    }

    if (share.resource_type === "issue") {
      const issueRows = await query(
        `SELECT
          agg.*,
          COALESCE(s.status, 'open') AS status,
          s.resolved_at
        FROM (${issueAggregateSql("fingerprint = ? AND project_id = ?")}) agg
        LEFT JOIN issue_states s
          ON s.project_id = agg.project_id AND s.fingerprint = agg.fingerprint`,
        [share.fingerprint, share.project_id]
      );

      if (issueRows.length === 0) {
        return res.status(404).json({ error: "Share link not found" });
      }

      const row = issueRows[0];
      const logsRows = await query(
        `SELECT id, project_id, level, message, timestamp, metadata, fingerprint
         FROM logs
         WHERE fingerprint = ? AND project_id = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
        [share.fingerprint, share.project_id, ISSUE_OCCURRENCE_LIMIT]
      );

      return res.json({
        type: "issue",
        expires_at: share.expires_at,
        issue: {
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
        },
        logs: logsRows.map((r) => mapLogRow(r as Parameters<typeof mapLogRow>[0])),
      });
    }

    return res.status(404).json({ error: "Share link not found" });
  } catch (error) {
    console.error("Error fetching share link:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/share/:token - Revoke a share link (JWT protected)
router.delete(
  "/:token",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { token } = req.params;
      const result = await execute(
        `UPDATE share_links
         SET revoked_at = CURRENT_TIMESTAMP(3)
         WHERE token = ? AND revoked_at IS NULL`,
        [token]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Share link not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error revoking share link:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
