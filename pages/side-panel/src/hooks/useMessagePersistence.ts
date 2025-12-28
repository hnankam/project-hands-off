/**
 * ================================================================================
 * useMessagePersistence Hook (Simplified for CopilotKit v1.50)
 * ================================================================================
 * 
 * Simplified version for runtime server persistence.
 * Since messages are persisted server-side via PostgresAgentRunner,
 * this hook only tracks UI readiness state.
 * 
 * Features:
 * - UI readiness tracking (for counter visibility)
 * - Manual reset wrapper (for reset button functionality)
 * 
 * Removed:
 * - IndexedDB persistence (handled by runtime server)
 * - Auto-restore logic (handled by CopilotKit connect automatically)
 * - Complex hydration tracking (CopilotKit v1.50 handles this automatically)
 * - Stabilization guards (not needed with server persistence)
 * - Cross-window sync (can be handled server-side if needed)
 * 
 * @module useMessagePersistence
 * ================================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { debug, persistenceLock } from '@extension/shared';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Delay after manual reset before re-enabling stabilization guard */
const MANUAL_RESET_STABILIZATION_DELAY = 2000; // 2 seconds

/** Initial delay before marking UI as ready (allows CopilotKit to initialize) */
const UI_READY_DELAY = 300; // Reduced from 1500ms to 300ms for faster tab switching

// ============================================================================
// TYPES
// ============================================================================

export interface UseMessagePersistenceProps {
  sessionId: string;
  isActive: boolean;
  isPanelVisible?: boolean;
  resetChatRef?: React.MutableRefObject<(() => void) | null>;
}

export interface UseMessagePersistenceReturn {
  hydrationCompleted: boolean; // UI readiness (when messages can be displayed)
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Simplified Message Persistence Hook (CopilotKit v1.50)
 *
 * With CopilotKit v1.50, messages are automatically loaded from the server
 * via PostgresAgentRunner when the agent connects. This hook tracks
 * UI readiness state for counter visibility.
 *
 * @param props - Hook configuration
 * @returns UI readiness state
 */
export const useMessagePersistence = ({
  sessionId,
  isActive,
  isPanelVisible = true,
  resetChatRef,
}: UseMessagePersistenceProps): UseMessagePersistenceReturn => {
  // ============================================================================
  // STATE
  // ============================================================================

  // With CopilotKit v1.50, hydration is handled automatically, so we just track UI readiness
  const [hydrationCompleted, setHydrationCompleted] = useState<boolean>(false);

  // ============================================================================
  // REFS
  // ============================================================================

  const manualResetInProgressRef = useRef(false);
  const lastRestoredSessionRef = useRef('');
  const uiReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Reset UI readiness when session changes
  useEffect(() => {
    if (lastRestoredSessionRef.current !== sessionId) {
      debug.log(`[useMessagePersistence] Session changed to ${sessionId.slice(0, 8)}, resetting UI readiness`);
      lastRestoredSessionRef.current = sessionId;
      setHydrationCompleted(false);
      
      // Clear any pending timeout
      if (uiReadyTimeoutRef.current) {
        clearTimeout(uiReadyTimeoutRef.current);
        uiReadyTimeoutRef.current = null;
      }
    }
  }, [sessionId]);

  // Mark UI as ready after a short delay (CopilotKit v1.50 handles message loading automatically)
  // This gives CopilotKit time to connect and load messages from the server
  useEffect(() => {
    if (!isActive || !isPanelVisible) {
      return undefined;
    }
    
    // OPTIMIZATION: If we are switching back to a warm session, don't wait for the timer
    if (hydrationCompleted) {
      return undefined;
    }

    // With CopilotKit v1.50, messages are loaded automatically via connect()
    // Wait for component to stabilize before marking ready to prevent cascading re-renders
    // that can cause multiple mount/unmount cycles
    const delay = lastRestoredSessionRef.current === sessionId ? 0 : UI_READY_DELAY;
    uiReadyTimeoutRef.current = setTimeout(() => {
      setHydrationCompleted(true);
      debug.log(`[useMessagePersistence] UI ready for session ${sessionId.slice(0, 8)}`);
    }, delay);

    return () => {
      if (uiReadyTimeoutRef.current) {
        clearTimeout(uiReadyTimeoutRef.current);
        uiReadyTimeoutRef.current = null;
      }
    };
  }, [isActive, isPanelVisible, hydrationCompleted, sessionId]);

  // Wrap reset function to track manual resets
  useEffect(() => {
    if (!resetChatRef) return;

    let isMounted = true;
    let originalReset: (() => void) | null = null;

    const attachWrapperIfNeeded = () => {
      if (!isMounted || !resetChatRef.current) {
        return false;
      }

      originalReset = resetChatRef.current;

      const wrapped: () => void = () => {
        if (!originalReset) return;
        debug.log('[useMessagePersistence] Manual reset initiated');
        manualResetInProgressRef.current = true;
        persistenceLock.setManualReset(sessionId, true);

        try {
          originalReset();
        } finally {
          setTimeout(() => {
            manualResetInProgressRef.current = false;
            debug.log('[useMessagePersistence] Manual reset complete');
          }, MANUAL_RESET_STABILIZATION_DELAY);
        }
      };

      resetChatRef.current = wrapped;
      debug.log('[useMessagePersistence] Attached manual reset wrapper for session', sessionId.slice(0, 8));
      return true;
    };

    if (!attachWrapperIfNeeded()) {
      const intervalId = setInterval(() => {
        if (attachWrapperIfNeeded()) {
          clearInterval(intervalId);
        }
      }, 50);

      return () => {
        isMounted = false;
        clearInterval(intervalId);
      };
    }

    return () => {
      isMounted = false;
      if (originalReset && resetChatRef.current) {
        resetChatRef.current = originalReset;
      }
    };
  }, [resetChatRef, sessionId]);

  return {
    hydrationCompleted, // UI readiness (when messages can be displayed)
  };
};
