#!/usr/bin/env bash
# Expose GitHub MCP Server via Ngrok

echo "🚀 Exposing GitHub MCP Server..."
echo ""

# Stop any existing ngrok
pkill ngrok 2>/dev/null || true
sleep 2

# Start ngrok for GitHub MCP (port 8101)
ngrok http 8101 --log=stdout > ngrok.log 2>&1 &
NGROK_PID=$!

echo "✅ Ngrok started (PID: $NGROK_PID)"
echo "⏳ Waiting for ngrok to initialize..."
sleep 5

# Get URL
URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"' | head -1 | sed 's/"public_url":"//;s/"$//')

if [ -n "$URL" ]; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║              GitHub MCP Server Exposed!                        ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Public URL: $URL"
    echo "SSE URL:    $URL/sse"
    echo "Health:     $URL/healthz"
    echo ""
    echo "🌐 Dashboard: http://localhost:4040"
    echo "🛑 Stop:      ./stop-ngrok.sh"
    echo ""
else
    echo "❌ Failed to get ngrok URL"
    exit 1
fi
