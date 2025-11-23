/**
 * @fileoverview Background Script Main Entry - Refactored
 *
 * This is the main entry point for the Chrome Extension background service worker.
 * It orchestrates all modules and handles extension lifecycle events.
 *
 * Architecture:
 * - Modular design with clear separation of concerns
 * - Centralized message routing
 * - Lazy loading where possible
 * - Comprehensive error handling
 *
 * Modules:
 * - types: TypeScript type definitions
 * - config: Configuration constants
 * - utils: Logging and sanitization
 * - offscreen: Offscreen document management
 * - embeddings: Text embedding services
 * - content: Page content extraction
 * - context-menu: Context menu setup and handlers
 * - messaging: Message routing
 * - storage: Page content caching
 *
 * @version 2.0.0 (Refactored)
 * @author Project Hands-Off Team
 */

import 'webextension-polyfill';

// Core utilities
import { logger } from './utils/logger';

// Configuration
import { OFFSCREEN_DOCUMENT_PATH, DEBUG } from './config';

// Offscreen document management
import { setupOffscreenDocument, sendToOffscreen, handleOffscreenReady } from './offscreen/manager';

// Embedding services
import { initializeEmbeddingService, embedPageContent, generateEmbedding } from './embeddings/service';

// Page content cache
import { pageContentCache } from './storage/page-content-cache';

// Context menu
import { setupContextMenus } from './context-menu/setup';
import {
  setupContextMenuClickListener,
  setContextMenuClickPosition
} from './context-menu/handlers';

// Message routing
import {
  setupMessageRouter,
  setupContextMenuPositionListener,
  registerStandardHandlers,
  sendMessage,
  broadcastMessage
} from './messaging/router';

// Types
import { PageContent } from './types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTENSION LIFECYCLE
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Extension installation handler
 * 
 * Called when the extension is first installed, updated, or Chrome is updated.
 * Sets up initial state and pre-loads resources.
 */
chrome.runtime.onInstalled.addListener(() => {
  // Enable side panel auto-open
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  logger.info('Extension installed - side panel auto-open enabled');
  
  // Pre-load embedding model
  logger.info('📦 Pre-loading embedding model on install...');
  initializeEmbeddingService().catch(err => {
    logger.error('Failed to pre-load model:', err);
  });
  
  // Create context menu items
  setupContextMenus();
});

/**
 * Extension startup handler
 * 
 * Called when Chrome starts or the extension is enabled.
 * Ensures side panel behavior and pre-loads resources.
 */
chrome.runtime.onStartup.addListener(() => {
  // Enable side panel auto-open
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  logger.info('Extension startup - side panel auto-open enabled');
  
  // Pre-load embedding model
  logger.info('📦 Pre-loading embedding model...');
  initializeEmbeddingService().catch(err => {
    logger.error('Failed to pre-load model:', err);
  });
});

/**
 * Tab removal handler
 * 
 * Cleans up cached page content when tabs are closed to prevent memory leaks.
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  pageContentCache.delete(tabId.toString());
  logger.debug(`Cleaned up cached content for tab ${tabId}`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MESSAGE HANDLING
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Setup message router
setupMessageRouter();

// Setup context menu position listener
setupContextMenuPositionListener(setContextMenuClickPosition);

// Setup context menu click listener
setupContextMenuClickListener();

// Register standard message handlers
registerStandardHandlers({
  // Offscreen handlers
  onOffscreenReady: () => {
    logger.info('Offscreen document ready');
    handleOffscreenReady();
  },
  
  // Embedding handlers
  onInitializeEmbedding: (requestId) => {
    logger.info(`Received initializeEmbedding request: ${requestId}`);
    
    // Respond immediately (optimistic)
    sendMessage({
      type: 'initializeEmbeddingResponse',
      requestId,
      success: true
    });
    
    // Initialize asynchronously
    initializeEmbeddingService().catch(err => {
      logger.error('Embedding initialization failed:', err);
    });
  },
  
  onEmbedPageContent: (content, requestId) => {
    logger.info(`Received embedPageContent request: ${requestId}`);
    
    (async () => {
      try {
        const result = await embedPageContent(content);
        
        logger.info(`Sending embeddingComplete (success): ${requestId}`);
        await sendMessage({
          type: 'embeddingComplete',
          requestId,
          result
        });
      } catch (error) {
        logger.error('Embedding failed:', error);
        await sendMessage({
          type: 'embeddingComplete',
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })();
  },
  
  onEmbedPageContentForTab: (tabId, requestId) => {
    logger.info(`Received embedPageContentForTab request: ${requestId} (tabId: ${tabId})`);
    
    (async () => {
      try {
        // Get cached content or fetch on-demand
        let content = pageContentCache.get(tabId.toString());
        
        if (!content) {
          logger.warn('No cached content for tab. Fetching on-demand...');
          // Trigger on-demand fetch
          const response = await new Promise<any>((resolve) => {
            chrome.runtime.sendMessage({ type: 'getPageContentOnDemand', tabId }, resolve);
          });
          
          if (!response?.success || !response?.content) {
            throw new Error(response?.error || 'Failed to fetch page content');
          }
          content = response.content;
        }
        
        if (!content) {
          throw new Error('No content available for embedding');
        }
        
        const result = await embedPageContent(content);
        
        await sendMessage({
          type: 'embeddingComplete',
          requestId,
          result
        });
      } catch (error) {
        logger.error('embedPageContentForTab failed:', error);
        await sendMessage({
          type: 'embeddingComplete',
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })();
  },
  
  onGenerateEmbedding: (text, requestId) => {
    generateEmbedding(text)
      .then(embedding => {
        sendMessage({
          type: 'generateEmbeddingResponse',
          requestId,
          success: true,
          embedding
        });
      })
      .catch(error => {
        sendMessage({
          type: 'generateEmbeddingResponse',
          requestId,
          success: false,
          error: error.message
        });
      });
  },
  
  onGenerateEmbeddings: (texts, requestId) => {
    Promise.all(texts.map(text => generateEmbedding(text)))
      .then(embeddings => {
        sendMessage({
          type: 'generateEmbeddingsResponse',
          requestId,
          success: true,
          embeddings
        });
      })
      .catch(error => {
        sendMessage({
          type: 'generateEmbeddingsResponse',
          requestId,
          success: false,
          error: error.message
        });
      });
  },
  
  // Page content handlers
  onPageContentUpdate: (data, tabId) => {
    if (!tabId) return;
    
    const tabIdStr = tabId.toString();
    pageContentCache.set(tabIdStr, data, data.url, data.title);
    
    // Broadcast update
    const contentString = JSON.stringify(data);
    const totalSizeKB = (contentString.length / 1024).toFixed(2);
    
    logger.info(`Content updated for tab ${tabId}: ${totalSizeKB} KB`);
    
    broadcastMessage({
      type: 'pageContentUpdated',
      tabId,
      data
    });
  },
  
  onGetPageContent: (tabId) => {
    if (!tabId) return null;
    
    return pageContentCache.get(tabId.toString()) || null;
  },
  
  onRequestPageAnalysis: (tabId) => {
    if (!tabId) return;
    
    logger.info(`Requesting page analysis for tab ${tabId}`);
    extractPageContent(tabId);
  },
  
  onGetPageContentOnDemand: (tabId, sendResponse) => {
    logger.info(`On-demand page content extraction for tab ${tabId}`);
    extractPageContent(tabId, sendResponse);
  },
  
  // Navigation handlers
  onUrlChanged: (tabId, url) => {
    logger.info(`URL changed, clearing cache for tab ${tabId}`);
    pageContentCache.delete(tabId.toString());
    
    broadcastMessage({
      type: 'urlChanged',
      tabId,
      url
    });
  },
  
  onDomContentChanged: (tabId, url, timestamp, domUpdate) => {
    logger.info(`DOM changes detected on tab ${tabId}`);
    
    broadcastMessage({
      type: 'contentBecameStale',
      tabId,
      url,
      timestamp,
      domUpdate
    });
  },
  
  // Tab handlers
  onGetCurrentTab: (sendResponse) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab) {
        sendResponse({
          tabId: activeTab.id,
          url: activeTab.url,
          title: activeTab.title
        });
      } else {
        sendResponse({ tabId: null, url: null, title: null });
      }
    });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAGE CONTENT EXTRACTION
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Extract page content from a tab
 * 
 * This function injects a content script to extract comprehensive page data
 * including HTML, form fields, clickable elements, and shadow DOM content.
 * 
 * @param tabId - Tab ID to extract content from
 * @param sendResponse - Optional response callback for on-demand requests
 */
async function extractPageContent(tabId?: number, sendResponse?: (response: any) => void): Promise<void> {
  if (!tabId) {
    sendResponse?.({ success: false, error: 'No tab ID provided' });
    return;
  }
  
  try {
    // Inject utils.js first (CSS selector generator)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['utils.js']
    });
    
    // Execute extraction script (now in content-runtime for better organization)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-runtime/extraction.iife.js']
    });
    
    // Now get the result from window.__extractPageContent
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window as any).__extractPageContent
    });
    
    if (results && results[0] && results[0].result) {
      const extractedContent = results[0].result as PageContent;
      logger.info(`Content extracted for tab ${tabId}: ${extractedContent.title}`);
      
      // Store in cache (skip broadcast for on-demand requests)
      if (sendResponse) {
        pageContentCache.set(tabId.toString(), extractedContent, extractedContent.url, extractedContent.title);
        sendResponse({ success: true, content: extractedContent });
      } else {
        // Regular update - broadcast
        pageContentCache.set(tabId.toString(), extractedContent, extractedContent.url, extractedContent.title);
        await broadcastMessage({
          type: 'pageContentUpdated',
          tabId,
          data: extractedContent
        });
      }
    } else {
      logger.error('Failed to extract content - no results');
      sendResponse?.({ success: false, error: 'No results' });
    }
  } catch (error) {
    logger.error('Content extraction failed:', error);
    sendResponse?.({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INITIALIZATION COMPLETE
 * ═══════════════════════════════════════════════════════════════════════════
 */

logger.info('═══════════════════════════════════════════════════════════════════');
logger.info('Background Script Initialized (Refactored)');
logger.info('═══════════════════════════════════════════════════════════════════');
logger.info('');
logger.info('Modules loaded:');
logger.info('   Configuration');
logger.info('   Logging & Utilities');
logger.info('   Offscreen Manager');
logger.info('   Embedding Service');
logger.info('   Content Extractor');
logger.info('   Context Menu');
logger.info('   Message Router');
logger.info('   Page Content Cache');
logger.info('');
logger.info(`Debug Mode: ${DEBUG ? 'ENABLED' : 'DISABLED'}`);
logger.info('═══════════════════════════════════════════════════════════════════');
