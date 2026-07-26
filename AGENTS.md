# Featherlog — Agent Notes

Centralized error logging: a publishable Node SDK, Express + Postgres API, React admin UI, and a demo app. pnpm monorepo (`packages/*`).

## Packages

| Package | Path | Role |
| --- | --- | --- |
| `featherlog` | `packages/sdk` | Publishable SDK (`Logger`). Only package with tests (Vitest). |
| `server` | `packages/server` | Express API + serves built admin UI. Auto-creates DB schema on boot. |
| `admin` | `packages/admin` | React + Vite admin dashboard (login, projects, live logs). |
| `demo` | `packages/demo` | Vite React app using workspace `featherlog` to emit sample logs. |

## Stack

- **Package manager:** pnpm (workspace)
- **Language:** TypeScript, ESM (`"type": "module"`)
- **Server:** Express, `pg`, JWT (`jsonwebtoken` + `bcrypt`), `tsx` for dev
- **Frontends:** React 18 + Vite 5
- **DB:** PostgreSQL 16 (Docker)

Server TS imports use `.js` extensions (e.g. `./db/connection.js`) even for `.ts` sources — keep that pattern.

## Auth model (important)

- **Ingest (`POST /api/logs`):** origin-based. Body needs `project-id`, `level`, `message`. Browser `Origin`/`Referer` must match the project's `origins` JSONB list (`*` and prefix wildcards supported). Requests with no origin (typical Node SDK) are allowed if the project exists.
- **Admin API:** JWT `Authorization: Bearer …` after `/api/auth/login`.
- **SDK:** only requires `{ "project-id": "..." }`. Endpoint from `FEATHERLOG_ENDPOINT`, else `http://localhost:3000/api/logs` (dev) or `https://featherlog.lekkerklooien.nl/api/logs` (production `NODE_ENV`).

## Commands

From repo root (after `pnpm install`):

```bash
pnpm build              # all packages
pnpm build:sdk          # packages/sdk
pnpm build:admin        # packages/admin
pnpm build:server       # admin then server (build:all)
pnpm dev                # postgres via docker compose + parallel server/admin/demo
pnpm --filter featherlog test
```

Package-local:

```bash
# server
cd packages/server && pnpm dev
pnpm create-user <username> <password>
pnpm create-project <id> <name> '["http://localhost:5174"]'

# admin / demo (Vite)
cd packages/admin && pnpm dev   # typically :5173
cd packages/demo && pnpm dev    # typically :5174
```

Production deploy: `./deploy.sh` → `docker-compose.prod.yml`.

## Dev wiring

1. Copy env examples: root `.env.example`, `packages/server/.env.example`, `packages/admin/.env.example` (and demo if needed).
2. `docker compose up -d postgres`
3. Build admin before relying on server-served UI: `pnpm build:admin` (or use Vite admin with `VITE_API_URL`).
4. Server: `http://localhost:3000` — `/api/*`, `/health`, and static admin from `packages/admin/dist` when present.
5. Demo needs a project whose origins include the demo origin (e.g. `http://localhost:5174`).

## API surface

- `POST /api/logs` — ingest (public + origin check)
- `GET /api/logs` — list/filter (JWT); supports SSE-style live updates via `logBroadcaster`
- `GET /api/logs/projects` — projects (JWT); project CRUD also under logs routes
- `POST /api/auth/login`, `POST /api/auth/register`

DB tables (created in `packages/server/src/db/connection.ts`): `projects` (`origins` JSONB, non-empty), `users`, `logs`.

## Conventions

- Keep changes scoped to the package that owns the concern (SDK vs server vs admin).
- Demo depends on `featherlog` via `workspace:*` — rebuild SDK after SDK API changes.
- Admin production builds should leave `VITE_API_URL` empty so the UI uses relative `/api` (same origin / nginx proxy).
- Logging from the SDK must not break callers: send failures stay silent/`console.warn`.
- Do not commit `.env` or secrets. Do not publish from root — only `packages/sdk` is the npm package.

## Gotchas

- Server without a built admin still runs the API; static UI is skipped with a warning.
- `create-project` requires a non-empty origins JSON array; a lone `"*"` is rejected by the CLI.
- CORS on the server is permissive; real gating is per-project origins on ingest.
