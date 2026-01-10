# AI Agent Platform - Executive Architecture

## System Overview

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#4f46e5', 'primaryTextColor': '#fff', 'primaryBorderColor': '#4338ca', 'lineColor': '#6366f1', 'secondaryColor': '#f0f9ff', 'tertiaryColor': '#fef3c7'}}}%%

flowchart TB
    subgraph Users["👥 USERS"]
        direction LR
        Browser["🌐 Chrome Extension"]
        Dashboard["📊 Web Dashboard"]
        API["🔌 API Clients"]
    end

    subgraph Platform["🏢 AI AGENT PLATFORM"]
        direction TB
        
        subgraph Gateway["API GATEWAY"]
            Runtime["Node.js Runtime<br/>━━━━━━━━━━━<br/>• Authentication<br/>• Authorization<br/>• Rate Limiting"]
        end
        
        subgraph Engine["AI ENGINE"]
            Pydantic["Pydantic AI Server<br/>━━━━━━━━━━━<br/>• Agent Orchestration<br/>• Multi-Agent Graphs<br/>• Tool Execution"]
        end
        
        subgraph Storage["DATA LAYER"]
            DB[("PostgreSQL<br/>━━━━━━━━━━━<br/>• Users & Orgs<br/>• Agent Config<br/>• Conversations<br/>• Usage Metrics")]
        end
    end

    subgraph AI["🤖 AI PROVIDERS"]
        direction LR
        OpenAI["OpenAI"]
        Anthropic["Anthropic"]
        Google["Google"]
        Groq["Groq"]
    end

    subgraph Services["🔧 PLATFORM SERVICES"]
        direction LR
        Ably["📡 Ably<br/>Real-time"]
        Logfire["📊 Logfire<br/>Observability"]
        OAuth["🔐 OAuth<br/>Integrations"]
    end

    subgraph Integrations["🌐 EXTERNAL INTEGRATIONS"]
        direction LR
        Email["📧 Email<br/>Gmail · Outlook"]
        Storage2["📁 Storage<br/>Drive · OneDrive"]
        Tools["🔨 Tools<br/>Search · Code"]
    end

    Users --> Gateway
    Gateway <--> Engine
    Engine <--> Storage
    Gateway <--> Storage
    
    Engine <--> AI
    Engine <--> Services
    Engine <--> Integrations
    
    Services -.-> Users
```

---

## Key Capabilities

| Capability | Description |
|:-----------|:------------|
| **🤖 Multi-Model AI** | Seamlessly switch between OpenAI, Anthropic, Google, and Groq models |
| **🏢 Multi-Tenancy** | Full organization and team isolation with RBAC |
| **⚡ Real-Time** | Live streaming responses via Ably and SSE |
| **🔧 Extensible Tools** | Built-in + custom tools via MCP protocol |
| **📊 Observability** | End-to-end tracing with Pydantic Logfire |
| **🔐 Enterprise Security** | OAuth 2.0, AES-256 encryption, audit logging |

---

## Data Flow

```mermaid
%%{init: {'theme': 'base'}}%%

sequenceDiagram
    box rgb(224, 231, 255) Client
        participant User as 👤 User
    end
    
    box rgb(254, 243, 199) Platform
        participant GW as 🔐 Gateway
        participant AI as 🤖 AI Engine
    end
    
    box rgb(220, 252, 231) External
        participant LLM as ☁️ LLM
    end

    User->>GW: Send Message
    GW->>GW: Authenticate
    GW->>AI: Route Request
    AI->>LLM: Generate Response
    
    loop Stream Response
        LLM-->>AI: Token Stream
        AI-->>GW: AG-UI Events
        GW-->>User: Live Update
    end
    
    AI->>AI: Execute Tools
    AI-->>User: Final Response
```

---

## Technology Highlights

### Performance
- **< 100ms** API response time (p50)
- **< 2s** time to first AI token
- **99.9%** uptime SLA

### Scale
- **Horizontal scaling** for both Node.js and Python servers
- **PostgreSQL** with read replicas for high availability
- **Connection pooling** for database efficiency

### Security
- **Zero trust** authentication architecture
- **AES-256-GCM** encryption for all credentials
- **SOC 2** compliant audit logging

---

## Component Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Chrome    │  │    Web      │  │   REST      │         │
│  │  Extension  │  │  Dashboard  │  │    API      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY (Node.js)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Hono/     │  │   Better    │  │   Agent     │         │
│  │  Express    │  │    Auth     │  │  Runners    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   AI ENGINE (Python/FastAPI)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Agent     │  │ Multi-Agent │  │    Tool     │         │
│  │  Factory    │  │   Graphs    │  │   Manager   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌───────────────────┐ ┌─────────────┐ ┌─────────────────────┐
│    PostgreSQL     │ │  AI Models  │ │  External Services  │
│  ┌─────────────┐  │ │ ┌─────────┐ │ │ ┌─────────────────┐ │
│  │ Users/Orgs  │  │ │ │ OpenAI  │ │ │ │      Ably       │ │
│  │ Agents/Cfg  │  │ │ │Anthropic│ │ │ │    Logfire      │ │
│  │  Threads    │  │ │ │ Google  │ │ │ │  OAuth/MCP      │ │
│  │   Usage     │  │ │ │  Groq   │ │ │ └─────────────────┘ │
│  └─────────────┘  │ │ └─────────┘ │ └─────────────────────┘
└───────────────────┘ └─────────────┘
```

---

*For technical implementation details, see the full [Architecture Documentation](./ARCHITECTURE.md)*
