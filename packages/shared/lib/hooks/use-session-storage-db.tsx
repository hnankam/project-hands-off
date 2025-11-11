/**
 * React hook for accessing session storage from IndexedDB
 * 
 * Replaces useStorage(sessionStorage) with a version that reads from IndexedDB
 * and doesn't trigger massive writes on session switches
 */

import { useState, useEffect, useSyncExternalStore } from 'react';
import { sessionStorageDB } from '../db/session-storage-db.js';
import type { SessionAgentState, SessionMetadata, SessionUsageStats } from '../db/session-schema.js';

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

  // Subscribe to DB changes
  const unsubscribeDB = sessionStorageDB.subscribe((event) => {
    if (event.type === 'sessionsUpdated' || event.type === 'sessionChanged') {
      console.log('[SessionStore] 🔔 ========== DB EVENT RECEIVED ==========');
      console.log('[SessionStore] Event type:', event.type);
      console.log('[SessionStore] Triggering refetch...');
      // Refetch data and notify listeners
      fetchData()
        .then(() => {
          console.log('[SessionStore] ✅ Data refetched successfully');
          console.log('[SessionStore] Notifying', listeners.length, 'listeners');
          listeners.forEach(listener => {
            try {
              listener();
            } catch (err) {
              console.error('[SessionStore] Listener error:', err);
            }
          });
        })
        .catch(error => {
          console.error('[SessionStore] ❌ Failed to refetch after change:', error);
          // Still notify listeners even on error so UI can update
          listeners.forEach(listener => {
            try {
              listener();
            } catch (err) {
              console.error('[SessionStore] Listener error:', err);
            }
          });
        });
    }
  });

  const fetchData = async (): Promise<SessionStorageState> => {
    console.log('[SessionStore] 📦 ========== FETCHING DATA ==========');
    console.log('[SessionStore] Timestamp:', new Date().toISOString());
    console.log('[SessionStore] Current userId:', sessionStorageDB.getCurrentUserId()?.slice(0, 8));
    try {
      const [sessions, currentSessionId] = await Promise.all([
        sessionStorageDB.getAllSessions(),
        sessionStorageDB.getCurrentSessionId(),
      ]);

      // Ensure sessions is always an array
      const validSessions = Array.isArray(sessions) ? sessions : [];
      
      console.log('[SessionStore] ✅ Fetch complete:', { 
        sessionsCount: validSessions.length, 
        currentSessionId: currentSessionId?.slice(0, 8), 
        sessionIds: validSessions.map(s => s.id.slice(0, 8)),
      });
      
      cache = { sessions: validSessions, currentSessionId };
      return cache;
    } catch (error) {
      console.error('[SessionStore] ❌ Failed to fetch data:', error);
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

  return { fetchData, subscribe, getSnapshot, cleanup: () => unsubscribeDB() };
}

// Global store instance
let globalStore: ReturnType<typeof createSessionStore> | null = null;
let initPromise: Promise<SessionStorageState> | null = null;
let hasInitialized = false; // Prevent duplicate initialization

function getOrCreateStore() {
  if (!globalStore) {
    console.log('[useSessionStorageDB] Creating new session store instance');
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
      console.log('[useSessionStorageDB] 🔄 Starting initial data fetch...');
      setIsLoading(true);
      hasInitialized = true; // Mark as started
      initPromise = store.fetchData()
        .then((fetchedData) => {
          console.log('[useSessionStorageDB] ✅ Data fetch completed:', { sessionsCount: fetchedData.sessions.length, currentSessionId: fetchedData.currentSessionId });
          return fetchedData;
        })
        .catch((error) => {
          console.error('[useSessionStorageDB] ❌ Failed to fetch session data:', error);
          hasInitialized = false; // Allow retry on error
          // Return empty state on error
          return { sessions: [], currentSessionId: null };
        })
        .finally(() => {
          console.log('[useSessionStorageDB] 🏁 Fetch promise completed, setting isLoading = false');
          initPromise = null;
          setIsLoading(false);
        });
    } else if (data) {
      console.log('[useSessionStorageDB] Data already available, setting isLoading = false');
      setIsLoading(false);
    } else {
      console.log('[useSessionStorageDB] Waiting for data... hasInitialized:', hasInitialized, 'initPromise:', !!initPromise);
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
    console.log('[sessionStorageDBWrapper:addSession] 📝 Creating session:', title);
    
    // Verify userId is set
    const userId = sessionStorageDB.getCurrentUserId();
    if (!userId) {
      const error = new Error('[sessionStorageDBWrapper:addSession] ❌ Cannot create session: No user is logged in. Call setCurrentUserId() first.');
      console.error(error.message);
      throw error;
    }

    console.log('[sessionStorageDBWrapper:addSession] ℹ️  User ID verified:', userId);

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
      
      console.log('[sessionStorageDBWrapper:addSession] ℹ️  Using last selected:', { lastSelectedAgent, lastSelectedModel });
    }

    await sessionStorageDB.addSession({
      title,
      userId, // Explicitly pass userId
      isActive: true,
      isOpen: true,
      selectedAgent: lastSelectedAgent,
      selectedModel: lastSelectedModel,
    });
    
    console.log('[sessionStorageDBWrapper:addSession] ✅ Session created successfully');
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
    console.log('[sessionStorageDBWrapper] setActiveSession called with:', sessionId);
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
   */
  async deleteSession(sessionId: string): Promise<void> {
    await sessionStorageDB.deleteSession(sessionId);
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
   * Update messages for a session
   */
  async updateAllMessages(sessionId: string, messages: any[]): Promise<void> {
    await sessionStorageDB.updateMessages(sessionId, messages);
  },

  /**
   * Get all messages for a session
   */
  getAllMessages(sessionId: string): any[] {
    // Note: This is synchronous in the old API, but we need async for IndexedDB
    // We'll handle this by caching messages in the component that needs them
    console.warn('[useSessionStorageDB] getAllMessages called synchronously - returning empty array. Use async version.');
    return [];
  },

  /**
   * Async version of getAllMessages
   */
  async getAllMessagesAsync(sessionId: string): Promise<any[]> {
    return await sessionStorageDB.getMessages(sessionId);
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
  getUsageStats(sessionId: string): SessionUsageStats | null {
    // Note: Synchronous version - will need to be replaced with async
    console.warn('[useSessionStorageDB] getUsageStats called synchronously - returning null. Use async version.');
    return null;
  },

  /**
   * Async version of getUsageStats
   */
  async getUsageStatsAsync(sessionId: string): Promise<SessionUsageStats | null> {
    return await sessionStorageDB.getUsageStats(sessionId);
  },

  /**
   * Update agent step state
   */
  async updateAgentStepState(sessionId: string, state: SessionAgentState): Promise<void> {
    await sessionStorageDB.updateAgentState(sessionId, { steps: state.steps });
  },

  /**
   * Get agent step state
   */
  getAgentStepState(sessionId: string): SessionAgentState | null {
    // Note: Synchronous version - will need to be replaced with async
    console.warn('[useSessionStorageDB] getAgentStepState called synchronously - returning null. Use async version.');
    return null;
  },

  /**
   * Async version of getAgentStepState
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
    console.log('[sessionStorageDBWrapper:setCurrentUserId] 🔐 Setting user ID:', userId || 'null');
    sessionStorageDB.setCurrentUserId(userId);
    console.log('[sessionStorageDBWrapper:setCurrentUserId] ✅ User ID set successfully');
  },

  /**
   * Get the current user ID
   */
  getCurrentUserId(): string | null {
    const userId = sessionStorageDB.getCurrentUserId();
    console.log('[sessionStorageDBWrapper:getCurrentUserId] Current user ID:', userId || 'null');
    return userId;
  },
};

