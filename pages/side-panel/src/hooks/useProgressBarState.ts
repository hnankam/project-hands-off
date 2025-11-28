import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useProgressBarState Hook
 * 
 * Manages the state and visibility of the progress bar in the chat interface.
 * Tracks whether progress bar data exists and whether it should be displayed,
 * and notifies parent components of state changes.
 * 
 * Features:
 * - Tracks existence of progress data (hasProgressBar)
 * - Manages visibility state (showProgressBar)
 * - Provides stable toggle function
 * - Notifies parent only when state actually changes (prevents unnecessary re-renders)
 * - Uses ref pattern for callback to prevent effect re-runs
 * 
 * @param hasProgressData - Whether there's progress data to display
 * @param onProgressBarStateChange - Optional callback to notify parent of state changes
 * @returns Object containing showProgressBar state and toggleProgressBar function
 * 
 * @example
 * ```tsx
 * const { showProgressBar, toggleProgressBar } = useProgressBarState(
 *   dynamicAgentState.steps?.length > 0,
 *   onProgressBarStateChange
 * );
 * ```
 */
export const useProgressBarState = (
  hasProgressData: boolean,
  onProgressBarStateChange?: (
    hasProgressBar: boolean,
    showProgressBar: boolean,
    onToggle: () => void
  ) => void
) => {
  // ============================================================================
  // STATE
  // ============================================================================
  
  // State for progress bar visibility (starts visible by default)
  const [showProgressBar, setShowProgressBar] = useState(true);

  // ============================================================================
  // REFS
  // ============================================================================
  
  // Create stable toggle function
  const toggleProgressBar = useCallback(() => {
    setShowProgressBar(prev => !prev);
  }, []);

  // Track previous state for change detection
  const prevStateRef = useRef<{ hasProgressBar: boolean; showProgressBar: boolean } | null>(null);
  const prevHasProgressRef = useRef<boolean>(hasProgressData);
  
  // Ref for callback to prevent effect re-runs
  const onProgressBarStateChangeRef = useRef(onProgressBarStateChange);

  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  // Keep callback ref in sync
  useEffect(() => {
    onProgressBarStateChangeRef.current = onProgressBarStateChange;
  }, [onProgressBarStateChange]);

  /**
   * Handle progress data changes (show/hide based on data availability).
   * Consolidated logic for both appearance and disappearance.
   */
  useEffect(() => {
    const hadProgressPreviously = prevHasProgressRef.current;
    const hasProgressNow = hasProgressData;
    
    // Progress data disappeared - force hide
    if (!hasProgressNow && showProgressBar) {
      setShowProgressBar(false);
    }
    
    // Progress data appeared after being absent - show
    if (hasProgressNow && !hadProgressPreviously) {
      setShowProgressBar(true);
    }
    
    // Update ref for next comparison
    prevHasProgressRef.current = hasProgressNow;
  }, [hasProgressData, showProgressBar]);

  /**
   * Notify parent component of state changes.
   * Only triggers when values actually change to prevent unnecessary updates.
   */
  useEffect(() => {
    const callback = onProgressBarStateChangeRef.current;
    if (!callback) {
      return;
    }

    const previous = prevStateRef.current;
    if (
      !previous ||
      previous.hasProgressBar !== hasProgressData ||
      previous.showProgressBar !== showProgressBar
    ) {
      prevStateRef.current = { 
        hasProgressBar: hasProgressData, 
        showProgressBar,
      };
      callback(hasProgressData, showProgressBar, toggleProgressBar);
    }
  }, [hasProgressData, showProgressBar, toggleProgressBar]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    showProgressBar,
    toggleProgressBar,
  };
};
