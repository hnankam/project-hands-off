# DBOS Graph System - Quick Reference Card

**For rapid development reference. See full guides for details.**

---

## 🚀 Quick Commands

```bash
# Initialize DBOS
python -c "from tools.multi_agent_graph.durable_graph import init_dbos; init_dbos()"

# Run migrations
psql -d copilotkit_db -f database/migrations/001_add_graph_jobs.sql
psql -d copilotkit_db -f database/migrations/002_add_graph_plan_history.sql
psql -d copilotkit_db -f database/migrations/003_add_dbos_integration.sql

# Run server
uvicorn main:app --reload --port 8000

# Run tests
pytest tests/unit -v
pytest tests/integration -v
pytest tests/e2e -v -m "not slow"
```

---

## 📊 Graph Status Flow

```
draft → queued → running → completed
                  ↓
                paused → running
                  ↓
          waiting_confirmation → running
                  ↓
              cancelled
```

---

## 🎯 Core API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/graphs/create` | POST | Create new graph |
| `/api/graphs/{id}/start` | POST | Start execution |
| `/api/graphs/{id}/pause` | POST | Pause graph |
| `/api/graphs/{id}/resume` | POST | Resume paused |
| `/api/graphs/{id}/plan` | PUT | Update plan |
| `/api/graphs/{id}/confirm` | POST | Confirm action |
| `/api/graphs/{id}/deny` | POST | Deny action |
| `/api/graphs/{id}/schedule` | POST | Schedule execution |
| `/api/graphs/{id}/status` | GET | Get status |
| `/api/graphs/session/{sid}` | GET | List all graphs |

---

## 🔧 DBOS Decorators

### Workflow (Durable Function)
```python
@DBOS.workflow()
async def run_durable_graph_workflow(graph_id: str):
    # Automatically checkpointed
    # Resumes after crashes
    pass
```

### Step (Retryable Operation)
```python
@DBOS.step(retries=3, retry_policy=StepConfig(backoff_rate=2.0))
async def execute_step(step_def: dict):
    # Retried on failure with exponential backoff
    pass
```

### Queue Consumer
```python
@DBOS.queue_consumer(
    queue_name="graph_execution_queue",
    concurrency=5,  # Max parallel executions
    rate_limit=20   # Max per minute
)
async def process_graph(request: dict):
    # Background processing with concurrency control
    pass
```

---

## 📨 DBOS Events

### Send Event
```python
await DBOS.send(
    topic=f"graph_confirmation_{graph_id}",
    message={'confirmed': True}
)
```

### Receive Event (Durable Wait)
```python
event = await DBOS.recv(
    topic=f"graph_confirmation_{graph_id}",
    timeout_seconds=86400  # 24 hours
)
```

### Enqueue Task
```python
await DBOS.send(
    destination_queue="graph_execution_queue",
    message={...},
    priority=5  # 0-10
)
```

---

## 🎨 Custom Events (Delta Streaming)

```python
# Text delta
await emit_text_delta(
    send_stream=send_stream,
    graph_id=graph_id,
    node_name="WebSearch",
    delta="Found 3 results..."
)

# Tool progress
await emit_tool_progress(
    send_stream=send_stream,
    graph_id=graph_id,
    node_name="WebSearch",
    tool_name="google_search",
    tool_call_id="abc123",
    status="completed",
    result="Success"
)

# Step transition
await emit_step_transition(
    send_stream=send_stream,
    graph_id=graph_id,
    from_node="WebSearch",
    to_node="ImageGeneration",
    status="in_progress",
    step_index=2,
    total_steps=4
)
```

---

## 🗄️ Database Schema (Key Tables)

### graph_jobs
```sql
-- Primary table
graph_id TEXT PRIMARY KEY
status TEXT  -- draft, queued, running, paused, waiting_confirmation, completed, failed
planned_steps JSONB  -- Array of step objects
user_id TEXT
session_id TEXT
created_at TIMESTAMP
```

### graph_plan_history
```sql
-- Audit trail
history_id UUID PRIMARY KEY
graph_id TEXT
modification_type TEXT  -- created, edited, step_added, etc.
changes JSONB
modified_by TEXT
created_at TIMESTAMP
```

---

## 🎭 Agent Tools

```python
# Create graph
await create_graph(
    query="Find AI news and visualize",
    graph_name="AI News Dashboard",
    steps=[...],
    reasoning="User wants news with charts",
    auto_start=False
)

# Start graph
await start_graph(graph_id="graph_123", priority=5)

# Check status
await check_graph_status(graph_id="graph_123")

# Schedule graph
await schedule_graph(
    graph_id="graph_123",
    scheduled_for="2024-12-25T09:00:00Z",
    schedule_type="once"
)
```

---

## 🔍 Debugging

### Check DBOS Workflow Status
```python
from dbos import DBOS

# Get workflow by ID
workflow = await DBOS.get_workflow_status(workflow_id)
print(f"Status: {workflow.status}")
print(f"Created: {workflow.created_at}")
print(f"Updated: {workflow.updated_at}")
```

### Check Graph in DB
```sql
-- Get graph status
SELECT graph_id, status, current_node, planned_steps
FROM graph_jobs
WHERE graph_id = 'graph_123';

-- Get execution history
SELECT modification_type, changes, created_at
FROM graph_plan_history
WHERE graph_id = 'graph_123'
ORDER BY created_at DESC;

-- Check active graphs
SELECT graph_id, graph_name, status, current_node
FROM graph_jobs
WHERE status IN ('running', 'queued')
ORDER BY updated_at DESC;
```

### View DBOS Logs
```python
import logging
logging.basicConfig(level=logging.DEBUG)

# DBOS will log:
# - Workflow starts/completions
# - Step executions
# - Event sends/receives
# - Queue processing
```

---

## ⚡ Performance Tips

### Database Indexing
```sql
-- Add indexes for your queries
CREATE INDEX CONCURRENTLY idx_your_query
    ON graph_jobs(field1, field2)
    WHERE condition;
```

### Connection Pooling
```python
# Use connection pool
async with pool.acquire() as conn:
    # Fast queries
    await conn.execute("...")
```

### Caching
```python
# Cache frequently accessed data
@cache_graph_status(ttl_seconds=5)
async def get_graph_status(graph_id: str):
    # Cached for 5 seconds
    pass
```

---

## 🔒 Security Checklist

- [ ] Verify graph ownership before operations
- [ ] Validate all user inputs (prompts, steps)
- [ ] Rate limit API endpoints
- [ ] Encrypt sensitive data
- [ ] Use parameterized queries
- [ ] Check cron expressions
- [ ] Sanitize error messages

```python
# Ownership check
await verify_graph_ownership(graph_id, user_id)

# Input validation
safe_step = SafeGraphStep(**step_data)

# Rate limiting
await rate_limiter.check_rate_limit(user_id, 'create_graph')
```

---

## 🧪 Testing Snippets

```python
# Unit test
@pytest.mark.asyncio
async def test_graph_creation():
    result = await create_graph_draft(...)
    assert result['status'] == 'draft'

# Integration test
@pytest.mark.integration
async def test_full_flow():
    # Create → Start → Wait → Confirm → Complete
    graph_id = await create_graph(...)
    await start_graph(graph_id)
    await send_confirmation_event(graph_id, True)
    status = await get_graph_status(graph_id)
    assert status['status'] == 'completed'

# Load test
@pytest.mark.load
async def test_concurrent_graphs():
    tasks = [create_graph(...) for _ in range(100)]
    results = await asyncio.gather(*tasks)
    assert len(results) == 100
```

---

## 📈 Monitoring Queries

### Prometheus Metrics
```python
# Track these metrics
graph_created_total
graph_completed_total
graph_failed_total
active_graphs
queued_graphs
graph_execution_duration_seconds
step_execution_duration_seconds
```

### Grafana Queries
```
# Success rate
rate(graph_completed_total[5m]) / rate(graph_started_total[5m])

# Average execution time
rate(graph_execution_duration_seconds_sum[5m]) / rate(graph_execution_duration_seconds_count[5m])

# Active count
active_graphs
```

---

## 🚨 Common Issues & Fixes

### Issue: Workflow not resuming after crash
```python
# Fix: Ensure DBOS initialized
DBOS.launch()
```

### Issue: Steps re-executing after resume
```python
# Fix: Use @DBOS.step() decorator
@DBOS.step()
async def my_step():
    # DBOS caches result
    pass
```

### Issue: Timeout on confirmation
```python
# Fix: Increase timeout
event = await DBOS.recv(
    topic=f"graph_confirmation_{graph_id}",
    timeout_seconds=86400  # 24 hours
)
```

### Issue: High memory usage
```python
# Fix: Prune old state
if len(state.execution_history) > 100:
    # Archive or cleanup
    pass
```

---

## 📱 Frontend Integration

### React Hook Usage
```typescript
// Poll for status
useEffect(() => {
  const interval = setInterval(async () => {
    const response = await fetch(`/api/graphs/${graphId}/status`);
    const status = await response.json();
    setGraphState(status);
  }, 2000);
  
  return () => clearInterval(interval);
}, [graphId]);

// Handle delta events
useEffect(() => {
  const handleEvent = (event: any) => {
    if (event.type === 'GRAPH_TEXT_DELTA') {
      updateTextDelta(event.node_name, event.delta);
    }
  };
  
  eventSource.addEventListener('message', handleEvent);
  return () => eventSource.removeEventListener('message', handleEvent);
}, []);
```

---

## 🔗 Quick Links

- **Full Guide**: [DBOS_GRAPH_README.md](./DBOS_GRAPH_README.md)
- **Part 1 (Architecture)**: [DBOS_GRAPH_IMPLEMENTATION.md](./DBOS_GRAPH_IMPLEMENTATION.md)
- **Part 2 (API/Frontend)**: [DBOS_GRAPH_IMPLEMENTATION_PART2.md](./DBOS_GRAPH_IMPLEMENTATION_PART2.md)
- **Part 3 (Testing/Deploy)**: [DBOS_GRAPH_IMPLEMENTATION_PART3.md](./DBOS_GRAPH_IMPLEMENTATION_PART3.md)
- **DBOS Docs**: https://docs.dbos.dev/
- **Pydantic AI**: https://ai.pydantic.dev/

---

## 💡 Pro Tips

1. **Always checkpoint expensive operations** - Wrap in `@DBOS.step()`
2. **Use delta events** - 90% reduction in network traffic
3. **Index your queries** - Add indexes for common lookups
4. **Monitor queue depth** - Alert on queue backlog
5. **Test crash recovery** - Kill process during execution
6. **Version your workflows** - Include version in workflow name
7. **Log everything** - Use structured logging
8. **Cache status queries** - 5-second TTL for hot paths

---

**Keep this card handy during implementation!** 📌

**Last Updated**: December 21, 2024
