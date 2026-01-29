# Build Scripts - Documentation

**Quick rebuild and restart Docker containers when code changes**

---

## Overview

Three build scripts are available to streamline your development workflow:

1. **`build-all.sh`** - Rebuild both services (root directory)
2. **`copilotkit-pydantic/build-and-run.sh`** - Rebuild pydantic backend only
3. **`copilot-runtime-server/build-and-run.sh`** - Rebuild runtime server only

All scripts:
- ✅ Stop existing containers
- ✅ Rebuild Docker images with latest code
- ✅ Start new containers with updated images
- ✅ Run health checks
- ✅ Display useful information

---

## Quick Start

### Build Both Services

```bash
# Development mode (default)
./build-all.sh

# Production mode
./build-all.sh production
```

### Build Individual Services

```bash
# Pydantic backend
cd copilotkit-pydantic
./build-and-run.sh

# Runtime server
cd copilot-runtime-server
./build-and-run.sh
```

---

## Script Details

### 1. build-all.sh (Root Directory)

**Purpose:** Build both services in the correct order

**Location:** `/Users/hnankam/Downloads/data/project-hands-off/build-all.sh`

**Usage:**
```bash
./build-all.sh [development|production]
```

**What it does:**
1. Builds Pydantic Backend first
2. Builds Runtime Server second (depends on pydantic)
3. Shows build summary with health checks
4. Reports any failures

**Example Output:**
```
╔════════════════════════════════════════════════════════════════╗
║       🚀 CopilotKit Full Stack Build Script 🚀                ║
║  Building: Pydantic Backend + Runtime Server                  ║
║  Target:   development                                        ║
╚════════════════════════════════════════════════════════════════╝

════════════════════════════════════════════════════════════════
Building: copilotkit-pydantic
════════════════════════════════════════════════════════════════

[1/5] Stopping existing container...
✓ Container stopped and removed

[2/5] Building Docker image (target: development)...
✓ Image built successfully

...

╔════════════════════════════════════════════════════════════════╗
║  🎉 Full Stack Ready!                                         ║
╚════════════════════════════════════════════════════════════════╝
```

---

### 2. copilotkit-pydantic/build-and-run.sh

**Purpose:** Rebuild and restart the Python backend

**Location:** `/Users/hnankam/Downloads/data/project-hands-off/copilotkit-pydantic/build-and-run.sh`

**Usage:**
```bash
cd copilotkit-pydantic
./build-and-run.sh [development|production]
```

**Configuration:**
- Container Name: `copilotkit-pydantic`
- Image Name: `copilotkit-pydantic:development` or `copilotkit-pydantic:production`
- Port: `8001`
- Env File: `.env`

**Steps:**
1. Stop and remove existing container
2. Build new Docker image
3. Check for `.env` file
4. Start new container with environment variables
5. Wait for health check
6. Display status and endpoints

**Environment Variables (Development):**
- `DEBUG=true`
- `PYTHON_ENV=development`
- `LOG_FORMAT=plain`

**Environment Variables (Production):**
- `DEBUG=false`
- `PYTHON_ENV=production`
- `LOG_FORMAT=json`

**Example:**
```bash
# Development mode
./build-and-run.sh

# Production mode
./build-and-run.sh production
```

---

### 3. copilot-runtime-server/build-and-run.sh

**Purpose:** Rebuild and restart the Node.js runtime server

**Location:** `/Users/hnankam/Downloads/data/project-hands-off/copilot-runtime-server/build-and-run.sh`

**Usage:**
```bash
cd copilot-runtime-server
./build-and-run.sh [development|production]
```

**Configuration:**
- Container Name: `copilot-runtime-server`
- Image Name: `copilot-runtime-server:development` or `copilot-runtime-server:production`
- Port: `3001`
- Env File: `.env`

**Steps:**
1. Stop and remove existing container
2. Build new Docker image
3. Check for `.env` file
4. Extract `PYDANTIC_SERVICE_URL` from `.env`
5. Start new container with environment variables
6. Wait for health check
7. Display status and endpoints

**Environment Variables (Development):**
- `NODE_ENV=development`
- `DEBUG=true`
- `PYDANTIC_SERVICE_URL=<from .env or default>`

**Environment Variables (Production):**
- `NODE_ENV=production`
- `DEBUG=false`
- `PYDANTIC_SERVICE_URL=<from .env or default>`

**Example:**
```bash
# Development mode
./build-and-run.sh

# Production mode
./build-and-run.sh production
```

---

## Common Use Cases

### 1. Code Changed - Rebuild Everything

```bash
# From project root
./build-all.sh
```

### 2. Only Python Code Changed

```bash
cd copilotkit-pydantic
./build-and-run.sh
```

### 3. Only Node.js Code Changed

```bash
cd copilot-runtime-server
./build-and-run.sh
```

### 4. Test Production Build

```bash
# Build both in production mode
./build-all.sh production

# Or individually
cd copilotkit-pydantic
./build-and-run.sh production

cd ../copilot-runtime-server
./build-and-run.sh production
```

---

## Development Workflow

### Typical Workflow

1. **Make code changes** in either service
2. **Run build script** for changed service
3. **Test the changes** via health endpoints
4. **Check logs** if needed
5. **Repeat** as needed

### Example Session

```bash
# 1. Change Python code
vim copilotkit-pydantic/main.py

# 2. Rebuild pydantic backend
cd copilotkit-pydantic
./build-and-run.sh

# 3. Test health endpoint
curl http://localhost:8001/healthz

# 4. Check logs
docker logs -f copilotkit-pydantic

# 5. Change Node.js code
cd ../copilot-runtime-server
vim server.js

# 6. Rebuild runtime server
./build-and-run.sh

# 7. Test health endpoint
curl http://localhost:3001/health
```

---

## Script Features

### Color-Coded Output

- 🔴 **Red:** Errors and failures
- 🟢 **Green:** Success messages
- 🟡 **Yellow:** Warnings and prompts
- 🔵 **Blue:** Information and endpoints
- 🟣 **Magenta:** Headers and titles
- 🔵 **Cyan:** Section dividers

### Health Checks

All scripts automatically test health endpoints after starting containers:

**Pydantic Backend:**
```bash
curl http://localhost:8001/healthz
# Expected: {"status":"ok"}
```

**Runtime Server:**
```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","db":true,"message":"CopilotKit Runtime Server is running"}
```

### Error Handling

Scripts exit with error code `1` if:
- Docker build fails
- `.env` file is missing
- Container fails to start
- Health check doesn't respond (warning only)

### Auto-Configuration

- Docker credential helper automatically added to PATH
- `PYDANTIC_SERVICE_URL` extracted from `.env` for runtime server
- Container restart policy: `unless-stopped`

---

## Available Endpoints (After Build)

### Pydantic Backend (Port 8001)

- **Health:** `http://localhost:8001/healthz`
- **Ready:** `http://localhost:8001/readyz`
- **Docs:** `http://localhost:8001/docs`
- **Agent:** `http://localhost:8001/agent/{type}/{model}`
- **Sessions:** `http://localhost:8001/sessions`
- **Tools:** `http://localhost:8001/tools/{agent_type}/{model}`

### Runtime Server (Port 3001)

- **Health:** `http://localhost:3001/health`
- **CopilotKit:** `http://localhost:3001/api/copilotkit`
- **Auth:** `http://localhost:3001/api/auth/*`
- **Admin:** `http://localhost:3001/api/admin/*`
- **Config:** `http://localhost:3001/api/config`

---

## Useful Commands (Shown After Build)

### View Logs

```bash
# Pydantic backend
docker logs -f copilotkit-pydantic

# Runtime server
docker logs -f copilot-runtime-server

# Both (with Docker Compose)
docker-compose logs -f
```

### Container Management

```bash
# Stop containers
docker stop copilotkit-pydantic
docker stop copilot-runtime-server

# Restart containers
docker restart copilotkit-pydantic
docker restart copilot-runtime-server

# Remove containers
docker rm copilotkit-pydantic
docker rm copilot-runtime-server
```

### Access Container Shell

```bash
# Pydantic (bash)
docker exec -it copilotkit-pydantic /bin/bash

# Runtime server (sh - Alpine Linux)
docker exec -it copilot-runtime-server /bin/sh
```

### Monitor Resources

```bash
# Single container
docker stats copilotkit-pydantic

# Both containers
docker stats copilotkit-pydantic copilot-runtime-server
```

---

## Troubleshooting

### Build Fails

**Error:** `Docker credential helper not found`

**Solution:**
```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```
*Scripts automatically add this, but you can add to `~/.zshrc` for permanent fix*

---

### Container Won't Start

**Check logs:**
```bash
docker logs copilotkit-pydantic
docker logs copilot-runtime-server
```

**Common issues:**
- Missing or invalid `.env` file
- Port already in use (3001 or 8001)
- Database connection failed
- Redis connection failed

---

### Health Check Fails

**Wait a bit longer:**
Services may take 10-15 seconds to fully initialize, especially:
- First startup
- Database connections
- Redis connections
- Logfire initialization

**Manual check:**
```bash
# Wait 15 seconds
sleep 15

# Try again
curl http://localhost:8001/healthz
curl http://localhost:3001/health
```

---

### Old Image Cached

**Force rebuild** by uncommenting the "remove old image" section in scripts:

```bash
# Uncomment this section in build-and-run.sh
echo -e "${YELLOW}[2/5] Removing old image...${NC}"
docker rmi ${IMAGE_NAME}:${TARGET} 2>/dev/null || true
echo -e "${GREEN}✓ Old image removed${NC}"
```

Or manually:
```bash
# Remove specific image
docker rmi copilotkit-pydantic:development
docker rmi copilot-runtime-server:development

# Then rebuild
./build-and-run.sh
```

---

## Advanced Usage

### Custom Container Names

Edit the `CONTAINER_NAME` variable in scripts:

```bash
# In build-and-run.sh
CONTAINER_NAME="my-custom-name"
```

### Custom Ports

Edit the `PORT` variable in scripts:

```bash
# In build-and-run.sh
PORT=9001
```

### Additional Environment Variables

Add `-e` flags to the `docker run` command in scripts:

```bash
docker run -d \
    --name ${CONTAINER_NAME} \
    -p ${PORT}:${PORT} \
    --env-file ${ENV_FILE} \
    -e DEBUG=true \
    -e MY_CUSTOM_VAR=value \  # Add here
    ${IMAGE_NAME}:${TARGET}
```

### Mount Volumes (Hot Reload)

For true hot reload without rebuilds, mount source code:

```bash
docker run -d \
    --name ${CONTAINER_NAME} \
    -p ${PORT}:${PORT} \
    --env-file ${ENV_FILE} \
    -v $(pwd):/app \  # Mount source code
    ${IMAGE_NAME}:${TARGET}
```

**Note:** Use Docker Compose for this (see `docker-compose.dev.yml`)

---

## Integration with Docker Compose

These scripts are alternatives to Docker Compose. Choose based on your needs:

### Use Build Scripts When:
- ✅ Testing individual services
- ✅ Quick iterations on single service
- ✅ Different deployment targets
- ✅ Custom configurations

### Use Docker Compose When:
- ✅ Running full stack
- ✅ Managing multiple containers
- ✅ Consistent environments
- ✅ Production deployment

### Both Can Coexist

```bash
# Development with Docker Compose
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Quick rebuild of one service
cd copilotkit-pydantic
./build-and-run.sh

# Check all containers
docker ps
```

---

## Performance Tips

### Faster Builds

1. **Use Docker BuildKit:**
   ```bash
   export DOCKER_BUILDKIT=1
   ```

2. **Parallel builds** (manual):
   ```bash
   # Terminal 1
   cd copilotkit-pydantic && ./build-and-run.sh &

   # Terminal 2
   cd copilot-runtime-server && ./build-and-run.sh &
   ```

3. **Cache dependencies:**
   - Don't modify `requirements.txt` or `package.json` often
   - Docker caches unchanged layers

---

## Summary

| Script | Purpose | Location | Time |
|--------|---------|----------|------|
| `build-all.sh` | Build both services | Root | ~2-3 min |
| `pydantic/build-and-run.sh` | Build Python backend | copilotkit-pydantic/ | ~1-2 min |
| `runtime/build-and-run.sh` | Build Node.js server | copilot-runtime-server/ | ~1 min |

**All scripts:**
- ✅ Automated
- ✅ Color-coded output
- ✅ Health checks
- ✅ Error handling
- ✅ Status reporting

---

## Next Steps

1. **Try the scripts:**
   ```bash
   ./build-all.sh
   ```

2. **Make changes and rebuild:**
   ```bash
   cd copilotkit-pydantic
   # Edit code...
   ./build-and-run.sh
   ```

3. **Monitor logs:**
   ```bash
   docker logs -f copilotkit-pydantic
   ```

4. **Build frontend:**
   ```bash
   npm install && npm run build
   ```

---

**Happy coding! 🚀**
