FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy root package files for workspace setup
COPY pnpm-workspace.yaml ./
COPY package.json* ./
COPY pnpm-lock.yaml* ./

# Copy admin package files
COPY packages/admin/package.json ./packages/admin/

# Install dependencies (only admin dependencies needed)
RUN pnpm install --frozen-lockfile --filter admin

# Copy admin source code
COPY packages/admin ./packages/admin

# Build the admin app
WORKDIR /app/packages/admin
RUN pnpm build

# Production stage
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/packages/admin/dist /usr/share/nginx/html

# Copy nginx configuration
COPY packages/admin/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

