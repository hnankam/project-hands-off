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
  private currentUserId: string | null = null;

  private normalizeSession(row: any): SessionMetadata {
    if (!row) {
      log('[SessionStorageDB:normalizeSession] ⚠️  Received null/undefined row');
      const now = Date.now();
      return {
        id: '',
        title: 'Untitled Session',
        timestamp: now,
        createdAt: now,
        userId: this.currentUserId || 'unknown',
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

    const timestamp = typeof row.timestamp === 'number' ? row.timestamp : Date.now();
    const createdAt = typeof row.createdAt === 'number' ? row.createdAt : timestamp;
    const userId = row.userId || this.currentUserId || 'unknown';

    if (!row.userId) {
      log('[SessionStorageDB:normalizeSession] ⚠️  Session missing userId, using fallback:', { sessionId: sessionId?.slice(0, 12), fallbackUserId: userId });
    }

    return {
      id: sessionId,
      title: row.title ?? 'Untitled Session',
      timestamp,
      createdAt,
      userId,
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
   * Set the current user ID for filtering sessions
   * Required for multi-user support - must be called before accessing sessions
   */
  setCurrentUserId(userId: string | null): void {
    const previousUserId = this.currentUserId;
    this.currentUserId = userId;
    
    if (previousUserId !== userId) {
      log('[SessionStorageDB:setCurrentUserId] 🔄 User ID changed:', { 
        from: previousUserId || 'null', 
        to: userId || 'null' 
      });
    } else {
      log('[SessionStorageDB:setCurrentUserId] ℹ️  User ID set (no change):', userId || 'null');
    }
  }

  /**
   * Get the current user ID
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
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
   * Only returns sessions for the currently logged in user (requires userId to be set)
   */
  async getAllSessions(): Promise<SessionMetadata[]> {
    if (!this.isInitialized) {
      log('[SessionStorageDB:getAllSessions] Not initialized yet, initializing now...');
      await this.initialize(false);
    }
    const worker = this.getWorker();
    
    // Require userId to be set
    if (!this.currentUserId) {
      log('[SessionStorageDB:getAllSessions] ⚠️  No userId set - returning empty array. Call setCurrentUserId() first.');
      return [];
    }
    
    log('[SessionStorageDB:getAllSessions] 🔍 Querying sessions for userId:', this.currentUserId);
    
    // Only return sessions matching the current user
    const query = 'SELECT * FROM session_metadata WHERE userId = $userId ORDER BY createdAt ASC;';
    const params = { userId: this.currentUserId };
    
    const result = await worker.query<any[]>(query, params);
    const rows = result[0] || [];
    
    const short = (value: unknown, fallback: string = 'unknown') => {
      if (typeof value === 'string') {
        return value.slice(0, 12);
      }
      if (value && typeof (value as any).id === 'string') {
        return (value as any).id.slice(0, 12);
      }
      try {
        const str = String(value ?? fallback);
        return str.slice(0, 12);
      } catch {
        return fallback;
      }
    };

    log(
      `[SessionStorageDB:getAllSessions] ✅ Found ${rows.length} sessions for user ${this.currentUserId}:`,
      rows.map((r: any) => ({
        id: short(r.id),
        sessionId: short(r.sessionId),
        title: r.title,
        userId: r.userId,
      })),
    );
    
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
   * Requires userId to be set (either in metadata or via setCurrentUserId)
   */
  async addSession(metadata: Omit<SessionMetadata, 'id' | 'timestamp' | 'createdAt'>): Promise<SessionMetadata> {
     const worker = this.getWorker();
 
    // Determine userId - prefer metadata.userId, fallback to currentUserId
    const userId = metadata.userId ?? this.currentUserId;
    
    // Require userId
    if (!userId) {
      const error = new Error('[SessionStorageDB:addSession] ❌ Cannot create session: userId is required. Call setCurrentUserId() first or pass userId in metadata.');
      log(error.message);
      throw error;
    }

    log('[SessionStorageDB:addSession] 📝 Creating new session:', {
      title: metadata.title,
      userId,
      selectedAgent: metadata.selectedAgent,
      selectedModel: metadata.selectedModel,
    });
 
    const sessionId = `session-${Date.now()}`;
    const now = Date.now();
    
    // Remove userId from metadata to avoid duplication
    const { userId: _metadataUserId, ...metadataWithoutUserId } = metadata;
    
    const newSessionRecord = {
      sessionId,
      id: sessionId,
      timestamp: now,
      createdAt: now,
      userId,
      ...metadataWithoutUserId,
    };
 
     // Deactivate all other sessions for this user only
     log('[SessionStorageDB:addSession] 🔄 Deactivating other sessions for user:', userId);
     await worker.query(
       'UPDATE session_metadata SET isActive = false WHERE isActive = true AND userId = $userId;', 
       { userId }
     );
 
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
 
    log('[SessionStorageDB:addSession] ✅ Successfully created new session:', {
      sessionId: sessionId.slice(0, 12) + '...',
      title: metadata.title,
      userId,
    });
    
    return this.normalizeSession(newSessionRecord);
  }

  /**
   * Set active session (LIGHTWEIGHT - no message data touched)
   * Only deactivates sessions for the same user
   */
  async setActiveSession(sessionId: string): Promise<void> {
    const worker = this.getWorker();

    log('[SessionStorageDB:setActiveSession] 🎯 Setting active session:', sessionId.slice(0, 12) + '...');

    // Verify session exists
    const session = await this.getSession(sessionId);
    if (!session) {
      const error = new Error(`[SessionStorageDB:setActiveSession] ❌ Session ${sessionId} not found`);
      log(error.message);
      throw error;
    }

    // Verify session belongs to current user
    if (this.currentUserId && session.userId !== this.currentUserId) {
      const error = new Error(`[SessionStorageDB:setActiveSession] ❌ Session ${sessionId} belongs to different user. Session userId: ${session.userId}, Current userId: ${this.currentUserId}`);
      log(error.message);
      throw error;
    }

    log('[SessionStorageDB:setActiveSession] ℹ️  Verified session:', {
      sessionId: sessionId.slice(0, 12) + '...',
      title: session.title,
      userId: session.userId,
    });

    // Update in a single transaction - only deactivate sessions for the same user
    if (this.currentUserId) {
      await worker.query(`
        UPDATE session_metadata SET isActive = false WHERE isActive = true AND userId = $userId;
        UPDATE session_metadata SET isActive = true, isOpen = true WHERE sessionId = $id OR id = $id;
      `, { id: sessionId, userId: this.currentUserId });
    } else {
    await worker.query(`
      UPDATE session_metadata SET isActive = false WHERE isActive = true;
      UPDATE session_metadata SET isActive = true, isOpen = true WHERE sessionId = $id OR id = $id;
    `, { id: sessionId });
    }

    // Update current session ID
    await this.setCurrentSessionId(sessionId);

    this.notify({ type: 'sessionChanged', sessionId });
    log('[SessionStorageDB:setActiveSession] ✅ Successfully set active session:', sessionId.slice(0, 12) + '...');
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
        if (!this.currentUserId) {
          log('[SessionStorageDB:closeSession] ⚠️  Cannot create new session: No userId set');
          return;
        }
        
        const adjectives = ['Quick', 'Bright', 'Smart', 'Swift', 'Creative'];
        const nouns = ['Task', 'Project', 'Query', 'Session', 'Work'];
        const title = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
        
        const newSession = await this.addSession({
          title,
          userId: this.currentUserId,
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
      'UPDATE session_metadata SET title = $title, timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
      { id: sessionId, title, timestamp: Date.now() }
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
      'UPDATE session_metadata SET selectedAgent = $agent, selectedModel = $model, timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
      { id: sessionId, agent, model, timestamp: Date.now() }
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

