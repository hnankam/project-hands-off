# Content Security Policy (CSP) Fix - Railway Integration

## ✅ Issue Resolved!

The Chrome extension was blocking connections to Railway URLs due to Content Security Policy restrictions. This has been fixed!

---

## 🐛 The Problem

**Error**: Content Security Policy directive "connect-src 'self' ..." was blocking connections to:
- `https://copilot-runtime-server-production.up.railway.app`
- `https://copilotkit-pydantic-production.up.railway.app`

**Symptoms**:
- CSP violation errors in console
- "Refused to connect" errors
- Extension couldn't fetch from Railway services

---

## ✅ The Solution

Updated `chrome-extension/manifest.ts` to include Railway URLs in the Content Security Policy's `connect-src` directive.

### What Was Added

```typescript
content_security_policy: {
  extension_pages: "... connect-src 'self' ... https://*.up.railway.app https://copilot-runtime-server-production.up.railway.app https://copilotkit-pydantic-production.up.railway.app ..."
}
```

### Railway URLs Added:
1. **Wildcard**: `https://*.up.railway.app` (allows all Railway deployments)
2. **Runtime Server**: `https://copilot-runtime-server-production.up.railway.app`
3. **Pydantic Backend**: `https://copilotkit-pydantic-production.up.railway.app`

---

## 🔄 How to Apply the Fix

### Step 1: Reload Extension in Chrome

1. Open Chrome and navigate to: `chrome://extensions/`
2. Find your extension
3. Click the **reload** icon (circular arrow)

**Or** unload and reload:
1. Click "Remove" on the old version
2. Click "Load unpacked"
3. Select the `dist/` folder

### Step 2: Verify the Fix

Open browser console (F12) and run:

```javascript
// Test Runtime Server
fetch('https://copilot-runtime-server-production.up.railway.app/health')
  .then(r => r.json())
  .then(d => console.log('✅ Runtime Server:', d))
  .catch(e => console.error('❌ Runtime Server:', e))

// Test Pydantic Backend
fetch('https://copilotkit-pydantic-production.up.railway.app/healthz')
  .then(r => r.json())
  .then(d => console.log('✅ Pydantic Backend:', d))
  .catch(e => console.error('❌ Pydantic Backend:', e))
```

**Expected Output** (no CSP errors):
```
✅ Runtime Server: {status: "ok", db: true, ...}
✅ Pydantic Backend: {status: "ok"}
```

### Step 3: Test Extension Features

- Open the extension side panel
- Try sending a chat message
- Verify agents respond
- Check Admin Tools

---

## 📋 Complete Integration Checklist

- [x] **.env** configured with Railway URLs (CEB_ prefix)
- [x] **Frontend code** updated to use `process.env.CEB_*`
- [x] **Content Security Policy** updated with Railway URLs
- [x] **Extension built** successfully
- [ ] **Extension reloaded** in Chrome
- [ ] **Railway connectivity** verified
- [ ] **Chat functionality** tested
- [ ] **Tools execution** verified

---

## 🔍 What Changed

### File: `chrome-extension/manifest.ts`

**Before**:
```typescript
content_security_policy: {
  extension_pages: "... connect-src 'self' ws://localhost:* http://localhost:* https://localhost:* ..."
}
```

**After**:
```typescript
content_security_policy: {
  extension_pages: "... connect-src 'self' ws://localhost:* http://localhost:* https://localhost:* https://*.up.railway.app https://copilot-runtime-server-production.up.railway.app https://copilotkit-pydantic-production.up.railway.app ..."
}
```

### Generated File: `dist/manifest.json`

The build process automatically generates `dist/manifest.json` from `chrome-extension/manifest.ts`, including the updated CSP.

---

## 🧪 Testing the Complete Stack

### 1. Extension → Runtime Server

```javascript
// From extension side panel
fetch('https://copilot-runtime-server-production.up.railway.app/health')
  .then(r => r.json())
  .then(console.log)
```

Expected: `{status: "ok", db: true, ...}`

### 2. Runtime Server → Pydantic Backend

Check Railway logs for Runtime Server - should show successful connections to pydantic backend.

### 3. End-to-End Agent Request

1. Open extension
2. Send a message: "Hello, can you help me?"
3. Verify response from AI agent
4. Check Railway logs:
   - Runtime Server: Incoming request logged
   - Pydantic Backend: Agent execution logged

---

## 🐛 Troubleshooting

### Issue: Still getting CSP errors

**Solution**:
1. Verify you reloaded the extension (`chrome://extensions/`)
2. Check manifest in `dist/manifest.json` has Railway URLs
3. Rebuild extension: `pnpm build`
4. Clear browser cache and reload extension

### Issue: 404 or connection refused

**Solution**:
1. Verify Railway services are running
2. Test URLs directly in browser:
   - https://copilot-runtime-server-production.up.railway.app/health
   - https://copilotkit-pydantic-production.up.railway.app/healthz
3. Check Railway dashboard for service status

### Issue: CORS errors

**Solution**:
Add your extension ID to CORS configuration on Railway services.

**Runtime Server environment**:
```env
CORS_ORIGINS=chrome-extension://YOUR-EXTENSION-ID
```

Find your extension ID at `chrome://extensions/` (developer mode must be enabled).

---

## 📊 Complete Architecture with CSP

```
┌─────────────────────────────────────────────────────────────┐
│          Chrome Extension                                   │
│          (Content Security Policy)                          │
│                                                             │
│  connect-src:                                               │
│    ✅ https://*.up.railway.app                              │
│    ✅ https://copilot-runtime-server-production...          │
│    ✅ https://copilotkit-pydantic-production...             │
│                                                             │
│  Environment:                                               │
│    CEB_API_URL=https://copilot-runtime-server...           │
│    CEB_BACKEND_URL=https://copilotkit-pydantic...          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS (allowed by CSP)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│    Runtime Server (Railway)                                 │
│    https://copilot-runtime-server-production...             │
│                                                             │
│    PYDANTIC_SERVICE_URL=                                   │
│      https://copilotkit-pydantic-production...             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│    Pydantic Backend (Railway)                               │
│    https://copilotkit-pydantic-production...                │
│                                                             │
│    Connected to: PostgreSQL, Redis, Ably                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Related Documentation

- **Chrome Extension Setup**: `CHROME_EXTENSION_RAILWAY_SETUP.md`
- **Complete Railway Deployment**: `COMPLETE_RAILWAY_DEPLOYMENT.md`
- **Environment Configuration**: `.env` file with `CEB_` variables
- **MDN CSP Reference**: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

---

## 🎯 Summary of All Changes

### Configuration Files
1. **`.env`**: Added Railway URLs with `CEB_` prefix
2. **`chrome-extension/manifest.ts`**: Added Railway URLs to CSP

### Code Changes
3. **`pages/side-panel/src/constants/index.ts`**: Changed to `process.env.CEB_API_URL`
4. **`pages/side-panel/src/vite-env.d.ts`**: Updated TypeScript types
5. **All files in `pages/`**: Replaced `VITE_*` with `CEB_*` variables

### Build Process
6. Extension rebuilt with `pnpm build`
7. Manifest generated in `dist/manifest.json` with updated CSP

---

## ✅ Status

**All Changes Complete!**

✅ Environment variables configured  
✅ Code updated to use Railway URLs  
✅ Content Security Policy updated  
✅ Extension built successfully  
✅ Manifest generated with Railway URLs  

**Next Step**: Reload the extension in Chrome!

---

**Date**: January 21, 2026  
**Status**: ✅ **READY TO RELOAD**
