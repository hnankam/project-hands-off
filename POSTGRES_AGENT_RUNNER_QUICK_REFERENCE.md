# PostgresAgentRunner - Quick Reference Guide

A quick reference for developers implementing or using the PostgresAgentRunner.

---

## TL;DR

**What**: PostgreSQL-backed replacement for `InMemoryAgentRunner`  
**Why**: Persistent conversation history, horizontal scalability, multi-tenancy  
**How**: Drop-in replacement with same interface  
**When**: Production-ready after testing (5-8 weeks)

---

## Quick Start

### Installation

```javascript
// server.js
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

### Database Setup

```sql
-- Run migration
psql -U your_user -d your_database -f migrations/001_create_agent_runner_tables.sql
```

---

## API Reference

### Constructor

```typescript
new PostgresAgentRunner(options: {
  pool: Pool;                           // Required: PostgreSQL connection pool
  ttl?: number;                         // Optional: Thread TTL (default: 24h)
  cleanupInterval?: number;             // Optional: Cleanup interval (default: 1h)
  persistEventsImmediately?: boolean;   // Optional: Persist events as they occur (default: false)
  maxHistoricRuns?: number;             // Optional: Max runs to load (default: 10)
  redis?: RedisClient;                  // Optional: Redis for caching
})
```

### Methods

All methods match the `AgentRunner` interface:

```typescript
// Start a new agent run
run(request: AgentRunnerRunRequest): Observable<BaseEvent>

// Connect to existing thread (get history + live updates)
connect(request: AgentRunnerConnectRequest): Observable<BaseEvent>

// Check if thread is currently running
isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean>

// Stop a running agent
stop(request: AgentRunnerStopRequest): Promise<boolean | undefined>
```

---

## Database Schema

### Tables

**agent_threads** - Thread-level state
```sql
thread_id          VARCHAR(255) PRIMARY KEY
organization_id    UUID NOT NULL
team_id            UUID
user_id            VARCHAR(255) NOT NULL
is_running         BOOLEAN DEFAULT FALSE
current_run_id     VARCHAR(255)
stop_requested     BOOLEAN DEFAULT FALSE
agent_type         VARCHAR(100)
model_type         VARCHAR(100)
created_at         TIMESTAMPTZ DEFAULT NOW()
updated_at         TIMESTAMPTZ DEFAULT NOW()
last_accessed_at   TIMESTAMPTZ DEFAULT NOW()
```

**agent_runs** - Run-level history
```sql
id                 SERIAL PRIMARY KEY
run_id             VARCHAR(255) UNIQUE NOT NULL
thread_id          VARCHAR(255) NOT NULL
parent_run_id      VARCHAR(255)
status             VARCHAR(50) DEFAULT 'running'
events             JSONB DEFAULT '[]'
created_at         TIMESTAMPTZ DEFAULT NOW()
completed_at       TIMESTAMPTZ
```

### Queries

**Get thread state**
```sql
SELECT * FROM agent_threads 
WHERE thread_id = $1 
  AND organization_id = $2;
```

**Get historic runs**
```sql
SELECT * FROM agent_runs 
WHERE thread_id = $1 
  AND status IN ('completed', 'stopped')
ORDER BY created_at ASC 
LIMIT 10;
```

**Check if running**
```sql
SELECT is_running FROM agent_threads 
WHERE thread_id = $1;
```

---

## Common Operations

### Starting a Run

```javascript
const observable = runner.run({
  threadId: 'thread_123',
  agent: myAgent,
  input: {
    runId: 'run_456',
    messages: [{ id: 'msg_1', content: 'Hello', role: 'user' }],
    state: {},
    context: [],
    tools: [],
  },
});

observable.subscribe({
  next: (event) => console.log('Event:', event),
  complete: () => console.log('Run complete'),
  error: (err) => console.error('Error:', err),
});
```

### Connecting to Thread

```javascript
const observable = runner.connect({ threadId: 'thread_123' });

observable.subscribe({
  next: (event) => console.log('Event:', event),
  complete: () => console.log('Connection complete'),
});
```

### Checking Status

```javascript
const isRunning = await runner.isRunning({ threadId: 'thread_123' });
console.log('Running:', isRunning);
```

### Stopping a Run

```javascript
const stopped = await runner.stop({ threadId: 'thread_123' });
console.log('Stopped:', stopped);
```

---

## Error Handling

### Common Errors

**Thread Already Running**
```javascript
try {
  await runner.run(request);
} catch (error) {
  if (error.message === 'Thread already running') {
    // Wait and retry, or show error to user
  }
}
```

**Database Connection Error**
```javascript
try {
  await runner.run(request);
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    // Database is down
    console.error('Database connection failed');
  }
}
```

**Lock Timeout**
```javascript
// Configure timeout in pool
const pool = new Pool({
  connectionString: '...',
  statement_timeout: 10000, // 10 seconds
});
```

---

## Performance Tips

### 1. Connection Pooling

```javascript
const pool = new Pool({
  connectionString: '...',
  max: 20,                    // Max connections
  idleTimeoutMillis: 30000,   // Close idle connections
  connectionTimeoutMillis: 2000,
});
```

### 2. Event Compaction

Events are automatically compacted before storage. No action needed.

### 3. Historic Run Limit

```javascript
const runner = new PostgresAgentRunner({
  pool: getPool(),
  maxHistoricRuns: 10, // Only load last 10 runs
});
```

### 4. Redis Caching (Optional)

```javascript
const runner = new PostgresAgentRunner({
  pool: getPool(),
  redis: getRedisClient(),
  cacheTTL: 300, // 5 minutes
});
```

### 5. Indexes

Ensure proper indexes exist:
```sql
CREATE INDEX idx_agent_threads_org ON agent_threads(organization_id);
CREATE INDEX idx_agent_threads_running ON agent_threads(is_running) WHERE is_running = TRUE;
CREATE INDEX idx_agent_runs_thread ON agent_runs(thread_id);
```

---

## Testing

### Unit Test Example

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostgresAgentRunner } from './postgres-agent-runner.js';

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
      input: { runId: 'run-1', messages: [], state: {}, context: [], tools: [] },
    };
    
    const observable = runner.run(request);
    
    await new Promise((resolve) => {
      observable.subscribe({ complete: resolve });
    });
    
    const result = await pool.query(
      'SELECT * FROM agent_threads WHERE thread_id = $1',
      ['test-thread-1']
    );
    
    expect(result.rows.length).toBe(1);
  });
});
```

### Integration Test Example

```javascript
it('should persist events across server restart', async () => {
  // Run agent
  await runAgent(runner, 'thread-1', 'run-1');
  
  // Simulate server restart
  runner = new PostgresAgentRunner({ pool });
  
  // Connect to thread
  const events = [];
  await new Promise((resolve) => {
    runner.connect({ threadId: 'thread-1' }).subscribe({
      next: (event) => events.push(event),
      complete: resolve,
    });
  });
  
  expect(events.length).toBeGreaterThan(0);
});
```

---

## Monitoring

### Key Metrics

```javascript
// Get runner metrics
const metrics = runner.getMetrics();

console.log({
  runsStarted: metrics.runsStarted,
  runsCompleted: metrics.runsCompleted,
  runsFailed: metrics.runsFailed,
  avgRunDuration: metrics.avgRunDuration,
});
```

### Database Queries

**Active threads**
```sql
SELECT COUNT(*) FROM agent_threads WHERE is_running = TRUE;
```

**Runs in last 24 hours**
```sql
SELECT COUNT(*) FROM agent_runs 
WHERE created_at > NOW() - INTERVAL '24 hours';
```

**Average run duration**
```sql
SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) 
FROM agent_runs 
WHERE status = 'completed';
```

**Failed runs**
```sql
SELECT COUNT(*) FROM agent_runs 
WHERE status = 'error' 
  AND created_at > NOW() - INTERVAL '24 hours';
```

---

## Troubleshooting

### Issue: Threads stuck in "running" state

**Cause**: Server crashed during run  
**Solution**: Run recovery on startup

```javascript
async function startup() {
  const runner = new PostgresAgentRunner({ pool: getPool() });
  await runner.recoverStalledRuns();
  // ... start server
}
```

### Issue: High database latency

**Cause**: Missing indexes or too many connections  
**Solution**: 
1. Check indexes exist
2. Reduce connection pool size
3. Add Redis caching

### Issue: Lock timeout errors

**Cause**: Long-running transactions  
**Solution**: Increase statement timeout

```javascript
const pool = new Pool({
  connectionString: '...',
  statement_timeout: 30000, // 30 seconds
});
```

### Issue: Out of memory

**Cause**: Too many active subjects  
**Solution**: Reduce TTL or add cleanup

```javascript
const runner = new PostgresAgentRunner({
  pool: getPool(),
  ttl: 3600000, // 1 hour (shorter)
  cleanupInterval: 600000, // 10 minutes (more frequent)
});
```

---

## Migration Checklist

- [ ] Create database tables (`agent_threads`, `agent_runs`)
- [ ] Add indexes for performance
- [ ] Update `server.js` to use `PostgresAgentRunner`
- [ ] Add feature flag for gradual rollout
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Deploy to staging
- [ ] Run load tests
- [ ] Monitor metrics
- [ ] Deploy to production (10% → 50% → 100%)
- [ ] Remove feature flag
- [ ] Update documentation

---

## Environment Variables

```bash
# PostgresAgentRunner Configuration
USE_POSTGRES_RUNNER=true
AGENT_RUNNER_TTL=86400000               # 24 hours
AGENT_RUNNER_CLEANUP_INTERVAL=3600000   # 1 hour
AGENT_RUNNER_PERSIST_EVENTS=false       # Persist immediately
AGENT_RUNNER_MAX_HISTORIC_RUNS=10       # Max runs to load

# Database (existing)
DB_HOST=your-db-host
DB_PORT=5432
DB_DATABASE=your-database
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_OTHER_PARAMS=sslmode=require
```

---

## Best Practices

### 1. Always Include Tenant Context

```javascript
// Bad
const result = await pool.query(
  'SELECT * FROM agent_threads WHERE thread_id = $1',
  [threadId]
);

// Good
const result = await pool.query(
  'SELECT * FROM agent_threads WHERE thread_id = $1 AND organization_id = $2',
  [threadId, organizationId]
);
```

### 2. Use Transactions for State Changes

```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('UPDATE agent_threads SET is_running = TRUE WHERE thread_id = $1', [threadId]);
  await client.query('INSERT INTO agent_runs (...) VALUES (...)', [...]);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

### 3. Handle Errors Gracefully

```javascript
try {
  await runner.run(request);
} catch (error) {
  console.error('Run failed:', error);
  // Clean up state
  await pool.query(
    'UPDATE agent_threads SET is_running = FALSE WHERE thread_id = $1',
    [threadId]
  );
  throw error;
}
```

### 4. Monitor Database Performance

```javascript
pool.on('error', (err) => {
  console.error('Database error:', err);
  // Alert monitoring system
});

pool.on('connect', () => {
  // Track connection count
});
```

### 5. Implement Cleanup

```javascript
// Cleanup old threads
async function cleanup() {
  await pool.query(
    'DELETE FROM agent_threads WHERE last_accessed_at < NOW() - INTERVAL \'7 days\'',
  );
}

setInterval(cleanup, 3600000); // Every hour
```

---

## Comparison: InMemory vs Postgres

| Feature | InMemoryAgentRunner | PostgresAgentRunner |
|---------|---------------------|---------------------|
| **Persistence** | ❌ Lost on restart | ✅ Survives restarts |
| **Scalability** | ❌ Single server | ✅ Multiple servers |
| **Multi-tenancy** | ❌ No isolation | ✅ Database-level |
| **Analytics** | ❌ No queries | ✅ SQL queries |
| **Crash recovery** | ❌ Data lost | ✅ Auto-recovery |
| **Performance** | ✅ Very fast | ⚠️ Slightly slower |
| **Complexity** | ✅ Simple | ⚠️ More complex |
| **Setup** | ✅ No setup | ⚠️ DB migration |

---

## Resources

- **Full Review**: `POSTGRES_AGENT_RUNNER_REVIEW.md`
- **Summary**: `POSTGRES_AGENT_RUNNER_SUMMARY.md`
- **Architecture**: `POSTGRES_AGENT_RUNNER_ARCHITECTURE.md`
- **Source Code**: `copilot-runtime-server/runners/postgres-agent-runner.js`
- **Tests**: `copilot-runtime-server/runners/__tests__/`
- **Migration**: `migrations/001_create_agent_runner_tables.sql`

---

## Support

For questions or issues:
1. Check this quick reference
2. Review the full documentation
3. Check existing tests for examples
4. Ask the team

---

**Last Updated**: December 20, 2025  
**Version**: 1.0

