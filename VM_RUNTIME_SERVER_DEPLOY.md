# 🚀 Runtime Server VM Deployment

Quick guide for deploying the CopilotKit Runtime Server on your VM.

---

## 📋 Quick Deploy

### 1. Create Environment File

```bash
# Create directory
mkdir -p /opt/copilotkit-runtime && cd /opt/copilotkit-runtime

# Create .env file
cat > .env << 'EOF'
# Server
PORT=3001
NODE_ENV=production
DEBUG=false

# Pydantic Backend URL (IMPORTANT: Update with your pydantic server URL)
PYDANTIC_SERVICE_URL=http://localhost:8001

# Security Secrets (REQUIRED)
ENCRYPTION_MASTER_SECRET=GENERATE_SECRET_HERE
BETTER_AUTH_SECRET=GENERATE_SECRET_HERE
BETTER_AUTH_URL=http://your-domain.com

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=copilotkit
DB_USERNAME=copilotkit
DB_PASSWORD=your_secure_password
DB_OTHER_PARAMS=sslmode=require
DB_POOL_MIN=2
DB_POOL_MAX=10

# Server Limits
BODY_LIMIT_MB=30
REQUEST_TIMEOUT_MS=300000
HEADERS_TIMEOUT_MS=310000
TRUST_PROXY=false

# CORS
CORS_ORIGINS=https://your-domain.com,chrome-extension://*

# Optional OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

EOF

# Generate secrets
echo "Generating secrets..."
ENCRYPTION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

sed -i "s|ENCRYPTION_MASTER_SECRET=.*|ENCRYPTION_MASTER_SECRET=$ENCRYPTION_SECRET|" .env
sed -i "s|BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET|" .env

echo "✅ Secrets generated!"
echo "⚠️  Edit .env and update:"
echo "   - PYDANTIC_SERVICE_URL"
echo "   - BETTER_AUTH_URL"
echo "   - Database credentials"
echo "   - CORS_ORIGINS"
nano .env
```

### 2. Run Runtime Server

```bash
# Set your Docker Hub username
export DOCKER_USERNAME="your_dockerhub_username"

# Pull image
docker pull $DOCKER_USERNAME/copilot-runtime-server:latest

# Run container
docker run -d \
  --name copilot-runtime-server \
  --env-file .env \
  -p 3001:3001 \
  --restart unless-stopped \
  $DOCKER_USERNAME/copilot-runtime-server:latest

# Check status
docker ps | grep copilot-runtime-server

# Test health
curl http://localhost:3001/health
```

---

## 🔗 Connect Runtime to Pydantic

### Scenario 1: Both on Same VM

```bash
# In runtime .env file:
PYDANTIC_SERVICE_URL=http://localhost:8001
```

Then run runtime container with `--network host`:
```bash
docker run -d \
  --name copilot-runtime-server \
  --network host \
  --env-file .env \
  --restart unless-stopped \
  $DOCKER_USERNAME/copilot-runtime-server:latest
```

### Scenario 2: Both in Docker Network

```bash
# Create network (if not exists)
docker network create copilotkit-network

# Ensure pydantic is on this network
docker network connect copilotkit-network copilotkit-pydantic

# In runtime .env file:
PYDANTIC_SERVICE_URL=http://copilotkit-pydantic:8001

# Run runtime on same network
docker run -d \
  --name copilot-runtime-server \
  --network copilotkit-network \
  --env-file .env \
  -p 3001:3001 \
  --restart unless-stopped \
  $DOCKER_USERNAME/copilot-runtime-server:latest
```

### Scenario 3: Pydantic on Different Server

```bash
# In runtime .env file (use external URL):
PYDANTIC_SERVICE_URL=https://pydantic.your-domain.com

# Run runtime normally
docker run -d \
  --name copilot-runtime-server \
  --env-file .env \
  -p 3001:3001 \
  --restart unless-stopped \
  $DOCKER_USERNAME/copilot-runtime-server:latest
```

---

## 🐳 Docker Compose (Recommended)

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

  pydantic:
    image: ${DOCKER_USERNAME}/copilotkit-pydantic:latest
    container_name: copilotkit-pydantic
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - pydantic.env
    networks:
      - copilotkit-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8001/healthz').read()"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  runtime:
    image: ${DOCKER_USERNAME}/copilot-runtime-server:latest
    container_name: copilot-runtime-server
    depends_on:
      postgres:
        condition: service_healthy
      pydantic:
        condition: service_healthy
    env_file:
      - runtime.env
    ports:
      - "3001:3001"
    networks:
      - copilotkit-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
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

Create `pydantic.env`:
```bash
HOST=0.0.0.0
PORT=8001
PYTHON_ENV=production
DEBUG=false
ALLOWED_ORIGINS=*
ENCRYPTION_MASTER_SECRET=generate_secret
DATABASE_URL=postgresql://copilotkit:password@postgres:5432/copilotkit
REDIS_ENABLED=true
REDIS_HOST=redis
REDIS_PORT=6379
```

Create `runtime.env`:
```bash
PORT=3001
NODE_ENV=production
DEBUG=false
PYDANTIC_SERVICE_URL=http://copilotkit-pydantic:8001
ENCRYPTION_MASTER_SECRET=generate_secret
BETTER_AUTH_SECRET=generate_secret
BETTER_AUTH_URL=https://your-domain.com
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=copilotkit
DB_USERNAME=copilotkit
DB_PASSWORD=password
DB_OTHER_PARAMS=sslmode=disable
CORS_ORIGINS=https://your-domain.com,chrome-extension://*
```

Deploy:
```bash
export DOCKER_USERNAME="your_username"
export POSTGRES_PASSWORD="secure_password"
docker-compose up -d
```

---

## 📊 Useful Commands

```bash
# View logs
docker logs -f copilot-runtime-server

# Restart
docker restart copilot-runtime-server

# Check connectivity to pydantic
docker exec copilot-runtime-server wget -qO- http://copilotkit-pydantic:8001/healthz

# Update to new version
docker pull $DOCKER_USERNAME/copilot-runtime-server:latest
docker stop copilot-runtime-server && docker rm copilot-runtime-server
# Then run docker run command again
```

---

## 🔒 Security Notes

1. **Generate secure secrets**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

2. **Set NODE_ENV=production**

3. **Configure CORS_ORIGINS** to specific domains

4. **Enable SSL** with Nginx reverse proxy

5. **Use strong database passwords**

6. **Set TRUST_PROXY=true** if behind load balancer

---

## 🌐 Nginx Configuration

```nginx
server {
    listen 80;
    server_name runtime.your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Long timeouts for streaming/agents
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
}
```

Enable SSL:
```bash
sudo certbot --nginx -d runtime.your-domain.com
```

---

## 🧪 Testing

```bash
# Test health
curl http://localhost:3001/health

# Test with external URL
curl https://runtime.your-domain.com/health

# Test from Chrome extension
# Update .env:
CEB_API_URL=https://runtime.your-domain.com
```

---

## 🐛 Troubleshooting

### Container won't start
```bash
docker logs copilot-runtime-server
```

### Can't connect to pydantic
```bash
# Test from runtime container
docker exec copilot-runtime-server wget -qO- $PYDANTIC_SERVICE_URL/healthz

# If fails, check:
# 1. PYDANTIC_SERVICE_URL is correct
# 2. Both containers on same network
# 3. Pydantic container is running
docker ps | grep copilotkit-pydantic
```

### Database connection failed
```bash
# Test database connectivity
docker exec copilot-runtime-server node -e "require('pg').Client({host:'$DB_HOST',port:$DB_PORT,database:'$DB_DATABASE',user:'$DB_USERNAME',password:'$DB_PASSWORD'}).connect((e)=>console.log(e?'FAIL':'OK'))"
```

---

**Need complete setup?** See [VM_DEPLOYMENT_GUIDE.md](./VM_DEPLOYMENT_GUIDE.md)
