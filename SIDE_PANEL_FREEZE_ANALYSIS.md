# Side Panel UI Freeze Analysis

## Problem Summary
The side panel UI freezes when embeddings are being generated, even though the embedding computation itself happens in an offscreen document. The main page remains responsive.

## Root Cause

### The Issue is NOT in Embedding Generation ✅
- Embedding generation correctly happens in the **offscreen document** (asynchronous, non-blocking)
- Background script properly forwards requests to offscreen via `chrome.runtime.sendMessage`
- This part works as designed and doesn't block the UI

### The Issue IS in Database Storage ❌

The freeze occurs during the **storage phase** in the side panel:

**File: `packages/shared/lib/db/embeddings-storage.ts`**
```typescript
// Line 196 - THIS IS THE BLOCKING OPERATION
await surrealDB.query(`INSERT INTO html_chunks $records`, { records });
```

**File: `pages/side-panel/src/components/ChatSessionContainer.tsx`**
```typescript
// Lines 484-499 - Called in useEffect, blocks UI thread
await embeddingsStorage.storeHTMLChunks({
  pageURL,
  pageTitle,
  chunks: result.chunks.map((chunk: any, index: number) => ({
    text: chunk.text,
    html: chunk.html || '',
    embedding: chunk.embedding,
    index,
  })),
  sessionId,
});
```

## Why This Blocks the UI

### 1. **SurrealDB WASM Execution Model**
- SurrealDB uses **WebAssembly (WASM)** running in the browser context
- WASM execution is **synchronous** on the JavaScript main thread
- Even though the `query()` method returns a Promise, the WASM processing **blocks the event loop**
- Large batch inserts (100+ HTML chunks) take significant WASM processing time

### 2. **The Call Chain**
```
Side Panel UI (Main Thread)
  ↓
useEffect in ChatSessionContainer
  ↓
await embeddingsStorage.storeHTMLChunks()
  ↓
await surrealDB.query() [BLOCKS HERE]
  ↓
SurrealDB WASM Processing (Main Thread) ⚠️ FREEZE
  ↓
IndexedDB Write (Main Thread)
```

### 3. **Volume of Data**
Looking at the logs in `background/index.ts`:
- 100+ HTML chunks per page
- 10+ form field groups
- 10+ clickable element groups
- Each requires WASM processing + HNSW index building

## Evidence from Code

### Background Script (Non-blocking) ✅
**File: `chrome-extension/src/background/index.ts:76-91`**
```typescript
async function sendToOffscreen(message: any): Promise<any> {
  await setupOffscreenDocument();
  
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ ...message, target: 'offscreen' }, (response) => {
      // Properly async - doesn't block
    });
  });
}
```

### Offscreen Document (Non-blocking) ✅
**File: `pages/offscreen/src/offscreen.ts`**
- Runs in separate context
- Uses transformers.js for embeddings
- Properly isolated from UI

### Database Storage (BLOCKING) ❌
**File: `packages/shared/lib/db/embeddings-storage.ts:159-204`**
```typescript
async storeHTMLChunks(data: {
  pageURL: string;
  pageTitle: string;
  chunks: Array<{ text: string; html: string; embedding: number[]; index: number }>;
  sessionId?: string;
}): Promise<void> {
  // ...
  
  // Single batch insert - BLOCKS UI during WASM processing
  await surrealDB.query(`INSERT INTO html_chunks $records`, { records });
  //                     ↑ This await doesn't prevent blocking!
}
```

### SurrealDB Query Execution (BLOCKING) ❌
**File: `packages/shared/lib/db/surreal-db.ts:125-129`**
```typescript
async query<T>(sql: string, vars?: Record<string, unknown>): Promise<T> {
  const db = this.getInstance();
  const result = await db.query(sql, vars); // WASM blocks here
  return result as T;
}
```

## Why Async/Await Doesn't Prevent Blocking

The `await` keyword makes code **wait** for a promise, but it doesn't make **blocking operations non-blocking**:

1. **True async operation** (network request, file I/O):
   ```typescript
   await fetch(url); // Releases event loop while waiting
   ```

2. **WASM computation** (SurrealDB):
   ```typescript
   await db.query(sql); // Blocks event loop during WASM processing
   ```

The difference:
- Network/I/O: Browser can process other events while waiting
- WASM: JavaScript engine is **actively executing** WASM bytecode

## Solutions

### Option 1: Batch with Yielding (Recommended) 🌟
Break large inserts into smaller batches with `setTimeout` to yield control:

```typescript
async storeHTMLChunks(data: {
  pageURL: string;
  pageTitle: string;
  chunks: Array<{ text: string; html: string; embedding: number[]; index: number }>;
  sessionId?: string;
}): Promise<void> {
  const BATCH_SIZE = 10; // Insert 10 chunks at a time
  const timestamp = new Date();
  
  // Delete old chunks first
  await surrealDB.query(`DELETE FROM html_chunks WHERE pageURL = $url`, { url: data.pageURL });
  
  // Insert in batches with yielding
  for (let i = 0; i < data.chunks.length; i += BATCH_SIZE) {
    const batchChunks = data.chunks.slice(i, i + BATCH_SIZE);
    
    const records = batchChunks.map(chunk => ({
      pageURL: data.pageURL,
      pageTitle: data.pageTitle,
      chunkIndex: chunk.index,
      text: chunk.text,
      html: chunk.html,
      embedding: chunk.embedding,
      sessionId: data.sessionId || undefined,
      timestamp,
    }));
    
    // Insert batch
    await surrealDB.query(`INSERT INTO html_chunks $records`, { records });
    
    // Yield to browser between batches
    if (i + BATCH_SIZE < data.chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  console.log(`[EmbeddingsStorage] ✅ Stored ${data.chunks.length} HTML chunks in batches of ${BATCH_SIZE}`);
}
```

### Option 2: Use requestIdleCallback (Better UX)
Only process during idle time:

```typescript
async storeHTMLChunks(data: { /* ... */ }): Promise<void> {
  const BATCH_SIZE = 10;
  
  await surrealDB.query(`DELETE FROM html_chunks WHERE pageURL = $url`, { url: data.pageURL });
  
  for (let i = 0; i < data.chunks.length; i += BATCH_SIZE) {
    const batchChunks = data.chunks.slice(i, i + BATCH_SIZE);
    const records = /* ... */;
    
    await surrealDB.query(`INSERT INTO html_chunks $records`, { records });
    
    // Wait for idle time before next batch
    if (i + BATCH_SIZE < data.chunks.length) {
      await new Promise(resolve => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => resolve(undefined));
        } else {
          setTimeout(resolve, 0);
        }
      });
    }
  }
}
```

### Option 3: Progress Indicators
Add UI feedback during long operations:

```typescript
// In ChatSessionContainer.tsx
const [isStoringEmbeddings, setIsStoringEmbeddings] = useState(false);
const [storageProgress, setStorageProgress] = useState(0);

// Show progress bar while storing
{isStoringEmbeddings && (
  <div className="embedding-progress">
    <div className="progress-bar" style={{ width: `${storageProgress}%` }} />
    <span>Indexing page content... {storageProgress}%</span>
  </div>
)}
```

### Option 4: Web Worker (Advanced)
Move SurrealDB to a Web Worker (if supported):
- Requires checking if SurrealDB WASM works in workers
- More complex setup but completely non-blocking
- Best long-term solution

## Recommended Implementation

**Immediate Fix (Low effort, high impact):**
1. Implement Option 1 (Batch with Yielding)
2. Use `BATCH_SIZE = 10` for HTML chunks
3. Use `BATCH_SIZE = 5` for form fields and clickable elements (already grouped)

**Enhanced UX (Medium effort):**
1. Combine Option 1 + Option 3
2. Show progress indicator during storage
3. Allow users to continue interacting with UI

**Long-term Solution (High effort):**
1. Evaluate Web Worker support for SurrealDB
2. Move all database operations to worker
3. Use message passing for queries

## Files to Modify

1. **`packages/shared/lib/db/embeddings-storage.ts`**
   - Modify `storeHTMLChunks()` method (lines 159-204)
   - Modify `storeFormFields()` method (lines 209-249)
   - Modify `storeClickableElements()` method (lines 254-294)

2. **`pages/side-panel/src/components/ChatSessionContainer.tsx`**
   - Add progress state (optional)
   - Add UI feedback during storage (optional)

## Testing Verification

After implementing fix, verify:
1. ✅ Side panel remains responsive during embedding storage
2. ✅ Users can scroll, click, and interact with UI
3. ✅ Main page remains responsive (already working)
4. ✅ Embeddings are correctly stored in SurrealDB
5. ✅ Search functionality works after storage completes
6. ✅ No degradation in storage performance

## Additional Notes

- The offscreen document architecture is **correct** - it successfully offloads embedding computation
- The issue is **not** with the embedding service itself
- The fix is relatively simple: add yielding between batch operations
- This is a common issue with WASM-based databases in browser contexts
- Consider alternatives like IndexedDB with custom vector search for even better performance

