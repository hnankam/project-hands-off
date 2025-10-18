# DOM Updates Embedding System - Implementation Complete

## Overview
DOM updates are now embedded and stored in the database with recency timestamps instead of being sent directly to the agent. This provides:
- **Semantic search** over DOM changes
- **Recency weighting** to prioritize recent changes
- **Reduced context bloat** by not passing raw updates
- **Historical tracking** of page mutations

## Changes Made

### 1. Database Schema (`packages/shared/lib/db/embeddings-storage.ts`)
Added new `dom_updates` table with:
- **HNSW vector index** for fast semantic search (384-dimensional embeddings)
- **recencyScore** field (0.0-1.0, exponential decay)
- **updateJSON** field storing the full DOM update
- **summary** field with human-readable description
- **timestamp** for temporal ordering
- Regular indexes on pageURL, sessionId, timestamp, and recencyScore

### 2. Storage Methods (`EmbeddingsStorageManager`)

#### `storeDOMUpdate()`
- Accepts DOM update with embedding
- Creates human-readable summary
- Stores with recencyScore = 1.0
- Automatically decays older updates (0.7^n decay factor)
- Logs storage success

#### `searchDOMUpdates()`
- Performs HNSW vector search
- Combines semantic similarity (60%) + recency (40%)
- Returns top-K results sorted by combined score
- Includes full DOM update data and metadata

#### `createDOMUpdateSummary()` (private)
- Extracts key information from DOM update
- Creates searchable text: "Added 3 elements: div, span. Removed 1 element..."
- Includes text changes and summary counts

#### `decayOlderDOMUpdates()` (private)
- Exponential decay: 1.0 → 0.7 → 0.49 → 0.34...
- Ensures recent changes rank higher
- Runs automatically on each new update

### 3. Auto-Embedding (`pages/side-panel/src/components/ChatSessionContainer.tsx`)

#### New useEffect Hook
- Watches for `latestDOMUpdate` changes
- Auto-embeds using `embedTexts()` when update arrives
- Stores in database via `embeddingsStorage.storeDOMUpdate()`
- Non-blocking (async fire-and-forget)

#### Helper Function
- `createDOMUpdateSummary()` duplicated locally
- Generates text for embedding
- Keeps logic consistent with storage layer

### 4. Removed Direct Agent Access (`pages/side-panel/src/components/ChatInner.tsx`)
- **Removed** `useCopilotReadable` for `latestDOMUpdate`
- **Removed** DOM update-triggered suggestion regeneration
- **Updated** comments to reflect new architecture
- Agent now queries via `searchDOMUpdates` action (to be implemented)

## Flow Diagram

```
1. DOM Change Detected (ContentManager)
   ↓
2. setLatestDOMUpdate() triggered
   ↓
3. useEffect in ChatSessionContainer
   ↓
4. createDOMUpdateSummary() → text
   ↓
5. embedTexts([text]) → embedding
   ↓
6. embeddingsStorage.storeDOMUpdate()
   ↓
7. Stored in dom_updates table (HNSW indexed)
   ↓
8. Older updates decayed (recencyScore × 0.7)
   ↓
9. Agent can search via searchDOMUpdates()
```

## Benefits

### Performance
- No large JSON payloads in agent context
- HNSW index provides O(log n) search
- Recency weighting keeps results relevant

### Semantic Search
- Agent can ask: "What changed on the page?"
- Finds relevant updates by meaning, not exact text
- Example: "show me error messages" → finds added error divs

### Recency Weighting
- Recent changes score higher automatically
- Combined score = 60% semantic + 40% recency
- Prevents old updates from ranking above recent ones

### Historical Context
- All DOM updates stored (not overwritten)
- Agent can query: "What happened after I clicked submit?"
- Temporal ordering preserved

## Agent Action Implementation ✅

### searchDOMUpdates Action
Implemented in `ChatInner.tsx` (lines 372-409):
- **Name**: `searchDOMUpdates`
- **Description**: Search recent DOM changes semantically
- **Parameters**: 
  - `query` (string, required): Search query for what type of change to find
  - `topK` (number, optional): Number of results (default: 5, max: 10)
- **Handler**: Calls `searchManager.searchDOMUpdates(query, topK)`
- **Returns**: Formatted results with:
  - `summary`: Human-readable description
  - `timestamp`: ISO timestamp
  - `timeAgo`: Relative time (e.g., "30s ago")
  - `recencyScore`: 0.0-1.0 (higher = more recent)
  - `semanticSimilarity`: 0.0-1.0 (higher = more relevant)
  - `combinedScore`: 60% semantic + 40% recency
  - `changes`: Counts of added/removed/modified elements
  - `details`: Full DOM update object

### SemanticSearchManager.searchDOMUpdates()
Implemented in `SemanticSearchManager.ts` (lines 329-427):
- Embeds query using `embeddingService.embed()`
- Calls `embeddingsStorage.searchDOMUpdates()` with HNSW index
- Formats results with human-readable timestamps
- Logs search performance and results

## Testing Checklist

1. ✅ Navigate to a page and trigger DOM changes
2. ✅ Check console logs for embedding/storage success
3. ✅ Verify `dom_updates` table has records
4. ✅ Test recency decay on multiple updates
5. ✅ Implement agent action to search DOM updates
6. 🔄 **Ready for end-to-end testing!**

## Files Modified
1. ✅ `packages/shared/lib/db/embeddings-storage.ts` - Schema + storage/search methods
2. ✅ `pages/side-panel/src/components/ChatSessionContainer.tsx` - Auto-embedding logic
3. ✅ `pages/side-panel/src/components/ChatInner.tsx` - Added searchDOMUpdates action, removed direct access
4. ✅ `pages/side-panel/src/lib/SemanticSearchManager.ts` - Added searchDOMUpdates method
5. ✅ `pages/side-panel/src/hooks/useMessagePersistence.ts` - Defensive fixes
6. ✅ `pages/offscreen/src/offscreen.ts` - Removed heartbeat logs

## Migration Notes
- Existing code that reads `latestDOMUpdate` from useCopilotReadable will no longer work
- Agent must now use `searchDOMUpdates` action to query changes
- No data migration needed - fresh table

## Performance Metrics (Expected)
- Embedding time: ~50-100ms per update
- Storage time: ~10-20ms
- Search time: ~5-10ms (HNSW)
- Decay time: ~5ms per older update

## Configuration
- Recency decay factor: 0.7 (configurable)
- Combined score weights: 60% semantic, 40% recency
- HNSW parameters: EFC=150, M=12, COSINE distance

