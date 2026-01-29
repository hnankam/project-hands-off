#!/bin/bash
# =============================================================================
# Update Configuration to Use Railway Deployment
# =============================================================================

set -e

RAILWAY_URL="https://copilotkit-pydantic-production.up.railway.app"
PROJECT_ROOT="/Users/hnankam/Downloads/data/project-hands-off"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    🚀 Update Configuration to Railway Deployment              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Railway URL: $RAILWAY_URL${NC}"
echo ""

# Backup function
backup_file() {
    local file=$1
    if [ -f "$file" ]; then
        cp "$file" "$file.backup-$(date +%Y%m%d-%H%M%S)"
        echo -e "${GREEN}✅ Backed up: $file${NC}"
    fi
}

# Update Runtime Server .env
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}1️⃣  Updating Runtime Server Configuration${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

RUNTIME_ENV="$PROJECT_ROOT/copilot-runtime-server/.env"

if [ -f "$RUNTIME_ENV" ]; then
    backup_file "$RUNTIME_ENV"
    
    # Update PYDANTIC_SERVICE_URL
    if grep -q "PYDANTIC_SERVICE_URL=" "$RUNTIME_ENV"; then
        sed -i '' "s|PYDANTIC_SERVICE_URL=.*|PYDANTIC_SERVICE_URL=$RAILWAY_URL|g" "$RUNTIME_ENV"
        echo -e "${GREEN}✅ Updated PYDANTIC_SERVICE_URL in runtime server${NC}"
    else
        echo "PYDANTIC_SERVICE_URL=$RAILWAY_URL" >> "$RUNTIME_ENV"
        echo -e "${GREEN}✅ Added PYDANTIC_SERVICE_URL to runtime server${NC}"
    fi
else
    echo -e "${RED}❌ Runtime server .env not found: $RUNTIME_ENV${NC}"
    echo -e "${YELLOW}   Creating new file...${NC}"
    echo "PYDANTIC_SERVICE_URL=$RAILWAY_URL" > "$RUNTIME_ENV"
    echo -e "${GREEN}✅ Created runtime server .env${NC}"
fi

echo ""

# Update Frontend .env
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}2️⃣  Updating Frontend Configuration${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

FRONTEND_ENV="$PROJECT_ROOT/.env"

if [ -f "$FRONTEND_ENV" ]; then
    backup_file "$FRONTEND_ENV"
    
    # Update VITE_BACKEND_URL
    if grep -q "VITE_BACKEND_URL=" "$FRONTEND_ENV"; then
        sed -i '' "s|VITE_BACKEND_URL=.*|VITE_BACKEND_URL=$RAILWAY_URL|g" "$FRONTEND_ENV"
        echo -e "${GREEN}✅ Updated VITE_BACKEND_URL in frontend${NC}"
    else
        echo "VITE_BACKEND_URL=$RAILWAY_URL" >> "$FRONTEND_ENV"
        echo -e "${GREEN}✅ Added VITE_BACKEND_URL to frontend${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Frontend .env not found: $FRONTEND_ENV${NC}"
    echo -e "${YELLOW}   You may need to create it manually${NC}"
fi

echo ""

# Show updated configurations
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}3️⃣  Updated Configurations${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

echo ""
echo -e "${YELLOW}Runtime Server (.env):${NC}"
if [ -f "$RUNTIME_ENV" ]; then
    grep "PYDANTIC_SERVICE_URL" "$RUNTIME_ENV" || echo "Not found"
else
    echo "File not found"
fi

echo ""
echo -e "${YELLOW}Frontend (.env):${NC}"
if [ -f "$FRONTEND_ENV" ]; then
    grep "VITE_BACKEND_URL" "$FRONTEND_ENV" || echo "Not found"
else
    echo "File not found"
fi

echo ""

# Restart services
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}4️⃣  Restart Services${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

read -p "Do you want to restart the runtime server container? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if docker ps --format '{{.Names}}' | grep -q "copilot-runtime-server"; then
        echo -e "${YELLOW}🔄 Restarting runtime server...${NC}"
        docker restart copilot-runtime-server
        echo -e "${GREEN}✅ Runtime server restarted${NC}"
    else
        echo -e "${YELLOW}⚠️  Runtime server container not found${NC}"
        echo -e "${YELLOW}   Start it manually: docker run ...${NC}"
    fi
else
    echo -e "${YELLOW}ℹ️  Skipped restart. Remember to restart manually!${NC}"
fi

echo ""

# Test connection
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}5️⃣  Testing Railway Connection${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

echo ""
echo -e "${YELLOW}Testing connection to Railway...${NC}"
if curl -s "$RAILWAY_URL/healthz" | grep -q "ok"; then
    echo -e "${GREEN}✅ Railway backend is responding!${NC}"
else
    echo -e "${RED}❌ Cannot connect to Railway backend${NC}"
fi

echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    ✅ Configuration Update Complete!                          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📝 Summary:${NC}"
echo "   ✅ Runtime server configured to use Railway"
echo "   ✅ Frontend configured to use Railway"
echo "   ✅ Backup files created (.backup-timestamp)"
echo ""
echo -e "${YELLOW}🔧 Next Steps:${NC}"
echo "   1. Test your application"
echo "   2. Check Railway logs for requests"
echo "   3. Monitor for any issues"
echo ""
echo -e "${YELLOW}📚 Documentation:${NC}"
echo "   - RAILWAY_INTEGRATION.md - Full integration guide"
echo "   - Railway Dashboard: https://railway.app"
echo ""
echo -e "${BLUE}🌐 Your backend URL:${NC}"
echo "   $RAILWAY_URL"
echo ""
