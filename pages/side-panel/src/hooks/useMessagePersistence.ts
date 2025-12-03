import { useState, useCallback, useEffect, useRef } from 'react';
import { debug, sessionStorageDBWrapper, persistenceLock } from '@extension/shared';
import type { CopilotMessage } from '@extension/storage';
import { useSessionRuntimeState } from '../context/SessionRuntimeContext';

// ============================================================================
// UTILITY FUNCTIONS (Pure - no deps)
// ============================================================================

/**
 * Counts filtered messages (excludes thinking messages starting with **).
 */
function countFilteredMessages(messages: any[]): number {
  if (!messages || messages.length === 0) return 0;

  return messages.filter(message => {
    if (typeof message.content === 'string') {
      return !message.content.startsWith('**') && message.content.trim() !== '';
    } else if (typeof message.content === 'object' && message.content !== null) {
      const contentStr = JSON.stringify(message.content);
      return !contentStr.includes('"**');
    } else if (message.content === undefined || message.content === null) {
      return false;
    }
    return true;
  }).length;
}

/**
 * Sanitizes a single message via JSON round-trip.
 */
function sanitizeSingleMessage(msg: any): any {
  try {
    return JSON.parse(JSON.stringify(msg));
  } catch (error) {
    // Fallback: copy only serializable properties
    return {
      id: msg.id,
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : String(msg.content || ''),
      createdAt: msg.createdAt,
      ...(msg.toolCalls && { toolCalls: msg.toolCalls }),
      ...(msg.metadata && { metadata: msg.metadata }),
    };
  }
}

/**
 * Checks if a value is "empty" (for state/content checking).
 */
function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// ============================================================================
// CONSTANTS - All timing values extracted for easy tuning
// ============================================================================

/** Delay after manual reset before re-enabling stabilization guard */
const MANUAL_RESET_STABILIZATION_DELAY = 2000; // 2 seconds

/** Fallback timeout for hydration if it doesn't complete naturally */
const HYDRATION_FALLBACK_TIMEOUT = 1000; // 1 second

/** Delay to verify messages were set after restore */
const MESSAGE_RESTORE_VERIFY_DELAY = 150; // 150ms

/** Maximum number of restore attempts before giving up */
const MAX_RESTORE_ATTEMPTS = 2; // initial + one retry

/** Initial delay before first auto-restore attempt */
const AUTO_RESTORE_INITIAL_DELAY = 50; // 50ms

/** Increment for retry delays in auto-restore */
const AUTO_RESTORE_RETRY_INCREMENT = 30; // 30ms

/** Maximum retry delay for auto-restore */
const AUTO_RESTORE_MAX_RETRY_DELAY = 200; // 200ms

/** Maximum auto-restore attempts before failing */
const AUTO_RESTORE_MAX_ATTEMPTS = 10;

/** Delay for force restore when messages are missing */
const FORCE_RESTORE_DELAY = 150; // 150ms

/** Interval for stabilization guard to check for message clearing */
const STABILIZATION_CHECK_INTERVAL = 100; // 100ms

/** Interval for pre-stabilization watchdog */
const WATCHDOG_CHECK_INTERVAL = 200; // 200ms

/** Timeout for watchdog to stop checking */
const WATCHDOG_TIMEOUT = 600; // 600ms

/** Safety timeout to force hydration completion */
const HYDRATION_SAFETY_TIMEOUT = 2000; // 2 seconds

/** Delay to check if streaming completed for deferred reload */
const STREAMING_CHECK_DELAY = 300; // 300ms

/** Delay before cross-window message reload */
const CROSS_WINDOW_RELOAD_DELAY = 100; // 100ms

// ============================================================================
// TYPES
// ============================================================================

/** Message data structure returned by saveMessagesRef */
export interface MessageData {
  allMessages: any[];
  filteredMessages: any[];
}

export interface UseMessagePersistenceProps {
  sessionId: string;
  isActive: boolean;
  isPanelVisible?: boolean;
  saveMessagesRef: React.MutableRefObject<(() => MessageData) | null>;
  restoreMessagesRef: React.MutableRefObject<((messages: any[]) => void) | null>;
  resetChatRef?: React.MutableRefObject<(() => void) | null>;
}

export interface UseMessagePersistenceReturn {
  storedMessages: CopilotMessage[];
  storedFilteredMessagesCount: number;
  setStoredMessages: React.Dispatch<React.SetStateAction<CopilotMessage[]>>;
  handleSaveMessages: () => Promise<void>;
  handleLoadMessages: () => Promise<void>;
  saveMessagesToStorage: (messages: CopilotMessage[]) => Promise<void>;
  isHydrating: boolean;
  hydrationCompleted: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Message Persistence Hook
 *
 * Manages chat message persistence to IndexedDB with cross-window sync,
 * auto-restore, stabilization guards, and streaming awareness.
 *
 * Key Features:
 * - Auto-restore messages when session becomes active
 * - Stabilization guard to prevent message clearing after hydration
 * - Cross-window message synchronization
 * - Streaming-aware reload deferral
 * - Manual reset handling with persistence lock coordination
 * - Message deduplication and sanitization
 *
 * @param props - Hook configuration
 * @returns Message persistence state and handlers
 *
 * @example
 * ```tsx
 * const {
 *   storedMessages,
 *   handleLoadMessages,
 *   saveMessagesToStorage,
 *   isHydrating,
 *   hydrationCompleted
 * } = useMessagePersistence({
 *   sessionId,
 *   isActive,
 *   isPanelVisible,
 *   saveMessagesRef,
 *   restoreMessagesRef,
 *   resetChatRef
 * });
 * ```
 */
export const useMessagePersistence = ({
  sessionId,
  isActive,
  isPanelVisible = true,
  saveMessagesRef,
  restoreMessagesRef,
  resetChatRef,
}: UseMessagePersistenceProps): UseMessagePersistenceReturn => {
  // ============================================================================
  // STATE
  // ============================================================================

  const [storedMessages, setStoredMessages] = useState<CopilotMessage[]>([]);
  const [storedFilteredMessagesCount, setStoredFilteredMessagesCount] = useState<number>(0);
  const [isHydrating, setIsHydrating] = useState<boolean>(false);
  const [hydrationCompleted, setHydrationCompleted] = useState<boolean>(false);

  // ============================================================================
  // REFS
  // ============================================================================

  const hydrationFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const storedMessagesRef = useRef<CopilotMessage[]>([]);
  const manualResetInProgressRef = useRef(false);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const restoreAttemptsRef = useRef(0);
  const hasAutoRestoredRef = useRef(false);
  const lastRestoredSessionRef = useRef('');
  const panelOpenTimeRef = useRef(0);
  const wasPanelVisibleRef = useRef(isPanelVisible);
  const pendingReloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get runtime state to check if streaming is in progress
  const runtimeState = useSessionRuntimeState(sessionId);
  const runtimeStateRef = useRef(runtimeState);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Computes a signature for a set of messages to detect changes.
   * Uses JSON stringification for accurate comparison.
   * Falls back to length-based signature if stringification fails.
   *
   * @param msgs - Messages to compute signature for
   * @returns Signature string
   */
  const computeMessageSignature = useCallback((msgs: CopilotMessage[] | any[]): string => {
    try {
      return JSON.stringify(msgs ?? []);
    } catch (error) {
      debug.warn('[useMessagePersistence] Failed to compute message signature, falling back to length', error);
      return `len:${Array.isArray(msgs) ? msgs.length : 0}`;
    }
  }, []);

  /**
   * Clears the hydration fallback timeout.
   */
  const clearHydrationFallback = useCallback(() => {
    if (hydrationFallbackTimeoutRef.current) {
      clearTimeout(hydrationFallbackTimeoutRef.current);
      hydrationFallbackTimeoutRef.current = null;
    }
  }, []);

  /**
   * Schedules a fallback timeout to complete hydration if it doesn't finish naturally.
   */
  const scheduleHydrationFallback = useCallback(() => {
    clearHydrationFallback();
    hydrationFallbackTimeoutRef.current = setTimeout(() => {
      setIsHydrating(false);
      hydrationFallbackTimeoutRef.current = null;
    }, HYDRATION_FALLBACK_TIMEOUT);
  }, [clearHydrationFallback]);

  /**
   * Gets the current in-memory message count safely.
   */
  const getInMemoryMessageCount = useCallback((): number | null => {
    try {
      if (!saveMessagesRef.current) return null;
      const data = saveMessagesRef.current();
      return data?.allMessages?.length ?? null;
    } catch (err) {
      return null;
    }
  }, [saveMessagesRef]);

  /**
   * Updates stored messages state and refs in one place.
   */
  const updateStoredMessagesState = useCallback(
    (messages: CopilotMessage[]) => {
      setStoredMessages(messages);
      setStoredFilteredMessagesCount(countFilteredMessages(messages));
      lastSavedSignatureRef.current = computeMessageSignature(messages);
    },
    [computeMessageSignature],
  );
  /**
   * Sanitizes and deduplicates normalized messages.
   */
  const sanitizeNormalizedMessages = useCallback((messages: CopilotMessage[]): CopilotMessage[] => {
    if (!Array.isArray(messages) || messages.length === 0) return [];

    const seenIds = new Set<string>();
    const validRoles = new Set(['user', 'assistant', 'tool', 'system']);
    let removedCount = 0;
    const sanitized: CopilotMessage[] = [];

    for (const rawMessage of messages) {
      const message = rawMessage as CopilotMessage;
      if (!message || typeof message !== 'object') continue;

      const id = typeof (message as any).id === 'string' ? (message as any).id : undefined;
      const role = (message as any).role;

      // Skip invalid roles
      if (!validRoles.has(role)) {
        removedCount++;
        continue;
      }

      // Skip duplicates
      if (id && seenIds.has(id)) {
        removedCount++;
        continue;
      }

      // Check for empty assistants
      if (role === 'assistant') {
        const hasToolCalls = Array.isArray((message as any).toolCalls) && (message as any).toolCalls.length > 0;
        const hasContent = !isEmpty((message as any).content);
        const hasState = !isEmpty((message as any).state);

        // Remove empty assistants unless they have state
        if (!hasContent && !hasToolCalls && !hasState) {
          removedCount++;
          continue;
        }
      }

      if (id) seenIds.add(id);
      sanitized.push(message);
    }

    if (removedCount > 0) {
      debug.log('[useMessagePersistence] Sanitized messages:', {
        before: messages.length,
        after: sanitized.length,
        removed: removedCount,
      });
    }

    return sanitized;
  }, []);

  // ============================================================================
  // SAVE FUNCTIONS
  // ============================================================================

  /**
   * Saves messages to IndexedDB storage.
   * Stores ALL messages (including thinking messages).
   * Skips save if messages haven't changed since last save.
   *
   * @param messagesToSave - Messages to persist
   */
  const saveMessagesToStorage = useCallback(
    async (messagesToSave: CopilotMessage[]) => {
      if (!messagesToSave || messagesToSave.length === 0) {
        return;
      }

      try {
        // Filter out any undefined/null messages before saving
        const validMessages = messagesToSave.filter(msg => msg !== null && msg !== undefined);

        if (validMessages.length !== messagesToSave.length) {
          debug.warn(
            `[useMessagePersistence] Filtered out ${messagesToSave.length - validMessages.length} undefined/null messages`,
          );
        }

        // Sanitize messages to remove non-serializable data
        const sanitizedMessages = validMessages.map(sanitizeSingleMessage);
        const normalizedMessages = sanitizeNormalizedMessages(sanitizedMessages as CopilotMessage[]);
        const newSignature = computeMessageSignature(normalizedMessages);

        // Skip save if messages haven't changed
        if (lastSavedSignatureRef.current === newSignature) {
          debug.log('[useMessagePersistence] Skipping save - messages unchanged since last sync');
          updateStoredMessagesState(normalizedMessages);
          return;
        }

        await sessionStorageDBWrapper.updateAllMessages(sessionId, normalizedMessages);
        updateStoredMessagesState(normalizedMessages);
        debug.log(
          `[useMessagePersistence] Saved ${normalizedMessages.length} messages ` +
            `(${countFilteredMessages(normalizedMessages)} filtered) for session ${sessionId.slice(0, 8)}`,
        );
      } catch (error) {
        debug.error('[useMessagePersistence] Failed to save messages to storage:', error);
      }
    },
    [sessionId, computeMessageSignature, sanitizeNormalizedMessages, updateStoredMessagesState],
  );

  /**
   * Manual save function using CopilotKit API.
   * Triggered by user action (e.g., save button click).
   *
   * @returns Promise that resolves when save completes
   */
  const handleSaveMessages = useCallback(async () => {
    if (!saveMessagesRef.current) {
      debug.log('[useMessagePersistence] saveMessagesRef.current is null, skipping save');
      return;
    }

    try {
      // Get both all messages and filtered messages from ChatInner
      const messageData = saveMessagesRef.current();
      const allMessages = messageData.allMessages || [];
      const filteredMessages = messageData.filteredMessages || [];

      debug.log('[useMessagePersistence] Manual save:', {
        total: allMessages.length,
        filtered: filteredMessages.length,
        session: sessionId.slice(0, 8),
      });

      // Filter out any undefined/null messages before saving
      const validMessages = allMessages.filter((msg: any) => msg !== null && msg !== undefined);

      if (validMessages.length !== allMessages.length) {
        debug.warn(
          `[useMessagePersistence] Filtered out ${allMessages.length - validMessages.length} undefined/null messages`,
        );
      }

      // Sanitize and normalize messages
      const sanitizedMessages = validMessages.map(sanitizeSingleMessage);
      const normalizedMessages = sanitizeNormalizedMessages(sanitizedMessages as CopilotMessage[]);

      await saveMessagesToStorage(normalizedMessages as unknown as CopilotMessage[]);
    } catch (error) {
      debug.error('[useMessagePersistence] Failed to manually save messages:', error);
    }
  }, [sessionId, saveMessagesRef, saveMessagesToStorage, sanitizeNormalizedMessages]);

  // ============================================================================
  // LOAD FUNCTIONS
  // ============================================================================

  /**
   * Manual load function using CopilotKit API.
   * Loads messages from IndexedDB and restores them to CopilotKit.
   * Streaming-aware: aborts reload if streaming is in progress.
   *
   * @returns Promise that resolves when load completes
   */
  const handleLoadMessages = useCallback(async () => {
    debug.log(
      `[useMessagePersistence] Load messages start for session ${sessionId.slice(0, 8)}, isActive: ${isActive}`,
    );

    // Mark as restored to prevent duplicate auto-restore from triggering
    // This is critical to prevent double hydration when called from ChatSessionContainer
    hasAutoRestoredRef.current = true;

    // CRITICAL: Check if streaming is in progress before loading messages
    // This prevents activity dots from disappearing when reload happens during streaming
    const isStreaming = runtimeStateRef.current?.isInProgress ?? false;
    if (isStreaming) {
      debug.log(`[useMessagePersistence] Streaming in progress, aborting reload to preserve activity dots`);
      return;
    }

    setIsHydrating(true);
    scheduleHydrationFallback();

    if (!restoreMessagesRef.current) {
      debug.log('[useMessagePersistence] restoreMessagesRef is null, aborting load');
      clearHydrationFallback();
      setIsHydrating(false);
      return;
    }

    // Acquire loading lock to prevent RuntimeStateBridge from persisting during load
    const unlock = await persistenceLock.acquireLoadingLock(sessionId);

    // Reset restore attempts counter on manual load to allow fresh attempts
    restoreAttemptsRef.current = 0;

    try {
      const rawMessages = await sessionStorageDBWrapper.getAllMessagesAsync(sessionId);
      debug.log(`[useMessagePersistence] Loaded ${rawMessages?.length || 0} messages from storage`);

      const sanitizedFromStorage = sanitizeNormalizedMessages((rawMessages as CopilotMessage[]) ?? []);
      if (sanitizedFromStorage.length !== rawMessages.length) {
        debug.log('[useMessagePersistence] Cleaning invalid/duplicate messages from storage', {
          before: rawMessages.length,
          after: sanitizedFromStorage.length,
        });
        try {
          await sessionStorageDBWrapper.updateAllMessages(sessionId, sanitizedFromStorage);
        } catch (persistError) {
          debug.warn('[useMessagePersistence] Failed to persist cleaned messages:', persistError);
        }
      }

      const previousSignature = computeMessageSignature(storedMessagesRef.current);
      const incomingSignature = computeMessageSignature(sanitizedFromStorage);
      const currentInMemoryCount = getInMemoryMessageCount();

      // Handle empty session
      if (sanitizedFromStorage.length === 0) {
        debug.log(`[useMessagePersistence] No messages to load for session ${sessionId.slice(0, 8)}`);

        updateStoredMessagesState([]);
        if (restoreMessagesRef.current) {
          try {
            restoreMessagesRef.current([]);
          } catch (restoreError) {
            debug.warn('[useMessagePersistence] Failed to clear messages via restore ref:', restoreError);
          }
        }

        clearHydrationFallback();
        setIsHydrating(false);
        setHydrationCompleted(true);
        debug.log(`[useMessagePersistence] Hydration completed (no messages)`);
        return;
      }

      // Determine if restore is needed
      const signaturesMatch = previousSignature === incomingSignature;
      const shouldRestore = !signaturesMatch || (currentInMemoryCount === 0 && sanitizedFromStorage.length > 0);

      if (!shouldRestore) {
        debug.log(`[useMessagePersistence] Messages unchanged, skipping restore`);
        updateStoredMessagesState(sanitizedFromStorage);
        clearHydrationFallback();
        setIsHydrating(false);
        setHydrationCompleted(true);
        debug.log('[useMessagePersistence] Hydration completed (no restore needed)');
        return;
      }

      if (shouldRestore) {
        debug.log(
          `[useMessagePersistence] ${signaturesMatch ? 'Memory empty' : 'Signatures differ'} - restoring from storage`,
        );
      }

      // Attempt restore
      if (restoreAttemptsRef.current < MAX_RESTORE_ATTEMPTS) {
        restoreAttemptsRef.current += 1;
        restoreMessagesRef.current(sanitizedFromStorage);
      } else {
        debug.log('[useMessagePersistence] Skipping restore - max attempts reached');
      }

      updateStoredMessagesState(sanitizedFromStorage);
      debug.log('[useMessagePersistence] Messages loaded successfully');

      clearHydrationFallback();
      setIsHydrating(false);

      // Verify messages were set after a short delay (handles CopilotKit init race)
      setTimeout(() => {
        const currentCount = getInMemoryMessageCount();
        if (
          currentCount === 0 &&
          sanitizedFromStorage.length > 0 &&
          restoreAttemptsRef.current < MAX_RESTORE_ATTEMPTS
        ) {
          debug.log('[useMessagePersistence] Messages cleared after restore, retrying...');
          restoreAttemptsRef.current += 1;
          if (restoreMessagesRef.current) {
            restoreMessagesRef.current(sanitizedFromStorage);
            debug.log('[useMessagePersistence] Messages re-restored');
          }
        }
        setHydrationCompleted(true);
        debug.log('[useMessagePersistence] Hydration completed (restored and verified)');
      }, MESSAGE_RESTORE_VERIFY_DELAY);
    } catch (error) {
      debug.error(`[useMessagePersistence] Failed to load messages:`, error);
      setHydrationCompleted(true); // Complete even on error to unblock UI
      debug.log('[useMessagePersistence] Hydration completed (with error, unblocking UI)');
    } finally {
      // Always release the loading lock
      unlock();
      clearHydrationFallback();
      setIsHydrating(false);
    }
  }, [
    sessionId,
    restoreMessagesRef,
    getInMemoryMessageCount,
    scheduleHydrationFallback,
    clearHydrationFallback,
    computeMessageSignature,
    sanitizeNormalizedMessages,
    updateStoredMessagesState,
    isActive,
  ]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Sync storedMessages to ref for stabilization guard
  useEffect(() => {
    storedMessagesRef.current = storedMessages;
  }, [storedMessages]);

  // Keep runtime state ref updated
  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  // Wrap reset function to track manual resets
  // IMPORTANT: resetChatRef.current is set by ChatInner in a separate effect.
  // On first render it may still be null when this effect runs, so we attach
  // the wrapper lazily once a reset function becomes available.
  useEffect(() => {
    if (!resetChatRef) return;

    let isMounted = true;
    let originalReset: (() => void) | null = null;

    const attachWrapperIfNeeded = () => {
      // If ref has a reset function and we haven't wrapped it yet, wrap it
      if (!isMounted || !resetChatRef.current) {
        return false;
      }

      originalReset = resetChatRef.current;

      // Define wrapper that marks manual reset for persistence guards
      const wrapped: () => void = () => {
        if (!originalReset) return;
        debug.log('[useMessagePersistence] Manual reset initiated');
        manualResetInProgressRef.current = true;
        persistenceLock.setManualReset(sessionId, true);

        try {
          originalReset();
        } finally {
          // Keep storedMessages in sync so guards don't try to restore
          updateStoredMessagesState([]);

          setTimeout(() => {
            manualResetInProgressRef.current = false;
            debug.log('[useMessagePersistence] Manual reset complete');
          }, MANUAL_RESET_STABILIZATION_DELAY);
        }
      };

      // Store on ref so callers (SessionsPage) always invoke the wrapped version
      const wrappedReset = wrapped;
      resetChatRef.current = wrappedReset;
      debug.log('[useMessagePersistence] Attached manual reset wrapper for session', sessionId.slice(0, 8));
      return true;
    };

    // Try immediately
    if (!attachWrapperIfNeeded()) {
      // If not yet available, poll briefly until ChatInner sets the reset function
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
      // On cleanup, restore original reset if we wrapped it
      if (originalReset && resetChatRef.current) {
        resetChatRef.current = originalReset;
      }
    };
  }, [resetChatRef, sessionId, updateStoredMessagesState]);

  // Monitor for manual message deletion (via CustomUserMessage controls)
  // When persistenceLock.isManualReset is set externally, sync storedMessages to prevent force-restore
  useEffect(() => {
    if (!isActive) return;

    const checkManualReset = setInterval(() => {
      if (persistenceLock.isManualReset(sessionId) && !manualResetInProgressRef.current) {
        // External manual reset detected (e.g., from CustomUserMessage delete)
        // Check if messages are actually empty to confirm the delete happened
        if (saveMessagesRef.current) {
          const currentMessageData = saveMessagesRef.current();
          if (currentMessageData.allMessages.length === 0 && storedMessages.length > 0) {
            debug.log('[useMessagePersistence] External manual delete detected, clearing stored messages');
            manualResetInProgressRef.current = true;
            updateStoredMessagesState([]);

            setTimeout(() => {
              manualResetInProgressRef.current = false;
            }, MANUAL_RESET_STABILIZATION_DELAY);
          }
        }
      }
    }, 100); // Check frequently to catch the flag before it auto-clears

    return () => clearInterval(checkManualReset);
  }, [isActive, sessionId, storedMessages.length, updateStoredMessagesState]);

  // Track panel visibility and reset auto-restore on panel reopen
  useEffect(() => {
    // Panel just became visible
    if (isPanelVisible && isActive && !wasPanelVisibleRef.current) {
      panelOpenTimeRef.current = Date.now();

      // Reset auto-restore flag when panel reopens
      hasAutoRestoredRef.current = false;
      restoreAttemptsRef.current = 0;
      setIsHydrating(true);
      setHydrationCompleted(false);
      scheduleHydrationFallback();
    }

    wasPanelVisibleRef.current = isPanelVisible;
  }, [isPanelVisible, isActive, scheduleHydrationFallback]);

  // Reset auto-restore flag when session changes
  useEffect(() => {
    if (lastRestoredSessionRef.current !== sessionId) {
      debug.log(`[useMessagePersistence] Session changed to ${sessionId.slice(0, 8)}, resetting restore flags`);
      hasAutoRestoredRef.current = false;
      restoreAttemptsRef.current = 0;
      lastRestoredSessionRef.current = sessionId;
      setIsHydrating(true);
      setHydrationCompleted(false);
      scheduleHydrationFallback();
    }
  }, [sessionId, scheduleHydrationFallback]);

  // Auto-restore messages when session becomes active or panel reopens
  // NOTE: storedMessages.length is intentionally NOT in dependencies to prevent
  // re-triggering when messages load (which would cause double hydration)
  const storedMessagesLengthRef = useRef(storedMessages.length);
  useEffect(() => {
    storedMessagesLengthRef.current = storedMessages.length;
  }, [storedMessages.length]);

  useEffect(() => {
    if (!isActive || !isPanelVisible) return;

    let timeoutId: NodeJS.Timeout | undefined;

    const scheduleAttempt = (delay: number, attempt: number) => {
      timeoutId = setTimeout(() => {
        const ready = Boolean(saveMessagesRef.current && restoreMessagesRef.current);

        if (!ready) {
          if (attempt < AUTO_RESTORE_MAX_ATTEMPTS) {
            debug.warn(`[useMessagePersistence] CopilotKit not ready (attempt ${attempt}), retrying`);
            scheduleAttempt(Math.min(delay + AUTO_RESTORE_RETRY_INCREMENT, AUTO_RESTORE_MAX_RETRY_DELAY), attempt + 1);
            return;
          }
          debug.error(`[useMessagePersistence] Auto-restore failed - CopilotKit not ready after ${attempt} attempts`);
          return;
        }

        debug.log(`[useMessagePersistence] Auto-restore triggered (attempt ${attempt})`);
        handleLoadMessages();
        // Note: hasAutoRestoredRef is now set inside handleLoadMessages
      }, delay);
    };

    const currentCount = getInMemoryMessageCount();
    const storedCount = storedMessagesLengthRef.current;

    // Safety net: reset if messages missing
    // Only trigger if we haven't just completed auto-restore (give CopilotKit time to sync)
    if (hasAutoRestoredRef.current && currentCount === 0 && storedCount > 0) {
      // Don't immediately reset - this might be a race condition during hydration
      // The stabilization guard will handle true message loss
      debug.log('[useMessagePersistence] Messages appear empty, deferring to stabilization guard');
    }

    if (!hasAutoRestoredRef.current) {
      scheduleAttempt(AUTO_RESTORE_INITIAL_DELAY, 1);
    }
    // Removed: Force restore on empty messages - this was causing double hydration
    // The stabilization guard (lines 697+) handles message recovery after hydration

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isActive, isPanelVisible, handleLoadMessages, getInMemoryMessageCount]);
  // NOTE: storedMessages.length intentionally removed from deps to prevent double hydration

  // Cleanup hydration fallback on unmount
  useEffect(() => {
    return () => {
      clearHydrationFallback();
    };
  }, [clearHydrationFallback]);

  // Stabilization guard: protect messages from being cleared after hydration completes
  useEffect(() => {
    if (!saveMessagesRef.current || !restoreMessagesRef.current) return;
    if (!isActive || !isPanelVisible) return;
    if (!hydrationCompleted) return;
    if (storedMessages.length === 0) return;

    // Track consecutive empty checks to avoid false positives during tab switches
    let consecutiveEmptyChecks = 0;
    const EMPTY_CHECKS_THRESHOLD = 2; // Require 2 consecutive empty checks before restoring

    // Monitor for unexpected clearing and immediately restore
    const guardIntervalId = setInterval(() => {
      if (!saveMessagesRef.current || !restoreMessagesRef.current) return;
      // Skip if manual reset in progress (either local ref or global persistence lock)
      if (manualResetInProgressRef.current || persistenceLock.isManualReset(sessionId)) return;

      const currentMessageData = saveMessagesRef.current();
      if (currentMessageData.allMessages.length === 0 && storedMessages.length > 0) {
        consecutiveEmptyChecks++;

        // Only restore if we've seen empty messages multiple times
        // This prevents false positives during session switches
        if (consecutiveEmptyChecks >= EMPTY_CHECKS_THRESHOLD) {
          debug.error(
            `[useMessagePersistence] Messages cleared after stabilization! Force-restoring ${storedMessages.length} messages`,
          );
          restoreMessagesRef.current(storedMessages);
          consecutiveEmptyChecks = 0; // Reset after restore
        }
      } else {
        consecutiveEmptyChecks = 0; // Reset if messages are present
      }
    }, STABILIZATION_CHECK_INTERVAL);

    return () => clearInterval(guardIntervalId);
  }, [isActive, isPanelVisible, storedMessages, saveMessagesRef, restoreMessagesRef, hydrationCompleted]);

  // Pre-stabilization watchdog: monitor for unexpected clearing during initial load
  useEffect(() => {
    if (!saveMessagesRef.current || !restoreMessagesRef.current) return;
    if (!isActive || !isPanelVisible) return;

    // Disable once hydration completes - stabilization guard takes over
    if (hydrationCompleted) {
      return;
    }

    const timeSincePanelOpen = Date.now() - panelOpenTimeRef.current;
    if (timeSincePanelOpen > WATCHDOG_TIMEOUT) return;

    let watchdogRestoreDone = false;
    const intervalId = setInterval(() => {
      // Skip if manual reset in progress (user intentionally deleted messages)
      if (manualResetInProgressRef.current || persistenceLock.isManualReset(sessionId)) return;

      if (saveMessagesRef.current && restoreMessagesRef.current && storedMessages.length > 0) {
        const currentMessageData = saveMessagesRef.current();
        if (!watchdogRestoreDone && currentMessageData.allMessages.length === 0) {
          if (restoreAttemptsRef.current < MAX_RESTORE_ATTEMPTS) {
            debug.warn('[useMessagePersistence] Watchdog: messages cleared during load, restoring...');
            restoreAttemptsRef.current += 1;
            restoreMessagesRef.current(storedMessages);
          }
          watchdogRestoreDone = true;
        }
      }
    }, WATCHDOG_CHECK_INTERVAL);

    const stopTimeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, WATCHDOG_TIMEOUT);

    return () => {
      clearInterval(intervalId);
      clearTimeout(stopTimeoutId);
    };
  }, [isActive, isPanelVisible, storedMessages, saveMessagesRef, restoreMessagesRef, hydrationCompleted]);

  // Safety timeout: force hydration completion if it doesn't finish
  useEffect(() => {
    if (!hydrationCompleted && isActive) {
      const safetyTimeoutId = setTimeout(() => {
        if (!hydrationCompleted) {
          debug.warn(
            `[useMessagePersistence] Safety timeout - forcing hydration completion after ${HYDRATION_SAFETY_TIMEOUT}ms`,
          );
          setHydrationCompleted(true);
        }
      }, HYDRATION_SAFETY_TIMEOUT);

      return () => clearTimeout(safetyTimeoutId);
    }
    return undefined;
  }, [hydrationCompleted, isActive]);

  // Cross-window message sync: listen for updates from other windows
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged || !isActive) {
      return;
    }

    const messagesUpdatedKey = 'session_storage_sync_messagesUpdated';
    const ourWindowId = sessionStorageDBWrapper.getWindowId();

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local') return;

      const change = changes[messagesUpdatedKey];
      if (!change || !change.newValue) return;

      const syncData = change.newValue as {
        event: string;
        sessionId?: string;
        timestamp: number;
        userId?: string;
        windowId?: string;
      };

      // Filter out self-notifications
      if (syncData.windowId === ourWindowId) {
        return;
      }

      // Only reload if for current session
      if (syncData.sessionId === sessionId && syncData.event === 'messagesUpdated') {
        const oldTimestamp = change.oldValue?.timestamp;
        const newTimestamp = syncData.timestamp;

        // Only reload if timestamp changed
        if (!oldTimestamp || newTimestamp !== oldTimestamp) {
          // Don't reload if streaming is in progress
          const isStreaming = runtimeStateRef.current?.isInProgress ?? false;

          if (isStreaming) {
            debug.log('[useMessagePersistence] Streaming active, deferring cross-window reload');

            // Clear existing pending reload
            if (pendingReloadTimeoutRef.current) {
              clearTimeout(pendingReloadTimeoutRef.current);
            }

            // Check for streaming completion
            const checkStreamingComplete = () => {
              const stillStreaming = runtimeStateRef.current?.isInProgress ?? false;

              if (!stillStreaming && isActive) {
                // Double-check before reload
                if (!(runtimeStateRef.current?.isInProgress ?? false)) {
                  debug.log('[useMessagePersistence] Streaming completed, reloading from cross-window sync');
                  handleLoadMessages();
                  pendingReloadTimeoutRef.current = null;
                  return;
                }
                debug.log('[useMessagePersistence] Streaming restarted, continuing to defer');
              }

              if (stillStreaming) {
                pendingReloadTimeoutRef.current = setTimeout(checkStreamingComplete, STREAMING_CHECK_DELAY);
              }
            };

            pendingReloadTimeoutRef.current = setTimeout(checkStreamingComplete, STREAMING_CHECK_DELAY);
            return;
          }

          debug.log(
            `[useMessagePersistence] Cross-window update detected, reloading messages ` +
              `(from window: ${syncData.windowId?.slice(0, 12) || 'unknown'})`,
          );

          // Delay to ensure IndexedDB has been updated
          setTimeout(() => {
            if (isActive) {
              handleLoadMessages();
            }
          }, CROSS_WINDOW_RELOAD_DELAY);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      if (pendingReloadTimeoutRef.current) {
        clearTimeout(pendingReloadTimeoutRef.current);
        pendingReloadTimeoutRef.current = null;
      }
    };
  }, [sessionId, isActive, handleLoadMessages]);

  return {
    storedMessages,
    storedFilteredMessagesCount,
    setStoredMessages,
    handleSaveMessages,
    handleLoadMessages,
    saveMessagesToStorage,
    isHydrating,
    hydrationCompleted,
  };
};
