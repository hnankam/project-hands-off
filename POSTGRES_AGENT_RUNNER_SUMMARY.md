# PostgresAgentRunner - Executive Summary

## Overview

This document summarizes the analysis of `InMemoryAgentRunner` from `@copilotkit/runtime` v1.50.1-next.1 and provides a high-level roadmap for implementing a PostgreSQL-based alternative.

---

## What is InMemoryAgentRunner?

The `InMemoryAgentRunner` is a **stateful execution manager** for AI agents in the CopilotKit runtime. It:

1. **Manages agent execution lifecycle** - Starts, stops, and monitors agent runs
2. **Streams events in real-time** - Uses RxJS Observables for event delivery
3. **Maintains conversation history** - Stores all events per thread in memory
4. **Prevents concurrent runs** - Ensures only one run per thread at a time
5. **Supports reconnection** - Clients can reconnect and receive full history

### Current Architecture

```
┌─────────────────────────────────────────┐
│     InMemoryAgentRunner                 │
│                                         │
│  GLOBAL_STORE (Map in RAM)             │
│  ├─ thread_1 → EventStore              │
│  │    ├─ isRunning: true/false         │
│  │    ├─ currentEvents: [...]          │
│  │    └─ historicRuns: [...]           │
│  ├─ thread_2 → EventStore              │
│  └─ ...                                 │
└─────────────────────────────────────────┘
```

**Limitation**: All data is lost when the server restarts.

---

## Why PostgresAgentRunner?

### Problems with InMemoryAgentRunner

1. ❌ **No persistence** - Conversation history lost on restart
2. ❌ **No scalability** - Can't run multiple server instances
3. ❌ **No multi-tenancy** - No database-level isolation
4. ❌ **No analytics** - Can't query historical data
5. ❌ **No crash recovery** - Active runs are lost

### Benefits of PostgresAgentRunner

1. ✅ **Persistent storage** - History survives restarts
2. ✅ **Horizontal scaling** - Multiple servers share state
3. ✅ **Multi-tenant isolation** - Row-level security
4. ✅ **Analytics & debugging** - SQL queries on event data
5. ✅ **Crash recovery** - Resume or finalize interrupted runs

---

## Implementation Approach

### Hybrid Architecture

The PostgresAgentRunner uses a **hybrid approach**:

- **PostgreSQL** - Persistent storage for thread state and events
- **In-Memory (RxJS)** - Real-time event streaming for active runs

This provides both **persistence** and **performance**.

### Core Components

#### 1. Database Schema

**Two main tables**:

```sql
-- Thread-level state (lightweight, frequently updated)
CREATE TABLE agent_threads (
  thread_id VARCHAR(255) PRIMARY KEY,
  organization_id UUID NOT NULL,
  team_id UUID,
  user_id VARCHAR(255) NOT NULL,
  is_running BOOLEAN NOT NULL DEFAULT FALSE,
  current_run_id VARCHAR(255),
  stop_requested BOOLEAN NOT NULL DEFAULT FALSE,
  agent_type VARCHAR(100),
  model_type VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Run-level history (append-only, rarely updated)
CREATE TABLE agent_runs (
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
```

#### 2. PostgresAgentRunner Class

```javascript
export class PostgresAgentRunner extends AgentRunner {
  constructor(options) {
    super();
    this.pool = options.pool;           // PostgreSQL connection pool
    this.activeSubjects = new Map();    // In-memory RxJS subjects
    this.ttl = options.ttl || 86400000; // 24 hours
  }
  
  // Required methods (same interface as InMemoryAgentRunner)
  async run(request) { /* ... */ }
  async connect(request) { /* ... */ }
  async isRunning(request) { /* ... */ }
  async stop(request) { /* ... */ }
}
```

#### 3. Key Features

1. **Concurrency Control** - Uses PostgreSQL row-level locking (`SELECT FOR UPDATE`)
2. **Event Streaming** - RxJS Observables for real-time updates
3. **Event Persistence** - Stores compacted events in JSONB
4. **Crash Recovery** - Detects and finalizes stalled runs on startup
5. **Multi-Tenancy** - Organization/team scoping on all queries
6. **Cleanup** - Automatic deletion of stale threads

---

## Data Flow Comparison

### InMemoryAgentRunner

```
Client Request
    ↓
CopilotRuntime
    ↓
InMemoryAgentRunner.run()
    ↓
Store in GLOBAL_STORE (RAM)
    ↓
Execute agent.runAgent()
    ↓
Stream events via RxJS
    ↓
Store in historicRuns (RAM)
    ↓
Complete
```

**Lost on restart** ❌

### PostgresAgentRunner

```
Client Request
    ↓
CopilotRuntime
    ↓
PostgresAgentRunner.run()
    ↓
Acquire lock in PostgreSQL
    ↓
Create run record in DB
    ↓
Execute agent.runAgent()
    ↓
Stream events via RxJS (in-memory)
    ↓
Store events in PostgreSQL
    ↓
Complete
```

**Persisted in database** ✅

---

## Key Implementation Challenges

### 1. Distributed Locking

**Challenge**: Multiple servers might try to run the same thread.

**Solution**: Use PostgreSQL row-level locking:
```sql
SELECT * FROM agent_threads WHERE thread_id = $1 FOR UPDATE
```

### 2. Event Streaming After Restart

**Challenge**: RxJS subjects are lost on restart.

**Solution**: 
- Mark stalled runs as `stopped` on startup
- Clients use `connect()` to get full history
- New runs create fresh subjects

### 3. Performance at Scale

**Challenge**: Loading all events for long conversations.

**Solutions**:
- Limit historic runs loaded (e.g., last 10)
- Compact events before storage
- Add Redis caching layer
- Paginate event loading

### 4. Multi-Tenancy Isolation

**Challenge**: Ensuring proper data isolation.

**Solution**:
- Include `organization_id` and `team_id` in all queries
- Use PostgreSQL Row-Level Security (RLS)
- Validate tenant context on every request

---

## Integration with Existing System

### Current Usage (server.js)

```javascript
import { InMemoryAgentRunner } from '@copilotkit/runtime/v2';

const runtime = new CopilotRuntime({
  agents: { [DEFAULT_AGENT_ID]: defaultAgent },
  runner: new InMemoryAgentRunner(),
});
```

### New Usage (drop-in replacement)

```javascript
import { PostgresAgentRunner } from './runners/postgres-agent-runner.js';
import { getPool } from './config/database.js';

const runtime = new CopilotRuntime({
  agents: { [DEFAULT_AGENT_ID]: defaultAgent },
  runner: new PostgresAgentRunner({
    pool: getPool(),
    ttl: 86400000,        // 24 hours
    cleanupInterval: 3600000, // 1 hour
  }),
});
```

**No other changes required** - Same interface as `InMemoryAgentRunner`.

---

## Implementation Roadmap

### Phase 1: Development (2-3 weeks)

- [ ] Create `PostgresAgentRunner` class
- [ ] Implement four required methods (`run`, `connect`, `isRunning`, `stop`)
- [ ] Create database migration scripts
- [ ] Write comprehensive unit tests
- [ ] Write integration tests

### Phase 2: Testing (1-2 weeks)

- [ ] Deploy to staging environment
- [ ] Run parallel testing (InMemory vs Postgres)
- [ ] Load testing (concurrent users, server restarts)
- [ ] Validate event ordering and deduplication
- [ ] Performance benchmarking

### Phase 3: Production Rollout (1-2 weeks)

- [ ] Feature flag implementation
- [ ] Gradual rollout (10% → 50% → 100%)
- [ ] Monitor metrics (latency, errors, database load)
- [ ] Optimize based on production data

### Phase 4: Cleanup (1 week)

- [ ] Remove `InMemoryAgentRunner` dependency
- [ ] Remove feature flag
- [ ] Update documentation
- [ ] Post-deployment review

**Total Timeline**: 5-8 weeks

---

## Performance Considerations

### Database Optimization

1. **Indexes** - Strategic indexes on frequently queried columns
2. **Connection Pooling** - Reuse connections (already configured)
3. **JSONB Storage** - Efficient storage and querying of events
4. **Batch Operations** - Batch event inserts when possible

### Caching Strategy

**Optional Redis layer**:
```javascript
const runner = new PostgresAgentRunner({
  pool: getPool(),
  redis: getRedisClient(), // Optional
  cacheTTL: 300, // 5 minutes
});
```

Benefits:
- Reduce database load for hot threads
- Faster `isRunning()` checks
- Lower latency for frequent queries

### Monitoring Metrics

Track:
- Thread creation rate
- Run completion rate
- Average run duration
- Database query latency
- Active threads count
- Failed runs count
- Cache hit/miss rate (if using Redis)

---

## Risk Assessment

### Low Risk ✅

- **Interface compatibility** - Same API as InMemoryAgentRunner
- **Database integration** - Already using PostgreSQL
- **Event format** - No changes to event structure
- **Client impact** - No client-side changes needed

### Medium Risk ⚠️

- **Performance** - Database queries add latency (mitigated by caching)
- **Scalability** - Database becomes bottleneck (mitigated by optimization)
- **Migration** - Requires database schema changes (mitigated by migrations)

### High Risk 🔴

- **Distributed locking** - Requires careful implementation (addressed with row-level locks)
- **Crash recovery** - Complex edge cases (addressed with recovery logic)
- **Data consistency** - Transaction management (addressed with proper SQL)

**Overall Risk**: **Medium** - Manageable with proper testing and gradual rollout.

---

## Cost-Benefit Analysis

### Development Cost

- **Engineering time**: 5-8 weeks (1 developer)
- **Database storage**: Minimal (events are compacted)
- **Testing effort**: Moderate (comprehensive test suite needed)

### Benefits

1. **Reliability** - No data loss on restarts
2. **Scalability** - Support multiple server instances
3. **Analytics** - Query historical conversation data
4. **Compliance** - Better data retention and audit trails
5. **User Experience** - Conversations persist across sessions

### ROI

**High** - Essential for production-grade system with:
- Multiple users
- Long-running conversations
- High availability requirements
- Compliance needs

---

## Alternatives Considered

### 1. Redis-based Runner

**Pros**: Fast, simple key-value storage  
**Cons**: Less structured, no SQL queries, additional dependency

### 2. Hybrid (Postgres + Redis)

**Pros**: Best of both worlds  
**Cons**: More complexity, two systems to maintain

### 3. Keep InMemoryAgentRunner

**Pros**: Simple, no changes needed  
**Cons**: Not production-ready, data loss on restart

**Recommendation**: **PostgresAgentRunner** (with optional Redis caching)

---

## Success Criteria

### Functional Requirements

- ✅ All agent runs persist to database
- ✅ Conversations survive server restarts
- ✅ Multiple servers can run concurrently
- ✅ No data loss or corruption
- ✅ Event ordering is preserved

### Performance Requirements

- ✅ Run latency < 100ms overhead vs InMemory
- ✅ Connect latency < 200ms for typical threads
- ✅ Support 100+ concurrent threads
- ✅ Database queries < 50ms p95

### Reliability Requirements

- ✅ Zero data loss on server restart
- ✅ Graceful handling of database failures
- ✅ Automatic recovery of stalled runs
- ✅ 99.9% uptime

---

## Conclusion

The `PostgresAgentRunner` is a **production-ready replacement** for `InMemoryAgentRunner` that provides:

- ✅ **Persistence** - Conversations survive restarts
- ✅ **Scalability** - Multiple server instances
- ✅ **Reliability** - Crash recovery and data integrity
- ✅ **Compatibility** - Drop-in replacement
- ✅ **Performance** - Hybrid in-memory + database architecture

**Recommendation**: **Proceed with implementation** following the phased approach outlined above.

---

## Next Steps

1. **Review this document** with the team
2. **Approve implementation plan** and timeline
3. **Assign resources** (1 developer, 5-8 weeks)
4. **Create detailed tickets** for each phase
5. **Begin Phase 1** (Development)

---

## References

- **Full Technical Review**: `POSTGRES_AGENT_RUNNER_REVIEW.md`
- **CopilotKit Runtime**: `@copilotkit/runtime` v1.50.1-next.1
- **Source Code**: `node_modules/@copilotkitnext/runtime/dist/index.js`
- **Database Config**: `copilot-runtime-server/config/database.js`
- **Server Integration**: `copilot-runtime-server/server.js`

---

**Document Version**: 1.0  
**Date**: December 20, 2025  
**Status**: Ready for Review

