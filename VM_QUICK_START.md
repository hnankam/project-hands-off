# 🚀 VM Quick Start - 5 Minute Deployment

Deploy CopilotKit Pydantic Server on your VM in 5 minutes.

---

## Prerequisites

- VM with Docker installed
- Docker image pushed to Docker Hub
- Database URL ready (Neon, AWS RDS, or self-hosted)

---

## 🏃 Quick Deploy

### 1. Create Environment File

```bash
# Create directory
mkdir -p /opt/copilotkit && cd /opt/copilotkit

# Create .env file
cat > .env << 'EOF'
# Server
HOST=0.0.0.0
PORT=8001
PYTHON_ENV=production
DEBUG=false
ALLOWED_ORIGINS=https://your-domain.com,chrome-extension://*

# Security - REPLACE THIS!
ENCRYPTION_MASTER_SECRET=GENERATE_SECURE_SECRET_HERE

# Database - UPDATE WITH YOUR DATABASE URL
DATABASE_URL=postgresql://user:password@host:port/database

# Redis (optional)
REDIS_ENABLED=false

# Rate Limiting
RATE_LIMIT_DEFAULT=100/minute
EOF

# Generate and set encryption secret
SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
sed -i "s|ENCRYPTION_MASTER_SECRET=.*|ENCRYPTION_MASTER_SECRET=$SECRET|" .env

# Update DATABASE_URL
echo "⚠️  Edit .env and update DATABASE_URL with your actual database connection string"
nano .env
```

### 2. Pull and Run

```bash
# Set your Docker Hub username
export DOCKER_USERNAME="your_dockerhub_username"

# Pull image
docker pull $DOCKER_USERNAME/copilotkit-pydantic:latest

# Run container
docker run -d \
  --name copilotkit-pydantic \
  --env-file .env \
  -p 8001:8001 \
  --restart unless-stopped \
  $DOCKER_USERNAME/copilotkit-pydantic:latest

# Check status
docker ps | grep copilotkit-pydantic

# Test health
curl http://localhost:8001/healthz
```

### 3. Done! 🎉

Your server is running at `http://YOUR_VM_IP:8001`

---

## 🔐 With Self-Hosted PostgreSQL

```bash
# Create network
docker network create copilotkit-network

# Start PostgreSQL
docker run -d \
  --name postgres \
  --network copilotkit-network \
  -e POSTGRES_USER=copilotkit \
  -e POSTGRES_PASSWORD=secure_password \
  -e POSTGRES_DB=copilotkit \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine

# Update .env
cat > /opt/copilotkit/.env << EOF
HOST=0.0.0.0
PORT=8001
PYTHON_ENV=production
DEBUG=false
ALLOWED_ORIGINS=*
ENCRYPTION_MASTER_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
DATABASE_URL=postgresql://copilotkit:secure_password@postgres:5432/copilotkit
REDIS_ENABLED=false
RATE_LIMIT_DEFAULT=100/minute
EOF

# Start pydantic server
docker run -d \
  --name copilotkit-pydantic \
  --network copilotkit-network \
  --env-file /opt/copilotkit/.env \
  -p 8001:8001 \
  --restart unless-stopped \
  $DOCKER_USERNAME/copilotkit-pydantic:latest
```

---

## 📊 Useful Commands

```bash
# View logs
docker logs -f copilotkit-pydantic

# Restart
docker restart copilotkit-pydantic

# Update to new version
docker pull $DOCKER_USERNAME/copilotkit-pydantic:latest
docker stop copilotkit-pydantic && docker rm copilotkit-pydantic
# Then run docker run command again

# Check health
curl http://localhost:8001/healthz
```

---

## 🌐 Add HTTPS (Optional)

```bash
# Install nginx
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# Create nginx config
sudo cat > /etc/nginx/sites-available/copilotkit << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable and get SSL
sudo ln -s /etc/nginx/sites-available/copilotkit /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🐛 Troubleshooting

**Container won't start?**
```bash
docker logs copilotkit-pydantic
```

**Port already in use?**
```bash
sudo netstat -tulpn | grep 8001
```

**Database connection failed?**
```bash
# Test database connectivity
docker run --rm --env-file /opt/copilotkit/.env \
  $DOCKER_USERNAME/copilotkit-pydantic:latest \
  python -c "import os; print(os.getenv('DATABASE_URL'))"
```

---

**Need more details?** See [VM_DEPLOYMENT_GUIDE.md](./VM_DEPLOYMENT_GUIDE.md)
