#!/bin/bash
# =============================================================================
# Update Configuration for Complete Railway Deployment
# Both Runtime Server and Pydantic Backend on Railway
# =============================================================================

set -e

RUNTIME_URL="https://copilot-runtime-server-production.up.railway.app"
PYDANTIC_URL="https://copilotkit-pydantic-production.up.railway.app"
PROJECT_ROOT="/Users/hnankam/Downloads/data/project-hands-off"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🚀 Complete Railway Deployment Configuration Update         ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Services:${NC}"
echo "  Runtime Server:     $RUNTIME_URL"
echo "  Pydantic Backend:   $PYDANTIC_URL"
echo ""

# Test connectivity
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}🧪 Testing Railway Services${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo ""

echo -e "${YELLOW}Testing Runtime Server...${NC}"
if curl -s "$RUNTIME_URL/health" | grep -q "ok"; then
    echo -e "${GREEN}✅ Runtime Server is responding${NC}"
else
    echo -e "${RED}❌ Runtime Server not responding${NC}"
    exit 1
fi

echo -e "${YELLOW}Testing Pydantic Backend...${NC}"
if curl -s "$PYDANTIC_URL/healthz" | grep -q "ok"; then
    echo -e "${GREEN}✅ Pydantic Backend is responding${NC}"
else
    echo -e "${RED}❌ Pydantic Backend not responding${NC}"
    exit 1
fi

echo ""

# Backup function
backup_file() {
    local file=$1
    if [ -f "$file" ]; then
        cp "$file" "$file.backup-$(date +%Y%m%d-%H%M%S)"
        echo -e "${GREEN}✅ Backed up: $file${NC}"
    fi
}

# Update Frontend .env
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}1️⃣  Updating Frontend Configuration${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

FRONTEND_ENV="$PROJECT_ROOT/.env"

if [ -f "$FRONTEND_ENV" ]; then
    backup_file "$FRONTEND_ENV"
    
    # Update VITE_API_URL (Runtime Server)
    if grep -q "VITE_API_URL=" "$FRONTEND_ENV"; then
        sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$RUNTIME_URL|g" "$FRONTEND_ENV"
        echo -e "${GREEN}✅ Updated VITE_API_URL (Runtime Server)${NC}"
    else
        echo "VITE_API_URL=$RUNTIME_URL" >> "$FRONTEND_ENV"
        echo -e "${GREEN}✅ Added VITE_API_URL (Runtime Server)${NC}"
    fi
    
    # Update VITE_BACKEND_URL (Pydantic Backend)
    if grep -q "VITE_BACKEND_URL=" "$FRONTEND_ENV"; then
        sed -i '' "s|VITE_BACKEND_URL=.*|VITE_BACKEND_URL=$PYDANTIC_URL|g" "$FRONTEND_ENV"
        echo -e "${GREEN}✅ Updated VITE_BACKEND_URL (Pydantic Backend)${NC}"
    else
        echo "VITE_BACKEND_URL=$PYDANTIC_URL" >> "$FRONTEND_ENV"
        echo -e "${GREEN}✅ Added VITE_BACKEND_URL (Pydantic Backend)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Frontend .env not found at: $FRONTEND_ENV${NC}"
    echo -e "${YELLOW}   Creating new file...${NC}"
    cat > "$FRONTEND_ENV" << EOF
# Railway Deployment Configuration
VITE_API_URL=$RUNTIME_URL
VITE_BACKEND_URL=$PYDANTIC_URL
EOF
    echo -e "${GREEN}✅ Created frontend .env${NC}"
fi

echo ""

# Show configuration
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}2️⃣  Updated Configuration${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

echo ""
echo -e "${YELLOW}Frontend Configuration (.env):${NC}"
if [ -f "$FRONTEND_ENV" ]; then
    echo "─────────────────────────────────────────────"
    grep -E "VITE_API_URL|VITE_BACKEND_URL" "$FRONTEND_ENV" || echo "Variables not found"
    echo "─────────────────────────────────────────────"
else
    echo "File not found"
fi

echo ""

# Verify connection
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}3️⃣  Verifying Service Connection${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

echo ""
echo -e "${YELLOW}Runtime Server Health:${NC}"
curl -s "$RUNTIME_URL/health" | python3 -m json.tool 2>/dev/null || curl -s "$RUNTIME_URL/health"

echo ""
echo -e "${YELLOW}Pydantic Backend Health:${NC}"
curl -s "$PYDANTIC_URL/healthz" | python3 -m json.tool

echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    ✅ Configuration Update Complete!                          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📝 Summary:${NC}"
echo "   ✅ Frontend configured to use both Railway services"
echo "   ✅ Runtime Server: $RUNTIME_URL"
echo "   ✅ Pydantic Backend: $PYDANTIC_URL"
echo "   ✅ Backup files created (.backup-timestamp)"
echo ""
echo -e "${YELLOW}🔧 Next Steps:${NC}"
echo "   1. Rebuild your Chrome extension with updated .env"
echo "   2. Reload extension in browser (chrome://extensions/)"
echo "   3. Test agent interactions"
echo "   4. Monitor Railway dashboards for both services"
echo ""
echo -e "${YELLOW}⚠️  Important:${NC}"
echo "   - Runtime Server should have PYDANTIC_SERVICE_URL set in Railway"
echo "   - Check: $PYDANTIC_URL"
echo ""
echo -e "${YELLOW}📚 Documentation:${NC}"
echo "   - COMPLETE_RAILWAY_DEPLOYMENT.md - Full deployment guide"
echo "   - RAILWAY_INTEGRATION.md - Pydantic backend details"
echo ""
echo -e "${BLUE}🌐 Your Services:${NC}"
echo "   Runtime:  $RUNTIME_URL"
echo "   Backend:  $PYDANTIC_URL"
echo ""
echo -e "${GREEN}🎉 Both services are live on Railway!${NC}"
