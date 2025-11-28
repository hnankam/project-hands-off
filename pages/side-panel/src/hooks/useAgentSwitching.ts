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

import { useState, useEffect, useRef, useCallback } from 'react';
import { debug } from '@extension/shared';
import { sessionStorage } from '@extension/storage';

type SwitchingStep = 1 | 2 | 3 | 4;

// Small utility to replace nested setTimeout chains with readable awaits
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Centralized timing constants (tuned for optimal UX)
const SAVE_DELAY_MS = 200;            // Allow UI to show "Saving..." state
const SWITCH_DELAY_MS = 200;          // Buffer after save completes
const REMOUNT_WAIT_MS = 800;          // Wait for CopilotKit to fully remount
const RESTORE_DELAY_MS = 200;         // Allow "Restoring..." state to show
const COMPLETE_CHECKS_DELAY_MS = 300; // Show checkmarks briefly
const CLOSE_OVERLAY_DELAY_MS = 400;   // Keep overlay visible for user feedback
const RESET_STEP_DELAY_MS = 550;      // Match CSS transition (500ms) + buffer

interface UseAgentSwitchingParams {
  selectedAgent: string;
  selectedModel: string;
  sessionId: string;
  handleSaveMessages: () => Promise<void>;
  handleLoadMessages: () => void;
  isLoadingFromDBRef: React.MutableRefObject<boolean>;
}

export const useAgentSwitching = ({
  selectedAgent,
  selectedModel,
  sessionId,
  handleSaveMessages,
  handleLoadMessages,
  isLoadingFromDBRef,
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
  // Track current session for cancellation during switch
  const currentSessionIdRef = useRef(sessionId);
  // Token to cancel an in-flight switch sequence when inputs change again
  const switchRunIdRef = useRef(0);
  // Track if this is the first render of session reset effect
  const isFirstSessionResetRef = useRef(true);
  // Track if switching effect has completed initial setup
  const hasSwitchingEffectInitializedRef = useRef(false);

  /**
   * Reset switching state when session changes.
   * Consolidates session change handling into a single effect.
   */
  useEffect(() => {
    // Skip on first render - this is initial mount, not a session change
    if (isFirstSessionResetRef.current) {
      isFirstSessionResetRef.current = false;
      currentSessionIdRef.current = sessionId;
      return;
    }
    
    // Check if session actually changed
    if (currentSessionIdRef.current === sessionId) {
      return;
    }
    
    debug.log('[useAgentSwitching] Session changed, resetting state:', {
      from: currentSessionIdRef.current?.slice(0, 8),
      to: sessionId?.slice(0, 8),
    });
    
    // Cancel in-flight switches and update refs
    switchRunIdRef.current++;
    currentSessionIdRef.current = sessionId;
    
    // Reset switching state
    setActiveAgent(selectedAgent);
    setActiveModel(selectedModel);
    setIsSwitchingAgent(false);
    setSwitchingStep(1);
  }, [sessionId, selectedAgent, selectedModel]);

  /**
   * Helper function to update refs and optionally active state.
   * Reduces code duplication across early returns.
   */
  const updateRefsAndActiveState = useCallback((
    agent: string,
    model: string,
    session: string,
    updateActive = true
  ) => {
    previousAgentRef.current = agent;
    previousModelRef.current = model;
    previousSessionIdRef.current = session;
    if (updateActive) {
      setActiveAgent(agent);
      setActiveModel(model);
    }
  }, []);

  // Agent switching logic - handles the 3-step process with cancellation and precise timing
  useEffect(() => {
    const agentChanged = previousAgentRef.current !== selectedAgent;
    const modelChanged = previousModelRef.current !== selectedModel;
    const sessionChanged = previousSessionIdRef.current !== sessionId;

    // Don't trigger modal on first run of this effect - this is initial load
    if (!hasSwitchingEffectInitializedRef.current) {
      debug.log('[useAgentSwitching] First run of switching effect (initial load), skipping modal');
      hasSwitchingEffectInitializedRef.current = true;
      updateRefsAndActiveState(selectedAgent, selectedModel, sessionId);
      return;
    }

    // No changes detected
    if (!(agentChanged || modelChanged)) {
      updateRefsAndActiveState(selectedAgent, selectedModel, sessionId, false);
      return;
    }

    // Don't trigger switching modal when session changed - agent/model values update due to new session
    if (sessionChanged) {
      debug.log('[useAgentSwitching] Agent/Model changed due to session switch, skipping switch process');
      updateRefsAndActiveState(selectedAgent, selectedModel, sessionId);
      return;
    }

    // Don't trigger modal if we're loading from DB - this is not a user-initiated change
    if (isLoadingFromDBRef.current) {
      debug.log('[useAgentSwitching] Change from DB load detected, skipping modal');
      updateRefsAndActiveState(selectedAgent, selectedModel, sessionId);
      return;
    }

    // Don't trigger switching modal when clearing to empty values (no team/no agents)
    if (!selectedAgent || !selectedModel) {
      debug.log('[useAgentSwitching] Agent/Model cleared to empty, skipping switch process');
      updateRefsAndActiveState(selectedAgent, selectedModel, sessionId);
      return;
    }

    // Skip switching process if this is initial auto-selection (previous values were empty)
    // This prevents duplicate message loading during initial page load
    const wasEmpty = !previousAgentRef.current || !previousModelRef.current;
    if (wasEmpty && selectedAgent && selectedModel) {
      debug.log('[useAgentSwitching] Initial agent/model auto-selection detected, skipping switch process');
      updateRefsAndActiveState(selectedAgent, selectedModel, sessionId);
      return;
    }

    debug.log('[useAgentSwitching] Agent/Model change detected (user initiated)');

    // Increment run id to cancel any in-flight sequences
    const runId = ++switchRunIdRef.current;
    const switchSessionId = sessionId; // Capture session ID for this switch
    let cancelled = false; // Local cancellation flag for cleanup

    (async () => {
      // Helper to check if switch is still valid
      const isValid = () => {
        if (cancelled) {
          debug.log('[useAgentSwitching] Cancelled: component unmounted');
          return false;
        }
        if (switchRunIdRef.current !== runId) {
          debug.log('[useAgentSwitching] Cancelled: runId changed');
          return false;
        }
        if (currentSessionIdRef.current !== switchSessionId) {
          debug.log('[useAgentSwitching] Cancelled: session changed');
          return false;
        }
        return true;
      };

      // Step 1: Saving messages (BEFORE changing the key)
      setSwitchingStep(1);
      setIsSwitchingAgent(true);

      await delay(SAVE_DELAY_MS);
      if (!isValid()) return;

      debug.log('[useAgentSwitching] Step 1: Saving messages');
      try {
        await handleSaveMessages();
        debug.log('[useAgentSwitching] Messages saved, now switching agent/model');
      } catch (error) {
        debug.error('[useAgentSwitching] Failed to save messages, continuing with switch', error);
      }

      await delay(SWITCH_DELAY_MS);
      if (!isValid()) return;

      // Step 2: NOW update the active agent/model (this will remount CopilotKit)
      debug.log('[useAgentSwitching] Step 2: Switching agent/model');
      setSwitchingStep(2);
      setActiveAgent(selectedAgent);
      setActiveModel(selectedModel);

      // Wait for CopilotKit to fully remount
      await delay(REMOUNT_WAIT_MS);
      if (!isValid()) return;

      // Step 3: Restore messages
      debug.log('[useAgentSwitching] Step 3: Restoring messages');
      setSwitchingStep(3);

      await delay(RESTORE_DELAY_MS);
      if (!isValid()) return;
      
      // Final validation before restore
      if (currentSessionIdRef.current === switchSessionId) {
      handleLoadMessages();
      } else {
        debug.log('[useAgentSwitching] Session changed before restore, aborting');
        return;
      }

      // Set to step 4 (> 3) to show all steps as complete with green checkmarks
      await delay(COMPLETE_CHECKS_DELAY_MS);
      if (!isValid()) return;
      debug.log('[useAgentSwitching] All steps complete');
      setSwitchingStep(4 as SwitchingStep);

      // End switching after showing completion
      await delay(CLOSE_OVERLAY_DELAY_MS);
      if (!isValid()) return;
      debug.log('[useAgentSwitching] Switch complete, closing overlay');
      setIsSwitchingAgent(false);

      // Reset step AFTER the overlay fade-out transition completes (500ms as per CSS)
      await delay(RESET_STEP_DELAY_MS);
      if (!isValid()) return;
      setSwitchingStep(1 as SwitchingStep);
    })();

    updateRefsAndActiveState(selectedAgent, selectedModel, sessionId, false);

    // Cleanup function to cancel async operations on unmount
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent, selectedModel, sessionId, updateRefsAndActiveState]);

  return {
    activeAgent,
    activeModel,
    isSwitchingAgent,
    switchingStep,
  };
};