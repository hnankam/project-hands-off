import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useCopilotAgent } from './copilotkit';
import { debug } from '@extension/shared';
import type { AgentStepState } from '../components/cards/TaskProgressCard';

// Step type from AgentStepState
type Step = AgentStepState['steps'][number];

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
  } = useCopilotAgent<AgentStepState>({
    agentId: 'dynamic_agent',
    initialState:
      initialAgentStepState && initialAgentStepState.sessionId === sessionId
        ? initialAgentStepState
        : { sessionId, steps: [] },
  });
  
  /**
   * Compute session-scoped agent state with proper validation.
   * Handles various edge cases:
   * - Missing raw state
   * - Plan deleted (returns empty steps)
   * - Session mismatch (returns empty steps)
   * - Missing sessionId on raw state (adds current sessionId)
   * - Graph steps (have 'node' instead of 'description') - filtered out
   * - V2: Handle case where state is an array (steps directly) instead of { steps: [...] }
   */
  const dynamicAgentState = useMemo<AgentStepState>(() => {    
    // No raw state available
    if (!rawDynamicAgentState) {
      return { sessionId, steps: [] };
    }
    
    // V2 FIX: Handle case where backend sends steps array directly instead of { steps: [...] }
    if (Array.isArray(rawDynamicAgentState)) {
      const steps = rawDynamicAgentState as unknown as Step[];
      if (steps.length > 0 && isPlanSteps(steps)) {
        return { sessionId, steps };
      }
      return { sessionId, steps: [] };
    }
    
    // Plan was deleted - return empty regardless of raw state
    if (planDeletionInfoRef.current.deleted && (rawDynamicAgentState.steps?.length ?? 0) > 0) {
      return { sessionId, steps: [] };
    }
    
    // Session mismatch - return empty to prevent cross-session contamination
    if (rawDynamicAgentState.sessionId && rawDynamicAgentState.sessionId !== sessionId) {
      return { sessionId, steps: [] };
    }
    
    // Check if steps are plan steps (have 'description') vs graph steps (have 'node')
    // Graph steps are rendered by GraphStateCard via renderActivityMessages
    const steps = rawDynamicAgentState.steps ?? [];
    if (steps.length > 0 && !isPlanSteps(steps)) {
      // These are graph steps - return empty, they're handled by activity renderers
      return { sessionId, steps: [] };
    }
    
    // Session matches - return raw state as-is (with valid plan steps)
    if (rawDynamicAgentState.sessionId === sessionId) {
      return rawDynamicAgentState;
    }
    
    // No sessionId on raw state - attach current sessionId
    return { sessionId, steps: steps as Step[] };
  }, [rawDynamicAgentState, sessionId]);
  
  /**
   * Set agent state with session scoping and plan deletion tracking.
   * Handles:
   * - Clearing all steps (plan deletion)
   * - Normal state updates with sessionId attachment
   */
  const setDynamicAgentState = useCallback(
    (nextState: AgentStepState) => {
      const nextSteps = nextState?.steps ?? [];
      
      // Handle plan deletion (empty steps)
      if (nextSteps.length === 0) {
        debug.log('[AgentStepState] Clearing all steps (plan deleted)');
        planDeletionInfoRef.current = {
          deleted: true,
          lastAssistantId: latestAssistantMessageIdRef.current,
        };
        setRawDynamicAgentState({ sessionId, steps: [] });
        return;
      }
      
      // Normal state update with steps
      planDeletionInfoRef.current = {
        deleted: false,
        lastAssistantId: latestAssistantMessageIdRef.current,
      };
      setRawDynamicAgentState({ ...nextState, sessionId });
    },
    [sessionId, setRawDynamicAgentState],
  );
  
  /**
   * Fix raw state that arrives without sessionId but has steps.
   * Proactively adds sessionId to prevent cross-session issues.
   */
  useEffect(() => {
    if (
      rawDynamicAgentState &&
      !rawDynamicAgentState.sessionId &&
      Array.isArray(rawDynamicAgentState.steps) &&
      rawDynamicAgentState.steps.length > 0 &&
      !planDeletionInfoRef.current.deleted
    ) {
      setRawDynamicAgentState({ ...rawDynamicAgentState, sessionId });
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
  const initialScopedSteps = useMemo(() => {
    if (!initialAgentStepState) return null;
    if (initialAgentStepState.sessionId && initialAgentStepState.sessionId !== sessionId) {
      return null;
    }
    return initialAgentStepState.steps ?? [];
  }, [initialAgentStepState, sessionId]);

  // Track if we've successfully restored from initial state for the current session
  const hasRestoredFromInitialRef = useRef(false);
  
  // Reset restoration flag when session changes
  useEffect(() => {
    hasRestoredFromInitialRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    // Skip if no initial steps to restore
    if (!initialScopedSteps || initialScopedSteps.length === 0) {
      return;
    }
    
    // Skip if already restored for this session
    if (hasRestoredFromInitialRef.current) {
      return;
    }
    
    // Skip if current state already has steps for this session
    // (user may have added steps after initial load)
    const currentStepsCount = dynamicAgentState.steps?.length ?? 0;
    if (dynamicAgentState.sessionId === sessionId && currentStepsCount > 0) {
      hasRestoredFromInitialRef.current = true; // Mark as "restored" since we have data
      return;
    }
    
    // Restore initial steps from DB
    debug.log(`[AgentStepState] Restoring ${initialScopedSteps.length} steps from DB for session ${sessionId.slice(0, 8)}`);
    hasRestoredFromInitialRef.current = true;
    setRawDynamicAgentState({ sessionId, steps: initialScopedSteps });
  }, [initialScopedSteps, dynamicAgentState, sessionId, setRawDynamicAgentState]);
  
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

