/**
 * @fileoverview Message Handlers Hook
 * 
 * Consolidates all message listening logic:
 * - Close messages from popup
 * - Context menu actions
 * - Panel closing broadcasts
 */

import { useEffect, useState } from 'react';

export function useMessageHandlers() {
  const [contextMenuMessage, setContextMenuMessage] = useState<string | null>(null);
  
  // Listen for close messages and context menu actions
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.action === 'closeSidePanel') {
        window.close();
      } else if (message.type === 'CONTEXT_MENU_ACTION') {
        // Set the message to be sent to the active chat session
        setContextMenuMessage(message.message);
        // Clear after a short delay to allow the message to be processed
        setTimeout(() => setContextMenuMessage(null), 1000);
      }
    };
    
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);
  
  // Broadcast panel closing event to all sessions for auto-save
  useEffect(() => {
    const broadcastClosing = () => {
      window.dispatchEvent(new CustomEvent('panelClosing'));
    };
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
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

