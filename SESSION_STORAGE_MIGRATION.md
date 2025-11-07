# Session Storage Migration to IndexedDB

## Overview

This migration moves session storage from `chrome.storage.local` to IndexedDB via SurrealDB to eliminate the "extension reload" behavior when switching session tabs.

## Problem Summary

### Before Migration
- Session data stored in `chrome.storage.local` with massive objects (sessions array with embedded messages)
- Each tab switch called `sessionStorage.setActiveSession()` which:
  1. Rewrote the entire 100+ MB session blob to `chrome.storage.local`
  2. Triggered `chrome.storage.onChanged` events
  3. Caused React to remount `ChatSessionContainer` (due to `key={sessionId}`)
  4. Updated extension "Size" in chrome://extensions (visible refresh)
  5. Made the UI feel like a full extension reload

### After Migration
- Session metadata separated from message data in IndexedDB
- Tab switching only updates a tiny `currentSessionId` field
- No remount of `ChatSessionContainer` component
- Instant tab switching with no UI flicker
- Extension size remains stable

## Architecture Changes

### Data Model Separation

**Old Structure (chrome.storage.local):**
```typescript
{
  sessions: [
    {
      id: string,
      title: string,
      allMessages: any[],  // 💀 Massive array embedded!
      selectedAgent: string,
      selectedModel: string,
      usageStats: {...},
      agentStepState: {...}
    }
  ],
  currentSessionId: string
}
```

**New Structure (IndexedDB/SurrealDB):**
```sql
-- Lightweight metadata table
TABLE session_metadata {
  id, title, timestamp, isActive, isOpen, 
  selectedAgent, selectedModel
}

-- Heavy data in separate table
TABLE session_messages {
  sessionId, messages: array
}

-- Other heavy data in separate tables
TABLE session_usage { sessionId, request, response, total, requestCount }
TABLE session_agent_state { sessionId, steps: array }

-- App state (tiny writes)
TABLE app_state { key: "currentSessionId", value: string }
```

## Files Modified

### Core Infrastructure
- `packages/shared/lib/db/session-schema.ts` - SurrealDB schema definitions
- `packages/shared/lib/db/session-storage-db.ts` - Session storage service
- `packages/shared/lib/db/migrate-session-storage.ts` - One-time migration utility
- `packages/shared/lib/hooks/use-session-storage-db.tsx` - React hook for IndexedDB sessions

### Component Updates
- `pages/side-panel/src/SidePanel.tsx` - Use `useSessionStorageDB()` instead of `useStorage(sessionStorage)`
- `pages/side-panel/src/components/ChatSessionContainer.tsx` - Handle session changes without remount
- `pages/side-panel/src/pages/SessionsPage.tsx` - Updated to use new storage API
- `packages/ui/lib/components/SessionTabs.tsx` - Use `sessionStorageDBWrapper`
- `packages/ui/lib/components/SessionList.tsx` - Use `sessionStorageDBWrapper`

### Migration Integration
- `pages/side-panel/src/hooks/useDBWorkerClient.ts` - Runs migration on startup

## Key Changes

### 1. React Component Mounting
**Before:**
```tsx
<ChatSessionContainer
  key={activeSession.id}  // Forces remount on session change
  sessionId={activeSession.id}
  ...
/>
```

**After:**
```tsx
<ChatSessionContainer
  sessionId={activeSession.id}  // No key = stays mounted
  ...
/>
```

The component now handles `sessionId` changes via `useEffect`:
```typescript
useEffect(() => {
  const sessionChanged = prevSessionId && prevSessionId !== sessionId;
  if (sessionChanged) {
    // Gracefully load new session messages
    handleLoadMessages();
    // Update agent/model from new session metadata
    const newSession = sessions.find(s => s.id === sessionId);
    if (newSession) {
      setSelectedAgent(newSession.selectedAgent || '');
      setSelectedModel(newSession.selectedModel || '');
    }
  }
  prevSessionIdRef.current = sessionId;
}, [sessionId, isActive, sessions]);
```

### 2. Lightweight Session Switching
**Before (100+ MB write):**
```typescript
sessionStorage.setActiveSession(sessionId) {
  await storage.set({
    sessions: updatedSessions,  // Entire array with messages
    currentSessionId: sessionId
  });
}
```

**After (< 1 KB write):**
```typescript
async setActiveSession(sessionId: string) {
  await worker.query(`
    UPDATE session_metadata SET isActive = false WHERE isActive = true;
    UPDATE session_metadata SET isActive = true, isOpen = true WHERE id = $id;
  `, { id: sessionId });
  
  await this.setCurrentSessionId(sessionId);  // Updates app_state table
  this.notify({ type: 'sessionChanged', sessionId });
}
```

### 3. Migration on First Run
```typescript
// In useDBWorkerClient.ts
await sessionStorageDB.initialize(false); // Use persistent IndexedDB
await migrateSessionStorage(sessionStorageDB);
```

Migration checks for `session-storage-migrated-to-indexeddb` flag in `chrome.storage.local`. If not present:
1. Reads old session data from `chrome.storage.local`
2. Writes to new IndexedDB tables
3. Marks migration complete
4. Leaves old data intact (can be cleaned up later with `cleanupOldStorage()`)

## API Compatibility

The new `sessionStorageDBWrapper` provides the same API as the old `sessionStorage`:

```typescript
// Still works the same from consumer perspective
await sessionStorageDBWrapper.addSession(title);
await sessionStorageDBWrapper.setActiveSession(sessionId);
await sessionStorageDBWrapper.updateSessionTitle(sessionId, title);
await sessionStorageDBWrapper.updateAllMessages(sessionId, messages);

// Synchronous methods now have async versions
const messages = await sessionStorageDBWrapper.getAllMessagesAsync(sessionId);
const usage = await sessionStorageDBWrapper.getUsageStatsAsync(sessionId);
```

## Testing Checklist

- [ ] Fresh install creates default session
- [ ] Existing installations migrate successfully
- [ ] Session tabs switch instantly without "reload" effect
- [ ] Extension size in chrome://extensions stays stable
- [ ] Messages persist across sessions
- [ ] Agent/model selection persists
- [ ] Usage stats tracked correctly
- [ ] Session deletion works
- [ ] Session title editing works
- [ ] Close/reopen sessions work
- [ ] "Clear all messages" works
- [ ] "Clear all sessions" works
- [ ] Export session as HTML/PDF works
- [ ] Admin page tabs still switch instantly (they already didn't trigger reload)

## Performance Metrics

### Before
- Session switch: 200-500ms (visible UI freeze)
- Chrome extension size: Refreshes on every tab switch
- Memory: ~100MB in chrome.storage.local
- React remount: Full component tree teardown/rebuild

### After (Expected)
- Session switch: < 50ms (instant)
- Chrome extension size: Stable
- Memory: ~100MB in IndexedDB (more efficient)
- React remount: None (component stays mounted)

## Rollback Plan

If issues arise, the old data is still in `chrome.storage.local` (migration doesn't delete it). To rollback:

1. Comment out the migration call in `useDBWorkerClient.ts`
2. Revert `SidePanel.tsx` to use `useStorage(sessionStorage)`
3. Revert component imports
4. Remove the `session-storage-migrated-to-indexeddb` flag from storage to force re-migration later

## Future Improvements

1. **Clean up old storage** - After confirming migration success, call `cleanupOldStorage()` to remove old `chrome.storage.local` data
2. **Optimize queries** - Add more indexes for faster lookups
3. **Batch operations** - Group multiple writes into transactions
4. **Cache frequently accessed data** - Keep active session metadata in memory
5. **Background sync** - Sync deleted sessions/messages to cloud backup

## Technical Notes

### Why SurrealDB?
- Already integrated for embeddings storage
- Supports IndexedDB backend
- ACID transactions
- Powerful query language (SurrealQL)
- No size limits like chrome.storage.local

### Why Not Just Split the Keys?
We could have kept `chrome.storage.local` and just stored messages in separate keys like `session-messages-${id}`. This would help but:
- Still hits chrome.storage.local size limits eventually
- Still triggers storage change events
- Doesn't solve the React remount problem
- IndexedDB is better for large data

### IndexedDB vs chrome.storage.local
| Feature | chrome.storage.local | IndexedDB |
|---------|---------------------|-----------|
| Size limit | 5-10 MB | Unlimited (quota-based) |
| Sync | Partially (with chrome.storage.sync) | No |
| API | Simple key-value | Structured with indexes |
| Queries | None | Full query support |
| Transactions | No | Yes (ACID) |
| Performance | Good for small data | Better for large data |

## Conclusion

This migration eliminates the "fake reload" behavior by:
1. Separating heavy data from lightweight metadata
2. Using IndexedDB for efficient large data storage
3. Updating only what changed (currentSessionId)
4. Preventing unnecessary React remounts

Result: **Instant session switching with no UI disruption.**

