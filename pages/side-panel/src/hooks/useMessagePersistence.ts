import { useState, useCallback, useEffect, useRef } from 'react';
import { debug as baseDebug, sessionStorageDBWrapper } from '@extension/shared';
import type { CopilotMessage } from '@extension/storage';
import { TIMING_CONSTANTS } from '../constants';

// Message data structure returned by saveMessagesRef
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
  storedMessages: CopilotMessage[]; // All messages stored
  storedFilteredMessagesCount: number; // Count of filtered messages for display
  setStoredMessages: React.Dispatch<React.SetStateAction<CopilotMessage[]>>;
  handleSaveMessages: () => Promise<void>;
  handleLoadMessages: () => Promise<void>;
  saveMessagesToStorage: (messages: CopilotMessage[]) => Promise<void>;
  isHydrating: boolean;
  hydrationCompleted: boolean; // True when initial message loading is complete
}

/**
 * useMessagePersistence Hook
 *
 * Manages chat message persistence to Chrome storage
 * - Save messages manually or automatically
 * - Load messages from storage
 * - Auto-restore messages when session becomes active
 */
export const useMessagePersistence = ({
  sessionId,
  isActive,
  isPanelVisible = true,
  saveMessagesRef,
  restoreMessagesRef,
  resetChatRef,
}: UseMessagePersistenceProps): UseMessagePersistenceReturn => {
  // Timestamped debug wrappers
  const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
  const debug = {
    log: (...args: any[]) => baseDebug.log(ts(), ...args),
    warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
    error: (...args: any[]) => baseDebug.error(ts(), ...args),
  } as const;

  const [storedMessages, setStoredMessages] = useState<CopilotMessage[]>([]);
  const [storedFilteredMessagesCount, setStoredFilteredMessagesCount] = useState<number>(0);
  const [isHydrating, setIsHydrating] = useState<boolean>(false);
  const [hydrationCompleted, setHydrationCompleted] = useState<boolean>(false);
  const hydrationFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const storedMessagesRef = useRef<CopilotMessage[]>([]);
  const manualResetInProgressRef = useRef<boolean>(false);

  useEffect(() => {
    storedMessagesRef.current = storedMessages;
  }, [storedMessages]);

  // Wrap the reset function to track manual resets
  useEffect(() => {
    if (!resetChatRef?.current) return;
    
    const originalReset = resetChatRef.current;
    
    // Wrap the reset function
    const wrappedReset = () => {
      debug.log('[useMessagePersistence] Manual reset initiated - disabling stabilization guard');
      manualResetInProgressRef.current = true;
      
      // Call the original reset
      originalReset();
      
      // Clear stored messages immediately
      setStoredMessages([]);
      setStoredFilteredMessagesCount(0);
      
      // Re-enable stabilization after a delay (allow time for reset to complete)
      setTimeout(() => {
        manualResetInProgressRef.current = false;
        debug.log('[useMessagePersistence] Manual reset complete - re-enabling stabilization guard');
      }, 2000);
    };
    
    // Replace the reset function with our wrapped version
    resetChatRef.current = wrappedReset;
    
    // Cleanup: restore original function on unmount
    return () => {
      if (resetChatRef?.current === wrappedReset) {
        resetChatRef.current = originalReset;
      }
    };
  }, [resetChatRef, sessionId]); // Only re-run when resetChatRef or sessionId changes

  const clearHydrationFallback = useCallback(() => {
    if (hydrationFallbackTimeoutRef.current) {
      clearTimeout(hydrationFallbackTimeoutRef.current);
      hydrationFallbackTimeoutRef.current = null;
    }
  }, []);

  const scheduleHydrationFallback = useCallback(() => {
    clearHydrationFallback();
    hydrationFallbackTimeoutRef.current = setTimeout(() => {
      setIsHydrating(false);
      hydrationFallbackTimeoutRef.current = null;
    }, 1500);
  }, [clearHydrationFallback]);

  // Helper function to count filtered messages
  const countFilteredMessages = useCallback((messages: any[]): number => {
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
  }, []);

  // PERFORMANCE OPTIMIZATION: Consolidated save function to avoid code duplication
  // Now stores ALL messages (including thinking messages)
  const saveMessagesToStorage = useCallback(
    async (messagesToSave: CopilotMessage[]) => {
      if (!messagesToSave || messagesToSave.length === 0) {
        return;
      }

      try {
        // 📝 LOG FULL RAW MESSAGES BEING SAVED
        // debug.log('========== SAVING MESSAGES TO STORAGE ==========');
        // debug.log(`Session ID: ${sessionId}`);
        // debug.log(`Total messages to save: ${messagesToSave.length}`);
        // debug.log(`Filtered messages count: ${countFilteredMessages(messagesToSave)}`);
        // debug.log(`Timestamp: ${new Date().toISOString()}`);

        // messagesToSave.forEach((msg, index) => {
        //   // Guard against undefined/null messages
        //   if (!msg) {
        //     debug.warn(`⚠️ Message ${index + 1} is undefined or null, skipping`);
        //     return;
        //   }

        //   debug.log(`\n--- Message ${index + 1} to Save ---`);

        //   try {
        //     debug.log('Full raw message (JSON):', JSON.stringify(msg, null, 2));
        //   } catch (e) {
        //     debug.warn('Failed to stringify message:', e);
        //   }

        //   debug.log('Message summary:', {
        //     role: msg.role || 'unknown',
        //     content:
        //       typeof msg.content === 'string'
        //         ? msg.content
        //         : msg.content
        //           ? JSON.stringify(msg.content)
        //           : '[no content]',
        //     id: msg.id || 'no-id',
        //     hasToolCalls: !!(msg as any).toolCalls,
        //     contentLength:
        //       typeof msg.content === 'string'
        //         ? msg.content.length
        //         : msg.content
        //           ? JSON.stringify(msg.content).length
        //           : 0,
        //   });

        //   // Highlight message type
        //   if (msg.role === 'assistant') {
        //     debug.log('💾 Saving AGENT message');
        //   } else if (msg.role === 'user') {
        //     debug.log('💾 Saving USER message');
        //   } else {
        //     debug.log(`💾 Saving ${msg.role || 'unknown'} message`);
        //   }
        // });
        // debug.log('==============================================\n');

        // Filter out any undefined/null messages before saving
        const validMessages = messagesToSave.filter(msg => msg !== null && msg !== undefined);

        if (validMessages.length !== messagesToSave.length) {
          debug.warn(`⚠️ Filtered out ${messagesToSave.length - validMessages.length} undefined/null messages`);
        }

        // Sanitize messages to remove non-serializable data (functions, React components, etc.)
        // Uses JSON round-trip which is more reliable than Blob serialization for Chrome storage
        const sanitizedMessages = validMessages.map((msg: any) => {
          try {
            // Deep clone through JSON to remove non-serializable data
            // This preserves: primitives, plain objects, arrays, dates, regex
            // This removes: functions, React components, circular refs, symbols
            return JSON.parse(JSON.stringify(msg));
          } catch (error) {
            debug.error('Failed to sanitize message, using basic copy:', error);
            // Fallback: copy only serializable properties
            return {
              id: msg.id,
              role: msg.role,
              content: typeof msg.content === 'string' ? msg.content : String(msg.content || ''),
              createdAt: msg.createdAt,
              // Preserve toolCalls if present and serializable
              ...(msg.toolCalls && { toolCalls: msg.toolCalls }),
              // Preserve metadata if present
              ...(msg.metadata && { metadata: msg.metadata }),
            };
          }
        });

        await sessionStorageDBWrapper.updateAllMessages(sessionId, sanitizedMessages);
        setStoredMessages(sanitizedMessages);
        setStoredFilteredMessagesCount(countFilteredMessages(sanitizedMessages));
        debug.log(
          `✅ [useMessagePersistence] Successfully saved ${sanitizedMessages.length} messages (${countFilteredMessages(sanitizedMessages)} filtered) for session ${sessionId}`,
        );
      } catch (error) {
        debug.error('❌ [useMessagePersistence] Failed to save messages to storage:', error);
      }
    },
    [sessionId, countFilteredMessages],
  );

  // Manual save function using CopilotKit API
  const handleSaveMessages = useCallback(async () => {
    // minimal log

    if (!saveMessagesRef.current) {
      debug.log('[useMessagePersistence] saveMessagesRef.current is null, returning');
      return;
    }

    try {
      // Get both all messages and filtered messages from ChatInner
      const messageData = saveMessagesRef.current();
      const allMessages = messageData.allMessages || [];
      const filteredMessages = messageData.filteredMessages || [];

      debug.log('[useMessagePersistence] Messages to save:', {
        total: allMessages.length,
        filtered: filteredMessages.length,
      });

      // 📝 LOG FULL RAW MESSAGES BEING MANUALLY SAVED
      debug.log('========== MANUAL SAVE TO STORAGE ==========');
      debug.log(`Session ID: ${sessionId}`);
      debug.log(`Total messages: ${allMessages.length}`);
      debug.log(`Filtered messages: ${filteredMessages.length}`);
      debug.log(`Timestamp: ${new Date().toISOString()}`);

      allMessages.forEach((msg: any, index: number) => {
        // Guard against undefined/null messages
        if (!msg) {
          debug.warn(`⚠️ Message ${index + 1} (Manual Save) is undefined or null, skipping`);
          return;
        }

        debug.log(`\n--- Message ${index + 1} (Manual Save) ---`);

        try {
          debug.log('Full raw message (JSON):', JSON.stringify(msg, null, 2));
        } catch (e) {
          debug.warn('Failed to stringify message:', e);
        }

        debug.log('Message summary:', {
          role: msg.role || 'unknown',
          content:
            typeof msg.content === 'string' ? msg.content : msg.content ? JSON.stringify(msg.content) : '[no content]',
          id: msg.id || 'no-id',
          hasToolCalls: !!msg.toolCalls,
          contentLength:
            typeof msg.content === 'string' ? msg.content.length : msg.content ? JSON.stringify(msg.content).length : 0,
        });

        // Highlight message type
        if (msg.role === 'assistant') {
          debug.log('💾 Manually saving AGENT message');
        } else if (msg.role === 'user') {
          debug.log('💾 Manually saving USER message');
        } else {
          debug.log(`💾 Manually saving ${msg.role || 'unknown'} message`);
        }
      });
      debug.log('===========================================\n');

      // Filter out any undefined/null messages before saving
      const validMessages = allMessages.filter((msg: any) => msg !== null && msg !== undefined);

      if (validMessages.length !== allMessages.length) {
        debug.warn(
          `⚠️ Filtered out ${allMessages.length - validMessages.length} undefined/null messages (Manual Save)`,
        );
      }

      // Sanitize messages to remove non-serializable data (functions, React components, etc.)
      // Uses JSON round-trip which is more reliable than Blob serialization for Chrome storage
      const sanitizedMessages = validMessages.map((msg: any) => {
        try {
          // Deep clone through JSON to remove non-serializable data
          // This preserves: primitives, plain objects, arrays, dates, regex
          // This removes: functions, React components, circular refs, symbols
          return JSON.parse(JSON.stringify(msg));
        } catch (error) {
          debug.error('Failed to sanitize message, using basic copy:', error);
          // Fallback: copy only serializable properties
          return {
            id: msg.id,
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : String(msg.content || ''),
            createdAt: msg.createdAt,
            // Preserve toolCalls if present and serializable
            ...(msg.toolCalls && { toolCalls: msg.toolCalls }),
            // Preserve metadata if present
            ...(msg.metadata && { metadata: msg.metadata }),
          };
        }
      });

      // Save ALL messages to Chrome storage (not just filtered ones)
      await sessionStorageDBWrapper.updateAllMessages(sessionId, sanitizedMessages);

      // Update local state with sanitized messages
      setStoredMessages(sanitizedMessages);
      setStoredFilteredMessagesCount(filteredMessages.length);
      debug.log('✅ [useMessagePersistence] Messages saved successfully');
    } catch (error) {
      debug.error('❌ [useMessagePersistence] Failed to save messages:', error);
    }
  }, [sessionId, saveMessagesRef]);

  // Manual load function using CopilotKit API
  const restoreAttemptsRef = useRef(0);
  const MAX_RESTORE_ATTEMPTS = 2; // initial + one retry

  const handleLoadMessages = useCallback(async () => {
    debug.log(`📥 [useMessagePersistence] handleLoadMessages called for session ${sessionId}`);
    setIsHydrating(true);
    scheduleHydrationFallback();

    if (!restoreMessagesRef.current) {
      debug.log('[useMessagePersistence] restoreMessagesRef.current is null, returning');
      clearHydrationFallback();
      setIsHydrating(false);
      return;
    }

    // Reset restore attempts counter on manual load to allow fresh attempts
    restoreAttemptsRef.current = 0;
    debug.log('[useMessagePersistence] Reset restore attempts counter for fresh load');

    try {
      const messages = await sessionStorageDBWrapper.getAllMessagesAsync(sessionId);

      debug.log('[useMessagePersistence] Messages to load:', messages.length);

      const computeStorageSignature = (msgs: CopilotMessage[]) => {
        return JSON.stringify(
          (msgs || []).map((m: any) => m?.id ?? `${m?.role || 'unknown'}-${typeof m?.content === 'string' ? m.content.length : 0}`),
        );
      };

      const previousMessages = storedMessagesRef.current;
      const previousSignature = computeStorageSignature(previousMessages as CopilotMessage[]);
      const incomingSignature = computeStorageSignature(messages as CopilotMessage[]);

      const currentInMemoryMessagesCount = (() => {
        try {
          if (!saveMessagesRef.current) return null;
          const data = saveMessagesRef.current();
          return data?.allMessages?.length ?? null;
        } catch (err) {
          debug.warn(`[useMessagePersistence] Failed to inspect in-memory messages for session ${sessionId}:`, err);
          return null;
        }
      })();

      const signaturesMatch = previousSignature === incomingSignature;
      let shouldRestoreMessages = false;

      if (messages.length === 0) {
        debug.log(`[useMessagePersistence] No messages to load for session ${sessionId}`);

        // Ensure local state reflects an empty session immediately
        setStoredMessages([]);
        setStoredFilteredMessagesCount(0);
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
        debug.log(`🎯 [useMessagePersistence] Hydration COMPLETED for session ${sessionId} (no messages)`);
        return;
      } else {
        if (!signaturesMatch) {
          shouldRestoreMessages = true;
          debug.log('[useMessagePersistence] Detected different message signatures - will restore from storage');
        } else if (currentInMemoryMessagesCount !== null) {
          // When signatures match but in-memory state is empty (e.g., CopilotKit lost messages), force a restore
          if (currentInMemoryMessagesCount === 0 && messages.length > 0) {
            shouldRestoreMessages = true;
            debug.warn(
              `[useMessagePersistence] Signatures match but in-memory messages are empty for session ${sessionId}; forcing restore`,
            );
          }
        }

        if (!shouldRestoreMessages) {
          debug.log(`[useMessagePersistence] Messages unchanged in storage for session ${sessionId}, skipping restore`);
          setStoredMessages(messages);
          setStoredFilteredMessagesCount(countFilteredMessages(messages));
          clearHydrationFallback();
          setIsHydrating(false);
          setHydrationCompleted(true);
          debug.log(
            `🎯 [useMessagePersistence] Hydration COMPLETED for session ${sessionId} (messages unchanged, no restore needed)`,
          );
          return;
        }

        // Validate messages before restoring to prevent "undefined role" errors
        const validMessages = messages.filter((msg: any) => {
          if (!msg || typeof msg !== 'object') return false;
          // Ensure role property exists and is valid
          if (!msg.role || typeof msg.role !== 'string' || !['user', 'assistant', 'tool', 'system'].includes(msg.role)) {
            debug.warn('[useMessagePersistence] Filtering out message with invalid role during restore:', msg.role);
            return false;
          }
          return true;
        });
        
        if (validMessages.length < messages.length) {
          debug.warn(`[useMessagePersistence] Filtered out ${messages.length - validMessages.length} invalid messages during restore`);
        }
        
        // Restore ALL valid messages (including thinking messages) using ChatInner's setMessages
        if (restoreAttemptsRef.current < MAX_RESTORE_ATTEMPTS && validMessages.length > 0) {
          restoreAttemptsRef.current += 1;
          restoreMessagesRef.current(validMessages);
        } else if (validMessages.length === 0) {
          debug.warn('[useMessagePersistence] No valid messages to restore after filtering');
        } else {
          debug.log('[useMessagePersistence] Skipping restore - max attempts reached');
        }
        setStoredMessages(messages);
        setStoredFilteredMessagesCount(countFilteredMessages(messages));
        debug.log('✅ [useMessagePersistence] Messages loaded successfully');

        clearHydrationFallback();
        setIsHydrating(false);

        // Verify messages were actually set after a short delay
        // If they were cleared, try restoring again (handles CopilotKit initialization race)
        // OPTIMIZATION: Reduced to 150ms to complete quickly (target: ~250ms total)
        setTimeout(() => {
          // Check if we have access to the current messages through saveMessagesRef
          if (saveMessagesRef.current) {
            const currentMessageData = saveMessagesRef.current();
            if (currentMessageData.allMessages.length === 0 && validMessages.length > 0) {
              if (restoreAttemptsRef.current < MAX_RESTORE_ATTEMPTS) {
                debug.log('[useMessagePersistence] Messages cleared after restore, retrying once...');
                restoreAttemptsRef.current += 1;
                if (restoreMessagesRef.current) {
                  restoreMessagesRef.current(validMessages);
                  debug.log('[useMessagePersistence] Messages re-restored successfully');
                }
              } else {
                debug.log('[useMessagePersistence] Not retrying restore - max attempts reached');
              }
            }
          }
          // Signal hydration completion after retry logic completes
          setHydrationCompleted(true);
          debug.log(`🎯 [useMessagePersistence] Hydration COMPLETED for session ${sessionId} (messages restored and verified)`);
        }, 150); // Reduced to keep total restoration under 600ms
      }
    } catch (error) {
      debug.error(`❌ [useMessagePersistence] Failed to load messages for session ${sessionId}:`, error);
      setHydrationCompleted(true); // Complete even on error to unblock UI
      debug.log(`🎯 [useMessagePersistence] Hydration COMPLETED for session ${sessionId} (with error, unblocking UI)`);
    } finally {
      clearHydrationFallback();
      setIsHydrating(false);
    }
  }, [sessionId, restoreMessagesRef, saveMessagesRef, countFilteredMessages, scheduleHydrationFallback, clearHydrationFallback]);

  // Auto-restore messages when session becomes active or panel is reopened
  const hasAutoRestoredRef = useRef(false);
  const autoRestoreAttemptRef = useRef(0);
  const lastRestoredSessionRef = useRef<string>('');
  const panelOpenTimeRef = useRef<number>(0);

  // Track when panel becomes visible and reset auto-restore flag when it becomes hidden
  const wasPanelVisibleRef = useRef(isPanelVisible);
  useEffect(() => {
    // Panel just became visible
    if (isPanelVisible && isActive && !wasPanelVisibleRef.current) {
      panelOpenTimeRef.current = Date.now();
      
      // Reset auto-restore flag when panel reopens
      hasAutoRestoredRef.current = false;
      autoRestoreAttemptRef.current = 0;
      restoreAttemptsRef.current = 0;
      setIsHydrating(true);
      setHydrationCompleted(false);
      scheduleHydrationFallback();
    }
    
    wasPanelVisibleRef.current = isPanelVisible;
  }, [isPanelVisible, isActive, sessionId, scheduleHydrationFallback]);
  
  // Reset auto-restore flag and attempts counter when session changes
  useEffect(() => {
    if (lastRestoredSessionRef.current !== sessionId) {
      debug.log(`🔄 [useMessagePersistence] Session changed from ${lastRestoredSessionRef.current || 'none'} to ${sessionId}, resetting restore flags`);
      hasAutoRestoredRef.current = false;
      restoreAttemptsRef.current = 0; // Reset attempts for new session
      lastRestoredSessionRef.current = sessionId;
      setIsHydrating(true);
      setHydrationCompleted(false); // Reset completion flag for new session
      scheduleHydrationFallback();
      autoRestoreAttemptRef.current = 0;
    }
  }, [sessionId, scheduleHydrationFallback]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    // Auto-restore when:
    // 1. Session becomes active and hasn't been restored yet
    // 2. Panel becomes visible again (reopened) for an active session
    if (isActive && isPanelVisible) {
      const scheduleAttempt = (delay: number, attempt: number) => {
        timeoutId = setTimeout(() => {
          const ready = Boolean(saveMessagesRef.current && restoreMessagesRef.current);

          if (!ready) {
            if (attempt < 10) {
              autoRestoreAttemptRef.current = attempt;
              debug.warn(
                `⏳ [useMessagePersistence] CopilotKit not ready for restore (attempt ${attempt}) - retrying in ${delay}ms`,
              );
              scheduleAttempt(Math.min(delay + 100, 500), attempt + 1);
              return;
            }

            debug.error(
              `❌ [useMessagePersistence] Auto-restore failed after ${attempt} attempts - CopilotKit not ready (session ${sessionId})`,
            );
            return;
          }

          autoRestoreAttemptRef.current = attempt;
          hasAutoRestoredRef.current = true;
          debug.log(
            `🔄 [useMessagePersistence] Auto-restore triggered for session ${sessionId} (attempt ${attempt}) - CopilotKit ready`,
          );
          handleLoadMessages();
        }, delay);
      };

      // Check if messages exist in memory
      const currentInMemoryMessagesCount = (() => {
        try {
          if (!saveMessagesRef.current) return null;
          const data = saveMessagesRef.current();
          return data?.allMessages?.length ?? null;
        } catch (err) {
          return null;
        }
      })();

      // Reset auto-restore flag if messages are empty in memory but exist in storage (safety net)
      if (hasAutoRestoredRef.current && currentInMemoryMessagesCount === 0 && storedMessages.length > 0) {
        debug.warn(`⚠️ [useMessagePersistence] Messages missing in memory, resetting auto-restore for session ${sessionId}`);
        hasAutoRestoredRef.current = false;
        autoRestoreAttemptRef.current = 0;
      }

      if (!hasAutoRestoredRef.current) {
        scheduleAttempt(100, 1);
      } else {
        // If we're skipping but messages are actually empty, force restore
        if (currentInMemoryMessagesCount === 0 && storedMessages.length > 0) {
          debug.error(`❌ [useMessagePersistence] Skipping restore but messages empty - forcing restore`);
          hasAutoRestoredRef.current = false;
          autoRestoreAttemptRef.current = 0;
          restoreAttemptsRef.current = 0;
          scheduleAttempt(150, 1);
        }
      }
    }

    // Only reset flag when session changes, NOT on visibility toggles
    // However, we DO check above if messages are missing and reset the flag if needed

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isActive, isPanelVisible, handleLoadMessages, sessionId, saveMessagesRef, storedMessages.length]);

  useEffect(() => {
    return () => {
      clearHydrationFallback();
    };
  }, [clearHydrationFallback]);

  // STABILIZATION GUARD: Actively protect messages from being cleared after hydration completes
  // This runs AFTER hydration and prevents any code (including CopilotKit internals) from clearing messages
  const stabilizationActiveRef = useRef(false);
  
  useEffect(() => {
    if (!saveMessagesRef.current || !restoreMessagesRef.current) return;
    if (!isActive || !isPanelVisible) return;
    if (!hydrationCompleted) return;
    if (storedMessages.length === 0) return;

    // Activate stabilization guard only after hydration completes
    stabilizationActiveRef.current = true;

    // Monitor for any unexpected clearing and immediately restore
    const guardIntervalId = setInterval(() => {
      if (saveMessagesRef.current && restoreMessagesRef.current) {
        const currentMessageData = saveMessagesRef.current();
        
        // Skip restoration if a manual reset is in progress
        if (manualResetInProgressRef.current) {
          return;
        }
        
        // If messages were cleared after stabilization, immediately restore them
        if (currentMessageData.allMessages.length === 0 && storedMessages.length > 0) {
          debug.error(
            `🚨 [useMessagePersistence] Messages cleared after stabilization! Force-restoring ${storedMessages.length} messages`,
          );
          restoreMessagesRef.current(storedMessages);
        }
      }
    }, 100);

    return () => {
      clearInterval(guardIntervalId);
      stabilizationActiveRef.current = false;
    };
  }, [isActive, isPanelVisible, storedMessages, saveMessagesRef, restoreMessagesRef, hydrationCompleted]);

  // Pre-stabilization watchdog: Monitor for unexpected message clearing during initial load
  // DISABLED once hydration completes (replaced by stabilization guard above)
  useEffect(() => {
    if (!saveMessagesRef.current || !restoreMessagesRef.current) return;
    if (!isActive || !isPanelVisible) return;
    
    // Disable watchdog once hydration completes - stabilization guard takes over
    if (hydrationCompleted) {
      return;
    }

    const timeSincePanelOpen = Date.now() - panelOpenTimeRef.current;
    if (timeSincePanelOpen > 600) return;

    let watchdogRestoreDone = false;
    const intervalId = setInterval(() => {
      if (saveMessagesRef.current && restoreMessagesRef.current && storedMessages.length > 0) {
        const currentMessageData = saveMessagesRef.current();
        if (!watchdogRestoreDone && currentMessageData.allMessages.length === 0) {
          if (restoreAttemptsRef.current < MAX_RESTORE_ATTEMPTS) {
            debug.warn('⚠️ [useMessagePersistence] Watchdog: messages cleared during load, restoring...');
            restoreAttemptsRef.current += 1;
            restoreMessagesRef.current(storedMessages);
          }
          watchdogRestoreDone = true;
        }
      }
    }, 200);

    const stopTimeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, 600);

    return () => {
      clearInterval(intervalId);
      clearTimeout(stopTimeoutId);
    };
  }, [isActive, isPanelVisible, storedMessages, saveMessagesRef, restoreMessagesRef, hydrationCompleted]);

  // Safety timeout: ensure hydrationCompleted is set to true after max wait time
  // This prevents the UI from getting stuck waiting for hydration
  useEffect(() => {
    if (!hydrationCompleted && isActive) {
      const safetyTimeoutId = setTimeout(() => {
        if (!hydrationCompleted) {
          debug.warn(`⚠️ [useMessagePersistence] Safety timeout triggered for session ${sessionId} - forcing hydration completion after 2s`);
          setHydrationCompleted(true);
        }
      }, 2000); // 2s max wait time as safety net

      return () => clearTimeout(safetyTimeoutId);
    }
    return undefined;
  }, [hydrationCompleted, isActive, sessionId]);

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
