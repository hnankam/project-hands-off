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
    } catch (error) {
      debug.error('[useMessagePersistence] Failed to load messages:', error);
    }
  }, [sessionId, restoreMessagesRef, countFilteredMessages]);

  // Auto-restore messages when session becomes active (only once per session open)
  const hasAutoRestoredRef = useRef(false);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    
    // Only auto-restore once when session becomes active
    if (isActive && !hasAutoRestoredRef.current) {
      hasAutoRestoredRef.current = true;
      
      // PERFORMANCE: Reduced delay from 100ms to 50ms for faster session switching
      timeoutId = setTimeout(() => {
        handleLoadMessages();
      }, TIMING_CONSTANTS.AUTO_RESTORE_DELAY);
    }
    
    // Reset flag when session becomes inactive so it can auto-restore when reactivated
    if (!isActive) {
      hasAutoRestoredRef.current = false;
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isActive, handleLoadMessages]);

  return {
    storedMessages,
    storedFilteredMessagesCount,
    setStoredMessages,
    handleSaveMessages,
    handleLoadMessages,
    saveMessagesToStorage
  };
};

