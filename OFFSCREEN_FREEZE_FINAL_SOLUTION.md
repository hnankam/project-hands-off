# Offscreen Freeze - Final Solution Options

## Current Status
Even with aggressive yielding in the offscreen document, the UI still freezes during model inference.

## Why This Happens
The WASM model execution (transformers.js) is **synchronous and blocking** even in an offscreen document. The browser tab shares resources between the main document and offscreen document.

## Solution Options

### Option A: Increase Yield Time (Try First) ✅
Currently using 10ms yields. Try increasing:

```typescript
// In offscreen.ts, line 67 and 85
await new Promise(resolve => setTimeout(resolve, 50)); // Try 50ms or even 100ms
```

**Pros:** Simple fix  
**Cons:** Slower embedding generation  

### Option B: Use requestIdleCallback (Better)
Only process batches when browser is idle:

```typescript
// Replace setTimeout with requestIdleCallback
const yieldToUI = () => new Promise(resolve => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => resolve(undefined), { timeout: 100 });
  } else {
    setTimeout(resolve, 50);
  }
});

// Then use it:
await yieldToUI();
```

**Pros:** UI-aware scheduling  
**Cons:** Requires browser support  

### Option C: Reduce Batch Size Further (Easiest)
Make batches even smaller:

```typescript
const BATCH_SIZE = 4; // Only 4 texts per batch
const MAX_CONCURRENT = 1;
```

**Pros:** Very simple  
**Cons:** Much slower overall  

### Option D: Show Progress Indicator (Best UX)
Accept that embeddings take time, but show progress:

```typescript
// In ChatSessionContainer.tsx
const [embeddingProgress, setEmbeddingProgress] = useState(0);

// Show a progress bar:
{embeddingProgress > 0 && embeddingProgress < 100 && (
  <div className="embedding-progress">
    <div className="progress-bar" style={{ width: `${embeddingProgress}%` }} />
    <span>Generating embeddings... {embeddingProgress}%</span>
  </div>
)}
```

**Pros:** Users understand what's happening  
**Cons:** Doesn't solve the freeze, just explains it  

### Option E: Background Processing (Most Complex)
Delay embedding until user is inactive:

```typescript
// Wait for user to stop interacting
let idleTimer: NodeJS.Timeout;
const scheduleEmbedding = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    // Start embedding now that user is idle
    generateEmbeddings();
  }, 2000); // Wait 2 seconds of inactivity
};
```

**Pros:** Never blocks active users  
**Cons:** Embeddings delayed, complex logic  

### Option F: Split Model Loading (Advanced)
The initial model load is the heaviest. Pre-load on extension install:

```typescript
// In background.ts - preload model on install
chrome.runtime.onInstalled.addListener(() => {
  // Trigger model download and cache
  chrome.runtime.sendMessage({ type: 'initialize' });
});
```

**Pros:** First-load freeze avoided  
**Cons:** Still freezes during inference  

## Recommended Approach

### Immediate Fix (Try in order):
1. ✅ **Increase yield time to 50ms** (already implemented with 10ms, increase it)
2. ✅ **Reduce batch size to 4** (already at 8, reduce further)
3. ✅ **Add progress indicator** (shows users what's happening)

### Long-term Solution:
- **Use requestIdleCallback** for smart scheduling
- **Show progress bar** for user feedback
- **Pre-load model** on extension install

## Implementation: Increased Yield Time

Let me update the offscreen with 50ms yields:

