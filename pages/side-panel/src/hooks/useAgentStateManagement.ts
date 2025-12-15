import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useCopilotAgent } from './copilotkit';
import { debug } from '@extension/shared';
import type { UnifiedAgentState, PlanStep, PlanInstance } from '../components/graph-state/types';

// Type alias for backward compatibility
type AgentStepState = UnifiedAgentState;

// Step type from UnifiedAgentState (plan steps only)
type Step = PlanStep;

/**
 * Check if steps are plan steps (have 'description' field) vs graph steps (have 'node' field).
 * This prevents graph execution steps from being rendered as task progress.
 */
function isPlanSteps(steps: unknown[]): steps is Step[] {
  if (!steps || steps.length === 0) return false;
  const first = steps[0] as Record<string, unknown>;
  // Plan steps have 'description', graph steps have 'node'
  return 'description' in first && !('node' in first);
}


export interface UseAgentStateManagementProps {
  sessionId: string;
  messages: unknown[];
  initialAgentStepState?: AgentStepState;
  onAgentStepStateChange?: (state: AgentStepState) => void;
}

export interface UseAgentStateManagementReturn {
  dynamicAgentState: AgentStepState;
  setDynamicAgentState: (state: AgentStepState) => void;
  latestAssistantMessageIdRef: React.MutableRefObject<string | null>;
}

/**
 * useAgentStateManagement Hook
 * 
 * Centralizes agent state management for task progress tracking.
 * Handles session scoping, plan deletion, and state synchronization.
 * 
 * Features:
 * - Session-scoped state (prevents cross-session bleed)
 * - Plan deletion tracking (clears state when plan is deleted)
 * - Initial state restoration from persisted storage
 * - Automatic state sync to parent component
 */
export const useAgentStateManagement = ({
  sessionId,
  messages,
  initialAgentStepState,
  onAgentStepStateChange
}: UseAgentStateManagementProps): UseAgentStateManagementReturn => {
  
  // Track plan deletion state
  const planDeletionInfoRef = useRef<{ deleted: boolean; lastAssistantId: string | null }>({
    deleted: false,
    lastAssistantId: null,
  });
  
  // Track latest assistant message ID
  const latestAssistantMessageIdRef = useRef<string | null>(null);
  
  // Use centralized CopilotKit agent hook for state management
  const {
    state: rawDynamicAgentState,
    setState: setRawDynamicAgentState,
  } = useCopilotAgent<UnifiedAgentState>({
    agentId: 'dynamic_agent',
    initialState:
      initialAgentStepState && initialAgentStepState.sessionId === sessionId
        ? initialAgentStepState
        : { sessionId, plans: {}, graphs: {} },
  });
  
  /**
   * Compute session-scoped agent state with proper validation.
   * 
   * IMPORTANT: Uses flat structure with multi-instance support!
   * - Plans live in state.plans dictionary (keyed by plan_id)
   * - Graphs live in state.graphs dictionary (keyed by graph_id)
   * - Multiple plans/graphs can be active simultaneously
   * 
   * Handles various edge cases:
   * - Missing raw state
   * - Plan deleted (removes from dictionary)
   * - Session mismatch (returns empty)
   * - Missing sessionId on raw state (adds current sessionId)
   */
  const dynamicAgentState = useMemo<UnifiedAgentState>(() => {    
    // No raw state available
    if (!rawDynamicAgentState) {
      return { sessionId, plans: {}, graphs: {} };
    }
    
    // Plan was deleted - remove from plans dictionary
    if (planDeletionInfoRef.current.deleted) {
      const { [planDeletionInfoRef.current.lastAssistantId || '']: _, ...remainingPlans } = rawDynamicAgentState.plans || {};
      return { ...rawDynamicAgentState, plans: remainingPlans };
    }
    
    // Session mismatch - return empty to prevent cross-session contamination
    if (rawDynamicAgentState.sessionId && rawDynamicAgentState.sessionId !== sessionId) {
      return { sessionId, plans: {}, graphs: {} };
    }
    
    // Session matches - return state as-is
    if (rawDynamicAgentState.sessionId === sessionId) {
      return rawDynamicAgentState;
    }
    
    // No sessionId on raw state - attach current sessionId
    return { 
      sessionId,
      plans: rawDynamicAgentState.plans || {},
      graphs: rawDynamicAgentState.graphs || {},
    };
  }, [rawDynamicAgentState, sessionId]);
  
  /**
   * Set agent state with session scoping and plan deletion tracking.
   * Handles:
   * - Clearing plans (plan deletion)
   * - Normal state updates with sessionId attachment
   * - Flat structure updates
   */
  const setDynamicAgentState = useCallback(
    (nextState: UnifiedAgentState) => {
      const nextPlans = nextState?.plans ?? {};
      const numPlans = Object.keys(nextPlans).length;
      
      // Handle all plans deleted (empty plans dictionary)
      if (numPlans === 0) {
        debug.log('[AgentStepState] Clearing all plans (all deleted)');
        planDeletionInfoRef.current = {
          deleted: true,
          lastAssistantId: latestAssistantMessageIdRef.current,
        };
        setRawDynamicAgentState({ sessionId, plans: {}, graphs: nextState?.graphs || {} });
        return;
      }
      
      // Normal state update
      planDeletionInfoRef.current = {
        deleted: false,
        lastAssistantId: latestAssistantMessageIdRef.current,
      };
      
      setRawDynamicAgentState({ ...nextState, sessionId });
    },
    [sessionId, setRawDynamicAgentState],
  );
  
  /**
   * Fix raw state that arrives without sessionId but has plans/graphs.
   * Proactively adds sessionId to prevent cross-session issues.
   */
  useEffect(() => {
    if (
      rawDynamicAgentState &&
      !rawDynamicAgentState.sessionId &&
      !planDeletionInfoRef.current.deleted
    ) {
      const hasPlans = rawDynamicAgentState.plans && Object.keys(rawDynamicAgentState.plans).length > 0;
      const hasGraphs = rawDynamicAgentState.graphs && Object.keys(rawDynamicAgentState.graphs).length > 0;
      
      if (hasPlans || hasGraphs) {
      setRawDynamicAgentState({ ...rawDynamicAgentState, sessionId });
      }
    }
  }, [rawDynamicAgentState, sessionId, setRawDynamicAgentState]);
  
  /**
   * Track latest assistant message ID for plan deletion tracking.
   * When a new assistant message arrives after plan deletion,
   * reset the deletion flag to allow new plans.
   */
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(
      (message) => (message as { role?: string })?.role === 'assistant'
    );
    const latestAssistantId = (lastAssistant as { id?: string })?.id ?? null;
    const previousAssistantId = latestAssistantMessageIdRef.current;
    latestAssistantMessageIdRef.current = latestAssistantId;

    // Reset deletion flag when a new assistant message arrives after plan deletion
    if (
      planDeletionInfoRef.current.deleted &&
      planDeletionInfoRef.current.lastAssistantId !== null &&
      latestAssistantId !== planDeletionInfoRef.current.lastAssistantId &&
      latestAssistantId !== previousAssistantId
    ) {
      debug.log(`[AgentStepState] Resetting deletion flag - new assistant message for session ${sessionId.slice(0, 8)}`);
      planDeletionInfoRef.current = {
        deleted: false,
        lastAssistantId: latestAssistantId,
      };
    }
  }, [messages, sessionId]);
  
  /**
   * Restore initial state if provided and current state is empty.
   * Only applies if:
   * - Initial state exists with steps
   * - Current state is empty or session mismatched
   * 
   * This handles the case where DB load completes after component mount.
   */
  const initialScopedPlans = useMemo(() => {
    if (!initialAgentStepState) return {};
    if (initialAgentStepState.sessionId && initialAgentStepState.sessionId !== sessionId) {
      return {};
    }
    return initialAgentStepState.plans ?? {};
  }, [initialAgentStepState, sessionId]);

  // Track if we've successfully restored from initial state for the current session
  const hasRestoredFromInitialRef = useRef(false);
  
  // Reset restoration flag when session changes
  useEffect(() => {
    hasRestoredFromInitialRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    // Skip if no initial plans to restore
    const numPlans = Object.keys(initialScopedPlans).length;
    if (numPlans === 0) {
      return;
    }
    
    // Skip if already restored for this session
    if (hasRestoredFromInitialRef.current) {
      return;
    }
    
    // Skip if current state already has plans for this session
    // (user may have added plans after initial load)
    const currentPlansCount = Object.keys(dynamicAgentState.plans || {}).length;
    if (dynamicAgentState.sessionId === sessionId && currentPlansCount > 0) {
      hasRestoredFromInitialRef.current = true; // Mark as "restored" since we have data
      return;
    }
    
    // Restore initial plans from DB
    debug.log(`[AgentStepState] Restoring ${numPlans} plans from DB for session ${sessionId.slice(0, 8)}`);
    hasRestoredFromInitialRef.current = true;
    setRawDynamicAgentState({ sessionId, plans: initialScopedPlans, graphs: {} });
  }, [initialScopedPlans, dynamicAgentState, sessionId, setRawDynamicAgentState]);
  
  /**
   * Notify parent component when agent step state changes.
   */
  useEffect(() => {
    if (onAgentStepStateChange && dynamicAgentState) {
      onAgentStepStateChange(dynamicAgentState);
    }
  }, [dynamicAgentState, onAgentStepStateChange]);
  
  return {
    dynamicAgentState,
    setDynamicAgentState,
    latestAssistantMessageIdRef
  };
};

