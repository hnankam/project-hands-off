import { useState, useCallback, useEffect, useRef } from 'react';
import { debug } from '@extension/shared';
import type { CopilotMessage } from '@extension/storage';
import { STORAGE_CONSTANTS, TIMING_CONSTANTS } from '../constants';

// Interface for stored chat data (stores ALL messages, not filtered)
interface StoredChatData {
  [sessionId: string]: CopilotMessage[];
}

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
}

export interface UseMessagePersistenceReturn {
  storedMessages: CopilotMessage[]; // All messages stored
  storedFilteredMessagesCount: number; // Count of filtered messages for display
  setStoredMessages: React.Dispatch<React.SetStateAction<CopilotMessage[]>>;
  handleSaveMessages: () => Promise<void>;
  handleLoadMessages: () => Promise<void>;
  saveMessagesToStorage: (messages: CopilotMessage[]) => Promise<void>;
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
  restoreMessagesRef
}: UseMessagePersistenceProps): UseMessagePersistenceReturn => {
  
  const [storedMessages, setStoredMessages] = useState<CopilotMessage[]>([]);
  const [storedFilteredMessagesCount, setStoredFilteredMessagesCount] = useState<number>(0);

  // Helper function to count filtered messages
  const countFilteredMessages = useCallback((messages: any[]): number => {
    if (!messages || messages.length === 0) return 0;
    
    return messages.filter((message) => {
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
  const saveMessagesToStorage = useCallback(async (messagesToSave: CopilotMessage[]) => {
    if (!messagesToSave || messagesToSave.length === 0) {
      return;
    }
    
    try {
      const result = await chrome.storage.local.get([STORAGE_CONSTANTS.CHAT_STORAGE_KEY]);
      const storedData: StoredChatData = result[STORAGE_CONSTANTS.CHAT_STORAGE_KEY] || {};
      storedData[sessionId] = messagesToSave;
      await chrome.storage.local.set({ [STORAGE_CONSTANTS.CHAT_STORAGE_KEY]: storedData });
      setStoredMessages(messagesToSave);
      setStoredFilteredMessagesCount(countFilteredMessages(messagesToSave));
      debug.log(`[useMessagePersistence] Saved ${messagesToSave.length} messages (${countFilteredMessages(messagesToSave)} filtered) for session ${sessionId}`);
    } catch (error) {
      debug.error('[useMessagePersistence] Failed to save messages to storage:', error);
    }
  }, [sessionId, countFilteredMessages]);

  // Manual save function using CopilotKit API
  const handleSaveMessages = useCallback(async () => {
    debug.log('[useMessagePersistence] handleSaveMessages called, saveMessagesRef.current:', saveMessagesRef.current);
    
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
        filtered: filteredMessages.length
      });
      
      // Save ALL messages to Chrome storage (not just filtered ones)
      const result = await chrome.storage.local.get([STORAGE_CONSTANTS.CHAT_STORAGE_KEY]);
      const storedData: StoredChatData = result[STORAGE_CONSTANTS.CHAT_STORAGE_KEY] || {};
      storedData[sessionId] = allMessages;
      await chrome.storage.local.set({ [STORAGE_CONSTANTS.CHAT_STORAGE_KEY]: storedData });
      
      // Update local state
      setStoredMessages(allMessages);
      setStoredFilteredMessagesCount(filteredMessages.length);
      debug.log('[useMessagePersistence] Messages saved successfully');
    } catch (error) {
      debug.error('[useMessagePersistence] Failed to save messages:', error);
    }
  }, [sessionId, saveMessagesRef]);

  // Manual load function using CopilotKit API
  const handleLoadMessages = useCallback(async () => {
    debug.log('[useMessagePersistence] handleLoadMessages called, restoreMessagesRef.current:', restoreMessagesRef.current);
    
    if (!restoreMessagesRef.current) {
      debug.log('[useMessagePersistence] restoreMessagesRef.current is null, returning');
      return;
    }
    
    try {
      const result = await chrome.storage.local.get([STORAGE_CONSTANTS.CHAT_STORAGE_KEY]);
      const storedData: StoredChatData = result[STORAGE_CONSTANTS.CHAT_STORAGE_KEY] || {};
      const messages = storedData[sessionId] || [];
      
      debug.log('[useMessagePersistence] Messages to load:', messages.length);
      
      if (messages.length === 0) {
        debug.log('[useMessagePersistence] No messages to load');
        return;
      }
      
      // Restore ALL messages (including thinking messages) using ChatInner's setMessages
      restoreMessagesRef.current(messages);
      setStoredMessages(messages);
      setStoredFilteredMessagesCount(countFilteredMessages(messages));
      debug.log('[useMessagePersistence] Messages loaded successfully');
      
      // Verify messages were actually set after a short delay
      // If they were cleared, try restoring again (handles CopilotKit initialization race)
      setTimeout(() => {
        // Check if we have access to the current messages through saveMessagesRef
        if (saveMessagesRef.current) {
          const currentMessageData = saveMessagesRef.current();
          if (currentMessageData.allMessages.length === 0 && messages.length > 0) {
            debug.log('[useMessagePersistence] Messages were cleared after restore, retrying...');
            if (restoreMessagesRef.current) {
              restoreMessagesRef.current(messages);
              debug.log('[useMessagePersistence] Messages re-restored successfully');
            }
          }
        }
      }, 200);
    } catch (error) {
      debug.error('[useMessagePersistence] Failed to load messages:', error);
    }
  }, [sessionId, restoreMessagesRef, saveMessagesRef, countFilteredMessages]);

  // Auto-restore messages when session becomes active or panel is reopened
  const hasAutoRestoredRef = useRef(false);
  const panelOpenTimeRef = useRef<number>(0);
  
  // Track when panel becomes visible
  useEffect(() => {
    if (isPanelVisible && isActive) {
      panelOpenTimeRef.current = Date.now();
    }
  }, [isPanelVisible, isActive]);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    
    // Auto-restore when:
    // 1. Session becomes active and hasn't been restored yet
    // 2. Panel becomes visible again (reopened) for an active session
    if (isActive && isPanelVisible && !hasAutoRestoredRef.current) {
      hasAutoRestoredRef.current = true;
      
      // Wait longer to ensure CopilotKit has fully initialized before restoring
      // This prevents CopilotKit from overriding restored messages with empty thread state
      timeoutId = setTimeout(() => {
        debug.log('[useMessagePersistence] Auto-restore triggered - waiting for CopilotKit initialization');
        handleLoadMessages();
      }, 500); // Increased from 50ms to 500ms to allow CopilotKit to initialize
    }
    
    // Reset flag when session becomes inactive OR panel becomes hidden
    // This allows auto-restore to trigger again when reactivated or panel reopens
    if (!isActive || !isPanelVisible) {
      hasAutoRestoredRef.current = false;
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isActive, isPanelVisible, handleLoadMessages]);
  
  // Monitor for unexpected message clearing shortly after panel opens
  // and auto-restore if it happens (handles CopilotKit race conditions)
  useEffect(() => {
    if (!saveMessagesRef.current || !restoreMessagesRef.current) return;
    if (!isActive || !isPanelVisible) return;
    
    const timeSincePanelOpen = Date.now() - panelOpenTimeRef.current;
    // Only monitor for the first 2 seconds after panel opens
    if (timeSincePanelOpen > 2000) return;
    
    const intervalId = setInterval(() => {
      if (saveMessagesRef.current && restoreMessagesRef.current && storedMessages.length > 0) {
        const currentMessageData = saveMessagesRef.current();
        // If messages were unexpectedly cleared, restore them
        if (currentMessageData.allMessages.length === 0) {
          debug.log('[useMessagePersistence] Messages unexpectedly cleared, auto-restoring...');
          restoreMessagesRef.current(storedMessages);
        }
      }
    }, 300); // Check every 300ms
    
    // Stop monitoring after 2 seconds
    const stopTimeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, 2000);
    
    return () => {
      clearInterval(intervalId);
      clearTimeout(stopTimeoutId);
    };
  }, [isActive, isPanelVisible, storedMessages, saveMessagesRef, restoreMessagesRef]);

  return {
    storedMessages,
    storedFilteredMessagesCount,
    setStoredMessages,
    handleSaveMessages,
    handleLoadMessages,
    saveMessagesToStorage
  };
};

