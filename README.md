# Project Hands-Off

> **AI-Powered Browser Assistant with Multi-Tenant Organization & Team Management**

A sophisticated browser extension that integrates AI capabilities directly into your browsing experience, featuring multi-tenant architecture, dynamic agent selection, and seamless workspace management.

![](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![](https://badges.aleen42.com/src/vitejs.svg)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Technology Stack](#-technology-stack)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [Development](#-development)
- [Authentication & Authorization](#-authentication--authorization)
- [Troubleshooting](#-troubleshooting)
- [Documentation](#-documentation)
- [License](#-license)

---

## 🎯 Overview

Project Hands-Off is an enterprise-grade browser extension that brings powerful AI capabilities to your fingertips. The system consists of three main components:

| Component | Description | Technology |
|-----------|-------------|------------|
| **Chrome Extension** | User interface with side panel, chat UI, and browser integration | React, TypeScript, Vite |
| **CopilotKit Runtime Server** | Gateway server handling auth, sessions, and message persistence | Node.js, Express, Hono |
| **Pydantic AI Server** | AI agent execution with multi-model support and tool integrations | Python, FastAPI, Pydantic AI |

### What Makes It Special

- **Multi-Tenant Architecture**: Organizations and teams with role-based access control
- **Dynamic Agent System**: Switch between specialized AI agents on-the-fly
- **Persistent Conversations**: PostgreSQL-backed message storage with crash recovery
- **Workspace Management**: Personal files, notes, and encrypted credentials
- **OAuth Integrations**: Gmail, Slack, Google Drive, OneDrive, and more
- **MCP Server Support**: Extensible tool system via Model Context Protocol

---

## ✨ Key Features

### 🤖 AI & Intelligence

| Feature | Description |
|---------|-------------|
| **Multiple AI Providers** | Claude (Anthropic), GPT-4 (OpenAI/Azure), Gemini (Google), with Bedrock support |
| **Dynamic Agent System** | General, Wiki, Code, and custom agents with specialized capabilities |
| **Tool Ecosystem** | 50+ backend tools including web search, code execution, file operations |
| **MCP Integrations** | Databricks, filesystem, and custom MCP server support |
| **Streaming Responses** | Real-time AG-UI protocol for smooth user experience |
| **Context-Aware Chat** | Maintains conversation history with intelligent message compaction |

### 👥 Multi-User & Organizations

| Feature | Description |
|---------|-------------|
| **Better Auth Integration** | Secure authentication with email/password, social login (Google, GitHub, Microsoft) |
| **SSO Support** | Enterprise OIDC/SAML authentication |
| **Organization Management** | Multi-tenant isolation with team support |
| **Role-Based Access** | Owner, Admin, Member roles with fine-grained permissions |
| **Invitation System** | Email-based invitations with secure token flow |
| **Session Management** | Auto-selection of active organization and team contexts |

### 💾 Data & Storage

| Feature | Description |
|---------|-------------|
| **PostgreSQL Backend** | User management, configuration, conversation history |
| **Agent Runner** | Persistent thread/run storage with crash recovery |
| **Workspace Files** | Firebase Storage integration for user files |
| **Encrypted Credentials** | AES-256-GCM encrypted API keys and secrets |
| **Real-Time Updates** | Ably Pub/Sub for live usage tracking |

### 🎨 User Experience

| Feature | Description |
|---------|-------------|
| **Side Panel Interface** | Modern, responsive chat UI |
| **Dark/Light Modes** | Full theme support |
| **Agent & Model Selectors** | Easy configuration of AI behavior |
| **Admin Dashboard** | Complete organization and team management |
| **Workspace Management** | Files, notes, folders, and connections |

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT APPLICATIONS                                 │
│                                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────────────┐│
│  │  Chrome Extension  │  │     Web App        │  │      Mobile (Future)       ││
│  │    (Side Panel)    │  │     (React)        │  │                            ││
│  │                    │  │                    │  │                            ││
│  │  • Chat UI         │  │  • Admin Dashboard │  │                            ││
│  │  • Workspace       │  │  • User Portal     │  │                            ││
│  │  • Browser Actions │  │                    │  │                            ││
│  └─────────┬──────────┘  └─────────┬──────────┘  └────────────┬───────────────┘│
│            │                       │                          │                 │
└────────────┼───────────────────────┼──────────────────────────┼─────────────────┘
             │                       │                          │
             └───────────────────────┼──────────────────────────┘
                                     │
                         ┌───────────▼───────────┐
                         │   x-copilot-* headers │
                         │  (agent, model, auth) │
                         └───────────┬───────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────────────┐
│                        COPILOTKIT RUNTIME SERVER                                │
│                         (Node.js + Express + Hono)                              │
│                              Port: 3001                                         │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         EXPRESS APPLICATION                              │   │
│  │                                                                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │  /api/auth  │  │ /api/admin  │  │/api/workspace│  │  /api/oauth │    │   │
│  │  │ Better Auth │  │   Config    │  │ Files/Notes │  │ Gmail/Slack │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          HONO APPLICATION                                │   │
│  │                        /api/copilotkit/*                                 │   │
│  │                                                                          │   │
│  │  ┌───────────────────────────────────────────────────────────────────┐  │   │
│  │  │                    CopilotKit Runtime                              │  │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐  │  │   │
│  │  │  │               PostgresAgentRunner                            │  │  │   │
│  │  │  │   • Thread/Run Persistence    • Crash Recovery              │  │  │   │
│  │  │  │   • Message Deletion          • Event Compaction            │  │  │   │
│  │  │  └─────────────────────────────────────────────────────────────┘  │  │   │
│  │  │                              │                                     │  │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐  │  │   │
│  │  │  │                    HttpAgent (AG-UI)                         │  │  │   │
│  │  │  │   • Per-Request Agent IDs    • Auth Context Headers         │  │  │   │
│  │  │  └─────────────────────────────────────────────────────────────┘  │  │   │
│  │  └───────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL (Neon) │  Firebase Storage  │  AES-256-GCM Encryption      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────────────┘
                                     │
                                     │ HTTP (AG-UI Protocol)
                                     │ x-copilot-* headers forwarded
                                     │
┌────────────────────────────────────▼────────────────────────────────────────────┐
│                         PYDANTIC AI SERVER                                       │
│                        (Python + FastAPI)                                        │
│                             Port: 8001                                           │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                           AGENT FACTORY                                   │   │
│  │                                                                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐   │   │
│  │  │ General  │  │   Wiki   │  │   Code   │  │    Custom Agents       │   │   │
│  │  │  Agent   │  │  Agent   │  │  Agent   │  │   (per org/team)       │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         BACKEND TOOLS (50+)                               │   │
│  │                                                                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │   Web    │  │  Code    │  │  Files   │  │Database  │  │   MCP    │   │   │
│  │  │  Search  │  │ Execute  │  │   I/O    │  │  Query   │  │  Tools   │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                           SERVICES                                        │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────────┐   │   │
│  │  │ Usage Tracker  │  │  Ably Pub/Sub  │  │   Deployment Manager     │   │   │
│  │  │  (per tenant)  │  │  (real-time)   │  │   (config hot-reload)    │   │   │
│  │  └────────────────┘  └────────────────┘  └──────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         MCP SERVERS                                       │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────────┐   │   │
│  │  │   Databricks   │  │   Filesystem   │  │     Custom Servers       │   │   │
│  │  └────────────────┘  └────────────────┘  └──────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                   ┌───────────────────┼───────────────────┐
                   │                   │                   │
                   ▼                   ▼                   ▼
          ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
          │   Anthropic  │    │   OpenAI     │    │   Google     │
          │   (Claude)   │    │   (GPT)      │    │   (Gemini)   │
          │  + Bedrock   │    │  + Azure     │    │              │
          └──────────────┘    └──────────────┘    └──────────────┘
```

### Request Flow

```
1. User sends message in Chrome Extension
2. Extension → Runtime Server (with auth cookies)
3. Runtime Server authenticates user via Better Auth
4. Runtime Server resolves organization/team context
5. Runtime Server → Python Backend (with x-copilot-* headers)
6. Python Backend creates/reuses agent instance
7. Agent executes with tools and LLM calls
8. Events stream back via AG-UI protocol
9. Runtime Server persists events to PostgreSQL
10. Response streams to Chrome Extension
```

---

## 🛠 Technology Stack

### Frontend (Chrome Extension)

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool with HMR |
| **TailwindCSS** | Styling |
| **CopilotKit** | AI chat integration |
| **SurrealDB WASM** | Client-side embeddings |

### CopilotKit Runtime Server

| Technology | Purpose |
|------------|---------|
| **Node.js 20+** | Runtime environment |
| **Express.js** | HTTP server framework |
| **Hono** | CopilotKit endpoint handling |
| **Better Auth** | Authentication system |
| **PostgreSQL** | Primary database |
| **Firebase** | File storage |

### Pydantic AI Server

| Technology | Purpose |
|------------|---------|
| **Python 3.11+** | Runtime environment |
| **FastAPI** | Web framework |
| **Pydantic AI** | Agent framework |
| **Logfire** | Observability |
| **Ably** | Real-time pub/sub |
| **MCP SDK** | Tool protocol |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.9.0 (see `.nvmrc`)
- **Python** >= 3.11
- **pnpm** >= 8
- **PostgreSQL** >= 14 (or Neon serverless)
- **Chrome/Edge** browser

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd project-hands-off

# 2. Install extension dependencies
pnpm install

# 3. Install Runtime Server dependencies
cd copilot-runtime-server
npm install
cd ..

# 4. Install Python Server dependencies
cd copilotkit-pydantic
pip install -r requirements.txt
cd ..

# 5. Set up environment variables (see Configuration section)
cp copilot-runtime-server/.env.example copilot-runtime-server/.env
cp copilotkit-pydantic/.env.example copilotkit-pydantic/.env

# 6. Initialize databases
cd copilot-runtime-server
psql -U your_user -d your_database -f migrations/001_create_agent_runner_tables.sql
cd ..
```

### Starting the Services

```bash
# Terminal 1: Chrome Extension (development)
pnpm dev

# Terminal 2: CopilotKit Runtime Server
cd copilot-runtime-server
npm run dev

# Terminal 3: Pydantic AI Server
cd copilotkit-pydantic
python main.py
```

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist` directory
5. Click the extension icon and open the side panel
6. Sign up for a new account or log in

---

## 📁 Project Structure

```
project-hands-off/
│
├── chrome-extension/              # Extension manifest and config
│   ├── manifest.ts                # Manifest generation
│   ├── public/                    # Static assets (icons, etc.)
│   └── src/
│       └── background/            # Background service worker
│
├── pages/                         # Extension pages
│   ├── side-panel/                # Main chat interface (React)
│   │   └── src/
│   │       ├── components/        # UI components
│   │       ├── context/           # React contexts (Auth, etc.)
│   │       ├── hooks/             # Custom hooks
│   │       ├── lib/               # Auth client, utilities
│   │       └── pages/             # Page components
│   ├── popup/                     # Extension popup
│   ├── options/                   # Options page
│   ├── content/                   # Content scripts
│   ├── content-ui/                # Injected UI components
│   └── offscreen/                 # Offscreen document (embeddings)
│
├── packages/                      # Shared packages
│   ├── shared/                    # Common types, hooks, components
│   ├── storage/                   # Storage helpers
│   ├── ui/                        # UI components library
│   └── i18n/                      # Internationalization
│
├── copilot-runtime-server/        # Node.js Gateway Server
│   ├── server.js                  # Main entry point (Express + Hono)
│   ├── auth/                      # Better Auth configuration
│   ├── config/                    # Environment, database, loaders
│   ├── middleware/                # Auth, CORS, error handling
│   ├── routes/                    # API route handlers
│   ├── runners/                   # PostgresAgentRunner
│   ├── utils/                     # Encryption, OAuth clients
│   ├── migrations/                # Database migrations
│   └── README.md                  # Detailed documentation
│
├── copilotkit-pydantic/           # Python AI Server
│   ├── main.py                    # FastAPI entry point
│   ├── api/                       # HTTP routes
│   ├── core/                      # Agent factory, models
│   ├── tools/                     # Backend tools (50+)
│   ├── services/                  # Usage tracker, Ably, deployment
│   ├── config/                    # Environment, prompts
│   ├── database/                  # PostgreSQL connection
│   ├── first-party-mcp-servers/   # MCP server integrations
│   └── README.md                  # Detailed documentation
│
├── landing-page/                  # Invitation acceptance page
├── dist/                          # Built extension (generated)
└── tests/e2e/                     # End-to-end tests
```

---

## ⚙️ Configuration

### Environment Variables Overview

#### Chrome Extension (root `.env`)

```env
VITE_RUNTIME_SERVER_URL=http://localhost:3001
```

#### CopilotKit Runtime Server (`copilot-runtime-server/.env`)

```env
# Server
PORT=3001
NODE_ENV=development
DEBUG=true
AGENT_BASE_URL=http://localhost:8001

# Database (PostgreSQL/Neon)
DB_HOST=your-host.neon.tech
DB_PORT=5432
DB_DATABASE=hands_off
DB_USERNAME=your_user
DB_PASSWORD=your_password
DB_OTHER_PARAMS=sslmode=require

# Authentication (Better Auth)
BETTER_AUTH_URL=http://localhost:3001
BETTER_AUTH_SECRET=your-32-char-secret-key

# OAuth Providers (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret

# Encryption
ENCRYPTION_MASTER_SECRET=your-32-char-encryption-key

# Storage (Optional)
FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
FIREBASE_API_KEY=your-firebase-api-key

# Agent Runner
USE_SQLITE_RUNNER=false
AGENT_RUNNER_MAX_HISTORIC_RUNS=1000
AGENT_RUNNER_TRANSFORM_ERRORS=false

# Server Limits
BODY_LIMIT_MB=30
REQUEST_TIMEOUT_MS=300000
RATE_LIMIT_MAX=120
CORS_ORIGINS=http://localhost:3000,chrome-extension://your-extension-id
```

#### Pydantic AI Server (`copilotkit-pydantic/.env`)

```env
# Server
PORT=8001
HOST=0.0.0.0
DEBUG=true

# Database
DB_HOST=your-host.neon.tech
DB_PORT=5432
DB_DATABASE=hands_off
DB_USERNAME=your_user
DB_PASSWORD=your_password

# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Observability
LOGFIRE_TOKEN=your-logfire-token

# Real-time Updates
ABLY_API_KEY=your-ably-key

# MCP Servers
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi...
```

---

## 💻 Development

### Extension Development

```bash
# Development mode with HMR
pnpm dev

# Production build
pnpm build

# Firefox development
pnpm dev:firefox

# Code quality
pnpm lint
pnpm type-check
pnpm format

# Package for distribution
pnpm zip
```

### Runtime Server Development

```bash
cd copilot-runtime-server

# Development with auto-reload
npm run dev

# Production mode
npm run start:prod

# Run migrations
psql -U user -d database -f migrations/001_create_agent_runner_tables.sql
```

### Pydantic Server Development

```bash
cd copilotkit-pydantic

# Start server
python main.py

# Run with auto-reload
uvicorn main:app --reload --port 8001
```

### Adding Dependencies

```bash
# Extension packages
pnpm i <package> -w              # Workspace root
pnpm i <package> -F side-panel   # Specific module

# Runtime Server
cd copilot-runtime-server && npm install <package>

# Pydantic Server
cd copilotkit-pydantic && pip install <package>
pip freeze > requirements.txt
```

---

## 🔐 Authentication & Authorization

### Authentication Flow

```
1. User enters email/password in Side Panel
2. Request sent to Runtime Server /api/auth/sign-in/email
3. Better Auth validates credentials against PostgreSQL
4. Session created with secure cookie
5. Session includes activeOrganizationId and activeTeamId
6. All subsequent requests include session cookie
7. Runtime Server extracts and forwards auth context to Python backend
```

### Headers Forwarded to Python Backend

| Header | Description |
|--------|-------------|
| `x-copilot-user-id` | User's unique ID |
| `x-copilot-user-email` | User's email address |
| `x-copilot-user-name` | User's display name |
| `x-copilot-organization-id` | Active organization ID |
| `x-copilot-organization-name` | Organization name |
| `x-copilot-organization-slug` | Organization URL slug |
| `x-copilot-team-id` | Active team ID |
| `x-copilot-team-name` | Team name |
| `x-copilot-member-role` | User's role (owner/admin/member) |
| `x-copilot-session-id` | Current session ID |

### Roles & Permissions

| Role | Permissions |
|------|-------------|
| **owner** | Full control over organization, billing, deletion |
| **admin** | Manage members, teams, models, agents, tools |
| **member** | Basic access, create chats, use AI features |

### Auto-Selection Logic

- If no active organization: selects first organization and saves to session
- If no active team: selects first team user belongs to and saves to session
- All context automatically forwarded on every AI request

---

## 🐛 Troubleshooting

### Extension Issues

| Issue | Solution |
|-------|----------|
| HMR not working | Stop dev server, kill turbo processes, restart |
| Extension not loading | Check `dist/manifest.json`, enable developer mode |
| Side panel not opening | Verify `sidePanel` permission in manifest |

### Server Issues

| Issue | Solution |
|-------|----------|
| Runtime server won't start | Check `DATABASE_URL`, ensure PostgreSQL running |
| Python server errors | Verify Python 3.11+, check API keys |
| Connection timeouts | Increase `REQUEST_TIMEOUT_MS`, check backend health |
| Auth not working | Verify `BETTER_AUTH_SECRET`, clear cookies |

### Common Errors

```bash
# Kill stuck turbo process
pkill -f turbo

# Clear node_modules
rm -rf node_modules && pnpm install

# Clean build
rm -rf dist && pnpm build

# Check PostgreSQL connection
psql -h your-host -U your-user -d your-database -c "SELECT 1"

# Check Python dependencies
pip install -r requirements.txt --upgrade
```

---

## 📖 Documentation

### Component Documentation

| Component | README |
|-----------|--------|
| **CopilotKit Runtime Server** | [copilot-runtime-server/README.md](copilot-runtime-server/README.md) |
| **Pydantic AI Server** | [copilotkit-pydantic/README.md](copilotkit-pydantic/README.md) |

### Additional Guides

| Guide | Description |
|-------|-------------|
| [INVITATION_SYSTEM.md](INVITATION_SYSTEM.md) | Invitation flow documentation |
| [INVITATION_ARCHITECTURE.md](INVITATION_ARCHITECTURE.md) | Invitation system architecture |
| [ADMIN_REFACTORING.md](ADMIN_REFACTORING.md) | Admin dashboard documentation |
| [SINGLE_TEAM_ENFORCEMENT.md](SINGLE_TEAM_ENFORCEMENT.md) | Team membership rules |

### API Documentation

| Server | Endpoint | Description |
|--------|----------|-------------|
| Runtime | `GET /health` | Health check |
| Runtime | `POST /api/auth/*` | Authentication (Better Auth) |
| Runtime | `GET /api/config` | Client configuration |
| Runtime | `POST /api/copilotkit/*` | AI chat (AG-UI protocol) |
| Runtime | `/api/admin/*` | Admin configuration APIs |
| Runtime | `/api/workspace/*` | Personal workspace APIs |
| Python | `GET /health` | Health check |
| Python | `POST /agent/{agent_type}/{model_type}` | Agent execution |
| Python | `/admin/*` | Admin APIs |

---

## 📄 License

TBA

---

## 🤝 Contributing

TBA

---

**Built with ❤️ using [Chrome Extension Boilerplate](https://github.com/AkramElganzoury/chrome-extension-boilerplate-react-vite) • [CopilotKit](https://copilotkit.ai) • [Pydantic AI](https://pydantic.dev/ai) • [Better Auth](https://better-auth.com)**
