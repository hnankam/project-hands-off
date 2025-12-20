# PostgresAgentRunner Implementation Review

## Executive Summary

This document provides a thorough analysis of the `InMemoryAgentRunner` implementation from `@copilotkit/runtime` v1.50.1-next.1 and outlines a comprehensive design for implementing a `PostgresAgentRunner` that persists agent execution state to PostgreSQL instead of in-memory storage.

**Key Finding**: The `InMemoryAgentRunner` is a stateful runner that manages agent execution lifecycle, event streaming, and conversation history per thread. A PostgreSQL-based implementation would enable:
- Persistent conversation history across server restarts
- Horizontal scalability (multiple server instances)
- Multi-tenant isolation at the database level
- Historical analytics and debugging capabilities

---

## Table of Contents

1. [InMemoryAgentRunner Architecture](#inmemoryagentrunner-architecture)
2. [AgentRunner Interface Contract](#agentrunner-interface-contract)
3. [Data Model Analysis](#data-model-analysis)
4. [PostgreSQL Schema Design](#postgresql-schema-design)
5. [Implementation Strategy](#implementation-strategy)
6. [Key Challenges & Solutions](#key-challenges--solutions)
7. [Integration Points](#integration-points)
8. [Performance Considerations](#performance-considerations)
9. [Migration Path](#migration-path)
10. [Code Examples](#code-examples)

---

## 1. InMemoryAgentRunner Architecture

### 1.1 Core Components

The `InMemoryAgentRunner` consists of two main classes:

#### **InMemoryEventStore**
```javascript
class InMemoryEventStore {
  constructor(threadId) {
    this.threadId = threadId;
  }
  
  // Current run state
  subject = null;              // ReplaySubject for event streaming
  isRunning = false;           // Boolean flag for active runs
  currentRunId = null;         // Current run identifier
  agent = null;                // Currently running agent instance
  runSubject = null;           // Subject for current run events
  stopRequested = false;       // Stop flag
  currentEvents = null;        // Events in current run
  
  // Historical data
  historicRuns = [];           // Array of completed runs
}
```

Each thread has its own `InMemoryEventStore` instance stored in a global `Map`:
```javascript
const GLOBAL_STORE = new Map(); // threadId -> InMemoryEventStore
```

#### **InMemoryAgentRunner**
Extends the abstract `AgentRunner` class and implements four required methods:
1. `run(request)` - Execute an agent with event streaming
2. `connect(request)` - Reconnect to an existing thread's event stream
3. `isRunning(request)` - Check if a thread is currently executing
4. `stop(request)` - Stop a running agent execution

### 1.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CopilotRuntime                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              InMemoryAgentRunner                         │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────┐    │  │
│  │  │     GLOBAL_STORE (Map)                         │    │  │
│  │  │                                                │    │  │
│  │  │  threadId_1 -> InMemoryEventStore             │    │  │
│  │  │    ├─ subject (ReplaySubject)                 │    │  │
│  │  │    ├─ isRunning: true/false                   │    │  │
│  │  │    ├─ currentRunId                            │    │  │
│  │  │    ├─ agent (AbstractAgent)                   │    │  │
│  │  │    ├─ currentEvents: [...]                    │    │  │
│  │  │    └─ historicRuns: [                         │    │  │
│  │  │         { runId, events, createdAt, ... }     │    │  │
│  │  │       ]                                        │    │  │
│  │  │                                                │    │  │
│  │  │  threadId_2 -> InMemoryEventStore             │    │  │
│  │  │  ...                                           │    │  │
│  │  └────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Event Lifecycle

1. **Run Initiation** (`run()`)
   - Creates or retrieves `InMemoryEventStore` for thread
   - Validates no concurrent runs on same thread
   - Sets up `ReplaySubject` for event streaming
   - Tracks message IDs to avoid duplicates
   - Executes `agent.runAgent()` with event callbacks

2. **Event Processing**
   - Events flow through `onEvent` callback
   - Events are:
     - Pushed to `runSubject` (current run observable)
     - Pushed to `nextSubject` (thread-wide observable)
     - Stored in `currentEvents` array
   - Special handling for `RUN_STARTED` events (sanitizes messages)

3. **Run Completion**
   - Finalizes events with `finalizeRunEvents()`
   - Compacts events with `compactEvents()`
   - Stores completed run in `historicRuns` array
   - Cleans up run state
   - Completes observables

4. **Connection** (`connect()`)
   - Retrieves all historic events from `historicRuns`
   - Compacts and deduplicates events
   - Subscribes to ongoing run if active
   - Returns observable of all events

### 1.4 Key Features

- **Thread Isolation**: Each thread has independent state
- **Event Replay**: New connections receive full history
- **Concurrency Control**: Prevents multiple runs per thread
- **Event Deduplication**: Tracks message IDs to avoid duplicates
- **Graceful Stop**: Supports aborting runs with cleanup
- **RxJS Observables**: Streaming architecture for real-time updates

---

## 2. AgentRunner Interface Contract

### 2.1 Abstract Base Class

```typescript
abstract class AgentRunner {
  abstract run(request: AgentRunnerRunRequest): Observable<BaseEvent>;
  abstract connect(request: AgentRunnerConnectRequest): Observable<BaseEvent>;
  abstract isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean>;
  abstract stop(request: AgentRunnerStopRequest): Promise<boolean | undefined>;
}
```

### 2.2 Request Types

#### **AgentRunnerRunRequest**
```typescript
interface AgentRunnerRunRequest {
  threadId: string;           // Conversation thread identifier
  agent: AbstractAgent;       // Agent instance to execute
  input: RunAgentInput;       // Input containing messages, state, context
}
```

#### **RunAgentInput** (from `@ag-ui/core`)
```typescript
interface RunAgentInput {
  threadId: string;
  runId: string;
  messages: Message[];        // Conversation messages
  state: any;                 // Agent state (plans, graphs, etc.)
  context: any[];             // Readable context from frontend
  tools: any[];               // Available tools
  forwarded_props: any;       // Additional properties
}
```

#### **AgentRunnerConnectRequest**
```typescript
interface AgentRunnerConnectRequest {
  threadId: string;
}
```

#### **AgentRunnerIsRunningRequest**
```typescript
interface AgentRunnerIsRunningRequest {
  threadId: string;
}
```

#### **AgentRunnerStopRequest**
```typescript
interface AgentRunnerStopRequest {
  threadId: string;
}
```

### 2.3 Event Types

Events are from `@ag-ui/client` and include:
- `RUN_STARTED` - Run begins
- `RUN_FINISHED` - Run completes successfully
- `RUN_STOPPED` - Run was stopped
- `RUN_ERROR` - Run encountered error
- `MESSAGE_CREATED` - New message
- `MESSAGE_UPDATED` - Message updated
- `TOOL_CALL_STARTED` - Tool execution begins
- `TOOL_CALL_FINISHED` - Tool execution completes
- And more...

---

## 3. Data Model Analysis

### 3.1 InMemoryEventStore Structure

```javascript
{
  threadId: "thread_abc123",
  subject: ReplaySubject,      // RxJS subject (not persistable)
  isRunning: true,             // Boolean
  currentRunId: "run_xyz789",  // String
  agent: HttpAgent,            // Agent instance (not persistable)
  runSubject: ReplaySubject,   // RxJS subject (not persistable)
  stopRequested: false,        // Boolean
  currentEvents: [             // Array of events
    {
      type: "RUN_STARTED",
      runId: "run_xyz789",
      input: { ... },
      timestamp: 1234567890
    },
    // ... more events
  ],
  historicRuns: [              // Array of completed runs
    {
      threadId: "thread_abc123",
      runId: "run_xyz789",
      parentRunId: null,
      events: [ ... ],         // Compacted events
      createdAt: 1234567890
    }
  ]
}
```

### 3.2 Persistable vs Non-Persistable Data

**Persistable** (should be stored in PostgreSQL):
- `threadId` - Primary key
- `isRunning` - Boolean flag
- `currentRunId` - Current run ID
- `stopRequested` - Boolean flag
- `currentEvents` - JSON array of events
- `historicRuns` - JSON array of completed runs
- Metadata: `createdAt`, `updatedAt`, `lastAccessedAt`

**Non-Persistable** (runtime-only):
- `subject` - RxJS ReplaySubject (recreated on connect)
- `runSubject` - RxJS ReplaySubject (recreated on run)
- `agent` - Agent instance (retrieved from runtime.agents)

### 3.3 Multi-Tenancy Considerations

The current implementation in `server.js` shows multi-tenant architecture:
- `organizationId` - Organization scope
- `teamId` - Team scope within organization
- `userId` - User who owns the thread
- `sessionId` - Auth session ID

These should be added to the thread data model for proper isolation.

---

## 4. PostgreSQL Schema Design

### 4.1 Primary Table: `agent_threads`

```sql
CREATE TABLE IF NOT EXISTS agent_threads (
  -- Primary Key
  thread_id VARCHAR(255) PRIMARY KEY,
  
  -- Multi-tenancy
  organization_id UUID NOT NULL,
  team_id UUID,
  user_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255),
  
  -- Current Run State
  is_running BOOLEAN NOT NULL DEFAULT FALSE,
  current_run_id VARCHAR(255),
  stop_requested BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Agent Context
  agent_id VARCHAR(255) NOT NULL,  -- e.g., "dynamic_agent"
  agent_type VARCHAR(100),         -- e.g., "general", "wiki"
  model_type VARCHAR(100),         -- e.g., "claude-4.5-haiku"
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Indexes for multi-tenant queries
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) 
    REFERENCES organization(id) ON DELETE CASCADE,
  CONSTRAINT fk_team FOREIGN KEY (team_id) 
    REFERENCES team(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_agent_threads_org ON agent_threads(organization_id);
CREATE INDEX idx_agent_threads_team ON agent_threads(team_id);
CREATE INDEX idx_agent_threads_user ON agent_threads(user_id);
CREATE INDEX idx_agent_threads_running ON agent_threads(is_running) WHERE is_running = TRUE;
CREATE INDEX idx_agent_threads_last_accessed ON agent_threads(last_accessed_at);
```

### 4.2 Secondary Table: `agent_runs`

```sql
CREATE TABLE IF NOT EXISTS agent_runs (
  -- Primary Key
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Foreign Keys
  thread_id VARCHAR(255) NOT NULL,
  parent_run_id VARCHAR(255),
  
  -- Run Metadata
  status VARCHAR(50) NOT NULL DEFAULT 'running',  -- running, completed, stopped, error
  events JSONB NOT NULL DEFAULT '[]'::jsonb,      -- Compacted events array
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Foreign Key Constraints
  CONSTRAINT fk_thread FOREIGN KEY (thread_id) 
    REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_run FOREIGN KEY (parent_run_id) 
    REFERENCES agent_runs(run_id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_agent_runs_thread ON agent_runs(thread_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_created ON agent_runs(created_at DESC);

-- GIN index for JSONB event queries (optional, for analytics)
CREATE INDEX idx_agent_runs_events_gin ON agent_runs USING GIN (events);
```

### 4.3 Optional Table: `agent_events` (for detailed event tracking)

For high-volume scenarios or detailed analytics, events can be stored individually:

```sql
CREATE TABLE IF NOT EXISTS agent_events (
  -- Primary Key
  id BIGSERIAL PRIMARY KEY,
  
  -- Foreign Keys
  run_id VARCHAR(255) NOT NULL,
  thread_id VARCHAR(255) NOT NULL,
  
  -- Event Data
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  message_id VARCHAR(255),
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign Key Constraints
  CONSTRAINT fk_run FOREIGN KEY (run_id) 
    REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  CONSTRAINT fk_thread_events FOREIGN KEY (thread_id) 
    REFERENCES agent_threads(thread_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_agent_events_run ON agent_events(run_id);
CREATE INDEX idx_agent_events_thread ON agent_events(thread_id);
CREATE INDEX idx_agent_events_type ON agent_events(event_type);
CREATE INDEX idx_agent_events_created ON agent_events(created_at DESC);
CREATE INDEX idx_agent_events_message ON agent_events(message_id) WHERE message_id IS NOT NULL;
```

### 4.4 Schema Design Rationale

**Separation of Concerns**:
- `agent_threads` - Thread-level state (lightweight, frequently updated)
- `agent_runs` - Run-level history (append-only, rarely updated after completion)
- `agent_events` - Event-level detail (optional, for analytics)

**Performance Optimizations**:
- Separate current state from historical data
- JSONB for flexible event storage
- Strategic indexes for common queries
- Cascade deletes for data consistency

**Multi-Tenancy**:
- Organization and team scoping at thread level
- Enables row-level security policies
- Supports data isolation and compliance

---

## 5. Implementation Strategy

### 5.1 PostgresAgentRunner Class Structure

```javascript
import { AgentRunner } from '@copilotkit/runtime/v2';
import { ReplaySubject } from 'rxjs';
import { compactEvents, EventType } from '@ag-ui/client';
import { finalizeRunEvents } from '@copilotkitnext/shared';
import { getPool } from './config/database.js';

/**
 * PostgreSQL-backed agent runner for persistent conversation state
 */
export class PostgresAgentRunner extends AgentRunner {
  constructor(options = {}) {
    super();
    this.pool = options.pool || getPool();
    this.cleanupInterval = options.cleanupInterval || 3600000; // 1 hour
    this.ttl = options.ttl || 86400000; // 24 hours
    
    // In-memory cache for active runs (subjects only)
    this.activeSubjects = new Map(); // threadId -> { subject, runSubject }
    
    // Start cleanup timer
    this.startCleanupTimer();
  }
  
  async run(request) { /* ... */ }
  async connect(request) { /* ... */ }
  async isRunning(request) { /* ... */ }
  async stop(request) { /* ... */ }
  
  // Helper methods
  async getOrCreateThread(threadId, context) { /* ... */ }
  async updateThreadState(threadId, updates) { /* ... */ }
  async createRun(threadId, runId, parentRunId) { /* ... */ }
  async appendEvent(runId, event) { /* ... */ }
  async completeRun(runId, events, status) { /* ... */ }
  async getHistoricRuns(threadId) { /* ... */ }
  async cleanupStaleThreads() { /* ... */ }
}
```

### 5.2 Key Implementation Details

#### **5.2.1 Hybrid Architecture**

The PostgresAgentRunner uses a **hybrid approach**:
- **PostgreSQL**: Persistent storage for thread state and events
- **In-Memory**: RxJS subjects for active event streaming

This provides:
- Persistence across restarts
- Real-time streaming performance
- Horizontal scalability (with proper locking)

#### **5.2.2 Concurrency Control**

Use PostgreSQL row-level locking to prevent concurrent runs:

```javascript
async acquireRunLock(threadId) {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');
    
    // SELECT FOR UPDATE locks the row
    const result = await client.query(
      `SELECT is_running, stop_requested 
       FROM agent_threads 
       WHERE thread_id = $1 
       FOR UPDATE`,
      [threadId]
    );
    
    if (result.rows.length === 0) {
      // Thread doesn't exist, create it
      await client.query(
        `INSERT INTO agent_threads (thread_id, is_running, ...) 
         VALUES ($1, TRUE, ...)`,
        [threadId, ...]
      );
      await client.query('COMMIT');
      return { client, locked: true };
    }
    
    if (result.rows[0].is_running) {
      await client.query('ROLLBACK');
      client.release();
      throw new Error('Thread already running');
    }
    
    // Update to running state
    await client.query(
      `UPDATE agent_threads 
       SET is_running = TRUE, current_run_id = $2, updated_at = NOW() 
       WHERE thread_id = $1`,
      [threadId, runId]
    );
    
    await client.query('COMMIT');
    return { client, locked: true };
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    throw error;
  }
}
```

#### **5.2.3 Event Streaming with PostgreSQL**

```javascript
async run(request) {
  const { threadId, agent, input } = request;
  
  // Acquire lock and validate
  await this.acquireRunLock(threadId);
  
  // Create run record
  await this.createRun(threadId, input.runId, null);
  
  // Set up observables
  const runSubject = new ReplaySubject(Infinity);
  const threadSubject = this.getOrCreateThreadSubject(threadId);
  
  // Cache subjects for this thread
  this.activeSubjects.set(threadId, { threadSubject, runSubject });
  
  // Load historic events for message deduplication
  const historicRuns = await this.getHistoricRuns(threadId);
  const historicMessageIds = this.extractMessageIds(historicRuns);
  
  const currentEvents = [];
  
  // Execute agent
  const runAgent = async () => {
    try {
      await agent.runAgent(input, {
        onEvent: async ({ event }) => {
          // Process and sanitize event
          let processedEvent = this.processEvent(event, input, historicMessageIds);
          
          // Stream to subscribers
          runSubject.next(processedEvent);
          threadSubject.next(processedEvent);
          
          // Store in memory for completion
          currentEvents.push(processedEvent);
          
          // Optionally persist event immediately (for crash recovery)
          if (this.options.persistEventsImmediately) {
            await this.appendEvent(input.runId, processedEvent);
          }
        },
        onNewMessage: ({ message }) => {
          historicMessageIds.add(message.id);
        },
        onRunStartedEvent: () => {
          if (input.messages) {
            for (const message of input.messages) {
              historicMessageIds.add(message.id);
            }
          }
        }
      });
      
      // Finalize and persist
      const appendedEvents = finalizeRunEvents(currentEvents, {
        stopRequested: await this.isStopRequested(threadId)
      });
      
      for (const event of appendedEvents) {
        runSubject.next(event);
        threadSubject.next(event);
      }
      
      // Compact and store
      const compactedEvents = compactEvents(currentEvents);
      await this.completeRun(input.runId, compactedEvents, 'completed');
      
      // Update thread state
      await this.updateThreadState(threadId, {
        is_running: false,
        current_run_id: null,
        stop_requested: false,
        last_accessed_at: new Date()
      });
      
      // Complete observables
      runSubject.complete();
      threadSubject.complete();
      
    } catch (error) {
      // Error handling
      const appendedEvents = finalizeRunEvents(currentEvents, {
        stopRequested: await this.isStopRequested(threadId)
      });
      
      for (const event of appendedEvents) {
        runSubject.next(event);
        threadSubject.next(event);
      }
      
      if (currentEvents.length > 0) {
        const compactedEvents = compactEvents(currentEvents);
        await this.completeRun(input.runId, compactedEvents, 'error');
      }
      
      await this.updateThreadState(threadId, {
        is_running: false,
        current_run_id: null,
        stop_requested: false
      });
      
      runSubject.complete();
      threadSubject.complete();
    } finally {
      // Cleanup
      this.activeSubjects.delete(threadId);
    }
  };
  
  // Start execution
  runAgent();
  
  return runSubject.asObservable();
}
```

#### **5.2.4 Connection Handling**

```javascript
async connect(request) {
  const { threadId } = request;
  
  const connectionSubject = new ReplaySubject(Infinity);
  
  // Load all historic runs from database
  const historicRuns = await this.getHistoricRuns(threadId);
  
  if (historicRuns.length === 0) {
    connectionSubject.complete();
    return connectionSubject.asObservable();
  }
  
  // Flatten and compact all events
  const allEvents = historicRuns.flatMap(run => run.events);
  const compactedEvents = compactEvents(allEvents);
  
  // Emit historic events
  const emittedMessageIds = new Set();
  for (const event of compactedEvents) {
    connectionSubject.next(event);
    if ('messageId' in event && typeof event.messageId === 'string') {
      emittedMessageIds.add(event.messageId);
    }
  }
  
  // Check if there's an active run
  const threadState = await this.getThreadState(threadId);
  
  if (threadState && (threadState.is_running || threadState.stop_requested)) {
    // Subscribe to active run
    const activeSubjects = this.activeSubjects.get(threadId);
    if (activeSubjects?.threadSubject) {
      activeSubjects.threadSubject.subscribe({
        next: (event) => {
          // Deduplicate
          if ('messageId' in event && emittedMessageIds.has(event.messageId)) {
            return;
          }
          connectionSubject.next(event);
        },
        complete: () => connectionSubject.complete(),
        error: (err) => connectionSubject.error(err)
      });
    } else {
      // Run is marked as active but no subject exists (server restart)
      // Could implement recovery logic here
      connectionSubject.complete();
    }
  } else {
    connectionSubject.complete();
  }
  
  return connectionSubject.asObservable();
}
```

#### **5.2.5 Status Checks**

```javascript
async isRunning(request) {
  const { threadId } = request;
  
  const result = await this.pool.query(
    'SELECT is_running FROM agent_threads WHERE thread_id = $1',
    [threadId]
  );
  
  return result.rows.length > 0 ? result.rows[0].is_running : false;
}
```

#### **5.2.6 Stop Handling**

```javascript
async stop(request) {
  const { threadId } = request;
  
  // Get thread state
  const result = await this.pool.query(
    'SELECT is_running, stop_requested FROM agent_threads WHERE thread_id = $1',
    [threadId]
  );
  
  if (result.rows.length === 0 || !result.rows[0].is_running) {
    return false;
  }
  
  if (result.rows[0].stop_requested) {
    return false; // Already requested
  }
  
  // Set stop flag
  await this.pool.query(
    `UPDATE agent_threads 
     SET stop_requested = TRUE, is_running = FALSE, updated_at = NOW() 
     WHERE thread_id = $1`,
    [threadId]
  );
  
  // Try to abort the agent
  const activeSubjects = this.activeSubjects.get(threadId);
  if (activeSubjects?.agent) {
    try {
      activeSubjects.agent.abortRun();
      return true;
    } catch (error) {
      console.error('Failed to abort agent run', error);
      // Revert flags
      await this.pool.query(
        `UPDATE agent_threads 
         SET stop_requested = FALSE, is_running = TRUE 
         WHERE thread_id = $1`,
        [threadId]
      );
      return false;
    }
  }
  
  return true;
}
```

### 5.3 Helper Methods

```javascript
async getThreadState(threadId) {
  const result = await this.pool.query(
    'SELECT * FROM agent_threads WHERE thread_id = $1',
    [threadId]
  );
  return result.rows[0] || null;
}

async updateThreadState(threadId, updates) {
  const setClauses = Object.keys(updates)
    .map((key, idx) => `${key} = $${idx + 2}`)
    .join(', ');
  
  const values = [threadId, ...Object.values(updates)];
  
  await this.pool.query(
    `UPDATE agent_threads SET ${setClauses}, updated_at = NOW() WHERE thread_id = $1`,
    values
  );
}

async createRun(threadId, runId, parentRunId) {
  await this.pool.query(
    `INSERT INTO agent_runs (run_id, thread_id, parent_run_id, status, events, created_at)
     VALUES ($1, $2, $3, 'running', '[]'::jsonb, NOW())`,
    [runId, threadId, parentRunId]
  );
}

async completeRun(runId, events, status) {
  await this.pool.query(
    `UPDATE agent_runs 
     SET status = $2, events = $3, completed_at = NOW() 
     WHERE run_id = $1`,
    [runId, status, JSON.stringify(events)]
  );
}

async getHistoricRuns(threadId) {
  const result = await this.pool.query(
    `SELECT run_id, parent_run_id, events, created_at, completed_at 
     FROM agent_runs 
     WHERE thread_id = $1 AND status IN ('completed', 'stopped') 
     ORDER BY created_at ASC`,
    [threadId]
  );
  
  return result.rows.map(row => ({
    runId: row.run_id,
    parentRunId: row.parent_run_id,
    events: row.events, // Already parsed by pg
    createdAt: row.created_at.getTime()
  }));
}

async isStopRequested(threadId) {
  const result = await this.pool.query(
    'SELECT stop_requested FROM agent_threads WHERE thread_id = $1',
    [threadId]
  );
  return result.rows[0]?.stop_requested || false;
}

extractMessageIds(historicRuns) {
  const messageIds = new Set();
  for (const run of historicRuns) {
    for (const event of run.events) {
      if ('messageId' in event && typeof event.messageId === 'string') {
        messageIds.add(event.messageId);
      }
      if (event.type === EventType.RUN_STARTED) {
        const messages = event.input?.messages ?? [];
        for (const message of messages) {
          messageIds.add(message.id);
        }
      }
    }
  }
  return messageIds;
}

processEvent(event, input, historicMessageIds) {
  if (event.type === EventType.RUN_STARTED) {
    if (!event.input) {
      const sanitizedMessages = input.messages 
        ? input.messages.filter(msg => !historicMessageIds.has(msg.id))
        : undefined;
      
      return {
        ...event,
        input: {
          ...input,
          ...(sanitizedMessages !== undefined ? { messages: sanitizedMessages } : {})
        }
      };
    }
  }
  return event;
}

getOrCreateThreadSubject(threadId) {
  const existing = this.activeSubjects.get(threadId);
  if (existing?.threadSubject) {
    return existing.threadSubject;
  }
  
  const threadSubject = new ReplaySubject(Infinity);
  this.activeSubjects.set(threadId, { 
    ...existing, 
    threadSubject 
  });
  return threadSubject;
}

// Cleanup stale threads
async cleanupStaleThreads() {
  const cutoff = new Date(Date.now() - this.ttl);
  
  await this.pool.query(
    `DELETE FROM agent_threads 
     WHERE last_accessed_at < $1 AND is_running = FALSE`,
    [cutoff]
  );
}

startCleanupTimer() {
  this.cleanupTimer = setInterval(() => {
    this.cleanupStaleThreads().catch(err => {
      console.error('Cleanup error:', err);
    });
  }, this.cleanupInterval);
}

async shutdown() {
  if (this.cleanupTimer) {
    clearInterval(this.cleanupTimer);
  }
  // Complete all active subjects
  for (const [threadId, subjects] of this.activeSubjects.entries()) {
    subjects.threadSubject?.complete();
    subjects.runSubject?.complete();
  }
  this.activeSubjects.clear();
}
```

---

## 6. Key Challenges & Solutions

### 6.1 Challenge: Distributed Locking

**Problem**: Multiple server instances might try to run the same thread concurrently.

**Solution**: Use PostgreSQL row-level locking with `SELECT FOR UPDATE`:
```sql
SELECT * FROM agent_threads WHERE thread_id = $1 FOR UPDATE
```

This ensures only one server can acquire the lock at a time.

### 6.2 Challenge: Event Streaming After Server Restart

**Problem**: If server restarts during a run, the RxJS subjects are lost.

**Solutions**:
1. **Mark as stale**: On startup, mark all `is_running = TRUE` threads as `stopped`
2. **Recovery mechanism**: Implement a recovery process that:
   - Detects incomplete runs
   - Finalizes events
   - Marks runs as `stopped` or `error`
3. **Client reconnection**: Clients use `connect()` to get full history

```javascript
async recoverStalledRuns() {
  const result = await this.pool.query(
    `SELECT thread_id, current_run_id 
     FROM agent_threads 
     WHERE is_running = TRUE`
  );
  
  for (const row of result.rows) {
    console.log(`Recovering stalled run: ${row.thread_id}`);
    
    // Mark run as stopped
    await this.pool.query(
      `UPDATE agent_runs 
       SET status = 'stopped', completed_at = NOW() 
       WHERE run_id = $1`,
      [row.current_run_id]
    );
    
    // Update thread state
    await this.updateThreadState(row.thread_id, {
      is_running: false,
      current_run_id: null,
      stop_requested: false
    });
  }
}
```

### 6.3 Challenge: Performance at Scale

**Problem**: Loading all historic events for long conversations can be slow.

**Solutions**:
1. **Pagination**: Limit historic runs loaded (e.g., last 10 runs)
2. **Event compaction**: Aggressively compact events before storage
3. **Separate table**: Use `agent_events` table for detailed events
4. **Caching**: Cache recent runs in Redis
5. **Lazy loading**: Load events on-demand rather than all at once

```javascript
async getHistoricRuns(threadId, limit = 10) {
  const result = await this.pool.query(
    `SELECT run_id, parent_run_id, events, created_at 
     FROM agent_runs 
     WHERE thread_id = $1 AND status IN ('completed', 'stopped') 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [threadId, limit]
  );
  
  return result.rows.reverse(); // Oldest first
}
```

### 6.4 Challenge: Multi-Tenancy Isolation

**Problem**: Ensuring threads are properly scoped to organizations/teams.

**Solution**: Always include tenant context in queries:

```javascript
async getThreadState(threadId, organizationId, teamId) {
  const result = await this.pool.query(
    `SELECT * FROM agent_threads 
     WHERE thread_id = $1 
       AND organization_id = $2 
       AND (team_id = $3 OR team_id IS NULL)`,
    [threadId, organizationId, teamId]
  );
  return result.rows[0] || null;
}
```

Consider using PostgreSQL Row-Level Security (RLS) for additional protection:

```sql
ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON agent_threads
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

### 6.5 Challenge: Agent Instance Management

**Problem**: The `agent` field in `InMemoryEventStore` holds the running agent instance, which can't be persisted.

**Solution**: Store agent metadata (type, model, config) and reconstruct agent from runtime:

```javascript
async run(request) {
  const { threadId, agent, input } = request;
  
  // Store agent reference in active subjects (not in DB)
  this.activeSubjects.set(threadId, {
    ...this.activeSubjects.get(threadId),
    agent: agent
  });
  
  // ... rest of implementation
}
```

---

## 7. Integration Points

### 7.1 Server.js Integration

Replace the `InMemoryAgentRunner` in `server.js`:

```javascript
// Before
import { InMemoryAgentRunner } from '@copilotkit/runtime/v2';

const runtime = new CopilotRuntime({
  agents: {
    [DEFAULT_AGENT_ID]: defaultAgent,
  },
  runner: new InMemoryAgentRunner(),
});

// After
import { PostgresAgentRunner } from './runners/postgres-agent-runner.js';
import { getPool } from './config/database.js';

const runtime = new CopilotRuntime({
  agents: {
    [DEFAULT_AGENT_ID]: defaultAgent,
  },
  runner: new PostgresAgentRunner({
    pool: getPool(),
    ttl: 86400000, // 24 hours
    cleanupInterval: 3600000, // 1 hour
  }),
});
```

### 7.2 Thread Context Enrichment

Modify the request handler to include tenant context:

```javascript
honoApp.all('/api/copilotkit/*', async (c) => {
  // ... existing code ...
  
  const context = {
    agentType,
    modelType,
    threadId,
    requestId,
    authContext: authResult.authContext,
  };
  
  // Enrich agent with tenant context for PostgresAgentRunner
  const requestAgentId = `agent_${requestId}`;
  runtime.agents[requestAgentId] = cachedAgent;
  
  // Store tenant context for runner (could use request headers or metadata)
  runtime.agents[requestAgentId]._tenantContext = {
    organizationId: context.authContext.organizationId,
    teamId: context.authContext.teamId,
    userId: context.authContext.userId,
    sessionId: context.authContext.sessionId,
  };
  
  // ... rest of handler ...
});
```

### 7.3 Database Migration

Create a migration script:

```javascript
// migrations/001_create_agent_runner_tables.js
export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_threads (
      thread_id VARCHAR(255) PRIMARY KEY,
      organization_id UUID NOT NULL,
      team_id UUID,
      user_id VARCHAR(255) NOT NULL,
      session_id VARCHAR(255),
      is_running BOOLEAN NOT NULL DEFAULT FALSE,
      current_run_id VARCHAR(255),
      stop_requested BOOLEAN NOT NULL DEFAULT FALSE,
      agent_id VARCHAR(255) NOT NULL,
      agent_type VARCHAR(100),
      model_type VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    CREATE INDEX idx_agent_threads_org ON agent_threads(organization_id);
    CREATE INDEX idx_agent_threads_team ON agent_threads(team_id);
    CREATE INDEX idx_agent_threads_user ON agent_threads(user_id);
    CREATE INDEX idx_agent_threads_running ON agent_threads(is_running) WHERE is_running = TRUE;
    CREATE INDEX idx_agent_threads_last_accessed ON agent_threads(last_accessed_at);
    
    CREATE TABLE IF NOT EXISTS agent_runs (
      id SERIAL PRIMARY KEY,
      run_id VARCHAR(255) UNIQUE NOT NULL,
      thread_id VARCHAR(255) NOT NULL,
      parent_run_id VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'running',
      events JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      CONSTRAINT fk_thread FOREIGN KEY (thread_id) 
        REFERENCES agent_threads(thread_id) ON DELETE CASCADE
    );
    
    CREATE INDEX idx_agent_runs_thread ON agent_runs(thread_id);
    CREATE INDEX idx_agent_runs_status ON agent_runs(status);
    CREATE INDEX idx_agent_runs_created ON agent_runs(created_at DESC);
  `);
}

export async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS agent_runs CASCADE;
    DROP TABLE IF EXISTS agent_threads CASCADE;
  `);
}
```

---

## 8. Performance Considerations

### 8.1 Database Query Optimization

1. **Indexes**: Ensure proper indexes on frequently queried columns
2. **Connection Pooling**: Use connection pool with appropriate size
3. **Prepared Statements**: Use parameterized queries for better performance
4. **Batch Operations**: Batch event inserts when possible

### 8.2 Event Storage Strategy

**Option 1: Store all events in JSONB array** (simpler, good for moderate scale)
- Pros: Simple queries, easy to implement
- Cons: Large JSONB arrays can be slow to update

**Option 2: Store events in separate table** (better for high volume)
- Pros: Better performance for large conversations
- Cons: More complex queries, more storage

**Recommendation**: Start with Option 1, migrate to Option 2 if needed.

### 8.3 Caching Strategy

Add Redis caching layer for hot threads:

```javascript
class PostgresAgentRunner extends AgentRunner {
  constructor(options) {
    super();
    this.pool = options.pool;
    this.redis = options.redis; // Optional Redis client
    this.cachePrefix = 'agent_thread:';
    this.cacheTTL = 300; // 5 minutes
  }
  
  async getThreadState(threadId) {
    // Try cache first
    if (this.redis) {
      const cached = await this.redis.get(`${this.cachePrefix}${threadId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }
    
    // Fetch from database
    const result = await this.pool.query(
      'SELECT * FROM agent_threads WHERE thread_id = $1',
      [threadId]
    );
    
    const state = result.rows[0] || null;
    
    // Cache result
    if (this.redis && state) {
      await this.redis.setex(
        `${this.cachePrefix}${threadId}`,
        this.cacheTTL,
        JSON.stringify(state)
      );
    }
    
    return state;
  }
  
  async updateThreadState(threadId, updates) {
    // Update database
    await super.updateThreadState(threadId, updates);
    
    // Invalidate cache
    if (this.redis) {
      await this.redis.del(`${this.cachePrefix}${threadId}`);
    }
  }
}
```

### 8.4 Monitoring & Metrics

Track key metrics:
- Thread creation rate
- Run completion rate
- Average run duration
- Database query latency
- Active threads count
- Failed runs count

```javascript
class PostgresAgentRunner extends AgentRunner {
  constructor(options) {
    super();
    this.metrics = {
      runsStarted: 0,
      runsCompleted: 0,
      runsFailed: 0,
      avgRunDuration: 0,
    };
  }
  
  async run(request) {
    this.metrics.runsStarted++;
    const startTime = Date.now();
    
    try {
      const result = await super.run(request);
      this.metrics.runsCompleted++;
      const duration = Date.now() - startTime;
      this.metrics.avgRunDuration = 
        (this.metrics.avgRunDuration * (this.metrics.runsCompleted - 1) + duration) / 
        this.metrics.runsCompleted;
      return result;
    } catch (error) {
      this.metrics.runsFailed++;
      throw error;
    }
  }
  
  getMetrics() {
    return { ...this.metrics };
  }
}
```

---

## 9. Migration Path

### 9.1 Phase 1: Development & Testing

1. **Create PostgresAgentRunner class**
   - Implement all four required methods
   - Add comprehensive unit tests
   - Test with mock database

2. **Set up test database**
   - Create schema
   - Seed with test data
   - Run integration tests

3. **Feature flag implementation**
   ```javascript
   const USE_POSTGRES_RUNNER = process.env.USE_POSTGRES_RUNNER === 'true';
   
   const runner = USE_POSTGRES_RUNNER 
     ? new PostgresAgentRunner({ pool: getPool() })
     : new InMemoryAgentRunner();
   ```

### 9.2 Phase 2: Staging Deployment

1. **Deploy to staging environment**
2. **Run parallel testing**
   - Compare InMemory vs Postgres results
   - Validate event ordering
   - Check performance metrics

3. **Load testing**
   - Simulate concurrent users
   - Test server restart scenarios
   - Validate data persistence

### 9.3 Phase 3: Production Rollout

1. **Gradual rollout**
   - Enable for 10% of users
   - Monitor metrics and errors
   - Increase to 50%, then 100%

2. **Migration of existing threads**
   - InMemory threads are ephemeral (lost on restart)
   - No migration needed - new threads use Postgres

3. **Monitoring & optimization**
   - Track database performance
   - Optimize slow queries
   - Adjust connection pool size

### 9.4 Phase 4: Cleanup

1. **Remove InMemoryAgentRunner**
2. **Remove feature flag**
3. **Document new architecture**

---

## 10. Code Examples

### 10.1 Complete PostgresAgentRunner Implementation

See `copilot-runtime-server/runners/postgres-agent-runner.js` (to be created)

### 10.2 Usage Example

```javascript
import { CopilotRuntime } from '@copilotkit/runtime/v2';
import { PostgresAgentRunner } from './runners/postgres-agent-runner.js';
import { getPool } from './config/database.js';

// Create runtime with PostgresAgentRunner
const runtime = new CopilotRuntime({
  agents: {
    'my-agent': myAgent,
  },
  runner: new PostgresAgentRunner({
    pool: getPool(),
    ttl: 86400000, // 24 hours
    cleanupInterval: 3600000, // 1 hour
    persistEventsImmediately: false, // Set to true for crash recovery
  }),
});

// Use runtime as normal
const endpoint = createCopilotEndpoint({
  runtime,
  basePath: '/api/copilotkit',
});
```

### 10.3 Testing Example

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostgresAgentRunner } from './postgres-agent-runner.js';
import { createTestPool } from './test-helpers.js';

describe('PostgresAgentRunner', () => {
  let pool;
  let runner;
  
  beforeEach(async () => {
    pool = await createTestPool();
    runner = new PostgresAgentRunner({ pool });
  });
  
  afterEach(async () => {
    await pool.end();
  });
  
  it('should create thread on first run', async () => {
    const request = {
      threadId: 'test-thread-1',
      agent: mockAgent,
      input: {
        runId: 'run-1',
        messages: [],
        state: {},
        context: [],
        tools: [],
      },
    };
    
    const observable = runner.run(request);
    
    // Wait for completion
    await new Promise((resolve) => {
      observable.subscribe({
        complete: resolve,
      });
    });
    
    // Verify thread exists
    const result = await pool.query(
      'SELECT * FROM agent_threads WHERE thread_id = $1',
      ['test-thread-1']
    );
    
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].is_running).toBe(false);
  });
  
  it('should prevent concurrent runs on same thread', async () => {
    const request1 = {
      threadId: 'test-thread-2',
      agent: mockAgent,
      input: { runId: 'run-1', messages: [], state: {}, context: [], tools: [] },
    };
    
    const request2 = {
      threadId: 'test-thread-2',
      agent: mockAgent,
      input: { runId: 'run-2', messages: [], state: {}, context: [], tools: [] },
    };
    
    // Start first run
    runner.run(request1);
    
    // Try to start second run (should fail)
    await expect(runner.run(request2)).rejects.toThrow('Thread already running');
  });
  
  it('should persist and retrieve historic runs', async () => {
    // Run agent
    const request = {
      threadId: 'test-thread-3',
      agent: mockAgent,
      input: {
        runId: 'run-1',
        messages: [{ id: 'msg-1', content: 'Hello', role: 'user' }],
        state: {},
        context: [],
        tools: [],
      },
    };
    
    await new Promise((resolve) => {
      runner.run(request).subscribe({ complete: resolve });
    });
    
    // Connect to thread
    const observable = runner.connect({ threadId: 'test-thread-3' });
    
    const events = [];
    await new Promise((resolve) => {
      observable.subscribe({
        next: (event) => events.push(event),
        complete: resolve,
      });
    });
    
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('RUN_STARTED');
  });
});
```

---

## 11. Additional Considerations

### 11.1 Backup & Recovery

- **Regular backups**: Schedule daily backups of `agent_threads` and `agent_runs` tables
- **Point-in-time recovery**: Enable WAL archiving for PostgreSQL
- **Export functionality**: Provide API to export thread history

### 11.2 Data Retention

Implement data retention policies:

```javascript
async cleanupOldRuns(retentionDays = 90) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  
  await this.pool.query(
    `DELETE FROM agent_runs 
     WHERE completed_at < $1 AND status IN ('completed', 'stopped')`,
    [cutoff]
  );
}
```

### 11.3 Compliance & Privacy

- **GDPR**: Implement user data deletion
- **Encryption**: Consider encrypting sensitive event data
- **Audit logs**: Track access to thread data

```javascript
async deleteUserThreads(userId) {
  await this.pool.query(
    'DELETE FROM agent_threads WHERE user_id = $1',
    [userId]
  );
}
```

### 11.4 Observability

Add structured logging:

```javascript
import { log } from './utils/logger.js';

async run(request) {
  log.info('Agent run started', {
    threadId: request.threadId,
    runId: request.input.runId,
    agentId: request.agent.id,
  });
  
  try {
    // ... implementation
    log.info('Agent run completed', {
      threadId: request.threadId,
      runId: request.input.runId,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    log.error('Agent run failed', {
      threadId: request.threadId,
      runId: request.input.runId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}
```

---

## 12. Conclusion

### Summary

The `PostgresAgentRunner` implementation provides:

✅ **Persistence**: Conversation history survives server restarts  
✅ **Scalability**: Multiple server instances can share state  
✅ **Multi-tenancy**: Proper data isolation by organization/team  
✅ **Reliability**: Crash recovery and graceful degradation  
✅ **Performance**: Hybrid in-memory + database architecture  
✅ **Compatibility**: Drop-in replacement for `InMemoryAgentRunner`  

### Next Steps

1. **Create implementation file**: `copilot-runtime-server/runners/postgres-agent-runner.js`
2. **Create database migration**: `migrations/001_create_agent_runner_tables.js`
3. **Add tests**: `copilot-runtime-server/runners/__tests__/postgres-agent-runner.test.js`
4. **Update server.js**: Integrate PostgresAgentRunner with feature flag
5. **Deploy to staging**: Test with real workloads
6. **Monitor & optimize**: Track metrics and tune performance
7. **Production rollout**: Gradual deployment with monitoring

### Resources

- **CopilotKit Runtime**: `@copilotkit/runtime` v1.50.1-next.1
- **AG-UI Protocol**: `@ag-ui/client` and `@ag-ui/core`
- **PostgreSQL**: Existing database connection in `config/database.js`
- **RxJS**: Observable library for event streaming

---

## Appendix A: File Structure

```
copilot-runtime-server/
├── runners/
│   ├── postgres-agent-runner.js        # Main implementation
│   ├── __tests__/
│   │   └── postgres-agent-runner.test.js
│   └── README.md                        # Runner documentation
├── migrations/
│   └── 001_create_agent_runner_tables.js
├── server.js                            # Update to use PostgresAgentRunner
└── config/
    └── database.js                      # Existing DB connection
```

## Appendix B: Environment Variables

```bash
# PostgresAgentRunner Configuration
USE_POSTGRES_RUNNER=true                 # Enable PostgresAgentRunner
AGENT_RUNNER_TTL=86400000               # Thread TTL (24 hours)
AGENT_RUNNER_CLEANUP_INTERVAL=3600000   # Cleanup interval (1 hour)
AGENT_RUNNER_PERSIST_EVENTS=false       # Persist events immediately
AGENT_RUNNER_MAX_HISTORIC_RUNS=10       # Max runs to load on connect

# Database (existing)
DB_HOST=your-db-host
DB_PORT=5432
DB_DATABASE=your-database
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_OTHER_PARAMS=sslmode=require
```

## Appendix C: API Reference

### PostgresAgentRunner Constructor

```typescript
constructor(options: {
  pool: Pool;                           // PostgreSQL connection pool
  ttl?: number;                         // Thread TTL in milliseconds (default: 86400000)
  cleanupInterval?: number;             // Cleanup interval in milliseconds (default: 3600000)
  persistEventsImmediately?: boolean;   // Persist events as they occur (default: false)
  maxHistoricRuns?: number;             // Max runs to load on connect (default: 10)
  redis?: RedisClient;                  // Optional Redis client for caching
})
```

### Methods

All methods match the `AgentRunner` interface:

- `run(request: AgentRunnerRunRequest): Observable<BaseEvent>`
- `connect(request: AgentRunnerConnectRequest): Observable<BaseEvent>`
- `isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean>`
- `stop(request: AgentRunnerStopRequest): Promise<boolean | undefined>`

---

**Document Version**: 1.0  
**Date**: December 20, 2025  
**Author**: AI Assistant  
**Status**: Ready for Implementation

