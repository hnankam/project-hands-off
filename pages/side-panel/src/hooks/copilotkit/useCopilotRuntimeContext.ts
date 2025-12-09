/**
 * Centralized CopilotKit Runtime Context Hook
 *
 * This abstraction layer enables easy migration to CopilotKit v2.
 * When upgrading to v2, only this file needs to change.
 *
 * v1: Uses useCopilotContext
 * v2: Will use useCopilotKit
 */

import { useCopilotContext } from '@copilotkit/react-core';

export interface CopilotApiConfig {
  transcribeAudioUrl?: string;
  chatApiEndpoint?: string;
  headers?: Record<string, string>;
  // Add other API config properties as needed
}

export interface CopilotRuntimeContextValue {
  /** API configuration for the CopilotKit runtime */
  copilotApiConfig: CopilotApiConfig | undefined;
  /** The full context object (for advanced usage) */
  _rawContext: ReturnType<typeof useCopilotContext>;
}

/**
 * Centralized hook for accessing CopilotKit runtime context.
 *
 * Provides access to API configuration and other runtime settings.
 *
 * @example
 * ```tsx
 * const { copilotApiConfig } = useCopilotRuntimeContext();
 * if (copilotApiConfig?.transcribeAudioUrl) {
 *   // Use audio transcription
 * }
 * ```
 */
export function useCopilotRuntimeContext(): CopilotRuntimeContextValue {
  // v1 implementation using useCopilotContext
  const context = useCopilotContext();

  return {
    copilotApiConfig: context.copilotApiConfig as CopilotApiConfig | undefined,
    _rawContext: context,
  };
}

// === V2 MIGRATION ===
// When migrating to v2, replace the implementation with:
//
// import { useCopilotKit } from '@copilotkit/react-core/v2';
//
// export function useCopilotRuntimeContext(): CopilotRuntimeContextValue {
//   const copilotKit = useCopilotKit();
//
//   return {
//     copilotApiConfig: copilotKit.apiConfig, // verify v2 API
//     _rawContext: copilotKit,
//   };
// }

