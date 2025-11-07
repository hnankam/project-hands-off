# Debugging Session Storage Migration

## Current Issue: Stuck in Skeleton Loading State

### What Should Happen

1. **Extension loads** → Background script initializes
2. **Side panel opens** → `useDBWorkerClient()` runs
3. **DB Worker initializes** → Creates SurrealDB connection to IndexedDB
4. **Migration runs** → Migrates old chrome.storage.local data to IndexedDB
5. **SidePanel renders** → `useSessionStorageDB()` fetches sessions from IndexedDB
6. **Sessions display** → User sees their session tabs

### What's Happening (Based on Console Logs)

From your screenshot:
- ✅ Background loaded
- ✅ Embedding service initialized
- ⚠️ **Missing**: Session storage initialization logs
- ⚠️ **Missing**: Migration logs
- ❌ **Result**: Stuck in skeleton state

### Expected Console Logs

You should see these logs in order:

```
[useDBWorkerClient] Initializing DB worker...
[DB Worker Client] Worker created, waiting for ready signal...
[DB Worker Client] Worker ready, initializing database...
[DB Worker Client] ✅ Initialized successfully
[useDBWorkerClient] Running session storage migration...
[Migration] Starting session storage migration...
[Migration] Found X sessions to migrate
[Migration] ✅ Session storage migration completed successfully
[useSessionStorageDB] Fetching session data from IndexedDB...
[SessionStorageDB] ✅ Fetched data: { sessionsCount: X, currentSessionId: 'session-...' }
```

### Debugging Steps

#### 1. Check Console for Errors

Look for:
- Red error messages
- Failed to initialize messages
- "Worker not set" errors
- Migration errors

#### 2. Check Browser Console (Not Extension Console)

Open Chrome DevTools on the side panel page itself:
- Right-click in side panel → Inspect
- Look for React errors or promise rejections

#### 3. Check IndexedDB

1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB** in left sidebar
4. Look for database named `chrome_ext_db`
5. Check if tables exist: `session_metadata`, `session_messages`, `app_state`

#### 4. Check chrome.storage.local

1. In Application tab → Storage → Local Storage
2. Look for key `session-storage-migrated-to-indexeddb`
3. If it's `true`, migration already ran
4. Check for old data in key `session-storage-key`

### Common Issues and Fixes

#### Issue 1: DB Worker Not Initializing

**Symptom**: No logs about DB worker initialization

**Fix**: Check if worker file exists and is being loaded
```bash
# Check if worker built correctly
ls -la dist/side-panel/db-worker.js
```

#### Issue 2: SurrealDB Connection Failing

**Symptom**: "Failed to connect to SurrealDB" error

**Fix**: 
1. Check if `surrealdb` and `@surrealdb/wasm` packages are installed
2. Rebuild: `npm run build` or `pnpm build`

#### Issue 3: Migration Fails Silently

**Symptom**: Migration runs but no sessions appear

**Fix**: Check migration logs and IndexedDB manually
```javascript
// Run in console:
chrome.storage.local.get(['session-storage-key', 'copilot-chat-messages'], (result) => {
  console.log('Old data:', result);
});
```

#### Issue 4: React Suspense Infinite Loop

**Symptom**: Skeleton never disappears, no errors

**Fix**: The hook is throwing but never resolving. Check:
1. Is `dbWorkerReady` ever becoming true?
2. Add temporary log in SidePanel.tsx:
```typescript
console.log('SidePanel render:', { dbWorkerReady, authLoading });
```

### Quick Fix: Rollback

If you need to quickly rollback to the old system:

1. **Revert SidePanel.tsx**:
```typescript
// Change this line:
const { sessions, currentSessionId } = useSessionStorageDB();

// Back to:
const { sessions, currentSessionId } = useStorage(sessionStorage);
```

2. **Revert imports**:
```typescript
// Add back:
import { sessionStorage } from '@extension/storage';
```

3. **Rebuild**:
```bash
npm run build
```

### Force Clean Migration

If migration is stuck:

```javascript
// Run in browser console:
chrome.storage.local.remove('session-storage-migrated-to-indexeddb', () => {
  console.log('Migration flag cleared');
  window.location.reload();
});
```

### Current Fix Applied

I've added these changes to help:

1. **Auto-initialization**: `getAllSessions()` and `getCurrentSessionId()` now auto-initialize if not ready
2. **Better error handling**: Hook now catches and logs errors
3. **Wait for DB**: SidePanel waits for `dbWorkerReady` before rendering
4. **Error UI**: Shows error message if DB fails to initialize

### Next Steps

1. **Rebuild the extension**:
   ```bash
   npm run build  # or pnpm build
   ```

2. **Reload the extension** in chrome://extensions

3. **Open side panel** and check console for logs

4. **Share the console output** if still stuck - I need to see:
   - Any error messages (red text)
   - All logs with "[useDBWorkerClient]"
   - All logs with "[Migration]"  
   - All logs with "[SessionStorageDB]"
   - All logs with "[useSessionStorageDB]"

### Manual Test

You can manually test the DB in console:

```javascript
// In side panel console:
import { sessionStorageDB } from '@extension/shared';

// Try fetching sessions:
sessionStorageDB.getAllSessions().then(sessions => {
  console.log('Sessions:', sessions);
});

// Check current session:
sessionStorageDB.getCurrentSessionId().then(id => {
  console.log('Current session ID:', id);
});
```

### Known Limitations

1. **First Load May Be Slow**: IndexedDB initialization + migration can take 1-2 seconds
2. **Large Message History**: If you have 1000+ messages, migration might take longer
3. **Browser Restrictions**: Some browsers may block IndexedDB in certain modes

### Success Indicators

You'll know it's working when:
- ✅ Skeleton disappears within 2 seconds
- ✅ Session tabs appear at the top
- ✅ Console shows migration success
- ✅ IndexedDB has `chrome_ext_db` database
- ✅ Switching tabs is instant (no size refresh in chrome://extensions)

