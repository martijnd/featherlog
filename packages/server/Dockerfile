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

# Copy server package files
COPY packages/server/package.json ./packages/server/

# Install dependencies (only server dependencies needed)
# Rebuild native modules to ensure they're compiled for the container's architecture
RUN pnpm install --frozen-lockfile --filter server --force

# Copy server source code
COPY packages/server ./packages/server

# Build the server
WORKDIR /app/packages/server
RUN pnpm build

EXPOSE 3000

WORKDIR /app/packages/server
CMD ["node", "dist/index.js"]

