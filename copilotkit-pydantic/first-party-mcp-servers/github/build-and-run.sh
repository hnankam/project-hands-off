#!/bin/bash

# =============================================================================
# GitHub MCP Server - Build and Run Script
# =============================================================================

set -e

# Configuration
SERVER_NAME="github"
SERVER_PORT="8101"
CONTAINER_PORT="8000"
IMAGE_NAME="github-mcp"
CONTAINER_NAME="github-mcp"
ENV_FILE="/Users/hnankam/Downloads/data/project-hands-off/copilotkit-pydantic/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}🔨 GitHub MCP Server - Build & Deploy${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Error: Environment file not found at $ENV_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "   Server: $SERVER_NAME"
echo "   Image: $IMAGE_NAME:latest"
echo "   Container: $CONTAINER_NAME"
echo "   Port Mapping: $SERVER_PORT:$CONTAINER_PORT"
echo "   Env File: $ENV_FILE"
echo ""

# Stop and remove existing container if running
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}🛑 Stopping existing container...${NC}"
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    echo -e "${YELLOW}🗑️  Removing existing container...${NC}"
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
    echo ""
fi

# Build Docker image
echo -e "${BLUE}🔨 Building Docker image...${NC}"
cd ..
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

docker build \
    --build-arg MCP_SERVER_NAME="$SERVER_NAME" \
    --build-arg MCP_SERVER_PORT="$SERVER_PORT" \
    -f "${SERVER_NAME}/Dockerfile" \
    -t "${IMAGE_NAME}:latest" \
    -t "${IMAGE_NAME}:dev" \
    .

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful!${NC}"
echo ""

# Run container
echo -e "${BLUE}🚀 Starting container...${NC}"
docker run -d \
    --name "$CONTAINER_NAME" \
    --env-file "$ENV_FILE" \
    -e PORT="$SERVER_PORT" \
    -p "${SERVER_PORT}:${CONTAINER_PORT}" \
    --restart unless-stopped \
    "${IMAGE_NAME}:latest"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to start container!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Container started!${NC}"
echo ""

# Wait for startup
echo -e "${YELLOW}⏳ Waiting 8 seconds for server to initialize...${NC}"
sleep 8

# Check status
echo ""
echo -e "${BLUE}📊 Container Status:${NC}"
docker ps --filter name="$CONTAINER_NAME" --format "   Name:   {{.Names}}
   Status: {{.Status}}
   Ports:  {{.Ports}}"

echo ""
echo -e "${BLUE}📝 Recent Logs:${NC}"
echo "----------------------------------------------------------------"
docker logs "$CONTAINER_NAME" 2>&1 | tail -15
echo "----------------------------------------------------------------"

# Health check
echo ""
if docker ps --filter name="$CONTAINER_NAME" --filter status=running | grep -q "$CONTAINER_NAME"; then
    echo -e "${GREEN}✅ GitHub MCP Server is running!${NC}"
    echo ""
    echo -e "${BLUE}🌐 Access Information:${NC}"
    echo "   Internal (container): http://0.0.0.0:${CONTAINER_PORT}/sse"
    echo "   External (host):      http://localhost:${SERVER_PORT}/sse"
    echo "   Admin Tools URL:      http://host.docker.internal:${SERVER_PORT}/sse"
    echo ""
    echo -e "${BLUE}🔧 Useful Commands:${NC}"
    echo "   View logs:    docker logs -f $CONTAINER_NAME"
    echo "   Stop:         docker stop $CONTAINER_NAME"
    echo "   Restart:      docker restart $CONTAINER_NAME"
    echo "   Remove:       docker rm -f $CONTAINER_NAME"
else
    echo -e "${RED}❌ Container failed to start!${NC}"
    echo "   Check logs with: docker logs $CONTAINER_NAME"
    exit 1
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
