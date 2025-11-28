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
import { debug } from '@extension/shared';
import { TIMING_CONSTANTS } from '../constants';

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
  const debouncedSaveRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Safely read current messages from the provided ref.
   * Always returns an array, never null or undefined.
   */
  const getAllMessagesSafely = useCallback((): any[] => {
    try {
      const fn = saveMessagesRef.current;
      if (!fn) return [];
      const messageData = fn();
      return messageData?.allMessages || [];
    } catch (error) {
      debug.error('[useAutoSave] Failed to gather messages for save', error);
      return [];
    }
  }, [saveMessagesRef]);

  /**
   * Debounced save function to prevent excessive writes.
   * Clears any pending save and schedules a new one.
   */
  const debouncedSave = useCallback(
    (messagesToSave: any[]) => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
      }

      debouncedSaveRef.current = setTimeout(() => {
        saveMessagesToStorage(messagesToSave).catch((error) => {
          debug.error('[useAutoSave] Debounced save failed', error);
        });
        debouncedSaveRef.current = null;
      }, TIMING_CONSTANTS.DEBOUNCE_DELAY);
    },
    [saveMessagesToStorage],
  );

  /**
   * Auto-save when session becomes inactive.
   * Detects transition from active to inactive state.
   * 
   * TEMPORARILY DISABLED: Sanitization only runs when streaming ends
   */
  useEffect(() => {
    const wasActive = previousIsActiveRef.current;
    const isBecomingInactive = wasActive && !isActive;

    if (isBecomingInactive) {
      debug.log('[useAutoSave] Session becoming inactive - SKIPPING auto-save (sanitization disabled)');
      // COMMENTED OUT: Auto-save on session switch - only sanitize when streaming ends
      // const allMessages = getAllMessagesSafely();
      // if (allMessages.length > 0) {
      //   debouncedSave(allMessages);
      // }
    }

    previousIsActiveRef.current = isActive;
  }, [isActive]);

  /**
   * Auto-save when panel is closing.
   * Clears any pending debounced saves and saves immediately.
   * 
   * TEMPORARILY DISABLED: Sanitization only runs when streaming ends
   */
  useEffect(() => {
    const handlePanelClosing = (_event: Event) => {
      debug.log('[useAutoSave] Panel closing - SKIPPING auto-save (sanitization disabled)');
      
      // COMMENTED OUT: Auto-save on panel close - only sanitize when streaming ends
      // const allMessages = getAllMessagesSafely();
      // if (allMessages.length > 0) {
      //   // Clear any debounced save and save immediately
      //   if (debouncedSaveRef.current) {
      //     clearTimeout(debouncedSaveRef.current);
      //     debouncedSaveRef.current = null;
      //   }
      //   saveMessagesToStorage(allMessages).catch((error) => {
      //     debug.error('[useAutoSave] Immediate save on panel closing failed', error);
      //   });
      // }
    };

    window.addEventListener('panelClosing', handlePanelClosing as EventListener);

    return () => {
      window.removeEventListener('panelClosing', handlePanelClosing as EventListener);
      // Cleanup any pending debounced saves
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
        debouncedSaveRef.current = null;
      }
    };
  }, []);

};

