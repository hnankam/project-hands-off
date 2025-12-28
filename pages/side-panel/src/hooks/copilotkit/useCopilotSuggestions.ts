/**
 * Centralized CopilotKit Suggestions Hook
 *
 * V2 Implementation using useConfigureSuggestions from @copilotkit/react-core/v2.
 * Uses DynamicSuggestionsConfig with providerAgentId set to 'dynamic_agent'.
 */

import { useEffect, useRef, useState } from 'react';
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
 * CRITICAL FIX: This hook creates a STABLE config object that only changes ONCE when enabled
 * becomes true for the first time. This prevents the double-configuration bug where:
 * 1. First render: enabled=false → configures with available="disabled"  
 * 2. Second render: enabled=true → configures with available="after-first-message"
 * 3. Each configuration change triggers new suggestion requests in CopilotKit
 *
 * By keeping the config stable (always "disabled" until enabled=true, then locked),
 * we only trigger suggestion generation once.
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
  
  const initialConfigRef = useRef<{ instructions: string; providerAgentId: string; available: SuggestionAvailability } | null>(null);
  
  // Initialize config on first render with the FIRST values we receive
  // This means if enabled=false initially, we start with 'disabled'
  // If enabled=true initially, we start with the target availability
  if (!initialConfigRef.current) {
    initialConfigRef.current = {
      instructions,
      providerAgentId,
      available: enabled ? available : 'disabled',
    };
  }
  
  // CRITICAL: Call useConfigureSuggestions with the FROZEN config
  // The config never changes after initialization, preventing any reconfiguration
  useConfigureSuggestions(initialConfigRef.current);
}
