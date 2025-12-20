/**
 * Example: Integrating PostgresAgentRunner into server.js
 * 
 * This file shows how to replace InMemoryAgentRunner with PostgresAgentRunner
 * in your CopilotKit runtime server with a feature flag for gradual rollout.
 * 
 * Steps to integrate:
 * 1. Run database migration: migrations/001_create_agent_runner_tables.sql
 * 2. Add PostgresAgentRunner import
 * 3. Update createCopilotKitRuntime() function
 * 4. Add startup recovery logic
 * 5. Add graceful shutdown handler
 * 6. Set USE_POSTGRES_RUNNER=true in .env
 * 
 * @module server-integration-example
 */

// ============================================================================
// Step 1: Update imports (add to existing imports in server.js)
// ============================================================================

import {
  CopilotRuntime,
  createCopilotEndpoint,
  InMemoryAgentRunner // Keep for fallback
} from '@copilotkit/runtime/v2';

// NEW: Import PostgresAgentRunner
import { PostgresAgentRunner } from './runners/postgres-agent-runner.js';

import { getPool } from './config/database.js';

// ============================================================================
// Step 2: Add environment variable
// ============================================================================

// Add to your .env file:
// USE_POSTGRES_RUNNER=true  # Set to false to use InMemoryAgentRunner

const USE_POSTGRES_RUNNER = process.env.USE_POSTGRES_RUNNER === 'true';

console.log(`[Server] Using runner: ${USE_POSTGRES_RUNNER ? 'PostgresAgentRunner' : 'InMemoryAgentRunner'}`);

// ============================================================================
// Step 3: Update createCopilotKitRuntime() function
// ============================================================================

/**
 * Create the shared CopilotKit runtime with PostgresAgentRunner
 * 
 * BEFORE:
 * const runtime = new CopilotRuntime({
 *   agents: { [DEFAULT_AGENT_ID]: defaultAgent },
 *   runner: new InMemoryAgentRunner(),
 * });
 * 
 * AFTER (with feature flag):
 */
async function createCopilotKitRuntime() {
  const defaultAgentType = await getDefaultAgent();
  const defaultModelType = await getDefaultModel();
  
  // Create default HttpAgent pointing to Python backend
  const defaultAgent = new HttpAgent({
    url: `${AGENT_BASE_URL}/agent/${defaultAgentType}/${defaultModelType}`,
    headers: {
      'x-copilot-agent-type': defaultAgentType,
      'x-copilot-model-type': defaultModelType,
      'Content-Type': 'application/json',
    },
  });

  // Create appropriate runner based on feature flag
  let runner;
  
  if (USE_POSTGRES_RUNNER) {
    // PostgresAgentRunner with configuration
    runner = new PostgresAgentRunner({
      pool: getPool(),
      ttl: parseInt(process.env.AGENT_RUNNER_TTL || '86400000'), // 24 hours
      cleanupInterval: parseInt(process.env.AGENT_RUNNER_CLEANUP_INTERVAL || '3600000'), // 1 hour
      persistEventsImmediately: process.env.AGENT_RUNNER_PERSIST_EVENTS === 'true', // false by default
      maxHistoricRuns: parseInt(process.env.AGENT_RUNNER_MAX_HISTORIC_RUNS || '10'), // 10 runs
      // Optional: Add Redis for caching
      // redis: getRedisClient(),
      // cacheTTL: 300, // 5 minutes
    });
    
    // Recover any stalled runs from previous server instance
    console.log('[Server] Recovering stalled runs...');
    await runner.recoverStalledRuns();
    console.log('[Server] Recovery complete');
  } else {
    // Fallback to InMemoryAgentRunner
    runner = new InMemoryAgentRunner();
  }

  // Create runtime with selected runner
  const runtime = new CopilotRuntime({
    agents: {
      [DEFAULT_AGENT_ID]: defaultAgent,
    },
    runner,
  });

  return { runtime, defaultAgent, defaultAgentType, defaultModelType, runner };
}

// ============================================================================
// Step 4: Update server initialization (in async IIFE)
// ============================================================================

(async () => {
  try {
    // ========================================================================
    // CopilotKit Runtime Initialization
    // ========================================================================

    // UPDATED: Now returns runner as well
    const { runtime, defaultAgent, defaultAgentType, defaultModelType, runner } = 
      await createCopilotKitRuntime();

    log('CopilotKit Runtime initialized');
    log(`Default agent: ${defaultAgentType}, Default model: ${defaultModelType}`);
    log(`Runner: ${USE_POSTGRES_RUNNER ? 'PostgresAgentRunner' : 'InMemoryAgentRunner'}`);

    // ... rest of server setup (Hono app, Express middleware, etc.) ...

    // ========================================================================
    // HTTP Server Startup
    // ========================================================================

    const server = app.listen(PORT, () => {
      log('═══════════════════════════════════════════════════════════════════');
      log('CopilotKit Runtime Server - Ready');
      log('═══════════════════════════════════════════════════════════════════');
      log('');
      log(`Server:        http://0.0.0.0:${PORT}`);
      log(`Health Check:  http://0.0.0.0:${PORT}/health`);
      log(`Runner:        ${USE_POSTGRES_RUNNER ? 'PostgresAgentRunner' : 'InMemoryAgentRunner'}`);
      log('');
      // ... rest of startup logs ...
    });

    // Server timeout configuration
    server.setTimeout(REQUEST_TIMEOUT_MS);
    server.headersTimeout = HEADERS_TIMEOUT_MS;

    // ========================================================================
    // Step 5: Update graceful shutdown to include runner cleanup
    // ========================================================================

    // Graceful shutdown
    const shutdown = async () => {
      log('');
      log('Shutting down gracefully...');
      
      // NEW: Shutdown runner if it's PostgresAgentRunner
      if (USE_POSTGRES_RUNNER && runner) {
        log('Shutting down PostgresAgentRunner...');
        try {
          await runner.shutdown();
          log('PostgresAgentRunner shutdown complete');
        } catch (error) {
          log(`Error shutting down runner: ${error.message}`);
        }
      }
      
      server.close(() => {
        log('Server closed. Goodbye!');
        process.exit(0);
      });
      
      // Force exit after 10 seconds
      setTimeout(() => {
        log('Forcefully shutting down...');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('═══════════════════════════════════════════════════════════════════');
    console.error('Failed to initialize server');
    console.error('═══════════════════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    console.error('═══════════════════════════════════════════════════════════════════');
    process.exit(1);
  }
})();

// ============================================================================
// Step 6: Optional - Add monitoring endpoint for runner metrics
// ============================================================================

// Add this route to your Express app
app.get('/api/runner/metrics', async (req, res) => {
  try {
    if (!USE_POSTGRES_RUNNER || !runner) {
      return res.json({ 
        runner: 'InMemoryAgentRunner',
        message: 'Metrics not available for InMemoryAgentRunner'
      });
    }
    
    const metrics = runner.getMetrics();
    
    // Add database stats
    const pool = getPool();
    const poolStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
    
    res.json({
      runner: 'PostgresAgentRunner',
      metrics,
      pool: poolStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Step 7: Optional - Add admin endpoint to get thread messages
// ============================================================================

// Add this route to your Express app (requires authentication)
app.get('/api/admin/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    
    if (!USE_POSTGRES_RUNNER || !runner) {
      return res.status(501).json({ 
        error: 'Message retrieval only available with PostgresAgentRunner'
      });
    }
    
    const messages = await runner.getThreadMessages(threadId, limit);
    
    res.json({
      threadId,
      messages,
      count: messages.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Environment Variables to Add
// ============================================================================

/*
Add these to your .env file:

# PostgresAgentRunner Configuration
USE_POSTGRES_RUNNER=true                 # Enable PostgresAgentRunner
AGENT_RUNNER_TTL=86400000               # Thread TTL (24 hours)
AGENT_RUNNER_CLEANUP_INTERVAL=3600000   # Cleanup interval (1 hour)
AGENT_RUNNER_PERSIST_EVENTS=false       # Persist events immediately
AGENT_RUNNER_MAX_HISTORIC_RUNS=10       # Max runs to load on connect

# Optional: Redis Configuration (for caching)
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=
# REDIS_DB=0
*/

// ============================================================================
// Complete Example: Minimal Integration
// ============================================================================

/*
// Minimal changes to existing server.js:

import { PostgresAgentRunner } from './runners/postgres-agent-runner.js';

const USE_POSTGRES_RUNNER = process.env.USE_POSTGRES_RUNNER === 'true';

async function createCopilotKitRuntime() {
  // ... existing code to create defaultAgent ...
  
  const runner = USE_POSTGRES_RUNNER
    ? new PostgresAgentRunner({ pool: getPool() })
    : new InMemoryAgentRunner();
  
  if (USE_POSTGRES_RUNNER) {
    await runner.recoverStalledRuns();
  }
  
  const runtime = new CopilotRuntime({
    agents: { [DEFAULT_AGENT_ID]: defaultAgent },
    runner,
  });
  
  return { runtime, defaultAgent, defaultAgentType, defaultModelType, runner };
}

// In shutdown handler:
if (USE_POSTGRES_RUNNER && runner) {
  await runner.shutdown();
}

That's it! The rest of your server code stays the same.
*/

// ============================================================================
// Testing the Integration
// ============================================================================

/*
1. Run migration:
   cd copilot-runtime-server
   psql $DATABASE_URL -f migrations/001_create_agent_runner_tables.sql

2. Set environment variable:
   echo "USE_POSTGRES_RUNNER=true" >> .env

3. Start server:
   npm run dev

4. Verify in logs:
   [Server] Using runner: PostgresAgentRunner
   [Server] Recovering stalled runs...
   [Server] Recovery complete
   CopilotKit Runtime initialized

5. Test with a chat request and verify data in database:
   psql $DATABASE_URL -c "SELECT * FROM agent_threads;"
   psql $DATABASE_URL -c "SELECT * FROM agent_messages;"

6. Monitor metrics:
   curl http://localhost:3001/api/runner/metrics
*/

