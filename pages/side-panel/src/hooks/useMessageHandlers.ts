/**
 * Message Handlers Hook
 * 
 * Consolidates all message listening logic:
 * - Close messages from popup
 * - Context menu actions
 * - Panel closing broadcasts
 */

import { useEffect, useState, useRef } from 'react';
import { debug } from '@extension/shared';

// Clear context menu message after this delay to allow processing
const CONTEXT_MENU_CLEAR_DELAY = 1000; // 1 second

/**
 * Hook to handle incoming Chrome extension messages and panel lifecycle events.
 * 
 * Responsibilities:
 * - Listens for close panel messages from popup
 * - Handles context menu actions and distributes to active session
 * - Broadcasts panel closing events for auto-save coordination
 * 
 * @returns Object containing:
 *   - contextMenuMessage: string | null - Current context menu message (cleared after 1s)
 * 
 * @example
 * ```tsx
 * const { contextMenuMessage } = useMessageHandlers();
 * 
 * // Pass to active session:
 * <ChatInner contextMenuMessage={contextMenuMessage} />
 * ```
 */
export function useMessageHandlers() {
  const [contextMenuMessage, setContextMenuMessage] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Listen for close messages and context menu actions
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.action === 'closeSidePanel') {
        debug.log('[useMessageHandlers] Close message received, closing panel');
        window.close();
      } else if (message.type === 'CONTEXT_MENU_ACTION') {
        debug.log('[useMessageHandlers] Context menu action received:', message.message?.substring(0, 50));
        
        // Clear any pending timeout to prevent race conditions
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        // Set the message to be sent to the active chat session
        setContextMenuMessage(message.message);
        
        // Clear after a short delay to allow the message to be processed
        timeoutRef.current = setTimeout(() => {
          setContextMenuMessage(null);
          timeoutRef.current = null;
        }, CONTEXT_MENU_CLEAR_DELAY);
      }
    };
    
    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      // Cancel pending timeout on unmount to prevent state updates
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);
  
  /**
   * Broadcast panel closing event to all sessions for auto-save.
   * Fires on: beforeunload, pagehide, visibilitychange (hidden), and unmount.
   */
  useEffect(() => {
    const broadcastClosing = () => {
      debug.log('[useMessageHandlers] Broadcasting panel closing event');
      window.dispatchEvent(new CustomEvent('panelClosing'));
    };
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        debug.log('[useMessageHandlers] Panel hidden, broadcasting closing event');
        broadcastClosing();
      }
    };
    
    window.addEventListener('beforeunload', broadcastClosing);
    window.addEventListener('pagehide', broadcastClosing);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      broadcastClosing();
      window.removeEventListener('beforeunload', broadcastClosing);
      window.removeEventListener('pagehide', broadcastClosing);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
  
  return { contextMenuMessage };
}

