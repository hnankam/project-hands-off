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
import fastJsonPatch from 'fast-json-patch';

const { applyPatch } = fastJsonPatch;

/**
 * Aggressive event compaction for history storage
 * 
 * Extends the basic compactEvents from @ag-ui/client to also compact:
 * - STATE_DELTA: Merge consecutive patches or convert to STATE_SNAPSHOT
 * - ACTIVITY_DELTA: Merge patches per messageId into ACTIVITY_SNAPSHOT
 * - THINKING_TEXT_MESSAGE_CONTENT: Merge deltas like TEXT_MESSAGE_CONTENT
 * 
 * This significantly reduces stored event count for long-running sessions.
 * 
 * @param {Array} events - Raw AG-UI events
 * @param {Object} [options] - Compaction options
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @returns {Array} Compacted events
 */
function aggressiveCompactEvents(events, options = {}) {
  const { debug = false } = options;
  
  // Count input event types for debugging
  const inputTypeCounts = {};
  for (const event of events) {
    const type = event.type || 'UNKNOWN';
    inputTypeCounts[type] = (inputTypeCounts[type] || 0) + 1;
  }
  
  // First, apply the standard compaction (TEXT_MESSAGE_CONTENT, TOOL_CALL_ARGS)
  const basicCompacted = compactEvents(events);
  
  // Now apply additional compaction
  const result = [];
  
  // Stats tracking for logging
  const stats = {
    inputEvents: events.length,
    afterBasicCompaction: basicCompacted.length,
    stateDeltasMerged: 0,
    activityDeltasMerged: 0,
    thinkingEventsMerged: 0,
  };
  
  // Track STATE_DELTA events to merge/convert to snapshot
  let stateDeltas = [];
  let lastStateSnapshot = null;
  
  // Track ACTIVITY_DELTA events per messageId
  const activityBuffers = new Map(); // messageId -> { patches: [], activityType, baseContent, lastTimestamp }
  
  // Track last ACTIVITY_SNAPSHOT content per messageId (to use as base for subsequent deltas)
  const lastActivitySnapshots = new Map(); // messageId -> content object
  
  // Track THINKING_TEXT_MESSAGE events
  const thinkingBuffers = new Map(); // messageId -> { start, contents: [], end }
  
  /**
   * Flush accumulated state deltas as a single STATE_SNAPSHOT
   */
  const flushStateDeltas = () => {
    if (stateDeltas.length === 0) return;
    
    // Build the final state by applying all patches
    let finalState = lastStateSnapshot ? { ...lastStateSnapshot } : {};
    
    for (const deltaEvent of stateDeltas) {
      if (deltaEvent.delta && Array.isArray(deltaEvent.delta)) {
        try {
          const patchResult = applyPatch(finalState, deltaEvent.delta, true, false);
          finalState = patchResult.newDocument;
        } catch (e) {
          // If patch fails, just keep current state
          if (debug) {
            console.warn('[aggressiveCompactEvents] Failed to apply state patch:', e.message);
          }
        }
      }
    }
    
    // Emit a single STATE_SNAPSHOT with the final state
    if (Object.keys(finalState).length > 0) {
      result.push({
        type: EventType.STATE_SNAPSHOT,
        snapshot: finalState,
        // Preserve timestamp from last delta
        timestamp: stateDeltas[stateDeltas.length - 1].timestamp,
      });
      lastStateSnapshot = finalState;
    }
    
    // Track stats
    if (stateDeltas.length > 1) {
      stats.stateDeltasMerged += stateDeltas.length - 1;
    }
    
    stateDeltas = [];
  };
  
  /**
   * Flush accumulated activity deltas for a messageId as ACTIVITY_SNAPSHOT
   */
  const flushActivityDeltas = (messageId) => {
    const buffer = activityBuffers.get(messageId);
    if (!buffer || buffer.patches.length === 0) return;
    
    // Apply all patches to build final content
    // Start with baseContent (which contains previous snapshot data)
    let finalContent = buffer.baseContent ? { ...buffer.baseContent } : {};
    
    for (const patch of buffer.patches) {
      if (patch && Array.isArray(patch)) {
        try {
          const patchResult = applyPatch(finalContent, patch, true, false);
          finalContent = patchResult.newDocument;
        } catch (e) {
          if (debug) {
            console.warn(`[aggressiveCompactEvents] Failed to apply activity patch for ${messageId}:`, e.message);
          }
        }
      }
    }
    
    // Emit ACTIVITY_SNAPSHOT with merged content
    result.push({
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: messageId,
      activityType: buffer.activityType,
      content: finalContent,
      replace: true,
      timestamp: buffer.lastTimestamp,
    });
    
    // Update lastActivitySnapshots so subsequent deltas can build on this
    lastActivitySnapshots.set(messageId, { ...finalContent });
    
    // Track stats
    if (buffer.patches.length > 1) {
      stats.activityDeltasMerged += buffer.patches.length - 1;
    }
    
    activityBuffers.delete(messageId);
  };
  
  /**
   * Flush all pending activity deltas
   */
  const flushAllActivityDeltas = () => {
    for (const messageId of activityBuffers.keys()) {
      flushActivityDeltas(messageId);
    }
  };
  
  /**
   * Flush thinking message buffer
   */
  const flushThinkingBuffer = (messageId) => {
    const buffer = thinkingBuffers.get(messageId);
    if (!buffer) return;
    
    // Emit START
    if (buffer.start) {
      result.push(buffer.start);
    }
    
    // Merge all content deltas into one
    if (buffer.contents.length > 0) {
      const mergedDelta = buffer.contents.map(e => e.delta || '').join('');
      result.push({
        type: EventType.THINKING_TEXT_MESSAGE_CONTENT,
        messageId: messageId,
        delta: mergedDelta,
        timestamp: buffer.contents[buffer.contents.length - 1].timestamp,
      });
      
      // Track stats
      if (buffer.contents.length > 1) {
        stats.thinkingEventsMerged += buffer.contents.length - 1;
      }
    }
    
    // Emit END
    if (buffer.end) {
      result.push(buffer.end);
    }
    
    thinkingBuffers.delete(messageId);
  };
  
  /**
   * Flush all pending thinking buffers
   */
  const flushAllThinkingBuffers = () => {
    for (const messageId of thinkingBuffers.keys()) {
      flushThinkingBuffer(messageId);
    }
  };
  
  // Process events
  for (const event of basicCompacted) {
    switch (event.type) {
      // ========================================
      // STATE_DELTA -> STATE_SNAPSHOT compaction
      // ========================================
      case EventType.STATE_DELTA:
      case 'STATE_DELTA':
        stateDeltas.push(event);
        break;
        
      case EventType.STATE_SNAPSHOT:
      case 'STATE_SNAPSHOT':
        // New snapshot supersedes any pending deltas
        stateDeltas = [];
        lastStateSnapshot = event.snapshot;
        result.push(event);
        break;
        
      // ========================================
      // ACTIVITY_DELTA -> ACTIVITY_SNAPSHOT compaction
      // ========================================
      case EventType.ACTIVITY_DELTA:
      case 'ACTIVITY_DELTA':
        {
          const msgId = event.messageId;
          if (!activityBuffers.has(msgId)) {
            // Use last known snapshot content as base (if any)
            // This ensures we don't lose properties from previous snapshots
            const lastContent = lastActivitySnapshots.get(msgId);
            activityBuffers.set(msgId, {
              patches: [],
              activityType: event.activityType,
              baseContent: lastContent ? { ...lastContent } : {},
              lastTimestamp: event.timestamp,
            });
          }
          const buffer = activityBuffers.get(msgId);
          if (event.patch) {
            buffer.patches.push(event.patch);
          }
          buffer.activityType = event.activityType;
          buffer.lastTimestamp = event.timestamp;
        }
        break;
        
      case EventType.ACTIVITY_SNAPSHOT:
      case 'ACTIVITY_SNAPSHOT':
        {
          const msgId = event.messageId;
          // Store snapshot content for future delta base
          // This ensures subsequent deltas can build on top of this snapshot
          if (event.content) {
            lastActivitySnapshots.set(msgId, { ...event.content });
          }
          // New snapshot supersedes any pending deltas for this message
          activityBuffers.delete(msgId);
          result.push(event);
        }
        break;
        
      // ========================================
      // THINKING_TEXT_MESSAGE compaction
      // ========================================
      case EventType.THINKING_TEXT_MESSAGE_START:
      case 'THINKING_TEXT_MESSAGE_START':
        {
          const msgId = event.messageId;
          // Start new buffer
          thinkingBuffers.set(msgId, {
            start: event,
            contents: [],
            end: null,
          });
        }
        break;
        
      case EventType.THINKING_TEXT_MESSAGE_CONTENT:
      case 'THINKING_TEXT_MESSAGE_CONTENT':
        {
          const msgId = event.messageId;
          const buffer = thinkingBuffers.get(msgId);
          if (buffer) {
            buffer.contents.push(event);
          } else {
            // No start event, just pass through
            result.push(event);
          }
        }
        break;
        
      case EventType.THINKING_TEXT_MESSAGE_END:
      case 'THINKING_TEXT_MESSAGE_END':
        {
          const msgId = event.messageId;
          const buffer = thinkingBuffers.get(msgId);
          if (buffer) {
            buffer.end = event;
            flushThinkingBuffer(msgId);
          } else {
            result.push(event);
          }
        }
        break;
        
      // ========================================
      // Boundary events - flush pending state
      // ========================================
      case EventType.RUN_STARTED:
      case 'RUN_STARTED':
        // Flush any pending from previous run
        flushStateDeltas();
        flushAllActivityDeltas();
        flushAllThinkingBuffers();
        result.push(event);
        break;
        
      case EventType.RUN_FINISHED:
      case 'RUN_FINISHED':
      case EventType.RUN_ERROR:
      case 'RUN_ERROR':
        // Flush all pending before run ends
        flushStateDeltas();
        flushAllActivityDeltas();
        flushAllThinkingBuffers();
        result.push(event);
        break;
        
      // ========================================
      // Pass-through events
      // ========================================
      default:
        // For other events, just pass through
        result.push(event);
        break;
    }
  }
  
  // Final flush of any remaining buffers
  flushStateDeltas();
  flushAllActivityDeltas();
  flushAllThinkingBuffers();
  
  // Calculate stats
  stats.outputEvents = result.length;
  const totalMerged = stats.stateDeltasMerged + stats.activityDeltasMerged + stats.thinkingEventsMerged;
  const basicReduction = stats.inputEvents > 0 
    ? ((stats.inputEvents - stats.afterBasicCompaction) / stats.inputEvents * 100).toFixed(1)
    : '0.0';
  const aggressiveReduction = stats.afterBasicCompaction > 0
    ? ((stats.afterBasicCompaction - stats.outputEvents) / stats.afterBasicCompaction * 100).toFixed(1)
    : '0.0';
  const totalReduction = stats.inputEvents > 0
    ? ((stats.inputEvents - stats.outputEvents) / stats.inputEvents * 100).toFixed(1)
    : '0.0';
  
  // Always log compaction stats (useful for debugging performance issues)
  if (totalMerged > 0 || debug) {
    // Count event types in output for verification
    const outputTypeCounts = {};
    for (const event of result) {
      const type = event.type || 'UNKNOWN';
      outputTypeCounts[type] = (outputTypeCounts[type] || 0) + 1;
    }
    
    console.log(`[aggressiveCompactEvents] Compaction stats:`, {
      input: stats.inputEvents,
      afterBasic: stats.afterBasicCompaction,
      output: stats.outputEvents,
      basicReduction: `${basicReduction}%`,
      aggressiveReduction: `${aggressiveReduction}%`,
      totalReduction: `${totalReduction}%`,
      merged: {
        stateDeltas: stats.stateDeltasMerged,
        activityDeltas: stats.activityDeltasMerged,
        thinkingEvents: stats.thinkingEventsMerged,
      },
      inputTypes: inputTypeCounts,
      outputTypes: outputTypeCounts,
    });
  }
  
  return result;
}

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
   * @param {number} [options.maxHistoricRuns=null] - Max runs to load on connect (null/0 = load all, matches SQLite behavior)
   * @param {Object} [options.redis] - Optional Redis client for caching
   * @param {number} [options.cacheTTL=300] - Cache TTL in seconds (5 minutes)
   * @param {boolean} [options.transformErrors=false] - If true, transform RUN_ERROR to RUN_FINISHED (shows failed runs in history); if false, filter out error runs entirely
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
    // maxHistoricRuns: null/0 = load all runs (matches SQLite), >0 = safety limit
    this.maxHistoricRuns = options.maxHistoricRuns !== undefined ? options.maxHistoricRuns : null;
    this.redis = options.redis || null;
    this.cacheTTL = options.cacheTTL || 300; // 5 minutes
    this.debug = options.debug || false; // Enable verbose debug logging
    // transformErrors: false = filter out error runs (default), true = transform RUN_ERROR to RUN_FINISHED
    this.transformErrors = options.transformErrors || false;
    
    // In-memory cache for active runs (subjects only)
    this.activeSubjects = new Map(); // threadId -> { threadSubject, runSubject, agent }
    
    // Cache for deleted message IDs per thread (to avoid repeated DB queries)
    // Structure: threadId -> { deletedMessageIds: Set<string>, timestamp: number }
    this.deletedMessageIdsCache = new Map();
    
    // Metrics
    this.metrics = {
      runsStarted: 0,
      runsCompleted: 0,
      runsFailed: 0,
      runsStopped: 0,
      runsInterrupted: 0,  // Stale runs cleaned up after server restart
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
      transformErrors: this.transformErrors,
    });
    
    // Recover stalled runs from previous server instance (async, non-blocking)
    // This ensures any runs that were in progress when the server crashed
    // are properly marked as 'interrupted' and threads are reset
    this.recoverStalledRuns().catch(err => {
      console.error('[PostgresAgentRunner] Failed to recover stalled runs:', err.message);
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
   * 
   * DATA INTEGRITY ARCHITECTURE:
   * - currentEvents: UNTRUNCATED events for database persistence (source of truth)
   * - eventToStream: TRUNCATED copies for frontend streaming only (never persisted)
   * - Database always contains full, original data (no truncation)
   * - Frontend receives truncated data for performance (large tool results/args)
   * - This ensures data integrity: truncation is display-only, never corrupts storage
   * 
   * @private
   */
  async executeRun(request, runSubject, startTime) {
    const { threadId, agent, input } = request;
    const { runId } = input;
    
    let error = null;
    const currentEvents = []; // UNTRUNCATED events for database persistence (source of truth)
    
    try {
      // Step 1: Get parent run ID (for nested agent calls)
      const parentRunId = await this.getLatestRunId(threadId);
      
      // Step 2: Acquire lock and validate (pass agent for auth context)
      await this.acquireRunLock(threadId, runId, agent, parentRunId);
      
      // Step 3: Load historic data for message deduplication
      const historicRuns = await this.getHistoricRuns(threadId);
      
      // Process runs: filter out error runs (default) or transform errors to RUN_FINISHED
      // Controlled by this.transformErrors (set via AGENT_RUNNER_TRANSFORM_ERRORS env var)
      const completeRuns = this.filterAndCompleteRuns(historicRuns, threadId, 'in executeRun', this.transformErrors);
      
      // Get deleted message IDs for this thread
      const deletedMessageIds = await this.getDeletedMessageIds(threadId);
      
      // Build a map linking tool call IDs to their initiating message IDs
      const toolCallIdToMessageId = this.buildToolCallToMessageIdMap(completeRuns, 'executeRun');
      
      // Build set of tool call IDs to filter (deleted + incomplete)
      const deletedToolCallIds = this.buildDeletedToolCallIds(
        completeRuns, 
        toolCallIdToMessageId, 
        deletedMessageIds, 
        'executeRun'
      );
      
      if (this.debug && toolCallIdToMessageId.size > 0) {
        console.log(`[PostgresAgentRunner] Tool call to message ID mapping (executeRun, ${toolCallIdToMessageId.size} entries):`);
        for (const [toolCallId, messageId] of toolCallIdToMessageId.entries()) {
          const isDeleted = deletedMessageIds.has(messageId);
          // console.log(`[PostgresAgentRunner]   toolCallId: ${toolCallId} -> messageId: ${messageId} ${isDeleted ? '(DELETED)' : '(not deleted)'}`);
        }
      }
      
      // Filter events to exclude ONLY the specific deleted messages and their associated tool calls
      // Do NOT filter based on chronological position - only filter by specific message/tool IDs
      // This ensures new runs created after deletions are not affected
      const filteredHistoricRuns = completeRuns.map(run => {
        const runEvents = run.events || [];
        const filtered = [];
        
        for (const event of runEvents) {
          // Ensure each event has a runId for lazy loading (add if missing)
          if (!event.runId) {
            event.runId = run.runId;
          }
          // Filter messages in RUN_STARTED input (modify in place)
          // All messages (user, assistant, tool) are stored in RUN_STARTED input.messages
          if (event.type === EventType.RUN_STARTED && event.input?.messages) {
            const originalLength = event.input.messages.length;
            
            event.input.messages = event.input.messages.filter(
              msg => !deletedMessageIds.has(msg.id)
            );
            
            if (event.input.messages.length !== originalLength && this.debug) {
              console.log(`[PostgresAgentRunner] Filtered ${originalLength - event.input.messages.length} deleted messages from RUN_STARTED input in executeRun`);
            }
            
            // Always include RUN_STARTED event (even if it had deleted messages)
            // The deleted messages have been filtered from input.messages
            filtered.push(event);
            continue;
          }
          
          // Filter any event with messageId property that's deleted
          // Only filter if this specific messageId is in the deleted set
          if ('messageId' in event && 
              typeof event.messageId === 'string' && 
              deletedMessageIds.has(event.messageId)) {
            if (this.debug) {
              // console.log(`[PostgresAgentRunner] Filtering out deleted message ${event.messageId} from event ${event.type} in executeRun`);
            }
            continue; // Skip this event
          }
          
          // Filter tool call events (START, ARGS, END, RESULT) if:
          // 1. Their toolCallId is associated with a deleted message, OR
          // 2. They are orphaned (no associated message found)
          // Only filter if this specific toolCallId is in the deleted set
          if ('toolCallId' in event && 
              typeof event.toolCallId === 'string') {
            // Check if tool call is deleted (associated message was deleted)
            if (deletedToolCallIds.has(event.toolCallId)) {
              if (this.debug) {
                // console.log(`[PostgresAgentRunner] Filtering out tool call event ${event.type} with toolCallId ${event.toolCallId} (associated message deleted) in executeRun`);
              }
              continue; // Skip this event
            }
            
            // Check if tool call is orphaned (no associated message found)
            const associatedMessageId = toolCallIdToMessageId.get(event.toolCallId);
            if (!associatedMessageId) {
              if (this.debug) {
                console.log(`[PostgresAgentRunner] Filtering out orphaned tool call event ${event.type} with toolCallId ${event.toolCallId} (no associated message found) in executeRun`);
              }
              continue; // Skip this event
            }
            
            // Debug: Log tool call events that are NOT being filtered
            if (this.debug && (event.type === 'TOOL_CALL_START' || event.type === 'TOOL_CALL_ARGS' || event.type === 'TOOL_CALL_END' || event.type === 'TOOL_CALL_RESULT')) {
              const isDeleted = deletedMessageIds.has(associatedMessageId);
              // console.log(`[PostgresAgentRunner] NOT filtering tool call event ${event.type} with toolCallId ${event.toolCallId} (associated messageId: ${associatedMessageId}, deleted: ${isDeleted}) in executeRun`);
            }
          }
          
          // Include all other events (including new messages from new runs)
          // New messages have new IDs that are not in the deleted sets
          if (this.debug && (event.type === 'TOOL_CALL_START' || event.type === 'TOOL_CALL_ARGS' || event.type === 'TOOL_CALL_END' || event.type === 'TOOL_CALL_RESULT')) {
            // console.log(`[PostgresAgentRunner] Including tool call event ${event.type} with toolCallId: ${event.toolCallId || 'none'} in executeRun`);
          }
          filtered.push(event);
        }
        
        return { ...run, events: filtered };
      });
      
      const historicMessageIds = this.extractMessageIds(filteredHistoricRuns);
      
      if (this.debug && deletedMessageIds.size > 0) {
        console.log(`[PostgresAgentRunner] Filtered ${deletedMessageIds.size} deleted messages from historic context for new run`);
      }
      
      // Step 4: Set up observables
      const threadSubject = this.getOrCreateThreadSubject(threadId);
      this.activeSubjects.set(threadId, {
        threadSubject,
        runSubject,
        agent,
      });
      
      // Step 5: Track events
      const seenMessageIds = new Set(historicMessageIds);
      
      // Step 6: Execute agent
      await agent.runAgent(input, {
        onEvent: async ({ event }) => {
          try {
            // Process event (sanitize messages, etc.)
            const processedEvent = this.processEvent(event, input, historicMessageIds);
            
            // CRITICAL: Store UNTRUNCATED event for database persistence
            // This ensures the database always contains the full, original data
            currentEvents.push(processedEvent);
            
            // Create a TRUNCATED COPY for streaming to frontend only
            // This reduces payload size without corrupting the database
            let eventToStream = processedEvent;
            const isResult = processedEvent.type === EventType.TOOL_CALL_RESULT || processedEvent.type === 'TOOL_CALL_RESULT';
            const isArgs = processedEvent.type === EventType.TOOL_CALL_ARGS || processedEvent.type === 'TOOL_CALL_ARGS';
            
            if (isResult || isArgs) {
              const truncated = this.truncateToolCallResults([processedEvent], runId);
              eventToStream = truncated[0]; // Truncated version for frontend only
            }
            
            // Check if observable is still active before emitting
            if (runSubject.closed) {
              if (this.debug) {
                console.log(`[PostgresAgentRunner] Skipping event - runSubject already closed`);
              }
              return;
            }
            
            // Stream TRUNCATED event to subscribers (frontend)
            runSubject.next(eventToStream);
            threadSubject.next(eventToStream);
            
            // Persist message if applicable (uses UNTRUNCATED data)
            if (processedEvent.type === EventType.MESSAGE_CREATED) {
              await this.persistMessage(processedEvent.message, threadId, runId);
            } else if (processedEvent.type === EventType.MESSAGE_UPDATED) {
              await this.updateMessage(processedEvent.messageId, processedEvent.message);
            }
            
            // Optionally persist event immediately (for crash recovery)
            // CRITICAL: Use UNTRUNCATED processedEvent, not eventToStream
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
      
    } catch (err) {
      error = err;
      console.error(`[PostgresAgentRunner] Run failed: ${error.message}`);
      this.metrics.runsFailed++;
      
    } finally {
      // Always finalize (success or error)
      await this.finalizeRun(request, currentEvents, error, runSubject, startTime);
    }
  }
  
  /**
   * Finalize run - persist events, update state, cleanup
   * @private
   * @param {Array} currentEvents - UNTRUNCATED events for database persistence (never truncated)
   */
  async finalizeRun(request, currentEvents, error, runSubject, startTime) {
    const { threadId, input } = request;
    const { runId } = input;
    
    try {
      // Step 7: Finalize and persist
      // CRITICAL: currentEvents contains UNTRUNCATED data for database persistence
      // Truncation only happens for frontend streaming, never for DB storage
      const stopRequested = await this.isStopRequested(threadId);
      const appendedEvents = finalizeRunEvents(currentEvents, { stopRequested });
      
      // Emit finalization events
      const threadSubject = this.activeSubjects.get(threadId)?.threadSubject;
      for (const event of appendedEvents) {
        if (!runSubject.closed) {
          runSubject.next(event);
        }
        if (threadSubject) {
          threadSubject.next(event);
        }
      }
      
      // Filter out RUN_ERROR events before saving
      // RUN_ERROR events should not be persisted as they will be filtered out on load anyway
      // This ensures runs are saved in a clean state
      const hasRunError = currentEvents.some(e => e.type === 'RUN_ERROR');
      const eventsToSave = currentEvents.filter(e => e.type !== 'RUN_ERROR');
      
      // Determine final status
      // If there are RUN_ERROR events, mark as error regardless of the error parameter
      const status = (error || hasRunError) ? 'error' : (stopRequested ? 'stopped' : 'completed');
      
      if (hasRunError && this.debug) {
        console.log(`[PostgresAgentRunner] Filtered out ${currentEvents.length - eventsToSave.length} RUN_ERROR events before saving run ${runId}, marking as 'error'`);
      }
      
      // Aggressive compact and store (use filtered events)
      // This merges STATE_DELTA, ACTIVITY_DELTA, and THINKING events in addition to TEXT/TOOL
      const compactedEvents = aggressiveCompactEvents(eventsToSave, { debug: this.debug });
      console.log(`[PostgresAgentRunner] Persisting ${compactedEvents.length} compacted events for run ${runId} (from ${currentEvents.length} raw events)`);
      await this.completeRun(runId, compactedEvents, status);
      
      // Update thread state
      await this.updateThreadState(threadId, {
        is_running: false,
        current_run_id: null,
        stop_requested: false,
        last_accessed_at: new Date(),
      });
      
      // Update metrics
      const duration = Date.now() - startTime;
      if (error) {
        // Already counted in runsFailed
      } else if (stopRequested) {
        this.metrics.runsStopped++;
      } else {
        this.metrics.runsCompleted++;
        this.metrics.avgRunDuration = 
          (this.metrics.avgRunDuration * (this.metrics.runsCompleted - 1) + duration) / 
          this.metrics.runsCompleted;
      }
      
      if (this.debug) {
        console.log(`[PostgresAgentRunner] Run finalized: ${threadId}/${runId} (${duration}ms, ${status})`);
      }
      
      // Verify data was saved (debug only)
      if (this.debug) {
        try {
          const verify = await this.pool.query(
            `SELECT run_id, status, jsonb_array_length(events) as event_count 
             FROM agent_runs WHERE run_id = $1`,
            [runId]
          );
          if (verify.rows.length > 0) {
            console.log(`[PostgresAgentRunner] ✅ Verified: status=${verify.rows[0].status}, events=${verify.rows[0].event_count}`);
          } else {
            console.error(`[PostgresAgentRunner] ❌ Run ${runId} NOT FOUND in database!`);
          }
        } catch (verifyErr) {
          console.error(`[PostgresAgentRunner] Verification failed: ${verifyErr.message}`);
        }
      }
      
      // Complete observables
      if (error) {
        runSubject.error(error);
      } else {
        runSubject.complete();
      }
      
    } catch (finalizeError) {
      console.error(`[PostgresAgentRunner] Finalization error: ${finalizeError.message}`);
      if (!runSubject.closed) {
        runSubject.error(finalizeError);
      }
    } finally {
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
      
      // Process runs: filter out error runs (default) or transform errors to RUN_FINISHED
      // This ensures:
      // - Error runs don't affect new runs (filter mode)
      // - All runs have RUN_FINISHED to prevent "run still active" errors
      // Controlled by this.transformErrors (set via AGENT_RUNNER_TRANSFORM_ERRORS env var)
      const completeRuns = this.filterAndCompleteRuns(historicRuns, threadId, 'in loadAndStreamHistory', this.transformErrors);
      
      // REQUIREMENT 2: Filter deleted messages and their associated tool calls
      // When a user deletes messages (e.g., "delete all below"), we need to:
      // 1. Filter out deleted assistant messages
      // 2. Filter out all tool call events (START, ARGS, END, RESULT) associated with deleted assistant messages
      // 3. Ensure new messages created after deletion are NOT filtered (ID-based filtering, not chronological)
      
      // Get deleted message IDs for this thread
      const deletedMessageIds = await this.getDeletedMessageIds(threadId);
      
      // Build a map linking tool call IDs to their initiating message IDs
      const toolCallIdToMessageId = this.buildToolCallToMessageIdMap(completeRuns, 'loadAndStreamHistory');
      
      // Build a map of messageId -> role for logging purposes
      // This helps us identify whether a tool call is associated with a user or assistant message
      const messageIdToRole = new Map();
      for (const run of completeRuns) {
        for (const event of run.events || []) {
          if (event.type === EventType.RUN_STARTED && event.input?.messages) {
            for (const msg of event.input.messages) {
              if (msg.id && msg.role) {
                messageIdToRole.set(msg.id, msg.role);
              }
            }
          }
          // Also track assistant messages from TEXT_MESSAGE_START
          if (event.type === 'TEXT_MESSAGE_START' && event.messageId) {
            messageIdToRole.set(event.messageId, 'assistant');
          }
        }
      }
      
      // Build set of tool call IDs to filter (deleted + incomplete)
      const deletedToolCallIds = this.buildDeletedToolCallIds(
        completeRuns, 
        toolCallIdToMessageId, 
        deletedMessageIds, 
        'loadAndStreamHistory'
      );
      
      
      // Filter events to exclude ONLY the specific deleted messages and their associated tool calls
      // IMPORTANT: Do NOT filter based on chronological position - only filter by specific message/tool IDs
      // This ensures new messages created after deletions are NOT filtered (they have new IDs)
      // Only messages/tool calls with IDs in deletedMessageIds/deletedToolCallIds are filtered
      const filteredEvents = completeRuns.flatMap(run => {
        const runEvents = run.events || [];
        const filtered = [];
        
        for (const event of runEvents) {
          // Ensure each event has a runId for lazy loading (add if missing)
          if (!event.runId) {
            event.runId = run.runId;
          }
          // Filter messages in RUN_STARTED input (modify in place)
          // All messages (user, assistant, tool) are stored in RUN_STARTED input.messages
          if (event.type === EventType.RUN_STARTED && event.input?.messages) {
            const originalLength = event.input.messages.length;
            
            event.input.messages = event.input.messages.filter(
              msg => !deletedMessageIds.has(msg.id)
            );
            
            if (event.input.messages.length !== originalLength && this.debug) {
              // console.log(`[PostgresAgentRunner] Filtered ${originalLength - event.input.messages.length} deleted messages from RUN_STARTED input`);
            }
            
            // Always include RUN_STARTED event (even if it had deleted messages)
            // The deleted messages have been filtered from input.messages
            filtered.push(event);
            continue;
          }
          
          // Filter any event with messageId property that's deleted
          // Only filter if this specific messageId is in the deleted set
          if ('messageId' in event && 
              typeof event.messageId === 'string') {
            if (deletedMessageIds.has(event.messageId)) {
              if (this.debug) {
                // console.log(`[PostgresAgentRunner] Filtering out deleted message ${event.messageId} from event ${event.type} in loadAndStreamHistory`);
              }
              continue; // Skip this event
            } else if (this.debug && (event.type === 'TEXT_MESSAGE_START' || event.type === 'TEXT_MESSAGE_CONTENT' || event.type === 'TEXT_MESSAGE_END')) {
              // Debug: Log assistant messages that are NOT being filtered
              // console.log(`[PostgresAgentRunner] NOT filtering event ${event.type} with messageId ${event.messageId} (not in deleted set) in loadAndStreamHistory`);
        }
          }
          
          // Filter tool call events (START, ARGS, END, RESULT) if:
          // 1. Their toolCallId is associated with a deleted message, OR
          // 2. They are orphaned (no associated message found)
          // This ensures ALL tool call events for deleted assistant messages are filtered out
          // Only filter if this specific toolCallId is in the deleted set (ID-based, not chronological)
          if ('toolCallId' in event && 
              typeof event.toolCallId === 'string') {
            // Check if tool call is deleted (associated message was deleted)
            if (deletedToolCallIds.has(event.toolCallId)) {
              if (this.debug) {
                // console.log(`[PostgresAgentRunner] Filtering out tool call event ${event.type} with toolCallId ${event.toolCallId} (associated message deleted)`);
              }
              continue; // Skip this event - tool call belongs to deleted assistant message
            }
            
            // Check if tool call is orphaned (no associated message found)
            // This can happen if the assistant message was deleted before we built the toolCallIdToMessageId map
            const associatedMessageId = toolCallIdToMessageId.get(event.toolCallId);
            if (!associatedMessageId) {
              if (this.debug) {
                console.log(`[PostgresAgentRunner] Filtering out orphaned tool call event ${event.type} with toolCallId ${event.toolCallId} (no associated message found)`);
              }
              continue; // Skip this event - tool call has no associated message
            }
            
            // Debug: Log tool call events that are NOT being filtered
            if (this.debug && (event.type === 'TOOL_CALL_START' || event.type === 'TOOL_CALL_ARGS' || event.type === 'TOOL_CALL_END' || event.type === 'TOOL_CALL_RESULT')) {
              const isDeleted = deletedMessageIds.has(associatedMessageId);
              // console.log(`[PostgresAgentRunner] NOT filtering tool call event ${event.type} with toolCallId ${event.toolCallId} (associated messageId: ${associatedMessageId}, deleted: ${isDeleted})`);
            }
          }
          
          // Include all other events (including new messages from new runs)
          // New messages have new IDs that are not in the deleted sets
          if (this.debug && (event.type === 'TOOL_CALL_START' || event.type === 'TOOL_CALL_ARGS' || event.type === 'TOOL_CALL_END' || event.type === 'TOOL_CALL_RESULT')) {
            // console.log(`[PostgresAgentRunner] Including tool call event ${event.type} with toolCallId: ${event.toolCallId || 'none'}`);
          }
          filtered.push(event);
        }
        
        return filtered;
      });
      
      // Aggressive compact filtered events for history replay
      // This merges STATE_DELTA, ACTIVITY_DELTA, and THINKING events for faster load
      const compactedEvents = aggressiveCompactEvents(filteredEvents, { debug: this.debug });
      
      // Truncate TOOL_CALL_RESULT events with large content for lazy loading
      // Replace content > 1200 characters with JSON containing toolCallId
      const truncatedEvents = this.truncateToolCallResults(compactedEvents);
      
      // Emit historic events
      const emittedMessageIds = new Set();
      const toolCallEventsEmitted = [];
      
      for (const event of truncatedEvents) {
        // Log all tool call events before emitting
        if (event.type === 'TOOL_CALL_START' || event.type === 'TOOL_CALL_ARGS' || event.type === 'TOOL_CALL_END' || event.type === 'TOOL_CALL_RESULT') {
          // Look up the associated message ID from the toolCallId
          const associatedMessageId = event.toolCallId ? toolCallIdToMessageId.get(event.toolCallId) : null;
          const associatedMessageRole = associatedMessageId ? messageIdToRole.get(associatedMessageId) : null;
          
          toolCallEventsEmitted.push({
            type: event.type,
            toolCallId: event.toolCallId || 'none',
            messageId: event.messageId || 'none', // This is the tool result message ID
            associatedMessageId: associatedMessageId || 'none',
            associatedMessageRole: associatedMessageRole || 'unknown',
            runId: event.runId || 'none'
          });
        }
        
        connectionSubject.next(event);
        if ('messageId' in event && typeof event.messageId === 'string') {
          emittedMessageIds.add(event.messageId);
        }
      }
      
      if (this.debug && toolCallEventsEmitted.length > 0) {
        console.log(`[PostgresAgentRunner] Loaded ${truncatedEvents.length} events (${toolCallEventsEmitted.length} tool calls) for ${threadId}`);
      if (this.debug) {
          toolCallEventsEmitted.forEach(evt => {
            const associationInfo = evt.associatedMessageId !== 'none' 
              ? `associated with ${evt.associatedMessageRole} message ${evt.associatedMessageId}`
              : 'no associated message found';
            // console.log(`[PostgresAgentRunner]   ${evt.type} - toolCallId: ${evt.toolCallId}, ${associationInfo}`);
          });
        } else {
          console.log(`[PostgresAgentRunner] No tool call events being emitted`);
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
          // Run is marked as active but no subject exists (server restart scenario)
          // This is a stale run - clean it up so user can start fresh
          console.warn(`[PostgresAgentRunner] Stale run detected for ${threadId}, cleaning up...`);
          
          await this.cleanupStaleRun(threadId, threadState);
          
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
   * Truncate TOOL_CALL_RESULT and TOOL_CALL_ARGS events with large content for lazy loading
   * Replaces content > 1200 characters with JSON containing toolCallId
   * This allows the frontend to lazily load the full content when needed
   * 
   * @param {Array} events - Array of events to process
   * @param {string} [explicitRunId] - Optional explicit runId to use (for real-time events)
   * @returns {Array} Array of events with truncated content
   * @private
   */
  truncateToolCallResults(events, explicitRunId = null) {
    const TRUNCATE_THRESHOLD = 1200;
    let truncatedResultCount = 0;
    let truncatedArgsCount = 0;
    
    const truncated = events.map(event => {
      // Only process TOOL_CALL_RESULT and TOOL_CALL_ARGS events
      const isResult = event.type === EventType.TOOL_CALL_RESULT || event.type === 'TOOL_CALL_RESULT';
      const isArgs = event.type === EventType.TOOL_CALL_ARGS || event.type === 'TOOL_CALL_ARGS';
      
      if (!isResult && !isArgs) {
        return event;
      }
      
      const toolCallId = event.toolCallId || 'unknown';
      
      // Check if event has data to truncate
      // For TOOL_CALL_RESULT: content or result field
      // For TOOL_CALL_ARGS: args or delta field
      const hasContent = event.content !== undefined && event.content !== null;
      const hasResult = event.result !== undefined && event.result !== null;
      const hasArgs = event.args !== undefined && event.args !== null;
      const hasDelta = event.delta !== undefined && event.delta !== null;
      
      if (isResult && !hasContent && !hasResult) {
        return event;
      }
      
      if (isArgs && !hasArgs && !hasDelta) {
        return event;
      }
      
      // Determine which field contains the data
      let contentField;
      let content;
      
      if (isResult) {
        contentField = hasContent ? 'content' : 'result';
        content = event[contentField];
      } else {
        contentField = hasArgs ? 'args' : 'delta';
        content = event[contentField];
      }
      
      // Convert content to string if needed
      let contentStr = '';
      if (typeof content === 'string') {
        contentStr = content;
      } else if (content !== null && content !== undefined) {
        // Try to stringify if it's an object/array
        try {
          contentStr = JSON.stringify(content);
        } catch (e) {
          contentStr = String(content);
        }
      }
      
      // Only truncate if content exceeds threshold
      if (contentStr.length > TRUNCATE_THRESHOLD) {
        if (isResult) {
          truncatedResultCount++;
        } else {
          truncatedArgsCount++;
        }
        
        // Replace content with JSON string containing toolCallId for lazy loading
        // The content field must be a string, so we stringify the truncated metadata
        // Use explicitRunId if provided (for real-time events), otherwise use event.runId (for historic events)
        const truncatedContentObj = {
          truncated: true,
          toolCallId: toolCallId,
          runId: explicitRunId || event.runId || null,
          originalLength: contentStr.length,
          eventType: isResult ? 'TOOL_CALL_RESULT' : 'TOOL_CALL_ARGS',
          message: 'Content truncated for performance. Full content available via lazy loading.'
        };
        
        const truncatedContentStr = JSON.stringify(truncatedContentObj);
        
        const truncatedEvent = {
          ...event,
          [contentField]: truncatedContentStr
        };
        
        return truncatedEvent;
      }
      
      return event;
    });
    
    // Summary logging (only when truncation occurred)
    const totalTruncated = truncatedResultCount + truncatedArgsCount;
    
    if (totalTruncated > 0) {
      console.log(`[PostgresAgentRunner] Truncated ${totalTruncated} events (${truncatedResultCount} results, ${truncatedArgsCount} args) from ${events.length} total events`);
    }
    
    return truncated;
  }

  /**
   * Get the latest run ID for a thread (for parent tracking)
   * @private
   */
  async getLatestRunId(threadId) {
    const result = await this.pool.query(
      `SELECT run_id FROM agent_runs 
       WHERE thread_id = $1 AND status IN ('completed', 'stopped')
       ORDER BY created_at DESC 
       LIMIT 1`,
      [threadId]
    );
    return result.rows[0]?.run_id || null;
  }

  /**
   * Acquire run lock using atomic INSERT...ON CONFLICT
   * @private
   */
  async acquireRunLock(threadId, runId, agent, parentRunId = null) {
    const authContext = this.extractAuthContext(agent);
    
    // Try to acquire lock atomically - insert new thread or update existing
    const result = await this.pool.query(
      `INSERT INTO agent_threads 
       (thread_id, user_id, organization_id, team_id, session_id, 
        agent_type, model_type, is_running, current_run_id, 
        created_at, updated_at, last_accessed_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, NOW(), NOW(), NOW())
       ON CONFLICT (thread_id) DO UPDATE SET
         is_running = TRUE,
         current_run_id = $8,
         updated_at = NOW(),
         last_accessed_at = NOW()
       WHERE agent_threads.is_running = FALSE
       RETURNING thread_id, is_running`,
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
    
    // If no rows returned, thread is already running
    if (result.rows.length === 0) {
      throw new Error('Thread already running');
    }
    
    // Create run record with optional parent (separate query, no transaction needed)
    await this.pool.query(
      `INSERT INTO agent_runs 
       (run_id, thread_id, parent_run_id, status, events, created_at) 
       VALUES ($1, $2, $3, 'running', '[]'::jsonb, NOW())`,
      [runId, threadId, parentRunId]
    );
    
    if (this.debug) {
      console.log(`[PostgresAgentRunner] Lock acquired: ${threadId}/${runId}`);
    }
    
    return null; // No client needed anymore
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
   */
  async updateThreadState(threadId, updates) {
    const setClauses = Object.keys(updates)
      .map((key, idx) => `${key} = $${idx + 2}`)
      .join(', ');
    
    const values = [threadId, ...Object.values(updates)];
    
    await this.pool.query(
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
   * Clean up a stale run after server restart
   * 
   * This handles the crash recovery scenario where:
   * - Database shows thread is_running = true
   * - But no in-memory subject exists (lost on restart)
   * 
   * Actions taken:
   * 1. Mark the stale run as 'interrupted' status
   * 2. Reset thread state (is_running = false, stop_requested = false)
   * 3. Clear current_run_id so new runs can start
   * 
   * @private
   * @param {string} threadId - Thread ID
   * @param {Object} threadState - Current thread state from database
   */
  async cleanupStaleRun(threadId, threadState) {
    try {
      const staleRunId = threadState?.current_run_id;
      
      // Step 1: Mark the stale run as 'interrupted' if we have a run ID
      if (staleRunId) {
        const runResult = await this.pool.query(
          `UPDATE agent_runs 
           SET status = 'interrupted', 
               completed_at = NOW(),
               events = COALESCE(events, '[]'::jsonb)
           WHERE run_id = $1 AND status = 'running'
           RETURNING run_id`,
          [staleRunId]
        );
        
        if (runResult.rows.length > 0) {
          console.log(`[PostgresAgentRunner] Marked stale run ${staleRunId} as 'interrupted'`);
          this.metrics.runsInterrupted = (this.metrics.runsInterrupted || 0) + 1;
        } else {
          console.log(`[PostgresAgentRunner] Stale run ${staleRunId} was already completed or not found`);
        }
      }
      
      // Step 2: Reset thread state to allow new runs
      await this.updateThreadState(threadId, {
        is_running: false,
        stop_requested: false,
        current_run_id: null,
        last_accessed_at: new Date(),
      });
      
      console.log(`[PostgresAgentRunner] Cleaned up stale run state for thread ${threadId}`);
      
      // Step 3: Remove any stale entries from activeSubjects (shouldn't exist, but be safe)
      this.activeSubjects.delete(threadId);
      
    } catch (error) {
      // Log but don't throw - we still want to complete the connection
      console.error(`[PostgresAgentRunner] Error cleaning up stale run for ${threadId}: ${error.message}`);
    }
  }
  
  /**
   * Complete a run and store events
   * @private
   * @param {string} runId - Run ID
   * @param {Array} events - Events to store
   * @param {string} status - Final status ('completed', 'stopped', 'error')
   */
  async completeRun(runId, events, status) {
    console.log(`[PostgresAgentRunner] completeRun: runId=${runId}, status=${status}, events=${events.length}`);
    
    const result = await this.pool.query(
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
   * Uses recursive CTE to load all runs following parent-child relationships
   * Matches SQLite runner behavior for consistency
   * @private
   */
  async getHistoricRuns(threadId) {
    // Use recursive CTE to load all runs following parent-child chains
    // This ensures we get all runs in a thread, including nested sub-agent calls
    // Matches SQLite runner implementation for consistency
    // If maxHistoricRuns is set, load the MOST RECENT N runs (not the oldest)
    const params = [threadId];
    
    // Determine which statuses to include:
    // - Always include 'completed' and 'stopped'
    // - Include 'error' only when transformErrors is enabled (to show failed runs in history)
    const statusList = this.transformErrors 
      ? "('completed', 'stopped', 'error')" 
      : "('completed', 'stopped')";
    
    let query;
    if (this.maxHistoricRuns && this.maxHistoricRuns > 0) {
      // Load most recent N runs by wrapping the CTE and applying LIMIT to DESC ordered results
      query = `
        WITH RECURSIVE run_chain AS (
          -- Base case: find root runs (those without parent)
          SELECT run_id, parent_run_id, events, created_at, completed_at
       FROM agent_runs 
          WHERE thread_id = $1 
            AND status IN ${statusList}
            AND parent_run_id IS NULL
          
          UNION ALL
          
          -- Recursive case: find children of current level
          SELECT ar.run_id, ar.parent_run_id, ar.events, ar.created_at, ar.completed_at
          FROM agent_runs ar
          INNER JOIN run_chain rc ON ar.parent_run_id = rc.run_id
          WHERE ar.thread_id = $1 
            AND ar.status IN ${statusList}
        ),
        recent_runs AS (
          -- Select the most recent N runs
          SELECT * FROM run_chain
       ORDER BY created_at DESC 
          LIMIT $2
        )
        -- Return in chronological order for proper event replay
        SELECT * FROM recent_runs
        ORDER BY created_at ASC
      `;
      params.push(this.maxHistoricRuns);
      
      if (this.debug) {
        console.log(`[PostgresAgentRunner] Loading most recent ${this.maxHistoricRuns} runs for thread ${threadId} (statuses: ${statusList})`);
      }
    } else {
      // Load all runs (no limit)
      query = `
        WITH RECURSIVE run_chain AS (
          -- Base case: find root runs (those without parent)
          SELECT run_id, parent_run_id, events, created_at, completed_at
          FROM agent_runs 
          WHERE thread_id = $1 
            AND status IN ${statusList}
            AND parent_run_id IS NULL
          
          UNION ALL
          
          -- Recursive case: find children of current level
          SELECT ar.run_id, ar.parent_run_id, ar.events, ar.created_at, ar.completed_at
          FROM agent_runs ar
          INNER JOIN run_chain rc ON ar.parent_run_id = rc.run_id
          WHERE ar.thread_id = $1 
            AND ar.status IN ${statusList}
        )
        SELECT * FROM run_chain
        ORDER BY created_at ASC
      `;
      
      if (this.debug) {
        console.log(`[PostgresAgentRunner] Loading all runs for thread ${threadId} (no limit, statuses: ${statusList})`);
      }
    }
    
    const result = await this.pool.query(query, params);
    
    // Return in chronological order (oldest first) for proper event replay
    return result.rows.map(row => ({
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
   * Process runs with RUN_ERROR events and ensure all runs have RUN_FINISHED
   * 
   * Two modes of operation controlled by `transformErrors` flag:
   * 
   * 1. FILTER MODE (transformErrors = false, default):
   *    - Completely removes runs that have RUN_ERROR events
   *    - Failed runs won't appear in history at all
   *    - Use when you want clean history without any trace of errors
   * 
   * 2. TRANSFORM MODE (transformErrors = true):
   *    - Keeps runs with errors but transforms RUN_ERROR to RUN_FINISHED
   *    - Error info is preserved in metadata (originalType, error)
   *    - Use when you want failed runs to appear in history
   * 
   * Both modes add synthetic RUN_FINISHED to incomplete runs (those with
   * RUN_STARTED but no RUN_FINISHED) to prevent "run still active" errors.
   * 
   * @private
   * @param {Array} historicRuns - Array of historic runs to process
   * @param {string} threadId - Thread identifier (for synthetic RUN_FINISHED events)
   * @param {string} [context=''] - Context string for debug logging (e.g., 'in executeRun')
   * @param {boolean} [transformErrors=false] - If true, transform RUN_ERROR to RUN_FINISHED; if false, filter out error runs
   * @returns {Array} Processed runs (filtered or transformed based on flag)
   */
  filterAndCompleteRuns(historicRuns, threadId, context = '', transformErrors = false) {
    const contextStr = context ? ` ${context}` : '';
    
    // Helper: Analyze events in a single pass (O(n) instead of O(4n))
    const analyzeEvents = (events) => {
      let runStartedEvent = null;
      let hasRunFinished = false;
      let hasRunError = false;
      
      for (const event of events) {
        if (event.type === 'RUN_STARTED' && !runStartedEvent) {
          runStartedEvent = event;
        } else if (event.type === 'RUN_FINISHED') {
          hasRunFinished = true;
        } else if (event.type === 'RUN_ERROR') {
          hasRunError = true;
        }
        // Early exit if we found everything we need
        if (runStartedEvent && hasRunFinished && hasRunError) break;
      }
      
      return { runStartedEvent, hasRunFinished, hasRunError };
    };
    
    // Helper: Create synthetic RUN_FINISHED event
    const createSyntheticFinished = (run, runStartedEvent, reason) => ({
      type: 'RUN_FINISHED',
      threadId: runStartedEvent?.threadId || threadId,
          runId: run.runId,
      metadata: {
        synthetic: true,
        reason
      }
    });
    
    // Helper: Add synthetic RUN_FINISHED to incomplete run (shared logic)
    const ensureRunFinished = (run, events, analysis, reason) => {
      if (analysis.runStartedEvent && !analysis.hasRunFinished) {
        if (this.debug) {
          console.log(`[PostgresAgentRunner] Adding synthetic RUN_FINISHED to incomplete run ${run.runId}${contextStr}`);
        }
        return { 
          ...run, 
          events: [...events, createSyntheticFinished(run, analysis.runStartedEvent, reason)] 
        };
      }
      return run;
    };
    
    if (transformErrors) {
      // =======================================================================
      // TRANSFORM MODE: Convert RUN_ERROR to RUN_FINISHED, keep runs in history
      // =======================================================================
      return historicRuns.map(run => {
        const events = run.events || [];
        const analysis = analyzeEvents(events);
        
        // Process runs with RUN_ERROR events
        if (analysis.hasRunError) {
          let transformedEvents;
          
          if (analysis.hasRunFinished) {
            // Run already has RUN_FINISHED, just filter out RUN_ERROR events
            transformedEvents = events.filter(event => {
              if (event.type === 'RUN_ERROR') {
          if (this.debug) {
                  console.log(`[PostgresAgentRunner] Filtering out RUN_ERROR for complete run ${run.runId}${contextStr}`);
          }
                return false;
              }
              return true;
            });
          } else {
            // No RUN_FINISHED, transform RUN_ERROR to RUN_FINISHED
            let transformedToFinished = false;
            transformedEvents = events.map(event => {
              if (event.type === 'RUN_ERROR') {
                transformedToFinished = true;
                if (this.debug) {
                  console.log(`[PostgresAgentRunner] Transforming RUN_ERROR to RUN_FINISHED for run ${run.runId}${contextStr}`);
                }
                return {
                  ...event,
            type: 'RUN_FINISHED',
                  threadId: event.threadId || analysis.runStartedEvent?.threadId || threadId,
                  runId: event.runId || run.runId,
            metadata: {
                    ...event.metadata,
                    originalType: 'RUN_ERROR',
                    error: event.error
                  }
                };
              }
              return event;
            });
            
            // If transformation didn't produce RUN_FINISHED (edge case), add synthetic
            if (!transformedToFinished && analysis.runStartedEvent) {
              if (this.debug) {
                console.log(`[PostgresAgentRunner] Adding synthetic RUN_FINISHED for incomplete error run ${run.runId}${contextStr}`);
              }
              transformedEvents.push(createSyntheticFinished(run, analysis.runStartedEvent, 'incomplete_run_with_error'));
            }
          }
          
          return { ...run, events: transformedEvents };
        }
        
        // For runs without errors, ensure they have RUN_FINISHED
        return ensureRunFinished(run, events, analysis, 'incomplete_run_no_finish');
      });
    } else {
      // =======================================================================
      // FILTER MODE: Remove runs with errors entirely from history
      // =======================================================================
      const filteredOutRuns = this.debug ? [] : null; // Only allocate if debugging
      
      // Filter and process in a single pass using reduce (avoids filter + map)
      const processedRuns = historicRuns.reduce((acc, run) => {
        const events = run.events || [];
        const analysis = analyzeEvents(events);
        
        // Skip runs with errors
        if (analysis.hasRunError) {
          if (this.debug) {
            filteredOutRuns.push({
              runId: run.runId,
              status: run.status,
              eventCount: events.length,
              createdAt: run.createdAt
            });
          }
          return acc; // Don't include this run
        }
        
        // Add run (with synthetic RUN_FINISHED if needed)
        acc.push(ensureRunFinished(run, events, analysis, 'incomplete_run_no_finish'));
        return acc;
      }, []);
      
      // Log filtered runs summary
      if (this.debug && filteredOutRuns && filteredOutRuns.length > 0) {
        console.log(`[PostgresAgentRunner] Filtering out ${filteredOutRuns.length} runs with RUN_ERROR${contextStr}:`);
        filteredOutRuns.forEach(run => {
          console.log(`[PostgresAgentRunner]   - Run ${run.runId} (status: ${run.status}, events: ${run.eventCount})`);
        });
        }
        
      return processedRuns;
    }
  }
  
  /**
   * Build a map linking tool call IDs to their initiating message IDs
   * Tool calls can be initiated by either USER or ASSISTANT messages
   * Each run has an initiating message (last message in RUN_STARTED input.messages)
   * 
   * @param {Array} completeRuns - Array of runs to process
   * @param {string} context - Context string for debug logging
   * @returns {Map} Map of toolCallId -> messageId
   * @private
   */
  buildToolCallToMessageIdMap(completeRuns, context = '') {
    const contextStr = context ? ` (${context})` : '';
    const toolCallIdToMessageId = new Map();
    
    // Process each run independently to find its initiating message
    for (const run of completeRuns) {
      const events = run.events || [];
      
      // Find the initiating message from RUN_STARTED event
      // The last message in input.messages is the one that triggered this run
      let runInitiatingMessageId = null;
      const runStartedEvent = events.find(e => e.type === EventType.RUN_STARTED);
      if (runStartedEvent && runStartedEvent.input?.messages) {
        const messages = runStartedEvent.input.messages;
        if (messages.length > 0) {
          // The last message is the initiating message (user or assistant)
          runInitiatingMessageId = messages[messages.length - 1].id;
          const runInitiatingRole = messages[messages.length - 1].role;
          if (this.debug) {
            // console.log(`[PostgresAgentRunner]${contextStr} Run ${run.runId} initiated by ${runInitiatingRole} message ${runInitiatingMessageId}`);
          }
        }
      }
      
      // If no initiating message from RUN_STARTED, check for TEXT_MESSAGE_START
      // (In case of assistant-initiated runs that create new messages)
      if (!runInitiatingMessageId) {
        for (const event of events) {
          if (event.type === 'TEXT_MESSAGE_START' && event.messageId) {
            runInitiatingMessageId = event.messageId;
            if (this.debug) {
              // console.log(`[PostgresAgentRunner]${contextStr} Run ${run.runId} creates assistant message ${runInitiatingMessageId}`);
            }
            break; // Use the first TEXT_MESSAGE_START
          }
        }
      }
      
      // Associate all TOOL_CALL_START events in this run with the run's initiating message
      for (const event of events) {
        if (event.type === 'TOOL_CALL_START' && event.toolCallId) {
          if (runInitiatingMessageId) {
            toolCallIdToMessageId.set(event.toolCallId, runInitiatingMessageId);
            if (this.debug) {
              // console.log(`[PostgresAgentRunner]${contextStr} Linked toolCallId ${event.toolCallId} to message ${runInitiatingMessageId} (run: ${run.runId})`);
            }
          } else {
            if (this.debug) {
              console.warn(`[PostgresAgentRunner]${contextStr} TOOL_CALL_START ${event.toolCallId} has no initiating message (run: ${run.runId})`);
            }
          }
        }
        
        // TOOL_CALL_RESULT events have toolCallId and messageId (tool result message)
        // Use these as a fallback if we couldn't link via initiating message
        if (event.type === 'TOOL_CALL_RESULT' && 
            event.toolCallId && 
            event.messageId) {
          // Only set if not already set (prefer initiating message association)
          if (!toolCallIdToMessageId.has(event.toolCallId)) {
            toolCallIdToMessageId.set(event.toolCallId, event.messageId);
            if (this.debug) {
              // console.log(`[PostgresAgentRunner]${contextStr} Linked toolCallId ${event.toolCallId} to tool result message ${event.messageId} (fallback, run: ${run.runId})`);
            }
          }
        }
      }
    }
    
    return toolCallIdToMessageId;
  }
  
  /**
   * Build set of tool call IDs that should be filtered out
   * Filters tool calls based on two criteria:
   * 1. Tool calls whose initiating message was deleted
   * 2. Incomplete tool calls (no TOOL_CALL_RESULT event)
   * 
   * @param {Array} completeRuns - Array of runs to process
   * @param {Map} toolCallIdToMessageId - Map linking tool calls to their initiating messages
   * @param {Set} deletedMessageIds - Set of deleted message IDs
   * @param {string} context - Context string for debug logging (e.g., 'executeRun', 'loadAndStreamHistory')
   * @returns {Set} Set of tool call IDs to filter out
   * @private
   */
  buildDeletedToolCallIds(completeRuns, toolCallIdToMessageId, deletedMessageIds, context = '') {
    const contextStr = context ? ` (${context})` : '';
    
    // Build a map of toolCallId -> tool result message ID from TOOL_CALL_RESULT events
    const toolCallIdToResultMessageId = new Map();
    for (const run of completeRuns) {
      for (const event of run.events || []) {
        if (event.type === 'TOOL_CALL_RESULT' && event.toolCallId && event.messageId) {
          toolCallIdToResultMessageId.set(event.toolCallId, event.messageId);
        }
      }
    }
    
    // Build set of deleted toolCallIds
    // A tool call should be filtered if:
    // 1. The message that initiated it is deleted, OR
    // 2. The tool call is incomplete (no TOOL_CALL_RESULT event), OR
    // 3. The tool result message is deleted
    const deletedToolCallIds = new Set();
    
    // Filter tool calls whose initiating message was deleted
    for (const [toolCallId, messageId] of toolCallIdToMessageId.entries()) {
      if (deletedMessageIds.has(messageId)) {
        deletedToolCallIds.add(toolCallId);
        if (this.debug) {
          // console.log(`[PostgresAgentRunner]${contextStr} Marking toolCallId ${toolCallId} as deleted (initiating message ${messageId} is deleted)`);
        }
      }
    }
    
    // Filter incomplete tool calls (those without TOOL_CALL_RESULT) 
    // OR tool calls whose result message is deleted
    for (const [toolCallId, messageId] of toolCallIdToMessageId.entries()) {
      if (!toolCallIdToResultMessageId.has(toolCallId)) {
        // No TOOL_CALL_RESULT event exists
        if (!deletedToolCallIds.has(toolCallId)) {
          deletedToolCallIds.add(toolCallId);
          if (this.debug) {
            // console.log(`[PostgresAgentRunner]${contextStr} Marking toolCallId ${toolCallId} as incomplete (no TOOL_CALL_RESULT event)`);
          }
        }
      } else {
        // TOOL_CALL_RESULT exists, but check if its message is deleted
        const resultMessageId = toolCallIdToResultMessageId.get(toolCallId);
        if (resultMessageId && deletedMessageIds.has(resultMessageId)) {
          if (!deletedToolCallIds.has(toolCallId)) {
            deletedToolCallIds.add(toolCallId);
            if (this.debug) {
              // console.log(`[PostgresAgentRunner]${contextStr} Marking toolCallId ${toolCallId} as deleted (tool result message ${resultMessageId} is deleted)`);
            }
          }
        }
      }
    }
    
    if (this.debug && deletedToolCallIds.size > 0) {
      const deletedInitiating = Array.from(deletedToolCallIds).filter(id => {
        const initiatingMessageId = toolCallIdToMessageId.get(id);
        return initiatingMessageId && deletedMessageIds.has(initiatingMessageId);
      }).length;
      
      const incomplete = Array.from(deletedToolCallIds).filter(id => 
        !toolCallIdToResultMessageId.has(id)
      ).length;
      
      const deletedResult = Array.from(deletedToolCallIds).filter(id => {
        const resultMessageId = toolCallIdToResultMessageId.get(id);
        return resultMessageId && deletedMessageIds.has(resultMessageId);
      }).length;
      
      console.log(`[PostgresAgentRunner]${contextStr} Found ${deletedToolCallIds.size} tool calls to filter out (initiating deleted: ${deletedInitiating}, incomplete: ${incomplete}, result deleted: ${deletedResult})`);
    }
    
    return deletedToolCallIds;
  }
  
  /**
   * Extract message IDs from historic runs
   * Includes all messages: user, assistant, tool, and system messages
   * Messages are stored in RUN_STARTED events' input.messages array
   * @private
   */
  extractMessageIds(historicRuns) {
    const messageIds = new Set();
    for (const run of historicRuns) {
      for (const event of run.events) {
        // Extract from events with messageId property
        if ('messageId' in event && typeof event.messageId === 'string') {
          messageIds.add(event.messageId);
        }
        
        // Extract from RUN_STARTED input messages (includes all message types: user, assistant, tool, system)
        if (event.type === EventType.RUN_STARTED && event.input?.messages) {
          for (const message of event.input.messages) {
            if (message.id) {
            messageIds.add(message.id);
            }
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
  
  /**
   * Delete a single message (mark as deleted)
   * Also deletes associated tool call messages
   * @param {string} threadId - Thread identifier
   * @param {string} messageId - Message identifier to delete
   */
  async deleteMessage(threadId, messageId) {
    try {
      // Get all message IDs to delete (including tool calls)
      const messageIdsToDelete = await this.findAssociatedMessageIds(threadId, [messageId]);
      
      if (messageIdsToDelete.length > 0) {
        await this.pool.query(
          `INSERT INTO agent_deleted_messages (thread_id, message_id)
           SELECT $1, unnest($2::text[])
           ON CONFLICT (thread_id, message_id) DO NOTHING`,
          [threadId, messageIdsToDelete]
        );
        
        // Invalidate cache to force refresh on next access
        this.invalidateDeletedMessageIdsCache(threadId);
        
        if (this.debug) {
          console.log(`[PostgresAgentRunner] Marked message ${messageId} and ${messageIdsToDelete.length - 1} associated messages as deleted in thread ${threadId}`);
        }
      }
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error deleting message: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete multiple messages (bulk delete)
   * Also deletes associated tool call messages
   * @param {string} threadId - Thread identifier
   * @param {string[]} messageIds - Array of message identifiers to delete
   */
  async deleteMessages(threadId, messageIds) {
    if (!messageIds || messageIds.length === 0) {
      return;
    }
    
    try {
      // Get all message IDs to delete (including tool calls)
      const messageIdsToDelete = await this.findAssociatedMessageIds(threadId, messageIds);
      
      if (messageIdsToDelete.length > 0) {
        await this.pool.query(
          `INSERT INTO agent_deleted_messages (thread_id, message_id)
           SELECT $1, unnest($2::text[])
           ON CONFLICT (thread_id, message_id) DO NOTHING`,
          [threadId, messageIdsToDelete]
        );
        
        // Invalidate cache to force refresh on next access
        this.invalidateDeletedMessageIdsCache(threadId);
        
        if (this.debug) {
          const toolCallCount = messageIdsToDelete.length - messageIds.length;
          console.log(`[PostgresAgentRunner] Marked ${messageIds.length} messages and ${toolCallCount} associated tool calls as deleted in thread ${threadId}`);
        }
      }
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error deleting messages: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find all message IDs associated with the given message IDs (including tool calls)
   * 
   * Logic:
   * - For USER messages: Find all assistant responses and tool calls that follow, up to the next user message
   * - For ASSISTANT messages: Find all tool calls that immediately follow
   * - For TOOL messages: Already included, no additional messages
   * 
   * @private
   * @param {string} threadId - Thread identifier
   * @param {string[]} messageIds - Base message IDs to find associations for
   * @returns {Promise<string[]>} Array of all message IDs to delete (including tool calls)
   */
  async findAssociatedMessageIds(threadId, messageIds) {
    if (!messageIds || messageIds.length === 0) {
      return [];
    }
    
    const allMessageIds = new Set(messageIds);
    
    try {
      // Load historic runs to find tool call messages
      const historicRuns = await this.getHistoricRuns(threadId);
      
      // Build a map of message ID -> message info
      const messageMap = new Map(); // messageId -> { id, role, createdAt, runId }
      
      // Collect all messages from all runs
      // Messages can appear in multiple runs (each run includes full history)
      // So we deduplicate by message ID and use the earliest occurrence
      const allMessages = [];
      for (const run of historicRuns) {
        for (const event of run.events || []) {
          // Extract messages from RUN_STARTED input (all messages including tool messages are stored here)
          if (event.type === EventType.RUN_STARTED && event.input?.messages) {
            for (const msg of event.input.messages) {
              if (msg.id) {
                // If we've seen this message before, use the earlier timestamp
                const existing = messageMap.get(msg.id);
                if (existing) {
                  // Keep the earlier timestamp
                  if (run.createdAt < existing.createdAt) {
                    existing.createdAt = run.createdAt;
                  }
                } else {
                  // New message - add it
                  const msgInfo = {
                    id: msg.id,
                    role: msg.role,
                    createdAt: run.createdAt,
                    runId: run.runId
                  };
                  messageMap.set(msg.id, msgInfo);
                  allMessages.push(msgInfo);
                }
              }
            }
          }
          
          // Also extract message IDs from TEXT_MESSAGE_START events
          // These events create new assistant messages
          if (event.type === 'TEXT_MESSAGE_START' && event.messageId) {
            const existing = messageMap.get(event.messageId);
            if (!existing) {
              // This is a new message created in this run
              const msgInfo = {
                id: event.messageId,
                role: 'assistant', // TEXT_MESSAGE_START is always for assistant messages
                createdAt: run.createdAt,
                runId: run.runId
              };
              messageMap.set(event.messageId, msgInfo);
              allMessages.push(msgInfo);
            }
          }
        }
      }
      
      // Sort all messages by creation time to maintain chronological order
      allMessages.sort((a, b) => a.createdAt - b.createdAt);
      
      if (this.debug) {
        console.log(`[PostgresAgentRunner] ======== DELETION REQUEST ========`);
        console.log(`[PostgresAgentRunner] Thread: ${threadId}`);
        console.log(`[PostgresAgentRunner] Requested deletions: ${messageIds.length} messages`);
        console.log(`[PostgresAgentRunner] Total messages in thread: ${allMessages.length}`);
      }
      
      // Track tool messages separately for detailed logging
      const toolMessagesToDelete = [];
      const assistantMessagesToDelete = [];
      const userMessagesToDelete = [];
      
      // For each deleted message, find associated messages based on role
      for (const messageId of messageIds) {
        const msgInfo = messageMap.get(messageId);
        if (!msgInfo) {
          if (this.debug) {
            console.log(`[PostgresAgentRunner] Message ${messageId} not found in messageMap`);
          }
          continue;
        }
        
        // Find this message's position in the chronological list
        const msgIndex = allMessages.findIndex(m => m.id === messageId);
        if (msgIndex === -1) {
          if (this.debug) {
            console.log(`[PostgresAgentRunner] Message ${messageId} not found in allMessages list`);
          }
          continue;
        }
        
        if (this.debug) {
          console.log(`[PostgresAgentRunner] Processing deletion for ${msgInfo.role} message ${messageId} at index ${msgIndex}`);
        }
        
        if (msgInfo.role === 'user') {
          // Track this user message
          userMessagesToDelete.push(messageId);
          
          // For USER messages: delete all subsequent messages (assistant responses + tool calls)
          // until we hit the next user message
          const collectedIds = [];
          for (let i = msgIndex + 1; i < allMessages.length; i++) {
            const nextMsg = allMessages[i];
            if (nextMsg.role === 'user') {
              // Hit the next user message, stop collecting
              if (this.debug) {
                console.log(`[PostgresAgentRunner] Hit next user message at index ${i}, stopping collection`);
              }
              break;
            }
            // Add assistant and tool messages
            allMessageIds.add(nextMsg.id);
            collectedIds.push({ id: nextMsg.id, role: nextMsg.role });
            
            // Track by type for summary
            if (nextMsg.role === 'tool') {
              toolMessagesToDelete.push({ id: nextMsg.id, associatedWith: messageId });
            } else if (nextMsg.role === 'assistant') {
              assistantMessagesToDelete.push(nextMsg.id);
            }
          }
          if (this.debug && collectedIds.length > 0) {
            console.log(`[PostgresAgentRunner] Collected ${collectedIds.length} messages for user message ${messageId}:`, collectedIds);
          }
        } else if (msgInfo.role === 'assistant') {
          // Track this assistant message
          assistantMessagesToDelete.push(messageId);
          
          // For ASSISTANT messages: delete consecutive tool messages that immediately follow
          const collectedIds = [];
          for (let i = msgIndex + 1; i < allMessages.length; i++) {
            const nextMsg = allMessages[i];
            if (nextMsg.role === 'tool') {
              // This tool message belongs to this assistant message
              allMessageIds.add(nextMsg.id);
              collectedIds.push(nextMsg.id);
              
              // Track for summary
              toolMessagesToDelete.push({ id: nextMsg.id, associatedWith: messageId });
            } else {
              // Hit a non-tool message, stop collecting
              break;
            }
          }
          if (this.debug && collectedIds.length > 0) {
            console.log(`[PostgresAgentRunner] Collected ${collectedIds.length} tool messages for assistant message ${messageId}:`, collectedIds);
          }
        } else if (msgInfo.role === 'tool') {
          // Track this tool message
          toolMessagesToDelete.push({ id: messageId, associatedWith: 'direct' });
        }
        // For TOOL messages: no additional messages to delete
      }
      
      if (this.debug) {
        console.log(`[PostgresAgentRunner] ======== DELETION SUMMARY ========`);
        console.log(`[PostgresAgentRunner] Total message IDs to delete: ${allMessageIds.size}`);
        console.log(`[PostgresAgentRunner]   - User messages: ${userMessagesToDelete.length}`);
        console.log(`[PostgresAgentRunner]   - Assistant messages: ${assistantMessagesToDelete.length}`);
        console.log(`[PostgresAgentRunner]   - Tool messages: ${toolMessagesToDelete.length}`);
        
        if (toolMessagesToDelete.length > 0) {
          console.log(`[PostgresAgentRunner] Tool messages to delete (${toolMessagesToDelete.length}):`);
          toolMessagesToDelete.forEach(tool => {
            console.log(`[PostgresAgentRunner]   - ${tool.id} (associated with: ${tool.associatedWith})`);
          });
        }
        
        console.log(`[PostgresAgentRunner] All message IDs to delete:`, Array.from(allMessageIds));
        console.log(`[PostgresAgentRunner] ================================`);
      }
      
      return Array.from(allMessageIds);
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error finding associated message IDs: ${error.message}`);
      // Return original message IDs if lookup fails
      return messageIds;
    }
  }
  
  /**
   * Delete all messages in a thread (reset thread)
   * @param {string} threadId - Thread identifier
   */
  async deleteAllMessages(threadId) {
    try {
      // Get all message IDs from historic runs
      const historicRuns = await this.getHistoricRuns(threadId);
      const allMessageIds = this.extractMessageIds(historicRuns);
      
      if (allMessageIds.size > 0) {
        await this.deleteMessages(threadId, Array.from(allMessageIds));
        
        // Cache is already invalidated by deleteMessages()
        
        if (this.debug) {
          console.log(`[PostgresAgentRunner] Marked all ${allMessageIds.size} messages as deleted in thread ${threadId}`);
        }
      }
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error deleting all messages: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete a thread and all associated data (hard delete with cascade)
   * This will cascade delete:
   * - All runs (agent_runs)
   * - All messages (agent_messages)
   * - All deleted message records (agent_deleted_messages)
   * @param {string} threadId - Thread identifier to delete
   */
  async deleteThread(threadId) {
    try {
      // Stop any active runs first
      const threadState = await this.getThreadState(threadId);
      if (threadState && threadState.is_running) {
        try {
          await this.stop({ threadId });
        } catch (stopError) {
          // Log but continue with deletion even if stop fails
          if (this.debug) {
            console.log(`[PostgresAgentRunner] Failed to stop thread ${threadId} before deletion: ${stopError.message}`);
          }
        }
      }
      
      // Delete the thread (cascade will handle runs, messages, and deleted_messages)
      const result = await this.pool.query(
        `DELETE FROM agent_threads WHERE thread_id = $1 RETURNING thread_id`,
        [threadId]
      );
      
      if (result.rows.length === 0) {
        if (this.debug) {
          console.log(`[PostgresAgentRunner] Thread ${threadId} not found for deletion`);
        }
        return false;
      }
      
      // Invalidate cache
      this.invalidateDeletedMessageIdsCache(threadId);
      
      // Clean up active subjects
      this.activeSubjects.delete(threadId);
      
      if (this.debug) {
        console.log(`[PostgresAgentRunner] Deleted thread ${threadId} and all associated data (cascade)`);
      }
      
      return true;
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error deleting thread: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get deleted message IDs for a thread (with caching)
   * @private
   * @param {string} threadId - Thread identifier
   * @param {boolean} [forceRefresh=false] - Force refresh from database
   * @returns {Promise<Set<string>>} Set of deleted message IDs
   */
  async getDeletedMessageIds(threadId, forceRefresh = false) {
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = this.deletedMessageIdsCache.get(threadId);
      if (cached) {
        const age = Date.now() - cached.timestamp;
        // Use cache if less than cacheTTL seconds old
        if (age < this.cacheTTL * 1000) {
          if (this.debug) {
            console.log(`[PostgresAgentRunner] Using cached deleted message IDs for thread ${threadId} (${cached.deletedMessageIds.size} messages, age: ${Math.round(age / 1000)}s)`);
          }
          return cached.deletedMessageIds;
        }
      }
    }
    
    try {
      // Query database
      const result = await this.pool.query(
        `SELECT message_id FROM agent_deleted_messages WHERE thread_id = $1`,
        [threadId]
      );
      
      const deletedMessageIds = new Set(result.rows.map(row => row.message_id));
      
      // Update cache
      this.deletedMessageIdsCache.set(threadId, {
        deletedMessageIds,
        timestamp: Date.now()
      });
      
      if (this.debug) {
        console.log(`[PostgresAgentRunner] Loaded ${deletedMessageIds.size} deleted message IDs for thread ${threadId} from database`);
      }
      
      return deletedMessageIds;
    } catch (error) {
      console.error(`[PostgresAgentRunner] Error getting deleted message IDs: ${error.message}`);
      // Return empty set on error to avoid breaking the flow
      return new Set();
    }
  }
  
  /**
   * Invalidate deleted message IDs cache for a thread
   * Called when messages are deleted to ensure cache consistency
   * @private
   * @param {string} threadId - Thread identifier
   */
  invalidateDeletedMessageIdsCache(threadId) {
    this.deletedMessageIdsCache.delete(threadId);
    if (this.debug) {
      console.log(`[PostgresAgentRunner] Invalidated deleted message IDs cache for thread ${threadId}`);
    }
  }
  
  // ==========================================================================
  // Cleanup & Maintenance
  // ==========================================================================
  
  /**
   * Cleanup stale runs that have been stuck in 'running' state
   * Runs are considered stale if they've been running for more than 1 hour
   * without completion. This prevents the issue where runs get stuck and
   * their events (including TOOL_CALL_RESULT) aren't loaded for truncation.
   * 
   * @private
   */
  async cleanupStaleRuns() {
    try {
      // Runs older than 1 hour in 'running' state are considered stale
      const staleThreshold = new Date(Date.now() - 3600000); // 1 hour
      
      const result = await this.pool.query(
        `UPDATE agent_runs 
         SET status = 'stopped', 
             completed_at = NOW()
         WHERE status = 'running' 
           AND created_at < $1
         RETURNING run_id, thread_id, created_at`,
        [staleThreshold]
      );
      
      if (result.rows.length > 0) {
        console.log(`[PostgresAgentRunner] Cleaned up ${result.rows.length} stale runs`);
        
        // Reset thread states for affected threads
        const threadIds = [...new Set(result.rows.map(r => r.thread_id))];
        
        for (const threadId of threadIds) {
          await this.updateThreadState(threadId, {
            is_running: false,
            current_run_id: null,
            stop_requested: false,
            last_accessed_at: new Date(),
          });
        }
        
        if (this.debug) {
          result.rows.forEach(row => {
            const age = Date.now() - new Date(row.created_at).getTime();
            console.log(`[PostgresAgentRunner] Cleaned stale run: ${row.run_id} (age: ${Math.round(age / 60000)}min)`);
          });
        }
      }
    } catch (error) {
      console.error(`[PostgresAgentRunner] Stale run cleanup error: ${error.message}`);
    }
  }
  
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
   * Runs periodic maintenance tasks:
   * - Clean up stale runs (stuck in 'running' state > 1 hour)
   * - Clean up stale threads (inactive > TTL)
   * 
   * @private
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      // Clean up stale runs first (more critical)
      this.cleanupStaleRuns().catch(err => {
        console.error('[PostgresAgentRunner] Stale run cleanup failed:', err.message);
      });
      
      // Then clean up stale threads
      this.cleanupStaleThreads().catch(err => {
        console.error('[PostgresAgentRunner] Stale thread cleanup failed:', err.message);
      });
    }, this.cleanupInterval);
    
    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
  
  /**
   * Recover stalled runs on startup
   * 
   * This method should be called when the server starts to clean up any runs
   * that were in progress when the previous server instance crashed or restarted.
   * 
   * Actions:
   * 1. Find all threads marked as is_running = true
   * 2. Mark their current runs as 'stopped' (since they were interrupted)
   * 3. Reset thread state to allow new runs
   * 
   * @returns {Promise<number>} Number of stalled runs recovered
   */
  async recoverStalledRuns() {
    try {
      const result = await this.pool.query(
        `SELECT thread_id, current_run_id 
         FROM agent_threads 
         WHERE is_running = TRUE OR stop_requested = TRUE`
      );
      
      if (result.rows.length === 0) {
        console.log('[PostgresAgentRunner] No stalled runs to recover on startup');
        return 0;
      }
      
      console.log(`[PostgresAgentRunner] Found ${result.rows.length} stalled runs, recovering...`);
      
      for (const row of result.rows) {
        console.log(`[PostgresAgentRunner] Recovering stalled thread: ${row.thread_id}, run: ${row.current_run_id}`);
        
        // Mark run as 'stopped' (crash recovery)
        if (row.current_run_id) {
          await this.pool.query(
            `UPDATE agent_runs 
             SET status = 'stopped', 
                 completed_at = NOW(),
                 events = COALESCE(events, '[]'::jsonb)
             WHERE run_id = $1 AND status = 'running'`,
            [row.current_run_id]
          );
        }
        
        // Reset thread state
        await this.updateThreadState(row.thread_id, {
          is_running: false,
          current_run_id: null,
          stop_requested: false,
          last_accessed_at: new Date(),
        });
        
        this.metrics.runsInterrupted++;
      }
      
      console.log(`[PostgresAgentRunner] ✅ Recovered ${result.rows.length} stalled runs on startup`);
      return result.rows.length;
      
    } catch (error) {
      console.error(`[PostgresAgentRunner] Startup recovery error: ${error.message}`);
      return 0;
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




