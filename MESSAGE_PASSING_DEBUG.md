# Message Passing Communication Debug Log

## Current Status

### ✅ Code Changes Complete
All message passing has been updated to use `chrome.runtime.onMessage` pattern exclusively for embedding operations.

### ❌ Not Built Yet
The changes are in source code but **not compiled**. The extension is running old code.

## What We Changed

### 1. Background Script (`chrome-extension/src/background/index.ts`)
- Added detailed logging for initialization requests
- Shows when request received and response sent
- Uses `onMessage` pattern for all embedding messages

### 2. Side Panel Hook (`pages/side-panel/src/hooks/useEmbeddingWorker.ts`)
- Added content size logging (KB/MB)
- Added serialization timing (measures freeze duration)
- Added 30-second timeout for initialization

### 3. Offscreen Document (`pages/offscreen/src/offscreen.ts`)
- Already using `onMessage` pattern correctly

## The Real Problem We're Solving

**UI Freeze Cause:** `chrome.runtime.sendMessage` does **synchronous JSON serialization** in the main thread.

For large content (1-2 MB), this blocks the UI for 500-2000ms.

## Debugging Flow (After Rebuild)

### Expected Log Sequence for Initialization:

**Side Panel:**
```
[useEmbeddingWorker] 📤 Sending init request with ID: init_1234...
[useEmbeddingWorker] ✅ Init request sent successfully
```

**Background:**
```
[Background] 📥 Received initializeEmbedding request: init_1234...
[Background] 📤 Sending initializeEmbeddingResponse (success): init_1234...
[Background] ✅ initializeEmbeddingResponse sent successfully
```

**Side Panel:**
```
[useEmbeddingWorker] ✅ Embedding service initialized
```

### Expected Log Sequence for Embedding:

**Side Panel:**
```
[useEmbeddingWorker] 📤 Sending page content embedding request...
[useEmbeddingWorker] 📦 Content size: 1250 KB ( 1.22 MB)
[useEmbeddingWorker] 🔄 Starting sendMessage (serialization begins now)...
[UI FREEZES HERE - 800ms]
[useEmbeddingWorker] ✅ Request sent, waiting for result... (serialization took 800 ms)
```

**Background:**
```
[Background] 📥 Processing embedding request...
[Background] 🚀 Batch embedding: 24 items in one request
```

**Offscreen:**
```
[Offscreen] Batch embedding request: 24 texts
[Offscreen] 🚀 PARALLEL BATCH PROCESSING
[Offscreen] ✅ Batch embedding complete: 24 embeddings
```

**Background:**
```
[Background] ✅ Batch embedding complete: 24 embeddings generated
```

**Side Panel:**
```
[useEmbeddingWorker] ✅ Page content embedded: 384 dimensions, 22 chunks
```

## Next Steps

1. **Rebuild** the extension (see `REBUILD_NOW.md`)
2. **Reload** the extension in Chrome
3. **Open** the side panel
4. **Check logs** - should see all the 📥 📤 ✅ messages
5. **Measure freeze** - logs will show exact serialization time

## If Still Freezing After Rebuild

The freeze is **expected** with direct message passing of large content. The only true fix is:

**Option A:** Use `chrome.storage.local` (async storage, no serialization freeze)
**Option B:** Stream the content in chunks
**Option C:** Use SharedArrayBuffer (complex, requires COOP/COEP headers)
**Option D:** Accept the freeze and show a loading indicator

You previously requested **no storage**, so we're using direct messaging, which **will cause a freeze** during serialization of large content.

