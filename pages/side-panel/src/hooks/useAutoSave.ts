/**
 * ================================================================================
 * useAutoSave Hook
 * ================================================================================
 * 
 * Custom hook that manages automatic message saving:
 * - Auto-saves when session becomes inactive
 * - Auto-saves when panel is closing
 * - Debounces save operations to prevent excessive writes
 * - Cleans up pending saves on unmount
 * 
 * @module useAutoSave
 * ================================================================================
 */

import { useEffect, useRef, useCallback } from 'react';
import { TIMING_CONSTANTS } from '../constants';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

interface MessageData {
  allMessages: any[];
  filteredMessages: any[];
}

interface UseAutoSaveParams {
  isActive: boolean;
  saveMessagesRef: React.MutableRefObject<(() => MessageData) | null>;
  saveMessagesToStorage: (messages: any[]) => Promise<void>;
}

/**
 * Hook to automatically save messages when appropriate
 * 
 * @example
 * ```tsx
 * useAutoSave({
 *   isActive,
 *   saveMessagesRef,
 *   saveMessagesToStorage,
 * });
 * ```
 */
export const useAutoSave = ({
  isActive,
  saveMessagesRef,
  saveMessagesToStorage,
}: UseAutoSaveParams) => {
  // Track previous active state
  const previousIsActiveRef = useRef(isActive);
  const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safely read current messages from the provided ref
  const getAllMessagesSafely = useCallback((): any[] => {
    try {
      const fn = saveMessagesRef.current;
      if (!fn) return [];
      const messageData = fn();
      const allMessages = (messageData && (messageData as MessageData).allMessages) || [];
      return Array.isArray(allMessages) ? allMessages : [];
    } catch (error) {
      console.error(ts(), '[useAutoSave] Failed to gather messages for save', error);
      return [];
    }
  }, [saveMessagesRef]);

  // Debounced save function
  const debouncedSave = useCallback(
    (messagesToSave: any[]) => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
      }

      debouncedSaveRef.current = setTimeout(() => {
        Promise.resolve(saveMessagesToStorage(messagesToSave)).catch((error) => {
          console.error(ts(), '[useAutoSave] Debounced save failed', error);
        });
        debouncedSaveRef.current = null;
      }, TIMING_CONSTANTS.DEBOUNCE_DELAY);
    },
    [saveMessagesToStorage],
  );

  // Auto-save when session becomes inactive
  useEffect(() => {
    const wasActive = previousIsActiveRef.current;
    const isBecomingInactive = wasActive && !isActive;

    if (isBecomingInactive) {
      console.log(ts(), '[useAutoSave] Session becoming inactive, auto-saving messages');
      const allMessages = getAllMessagesSafely();
      if (allMessages && allMessages.length > 0) {
        debouncedSave(allMessages);
      }
    }

    previousIsActiveRef.current = isActive;
  }, [isActive, debouncedSave, getAllMessagesSafely]);

  // Auto-save when panel is closing
  useEffect(() => {
    const handlePanelClosing = (_event: Event) => {
      console.log(ts(), '[useAutoSave] Panel closing, auto-saving messages immediately');
      const allMessages = getAllMessagesSafely();
      if (allMessages && allMessages.length > 0) {
        // Clear any debounced save and save immediately
        if (debouncedSaveRef.current) {
          clearTimeout(debouncedSaveRef.current);
          debouncedSaveRef.current = null;
        }
        Promise.resolve(saveMessagesToStorage(allMessages)).catch((error) => {
          console.error(ts(), '[useAutoSave] Immediate save on panel closing failed', error);
        });
      }
    };

    window.addEventListener('panelClosing', handlePanelClosing as EventListener);

    return () => {
      window.removeEventListener('panelClosing', handlePanelClosing as EventListener);
    };
  }, [saveMessagesToStorage, getAllMessagesSafely]);

  // Cleanup debounced save on unmount
  useEffect(() => {
    return () => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
        debouncedSaveRef.current = null;
      }
    };
  }, []);

  // This hook doesn't return anything - it only has side effects
  return null;
};

