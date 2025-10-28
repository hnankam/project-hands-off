# DOM Update Auto-Indexing Analysis

## Summary
**YES, DOM updates CAN trigger full page data extraction and indexing**, depending on the panel state and agent activity. This document explains the complete flow.

---

## 🔄 DOM Update Flow

### 1. Content Script Detects Changes
**File:** `pages/content/src/matches/all/index.ts`

- MutationObserver monitors DOM changes
- Creates incremental update summary (added/removed elements, text changes)
- Sends `domContentChanged` message to background script

```typescript
chrome.runtime.sendMessage({
  type: 'domContentChanged',
  tabId: chrome.runtime.id,
  url: window.location.href,
  timestamp: Date.now(),
  domUpdate: domUpdate // Incremental summary
});
```

### 2. Background Script Relays Message
**File:** `chrome-extension/src/background/index.ts` (lines 1070-1083)

- Receives `domContentChanged` message
- Forwards as `contentBecameStale` to side panel

```typescript
chrome.runtime.sendMessage({
  type: 'contentBecameStale',
  tabId: tabId,
  url: message.url,
  timestamp: message.timestamp,
  domUpdate: message.domUpdate
});
```

### 3. Side Panel Handles Stale Content
**File:** `pages/side-panel/src/ChatSession.tsx` (lines 148-198)

When `contentBecameStale` message arrives:

```typescript
// Capture incremental DOM update
if (message.domUpdate) {
  setLatestDOMUpdate(message.domUpdate); // ⚠️ This triggers embedding hook!
}

// Invalidate cache
contentCacheRef.current.delete(cacheKey);

// If panel is active OR assistant is streaming, refresh immediately
if (isPanelActive || isAgentLoading) {
  fetchFreshPageContent(true, message.tabId); // ⚠️ Full page extraction!
}
```

**Alternative:** `pages/side-panel/src/components/ContentManager.tsx` (lines 358-406) has similar logic.

---

## ⚡ Triggers for Full Page Extraction

### Automatic Full Extraction Happens When:

1. **Panel is Active** (`isPanelActive === true`)
   - User is viewing/interacting with side panel
   
2. **Agent is Streaming** (`isAgentLoading === true`)
   - AI is actively generating a response

3. **Manual Refresh**
   - User clicks refresh button
   - AI agent calls `refreshPageContent` action

### What Happens During Full Extraction:

**File:** `chrome-extension/src/background/index.ts` (lines 1178-2334)

```typescript
async function extractPageContent(tabId, sendResponse) {
  // Executes content script to extract ALL page data:
  // - Full HTML
  // - All text content
  // - All form fields (grouped)
  // - All clickable elements (grouped)
  // - Page metadata
  
  // Stores in background cache
  await handlePageContentUpdate(extractedContent, tabId);
  
  // Returns to side panel
  sendResponse({ success: true, content: extractedContent });
}
```

---

## 🎯 Auto-Embedding Triggers

### 1. DOM Update Embedding (NOW DISABLED)
**File:** `pages/side-panel/src/components/ChatSessionContainer.tsx` (lines 380-387)

```typescript
// DOM update embedding hook - DISABLED
// useDOMUpdateEmbedding({
//   latestDOMUpdate,
//   isEmbeddingInitialized,
//   currentPageContent,
//   embedTexts,
//   sessionId,
// });
```

**What it did when enabled:**
- Embedded incremental DOM update summaries
- Stored in database for semantic search
- Triggered by `setLatestDOMUpdate()` calls

### 2. Full Page Content Embedding (STILL ACTIVE)
**File:** `pages/side-panel/src/hooks/usePageContentEmbedding.ts` (lines 92-178)

**Triggers automatically when:**
- `currentPageContent` changes (new content fetched)
- Embedding system is initialized
- Content has not been embedded before (URL + timestamp check)

**What it embeds:**
```typescript
const result = await embedPageContentForTab(tabId, contentTimestamp);
// Embeds:
// - Full page text
// - HTML chunks (1000 chars each)
// - Form field groups
// - Clickable element groups

// Stores in SurrealDB
await embeddingsStorage.storePageContent({
  pageURL,
  pageTitle,
  fullEmbedding,
  chunks,
  formFieldGroups,
  clickableElementGroups,
  sessionId
});
```

---

## 🚨 Current Status (Updated)

### What's Active:
✅ **DOM Update Embedding** - Incremental updates ARE embedded (lightweight)
⚠️ **Full Page Content Extraction** - Only triggered when:
1. ~~DOM changes detected AND panel is active~~ ❌ DISABLED
2. DOM changes detected AND agent is streaming ✅ **ONLY THIS**
3. User/agent triggers manual refresh
4. User switches tabs

### Key Change:
**Auto-refresh on DOM changes now ONLY happens when agent is streaming**, not when panel is merely active. This significantly reduces unnecessary full page extractions while still keeping the agent's context fresh during active conversations.

---

## 💡 Impact Assessment (Updated)

### Scenario 1: User Not Interacting, Panel Minimized
- DOM changes detected → stale indicator shown
- ✅ **No full extraction** (panel inactive)
- ✅ **DOM update embedded** (lightweight incremental summary only)
- ✅ **No full page embedding**

### Scenario 2: User Actively Using Panel (Not Chatting)
- DOM changes detected → stale indicator shown
- ✅ **No automatic full extraction** (agent not streaming)
- ✅ **DOM update embedded** (lightweight incremental summary only)
- ✅ **No full page embedding** until user manually refreshes
- 👤 **User can click refresh button** if they want fresh content

### Scenario 3: Agent Streaming Response (Active Conversation)
- DOM changes detected → **immediate full extraction**
- ⚠️ **Full page data extracted during AI response**
- ⚠️ **All content embedded** (HTML chunks, forms, clickable elements)
- 💡 **Justified**: Agent needs fresh context for accurate responses

### Scenario 4: Background (Panel Open but Not Active)
- DOM changes detected → stale indicator shown
- ✅ **No full extraction**
- ✅ **DOM update embedded** (lightweight incremental summary only)
- ✅ **No full page embedding**

---

## 🔧 How to Fully Disable Auto-Indexing

### Option 1: Disable Panel Auto-Refresh on DOM Changes
**File:** `pages/side-panel/src/ChatSession.tsx` (lines 167-178)

```typescript
// Comment out auto-refresh logic
// if (isPanelActive || isAgentLoading) {
//   fetchFreshPageContent(true, message.tabId);
//   setShowStaleIndicator(false);
//   return;
// }
```

### Option 2: Disable Auto-Embedding of Page Content
**File:** `pages/side-panel/src/components/ChatSessionContainer.tsx` (around line 365)

```typescript
// Comment out the hook call
// const { pageContentEmbeddingRef, isEmbedding, embeddingStatus, dbTotals } = 
//   usePageContentEmbedding({
//     currentPageContent,
//     isEmbeddingInitialized,
//     isEmbeddingProcessing,
//     embedPageContentForTab,
//     initialize,
//     sessionId,
//     currentTabId,
//   });
```

### Option 3: Manual Mode Only
Add a user setting to control auto-indexing behavior:
- Auto mode (current): Indexes when panel active
- Manual mode: Only indexes on explicit refresh
- Off mode: Never auto-indexes, only on-demand

---

## 📊 Performance Implications

### Full Page Extraction + Embedding:
- **Extraction time:** ~500ms - 2s (depends on page size)
- **Embedding time:** ~1-3s (depends on content volume)
- **Storage writes:** Multiple (page, chunks, forms, clickables)
- **Memory usage:** Temporary spike during embedding
- **Network:** Offscreen document communication

### Frequency (with current code):
- Every DOM change while panel is active
- Every DOM change while agent is responding
- Can be 10-50+ times per page interaction session

---

## 🎯 Recommendations

1. **Keep DOM update embedding disabled** ✅ (already done)
   - Incremental updates are lightweight but frequent
   
2. **Consider debouncing full page extraction**
   - Wait 2-3 seconds after last DOM change before extracting
   - Reduces redundant extractions during rapid page updates
   
3. **Add user setting for auto-indexing mode**
   - Let users choose when indexing happens
   - Power users can disable for performance
   
4. **Cache embeddings more aggressively**
   - Don't re-embed unchanged content
   - Current logic checks URL + timestamp (good)
   - Could add content hash check for safety

---

## 📝 Related Files

### Core Flow:
- `pages/content/src/matches/all/index.ts` - DOM monitoring
- `chrome-extension/src/background/index.ts` - Message relay & extraction
- `pages/side-panel/src/ChatSession.tsx` - Stale content handler
- `pages/side-panel/src/components/ContentManager.tsx` - Alternative handler

### Embedding:
- `pages/side-panel/src/hooks/usePageContentEmbedding.ts` - Full page embedding
- `pages/side-panel/src/hooks/useDOMUpdateEmbedding.ts` - Incremental (disabled)
- `pages/side-panel/src/components/ChatSessionContainer.tsx` - Hook integration

### Storage:
- `packages/shared/lib/db/embeddings-storage.ts` - Database operations

