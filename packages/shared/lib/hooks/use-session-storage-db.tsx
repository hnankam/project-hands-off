/**
 * React hook for accessing session storage from IndexedDB
 * 
 * Replaces useStorage(sessionStorage) with a version that reads from IndexedDB
 * and doesn't trigger massive writes on session switches
 */

import { useState, useEffect, useSyncExternalStore } from 'react';
import { sessionStorageDB } from '../db/session-storage-db.js';
import type { SessionAgentState, SessionMetadata, SessionUsageStats } from '../db/session-schema.js';
import { debug } from '../utils/debug.js';

/**
 * Session storage state (matches old interface)
 */
export interface SessionStorageState {
  sessions: SessionMetadata[];
  currentSessionId: string | null;
  isLoading?: boolean;
}

/**
 * Create a store that can be used with useSyncExternalStore
 */
function createSessionStore() {
  let cache: SessionStorageState | null = null;
  let listeners: Array<() => void> = [];
  const syncKeyPrefix = 'session_storage_sync_';
  
  // Refetch deduplication and debouncing
  let refetchInProgress = false;
  let refetchDebounceTimer: NodeJS.Timeout | null = null;
  let pendingRefetch = false;
  let lastRefetchTime = 0;
  const REFETCH_DEBOUNCE_MS = 150; // Wait 150ms to batch multiple refetch requests (increased from 100ms)
  const MIN_REFETCH_INTERVAL_MS = 300; // Minimum time between refetches to prevent cascade

  // Helper to safely notify all listeners
  const notifyListeners = () => {
    listeners.forEach(listener => {
      try {
        listener();
      } catch (err) {
        debug.error('[SessionStore] Listener error:', err);
      }
    });
  };

  // Helper function to trigger refetch and notify listeners (debounced and deduplicated)
  const triggerRefetch = () => {
    // Check if we've refetched too recently (prevents cascade)
    const now = Date.now();
    const timeSinceLastRefetch = now - lastRefetchTime;
    
    if (timeSinceLastRefetch < MIN_REFETCH_INTERVAL_MS && !refetchInProgress) {
      // Too soon since last refetch - queue it instead
      if (!refetchDebounceTimer) {
        const remainingWait = MIN_REFETCH_INTERVAL_MS - timeSinceLastRefetch;
        debug.log(`[SessionStore] Refetch too soon (${timeSinceLastRefetch}ms), waiting ${remainingWait}ms`);
        pendingRefetch = true;
        refetchDebounceTimer = setTimeout(() => {
          refetchDebounceTimer = null;
          if (pendingRefetch) {
            pendingRefetch = false;
            triggerRefetch();
          }
        }, remainingWait);
      } else {
        pendingRefetch = true;
      }
      return;
    }
    
    // If already pending, just mark that we want another refetch
    if (refetchDebounceTimer) {
      pendingRefetch = true;
      return;
    }
    
    // If refetch is already in progress, queue another one
    if (refetchInProgress) {
      debug.log('[SessionStore] Refetch in progress, queueing');
      pendingRefetch = true;
      return;
    }
    
    // Debounce: Wait for a short period to batch multiple refetch requests
    refetchDebounceTimer = setTimeout(() => {
      refetchDebounceTimer = null;
      pendingRefetch = false;
      
      debug.log('[SessionStore] Triggering refetch');
      refetchInProgress = true;
      lastRefetchTime = Date.now();
      
      fetchData()
        .then(() => {
          debug.log('[SessionStore] Refetch complete, notifying', listeners.length, 'listeners');
          notifyListeners();
        })
        .catch(error => {
          debug.error('[SessionStore] Refetch failed:', error);
          // Still notify listeners even on error so UI can update
          notifyListeners();
        })
        .finally(() => {
          refetchInProgress = false;
          
          // If another refetch was requested while this one was in progress, trigger it now
          if (pendingRefetch) {
            debug.log('[SessionStore] Processing queued refetch');
            pendingRefetch = false;
            // Small delay to avoid immediate cascade
            setTimeout(() => triggerRefetch(), 50);
          }
        });
    }, REFETCH_DEBOUNCE_MS);
  };

  // Subscribe to DB changes (local window)
  const unsubscribeDB = sessionStorageDB.subscribe((event) => {
    if (event.type === 'sessionsUpdated' || event.type === 'sessionChanged') {
      debug.log('[SessionStore] DB event received:', event.type);
      triggerRefetch();
    }
  });

  // Subscribe to cross-window changes via chrome.storage.local
  let unsubscribeStorage: (() => void) | null = null;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    // Get our window ID to filter out self-notifications
    const ourWindowId = sessionStorageDB.getWindowId();
    
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      // Only process changes from chrome.storage.local
      if (areaName !== 'local') return;

      // Check if any of our sync keys changed
      const syncKeys = [
        `${syncKeyPrefix}sessionsUpdated`,
        `${syncKeyPrefix}sessionChanged`,
        `${syncKeyPrefix}messagesUpdated`,
      ];

      let shouldRefetch = false;
      for (const key of syncKeys) {
        if (changes[key]) {
          const newValue = changes[key].newValue;
          const oldValue = changes[key].oldValue;
          
          // Filter out self-notifications: ignore if windowId matches ours
          if (newValue?.windowId === ourWindowId) {
            debug.log('[SessionStore] Ignoring self-notification (same window ID)');
            continue;
          }
          
          // Only refetch if this change came from another window (not our own)
          // We can detect this by checking if the timestamp is different
          if (newValue && (!oldValue || newValue.timestamp !== oldValue.timestamp)) {
            // Verify userId matches (only sync for same user)
            const currentUserId = sessionStorageDB.getCurrentUserId();
            if (!currentUserId || newValue.userId === currentUserId) {
              debug.log('[SessionStore] Cross-window sync detected:', {
                event: newValue.event,
                sessionId: newValue.sessionId?.slice(0, 8),
                timestamp: new Date(newValue.timestamp).toISOString(),
                fromWindowId: newValue.windowId?.slice(0, 12) + '...',
              });
              shouldRefetch = true;
              break;
            }
          }
        }
      }

      if (shouldRefetch) {
        // Small delay to ensure IndexedDB has been updated
        setTimeout(() => {
          triggerRefetch();
        }, 50);
      }
    };
    
    chrome.storage.onChanged.addListener(handleStorageChange);
    unsubscribeStorage = () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }

  const fetchData = async (): Promise<SessionStorageState> => {
    debug.log('[SessionStore] Fetching data for userId:', sessionStorageDB.getCurrentUserId()?.slice(0, 8));
    try {
      const [sessions, currentSessionId] = await Promise.all([
        sessionStorageDB.getAllSessions(),
        sessionStorageDB.getCurrentSessionId(),
      ]);

      // Ensure sessions is always an array
      const validSessions = Array.isArray(sessions) ? sessions : [];
      
      debug.log('[SessionStore] Fetch complete:', { 
        sessionsCount: validSessions.length, 
        currentSessionId: currentSessionId?.slice(0, 8), 
      });
      
      cache = { sessions: validSessions, currentSessionId };
      return cache;
    } catch (error) {
      debug.error('[SessionStore] Failed to fetch data:', error);
      // Return empty state on error instead of throwing
      const emptyState = { sessions: [], currentSessionId: null };
      cache = emptyState;
      return emptyState;
    }
  };

  const subscribe = (listener: () => void) => {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  };

  const getSnapshot = () => cache;

  return { 
    fetchData, 
    subscribe, 
    getSnapshot, 
    cleanup: () => {
      // Clean up debounce timer
      if (refetchDebounceTimer) {
        clearTimeout(refetchDebounceTimer);
        refetchDebounceTimer = null;
      }
      
      // Clean up subscriptions
      unsubscribeDB();
      if (unsubscribeStorage) {
        unsubscribeStorage();
      }
    }
  };
}

// Global store instance
let globalStore: ReturnType<typeof createSessionStore> | null = null;
let initPromise: Promise<SessionStorageState> | null = null;
let hasInitialized = false; // Prevent duplicate initialization

function getOrCreateStore() {
  if (!globalStore) {
    // Only log store creation once (rare event)
    // console.log('[useSessionStorageDB] Creating new session store instance');
    globalStore = createSessionStore();
  }
  return globalStore;
}

/**
 * Hook to access session storage from IndexedDB
 * 
 * Usage:
 *   const { sessions, currentSessionId, isLoading } = useSessionStorageDB();
 */
export const useSessionStorageDB = (): SessionStorageState => {
  const store = getOrCreateStore();
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [isLoading, setIsLoading] = useState(!data);

  // Initialize data on mount (only once)
  useEffect(() => {
    if (!data && !initPromise && !hasInitialized) {
      setIsLoading(true);
      hasInitialized = true; // Mark as started
      initPromise = store.fetchData()
        .then((fetchedData) => {
          debug.log('[useSessionStorageDB] Initial data loaded:', { 
            sessionsCount: fetchedData.sessions.length, 
            currentSessionId: fetchedData.currentSessionId?.slice(0, 8) 
          });
          return fetchedData;
        })
        .catch((error) => {
          debug.error('[useSessionStorageDB] Failed to fetch session data:', error);
          hasInitialized = false; // Allow retry on error
          // Return empty state on error
          return { sessions: [], currentSessionId: null };
        })
        .finally(() => {
          initPromise = null;
          setIsLoading(false);
        });
    } else if (data) {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]); // Re-run when data changes

  // Return cached data or empty state while loading
  return { 
    ...(data || { sessions: [], currentSessionId: null }),
    isLoading 
  };
};

/**
 * Wrapper for session storage operations
 * Provides same API as old sessionStorage but uses IndexedDB
 */
export const sessionStorageDBWrapper = {
  /**
   * Add a new session
   * Requires userId to be set via setCurrentUserId() first
   */
  async addSession(title: string): Promise<void> {
    debug.log('[sessionStorageDBWrapper] Creating session:', title);
    
    // Verify userId is set
    const userId = sessionStorageDB.getCurrentUserId();
    if (!userId) {
      const error = new Error('[sessionStorageDBWrapper] Cannot create session: No user is logged in. Call setCurrentUserId() first.');
      debug.error(error.message);
      throw error;
    }

    debug.log('[sessionStorageDBWrapper] User ID verified:', userId?.slice(0, 8));

    // Find the last selected agent and model from existing sessions
    const sessions = await sessionStorageDB.getAllSessions();
    let lastSelectedAgent = 'general';
    let lastSelectedModel = 'claude-4.5-haiku';

    if (sessions.length > 0) {
      const sortedSessions = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
      const sessionWithModel = sortedSessions.find(s => s.selectedModel);
      
      if (sessionWithModel) {
        lastSelectedAgent = sessionWithModel.selectedAgent || lastSelectedAgent;
        lastSelectedModel = sessionWithModel.selectedModel || lastSelectedModel;
      }
      
      debug.log('[sessionStorageDBWrapper] Using last selected:', { lastSelectedAgent, lastSelectedModel });
    }

    await sessionStorageDB.addSession({
      title,
      userId, // Explicitly pass userId
      isActive: true,
      isOpen: true,
      selectedAgent: lastSelectedAgent,
      selectedModel: lastSelectedModel,
    });
    
    debug.log('[sessionStorageDBWrapper] Session created successfully');
  },

  /**
   * Get a single session metadata record
   */
  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    return await sessionStorageDB.getSession(sessionId);
  },

  /**
   * Set active session
   */
  async setActiveSession(sessionId: string): Promise<void> {
    debug.log('[sessionStorageDBWrapper] setActiveSession:', sessionId.slice(0, 8));
    await sessionStorageDB.setActiveSession(sessionId);
  },

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<void> {
    await sessionStorageDB.closeSession(sessionId);
  },

  /**
   * Open all sessions
   */
  async openAllSessions(): Promise<void> {
    await sessionStorageDB.openAllSessions();
  },

  /**
   * Delete a session
   * @param {string} sessionId - Session ID (also used as threadId for backend)
   * @param {string} [apiBaseUrl] - Optional API base URL for backend thread deletion
   */
  async deleteSession(sessionId: string, apiBaseUrl?: string): Promise<void> {
    await sessionStorageDB.deleteSession(sessionId, apiBaseUrl);
  },

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await sessionStorageDB.updateSessionTitle(sessionId, title);
  },

  /**
   * Update session agent and model
   */
  async updateSessionAgentAndModel(sessionId: string, agent: string, model: string): Promise<void> {
    await sessionStorageDB.updateSessionAgentAndModel(sessionId, agent, model);
  },

  /**
   * Update session plan expanded state
   */
  async updateSessionPlanExpanded(sessionId: string, planExpanded: boolean): Promise<void> {
    await sessionStorageDB.updateSessionPlanExpanded(sessionId, planExpanded);
  },

  /**
   * Update usage stats
   */
  async updateUsageStats(
    sessionId: string,
    usage: {
      request: number;
      response: number;
      total: number;
      requestCount: number;
      lastUsage?: SessionUsageStats['lastUsage'];
    },
  ): Promise<void> {
    await sessionStorageDB.updateUsageStats(sessionId, usage);
  },

  /**
   * Get usage stats
   */
  async getUsageStatsAsync(sessionId: string): Promise<SessionUsageStats | null> {
    return await sessionStorageDB.getUsageStats(sessionId);
  },

  /**
   * Update agent state (includes plans and graphs)
   */
  async updateAgentStepState(sessionId: string, state: SessionAgentState): Promise<void> {
    await sessionStorageDB.updateAgentState(sessionId, { 
      plans: state.plans,
      graphs: state.graphs,
    });
  },

  /**
   * Get agent state (includes plan steps, graph state, and graph steps)
   */
  async getAgentStepStateAsync(sessionId: string): Promise<SessionAgentState | null> {
    return await sessionStorageDB.getAgentState(sessionId);
  },

  /**
   * Set the current user ID for session filtering
   * Required for multi-user support - must be called when user logs in
   * Only sessions belonging to this user will be returned
   */
  setCurrentUserId(userId: string | null): void {
    debug.log('[sessionStorageDBWrapper] Setting user ID:', userId?.slice(0, 8) || 'null');
    sessionStorageDB.setCurrentUserId(userId);
  },

  /**
   * Get the current user ID
   */
  getCurrentUserId(): string | null {
    return sessionStorageDB.getCurrentUserId();
  },

  /**
   * Get the window ID for this instance (used to filter self-notifications)
   */
  getWindowId(): string {
    return sessionStorageDB.getWindowId();
  },
};

