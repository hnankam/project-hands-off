/**
 * Centralized CopilotKit Agent State Render Hook
 *
 * This abstraction layer enables easy migration to CopilotKit v2.
 * When upgrading to v2, only this file needs to change.
 *
 * v1: Uses useCoAgentStateRender
 * v2: Will observe agent.state directly or use v2 equivalent
 */

import { useCoAgentStateRender } from '@copilotkit/react-core';
import type { ReactNode } from 'react';

export type RenderStatus = 'inProgress' | 'complete' | 'executing';

export interface AgentStateRenderParams<T> {
  /** The current status of the agent */
  status: RenderStatus;
  /** The current state of the agent */
  state: T;
  /** The name of the current LangGraph node */
  nodeName?: string;
}

export interface CopilotAgentStateRenderOptions<T> {
  /** The agent identifier */
  agentId: string;
  /** Optional node name to filter renders */
  nodeName?: string;
  /** Render function that receives the current state and status */
  render: (params: AgentStateRenderParams<T>) => ReactNode;
}

/**
 * Centralized hook for rendering agent state.
 *
 * This hook allows you to render UI components based on agent state changes,
 * useful for showing progress, intermediate results, or agent activity.
 *
 * @example
 * ```tsx
 * useCopilotAgentStateRender<MyAgentState>({
 *   agentId: 'my-agent',
 *   render: ({ status, state }) => (
 *     <ProgressCard status={status} data={state.progress} />
 *   ),
 * });
 * ```
 */
export function useCopilotAgentStateRender<T>({
  agentId,
  nodeName,
  render,
}: CopilotAgentStateRenderOptions<T>): void {
  // v1 implementation using useCoAgentStateRender
  useCoAgentStateRender<T>({
    name: agentId,
    nodeName,
    render: ({ status, state, nodeName: currentNodeName }) => {
      return render({
        status: status as RenderStatus,
        state,
        nodeName: currentNodeName,
      });
    },
  });
}

// === V2 MIGRATION ===
// In v2, agent state rendering may work differently.
// Options to consider:
//
// 1. Use useAgent to get state and render in component:
//    const agent = useAgent({ agentId });
//    useEffect(() => {
//      // Handle state changes
//    }, [agent.state]);
//
// 2. If v2 has a dedicated state render hook, use that
//
// 3. Use CopilotKitProvider's defineToolCallRenderer for tool-based rendering

