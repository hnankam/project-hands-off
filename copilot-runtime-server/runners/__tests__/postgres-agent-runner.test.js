/**
 * Tests for PostgresAgentRunner
 * 
 * Tests cover:
 * - Thread creation and locking
 * - Run execution and event streaming
 * - Message persistence
 * - Connection and history replay
 * - Concurrent run prevention
 * - Stop functionality
 * - Cleanup and recovery
 * 
 * @module postgres-agent-runner.test
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { firstValueFrom, toArray } from 'rxjs';
import { PostgresAgentRunner } from '../postgres-agent-runner.js';
import { EventType } from '@ag-ui/client';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_DB_CONFIG = {
  connectionString: process.env.TEST_DATABASE_URL || 'postgresql://localhost/test_copilot_runtime',
  max: 5,
};

// ============================================================================
// Mock Agent
// ============================================================================

class MockAgent {
  constructor(events = []) {
    this.events = events;
    this.aborted = false;
  }
  
  async runAgent(input, callbacks) {
    if (this.events.length === 0) {
      // Default: emit simple run started/finished
      await callbacks.onEvent({
        event: {
          type: EventType.RUN_STARTED,
          runId: input.runId,
          input,
        }
      });
      
      await callbacks.onEvent({
        event: {
          type: EventType.RUN_FINISHED,
          runId: input.runId,
        }
      });
    } else {
      // Emit provided events
      for (const event of this.events) {
        if (this.aborted) break;
        await callbacks.onEvent({ event });
      }
    }
    
    if (callbacks.onRunStartedEvent) {
      callbacks.onRunStartedEvent();
    }
  }
  
  abortRun() {
    this.aborted = true;
  }
  
  clone() {
    return new MockAgent(this.events);
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

async function createTestPool() {
  const pool = new Pool(TEST_DB_CONFIG);
  
  // Verify connection
  try {
    await pool.query('SELECT NOW()');
  } catch (error) {
    console.error('Test database connection failed. Make sure test database exists.');
    throw error;
  }
  
  return pool;
}

async function cleanupTestData(pool) {
  await pool.query('DELETE FROM agent_messages');
  await pool.query('DELETE FROM agent_runs');
  await pool.query('DELETE FROM agent_threads');
}

function createMockRunRequest(threadId = 'test-thread-1', runId = 'test-run-1') {
  return {
    threadId,
    agent: new MockAgent(),
    input: {
      runId,
      threadId,
      messages: [{ id: 'msg-1', content: 'Hello', role: 'user' }],
      state: {},
      context: [],
      tools: [],
    },
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('PostgresAgentRunner', () => {
  let pool;
  let runner;
  
  beforeAll(async () => {
    pool = await createTestPool();
  });
  
  afterAll(async () => {
    await pool.end();
  });
  
  beforeEach(async () => {
    await cleanupTestData(pool);
    runner = new PostgresAgentRunner({ 
      pool,
      ttl: 60000, // 1 minute for tests
      cleanupInterval: 10000, // 10 seconds for tests
    });
  });
  
  afterEach(async () => {
    if (runner) {
      await runner.shutdown();
    }
  });
  
  // ==========================================================================
  // Thread Creation Tests
  // ==========================================================================
  
  describe('Thread Creation', () => {
    it('should create thread on first run', async () => {
      const request = createMockRunRequest();
      
      const observable = runner.run(request);
      
      await firstValueFrom(observable);
      
      const result = await pool.query(
        'SELECT * FROM agent_threads WHERE thread_id = $1',
        ['test-thread-1']
      );
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].thread_id).toBe('test-thread-1');
      expect(result.rows[0].is_running).toBe(false);
    });
    
    it('should create run record', async () => {
      const request = createMockRunRequest();
      
      const observable = runner.run(request);
      
      await firstValueFrom(observable);
      
      const result = await pool.query(
        'SELECT * FROM agent_runs WHERE run_id = $1',
        ['test-run-1']
      );
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].thread_id).toBe('test-thread-1');
      expect(result.rows[0].status).toBe('completed');
    });
  });
  
  // ==========================================================================
  // Concurrent Run Prevention Tests
  // ==========================================================================
  
  describe('Concurrent Run Prevention', () => {
    it('should prevent concurrent runs on same thread', async () => {
      const request1 = createMockRunRequest('test-thread-2', 'run-1');
      const request2 = createMockRunRequest('test-thread-2', 'run-2');
      
      // Start first run (but don't await)
      const obs1 = runner.run(request1);
      
      // Wait a bit to ensure first run is locked
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Try to start second run (should fail)
      await expect(async () => {
        const obs2 = runner.run(request2);
        await firstValueFrom(obs2);
      }).rejects.toThrow('Thread already running');
      
      // Complete first run
      await firstValueFrom(obs1);
    });
    
    it('should allow sequential runs on same thread', async () => {
      const request1 = createMockRunRequest('test-thread-3', 'run-1');
      const request2 = createMockRunRequest('test-thread-3', 'run-2');
      
      // Run first
      await firstValueFrom(runner.run(request1));
      
      // Run second (should succeed)
      await firstValueFrom(runner.run(request2));
      
      // Verify both runs exist
      const result = await pool.query(
        'SELECT * FROM agent_runs WHERE thread_id = $1 ORDER BY created_at',
        ['test-thread-3']
      );
      
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].run_id).toBe('run-1');
      expect(result.rows[1].run_id).toBe('run-2');
    });
  });
  
  // ==========================================================================
  // Event Streaming Tests
  // ==========================================================================
  
  describe('Event Streaming', () => {
    it('should stream events in real-time', async () => {
      const mockEvents = [
        { type: EventType.RUN_STARTED, runId: 'test-run-1' },
        { type: EventType.MESSAGE_CREATED, messageId: 'msg-1', message: { id: 'msg-1', content: 'Hello', role: 'user' } },
        { type: EventType.RUN_FINISHED, runId: 'test-run-1' },
      ];
      
      const request = createMockRunRequest();
      request.agent = new MockAgent(mockEvents);
      
      const observable = runner.run(request);
      const events = await firstValueFrom(observable.pipe(toArray()));
      
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].type).toBe(EventType.RUN_STARTED);
    });
  });
  
  // ==========================================================================
  // Message Persistence Tests
  // ==========================================================================
  
  describe('Message Persistence', () => {
    it('should persist messages to database', async () => {
      const mockEvents = [
        { type: EventType.RUN_STARTED, runId: 'test-run-1' },
        { 
          type: EventType.MESSAGE_CREATED, 
          messageId: 'msg-1', 
          message: { 
            id: 'msg-1', 
            content: 'Hello world', 
            role: 'user' 
          } 
        },
        { type: EventType.RUN_FINISHED, runId: 'test-run-1' },
      ];
      
      const request = createMockRunRequest();
      request.agent = new MockAgent(mockEvents);
      
      await firstValueFrom(runner.run(request));
      
      const result = await pool.query(
        'SELECT * FROM agent_messages WHERE thread_id = $1',
        ['test-thread-1']
      );
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].message_id).toBe('msg-1');
      expect(result.rows[0].content).toBe('Hello world');
      expect(result.rows[0].role).toBe('user');
    });
    
    it('should update existing messages', async () => {
      // First run: create message
      const mockEvents1 = [
        { type: EventType.RUN_STARTED, runId: 'run-1' },
        { 
          type: EventType.MESSAGE_CREATED, 
          messageId: 'msg-1', 
          message: { id: 'msg-1', content: 'Initial', role: 'assistant' } 
        },
        { type: EventType.RUN_FINISHED, runId: 'run-1' },
      ];
      
      const request1 = createMockRunRequest('thread-1', 'run-1');
      request1.agent = new MockAgent(mockEvents1);
      await firstValueFrom(runner.run(request1));
      
      // Second run: update message
      const mockEvents2 = [
        { type: EventType.RUN_STARTED, runId: 'run-2' },
        { 
          type: EventType.MESSAGE_UPDATED, 
          messageId: 'msg-1', 
          message: { content: 'Updated' } 
        },
        { type: EventType.RUN_FINISHED, runId: 'run-2' },
      ];
      
      const request2 = createMockRunRequest('thread-1', 'run-2');
      request2.agent = new MockAgent(mockEvents2);
      await firstValueFrom(runner.run(request2));
      
      // Verify message was updated
      const result = await pool.query(
        'SELECT * FROM agent_messages WHERE message_id = $1',
        ['msg-1']
      );
      
      expect(result.rows[0].content).toBe('Updated');
    });
    
    it('should retrieve thread messages', async () => {
      // Create some messages
      await pool.query(
        `INSERT INTO agent_threads (thread_id, user_id) VALUES ($1, $2)`,
        ['thread-1', 'user-1']
      );
      
      await pool.query(
        `INSERT INTO agent_messages (message_id, thread_id, role, content) 
         VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
        ['msg-1', 'thread-1', 'user', 'Hello', 'msg-2', 'thread-1', 'assistant', 'Hi']
      );
      
      const messages = await runner.getThreadMessages('thread-1');
      
      expect(messages.length).toBe(2);
      expect(messages[0].id).toBe('msg-1');
      expect(messages[1].id).toBe('msg-2');
    });
  });
  
  // ==========================================================================
  // Connection Tests
  // ==========================================================================
  
  describe('Connection', () => {
    it('should return empty for non-existent thread', async () => {
      const observable = runner.connect({ threadId: 'non-existent' });
      const events = await firstValueFrom(observable.pipe(toArray()));
      
      expect(events.length).toBe(0);
    });
    
    it('should replay historic events', async () => {
      // Run agent first
      const request = createMockRunRequest();
      await firstValueFrom(runner.run(request));
      
      // Connect to thread
      const observable = runner.connect({ threadId: 'test-thread-1' });
      const events = await firstValueFrom(observable.pipe(toArray()));
      
      expect(events.length).toBeGreaterThan(0);
    });
  });
  
  // ==========================================================================
  // Status Check Tests
  // ==========================================================================
  
  describe('Status Checks', () => {
    it('should return false for non-existent thread', async () => {
      const isRunning = await runner.isRunning({ threadId: 'non-existent' });
      expect(isRunning).toBe(false);
    });
    
    it('should return false for completed thread', async () => {
      const request = createMockRunRequest();
      await firstValueFrom(runner.run(request));
      
      const isRunning = await runner.isRunning({ threadId: 'test-thread-1' });
      expect(isRunning).toBe(false);
    });
  });
  
  // ==========================================================================
  // Stop Tests
  // ==========================================================================
  
  describe('Stop Functionality', () => {
    it('should return false for non-existent thread', async () => {
      const stopped = await runner.stop({ threadId: 'non-existent' });
      expect(stopped).toBe(false);
    });
    
    it('should return false for already completed thread', async () => {
      const request = createMockRunRequest();
      await firstValueFrom(runner.run(request));
      
      const stopped = await runner.stop({ threadId: 'test-thread-1' });
      expect(stopped).toBe(false);
    });
  });
  
  // ==========================================================================
  // Recovery Tests
  // ==========================================================================
  
  describe('Recovery', () => {
    it('should recover stalled runs', async () => {
      // Manually create a stalled thread
      await pool.query(
        `INSERT INTO agent_threads (thread_id, user_id, is_running, current_run_id) 
         VALUES ($1, $2, $3, $4)`,
        ['stalled-thread', 'user-1', true, 'stalled-run']
      );
      
      await pool.query(
        `INSERT INTO agent_runs (run_id, thread_id, status) 
         VALUES ($1, $2, $3)`,
        ['stalled-run', 'stalled-thread', 'running']
      );
      
      // Run recovery
      await runner.recoverStalledRuns();
      
      // Verify thread is no longer running
      const threadResult = await pool.query(
        'SELECT is_running FROM agent_threads WHERE thread_id = $1',
        ['stalled-thread']
      );
      expect(threadResult.rows[0].is_running).toBe(false);
      
      // Verify run is marked as stopped
      const runResult = await pool.query(
        'SELECT status FROM agent_runs WHERE run_id = $1',
        ['stalled-run']
      );
      expect(runResult.rows[0].status).toBe('stopped');
    });
  });
  
  // ==========================================================================
  // Metrics Tests
  // ==========================================================================
  
  describe('Metrics', () => {
    it('should track run metrics', async () => {
      const request = createMockRunRequest();
      await firstValueFrom(runner.run(request));
      
      const metrics = runner.getMetrics();
      
      expect(metrics.runsStarted).toBe(1);
      expect(metrics.runsCompleted).toBe(1);
      expect(metrics.runsFailed).toBe(0);
    });
  });
  
  // ==========================================================================
  // Cleanup Tests
  // ==========================================================================
  
  describe('Cleanup', () => {
    it('should cleanup stale threads', async () => {
      // Create an old thread
      await pool.query(
        `INSERT INTO agent_threads (thread_id, user_id, is_running, last_accessed_at) 
         VALUES ($1, $2, $3, NOW() - INTERVAL '2 minutes')`,
        ['old-thread', 'user-1', false]
      );
      
      // Run cleanup (TTL is 1 minute)
      await runner.cleanupStaleThreads();
      
      // Verify thread was deleted
      const result = await pool.query(
        'SELECT * FROM agent_threads WHERE thread_id = $1',
        ['old-thread']
      );
      
      expect(result.rows.length).toBe(0);
    });
  });
});

