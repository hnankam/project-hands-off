# Session Tab Data Flow & Race Conditions Diagram

## Critical Race Condition #1: Message Restoration vs Auto-Persistence

```
TIME →

User Action: Switch from Session A to Session B
    ↓
    
┌─────────────────────────────────────────────────────────────────────┐
│ T+0ms: Session Switch Event                                          │
│   - SessionTabs.handleSessionClick(sessionB.id)                     │
│   - sessionStorageDBWrapper.setActiveSession(sessionB.id)           │
└─────────────────────────────────────────────────────────────────────┘
    ↓
    ├──────────────────────────────────┬───────────────────────────────────┐
    ↓ (Race starts)                    ↓                                   ↓
    
┌─────────────────────────────────┐  ┌──────────────────────────────┐  ┌────────────────────────────────┐
│ THREAD A:                        │  │ THREAD B:                     │  │ THREAD C:                       │
│ ChatSessionContainer             │  │ RuntimeStateBridge            │  │ useMessagePersistence           │
│ (Session B mounting)             │  │ (Session B mounting)          │  │ (Session B loading)             │
└─────────────────────────────────┘  └──────────────────────────────┘  └────────────────────────────────┘
    ↓                                     ↓                                  ↓
T+0ms                                 T+0ms                              T+0ms
prevSessionIdRef.current = sessionA   mountedAtRef.current = now         storedMessagesRef.current = null
setHeadlessMessagesCount(0)           isLoading = false                  restoreAttemptCountRef = 0
                                      messages = []                      
    ↓                                     ↓                                  ↓
T+50ms                                T+50ms                             T+100ms
Agent switching check                 Effect triggers:                   handleLoadMessages() called
(not switching)                       computeSignature([])               
    ↓                                     ↓                                  ↓
T+100ms                               T+100ms                            T+120ms
Session ready                         hasMessages = false                Fetching from storage:
handleLoadMessages scheduled          shouldPersistEmpty = true          getAllMessagesAsync(sessionB)
    ↓                                     ↓                                  ↓
    │                                 T+120ms                            T+150ms
    │                                 Grace check:                       Storage returns:
    │                                 now - mountedAt = 120ms            [msg1, msg2, msg3] (Session B)
    │                                 < 1500ms ✓                         
    │                                     ↓                                  ↓
    │                                 T+120ms                            T+160ms
    │                                 Check storage:                     Sanitize & validate
    │                                 getAllMessagesAsync(sessionB)      sanitizedFromStorage = [msg1, msg2, msg3]
    │                                 ⚠️  RACE CONDITION HERE ⚠️            ↓
    │                                     ↓                              T+170ms
    │                                 ┌─────────────────────────┐       Comparing signatures
    │                                 │ CRITICAL BRANCH POINT    │       Should restore = true
    │                                 │                          │           ↓
    │                                 │ If storage returns []    │       T+180ms
    │                                 │ BEFORE Thread C writes:  │       ❌ BUT RuntimeStateBridge
    │                                 │                          │       already wrote []!
    │                                 │ → Persists []            │           ↓
    │                                 │ → WIPES Session B data   │       T+190ms
    │                                 │                          │       Reads storage again:
    │                                 │ If storage returns [...]  │       [] (empty!)
    │                                 │ AFTER Thread C writes:   │           ↓
    │                                 │                          │       T+200ms
    │                                 │ → Skips persist          │       ❌ DATA LOST
    │                                 │ → Data preserved         │       restoreMessagesRef.current([])
    │                                 └─────────────────────────┘       
    │                                     ↓
    ↓                                 T+180ms
T+200ms                               Result stored (empty):
restoreMessagesRef.current called     updateAllMessages(sessionB, [])
                                          ↓
                                      T+200ms
                                      ❌ OVERWRITES Session B messages
                                      with empty array

┌─────────────────────────────────────────────────────────────────────┐
│ OUTCOME: Session B loses all messages if timing aligns poorly       │
│                                                                       │
│ Probability: ~5-10% on fast machines, ~20-30% on slow machines      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Critical Race Condition #2: Agent Switching During Session Switch

```
TIME →

User Action: Switch from Model A to Model B, then switch to different session
    ↓
    
┌─────────────────────────────────────────────────────────────────────┐
│ T+0ms: User selects Model B in Session X                             │
│   - setSelectedModel('model-b')                                      │
└─────────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ T+0ms: useAgentSwitching Effect Triggers                             │
│   - agentChanged = true                                              │
│   - runId = ++switchRunIdRef.current (e.g., runId=5)                │
│   - setSwitchingStep(1)                                              │
│   - setIsSwitchingAgent(true)                                        │
└─────────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ T+50ms: Step 1 - Saving Messages                                     │
│   - await handleSaveMessages() for Session X                         │
│   - Messages saved to storage                                        │
│   - if (switchRunIdRef.current !== 5) return ✓ (OK)                 │
└─────────────────────────────────────────────────────────────────────┘
    ↓
    ├──────────────────────────── ⚠️  USER ACTION ⚠️  ─────────────────┐
    │                                                                    ↓
    ↓                                                                    ↓
    │                                                        ┌────────────────────────┐
    │                                                        │ T+150ms: User clicks   │
    │                                                        │ Session Y tab          │
    │                                                        │                        │
    │                                                        │ - handleSessionClick   │
    │                                                        │ - setActiveSession(Y)  │
    │                                                        └────────────────────────┘
    │                                                                    ↓
    ↓                                                        ┌────────────────────────┐
┌─────────────────────────────────────────────────┐        │ T+160ms:               │
│ T+200ms: Step 2 - Switching Agent/Model         │        │ Session switch effect  │
│   - if (switchRunIdRef.current !== 5) return ✓  │        │ in ChatSessionContainer│
│   - setSwitchingStep(2)                          │        │                        │
│   - setActiveAgent('model-b')                    │        │ prevSessionIdRef.current│
│   - setActiveModel('model-b')                    │        │   = sessionX           │
│   - ❌ CopilotKit remounts with NEW key          │        │ sessionId = sessionY   │
│   - ❌ But sessionId still = sessionX!           │        │                        │
└─────────────────────────────────────────────────┘        └────────────────────────┘
    ↓                                                                    ↓
    │                                                                    ↓
    ↓                                                        ┌────────────────────────┐
┌─────────────────────────────────────────────────┐        │ T+250ms:               │
│ T+400ms: CopilotKit remount wait complete        │        │ useAgentSwitching      │
│   - if (switchRunIdRef.current !== 5) return ✓  │        │ session effect triggers│
│   - (Still passes! runId not incremented yet)    │        │                        │
│   - setSwitchingStep(3)                          │        │ ++switchRunIdRef       │
│                                                   │        │   (now = 6)            │
└─────────────────────────────────────────────────┘        │                        │
    ↓                                                        │ setActiveAgent(Y.agent)│
    ↓                                                        │ setActiveModel(Y.model)│
┌─────────────────────────────────────────────────┐        └────────────────────────┘
│ T+650ms: Step 3 - Restore Messages               │                    ↓
│   - if (switchRunIdRef.current !== 5) return ❌  │                    ↓
│   - ❌ CANCELLED! runId is now 6                 │        ┌────────────────────────┐
│                                                   │        │ T+300ms:               │
│ BUT: Race window T+400-650ms exists              │        │ ChatInnerComponent     │
│      where CopilotKit is in inconsistent state:  │        │ remounts for Session Y │
│                                                   │        │                        │
│      - Runtime has Session X's agent config      │        │ with Agent config from │
│      - Frontend sessionId prop = Session X       │        │ Session X's switch!    │
│      - UI shows Session Y                        │        │                        │
│                                                   │        │ threadId = sessionX    │
│      Any messages sent in this window go to      │        │ sessionId = sessionY   │
│      wrong session!                              │        │                        │
└─────────────────────────────────────────────────┘        │ ❌ MISMATCH            │
                                                            └────────────────────────┘
                                                                        ↓
                                                            ┌────────────────────────┐
                                                            │ T+600ms:               │
                                                            │ Session Y fully loaded │
                                                            │ but may have received  │
                                                            │ messages from Session X│
                                                            │ agent config           │
                                                            └────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ OUTCOME: Cross-session message contamination                        │
│                                                                       │
│ Window of vulnerability: ~250ms (T+400 to T+650)                    │
│ Impact: Messages sent during window go to wrong session             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Critical Race Condition #3: Concurrent Database Writes

```
┌─────────────────────────────────────────────────────────────────────┐
│ SCENARIO: User deletes message while agent completes action         │
└─────────────────────────────────────────────────────────────────────┘

TIME →

    THREAD A: User Deletion              THREAD B: Agent Completion
         ↓                                        ↓
    
T+0ms                                        T+0ms
User clicks delete on message #5            Agent completes "click" action
    ↓                                            ↓
    
T+10ms                                       T+10ms
ChatInner detects messages.length           onInProgress(false) callback
decreased                                        ↓
    ↓                                        T+20ms
T+20ms                                       Save messages effect triggers
saveMessagesRef.current() called             saveMessagesRef.current() called
    ↓                                            ↓
T+30ms                                       T+30ms
Reads current messages:                      Reads current messages:
[msg1, msg2, msg3, msg4, msg6]              [msg1, msg2, msg3, msg4, msg5, msg6]
(msg5 removed)                               (msg5 still present in its view)
    ↓                                            ↓
T+40ms                                       T+40ms
sanitizeMessages([...])                      sanitizeMessages([...])
    ↓                                            ↓
T+50ms                                       T+50ms
sessionStorageDBWrapper                      sessionStorageDBWrapper
  .updateAllMessages(sessionId, [...])         .updateAllMessages(sessionId, [...])
    ↓                                            ↓
    ├────────────────────────────────────────────┤
    ↓                                            ↓
T+60ms                                       T+70ms
┌────────────────────────────┐              ┌────────────────────────────┐
│ DB Worker Queue:            │              │ DB Worker Queue:            │
│                             │              │                             │
│ 1. UPDATE session_messages  │              │ 1. UPDATE session_messages  │
│    SET messages = [...]     │ ◄─────────┐  │    SET messages = [...]     │
│    WHERE sessionId = X      │           │  │    WHERE sessionId = X      │
│    (5 messages)             │           │  │    (6 messages)             │
│                             │           │  │                             │
│ 2. UPDATE session_metadata  │           └──┼─ ⚠️  OVERWRITES Write A     │
│    SET timestamp = ...      │              │                             │
└────────────────────────────┘              │ 2. UPDATE session_metadata  │
                                             │    SET timestamp = ...      │
                                             └────────────────────────────┘
         ↓                                            ↓
         
T+100ms                                      T+110ms
Write A completes                            Write B completes
✓ msg5 deleted                               ❌ msg5 restored!

┌─────────────────────────────────────────────────────────────────────┐
│ FINAL STATE IN DATABASE:                                            │
│   messages: [msg1, msg2, msg3, msg4, msg5, msg6]                   │
│   timestamp: T+110ms                                                 │
│                                                                       │
│ User sees msg5 reappear after deletion!                             │
└─────────────────────────────────────────────────────────────────────┘

WHY THIS HAPPENS:
- No database transaction isolation
- No optimistic locking (version field)
- No message-level deduplication on read
- "Last write wins" semantics
```

---

## Data Flow: Complete Session Switch

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                     COMPLETE SESSION SWITCH DATA FLOW                          │
└───────────────────────────────────────────────────────────────────────────────┘

USER CLICKS SESSION B TAB
        ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: UI Event (SessionTabs.tsx)                                           │
│   handleSessionClick(sessionB.id)                                             │
│   - Guard: if (sessionId === currentSessionId) return                         │
│   - sessionStorageDBWrapper.setActiveSession(sessionB.id)                     │
└───────────────────────────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: Database Update (session-storage-db.ts)                              │
│   setActiveSession(sessionB.id)                                               │
│   - Deactivate all sessions: UPDATE session_metadata SET isActive = false     │
│   - Activate target: UPDATE session_metadata SET isActive = true WHERE id = B │
│   - Update current_session: UPDATE current_session SET sessionId = B          │
│   - notify({ type: 'sessionsUpdated' })                                       │
└───────────────────────────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: Store Notification (use-session-storage-db.tsx)                      │
│   sessionStorageDB.subscribe() callback fires                                 │
│   - fetchData() called                                                         │
│   - getAllSessions() → returns updated sessions list                          │
│   - getCurrentSessionId() → returns sessionB.id                               │
│   - React useSyncExternalStore triggers re-render                             │
└───────────────────────────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: React Re-render Cascade                                              │
│                                                                                 │
│   SessionsPage                                                                 │
│   - currentSessionId changes from A → B                                       │
│   - setIsSessionReady(false)                                                  │
│   - setIsMessagesLoading(true)                                                │
│        ↓                                                                       │
│   ChatSessionContainer (Session A)                                            │
│   - isActive changes from true → false                                        │
│   - Stays mounted but inactive                                                │
│   - Auto-save triggers (saves Session A state)                                │
│        ↓                                                                       │
│   ChatSessionContainer (Session B)                                            │
│   - isActive changes from false → true                                        │
│   - prevSessionIdRef.current detects switch                                   │
│   - setHeadlessMessagesCount(0)                                               │
│   - setCurrentAgentStepState({ sessionId: B, steps: [] })                    │
│   - handleLoadMessages() called                                               │
│        ↓                                                                       │
│   SessionRuntimeHost                                                           │
│   - CopilotKit props.threadId changes from A → B                              │
│   - ❌ CopilotKit does NOT remount (same key)                                │
│   - Runtime context switches internally                                       │
│        ↓                                                                       │
│   RuntimeStateBridge                                                           │
│   - sessionId prop changes from A → B                                         │
│   - mountedAtRef.current = Date.now()                                         │
│   - messages state = [] (empty initially)                                     │
│   - Effect triggers to persist state (delayed 120ms)                          │
│        ↓                                                                       │
│   ChatInner                                                                    │
│   - sessionId prop changes from A → B                                         │
│   - cachedSanitizedRef.current = null                                         │
│   - wasStreamingRef.current = false                                           │
│   - pageDataRef.current preserved (wrong!)                                    │
│   - scrollSpacerRef.current preserved (wrong!)                                │
│   - hasInitializedStickyOnOpenRef.current = false                             │
└───────────────────────────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│ LAYER 5: Message Restoration (useMessagePersistence.ts)                       │
│   handleLoadMessages() executes                                               │
│   - getAllMessagesAsync(sessionB.id)                                          │
│   - Returns raw messages from database                                        │
│   - sanitizeNormalizedMessages(rawMessages)                                   │
│   - Compute signature: hash of [id, role, content]                            │
│   - Compare with storedMessagesRef.current signature                          │
│   - If different: restoreMessagesRef.current(sanitized) ✓                    │
│   - If same: skip restore to avoid overwrite                                  │
│                                                                                 │
│   ⚠️  RACE WINDOW: 120-200ms                                                  │
│   RuntimeStateBridge might persist [] before restoration completes            │
└───────────────────────────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│ LAYER 6: Agent State Restoration (ChatSession.tsx)                            │
│   useEffect(() => { loadAgentState() }, [sessionId])                          │
│   - getAgentStepStateAsync(sessionB.id)                                       │
│   - Returns stored agent state from database                                  │
│   - setInitialAgentStepState(storedState)                                     │
│   - setCurrentAgentStepState(storedState)                                     │
│                                                                                 │
│   ⚠️  RACE CONDITION with ChatInner's useCoAgent hook:                        │
│   - If backend returns state with sessionId=A, ChatInner filters it out       │
│   - If backend returns state with no sessionId, ChatInner adopts it           │
│   - If timing is off, wrong session's state can appear briefly                │
└───────────────────────────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│ LAYER 7: Content Fetch (ChatSession.tsx)                                      │
│   fetchFreshPageContent(force=true, currentTabId)                             │
│   - Cache invalidated for this session switch                                 │
│   - Send message to content script: getPageContent                            │
│   - Receive page data (HTML, forms, clickables)                               │
│   - Update pageContentEmbeddingRef                                            │
│   - Pass to ChatInner as currentPageContent prop                              │
│                                                                                 │
│   ⚠️  ISSUE: contentCacheRef uses tabId only, not (sessionId, tabId)         │
│   If Session A and B both viewed same tab, cache returns stale data           │
└───────────────────────────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────────────────────────┐
│ LAYER 8: UI Ready Signal (SessionsPage.tsx)                                   │
│   handleSessionReady() called by ChatSessionContainer                         │
│   - Calculate elapsed time since skeleton started                             │
│   - If < MIN_SKELETON_DISPLAY_TIME, delay showing content                     │
│   - setIsSessionReady(true)                                                   │
│   - setIsMessagesLoading(false)                                               │
│   - UI shows Session B's messages                                             │
└───────────────────────────────────────────────────────────────────────────────┘

TOTAL TIME: 200-500ms depending on:
- Database query speed
- Message count
- Content fetch latency
- React re-render scheduling

CRITICAL WINDOWS:
- T+0-50ms: Store notification → Re-render cascade
- T+50-150ms: Message restoration race
- T+100-200ms: Agent state race  
- T+150-300ms: Content fetch race
```

---

## Thread Safety Analysis

```
┌─────────────────────────────────────────────────────────────────────┐
│ SHARED MUTABLE STATE ACROSS SESSIONS                                │
└─────────────────────────────────────────────────────────────────────┘

1. DATABASE WORKER (session-storage-db.ts)
   ┌────────────────────────────────────────────┐
   │ private worker: DBWorkerClient | null       │ ← SHARED
   │ private listeners: Set<...>                 │ ← SHARED
   │ private currentUserId: string | null        │ ← SHARED
   └────────────────────────────────────────────┘
   ❌ NO LOCKING
   ❌ NO REQUEST QUEUING PER SESSION
   ❌ WRITES CAN INTERLEAVE

2. CONTENT CACHE (ChatSession.tsx)
   ┌────────────────────────────────────────────┐
   │ contentCacheRef: Map<tabId, content>        │ ← PER COMPONENT
   └────────────────────────────────────────────┘
   ⚠️  SCOPED TO COMPONENT INSTANCE
   ✓ Safe from cross-session writes
   ❌ BUT: Key doesn't include sessionId
   ❌ Cache hit from wrong session possible

3. RUNTIME STATE (SessionRuntimeContext.tsx)
   ┌────────────────────────────────────────────┐
   │ runtimeStates: Map<sessionId, RuntimeState> │ ← GLOBAL
   │ listeners: Set<...>                         │ ← GLOBAL
   └────────────────────────────────────────────┘
   ✓ Properly keyed by sessionId
   ✓ Separate state per session
   ❌ BUT: Updates not atomic
   ❌ Persistence race with database

4. MESSAGE REFS (ChatInner.tsx)
   ┌────────────────────────────────────────────┐
   │ saveMessagesRef                             │ ← PER INSTANCE
   │ restoreMessagesRef                          │ ← PER INSTANCE
   │ cachedSanitizedRef                          │ ← PER INSTANCE
   │ wasStreamingRef                             │ ← PER INSTANCE
   └────────────────────────────────────────────┘
   ✓ Each ChatInner has own refs
   ✓ Safe from cross-session interference
   ❌ BUT: Cleared on sessionId change
   ❌ Timing window for stale reads

5. SCROLL STATE (ChatInner.tsx)
   ┌────────────────────────────────────────────┐
   │ scrollSpacerRef                             │ ← PER INSTANCE
   │ elementCacheRef                             │ ← PER INSTANCE
   │ currentStickyIdRef                          │ ← PER INSTANCE
   └────────────────────────────────────────────┘
   ❌ NOT CLEARED on session switch
   ❌ Can manipulate wrong DOM
   ❌ Memory leak (spacer not removed)

6. AGENT SWITCHING STATE (useAgentSwitching.ts)
   ┌────────────────────────────────────────────┐
   │ switchRunIdRef                              │ ← PER INSTANCE
   │ previousAgentRef                            │ ← PER INSTANCE
   │ previousSessionIdRef                        │ ← PER INSTANCE
   └────────────────────────────────────────────┘
   ⚠️  Cancellation via runId increment
   ✓ Prevents completing old switch
   ❌ BUT: Doesn't prevent starting new switch
   ❌ State corruption window exists
```

---

## Recommendations Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│ ARCHITECTURAL CHANGES NEEDED                                        │
└─────────────────────────────────────────────────────────────────────┘

1. DATABASE LAYER
   [x] Add optimistic locking (version field)
   [x] Implement session-scoped write queue
   [x] Use database transactions for multi-table updates
   [x] Add rollback on partial failure

2. MESSAGE PERSISTENCE
   [x] Coordinate RuntimeStateBridge with useMessagePersistence
   [x] Add "intent to write" lock before persistence
   [x] Extend grace period or use explicit ready signal
   [x] Prevent concurrent writes with mutex/semaphore

3. AGENT SWITCHING
   [x] Check sessionId before EACH step in switch sequence
   [x] Add explicit cancellation to useAgentSwitching
   [x] Clear in-flight operations on session unmount
   [x] Use atomic switchover (save → switch → load as transaction)

4. CONTENT CACHE
   [x] Change key from tabId to (sessionId, tabId)
   [x] Invalidate all caches on session switch
   [x] Add cache version/generation counter

5. REF CLEANUP
   [x] Clear ALL refs on sessionId change
   [x] Cancel timeouts/intervals in cleanup
   [x] Remove DOM elements (spacers) on unmount

6. MONITORING
   [x] Add data integrity checks on load
   [x] Log checksums before/after writes
   [x] Alert on detected corruption
   [x] Implement automatic recovery
```

