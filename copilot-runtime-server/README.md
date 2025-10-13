# CopilotKit Runtime Server

This is a standalone Node.js/Express server that acts as a CopilotRuntime bridge between the Chrome extension and your Google ADK agent.

## Architecture

```
Chrome Extension (port varies) 
    ↓ HTTP requests
CopilotKit Runtime Server (port 3001)
    ↓ RemoteEndpoint
Google ADK Agent (port 8000)
```

## Setup

1. **Install dependencies:**
   ```bash
   cd copilot-runtime-server
   npm install
   ```

2. **Start your Google ADK agent:**
   - Ensure your Google ADK agent is running on port 8000
   - The agent should be exposed as an ASGI application
   - The agent should be accessible at `http://localhost:8000`

3. **Start the runtime server:**
   ```bash
   npm run dev
   ```

   The server will start on `http://localhost:3001` with the following endpoints:
   - Health check: `http://localhost:3001/health`
   - CopilotKit endpoint: `http://localhost:3001/api/copilotkit`

## Configuration

The server is configured to:
- Accept CORS requests from Chrome extensions
- Forward requests to your Google ADK agent on port 8000 using RemoteEndpoint
- Provide a GraphQL endpoint for CopilotKit communication

## Usage

1. Start this runtime server
2. Start your Google ADK agent on port 8000
3. Build and load the Chrome extension
4. The extension will communicate with this runtime server, which forwards requests to your ADK agent

## Troubleshooting

- **Port conflicts**: Make sure ports 3001 (runtime server) and 8000 (ADK agent) are available
- **CORS issues**: The server is configured to accept requests from Chrome extensions
- **Connection errors**: Verify both the runtime server and ADK agent are running
- **Health check**: Visit `http://localhost:3001/health` to verify the server is running
