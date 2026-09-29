import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { initDatabase } from "./db/connection.js";
import logsRouter from "./routes/logs.js";
import authRouter from "./routes/auth.js";
import shareRouter from "./routes/share.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
// Server handles CORS in all environments (not relying on Nginx)
// We allow all origins here - actual origin validation happens in the /api/logs route
// based on the project's allowed origins list
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    // Allow all origins - validation happens in the route handler based on project configuration
    callback(null, true);
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// API Routes (must come before static files)
app.use("/api/logs", logsRouter);
app.use("/api/auth", authRouter);
app.use("/api/share", shareRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Serve built admin only in production (Docker / NODE_ENV=production).
// Local `pnpm dev` uses the Vite admin on :5001 instead.
const isProduction = process.env.NODE_ENV === "production";

const adminDistPath = (() => {
  if (!isProduction) {
    return null;
  }

  // Try Docker path first (admin/dist copied to server/admin/dist)
  const dockerPath = path.join(__dirname, "../admin/dist");
  // Fallback: packages/admin/dist relative to compiled dist folder
  const builtPath = path.join(__dirname, "../../admin/dist");

  if (existsSync(dockerPath)) {
    console.log(`Serving admin UI from Docker path: ${dockerPath}`);
    return dockerPath;
  }
  if (existsSync(builtPath)) {
    console.log(`Serving admin UI from: ${builtPath}`);
    return builtPath;
  }
  console.warn(`Admin UI not found. Tried:`);
  console.warn(`  - Docker path: ${dockerPath}`);
  console.warn(`  - Built path: ${builtPath}`);
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
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!isProduction) {
      res.status(404).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
            <h1>API only</h1>
            <p>In development the admin UI runs on Vite.</p>
            <p>Open <a href="http://localhost:5001">http://localhost:5001</a></p>
          </body>
        </html>
      `);
      return;
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
      if (adminDistPath) {
        console.log(`Admin UI available at http://localhost:${PORT}`);
      } else if (!isProduction) {
        console.log(`Admin UI (Vite): http://localhost:5001`);
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
