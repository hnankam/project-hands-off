/**
 * Centralized CopilotKit Suggestions Hook
 *
 * This abstraction layer enables easy migration to CopilotKit v2.
 * When upgrading to v2, only this file needs to change.
 *
 * v1: Uses useCopilotChatSuggestions
 * v2: Will use useConfigureSuggestions
 */

import { useCopilotChatSuggestions } from '@copilotkit/react-ui';

export interface CopilotSuggestionsConfig {
  /** Whether suggestions are enabled */
  enabled: boolean;
  /** Instructions for generating suggestions */
  instructions: string;
  /** Minimum number of suggestions to generate */
  minSuggestions?: number;
  /** Maximum number of suggestions to generate */
  maxSuggestions?: number;
}

/**
 * Centralized hook for CopilotKit chat suggestions.
 *
 * Configures AI-powered suggestion generation for the chat interface.
 *
 * @example
 * ```tsx
 * useCopilotSuggestions({
 *   enabled: true,
 *   instructions: 'Suggest follow-up questions based on the conversation',
 *   minSuggestions: 2,
 *   maxSuggestions: 5,
 * });
 * ```
 */
export function useCopilotSuggestions({
  enabled,
  instructions,
  minSuggestions = 2,
  maxSuggestions = 5,
}: CopilotSuggestionsConfig): void {
  // v1 implementation using useCopilotChatSuggestions
  // Note: Hook must be called unconditionally per React rules
  useCopilotChatSuggestions({
    instructions: enabled ? instructions : '',
    minSuggestions: enabled ? minSuggestions : 0,
    maxSuggestions: enabled ? maxSuggestions : 0,
  });
}

// === V2 MIGRATION ===
// When migrating to v2, replace the implementation with:
//
// import { useConfigureSuggestions } from '@copilotkit/react-core/v2';
//
// export function useCopilotSuggestions(config: CopilotSuggestionsConfig): void {
//   useConfigureSuggestions({
//     enabled: config.enabled,
//     instructions: config.instructions,
//     minCount: config.minSuggestions,
//     maxCount: config.maxSuggestions,
//     // API structure may differ - verify v2 docs
//   });
// }

