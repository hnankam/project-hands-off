# CopilotKit Runtime Server

A production-ready, multi-tenant **Express.js + Hono** hybrid server providing CopilotKit runtime capabilities with the AG-UI (Agent UI) protocol. This server acts as the gateway between frontend applications (Chrome Extension, web apps) and a Python AI backend, handling authentication, session management, message persistence, and real-time streaming.

## 📋 Table of Contents

- [Features](#-features)
- [Architecture Overview](#-architecture-overview)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
- [Authentication System](#-authentication-system)
- [Agent Runner System](#-agent-runner-system)
- [Workspace Management](#-workspace-management)
- [OAuth Integrations](#-oauth-integrations)
- [Database Schema](#-database-schema)
- [Security](#-security)
- [Monitoring & Debugging](#-monitoring--debugging)
- [Deployment](#-deployment)

---

## 🚀 Features

### Core Capabilities
- **AG-UI Protocol Support**: Full implementation of the Agent UI protocol for real-time AI agent communication
- **Multi-Tenant Architecture**: Organization and team-scoped configuration with role-based access control
- **PostgreSQL Agent Runner**: Persistent storage for conversation history, crash recovery, and horizontal scalability
- **SQLite Fallback**: Lightweight persistence option for development or single-instance deployments
- **Real-Time Streaming**: Event-driven message streaming via RxJS observables

### Authentication & Authorization
- **Better Auth Integration**: Complete authentication system with email/password, social login (Google, GitHub, Microsoft), and SSO (OIDC/SAML)
- **Organization Management**: Multi-organization support with invitations and team management
- **Role-Based Access Control**: Owner, Admin, Member roles with fine-grained permissions
- **Session Management**: Auto-selection of active organization and team contexts

### Workspace Features
- **Personal File Storage**: Firebase Storage integration for user files (images, PDFs, documents)
- **Notes Management**: Create, organize, and tag personal notes
- **Encrypted Credentials**: AES-256-GCM encrypted storage for API keys and secrets
- **OAuth Connections**: Gmail, Outlook, Slack, Google Drive, OneDrive, Dropbox integrations

### Admin APIs
- **Provider Configuration**: Manage LLM providers (Anthropic, OpenAI, Google, Azure)
- **Model Management**: Configure available models per organization/team
- **Agent Configuration**: Define and customize AI agents
- **Tool Management**: Enable/disable agent tools
- **Usage Tracking**: Monitor token usage and API calls

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT APPLICATIONS                                │
│    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐    │
│    │ Chrome Extension │    │    Web App       │    │  Mobile App      │    │
│    │   (Side Panel)   │    │   (React)        │    │  (Future)        │    │
│    └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘    │
│             │                       │                       │              │
│             └───────────────────────┼───────────────────────┘              │
│                                     │                                       │
│                           x-copilot-* headers                               │
│                           (agent, model, thread)                            │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      COPILOTKIT RUNTIME SERVER                              │
│                         (Express + Hono)                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      EXPRESS APPLICATION                             │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │   │
│  │  │   /api/auth  │  │ /api/admin   │  │   /api/workspace         │  │   │
│  │  │  Better Auth │  │   Config     │  │   Files/Notes/OAuth      │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       HONO APPLICATION                               │   │
│  │                    /api/copilotkit/*                                 │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │               CopilotKit Runtime                             │   │   │
│  │  │   ┌─────────────────────────────────────────────────────┐   │   │   │
│  │  │   │          PostgresAgentRunner                         │   │   │   │
│  │  │   │   - Thread/Run Persistence                          │   │   │   │
│  │  │   │   - Message Deletion/Filtering                      │   │   │   │
│  │  │   │   - Crash Recovery                                  │   │   │   │
│  │  │   │   - Event Compaction                                │   │   │   │
│  │  │   └─────────────────────────────────────────────────────┘   │   │   │
│  │  │                           │                                  │   │   │
│  │  │   ┌─────────────────────────────────────────────────────┐   │   │   │
│  │  │   │              HttpAgent (AG-UI)                       │   │   │   │
│  │  │   │   - Per-Request Agent IDs                           │   │   │   │
│  │  │   │   - Auth Context Headers                            │   │   │   │
│  │  │   │   - Agent Caching (LRU)                             │   │   │   │
│  │  │   └─────────────────────────────────────────────────────┘   │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       SERVICES LAYER                                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐    │   │
│  │  │  PostgreSQL  │  │   Firebase   │  │      Encryption        │    │   │
│  │  │ (Config/Auth)│  │  (Storage)   │  │    (AES-256-GCM)       │    │   │
│  │  └──────────────┘  └──────────────┘  └────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       │ HTTP (AG-UI Protocol)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PYTHON AI BACKEND                                     │
│                      (copilotkit-pydantic)                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Pydantic AI Agents                               │   │
│  │                                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │  │ General  │  │  Wiki    │  │  Code    │  │  Custom Agents   │   │   │
│  │  │  Agent   │  │  Agent   │  │  Agent   │  │                  │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                       │                                     │
└───────────────────────────────────────┼─────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
           ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
           │   Anthropic  │    │   OpenAI     │    │   Google     │
           │   (Claude)   │    │   (GPT)      │    │   (Gemini)   │
           │   + Bedrock  │    │   + Azure    │    │              │
           └──────────────┘    └──────────────┘    └──────────────┘
```

---

## 📁 Project Structure

```
copilot-runtime-server/
├── server.js                    # Main server entry point (Express + Hono hybrid)
├── package.json                 # Dependencies and scripts
│
├── agents/                      # Agent utilities
│   ├── index.js                 # Agent exports
│   └── dynamic.js               # Dynamic HttpAgent creation
│
├── auth/                        # Authentication configuration
│   ├── index.js                 # Better Auth setup (plugins, hooks)
│   └── email.js                 # Email sending (Resend integration)
│
├── config/                      # Configuration management
│   ├── index.js                 # Config exports
│   ├── environment.js           # Environment variables parsing
│   ├── database.js              # PostgreSQL connection pool (Neon-optimized)
│   ├── loader.js                # Multi-tenant config loader with caching
│   ├── db-loaders.js            # Database query helpers
│   └── models.js                # Model/provider helpers
│
├── lib/                         # Shared libraries
│   └── team-helpers.js          # Team management utilities
│
├── middleware/                  # Express middleware
│   ├── index.js                 # Middleware exports
│   ├── auth.js                  # Authentication middleware (requireAuth, requireRole)
│   ├── cors.js                  # CORS configuration
│   ├── requestId.js             # Request ID generation
│   ├── errorHandler.js          # Global error handling
│   ├── notFound.js              # 404 handler
│   └── team-members-bypass.js   # Team member access bypass
│
├── routes/                      # API route handlers
│   ├── index.js                 # Route exports
│   ├── health.js                # Health check endpoint
│   ├── auth.js                  # Better Auth routes
│   ├── config.js                # Configuration API (agents, models, teams)
│   ├── invitations.js           # Organization invitations
│   ├── workspace.js             # Personal workspace (files, notes, connections)
│   ├── oauth.js                 # OAuth flows (Gmail, Slack, etc.)
│   ├── providers.js             # Admin: LLM providers
│   ├── models.js                # Admin: Model configuration
│   ├── agents.js                # Admin: Agent configuration
│   ├── tools.js                 # Admin: Tool configuration
│   └── usage.js                 # Admin: Usage tracking
│
├── runners/                     # Agent runner implementations
│   ├── postgres-agent-runner.js # PostgreSQL-backed persistent runner
│   ├── postgres-agent-runner.backup.js
│   ├── README.md                # Runner documentation
│   └── __tests__/               # Runner tests
│       └── postgres-agent-runner.test.js
│
├── utils/                       # Utility functions
│   ├── index.js                 # Utility exports
│   ├── logger.js                # Logging utilities
│   ├── encryption.js            # AES-256-GCM encryption
│   ├── route-helpers.js         # Route utility functions
│   ├── gmail-client.js          # Gmail API client
│   ├── slack-client.js          # Slack API client
│   ├── oauth-refresh.js         # OAuth token refresh utilities
│   └── fix-corrupted-connections.js
│
├── migrations/                  # Database migrations
│   ├── 001_create_agent_runner_tables.sql
│   ├── 001_rollback_agent_runner_tables.sql
│   ├── 002_add_message_deletion.sql
│   └── add_parent_run_id.sql
│
├── scripts/                     # Utility scripts
│
└── public/                      # Static files
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: >= 20.9.0
- **PostgreSQL**: 14+ (or Neon serverless)
- **Python Backend**: The `copilotkit-pydantic` server running on port 8001
- **Firebase Storage**: (Optional) For workspace file storage

### Installation

```bash
# Navigate to the runtime server directory
cd copilot-runtime-server

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit configuration
vim .env
```

### Environment Variables

#### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `NODE_ENV` | `development` | Environment (development/production) |
| `DEBUG` | `true` (dev) | Enable verbose logging |
| `PYDANTIC_SERVICE_URL` | `http://localhost:8001` | Python backend URL |

#### Database

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | ✅ | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_DATABASE` | ✅ | Database name |
| `DB_USERNAME` | ✅ | Database username |
| `DB_PASSWORD` | ✅ | Database password |
| `DB_OTHER_PARAMS` | `sslmode=require` | Additional connection params |

#### Authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `BETTER_AUTH_URL` | ✅ | Base URL for auth callbacks |
| `BETTER_AUTH_SECRET` | ✅ | Secret for session encryption |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth secret |
| `MICROSOFT_CLIENT_ID` | Optional | Microsoft OAuth client ID |
| `MICROSOFT_CLIENT_SECRET` | Optional | Microsoft OAuth secret |
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth secret |

#### Storage & Encryption

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_STORAGE_BUCKET` | Optional | Firebase bucket name |
| `FIREBASE_API_KEY` | Optional | Firebase API key |
| `ENCRYPTION_MASTER_SECRET` | ✅ | Master key for credential encryption |

#### Agent Runner

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_SQLITE_RUNNER` | `false` | Use SQLite instead of PostgreSQL |
| `SQLITE_DB_PATH` | `./copilotkit.db` | SQLite database path |
| `AGENT_RUNNER_MAX_HISTORIC_RUNS` | `1000` | Max runs to load per thread |
| `AGENT_RUNNER_TRANSFORM_ERRORS` | `false` | Show failed runs in history |

#### Server Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `BODY_LIMIT_MB` | `30` | Max request body size |
| `REQUEST_TIMEOUT_MS` | `300000` | Request timeout (5 min) |
| `HEADERS_TIMEOUT_MS` | `310000` | Headers timeout |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `RATE_LIMIT_MAX` | `120` | Max requests per window |
| `TRUST_PROXY` | `false` | Trust proxy headers |
| `CORS_ORIGINS` | - | Allowed CORS origins (comma-separated) |

### Starting the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm run start:prod

# Or directly
node server.js
```

### Startup Output

```
═══════════════════════════════════════════════════════════════════
CopilotKit Runtime Server - Ready
═══════════════════════════════════════════════════════════════════

Server:        http://0.0.0.0:3001
Health Check:  http://0.0.0.0:3001/health

CopilotKit (AG-UI Protocol):
   - POST   3001/api/copilotkit/*

Authentication & Organizations:
   - POST   3001/api/auth/sign-in/email
   - POST   3001/api/auth/sign-up/email
   - GET    3001/api/auth/session
   - POST   3001/api/invitations/create

Admin APIs (require auth + admin/owner role):
   - /api/admin/providers
   - /api/admin/models
   - /api/admin/agents
   - /api/admin/tools
   - /api/admin/usage

Python Backend: http://localhost:8001
═══════════════════════════════════════════════════════════════════
```

---

## ⚙️ Configuration

### Multi-Tenant Configuration Loading

Configuration is loaded from the database with multi-tenant support:

```
Global Defaults → Organization Overrides → Team Overrides
```

```javascript
// Configuration is automatically scoped to user's context
const config = await loadModelsConfig({
  organizationId: 'org-123',
  teamId: 'team-456'
});

// Result includes models enabled for that team
```

### Configuration Caching

Two-layer caching system:
1. **DB Loaders Cache**: Query results with validity flag
2. **Loader Cache**: Map-based cache keyed by `orgId:teamId`

```javascript
// Clear all caches
invalidateCache();

// Get cache statistics
const stats = getCacheStats();
// { providers: 3, models: 5, agents: 2, total: 10 }
```

---

## 📡 API Reference

### CopilotKit Endpoint (AG-UI Protocol)

**`POST /api/copilotkit/*`**

Main AI chat endpoint implementing the AG-UI protocol. Handles streaming responses with event-driven message delivery.

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `x-copilot-agent-type` | No | Agent type (default from config) |
| `x-copilot-model-type` | No | Model type (default from config) |
| `x-copilot-thread-id` | No | Thread ID for conversation context |
| `Cookie` | Yes | Session cookie for authentication |

#### Request Flow

1. **Authentication**: Resolve session from cookies
2. **Context Resolution**: Get organization/team from session
3. **Agent Selection**: Get/create cached HttpAgent
4. **Run Execution**: Forward to Python backend via AG-UI protocol
5. **Event Streaming**: Stream events back to client
6. **Persistence**: Save events to PostgreSQL

---

### Configuration API

**`GET /api/config`**

Returns complete configuration for the user's active organization/team.

```json
{
  "agents": [
    {
      "id": "general",
      "label": "General Agent",
      "description": "Multi-purpose AI assistant",
      "allowedModels": null,
      "allowedTools": null
    }
  ],
  "models": [
    {
      "id": "claude-4-sonnet",
      "label": "Claude 4 Sonnet",
      "provider": "Anthropic"
    }
  ],
  "defaults": {
    "agent": "general",
    "model": "claude-4-sonnet"
  }
}
```

**`GET /api/config/agents`** - List available agents
**`GET /api/config/models`** - List available models
**`GET /api/config/defaults`** - Get default agent/model
**`GET /api/config/teams`** - List user's teams with membership status

---

### Authentication API

**`POST /api/auth/sign-in/email`**

```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

**`POST /api/auth/sign-up/email`**

```json
{
  "email": "user@example.com",
  "password": "secure-password",
  "name": "User Name"
}
```

**`GET /api/auth/session`** - Get current session and user

**`POST /api/auth/organization/create`** - Create new organization

**`POST /api/auth/organization/:id/invite`** - Invite user to organization

---

### Admin APIs

All admin endpoints require authentication and `owner` or `admin` role.

#### Providers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/providers` | List all providers |
| `POST` | `/api/admin/providers` | Create provider |
| `PUT` | `/api/admin/providers/:id` | Update provider |
| `DELETE` | `/api/admin/providers/:id` | Delete provider |

#### Models

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/models` | List all models |
| `POST` | `/api/admin/models` | Create model |
| `PUT` | `/api/admin/models/:id` | Update model |
| `DELETE` | `/api/admin/models/:id` | Delete model |

#### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/agents` | List all agents |
| `POST` | `/api/admin/agents` | Create agent |
| `PUT` | `/api/admin/agents/:id` | Update agent |
| `DELETE` | `/api/admin/agents/:id` | Delete agent |

#### Tools

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/tools` | List all tools |
| `PUT` | `/api/admin/tools/:id` | Update tool (enable/disable) |

---

### Message Management API

**`DELETE /api/messages/:threadId/:messageId`**

Delete a single message from a thread.

**`DELETE /api/messages/:threadId`**

Delete all messages in a thread (reset thread).

**`POST /api/messages/:threadId/bulk-delete`**

```json
{
  "messageIds": ["msg-1", "msg-2", "msg-3"]
}
```

**`DELETE /api/threads/:threadId`**

Hard delete a thread and all associated data.

---

### Health Check

**`GET /health`**

```json
{
  "status": "ok",
  "timestamp": "2025-01-08T12:00:00.000Z",
  "uptime": 3600.5,
  "environment": "production"
}
```

---

## 🔐 Authentication System

### Better Auth Configuration

The server uses [Better Auth](https://better-auth.com) with the following plugins:

- **Organization Plugin**: Multi-tenant organization and team support
- **Admin Plugin**: User management capabilities
- **SSO Plugin**: Enterprise OIDC/SAML authentication

### Authentication Flow

```
1. User signs in → Better Auth validates credentials
2. Session created → Cookie set with session token
3. Request arrives → Auth middleware extracts session
4. Context resolved → Organization/team auto-selected
5. Request processed → With full auth context
```

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **owner** | Full access to all resources and settings |
| **admin** | Manage models, providers, agents, tools |
| **member** | Read config, create/read chats |

### Middleware Usage

```javascript
import { requireAuth, requireRole, requirePermission } from './middleware/auth.js';

// Require authentication
app.get('/protected', requireAuth, handler);

// Require specific role
app.get('/admin', requireAuth, requireOrganization, requireRole(['owner', 'admin']), handler);

// Require specific permission
app.post('/models', requireAuth, requireOrganization, requirePermission('model', 'create'), handler);
```

---

## 🏃 Agent Runner System

### PostgresAgentRunner

The core component for persistent agent execution with these capabilities:

#### Features

- **Thread Management**: Track conversation threads with state
- **Run Persistence**: Store all runs with events in JSONB
- **Message Storage**: Separate message table for efficient querying
- **Crash Recovery**: Automatically recover stalled runs on startup
- **Event Compaction**: Compress events for efficient storage
- **Deletion Support**: Soft-delete messages with cascading tool call filtering

#### Run Lifecycle

```
1. acquireRunLock()   → Atomically claim thread for execution
2. getHistoricRuns()  → Load previous runs for context
3. executeRun()       → Stream events from Python backend
4. finalizeRun()      → Persist compacted events
5. cleanup()          → Release lock, update timestamps
```

#### Message Deletion Logic

When messages are deleted:

1. **User Messages**: Delete all subsequent assistant responses and tool calls until next user message
2. **Assistant Messages**: Delete consecutive tool messages that follow
3. **Tool Messages**: Delete only the specific message

```javascript
// Deletion creates soft-delete records
await runner.deleteMessage(threadId, messageId);

// On next connect/run, deleted messages are filtered from history
const deletedMessageIds = await runner.getDeletedMessageIds(threadId);
```

#### Configuration Options

```javascript
const runner = new PostgresAgentRunner({
  pool: getPool(),
  ttl: 86400000,              // Thread TTL: 24 hours
  cleanupInterval: 3600000,   // Cleanup every hour
  persistEventsImmediately: true,
  maxHistoricRuns: 1000,      // Limit for safety
  debug: true,
  transformErrors: false,     // false = filter errors, true = transform to finished
});
```

---

## 📂 Workspace Management

### Files API

```javascript
// List files
GET /api/workspace/files?folder=Documents&tags=important&limit=50

// Upload file
POST /api/workspace/files/upload
Content-Type: multipart/form-data

// Register external file (from chat uploads)
POST /api/workspace/files/register
{
  "file_name": "document.pdf",
  "file_type": "application/pdf",
  "file_size": 1024,
  "storage_url": "https://..."
}

// Get file content
GET /api/workspace/files/:fileId/content

// Delete file
DELETE /api/workspace/files/:fileId

// Bulk delete
DELETE /api/workspace/files/bulk
{ "fileIds": ["id1", "id2"] }
```

### Notes API

```javascript
// List notes
GET /api/workspace/notes?folder=Work&tags=meeting

// Create note
POST /api/workspace/notes
{
  "title": "Meeting Notes",
  "content": "# Summary\n...",
  "folder": "Work",
  "tags": ["meeting", "2025"]
}

// Update note
PUT /api/workspace/notes/:noteId

// Delete note
DELETE /api/workspace/notes/:noteId
```

### Folders API

```javascript
// List folders
GET /api/workspace/folders

// Create folder
POST /api/workspace/folders
{ "folder_name": "Projects/2025" }

// Delete folder
DELETE /api/workspace/folders/:folderPath?deleteFiles=true
```

### Credentials API

```javascript
// List credentials (metadata only)
GET /api/workspace/credentials

// Create credential
POST /api/workspace/credentials
{
  "name": "OpenAI API Key",
  "type": "api_key",
  "key": "OPENAI_API_KEY",
  "password": "sk-..."  // Encrypted with AES-256-GCM
}

// Fetch metadata for agent context (secure - no secrets)
POST /api/workspace/credentials/metadata
{ "ids": ["id1", "id2"] }
```

---

## 🔗 OAuth Integrations

### Supported Services

| Service | Scopes |
|---------|--------|
| **Gmail** | gmail.readonly, userinfo.email |
| **Outlook** | Mail.Read, User.Read, offline_access |
| **Slack** | search:read, channels:history, files:read, ... |
| **Google Drive** | drive.readonly, drive.metadata.readonly |
| **OneDrive** | Files.Read.All, User.Read |
| **Dropbox** | files.metadata.read, files.content.read |

### OAuth Flow

```javascript
// 1. Initiate OAuth
GET /api/oauth/gmail/authorize
→ Redirects to Google consent screen

// 2. Handle callback
GET /api/oauth/gmail/callback?code=...&state=...
→ Exchanges code for tokens
→ Encrypts and stores tokens
→ Redirects to completion page

// 3. Test connection
POST /api/oauth/gmail/test
→ Validates stored tokens
```

### Gmail Integration

```javascript
// List emails
GET /api/workspace/connections/:connectionId/gmail/emails?maxResults=50&query=is:unread

// Get single email
GET /api/workspace/connections/:connectionId/gmail/email/:emailId

// Get thread (all messages in conversation)
GET /api/workspace/connections/:connectionId/gmail/thread/:threadId
```

### Slack Integration

```javascript
// List conversations
GET /api/workspace/connections/:connectionId/slack/conversations

// Get channel messages
GET /api/workspace/connections/:connectionId/slack/channel/:channelId/messages

// Get thread replies
GET /api/workspace/connections/:connectionId/slack/thread/:channelId/:threadTs

// Download file
POST /api/workspace/connections/:connectionId/slack/file/download
```

### Token Refresh

Tokens are automatically refreshed when:
- Proactive: Token expires within 5 minutes
- Reactive: API returns 401 error

```javascript
// Refresh logic in oauth-refresh.js
if (shouldRefreshToken(tokens.expires_at)) {
  const refreshedTokens = await refreshAndUpdateToken(connection, userId, tokens, 'gmail');
}
```

---

## 🗄️ Database Schema

### Agent Runner Tables

```sql
-- Thread-level state
CREATE TABLE agent_threads (
  thread_id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255),
  team_id VARCHAR(255),
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  is_running BOOLEAN DEFAULT FALSE,
  current_run_id VARCHAR(255),
  stop_requested BOOLEAN DEFAULT FALSE,
  agent_type VARCHAR(100),
  model_type VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Run history with events
CREATE TABLE agent_runs (
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(255) UNIQUE NOT NULL,
  thread_id VARCHAR(255) NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
  parent_run_id VARCHAR(255) REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'running',  -- running, completed, stopped, error
  events JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Message storage (separate for efficient queries)
CREATE TABLE agent_messages (
  id BIGSERIAL PRIMARY KEY,
  message_id VARCHAR(255) UNIQUE NOT NULL,
  thread_id VARCHAR(255) NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
  run_id VARCHAR(255) REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  role VARCHAR(50) NOT NULL,  -- user, assistant, system, tool
  content TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Soft-delete tracking
CREATE TABLE agent_deleted_messages (
  thread_id VARCHAR(255) NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (thread_id, message_id)
);
```

### Workspace Tables

```sql
-- User files
CREATE TABLE workspace_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  storage_url TEXT,
  extracted_text TEXT,
  page_count INTEGER,
  folder VARCHAR(255),
  tags TEXT[],
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User notes
CREATE TABLE workspace_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  folder VARCHAR(255),
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth connections
CREATE TABLE workspace_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  connection_name VARCHAR(255),
  connection_type VARCHAR(100),
  service_name VARCHAR(100),
  encrypted_credentials BYTEA,  -- AES-256-GCM encrypted
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, service_name)
);

-- API credentials
CREATE TABLE workspace_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  key VARCHAR(255),
  encrypted_data TEXT,  -- Hex-encoded AES-256-GCM
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Running Migrations

```bash
# Apply migrations
psql -U your_user -d your_database -f migrations/001_create_agent_runner_tables.sql

# Rollback
psql -U your_user -d your_database -f migrations/001_rollback_agent_runner_tables.sql
```

---

## 🔒 Security

### Encryption

**Credential Storage (AES-256-GCM)**

```javascript
// Key derivation with PBKDF2
const key = crypto.pbkdf2Sync(
  masterSecret,           // ENCRYPTION_MASTER_SECRET env var
  sha256(organizationId), // Per-tenant salt
  100000,                 // Iterations
  32,                     // Key length
  'sha256'
);

// Encryption
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([iv, authTag, ciphertext]);
```

### OAuth Token Security

- Tokens encrypted at rest with user-specific keys
- Refresh tokens stored separately from access tokens
- Automatic token refresh with 5-minute buffer
- Failed refresh marks connection for re-authentication

### CORS Configuration

```javascript
// Default CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.startsWith('chrome-extension://')) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'x-copilot-*'],
  exposedHeaders: ['set-cookie', 'x-request-id'],
  maxAge: 86400,
};
```

### Request Validation

- All admin endpoints require `owner` or `admin` role
- Organization membership verified for all org-scoped operations
- Request IDs generated for tracing
- Rate limiting prevents abuse

---

## 📊 Monitoring & Debugging

### Logging

```javascript
// Enable debug logging
DEBUG=true npm run dev

// Log format
[PostgresAgentRunner] Run started: thread-123/run-456
[Auth] Auto-selected organization: My Org
[Workspace] Uploaded file: document.pdf
```

### Agent Runner Metrics

```javascript
// Get runner metrics
const metrics = runner.getMetrics();
// {
//   runsStarted: 150,
//   runsCompleted: 145,
//   runsFailed: 3,
//   runsStopped: 2,
//   avgRunDuration: 2500,
//   activeThreads: 5
// }
```

### Agent Cache Statistics

```javascript
// Get cache stats
const stats = getAgentCacheStats();
// {
//   size: 25,
//   maxSize: 100,
//   keys: ["general:claude-4-sonnet:org-1:team-1", ...]
// }
```

### Health Check

```bash
curl http://localhost:3001/health
```

### Debug Credentials Endpoint

```bash
# For development debugging only
curl "http://localhost:3001/api/workspace/credentials/debug/all?userId=user-123"
```

---

## 🚢 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `ENCRYPTION_MASTER_SECRET` (32+ chars)
- [ ] Set `BETTER_AUTH_SECRET`
- [ ] Configure PostgreSQL connection
- [ ] Set `CORS_ORIGINS` to allowed domains
- [ ] Enable `TRUST_PROXY` if behind load balancer
- [ ] Configure rate limiting appropriately
- [ ] Set up Firebase Storage (optional)
- [ ] Configure OAuth providers (optional)

### Docker Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server.js"]
```

### Environment-Specific Settings

```bash
# Production
NODE_ENV=production
DEBUG=false
TRUST_PROXY=true
REQUEST_TIMEOUT_MS=300000
RATE_LIMIT_MAX=60

# Development
NODE_ENV=development
DEBUG=true
TRUST_PROXY=false
```

### Process Management

```bash
# Using PM2
pm2 start server.js --name copilot-runtime

# View logs
pm2 logs copilot-runtime

# Restart on changes
pm2 restart copilot-runtime --watch
```

### Graceful Shutdown

The server handles SIGINT and SIGTERM signals:

1. Stop accepting new connections
2. Shutdown PostgresAgentRunner (complete active subjects)
3. Close database pool
4. Exit process

```javascript
// Automatic on SIGINT/SIGTERM
// Or call manually:
await runner.shutdown();
```

---

## 📄 License

TBA

## 🤝 Contributing

TBA

