# Docker Hub Push Guide - Runtime Server & MCP Servers

## 📋 Prerequisites

1. **Docker Hub Account**: Create at https://hub.docker.com if you don't have one
2. **Docker Desktop**: Should be running (already installed)
3. **Images Built**: Ensure your images are built locally

## 🚀 Quick Start - Push Runtime Server

### 1. Login to Docker Hub

```bash
docker login
# Enter your Docker Hub username and password
```

### 2. Tag Your Image

**Format**: `docker tag LOCAL_IMAGE USERNAME/REPOSITORY:TAG`

```bash
# Replace 'yourusername' with your Docker Hub username
# Using semantic versioning

# Tag as latest
docker tag copilot-runtime-server:latest yourusername/copilot-runtime-server:latest

# Tag with version number
docker tag copilot-runtime-server:latest yourusername/copilot-runtime-server:1.0.0

# Tag as production
docker tag copilot-runtime-server:latest yourusername/copilot-runtime-server:production
```

### 3. Push to Docker Hub

```bash
# Push latest
docker push yourusername/copilot-runtime-server:latest

# Push version
docker push yourusername/copilot-runtime-server:1.0.0

# Push production
docker push yourusername/copilot-runtime-server:production
```

### 4. Verify Push

Check your image at: `https://hub.docker.com/r/yourusername/copilot-runtime-server`

---

## 📦 Complete Workflow Example

### For Runtime Server

```bash
# 1. Build the image (if not already built)
cd /Users/hnankam/Downloads/data/project-hands-off/copilot-runtime-server
docker build -t copilot-runtime-server:latest --target production .

# 2. Login to Docker Hub
docker login

# 3. Tag with your Docker Hub username
DOCKER_USERNAME="yourusername"  # Replace with your username
VERSION="1.0.0"

docker tag copilot-runtime-server:latest $DOCKER_USERNAME/copilot-runtime-server:latest
docker tag copilot-runtime-server:latest $DOCKER_USERNAME/copilot-runtime-server:$VERSION
docker tag copilot-runtime-server:latest $DOCKER_USERNAME/copilot-runtime-server:production

# 4. Push all tags
docker push $DOCKER_USERNAME/copilot-runtime-server:latest
docker push $DOCKER_USERNAME/copilot-runtime-server:$VERSION
docker push $DOCKER_USERNAME/copilot-runtime-server:production
```

### For Pydantic Backend

```bash
cd /Users/hnankam/Downloads/data/project-hands-off/copilotkit-pydantic
docker build -t copilotkit-pydantic:latest --target production .

DOCKER_USERNAME="yourusername"
VERSION="1.0.0"

docker tag copilotkit-pydantic:latest $DOCKER_USERNAME/copilotkit-pydantic:latest
docker tag copilotkit-pydantic:latest $DOCKER_USERNAME/copilotkit-pydantic:$VERSION

docker push $DOCKER_USERNAME/copilotkit-pydantic:latest
docker push $DOCKER_USERNAME/copilotkit-pydantic:$VERSION
```

---

## 🔧 Push All MCP Servers

### Individual MCP Servers

```bash
DOCKER_USERNAME="yourusername"
VERSION="1.0.0"

# GitHub MCP
docker tag github-mcp:latest $DOCKER_USERNAME/github-mcp:latest
docker tag github-mcp:latest $DOCKER_USERNAME/github-mcp:$VERSION
docker push $DOCKER_USERNAME/github-mcp:latest
docker push $DOCKER_USERNAME/github-mcp:$VERSION

# Jira MCP
docker tag jira-mcp:latest $DOCKER_USERNAME/jira-mcp:latest
docker tag jira-mcp:latest $DOCKER_USERNAME/jira-mcp:$VERSION
docker push $DOCKER_USERNAME/jira-mcp:latest
docker push $DOCKER_USERNAME/jira-mcp:$VERSION

# Confluence MCP
docker tag confluence-mcp:latest $DOCKER_USERNAME/confluence-mcp:latest
docker tag confluence-mcp:latest $DOCKER_USERNAME/confluence-mcp:$VERSION
docker push $DOCKER_USERNAME/confluence-mcp:latest
docker push $DOCKER_USERNAME/confluence-mcp:$VERSION

# Databricks MCP
docker tag databricks-mcp:latest $DOCKER_USERNAME/databricks-mcp:latest
docker tag databricks-mcp:latest $DOCKER_USERNAME/databricks-mcp:$VERSION
docker push $DOCKER_USERNAME/databricks-mcp:latest
docker push $DOCKER_USERNAME/databricks-mcp:$VERSION
```

---

## 🤖 Automated Push Script

### Create a Push Script for All Images

```bash
#!/bin/bash
# File: push-all-images.sh

set -e

# Configuration
DOCKER_USERNAME="${DOCKER_USERNAME:-yourusername}"
VERSION="${VERSION:-1.0.0}"

echo "🚀 Pushing all images to Docker Hub"
echo "Username: $DOCKER_USERNAME"
echo "Version: $VERSION"
echo ""

# Check if logged in
if ! docker info | grep -q "Username"; then
    echo "❌ Not logged in to Docker Hub"
    echo "Run: docker login"
    exit 1
fi

# Function to tag and push
tag_and_push() {
    local image=$1
    local name=$2
    
    echo "📦 Processing: $name"
    
    # Tag with version and latest
    docker tag $image:latest $DOCKER_USERNAME/$name:latest
    docker tag $image:latest $DOCKER_USERNAME/$name:$VERSION
    
    # Push both tags
    echo "   Pushing latest..."
    docker push $DOCKER_USERNAME/$name:latest
    echo "   Pushing $VERSION..."
    docker push $DOCKER_USERNAME/$name:$VERSION
    echo "   ✅ Done"
    echo ""
}

# Main services
tag_and_push "copilot-runtime-server" "copilot-runtime-server"
tag_and_push "copilotkit-pydantic" "copilotkit-pydantic"

# MCP Servers
tag_and_push "github-mcp" "github-mcp"
tag_and_push "jira-mcp" "jira-mcp"
tag_and_push "confluence-mcp" "confluence-mcp"
tag_and_push "databricks-mcp" "databricks-mcp"

echo "🎉 All images pushed successfully!"
echo ""
echo "📋 Pushed images:"
echo "   - $DOCKER_USERNAME/copilot-runtime-server:$VERSION"
echo "   - $DOCKER_USERNAME/copilotkit-pydantic:$VERSION"
echo "   - $DOCKER_USERNAME/github-mcp:$VERSION"
echo "   - $DOCKER_USERNAME/jira-mcp:$VERSION"
echo "   - $DOCKER_USERNAME/confluence-mcp:$VERSION"
echo "   - $DOCKER_USERNAME/databricks-mcp:$VERSION"
```

### Usage

```bash
# Make script executable
chmod +x push-all-images.sh

# Set your Docker Hub username
export DOCKER_USERNAME="yourusername"
export VERSION="1.0.0"

# Run the script
./push-all-images.sh
```

---

## 📝 Tagging Best Practices

### Semantic Versioning

```bash
# Major.Minor.Patch
docker tag image:latest username/image:1.0.0    # Initial release
docker tag image:latest username/image:1.0.1    # Bug fix
docker tag image:latest username/image:1.1.0    # New features
docker tag image:latest username/image:2.0.0    # Breaking changes
```

### Environment Tags

```bash
docker tag image:latest username/image:production
docker tag image:latest username/image:staging
docker tag image:latest username/image:development
```

### Date-based Tags

```bash
docker tag image:latest username/image:2026.01.21
docker tag image:latest username/image:2026-01
```

### Git Commit Tags

```bash
GIT_COMMIT=$(git rev-parse --short HEAD)
docker tag image:latest username/image:$GIT_COMMIT
docker tag image:latest username/image:commit-$GIT_COMMIT
```

---

## 🔍 Verify Your Images

### List Local Images

```bash
# All images
docker images

# Specific repository
docker images | grep copilot-runtime-server
```

### Check Image Size

```bash
docker images copilot-runtime-server:latest --format "{{.Repository}}:{{.Tag}} - {{.Size}}"
```

### Inspect Image

```bash
docker inspect copilot-runtime-server:latest
```

---

## 🌐 Pull Images on Other Machines

Once pushed, anyone can pull your images:

```bash
# Pull latest
docker pull yourusername/copilot-runtime-server:latest

# Pull specific version
docker pull yourusername/copilot-runtime-server:1.0.0

# Run pulled image
docker run -d \
  --name runtime-server \
  --env-file .env \
  -p 3001:3001 \
  yourusername/copilot-runtime-server:latest
```

---

## 🔐 Private Repositories

### Make Repository Private

1. Go to Docker Hub
2. Select your repository
3. Settings → Make Private

### Pull from Private Repository

```bash
# Login first
docker login

# Then pull
docker pull yourusername/private-image:latest
```

---

## 📊 Docker Hub Repository Settings

### Recommended Settings

**Description**: Add a clear description of what the image contains

**README**: Link to your GitHub repository or add documentation

**Automated Builds**: Connect to GitHub for automatic builds (optional)

**Webhooks**: Set up webhooks for CI/CD (optional)

---

## 🚨 Common Issues

### Issue 1: "denied: requested access to the resource is denied"

**Solution**: Make sure you're logged in and using the correct username

```bash
docker logout
docker login
```

### Issue 2: "unauthorized: authentication required"

**Solution**: Login again or check credentials

```bash
docker login --username=yourusername
```

### Issue 3: Image size too large

**Solution**: 
- Use multi-stage builds (already implemented)
- Remove unnecessary files
- Use `.dockerignore`

### Issue 4: Push is slow

**Solution**:
- Check internet connection
- Push during off-peak hours
- Use Docker Hub's CDN

---

## 📈 Monitoring Pulls

### Docker Hub Dashboard

View statistics at: `https://hub.docker.com/r/yourusername/copilot-runtime-server/tags`

Shows:
- Pull count
- Last pushed date
- Image size
- Vulnerabilities (with Docker Scout)

---

## 🔄 Update Workflow

### When You Make Changes

```bash
# 1. Rebuild the image
cd copilot-runtime-server
./build-and-run.sh

# 2. Increment version
VERSION="1.0.1"  # or 1.1.0, or 2.0.0

# 3. Tag with new version
docker tag copilot-runtime-server:latest yourusername/copilot-runtime-server:$VERSION
docker tag copilot-runtime-server:latest yourusername/copilot-runtime-server:latest

# 4. Push both tags
docker push yourusername/copilot-runtime-server:$VERSION
docker push yourusername/copilot-runtime-server:latest
```

---

## 🎯 Example: Complete Production Push

```bash
#!/bin/bash
# Complete production push workflow

set -e

DOCKER_USERNAME="yourusername"
VERSION="1.0.0"

echo "🔐 Logging into Docker Hub..."
docker login

echo ""
echo "🏗️  Building Runtime Server..."
cd /Users/hnankam/Downloads/data/project-hands-off/copilot-runtime-server
docker build -t copilot-runtime-server:latest --target production .

echo ""
echo "🏷️  Tagging images..."
docker tag copilot-runtime-server:latest $DOCKER_USERNAME/copilot-runtime-server:latest
docker tag copilot-runtime-server:latest $DOCKER_USERNAME/copilot-runtime-server:$VERSION
docker tag copilot-runtime-server:latest $DOCKER_USERNAME/copilot-runtime-server:production

echo ""
echo "📤 Pushing to Docker Hub..."
docker push $DOCKER_USERNAME/copilot-runtime-server:latest
docker push $DOCKER_USERNAME/copilot-runtime-server:$VERSION
docker push $DOCKER_USERNAME/copilot-runtime-server:production

echo ""
echo "✅ Successfully pushed!"
echo ""
echo "📋 Available tags:"
echo "   - $DOCKER_USERNAME/copilot-runtime-server:latest"
echo "   - $DOCKER_USERNAME/copilot-runtime-server:$VERSION"
echo "   - $DOCKER_USERNAME/copilot-runtime-server:production"
echo ""
echo "🌐 View at: https://hub.docker.com/r/$DOCKER_USERNAME/copilot-runtime-server"
```

---

**Ready to push!** Just replace `yourusername` with your Docker Hub username and run the commands.
