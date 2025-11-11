# Debugging Logs - Session Tab Multi-Rendering Investigation

## Overview
Comprehensive logging has been added to track session initialization, rendering, and message restoration to identify the root cause of multi-rendering and unexpected session tab creation.

## Key Areas Instrumented

### 1. SessionsPage Component
**File**: `pages/side-panel/src/pages/SessionsPage.tsx`

#### Render Tracking
- `🔄 RENDER #N` - Tracks every render with session count, currentSessionId, loading states, and user IDs
- Shows: sessionsCount, currentSessionId, sessionsLoading, userId, storageUserId

#### User ID Change Detection
- `👤 User ID change check` - Monitors storage userId changes
- `🔄 USER ID CHANGED` - Logs when user ID actually changes (with from/to)

#### Sessions Snapshot Tracking
- `📸 Sessions snapshot effect` - Logs whenever sessions array changes
- `✅ FIRST SESSIONS SNAPSHOT` - Marks when the first valid sessions snapshot is observed for current user

#### Initial Session Creation
- `🔍 Ensure initial session effect` - Detailed logging of all conditions for creating initial session
- `⏸️ Sessions or user not ready` - Why it's waiting
- `⏸️ Waiting for first sessions snapshot` - Waiting for refetch after user ID set
- `✅ Sessions exist, no need to create` - Already has sessions
- `⏸️ Already ensuring or attempted` - Already tried
- `🚀 NO SESSIONS FOUND - creating initial session` - Actually creating new session

#### Session Ready Tracking
- `🎬 Session ready effect triggered` - When session changes
- `🔄 Session changed, starting skeleton display` - Session switch detected
- `⏰ Setting fallback timeout` - Safety timeout for skeleton
- `⏰ FALLBACK TIMEOUT fired` - Timeout expired

### 2. ChatSessionContainer Component
**File**: `pages/side-panel/src/components/ChatSessionContainer.tsx`

#### Render Tracking
- `🔄 RENDER #N for session XXX` - Every render with isActive status and timestamp

#### Session Lifecycle
- `🎬 ========== INITIAL SESSION MOUNT ==========` - First mount of a session
- `🔄 ========== SESSION SWITCHED ==========` - Switching between sessions (shows from/to)
- `✅ Session switch complete` - Reset complete

### 3. Message Persistence Hook
**File**: `pages/side-panel/src/hooks/useMessagePersistence.ts`

#### Message Loading
- `📥 ========== LOAD MESSAGES START ==========` - Start of message load
- `📦 Loaded N messages from storage` - How many messages retrieved
- `📭 No messages to load` - Empty session
- `🧹 Clearing messages in UI` - Clearing UI for empty session
- `⏭️ Messages unchanged, skipping restore` - No need to restore (signatures match)
- `🔄 Restoring N messages to UI` - Actually restoring messages
- `💉 Injecting messages into UI (attempt N)` - Restore attempt
- `✅ Messages restored successfully` - Restore succeeded
- `⚠️ restoreMessagesRef is null` - Restore ref not ready (will retry)
- `✅ ========== LOAD COMPLETE ==========` - End of load process

### 4. Session Storage DB
**File**: `packages/shared/lib/db/session-storage-db.ts`

#### User ID Changes
- Existing logs enhanced with `sessionsUpdated` notification on user ID change
- Immediate notification ensures session store refetches for new user

### 5. Session Store (Hook)
**File**: `packages/shared/lib/hooks/use-session-storage-db.tsx`

#### DB Event Handling
- `🔔 ========== DB EVENT RECEIVED ==========` - Event from DB
- Shows: Event type, number of listeners
- `✅ Data refetched successfully` - Refetch complete
- `❌ Failed to refetch` - Refetch error

#### Data Fetching
- `📦 ========== FETCHING DATA ==========` - Start of fetch
- Shows: Timestamp, current userId
- `✅ Fetch complete` - Shows sessionsCount, currentSessionId, all sessionIds

## What to Look For

### Expected Flow (Normal Case)
1. **Panel Opens**
   ```
   [SessionsPage] RENDER #1 (sessionsCount: 0, sessionsLoading: true, userId: null, storageUserId: null)
   [SessionStore] FETCHING DATA (userId: null) → returns []
   [SessionsPage] User ID change check (userId: abc123)
   [SessionStore] DB EVENT RECEIVED (sessionsUpdated)
   [SessionStore] FETCHING DATA (userId: abc123) → returns [session-1, session-2]
   [SessionsPage] FIRST SESSIONS SNAPSHOT for current user
   [SessionsPage] Sessions exist, no need to create
   [ChatSessionContainer] INITIAL SESSION MOUNT (session-1)
   [useMessagePersistence] LOAD MESSAGES START
   [useMessagePersistence] Loaded 5 messages
   [useMessagePersistence] Restoring 5 messages to UI
   ```

### Bug Indicators

#### Phantom Session Creation
```
[SessionsPage] NO SESSIONS FOUND - creating initial session
```
- This should ONLY appear for truly new users
- If it appears when sessions exist → BUG

#### Missing User ID Notification
```
[SessionsPage] USER ID CHANGED
[SessionStore] DB EVENT RECEIVED (sessionsUpdated)
```
- These should always appear together
- If USER ID CHANGED but no DB EVENT → BUG in notification

#### Multiple Renders Before Snapshot
```
[SessionsPage] RENDER #1 (sessionsCount: 0)
[SessionsPage] RENDER #2 (sessionsCount: 0)
[SessionsPage] RENDER #3 (sessionsCount: 3)
```
- Many renders with count=0 before seeing sessions → timing issue
- Should stabilize quickly after user ID set

#### Message Restoration Issues
```
[useMessagePersistence] LOAD MESSAGES START
[ChatSessionContainer] RENDER #1
[ChatSessionContainer] RENDER #2
[useMessagePersistence] LOAD MESSAGES START (again!)
```
- Multiple LOAD MESSAGES calls → double restoration
- Should only load once per session activation

## How to Use These Logs

1. **Open browser console** (F12)
2. **Filter by component**: Use console filter with keywords like `[SessionsPage]`, `[SessionStore]`, `[ChatSessionContainer]`
3. **Open side panel** and watch console
4. **Look for patterns**: 
   - Multiple `NO SESSIONS FOUND` calls
   - `RENDER` counts going very high
   - Multiple `LOAD MESSAGES` for same session
   - Missing `DB EVENT RECEIVED` after `USER ID CHANGED`

## Quick Diagnosis Commands

```javascript
// In console, check current state:
console.log('Storage userId:', sessionStorageDBWrapper.getCurrentUserId());
console.log('Sessions:', await sessionStorageDBWrapper.getAllMessagesAsync('session-id'));
```

## Expected Timeline
```
0ms:   Panel opens, first render (loading=true)
50ms:  Auth loads, userId set
100ms: DB refetches with userId
150ms: Sessions appear, pick active session
200ms: ChatSessionContainer mounts
250ms: Messages load starts
400ms: Messages restored to UI
500ms: UI fully interactive
```

If any step takes much longer or happens multiple times → investigate that component.

