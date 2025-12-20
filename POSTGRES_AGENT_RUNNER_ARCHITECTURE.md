# PostgresAgentRunner - Architecture Diagrams

This document provides visual representations of the PostgresAgentRunner architecture.

---

## 1. System Architecture Comparison

### Current: InMemoryAgentRunner

```
┌─────────────────────────────────────────────────────────────────┐
│                        Node.js Server                           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  CopilotRuntime                           │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────┐    │ │
│  │  │         InMemoryAgentRunner                     │    │ │
│  │  │                                                 │    │ │
│  │  │  GLOBAL_STORE (Map in RAM)                     │    │ │
│  │  │  ┌──────────────────────────────────────────┐  │    │ │
│  │  │  │ thread_1 → InMemoryEventStore           │  │    │ │
│  │  │  │   ├─ subject (ReplaySubject)            │  │    │ │
│  │  │  │   ├─ isRunning: false                   │  │    │ │
│  │  │  │   ├─ currentEvents: []                  │  │    │ │
│  │  │  │   └─ historicRuns: [...]               │  │    │ │
│  │  │  │                                          │  │    │ │
│  │  │  │ thread_2 → InMemoryEventStore           │  │    │ │
│  │  │  │   └─ ...                                │  │    │ │
│  │  │  └──────────────────────────────────────────┘  │    │ │
│  │  └─────────────────────────────────────────────────┘    │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Server Restart
                              ↓
                        ❌ ALL DATA LOST ❌
```

### Proposed: PostgresAgentRunner

```
┌─────────────────────────────────────────────────────────────────┐
│                        Node.js Server                           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  CopilotRuntime                           │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────┐    │ │
│  │  │         PostgresAgentRunner                     │    │ │
│  │  │                                                 │    │ │
│  │  │  activeSubjects (Map in RAM)                   │    │ │
│  │  │  ┌──────────────────────────────────────────┐  │    │ │
│  │  │  │ thread_1 → { subject, runSubject }      │  │    │ │
│  │  │  │ thread_2 → { subject, runSubject }      │  │    │ │
│  │  │  └──────────────────────────────────────────┘  │    │ │
│  │  │              ↕ (read/write)                    │    │ │
│  │  └─────────────────────────────────────────────────┘    │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              agent_threads (Table)                      │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │ thread_1 | org_1 | team_1 | running=false | ...  │  │  │
│  │  │ thread_2 | org_1 | team_2 | running=true  | ...  │  │  │
│  │  │ thread_3 | org_2 | team_1 | running=false | ...  │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              agent_runs (Table)                         │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │ run_1 | thread_1 | completed | events: [...] | .. │  │  │
│  │  │ run_2 | thread_1 | completed | events: [...] | .. │  │  │
│  │  │ run_3 | thread_2 | running   | events: [...] | .. │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Server Restart
                              ↓
                      ✅ DATA PERSISTED ✅
```

---

## 2. Request Flow Diagrams

### Run Request Flow

```
┌─────────┐
│ Client  │
└────┬────┘
     │ POST /api/copilotkit/agent/my-agent/run
     │ { threadId, runId, messages, ... }
     ↓
┌────────────────────────────────────────────────────────────┐
│                    CopilotRuntime                          │
│                                                            │
│  1. Validate agent exists                                 │
│  2. Clone agent instance                                  │
│  3. Call runner.run(request)                              │
└────┬───────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────┐
│              PostgresAgentRunner.run()                     │
│                                                            │
│  Step 1: Acquire Lock                                     │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ BEGIN TRANSACTION                                    │ │
│  │ SELECT * FROM agent_threads                          │ │
│  │   WHERE thread_id = $1 FOR UPDATE                    │ │
│  │                                                      │ │
│  │ IF is_running = TRUE:                                │ │
│  │   ROLLBACK                                           │ │
│  │   throw Error("Thread already running")             │ │
│  │                                                      │ │
│  │ UPDATE agent_threads                                 │ │
│  │   SET is_running = TRUE, current_run_id = $2        │ │
│  │ COMMIT                                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Step 2: Create Run Record                                │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ INSERT INTO agent_runs                               │ │
│  │   (run_id, thread_id, status, events)               │ │
│  │   VALUES ($1, $2, 'running', '[]')                  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Step 3: Load Historic Data                               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ SELECT * FROM agent_runs                             │ │
│  │   WHERE thread_id = $1                               │ │
│  │     AND status IN ('completed', 'stopped')          │ │
│  │   ORDER BY created_at ASC                            │ │
│  │   LIMIT 10                                           │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Step 4: Set Up Observables                               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ runSubject = new ReplaySubject(Infinity)            │ │
│  │ threadSubject = new ReplaySubject(Infinity)         │ │
│  │ activeSubjects.set(threadId, { ... })               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Step 5: Execute Agent                                    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ await agent.runAgent(input, {                        │ │
│  │   onEvent: ({ event }) => {                          │ │
│  │     // Process event                                 │ │
│  │     runSubject.next(event)                           │ │
│  │     threadSubject.next(event)                        │ │
│  │     currentEvents.push(event)                        │ │
│  │   }                                                  │ │
│  │ })                                                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Step 6: Finalize & Persist                               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ appendedEvents = finalizeRunEvents(currentEvents)   │ │
│  │ compactedEvents = compactEvents(currentEvents)      │ │
│  │                                                      │ │
│  │ UPDATE agent_runs                                    │ │
│  │   SET status = 'completed',                          │ │
│  │       events = $2,                                   │ │
│  │       completed_at = NOW()                           │ │
│  │   WHERE run_id = $1                                  │ │
│  │                                                      │ │
│  │ UPDATE agent_threads                                 │ │
│  │   SET is_running = FALSE,                            │ │
│  │       current_run_id = NULL,                         │ │
│  │       last_accessed_at = NOW()                       │ │
│  │   WHERE thread_id = $1                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Step 7: Complete Observables                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ runSubject.complete()                                │ │
│  │ threadSubject.complete()                             │ │
│  │ activeSubjects.delete(threadId)                      │ │
│  └──────────────────────────────────────────────────────┘ │
└────┬───────────────────────────────────────────────────────┘
     │ return runSubject.asObservable()
     ↓
┌────────────────────────────────────────────────────────────┐
│                    CopilotRuntime                          │
│  Stream events back to client via SSE                     │
└────┬───────────────────────────────────────────────────────┘
     ↓
┌─────────┐
│ Client  │ Receives events in real-time
└─────────┘
```

### Connect Request Flow

```
┌─────────┐
│ Client  │
└────┬────┘
     │ POST /api/copilotkit/agent/my-agent/connect
     │ { threadId }
     ↓
┌────────────────────────────────────────────────────────────┐
│              PostgresAgentRunner.connect()                 │
│                                                            │
│  Step 1: Load Historic Runs                               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ SELECT * FROM agent_runs                             │ │
│  │   WHERE thread_id = $1                               │ │
│  │     AND status IN ('completed', 'stopped')          │ │
│  │   ORDER BY created_at ASC                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Step 2: Flatten & Compact Events                         │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ allEvents = historicRuns.flatMap(run => run.events) │ │
│  │ compactedEvents = compactEvents(allEvents)          │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Step 3: Create Connection Observable                     │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ connectionSubject = new ReplaySubject(Infinity)     │ │
│  │                                                      │ │
│  │ // Emit all historic events                          │ │
│  │ for (const event of compactedEvents) {              │ │
│  │   connectionSubject.next(event)                      │ │
│  │ }                                                    │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Step 4: Check for Active Run                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ SELECT is_running, stop_requested                    │ │
│  │   FROM agent_threads                                 │ │
│  │   WHERE thread_id = $1                               │ │
│  │                                                      │ │
│  │ IF is_running OR stop_requested:                     │ │
│  │   // Subscribe to active run                         │ │
│  │   activeSubjects.get(threadId).subscribe({          │ │
│  │     next: (event) => connectionSubject.next(event)  │ │
│  │   })                                                 │ │
│  │ ELSE:                                                │ │
│  │   connectionSubject.complete()                       │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  return connectionSubject.asObservable()                  │
└────┬───────────────────────────────────────────────────────┘
     ↓
┌─────────┐
│ Client  │ Receives full history + live updates
└─────────┘
```

---

## 3. Database Schema Relationships

```
┌────────────────────────────────────────────────────────────────┐
│                      organization                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ id (UUID, PK)                                            │ │
│  │ name                                                     │ │
│  │ slug                                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             │ 1:N
                             ↓
┌────────────────────────────────────────────────────────────────┐
│                          team                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ id (UUID, PK)                                            │ │
│  │ organization_id (UUID, FK)                               │ │
│  │ name                                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             │ 1:N
                             ↓
┌────────────────────────────────────────────────────────────────┐
│                      agent_threads                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ thread_id (VARCHAR, PK)                                  │ │
│  │ organization_id (UUID, FK) ──────────────────────────┐   │ │
│  │ team_id (UUID, FK) ──────────────────────────────┐   │   │ │
│  │ user_id (VARCHAR)                                │   │   │ │
│  │ session_id (VARCHAR)                             │   │   │ │
│  │ is_running (BOOLEAN)                             │   │   │ │
│  │ current_run_id (VARCHAR)                         │   │   │ │
│  │ stop_requested (BOOLEAN)                         │   │   │ │
│  │ agent_id (VARCHAR)                               │   │   │ │
│  │ agent_type (VARCHAR)                             │   │   │ │
│  │ model_type (VARCHAR)                             │   │   │ │
│  │ created_at (TIMESTAMPTZ)                         │   │   │ │
│  │ updated_at (TIMESTAMPTZ)                         │   │   │ │
│  │ last_accessed_at (TIMESTAMPTZ)                   │   │   │ │
│  └──────────────────────────────────────────────────┼───┼───┘ │
└────────────────────────────┬────────────────────────┼───┼─────┘
                             │                        │   │
                             │ 1:N                    │   │
                             ↓                        │   │
┌────────────────────────────────────────────────────┼───┼─────┐
│                      agent_runs                    │   │     │
│  ┌─────────────────────────────────────────────────┼───┼───┐ │
│  │ id (SERIAL, PK)                                 │   │   │ │
│  │ run_id (VARCHAR, UNIQUE)                        │   │   │ │
│  │ thread_id (VARCHAR, FK) ────────────────────────┘   │   │ │
│  │ parent_run_id (VARCHAR, FK, self-reference)         │   │ │
│  │ status (VARCHAR)                                    │   │ │
│  │ events (JSONB)                                      │   │ │
│  │ created_at (TIMESTAMPTZ)                            │   │ │
│  │ completed_at (TIMESTAMPTZ)                          │   │ │
│  └─────────────────────────────────────────────────────┘   │ │
└────────────────────────────────────────────────────────────┘ │
                                                                │
         Indexes:                                               │
         - idx_agent_threads_org (organization_id) ────────────┘
         - idx_agent_threads_team (team_id) ───────────────────┘
         - idx_agent_threads_user (user_id)
         - idx_agent_threads_running (is_running WHERE TRUE)
         - idx_agent_threads_last_accessed (last_accessed_at)
         - idx_agent_runs_thread (thread_id)
         - idx_agent_runs_status (status)
         - idx_agent_runs_created (created_at DESC)
```

---

## 4. Multi-Tenancy Isolation

```
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              agent_threads (Table)                      │  │
│  │                                                         │  │
│  │  Organization A (org_1)                                │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │ Team 1 (team_1)                                   │  │  │
│  │  │  ├─ thread_1 | org_1 | team_1 | user_1 | ...    │  │  │
│  │  │  └─ thread_2 | org_1 | team_1 | user_2 | ...    │  │  │
│  │  │                                                   │  │  │
│  │  │ Team 2 (team_2)                                   │  │  │
│  │  │  ├─ thread_3 | org_1 | team_2 | user_3 | ...    │  │  │
│  │  │  └─ thread_4 | org_1 | team_2 | user_4 | ...    │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  │                                                         │  │
│  │  Organization B (org_2)                                │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │ Team 1 (team_3)                                   │  │  │
│  │  │  ├─ thread_5 | org_2 | team_3 | user_5 | ...    │  │  │
│  │  │  └─ thread_6 | org_2 | team_3 | user_6 | ...    │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Query Isolation:                                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ SELECT * FROM agent_threads                             │  │
│  │   WHERE organization_id = $1                            │  │
│  │     AND (team_id = $2 OR team_id IS NULL)              │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Row-Level Security (Optional):                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ CREATE POLICY tenant_isolation ON agent_threads         │  │
│  │   USING (organization_id =                              │  │
│  │     current_setting('app.org_id')::uuid)                │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Event Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                         Event Lifecycle                          │
└──────────────────────────────────────────────────────────────────┘

1. Agent Execution
   ┌─────────────────────────────────────────────────────────────┐
   │ agent.runAgent(input, {                                     │
   │   onEvent: ({ event }) => {                                 │
   │     // Event generated by agent                             │
   │   }                                                          │
   │ })                                                           │
   └─────────────────────────────────────────────────────────────┘
                              │
                              ↓
2. Event Processing
   ┌─────────────────────────────────────────────────────────────┐
   │ processedEvent = processEvent(event, input, historicMsgIds) │
   │                                                              │
   │ // Special handling for RUN_STARTED:                        │
   │ // - Sanitize messages (remove historic)                    │
   │ // - Add input context                                      │
   └─────────────────────────────────────────────────────────────┘
                              │
                              ↓
3. In-Memory Streaming
   ┌─────────────────────────────────────────────────────────────┐
   │ runSubject.next(processedEvent)      // Current run only    │
   │ threadSubject.next(processedEvent)   // All subscribers     │
   │ currentEvents.push(processedEvent)   // For persistence     │
   └─────────────────────────────────────────────────────────────┘
                              │
                              ↓
4. Finalization (on run completion)
   ┌─────────────────────────────────────────────────────────────┐
   │ appendedEvents = finalizeRunEvents(currentEvents, {         │
   │   stopRequested: await isStopRequested(threadId)            │
   │ })                                                           │
   │                                                              │
   │ // Adds final events:                                       │
   │ // - RUN_FINISHED (if successful)                           │
   │ // - RUN_STOPPED (if stopped)                               │
   │ // - RUN_ERROR (if error)                                   │
   └─────────────────────────────────────────────────────────────┘
                              │
                              ↓
5. Event Compaction
   ┌─────────────────────────────────────────────────────────────┐
   │ compactedEvents = compactEvents(currentEvents)              │
   │                                                              │
   │ // Removes redundant events:                                │
   │ // - Duplicate MESSAGE_CREATED                              │
   │ // - Intermediate MESSAGE_UPDATED                           │
   │ // - Keeps only final state                                 │
   └─────────────────────────────────────────────────────────────┘
                              │
                              ↓
6. Database Persistence
   ┌─────────────────────────────────────────────────────────────┐
   │ UPDATE agent_runs                                            │
   │   SET status = 'completed',                                 │
   │       events = $compactedEvents,                            │
   │       completed_at = NOW()                                  │
   │   WHERE run_id = $runId                                     │
   └─────────────────────────────────────────────────────────────┘
                              │
                              ↓
7. Observable Completion
   ┌─────────────────────────────────────────────────────────────┐
   │ runSubject.complete()                                       │
   │ threadSubject.complete()                                    │
   │ activeSubjects.delete(threadId)                             │
   └─────────────────────────────────────────────────────────────┘
```

---

## 6. Concurrency Control

### Scenario: Two Servers Try to Run Same Thread

```
Time: T0
┌─────────────┐                              ┌─────────────┐
│  Server A   │                              │  Server B   │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │ run(thread_1)                              │
       ↓                                            │
┌──────────────────────────────────────────────────┼──────────┐
│              PostgreSQL Database                 │          │
│                                                  │          │
│  BEGIN TRANSACTION                               │          │
│  SELECT * FROM agent_threads                     │          │
│    WHERE thread_id = 'thread_1'                  │          │
│    FOR UPDATE  ← LOCK ACQUIRED                   │          │
│                                                  │          │
│  is_running = FALSE  ✓                           │          │
│                                                  │          │
│  UPDATE agent_threads                            │          │
│    SET is_running = TRUE                         │          │
│  COMMIT                                          │          │
└──────────────────────────────────────────────────┼──────────┘
       │                                            │
       │ ✅ Lock acquired, run starts               │
       │                                            │
       │                                            │ run(thread_1)
       │                                            ↓
       │                          ┌──────────────────────────────┐
       │                          │  PostgreSQL Database         │
       │                          │                              │
       │                          │  BEGIN TRANSACTION           │
       │                          │  SELECT * FROM agent_threads │
       │                          │    WHERE thread_id = 'thread_1'
       │                          │    FOR UPDATE                │
       │                          │                              │
       │                          │  ⏳ WAITING FOR LOCK...      │
       │                          │     (blocked by Server A)    │
       │                          │                              │
Time: T1                          │                              │
       │                          │                              │
       │ Agent completes          │                              │
       ↓                          │                              │
┌──────────────────────────────────────────────────┼──────────┐
│  UPDATE agent_threads                            │          │
│    SET is_running = FALSE                        │          │
│  COMMIT                                          │          │
│                                                  │          │
│  🔓 LOCK RELEASED                                │          │
└──────────────────────────────────────────────────┼──────────┘
       │                                            │
       │                                            │ ⏳ Lock acquired
       │                                            ↓
       │                          ┌──────────────────────────────┐
       │                          │  is_running = FALSE  ✓       │
       │                          │                              │
       │                          │  UPDATE agent_threads        │
       │                          │    SET is_running = TRUE     │
       │                          │  COMMIT                      │
       │                          └──────────────────────────────┘
       │                                            │
       │                                            │ ✅ Lock acquired
       │                                            │    run starts
```

**Key Points**:
- `SELECT FOR UPDATE` creates a row-level lock
- Server B waits until Server A releases the lock
- No race condition - only one server can run at a time
- Automatic serialization via PostgreSQL

---

## 7. Crash Recovery Flow

### Scenario: Server Crashes During Run

```
Time: T0 - Normal Operation
┌─────────────┐
│   Server    │
└──────┬──────┘
       │ run(thread_1)
       ↓
┌────────────────────────────────────────────────────────────┐
│              PostgreSQL Database                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ agent_threads:                                       │ │
│  │   thread_1 | is_running=TRUE | current_run_id=run_1 │ │
│  │                                                      │ │
│  │ agent_runs:                                          │ │
│  │   run_1 | thread_1 | status='running' | events=[..] │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
       │
       │ Agent executing...
       │
Time: T1 - Server Crashes
       │
       ✗ CRASH ✗
       
       
Time: T2 - Server Restarts
┌─────────────┐
│   Server    │ Startup
└──────┬──────┘
       │
       │ recoverStalledRuns()
       ↓
┌────────────────────────────────────────────────────────────┐
│              PostgreSQL Database                           │
│                                                            │
│  1. Find stalled threads:                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ SELECT thread_id, current_run_id                     │ │
│  │   FROM agent_threads                                 │ │
│  │   WHERE is_running = TRUE                            │ │
│  │                                                      │ │
│  │ Result: thread_1, run_1                             │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  2. Mark runs as stopped:                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ UPDATE agent_runs                                    │ │
│  │   SET status = 'stopped',                            │ │
│  │       completed_at = NOW()                           │ │
│  │   WHERE run_id = 'run_1'                             │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  3. Reset thread state:                                   │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ UPDATE agent_threads                                 │ │
│  │   SET is_running = FALSE,                            │ │
│  │       current_run_id = NULL,                         │ │
│  │       stop_requested = FALSE                         │ │
│  │   WHERE thread_id = 'thread_1'                       │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Final State:                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ agent_threads:                                       │ │
│  │   thread_1 | is_running=FALSE | current_run_id=NULL │ │
│  │                                                      │ │
│  │ agent_runs:                                          │ │
│  │   run_1 | thread_1 | status='stopped' | events=[..] │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
       │
       │ ✅ Recovery complete
       │    Thread ready for new runs
       ↓
┌─────────────┐
│   Server    │ Ready
└─────────────┘
```

**Recovery Steps**:
1. On startup, query for `is_running = TRUE` threads
2. Mark associated runs as `stopped`
3. Reset thread state to `is_running = FALSE`
4. Log recovery actions for monitoring
5. Clients can reconnect and see partial results

---

## 8. Performance Optimization Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Request                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 1: In-Memory Cache                     │
│                        (activeSubjects)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Active threads with RxJS subjects                        │  │
│  │ - Instant access for running threads                     │  │
│  │ - No database queries needed                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Cache miss
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 2: Redis Cache (Optional)              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Thread state and recent events                           │  │
│  │ - TTL: 5 minutes                                         │  │
│  │ - Reduces database load for hot threads                 │  │
│  │ - Sub-millisecond access time                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Cache miss
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 3: PostgreSQL Database                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Persistent storage                                       │  │
│  │ - Full conversation history                              │  │
│  │ - Indexed queries: 10-50ms                               │  │
│  │ - Connection pooling for efficiency                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

Performance Metrics:
┌─────────────────────────────────────────────────────────────────┐
│ Operation                │ Layer 1  │ Layer 2  │ Layer 3        │
│──────────────────────────┼──────────┼──────────┼────────────────│
│ isRunning()              │ < 1ms    │ 1-5ms    │ 10-20ms        │
│ connect() (active run)   │ < 1ms    │ 5-10ms   │ 20-50ms        │
│ connect() (historic)     │ N/A      │ 10-20ms  │ 50-200ms       │
│ run() (start)            │ N/A      │ N/A      │ 20-50ms        │
│ run() (complete)         │ N/A      │ N/A      │ 30-100ms       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Deployment Architecture

### Single Server (Simple)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Node.js Server                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              PostgresAgentRunner                         │  │
│  │  - Handles all requests                                  │  │
│  │  - In-memory subjects for active runs                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                        │
│  - Persistent storage                                           │
│  - Single source of truth                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Server (Scalable)

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Server A      │  │   Server B      │  │   Server C      │
│  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
│  │  Runner   │  │  │  │  Runner   │  │  │  │  Runner   │  │
│  └─────┬─────┘  │  │  └─────┬─────┘  │  │  └─────┬─────┘  │
└────────┼────────┘  └────────┼────────┘  └────────┼────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ↓
         ┌────────────────────────────────────────┐
         │         Load Balancer                  │
         └────────────────────────────────────────┘
                              │
                              ↓
         ┌────────────────────────────────────────┐
         │      PostgreSQL Database               │
         │  - Shared state across servers         │
         │  - Row-level locking prevents conflicts│
         └────────────────────────────────────────┘
```

**Key Points**:
- Each server has its own `activeSubjects` (in-memory)
- PostgreSQL provides coordination via locking
- Clients can connect to any server
- Database is the single source of truth

---

## 10. Monitoring & Observability

```
┌─────────────────────────────────────────────────────────────────┐
│                        Metrics Dashboard                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Thread Metrics:                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Total Threads: 1,234                                   │  │
│  │ • Active Threads: 42                                     │  │
│  │ • Threads Created (24h): 567                             │  │
│  │ • Average Thread Lifetime: 3.2 hours                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Run Metrics:                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Runs Started: 3,456                                    │  │
│  │ • Runs Completed: 3,401                                  │  │
│  │ • Runs Failed: 12                                        │  │
│  │ • Runs Stopped: 43                                       │  │
│  │ • Average Run Duration: 2.3 seconds                      │  │
│  │ • P95 Run Duration: 5.1 seconds                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Database Metrics:                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Query Latency (avg): 15ms                              │  │
│  │ • Query Latency (p95): 45ms                              │  │
│  │ • Connection Pool Usage: 12/20                           │  │
│  │ • Lock Wait Time (avg): 2ms                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Error Metrics:                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Lock Timeout Errors: 3                                 │  │
│  │ • Database Connection Errors: 0                          │  │
│  │ • Recovery Actions (24h): 2                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

Alerts:
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️  High database latency (p95 > 100ms)                         │
│ ⚠️  Many stalled runs detected (> 10 in 1 hour)                 │
│ ✅  All systems normal                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

**End of Architecture Diagrams**

For implementation details, see:
- `POSTGRES_AGENT_RUNNER_REVIEW.md` - Full technical specification
- `POSTGRES_AGENT_RUNNER_SUMMARY.md` - Executive summary

