# Featherlog

A simple logging SDK and admin dashboard for centralized error logging.

## Project Structure

This is a pnpm monorepo containing:

- **packages/sdk** (`featherlog`) — Publishable logging SDK
- **packages/server** — Express API that receives logs, serves the admin UI, and uses PostgreSQL
- **packages/admin** — React admin UI for viewing, filtering, and managing logs/projects
- **packages/demo** — Demo React app that exercises the SDK

## Quick Start

### Development

1. Install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

```bash
# Root .env (used by docker compose / deploy)
cp .env.example .env

# Server
cp packages/server/.env.example packages/server/.env

# Admin (Vite); point at the API during local Vite dev
cp packages/admin/.env.example packages/admin/.env
```

3. Start PostgreSQL:

```bash
docker compose up -d postgres
```

4. Build the admin UI (required if you want the server to serve it at `:3000`):

```bash
pnpm build:admin
```

5. Start the server (API + admin UI when built):

```bash
cd packages/server
pnpm dev
```

The server is available at http://localhost:3000

- API: http://localhost:3000/api/*
- Admin UI: http://localhost:3000
- Health: http://localhost:3000/health

Alternatively, from the repo root:

```bash
pnpm dev   # postgres + server + admin (Vite) + demo in parallel
```

6. Build the SDK (required for the demo):

```bash
pnpm build:sdk
```

7. Create an admin user and a project (see [Initial Setup](#initial-setup)), then optionally start the demo:

```bash
cd packages/demo
pnpm dev
```

Local Vite apps: admin at http://localhost:4000, demo at http://localhost:4001 (default project-id `demo-app`, overridable with `VITE_FEATHERLOG_PROJECT_ID`). Make sure that project's allowed origins include `http://localhost:4001`.

### Production Deployment

1. Create a root `.env` with at least:

```bash
JWT_SECRET=<strong-secret>
POSTGRES_USER=featherlog_user
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=featherlog
PORT=3000
```

2. Admin UI API URL (build-time):

   - **Same domain / nginx proxy (recommended):** leave `VITE_API_URL` unset so the admin uses relative `/api`
   - **Separate API domain:** set `VITE_API_URL` to that API origin before building

3. Deploy:

```bash
./deploy.sh
# or
docker compose -f docker-compose.prod.yml up -d --build
```

## Authentication

### Log ingest (SDK → server)

Projects use **origin-based** authentication. Configure allowed origins per project (admin UI or CLI). Browser requests must send an `Origin`/`Referer` that matches; server-side Node requests with no origin are allowed if the `project-id` exists.

The SDK only needs a `project-id` (no shared secret).

### Admin UI / API

Admin routes use JWT (`Authorization: Bearer …`) after login. Users are created via CLI (registration endpoint is disabled).

## SDK Usage

```bash
npm install featherlog
# or
pnpm add featherlog
```

```typescript
import { Logger } from "featherlog";

const logger = new Logger({
  "project-id": "your-project-id",
});

try {
  // your code
} catch (error) {
  logger.error(error.message, { stack: error.stack });
}

logger.warn("Something might be wrong", { userId: 123 });
logger.info("User logged in", { userId: 123 });
```

Endpoint resolution:

1. `FEATHERLOG_ENDPOINT` if set
2. Otherwise `http://localhost:3000/api/logs` in development
3. Otherwise `https://featherlog.x4d.nl/api/logs` when `NODE_ENV=production`

See [packages/sdk/README.md](packages/sdk/README.md) for full SDK docs.

## Initial Setup

### Creating an Admin User

```bash
cd packages/server
pnpm create-user admin your-password
```

**In production (Docker):**

```bash
docker compose -f docker-compose.prod.yml exec server node dist/scripts/create-user.js admin your-password
```

### Creating a Project

Projects require a non-empty list of allowed origins:

```bash
cd packages/server
pnpm create-project my-project "My Project" '["http://localhost:4001","https://yourdomain.com"]'
```

Or via the admin UI after logging in. Or SQL:

```sql
INSERT INTO projects (id, name, origins)
VALUES ('my-project', 'My Project', '["http://localhost:4001"]');
```

Use the same `project-id` when initializing `Logger`, and keep the origins list in sync with where your app runs.

## API Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/logs` | Origin check | Ingest a log |
| `GET` | `/api/logs` | JWT | List / filter logs |
| `GET` | `/api/logs/stream` | JWT | Live log stream |
| `GET` | `/api/logs/projects` | JWT | List projects |
| `POST` | `/api/logs/projects` | JWT | Create project |
| `PUT` | `/api/logs/projects/:id` | JWT | Update project |
| `DELETE` | `/api/logs/projects/:id` | JWT | Delete project |
| `DELETE` | `/api/logs/projects/:id/logs` | JWT | Clear project logs |
| `POST` | `/api/auth/login` | — | Admin login |
| `GET` | `/health` | — | Health check |

## Useful Commands

```bash
pnpm build                 # build all packages
pnpm build:sdk
pnpm build:admin
pnpm build:server          # admin then server
pnpm --filter featherlog test
```
