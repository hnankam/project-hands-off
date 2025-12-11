/**
 * Centralized CopilotKit Agent Hook
 *
 * This abstraction layer provides a stable API for agent state management.
 *
 * V2 Implementation:
 * Uses useAgent from @copilotkit/react-core/v2
 */

import { useAgent } from '@copilotkit/react-core/v2';
import { useCallback, useMemo, useRef } from 'react';

// UseAgentUpdate enum values (not exported from the package)
// These control which updates trigger re-renders
const UseAgentUpdate = {
  OnMessagesChanged: 'OnMessagesChanged',
  OnStateChanged: 'OnStateChanged',
  OnRunStatusChanged: 'OnRunStatusChanged',
} as const;

// Stable updates array (prevents re-initialization on each render)
const AGENT_UPDATES = [
  UseAgentUpdate.OnStateChanged,
  UseAgentUpdate.OnMessagesChanged,
  UseAgentUpdate.OnRunStatusChanged,
] as const;

export interface CopilotAgentOptions<T> {
  /** The agent identifier */
  agentId: string;
  /** Initial state for the agent (not used in V2 - state comes from backend) */
  initialState?: T;
}

export interface CopilotAgentState<T> {
  /** The name of the agent currently being used */
  name: string;
  /** The name of the current LangGraph node */
  nodeName: string | undefined;
  /** The current state of the agent */
  state: T;
  /** A function to update the state of the agent */
  setState: (state: T | ((prev: T) => T)) => void;
  /** A boolean indicating if the agent is currently running */
  running: boolean;
  /** A function to start the agent */
  start: () => void;
  /** A function to stop the agent */
  stop: () => void;
  /** A function to re-run the agent */
  run: (hint?: string) => void;
}

/**
 * Centralized hook for CopilotKit agent state management.
 *
 * V2 implementation using useAgent from @copilotkit/react-core/v2
 *
 * @example
 * ```tsx
 * const { state, setState } = useCopilotAgent<MyState>({
 *   agentId: 'my-agent',
 * });
 * ```
 */
export function useCopilotAgent<T>({
  agentId,
}: CopilotAgentOptions<T>): CopilotAgentState<T> {
  // Stable empty state fallback (prevents new object reference each render)
  const emptyStateRef = useRef<T>({} as T);
  
  // V2 implementation using useAgent
  // IMPORTANT: Must subscribe to OnStateChanged to re-render when STATE_SNAPSHOT events arrive
  const { agent } = useAgent({
    agentId,
    updates: AGENT_UPDATES as any,
  });

  // Get agent state with proper typing
  // Note: V2 AbstractAgent type is limited, use type assertions for extended properties
  const agentAny = agent as any;
  
  // Use stable empty state ref to prevent new object reference each render
  const state = useMemo<T>(() => {
    return (agentAny?.state ?? emptyStateRef.current) as T;
  }, [agentAny?.state]);
  
  const nodeName = agentAny?.nodeName as string | undefined;
  const running = agentAny?.isRunning ?? false;

  // setState wrapper for compatibility - use ref to avoid state in deps
  const stateRef = useRef(state);
  stateRef.current = state;
  
  const setState = useCallback((newState: T | ((prev: T) => T)) => {
    if (agentAny?.setState) {
      if (typeof newState === 'function') {
        const updateFn = newState as (prev: T) => T;
        agentAny.setState(updateFn(stateRef.current));
      } else {
        agentAny.setState(newState);
      }
    }
  }, [agentAny]);

  // Start agent - V2 agent runs are triggered via CopilotChat component
  const start = useCallback(() => {
    // No-op: V2 agent runs are triggered via CopilotChat component input
  }, []);

  // Stop agent
  const stop = useCallback(() => {
    if (agentAny?.stop) {
      agentAny.stop();
    }
  }, [agentAny]);

  // Run agent - V2 agent runs are triggered via CopilotChat component
  const run = useCallback((_hint?: string) => {
    // No-op: V2 agent runs are triggered via CopilotChat component input
  }, []);

  return {
    name: agentId,
    nodeName,
    state,
    setState,
    running,
    start,
    stop,
    run,
  };
}
