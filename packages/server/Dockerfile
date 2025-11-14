FROM node:20-alpine

WORKDIR /app

# Install build dependencies for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN npm install -g pnpm

# Copy root package files for workspace setup
COPY pnpm-workspace.yaml ./
COPY package.json* ./
COPY pnpm-lock.yaml* ./

# Copy server and admin package files
COPY packages/server/package.json ./packages/server/
COPY packages/admin/package.json ./packages/admin/

# Install dependencies (server and admin)
RUN pnpm install --frozen-lockfile --filter server --filter admin --force

# Copy source code
COPY packages/server ./packages/server
COPY packages/admin ./packages/admin

# Build admin app first
WORKDIR /app/packages/admin
RUN pnpm build

# Build server
WORKDIR /app/packages/server
RUN pnpm build

# Copy admin dist to server for static serving
RUN mkdir -p /app/packages/server/admin && cp -r /app/packages/admin/dist /app/packages/server/admin/dist

EXPOSE 3000

WORKDIR /app/packages/server
CMD ["node", "dist/index.js"]

