# UI Freeze Fix - Callback-Based Non-Blocking

## The Problem Confirmed 🎯

User observation: **Events are queued during the freeze and execute AFTER embedding completes**

This proves:
- Events ARE being captured by the browser
- Events ARE being queued
- But JavaScript CAN'T process them during the wait
- Once embedding completes, the event queue is flushed

## Why setTimeout Didn't Work

Even with `setTimeout`, the issue persisted because:

```typescript
setTimeout(async () => {
  // Once this callback starts executing...
  const result = await chrome.runtime.sendMessage({...}); // ← BLOCKS HERE
  // ...nothing else can run until the await completes
}, 0);
```

The `await` keyword **suspends execution** of that async function, but more critically, it keeps the JavaScript thread occupied waiting for the Promise to resolve. No other JavaScript can execute during this time.

## The Root Cause: `await` Blocking

### How `await chrome.runtime.sendMessage()` Works

```typescript
// This looks asynchronous but actually blocks JavaScript execution
const response = await chrome.runtime.sendMessage({ type: 'embedPageContent' });
```

What happens:
1. Message is sent to background script
2. JavaScript creates a Promise
3. Current execution context **suspends** waiting for Promise resolution
4. **JavaScript event loop is blocked** - can't process other events
5. After 2-3 seconds, Promise resolves with response
6. Execution resumes, event queue is processed

### Why Events Are Queued But Not Processed

- **Browser level**: Events (clicks, scrolls) are captured and queued
- **JavaScript level**: Event handlers can't run because JS is waiting on `await`
- **Result**: UI appears frozen, events execute after await completes

## The Real Fix: Callback-Based API ✅

Instead of `await`, use the callback parameter of `chrome.runtime.sendMessage()`:

### Before (Blocking with await)
```typescript
const embedPageContent = async (content: any) => {
  // This BLOCKS JavaScript execution
  const response = await chrome.runtime.sendMessage({
    type: 'embedPageContent',
    content
  });
  
  if (response.success) {
    return response.result;
  }
};
```

### After (Non-Blocking with Callbacks)
```typescript
const embedPageContent = (content: any): Promise<any> => {
  // This returns immediately, callback fires later
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'embedPageContent',
        content
      },
      (response) => {  // ← Callback fires when response arrives
        // This runs asynchronously without blocking
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response.error));
        }
      }
    );
  });
  // Function returns immediately, Promise resolves later
};
```

## How This Fixes The Freeze

### Before (Blocking)
```
1. Call embedPageContent()
2. Execute: await chrome.runtime.sendMessage()
3. JavaScript execution PAUSED
4. [2-3 seconds of freeze - events queued but not processed]
5. Response arrives
6. JavaScript execution RESUMES
7. Process queued events
```

### After (Non-Blocking)
```
1. Call embedPageContent()
2. Execute: chrome.runtime.sendMessage() with callback
3. Function RETURNS IMMEDIATELY
4. JavaScript continues processing events
5. [2-3 seconds - UI fully responsive, events processed normally]
6. Response arrives
7. Callback fires asynchronously
8. setState() triggers re-render
```

## Key Difference: Callback vs Await

### `await` (Blocking)
- Suspends current execution context
- Blocks JavaScript from processing other tasks
- Events queue up waiting for await to complete
- Synchronous-like behavior

### Callback (Non-Blocking)
- Returns immediately
- JavaScript continues to next task
- Events process normally
- Callback fires when response ready
- True asynchronous behavior

## Files Modified

### `pages/side-panel/src/hooks/useEmbeddingWorker.ts`

**Lines 77-118:** Converted `embedPageContent` from async/await to callback-based
```typescript
// Generate embedding for page content - NON-BLOCKING version
const embedPageContent = useCallback((content: any): Promise<any> => {
  // ...
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'embedPageContent', content },
      (response) => {
        // Async callback - doesn't block
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response.error));
        }
      }
    );
  });
}, [state.isInitialized]);
```

**Lines 120-159:** Converted `embedTexts` from async/await to callback-based
```typescript
// Generate embeddings for multiple texts - NON-BLOCKING version
const embedTexts = useCallback((texts: string[]): Promise<number[][]> => {
  // ... same pattern
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'generateEmbeddings', texts },
      (response) => {
        // Async callback
        if (response.success) {
          resolve(response.embeddings);
        } else {
          reject(new Error(response.error));
        }
      }
    );
  });
}, [state.isInitialized]);
```

## Expected Behavior Now ✅

### Before
- Navigate to page
- Side panel freezes for 2-3 seconds
- Click a button during freeze
- Nothing happens
- After 3 seconds: unfreeze + button click executes

### After
- Navigate to page
- Blue banner appears: "Processing page content..."
- **Side panel stays fully responsive!**
- Click a button during embedding
- **Button responds immediately!**
- Scroll, type, click - everything works
- After 2-3 seconds: banner disappears
- No queued events - everything was processed in real-time!

## Why This Works

The callback-based API uses Chrome's internal message passing which:
1. Sends the message without blocking
2. Returns control immediately to JavaScript
3. Registers a callback for when response arrives
4. Allows event loop to continue processing
5. Fires callback asynchronously when ready

This is fundamentally different from `await` which:
1. Creates a Promise
2. Suspends execution
3. Waits synchronously for Promise resolution
4. Blocks event processing

## Testing

1. Reload the extension
2. Navigate to a content-heavy page
3. **Immediately try:**
   - Scrolling - should be smooth!
   - Clicking buttons - should respond instantly!
   - Typing - should work immediately!
4. Watch the blue banner during embedding
5. Everything should stay responsive!
6. No more queued events executing after delay!

## Technical Notes

### Promise vs Callback
Both return Promises, but:
- **async/await**: Suspends execution at `await` point
- **Callback Promise**: Returns immediately, resolves via callback

### Chrome Extension Message API
```typescript
// Blocking (old way)
const response = await chrome.runtime.sendMessage(message);

// Non-blocking (new way)
chrome.runtime.sendMessage(message, (response) => {
  // Handle response
});
```

The second parameter (callback) makes it non-blocking!

### Why We Still Return a Promise
We wrap the callback in a Promise so consumers can still use `await`:

```typescript
// In component
const result = await embedPageContent(content);
```

But internally, the Promise resolves via callback, not by blocking execution!

## Conclusion

The freeze was caused by **`await` blocking JavaScript execution** while waiting for `chrome.runtime.sendMessage()` to return.

By switching to the **callback-based API**, we:
1. ✅ Send the message without blocking
2. ✅ Return control immediately
3. ✅ Allow event loop to continue
4. ✅ Handle response asynchronously
5. ✅ Keep UI fully responsive

**Result: True non-blocking async operation!** 🎉

No more frozen UI, no more queued events - everything processes in real-time!

