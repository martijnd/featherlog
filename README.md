# Featherlog

A simple logging SDK and admin dashboard for centralized error logging.

## Project Structure

This is a monorepo containing:

- **packages/sdk** - The logging SDK that can be installed in your projects
- **packages/server** - Express backend server that receives and stores logs
- **packages/admin** - React admin UI for viewing and filtering logs
- **packages/demo** - Demo React app that demonstrates SDK usage

## Quick Start

### Development

1. Install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

```bash
# Copy root .env.example for docker-compose
cp .env.example .env

# Copy server .env.example for local development
cd packages/server
cp .env.example .env
# Edit .env with your configuration

# Copy admin .env.example for local development
cd ../admin
cp .env.example .env
# Edit .env with your API URL
```

3. Start PostgreSQL (using Docker):

```bash
docker-compose up -d postgres
```

4. Start the server:

```bash
cd packages/server
pnpm dev
```

5. Start the admin UI:

```bash
cd packages/admin
pnpm dev
```

6. Build the SDK (required for demo):

```bash
cd packages/sdk
pnpm build
```

7. Start the demo app (optional):

```bash
cd packages/demo
cp .env.example .env
# Edit .env with your secret and project-id
pnpm dev
```

The demo app will be available at http://localhost:5174. Click the buttons to generate different types of logs, then view them in the admin panel!

### Production Deployment

1. Create a `.env` file in the root directory:

```bash
# Server environment variables
JWT_SECRET=your-secret-key-change-in-production

# Admin UI environment variables (build-time, optional)
# Leave VITE_API_URL empty/unset to use relative URLs (recommended for production)
# Set VITE_API_URL only if API is on a different domain than admin UI
# VITE_API_URL=https://your-api-domain.com
```

2. For production with nginx proxy (recommended):

   - Leave `VITE_API_URL` unset/empty - the admin will use relative URLs (`/api`)
   - Nginx will proxy `/api` requests to the server
   - No CORS issues since requests go through the same domain

3. For separate API domain:

   - Set `VITE_API_URL` to your API domain

4. Start all services:

```bash
docker-compose up -d
```

**Note:** For production, make sure to:

- Set `VITE_API_URL` to your API domain (if different from admin domain)
- Use strong `JWT_SECRET` values
- Configure proper database credentials

This will start:

- PostgreSQL database on port 5432
- Backend server on port 3000
- Admin UI on port 80

## SDK Usage

```typescript
import { Logger } from "featherlog";

const logger = new Logger({
  secret: "your-secret",
  "project-id": "your-project-id",
});

try {
  // your code
} catch (error) {
  logger.error(error.message);
}
```

## Initial Setup

### Creating an Admin User

You have two options to create an admin user:

**Option 1: Use the Registration UI (Recommended)**

1. Start the server and admin UI
2. Navigate to the admin panel (http://localhost:5173 in development, or your configured domain in production)
3. Click the "Register" tab
4. Enter a username and password (minimum 6 characters)
5. Click "Register" - you'll be automatically logged in

**Option 2: Use the Command Line Script**

```bash
cd packages/server
pnpm create-user admin your-password
```

**Option 3: Use SQL directly**

```sql
-- Note: You'll need to hash the password with bcrypt
INSERT INTO users (username, password_hash)
VALUES ('admin', '$2b$10$...'); -- Use bcrypt to hash your password
```

### Creating a Project

After creating a user, create a project for your applications to use:

```bash
cd packages/server
pnpm create-project my-project "My Project" your-secret-key
```

Or use SQL:

```sql
INSERT INTO projects (id, name, secret)
VALUES ('my-project', 'My Project', 'your-secret-key');
```

**Important:** Use the same `secret` and `project-id` when initializing the Logger in your applications!

## API Endpoints

- `POST /api/logs` - Send logs (requires X-Secret header)
- `POST /api/auth/login` - Admin login
- `POST /api/auth/register` - Register a new admin user
- `GET /api/logs` - Get logs (JWT protected)
- `GET /api/logs/projects` - Get all projects (JWT protected)
