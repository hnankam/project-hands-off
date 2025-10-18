# 🔨 REBUILD REQUIRED

## The Issue
You're running **old compiled code**. The latest fixes aren't active yet.

## How to Rebuild

Run ONE of these commands:

```bash
# If you have pnpm:
pnpm build

# If you have npm:
npm run build

# If you have yarn:
yarn build
```

## After Rebuild

1. **Reload the extension** in `chrome://extensions`
2. **Reload the side panel** (close and reopen)
3. Check console logs - you should now see:
   - `[Background] 📥 Received initializeEmbedding request`
   - `[Background] 📤 Sending initializeEmbeddingResponse`
   - `[useEmbeddingWorker] ✅ Embedding service initialized`

## What the Logs Will Show

The new logs will reveal:
1. Whether the background receives the init request
2. Whether it successfully sends the response
3. Content size and serialization time (to confirm the freeze cause)

## Expected Behavior

With the logs, we'll see exactly where the communication breaks down and how long serialization takes (likely 500-2000ms for large pages, causing the freeze).

