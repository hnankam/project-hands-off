/**
 * Session Storage Database Service
 * 
 * High-performance session management using SurrealDB/IndexedDB
 * Replaces chrome.storage.local for session data to avoid massive writes
 */

import type { DBWorkerClient } from './db-worker-client.js';
import { initializeSessionSchema, type SessionMetadata, type SessionMessages, type SessionUsageStats, type SessionAgentState } from './session-schema.js';
import { debug } from '../utils/debug.js';

// Helper to maintain compatibility with existing log calls
const log = (...args: any[]) => debug.log(...args);

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
  private syncKeyPrefix = 'session_storage_sync_';
  private windowId: string; // Unique ID for this window instance to filter self-notifications
  
  // Short-lived cache for getSession to prevent redundant DB queries during rapid access
  private sessionCache: Map<string, { data: SessionMetadata | null; timestamp: number }> = new Map();
  private readonly SESSION_CACHE_TTL = 3000; // 3 second cache TTL (increased from 2000ms for faster tab switches)
  
  // Notification batching to prevent spam
  private notificationBatchTimer: NodeJS.Timeout | null = null;
  private pendingNotifications = new Set<string>(); // Track event types to batch
  private readonly NOTIFICATION_BATCH_DELAY = 100; // Batch notifications within 100ms window
  
  constructor() {
    // Generate a unique window ID for this instance to filter self-notifications
    this.windowId = `window_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    log('[SessionStorageDB] 🪟 Window ID initialized:', this.windowId);
  }
  
  /**
   * Clear session cache entry (call after writes)
   */
  private invalidateSessionCache(sessionId: string): void {
    this.sessionCache.delete(sessionId);
  }
  
  /**
   * Clear entire session cache
   */
  private clearSessionCache(): void {
    this.sessionCache.clear();
  }
  
  private computeMessageSignature(messages: any[]): string {
    try {
      return JSON.stringify(messages ?? []);
    } catch (error) {
      log('[SessionStorageDB] Failed to compute message signature, falling back to length:', error);
      return `len:${Array.isArray(messages) ? messages.length : 0}`;
    }
  }

  private normalizeSession(row: any): SessionMetadata {
    if (!row) {
      log('[SessionStorageDB:normalizeSession] Received null/undefined row');
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
      log('[SessionStorageDB:normalizeSession] Session missing userId, using fallback:', { sessionId: sessionId?.slice(0, 12), fallbackUserId: userId });
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
      // Plan expanded state may be stored as boolean or integer (1/0)
      planExpanded: typeof row.planExpanded === 'boolean'
        ? row.planExpanded
        : typeof row.planExpanded === 'number'
          ? row.planExpanded === 1
          : undefined,
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
      log('[SessionStorageDB:setCurrentUserId] User ID changed:', { 
        from: previousUserId || 'null', 
        to: userId || 'null' 
      });
      // Notify listeners so UI can refetch sessions for the new user immediately
      // This avoids transient empty states before ensureCurrentSessionForActiveUser completes
      try {
        this.notify({ type: 'sessionsUpdated' });
      } catch (e) {
        // Best-effort; do not throw
      }
    } else {
      log('[SessionStorageDB:setCurrentUserId] User ID set (no change):', userId || 'null');
    }

    // When switching users, ensure the persisted current session belongs to the new user
    if (previousUserId !== userId) {
      void this.ensureCurrentSessionForActiveUser();
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
        log('[SessionStorageDB] Initialized successfully');
      } catch (error) {
        log('[SessionStorageDB] Failed to initialize:', error);
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
        debug.error('[SessionStorageDB] Listener error:', error);
      }
    });
    
    // Also notify other windows via chrome.storage.local (cross-window sync)
    this.notifyOtherWindows(event);
  }

  /**
   * Notify other windows of changes via chrome.storage.local (batched)
   * This enables real-time sync across side panel, popup, and tabless windows
   */
  private async notifyOtherWindows(event: SessionStorageEvent): Promise<void> {
    // Only sync if chrome.storage is available (Chrome extension context)
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    // Add to pending notifications
    this.pendingNotifications.add(event.type);
    
    // If timer already exists, just accumulate events
    if (this.notificationBatchTimer) {
      return;
    }
    
    // Start batch timer
    this.notificationBatchTimer = setTimeout(async () => {
      this.notificationBatchTimer = null;
      
      // Get unique event types to send
      const eventsToSend = Array.from(this.pendingNotifications);
      this.pendingNotifications.clear();
      
      try {
        // Send batched notifications
        for (const eventType of eventsToSend) {
          const syncKey = `${this.syncKeyPrefix}${eventType}`;
          const sessionId = eventType === 'sessionChanged' || eventType === 'messagesUpdated' 
            ? (event as any).sessionId 
            : undefined;
          
          const syncData = {
            timestamp: Date.now(),
            event: eventType,
            sessionId,
            userId: this.currentUserId,
            windowId: this.windowId,
          };

          await chrome.storage.local.set({ [syncKey]: syncData });
          
          // Log only if multiple events or specific sessionId
          if (eventsToSend.length > 1 || sessionId) {
            const logData = {
              event: eventType,
              sessionId: sessionId ? sessionId.slice(0, 8) : 'all',
              batched: eventsToSend.length > 1 ? eventsToSend.length : undefined,
            };
            log('[SessionStorageDB] Cross-window sync sent:', logData);
          }
        }
      } catch (error) {
        // Silently fail - cross-window sync is best-effort
        log('[SessionStorageDB] Failed to send cross-window sync:', error);
      }
    }, this.NOTIFICATION_BATCH_DELAY);
  }

  /**
   * Get the window ID for this instance
   */
  getWindowId(): string {
    return this.windowId;
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
      log('[SessionStorageDB:getAllSessions] No userId set - returning empty array. Call setCurrentUserId() first.');
      return [];
    }
    
    log('[SessionStorageDB:getAllSessions] Querying sessions for userId:', this.currentUserId);
    
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

    // Reduced logging - only log count, not full session list (reduces noise)
    log(`[SessionStorageDB:getAllSessions] Found ${rows.length} sessions for user ${this.currentUserId}`);
    
    return rows.map((row: any) => this.normalizeSession(row));
  }

  /**
   * Get single session metadata
   * Uses short-lived cache to prevent redundant DB queries during rapid access
   */
  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    // Check cache first
    const cached = this.sessionCache.get(sessionId);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < this.SESSION_CACHE_TTL) {
      // Return cached result (cache hit - no DB query needed)
      // Commented out to reduce log noise - cache hits are very frequent
      // log(`[AGENT_MODEL_SYNC] CACHE HIT for session ${sessionId.slice(0, 8)} (age: ${now - cached.timestamp}ms)`);
      return cached.data;
    }
    
     const worker = this.getWorker();
     log(`[AGENT_MODEL_SYNC] DB QUERY - Getting session metadata for ${sessionId.slice(0, 8)}...`);
     const result = await worker.query<any[]>(
      'SELECT * FROM session_metadata WHERE sessionId = $sessionId OR id = $sessionId LIMIT 1;',
      { sessionId }
    );
    if (!result[0]?.length) {
      log(`[AGENT_MODEL_SYNC] DB QUERY - No metadata found for session ${sessionId.slice(0, 8)}`);
      // Cache the null result too
      this.sessionCache.set(sessionId, { data: null, timestamp: now });
      return null;
    }
    const normalized = this.normalizeSession(result[0][0]);
    log(`[AGENT_MODEL_SYNC] DB QUERY RESULT for session ${sessionId.slice(0, 8)}:`, {
      agent: normalized.selectedAgent,
      model: normalized.selectedModel,
    });
    
    // Cache the result
    this.sessionCache.set(sessionId, { data: normalized, timestamp: now });
    return normalized;
  }

  /**
   * Get all open sessions
   */
  async getOpenSessions(): Promise<SessionMetadata[]> {
    const worker = this.getWorker();
    const query = this.currentUserId
      ? 'SELECT * FROM session_metadata WHERE isOpen = true AND userId = $userId ORDER BY timestamp ASC;'
      : 'SELECT * FROM session_metadata WHERE isOpen = true ORDER BY timestamp ASC;';
    const params = this.currentUserId ? { userId: this.currentUserId } : {};
    const result = await worker.query<any[]>(query, params);
    const rows = result[0] || [];
    return rows
      .map((row: any) => this.normalizeSession(row))
      .filter((session: SessionMetadata) => !this.currentUserId || session.userId === this.currentUserId);
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
    
    try {
    const result = await worker.query<any[]>(
      'SELECT sessionId FROM current_session LIMIT 1;'
    );
    const currentId = result[0]?.[0]?.sessionId || null;

      // If sessionId is null or empty string, treat as no current session
      // This handles cases where the record exists but has NULL sessionId (shouldn't happen after fix, but handle gracefully)
      if (!currentId || currentId === null || currentId === 'null') {
        // Clean up invalid record if it exists
        try {
          await worker.query('DELETE current_session WHERE sessionId IS NONE OR sessionId IS NULL;');
        } catch (cleanupError) {
          // Ignore cleanup errors - record might not exist
          log('[SessionStorageDB:getCurrentSessionId] Cleanup query failed (non-critical):', cleanupError);
        }
        return null;
      }

      if (!this.currentUserId) {
        return currentId;
    }

    const session = await this.getSession(currentId);
    if (!session) {
      log('[SessionStorageDB:getCurrentSessionId] Stored current session not found, clearing pointer');
      await this.setCurrentSessionId(null);
      return null;
    }

    if (session.userId !== this.currentUserId) {
      log('[SessionStorageDB:getCurrentSessionId] Current session belongs to different user. Clearing and selecting fallback.', {
        storedSessionId: currentId.slice(0, 12) + '...',
        sessionUserId: session.userId,
        currentUserId: this.currentUserId,
      });
      await this.setCurrentSessionId(null);
      const sessions = await this.getAllSessions();
      if (sessions.length > 0) {
        await this.setActiveSession(sessions[0].id);
        return sessions[0].id;
      }
      return null;
    }

    return session.id;
    } catch (error: any) {
      // Handle database errors gracefully (e.g., NULL sessionId in record)
      log('[SessionStorageDB:getCurrentSessionId] Error getting current session ID:', error?.message || error);
      
      // If error is about NULL sessionId, try to clean up the invalid record
      if (error?.message?.includes('NULL') || error?.message?.includes('null')) {
        try {
          await worker.query('DELETE current_session WHERE sessionId IS NONE OR sessionId IS NULL;');
        } catch (cleanupError) {
          // Ignore cleanup errors
          log('[SessionStorageDB:getCurrentSessionId] Cleanup after error failed (non-critical):', cleanupError);
        }
      }
      
      return null;
    }
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
      const error = new Error('[SessionStorageDB:addSession] Cannot create session: userId is required. Call setCurrentUserId() first or pass userId in metadata.');
      log(error.message);
      throw error;
    }

    log('[SessionStorageDB:addSession] Creating new session:', {
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
     log('[SessionStorageDB:addSession] Deactivating other sessions for user:', userId);
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
 
    log('[SessionStorageDB:addSession] Successfully created new session:', {
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

    log('[SessionStorageDB:setActiveSession] Setting active session:', sessionId.slice(0, 12) + '...');

    // Verify session exists
    const session = await this.getSession(sessionId);
    if (!session) {
      const error = new Error(`[SessionStorageDB:setActiveSession] Session ${sessionId} not found`);
      log(error.message);
      throw error;
    }

    // Verify session belongs to current user
    if (this.currentUserId && session.userId !== this.currentUserId) {
      const error = new Error(`[SessionStorageDB:setActiveSession] Session ${sessionId} belongs to different user. Session userId: ${session.userId}, Current userId: ${this.currentUserId}`);
      log(error.message);
      throw error;
    }

    log('[SessionStorageDB:setActiveSession] Verified session:', {
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
    log('[SessionStorageDB:setActiveSession] Successfully set active session:', sessionId.slice(0, 12) + '...');
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
          log('[SessionStorageDB:closeSession] Cannot create new session: No userId set');
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
    log('[SessionStorageDB] Closed session:', sessionId);
  }

  /**
   * Open all sessions
   */
  async openAllSessions(): Promise<void> {
    const worker = this.getWorker();
    await worker.query('UPDATE session_metadata SET isOpen = true;');
    this.notify({ type: 'sessionsUpdated' });
    log('[SessionStorageDB] Opened all sessions');
  }

  /**
   * Delete a session and all its data
   */
  async deleteSession(sessionId: string): Promise<void> {
    const worker = this.getWorker();

    // Check if this is the current session BEFORE deleting
    const currentId = await this.getCurrentSessionId();
    const isCurrentSession = currentId === sessionId;

    // Delete from all tables
    await worker.query(`
      DELETE FROM session_metadata WHERE sessionId = $id OR id = $id;
      DELETE FROM session_messages WHERE sessionId = $id;
      DELETE FROM session_usage WHERE sessionId = $id;
      DELETE FROM session_agent_state WHERE sessionId = $id;
    `, { id: sessionId });

    // If this was the current session, set a new one
    if (isCurrentSession) {
      const sessions = await this.getAllSessions();
      if (sessions.length > 0) {
        await this.setActiveSession(sessions[0].id);
      } else {
        // No sessions left - clear current session pointer
        await this.setCurrentSessionId(null);
      }
    }

    // Notify listeners to update UI
    this.notify({ type: 'sessionsUpdated' });
    log('[SessionStorageDB] Deleted session:', sessionId);
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
    this.invalidateSessionCache(sessionId);
    this.notify({ type: 'sessionsUpdated' });
  }

  /**
   * Update session agent and model
   */
  async updateSessionAgentAndModel(sessionId: string, agent: string, model: string): Promise<void> {
    const worker = this.getWorker();
    log(`[AGENT_MODEL_SYNC] DB UPDATE - Updating agent/model for session ${sessionId}:`, { agent, model });
    const result = await worker.query(
      'UPDATE session_metadata SET selectedAgent = $agent, selectedModel = $model, timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
      { id: sessionId, agent, model, timestamp: Date.now() }
    );
    log(`[AGENT_MODEL_SYNC] DB UPDATE RESULT for session ${sessionId}:`, result);
    this.invalidateSessionCache(sessionId);
    // REMOVED: this.notify({ type: 'sessionsUpdated' }); 
    // This notification was causing a feedback loop - the component saves, which triggers notification,
    // which updates currentSession prop, which triggers another save
  }

  /**
   * Update session plan expanded state
   */
  async updateSessionPlanExpanded(sessionId: string, planExpanded: boolean): Promise<void> {
    const worker = this.getWorker();
    await worker.query(
      'UPDATE session_metadata SET planExpanded = $planExpanded, timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
      { id: sessionId, planExpanded: planExpanded ? 1 : 0, timestamp: Date.now() }
    );
    this.invalidateSessionCache(sessionId);
  }

  // ========================================
  // Session Messages Operations
  // ========================================

  /**
   * Manually backfill lastModified field for records that have NONE
   */
  private async backfillLastModified(): Promise<void> {
    const worker = this.getWorker();
    try {
      const now = Date.now();
      log('[SessionStorageDB] Running manual lastModified backfill...');
      
      // Split into two queries to avoid syntax issues
      // First, backfill version
      const versionResult = await worker.query<any[]>(`
        UPDATE session_messages 
        SET version = 1
        WHERE version = NONE OR version = 0;
      `);
      
      // Then, backfill lastModified
      const modifiedResult = await worker.query<any[]>(`
        UPDATE session_messages 
        SET lastModified = ${now}
        WHERE lastModified = NONE;
      `);
      
      const versionCount = (versionResult && versionResult[0] && Array.isArray(versionResult[0])) ? versionResult[0].length : 0;
      const modifiedCount = (modifiedResult && modifiedResult[0] && Array.isArray(modifiedResult[0])) ? modifiedResult[0].length : 0;
      
      if (versionCount > 0 || modifiedCount > 0) {
        log(`[SessionStorageDB] Backfilled ${versionCount} version records, ${modifiedCount} lastModified records`);
      } else {
        log('[SessionStorageDB] No records needed backfill');
      }
    } catch (error) {
      log('[SessionStorageDB] Backfill failed:', error);
    }
  }

  /**
   * Get all messages for a session
   */
  async getMessages(sessionId: string): Promise<any[]> {
    const worker = this.getWorker();
    try {
      const result = await worker.query<any[]>(
        'SELECT messages FROM session_messages WHERE sessionId = $id LIMIT 1;',
        { id: sessionId }
      );
      return result[0]?.[0]?.messages || [];
    } catch (error: any) {
      // Handle schema mismatch gracefully (e.g., during migration)
      if (error.message?.includes('lastModified') && error.message?.includes('NONE')) {
        log('[SessionStorageDB] Schema migration needed - triggering backfill');
        await this.backfillLastModified();
        // Retry after backfill
    const result = await worker.query<any[]>(
      'SELECT messages FROM session_messages WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );
    return result[0]?.[0]?.messages || [];
      }
      throw error;
    }
  }

  /**
   * Get current version for a session's messages
   */
  async getMessagesVersion(sessionId: string): Promise<number> {
    const worker = this.getWorker();
    try {
      const result = await worker.query<any[]>(
        'SELECT version FROM session_messages WHERE sessionId = $id LIMIT 1;',
        { id: sessionId }
      );
      return result[0]?.[0]?.version ?? 0;
    } catch (error: any) {
      // Handle schema mismatch gracefully
      if (error.message?.includes('lastModified') && error.message?.includes('NONE')) {
        log('[SessionStorageDB] Schema migration needed in getMessagesVersion - triggering backfill');
        await this.backfillLastModified();
        // Retry after backfill
        const result = await worker.query<any[]>(
          'SELECT version FROM session_messages WHERE sessionId = $id LIMIT 1;',
          { id: sessionId }
        );
        return result[0]?.[0]?.version ?? 0;
      }
      throw error;
    }
  }

  /**
   * Update messages for a session with optimistic locking
   * Returns success status and current version
   */
  async updateMessagesWithVersion(
    sessionId: string, 
    messages: any[], 
    expectedVersion?: number,
    isStreaming?: boolean // If true, skip cross-window notifications (only notify when streaming completes)
  ): Promise<{ success: boolean; currentVersion?: number; error?: string }> {
    const worker = this.getWorker();

    // 1. Read current record with version (with error handling for schema migration)
    let existing: any[];
    try {
      existing = await worker.query<any[]>(
      'SELECT * FROM session_messages WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );
    } catch (error: any) {
      // Handle schema mismatch gracefully
      if (error.message?.includes('lastModified') && error.message?.includes('NONE')) {
        log('[SessionStorageDB] ⚠️  Schema migration needed in updateMessagesWithVersion - triggering backfill');
        await this.backfillLastModified();
        // Retry after backfill
        existing = await worker.query<any[]>(
          'SELECT * FROM session_messages WHERE sessionId = $id LIMIT 1;',
          { id: sessionId }
        );
      } else {
        throw error;
      }
    }

    const existingRecord = existing[0]?.[0];
    const currentVersion = existingRecord?.version ?? 0;

    // 2. If expectedVersion provided, check for conflict
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      log('[SessionStorageDB] ⚠️  Version conflict detected:', {
        sessionId: sessionId.slice(0, 12) + '...',
        expected: expectedVersion,
        current: currentVersion,
      });
      
      return {
        success: false,
        currentVersion,
        error: 'Version conflict: data was modified by another operation',
      };
    }

    // 3. Normalize messages (inline for now, will extract later)
    const normalizeMessagesForStorage = (msgs: any[]): any[] => {
      if (!Array.isArray(msgs) || msgs.length === 0) {
        return [];
      }
      const validRoles = new Set(['user', 'assistant', 'tool', 'system']);
      const seenIds = new Set<string>();
      const normalized: any[] = [];
      let removedEmptyAssistants = 0;
      let removedInvalidRoles = 0;
      let deduplicated = 0;
      let preservedStatefulAssistants = 0;

      for (const raw of msgs) {
        const message = raw ?? {};
        const role = message?.role;
        if (!validRoles.has(role)) {
          removedInvalidRoles += 1;
          continue;
        }

        const toolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
        const hasToolCalls = toolCalls.length > 0;
        const statePayload = message?.state;
        let hasState = false;
        if (Array.isArray(statePayload)) {
          hasState = statePayload.length > 0;
        } else if (statePayload && typeof statePayload === 'object') {
          hasState = Object.keys(statePayload).length > 0;
        } else if (typeof statePayload === 'string') {
          hasState = statePayload.trim().length > 0;
        } else if (statePayload != null) {
          hasState = Boolean(statePayload);
        }

        const content = message?.content;
        let hasContent = false;
        if (typeof content === 'string') {
          hasContent = content.trim().length > 0;
        } else if (Array.isArray(content)) {
          hasContent = content.length > 0;
        } else if (content && typeof content === 'object') {
          hasContent = Object.keys(content).length > 0;
        } else if (content != null) {
          hasContent = true;
        }

        if (role === 'assistant' && !hasContent && !hasToolCalls) {
          if (hasState) {
            preservedStatefulAssistants += 1;
          } else {
            removedEmptyAssistants += 1;
            continue;
          }
        }

        const id = typeof message?.id === 'string' ? message.id : undefined;
        if (id && seenIds.has(id)) {
          deduplicated += 1;
          continue;
        }
        if (id) {
          seenIds.add(id);
        }
        normalized.push(message);
      }

      if (removedEmptyAssistants > 0 || removedInvalidRoles > 0 || deduplicated > 0) {
        log('[SessionStorageDB] Sanitized messages before storing:', {
          sessionId: sessionId.slice(0, 12) + '...',
          before: msgs.length,
          after: normalized.length,
          removedEmptyAssistants,
          removedInvalidRoles,
          deduplicated,
          preservedStatefulAssistants,
        });
      }

      return normalized;
    };

    const normalizedMessages = normalizeMessagesForStorage(messages);
    const newSignature = this.computeMessageSignature(normalizedMessages);
    const existingSignature = existingRecord 
      ? this.computeMessageSignature(existingRecord.messages || [])
      : '';

    // 4. Skip if content unchanged
    if (existingSignature === newSignature) {
      log('[SessionStorageDB] ℹ️  Skipping update - content unchanged');
      return { success: true, currentVersion };
    }

    // 5. Perform versioned update
    const newVersion = currentVersion + 1;
    const now = Date.now();

    try {
    if (existingRecord) {
        // Update with version check
        const result = await worker.query<any[]>(
          `UPDATE session_messages 
           SET messages = $messages, 
               version = $newVersion,
               lastModified = $timestamp
           WHERE sessionId = $id AND version = $currentVersion
           RETURN AFTER;`,
          { 
            id: sessionId, 
            messages: normalizedMessages,
            newVersion,
            currentVersion,
            timestamp: now,
          }
      );

        // Check if update actually happened (would return empty if version mismatched)
        if (!result[0] || result[0].length === 0) {
          log('[SessionStorageDB] ⚠️  Update failed - version changed during operation');
          return {
            success: false,
            error: 'Version conflict: data changed during update',
          };
        }
    } else {
        // Create new record
      await worker.query(
          `CREATE session_messages CONTENT { 
            sessionId: $id, 
            messages: $messages,
            version: 1,
            lastModified: $timestamp
          };`,
          { id: sessionId, messages: normalizedMessages, timestamp: now }
      );
    }

      // 6. Update session timestamp
    await worker.query(
      'UPDATE session_metadata SET timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
        { id: sessionId, timestamp: now }
    );

    // Only send cross-window notifications when streaming is complete
    // This prevents other windows from reloading incomplete messages mid-stream
    // and avoids race conditions from out-of-order Chrome storage events
    if (!isStreaming) {
      // Notify about both message update and session update (for timestamp change)
    this.notify({ type: 'messagesUpdated', sessionId });
      this.notify({ type: 'sessionsUpdated' }); // Also notify to sync session timestamp across windows
      log(`[SessionStorageDB] ✅ Updated ${normalizedMessages.length} messages (v${newVersion}) - notifications sent`);
    } else {
      log(`[SessionStorageDB] ✅ Updated ${normalizedMessages.length} messages (v${newVersion}) - streaming in progress, skipping notifications`);
    }
      
      return { success: true, currentVersion: newVersion };
      
    } catch (error) {
      log('[SessionStorageDB] ❌ Update failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Update messages for a session (backward compatible wrapper)
   * Uses optimistic locking with automatic retry
   */
  async updateMessages(sessionId: string, messages: any[]): Promise<void> {
    // Try versioned update
    const result = await this.updateMessagesWithVersion(sessionId, messages);
    
    if (!result.success) {
      // Retry once on conflict
      log('[SessionStorageDB] Retrying after version conflict...');
      const retryResult = await this.updateMessagesWithVersion(sessionId, messages);
      if (!retryResult.success) {
        throw new Error(retryResult.error || 'Failed to update messages after retry');
  }
    }
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
   * GUARD: Never overwrites existing non-zero stats with zeros to prevent data loss
   */
  async updateUsageStats(sessionId: string, stats: Omit<SessionUsageStats, 'sessionId'>): Promise<void> {
    const worker = this.getWorker();
    
    const existing = await worker.query<any[]>(
      'SELECT * FROM session_usage WHERE sessionId = $id LIMIT 1;',
      { id: sessionId }
    );

    // Check if incoming stats are all zeros
    const incomingTotal = stats.total || (stats.request + stats.response);
    const incomingHasData = incomingTotal > 0 || stats.requestCount > 0;
    
    // Check if existing stats have data
    const existingRecord = existing[0]?.[0];
    const existingTotal = existingRecord 
      ? (existingRecord.total ?? 0) || ((existingRecord.request ?? 0) + (existingRecord.response ?? 0))
      : 0;
    const existingHasData = existingTotal > 0 || (existingRecord?.requestCount ?? 0) > 0;
    
    // GUARD: Never overwrite existing non-zero stats with zeros
    if (existingHasData && !incomingHasData) {
      console.warn(`[SessionStorageDB] Blocked attempt to overwrite usage stats with zeros for session ${sessionId}`);
      return;
    }
    
    // GUARD: Never overwrite with lower values (cumulative stats should only grow)
    if (existingTotal > incomingTotal) {
      console.warn(`[SessionStorageDB] Blocked attempt to overwrite usage stats with lower values for session ${sessionId}: existing=${existingTotal}, incoming=${incomingTotal}`);
      return;
    }

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
    
    if (sessionId === null) {
      // When setting to null, delete the record entirely instead of creating one with NULL
      // This prevents database errors when querying for sessionId
      await worker.query('DELETE current_session;');
      log('[SessionStorageDB:setCurrentSessionId] Cleared current session (set to null)');
    } else {
    // Delete all existing records and create a new one (single record table)
    await worker.query(`
      DELETE current_session;
      CREATE current_session CONTENT { sessionId: $sid };
    `, { sid: sessionId });
      log('[SessionStorageDB:setCurrentSessionId] Set current session:', sessionId.slice(0, 12) + '...');
    }
  }

  /**
   * Ensure the persisted current session belongs to the active user.
   * Runs asynchronously when the user context changes.
   */
  private async ensureCurrentSessionForActiveUser(): Promise<void> {
    try {
      if (!this.isInitialized) {
        return;
      }

      const currentId = await this.getCurrentSessionId();
      if (!currentId) {
        return;
      }

      const session = await this.getSession(currentId);
      if (!session || (this.currentUserId && session.userId !== this.currentUserId)) {
        log('[SessionStorageDB] ensureCurrentSessionForActiveUser detected mismatch, clearing current session');
        await this.setCurrentSessionId(null);
        if (this.currentUserId) {
          const sessions = await this.getAllSessions();
          if (sessions.length > 0) {
            await this.setActiveSession(sessions[0].id);
          }
        }
      }
    } catch (error) {
      log('[SessionStorageDB] Failed to ensure current session for active user:', error);
    }
  }
}

// Export singleton instance
export const sessionStorageDB = new SessionStorageDB();

