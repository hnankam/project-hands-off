# PostgresAgentRunner - Documentation Index

## 📚 Overview

This directory contains comprehensive documentation for implementing a PostgreSQL-backed agent runner to replace the `InMemoryAgentRunner` in the CopilotKit runtime server.

---

## 📖 Documents

### 1. **Executive Summary** 📊
**File**: [`POSTGRES_AGENT_RUNNER_SUMMARY.md`](./POSTGRES_AGENT_RUNNER_SUMMARY.md)

**For**: Project managers, technical leads, stakeholders  
**Read time**: 10-15 minutes

High-level overview covering:
- What is InMemoryAgentRunner and why replace it?
- Benefits and ROI analysis
- Implementation roadmap (5-8 weeks)
- Risk assessment
- Success criteria

**Start here if you need to understand the business case.**

---

### 2. **Technical Review** 🔬
**File**: [`POSTGRES_AGENT_RUNNER_REVIEW.md`](./POSTGRES_AGENT_RUNNER_REVIEW.md)

**For**: Senior engineers, architects  
**Read time**: 45-60 minutes

Comprehensive technical analysis covering:
- InMemoryAgentRunner architecture deep-dive
- AgentRunner interface contract
- Data model analysis
- PostgreSQL schema design
- Complete implementation strategy
- Code examples and helper methods
- Performance considerations
- Migration path

**Start here if you're implementing the solution.**

---

### 3. **Architecture Diagrams** 🏗️
**File**: [`POSTGRES_AGENT_RUNNER_ARCHITECTURE.md`](./POSTGRES_AGENT_RUNNER_ARCHITECTURE.md)

**For**: All technical team members  
**Read time**: 20-30 minutes

Visual representations including:
- System architecture comparison (InMemory vs Postgres)
- Request flow diagrams (run, connect, stop)
- Database schema relationships
- Multi-tenancy isolation
- Event lifecycle
- Concurrency control
- Crash recovery flow
- Performance optimization layers
- Deployment architectures
- Monitoring dashboards

**Start here if you're a visual learner.**

---

### 4. **Quick Reference** ⚡
**File**: [`POSTGRES_AGENT_RUNNER_QUICK_REFERENCE.md`](./POSTGRES_AGENT_RUNNER_QUICK_REFERENCE.md)

**For**: Developers using or maintaining the runner  
**Read time**: 5-10 minutes

Quick lookup guide covering:
- Installation and setup
- API reference
- Database schema
- Common operations
- Error handling
- Performance tips
- Testing examples
- Troubleshooting
- Best practices

**Start here if you need quick answers.**

---

## 🚀 Quick Start

### For Decision Makers
1. Read: [`POSTGRES_AGENT_RUNNER_SUMMARY.md`](./POSTGRES_AGENT_RUNNER_SUMMARY.md)
2. Review: Cost-benefit analysis and roadmap
3. Decide: Approve or request changes

### For Implementers
1. Read: [`POSTGRES_AGENT_RUNNER_REVIEW.md`](./POSTGRES_AGENT_RUNNER_REVIEW.md)
2. Review: [`POSTGRES_AGENT_RUNNER_ARCHITECTURE.md`](./POSTGRES_AGENT_RUNNER_ARCHITECTURE.md)
3. Implement: Follow the implementation strategy
4. Reference: [`POSTGRES_AGENT_RUNNER_QUICK_REFERENCE.md`](./POSTGRES_AGENT_RUNNER_QUICK_REFERENCE.md) as needed

### For Users
1. Read: [`POSTGRES_AGENT_RUNNER_QUICK_REFERENCE.md`](./POSTGRES_AGENT_RUNNER_QUICK_REFERENCE.md)
2. Reference: API and common operations
3. Troubleshoot: Use troubleshooting section

---

## 📋 Key Findings Summary

### Current State: InMemoryAgentRunner

```javascript
const runtime = new CopilotRuntime({
  agents: { [DEFAULT_AGENT_ID]: defaultAgent },
  runner: new InMemoryAgentRunner(), // ❌ Data lost on restart
});
```

**Limitations**:
- ❌ No persistence (data lost on restart)
- ❌ No scalability (single server only)
- ❌ No multi-tenancy (no database isolation)
- ❌ No analytics (can't query history)
- ❌ No crash recovery

### Proposed: PostgresAgentRunner

```javascript
const runtime = new CopilotRuntime({
  agents: { [DEFAULT_AGENT_ID]: defaultAgent },
  runner: new PostgresAgentRunner({
    pool: getPool(),
    ttl: 86400000,
    cleanupInterval: 3600000,
  }),
});
```

**Benefits**:
- ✅ Persistent storage (survives restarts)
- ✅ Horizontal scaling (multiple servers)
- ✅ Multi-tenant isolation (row-level security)
- ✅ Analytics & debugging (SQL queries)
- ✅ Crash recovery (automatic)

---

## 🏗️ Architecture at a Glance

### Hybrid Approach

**In-Memory** (RxJS Observables)
- Real-time event streaming
- Active run management
- Sub-millisecond latency

**PostgreSQL** (Persistent Storage)
- Thread state
- Run history
- Event storage (JSONB)

### Database Schema

```sql
agent_threads (thread state)
  ├─ thread_id (PK)
  ├─ organization_id (FK)
  ├─ team_id (FK)
  ├─ is_running
  ├─ current_run_id
  └─ ...

agent_runs (run history)
  ├─ run_id (PK)
  ├─ thread_id (FK)
  ├─ status
  ├─ events (JSONB)
  └─ ...
```

---

## 📊 Implementation Roadmap

### Phase 1: Development (2-3 weeks)
- [ ] Create `PostgresAgentRunner` class
- [ ] Implement four required methods
- [ ] Create database migrations
- [ ] Write comprehensive tests

### Phase 2: Testing (1-2 weeks)
- [ ] Deploy to staging
- [ ] Run parallel testing
- [ ] Load testing
- [ ] Performance benchmarking

### Phase 3: Production Rollout (1-2 weeks)
- [ ] Feature flag implementation
- [ ] Gradual rollout (10% → 50% → 100%)
- [ ] Monitor metrics
- [ ] Optimize based on data

### Phase 4: Cleanup (1 week)
- [ ] Remove InMemoryAgentRunner
- [ ] Remove feature flag
- [ ] Update documentation

**Total Timeline**: 5-8 weeks

---

## 🎯 Success Criteria

### Functional
- ✅ All agent runs persist to database
- ✅ Conversations survive server restarts
- ✅ Multiple servers can run concurrently
- ✅ No data loss or corruption
- ✅ Event ordering is preserved

### Performance
- ✅ Run latency < 100ms overhead vs InMemory
- ✅ Connect latency < 200ms for typical threads
- ✅ Support 100+ concurrent threads
- ✅ Database queries < 50ms p95

### Reliability
- ✅ Zero data loss on server restart
- ✅ Graceful handling of database failures
- ✅ Automatic recovery of stalled runs
- ✅ 99.9% uptime

---

## 🔍 Key Technical Insights

### 1. Concurrency Control
Uses PostgreSQL row-level locking (`SELECT FOR UPDATE`) to prevent concurrent runs on the same thread across multiple servers.

### 2. Event Streaming
Maintains RxJS observables in memory for real-time streaming while persisting events to PostgreSQL for durability.

### 3. Crash Recovery
On startup, detects stalled runs (marked as `is_running = TRUE`) and finalizes them as `stopped`.

### 4. Multi-Tenancy
All queries include `organization_id` and `team_id` for proper data isolation.

### 5. Performance
Hybrid architecture provides both persistence and performance:
- In-memory: < 1ms for active runs
- Redis cache: 1-10ms (optional)
- PostgreSQL: 10-50ms

---

## 📈 Metrics & Monitoring

### Key Metrics to Track

**Thread Metrics**:
- Total threads
- Active threads
- Threads created (24h)
- Average thread lifetime

**Run Metrics**:
- Runs started/completed/failed
- Average run duration
- P95 run duration

**Database Metrics**:
- Query latency (avg, p95)
- Connection pool usage
- Lock wait time

**Error Metrics**:
- Lock timeout errors
- Database connection errors
- Recovery actions

---

## 🛠️ Development Resources

### Files to Create

```
copilot-runtime-server/
├── runners/
│   ├── postgres-agent-runner.js        # Main implementation
│   ├── __tests__/
│   │   └── postgres-agent-runner.test.js
│   └── README.md
├── migrations/
│   └── 001_create_agent_runner_tables.js
└── server.js                            # Update to use PostgresAgentRunner
```

### Dependencies

**Existing**:
- `pg` - PostgreSQL client (already installed)
- `rxjs` - Observable library (via @copilotkit/runtime)
- `@copilotkit/runtime` - Runtime package
- `@ag-ui/client` - Event types

**Optional**:
- `redis` - For caching layer

---

## 🔗 Related Files

### Current Implementation
- `copilot-runtime-server/server.js` - Current usage of InMemoryAgentRunner
- `copilot-runtime-server/config/database.js` - PostgreSQL connection
- `node_modules/@copilotkitnext/runtime/dist/index.js` - InMemoryAgentRunner source

### Database
- `copilot-runtime-server/config/db-loaders.js` - Database loaders
- `copilot-runtime-server/routes/usage.js` - Usage tracking (similar patterns)

### Testing
- `copilot-runtime-server/routes/__tests__/` - Example test patterns

---

## ❓ FAQ

### Q: Is this a breaking change?
**A**: No. PostgresAgentRunner implements the same `AgentRunner` interface as InMemoryAgentRunner. It's a drop-in replacement.

### Q: What happens to existing threads?
**A**: InMemory threads are ephemeral (lost on restart). New threads will use PostgreSQL. No migration needed.

### Q: Can we run both runners simultaneously?
**A**: Yes, during the rollout phase. Use a feature flag to control which runner is used.

### Q: What's the performance impact?
**A**: Minimal. Database queries add 10-50ms latency, but caching and optimization can reduce this.

### Q: How do we handle database failures?
**A**: Implement retry logic and graceful degradation. The runner should handle transient failures.

### Q: Can we scale horizontally?
**A**: Yes! PostgreSQL provides coordination via row-level locking. Multiple servers can share state.

---

## 📞 Support

### Getting Help

1. **Quick answers**: Check [`POSTGRES_AGENT_RUNNER_QUICK_REFERENCE.md`](./POSTGRES_AGENT_RUNNER_QUICK_REFERENCE.md)
2. **Technical details**: Review [`POSTGRES_AGENT_RUNNER_REVIEW.md`](./POSTGRES_AGENT_RUNNER_REVIEW.md)
3. **Visual understanding**: See [`POSTGRES_AGENT_RUNNER_ARCHITECTURE.md`](./POSTGRES_AGENT_RUNNER_ARCHITECTURE.md)
4. **Business case**: Read [`POSTGRES_AGENT_RUNNER_SUMMARY.md`](./POSTGRES_AGENT_RUNNER_SUMMARY.md)

### Contributing

When implementing:
1. Follow the patterns in the review document
2. Write comprehensive tests
3. Update documentation
4. Add monitoring and logging

---

## 📝 Document Metadata

**Created**: December 20, 2025  
**Version**: 1.0  
**Status**: Ready for Review  
**Author**: AI Assistant  

**Based on**:
- `@copilotkit/runtime` v1.50.1-next.1
- InMemoryAgentRunner source code analysis
- Existing PostgreSQL infrastructure

---

## ✅ Next Steps

### For Project Approval
1. ✅ Review summary document
2. ⏳ Approve implementation plan
3. ⏳ Assign resources
4. ⏳ Begin Phase 1

### For Implementation
1. ✅ Documentation complete
2. ⏳ Create implementation file
3. ⏳ Create database migration
4. ⏳ Write tests
5. ⏳ Deploy to staging
6. ⏳ Production rollout

---

**Ready to proceed?** Start with the [Summary Document](./POSTGRES_AGENT_RUNNER_SUMMARY.md) for approval or the [Technical Review](./POSTGRES_AGENT_RUNNER_REVIEW.md) for implementation.

