/**
 * useAlerts Hook
 * 
 * Manages alert/toast state with auto-dismiss functionality.
 * Provides consistent alert handling across pages.
 */

import { useState, useEffect, useCallback } from 'react';
import { ANIMATION_DURATIONS, AUTO_DISMISS_DELAYS } from '../constants/ui';

export interface AlertState {
  message: string;
  visible: boolean;
  closing: boolean;
}

const createEmptyAlert = (): AlertState => ({
  message: '',
  visible: false,
  closing: false,
});

export interface UseAlertsOptions {
  /** Custom auto-dismiss delay for error alerts (ms) */
  errorDismissDelay?: number;
  /** Custom auto-dismiss delay for success alerts (ms) */
  successDismissDelay?: number;
  /** Custom animation duration for dismiss (ms) */
  animationDuration?: number;
}

export interface UseAlertsReturn {
  /** Current error state */
  error: AlertState;
  /** Current success state */
  success: AlertState;
  /** Set an error message */
  setError: (message: string) => void;
  /** Set a success message */
  setSuccess: (message: string) => void;
  /** Manually dismiss error */
  dismissError: () => void;
  /** Manually dismiss success */
  dismissSuccess: () => void;
  /** Clear all alerts */
  clearAll: () => void;
}

export function useAlerts(options: UseAlertsOptions = {}): UseAlertsReturn {
  const {
    errorDismissDelay = AUTO_DISMISS_DELAYS.error,
    successDismissDelay = AUTO_DISMISS_DELAYS.success,
    animationDuration = ANIMATION_DURATIONS.dismiss,
  } = options;

  const [errorState, setErrorState] = useState<AlertState>(createEmptyAlert);
  const [successState, setSuccessState] = useState<AlertState>(createEmptyAlert);

  // Dismiss handlers
  const dismissError = useCallback(() => {
    setErrorState(prev => ({ ...prev, closing: true }));
    setTimeout(() => {
      setErrorState(createEmptyAlert());
    }, animationDuration);
  }, [animationDuration]);

  const dismissSuccess = useCallback(() => {
    setSuccessState(prev => ({ ...prev, closing: true }));
    setTimeout(() => {
      setSuccessState(createEmptyAlert());
    }, animationDuration);
  }, [animationDuration]);

  // Set handlers
  const setError = useCallback((message: string) => {
    if (!message) return;
    setErrorState({
      message,
      visible: true,
      closing: false,
    });
  }, []);

  const setSuccess = useCallback((message: string) => {
    if (!message) return;
    setSuccessState({
      message,
      visible: true,
      closing: false,
    });
  }, []);

  const clearAll = useCallback(() => {
    setErrorState(createEmptyAlert());
    setSuccessState(createEmptyAlert());
  }, []);

  // Auto-dismiss error
  useEffect(() => {
    if (!errorState.message || !errorState.visible) return;

    const timer = setTimeout(() => {
      dismissError();
    }, errorDismissDelay);

    return () => clearTimeout(timer);
  }, [errorState.message, errorState.visible, errorDismissDelay, dismissError]);

  // Auto-dismiss success
  useEffect(() => {
    if (!successState.message || !successState.visible) return;

    const timer = setTimeout(() => {
      dismissSuccess();
    }, successDismissDelay);

    return () => clearTimeout(timer);
  }, [successState.message, successState.visible, successDismissDelay, dismissSuccess]);

  return {
    error: errorState,
    success: successState,
    setError,
    setSuccess,
    dismissError,
    dismissSuccess,
    clearAll,
  };
}

export default useAlerts;

