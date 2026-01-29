#!/bin/bash
# =============================================================================
# Push All Docker Images to Docker Hub
# =============================================================================

set -e

# Configuration
DOCKER_USERNAME="${DOCKER_USERNAME:-yourusername}"
VERSION="${VERSION:-1.0.0}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         🚀 Docker Hub Push - All Images                        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Username: $DOCKER_USERNAME"
echo "  Version:  $VERSION"
echo ""

# Check if logged in
if ! docker info | grep -q "Username"; then
    echo -e "${RED}❌ Not logged in to Docker Hub${NC}"
    echo ""
    echo "Please run: docker login"
    exit 1
fi

LOGGED_IN_USER=$(docker info | grep "Username" | awk '{print $2}')
echo -e "${GREEN}✅ Logged in as: $LOGGED_IN_USER${NC}"
echo ""

# Confirm before proceeding
read -p "Push images as '$DOCKER_USERNAME' version '$VERSION'? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""

# Function to tag and push
tag_and_push() {
    local image=$1
    local name=$2
    
    echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
    echo -e "${BLUE}📦 Processing: $name${NC}"
    echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
    
    # Check if image exists locally
    if ! docker image inspect $image:latest >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Warning: $image:latest not found locally${NC}"
        echo "   Skipping..."
        echo ""
        return
    fi
    
    # Get image size
    SIZE=$(docker images $image:latest --format "{{.Size}}")
    echo "   Image size: $SIZE"
    
    # Tag with version and latest
    echo "   Tagging..."
    docker tag $image:latest $DOCKER_USERNAME/$name:latest
    docker tag $image:latest $DOCKER_USERNAME/$name:$VERSION
    
    # Push both tags
    echo "   Pushing latest..."
    docker push $DOCKER_USERNAME/$name:latest
    echo "   Pushing $VERSION..."
    docker push $DOCKER_USERNAME/$name:$VERSION
    
    echo -e "   ${GREEN}✅ Done${NC}"
    echo ""
}

# Array to track pushed images
declare -a PUSHED_IMAGES=()

# Main services
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Main Services${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if tag_and_push "copilot-runtime-server" "copilot-runtime-server"; then
    PUSHED_IMAGES+=("copilot-runtime-server")
fi

if tag_and_push "copilotkit-pydantic" "copilotkit-pydantic"; then
    PUSHED_IMAGES+=("copilotkit-pydantic")
fi

# MCP Servers
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}MCP Servers${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

if tag_and_push "github-mcp" "github-mcp"; then
    PUSHED_IMAGES+=("github-mcp")
fi

if tag_and_push "jira-mcp" "jira-mcp"; then
    PUSHED_IMAGES+=("jira-mcp")
fi

if tag_and_push "confluence-mcp" "confluence-mcp"; then
    PUSHED_IMAGES+=("confluence-mcp")
fi

if tag_and_push "databricks-mcp" "databricks-mcp"; then
    PUSHED_IMAGES+=("databricks-mcp")
fi

# Summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         🎉 Push Complete!                                      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📋 Pushed Images (${#PUSHED_IMAGES[@]}):${NC}"
for img in "${PUSHED_IMAGES[@]}"; do
    echo "   ✅ $DOCKER_USERNAME/$img:$VERSION"
    echo "   ✅ $DOCKER_USERNAME/$img:latest"
done
echo ""
echo -e "${BLUE}🌐 View on Docker Hub:${NC}"
echo "   https://hub.docker.com/u/$DOCKER_USERNAME"
echo ""
echo -e "${YELLOW}📥 To pull images on another machine:${NC}"
echo "   docker pull $DOCKER_USERNAME/copilot-runtime-server:$VERSION"
echo "   docker pull $DOCKER_USERNAME/copilotkit-pydantic:$VERSION"
echo ""
