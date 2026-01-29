#!/bin/bash
# =============================================================================
# Test MCP Server via Loclx/Ngrok Tunnel
# =============================================================================

TUNNEL_URL="${1:-https://hrdzpcon54.loclx.io}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          Testing MCP Server via Tunnel                        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Tunnel URL: $TUNNEL_URL${NC}"
echo ""

# Test 1: Quick SSE Connection Test
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}1️⃣  Testing SSE Connection (will timeout after 2s)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if timeout 2 curl -s -w "\nHTTP Status: %{http_code}\n" -v $TUNNEL_URL/sse 2>&1 | grep -q "200"; then
    echo -e "${GREEN}✅ SSE endpoint responding with 200 OK${NC}"
else
    echo -e "${YELLOW}⚠️  Connection timed out (normal for SSE - it waits for events)${NC}"
fi

echo ""

# Test 2: Check Container Logs
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}2️⃣  Recent Container Logs (last 10 lines)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

docker logs confluence-mcp --tail 10 2>/dev/null || echo -e "${RED}❌ Container not running${NC}"

echo ""

# Test 3: Container Status
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}3️⃣  Container Status${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if docker ps --filter "name=confluence-mcp" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -q "confluence"; then
    docker ps --filter "name=confluence-mcp" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo -e "${GREEN}✅ Container is running${NC}"
else
    echo -e "${RED}❌ Container not found or not running${NC}"
fi

echo ""

# Test 4: Local Port Test
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}4️⃣  Local Port Accessibility${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if timeout 2 curl -s http://localhost:8103/sse >/dev/null 2>&1; then
    echo -e "${GREEN}✅ localhost:8103 is accessible${NC}"
else
    echo -e "${RED}❌ Cannot reach localhost:8103${NC}"
fi

echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                         SUMMARY                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📝 Understanding SSE Behavior:${NC}"
echo ""
echo "  • SSE connections are LONG-LIVED streams"
echo "  • They stay open waiting for events"
echo "  • Curl will appear to 'hang' (this is normal!)"
echo "  • Check container logs to verify requests are reaching the server"
echo ""
echo -e "${YELLOW}🎯 Next Steps:${NC}"
echo ""
echo "  1. Configure in Admin Tools:"
echo "     URL: $TUNNEL_URL/sse"
echo "     Transport: sse"
echo "     Name: confluence"
echo ""
echo "  2. Watch logs while testing:"
echo "     docker logs confluence-mcp --follow"
echo ""
echo "  3. Test from pydantic backend by calling Confluence tools"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}For detailed documentation, see: TEST_MCP_SSE.md${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
