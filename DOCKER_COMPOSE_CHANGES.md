# Docker Compose Changes - SaaS Database & Redis

**Date:** January 20, 2026  
**Change Type:** Configuration Update  
**Impact:** Production-ready deployment with managed services

---

## Summary of Changes

Updated Docker Compose configuration to use **managed SaaS services** for PostgreSQL and Redis instead of containerized instances. This aligns with production best practices and provides better reliability, scalability, and automated management.

---

## What Changed

### 1. ✅ Removed PostgreSQL Container from Base Configuration

**File:** `docker-compose.yml`

**Before:**
```yaml
services:
  postgres:
    image: postgres:15-alpine
    # ... PostgreSQL configuration
```

**After:**
```yaml
# PostgreSQL is now an external managed service (Neon, AWS RDS, etc.)
# Configured via environment variables only
```

**Impact:**
- Production deployments must use managed PostgreSQL (Neon, AWS RDS, Google Cloud SQL, etc.)
- No local PostgreSQL container in production
- Connection details specified via environment variables

---

### 2. ✅ Removed Redis Container from Base Configuration

**File:** `docker-compose.yml`

**Before:**
```yaml
services:
  redis:
    image: redis:7-alpine
    # ... Redis configuration
```

**After:**
```yaml
# Redis is now an external managed service (Redis Cloud, AWS ElastiCache, etc.)
# Configured via environment variables only
```

**Impact:**
- Production deployments must use managed Redis (Redis Cloud, AWS ElastiCache, etc.)
- No local Redis container in production
- Connection details specified via environment variables

---

### 3. ✅ Updated Environment Variables

**File:** `docker-compose.yml`

**Before:**
```yaml
environment:
  DB_HOST: postgres          # Local container
  DB_PORT: 5432
  REDIS_HOST: redis          # Local container
  REDIS_PORT: 6379
  REDIS_SSL: false
```

**After:**
```yaml
environment:
  # Database (Managed SaaS)
  DB_HOST: ${DB_HOST:?DB_HOST is required}
  DB_PORT: ${DB_PORT:-5432}
  DB_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD is required}
  DB_OTHER_PARAMS: ${DB_OTHER_PARAMS:-sslmode=require}
  
  # Redis (Managed SaaS)
  REDIS_HOST: ${REDIS_HOST:?REDIS_HOST is required}
  REDIS_PORT: ${REDIS_PORT:-6379}
  REDIS_PASSWORD: ${REDIS_PASSWORD:?REDIS_PASSWORD is required}
  REDIS_SSL: ${REDIS_SSL:-true}
```

**Changes:**
- ✅ Required environment variables for external service connection
- ✅ SSL enabled by default for both PostgreSQL and Redis
- ✅ Secure defaults (`sslmode=require`, `REDIS_SSL=true`)

---

### 4. ✅ Removed Service Dependencies

**File:** `docker-compose.yml`

**Before:**
```yaml
copilotkit-pydantic:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
```

**After:**
```yaml
copilotkit-pydantic:
  # No depends_on for external services
  # Services connect to managed PostgreSQL and Redis
```

**Impact:**
- Services start immediately without waiting for local DB/Redis
- Connection pooling handles reconnection to external services
- Health checks verify external service connectivity

---

### 5. ✅ Added Development Override

**File:** `docker-compose.dev.yml`

**Added local PostgreSQL and Redis containers for development:**

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: copilotkit-postgres-dev
    ports:
      - "5432:5432"
    # ... development configuration
    
  redis:
    image: redis:7-alpine
    container_name: copilotkit-redis-dev
    ports:
      - "6379:6379"
    # ... development configuration
```

**Impact:**
- Development mode includes local database containers
- No need for managed services during local development
- Simple setup with `docker-compose -f docker-compose.yml -f docker-compose.dev.yml up`

---

### 6. ✅ Simplified Production Override

**File:** `docker-compose.prod.yml`

**Before:**
```yaml
services:
  postgres:
    deploy:
      resources:
        limits: ...
  redis:
    deploy:
      resources:
        limits: ...
```

**After:**
```yaml
# No postgres or redis configuration
# Only application service overrides (replicas, resources, etc.)
```

**Impact:**
- Cleaner production configuration
- Focus on application services only
- Managed services configured separately

---

### 7. ✅ Created Environment Template

**File:** `env.docker.example` (NEW)

Comprehensive environment variable template for Docker Compose:

```bash
# Security
ENCRYPTION_MASTER_SECRET=
JWT_SECRET=

# Database (Managed SaaS)
DB_HOST=
DB_DATABASE=
DB_USERNAME=
DB_PASSWORD=
DB_OTHER_PARAMS=sslmode=require

# Redis (Managed SaaS)
REDIS_HOST=
REDIS_PASSWORD=
REDIS_SSL=true
```

---

## Deployment Commands

### Production (Managed Services)

```bash
# 1. Configure environment
cp env.docker.example .env
vim .env  # Fill in managed service details

# 2. Deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 3. Verify
curl http://localhost:8001/healthz
curl http://localhost:8001/readyz
```

### Development (Local Containers)

```bash
# 1. Start with local PostgreSQL and Redis
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 2. Verify
curl http://localhost:8001/healthz
```

---

## Required Managed Services

### PostgreSQL

**Recommended Providers:**
- **Neon** - Serverless PostgreSQL (recommended for ease of use)
- **AWS RDS** - Enterprise-grade PostgreSQL
- **Google Cloud SQL** - GCP-native PostgreSQL
- **Azure Database** - Azure-native PostgreSQL

**Setup:**
1. Create database instance
2. Note connection details (host, port, database, username, password)
3. Configure SSL/TLS
4. Add to `.env` file

### Redis

**Recommended Providers:**
- **Redis Cloud** - Managed Redis (recommended for ease of use)
- **AWS ElastiCache** - Enterprise-grade Redis
- **Google Memorystore** - GCP-native Redis
- **Azure Cache** - Azure-native Redis

**Setup:**
1. Create Redis instance
2. Note connection details (host, port, password)
3. Enable SSL/TLS
4. Add to `.env` file

---

## Benefits of Managed Services

### PostgreSQL
- ✅ Automated backups (daily, point-in-time recovery)
- ✅ High availability (multi-AZ, automatic failover)
- ✅ Automatic scaling (compute and storage)
- ✅ SSL/TLS encryption
- ✅ Monitoring and alerting
- ✅ Security patches applied automatically
- ✅ Read replicas for scaling reads

### Redis
- ✅ High availability (automatic failover)
- ✅ Persistence (RDB + AOF)
- ✅ SSL/TLS encryption
- ✅ Automatic backups
- ✅ Monitoring and alerting
- ✅ Cluster mode for scaling
- ✅ Multi-AZ deployment

---

## Migration Guide

### From Local to Managed PostgreSQL

```bash
# 1. Backup local data
docker-compose exec postgres pg_dump -U copilotkit copilotkit > backup.sql

# 2. Create managed PostgreSQL instance
# (Follow provider's setup guide)

# 3. Restore data
psql "postgresql://<user>:<pass>@<managed-host>:5432/<db>?sslmode=require" < backup.sql

# 4. Update .env with managed service details
DB_HOST=<managed-host>
DB_PASSWORD=<managed-password>
DB_OTHER_PARAMS=sslmode=require

# 5. Restart services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### From Local to Managed Redis

```bash
# 1. No data migration needed (Redis used for caching/sessions)
# Cache will repopulate automatically

# 2. Create managed Redis instance
# (Follow provider's setup guide)

# 3. Update .env with managed service details
REDIS_HOST=<managed-host>
REDIS_PASSWORD=<managed-password>
REDIS_SSL=true

# 4. Restart services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Cost Comparison

### Local Containers (Development Only)
- **Cost:** Free
- **Reliability:** Low (data lost on container restart)
- **Scalability:** None
- **Management:** Manual

### Managed Services (Production)
- **Cost:** ~$20-50/month (small instance)
- **Reliability:** High (99.95%+ uptime)
- **Scalability:** Automatic
- **Management:** Automated (backups, patches, monitoring)

**Recommendation:** Use local containers for development, managed services for staging and production.

---

## Troubleshooting

### Cannot connect to managed PostgreSQL

```bash
# Check environment variables
echo $DB_HOST
echo $DB_PORT

# Test connection
psql "postgresql://$DB_USERNAME:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_DATABASE?sslmode=require"

# Common issues:
# 1. Firewall rules - Allow inbound from application servers
# 2. SSL mode - Ensure sslmode=require is set
# 3. Credentials - Verify username and password
# 4. DNS - Ensure hostname resolves correctly
```

### Cannot connect to managed Redis

```bash
# Test connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD --tls

# Common issues:
# 1. Firewall rules - Allow inbound from application servers
# 2. SSL - Ensure REDIS_SSL=true is set
# 3. Password - Verify Redis password
# 4. Port - Default is 6379, verify with provider
```

### Services start but health checks fail

```bash
# Check health check endpoint
curl http://localhost:8001/readyz

# Look for:
{
  "status": "degraded",
  "db": false,      # Database not connected
  "redis": false,   # Redis not connected
  "caches": true
}

# Fix:
# 1. Verify environment variables are correct
# 2. Check service logs: docker-compose logs copilotkit-pydantic
# 3. Ensure managed services are running
# 4. Check firewall rules
```

---

## Rollback Plan

If managed services cause issues, you can temporarily roll back to local containers:

```bash
# 1. Stop production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

# 2. Start with development configuration (includes local DB/Redis)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 3. Verify services are working
curl http://localhost:8001/healthz
```

**Note:** This is for emergency use only. Production should always use managed services.

---

## Documentation Updates

Updated the following files to reflect managed service usage:
- ✅ `docker-compose.yml` - Base configuration
- ✅ `docker-compose.prod.yml` - Production overrides
- ✅ `docker-compose.dev.yml` - Development overrides (with local DB/Redis)
- ✅ `env.docker.example` - Environment template
- ✅ `QUICK_START.md` - Updated deployment steps
- ✅ `DEPLOYMENT.md` - New architecture overview

---

## Conclusion

The Docker Compose configuration has been updated to use **managed SaaS services** for PostgreSQL and Redis in production, while maintaining local container support for development. This provides:

- ✅ Better reliability (99.95%+ uptime)
- ✅ Automated backups and disaster recovery
- ✅ Automatic scaling
- ✅ Built-in monitoring and alerting
- ✅ Security patches applied automatically
- ✅ Easier compliance (SOC 2, HIPAA, etc.)

**Production deployments now require managed PostgreSQL and Redis services.**

---

**Questions?** Review `DEPLOYMENT.md` for detailed setup instructions.
