#!/bin/bash

# =============================================================================
# Pydantic Backend - Build and Run Script
# =============================================================================
#
# This script rebuilds the Docker image and restarts the container
# Usage: ./build-and-run.sh [development|production]
#
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="copilotkit-pydantic"
IMAGE_NAME="copilotkit-pydantic"
PORT=8001
ENV_FILE=".env"

# Determine target (development or production)
TARGET="${1:-development}"

# Validate target
if [[ "$TARGET" != "development" && "$TARGET" != "production" ]]; then
    echo -e "${RED}Error: Invalid target. Use 'development' or 'production'${NC}"
    exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Pydantic Backend - Build and Run Script                      ║${NC}"
echo -e "${BLUE}║  Target: ${TARGET}${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Add Docker credential helper to PATH
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# Step 1: Stop and remove existing container
echo -e "${YELLOW}[1/5] Stopping existing container...${NC}"
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
    echo -e "${GREEN}✓ Container stopped and removed${NC}"
else
    echo -e "${GREEN}✓ No existing container found${NC}"
fi
echo ""

# Step 2: Remove old image (optional, uncomment to force rebuild)
# echo -e "${YELLOW}[2/5] Removing old image...${NC}"
# docker rmi ${IMAGE_NAME}:${TARGET} 2>/dev/null || true
# echo -e "${GREEN}✓ Old image removed${NC}"
# echo ""

# Step 3: Build new image
echo -e "${YELLOW}[2/5] Building Docker image (target: ${TARGET})...${NC}"
docker build \
    -t ${IMAGE_NAME}:${TARGET} \
    --target ${TARGET} \
    -f Dockerfile \
    . || {
        echo -e "${RED}✗ Build failed${NC}"
        exit 1
    }
echo -e "${GREEN}✓ Image built successfully${NC}"
echo ""

# Step 4: Check if .env file exists
echo -e "${YELLOW}[3/5] Checking environment configuration...${NC}"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}✗ Error: $ENV_FILE file not found${NC}"
    echo -e "${YELLOW}  Please create a .env file based on env.example${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Environment file found${NC}"
echo ""

# Step 5: Run new container
echo -e "${YELLOW}[4/5] Starting new container...${NC}"

if [ "$TARGET" == "development" ]; then
    # Development mode: with hot reload
    docker run -d \
        --name ${CONTAINER_NAME} \
        -p ${PORT}:${PORT} \
        --env-file ${ENV_FILE} \
        -e DEBUG=true \
        -e PYTHON_ENV=development \
        -e LOG_FORMAT=plain \
        --restart unless-stopped \
        ${IMAGE_NAME}:${TARGET} || {
            echo -e "${RED}✗ Failed to start container${NC}"
            exit 1
        }
else
    # Production mode
    docker run -d \
        --name ${CONTAINER_NAME} \
        -p ${PORT}:${PORT} \
        --env-file ${ENV_FILE} \
        -e DEBUG=false \
        -e PYTHON_ENV=production \
        -e LOG_FORMAT=json \
        --restart unless-stopped \
        ${IMAGE_NAME}:${TARGET} || {
            echo -e "${RED}✗ Failed to start container${NC}"
            exit 1
        }
fi

echo -e "${GREEN}✓ Container started${NC}"
echo ""

# Step 6: Wait for health check and show status
echo -e "${YELLOW}[5/5] Waiting for service to be ready...${NC}"
sleep 5

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${GREEN}✓ Container is running${NC}"
    
    # Try health check
    echo ""
    echo -e "${YELLOW}Testing health endpoint...${NC}"
    sleep 3
    
    if curl -sf http://localhost:${PORT}/healthz > /dev/null 2>&1; then
        HEALTH_RESPONSE=$(curl -s http://localhost:${PORT}/healthz)
        echo -e "${GREEN}✓ Health check passed${NC}"
        echo -e "${BLUE}Response: ${HEALTH_RESPONSE}${NC}"
    else
        echo -e "${YELLOW}⚠ Health check not yet responding (service may still be starting)${NC}"
    fi
else
    echo -e "${RED}✗ Container failed to start${NC}"
    echo ""
    echo -e "${YELLOW}Recent logs:${NC}"
    docker logs --tail 20 ${CONTAINER_NAME} 2>&1 || true
    exit 1
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Build Complete!                                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Container:${NC}     ${CONTAINER_NAME}"
echo -e "${GREEN}Image:${NC}         ${IMAGE_NAME}:${TARGET}"
echo -e "${GREEN}Port:${NC}          ${PORT}"
echo -e "${GREEN}Target:${NC}        ${TARGET}"
echo ""
echo -e "${BLUE}Available endpoints:${NC}"
echo -e "  • Health:   ${GREEN}http://localhost:${PORT}/healthz${NC}"
echo -e "  • Ready:    ${GREEN}http://localhost:${PORT}/readyz${NC}"
echo -e "  • Docs:     ${GREEN}http://localhost:${PORT}/docs${NC}"
echo -e "  • Agent:    ${GREEN}http://localhost:${PORT}/agent/{type}/{model}${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  • View logs:    ${BLUE}docker logs -f ${CONTAINER_NAME}${NC}"
echo -e "  • Stop:         ${BLUE}docker stop ${CONTAINER_NAME}${NC}"
echo -e "  • Restart:      ${BLUE}docker restart ${CONTAINER_NAME}${NC}"
echo -e "  • Shell:        ${BLUE}docker exec -it ${CONTAINER_NAME} /bin/bash${NC}"
echo -e "  • Stats:        ${BLUE}docker stats ${CONTAINER_NAME}${NC}"
echo ""
