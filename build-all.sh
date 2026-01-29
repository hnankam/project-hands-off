#!/bin/bash

# =============================================================================
# Build All Services - Combined Build Script
# =============================================================================
#
# This script rebuilds both services and restarts their containers
# Usage: ./build-all.sh [development|production]
#
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Determine target (development or production)
TARGET="${1:-development}"

# Validate target
if [[ "$TARGET" != "development" && "$TARGET" != "production" ]]; then
    echo -e "${RED}Error: Invalid target. Use 'development' or 'production'${NC}"
    exit 1
fi

echo ""
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║                                                                ║${NC}"
echo -e "${MAGENTA}║       🚀 CopilotKit Full Stack Build Script 🚀                ║${NC}"
echo -e "${MAGENTA}║                                                                ║${NC}"
echo -e "${MAGENTA}║  Building: Pydantic Backend + Runtime Server                  ║${NC}"
echo -e "${MAGENTA}║  Target:   ${TARGET}${NC}"
echo -e "${MAGENTA}║                                                                ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

START_TIME=$(date +%s)

# Add Docker credential helper to PATH
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# Build order: Pydantic Backend first (Runtime Server depends on it)
SERVICES=("copilotkit-pydantic" "copilot-runtime-server")
FAILED_SERVICES=()

for SERVICE in "${SERVICES[@]}"; do
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}Building: ${SERVICE}${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    if [ -d "$SERVICE" ]; then
        cd "$SERVICE"
        
        if [ -f "build-and-run.sh" ]; then
            # Make script executable
            chmod +x build-and-run.sh
            
            # Run build script
            if ./build-and-run.sh "$TARGET"; then
                echo -e "${GREEN}✓ ${SERVICE} built successfully${NC}"
            else
                echo -e "${RED}✗ ${SERVICE} build failed${NC}"
                FAILED_SERVICES+=("$SERVICE")
            fi
        else
            echo -e "${RED}✗ build-and-run.sh not found in ${SERVICE}${NC}"
            FAILED_SERVICES+=("$SERVICE")
        fi
        
        cd ..
    else
        echo -e "${RED}✗ Directory ${SERVICE} not found${NC}"
        FAILED_SERVICES+=("$SERVICE")
    fi
done

# Calculate build time
END_TIME=$(date +%s)
BUILD_TIME=$((END_TIME - START_TIME))

echo ""
echo -e "${MAGENTA}════════════════════════════════════════════════════════════════${NC}"
echo -e "${MAGENTA}Build Summary${NC}"
echo -e "${MAGENTA}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Show results
if [ ${#FAILED_SERVICES[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ All services built successfully!${NC}"
    echo ""
    echo -e "${BLUE}Build time: ${BUILD_TIME} seconds${NC}"
    echo ""
    
    # Check running containers
    echo -e "${YELLOW}Running containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "name=copilotkit-pydantic" --filter "name=copilot-runtime-server"
    echo ""
    
    # Quick health checks
    echo -e "${YELLOW}Health checks:${NC}"
    
    # Pydantic Backend
    if curl -sf http://localhost:8001/healthz > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Pydantic Backend:${NC} http://localhost:8001/healthz"
    else
        echo -e "  ${YELLOW}⚠ Pydantic Backend:${NC} Not yet responding"
    fi
    
    # Runtime Server
    if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Runtime Server:${NC}   http://localhost:3001/health"
    else
        echo -e "  ${YELLOW}⚠ Runtime Server:${NC}   Not yet responding"
    fi
    
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  🎉 Full Stack Ready!                                         ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo -e "  1. Build frontend:     ${BLUE}npm install && npm run build${NC}"
    echo -e "  2. Test backends:      ${BLUE}curl http://localhost:3001/health${NC}"
    echo -e "  3. View logs:          ${BLUE}docker logs -f copilotkit-pydantic${NC}"
    echo -e "  4. View all logs:      ${BLUE}docker-compose logs -f${NC}"
    echo ""
    
    exit 0
else
    echo -e "${RED}✗ Build failed for the following services:${NC}"
    for SERVICE in "${FAILED_SERVICES[@]}"; do
        echo -e "  ${RED}• ${SERVICE}${NC}"
    done
    echo ""
    echo -e "${YELLOW}Check the logs above for details${NC}"
    echo ""
    
    exit 1
fi
