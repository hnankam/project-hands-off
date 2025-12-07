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
import type { AgentStepState } from '../components/cards/TaskProgressCard';

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

const METADATA_SETTLE_DELAY_MS = 50; // Wait for state updates to settle before allowing saves

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
  isActive: boolean
): UseSessionDataReturn => {
  
  // ============================================================================
  // STATE
  // ============================================================================
  
  // Agent/Model selection state
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  
  // Usage tracking state
  const [usageCache, setUsageCache] = useState<Record<string, UsageTotals>>({});
  const [lastUsageCache, setLastUsageCache] = useState<Record<string, UsageData | null>>({});
  const [isUsageHydrating, setIsUsageHydrating] = useState(false);
  
  // Agent step state
  const [currentAgentStepState, setCurrentAgentStepState] = useState<AgentStepState>({
    sessionId,
    steps: [],
  });
  
  // Loading flags
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
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
      debug.log(`[useSessionData] Session ${sessionId.slice(0, 8)} is not active, skipping metadata load`);
      return;
    }
    
    // Check if already loaded or currently loading to prevent duplicate fetches
    if (lastLoadedSessionRef.current === sessionId) {
      return;
    }

    if (loadingSessionIdRef.current === sessionId) {
      debug.log(`[useSessionData] Metadata load already in progress for session ${sessionId.slice(0, 8)}`);
      return;
    }
    
    let isCancelled = false;
    let enableSavesTimeoutId: NodeJS.Timeout | null = null;
    
    // Mark as loading immediately
    loadingSessionIdRef.current = sessionId;
    setIsLoadingMetadata(true);
    isLoadingFromDBRef.current = true;

    const loadSessionMetadata = async () => {
      debug.log(`[useSessionData] Loading metadata for session ${sessionId.slice(0, 8)}`);
      
      try {
        const metadata = await sessionStorageDBWrapper.getSession(sessionId);
        
        if (isCancelled) {
          debug.log(`[useSessionData] Load cancelled for session ${sessionId.slice(0, 8)}`);
          setIsLoadingMetadata(false);
          isLoadingFromDBRef.current = false;
          loadingSessionIdRef.current = null;
          return;
        }
        
        if (!metadata) {
          debug.warn(`[useSessionData] No metadata found for session ${sessionId.slice(0, 8)}`);
          setIsLoadingMetadata(false);
          isLoadingFromDBRef.current = false;
          loadingSessionIdRef.current = null;
          return;
        }

        debug.log(`[useSessionData] Loaded metadata for session ${sessionId.slice(0, 8)}:`, {
          agent: metadata.selectedAgent,
          model: metadata.selectedModel,
        });

        // Apply loaded agent/model to state
        if (metadata.selectedAgent !== undefined) {
          setSelectedAgent(metadata.selectedAgent);
        }
        if (metadata.selectedModel !== undefined) {
          setSelectedModel(metadata.selectedModel);
        }

        // Mark session as loaded
        lastLoadedSessionRef.current = sessionId;
        loadingSessionIdRef.current = null;
        
        // Wait for state updates to settle before allowing saves
        enableSavesTimeoutId = setTimeout(() => {
          if (!isCancelled) {
            setIsLoadingMetadata(false);
            isLoadingFromDBRef.current = false;
            debug.log(`[useSessionData] Metadata load complete for session ${sessionId.slice(0, 8)}`);
          }
        }, METADATA_SETTLE_DELAY_MS);
        
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
      if (enableSavesTimeoutId) {
        clearTimeout(enableSavesTimeoutId);
      }
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
        debug.log(`[useSessionData] Loading usage & agent state for session ${sessionId.slice(0, 8)}`);
        
        // OPTIMIZATION: Load both usage stats and agent state in parallel
        const [storedUsage, storedState] = await Promise.all([
          sessionStorageDBWrapper.getUsageStatsAsync(sessionId),
          sessionStorageDBWrapper.getAgentStepStateAsync(sessionId)
        ]);
        
        // Always log what we got from DB
        debug.log(`[useSessionData] DB returned usage for session ${sessionId.slice(0, 8)}:`, storedUsage);
        
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
          stepsCount: storedState?.steps?.length ?? 0,
        });
        
        if (!isCancelled) {
          // Always set the state - either from DB or empty for new sessions
          const loadedSteps = storedState?.steps ?? [];
          setCurrentAgentStepState({
            sessionId,
            steps: loadedSteps,
          });
          
          debug.log(`[useSessionData] Set currentAgentStepState for session ${sessionId.slice(0, 8)}:`, {
            steps: loadedSteps.length,
          });
        }
        
      } catch (error) {
        debug.error(`[useSessionData] Failed to load stored data for session ${sessionId.slice(0, 8)}:`, error);
        // On error, set empty state to prevent stale data
        if (!isCancelled) {
          setCurrentAgentStepState({ sessionId, steps: [] });
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
