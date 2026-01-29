# Frontend Backend Configuration

## Overview

This document describes how the Chrome Extension frontend connects to the backend services and how to configure these connections for different environments.

## Backend Services

The application uses two backend services:

1. **Runtime Server (Node.js)** - Port 3001
   - Main API endpoint for authentication, configuration, chat, admin, and workspace APIs
   - Environment Variable: `VITE_API_URL`
   - Default: `http://localhost:3001`

2. **Pydantic Backend (Python)** - Port 8001
   - AI agent execution, tool discovery, and deployment management
   - Environment Variable: `VITE_BACKEND_URL`
   - Default: `http://localhost:8001`

## Configuration

### Development Setup

1. **Copy the example environment file:**
   ```bash
   cp env.frontend.example .env
   ```

2. **Edit `.env` with your backend URLs:**
   ```env
   # Runtime Server (Node.js)
   VITE_API_URL=http://localhost:3001

   # Pydantic Backend (Python)
   VITE_BACKEND_URL=http://localhost:8001
   ```

3. **Build the extension:**
   ```bash
   pnpm build
   # or for development with hot reload
   pnpm dev
   ```

### Production Setup

For production deployments, update the `.env` file with your actual service URLs:

```env
# Production URLs
VITE_API_URL=https://runtime.yourdomain.com
VITE_BACKEND_URL=https://pydantic.yourdomain.com
```

**Important:** Vite embeds these variables at build time, so you must rebuild the extension after changing them.

## How It Works

### Environment Variable Loading

The frontend uses Vite's environment variable system:

- Variables prefixed with `VITE_` are exposed to the client code
- Accessed via `import.meta.env.VITE_*`
- Embedded at build time (not runtime)

### Fallback Behavior

If environment variables are not set, the application falls back to localhost:

```typescript
// Runtime Server
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Pydantic Backend
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
```

### Health Check on Startup

The application performs a health check on startup to validate backend connectivity:

- **Location:** `pages/side-panel/src/utils/backend-health-check.ts`
- **Triggered:** On application initialization in `pages/side-panel/src/index.tsx`
- **Behavior:**
  - Checks both services in parallel with 5-second timeout
  - Logs results to browser console
  - Stores status in sessionStorage for debugging
  - Non-blocking (app loads even if services are down)

#### Health Check Console Output

**When all services are healthy:**
```
✓ Backend Services Healthy
  Runtime Server: http://localhost:3001 (45ms)
  Pydantic Backend: http://localhost:8001 (62ms)
```

**When services are unavailable:**
```
⚠ Backend Service Issues Detected
  ✗ Runtime Server (http://localhost:3001): Failed to fetch
  ✗ Pydantic Backend (http://localhost:8001): Timeout after 5000ms
```

### Configuration Files

| File | Purpose |
|------|---------|
| `env.frontend.example` | Template for frontend environment variables |
| `pages/side-panel/src/constants/index.ts` | Centralized configuration constants |
| `pages/side-panel/src/vite-env.d.ts` | TypeScript definitions for environment variables |
| `pages/side-panel/src/utils/backend-health-check.ts` | Backend connectivity validation |

## Usage in Code

### Accessing Backend URLs

**Runtime Server (Node.js):**
```typescript
import { API_CONFIG } from '@src/constants';

// Base URL
const baseUrl = API_CONFIG.BASE_URL;

// Full endpoint
const configUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CONFIG}`;
```

**Pydantic Backend (Python):**
```typescript
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
const toolsUrl = `${backendUrl}/tools/${agentType}/${modelType}`;
```

### Performing Health Checks

```typescript
import { checkBackendHealth, logHealthCheckResults } from '@src/utils/backend-health-check';

// Check health of all services
const health = await checkBackendHealth();

// Log results to console
logHealthCheckResults(health);

// Check if all services are healthy
if (health.allHealthy) {
  console.log('All services are operational');
}

// Get user-friendly error message
const errorMessage = getHealthCheckErrorMessage(health);
if (errorMessage) {
  alert(errorMessage);
}
```

## CORS Configuration

For the frontend to communicate with backend services, ensure CORS is properly configured:

### Runtime Server (Node.js)

In `copilot-runtime-server/.env`:
```env
CORS_ORIGINS=http://localhost:3000,chrome-extension://your-extension-id
```

For production:
```env
CORS_ORIGINS=https://yourdomain.com,chrome-extension://your-extension-id
```

### Pydantic Backend (Python)

The Python service automatically allows CORS from all origins in development mode. For production, configure allowed origins in `copilotkit-pydantic/main.py`.

## Troubleshooting

### Backend Services Not Reachable

**Symptom:** Console shows health check failures

**Solutions:**
1. Verify services are running:
   ```bash
   # Runtime Server
   cd copilot-runtime-server
   npm start
   
   # Pydantic Backend
   cd copilotkit-pydantic
   python main.py
   ```

2. Check environment variables:
   ```bash
   # View current configuration
   cat .env
   ```

3. Verify CORS configuration allows your extension origin

4. Check browser console for detailed error messages

### Environment Variables Not Applied

**Symptom:** Application still uses localhost after setting environment variables

**Solutions:**
1. Rebuild the extension (Vite embeds variables at build time):
   ```bash
   pnpm build
   ```

2. Verify `.env` file is in the project root (not in subdirectories)

3. Ensure variable names are correct (`VITE_API_URL`, `VITE_BACKEND_URL`)

4. Check that variables are prefixed with `VITE_` (required by Vite)

### Health Check Timeouts

**Symptom:** Health check shows timeout errors

**Solutions:**
1. Increase timeout in `backend-health-check.ts` (default: 5000ms)
2. Check network connectivity
3. Verify backend services are not overloaded
4. Check for firewall or proxy issues

## Migration from Old Configuration

If you were using the old `VITE_RUNTIME_SERVER_URL` variable:

1. Update your `.env` file:
   ```diff
   - VITE_RUNTIME_SERVER_URL=http://localhost:3001
   + VITE_API_URL=http://localhost:3001
   + VITE_BACKEND_URL=http://localhost:8001
   ```

2. Rebuild the extension:
   ```bash
   pnpm build
   ```

## Best Practices

1. **Never commit `.env` files** - They contain environment-specific configuration
2. **Use `env.frontend.example` as a template** - Keep it updated with all required variables
3. **Rebuild after environment changes** - Vite embeds variables at build time
4. **Monitor health checks** - Check browser console for connectivity issues
5. **Configure CORS properly** - Ensure backend services allow your extension origin
6. **Use production URLs in production** - Don't use localhost in production builds

## Related Documentation

- [Backend Configuration](copilot-runtime-server/README.md)
- [Python Service Configuration](copilotkit-pydantic/README.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Docker Compose Setup](DOCKER_COMPOSE_CHANGES.md)
