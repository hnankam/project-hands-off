# Agent Runners Configuration

The CopilotKit Runtime Server supports two agent runner backends for persisting agent state and conversation history.

## Available Runners

### 1. PostgresAgentRunner (Default)
**Production-grade, multi-tenant, scalable**

- ✅ Full persistence in PostgreSQL database
- ✅ Multi-tenant support (organization/team scoped)
- ✅ Automatic cleanup of old runs
- ✅ Stalled run recovery on server restart
- ✅ Configurable TTL and history limits
- ✅ Usage tracking and analytics

**Configuration:**
```bash
# .env file (default behavior)
USE_SQLITE_RUNNER=false  # or omit this variable

# PostgreSQL connection (required)
DATABASE_URL=postgresql://user:password@localhost:5432/copilotkit
```

### 2. SqliteAgentRunner
**Lightweight, file-based, no database setup required**

- ✅ Simple file-based persistence
- ✅ No database server required
- ✅ Perfect for development and testing
- ✅ Easy backup (just copy the .db file)
- ⚠️ Single-tenant only
- ⚠️ Limited scalability

**Configuration:**
```bash
# .env file
USE_SQLITE_RUNNER=true
SQLITE_DB_PATH=./copilotkit.db  # Optional, defaults to ./copilotkit.db
```

## Switching Between Runners

Simply change the `USE_SQLITE_RUNNER` environment variable and restart the server:

```bash
# Use SQLite
USE_SQLITE_RUNNER=true npm run dev

# Use PostgreSQL (default)
USE_SQLITE_RUNNER=false npm run dev
# or just
npm run dev
```

## When to Use Each Runner

### Use PostgresAgentRunner when:
- Running in production
- Need multi-tenant support
- Require usage tracking and analytics
- Need horizontal scalability
- Want automatic cleanup and maintenance

### Use SqliteAgentRunner when:
- Developing locally
- Testing features quickly
- Don't want to set up PostgreSQL
- Single-user/single-tenant use case
- Need simple backup/restore

## Implementation Details

The runner is selected at server startup in `server.js`:

```javascript
// Lines 61-63: Configuration
const USE_SQLITE_RUNNER = process.env.USE_SQLITE_RUNNER === 'true';
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || './copilotkit.db';

// Lines 279-304: Runner initialization
if (USE_SQLITE_RUNNER) {
  runner = new SqliteAgentRunner({
    dbPath: SQLITE_DB_PATH,
  });
} else {
  runner = new PostgresAgentRunner({
    pool: getPool(),
    ttl: 86400000,
    cleanupInterval: 3600000,
    persistEventsImmediately: true,
    maxHistoricRuns: 1000,
    debug: DEBUG,
  });
}
```

## Database Files

### SQLite
- Location: `./copilotkit.db` (configurable via `SQLITE_DB_PATH`)
- Backup: Copy the `.db` file
- Reset: Delete the `.db` file

### PostgreSQL
- Location: Remote database server
- Backup: Use `pg_dump`
- Reset: Run migration scripts or truncate tables

## Troubleshooting

### SQLite Issues
```bash
# Permission denied
chmod 644 copilotkit.db

# Corrupted database
rm copilotkit.db  # Will be recreated on next run
```

### PostgreSQL Issues
```bash
# Connection refused
# Check DATABASE_URL and ensure PostgreSQL is running

# Stalled runs not recovering
# Check logs for "Recovering stalled runs..." message
```

## Performance Considerations

### SQLite
- Fast for single-user scenarios
- File I/O limited
- Not suitable for high concurrency
- ~1-10 concurrent users

### PostgreSQL
- Optimized for concurrent access
- Connection pooling
- Suitable for production
- 100+ concurrent users

## Migration

To migrate from SQLite to PostgreSQL:

1. Export data from SQLite (if needed)
2. Set up PostgreSQL database
3. Update `.env` to use PostgreSQL
4. Restart server

Note: There's no automatic migration tool. Agent history will start fresh with the new runner.

