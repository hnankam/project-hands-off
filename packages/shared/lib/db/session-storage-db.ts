/**
 * Session Storage Database Service
 *
 * High-performance session management using SurrealDB/IndexedDB
 * Replaces chrome.storage.local for session data to avoid massive writes
 */

import type { DBWorkerClient } from './db-worker-client.js';
import {
  initializeSessionSchema,
  type SessionMetadata,
  type SessionUsageStats,
  type SessionAgentState,
} from './session-schema.js';
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
    // log('[SessionStorageDB] Window ID initialized:', this.windowId);
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

  private normalizeSession(row: any): SessionMetadata {
    if (!row) {
      // log('[SessionStorageDB:normalizeSession] Received null/undefined row');
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

    const sessionId =
      typeof row.sessionId === 'string'
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
      // log('[SessionStorageDB:normalizeSession] Session missing userId, using fallback:', { sessionId: sessionId?.slice(0, 12), fallbackUserId: userId });
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
      planExpanded:
        typeof row.planExpanded === 'boolean'
          ? row.planExpanded
          : typeof row.planExpanded === 'number'
            ? row.planExpanded === 1
            : undefined,
      // Selected context page URLs
      selectedPageURLs: Array.isArray(row.selectedPageURLs) ? row.selectedPageURLs : undefined,
      // Selected workspace items
      selectedNoteIds: Array.isArray(row.selectedNoteIds) ? row.selectedNoteIds : undefined,
      selectedCredentialIds: Array.isArray(row.selectedCredentialIds) ? row.selectedCredentialIds : undefined,
      // Config panel state
      configPanelOpen: row.configPanelOpen === true,
      configPanelTab: ['context', 'plans', 'graphs', 'preview', 'sub-agents'].includes(row.configPanelTab)
        ? row.configPanelTab
        : 'context',
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
      // log('[SessionStorageDB:setCurrentUserId] User ID changed:', {
      //   from: previousUserId || 'null',
      //   to: userId || 'null'
      // });
      // Notify listeners so UI can refetch sessions for the new user immediately
      // This avoids transient empty states before ensureCurrentSessionForActiveUser completes
      try {
        this.notify({ type: 'sessionsUpdated' });
      } catch (e) {
        // Best-effort; do not throw
      }
    } else {
      // log('[SessionStorageDB:setCurrentUserId] User ID set (no change):', userId || 'null');
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
      // log('[SessionStorageDB] Already initialized');
      return;
    }

    if (this.initializePromise) {
      // log('[SessionStorageDB] Initialization already in progress, waiting...');
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
        // log('[SessionStorageDB] Initialized successfully');
      } catch (error) {
        // log('[SessionStorageDB] Failed to initialize:', error);
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
          const sessionId =
            eventType === 'sessionChanged' || eventType === 'messagesUpdated' ? (event as any).sessionId : undefined;

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
            // log('[SessionStorageDB] Cross-window sync sent:', logData);
          }
        }
      } catch (error) {
        // Silently fail - cross-window sync is best-effort
        // log('[SessionStorageDB] Failed to send cross-window sync:', error);
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
      // log('[SessionStorageDB:getAllSessions] Not initialized yet, initializing now...');
      await this.initialize(false);
    }
    const worker = this.getWorker();

    // Require userId to be set
    if (!this.currentUserId) {
      // log('[SessionStorageDB:getAllSessions] No userId set - returning empty array. Call setCurrentUserId() first.');
      return [];
    }

    // log('[SessionStorageDB:getAllSessions] Querying sessions for userId:', this.currentUserId);

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
    // log(`[SessionStorageDB:getAllSessions] Found ${rows.length} sessions for user ${this.currentUserId}`);

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
    if (cached && now - cached.timestamp < this.SESSION_CACHE_TTL) {
      // Return cached result (cache hit - no DB query needed)
      // Commented out to reduce log noise - cache hits are very frequent
      // log(`[AGENT_MODEL_SYNC] CACHE HIT for session ${sessionId.slice(0, 8)} (age: ${now - cached.timestamp}ms)`);
      return cached.data;
    }

    const worker = this.getWorker();
    // log(`[AGENT_MODEL_SYNC] DB QUERY - Getting session metadata for ${sessionId.slice(0, 8)}...`);
    const result = await worker.query<any[]>(
      'SELECT * FROM session_metadata WHERE sessionId = $sessionId OR id = $sessionId LIMIT 1;',
      { sessionId },
    );
    if (!result[0]?.length) {
      // log(`[AGENT_MODEL_SYNC] DB QUERY - No metadata found for session ${sessionId.slice(0, 8)}`);
      // Cache the null result too
      this.sessionCache.set(sessionId, { data: null, timestamp: now });
      return null;
    }
    const normalized = this.normalizeSession(result[0][0]);
    // log(`[AGENT_MODEL_SYNC] DB QUERY RESULT for session ${sessionId.slice(0, 8)}:`, {
    //   agent: normalized.selectedAgent,
    //   model: normalized.selectedModel,
    // });

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
      // log('[SessionStorageDB] Not initialized yet, initializing now...');
      await this.initialize(false);
    }
    const worker = this.getWorker();

    try {
      const result = await worker.query<any[]>('SELECT sessionId FROM current_session LIMIT 1;');
      const currentId = result[0]?.[0]?.sessionId || null;

      // If sessionId is null or empty string, treat as no current session
      // This handles cases where the record exists but has NULL sessionId (shouldn't happen after fix, but handle gracefully)
      if (!currentId || currentId === null || currentId === 'null') {
        // Clean up invalid record if it exists
        try {
          await worker.query('DELETE current_session WHERE sessionId IS NONE OR sessionId IS NULL;');
        } catch (cleanupError) {
          // Ignore cleanup errors - record might not exist
          // log('[SessionStorageDB:getCurrentSessionId] Cleanup query failed (non-critical):', cleanupError);
        }
        return null;
      }

      if (!this.currentUserId) {
        return currentId;
      }

      const session = await this.getSession(currentId);
      if (!session) {
        // log('[SessionStorageDB:getCurrentSessionId] Stored current session not found, clearing pointer');
        await this.setCurrentSessionId(null);
        return null;
      }

      if (session.userId !== this.currentUserId) {
        // log('[SessionStorageDB:getCurrentSessionId] Current session belongs to different user. Clearing and selecting fallback.', {
        //   storedSessionId: currentId.slice(0, 12) + '...',
        //   sessionUserId: session.userId,
        //   currentUserId: this.currentUserId,
        // });
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
      // log('[SessionStorageDB:getCurrentSessionId] Error getting current session ID:', error?.message || error);

      // If error is about NULL sessionId, try to clean up the invalid record
      if (error?.message?.includes('NULL') || error?.message?.includes('null')) {
        try {
          await worker.query('DELETE current_session WHERE sessionId IS NONE OR sessionId IS NULL;');
        } catch (cleanupError) {
          // Ignore cleanup errors
          // log('[SessionStorageDB:getCurrentSessionId] Cleanup after error failed (non-critical):', cleanupError);
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
      const error = new Error(
        '[SessionStorageDB:addSession] Cannot create session: userId is required. Call setCurrentUserId() first or pass userId in metadata.',
      );
      // log(error.message);
      throw error;
    }

    // log('[SessionStorageDB:addSession] Creating new session:', {
    //   title: metadata.title,
    //   userId,
    //   selectedAgent: metadata.selectedAgent,
    //   selectedModel: metadata.selectedModel,
    // });

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
    //  log('[SessionStorageDB:addSession] Deactivating other sessions for user:', userId);
    await worker.query('UPDATE session_metadata SET isActive = false WHERE isActive = true AND userId = $userId;', {
      userId,
    });

    // Create new session metadata
    await worker.query('CREATE session_metadata CONTENT $newSession;', { newSession: newSessionRecord });

    // Set as current session
    await this.setCurrentSessionId(sessionId);

    this.notify({ type: 'sessionsUpdated' });
    this.notify({ type: 'sessionChanged', sessionId });

    // log('[SessionStorageDB:addSession] Successfully created new session:', {
    //   sessionId: sessionId.slice(0, 12) + '...',
    //   title: metadata.title,
    //   userId,
    // });

    return this.normalizeSession(newSessionRecord);
  }

  /**
   * Sync sessions from backend (restore after extension reinstall)
   * Fetches threads from GET /api/threads and creates local session metadata.
   * @param apiBaseUrl - Runtime server base URL (e.g. API_CONFIG.BASE_URL)
   * @param userId - Current user ID (must match backend auth)
   * @returns Number of sessions synced, or -1 on error
   */
  async syncSessionsFromBackend(apiBaseUrl: string, userId: string): Promise<number> {
    if (!userId) {
      debug.error('[SessionStorageDB:syncSessionsFromBackend] userId is required');
      return -1;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/threads`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        debug.error('[SessionStorageDB:syncSessionsFromBackend] API error:', response.status);
        return -1;
      }
      const data = await response.json();
      const threads = data?.threads ?? [];
      if (!Array.isArray(threads) || threads.length === 0) {
        return 0;
      }
      const worker = this.getWorker();
      const existing = await this.getAllSessions();
      const existingIds = new Set(existing.map(s => s.id));
      let synced = 0;
      const toAdd: Array<{
        thread_id: string;
        user_id: string;
        agent_id?: string;
        agent_type?: string;
        model_type?: string;
        title?: string;
        created_at: string | Date;
        last_accessed_at?: string | Date;
      }> = [];
      for (const t of threads) {
        const threadId = t.thread_id ?? t.threadId;
        if (!threadId || existingIds.has(threadId)) continue;
        existingIds.add(threadId);
        toAdd.push(t);
      }
      for (const t of toAdd) {
        const threadId = t.thread_id ?? (t as { threadId?: string }).threadId;
        if (!threadId) continue;
        const ts = t.last_accessed_at ?? t.created_at;
        const timestamp = ts ? new Date(ts).getTime() : Date.now();
        const createdAt = t.created_at ? new Date(t.created_at).getTime() : timestamp;
        const agent = t.agent_id ?? t.agent_type ?? 'general';
        const model = t.model_type ?? 'claude-4.5-haiku';
        const title = (t.title && String(t.title).trim()) || 'Restored Session';
        const newRecord = {
          sessionId: threadId,
          id: threadId,
          timestamp,
          createdAt,
          userId: t.user_id ?? userId,
          title,
          isActive: false,
          // Keep restored rows archived until the user opens them — avoids mounting many
          // ChatSessionContainers / agent runs that can re-create agent_threads via ON CONFLICT
          // right after a hard DELETE.
          isOpen: false,
          selectedAgent: agent,
          selectedModel: model,
        };
        await worker.query('CREATE session_metadata CONTENT $rec;', { rec: newRecord });
        synced++;
      }
      if (synced > 0) {
        const firstId = toAdd[0]?.thread_id ?? (toAdd[0] as { threadId?: string })?.threadId;
        if (firstId) {
          await worker.query(
            'UPDATE session_metadata SET isActive = false WHERE isActive = true AND userId = $userId;',
            { userId },
          );
          await worker.query(
            'UPDATE session_metadata SET isActive = true, isOpen = true WHERE sessionId = $id OR id = $id;',
            { id: firstId },
          );
          await this.setCurrentSessionId(firstId);
        }
        this.notify({ type: 'sessionsUpdated' });
        this.notify({ type: 'sessionChanged', sessionId: firstId });
        debug.log('[SessionStorageDB:syncSessionsFromBackend] Synced', synced, 'sessions from backend');
      }
      return synced;
    } catch (error) {
      debug.error('[SessionStorageDB:syncSessionsFromBackend] Error:', error);
      return -1;
    }
  }

  /**
   * Set active session (LIGHTWEIGHT - no message data touched)
   * Only deactivates sessions for the same user
   */
  async setActiveSession(sessionId: string): Promise<void> {
    const worker = this.getWorker();

    // log('[SessionStorageDB:setActiveSession] Setting active session:', sessionId.slice(0, 12) + '...');

    // Verify session exists
    const session = await this.getSession(sessionId);
    if (!session) {
      const error = new Error(`[SessionStorageDB:setActiveSession] Session ${sessionId} not found`);
      log(error.message);
      throw error;
    }

    // Verify session belongs to current user
    if (this.currentUserId && session.userId !== this.currentUserId) {
      const error = new Error(
        `[SessionStorageDB:setActiveSession] Session ${sessionId} belongs to different user. Session userId: ${session.userId}, Current userId: ${this.currentUserId}`,
      );
      log(error.message);
      throw error;
    }

    // log('[SessionStorageDB:setActiveSession] Verified session:', {
    //   sessionId: sessionId.slice(0, 12) + '...',
    //   title: session.title,
    //   userId: session.userId,
    // });

    // Update in a single transaction - only deactivate sessions for the same user
    if (this.currentUserId) {
      await worker.query(
        `
        UPDATE session_metadata SET isActive = false WHERE isActive = true AND userId = $userId;
        UPDATE session_metadata SET isActive = true, isOpen = true WHERE sessionId = $id OR id = $id;
      `,
        { id: sessionId, userId: this.currentUserId },
      );
    } else {
      await worker.query(
        `
      UPDATE session_metadata SET isActive = false WHERE isActive = true;
      UPDATE session_metadata SET isActive = true, isOpen = true WHERE sessionId = $id OR id = $id;
    `,
        { id: sessionId },
      );
    }

    // Update current session ID
    await this.setCurrentSessionId(sessionId);

    this.notify({ type: 'sessionChanged', sessionId });
    // log('[SessionStorageDB:setActiveSession] Successfully set active session:', sessionId.slice(0, 12) + '...');
  }

  /**
   * Close a session (mark as not open)
   */
  async closeSession(sessionId: string): Promise<void> {
    const worker = this.getWorker();

    await worker.query(
      'UPDATE session_metadata SET isOpen = false, isActive = false WHERE sessionId = $id OR id = $id;',
      { id: sessionId },
    );

    // If this was the current session, find a new one
    const currentId = await this.getCurrentSessionId();
    if (currentId === sessionId) {
      const openSessions = await this.getOpenSessions();
      if (openSessions.length > 0) {
        // Switch to the "previously opened" tab (browser-like: tab to the left, or right if closing first tab)
        const allSessions = await this.getAllSessions();
        const closedIndex = allSessions.findIndex(s => s.id === sessionId);
        const openIds = new Set(openSessions.map(s => s.id));
        let sessionToActivate: SessionMetadata | null = null;
        if (closedIndex >= 0) {
          // Prefer tab to the left (index - 1)
          if (closedIndex > 0 && openIds.has(allSessions[closedIndex - 1].id)) {
            sessionToActivate = allSessions[closedIndex - 1];
          }
          // Else tab to the right (index + 1) when closing first tab
          else if (closedIndex < allSessions.length - 1 && openIds.has(allSessions[closedIndex + 1].id)) {
            sessionToActivate = allSessions[closedIndex + 1];
          }
        }
        // Fallback: most recently used among remaining open sessions
        if (!sessionToActivate) {
          sessionToActivate = [...openSessions].sort((a, b) => b.timestamp - a.timestamp)[0];
        }
        await this.setActiveSession(sessionToActivate.id);
      } else {
        // No open sessions - create a new one, carrying over agent/model/context from closed session
        if (!this.currentUserId) {
          log('[SessionStorageDB:closeSession] Cannot create new session: No userId set');
          return;
        }

        const adjectives = ['Quick', 'Bright', 'Smart', 'Swift', 'Creative'];
        const nouns = ['Task', 'Project', 'Query', 'Session', 'Work'];
        const title = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;

        // Get agent/model/context from the session we're closing to carry over to new session
        const closedSession = await this.getSession(sessionId);
        const carryOver = closedSession
          ? {
              selectedAgent: closedSession.selectedAgent || 'general',
              selectedModel: closedSession.selectedModel || 'claude-4.5-haiku',
              ...(closedSession.selectedPageURLs?.length && { selectedPageURLs: closedSession.selectedPageURLs }),
              ...(closedSession.selectedNoteIds?.length && { selectedNoteIds: closedSession.selectedNoteIds }),
              ...(closedSession.selectedCredentialIds?.length && {
                selectedCredentialIds: closedSession.selectedCredentialIds,
              }),
            }
          : {};

        const newSession = await this.addSession({
          title,
          userId: this.currentUserId,
          isActive: true,
          isOpen: true,
          ...carryOver,
        });
        await this.setCurrentSessionId(newSession.id);
      }
    }

    this.notify({ type: 'sessionsUpdated' });
    // log('[SessionStorageDB] Closed session:', sessionId);
  }

  /**
   * Open all sessions
   */
  async openAllSessions(): Promise<void> {
    const worker = this.getWorker();
    await worker.query('UPDATE session_metadata SET isOpen = true;');
    this.notify({ type: 'sessionsUpdated' });
    // log('[SessionStorageDB] Opened all sessions');
  }

  /**
   * Delete a session and all its data
   * @param {string} sessionId - Session ID (also used as threadId for backend)
   * @param {string} [apiBaseUrl] - Optional API base URL for backend deletion
   */
  async deleteSession(sessionId: string, apiBaseUrl?: string): Promise<void> {
    const worker = this.getWorker();

    // Check if this is the current session BEFORE deleting
    const currentId = await this.getCurrentSessionId();
    const isCurrentSession = currentId === sessionId;

    // Delete backend thread first (hard delete with cascade)
    // This will delete all runs, messages, and deleted message records
    if (apiBaseUrl) {
      try {
        const response = await fetch(`${apiBaseUrl}/api/threads/${sessionId}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok && response.status !== 404) {
          // 404 is OK (thread might not exist), but other errors should be logged
          const error = await response.json().catch(() => ({ error: 'Failed to delete thread' }));
          console.error('[SessionStorageDB] Failed to delete backend thread:', error);
          // Continue with frontend deletion even if backend deletion fails
        }
      } catch (error) {
        console.error('[SessionStorageDB] Error calling backend thread deletion API:', error);
        // Continue with frontend deletion even if backend deletion fails
      }
    }

    // Delete from all frontend tables
    await worker.query(
      `
      DELETE FROM session_metadata WHERE sessionId = $id OR id = $id;
      DELETE FROM session_usage WHERE sessionId = $id;
      DELETE FROM session_agent_state WHERE sessionId = $id;
    `,
      { id: sessionId },
    );

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
    // log('[SessionStorageDB] Deleted session:', sessionId);
  }

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const worker = this.getWorker();
    await worker.query(
      'UPDATE session_metadata SET title = $title, timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
      { id: sessionId, title, timestamp: Date.now() },
    );
    this.invalidateSessionCache(sessionId);
    this.notify({ type: 'sessionsUpdated' });
  }

  /**
   * Persist session title to backend (for restore after reinstall)
   * Fire-and-forget when apiBaseUrl provided - does not throw on failure.
   */
  async persistSessionTitleToBackend(apiBaseUrl: string, sessionId: string, title: string): Promise<void> {
    if (!apiBaseUrl || !sessionId) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/threads`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: sessionId, title: title || 'Untitled session' }),
      });
      if (!response.ok) {
        debug.error('[SessionStorageDB] Failed to persist title to backend:', response.status);
      }
    } catch (error) {
      debug.error('[SessionStorageDB] Error persisting title to backend:', error);
    }
  }

  /**
   * Update session agent and model
   */
  async updateSessionAgentAndModel(sessionId: string, agent: string, model: string): Promise<void> {
    const existing = await this.getSession(sessionId);
    if (
      existing &&
      (existing.selectedAgent ?? '') === (agent ?? '') &&
      (existing.selectedModel ?? '') === (model ?? '')
    ) {
      return;
    }

    const worker = this.getWorker();
    // log(`[AGENT_MODEL_SYNC] DB UPDATE - Updating agent/model for session ${sessionId}:`, { agent, model });
    const result = await worker.query(
      'UPDATE session_metadata SET selectedAgent = $agent, selectedModel = $model, timestamp = $timestamp WHERE sessionId = $id OR id = $id;',
      { id: sessionId, agent, model, timestamp: Date.now() },
    );
    // log(`[AGENT_MODEL_SYNC] DB UPDATE RESULT for session ${sessionId}:`, result);
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
      { id: sessionId, planExpanded: planExpanded ? 1 : 0, timestamp: Date.now() },
    );
    this.invalidateSessionCache(sessionId);
  }

  /**
   * Update session selected page URLs (context selector)
   */
  async updateSessionPageURLs(sessionId: string, selectedPageURLs: string[]): Promise<void> {
    const existing = await this.getSession(sessionId);
    const prev = existing?.selectedPageURLs ?? [];
    if (prev.length === selectedPageURLs.length && prev.every((u, i) => u === selectedPageURLs[i])) {
      return;
    }

    const worker = this.getWorker();
    await worker.query(
      'UPDATE session_metadata SET selectedPageURLs = $selectedPageURLs WHERE sessionId = $id OR id = $id;',
      { id: sessionId, selectedPageURLs },
    );
    this.invalidateSessionCache(sessionId);
    this.notify({ type: 'sessionChanged', sessionId });
  }

  /**
   * Update session config panel state (open/closed and active tab)
   * Skips the DB write (and session list timestamp bump) when values are unchanged — avoids
   * spurious updates when React re-runs persistence after tab focus / remount with the same state.
   */
  async updateSessionConfigPanel(
    sessionId: string,
    configPanelOpen: boolean,
    configPanelTab: 'context' | 'plans' | 'graphs' | 'preview' | 'sub-agents',
  ): Promise<void> {
    const existing = await this.getSession(sessionId);
    if (existing) {
      const openMatches = existing.configPanelOpen === configPanelOpen;
      const tabExisting = existing.configPanelTab ?? 'context';
      const tabMatches = tabExisting === configPanelTab;
      if (openMatches && tabMatches) {
        return;
      }
    }

    const worker = this.getWorker();
    // Do not touch session_metadata.timestamp — config panel is UI prefs, not chat activity.
    // Switching sessions can apply layout overrides that differ from DB without user intent.
    await worker.query(
      'UPDATE session_metadata SET configPanelOpen = $configPanelOpen, configPanelTab = $configPanelTab WHERE sessionId = $id OR id = $id;',
      { id: sessionId, configPanelOpen, configPanelTab },
    );
    this.invalidateSessionCache(sessionId);
    this.notify({ type: 'sessionChanged', sessionId });
  }

  /**
   * Update session selected workspace items (notes and credentials)
   */
  async updateSessionWorkspaceItems(
    sessionId: string,
    selectedNoteIds: string[],
    selectedCredentialIds: string[],
  ): Promise<void> {
    const existing = await this.getSession(sessionId);
    const prevNotes = existing?.selectedNoteIds ?? [];
    const prevCreds = existing?.selectedCredentialIds ?? [];
    const notesMatch =
      prevNotes.length === selectedNoteIds.length && prevNotes.every((id, i) => id === selectedNoteIds[i]);
    const credsMatch =
      prevCreds.length === selectedCredentialIds.length && prevCreds.every((id, i) => id === selectedCredentialIds[i]);
    if (notesMatch && credsMatch) {
      return;
    }

    const worker = this.getWorker();
    await worker.query(
      'UPDATE session_metadata SET selectedNoteIds = $selectedNoteIds, selectedCredentialIds = $selectedCredentialIds WHERE sessionId = $id OR id = $id;',
      { id: sessionId, selectedNoteIds, selectedCredentialIds },
    );
    this.invalidateSessionCache(sessionId);
    this.notify({ type: 'sessionChanged', sessionId });
  }

  // ========================================
  // Session Messages Operations
  // ========================================

  // ========================================
  // Usage Stats Operations
  // ========================================

  /**
   * Get usage stats for a session
   */
  async getUsageStats(sessionId: string): Promise<SessionUsageStats | null> {
    const worker = this.getWorker();
    const result = await worker.query<any[]>('SELECT * FROM session_usage WHERE sessionId = $id LIMIT 1;', {
      id: sessionId,
    });
    return (result[0]?.[0] || null) as SessionUsageStats | null;
  }

  /**
   * Update usage stats for a session
   * GUARD: Never overwrites existing non-zero stats with zeros to prevent data loss
   */
  async updateUsageStats(sessionId: string, stats: Omit<SessionUsageStats, 'sessionId'>): Promise<void> {
    const worker = this.getWorker();

    const existing = await worker.query<any[]>('SELECT * FROM session_usage WHERE sessionId = $id LIMIT 1;', {
      id: sessionId,
    });

    // Check if incoming stats are all zeros
    const incomingTotal = stats.total || stats.request + stats.response;
    const incomingHasData = incomingTotal > 0 || stats.requestCount > 0;

    // Check if existing stats have data
    const existingRecord = existing[0]?.[0];
    const existingTotal = existingRecord
      ? (existingRecord.total ?? 0) || (existingRecord.request ?? 0) + (existingRecord.response ?? 0)
      : 0;
    const existingHasData = existingTotal > 0 || (existingRecord?.requestCount ?? 0) > 0;

    // GUARD: Never overwrite existing non-zero stats with zeros
    if (existingHasData && !incomingHasData) {
      // console.warn(`[SessionStorageDB] Blocked attempt to overwrite usage stats with zeros for session ${sessionId}`);
      return;
    }

    // GUARD: Never overwrite with lower values (cumulative stats should only grow)
    if (existingTotal > incomingTotal) {
      // console.warn(`[SessionStorageDB] Blocked attempt to overwrite usage stats with lower values for session ${sessionId}: existing=${existingTotal}, incoming=${incomingTotal}`);
      return;
    }

    // Only treat increased token totals as "new activity" for session list ordering.
    // requestCount alone can fluctuate on reconnect / stream re-hydration without new messages.
    const hasNewActivity = incomingTotal > existingTotal;

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
          { id: sessionId, ...payload },
        );
      } else {
        await worker.query(
          'UPDATE session_usage SET request = $req, response = $res, total = $tot, requestCount = $cnt, lastUsage = NONE WHERE sessionId = $id;',
          { id: sessionId, ...payload },
        );
      }
    } else {
      if (hasLastUsage) {
        await worker.query(
          'CREATE session_usage CONTENT { sessionId: $id, request: $req, response: $res, total: $tot, requestCount: $cnt, lastUsage: $last };',
          { id: sessionId, ...payload },
        );
      } else {
        await worker.query(
          'CREATE session_usage CONTENT { sessionId: $id, request: $req, response: $res, total: $tot, requestCount: $cnt };',
          { id: sessionId, ...payload },
        );
      }
    }

    // Only update session timestamp when there's actual new activity (message sent/received)
    // This prevents timestamp updates when re-saving hydrated data on session open
    if (hasNewActivity) {
      await worker.query('UPDATE session_metadata SET timestamp = $timestamp WHERE sessionId = $id OR id = $id;', {
        id: sessionId,
        timestamp: Date.now(),
      });
    }

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
    const result = await worker.query<any[]>('SELECT * FROM session_agent_state WHERE sessionId = $id LIMIT 1;', {
      id: sessionId,
    });
    const row = result[0]?.[0] || null;
    const state = row as SessionAgentState | null;
    const planIds = state?.plans ? Object.keys(state.plans) : [];
    log('[SessionPlans] SessionStorageDB getAgentState:', {
      sessionId: sessionId.slice(0, 8),
      found: !!state,
      plansCount: planIds.length,
      planIds,
    });
    return state;
  }

  /**
   * Update agent state for a session (includes plan steps, graph state, and graph steps)
   */
  async updateAgentState(sessionId: string, state: Omit<SessionAgentState, 'sessionId'>): Promise<void> {
    const worker = this.getWorker();

    const existing = await worker.query<any[]>('SELECT * FROM session_agent_state WHERE sessionId = $id LIMIT 1;', {
      id: sessionId,
    });

    // Build update payload with flat structure (multi-instance support)
    const payload: Record<string, any> = {
      plans: state.plans || {},
      graphs: state.graphs || {},
    };

    const planIds = Object.keys(payload.plans);
    log('[SessionPlans] SessionStorageDB updateAgentState:', {
      sessionId: sessionId.slice(0, 8),
      plansCount: planIds.length,
      planIds,
    });

    // Include deferred tool requests if present
    if (state.deferred_tool_requests !== undefined) {
      payload.deferred_tool_requests = state.deferred_tool_requests;
    }

    if (existing[0]?.length > 0) {
      // Update existing record with flat structure
      const setClauses: string[] = ['plans = $plans', 'graphs = $graphs'];
      if (state.deferred_tool_requests !== undefined) {
        setClauses.push('deferred_tool_requests = $deferred_tool_requests');
      }

      await worker.query(`UPDATE session_agent_state SET ${setClauses.join(', ')} WHERE sessionId = $id;`, {
        id: sessionId,
        ...payload,
      });
    } else {
      // Create new record with flat structure
      await worker.query(
        'CREATE session_agent_state CONTENT { sessionId: $id, plans: $plans, graphs: $graphs, deferred_tool_requests: $deferred_tool_requests };',
        {
          id: sessionId,
          plans: payload.plans,
          graphs: payload.graphs,
          deferred_tool_requests: payload.deferred_tool_requests || null,
        },
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
      // log('[SessionStorageDB:setCurrentSessionId] Cleared current session (set to null)');
    } else {
      // Delete all existing records and create a new one (single record table)
      await worker.query(
        `
      DELETE current_session;
      CREATE current_session CONTENT { sessionId: $sid };
    `,
        { sid: sessionId },
      );
      // log('[SessionStorageDB:setCurrentSessionId] Set current session:', sessionId.slice(0, 12) + '...');
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
        // log('[SessionStorageDB] ensureCurrentSessionForActiveUser detected mismatch, clearing current session');
        await this.setCurrentSessionId(null);
        if (this.currentUserId) {
          const sessions = await this.getAllSessions();
          if (sessions.length > 0) {
            await this.setActiveSession(sessions[0].id);
          }
        }
      }
    } catch (error) {
      // log('[SessionStorageDB] Failed to ensure current session for active user:', error);
    }
  }
}

// Export singleton instance
export const sessionStorageDB = new SessionStorageDB();
