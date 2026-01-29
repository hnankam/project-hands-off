# Chrome Extension - Railway Deployment Integration

## ✅ Setup Complete!

Your Chrome extension has been successfully configured to work with both Railway deployments:
- **Runtime Server**: https://copilot-runtime-server-production.up.railway.app
- **Pydantic Backend**: https://copilotkit-pydantic-production.up.railway.app

---

## 🔧 What Was Fixed

### Issue
The Chrome extension boilerplate requires all environment variables to use the `CEB_` prefix (Chrome Extension Boilerplate), but the configuration was using `VITE_` prefix.

### Solution
1. ✅ Updated `.env` file to use `CEB_` prefixed variables
2. ✅ Updated all frontend code to use `process.env.CEB_*` instead of `import.meta.env.VITE_*`
3. ✅ Updated TypeScript type definitions for `CEB_` variables
4. ✅ Successfully built the extension with Railway URLs

---

## 📝 Environment Variables

### File: `.env` (root directory)

```env
# Chrome Extension Boilerplate Environment Variables
# All custom environment variables must start with CEB_ prefix

# Runtime Server (Railway Deployment)
CEB_API_URL=https://copilot-runtime-server-production.up.railway.app

# Pydantic Backend (Railway Deployment)
CEB_BACKEND_URL=https://copilotkit-pydantic-production.up.railway.app

# Optional build configuration
CEB_DEV_LOCALE=
CEB_CI=
```

### How Environment Variables Work

1. **Storage**: Variables are stored in `.env` with `CEB_` prefix
2. **Build Process**: The `set-global-env.sh` script validates that all variables start with `CEB_`
3. **Runtime Access**: Code accesses them via `process.env.CEB_API_URL` and `process.env.CEB_BACKEND_URL`
4. **Build System**: Turbo.json defines `globalEnv: ["CEB_*", "CLI_CEB_*"]` to make them available during build

---

## 🚀 Building the Extension

### For Production (Railway URLs)

```bash
# Build with Railway URLs
pnpm build

# The extension will be built in the dist/ directory
```

### For Development (Local servers)

Update `.env` to use localhost:

```env
CEB_API_URL=http://localhost:3001
CEB_BACKEND_URL=http://localhost:8001
```

Then build:

```bash
pnpm build
```

Or run in development mode:

```bash
pnpm dev
```

---

## 📦 Loading the Extension in Chrome

1. **Open Chrome Extensions Page**:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

2. **Load the Extension**:
   - Click "Load unpacked"
   - Select the `dist/` folder from your project

3. **Verify Installation**:
   - You should see the extension icon in Chrome
   - Click the extension icon to open the side panel

4. **Test Functionality**:
   - Open the side panel
   - Try sending a message to test the connection to Railway
   - Check browser console (F12) for any errors

---

## 🧪 Testing the Integration

### 1. Check Backend Connectivity

Open browser console (F12) and run:

```javascript
// Test Runtime Server
fetch('https://copilot-runtime-server-production.up.railway.app/health')
  .then(r => r.json())
  .then(d => console.log('Runtime Server:', d))

// Test Pydantic Backend
fetch('https://copilotkit-pydantic-production.up.railway.app/healthz')
  .then(r => r.json())
  .then(d => console.log('Pydantic Backend:', d))
```

Expected output:
```
Runtime Server: {status: "ok", db: true, message: "CopilotKit Runtime Server is running", ...}
Pydantic Backend: {status: "ok"}
```

### 2. Test Extension Features

- **Chat**: Send a message and verify it reaches Railway
- **Tools**: Test tool execution (GitHub, Jira, etc.)
- **Context**: Verify context selection works
- **Admin Panel**: Check agents/models configuration

### 3. Check Railway Logs

Monitor both services in Railway dashboard:
- Runtime Server logs should show incoming requests
- Pydantic Backend logs should show agent executions

---

## 🔍 Code Changes Made

### Files Modified

1. **`.env`** - Updated to use `CEB_` prefix
2. **`pages/side-panel/src/constants/index.ts`** - Changed `import.meta.env.VITE_*` to `process.env.CEB_*`
3. **`pages/side-panel/src/vite-env.d.ts`** - Updated TypeScript definitions
4. **All files in `pages/`** - Replaced `VITE_API_URL` and `VITE_BACKEND_URL` with `CEB_` versions

### Key Code Changes

**Before**:
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
```

**After**:
```typescript
const API_BASE_URL = process.env.CEB_API_URL || 'http://localhost:3001';
```

**Type Definitions** (`vite-env.d.ts`):
```typescript
declare namespace NodeJS {
  interface ProcessEnv {
    readonly CEB_API_URL?: string;
    readonly CEB_BACKEND_URL?: string;
    readonly CEB_DEV_LOCALE?: string;
    readonly CEB_CI?: string;
    readonly CEB_NODE_ENV?: 'development' | 'production';
  }
}
```

---

## 🔄 Switching Between Environments

### Quick Switch Script

Create `switch-env.sh`:

```bash
#!/bin/bash

if [ "$1" == "local" ]; then
    cat > .env << 'EOF'
# Local Development
CEB_API_URL=http://localhost:3001
CEB_BACKEND_URL=http://localhost:8001
CEB_DEV_LOCALE=
CEB_CI=
EOF
    echo "✅ Switched to LOCAL environment"
elif [ "$1" == "railway" ]; then
    cat > .env << 'EOF'
# Railway Production
CEB_API_URL=https://copilot-runtime-server-production.up.railway.app
CEB_BACKEND_URL=https://copilotkit-pydantic-production.up.railway.app
CEB_DEV_LOCALE=
CEB_CI=
EOF
    echo "✅ Switched to RAILWAY environment"
else
    echo "Usage: ./switch-env.sh [local|railway]"
fi
```

Usage:
```bash
# Switch to Railway
./switch-env.sh railway
pnpm build

# Switch to local
./switch-env.sh local
pnpm build
```

---

## 🐛 Troubleshooting

### Issue: Extension doesn't load

**Solution**:
1. Check for errors in `chrome://extensions/`
2. Ensure you loaded the `dist/` folder (not the project root)
3. Rebuild the extension: `pnpm build`

### Issue: Cannot connect to Railway

**Solution**:
1. Verify Railway services are running
2. Check `.env` file has correct URLs
3. Rebuild extension after changing `.env`
4. Check CORS configuration on Railway services

### Issue: Build fails with "Invalid key" error

**Solution**:
- Ensure all variables in `.env` start with `CEB_` prefix
- No empty lines between variables
- No `VITE_` prefixed variables in `.env`

### Issue: Extension connects to localhost instead of Railway

**Solution**:
1. Verify `.env` has Railway URLs
2. Rebuild the extension: `pnpm build`
3. Reload the extension in Chrome
4. Check browser console for the actual URLs being used

### Issue: CORS errors

**Solution**:
Add CORS configuration to Railway services:

**Runtime Server**:
```env
CORS_ORIGINS=chrome-extension://your-extension-id
```

**Pydantic Backend**:
```env
CORS_ORIGINS=chrome-extension://your-extension-id
```

Find your extension ID at `chrome://extensions/`

---

## 📊 Complete Architecture

```
┌─────────────────────────────────────────────┐
│        Chrome Extension                     │
│        (User's Browser)                     │
│                                             │
│  CEB_API_URL=                              │
│    https://copilot-runtime-server...       │
│  CEB_BACKEND_URL=                          │
│    https://copilotkit-pydantic...          │
└────────────────┬────────────────────────────┘
                 │
                 │ HTTPS
                 ▼
┌─────────────────────────────────────────────┐
│    Runtime Server (Railway)                 │
│    https://copilot-runtime-server...        │
│                                             │
│    PYDANTIC_SERVICE_URL=                   │
│      https://copilotkit-pydantic...        │
└────────────────┬────────────────────────────┘
                 │
                 │ HTTPS
                 ▼
┌─────────────────────────────────────────────┐
│    Pydantic Backend (Railway)               │
│    https://copilotkit-pydantic...           │
│                                             │
│    - PostgreSQL (SaaS)                      │
│    - Redis (SaaS)                           │
│    - Ably Pub/Sub                           │
└─────────────────────────────────────────────┘
```

---

## ✅ Verification Checklist

- [x] `.env` file created with `CEB_` prefixed variables
- [x] All code updated to use `process.env.CEB_*`
- [x] TypeScript definitions updated
- [x] Extension builds successfully
- [x] Railway URLs configured correctly
- [ ] Extension loaded in Chrome
- [ ] Extension connects to Railway services
- [ ] Chat functionality works
- [ ] Tools execute successfully
- [ ] Admin panel accessible

---

## 📚 Additional Documentation

- **Complete Railway Deployment**: `COMPLETE_RAILWAY_DEPLOYMENT.md`
- **Railway Integration**: `RAILWAY_INTEGRATION.md`
- **Build Scripts**: `BUILD_SCRIPTS_README.md`
- **Environment Package**: `packages/env/README.md`

---

## 🎉 Summary

**Your Chrome extension is now configured to use Railway deployments!**

✅ Environment variables use `CEB_` prefix  
✅ All code updated to use `process.env.CEB_*`  
✅ Extension builds successfully  
✅ Ready to load in Chrome  

**Next Steps**:
1. Load the extension in Chrome (`dist/` folder)
2. Test the connection to Railway services
3. Monitor Railway logs for requests
4. Enjoy your production-ready extension!

---

**Last Updated**: January 21, 2026  
**Status**: ✅ **READY FOR USE**
