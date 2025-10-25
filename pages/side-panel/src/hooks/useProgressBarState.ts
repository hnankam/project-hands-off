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
 * - Uses ref to track previous state for change detection
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
  // State for progress bar visibility (starts visible by default)
  const [showProgressBar, setShowProgressBar] = useState(true);

  // Create stable toggle function
  const toggleProgressBar = useCallback(() => {
    setShowProgressBar(prev => !prev);
  }, []);

  // Track previous state for change detection
  const prevStateRef = useRef({ hasProgressBar: false, showProgressBar: true });

  /**
   * Effect: Notify parent component of state changes
   * Only triggers when values actually change to prevent unnecessary updates
   */
  useEffect(() => {
    // Only notify if values actually changed
    if (
      onProgressBarStateChange &&
      (prevStateRef.current.hasProgressBar !== hasProgressData ||
       prevStateRef.current.showProgressBar !== showProgressBar)
    ) {
      prevStateRef.current = { 
        hasProgressBar: hasProgressData, 
        showProgressBar 
      };
      onProgressBarStateChange(hasProgressData, showProgressBar, toggleProgressBar);
    }
  }, [hasProgressData, showProgressBar, onProgressBarStateChange, toggleProgressBar]);

  return {
    showProgressBar,
    toggleProgressBar,
  };
};

