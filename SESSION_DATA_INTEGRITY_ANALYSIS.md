# Session Data Integrity Analysis
## Critical Issues & Potential Data Corruption/Loss Scenarios

**Date**: 2025-11-14  
**Scope**: All actions and events occurring when session tabs are opened

---

## 🚨 CRITICAL ISSUES

### 1. **Race Condition: Message Restoration vs. RuntimeStateBridge Auto-Persistence**

**Location**: `pages/side-panel/src/hooks/useMessagePersistence.ts` + `pages/side-panel/src/context/SessionRuntimeContext.tsx`

**Problem**: When switching sessions, there's a race between:
- `handleLoadMessages()` restoring messages from storage (line 454-610 in useMessagePersistence.ts)
- `RuntimeStateBridge` auto-persisting empty/stale messages (line 276-359 in SessionRuntimeContext.tsx)

**Data Loss Scenario**:
```
1. User switches from Session A to Session B
2. RuntimeStateBridge mounts for Session B with empty messages
3. Within 1500ms, RuntimeStateBridge may persist empty array to storage
4. handleLoadMessages() runs but finds empty storage or gets overwritten
5. Session B's messages are LOST
```

**Evidence**:
```typescript
// RuntimeStateBridge.tsx:340-348
if (!hasMessages && Date.now() - mountedAtRef.current < 1500) {
  try {
    const stored = await sessionStorageDBWrapper.getAllMessagesAsync(sessionId);
    if (Array.isArray(stored) && stored.length > 0) {
      console.log(
        `[RuntimeStateBridge:${sessionId.slice(0, 8)}] Preventing early empty overwrite; storage has ${stored.length} messages`,
      );
      return;
    }
```

**Mitigation Present**: Grace period exists but only 1500ms - may not be enough for slow loads.

**Risk Level**: 🔴 HIGH - Can cause complete message history loss

---

### 2. **Agent State Cross-Session Contamination**

**Location**: `pages/side-panel/src/components/ChatInner.tsx` (lines 1467-1608)

**Problem**: Agent step state uses a single `useCoAgent` hook with name `'dynamic_agent'` but relies on sessionId matching logic that can fail during rapid session switching.

**Data Corruption Scenario**:
```
1. User is in Session A with agent steps [Step 1, Step 2, Step 3]
2. User rapidly switches to Session B
3. Backend session_manager.py reuses state based on (session_id, agent_type, model)
4. If agent/model are same, state might carry over briefly
5. Frontend receives agent state with wrong sessionId or no sessionId
6. planDeletionInfoRef logic gets confused (lines 1494-1543)
7. Session B shows Session A's steps OR steps disappear incorrectly
```

**Evidence**:
```typescript
// ChatInner.tsx:1494-1515
const dynamicAgentState = React.useMemo<AgentStepState>(() => {
  if (planDeletionInfoRef.current.deleted && (rawDynamicAgentState.steps?.length ?? 0) > 0) {
    console.log('[COAGENT_STATE_MEMO] Plan deleted, returning empty');
    return { sessionId, steps: [] };
  }
  if (rawDynamicAgentState.sessionId && rawDynamicAgentState.sessionId !== sessionId) {
    console.log('[COAGENT_STATE_MEMO] Session mismatch, returning empty');
    return { sessionId, steps: [] };
  }
  // ... complex logic that can fail during race conditions
```

**Risk Level**: 🔴 HIGH - User sees wrong session's agent tasks

---

### 3. **ThreadId Mismatch Between Frontend and Backend**

**Location**: Multiple files

**Problem**: ThreadId is set to sessionId in CopilotKit props, but backend session manager uses combination of (session_id, agent_type, model, org_id, team_id) as state key.

**Files Affected**:
- `pages/side-panel/src/context/SessionRuntimeContext.tsx:220` - `threadId: config.sessionId`
- `pages/side-panel/src/ChatSession.tsx:972` - `threadId={sessionId}`
- `copilotkit-pydantic/services/session_manager.py:35-42` - Different key generation

**Data Corruption Scenario**:
```
1. User has Session A with Model X
2. User switches to Session B with Model X (same model)
3. Backend creates/reuses state key: "session-b_agent_model-x_org_team"
4. Frontend sends threadId="session-b"
5. If backend threads don't match state keys, conversation context can mix
6. Messages from Session A might influence Session B's responses
```

**Evidence**:
```python
# session_manager.py:35-42
key = f"{session_id}_{agent_type}_{model}_{organization_id or 'default'}_{team_id or 'default'}"
```

**Risk Level**: 🟡 MEDIUM - Potential context bleeding between sessions

---

### 4. **Message Sanitization Cache Contamination**

**Location**: `pages/side-panel/src/components/ChatInner.tsx` (lines 1254-1257)

**Problem**: Sanitization cache is cleared on session change, but there's a window where stale cache might be used.

**Evidence**:
```typescript
// ChatInner.tsx:1254-1257
useEffect(() => {
  cachedSanitizedRef.current = null;
  wasStreamingRef.current = false;
}, [sessionId]);
```

**Data Corruption Scenario**:
```
1. Session A is streaming a response
2. User quickly switches to Session B
3. Session A's streaming completion handler fires (onInProgress callback)
4. It reads cachedSanitizedRef which was just cleared
5. Falls back to raw messages which might be Session B's
6. Applies Session A's transformations to Session B's messages
```

**Risk Level**: 🟡 MEDIUM - Can cause message corruption during rapid switching

---

### 5. **Database Write Race Conditions**

**Location**: `packages/shared/lib/db/session-storage-db.ts` (lines 610-730)

**Problem**: Multiple components can write messages simultaneously without transaction locking:
- `ChatInner` (line 1243-1246)
- `RuntimeStateBridge` (line 354-356)
- `useMessagePersistence` (line 486)
- Agent switching hook (line 148)

**Data Loss Scenario**:
```
1. User deletes a message in UI
2. ChatInner immediately persists via updateAllMessages()
3. Simultaneously, RuntimeStateBridge's setTimeout fires
4. RuntimeStateBridge persists old message set (includes deleted message)
5. Deleted message REAPPEARS in session
```

**Evidence**:
```typescript
// session-storage-db.ts:710-720 - NO locking mechanism
if (existingRecord) {
  await worker.query(
    'UPDATE session_messages SET messages = $messages WHERE sessionId = $id;',
    { id: sessionId, messages: normalizedMessages }
  );
}
```

**Risk Level**: 🔴 HIGH - Last write wins, can restore deleted data

---

### 6. **Session Close During Active Agent Execution**

**Location**: `packages/shared/lib/db/session-storage-db.ts` (lines 474-511) + `packages/ui/lib/components/SessionTabs.tsx` (lines 30-32)

**Problem**: Closing a session doesn't cancel in-flight agent operations. Agent might continue writing to closed session.

**Data Loss Scenario**:
```
1. Agent is executing multi-step task in Session A
2. Agent step state shows "Step 2 of 5 running"
3. User closes Session A tab
4. Session is marked isOpen=false, isActive=false
5. Agent completes Step 2, tries to write to Session A
6. Write succeeds (session still exists in DB)
7. User reopens Session A later
8. Sees partial/corrupted state: Step 2 complete, Steps 3-5 pending but never executed
```

**Evidence**:
```typescript
// SessionTabs.tsx:30-32
const handleCloseSession = (sessionId: string, e: React.MouseEvent) => {
  e.stopPropagation();
  sessionStorageDBWrapper.closeSession(sessionId);  // No cancellation signal
};
```

**Risk Level**: 🟡 MEDIUM - Orphaned agent operations continue

---

### 7. **Sticky Scroll State Not Cleared on Session Switch**

**Location**: `pages/side-panel/src/components/ChatInner.tsx` (lines 380-611)

**Problem**: Scroll spacer and sticky state refs are not cleaned up when session changes.

**UI Corruption Scenario**:
```
1. Session A has sticky user message with spacer actively shrinking
2. User switches to Session B
3. scrollSpacerRef.current still points to Session A's spacer
4. Session B tries to scroll, finds stale spacer
5. Spacer manipulates wrong DOM (Session A's container might be unmounted)
6. JavaScript errors or DOM corruption
```

**Evidence**:
```typescript
// ChatInner.tsx:1168-1170 - Only clears initialization flag, not spacer
useEffect(() => {
  hasInitializedStickyOnOpenRef.current = false;
}, [sessionId]);
```

**Risk Level**: 🟢 LOW - UI only, but can cause errors

---

### 8. **Content Cache Not Session-Scoped**

**Location**: `pages/side-panel/src/ChatSession.tsx` (lines 186-189, 629-658)

**Problem**: Content cache uses tabId as key, not (sessionId, tabId). When switching sessions viewing same tab, cache returns wrong data.

**Data Corruption Scenario**:
```
1. Session A views github.com/repo1, caches page content
2. User opens Session B, navigates to github.com/repo1
3. Session B checks cache with key "github_tab_123"
4. Finds Session A's cache
5. Agent in Session B operates on stale Session A content
6. Wrong page actions executed
```

**Evidence**:
```typescript
// ChatSession.tsx:186-189
const contentCacheRef = useRef<Map<string, { 
  content: any; 
  timestamp: number; 
  tabId: number  // Missing sessionId!
}>>(new Map());
```

**Risk Level**: 🟡 MEDIUM - Agent operates on wrong content

---

### 9. **Agent Switching 3-Step Process Not Atomic**

**Location**: `pages/side-panel/src/hooks/useAgentSwitching.ts` (lines 138-192)

**Problem**: Agent switching involves:
1. Save messages (150ms delay)
2. Switch agent/model (remount CopilotKit)
3. Restore messages (300ms delay)

If user switches sessions during this process, state gets corrupted.

**Data Loss Scenario**:
```
1. User switches from Model A to Model B in Session X
2. Step 1 completes: messages saved
3. User switches to Session Y
4. Step 2 executes: CopilotKit remounts with Session Y's ID but Session X's agent config
5. Step 3 executes: Restores Session X's messages into Session Y's runtime
6. Session Y now has Session X's messages
```

**Evidence**:
```typescript
// useAgentSwitching.ts:88-89
useEffect(() => {
  const agentChanged = previousAgentRef.current !== selectedAgent;
  // ... no cancellation if sessionId changes
```

**Risk Level**: 🔴 HIGH - Cross-session message contamination

---

### 10. **Database Worker Not Per-Session**

**Location**: `packages/shared/lib/db/session-storage-db.ts` (lines 29-40)

**Problem**: Single global DBWorker handles all sessions. No transaction isolation between sessions.

**Data Corruption Scenario**:
```
1. Session A writes 100 messages (slow operation)
2. Session B simultaneously writes 50 messages
3. Both update session_metadata timestamp
4. Worker processes queries in queue order
5. Session B's timestamp update happens last
6. Session A's messages are stored but Session B's timestamp is recorded
7. Session sorting shows wrong "last active" time
```

**Evidence**:
```typescript
// session-storage-db.ts:30-40
export class SessionStorageDB {
  private worker: DBWorkerClient | null = null  // Single worker
  private listeners: Set<SessionStorageListener> = new Set();
  private currentUserId: string | null = null;
```

**Risk Level**: 🟢 LOW - Rare race condition

---

## 🟡 MEDIUM PRIORITY ISSUES

### 11. **No Rollback on Partial Save Failures**

**Location**: `packages/shared/lib/db/session-storage-db.ts` (lines 710-726)

**Problem**: When updating messages, also updates session timestamp. If timestamp update fails, messages are saved but timestamp is stale.

**Impact**: Session appears not updated, user might lose work thinking it didn't save.

---

### 12. **Usage Stats Not Transactionally Updated**

**Location**: `packages/shared/lib/db/session-storage-db.ts` (lines 739-817)

**Problem**: Token usage updates are separate operations from message updates. Can get out of sync.

**Impact**: Billing inconsistencies if messages save but usage stats don't.

---

### 13. **Session Close Creates New Session Without Preserving Context**

**Location**: `packages/shared/lib/db/session-storage-db.ts` (lines 490-505)

**Problem**: When last session closes, creates new session with random name. User loses context of what they were doing.

---

### 14. **Message Deduplication Logic Can Remove Valid Messages**

**Location**: `packages/shared/lib/db/session-storage-db.ts` (lines 648-683)

**Problem**: Deduplication uses id+role+content. If user sends same message twice intentionally, second is removed.

**Impact**: User's explicit retry is lost.

---

### 15. **Early Empty Persistence Grace Period Too Long**

**Location**: `pages/side-panel/src/context/SessionRuntimeContext.tsx` (lines 327-334)

**Problem**: 700ms grace period before persisting empty might be too aggressive on slow systems.

---

## 🟢 LOW PRIORITY ISSUES

### 16. **Console Logs in Production Code**

Excessive debugging logs can impact performance during rapid session switching.

---

### 17. **Ref Cleanup Not Comprehensive**

Multiple refs (`scrollSpacerRef`, `elementCacheRef`, `currentStickyIdRef`) not cleared on unmount.

---

### 18. **No Session Lock During Critical Operations**

When deleting all messages or resetting session, no lock prevents concurrent writes.

---

## 📋 RECOMMENDATIONS

### Immediate Actions (Week 1)

1. **Add Session-Scoped Locking**
   - Implement pessimistic locking for message writes
   - Use SurrealDB transactions: `BEGIN TRANSACTION; ... COMMIT;`

2. **Fix Agent Switching Race Condition**
   - Add cancellation token to useAgentSwitching
   - Check sessionId hasn't changed before each step

3. **Scope Content Cache to Sessions**
   - Change cache key from `tabId` to `${sessionId}_${tabId}`

4. **Add Runtime State Cleanup**
   - Clear RuntimeStateBridge timeout on session unmount
   - Cancel pending persistence operations

### Short-term (Week 2-3)

5. **Implement Optimistic Locking for Messages**
   - Add version field to session_messages
   - Detect concurrent modifications

6. **Add Agent Operation Cancellation**
   - When session closes, send cancellation signal to backend
   - Backend checks session.isOpen before each step

7. **Separate ThreadId from SessionId**
   - Use consistent key generation frontend and backend
   - Prevent context bleeding

### Long-term (Month 1-2)

8. **Audit Trail for Message Changes**
   - Log all message mutations with timestamp
   - Enable rollback on corruption detection

9. **Session State Snapshots**
   - Periodic snapshots for recovery
   - User-facing "Restore previous version"

10. **Comprehensive Integration Tests**
    - Test rapid session switching
    - Test agent switching during streaming
    - Test concurrent message updates

---

## 🧪 TEST SCENARIOS TO VALIDATE

1. **Rapid Session Switching**
   - Switch between 5 sessions every 100ms
   - Verify no message loss or cross-contamination

2. **Agent Switch During Stream**
   - Start streaming response
   - Switch agent mid-stream
   - Verify messages don't corrupt

3. **Close Session During Agent Execution**
   - Start multi-step agent task
   - Close session at Step 2
   - Reopen, verify clean state

4. **Concurrent Message Updates**
   - Delete message in UI
   - Simultaneously have agent add message
   - Verify both operations succeed

5. **Browser Tab Switching**
   - Open 2 browser tabs with same session
   - Update in both simultaneously
   - Verify eventual consistency

---

## 📊 SEVERITY SUMMARY

- **Critical (Data Loss)**: 4 issues
- **High (Data Corruption)**: 3 issues  
- **Medium (Inconsistency)**: 8 issues
- **Low (UI/Performance)**: 3 issues

**Total**: 18 identified issues

---

## ⚠️ MOST CRITICAL PATH TO FIX

**Priority 1**: Issue #5 (Database Write Race) + Issue #1 (Message Restoration Race)
- These two together can cause complete message history loss
- Affects ALL session switches
- No user workaround available

**Priority 2**: Issue #9 (Agent Switching) + Issue #2 (Agent State Contamination)  
- Can mix messages between sessions
- Causes user confusion and data integrity issues
- Hard to debug when it happens

**Priority 3**: Issue #8 (Content Cache) + Issue #6 (Session Close)
- Can cause agent to operate on wrong data
- Leads to unintended actions on wrong pages

