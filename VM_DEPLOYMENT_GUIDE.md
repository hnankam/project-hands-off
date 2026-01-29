# 🚀 VM Deployment Guide - Pydantic Server

Complete guide for deploying the CopilotKit Pydantic server on a custom VM with Docker.

---

## 📋 Prerequisites

✅ VM with Docker installed  
✅ PostgreSQL database (local or managed like Neon)  
✅ Docker image pushed to Docker Hub  
✅ Ports 8001 and 5432 available  
✅ (Optional) Redis for caching

---

## 🏗️ Quick Start

### 1️⃣ Pull the Docker Image

```bash
# Replace with your Docker Hub username and image name
docker pull YOUR_DOCKERHUB_USERNAME/copilotkit-pydantic:latest
```

### 2️⃣ Set Up PostgreSQL Database

**Option A: Use managed PostgreSQL (Neon, AWS RDS, etc.)**
```bash
# Just get the connection URL from your provider
DATABASE_URL="postgresql://user:password@host:port/database"
```

**Option B: Run PostgreSQL in Docker**
```bash
# Create a Docker network
docker network create copilotkit-network

# Run PostgreSQL
docker run -d \
  --name postgres \
  --network copilotkit-network \
  -e POSTGRES_USER=copilotkit \
  -e POSTGRES_PASSWORD=your_secure_password \
  -e POSTGRES_DB=copilotkit \
  -v postgres-data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine

# Database URL will be:
DATABASE_URL="postgresql://copilotkit:your_secure_password@postgres:5432/copilotkit"
```

### 3️⃣ Create Environment File

Create `.env` file with your configuration:

```bash
# Create the env file
cat > /opt/copilotkit/.env << 'EOF'
# =============================================================================
# Pydantic Server Configuration
# =============================================================================

# Server
HOST=0.0.0.0
PORT=8001
PYTHON_ENV=production
DEBUG=false
LOG_FORMAT=json

# CORS (Update with your actual domains)
ALLOWED_ORIGINS=https://your-domain.com,chrome-extension://*

# Security - CRITICAL: Generate a secure secret!
ENCRYPTION_MASTER_SECRET=REPLACE_WITH_SECURE_SECRET

# Database
DATABASE_URL=postgresql://copilotkit:your_password@postgres:5432/copilotkit
DB_POOL_MIN_SIZE=5
DB_POOL_MAX_SIZE=20
DB_POOL_TIMEOUT=30

# Redis (Optional - for multi-instance deployments)
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# Rate Limiting
RATE_LIMIT_DEFAULT=100/minute
RATE_LIMIT_AGENT=60/minute
RATE_LIMIT_ADMIN=120/minute

# External Services (Optional)
ABLY_API_KEY=
GOOGLE_API_KEY=

# Observability (Optional)
LOGFIRE_ENABLED=false
LOGFIRE_TOKEN=
LOGFIRE_SERVICE_NAME=copilotkit-pydantic
LOGFIRE_ENVIRONMENT=production

EOF
```

### 4️⃣ Generate Encryption Secret

```bash
# Generate a secure encryption secret
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'

# Or use openssl
openssl rand -base64 32
```

**Update the `.env` file** with the generated secret:
```bash
ENCRYPTION_MASTER_SECRET=your_generated_secret_here
```

### 5️⃣ Run Database Migrations

```bash
# Run migrations to set up database schema
docker run --rm \
  --env-file /opt/copilotkit/.env \
  --network copilotkit-network \
  YOUR_DOCKERHUB_USERNAME/copilotkit-pydantic:latest \
  python -m scripts.migrate
```

### 6️⃣ Start the Pydantic Server

**Option A: Without Docker Network (using host database)**
```bash
docker run -d \
  --name copilotkit-pydantic \
  --env-file /opt/copilotkit/.env \
  -p 8001:8001 \
  --restart unless-stopped \
  YOUR_DOCKERHUB_USERNAME/copilotkit-pydantic:latest
```

**Option B: With Docker Network (PostgreSQL in Docker)**
```bash
docker run -d \
  --name copilotkit-pydantic \
  --network copilotkit-network \
  --env-file /opt/copilotkit/.env \
  -p 8001:8001 \
  --restart unless-stopped \
  YOUR_DOCKERHUB_USERNAME/copilotkit-pydantic:latest
```

### 7️⃣ Verify Deployment

```bash
# Check container is running
docker ps | grep copilotkit-pydantic

# Check logs
docker logs copilotkit-pydantic --tail 50

# Test health endpoint
curl http://localhost:8001/healthz

# Expected response:
# {"status":"ok","timestamp":"..."}
```

---

## 🔧 Advanced Configuration

### Using Redis for Multi-Instance Deployment

```bash
# 1. Start Redis
docker run -d \
  --name redis \
  --network copilotkit-network \
  -v redis-data:/data \
  -p 6379:6379 \
  redis:7-alpine

# 2. Update .env file
REDIS_ENABLED=true
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0

# 3. Restart pydantic server
docker restart copilotkit-pydantic
```

### SSL/TLS with Nginx Reverse Proxy

```bash
# Install nginx and certbot
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# Create nginx config
sudo cat > /etc/nginx/sites-available/copilotkit << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for long-running requests
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/copilotkit /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

### Docker Compose Setup

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    environment:
      POSTGRES_USER: copilotkit
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: copilotkit
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - copilotkit-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U copilotkit"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: redis
    volumes:
      - redis-data:/data
    networks:
      - copilotkit-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  pydantic:
    image: ${DOCKER_USERNAME}/copilotkit-pydantic:latest
    container_name: copilotkit-pydantic
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - .env
    ports:
      - "8001:8001"
    networks:
      - copilotkit-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8001/healthz').read()"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  postgres-data:
  redis-data:

networks:
  copilotkit-network:
    driver: bridge
```

Deploy with Docker Compose:
```bash
# Create environment file
export POSTGRES_PASSWORD="your_secure_password"
export DOCKER_USERNAME="your_dockerhub_username"

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

---

## 📊 Monitoring & Maintenance

### View Logs
```bash
# Real-time logs
docker logs -f copilotkit-pydantic

# Last 100 lines
docker logs --tail 100 copilotkit-pydantic

# Logs with timestamps
docker logs -t copilotkit-pydantic
```

### Restart Services
```bash
# Restart pydantic server
docker restart copilotkit-pydantic

# Restart all services (Docker Compose)
docker-compose restart
```

### Update to New Version
```bash
# Pull latest image
docker pull YOUR_DOCKERHUB_USERNAME/copilotkit-pydantic:latest

# Stop and remove old container
docker stop copilotkit-pydantic
docker rm copilotkit-pydantic

# Start new container with same configuration
docker run -d \
  --name copilotkit-pydantic \
  --network copilotkit-network \
  --env-file /opt/copilotkit/.env \
  -p 8001:8001 \
  --restart unless-stopped \
  YOUR_DOCKERHUB_USERNAME/copilotkit-pydantic:latest
```

### Database Backup
```bash
# Backup PostgreSQL database
docker exec postgres pg_dump -U copilotkit copilotkit > backup-$(date +%Y%m%d-%H%M%S).sql

# Restore from backup
docker exec -i postgres psql -U copilotkit copilotkit < backup-20260122-120000.sql
```

---

## 🔒 Security Checklist

- [ ] Generate and set a strong `ENCRYPTION_MASTER_SECRET`
- [ ] Set `DEBUG=false` in production
- [ ] Configure `ALLOWED_ORIGINS` to specific domains (not `*`)
- [ ] Use strong PostgreSQL password
- [ ] Set up firewall rules (only allow ports 80, 443, 22)
- [ ] Enable SSL/TLS with Nginx reverse proxy
- [ ] Keep Docker images updated
- [ ] Set up automated backups for PostgreSQL
- [ ] Enable Redis password if using Redis
- [ ] Monitor logs for suspicious activity
- [ ] Set up log rotation

### Firewall Configuration (UFW)
```bash
# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

---

## 🧪 Testing the Deployment

### Test Health Endpoint
```bash
curl http://your-vm-ip:8001/healthz
# Expected: {"status":"ok","timestamp":"2026-01-22T..."}
```

### Test API Endpoints
```bash
# Get API info
curl http://your-vm-ip:8001/

# Test admin endpoints (requires authentication)
curl http://your-vm-ip:8001/api/admin/health
```

### Test from Chrome Extension

Update your Chrome extension `.env`:
```bash
CEB_API_URL=https://your-domain.com
CEB_BACKEND_URL=https://your-domain.com
```

Rebuild and test the extension.

---

## 🐛 Troubleshooting

### Container Won't Start
```bash
# Check container logs
docker logs copilotkit-pydantic

# Check if port is already in use
sudo netstat -tulpn | grep 8001

# Check if container is in error state
docker ps -a | grep copilotkit-pydantic

# Remove and recreate container
docker rm -f copilotkit-pydantic
# Then run docker run command again
```

### Database Connection Errors
```bash
# Test database connectivity
docker run --rm --env-file /opt/copilotkit/.env \
  YOUR_DOCKERHUB_USERNAME/copilotkit-pydantic:latest \
  python -c "import psycopg; psycopg.connect(os.getenv('DATABASE_URL'))"

# Check if PostgreSQL is running
docker ps | grep postgres

# Check PostgreSQL logs
docker logs postgres
```

### Health Check Failing
```bash
# Check if server is responding
curl -v http://localhost:8001/healthz

# Check container resource usage
docker stats copilotkit-pydantic

# Check if database is accessible
docker exec copilotkit-pydantic python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8001/healthz').read())"
```

---

## 📦 Complete Deployment Script

Save this as `deploy-pydantic.sh`:

```bash
#!/usr/bin/env bash
set -e

echo "🚀 Deploying CopilotKit Pydantic Server..."

# Configuration
DOCKER_USERNAME="${DOCKER_USERNAME:-your_dockerhub_username}"
IMAGE_NAME="copilotkit-pydantic"
CONTAINER_NAME="copilotkit-pydantic"
NETWORK_NAME="copilotkit-network"
ENV_FILE="/opt/copilotkit/.env"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Create directory for configs
sudo mkdir -p /opt/copilotkit
sudo chown $USER:$USER /opt/copilotkit

# Create Docker network if it doesn't exist
if ! docker network inspect $NETWORK_NAME > /dev/null 2>&1; then
    echo "📡 Creating Docker network..."
    docker network create $NETWORK_NAME
fi

# Pull latest image
echo "📥 Pulling latest image..."
docker pull $DOCKER_USERNAME/$IMAGE_NAME:latest

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "⚠️  Environment file not found at $ENV_FILE"
    echo "Please create it with the required configuration."
    exit 1
fi

# Stop and remove existing container
if docker ps -a | grep -q $CONTAINER_NAME; then
    echo "🛑 Stopping existing container..."
    docker stop $CONTAINER_NAME || true
    docker rm $CONTAINER_NAME || true
fi

# Start new container
echo "🚀 Starting container..."
docker run -d \
    --name $CONTAINER_NAME \
    --network $NETWORK_NAME \
    --env-file $ENV_FILE \
    -p 8001:8001 \
    --restart unless-stopped \
    $DOCKER_USERNAME/$IMAGE_NAME:latest

# Wait for container to be healthy
echo "⏳ Waiting for container to be healthy..."
sleep 10

# Check if container is running
if docker ps | grep -q $CONTAINER_NAME; then
    echo "✅ Container is running!"
    
    # Test health endpoint
    if curl -f http://localhost:8001/healthz > /dev/null 2>&1; then
        echo "✅ Health check passed!"
        echo ""
        echo "╔═══════════════════════════════════════════╗"
        echo "║   Deployment Successful!                  ║"
        echo "╚═══════════════════════════════════════════╝"
        echo ""
        echo "📊 Container Status:"
        docker ps --filter name=$CONTAINER_NAME --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        echo "🔗 Access your server at: http://$(curl -s ifconfig.me):8001"
        echo ""
        echo "📋 View logs: docker logs -f $CONTAINER_NAME"
        echo ""
    else
        echo "⚠️  Health check failed. Check logs:"
        docker logs --tail 50 $CONTAINER_NAME
    fi
else
    echo "❌ Container failed to start. Check logs:"
    docker logs $CONTAINER_NAME
    exit 1
fi
```

Make it executable and run:
```bash
chmod +x deploy-pydantic.sh
export DOCKER_USERNAME="your_dockerhub_username"
./deploy-pydantic.sh
```

---

## 🎯 Next Steps

1. **Set up monitoring**: Consider using tools like Prometheus, Grafana, or Logfire
2. **Configure backups**: Set up automated database backups
3. **Enable HTTPS**: Use Nginx with Let's Encrypt SSL certificates
4. **Set up CI/CD**: Automate deployments with GitHub Actions or GitLab CI
5. **Scale horizontally**: Deploy multiple instances behind a load balancer

---

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)

---

**Questions?** Check the logs or review the troubleshooting section above.
