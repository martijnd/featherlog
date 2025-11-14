#!/bin/bash
# Quick deployment script for Featherlog
# Usage: ./deploy.sh

set -e

echo "🚀 Featherlog Deployment Script"
echo "================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Creating .env.example..."
    echo ""
    echo "Please create a .env file with the following variables:"
    echo "  JWT_SECRET=<generate with: openssl rand -base64 32>"
    echo "  POSTGRES_USER=featherlog_user"
    echo "  POSTGRES_PASSWORD=<generate with: openssl rand -base64 24>"
    echo "  POSTGRES_DB=featherlog"
    echo "  PORT=3000"
    exit 1
fi

# Load environment variables
source .env

# Check required variables
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "change-this-secret-in-production" ]; then
    echo "❌ JWT_SECRET not set or using default value!"
    echo "Generate one with: openssl rand -base64 32"
    exit 1
fi

echo "✅ Environment variables loaded"
echo ""

# Build Docker images
echo "🔨 Building Docker images..."
docker-compose -f docker-compose.prod.yml build

echo ""
echo "✅ Build complete!"
echo ""

# Start services
echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check if services are running
if docker-compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo "✅ Services are running!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Create an admin user:"
    echo "   docker-compose -f docker-compose.prod.yml exec server node dist/scripts/create-user.js admin <password>"
    echo ""
    echo "2. Or register via the UI at https://featherlog.lekkerklooien.nl"
    echo ""
    echo "3. Create a project via the admin UI or:"
    echo "   docker-compose -f docker-compose.prod.yml exec server node dist/scripts/create-project.js <id> <name> '[\"https://yourdomain.com\"]'"
    echo ""
    echo "4. View logs:"
    echo "   docker-compose -f docker-compose.prod.yml logs -f server"
else
    echo "❌ Services failed to start. Check logs:"
    echo "   docker-compose -f docker-compose.prod.yml logs"
    exit 1
fi

