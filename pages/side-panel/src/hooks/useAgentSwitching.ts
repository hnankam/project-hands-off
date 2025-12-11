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

import { useState, useEffect, useRef } from 'react';
import { debug } from '@extension/shared';

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
  // Track the actual agent/model being used by CopilotKit
  const [activeAgent, setActiveAgent] = useState(selectedAgent);
  const [activeModel, setActiveModel] = useState(selectedModel);

  // Track previous values to detect changes
  const previousAgentRef = useRef(selectedAgent);
  const previousModelRef = useRef(selectedModel);
  const previousSessionIdRef = useRef(sessionId);
  const isFirstRenderRef = useRef(true);

  /**
   * Update active agent/model when selection changes.
   * Instant update - no visual feedback needed since there's no remount.
   */
  useEffect(() => {
    const agentChanged = previousAgentRef.current !== selectedAgent;
    const modelChanged = previousModelRef.current !== selectedModel;
    const sessionChanged = previousSessionIdRef.current !== sessionId;

    // Skip logging on first render
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      previousAgentRef.current = selectedAgent;
      previousModelRef.current = selectedModel;
      previousSessionIdRef.current = sessionId;
      setActiveAgent(selectedAgent);
      setActiveModel(selectedModel);
      return;
    }

    // Update refs
    previousAgentRef.current = selectedAgent;
    previousModelRef.current = selectedModel;
    previousSessionIdRef.current = sessionId;

    // Update active state if there's a change
    if (agentChanged || modelChanged || sessionChanged) {
      if (agentChanged || modelChanged) {
        debug.log('[useAgentSwitching] Agent/Model changed:', {
          agent: selectedAgent,
          model: selectedModel,
          sessionChanged,
        });
      }
      setActiveAgent(selectedAgent);
      setActiveModel(selectedModel);
    }
  }, [selectedAgent, selectedModel, sessionId]);

  return {
    activeAgent,
    activeModel,
  };
};
