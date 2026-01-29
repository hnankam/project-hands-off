#!/bin/bash
# =============================================================================
# Environment Switcher for Chrome Extension
# Quickly switch between local and Railway deployments
# =============================================================================

set -e

PROJECT_ROOT="/Users/hnankam/Downloads/data/project-hands-off"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

show_usage() {
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   Environment Switcher for Chrome Extension                   ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./switch-env.sh [local|railway|show]"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  local    - Switch to local development (localhost)"
    echo "  railway  - Switch to Railway production deployment"
    echo "  show     - Show current configuration"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  ./switch-env.sh railway"
    echo "  ./switch-env.sh local"
    echo "  ./switch-env.sh show"
}

show_current() {
    echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
    echo -e "${BLUE}Current Configuration${NC}"
    echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
    echo ""
    if [ -f "$PROJECT_ROOT/.env" ]; then
        grep "CEB_API_URL\|CEB_BACKEND_URL" "$PROJECT_ROOT/.env" || echo "No CEB variables found"
    else
        echo -e "${RED}.env file not found${NC}"
    fi
    echo ""
}

switch_to_local() {
    echo -e "${YELLOW}Switching to LOCAL environment...${NC}"
    
    # Backup current .env
    if [ -f "$PROJECT_ROOT/.env" ]; then
        cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup-$(date +%Y%m%d-%H%M%S)"
        echo -e "${GREEN}✅ Backed up current .env${NC}"
    fi
    
    # Create new .env for local
    cat > "$PROJECT_ROOT/.env" << 'EOF'
# Chrome Extension Boilerplate Environment Variables
# Local Development Configuration

# Runtime Server (Local)
CEB_API_URL=http://localhost:3001

# Pydantic Backend (Local)
CEB_BACKEND_URL=http://localhost:8001

# Optional build configuration
CEB_DEV_LOCALE=
CEB_CI=
EOF
    
    echo -e "${GREEN}✅ Switched to LOCAL environment${NC}"
    echo ""
    show_current
    echo ""
    echo -e "${YELLOW}🔧 Next steps:${NC}"
    echo "  1. Ensure local services are running:"
    echo "     - Runtime Server:    http://localhost:3001"
    echo "     - Pydantic Backend:  http://localhost:8001"
    echo "  2. Rebuild extension: pnpm build"
    echo "  3. Reload extension in Chrome"
}

switch_to_railway() {
    echo -e "${YELLOW}Switching to RAILWAY environment...${NC}"
    
    # Backup current .env
    if [ -f "$PROJECT_ROOT/.env" ]; then
        cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup-$(date +%Y%m%d-%H%M%S)"
        echo -e "${GREEN}✅ Backed up current .env${NC}"
    fi
    
    # Create new .env for Railway
    cat > "$PROJECT_ROOT/.env" << 'EOF'
# Chrome Extension Boilerplate Environment Variables
# Railway Production Configuration

# Runtime Server (Railway Deployment)
CEB_API_URL=https://copilot-runtime-server-production.up.railway.app

# Pydantic Backend (Railway Deployment)
CEB_BACKEND_URL=https://copilotkit-pydantic-production.up.railway.app

# Optional build configuration
CEB_DEV_LOCALE=
CEB_CI=
EOF
    
    echo -e "${GREEN}✅ Switched to RAILWAY environment${NC}"
    echo ""
    show_current
    echo ""
    echo -e "${YELLOW}🔧 Next steps:${NC}"
    echo "  1. Rebuild extension: pnpm build"
    echo "  2. Reload extension in Chrome"
    echo ""
    echo -e "${CYAN}Testing Railway services:${NC}"
    
    # Test Railway services
    echo -n "  Runtime Server... "
    if curl -s "https://copilot-runtime-server-production.up.railway.app/health" | grep -q "ok"; then
        echo -e "${GREEN}✅ OK${NC}"
    else
        echo -e "${RED}❌ Not responding${NC}"
    fi
    
    echo -n "  Pydantic Backend... "
    if curl -s "https://copilotkit-pydantic-production.up.railway.app/healthz" | grep -q "ok"; then
        echo -e "${GREEN}✅ OK${NC}"
    else
        echo -e "${RED}❌ Not responding${NC}"
    fi
    echo ""
}

# Main script
if [ "$1" == "" ]; then
    show_usage
    exit 0
fi

case "$1" in
    local)
        switch_to_local
        ;;
    railway)
        switch_to_railway
        ;;
    show)
        show_current
        ;;
    --help|-h)
        show_usage
        ;;
    *)
        echo -e "${RED}❌ Invalid option: $1${NC}"
        echo ""
        show_usage
        exit 1
        ;;
esac
