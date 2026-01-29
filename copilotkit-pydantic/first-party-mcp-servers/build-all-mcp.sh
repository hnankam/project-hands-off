#!/bin/bash

# =============================================================================
# Build and Deploy All MCP Servers
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# MCP Server Configuration
# Format: "server_name:port:status"
# status: enabled/disabled
declare -A MCP_SERVERS=(
    ["github"]="8101:disabled"
    ["jira"]="8102:enabled"
    ["confluence"]="8103:disabled"
    ["databricks"]="8104:enabled"
    ["microsoft365"]="8105:disabled"
)

CONTAINER_PORT="8000"  # FastMCP always runs on port 8000 internally
ENV_FILE="../copilotkit-pydantic/.env"

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}🚀 MCP Servers - Batch Build & Deploy${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Error: Environment file not found at $ENV_FILE${NC}"
    exit 1
fi

# Add docker-credential-desktop to PATH for macOS
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# Summary arrays
declare -a BUILT_SERVERS=()
declare -a FAILED_SERVERS=()
declare -a SKIPPED_SERVERS=()

# Function to build and deploy a single MCP server
build_server() {
    local server_name=$1
    local server_port=$2
    local image_name="${server_name}-mcp"
    local container_name="${server_name}-mcp"
    
    echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
    echo -e "${BLUE}📦 Building: ${server_name} MCP Server${NC}"
    echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
    echo ""
    
    # Stop and remove existing container
    if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        echo -e "${YELLOW}🛑 Stopping existing container...${NC}"
        docker stop "$container_name" 2>/dev/null || true
        docker rm "$container_name" 2>/dev/null || true
    fi
    
    # Build image
    echo -e "${YELLOW}🔨 Building Docker image...${NC}"
    if docker build \
        --build-arg MCP_SERVER_NAME="$server_name" \
        --build-arg MCP_SERVER_PORT="$server_port" \
        -f "${server_name}/Dockerfile" \
        -t "${image_name}:latest" \
        -t "${image_name}:dev" \
        . > "/tmp/${server_name}-build.log" 2>&1; then
        echo -e "${GREEN}✅ Build successful${NC}"
    else
        echo -e "${RED}❌ Build failed!${NC}"
        echo "   Log: /tmp/${server_name}-build.log"
        FAILED_SERVERS+=("$server_name")
        return 1
    fi
    
    # Run container
    echo -e "${YELLOW}🚀 Starting container...${NC}"
    if docker run -d \
        --name "$container_name" \
        --env-file "$ENV_FILE" \
        -e PORT="$server_port" \
        -p "${server_port}:${CONTAINER_PORT}" \
        --restart unless-stopped \
        "${image_name}:latest" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Container started${NC}"
        BUILT_SERVERS+=("$server_name:$server_port")
    else
        echo -e "${RED}❌ Failed to start container${NC}"
        FAILED_SERVERS+=("$server_name")
        return 1
    fi
    
    # Wait a bit for startup
    sleep 3
    
    # Quick health check
    if docker ps --filter name="$container_name" --filter status=running | grep -q "$container_name"; then
        echo -e "${GREEN}✅ Health check passed${NC}"
    else
        echo -e "${RED}❌ Container not running${NC}"
        echo "   Check logs: docker logs $container_name"
        FAILED_SERVERS+=("$server_name")
        return 1
    fi
    
    echo ""
    return 0
}

# Main build loop
echo -e "${CYAN}📋 Building enabled MCP servers...${NC}"
echo ""

for server in "${!MCP_SERVERS[@]}"; do
    IFS=':' read -r port status <<< "${MCP_SERVERS[$server]}"
    
    if [ "$status" == "enabled" ]; then
        if build_server "$server" "$port"; then
            :  # Success logged in function
        fi
    else
        echo -e "${YELLOW}⏭️  Skipping: $server (disabled)${NC}"
        SKIPPED_SERVERS+=("$server")
        echo ""
    fi
done

# Final Summary
echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}📊 Build Summary${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""

if [ ${#BUILT_SERVERS[@]} -gt 0 ]; then
    echo -e "${GREEN}✅ Successfully Deployed (${#BUILT_SERVERS[@]}):${NC}"
    for server_info in "${BUILT_SERVERS[@]}"; do
        IFS=':' read -r name port <<< "$server_info"
        echo "   • $name-mcp (port $port)"
    done
    echo ""
fi

if [ ${#FAILED_SERVERS[@]} -gt 0 ]; then
    echo -e "${RED}❌ Failed (${#FAILED_SERVERS[@]}):${NC}"
    for server in "${FAILED_SERVERS[@]}"; do
        echo "   • $server-mcp"
    done
    echo ""
fi

if [ ${#SKIPPED_SERVERS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⏭️  Skipped (${#SKIPPED_SERVERS[@]}):${NC}"
    for server in "${SKIPPED_SERVERS[@]}"; do
        IFS=':' read -r port status <<< "${MCP_SERVERS[$server]}"
        echo "   • $server-mcp (port $port) - $status"
    done
    echo ""
fi

# Container status
echo -e "${BLUE}📦 Running MCP Containers:${NC}"
echo "────────────────────────────────────────────────────────────────"
docker ps --filter name=mcp --format "{{.Names}}\t{{.Status}}\t{{.Ports}}" | column -t
echo "────────────────────────────────────────────────────────────────"
echo ""

# Admin Tools configuration
if [ ${#BUILT_SERVERS[@]} -gt 0 ]; then
    echo -e "${BLUE}🌐 Admin Tools Configuration:${NC}"
    echo "────────────────────────────────────────────────────────────────"
    for server_info in "${BUILT_SERVERS[@]}"; do
        IFS=':' read -r name port <<< "$server_info"
        echo "   $name:"
        echo "      Transport: sse"
        echo "      URL: http://host.docker.internal:$port/sse"
        echo ""
    done
    echo "────────────────────────────────────────────────────────────────"
fi

# Useful commands
echo ""
echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo "   View all logs:     docker logs -f <container-name>"
echo "   Stop all:          docker stop \$(docker ps -q --filter name=mcp)"
echo "   Remove all:        docker rm -f \$(docker ps -aq --filter name=mcp)"
echo "   Restart all:       docker restart \$(docker ps -q --filter name=mcp)"
echo ""

# Exit code
if [ ${#FAILED_SERVERS[@]} -gt 0 ]; then
    echo -e "${RED}⚠️  Some servers failed to deploy${NC}"
    exit 1
else
    echo -e "${GREEN}================================================================${NC}"
    echo -e "${GREEN}🎉 All Enabled MCP Servers Deployed Successfully!${NC}"
    echo -e "${GREEN}================================================================${NC}"
    exit 0
fi
