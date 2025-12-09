/**
 * Centralized CopilotKit Agent Hook
 *
 * This abstraction layer enables easy migration to CopilotKit v2.
 * When upgrading to v2, only this file needs to change.
 *
 * v1: Uses useCoAgent
 * v2: Will use useAgent({ agentId })
 */

import { useCoAgent } from '@copilotkit/react-core';

export interface CopilotAgentOptions<T> {
  /** The agent identifier */
  agentId: string;
  /** Initial state for the agent */
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
 * @example
 * ```tsx
 * const { state, setState } = useCopilotAgent<MyState>({
 *   agentId: 'my-agent',
 *   initialState: { count: 0 },
 * });
 * ```
 */
export function useCopilotAgent<T>({
  agentId,
  initialState,
}: CopilotAgentOptions<T>): CopilotAgentState<T> {
  // v1 implementation using useCoAgent
  const {
    name,
    nodeName,
    state,
    setState,
    running,
    start,
    stop,
    run,
  } = useCoAgent<T>({
    name: agentId,
    initialState,
  });

  return {
    name,
    nodeName,
    state,
    setState,
    running,
    start,
    stop,
    run,
  };
}

// === V2 MIGRATION ===
// When migrating to v2, replace the implementation with:
//
// import { useAgent } from '@copilotkit/react-core/v2';
//
// export function useCopilotAgent<T>({
//   agentId,
//   initialState,
// }: CopilotAgentOptions<T>): CopilotAgentState<T> {
//   const agent = useAgent({ agentId });
//
//   return {
//     name: agent.name,
//     nodeName: agent.nodeName, // verify v2 API
//     state: agent.state as T,
//     setState: (newState) => {
//       if (typeof newState === 'function') {
//         agent.setState((newState as Function)(agent.state));
//       } else {
//         agent.setState(newState);
//       }
//     },
//     running: agent.isRunning, // verify v2 API
//     start: agent.start, // verify v2 API
//     stop: agent.stop, // verify v2 API
//     run: agent.run, // verify v2 API
//   };
// }

