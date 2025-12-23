/**
 * PostgreSQL-backed Agent Runner for CopilotKit Runtime
 * 
 * Provides persistent storage for agent execution state, conversation history,
 * and event streams. Enables horizontal scalability and crash recovery.
 * 
 * Architecture:
 * - PostgreSQL: Persistent storage for threads, runs, messages, and events
 * - In-Memory (RxJS): Real-time event streaming for active runs
 * - Row-level locking: Prevents concurrent runs across multiple servers
 * - Multi-tenancy: Organization/team scoping on all queries
 * 
 * @module postgres-agent-runner
 */

import { AgentRunner } from '@copilotkit/runtime/v2';
import { ReplaySubject } from 'rxjs';
import { compactEvents, EventType } from '@ag-ui/client';
import { finalizeRunEvents } from '@copilotkitnext/shared';

/**
 * PostgreSQL-backed implementation of AgentRunner
 * 
 * @example
 * const runner = new PostgresAgentRunner({
 *   pool: getPool(),
 *   ttl: 86400000,        // 24 hours
 *   cleanupInterval: 3600000, // 1 hour
 * });
 */
export class PostgresAgentRunner extends AgentRunner {
  /**
   * Create a new PostgresAgentRunner
   * 
   * @param {Object} options - Configuration options
   * @param {import('pg').Pool} options.pool - PostgreSQL connection pool
   * @param {number} [options.ttl=86400000] - Thread TTL in milliseconds (24 hours)
   * @param {number} [options.cleanupInterval=3600000] - Cleanup interval (1 hour)
   * @param {boolean} [options.persistEventsImmediately=false] - Persist events as they occur
   * @param {number} [options.maxHistoricRuns=10] - Max runs to load on connect
   * @param {Object} [options.redis] - Optional Redis client for caching
   * @param {number} [options.cacheTTL=300] - Cache TTL in seconds (5 minutes)
   */
  constructor(options = {}) {
    super();
    
    if (!options.pool) {
      throw new Error('PostgreSQL connection pool is required');
    }
    
    this.pool = options.pool;
    this.ttl = options.ttl || 86400000; // 24 hours
    this.cleanupInterval = options.cleanupInterval || 3600000; // 1 hour
    this.persistEventsImmediately = options.persistEventsImmediately || false;
    this.maxHistoricRuns = options.maxHistoricRuns || 10;
    this.redis = options.redis || null;
    this.cacheTTL = options.cacheTTL || 300; // 5 minutes
    this.debug = options.debug || false; // Enable verbose debug logging
    
    // In-memory cache for active runs (subjects only)
    this.activeSubjects = new Map(); // threadId -> { threadSubject, runSubject, agent }
    
    // Metrics
    this.metrics = {
      runsStarted: 0,
      runsCompleted: 0,
      runsFailed: 0,
      runsStopped: 0,
      avgRunDuration: 0,
    };
    
    // Start cleanup timer
    this.startCleanupTimer();
    
    console.log('[PostgresAgentRunner] Initialized:', {
      ttl: `${this.ttl / 1000}s`,
      cleanupInterval: `${this.cleanupInterval / 1000}s`,
      maxHistoricRuns: this.maxHistoricRuns,
      redis: this.redis ? 'enabled' : 'disabled',
      debug: this.debug,
    });
  }
  
  /**
   * Execute an agent with event streaming
   * 
   * @param {Object} request - Run request
   * @param {string} request.threadId - Thread identifier
   * @param {Object} request.agent - Agent instance to execute
   * @param {Object} request.input - RunAgentInput with messages, state, context
   * @returns {Observable<BaseEvent>} Observable of events
   */
  run(request) {
    const { threadId, agent, input } = request;
    const { runId } = input;
    const startTime = Date.now();
    
    this.metrics.runsStarted++;
    
    // Debug: Log what CopilotRuntime is passing us
    console.log(`[PostgresAgentRunner] run() called with threadId: ${threadId}`);
    console.log(`[PostgresAgentRunner] agent.headers['x-copilot-thread-id']: ${agent?.headers?.['x-copilot-thread-id']}`);
    console.log(`[PostgresAgentRunner] input.threadId: ${input?.threadId}`);
    
    if (this.debug) {
      console.log(`[PostgresAgentRunner] Run started: ${threadId}/${runId}`);
    }
    
    // Create run observable
    const runSubject = new ReplaySubject(Infinity);
    
    // Execute run asynchronously
    this.executeRun(request, runSubject, startTime).catch((error) => {
      console.error(`[PostgresAgentRunner] Run execution failed: ${error.message}`);
      runSubject.error(error);
    });
    
    return runSubject.asObservable();
  }
  
  /**
   * Internal method to execute the run
   * @private
   */
  async executeRun(request, runSubject, startTime) {
    const { threadId, agent, input } = request;
    const { runId } = input;
    
    let client = null;
    
    try {
      // Step 1: Acquire lock and validate (pass agent for auth context)
      client = await this.acquireRunLock(threadId, runId, agent);
      
      // Step 2: Load historic data for message deduplication
      const historicRuns = await this.getHistoricRuns(threadId);
      const historicMessageIds = this.extractMessageIds(historicRuns);
      
      // Step 3: Set up observables
      const threadSubject = this.getOrCreateThreadSubject(threadId);
      this.activeSubjects.set(threadId, {
        threadSubject,
        runSubject,
        agent,
      });
      
      // Step 4: Track events
      const currentEvents = [];
      const seenMessageIds = new Set(historicMessageIds);
      
      // Step 5: Execute agent
      await agent.runAgent(input, {
        onEvent: async ({ event }) => {
          try {
            // Process event (sanitize messages, etc.)
            let processedEvent = this.processEvent(event, input, historicMessageIds);
            
            // Check if observable is still active before emitting
            if (runSubject.closed) {
              if (this.debug) {
                console.log(`[PostgresAgentRunner] Skipping event - runSubject already closed`);
              }
              return;
            }
            
            // Stream to subscribers
            runSubject.next(processedEvent);
            threadSubject.next(processedEvent);
            
            // Store in memory for completion
            currentEvents.push(processedEvent);
            
            // Persist message if applicable
            if (processedEvent.type === EventType.MESSAGE_CREATED) {
              await this.persistMessage(processedEvent.message, threadId, runId);
            } else if (processedEvent.type === EventType.MESSAGE_UPDATED) {
              await this.updateMessage(processedEvent.messageId, processedEvent.message);
            }
            
            // Optionally persist event immediately (for crash recovery)
            if (this.persistEventsImmediately) {
              await this.appendEvent(runId, processedEvent);
            }
          } catch (error) {
            console.error(`[PostgresAgentRunner] Error processing event: ${error.message}`);
            // Don't fail the run for event processing errors
          }
        },
        onNewMessage: ({ message }) => {
          if (!seenMessageIds.has(message.id)) {
            seenMessageIds.add(message.id);
          }
        },
        onRunStartedEvent: () => {
          if (input.messages) {
            for (const message of input.messages) {
              seenMessageIds.add(message.id);
            }
          }
        }
      });
      
      // Step 6: Finalize and persist
      const stopRequested = await this.isStopRequested(threadId);
      const appendedEvents = finalizeRunEvents(currentEvents, { stopRequested });
      
      for (const event of appendedEvents) {
        runSubject.next(event);
        threadSubject.next(event);
      }
      
      // Compact and store (use same client for transactional consistency)
      const compactedEvents = compactEvents(currentEvents);
      console.log(`[PostgresAgentRunner] Persisting ${compactedEvents.length} compacted events for run ${runId} (from ${currentEvents.length} raw events)`);
      await this.completeRun(runId, compactedEvents, stopRequested ? 'stopped' : 'completed', client);
      
      // Update thread state (use same client for transactional consistency)
      await this.updateThreadState(threadId, {
        is_running: false,
        current_run_id: null,
        stop_requested: false,
        last_accessed_at: new Date(),
      }, client);
      
      // Update metrics
      const duration = Date.now() - startTime;
      if (stopRequested) {
        this.metrics.runsStopped++;
      } else {
        this.metrics.runsCompleted++;
      }
      this.metrics.avgRunDuration = 
        (this.metrics.avgRunDuration * (this.metrics.runsCompleted - 1) + duration) / 
        this.metrics.runsCompleted;
      
      if (this.debug) {
        console.log(`[PostgresAgentRunner] Run completed: ${threadId}/${runId} (${duration}ms)`);
      }
      
      // Complete observables
      runSubject.complete();
      
    } catch (error) {
      console.error(`[PostgresAgentRunner] Run failed: ${error.message}`);
      this.metrics.runsFailed++;
      
      // Only finalize if we successfully acquired a client/lock
      // If client is null, we never got the lock, so don't try to update thread state
      if (client) {
        try {
          const currentEvents = [];
          const appendedEvents = finalizeRunEvents(currentEvents, { 
            stopRequested: await this.isStopRequested(threadId) 
          });
          
          if (appendedEvents.length > 0) {
            const compactedEvents = compactEvents(appendedEvents);
            await this.completeRun(runId, compactedEvents, 'error', client);
          }
          
          // Use same client to update thread state (avoids lock timeout)
          await this.updateThreadState(threadId, {
            is_running: false,
            current_run_id: null,
            stop_requested: false,
          }, client);
        } catch (finalizeError) {
          console.error(`[PostgresAgentRunner] Error during finalization: ${finalizeError.message}`);
        }
      } else {
        // Lock acquisition failed - thread state is already consistent
        if (this.debug) {
          console.log(`[PostgresAgentRunner] Skipping finalization - lock was never acquired`);
        }
      }
      
      // Complete the observable with error to properly close streaming connection
      runSubject.error(error);
      
      throw error;
      
      } finally {
      // Release database lock (always release, whether success or error)
      if (client) {
        try {
          // Try to commit if transaction is still active
          console.log(`[PostgresAgentRunner] Committing transaction for run ${runId}`);
          await client.query('COMMIT');
          console.log(`[PostgresAgentRunner] Transaction committed successfully for run ${runId}`);
          
          // Verify the data was actually saved
          try {
            const verify = await this.pool.query(
              `SELECT run_id, status, jsonb_array_length(events) as event_count, completed_at 
               FROM agent_runs WHERE run_id = $1`,
              [runId]
            );
            if (verify.rows.length > 0) {
              console.log(`[PostgresAgentRunner] ✅ Verified in DB: run_id=${verify.rows[0].run_id}, status=${verify.rows[0].status}, events=${verify.rows[0].event_count}`);
            } else {
              console.error(`[PostgresAgentRunner] ❌ Run ${runId} NOT FOUND in database after commit!`);
            }
          } catch (verifyErr) {
            console.error(`[PostgresAgentRunner] Verification query failed: ${verifyErr.message}`);
          }
        } catch (commitErr) {
          console.error(`[PostgresAgentRunner] Commit failed for run ${runId}: ${commitErr.message}`);
          // Ignore commit errors (transaction may have been rolled back)
        }
        
        try {
          client.release();
        } catch (releaseErr) {
          console.error(`[PostgresAgentRunner] Error releasing client: ${releaseErr.message}`);
        }
      }
      
      // Complete thread subject before deleting
      const subjects = this.activeSubjects.get(threadId);
      if (subjects?.threadSubject) {
        subjects.threadSubject.complete();
      }
      
      // Cleanup in-memory state
      this.activeSubjects.delete(threadId);
    }
  }
  
  /**
   * Connect to existing thread (get history + live updates)
   * 
   * @param {Object} request - Connect request
   * @param {string} request.threadId - Thread identifier
   * @param {Object} [request.agent] - Agent instance (for session ID extraction)
   * @returns {Observable<BaseEvent>} Observable of events
   */
  connect(request) {
    const { threadId } = request;
    
    const connectionSubject = new ReplaySubject(Infinity);
    
    // Load and stream history asynchronously
    this.loadAndStreamHistory(threadId, connectionSubject).catch((error) => {
      console.error(`[PostgresAgentRunner] Connection failed for ${threadId}: ${error.message}`);
      connectionSubject.error(error);
    });
    
    return connectionSubject.asObservable();
  }
  
  /**
   * Internal method to load and stream history
   * @private
   */
  async loadAndStreamHistory(threadId, connectionSubject) {
    try {
      // Load all historic runs from database
      // Note: Suggestion runs use separate UUID thread IDs, so they won't appear here
      const historicRuns = await this.getHistoricRuns(threadId);
      
      if (historicRuns.length === 0) {
        connectionSubject.complete();
        return;
      }
      
      // Filter out incomplete runs (runs that started but never finished)
      // This happens when runs error out without emitting RUN_FINISHED
      const completeRuns = historicRuns.filter(run => {
        const events = run.events || [];
        const hasRunStarted = events.some(e => e.type === 'RUN_STARTED');
        const hasRunFinished = events.some(e => e.type === 'RUN_FINISHED');
        
        // Include runs that have both started and finished, or haven't started at all
        return !hasRunStarted || hasRunFinished;
      });
      
      if (this.debug && completeRuns.length < historicRuns.length) {
        console.log(`[PostgresAgentRunner] Filtered ${historicRuns.length - completeRuns.length} incomplete runs from history`);
      }
      
      // Flatten and compact all events from complete runs
      const allEvents = completeRuns.flatMap(run => run.events);
      const compactedEvents = compactEvents(allEvents);
      
      // Emit historic events
      const emittedMessageIds = new Set();
      for (const event of compactedEvents) {
        connectionSubject.next(event);
        if ('messageId' in event && typeof event.messageId === 'string') {
          emittedMessageIds.add(event.messageId);
        }
      }
      
      if (this.debug) {
        console.log(`[PostgresAgentRunner] Loaded ${compactedEvents.length} events for ${threadId}`);
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
          if (this.debug) {
            console.warn(`[PostgresAgentRunner] Stale run detected for ${threadId}`);
          }
          connectionSubject.complete();
        }
      } else {
        connectionSubject.complete();
      }
      
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error loading history: ${error.message}`);
      connectionSubject.error(error);
    }
  }
  
  /**
   * Check if thread is currently running
   * 
   * @param {Object} request - IsRunning request
   * @param {string} request.threadId - Thread identifier
   * @param {Object} [request.agent] - Agent instance (for session ID extraction)
   * @returns {Promise<boolean>} True if running
   */
  async isRunning(request) {
    const { threadId } = request;
    
    // Check cache first
    if (this.redis) {
      try {
        const cached = await this.redis.get(`thread:${threadId}:running`);
        if (cached !== null) {
          return cached === 'true';
        }
      } catch (error) {
        console.error(`[PostgresAgentRunner] Redis error: ${error.message}`);
      }
    }
    
    // Check database
    const result = await this.pool.query(
      'SELECT is_running FROM agent_threads WHERE thread_id = $1',
      [threadId]
    );
    
    const isRunning = result.rows.length > 0 ? result.rows[0].is_running : false;
    
    // Cache result
    if (this.redis) {
      try {
        await this.redis.setex(`thread:${threadId}:running`, this.cacheTTL, isRunning.toString());
      } catch (error) {
        console.error(`[PostgresAgentRunner] Redis error: ${error.message}`);
      }
    }
    
    return isRunning;
  }
  
  /**
   * Stop a running agent
   * 
   * @param {Object} request - Stop request
   * @param {string} request.threadId - Thread identifier
   * @param {Object} [request.agent] - Agent instance (for session ID extraction)
   * @returns {Promise<boolean|undefined>} True if stopped successfully
   */
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
      return false;
    }
    
    // Set stop flag
    await this.pool.query(
      `UPDATE agent_threads 
       SET stop_requested = TRUE, is_running = FALSE, updated_at = NOW() 
       WHERE thread_id = $1`,
      [threadId]
    );
    
    // Invalidate cache
    if (this.redis) {
      try {
        await this.redis.del(`thread:${threadId}:running`);
      } catch (error) {
        console.error(`[PostgresAgentRunner] Redis error: ${error.message}`);
      }
    }
    
    // Try to abort the agent
    const activeSubjects = this.activeSubjects.get(threadId);
    if (activeSubjects?.agent) {
      try {
        activeSubjects.agent.abortRun();
        if (this.debug) {
          console.log(`[PostgresAgentRunner] Agent aborted: ${threadId}`);
        }
        return true;
      } catch (error) {
        console.error(`[PostgresAgentRunner] Abort failed for ${threadId}: ${error.message}`);
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
  
  // ==========================================================================
  // Helper Methods
  // ==========================================================================
  
  /**
   * Extract auth context from agent headers
   * @private
   */
  extractAuthContext(agent) {
    const headers = agent?.headers || {};
    return {
      userId: headers['x-copilot-user-id'] || null,
      organizationId: headers['x-copilot-organization-id'] || null,
      teamId: headers['x-copilot-team-id'] || null,
      sessionId: headers['x-copilot-session-id'] || null,
      agentType: headers['x-copilot-agent-type'] || null,
      modelType: headers['x-copilot-model-type'] || null,
    };
  }

  /**
   * Acquire run lock using SELECT FOR UPDATE
   * @private
   */
  async acquireRunLock(threadId, runId, agent) {
    const client = await this.pool.connect();
    
    // Add error handler to prevent unhandled error events from crashing the server
    // This catches connection termination errors (timeouts, network issues, DB restarts)
    client.on('error', (err) => {
      console.error(`[PostgresAgentRunner] Client connection error: ${err.message}`);
      // Don't throw - just log. Client will be released in finally block.
    });
    
    try {
      await client.query('BEGIN');
      
      // Set statement timeout for this transaction (5 seconds)
      await client.query('SET LOCAL statement_timeout = 5000');
      
      // Extract auth context from agent headers
      const authContext = this.extractAuthContext(agent);
      
      // SELECT FOR UPDATE NOWAIT - fail immediately if row is locked
      // This prevents cascading timeouts when multiple runs try to access same thread
      let result;
      try {
        result = await client.query(
          `SELECT is_running, stop_requested 
           FROM agent_threads 
           WHERE thread_id = $1 
           FOR UPDATE NOWAIT`,
          [threadId]
        );
      } catch (lockError) {
        // Rollback and release client before throwing
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          // Ignore rollback errors
        }
        client.release();
        
        if (lockError.code === '55P03') {
          // Lock not available - another run is active on this thread
          throw new Error(`Thread ${threadId} is locked by another run. Please wait and try again.`);
        }
        throw lockError;
      }
      
      if (result.rows.length === 0) {
        // Thread doesn't exist, create it with auth context
        await client.query(
          `INSERT INTO agent_threads 
           (thread_id, user_id, organization_id, team_id, session_id, 
            agent_type, model_type, is_running, current_run_id, 
            created_at, updated_at, last_accessed_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, NOW(), NOW(), NOW())`,
          [
            threadId, 
            authContext.userId, 
            authContext.organizationId, 
            authContext.teamId,
            authContext.sessionId,
            authContext.agentType,
            authContext.modelType,
            runId
          ]
        );
        
        // Create run record
        await client.query(
          `INSERT INTO agent_runs 
           (run_id, thread_id, status, events, created_at) 
           VALUES ($1, $2, 'running', '[]'::jsonb, NOW())`,
          [runId, threadId]
        );
        
        if (this.debug) {
          console.log(`[PostgresAgentRunner] Thread created: ${threadId}`);
        }
        return client;
      }
      
      if (result.rows[0].is_running) {
        // Rollback and release client before throwing
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          // Ignore rollback errors
        }
        client.release();
        throw new Error('Thread already running');
      }
      
      // Update to running state
      await client.query(
        `UPDATE agent_threads 
         SET is_running = TRUE, current_run_id = $2, updated_at = NOW(), last_accessed_at = NOW() 
         WHERE thread_id = $1`,
        [threadId, runId]
      );
      
      // Create run record
      await client.query(
        `INSERT INTO agent_runs 
         (run_id, thread_id, status, events, created_at) 
         VALUES ($1, $2, 'running', '[]'::jsonb, NOW())`,
        [runId, threadId]
      );
      
      return client;
      
    } catch (error) {
      // Rollback and release on any error
      // Since we're throwing, executeRun won't receive the client, so we must release it here
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(`[PostgresAgentRunner] Rollback error: ${rollbackError.message}`);
      }
      
      try {
        client.release();
      } catch (releaseError) {
        console.error(`[PostgresAgentRunner] Release error: ${releaseError.message}`);
      }
      
      throw error;
    }
  }
  
  /**
   * Get thread state from database
   * @private
   */
  async getThreadState(threadId) {
    const result = await this.pool.query(
      'SELECT * FROM agent_threads WHERE thread_id = $1',
      [threadId]
    );
    return result.rows[0] || null;
  }
  
  /**
   * Update thread state
   * @private
   * @param {string} threadId - Thread ID
   * @param {Object} updates - Fields to update
   * @param {Object} [client] - Optional database client (uses pool if not provided)
   */
  async updateThreadState(threadId, updates, client = null) {
    const setClauses = Object.keys(updates)
      .map((key, idx) => `${key} = $${idx + 2}`)
      .join(', ');
    
    const values = [threadId, ...Object.values(updates)];
    
    // Use provided client (transactional) or pool (non-transactional)
    const dbClient = client || this.pool;
    
    await dbClient.query(
      `UPDATE agent_threads SET ${setClauses}, updated_at = NOW() WHERE thread_id = $1`,
      values
    );
    
    // Invalidate cache
    if (this.redis) {
      try {
        await this.redis.del(`thread:${threadId}:running`);
      } catch (error) {
        // Ignore cache errors
      }
    }
  }
  
  /**
   * Complete a run and store events
   * @private
   * @param {string} runId - Run ID
   * @param {Array} events - Events to store
   * @param {string} status - Final status ('completed', 'stopped', 'error')
   * @param {Object} [client] - Optional database client (uses pool if not provided)
   */
  async completeRun(runId, events, status, client = null) {
    // Use provided client (transactional) or pool (non-transactional)
    const dbClient = client || this.pool;
    
    console.log(`[PostgresAgentRunner] completeRun: runId=${runId}, status=${status}, events=${events.length}`);
    
    const result = await dbClient.query(
      `UPDATE agent_runs 
       SET status = $2, events = $3, completed_at = NOW() 
       WHERE run_id = $1
       RETURNING run_id, status, jsonb_array_length(events) as event_count`,
      [runId, status, JSON.stringify(events)]
    );
    
    if (result.rows.length > 0) {
      console.log(`[PostgresAgentRunner] completeRun SUCCESS: run_id=${result.rows[0].run_id}, status=${result.rows[0].status}, saved_events=${result.rows[0].event_count}`);
    } else {
      console.error(`[PostgresAgentRunner] completeRun FAILED: No rows updated for run_id=${runId}`);
    }
  }
  
  /**
   * Get historic runs for a thread
   * @private
   */
  async getHistoricRuns(threadId) {
    // Load most recent N runs (DESC), then reverse to get chronological order for replay
    const result = await this.pool.query(
      `SELECT run_id, parent_run_id, events, created_at, completed_at 
       FROM agent_runs 
       WHERE thread_id = $1 AND status IN ('completed', 'stopped') 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [threadId, this.maxHistoricRuns]
    );
    
    // Reverse to get chronological order (oldest first) for proper event replay
    return result.rows.reverse().map(row => ({
      runId: row.run_id,
      parentRunId: row.parent_run_id,
      events: row.events, // Already parsed by pg
      createdAt: row.created_at.getTime()
    }));
  }
  
  /**
   * Check if stop was requested
   * @private
   */
  async isStopRequested(threadId) {
    const result = await this.pool.query(
      'SELECT stop_requested FROM agent_threads WHERE thread_id = $1',
      [threadId]
    );
    return result.rows[0]?.stop_requested || false;
  }
  
  /**
   * Extract message IDs from historic runs
   * @private
   */
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
  
  /**
   * Process event (sanitize messages, etc.)
   * @private
   */
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
  
  /**
   * Get or create thread subject for streaming
   * @private
   */
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
  
  /**
   * Persist a message to the database
   * @private
   */
  async persistMessage(message, threadId, runId) {
    try {
      await this.pool.query(
        `INSERT INTO agent_messages 
         (message_id, thread_id, run_id, role, content, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (message_id) DO UPDATE 
         SET content = EXCLUDED.content, 
             metadata = EXCLUDED.metadata,
             updated_at = NOW()`,
        [
          message.id,
          threadId,
          runId,
          message.role,
          message.content || '',
          JSON.stringify(message.metadata || {})
        ]
      );
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error persisting message: ${error.message}`);
    }
  }
  
  /**
   * Update a message in the database
   * @private
   */
  async updateMessage(messageId, messageUpdate) {
    try {
      await this.pool.query(
        `UPDATE agent_messages 
         SET content = COALESCE($2, content),
             metadata = COALESCE($3, metadata),
             updated_at = NOW()
         WHERE message_id = $1`,
        [
          messageId,
          messageUpdate.content,
          messageUpdate.metadata ? JSON.stringify(messageUpdate.metadata) : null
        ]
      );
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error updating message: ${error.message}`);
    }
  }
  
  /**
   * Append event to run (for immediate persistence)
   * @private
   */
  async appendEvent(runId, event) {
    try {
      await this.pool.query(
        `UPDATE agent_runs 
         SET events = events || $2::jsonb 
         WHERE run_id = $1`,
        [runId, JSON.stringify([event])]
      );
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error appending event: ${error.message}`);
    }
  }
  
  /**
   * Get thread messages from database
   */
  async getThreadMessages(threadId, limit = 100) {
    const result = await this.pool.query(
      `SELECT message_id, role, content, metadata, created_at, updated_at
       FROM agent_messages 
       WHERE thread_id = $1 
       ORDER BY created_at ASC 
       LIMIT $2`,
      [threadId, limit]
    );
    
    return result.rows.map(row => ({
      id: row.message_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
  
  // ==========================================================================
  // Cleanup & Maintenance
  // ==========================================================================
  
  /**
   * Cleanup stale threads
   * @private
   */
  async cleanupStaleThreads() {
    try {
      const cutoff = new Date(Date.now() - this.ttl);
      
      const result = await this.pool.query(
        `DELETE FROM agent_threads 
         WHERE last_accessed_at < $1 AND is_running = FALSE
         RETURNING thread_id`,
        [cutoff]
      );
      
      if (result.rows.length > 0 && this.debug) {
        console.log(`[PostgresAgentRunner] Cleaned up ${result.rows.length} stale threads`);
      }
    } catch (error) {
      console.error(`[PostgresAgentRunner] Cleanup error: ${error.message}`);
    }
  }
  
  /**
   * Start cleanup timer
   * @private
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleThreads();
    }, this.cleanupInterval);
    
    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
  
  /**
   * Recover stalled runs (call on startup)
   */
  async recoverStalledRuns() {
    try {
      const result = await this.pool.query(
        `SELECT thread_id, current_run_id 
         FROM agent_threads 
         WHERE is_running = TRUE`
      );
      
      for (const row of result.rows) {
        if (this.debug) {
          console.log(`[PostgresAgentRunner] Recovering: ${row.thread_id}`);
        }
        
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
      
      if (result.rows.length > 0) {
        console.log(`[PostgresAgentRunner] Recovered ${result.rows.length} stalled runs`);
      }
    } catch (error) {
      console.error(`[PostgresAgentRunner] Recovery error: ${error.message}`);
    }
  }
  
  /**
   * Get runner metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeThreads: this.activeSubjects.size,
    };
  }
  
  /**
   * Shutdown runner (cleanup resources)
   */
  async shutdown() {
    console.log('[PostgresAgentRunner] Shutting down...');
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // Complete all active subjects
    for (const [threadId, subjects] of this.activeSubjects.entries()) {
      try {
        subjects.threadSubject?.complete();
        subjects.runSubject?.complete();
      } catch (error) {
        console.error(`[PostgresAgentRunner] Error completing subjects for ${threadId}: ${error.message}`);
      }
    }
    
    this.activeSubjects.clear();
    
    console.log('[PostgresAgentRunner] Shutdown complete');
  }
}

