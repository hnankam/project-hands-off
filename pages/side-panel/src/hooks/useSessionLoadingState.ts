/**
 * useSessionLoadingState Hook
 * 
 * Manages session loading states including skeleton timing and ready states.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { SKELETON_TIMINGS } from '../constants/ui';

export interface UseSessionLoadingStateReturn {
  /** Whether the session is ready */
  isSessionReady: boolean;
  /** Whether messages are currently loading */
  isMessagesLoading: boolean;
  /** Handler for when a session is ready */
  handleSessionReady: (sessionId: string) => void;
  /** Handler for messages loading state changes */
  handleMessagesLoadingChange: (sessionId: string, isLoading: boolean) => void;
}

export function useSessionLoadingState(currentSessionId: string | null): UseSessionLoadingStateReturn {
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  
  const sessionReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skeletonStartTimeRef = useRef<number | null>(null);

  // Handle messages loading state change with minimum display time
  const handleMessagesLoadingChange = useCallback(
    (sessionId: string, isLoading: boolean) => {
      if (sessionId !== currentSessionId) {
        return;
      }

      // When messages finish loading, enforce minimum display time
      if (!isLoading && skeletonStartTimeRef.current) {
        const now = Date.now();
        const elapsed = now - skeletonStartTimeRef.current;
        const remaining = SKELETON_TIMINGS.minDisplayTime - elapsed;

        if (remaining > 0) {
          setTimeout(() => {
            setIsMessagesLoading(false);
          }, remaining);
          return;
        }
      }

      setIsMessagesLoading(isLoading);
    },
    [currentSessionId]
  );

  // Handle session ready signal
  const handleSessionReady = useCallback(
    (sessionId: string) => {
      if (!currentSessionId || sessionId !== currentSessionId) {
        return;
      }

      if (sessionReadyTimeoutRef.current) {
        clearTimeout(sessionReadyTimeoutRef.current);
        sessionReadyTimeoutRef.current = null;
      }

      // Enforce minimum skeleton display time
      const now = Date.now();
      const skeletonStartTime = skeletonStartTimeRef.current;

      if (skeletonStartTime) {
        const elapsed = now - skeletonStartTime;
        const remaining = SKELETON_TIMINGS.minDisplayTime - elapsed;

        if (remaining > 0) {
          setTimeout(() => {
            setIsSessionReady(true);
            skeletonStartTimeRef.current = null;
          }, remaining);
          return;
        }
      }

      setIsSessionReady(true);
      skeletonStartTimeRef.current = null;
    },
    [currentSessionId]
  );

  // Reset states when session changes
  useEffect(() => {
    if (!currentSessionId) {
      if (sessionReadyTimeoutRef.current) {
        clearTimeout(sessionReadyTimeoutRef.current);
        sessionReadyTimeoutRef.current = null;
      }
      setIsSessionReady(true);
      setIsMessagesLoading(false);
      skeletonStartTimeRef.current = null;
      return;
    }

    // Record when skeleton starts showing
    skeletonStartTimeRef.current = Date.now();

    setIsSessionReady(false);
    setIsMessagesLoading(true);

    if (sessionReadyTimeoutRef.current) {
      clearTimeout(sessionReadyTimeoutRef.current);
    }

    // Fallback timeout: ensure skeleton can't linger if ready signal is missed
    sessionReadyTimeoutRef.current = setTimeout(() => {
      sessionReadyTimeoutRef.current = null;
      setIsSessionReady(true);
      skeletonStartTimeRef.current = null;
    }, SKELETON_TIMINGS.fallbackTimeout);

    return () => {
      if (sessionReadyTimeoutRef.current) {
        clearTimeout(sessionReadyTimeoutRef.current);
        sessionReadyTimeoutRef.current = null;
      }
    };
  }, [currentSessionId]);

  return {
    isSessionReady,
    isMessagesLoading,
    handleSessionReady,
    handleMessagesLoadingChange,
  };
}

export default useSessionLoadingState;

