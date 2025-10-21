# Fix Offscreen Syntax Error

## The Problem

The offscreen document has a **syntax error** in the compiled JavaScript:
```
Uncaught SyntaxError: Unexpected token '}'
    at offscreen.js:2897
```

This is preventing the offscreen from initializing, which blocks the embedding service.

## Solution: Clean Build

The build output is corrupted. You need to clean and rebuild:

### Option 1: Clean and Rebuild
```bash
# Remove old build artifacts
rm -rf dist/
rm -rf pages/offscreen/dist/
rm -rf .turbo/

# Rebuild everything
npm run build
# OR: pnpm build
# OR: yarn build
```

### Option 2: Clean node_modules (if option 1 doesn't work)
```bash
# Nuclear option - full clean
rm -rf node_modules/
rm -rf pages/offscreen/node_modules/
rm -rf package-lock.json

# Reinstall and rebuild
npm install
npm run build
```

## After Rebuilding

1. **Reload the extension** in `chrome://extensions`
2. **Check the console** - you should see:
   ```
   [Offscreen] Ready to receive messages
   [Offscreen] Sending ready signal to background...
   [Offscreen] ✅ Ready signal sent successfully
   [Background] ✅ Offscreen document ready
   ```

## What Caused This

The TypeScript-to-JavaScript compilation likely failed partially, producing invalid JS. This can happen when:
- Build process was interrupted
- Disk cache corruption
- File watcher issues during hot reload
- Turbo cache corruption

A clean build should fix it.

