/**
 * @fileoverview Message Router for Chrome Extension
 *
 * This module handles all message passing between the background script,
 * content scripts, side panel, and offscreen document. It implements a
 * centralized message routing system with type-safe handlers.
 *
 * Message Types:
 * - Offscreen communication (ready, responses)
 * - Embedding operations (initialize, embed page, generate)
 * - Page content operations (update, get, extract)
 * - Navigation events (URL changes, DOM changes)
 * - Tab operations (get current tab)
 * - Context menu position tracking
 *
 * @module messaging/router
 */

import { logger } from '../utils/logger';
import { PageContent } from '../types';

/**
 * Message handler function type
 */
type MessageHandler = (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => boolean | void;

/**
 * Message handlers registry
 */
const messageHandlers: Record<string, MessageHandler> = {};

/**
 * Register a message handler
 * 
 * @param type - Message type
 * @param handler - Handler function
 */
export function registerMessageHandler(type: string, handler: MessageHandler): void {
  messageHandlers[type] = handler;
  logger.debug(`[Message Router] Registered handler for '${type}'`);
}

/**
 * Setup the main message listener
 * 
 * This function should be called once during extension initialization.
 * It sets up the centralized message router that dispatches messages
 * to registered handlers.
 */
export function setupMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const messageType = message.type;
    
    if (!messageType) {
      logger.warn('[Message Router] Received message without type:', message);
      return false;
    }
    
    const handler = messageHandlers[messageType];
    
    if (handler) {
      try {
        // Call handler and return its result (true = async response)
        const result = handler(message, sender, sendResponse);
        return result === true;
      } catch (error) {
        logger.error(`[Message Router] Error in handler for '${messageType}':`, error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        return false;
      }
    } else {
      logger.warn(`[Message Router] No handler for message type '${messageType}'`);
      return false;
    }
  });
  
  logger.info('[Message Router] Message router initialized');
}

/**
 * Setup context menu click position listener
 * 
 * This is a separate listener for capturing context menu click positions
 * which are used for element analysis.
 */
export function setupContextMenuPositionListener(
  onPositionCaptured: (position: { x: number; y: number }) => void
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONTEXT_MENU_CLICK_POSITION') {
      onPositionCaptured(message.position);
      logger.debug('[Message Router] Context menu click position captured:', message.position);
    }
    // Always return false as this listener doesn't send responses
    return false;
  });
  
  logger.info('[Message Router] Context menu position listener initialized');
}

/**
 * Register standard message handlers
 * 
 * This function registers all standard message handlers used by the extension.
 * It should be called after setting up the message router.
 * 
 * @param handlers - Object containing all handler functions
 */
export function registerStandardHandlers(handlers: {
  // Offscreen handlers
  onOffscreenReady: () => void;
  
  // Embedding handlers
  onInitializeEmbedding: (requestId: string) => void;
  onEmbedPageContent: (content: PageContent, requestId: string) => void;
  onEmbedPageContentForTab: (tabId: number, requestId: string) => void;
  onGenerateEmbedding: (text: string, requestId: string) => void;
  onGenerateEmbeddings: (texts: string[], requestId: string) => void;
  
  // Page content handlers
  onPageContentUpdate: (data: PageContent, tabId?: number) => void;
  onGetPageContent: (tabId?: number) => PageContent | null;
  onRequestPageAnalysis: (tabId?: number) => void;
  onGetPageContentOnDemand: (tabId: number, sendResponse: (response: any) => void) => void;
  
  // Navigation handlers
  onUrlChanged: (tabId: number, url: string) => void;
  onDomContentChanged: (tabId: number, url: string, timestamp: number, domUpdate: any) => void;
  
  // Tab handlers
  onGetCurrentTab: (sendResponse: (response: any) => void) => void;
}): void {
  
  // Offscreen ready signal
  registerMessageHandler('offscreenReady', (message) => {
    handlers.onOffscreenReady();
    return false;
  });
  
  // Offscreen responses (handled by sendToOffscreen listeners)
  registerMessageHandler('offscreenResponse', () => {
    return false;
  });
  
  // Initialize embedding
  registerMessageHandler('initializeEmbedding', (message) => {
    const requestId = message.requestId || `init_${Date.now()}`;
    handlers.onInitializeEmbedding(requestId);
    return false;
  });
  
  // Embed page content
  registerMessageHandler('embedPageContent', (message) => {
    const requestId = message.requestId || `embed_${Date.now()}`;
    handlers.onEmbedPageContent(message.content, requestId);
    return false;
  });
  
  // Embed page content for tab
  registerMessageHandler('embedPageContentForTab', (message, sender) => {
    const requestId = message.requestId || `embed_tab_${Date.now()}`;
    const tabId = message.tabId || sender.tab?.id;
    if (tabId) {
      handlers.onEmbedPageContentForTab(tabId, requestId);
    }
    return false;
  });
  
  // Generate single embedding
  registerMessageHandler('generateEmbedding', (message) => {
    const requestId = message.requestId || `single_${Date.now()}`;
    handlers.onGenerateEmbedding(message.text, requestId);
    return false;
  });
  
  // Generate batch embeddings
  registerMessageHandler('generateEmbeddings', (message) => {
    const requestId = message.requestId || `batch_${Date.now()}`;
    handlers.onGenerateEmbeddings(message.texts, requestId);
    return false;
  });
  
  // Page content update
  registerMessageHandler('pageContentUpdate', (message, sender, sendResponse) => {
    handlers.onPageContentUpdate(message.data, sender.tab?.id);
    sendResponse({ success: true });
    return false;
  });
  
  // Get page content
  registerMessageHandler('getPageContent', (message, sender, sendResponse) => {
    const tabId = message.tabId || sender.tab?.id;
    const content = handlers.onGetPageContent(tabId);
    sendResponse({ content });
    return false;
  });
  
  // Request page analysis
  registerMessageHandler('requestPageAnalysis', (message, sender, sendResponse) => {
    const tabId = message.tabId || sender.tab?.id;
    handlers.onRequestPageAnalysis(tabId);
    sendResponse({ success: true });
    return false;
  });
  
  // Get page content on demand
  registerMessageHandler('getPageContentOnDemand', (message, sender, sendResponse) => {
    const tabId = message.tabId || sender.tab?.id;
    if (tabId) {
      handlers.onGetPageContentOnDemand(tabId, sendResponse);
      return true; // Async response
    }
    sendResponse({ success: false, error: 'No tab ID' });
    return false;
  });
  
  // URL changed
  registerMessageHandler('urlChanged', (message, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (tabId) {
      handlers.onUrlChanged(tabId, message.url);
    }
    sendResponse({ success: true });
    return false;
  });
  
  // DOM content changed
  registerMessageHandler('domContentChanged', (message, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (tabId) {
      handlers.onDomContentChanged(tabId, message.url, message.timestamp, message.domUpdate);
    }
    sendResponse({ success: true });
    return false;
  });
  
  // Get current tab
  registerMessageHandler('getCurrentTab', (message, sender, sendResponse) => {
    handlers.onGetCurrentTab(sendResponse);
    return true; // Async response
  });
  
  logger.info('[Message Router] Standard handlers registered');
}

/**
 * Send a message to the runtime
 * 
 * Wrapper around chrome.runtime.sendMessage with error handling
 * 
 * @param message - Message to send
 * @returns Promise that resolves when message is sent
 */
export function sendMessage(message: any): Promise<void> {
  return chrome.runtime.sendMessage(message)
    .catch(err => {
      logger.debug('[Message Router] Message not delivered (likely no receiver):', err.message);
    });
}

/**
 * Broadcast a message to all listeners
 * 
 * This is a convenience function that sends a message but doesn't
 * throw errors if there are no listeners.
 * 
 * @param message - Message to broadcast
 */
export async function broadcastMessage(message: any): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (err) {
    // Ignore - no listeners is OK for broadcasts
    logger.debug('[Message Router] Broadcast not delivered (no listeners)');
  }
}

