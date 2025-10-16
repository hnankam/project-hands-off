# Offscreen Document Loading Fix

## Problem

The offscreen document is failing to load with "Page failed to load" error. This happened after we cleaned up the unused worker files.

## Root Cause

The issue is that we changed the path but the files are in the wrong location after build. The current setup has:
- HTML: `dist/offscreen/src/index.html`
- JS: `dist/offscreen/offscreen.js`
- HTML references: `../offscreen.js` (relative path)

## Current Status

✅ **Fixed the background script path**
- Changed from: `offscreen/offscreen.html`
- Changed to: `offscreen/src/index.html` ✅

## Solution Options

### Option 1: Keep Current Structure (Recommended)
The current structure should work with the path `offscreen/src/index.html`.

**Next steps:**
1. Reload the extension in Chrome
2. Check if it works now

### Option 2: Simplify Build Output (If still broken)
Modify the Vite config to put everything at the root level.

## How to Test

1. **Reload Extension**
   ```
   Chrome → Extensions → Reload icon
   ```

2. **Open Console**
   ```
   Chrome → Extensions → Service Worker (inspect)
   ```

3. **Look for logs:**
   ```
   [Background] ✅ Offscreen document created
   [Background] ✅ Offscreen ready signal received
   [Offscreen] Starting offscreen document for embeddings...
   [Offscreen] ✅ Pipeline initialized
   ```

## If Still Broken

If the offscreen document still fails to load, the issue might be with the Vite build output. Try this fix:

### Fix Vite Config to Put HTML at Root

```typescript
// pages/offscreen/vite.config.mts
export default defineConfig({
  // ... existing config
  build: {
    outDir: resolve(rootDir, '..', '..', 'dist', 'offscreen'),
    rollupOptions: {
      input: resolve(srcDir, 'index.html'),
      output: {
        // Put HTML at root, not in src/
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
```

Then update background path:
```typescript
const OFFSCREEN_DOCUMENT_PATH = 'offscreen/index.html';
```

## Current File Structure

```
dist/
├── offscreen/
│   ├── src/
│   │   └── index.html            ← HTML file here
│   ├── offscreen.js               ← JS file here
│   └── ort-wasm-simd-threaded.jsep.wasm
└── background.js                  ← References: 'offscreen/src/index.html'
```

## What Changed

**Before Cleanup:**
- Path: `offscreen/src/index.html` ✅ (worked)
- Files: Everything in correct places

**After Cleanup (broken):**
- Path: Changed to `offscreen/offscreen.html` ❌
- Files: Still at `offscreen/src/index.html`
- Result: Path mismatch!

**After Fix (now):**
- Path: Reverted to `offscreen/src/index.html` ✅
- Files: Still at `offscreen/src/index.html` ✅
- Result: Should work!

## Action Required

**You need to rebuild the extension for the path change to take effect:**

```bash
# Option 1: Full rebuild (if you have pnpm)
pnpm build

# Option 2: Using npm (if pnpm not available)
npm run build

# Option 3: Just rebuild chrome-extension (faster)
cd chrome-extension && npm run build
```

**Then reload the extension in Chrome.**

## Verification

After reload, check console logs:
1. Open Chrome → Extensions
2. Click "Service Worker" under your extension
3. Look for these logs:

✅ **Success logs:**
```
[Background] ✅ Offscreen document created, waiting for ready signal...
[Background] ✅ Offscreen ready signal received
[Offscreen] Starting offscreen document for embeddings...
[Offscreen] ✅ Pipeline initialized
```

❌ **Error logs:**
```
[Background] ❌ Offscreen ready timeout
[useEmbeddingWorker] Initialization failed: Error: Offscreen ready timeout
```

## Summary

**Current Status:** ✅ Path fixed in source code
**Next Step:** Rebuild extension
**Expected Result:** Offscreen document should load successfully

---

**Date**: October 16, 2025
**Status**: Awaiting rebuild
**Files Changed**: 
- `chrome-extension/src/background/index.ts` ✅
- `pages/offscreen/vite.config.mts` (attempted optimization)

