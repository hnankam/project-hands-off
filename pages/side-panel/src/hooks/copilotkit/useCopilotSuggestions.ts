/**
 * Centralized CopilotKit Suggestions Hook
 *
 * V2 Implementation using useConfigureSuggestions from @copilotkit/react-core/v2.
 * Uses DynamicSuggestionsConfig with providerAgentId set to 'dynamic_agent'.
 */

import { useConfigureSuggestions } from '@copilotkit/react-core/v2';

// Must match the agentId used in CopilotChat component
const DEFAULT_AGENT_ID = 'dynamic_agent';

// SuggestionAvailability: "before-first-message" | "after-first-message" | "always" | "disabled"
type SuggestionAvailability = 'before-first-message' | 'after-first-message' | 'always' | 'disabled';

export interface CopilotSuggestionsConfig {
  /** Whether suggestions are enabled */
  enabled: boolean;
  /** Instructions for generating suggestions */
  instructions: string;
  /** Agent ID that provides suggestions (defaults to 'dynamic_agent') */
  providerAgentId?: string;
  /** When suggestions are available (defaults to 'after-first-message' to prevent errors on load) */
  available?: SuggestionAvailability;
}

/**
 * Configure chat suggestions.
 *
 * When enabled=false, suggestions are completely disabled (not just hidden).
 * This prevents SuggestionEngine from running and causing errors.
 *
 * @example
 * ```tsx
 * useCopilotSuggestions({
 *   enabled: true,
 *   instructions: 'Suggest follow-up questions',
 * });
 * ```
 */
export function useCopilotSuggestions({
  enabled,
  instructions,
  providerAgentId = DEFAULT_AGENT_ID,
  available = 'after-first-message',
}: CopilotSuggestionsConfig): void {
  // V2 DynamicSuggestionsConfig:
  // - When disabled, set available='disabled' to stop SuggestionEngine entirely
  // - When enabled, use 'after-first-message' to prevent errors during initial load
  useConfigureSuggestions({
    instructions,
    providerAgentId,
    available: enabled ? available : 'disabled',
  });
}
