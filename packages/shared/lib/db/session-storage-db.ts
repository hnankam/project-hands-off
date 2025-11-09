/**
 * Session Storage Database Service
 * 
 * High-performance session management using SurrealDB/IndexedDB
 * Replaces chrome.storage.local for session data to avoid massive writes
 */

import type { DBWorkerClient } from './db-worker-client.js';
import { initializeSessionSchema, type SessionMetadata, type SessionMessages, type SessionUsageStats, type SessionAgentState } from './session-schema.js';

// Debug logging
const DEBUG = true;
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const log = (...args: any[]) => DEBUG && console.log(ts(), ...args);

/**
 * Event types for subscription
 */
export type SessionStorageEvent =
  | { type: 'sessionChanged'; sessionId: string }
  | { type: 'sessionsUpdated' }
  | { type: 'messagesUpdated'; sessionId: string };

type SessionStorageListener = (event: SessionStorageEvent) => void;

/**
 * Session Storage Database Manager
 */
export class SessionStorageDB {
  private worker: DBWorkerClient | null = null;
  private isInitialized = false;
  private initializePromise: Promise<void> | null = null;
  private listeners = new Set<SessionStorageListener>();

  private normalizeSession(row: any): SessionMetadata {
    if (!row) {
      return {
        id: '',
        title: 'Untitled Session',
        timestamp: Date.now(),
        isActive: false,
        isOpen: true,
      };
    }

    const sessionId = typeof row.sessionId === 'string'
      ? row.sessionId
      : typeof row.id === 'string'
        ? row.id
        : typeof row.id === 'object' && row.id?.id
          ? String(row.id.id)
          : '';

    return {
      id: sessionId,
      title: row.title ?? 'Untitled Session',
      timestamp: typeof row.timestamp === 'number' ? row.timestamp : Date.now(),
      isActive: Boolean(row.isActive),
      isOpen: row.isOpen !== false,
      selectedAgent: row.selectedAgent ?? undefined,
      selectedModel: row.selectedModel ?? undefined,
    };
  }

  /**
   * Set the DB worker client
   */
  setWorker(worker: DBWorkerClient): void {
    this.worker = worker;
  }

  /**
   * Get worker (throws if not set)
   */
  private getWorker(): DBWorkerClient {
    if (!this.worker) {
      throw new Error('[SessionStorageDB] Worker not set. Call setWorker() first.');
    }
    return this.worker;
  }

  /**
   * Initialize the database and schema
   */
  async initialize(useMemory = false): Promise<void> {
    if (this.isInitialized) {
      log('[SessionStorageDB] Already initialized');
      return;
    }

    if (this.initializePromise) {
      log('[SessionStorageDB] Initialization already in progress, waiting...');
      await this.initializePromise;
      return;
    }

    const worker = this.getWorker();

    this.initializePromise = (async () => {
      try {
        // Initialize worker if not already done
        await worker.initialize(useMemory);

        // Set up schema
        await initializeSessionSchema(worker);

        this.isInitialized = true;
        log('[SessionStorageDB] ✅ Initialized successfully');
      } catch (error) {
        console.error('[SessionStorageDB] ❌ Failed to initialize:', error);
        throw error;
      } finally {
        this.initializePromise = null;
      }
    })();

    await this.initializePromise;
  }

  /**
   * Subscribe to storage events
   */
  subscribe(listener: SessionStorageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners
   */
  private notify(event: SessionStorageEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[SessionStorageDB] Listener error:', error);
      }
    });
  }

  // ========================================
  // Session Metadata Operations
  // ========================================

  /**
   * Get all session metadata (lightweight)
   */
  async getAllSessions(): Promise<SessionMetadata[]> {
    if (!this.isInitialized) {
      log('[SessionStorageDB] Not initialized yet, initializing now...');
      await this.initialize(false);
    }
    const worker = this.getWorker();
    log('[SessionStorageDB] Querying all sessions from database...');
    const result = await worker.query<any[]>(
      'SELECT * FROM session_metadata ORDER BY timestamp ASC;'
    );
    const rows = result[0] || [];
    log(`[SessionStorageDB] ✅ Found ${rows.length} sessions in database:`, rows.map((r: any) => ({ id: r.id, sessionId: r.sessionId, title: r.title })));
    return rows.map((row: any) => this.normalizeSession(row));
  }

  /**
   * Get single session metadata
   */
  async getSession(sessionId: string): Promise<SessionMetadata | null> {
     const worker = this.getWorker();
     log(`[AGENT_MODEL_SYNC] 📥 DB QUERY - Getting session metadata for ${sessionId}...`);
     const result = await worker.query<any[]>(
      'SELECT * FROM session_metadata WHERE sessionId = $sessionId OR id = $sessionId LIMIT 1;',
      { sessionId }
    );
    if (!result[0]?.length) {
      log(`[AGENT_MODEL_SYNC] ⚠️ DB QUERY - No metadata found for session ${sessionId}`);
      return null;
    }
    const normalized = this.normalizeSession(result[0][0]);
    log(`[AGENT_MODEL_SYNC] ✅ DB QUERY RESULT for session ${sessionId}:`, {
      agent: normalized.selectedAgent,
      model: normalized.selectedModel,
    });
    return normalized;
  }

  /**
   * Get all open sessions
   */
  async getOpenSessions(): Promise<SessionMetadata[]> {
     const worker = this.getWorker();
     const result = await worker.query<any[]>(
       'SELECT * FROM session_metadata WHERE isOpen = true ORDER BY timestamp ASC;'
     );
    const rows = result[0] || [];
    return rows.map((row: any) => this.normalizeSession(row));
  }

  /**
   * Get current active session ID
   */
  async getCurrentSessionId(): Promise<string | null> {
    if (!this.isInitialized) {
      log('[SessionStorageDB] Not initialized yet, initializing now...');
      await this.initialize(false);
    }
    const worker = this.getWorker();
    const result = await worker.query<any[]>(
      'SELECT sessionId FROM current_session LIMIT 1;'
    );
    return result[0]?.[0]?.sessionId || null;
  }

  /**
   * Add a new session
   */
  async addSession(metadata: Omit<SessionMetadata, 'id' | 'timestamp'>): Promise<SessionMetadata> {
     const worker = this.getWorker();
 
    const sessionId = `session-${Date.now()}`;
    const newSessionRecord = {
      sessionId,
      id: sessionId,
      timestamp: Date.now(),
      ...metadata,
    };
 
     // Deactivate all other sessions
     await worker.query('UPDATE session_metadata SET isActive = false WHERE isActive = true;');
 
    // Create new session metadata
    await worker.query(
      'CREATE session_metadata CONTENT $newSession;',
      { newSession: newSessionRecord }
    );
 
     // Set as current session
    await this.setCurrentSessionId(sessionId);
 
     // Initialize empty message array
     await worker.query(
       'CREATE session_messages CONTENT { sessionId: $id, messages: [] };',
      { id: sessionId }
    );
 
    this.notify({ type: 'sessionsUpdated' });
    this.notify({ type: 'sessionChanged', sessionId });
 
    log('[SessionStorageDB] ✅ Created new session:', sessionId);
    return this.normalizeSession(newSessionRecord);
  }

  /**
   * Set active session (LIGHTWEIGHT - no message data touched)
   */
  async setActiveSession(sessionId: string): Promise<void> {
    const worker = this.getWorker();

    // Verify session exists
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update in a single transaction
    await worker.query(`
      UPDATE session_metadata SET isActive = false WHERE isActive = true;
      UPDATE session_metadata SET isActive = true, isOpen = true WHERE sessionId = $id OR id = $id;
    `, { id: sessionId });

    // Update current session ID
    await this.setCurrentSessionId(sessionId);

    this.notify({ type: 'sessionChanged', sessionId });
    log('[SessionStorageDB] ✅ Set active session:', sessionId);
  }

  /**
   * Close a session (mark as not open)
   */
  async closeSession(sessionId: string): Promise<void> {
    const worker = this.getWorker();

    await worker.query(
      'UPDATE session_metadata SET isOpen = false, isActive = false WHERE sessionId = $id OR id = $id;',
      { id: sessionId }
    );

    // If this was the current session, find a new one
    const currentId = await this.getCurrentSessionId();
    if (currentId === sessionId) {
      const openSessions = await this.getOpenSessions();
      if (openSessions.length > 0) {
        await this.setActiveSession(openSessions[0].id);
      } else {
        // No open sessions - create a new one
        const adjectives = ['Quick', 'Bright', 'Smart', 'Swift', 'Creative'];
        const nouns = ['Task', 'Project', 'Query', 'Session', 'Work'];
        const title = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
        
        const newSession = await this.addSession({
          title,
          isActive: true,
          isOpen: true,
        });
        await this.setCurrentSessionId(newSession.id);
      }
    }

    this.notify({ type: 'sessionsUpdated' });
    log('[SessionStorageDB] ✅ Closed session:', sessionId);
  }

  /**
   * Open all sessions
   */
  async openAllSessions(): Promise<void> {
    const worker = this.getWorker();
    await worker.query('UPDATE session_metadata SET isOpen = true;');
    this.notify({ type: 'sessionsUpdated' });
    log('[SessionStorageDB] ✅ Opened all sessions');
  }

  /**
   * Delete a session and all its data
   */
  async deleteSession(sessionId: string): Promise<void> {
    const worker = this.getWorker();

    // Delete from all tables
    await worker.query(`
      DELETE FROM session_metadata WHERE sessionId = $id OR id = $id;
      DELETE FROM session_messages WHERE sessionId = $id;
      DELETE FROM session_usage WHERE sessionId = $id;
      DELETE FROM session_agent_state WHERE sessionId = $id;
    `, { id: sessionId });

    // If this was the current session, set a new one
    const currentId = await this.getCurrentSessionId();
    if (currentId === sessionId) {
      const sessions = await this.getAllSessions();
      if (sessions.length > 0) {
        await this.setActiveSession(sessions[0].id);
      } else {
        await this.setCurrentSessionId(null);
      }
    }

    this.notify({ type: 'sessionsUpdated' });
    log('[SessionStorageDB] ✅ Deleted session:', sessionId);
  }

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const worker = this.getWorker();
    await worker.query(
      'UPDATE session_metadata SET title = $title WHERE sessionId = $id OR id = $id;',
      { id: sessionId, title }
    );
    this.notify({ type: 'sessionsUpdated' });
  }

  /**
   * Update session agent and model
   */
  async updateSessionAgentAndModel(sessionId: string, agent: string, model: string): Promise<void> {
    const worker = this.getWorker();
    log(`[AGENT_MODEL_SYNC] 💾 DB UPDATE - Updating agent/model for session ${sessionId}:`, { agent, model });
    const result = await worker.query(
      'UPDATE session_metadata SET selectedAgent = $agent, selectedModel = $model WHERE sessionId = $id OR id = $id;',
      { id: sessionId, agent, model }
    );
    log(`[AGENT_MODEL_SYNC] ✅ DB UPDATE RESULT for session ${sessionId}:`, result);
    // REMOVED: this.notify({ type: 'sessionsUpdated' }); 
    // This notification was causing a feedback loop - the component saves, which triggers notification,
    // which updates currentSession prop, which triggers another save
  }

  // ========================================
  // Session Messages Operations
  // ========================================

  /**
   * Get all messages for a session
   */
  async getMessages(sessionId: string): Promise<any[]> {
    const worker = this.getWorker();
    const result = await worker.query<any[]>(
      'SELECT messages FROM session_messages WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );
    return result[0]?.[0]?.messages || [];
  }

  /**
   * Update messages for a session
   */
  async updateMessages(sessionId: string, messages: any[]): Promise<void> {
    const worker = this.getWorker();
    
    // Upsert: update if exists, create if not
    const existing = await worker.query<any[]>(
      'SELECT * FROM session_messages WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );

    if (existing[0]?.length > 0) {
      await worker.query(
        'UPDATE session_messages SET messages = $messages WHERE sessionId = $id;',
        { id: sessionId, messages }
      );
    } else {
      await worker.query(
        'CREATE session_messages CONTENT { sessionId: $id, messages: $messages };',
        { id: sessionId, messages }
      );
    }

    // Update session timestamp to reflect latest activity
    await worker.query(
      'UPDATE session_metadata SET timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
      { id: sessionId, timestamp: Date.now() }
    );

    this.notify({ type: 'messagesUpdated', sessionId });
    this.notify({ type: 'sessionsUpdated' });
    log(`[SessionStorageDB] ✅ Updated ${messages.length} messages for session:`, sessionId);
  }

  // ========================================
  // Usage Stats Operations
  // ========================================

  /**
   * Get usage stats for a session
   */
  async getUsageStats(sessionId: string): Promise<SessionUsageStats | null> {
    const worker = this.getWorker();
    const result = await worker.query<any[]>(
      'SELECT * FROM session_usage WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );
    return (result[0]?.[0] || null) as SessionUsageStats | null;
  }

  /**
   * Update usage stats for a session
   */
  async updateUsageStats(sessionId: string, stats: Omit<SessionUsageStats, 'sessionId'>): Promise<void> {
    const worker = this.getWorker();
    
    const existing = await worker.query<any[]>(
      'SELECT * FROM session_usage WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );

    const payload = {
      req: stats.request,
      res: stats.response,
      tot: stats.total,
      cnt: stats.requestCount,
    } as {
      req: number;
      res: number;
      tot: number;
      cnt: number;
      last?: SessionUsageStats['lastUsage'];
    };
    const hasLastUsage = stats.lastUsage != null;
    if (hasLastUsage) {
      payload.last = stats.lastUsage!;
    }

    if (existing[0]?.length > 0) {
      if (hasLastUsage) {
      await worker.query(
        'UPDATE session_usage SET request = $req, response = $res, total = $tot, requestCount = $cnt, lastUsage = $last WHERE sessionId = $id;',
        { id: sessionId, ...payload }
      );
    } else {
        await worker.query(
          'UPDATE session_usage SET request = $req, response = $res, total = $tot, requestCount = $cnt, lastUsage = NONE WHERE sessionId = $id;',
          { id: sessionId, ...payload }
        );
      }
    } else {
      if (hasLastUsage) {
      await worker.query(
        'CREATE session_usage CONTENT { sessionId: $id, request: $req, response: $res, total: $tot, requestCount: $cnt, lastUsage: $last };',
        { id: sessionId, ...payload }
      );
      } else {
        await worker.query(
          'CREATE session_usage CONTENT { sessionId: $id, request: $req, response: $res, total: $tot, requestCount: $cnt };',
          { id: sessionId, ...payload }
        );
      }
    }

    // Update session timestamp to reflect latest activity
    await worker.query(
      'UPDATE session_metadata SET timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
      { id: sessionId, timestamp: Date.now() }
    );

    this.notify({ type: 'sessionsUpdated' });
  }

  // ========================================
  // Agent State Operations
  // ========================================

  /**
   * Get agent state for a session
   */
  async getAgentState(sessionId: string): Promise<SessionAgentState | null> {
    const worker = this.getWorker();
    const result = await worker.query<any[]>(
      'SELECT * FROM session_agent_state WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );
    return (result[0]?.[0] || null) as SessionAgentState | null;
  }

  /**
   * Update agent state for a session
   */
  async updateAgentState(sessionId: string, state: Omit<SessionAgentState, 'sessionId'>): Promise<void> {
    const worker = this.getWorker();
    
    const existing = await worker.query<any[]>(
      'SELECT * FROM session_agent_state WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );

    if (existing[0]?.length > 0) {
      await worker.query(
        'UPDATE session_agent_state SET steps = $steps WHERE sessionId = $id;',
        { id: sessionId, steps: state.steps }
      );
    } else {
      await worker.query(
        'CREATE session_agent_state CONTENT { sessionId: $id, steps: $steps };',
        { id: sessionId, steps: state.steps }
      );
    }
  }

  // ========================================
  // Current Session Operations
  // ========================================

  /**
   * Set current session ID
   */
  private async setCurrentSessionId(sessionId: string | null): Promise<void> {
    const worker = this.getWorker();
    
    // Delete all existing records and create a new one (single record table)
    await worker.query(`
      DELETE current_session;
      CREATE current_session CONTENT { sessionId: $sid };
    `, { sid: sessionId });
  }
}

// Export singleton instance
export const sessionStorageDB = new SessionStorageDB();

