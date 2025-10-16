# Rebuild Instructions - Offscreen Document Fix

## The Problem

The offscreen document HTML is using **absolute paths** (`/assets/index-DXRcMO1n.js`) instead of relative paths. This doesn't work in Chrome extensions!

**Current (broken) HTML:**
```html
<script type="module" crossorigin src="/assets/index-DXRcMO1n.js"></script>
```

**Should be (working) HTML:**
```html
<script type="module" crossorigin src="../offscreen.js"></script>
```

## Why It's Broken

The Vite configuration was updated to fix this, but **the extension hasn't been rebuilt yet** with the new config. The dist folder still has the old build output.

## How to Fix

### Option 1: Using Your IDE Terminal (Recommended)

Open a terminal in VS Code/your IDE (which has pnpm/node configured) and run:

```bash
cd /Users/hnankam/Downloads/data/project-hands-off

# Build the offscreen package
cd pages/offscreen
npm run build

# Build the chrome extension  
cd ../../chrome-extension
npm run build
```

### Option 2: Rebuild Everything

If you have pnpm configured in your IDE terminal:

```bash
cd /Users/hnankam/Downloads/data/project-hands-off
pnpm build
```

### Option 3: Quick Fix with npx (If Node is Available)

```bash
cd /Users/hnankam/Downloads/data/project-hands-off/pages/offscreen
npx vite build

cd ../../chrome-extension  
npx vite build
```

## After Rebuild

1. **Check the HTML file:**
   ```bash
   cat dist/offscreen/src/index.html
   ```
   
   Should see: `src="../offscreen.js"` (relative path)

2. **Reload extension in Chrome:**
   - Go to `chrome://extensions/`
   - Click the reload icon on your extension

3. **Verify it works:**
   - Click "Service Worker" to open console
   - Should see:
     ```
     [Background] ✅ Offscreen document created
     [Offscreen] Starting offscreen document for embeddings...
     [Offscreen] ✅ Pipeline initialized
     ```

## What Changed

### Vite Config (Already Updated)

```typescript
// pages/offscreen/vite.config.mts
build: {
  rollupOptions: {
    input: {
      offscreen: resolve(srcDir, 'index.html'), // Named entry
    },
    output: {
      entryFileNames: '[name].js',    // → offscreen.js
      chunkFileNames: '[name].js',    // No [hash]
      assetFileNames: '[name].[ext]', // No [hash]
    },
  },
}
```

### Background Script (Already Updated)

```typescript
// chrome-extension/src/background/index.ts
const OFFSCREEN_DOCUMENT_PATH = 'offscreen/src/index.html'; // Correct path
```

## Current Status

✅ Source code fixed
✅ Vite config updated  
❌ **Extension NOT rebuilt yet** ← YOU ARE HERE
⏳ Awaiting rebuild
⏳ Awaiting Chrome reload

## Alternative: Manual Fix (If Rebuild Fails)

If you can't rebuild, you can manually fix the HTML file:

1. Edit `dist/offscreen/src/index.html`
2. Change:
   ```html
   <script type="module" crossorigin src="/assets/index-DXRcMO1n.js"></script>
   ```
   To:
   ```html
   <script type="module" crossorigin src="../offscreen.js"></script>
   ```
3. Reload extension in Chrome

**Note:** This is temporary - will be overwritten on next build!

## Summary

**Problem:** HTML using absolute paths (doesn't work in extensions)
**Fix:** Updated Vite config to use relative paths  
**Status:** Needs rebuild
**Action:** Run build command in your IDE terminal (where pnpm/node is configured)

---

**Date:** October 16, 2025  
**Files Modified:**
- ✅ `pages/offscreen/vite.config.mts`
- ✅ `chrome-extension/src/background/index.ts`

**Awaiting:** Rebuild with new configuration

