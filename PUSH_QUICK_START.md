# 🚀 Docker Hub Push - Quick Start

## ✅ Prerequisites Complete
- [x] Docker images built locally
- [x] All images tagged as 'latest'
- [x] Push script created and executable

## 📋 Quick Steps (3 minutes)

### 1. Login to Docker Hub
```bash
docker login
```
Enter your Docker Hub credentials.

### 2. Set Your Configuration
```bash
export DOCKER_USERNAME="your-docker-hub-username"  # REQUIRED
export VERSION="1.0.0"                              # Optional, defaults to 1.0.0
```

### 3. Push All Images (Automated)
```bash
cd /Users/hnankam/Downloads/data/project-hands-off
./push-all-images.sh
```

**OR** Manual push (Runtime Server only):
```bash
docker tag copilot-runtime-server:latest your-username/copilot-runtime-server:latest
docker push your-username/copilot-runtime-server:latest
```

---

## 📦 What Will Be Pushed?

Your local images ready for push:

| Image | Size | Tags |
|-------|------|------|
| **copilot-runtime-server** | 588MB | latest, 1.0.0 |
| **copilotkit-pydantic** | 1.26GB | latest, 1.0.0 |
| **github-mcp** | 615MB | latest, 1.0.0 |
| **jira-mcp** | 612MB | latest, 1.0.0 |
| **confluence-mcp** | 612MB | latest, 1.0.0 |
| **databricks-mcp** | 593MB | latest, 1.0.0 |

**Total**: ~4.2GB (all images)

---

## ⚡ Quick Commands

### Push Just Runtime Server
```bash
export DOCKER_USERNAME="yourusername"
docker tag copilot-runtime-server:latest $DOCKER_USERNAME/copilot-runtime-server:latest
docker tag copilot-runtime-server:latest $DOCKER_USERNAME/copilot-runtime-server:1.0.0
docker push $DOCKER_USERNAME/copilot-runtime-server:latest
docker push $DOCKER_USERNAME/copilot-runtime-server:1.0.0
```

### Push Just Pydantic Backend
```bash
docker tag copilotkit-pydantic:latest $DOCKER_USERNAME/copilotkit-pydantic:latest
docker push $DOCKER_USERNAME/copilotkit-pydantic:latest
```

### Push Single MCP Server
```bash
docker tag github-mcp:latest $DOCKER_USERNAME/github-mcp:latest
docker push $DOCKER_USERNAME/github-mcp:latest
```

---

## 🔍 Verify Before Pushing

```bash
# Check if you're logged in
docker info | grep Username

# List your local images
docker images | grep -E "runtime-server|pydantic|mcp"

# Check specific image size
docker images copilot-runtime-server:latest
```

---

## 🌐 After Pushing

### View on Docker Hub
- Your repositories: `https://hub.docker.com/u/yourusername`
- Runtime server: `https://hub.docker.com/r/yourusername/copilot-runtime-server`

### Pull on Another Machine
```bash
docker pull yourusername/copilot-runtime-server:latest
docker pull yourusername/copilotkit-pydantic:latest
```

### Run Pulled Image
```bash
docker run -d \
  --name runtime-server \
  -p 3001:3001 \
  --env-file .env \
  yourusername/copilot-runtime-server:latest
```

---

## 🆘 Common Issues

**❌ "denied: requested access to the resource is denied"**
```bash
# Solution: Re-login
docker logout
docker login
```

**❌ "unauthorized: authentication required"**
```bash
# Solution: Login with username explicitly
docker login --username=yourusername
```

**⚠️  Push is slow**
- Expected: Pushing 4.2GB takes 5-20 minutes depending on internet speed
- Runtime server (588MB) alone takes ~2-5 minutes

---

## 📝 Script Features

The automated script (`push-all-images.sh`):
- ✅ Checks if you're logged in
- ✅ Confirms before pushing
- ✅ Shows image sizes
- ✅ Skips missing images
- ✅ Tags with version and latest
- ✅ Provides summary with links
- ✅ Color-coded output

---

## 🎯 Example Session

```bash
$ docker login
Username: myusername
Password: 
Login Succeeded

$ export DOCKER_USERNAME="myusername"
$ export VERSION="1.0.0"

$ ./push-all-images.sh
╔════════════════════════════════════════════════════════════════╗
║         🚀 Docker Hub Push - All Images                        ║
╚════════════════════════════════════════════════════════════════╝

Configuration:
  Username: myusername
  Version:  1.0.0

✅ Logged in as: myusername

Push images as 'myusername' version '1.0.0'? (y/n) y

[... pushing ...]

╔════════════════════════════════════════════════════════════════╗
║         🎉 Push Complete!                                      ║
╚════════════════════════════════════════════════════════════════╝

📋 Pushed Images (6):
   ✅ myusername/copilot-runtime-server:1.0.0
   ✅ myusername/copilot-runtime-server:latest
   ✅ myusername/copilotkit-pydantic:1.0.0
   ✅ myusername/copilotkit-pydantic:latest
   [...]

🌐 View on Docker Hub:
   https://hub.docker.com/u/myusername
```

---

## 📚 Full Documentation

For detailed information, see:
- **DOCKER_HUB_PUSH_GUIDE.md** - Complete guide with all options
- **push-all-images.sh** - Automated script

---

**Ready to push!** 🚀

Replace `yourusername` with your actual Docker Hub username and run the commands.
