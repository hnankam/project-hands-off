# Communication Architecture - Pure onMessage Pattern ✅

## Verification Complete

All embedding-related communication now uses **exclusively `chrome.runtime.onMessage`** with no callback-based `sendResponse`.

## Communication Flows

### 1. Side Panel → Background (Initialization)

**Request** (`useEmbeddingWorker.ts`):
```typescript
chrome.runtime.sendMessage({ 
  type: 'initializeEmbedding',
  model,
  requestId
})
```

**Response Listener** (`useEmbeddingWorker.ts`):
```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'initializeEmbeddingResponse' && message.requestId === requestId) {
    // Handle response
  }
});
```

**Background Handler** (`background/index.ts`):
```typescript
if (message.type === 'initializeEmbedding') {
  initializeEmbeddingService().then(() => {
    chrome.runtime.sendMessage({
      type: 'initializeEmbeddingResponse',
      requestId,
      success: true
    })
  });
  return false; // No sendResponse!
}
```

### 2. Side Panel → Background (Embedding Request)

**Request** (`useEmbeddingWorker.ts`):
```typescript
// Store content in storage first
await chrome.storage.local.set({ [contentId]: content });

// Send only ID
chrome.runtime.sendMessage({
  type: 'embedPageContent',
  contentId,
  requestId
})
```

**Response Listener** (`useEmbeddingWorker.ts`):
```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'embeddingComplete' && message.requestId === requestId) {
    // Handle result
  }
});
```

**Background Handler** (`background/index.ts`):
```typescript
if (message.type === 'embedPageContent') {
  (async () => {
    const stored = await chrome.storage.local.get(message.contentId);
    const result = await embedPageContent(stored[message.contentId]);
    
    chrome.runtime.sendMessage({
      type: 'embeddingComplete',
      requestId,
      result
    });
  })();
  return false; // No sendResponse!
}
```

### 3. Background → Offscreen (Processing)

**Request** (`background/index.ts` - sendToOffscreen function):
```typescript
// Set up listener FIRST
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'offscreenResponse' && msg.requestId === requestId) {
    // Handle response
  }
});

// Send request
chrome.runtime.sendMessage({ 
  type: 'generateEmbeddings',
  target: 'offscreen',
  requestId,
  texts
})
```

**Offscreen Handler** (`offscreen.ts`):
```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'offscreen') return false;
  
  (async () => {
    const embeddings = await generateEmbeddingsBatch(message.texts);
    
    chrome.runtime.sendMessage({
      type: 'offscreenResponse',
      requestId: message.requestId,
      success: true,
      embeddings
    });
  })();
  
  return false; // No sendResponse!
});
```

### 4. Background → Side Panel (Result Delivery)

**Background Sends** (`background/index.ts`):
```typescript
chrome.runtime.sendMessage({
  type: 'embeddingComplete',
  requestId,
  result
})
```

**Side Panel Receives** (`useEmbeddingWorker.ts`):
```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'embeddingComplete' && message.requestId === requestId) {
    resolve(message.result);
  }
});
```

## Key Benefits

### 1. No Blocking
- All `chrome.runtime.sendMessage` calls return immediately
- No waiting for `sendResponse()` to be called
- True asynchronous communication

### 2. Storage API for Large Data
- Huge content stored in `chrome.storage.local`
- Only tiny IDs sent via messages
- No serialization blocking

### 3. Request ID Matching
- Every request has unique ID
- Responses matched via ID
- Supports concurrent requests

### 4. Clean Error Handling
- Errors sent as messages
- Listeners can be removed on error
- No orphaned callbacks

## Verification Checklist ✅

- ✅ **No `sendResponse` in background.ts for embedding messages**
- ✅ **No `sendResponse` in offscreen.ts**
- ✅ **No callback parameters in sendMessage for embedding**
- ✅ **All responses use `chrome.runtime.sendMessage`**
- ✅ **All responses listened to via `chrome.runtime.onMessage`**
- ✅ **All handlers return `false` (don't keep channel open)**
- ✅ **Storage API used for large content**
- ✅ **Request IDs used for matching**

## Message Types

### Requests:
- `initializeEmbedding` - Initialize embedding service
- `embedPageContent` - Embed page content (with contentId)
- `generateEmbedding` - Single text embedding
- `generateEmbeddings` - Batch text embeddings

### Responses:
- `initializeEmbeddingResponse` - Initialization result
- `embeddingComplete` - Page content embedding result
- `generateEmbeddingResponse` - Single embedding result
- `generateEmbeddingsResponse` - Batch embeddings result
- `offscreenResponse` - Offscreen processing result

### Internal (Background ↔ Offscreen):
- Messages with `target: 'offscreen'`
- Responses with `type: 'offscreenResponse'`

## Architecture Diagram

```
Side Panel                 Background                 Offscreen
    |                          |                          |
    |--sendMessage------------>|                          |
    |  (contentId + requestId) |                          |
    |                          |                          |
    |                    chrome.storage.local.get()       |
    |                          |                          |
    |                          |--sendMessage------------>|
    |                          |  (requestId + data)      |
    |                          |                          |
    |                          |                    Process WASM
    |                          |                          |
    |                          |<--sendMessage------------|
    |                          |  (requestId + result)    |
    |                          |                          |
    |<--sendMessage------------|                          |
    |  (requestId + result)    |                          |
    |                          |                          |
  onMessage                onMessage                onMessage
  listener                 listener                 listener
```

## No More Blocking! 🎉

With pure `onMessage` communication:
- No synchronous waits
- No serialization blocking (storage API)
- No callback-based delays
- Perfect for responsive UI

All embedding communication is now **truly non-blocking** and **message-driven**!

