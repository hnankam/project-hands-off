/**
 * ================================================================================
 * useAgentSwitching Hook
 * ================================================================================
 * 
 * Custom hook that manages AI agent and model switching:
 * - Implements a 3-step state machine for smooth switching
 * - Step 1: Save current messages
 * - Step 2: Switch agent/model (remounts CopilotKit)
 * - Step 3: Restore messages
 * - Shows visual feedback during the switch
 * 
 * @module useAgentSwitching
 * ================================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { sessionStorage } from '@extension/storage';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

type SwitchingStep = 1 | 2 | 3 | 4;

// Small utility to replace nested setTimeout chains with readable awaits
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Centralized timing constants to keep UX intact and easy to adjust
const SAVE_DELAY_MS = 200;
const SWITCH_DELAY_MS = 200;
const REMOUNT_WAIT_MS = 800;
const RESTORE_DELAY_MS = 200;
const COMPLETE_CHECKS_DELAY_MS = 300;
const CLOSE_OVERLAY_DELAY_MS = 400;
const RESET_STEP_DELAY_MS = 550; // 500ms transition + buffer

interface UseAgentSwitchingParams {
  selectedAgent: string;
  selectedModel: string;
  sessionId: string;
  handleSaveMessages: () => Promise<void>;
  handleLoadMessages: () => void;
}

export const useAgentSwitching = ({
  selectedAgent,
  selectedModel,
  sessionId,
  handleSaveMessages,
  handleLoadMessages,
}: UseAgentSwitchingParams) => {
  // Track the actual agent/model being used by CopilotKit (lags behind selection during switch)
  const [activeAgent, setActiveAgent] = useState(selectedAgent);
  const [activeModel, setActiveModel] = useState(selectedModel);
  
  // Switching state
  const [isSwitchingAgent, setIsSwitchingAgent] = useState(false);
  const [switchingStep, setSwitchingStep] = useState<SwitchingStep>(1);

  // Track previous values to detect changes
  const previousAgentRef = useRef(selectedAgent);
  const previousModelRef = useRef(selectedModel);
  const previousSessionIdRef = useRef(sessionId);
  // Token to cancel an in-flight switch sequence when inputs change again
  const switchRunIdRef = useRef(0);

  // Reset switching state when the active session changes to prevent carry-over
  // NOTE: Only depends on sessionId - NOT on selectedAgent/selectedModel
  // to avoid resetting the switching state when user changes agent/model
  // NOTE: Do NOT update previousSessionIdRef here - let the switching effect detect session changes
  useEffect(() => {
    console.log(ts(), '[useAgentSwitching] Session changed, resetting switching state:', {
      sessionId: sessionId?.slice(0, 8),
      selectedAgent,
      selectedModel,
    });
    switchRunIdRef.current++;
    // Don't update previousAgentRef/previousModelRef here - they will be updated by switching effect
    // This allows the switching effect to see the old values and detect session-based changes
    setActiveAgent(selectedAgent);
    setActiveModel(selectedModel);
    setIsSwitchingAgent(false);
    setSwitchingStep(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Agent switching logic - handles the 3-step process with cancellation and precise timing
  useEffect(() => {
    const agentChanged = previousAgentRef.current !== selectedAgent;
    const modelChanged = previousModelRef.current !== selectedModel;
    const sessionChanged = previousSessionIdRef.current !== sessionId;

    if (!(agentChanged || modelChanged)) {
      previousAgentRef.current = selectedAgent;
      previousModelRef.current = selectedModel;
      return;
    }

    // Don't trigger switching modal when session changed - agent/model values update due to new session
    if (sessionChanged) {
      console.log(ts(), '[useAgentSwitching] Agent/Model changed due to session switch, skipping switch process');
      previousAgentRef.current = selectedAgent;
      previousModelRef.current = selectedModel;
      previousSessionIdRef.current = sessionId;
      setActiveAgent(selectedAgent);
      setActiveModel(selectedModel);
      return;
    }

    // Don't trigger switching modal when clearing to empty values (no team/no agents)
    // or when initially loading with empty values
    if (!selectedAgent || !selectedModel) {
      console.log(ts(), '[useAgentSwitching] Agent/Model cleared to empty, skipping switch process');
      previousAgentRef.current = selectedAgent;
      previousModelRef.current = selectedModel;
      setActiveAgent(selectedAgent);
      setActiveModel(selectedModel);
      return;
    }

    // Skip switching process if this is initial auto-selection (previous values were empty)
    // This prevents duplicate message loading during initial page load
    const wasEmpty = !previousAgentRef.current || !previousModelRef.current;
    if (wasEmpty && selectedAgent && selectedModel) {
      console.log(ts(), '[useAgentSwitching] Initial agent/model auto-selection detected, skipping switch process');
      previousAgentRef.current = selectedAgent;
      previousModelRef.current = selectedModel;
      setActiveAgent(selectedAgent);
      setActiveModel(selectedModel);
      return;
    }

    console.log(ts(), '[useAgentSwitching] Agent/Model change detected (user initiated)');

    // Increment run id to cancel any in-flight sequences
    const runId = ++switchRunIdRef.current;

    (async () => {
      // Step 1: Saving messages (BEFORE changing the key)
      setSwitchingStep(1);
      setIsSwitchingAgent(true);

      await delay(SAVE_DELAY_MS);
      if (switchRunIdRef.current !== runId) return; // canceled by a newer change

      console.log(ts(), '[useAgentSwitching] Step 1: Saving messages');
      try {
        await handleSaveMessages();
        console.log(ts(), '[useAgentSwitching] Messages saved, now switching agent/model');
      } catch (error) {
        console.error(ts(), '[useAgentSwitching] Failed to save messages, continuing with switch', error);
      }

      await delay(SWITCH_DELAY_MS);
      if (switchRunIdRef.current !== runId) return;

      // Step 2: NOW update the active agent/model (this will remount CopilotKit)
      console.log(ts(), '[useAgentSwitching] Step 2: Switching agent/model');
      setSwitchingStep(2);
      setActiveAgent(selectedAgent);
      setActiveModel(selectedModel);

      // Wait for CopilotKit to fully remount
      await delay(REMOUNT_WAIT_MS);
      if (switchRunIdRef.current !== runId) return;

      // Step 3: Restore messages
      console.log(ts(), '[useAgentSwitching] Step 3: Restoring messages');
      setSwitchingStep(3);

      await delay(RESTORE_DELAY_MS);
      if (switchRunIdRef.current !== runId) return;
      handleLoadMessages();

      // Set to step 4 (> 3) to show all steps as complete with green checkmarks
      await delay(COMPLETE_CHECKS_DELAY_MS);
      if (switchRunIdRef.current !== runId) return;
      console.log(ts(), '[useAgentSwitching] All steps complete');
      setSwitchingStep(4 as SwitchingStep);

      // End switching after showing completion
      await delay(CLOSE_OVERLAY_DELAY_MS);
      if (switchRunIdRef.current !== runId) return;
      console.log(ts(), '[useAgentSwitching] Switch complete, closing overlay');
      setIsSwitchingAgent(false);

      // Reset step AFTER the overlay fade-out transition completes (500ms as per CSS)
      await delay(RESET_STEP_DELAY_MS);
      if (switchRunIdRef.current !== runId) return;
      setSwitchingStep(1 as SwitchingStep);
    })();

    previousAgentRef.current = selectedAgent;
    previousModelRef.current = selectedModel;
    previousSessionIdRef.current = sessionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent, selectedModel, sessionId]);

  return {
    activeAgent,
    activeModel,
    isSwitchingAgent,
    switchingStep,
  };
};