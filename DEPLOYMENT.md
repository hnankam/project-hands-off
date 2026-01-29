# CopilotKit Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     External Services                        │
│  ┌──────────────────┐           ┌──────────────────┐       │
│  │   PostgreSQL     │           │      Redis       │       │
│  │   (Managed)      │           │   (Managed)      │       │
│  │                  │           │                  │       │
│  │ Neon / RDS /     │           │ Redis Cloud /    │       │
│  │ Cloud SQL        │           │ ElastiCache      │       │
│  └──────────────────┘           └──────────────────┘       │
└─────────────────────────────────────────────────────────────┘
           │                                 │
           │                                 │
           ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                  Docker Compose Services                     │
│                                                              │
│  ┌───────────────────────────────────────────────────┐     │
│  │         copilotkit-pydantic (Python)              │     │
│  │  ┌─────────────────────────────────────────┐     │     │
│  │  │  FastAPI + Pydantic AI Agents           │     │     │
│  │  │  - Multi-agent orchestration            │     │     │
│  │  │  - Rate limiting (SlowAPI + Redis)      │     │     │
│  │  │  - Health checks (/healthz, /readyz)    │     │     │
│  │  │  - MCP server integration               │     │     │
│  │  │  Port: 8001                             │     │     │
│  │  └─────────────────────────────────────────┘     │     │
│  └───────────────────────────────────────────────────┘     │
│                         │                                    │
│                         ▼                                    │
│  ┌───────────────────────────────────────────────────┐     │
│  │      copilot-runtime-server (Node.js)             │     │
│  │  ┌─────────────────────────────────────────┐     │     │
│  │  │  Express + Hono Runtime                 │     │     │
│  │  │  - OAuth handling                       │     │     │
│  │  │  - Credential management                │     │     │
│  │  │  - Authentication                       │     │     │
│  │  │  Port: 3001                             │     │     │
│  │  └─────────────────────────────────────────┘     │     │
│  └───────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- ✅ Docker 20.10+ and Docker Compose 2.0+
- ✅ Managed PostgreSQL (Neon, AWS RDS, Google Cloud SQL)
- ✅ Managed Redis (Redis Cloud, AWS ElastiCache, Google Memorystore)

### 1. Configure Environment

```bash
# Copy environment template
cp env.docker.example .env

# Generate secrets
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'

# Edit .env with your managed service credentials
vim .env
```

### 2. Deploy

**Production (with managed PostgreSQL/Redis):**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Development (with local PostgreSQL/Redis containers):**
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### 3. Verify

```bash
# Check health
curl http://localhost:8001/healthz
curl http://localhost:3001/health

# View logs
docker-compose logs -f
```

---

## File Structure

```
project-hands-off/
├── docker-compose.yml           # Base services (Python, Node.js)
├── docker-compose.prod.yml      # Production overrides
├── docker-compose.dev.yml       # Development overrides (with local DB/Redis)
├── env.docker.example           # Environment variables template
│
├── copilotkit-pydantic/         # Python FastAPI Service
│   ├── Dockerfile               # Multi-stage Docker build
│   ├── main.py                  # FastAPI application
│   ├── requirements.txt         # Python dependencies
│   ├── env.example              # Service-specific env template
│   ├── config/                  # Configuration
│   │   ├── environment.py       # Environment validation
│   │   └── models.py            # Pydantic models
│   ├── middleware/              # Middleware
│   │   └── rate_limit.py        # Rate limiting (NEW)
│   ├── api/                     # API routes
│   ├── database/                # Database connections
│   │   ├── connection.py        # PostgreSQL connection pool
│   │   └── redis_connection.py  # Redis connection pool
│   └── first-party-mcp-servers/ # MCP server integrations
│       ├── databricks/          # Databricks MCP (200+ tools)
│       ├── github/              # GitHub MCP (62 tools)
│       ├── jira/                # Jira MCP (50+ tools)
│       ├── confluence/          # Confluence MCP (27 tools)
│       ├── microsoft365/        # Microsoft 365 MCP
│       └── shared/              # Shared utilities
│           └── credential_resolver.py  # Credential resolution (OPTIMIZED)
│
├── copilot-runtime-server/      # Node.js Express + Hono Service
│   ├── Dockerfile               # Multi-stage Docker build
│   ├── server.js                # Express application
│   ├── package.json             # Node dependencies
│   ├── config/                  # Configuration
│   ├── middleware/              # Middleware (auth, error handling)
│   ├── routes/                  # API routes
│   └── utils/                   # Utilities (encryption, OAuth)
│
└── Documentation/
    ├── PRODUCTION_READINESS_REVIEW.md   # Detailed production analysis
    ├── OPTIMIZATION_SUMMARY.md          # Optimization details
    ├── QUICK_START.md                   # 30-minute deployment guide
    └── DEPLOYMENT.md                    # This file
```

---

## Configuration Files

### docker-compose.yml (Base)
- Defines application services only
- Expects external PostgreSQL and Redis
- Suitable for production deployment

### docker-compose.prod.yml (Production)
- Resource limits (CPU, memory)
- Multiple replicas (3x for each service)
- JSON logging
- Rolling updates with rollback
- Nginx reverse proxy (optional)

### docker-compose.dev.yml (Development)
- **Includes local PostgreSQL and Redis containers**
- Hot reload for both services
- Debug logging
- Source code mounted as volumes
- Simple passwords

---

## Environment Variables

### Required for Production

```bash
# Security
ENCRYPTION_MASTER_SECRET=<strong-secret>
JWT_SECRET=<strong-secret>

# Database (Managed Service)
DB_HOST=<managed-postgres-host>
DB_DATABASE=<database-name>
DB_USERNAME=<username>
DB_PASSWORD=<password>

# Redis (Managed Service)
REDIS_HOST=<managed-redis-host>
REDIS_PASSWORD=<password>
REDIS_SSL=true
```

See `env.docker.example` for complete list.

---

## Deployment Strategies

### Development
- Uses `docker-compose.dev.yml`
- Includes local PostgreSQL and Redis containers
- Hot reload enabled
- Simple setup for local development

### Staging
- Uses `docker-compose.yml` + `docker-compose.prod.yml`
- Connects to staging managed PostgreSQL and Redis
- Single replica per service
- Production-like configuration

### Production
- Uses `docker-compose.yml` + `docker-compose.prod.yml`
- Connects to production managed PostgreSQL and Redis
- Multiple replicas (3x) for high availability
- Resource limits and health checks
- Monitoring and observability

---

## Managed Service Recommendations

### PostgreSQL

| Provider | Best For | Key Features |
|----------|----------|--------------|
| **Neon** | Serverless, cost-effective | Auto-scaling, branching, generous free tier |
| **AWS RDS** | AWS ecosystem | High availability, read replicas, automated backups |
| **Google Cloud SQL** | GCP ecosystem | Automatic replication, point-in-time recovery |
| **Azure Database** | Azure ecosystem | Built-in security, automatic backups |

### Redis

| Provider | Best For | Key Features |
|----------|----------|--------------|
| **Redis Cloud** | Ease of use | High availability, automatic failover, free tier |
| **AWS ElastiCache** | AWS ecosystem | Multi-AZ, automatic failover, Redis 7 support |
| **Google Memorystore** | GCP ecosystem | High availability, automatic failover |
| **Azure Cache** | Azure ecosystem | Built-in monitoring, automatic updates |

---

## Scaling

### Horizontal Scaling

```bash
# Scale Python service to 5 instances
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale copilotkit-pydantic=5

# Scale Node.js service to 3 instances
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale copilot-runtime-server=3
```

**Requirements for horizontal scaling:**
- ✅ Redis must be enabled (for distributed rate limiting and state)
- ✅ PostgreSQL connection pooling configured
- ✅ Load balancer in front of services

### Kubernetes Deployment

For larger deployments, consider migrating to Kubernetes:
- Use Helm charts
- Configure Horizontal Pod Autoscaler (HPA)
- Use Ingress for load balancing
- Implement service mesh (Istio) for advanced traffic management

---

## Monitoring

### Health Endpoints

```bash
# Python service
curl http://localhost:8001/healthz   # Liveness check
curl http://localhost:8001/readyz    # Readiness check (DB, Redis, caches)

# Node.js service
curl http://localhost:3001/health
```

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f copilotkit-pydantic
docker-compose logs -f copilot-runtime-server

# JSON logs (production)
docker-compose logs copilotkit-pydantic | jq
```

### Metrics

Configure Logfire for observability:
```bash
LOGFIRE_ENABLED=true
LOGFIRE_TOKEN=<your-token>
```

---

## Security Checklist

- [ ] ✅ `ENCRYPTION_MASTER_SECRET` uses strong random value
- [ ] ✅ `JWT_SECRET` uses strong random value
- [ ] ✅ `DEBUG=false` in production
- [ ] ✅ Database uses SSL (`sslmode=require`)
- [ ] ✅ Redis uses SSL (`REDIS_SSL=true`)
- [ ] ✅ Rate limiting enabled
- [ ] ✅ CORS configured with specific origins (no wildcards)
- [ ] ✅ All secrets stored securely (not in git)
- [ ] ✅ Firewall rules limit access to managed services
- [ ] ✅ Regular security updates applied

---

## Troubleshooting

### Service won't connect to managed database

```bash
# Check connection string
echo $DB_HOST
echo $DB_PORT

# Test connection
psql "postgresql://$DB_USERNAME:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_DATABASE?sslmode=require"

# Common issues:
# - Firewall rules blocking connection
# - sslmode not set correctly
# - Wrong credentials
```

### Service won't connect to managed Redis

```bash
# Check connection string
echo $REDIS_HOST
echo $REDIS_PORT

# Test connection (with SSL)
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD --tls

# Common issues:
# - REDIS_SSL not set to true
# - Firewall rules blocking connection
# - Wrong password
```

### Rate limiting not working

```bash
# Ensure Redis is connected
docker-compose logs copilotkit-pydantic | grep -i redis

# Should see: "✅ Rate limiting using Redis backend"
# If not: Check REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
```

---

## Support

- 📚 **Production Readiness Review:** `PRODUCTION_READINESS_REVIEW.md`
- 🚀 **Quick Start Guide:** `QUICK_START.md`
- 📝 **Optimization Details:** `OPTIMIZATION_SUMMARY.md`
- 🐛 **Issues:** Check service logs and health endpoints

---

**Production Ready: ✅**  
**Security Score: 9/10**  
**Scalability: Horizontal scaling supported**  
**Managed Services: PostgreSQL + Redis (required)**
