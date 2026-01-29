# First-Party MCP Servers

**Model Context Protocol (MCP) servers for external service integrations**

---

## Overview

This directory contains first-party MCP servers that enable AI agents to interact with external services like GitHub, Jira, Confluence, Databricks, and Microsoft 365. Each server implements the FastMCP protocol and can be deployed as an independent Docker container.

### Available Servers

| Server | Description | Tools | Port |
|--------|-------------|-------|------|
| **[GitHub](github/)** | GitHub repository operations | 62 tools (repos, branches, commits, PRs, issues, files) | 8101 |
| **[Jira](jira/)** | Jira project and issue management | 28 tools (issues, projects, agile boards) | 8102 |
| **[Confluence](confluence/)** | Confluence wiki and documentation | 15 tools (pages, spaces, search, attachments) | 8103 |
| **[Databricks](databricks/)** | Databricks data platform operations | 45+ tools (clusters, jobs, notebooks, SQL, Unity Catalog) | 8104 |
| **[Microsoft 365](microsoft365/)** | Microsoft 365 services | 14 tools (Excel, OneDrive, Outlook, SharePoint) | 8105 |

### Shared Module

**[shared/](shared/)** - Common credential resolution and database access
- `credential_resolver.py` - Fetches and decrypts credentials from PostgreSQL
- Supports AES-256-GCM encryption
- Exponential backoff for database operations
- Health check capabilities

---

## Quick Start

### Prerequisites

- Docker Desktop installed and running
- PostgreSQL database (managed SaaS recommended)
- `workspace_credentials` table with encrypted credentials
- Environment variables configured

### Deploy All Servers

```bash
# 1. Configure environment
cp env.example .env
vim .env  # Add your database credentials and encryption secret

# 2. Build and start all servers
./build-all-mcp.sh

# 3. Verify all running
docker ps --filter "name=-mcp"
```

**Expected Output:**
```
NAMES             STATUS              PORTS
github-mcp        Up (healthy)        0.0.0.0:8101->8101/tcp
jira-mcp          Up (healthy)        0.0.0.0:8102->8102/tcp
confluence-mcp    Up (healthy)        0.0.0.0:8103->8103/tcp
databricks-mcp    Up (healthy)        0.0.0.0:8104->8104/tcp
microsoft365-mcp  Up (healthy)        0.0.0.0:8105->8105/tcp
```

---

## Architecture

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Agent (Frontend)                       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                ┌───────────┴──────────┐
                │  Credential Key      │
                │  "my_github_token"   │
                └───────────┬──────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
│  GitHub MCP     │ │  Jira MCP    │ │ Confluence MCP  │
│  Port: 8101     │ │  Port: 8102  │ │  Port: 8103     │
└────────┬────────┘ └──────┬───────┘ └────────┬────────┘
         │                 │                   │
         └─────────────────┼───────────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │ Shared Module  │
                  │ Credential     │
                  │ Resolver       │
                  └────────┬───────┘
                           │
                           ▼
                  ┌────────────────┐
                  │  PostgreSQL    │
                  │  workspace_    │
                  │  credentials   │
                  └────────┬───────┘
                           │
                           ▼
                  ┌────────────────┐
                  │  Decrypt with  │
                  │  Master Secret │
                  └────────┬───────┘
                           │
                           ▼
                  ┌────────────────┐
                  │  External API  │
                  │  (GitHub, etc) │
                  └────────────────┘
```

### Security Model

1. **Credential Keys**: Agent only knows credential key (e.g., "my_github_token")
2. **Server-Side Resolution**: MCP server fetches encrypted credential from database
3. **Decryption**: Uses `ENCRYPTION_MASTER_SECRET` to decrypt server-side
4. **API Call**: Uses decrypted credential to call external API
5. **No Exposure**: Actual credential value never exposed to agent

---

## Deployment Options

### Option 1: Docker Compose (Recommended)

```bash
# Start all servers
docker-compose up -d

# Stop all servers
docker-compose down

# View logs
docker-compose logs -f

# Restart
docker-compose restart
```

### Option 2: Build Script

```bash
# Development mode
./build-all-mcp.sh

# Production mode
./build-all-mcp.sh production
```

### Option 3: Individual Containers

```bash
# Build specific server
docker build -t github-mcp:dev --target development -f github/Dockerfile .

# Run specific server
docker run -d --name github-mcp -p 8101:8101 --env-file .env github-mcp:dev
```

---

## Configuration

### Environment Variables

**Required:**
```bash
# Database (PostgreSQL)
DB_HOST=your-postgres-host
DB_PORT=5432
DB_DATABASE=your-database
DB_USERNAME=your-user
DB_PASSWORD=your-password
DB_OTHER_PARAMS=sslmode=require

# Security
ENCRYPTION_MASTER_SECRET=your-encryption-secret
```

**Optional:**
```bash
# Observability
LOGFIRE_ENABLED=false
LOGFIRE_TOKEN=your-logfire-token
LOGFIRE_SERVICE_NAME=mcp-servers
LOGFIRE_ENVIRONMENT=development
```

### Port Allocation

Ports are pre-allocated and configured in individual Dockerfiles and docker-compose.yml:

- **8101**: GitHub MCP
- **8102**: Jira MCP
- **8103**: Confluence MCP
- **8104**: Databricks MCP
- **8105**: Microsoft 365 MCP

---

## Directory Structure

```
first-party-mcp-servers/
├── shared/                        # Shared credential resolver
│   ├── __init__.py
│   └── credential_resolver.py     # Database and encryption logic
│
├── github/                        # GitHub MCP Server
│   ├── Dockerfile                 # Container configuration
│   ├── server.py                  # FastMCP server entry point
│   ├── requirements.txt           # Python dependencies
│   ├── models.py                  # Data models
│   ├── cache.py                   # Caching logic
│   └── tools/                     # Tool implementations
│       ├── repositories/
│       ├── branches/
│       ├── commits/
│       ├── pull_requests/
│       ├── issues/
│       └── files/
│
├── jira/                          # Jira MCP Server
│   ├── Dockerfile
│   ├── server.py
│   ├── requirements.txt
│   └── tools/
│       ├── issues/
│       ├── projects/
│       └── agile/
│
├── confluence/                    # Confluence MCP Server
│   ├── Dockerfile
│   ├── server.py
│   ├── requirements.txt
│   └── tools/
│       ├── pages/
│       ├── spaces/
│       └── search/
│
├── databricks/                    # Databricks MCP Server
│   ├── Dockerfile
│   ├── server.py
│   ├── requirements.txt
│   └── tools/
│       ├── compute/
│       ├── notebooks/
│       ├── sql/
│       └── unity_catalog/
│
├── microsoft365/                  # Microsoft 365 MCP Server
│   ├── Dockerfile
│   ├── server.py
│   ├── requirements.txt
│   └── tools/
│       ├── excel/
│       ├── onedrive/
│       ├── outlook/
│       └── sharepoint/
│
├── docker-compose.yml             # Orchestration config
├── Dockerfile.template            # Template for new servers
├── env.example                    # Environment template
├── build-all-mcp.sh              # Build script
├── MCP_SERVERS_DOCKER.md         # Detailed documentation
├── QUICK_REFERENCE.md            # Quick commands
└── README.md                     # This file
```

---

## Tool Count

| Server | Total Tools | Categories |
|--------|-------------|------------|
| **GitHub** | 62 | Repository (15), Branches (9), Commits (8), PRs (12), Issues (12), Files (6) |
| **Jira** | 28 | Issues (10+), Projects (3+), Agile (3+), Custom fields |
| **Confluence** | 15 | Pages (5+), Spaces (3+), Search (2+), Attachments (2+) |
| **Databricks** | 45+ | Clusters, Jobs, Notebooks, SQL, Unity Catalog, ML, Pipelines |
| **Microsoft 365** | 14 | Excel (3), OneDrive (4), Outlook (3), SharePoint (4) |

**Total: 164+ tools across 5 MCP servers**

---

## Development

### Adding a New MCP Server

1. **Create directory**: `mkdir newserver`
2. **Copy template**: `cp Dockerfile.template newserver/Dockerfile`
3. **Update Dockerfile**: Change `newserver` and port (e.g., 8106)
4. **Create server.py**: Implement FastMCP server
5. **Add requirements.txt**: List dependencies
6. **Update docker-compose.yml**: Add service definition
7. **Update build script**: Add to `MCP_SERVERS` array

### Testing Individual Server

```bash
# Build
docker build -t github-mcp:dev --target development -f github/Dockerfile .

# Run
docker run -d --name github-mcp-test -p 8101:8101 --env-file .env github-mcp:dev

# Test
docker logs -f github-mcp-test

# Stop and remove
docker stop github-mcp-test && docker rm github-mcp-test
```

---

## Monitoring

### Container Status

```bash
# List all MCP containers
docker ps --filter "name=-mcp"

# View logs
docker logs -f github-mcp
docker-compose logs -f

# Resource usage
docker stats
```

### Health Checks

Each container has a basic Python health check configured in the Dockerfile:

```bash
# Manual check
docker exec github-mcp python -c "import sys; sys.exit(0)"
```

---

## Troubleshooting

### Common Issues

**Container won't start:**
```bash
# Check logs
docker logs github-mcp

# Verify environment
docker exec github-mcp env | grep DB_

# Check port conflicts
lsof -i :8101
```

**Credential resolution fails:**
```bash
# Test database connection
docker exec github-mcp python -c "import psycopg; print('OK')"

# Verify credential exists
psql -h <host> -U <user> -d <db> -c "SELECT key FROM workspace_credentials WHERE key='my_github_token';"

# Check encryption secret
docker exec github-mcp env | grep ENCRYPTION_MASTER_SECRET
```

**Network issues:**
```bash
# Test connectivity
docker network inspect mcp-network

# Restart networking
docker-compose down && docker-compose up -d
```

---

## Production Deployment

### Checklist

- [ ] Use managed PostgreSQL (AWS RDS, Google Cloud SQL, Azure Database)
- [ ] Set strong `ENCRYPTION_MASTER_SECRET` (32+ random characters)
- [ ] Enable SSL for database connections (`DB_OTHER_PARAMS=sslmode=require`)
- [ ] Set up log aggregation (CloudWatch, Stackdriver, Azure Monitor)
- [ ] Configure health check alerts
- [ ] Use secrets manager for environment variables
- [ ] Set up automated backups
- [ ] Configure firewall rules for MCP ports
- [ ] Enable Logfire monitoring
- [ ] Test credential resolution end-to-end
- [ ] Perform load testing
- [ ] Document runbooks

### Cloud Deployment

**AWS:**
- ECS/Fargate task definitions
- Secrets Manager for environment variables
- Application Load Balancer
- CloudWatch logs

**Google Cloud:**
- Cloud Run services
- Secret Manager
- Cloud SQL
- Cloud Logging

**Azure:**
- Container Instances
- Key Vault
- Azure Database for PostgreSQL
- Azure Monitor

**Kubernetes:**
- Deployments per server
- ConfigMaps and Secrets
- Services and Ingress
- Persistent volume for logs (optional)

---

## Documentation

- **[MCP_SERVERS_DOCKER.md](MCP_SERVERS_DOCKER.md)** - Complete deployment guide
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Quick command reference
- **[env.example](env.example)** - Environment configuration template

### Individual Server READMEs

- [GitHub MCP Server](github/README.md)
- [Jira MCP Server](jira/README.md)
- [Confluence MCP Server](confluence/README.md)
- [Databricks MCP Server](databricks/README.md)
- [Microsoft 365 MCP Server](microsoft365/README.md)

---

## Contributing

### Adding New Tools

1. Create tool function in appropriate `tools/<category>/<tool>.py`
2. Import and register in `server.py`
3. Update tool count in this README
4. Test with credentials from database
5. Document in server's README

### Testing

```bash
# Run server locally
cd github
python server.py

# Test with MCP client
# (Implementation specific to your setup)
```

---

## License

Part of Project Hands-Off. See main LICENSE file.

---

## Support

- **Issues**: Check container logs first
- **Documentation**: [MCP_SERVERS_DOCKER.md](MCP_SERVERS_DOCKER.md)
- **Questions**: Review troubleshooting section

---

**🚀 Ready to deploy MCP servers as Docker containers!**

**Get started:** `./build-all-mcp.sh`

---

**Last Updated:** January 21, 2026
