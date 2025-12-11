/**
 * Centralized CopilotKit Tool Hooks
 *
 * V2 Implementation using @copilotkit/react-core/v2:
 * - useFrontendTool: Register frontend tools with Zod schemas
 * - useHumanInTheLoop: Human confirmation workflows
 * - useRenderToolCall: Returns render function for tool calls
 *
 * Tool renderers should be configured via:
 * 1. The `render` property on useFrontendTool configs (frontend tools)
 * 2. The `renderToolCalls` prop on CopilotKitProvider (backend tools)
 */

import {
  useFrontendTool as useFrontendToolV2,
  useHumanInTheLoop as useHumanInTheLoopV2,
  useRenderToolCall as useRenderToolCallV2,
} from '@copilotkit/react-core/v2';

/** Register a frontend tool with Zod schema parameters */
export function useFrontendTool(config: any, deps?: any[]): void {
  useFrontendToolV2(config as any, deps);
}

/** Register a human-in-the-loop confirmation tool */
export function useHumanInTheLoop(config: any, deps?: any[]): void {
  useHumanInTheLoopV2(config as any, deps);
}

/** Get render function for tool calls */
export function useRenderToolCall() {
  return useRenderToolCallV2();
}

// =============================================================================
// Types
// =============================================================================

/** Frontend action configuration */
export interface FrontendAction<T = unknown> {
  name: string;
  description: string;
  parameters?: unknown;
  handler: (args: T) => Promise<unknown>;
  render?: (props: ActionRenderProps<T>) => React.ReactNode;
}

/** Props passed to action render functions */
export interface ActionRenderProps<T = unknown> {
  args: T;
  result?: unknown;
  status: RenderFunctionStatus;
  handler?: (args: T) => Promise<unknown>;
}

/** Status of a render function */
export type RenderFunctionStatus = 'inProgress' | 'complete' | 'executing';
