/**
 * ================================================================================
 * useSessionData Hook
 * ================================================================================
 * 
 * Consolidates all session-specific data loading from IndexedDB:
 * - Agent/Model selection
 * - Usage statistics  
 * - Agent step state
 * 
 * Ensures proper session isolation and cleanup on session switches.
 * 
 * Features:
 * - Parallel data loading for performance
 * - Prevents duplicate fetches with refs
 * - Proper cleanup on session change
 * - Hydration state tracking
 * 
 * @module useSessionData
 * ================================================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { sessionStorageDBWrapper, debug } from '@extension/shared';
import type { AgentStepState } from '../components/cards';
import type { SessionMetadata } from '@extension/shared';

// ============================================================================
// TYPES
// ============================================================================

export type UsageTotals = {
  request: number;
  response: number;
  total: number;
  requestCount: number;
};

export type UsageData = {
  session_id: string;
  agent_type: string;
  model: string;
  request_tokens: number;
  response_tokens: number;
  total_tokens: number;
  timestamp: string;
};

/**
 * Return type for useSessionData hook
 */
export interface UseSessionDataReturn {
  /** Currently selected agent ID */
  selectedAgent: string;
  /** Update selected agent */
  setSelectedAgent: (agent: string) => void;
  /** Currently selected model ID */
  selectedModel: string;
  /** Update selected model */
  setSelectedModel: (model: string) => void;
  
  /** Initial selected page URLs loaded from DB */
  initialSelectedPageURLs: string[];
  /** Initial selected note IDs loaded from DB */
  initialSelectedNoteIds: string[];
  /** Initial selected credential IDs loaded from DB */
  initialSelectedCredentialIds: string[];
  
  /** Initial usage totals loaded from DB */
  initialUsage: UsageTotals;
  /** Last usage data point loaded from DB */
  initialLastUsage: UsageData | null;
  /** Whether usage data is currently being hydrated from DB */
  isUsageHydrating: boolean;
  /** Persist updated usage stats to DB */
  persistUsageStats: (cumulativeUsage: UsageTotals, lastUsageData: UsageData | null) => void;
  
  /** Current agent step state for task progress */
  currentAgentStepState: AgentStepState;
  /** Update agent step state */
  setCurrentAgentStepState: (state: AgentStepState) => void;
  
  /** Whether session metadata is currently loading */
  isLoadingMetadata: boolean;
  /** Whether any data is being loaded from DB (for preventing premature saves) */
  isLoadingFromDB: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_USAGE: UsageTotals = {
  request: 0,
  response: 0,
  total: 0,
  requestCount: 0,
};

// ============================================================================
// HOOK
// ============================================================================

/**
 * useSessionData Hook
 * 
 * Manages all session-specific data loading and persistence.
 * 
 * @param sessionId - The ID of the session to load data for
 * @param isActive - Whether this session is currently active
 * @returns Object containing session data and management functions
 * 
 * @example
 * ```tsx
 * const {
 *   selectedAgent,
 *   setSelectedAgent,
 *   initialUsage,
 *   isUsageHydrating,
 *   persistUsageStats
 * } = useSessionData(sessionId, isActive);
 * ```
 */
export const useSessionData = (
  sessionId: string,
  isActive: boolean,
  initialMetadata?: SessionMetadata | null
): UseSessionDataReturn => {
  
  // ============================================================================
  // STATE
  // ============================================================================
  
  // Agent/Model selection state
  // OPTIMIZATION: Initialize immediately with initialMetadata if provided
  const [selections, setSelections] = useState({ 
    agent: initialMetadata?.selectedAgent ?? '', 
    model: initialMetadata?.selectedModel ?? '' 
  });
  const selectedAgent = selections.agent;
  const selectedModel = selections.model;

  // Selected page URLs state (context selector)
  const [initialSelectedPageURLs, setInitialSelectedPageURLs] = useState<string[]>(
    initialMetadata?.selectedPageURLs ?? []
  );

  // Selected workspace items state
  const [initialSelectedNoteIds, setInitialSelectedNoteIds] = useState<string[]>(
    initialMetadata?.selectedNoteIds ?? []
  );
  const [initialSelectedCredentialIds, setInitialSelectedCredentialIds] = useState<string[]>(
    initialMetadata?.selectedCredentialIds ?? []
  );

  // Keep selections in sync when sessionId or initialMetadata changes
  useEffect(() => {
    if (sessionId) {
      setSelections({
        agent: initialMetadata?.selectedAgent ?? '',
        model: initialMetadata?.selectedModel ?? ''
      });
      setInitialSelectedPageURLs(initialMetadata?.selectedPageURLs ?? []);
      setInitialSelectedNoteIds(initialMetadata?.selectedNoteIds ?? []);
      setInitialSelectedCredentialIds(initialMetadata?.selectedCredentialIds ?? []);
      setIsLoadingMetadata(isActive && !initialMetadata);
    }
  }, [sessionId, initialMetadata, isActive]);
  
  const setSelectedAgent = useCallback((agent: string) => {
    setSelections(prev => ({ ...prev, agent }));
  }, []);

  const setSelectedModel = useCallback((model: string) => {
    setSelections(prev => ({ ...prev, model }));
  }, []);
  
  // Usage tracking state
  const [usageCache, setUsageCache] = useState<Record<string, UsageTotals>>({});
  const [lastUsageCache, setLastUsageCache] = useState<Record<string, UsageData | null>>({});
  const [isUsageHydrating, setIsUsageHydrating] = useState(false);
  
  // Agent step state (flat structure with multi-instance support)
  const [currentAgentStepState, setCurrentAgentStepState] = useState<AgentStepState>({
    sessionId,
    plans: {},
    graphs: {},
  });
  
  // Loading flags
  // OPTIMIZATION: If we have initial metadata, we aren't "loading" the basics anymore
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(isActive && !initialMetadata);
  const isLoadingFromDBRef = useRef(false);
  const lastLoadedSessionRef = useRef<string | null>(null);
  const loadingSessionIdRef = useRef<string | null>(null);
  
  // ============================================================================
  // REFS
  // ============================================================================
  
  // Ref for sessionId to use in persistUsageStats callback
  const sessionIdRef = useRef(sessionId);
  
  // Keep sessionId ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  
  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  /**
   * Effect 1: Initialize cache entries for new session
   * Runs before data loading to ensure cache structure exists
   */
  useEffect(() => {
    setUsageCache(prev => {
      if (prev[sessionId]) return prev;
      return { ...prev, [sessionId]: DEFAULT_USAGE };
    });

    setLastUsageCache(prev => {
      if (sessionId in prev) return prev;
      return { ...prev, [sessionId]: null };
    });
  }, [sessionId]);
  
  /**
   * Effect 2: Load session metadata (Agent/Model)
   */
  useEffect(() => {
    if (!isActive) {
      return;
    }
    
    // OPTIMIZATION: If we already have metadata from props, we can skip the DB fetch
    // But we still update the "last loaded" ref to prevent future redundant fetches
    if (initialMetadata && lastLoadedSessionRef.current !== sessionId) {
      lastLoadedSessionRef.current = sessionId;
      setIsLoadingMetadata(false);
      return;
    }
    
    // Check if already loaded or currently loading to prevent duplicate fetches
    if (lastLoadedSessionRef.current === sessionId) {
      return;
    }

    if (loadingSessionIdRef.current === sessionId) {
      return;
    }
    
    let isCancelled = false;
    
    // Mark as loading immediately
    loadingSessionIdRef.current = sessionId;
    setIsLoadingMetadata(true);
    isLoadingFromDBRef.current = true;

    const loadSessionMetadata = async () => {
      try {
        const metadata = await sessionStorageDBWrapper.getSession(sessionId);
        
        if (isCancelled) {
          setIsLoadingMetadata(false);
          isLoadingFromDBRef.current = false;
          loadingSessionIdRef.current = null;
          return;
        }
        
        if (!metadata) {
          setIsLoadingMetadata(false);
          isLoadingFromDBRef.current = false;
          loadingSessionIdRef.current = null;
          return;
        }

        // Apply loaded agent/model/pageURLs/workspaceItems to state together in a single update
        // Set isLoadingMetadata to false IMMEDIATELY so CopilotKitProvider can mount
        // This ensures atomic updates: agent/model and loading flag change together
        setSelections({
          agent: metadata.selectedAgent ?? '',
          model: metadata.selectedModel ?? '',
        });
        setInitialSelectedPageURLs(metadata.selectedPageURLs ?? []);
        setInitialSelectedNoteIds(metadata.selectedNoteIds ?? []);
        setInitialSelectedCredentialIds(metadata.selectedCredentialIds ?? []);

        // Mark session as loaded and clear loading flags ATOMICALLY
        lastLoadedSessionRef.current = sessionId;
        loadingSessionIdRef.current = null;
            setIsLoadingMetadata(false);
            isLoadingFromDBRef.current = false;
        
      } catch (error) {
        debug.error(`[useSessionData] Failed to load metadata for session ${sessionId.slice(0, 8)}:`, error);
        setIsLoadingMetadata(false);
        isLoadingFromDBRef.current = false;
        loadingSessionIdRef.current = null;
      }
    };

    loadSessionMetadata();

    return () => {
      isCancelled = true;
      loadingSessionIdRef.current = null;
      setIsLoadingMetadata(false);
      isLoadingFromDBRef.current = false;
    };
  }, [sessionId, isActive]);
  
  /**
   * Effect 3: Load usage stats and agent state (in parallel)
   */
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let isCancelled = false;
    setIsUsageHydrating(true);

    const loadStoredData = async () => {
      try {
        // OPTIMIZATION: Load both usage stats and agent state in parallel
        const [storedUsage, storedState] = await Promise.all([
          sessionStorageDBWrapper.getUsageStatsAsync(sessionId),
          sessionStorageDBWrapper.getAgentStepStateAsync(sessionId)
        ]);
        
        if (!isCancelled) {
          if (storedUsage) {
            const normalizedUsage: UsageTotals = {
              request: storedUsage.request ?? 0,
              response: storedUsage.response ?? 0,
              total: storedUsage.total ?? 0,
              requestCount: storedUsage.requestCount ?? 0,
            };

            const normalizedLastUsage: UsageData | null = storedUsage?.lastUsage
              ? {
                  session_id: sessionId,
                  agent_type: storedUsage.lastUsage.agentType ?? 'unknown',
                  model: storedUsage.lastUsage.model ?? 'unknown',
                  request_tokens: storedUsage.lastUsage.requestTokens ?? 0,
                  response_tokens: storedUsage.lastUsage.responseTokens ?? 0,
                  total_tokens:
                    storedUsage.lastUsage.totalTokens ??
                    (storedUsage.lastUsage.requestTokens ?? 0) + (storedUsage.lastUsage.responseTokens ?? 0),
                  timestamp: storedUsage.lastUsage.timestamp ?? new Date().toISOString(),
                }
              : null;

            setUsageCache(prev => ({ ...prev, [sessionId]: normalizedUsage }));
            setLastUsageCache(prev => ({ ...prev, [sessionId]: normalizedLastUsage }));
            
            debug.log(`[useSessionData] Applied usage stats for session ${sessionId.slice(0, 8)}:`, {
              request: normalizedUsage.request,
              response: normalizedUsage.response,
              total: normalizedUsage.total,
              requestCount: normalizedUsage.requestCount,
            });
          } else {
            debug.log(`[useSessionData] No stored usage found for session ${sessionId.slice(0, 8)}`);
          }
        }
        
        debug.log(`[useSessionData] DB query result for session ${sessionId.slice(0, 8)}:`, {
          found: !!storedState,
          plansCount: Object.keys(storedState?.plans ?? {}).length,
        });
        
        if (!isCancelled) {
          // Always set the state - either from DB or empty for new sessions
          setCurrentAgentStepState({
            sessionId,
            plans: storedState?.plans ?? {},
            graphs: storedState?.graphs ?? {},
            deferred_tool_requests: storedState?.deferred_tool_requests,
          });
          
          const numPlans = Object.keys(storedState?.plans ?? {}).length;
          const numGraphs = Object.keys(storedState?.graphs ?? {}).length;
          debug.log(`[useSessionData] Set currentAgentStepState for session ${sessionId.slice(0, 8)}:`, {
            numPlans,
            numGraphs,
          });
        }
        
      } catch (error) {
        debug.error(`[useSessionData] Failed to load stored data for session ${sessionId.slice(0, 8)}:`, error);
        // On error, set empty state to prevent stale data
        if (!isCancelled) {
          setCurrentAgentStepState({ sessionId, plans: {}, graphs: {} });
        }
      } finally {
        if (!isCancelled) {
          setIsUsageHydrating(false);
        }
      }
    };

    loadStoredData();

    return () => {
      isCancelled = true;
      setIsUsageHydrating(false);
    };
  }, [sessionId]);

  // ============================================================================
  // CALLBACKS
  // ============================================================================
  
  /**
   * Persist usage statistics to IndexedDB.
   * Called from ChatSessionContainer when usage changes.
   * Uses ref pattern to avoid recreation on every sessionId change.
   */
  const persistUsageStats = useCallback((
    cumulativeUsage: UsageTotals,
    lastUsageData: UsageData | null
  ) => {
    const currentSessionId = sessionIdRef.current;
    
    // Don't persist during hydration
    if (!currentSessionId || isUsageHydrating) {
      debug.log(`[useSessionData] Skipping persist: sessionId=${!!currentSessionId}, isHydrating=${isUsageHydrating}`);
      return;
    }
    
    // Don't persist zeros - this prevents overwriting DB data with empty values
    // when useUsageStream hasn't loaded from DB yet
    const hasData = cumulativeUsage.request > 0 || cumulativeUsage.response > 0 || 
                    cumulativeUsage.total > 0 || cumulativeUsage.requestCount > 0;
    if (!hasData && !lastUsageData) {
      debug.log(`[useSessionData] Skipping persist: no data to save`);
      return;
    }

    const lastUsageRecord = lastUsageData
      ? {
          requestTokens: lastUsageData.request_tokens ?? 0,
          responseTokens: lastUsageData.response_tokens ?? 0,
          totalTokens:
            lastUsageData.total_tokens ??
            (lastUsageData.request_tokens ?? 0) + (lastUsageData.response_tokens ?? 0),
          timestamp: lastUsageData.timestamp,
          agentType: lastUsageData.agent_type,
          model: lastUsageData.model,
        }
      : null;

    sessionStorageDBWrapper.updateUsageStats(currentSessionId, {
      request: cumulativeUsage.request,
      response: cumulativeUsage.response,
      total: cumulativeUsage.total,
      requestCount: cumulativeUsage.requestCount,
      lastUsage: lastUsageRecord,
    });
  }, [isUsageHydrating]); // Only depends on isUsageHydrating, uses ref for sessionId

  // ============================================================================
  // RETURN
  // ============================================================================
  
  const initialUsage = usageCache[sessionId] ?? DEFAULT_USAGE;
  const initialLastUsage = lastUsageCache[sessionId] ?? null;

  return {
    selectedAgent,
    setSelectedAgent,
    selectedModel,
    setSelectedModel,
    initialSelectedPageURLs,
    initialSelectedNoteIds,
    initialSelectedCredentialIds,
    initialUsage,
    initialLastUsage,
    isUsageHydrating,
    currentAgentStepState,
    setCurrentAgentStepState,
    isLoadingMetadata,
    isLoadingFromDB: isLoadingFromDBRef.current,
    persistUsageStats,
  };
};
