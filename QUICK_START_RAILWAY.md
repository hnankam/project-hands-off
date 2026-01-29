# Quick Start - Railway Deployment

## 🚀 Your Extension is Ready!

All configuration is complete. Just **reload the extension** in Chrome!

---

## ⚡ Quick Actions

### Reload Extension
```
1. Open: chrome://extensions/
2. Find your extension
3. Click: RELOAD button (↻)
```

### Switch Environments
```bash
# Use Railway (production)
./switch-env.sh railway
pnpm build

# Use Local (development)
./switch-env.sh local
pnpm build
```

### Test Connectivity
Open browser console (F12):
```javascript
fetch('https://copilot-runtime-server-production.up.railway.app/health')
  .then(r => r.json()).then(console.log)
```

---

## 📋 What's Configured

✅ **Environment Variables** (`.env`)
```env
CEB_API_URL=https://copilot-runtime-server-production.up.railway.app
CEB_BACKEND_URL=https://copilotkit-pydantic-production.up.railway.app
```

✅ **Content Security Policy** (`chrome-extension/manifest.ts`)
- Added Railway URLs to CSP connect-src

✅ **Frontend Code** (`pages/` directory)
- Updated to use `process.env.CEB_API_URL`
- Updated to use `process.env.CEB_BACKEND_URL`

✅ **Extension Built** (`dist/` folder)
- Manifest includes Railway URLs in CSP
- Ready to load in Chrome

---

## 🧪 Quick Test

After reloading extension:

1. **Open Extension** - Click extension icon
2. **Send Message** - Type "Hello" in chat
3. **Verify Response** - Agent should respond
4. **Check Logs** - Railway dashboard should show requests

---

## 📊 Your Services

| Service | URL | Status |
|---------|-----|--------|
| **Runtime** | https://copilot-runtime-server-production.up.railway.app | ✅ Live |
| **Backend** | https://copilotkit-pydantic-production.up.railway.app | ✅ Live |

---

## 🐛 Quick Troubleshooting

**CSP Errors Still Appearing?**
→ Reload extension in chrome://extensions/

**Extension Not Connecting?**
→ Run: `pnpm build` and reload extension

**Want to Use Local Services?**
→ Run: `./switch-env.sh local && pnpm build`

---

## 📚 Full Documentation

- **CSP Fix**: `CSP_FIX_SUMMARY.md`
- **Extension Setup**: `CHROME_EXTENSION_RAILWAY_SETUP.md`
- **Complete Guide**: `COMPLETE_RAILWAY_DEPLOYMENT.md`

---

**Last Updated**: January 21, 2026  
**Status**: ✅ **READY TO USE**
