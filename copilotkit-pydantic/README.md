# Pydantic AI Agent Server

A production-ready, multi-tenant AI agent server built with **FastAPI** and **Pydantic AI**. This server provides REST API endpoints for running AI agents with multiple model backends, real-time usage tracking via Ably Pub/Sub, and comprehensive tool integrations including MCP (Model Context Protocol) servers.

## 📋 Table of Contents

- [Features](#-features)
- [Architecture Overview](#-architecture-overview)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
- [Core Concepts](#-core-concepts)
- [Tool System](#-tool-system)
- [Multi-Agent Workflows](#-multi-agent-workflows)
- [MCP Server Integrations](#-mcp-server-integrations)
- [Database Schema](#-database-schema)
- [Observability](#-observability)
- [Deployment](#-deployment)

---

## ✨ Features

### Core Capabilities
- **Multi-Model Support**: Google (Gemini), Anthropic (Claude), OpenAI, Azure OpenAI, Amazon Bedrock
- **Multi-Tenancy**: Organization and team-level configuration scoping
- **Real-Time Updates**: Ably Pub/Sub for live usage tracking and streaming
- **AG-UI Protocol**: Full support for the Agent-UI streaming protocol with state management
- **Tool Orchestration**: Backend tools, builtin tools, frontend tools, and MCP integrations

### Agent Features
- **Plan Management**: Create, update, and track multi-step execution plans
- **Multi-Agent Graphs**: Orchestrate complex workflows across specialized agents
- **Auxiliary Agents**: Delegate specialized tasks (image generation, web search, code execution)
- **Custom Auxiliary Agents**: User-defined agents callable via the `call_agent` tool
- **Human-in-the-Loop**: Pause executions for user confirmation

### Integrations
- **First-Party MCP Servers**: Databricks, GitHub, Jira, Confluence, Microsoft 365
- **Built-in Tools**: Web search, code execution, image generation, URL context, memory
- **Workspace Tools**: Personal file management, notes, folders for authenticated users
- **Firebase Storage**: Cloud storage for generated content

### Production Features
- **Logfire Observability**: Full tracing of agent runs, tool calls, and model interactions
- **Connection Pooling**: Optimized for Neon serverless PostgreSQL
- **Deployment Manager**: Hot-reload configurations without server restart
- **Usage Tracking**: Token usage, costs, and error tracking per session

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FastAPI Application                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Agent Routes│  │ Info Routes │  │Admin Routes │  │  Deployment API     │ │
│  │ POST /agent │  │ GET /       │  │ /api/admin/ │  │ POST /deployments/  │ │
│  │ /{type}/{m} │  │ GET /health │  │  mcp-servers│  │      context        │ │
│  └──────┬──────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Core Layer                                    │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │   │
│  │  │  Agent Factory  │  │    Models       │  │   Unified Deps      │  │   │
│  │  │  (Create/Cache) │  │  (AgentState)   │  │ (Context Injection) │  │   │
│  │  └────────┬────────┘  └─────────────────┘  └─────────────────────┘  │   │
│  │           │                                                          │   │
│  │           ▼                                                          │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │                    Pydantic AI Agent                            │ │   │
│  │  │  • Instructions (static + dynamic AGUI context injection)      │ │   │
│  │  │  • Model (resolved from DB config)                              │ │   │
│  │  │  • Tools (backend + builtin + MCP)                              │ │   │
│  │  │  • History Processors                                           │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Tool Layer                                    │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────────────┐  │   │
│  │  │  Backend  │ │  Builtin  │ │    MCP    │ │  Multi-Agent Graph  │  │   │
│  │  │  Tools    │ │  Tools    │ │ Toolsets  │ │     Execution       │  │   │
│  │  └───────────┘ └───────────┘ └───────────┘ └─────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Services Layer                                 │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────────┐  │   │
│  │  │   Session   │ │    Ably     │ │   Usage     │ │  Deployment   │  │   │
│  │  │   Manager   │ │  Publisher  │ │   Tracker   │ │   Manager     │  │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └───────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PostgreSQL (Neon)                                   │
│  providers │ models │ agents │ tools │ mcp_servers │ usage │ workspace_*   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
copilotkit-pydantic/
├── main.py                     # FastAPI application entry point
├── requirements.txt            # Python dependencies
│
├── api/                        # HTTP route handlers
│   ├── __init__.py
│   ├── routes.py              # Agent execution & info endpoints
│   └── admin.py               # MCP server admin endpoints
│
├── core/                       # Core domain logic
│   ├── __init__.py
│   ├── agent_factory.py       # Agent creation, caching, and configuration
│   ├── models.py              # Pydantic models (AgentState, UnifiedDeps, etc.)
│   └── workspace_models.py    # Workspace-specific models
│
├── config/                     # Configuration management
│   ├── __init__.py            # Configuration exports
│   ├── environment.py         # Environment variables and logging
│   ├── db_loaders.py          # Database configuration loaders
│   ├── models.py              # Model/provider configuration
│   ├── prompts.py             # Agent prompts and metadata
│   ├── tools.py               # Tool configuration caching
│   └── firebase.py            # Firebase configuration
│
├── database/                   # Database layer
│   ├── __init__.py
│   ├── connection.py          # Async connection pool (Neon-optimized)
│   ├── schema.sql             # Core database schema
│   ├── seed.py                # Database seeding utilities
│   ├── monitoring.py          # Connection monitoring
│   ├── run_migration.py       # Migration runner
│   └── migrations/            # SQL migration files (001-032+)
│
├── middleware/                 # HTTP middleware
│   ├── __init__.py
│   └── request_middleware.py  # Error handling, model validation
│
├── services/                   # Business services
│   ├── __init__.py
│   ├── ably_publisher.py      # Real-time Pub/Sub messaging
│   ├── deployment_manager.py  # Configuration hot-reload
│   ├── session_manager.py     # Session state management
│   ├── usage_tracker.py       # Token/cost tracking
│   └── workspace_manager.py   # User workspace operations
│
├── tools/                      # Agent tools
│   ├── __init__.py
│   ├── agent_tools.py         # Tool registration and loading
│   ├── auxiliary_agents.py    # Auxiliary agent factory
│   ├── backend_tools.py       # Python backend tools
│   ├── graph_tools.py         # Multi-agent graph tools
│   ├── mcp_loader.py          # MCP server loading utilities
│   ├── workspace_tools.py     # Workspace file/note tools
│   └── multi_agent_graph/     # Multi-agent orchestration
│       ├── __init__.py
│       ├── graph.py           # Graph definition
│       ├── runner.py          # Graph execution
│       ├── agents.py          # Sub-agent creation
│       ├── actions.py         # Graph lifecycle actions
│       ├── state.py           # State synchronization
│       ├── steps.py           # Node implementations
│       ├── events.py          # AG-UI event streaming
│       ├── types.py           # Type definitions
│       └── constants.py       # Graph constants
│
├── utils/                      # Utility modules
│   ├── __init__.py
│   ├── context.py             # Context tuple utilities
│   ├── firebase_storage.py    # Firebase Storage uploads
│   └── message_processor.py   # Message history processing
│
├── scripts/                    # Utility scripts
│   └── init_db.py             # Database initialization
│
└── first-party-mcp-servers/   # Built-in MCP server integrations
    ├── shared/
    │   └── credential_resolver.py  # Secure credential decryption
    ├── databricks/            # Databricks Unity Catalog, SQL, ML
    ├── github/                # GitHub repos, PRs, issues
    ├── jira/                  # Jira projects, issues, sprints
    ├── confluence/            # Confluence pages, spaces
    └── microsoft365/          # Outlook, OneDrive, SharePoint, Excel
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- PostgreSQL 14+ (Neon recommended)
- Node.js 18+ (for some MCP servers)

### Installation

1. **Clone and install dependencies**:

```bash
cd copilotkit-pydantic
python -m venv .venv
source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

2. **Configure environment variables**:

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Initialize the database**:

```bash
python scripts/init_db.py
```

4. **Run the server**:

```bash
python main.py
# Or with uvicorn for development:
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DB_HOST` | PostgreSQL host (Neon pooling endpoint) | ✅ |
| `DB_PORT` | PostgreSQL port | Default: 5432 |
| `DB_DATABASE` | Database name | ✅ |
| `DB_USERNAME` | Database user | ✅ |
| `DB_PASSWORD` | Database password | ✅ |
| `DB_OTHER_PARAMS` | Connection params | Default: `sslmode=require` |
| `ABLY_API_KEY` | Ably Pub/Sub API key | For real-time updates |
| `GOOGLE_API_KEY` | Google AI API key | For Gemini models |
| `LOGFIRE_TOKEN` | Logfire observability token | For tracing |
| `LOGFIRE_ENABLED` | Enable/disable Logfire | Default: true if token set |
| `ALLOWED_ORIGINS` | CORS allowed origins | Comma-separated |
| `DEBUG` | Enable debug mode | Default: false |
| `HOST` | Server host | Default: 0.0.0.0 |
| `PORT` | Server port | Default: 8001 |
| `ENCRYPTION_MASTER_SECRET` | Credential encryption key | For MCP servers |

---

## ⚙️ Configuration

### Database-Driven Configuration

All agent, model, provider, and tool configurations are stored in PostgreSQL and loaded at runtime. This enables:

- **Hot Reload**: Update configurations without server restart
- **Multi-Tenancy**: Different configurations per organization/team
- **Version Control**: Configuration versioning and rollback
- **Audit Trail**: Track all configuration changes

### Configuration Loading Flow

```
Request → Extract org_id/team_id → Load Context Bundle from DB
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              Providers              Models                Agents
              (credentials)        (settings)            (prompts)
                    │                     │                     │
                    └─────────────────────┼─────────────────────┘
                                          ▼
                               Cache in Memory
                                          │
                                          ▼
                              Create/Retrieve Agent
```

### Deployment Manager

The deployment manager handles configuration lifecycle:

```python
# Deploy/redeploy a context
await deploy_context(organization_id, team_id, force=True)

# Check if context is ready
await ensure_context_ready(organization_id, team_id)

# Get deployment status
status = get_context_status(organization_id, team_id)
```

---

## 📡 API Reference

### Agent Execution

#### `POST /agent/{agent_type}/{model}`

Execute an agent with the AG-UI streaming protocol.

**Headers:**
```
x-copilot-session-id: <session-id>
x-copilot-thread-id: <thread-id>
x-copilot-user-id: <user-id>
x-copilot-organization-id: <org-id>
x-copilot-team-id: <team-id>
Content-Type: application/json
Accept: text/event-stream
```

**Request Body (AG-UI RunAgentInput):**
```json
{
  "thread_id": "abc123",
  "run_id": "run_456",
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "Create a plan to build a house"
    }
  ],
  "state": {},
  "context": [
    {
      "description": "Current Page",
      "value": "Dashboard - Overview"
    }
  ],
  "tools": [],
  "forwarded_props": null
}
```

**Response:** Server-Sent Events (SSE) stream with AG-UI events.

### Information Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Server info and available endpoints |
| `/healthz` | GET | Health check (liveness) |
| `/readyz` | GET | Readiness check (DB + caches) |
| `/sessions` | GET | List active sessions |
| `/sessions/{session_id}/cleanup` | POST | Clean up session state |
| `/tools/{agent_type}/{model}` | GET | List tools for agent/model |

### Deployment Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/deployments` | GET | List all deployed contexts |
| `/deployments/endpoints` | GET | List all agent/model endpoints |
| `/deployments/context` | POST | Deploy/redeploy a context |
| `/deployments/context` | GET | Get context deployment status |
| `/deployments/context/restart` | POST | Force restart a context |

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/mcp-servers/test` | POST | Test MCP server connectivity |
| `/api/admin/mcp-servers/{id}/tools` | POST | Load tools from MCP server |

---

## 🧠 Core Concepts

### Agent State

The `AgentState` model maintains session state with support for multiple concurrent plans and graphs:

```python
class AgentState(BaseModel):
    # Multiple plan instances (keyed by plan_id)
    plans: dict[str, PlanInstance] = {}
    
    # Multiple graph instances (keyed by graph_id)
    graphs: dict[str, GraphInstance] = {}
    
    # Session metadata
    sessionId: str | None = None
    
    # Human-in-the-loop
    deferred_tool_requests: Any = None
```

### Unified Dependencies

All tools and agents receive `UnifiedDeps` containing:

```python
@dataclass
class UnifiedDeps:
    # Core state
    state: AgentState | None = None
    
    # Streaming
    send_stream: MemoryObjectSendStream | None = None
    adapter: AGUIAdapter | None = None
    
    # Graph metadata
    graph_id: str | None = None
    graph_name: str | None = None
    
    # Context
    organization_id: str | None = None
    team_id: str | None = None
    agent_type: str | None = None
    agent_info: dict | None = None
    
    # Usage tracking
    session_id: str | None = None
    user_id: str | None = None
    agent_id: str | None = None
    model_id: str | None = None
    broadcast_func: Callable | None = None
    
    # Frontend context
    agui_context: list[dict] | None = None
```

### AG-UI Event Streaming

The server implements the AG-UI protocol for rich streaming experiences:

- **StateSnapshotEvent**: Full state synchronization
- **StateDeltaEvent**: Incremental state updates (JSON Patch)
- **ActivitySnapshotEvent**: Create activity messages
- **ActivityDeltaEvent**: Update activity messages
- **TextMessageStartEvent**: Begin text streaming
- **TextMessageDeltaEvent**: Stream text chunks
- **TextMessageEndEvent**: Complete text streaming
- **ToolCallStartEvent**: Tool execution started
- **ToolCallArgsEvent**: Tool arguments
- **ToolCallEndEvent**: Tool execution completed

---

## 🔧 Tool System

### Tool Types

| Type | Description | Location |
|------|-------------|----------|
| **Backend** | Python functions with state access | `tools/backend_tools.py` |
| **Builtin** | Pydantic AI builtin tools | `WebSearchTool`, `CodeExecutionTool`, etc. |
| **MCP** | Model Context Protocol servers | Database configuration |
| **Frontend** | Client-side tools (defined in frontend) | AG-UI protocol |

### Backend Tools

Backend tools are Python functions registered in `BACKEND_TOOLS`:

```python
# tools/backend_tools.py

async def create_plan(
    ctx: RunContext[UnifiedDeps],
    name: str,
    steps: list[str],
    status: str = "active"
) -> ToolReturn:
    """Create a new plan with a descriptive name."""
    # Implementation with state updates and AG-UI events
    ...

BACKEND_TOOLS = {
    'create_plan': create_plan,
    'update_plan_step': update_plan_step,
    'update_plan_steps': update_plan_steps,
    # ... more tools
}
```

### Available Backend Tools

#### Plan Management
- `create_plan(name, steps, status)` - Create a new execution plan
- `update_plan_step(plan_id, step_index, description, status)` - Update a single step
- `update_plan_steps(plan_id, updates)` - Batch update multiple steps
- `update_plan_status(plan_id, status)` - Change plan status
- `rename_plan(plan_id, new_name)` - Rename a plan
- `list_plans()` - List all plans
- `get_plan_details(plan_id)` - Get detailed plan info
- `delete_plan(plan_id)` - Delete a plan

#### Graph Execution
- `run_graph(query, graph_name)` - Execute a multi-agent graph
- `get_graph_status(graph_id)` - Get graph execution status
- `cancel_graph(graph_id)` - Cancel graph execution
- `resume_graph(graph_id)` - Resume paused graph

#### Auxiliary Agents
- `generate_images(prompt, num_images)` - Generate images via auxiliary agent
- `web_search(prompt)` - Search the web via auxiliary agent
- `code_execution(prompt)` - Execute code via auxiliary agent
- `url_context(urls)` - Load URL content via auxiliary agent
- `call_agent(agent_key, prompt)` - Call custom auxiliary agent

#### Workspace (User Resources)
- `search_workspace_files(query, folder, tags)` - Search files
- `get_file_content(file_id)` - Get file content
- `list_files(folder)` - List files in folder
- `create_text_file(name, content, folder)` - Create text file
- `update_file_content(file_id, content)` - Update file
- `delete_file(file_id)` - Delete file
- `move_file(file_id, target_folder)` - Move file
- `search_workspace_notes(query)` - Search notes
- `get_note_content(note_id)` - Get note content
- `list_folders()` - List folders
- `create_folder(name)` - Create folder

### Builtin Tools

Pydantic AI builtin tools are registered via the agent factory:

```python
BUILTIN_TOOL_REGISTRY = {
    'builtin_web_search': WebSearchTool,
    'builtin_code_execution': CodeExecutionTool,
    'builtin_image_generation': ImageGenerationTool,
    'builtin_memory': MemoryTool,
    'builtin_url_context': UrlContextTool,
}
```

### Adding a New Backend Tool

1. **Define the function** in `tools/backend_tools.py`:

```python
async def my_new_tool(
    ctx: RunContext[UnifiedDeps],
    param1: str,
    param2: int = 10
) -> str:
    """Description of what the tool does.
    
    Args:
        ctx: The run context with agent state
        param1: Description of param1
        param2: Description of param2 (default: 10)
        
    Returns:
        Description of return value
    """
    # Access state and deps
    state = ctx.deps.state
    user_id = ctx.deps.user_id
    
    # Implement tool logic
    result = f"Processed {param1} with {param2}"
    
    return result
```

2. **Register in BACKEND_TOOLS**:

```python
BACKEND_TOOLS = {
    # ... existing tools
    'my_new_tool': my_new_tool,
}
```

3. **Add to database** with `tool_type='backend'`

---

## 🔀 Multi-Agent Workflows

### Multi-Agent Graph

The multi-agent graph enables complex workflows with specialized sub-agents:

```
                    ┌──────────────┐
                    │ Orchestrator │
                    │  (Router)    │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │ Web Search│    │   Code    │    │   Image   │
   │   Agent   │    │ Execution │    │Generation │
   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           ▼
                    ┌──────────────┐
                    │  Aggregator  │
                    │   (Final)    │
                    └──────────────┘
```

### Running a Graph

```python
# Via tool call
result = await run_graph(
    ctx=ctx,
    query="Generate an image of a sunset and search for facts about sunsets",
    graph_name="Sunset Research"
)

# Direct execution
from tools import run_multi_agent_graph

result = await run_multi_agent_graph(
    query="Your query here",
    orchestrator_model=model,
    shared_state=state,
    graph_name="My Graph",
    session_id=session_id,
    # ... other params
)
```

### Auxiliary Agents

Auxiliary agents are specialized agents for specific tasks. They're configured in the main agent's metadata:

```json
{
  "auxiliary_agents": {
    "image_generation": {
      "agent_id": "550e8400-e29b-41d4-a716-446655440000"
    },
    "web_search": {
      "agent_id": "550e8400-e29b-41d4-a716-446655440001"
    },
    "code_execution": {
      "agent_id": "550e8400-e29b-41d4-a716-446655440002"
    },
    "url_context": {
      "agent_id": "550e8400-e29b-41d4-a716-446655440003"
    },
    "custom": [
      {
        "key": "research_assistant",
        "agent_id": "550e8400-e29b-41d4-a716-446655440004",
        "description": "Searches and summarizes academic research papers"
      },
      {
        "key": "code_reviewer",
        "agent_id": "550e8400-e29b-41d4-a716-446655440005",
        "description": "Reviews code for bugs and best practices"
      }
    ]
  }
}
```

---

## 🔌 MCP Server Integrations

### First-Party MCP Servers

The server includes first-party MCP server implementations for enterprise integrations:

#### Databricks
- Unity Catalog management (catalogs, schemas, tables, volumes)
- SQL statement execution and query history
- ML experiment tracking and model registry
- Cluster and job management
- Notebook operations
- Vector search endpoints

#### GitHub
- Repository management
- Pull requests and code review
- Issues and comments
- Branches and commits
- File operations

#### Jira
- Project and issue management
- Sprint planning and tracking
- Comments and attachments
- Workflows and transitions
- Agile boards

#### Confluence
- Page creation and editing
- Space management
- Search and content discovery
- Labels and attachments

#### Microsoft 365
- **Outlook**: Email and calendar
- **OneDrive**: File management
- **SharePoint**: Sites and lists
- **Excel**: Workbook operations

### Credential Resolution

MCP servers use secure credential resolution:

```python
from shared.credential_resolver import resolve_credential

# Credentials are stored encrypted (AES-256-GCM) in the database
host = resolve_credential("my_databricks_host")
token = resolve_credential("my_databricks_token")

# Use credentials
client = WorkspaceClient(host=host, token=token)
```

### Loading MCP Servers

MCP servers are loaded dynamically from database configuration:

```python
from tools.mcp_loader import load_mcp_toolsets

# Database config format
server_configs = {
    "github": {
        "transport": "stdio",
        "command": "node",
        "args": ["dist/index.js"],
        "env": {"GITHUB_TOKEN": "..."}
    },
    "databricks": {
        "transport": "http",
        "url": "http://localhost:8002"
    }
}

toolsets = load_mcp_toolsets(server_configs)
```

---

## 💾 Database Schema

### Core Tables

```sql
-- AI Provider configurations
CREATE TABLE providers (
    id UUID PRIMARY KEY,
    provider_key VARCHAR(100) UNIQUE,
    provider_type VARCHAR(50),  -- google, anthropic, openai, etc.
    credentials JSONB,          -- Encrypted credentials
    organization_id TEXT,
    model_settings JSONB,
    enabled BOOLEAN DEFAULT true
);

-- AI Models
CREATE TABLE models (
    id UUID PRIMARY KEY,
    provider_id UUID REFERENCES providers(id),
    model_key VARCHAR(100) UNIQUE,
    model_name VARCHAR(255),
    model_settings_override JSONB,
    organization_id TEXT,
    enabled BOOLEAN DEFAULT true
);

-- Agent types and prompts
CREATE TABLE agents (
    id UUID PRIMARY KEY,
    agent_type VARCHAR(100) UNIQUE,
    agent_name VARCHAR(255),
    prompt_template TEXT,
    organization_id TEXT,
    metadata JSONB,  -- auxiliary_agents config
    enabled BOOLEAN DEFAULT true
);

-- Tool configurations
CREATE TABLE tools (
    id UUID PRIMARY KEY,
    tool_key VARCHAR(100) UNIQUE,
    tool_name VARCHAR(255),
    tool_type VARCHAR(50),  -- backend, builtin, mcp, frontend
    description TEXT,
    config JSONB,
    enabled BOOLEAN DEFAULT true
);

-- MCP Server configurations
CREATE TABLE mcp_servers (
    id UUID PRIMARY KEY,
    server_key VARCHAR(100) UNIQUE,
    display_name VARCHAR(255),
    transport VARCHAR(50),  -- stdio, sse, http
    command TEXT,
    args JSONB,
    env JSONB,
    url TEXT,
    enabled BOOLEAN DEFAULT true
);

-- Usage tracking
CREATE TABLE usage (
    id UUID PRIMARY KEY,
    agent_id UUID REFERENCES agents(id),
    model_id UUID REFERENCES models(id),
    session_id VARCHAR(255),
    user_id TEXT,
    organization_id TEXT,
    team_id TEXT,
    request_tokens INTEGER,
    response_tokens INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Multi-Tenancy

Resources are scoped via junction tables:

```sql
-- Team assignments for models
CREATE TABLE model_teams (
    model_id UUID REFERENCES models(id),
    team_id TEXT REFERENCES team(id),
    PRIMARY KEY (model_id, team_id)
);

-- Team assignments for agents
CREATE TABLE agent_teams (
    agent_id UUID REFERENCES agents(id),
    team_id TEXT REFERENCES team(id),
    PRIMARY KEY (agent_id, team_id)
);
```

---

## 📊 Observability

### Logfire Integration

The server integrates with Pydantic Logfire for full observability:

```python
# Automatic instrumentation
logfire.instrument_pydantic_ai()  # Agent tracing
logfire.instrument_fastapi(app)    # HTTP requests
logfire.instrument_httpx()         # HTTP client calls
```

### What's Traced

- Agent runs with full prompt/response
- Tool calls with arguments and results
- Model API calls with latency
- HTTP request/response lifecycle
- Database queries (optional)

### Usage Tracking

Every agent run tracks:

- Session ID
- User ID
- Agent type
- Model used
- Input/output tokens
- Duration
- Status (success/error)
- Error messages

Usage is:
1. Broadcast via Ably Pub/Sub in real-time
2. Persisted to PostgreSQL for analytics

---

## 🚢 Deployment

### Environment Setup

```bash
# Production settings
DEBUG=false
LOGFIRE_ENABLED=true
LOGFIRE_ENVIRONMENT=production

# Database (Neon pooling endpoint)
DB_HOST=your-project.us-east-1.aws.neon.tech
DB_DATABASE=neondb
DB_USERNAME=neondb_owner
DB_PASSWORD=***
DB_OTHER_PARAMS=sslmode=require

# Connection pool (small for Neon)
DB_POOL_MIN_SIZE=0
DB_POOL_MAX_SIZE=5

# Real-time
ABLY_API_KEY=***

# CORS
ALLOWED_ORIGINS=https://your-app.com,https://app.your-domain.com
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Health Checks

```bash
# Liveness
curl http://localhost:8001/healthz
# {"status": "ok"}

# Readiness
curl http://localhost:8001/readyz
# {"status": "ok", "db": true, "caches": true}
```

### Scaling Considerations

- **Stateless**: Agent state is passed per-request, no sticky sessions needed
- **Connection Pooling**: Small pool (5 connections) for Neon's serverless model
- **Caching**: Agent instances cached per (org, team, agent_type, model)
- **Prewarming**: First request triggers background prewarming of org context

---

## 📄 License

TBA

## 🤝 Contributing

TBA

