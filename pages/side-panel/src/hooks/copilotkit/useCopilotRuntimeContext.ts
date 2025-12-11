/**
 * Centralized CopilotKit Runtime Context Hook
 *
 * This abstraction layer provides access to CopilotKit runtime context.
 *
 * V2 Implementation:
 * Uses useCopilotKit from @copilotkit/react-core/v2
 */

import { useCopilotKit } from '@copilotkit/react-core/v2';

export interface CopilotApiConfig {
  transcribeAudioUrl?: string;
  chatApiEndpoint?: string;
  headers?: Record<string, string>;
  // Add other API config properties as needed
}

export interface CopilotRuntimeContextValue {
  /** API configuration for the CopilotKit runtime */
  copilotApiConfig: CopilotApiConfig | undefined;
  /** The copilotkit instance for low-level operations */
  copilotkit: ReturnType<typeof useCopilotKit>['copilotkit'];
  /** Stop a running agent */
  stopAgent: (options: { agentId: string }) => void;
  /** Run an agent */
  runAgent: (options: { agentId: string }) => Promise<void>;
}

/**
 * Centralized hook for accessing CopilotKit runtime context.
 *
 * V2 implementation using useCopilotKit.
 *
 * @example
 * ```tsx
 * const { copilotkit, stopAgent } = useCopilotRuntimeContext();
 * ```
 */
export function useCopilotRuntimeContext(): CopilotRuntimeContextValue {
  // V2 implementation using useCopilotKit
  const { copilotkit } = useCopilotKit();

  return {
    copilotApiConfig: undefined, // V2 doesn't expose this directly
    copilotkit,
    // Map agentId to agent for V2 API compatibility
    // Note: V2 beta types expect AbstractAgent, but runtime accepts string
    stopAgent: (options) => copilotkit?.stopAgent({ agent: options.agentId as any }),
    runAgent: async (options) => {
      await copilotkit?.runAgent({ agent: options.agentId as any });
    },
  };
}
