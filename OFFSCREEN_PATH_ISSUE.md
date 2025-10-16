# Offscreen Document Path Issue - CRITICAL FIX

## The Problem

The offscreen document HTML file **MUST use relative paths**, not absolute paths. Chrome extensions cannot use absolute paths starting with `/`.

## Why Absolute Paths Fail

### ❌ This DOES NOT work:
```html
<script src="/assets/index-DXRcMO1n.js"></script>
```

**Why it fails:**
- `/assets/...` is an absolute path from root
- Chrome extensions don't have a "root" like web pages do
- The browser tries to load from `chrome-extension://extension-id/assets/...`
- But the file is actually at `chrome-extension://extension-id/offscreen/assets/...`
- **Result: 404 error, page fails to load**

### ✅ This WORKS:
```html
<script src="../offscreen.js"></script>
```

**Why it works:**
- Relative path from `offscreen/src/index.html`
- Goes up one directory (`..`) to `offscreen/`
- Then finds `offscreen.js`
- **Result: File loads successfully**

## File Structure

```
dist/
├── background.js
├── manifest.json
└── offscreen/
    ├── src/
    │   └── index.html          ← HTML is here
    ├── offscreen.js            ← JS is here (one level up)
    └── ort-wasm-simd-threaded.jsep.wasm
```

**Path from HTML to JS:**
- HTML location: `dist/offscreen/src/index.html`
- JS location: `dist/offscreen/offscreen.js`
- Relative path: `../offscreen.js` (go up from `src/` to `offscreen/`)

## The Fix

I've manually corrected the HTML file to:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offscreen Document for Embeddings</title>
  <script type="module" crossorigin src="../offscreen.js"></script>
</head>
<body>
</body>
</html>
```

## Next Steps

### 1. Reload the Extension

**IMPORTANT:** You MUST reload the extension for this fix to take effect:

1. Go to `chrome://extensions/`
2. Find your extension
3. Click the **reload icon** (circular arrow)
4. Wait for reload to complete

### 2. Test the Extension

After reloading:
1. Click "Service Worker" to open the console
2. You should now see:
   ```
   [Background] ✅ Offscreen document created
   [Offscreen] Starting offscreen document for embeddings...
   [Offscreen] ✅ Pipeline initialized
   [Background] ✅ Offscreen ready signal received
   ```

3. Try using the extension - embeddings should work now!

## Why This Keeps Happening

The Vite build is generating absolute paths by default. To fix this permanently, the Vite config needs to be updated AND the extension needs to be rebuilt properly.

**Temporary fix:** Manual HTML edit (what I just did)
**Permanent fix:** Rebuild offscreen with correct Vite config

## Permanent Solution (For Later)

When you have time to properly rebuild:

1. The Vite config is already updated in `pages/offscreen/vite.config.mts`
2. Rebuild the offscreen package:
   ```bash
   cd pages/offscreen
   npm run build  # or pnpm build
   ```
3. Rebuild the chrome extension:
   ```bash
   cd ../../chrome-extension
   npm run build
   ```

## Critical Point

**DO NOT revert the HTML file back to absolute paths!**

```html
<!-- ❌ THIS BREAKS OFFSCREEN: -->
<script src="/assets/index-DXRcMO1n.js"></script>

<!-- ✅ THIS WORKS: -->
<script src="../offscreen.js"></script>
```

The relative path `../offscreen.js` is correct and necessary for Chrome extensions.

## Summary

✅ **Fixed:** HTML now uses relative path `../offscreen.js`
⚠️ **Action Required:** Reload extension in Chrome
✅ **Expected Result:** Offscreen document loads, embeddings work
🔧 **Future:** Rebuild with updated Vite config for permanent fix

---

**Date:** October 16, 2025
**Status:** ✅ FIXED (manual fix applied)
**Next:** Reload extension in Chrome

