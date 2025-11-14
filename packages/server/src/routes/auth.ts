import { Router, Request, Response } from "express";
import { pool } from "../db/connection.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { LoginRequest } from "../types.js";

const router: Router = Router();

// POST /api/auth/login - Admin login (returns JWT)
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password }: LoginRequest = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const result = await pool.query(
      "SELECT id, username, password_hash FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const jwtSecret =
      process.env.JWT_SECRET || "your-secret-key-change-in-production";
    const token = jwt.sign(
      { id: user.id, username: user.username },
      jwtSecret,
      { expiresIn: "24h" }
    );

    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Registration is disabled - users must be created via CLI script:
// docker compose exec server node dist/scripts/create-user.js <username> <password>

export default router;
