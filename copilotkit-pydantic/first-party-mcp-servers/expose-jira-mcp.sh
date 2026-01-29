#!/usr/bin/env bash
echo "🚀 Exposing Jira MCP Server..."
pkill ngrok 2>/dev/null || true
sleep 2
ngrok http 8102 --log=stdout > ngrok.log 2>&1 &
echo "⏳ Waiting..."
sleep 5
URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"' | head -1 | sed 's/"public_url":"//;s/"$//')
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     Jira MCP Server Exposed!              ║"
echo "╚═══════════════════════════════════════════╝"
echo "URL: $URL"
echo "SSE: $URL/sse"
echo "Dashboard: http://localhost:4040"
echo ""
