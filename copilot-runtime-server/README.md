# CopilotKit Runtime Server

A standalone Node.js/Express + Hono hybrid server that provides CopilotKit runtime capabilities for the Chrome extension.

## Architecture

```
Chrome Extension (side-panel)
    ↓ HTTP requests (x-copilot-* headers)
Express Server (port 3001)
    ├── /api/auth/* → Better Auth (authentication)
    ├── /api/admin/* → Admin APIs (config management)
    └── /api/copilotkit/* → Hono (AG-UI protocol)
                               ↓ HttpAgent
                          Python Backend (port 8001)
                               ↓
                          LLM Providers (Claude, GPT, Gemini)
```

## Setup

1. **Install dependencies:**
   ```bash
   cd copilot-runtime-server
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the Python backend:**
   - The Python backend (port 8001) handles LLM provider selection
   - Located at `../copilotkit-pydantic/`

4. **Start the runtime server:**
   ```bash
   npm run dev    # Development with hot reload
   npm start      # Production
   ```

## Endpoints

### CopilotKit (AG-UI Protocol)
- `POST /api/copilotkit/*` - Main AI chat endpoint

### Authentication (Better Auth)
- `POST /api/auth/sign-in/email` - Email sign in
- `POST /api/auth/sign-up/email` - Email sign up
- `GET /api/auth/session` - Get current session
- `POST /api/auth/organization/*` - Organization management

### Admin APIs
- `/api/admin/providers` - LLM provider config
- `/api/admin/models` - Model configuration
- `/api/admin/agents` - Agent configuration
- `/api/admin/tools` - Tool configuration
- `/api/admin/base-instructions` - System prompts
- `/api/admin/usage` - Usage tracking

### Configuration
- `GET /api/config` - Complete client configuration
- `GET /api/config/agents` - Available agents
- `GET /api/config/models` - Available models
- `GET /api/config/teams` - User's teams

### Health Check
- `GET /health` - Service health status

## Request Headers

The server reads these headers for dynamic routing:

| Header | Description |
|--------|-------------|
| `x-copilot-agent-type` | Agent to use (e.g., `general`, `wiki`) |
| `x-copilot-model-type` | Model to use (e.g., `claude-4.5-haiku`) |
| `x-copilot-thread-id` | Conversation thread ID |
| `x-copilot-organization-id` | Organization context |
| `x-copilot-team-id` | Team context |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | development | Environment |
| `AGENT_BASE_URL` | http://localhost:8001 | Python backend URL |
| `DEBUG` | false (prod) | Enable debug logging |
| `CORS_ORIGINS` | - | Allowed CORS origins |
| `BODY_LIMIT_MB` | 30 | Max request body size |
| `REQUEST_TIMEOUT_MS` | 30000 | Request timeout |
| `TRUST_PROXY` | false | Trust proxy headers |

## Project Structure

```
copilot-runtime-server/
├── server.js           # Main server entry point
├── agents/
│   └── dynamic.js      # HttpAgent creation utilities
├── auth/
│   ├── index.js        # Better Auth configuration
│   └── email.js        # Email sending (SES)
├── config/
│   ├── database.js     # PostgreSQL connection
│   ├── environment.js  # Environment variables
│   ├── loader.js       # Configuration loading
│   └── models.js       # Model helpers
├── middleware/
│   ├── auth.js         # Auth middleware
│   ├── cors.js         # CORS configuration
│   ├── errorHandler.js # Error handling
│   └── requestId.js    # Request ID generation
└── routes/
    ├── agents.js       # Agent admin routes
    ├── auth.js         # Auth routes
    ├── config.js       # Config routes
    ├── health.js       # Health check
    ├── models.js       # Model admin routes
    ├── providers.js    # Provider admin routes
    └── tools.js        # Tool admin routes
```

## Troubleshooting

- **Port conflicts**: Ensure ports 3001 (runtime) and 8001 (Python) are available
- **CORS issues**: Check `CORS_ORIGINS` environment variable
- **Auth errors**: Verify Better Auth configuration
- **Agent timeout**: Check `REQUEST_TIMEOUT_MS` and Python backend health
- **Health check**: Visit `http://localhost:3001/health`
