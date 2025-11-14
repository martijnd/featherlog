import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { initDatabase } from "./db/connection.js";
import logsRouter from "./routes/logs.js";
import authRouter from "./routes/auth.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// app.use(
//   cors({
//     origin: "*",
//     credentials: true,
//   })
// );

app.use(express.json());

// API Routes (must come before static files)
app.use("/api/logs", logsRouter);
app.use("/api/auth", authRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Serve static files from admin build
// In Docker: admin/dist is copied to server/admin/dist
// In development: use packages/admin/dist relative to compiled dist folder
const adminDistPath = (() => {
  // Try Docker path first (admin/dist copied to server/admin/dist)
  const dockerPath = path.join(__dirname, "../admin/dist");
  // Try development path (from packages/server/dist to packages/admin/dist)
  const devPath = path.join(__dirname, "../../admin/dist");

  if (existsSync(dockerPath)) {
    console.log(`Serving admin UI from Docker path: ${dockerPath}`);
    return dockerPath;
  }
  if (existsSync(devPath)) {
    console.log(`Serving admin UI from development path: ${devPath}`);
    return devPath;
  }
  console.warn(`Admin UI not found. Tried:`);
  console.warn(`  - Docker path: ${dockerPath}`);
  console.warn(`  - Dev path: ${devPath}`);
  console.warn(`Please build the admin UI: cd packages/admin && pnpm build`);
  return null;
})();

if (adminDistPath) {
  app.use(express.static(adminDistPath));

  // Serve admin app for all non-API routes (React Router support)
  app.get("*", (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Not found" });
    }
    res.sendFile(path.join(adminDistPath, "index.html"));
  });
} else {
  // Admin UI not built - show helpful message
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(503).send(`
      <html>
        <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
          <h1>Admin UI Not Available</h1>
          <p>The admin UI has not been built yet.</p>
          <p>Please run: <code>cd packages/admin && pnpm build</code></p>
        </body>
      </html>
    `);
  });
}

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Admin UI available at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
