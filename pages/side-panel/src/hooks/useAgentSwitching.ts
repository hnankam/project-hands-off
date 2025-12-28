/**
 * ================================================================================
 * useAgentSwitching Hook
 * ================================================================================
 * 
 * Custom hook that manages AI agent and model switching:
 * - Tracks active agent/model state
 * - Updates immediately when selection changes
 * - CopilotKit headers update automatically via useMemo
 * - No remount needed - messages stay in place
 * 
 * @module useAgentSwitching
 * ================================================================================
 */

import { useEffect } from 'react';

interface UseAgentSwitchingParams {
  selectedAgent: string;
  selectedModel: string;
  sessionId: string;
}

export const useAgentSwitching = ({
  selectedAgent,
  selectedModel,
  sessionId,
}: UseAgentSwitchingParams) => {
  // We no longer use internal state here because selectedAgent/selectedModel
  // from useSessionData are already the source of truth.
  // Using props directly ensures ZERO lag render cycles.
  const activeAgent = selectedAgent;
  const activeModel = selectedModel;

  return {
    activeAgent,
    activeModel,
  };
};
