# System Architecture

## Executive Overview

This document provides a high-level architectural overview of the AI Agent Platform, designed for enterprise deployment with multi-tenancy, real-time collaboration, and comprehensive observability.

---

## High-Level Architecture Diagram

```mermaid
flowchart TB
    subgraph Clients["🖥️ CLIENT LAYER"]
        CE[/"Chrome Extension<br/>(Browser)"/]
        WD[/"Web Dashboard<br/>(React)"/]
        API[/"External API<br/>Consumers"/]
    end

    subgraph Gateway["🔐 API GATEWAY & RUNTIME"]
        subgraph NodeServer["Node.js Runtime Server"]
            Hono["Hono/Express<br/>HTTP Framework"]
            Auth["Better Auth<br/>Authentication"]
            OA["OAuth 2.0<br/>Integrations"]
            
            subgraph Runners["Agent Runners"]
                PGR["PostgresAgentRunner<br/>(Production)"]
                SQLite["SqliteAgentRunner<br/>(Development)"]
            end
        end
        
        AGUI["AG-UI Protocol<br/>Event Streaming"]
    end

    subgraph AIEngine["🤖 AI ENGINE LAYER"]
        subgraph PydanticServer["Pydantic AI Server (FastAPI)"]
            AF["Agent Factory<br/>Dynamic Agent Creation"]
            MAG["Multi-Agent Graph<br/>Workflow Orchestration"]
            TM["Tool Manager<br/>Built-in & Custom Tools"]
            
            subgraph Agents["AI Agents"]
                MainAgent["Main Agent"]
                AuxAgent["Auxiliary Agents<br/>(Specialized Tasks)"]
                CustomAgent["Custom Agents<br/>(User Defined)"]
            end
        end
        
        subgraph Tools["🔧 Tool Ecosystem"]
            BT["Backend Tools<br/>(Plans, Search, Code)"]
            WT["Workspace Tools<br/>(Files, Notes)"]
            GT["Graph Tools<br/>(Multi-Agent)"]
            MCPTools["MCP Server Tools<br/>(External)"]
        end
    end

    subgraph Providers["☁️ AI MODEL PROVIDERS"]
        OpenAI["OpenAI<br/>(GPT-4, GPT-4o)"]
        Anthropic["Anthropic<br/>(Claude)"]
        Google["Google<br/>(Gemini)"]
        Groq["Groq<br/>(Fast Inference)"]
        Azure["Azure OpenAI"]
        Custom["Custom/Self-Hosted<br/>Models"]
    end

    subgraph Data["💾 DATA LAYER"]
        subgraph PostgreSQL["PostgreSQL Database"]
            UserDB[("Users &<br/>Organizations")]
            AgentDB[("Agents &<br/>Models Config")]
            ThreadDB[("Threads &<br/>Runs")]
            UsageDB[("Usage &<br/>Billing")]
            WorkspaceDB[("Workspace<br/>Resources")]
        end
        
        Encryption["🔒 AES-256-GCM<br/>Credential Encryption"]
    end

    subgraph RealTime["📡 REAL-TIME LAYER"]
        Ably["Ably Pub/Sub<br/>Real-time Messaging"]
        SSE["Server-Sent Events<br/>Live Streaming"]
    end

    subgraph Observability["📊 OBSERVABILITY"]
        Logfire["Pydantic Logfire<br/>Distributed Tracing"]
        Metrics["Usage Metrics<br/>& Analytics"]
        Audit["Audit Logs<br/>Compliance"]
    end

    subgraph External["🌐 EXTERNAL INTEGRATIONS"]
        subgraph OAuth["OAuth Providers"]
            Gmail["Gmail"]
            Outlook["Outlook"]
            Slack["Slack"]
            GDrive["Google Drive"]
            OneDrive["OneDrive"]
            Dropbox["Dropbox"]
        end
        
        subgraph APIs["External APIs"]
            WebSearch["Web Search<br/>(Tavily, Perplexity)"]
            CodeExec["Code Execution<br/>(E2B Sandbox)"]
            ImageGen["Image Generation<br/>(DALL-E, Flux)"]
        end
        
        MCP["MCP Servers<br/>(Model Context Protocol)"]
    end

    %% Client Connections
    CE --> Hono
    WD --> Hono
    API --> Hono

    %% Gateway to AI Engine
    Hono --> Auth
    Auth --> OA
    Hono --> AGUI
    AGUI --> PGR
    AGUI --> SQLite
    PGR --> PydanticServer
    SQLite --> PydanticServer

    %% AI Engine Internal
    AF --> Agents
    MAG --> Agents
    TM --> Tools
    Agents --> Tools
    MainAgent --> AuxAgent

    %% AI Providers
    Agents --> OpenAI
    Agents --> Anthropic
    Agents --> Google
    Agents --> Groq
    Agents --> Azure
    Agents --> Custom

    %% Data Layer
    PGR --> PostgreSQL
    PydanticServer --> PostgreSQL
    Auth --> UserDB
    TM --> AgentDB
    PGR --> ThreadDB
    PydanticServer --> UsageDB
    WT --> WorkspaceDB
    PostgreSQL --> Encryption

    %% Real-time
    PydanticServer --> Ably
    Ably --> CE
    Ably --> WD
    AGUI --> SSE
    SSE --> CE

    %% Observability
    PydanticServer --> Logfire
    NodeServer --> Metrics
    PydanticServer --> Audit

    %% External
    OA --> OAuth
    Tools --> APIs
    MCPTools --> MCP

    %% Styling
    classDef client fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef gateway fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef ai fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef data fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    classDef realtime fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef obs fill:#fffde7,stroke:#f9a825,stroke-width:2px
    classDef external fill:#eceff1,stroke:#546e7a,stroke-width:2px

    class CE,WD,API client
    class Hono,Auth,OA,PGR,SQLite,AGUI gateway
    class AF,MAG,TM,MainAgent,AuxAgent,CustomAgent,BT,WT,GT,MCPTools ai
    class UserDB,AgentDB,ThreadDB,UsageDB,WorkspaceDB,Encryption data
    class Ably,SSE realtime
    class Logfire,Metrics,Audit obs
    class Gmail,Outlook,Slack,GDrive,OneDrive,Dropbox,WebSearch,CodeExec,ImageGen,MCP external
```

---

## Component Overview

### 🖥️ Client Layer
| Component | Technology | Purpose |
|-----------|------------|---------|
| Chrome Extension | JavaScript/React | Primary user interface for AI interactions |
| Web Dashboard | React | Administration, configuration, and analytics |
| External API | REST/SSE | Programmatic access for integrations |

### 🔐 API Gateway & Runtime
| Component | Technology | Purpose |
|-----------|------------|---------|
| HTTP Server | Hono + Express | High-performance request handling |
| Authentication | Better Auth | User, organization, and team management |
| OAuth Handler | OAuth 2.0 | Third-party service integrations |
| PostgresAgentRunner | Node.js + pg | Production-grade agent state persistence |
| AG-UI Protocol | SSE | Real-time bidirectional event streaming |

### 🤖 AI Engine Layer
| Component | Technology | Purpose |
|-----------|------------|---------|
| Agent Factory | Pydantic AI | Dynamic agent instantiation with context |
| Multi-Agent Graph | Custom Orchestration | Complex workflow execution |
| Tool Manager | Python | Built-in and custom tool registration |
| Auxiliary Agents | Pydantic AI | Specialized sub-agents for specific tasks |

### ☁️ AI Model Providers
| Provider | Models | Use Case |
|----------|--------|----------|
| OpenAI | GPT-4, GPT-4o, o1 | General purpose, reasoning |
| Anthropic | Claude 3.5, Claude 4 | Analysis, long context |
| Google | Gemini Pro, Flash | Multimodal, fast inference |
| Groq | Llama, Mixtral | Ultra-low latency |
| Azure OpenAI | GPT-4 | Enterprise compliance |

### 💾 Data Layer
| Store | Technology | Data |
|-------|------------|------|
| Users & Organizations | PostgreSQL | Identity, memberships, permissions |
| Agents & Models | PostgreSQL | Configuration, prompts, settings |
| Threads & Runs | PostgreSQL | Conversation history, agent state |
| Usage & Billing | PostgreSQL | Token counts, costs, analytics |
| Workspace Resources | PostgreSQL | Files, notes, connections |
| Credential Encryption | AES-256-GCM | Secure token storage |

### 📡 Real-Time Layer
| Component | Technology | Purpose |
|-----------|------------|---------|
| Ably Pub/Sub | Ably Cloud | Cross-client real-time sync |
| Server-Sent Events | HTTP SSE | Agent response streaming |

### 📊 Observability
| Component | Technology | Purpose |
|-----------|------------|---------|
| Distributed Tracing | Pydantic Logfire | Request tracing, performance monitoring |
| Usage Metrics | Custom | Token usage, cost tracking |
| Audit Logs | PostgreSQL | Compliance, security events |

### 🌐 External Integrations
| Category | Services | Purpose |
|----------|----------|---------|
| Email | Gmail, Outlook | Email management tools |
| Storage | Google Drive, OneDrive, Dropbox | File access tools |
| Communication | Slack | Messaging tools |
| AI Services | Tavily, Perplexity, E2B, DALL-E | Enhanced capabilities |
| MCP Servers | Custom | Extensible tool integration |

---

## Data Flow Diagrams

### Request Processing Flow

```mermaid
sequenceDiagram
    autonumber
    participant Client as 🖥️ Chrome Extension
    participant Runtime as 🔐 Runtime Server
    participant Auth as 🔑 Better Auth
    participant Runner as ⚡ Agent Runner
    participant AI as 🤖 Pydantic AI
    participant LLM as ☁️ LLM Provider
    participant DB as 💾 PostgreSQL
    participant Ably as 📡 Ably

    Client->>Runtime: HTTP Request + Auth Token
    Runtime->>Auth: Validate Session
    Auth->>DB: Check User/Org
    Auth-->>Runtime: User Context
    
    Runtime->>Runner: Execute Agent Run
    Runner->>DB: Load/Create Thread
    Runner->>AI: Forward Request (AG-UI)
    
    AI->>LLM: Generate Response
    LLM-->>AI: Stream Tokens
    
    loop Streaming Events
        AI-->>Runner: AG-UI Events (SSE)
        Runner-->>Client: Forward Events
        Runner->>DB: Persist Events
    end
    
    AI->>Ably: Broadcast Update
    Ably-->>Client: Real-time Sync
    
    AI->>DB: Log Usage
```

### Multi-Tenant Configuration Flow

```mermaid
flowchart LR
    subgraph Request["Incoming Request"]
        Headers["X-Organization-ID<br/>X-Team-ID<br/>X-User-ID"]
    end

    subgraph Loader["Configuration Loader"]
        Cache["In-Memory Cache<br/>(TTL: 5 min)"]
        DB["PostgreSQL<br/>Configuration Tables"]
    end

    subgraph Resolution["Context Resolution"]
        OrgConfig["Organization<br/>Configuration"]
        TeamConfig["Team<br/>Overrides"]
        UserConfig["User<br/>Preferences"]
    end

    subgraph Result["Resolved Configuration"]
        Models["Available Models"]
        Agents["Available Agents"]
        Tools["Enabled Tools"]
        Prompts["System Prompts"]
    end

    Headers --> Cache
    Cache -->|Miss| DB
    DB --> Cache
    Cache --> OrgConfig
    OrgConfig --> TeamConfig
    TeamConfig --> UserConfig
    UserConfig --> Result
```

---

## Security Architecture

```mermaid
flowchart TB
    subgraph Perimeter["🛡️ SECURITY PERIMETER"]
        direction TB
        
        subgraph Auth["Authentication Layer"]
            JWT["JWT Tokens<br/>(Session Auth)"]
            APIKey["API Keys<br/>(Service Auth)"]
            OAuth["OAuth 2.0<br/>(External Auth)"]
        end
        
        subgraph Authz["Authorization Layer"]
            RBAC["Role-Based Access<br/>(Admin, Member, Guest)"]
            OrgScope["Organization Scoping"]
            TeamScope["Team Scoping"]
        end
        
        subgraph Encryption["Encryption Layer"]
            TLS["TLS 1.3<br/>(Transit)"]
            AES["AES-256-GCM<br/>(Credentials at Rest)"]
            Hash["bcrypt<br/>(Passwords)"]
        end
    end

    Client["Client Request"] --> JWT
    Client --> APIKey
    JWT --> RBAC
    APIKey --> RBAC
    OAuth --> AES
    RBAC --> OrgScope
    OrgScope --> TeamScope
    TeamScope --> Data["Protected Data"]
    AES --> Data
```

---

## Deployment Architecture

```mermaid
flowchart TB
    subgraph Production["🚀 PRODUCTION ENVIRONMENT"]
        subgraph Compute["Compute Layer"]
            Node1["Node.js Server<br/>(Instance 1)"]
            Node2["Node.js Server<br/>(Instance 2)"]
            Pydantic1["Pydantic Server<br/>(Instance 1)"]
            Pydantic2["Pydantic Server<br/>(Instance 2)"]
        end
        
        subgraph LB["Load Balancing"]
            ALB["Application<br/>Load Balancer"]
        end
        
        subgraph Data["Data Layer"]
            PG["PostgreSQL<br/>(Primary)"]
            PGReplica["PostgreSQL<br/>(Read Replica)"]
        end
        
        subgraph External["External Services"]
            AblyCloud["Ably Cloud"]
            LogfireCloud["Logfire Cloud"]
            LLMProviders["LLM Providers"]
        end
    end

    Internet["🌐 Internet"] --> ALB
    ALB --> Node1
    ALB --> Node2
    Node1 --> Pydantic1
    Node2 --> Pydantic2
    Pydantic1 --> PG
    Pydantic2 --> PG
    Node1 --> PG
    Node2 --> PG
    PG --> PGReplica
    Pydantic1 --> AblyCloud
    Pydantic2 --> AblyCloud
    Pydantic1 --> LogfireCloud
    Pydantic2 --> LogfireCloud
    Pydantic1 --> LLMProviders
    Pydantic2 --> LLMProviders
```

---

## Key Metrics & SLAs

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Latency (p50) | < 100ms | Response time excluding LLM |
| API Latency (p99) | < 500ms | Response time excluding LLM |
| First Token Latency | < 2s | Time to first streamed token |
| System Uptime | 99.9% | Monthly availability |
| Data Durability | 99.999% | PostgreSQL replication |
| Event Delivery | 99.99% | Ably SLA |

---

## Technology Stack Summary

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Chrome Extension (JavaScript/React), Web Dashboard (React) |
| **API Gateway** | Node.js, Hono, Express |
| **AI Engine** | Python, FastAPI, Pydantic AI |
| **Database** | PostgreSQL 15+, SQLite (dev) |
| **Authentication** | Better Auth, OAuth 2.0, JWT |
| **Real-time** | Ably, Server-Sent Events |
| **Observability** | Pydantic Logfire, Custom Metrics |
| **AI Providers** | OpenAI, Anthropic, Google, Groq, Azure |
| **Security** | TLS 1.3, AES-256-GCM, bcrypt |

---

*Document generated for executive presentation. For technical implementation details, see component-specific documentation.*
