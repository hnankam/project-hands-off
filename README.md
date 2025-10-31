# Project Hands-Off

> AI-Powered Browser Assistant with Multi-Tenant Organization & Team Management

![](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![](https://img.shields.io/badge/Typescript-3178C6?style=flat-square&logo=typescript&logoColor=black)
![](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![](https://badges.aleen42.com/src/vitejs.svg)

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Development](#development)
- [Authentication & Authorization](#authentication--authorization)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## 🎯 Overview

Project Hands-Off is an intelligent browser extension that integrates AI capabilities directly into your browsing experience. It combines a React-based Chrome extension with a sophisticated backend infrastructure featuring:

- **Multi-tenant organization and team management** with role-based access control
- **CopilotKit-powered AI agents** with dynamic model selection (Claude, GPT-4, Gemini)
- **Semantic search** using vector embeddings for intelligent content discovery
- **Session-based chat** with message history and context preservation
- **Invitation system** for team collaboration

## ✨ Features

### 🤖 AI & Intelligence
- **Multiple AI Providers**: Claude (Anthropic), GPT-4 (OpenAI), Gemini (Google)
- **Dynamic Agent System**: Switch between specialized agents on-the-fly
- **Semantic Search**: Vector embeddings with Transformers.js (Xenova/all-MiniLM-L6-v2)
- **Context-Aware Chat**: Maintains conversation history with intelligent compaction
- **Browser Integration**: Direct interaction with web pages and forms

### 👥 Multi-User & Organizations
- **Better Auth Integration**: Secure authentication with email/password
- **Organization Management**: Multi-tenant architecture with organization isolation
- **Team Support**: Organize users into teams within organizations
- **Role-Based Access**: Member, admin, and owner roles
- **Invitation System**: Email-based invitations with secure token flow
- **Active Context Forwarding**: Automatic org/team context sent to AI agents

### 💾 Data & Storage
- **Dual Database Architecture**:
  - PostgreSQL for user management, orgs, teams, invitations
  - SurrealDB WASM for in-browser embeddings and session storage
- **IndexedDB Persistence**: Client-side data persistence
- **Message History**: Searchable chat history with usage tracking
- **Embedding Auto-Generation**: Automatic embedding when content changes

### 🎨 User Experience
- **Side Panel Interface**: Modern, responsive chat UI
- **Dark/Light Modes**: Full theme support
- **Organization Selector**: Quick switching between organizations
- **Agent & Model Selectors**: Easy configuration of AI behavior
- **Settings & Preferences**: Customizable chat experience
- **Admin Dashboard**: Complete organization and team management

### 🔧 Developer Experience
- **Hot Module Reload**: Instant updates during development
- **Turborepo**: Optimized monorepo with 16-thread concurrency
- **TypeScript**: Full type safety across frontend
- **Python Type Hints**: Pydantic models for backend
- **ESLint & Prettier**: Automated code formatting
- **Modular Architecture**: Clean separation of concerns

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Side Panel  │  │   Content    │  │  Background  │      │
│  │  (Chat UI)   │  │   Scripts    │  │   Service    │      │
│  └──────┬───────┘  └──────────────┘  └──────────────┘      │
│         │                                                     │
└─────────┼─────────────────────────────────────────────────────┘
          │
          │ HTTP/WebSocket
          │
┌─────────▼─────────────────────────────────────────────────────┐
│              Copilot Runtime Server (Node.js)                 │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Authentication Middleware                            │    │
│  │  - Better Auth integration                            │    │
│  │  - Session management                                 │    │
│  │  - Org/Team context extraction                        │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Dynamic Routing                                      │    │
│  │  - Agent selection                                    │    │
│  │  - Model configuration                                │    │
│  │  - Context forwarding                                 │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Routes: /auth, /copilotkit, /invitations, /config   │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            │ HTTP Headers (org/team/user context)
                            │
┌───────────────────────────▼───────────────────────────────────┐
│          Pydantic AI Server (Python/FastAPI)                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Request Middleware                                   │    │
│  │  - Extract user/org/team from headers                │    │
│  │  - Populate request.state                            │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Agent Factory                                        │    │
│  │  - Dynamic agent instantiation                        │    │
│  │  - Model-specific configuration                       │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Session Manager & Usage Tracker                      │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│                    Data Layer                                 │
│  ┌──────────────────┐         ┌──────────────────┐           │
│  │   PostgreSQL     │         │  SurrealDB WASM  │           │
│  │  - Users         │         │  - Embeddings    │           │
│  │  - Organizations │         │  - Chat History  │           │
│  │  - Teams         │         │  - Sessions      │           │
│  │  - Invitations   │         │  (IndexedDB)     │           │
│  └──────────────────┘         └──────────────────┘           │
└───────────────────────────────────────────────────────────────┘
```

### Key Data Flow

1. **User Authentication**: Side panel → Runtime server (Better Auth) → PostgreSQL
2. **Chat Request**: Side panel → Runtime server (extracts org/team) → Pydantic server
3. **Context Forwarding**: Runtime middleware injects `x-copilot-user-id`, `x-copilot-organization-id`, `x-copilot-team-id` headers
4. **AI Processing**: Pydantic server uses context for personalized responses
5. **Message Storage**: Responses stored in SurrealDB with embeddings

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20 (see `.nvmrc`)
- **Python** >= 3.11
- **pnpm** >= 8
- **PostgreSQL** >= 14
- **Chrome/Edge** browser

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd project-hands-off
```

2. **Install dependencies**
```bash
# Install pnpm globally if needed
npm install -g pnpm

# Install extension dependencies
pnpm install

# Install Python server dependencies
cd copilotkit-pydantic
pip install -r requirements.txt
cd ..

# Install runtime server dependencies
cd copilot-runtime-server
npm install
cd ..
```

3. **Set up environment variables**

Create `.env` files in each component:

**Extension** (`/` root):
```env
VITE_RUNTIME_SERVER_URL=http://localhost:3100
```

**Runtime Server** (`copilot-runtime-server/.env`):
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/hands_off

# Better Auth
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:3100

# AI Providers (get your keys)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Server Config
PORT=3100
NODE_ENV=development

# Python Server
PYDANTIC_SERVER_URL=http://localhost:8001
```

**Pydantic Server** (`copilotkit-pydantic/.env`):
```env
# AI Provider Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Server Config
PORT=8001
DEBUG=true
```

4. **Initialize the database**
```bash
cd copilot-runtime-server
npm run db:init
cd ..
```

5. **Start the development servers**

```bash
# Terminal 1: Chrome Extension
pnpm dev

# Terminal 2: Runtime Server
cd copilot-runtime-server
npm run dev

# Terminal 3: Pydantic Server
cd copilotkit-pydantic
python main.py
```

6. **Load the extension**
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory

7. **Open the side panel**
   - Click the extension icon in the toolbar
   - Click "Open Side Panel"
   - Sign up for a new account or log in

## 💻 Development

### Project Commands

```bash
# Extension Development
pnpm dev              # Development mode with HMR
pnpm build            # Production build
pnpm dev:firefox      # Firefox development mode
pnpm build:firefox    # Firefox production build

# Code Quality
pnpm lint             # Run ESLint
pnpm type-check       # TypeScript type checking
pnpm format           # Format with Prettier

# Utilities
pnpm update-version <version>  # Update extension version
pnpm zip              # Package extension for distribution
pnpm e2e              # Run end-to-end tests

# Module Management
pnpm module-manager   # Enable/disable extension modules
```

### Runtime Server Commands

```bash
cd copilot-runtime-server

npm run dev           # Start with nodemon
npm start             # Production start
npm run db:init       # Initialize database
npm run db:migrate    # Run migrations
npm test              # Run tests
```

### Pydantic Server Commands

```bash
cd copilotkit-pydantic

python main.py                # Start server
python scripts/init_db.py     # Initialize database
```

### Adding Dependencies

**Root/Extension packages:**
```bash
pnpm i <package> -w              # Add to workspace root
pnpm i <package> -F side-panel   # Add to specific module
```

**Runtime Server:**
```bash
cd copilot-runtime-server
npm install <package>
```

**Pydantic Server:**
```bash
cd copilotkit-pydantic
pip install <package>
# Don't forget to update requirements.txt
pip freeze > requirements.txt
```

## 🔐 Authentication & Authorization

### Better Auth Setup

The project uses [Better Auth](https://www.better-auth.com/) for authentication with the organization plugin.

**Key Features:**
- Email/password authentication
- Organization multi-tenancy
- Team management within organizations
- Session-based authentication
- Secure invitation system

**Database Schema:**
- `user` - User accounts
- `session` - Active sessions with `activeOrganizationId` and `activeTeamId`
- `organization` - Organizations/tenants
- `member` - User-organization membership with roles
- `team` - Teams within organizations
- `teamMember` - User-team membership
- `invitation` - Pending invitations

### Context Forwarding

The runtime server automatically extracts and forwards authentication context to the AI server:

**Headers sent to Pydantic server:**
- `x-copilot-user-id` - User ID
- `x-copilot-user-email` - User email
- `x-copilot-user-name` - User display name
- `x-copilot-organization-id` - Active organization ID
- `x-copilot-organization-name` - Organization name
- `x-copilot-organization-slug` - Organization slug
- `x-copilot-team-id` - Active team ID
- `x-copilot-team-name` - Team name
- `x-copilot-member-role` - User's role in organization

**Auto-Selection Logic:**
- If no active organization: selects first organization and saves to session
- If no active team: selects first team user belongs to and saves to session
- All context automatically forwarded on every AI request

### Roles & Permissions

**Organization Roles:**
- `owner` - Full control over organization
- `admin` - Manage members and teams
- `member` - Basic access

**Enforcement:**
- Backend: Middleware validates organization/team access
- Frontend: UI components adapt based on role
- Database: Foreign key constraints ensure data isolation

## 📁 Project Structure

```
project-hands-off/
├── chrome-extension/          # Extension manifest and config
│   ├── manifest.ts            # Manifest generation
│   ├── public/                # Static assets
│   └── src/background/        # Background service worker
│
├── pages/                     # Extension pages (transpiled)
│   ├── side-panel/            # Main chat interface (React)
│   │   ├── src/
│   │   │   ├── components/    # UI components
│   │   │   ├── context/       # React contexts (Auth, etc.)
│   │   │   ├── hooks/         # Custom hooks
│   │   │   ├── lib/           # Auth client, utilities
│   │   │   ├── pages/         # Page components
│   │   │   └── actions/       # Browser actions
│   │   └── index.tsx
│   ├── popup/                 # Extension popup
│   ├── options/               # Options page
│   ├── content/               # Content scripts
│   ├── content-ui/            # Injected UI components
│   └── offscreen/             # Offscreen document for embeddings
│
├── packages/                  # Shared packages
│   ├── shared/                # Common types, hooks, components
│   ├── storage/               # Storage helpers
│   ├── ui/                    # UI components library
│   ├── i18n/                  # Internationalization
│   ├── hmr/                   # Hot module reload plugin
│   └── ...
│
├── copilot-runtime-server/    # Node.js/Express server
│   ├── middleware/
│   │   ├── dynamicRouting.js  # Agent/model selection + context forwarding
│   │   ├── auth.js            # Better Auth integration
│   │   └── ...
│   ├── routes/
│   │   ├── auth.js            # Authentication endpoints
│   │   ├── copilotkit.js      # CopilotKit proxy
│   │   ├── invitations.js     # Invitation system
│   │   └── config.js          # Dynamic configuration
│   ├── auth/
│   │   └── index.js           # Better Auth setup
│   ├── config/
│   │   ├── models.json        # AI model configurations
│   │   ├── agents.json        # Agent definitions
│   │   └── providers.json     # Provider settings
│   ├── scripts/               # Database scripts
│   └── server.js              # Entry point
│
├── copilotkit-pydantic/       # Python/FastAPI AI server
│   ├── middleware/
│   │   └── request_middleware.py  # Extract user/org/team context
│   ├── core/
│   │   ├── agent_factory.py   # Dynamic agent creation
│   │   └── models.py          # Pydantic models
│   ├── api/
│   │   ├── routes.py          # HTTP endpoints
│   │   └── websocket.py       # WebSocket handler
│   ├── services/
│   │   ├── session_manager.py # Session state management
│   │   └── usage_tracker.py   # Token usage tracking
│   ├── history_processor/     # Message compaction
│   ├── config/
│   │   ├── models.json        # Model definitions
│   │   ├── agents.json        # Agent configurations
│   │   └── prompts.py         # System prompts
│   ├── database/              # Database connection
│   └── main.py                # Entry point
│
├── dist/                      # Built extension (generated)
├── landing-page/              # Invitation acceptance page
└── tests/e2e/                 # End-to-end tests
```

### Key Components

**Side Panel** (`pages/side-panel/`):
- Main user interface with chat, settings, admin dashboard
- React context for authentication and state management
- Organization and team selectors in UI
- Agent and model configuration

**Runtime Server** (`copilot-runtime-server/`):
- Proxies requests between extension and AI server
- Handles authentication with Better Auth
- Manages organizations, teams, and invitations
- Extracts and forwards user context to AI server

**Pydantic Server** (`copilotkit-pydantic/`):
- Hosts AI agents with CopilotKit
- Receives user/org/team context via headers
- Manages conversation history and sessions
- Tracks token usage and implements caching

## ⚙️ Configuration

### AI Models Configuration

**Runtime Server** (`copilot-runtime-server/config/models.json`):
```json
{
  "claude-3.5-sonnet": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "description": "Most capable Claude model"
  },
  "gpt-4o": {
    "provider": "openai",
    "model": "gpt-4o",
    "description": "Latest GPT-4 model"
  }
}
```

**Pydantic Server** (`copilotkit-pydantic/config/models.json`):
```json
{
  "claude-3.5-sonnet": {
    "provider": "anthropic",
    "model_name": "claude-3-5-sonnet-20241022",
    "supports_vision": true
  }
}
```

### Agents Configuration

**Runtime Server** (`copilot-runtime-server/config/agents.json`):
```json
{
  "general": {
    "name": "General Assistant",
    "description": "General-purpose AI assistant",
    "default_model": "claude-3.5-sonnet"
  },
  "coding": {
    "name": "Coding Assistant",
    "description": "Specialized for programming tasks",
    "default_model": "claude-3.5-sonnet"
  }
}
```

### Dynamic Configuration API

The runtime server exposes a configuration API:

```
GET /api/config/models    # List available models
GET /api/config/agents    # List available agents
```

This allows the frontend to dynamically adapt to available models and agents.

## 🐛 Troubleshooting

### Extension Issues

**HMR not working:**
1. Stop the dev server (Ctrl+C)
2. Kill any `turbo` processes
3. Run `pnpm dev` again

**Extension not loading:**
1. Check `dist/manifest.json` is valid
2. Look for errors in `chrome://extensions` (developer mode)
3. Try removing and re-adding the extension

**Side panel not opening:**
1. Ensure the extension has the `sidePanel` permission
2. Check background service worker logs
3. Verify the side panel path in manifest

### Server Issues

**Runtime server won't start:**
1. Check database connection: `DATABASE_URL` is correct
2. Ensure PostgreSQL is running
3. Run `npm run db:init` to initialize database
4. Check for port conflicts (default 3100)

**Pydantic server errors:**
1. Verify Python version >= 3.11
2. Check all requirements installed: `pip install -r requirements.txt`
3. Ensure AI provider API keys are set
4. Check for port conflicts (default 8001)

**Database connection errors:**
```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql postgresql://user:password@localhost:5432/hands_off

# Reinitialize if needed
cd copilot-runtime-server
npm run db:init
```

**Authentication not working:**
1. Verify `BETTER_AUTH_SECRET` is set
2. Check `BETTER_AUTH_URL` matches your runtime server URL
3. Clear browser cookies and try again
4. Check database tables were created: `user`, `session`, `organization`, etc.

**Organization/Team context not forwarding:**
1. Check runtime server logs for "Auth Context" messages
2. Verify user is member of an organization
3. Check pydantic server logs show correct IDs
4. Ensure middleware is extracting headers correctly

### Common Errors

**`grpc` error in turbo:**
```bash
# Kill turbo process
pkill -f turbo
# Or on Windows: taskkill /F /IM turbo.exe
pnpm dev
```

**TypeScript errors in VS Code:**
1. Ensure using workspace TypeScript version
2. Cmd/Ctrl+Shift+P → "TypeScript: Select TypeScript Version" → "Use Workspace Version"

**Module not found errors:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules
pnpm install
```

**Build fails:**
```bash
# Clean build artifacts
rm -rf dist
pnpm build
```

## 📖 Documentation

Additional documentation:
- [Runtime Server Setup](copilot-runtime-server/SETUP.md)
- [Invitation System](INVITATION_SYSTEM.md)
- [Invitation Architecture](INVITATION_ARCHITECTURE.md)
- [Admin Refactoring](ADMIN_REFACTORING.md)
- [Single Team Enforcement](SINGLE_TEAM_ENFORCEMENT.md)
- [UI Team Enforcement](UI_TEAM_ENFORCEMENT.md)

## 📄 License

[Add your license here]

---

**Note**: This project is built on [Chrome Extension Boilerplate with React + Vite + TypeScript](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)
