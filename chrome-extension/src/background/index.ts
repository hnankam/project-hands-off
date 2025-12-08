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
  
  onEmbedPageContentForTab: (tabId, requestId, skipActivation?: boolean) => {
    logger.info(`Received embedPageContentForTab request: ${requestId} (tabId: ${tabId}, skipActivation: ${skipActivation})`);
    
    (async () => {
      try {
        // Get cached content or fetch on-demand
        let content = pageContentCache.get(tabId.toString());
        logger.info(`[EmbedTab] Cache lookup for tab ${tabId}: ${content ? 'HIT' : 'MISS'}`);
        
        if (!content) {
          logger.warn('[EmbedTab] No cached content for tab. Extracting on-demand...');
          
          // Direct extraction instead of message passing (fixes "message port closed" error)
          content = await new Promise<PageContent | undefined>((resolve) => {
            extractPageContent(tabId, (response: any) => {
              logger.info(`[EmbedTab] Extraction callback received: success=${response?.success}, hasContent=${!!response?.content}`);
              if (response?.success && response?.content) {
                // Log content size
                const contentSize = JSON.stringify(response.content).length;
                logger.info(`[EmbedTab] Extracted content size: ${(contentSize / 1024 / 1024).toFixed(2)} MB`);
                resolve(response.content);
              } else {
                logger.error('[EmbedTab] Content extraction failed:', response?.error || 'Unknown error');
                resolve(undefined);
              }
            }, skipActivation);
          });
        
          if (!content) {
            throw new Error('Failed to extract page content');
          }
        }
        
        logger.info(`[EmbedTab] Content ready, calling embedPageContent...`);
        const result = await embedPageContent(content);
        logger.info(`[EmbedTab] embedPageContent completed, result chunks: ${result?.chunks?.length || 0}`);
        
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
 * Enhanced to handle background tabs by:
 * - Checking tab status and waiting for load if needed
 * - Retrying extraction if the result is not immediately available
 * - Better error handling for various failure modes
 * 
 * @param tabId - Tab ID to extract content from
 * @param sendResponse - Optional response callback for on-demand requests
 */
async function extractPageContent(tabId?: number, sendResponse?: (response: any) => void, skipActivation?: boolean): Promise<void> {
  if (!tabId) {
    sendResponse?.({ success: false, error: 'No tab ID provided' });
    return;
  }
  
  // Track original active tab for restoration after extraction
  // Skip if caller is handling activation (e.g., bulk operations)
  let originalActiveTabId: number | undefined;
  let wasTabActive = true;
  
  // Get tab info to check URL and status before attempting extraction
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
    const url = tab.url || '';
    
    // Skip protected URLs that don't allow content script injection
    const protectedProtocols = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://', 'brave://'];
    const isProtectedUrl = protectedProtocols.some(protocol => url.startsWith(protocol));
    
    if (isProtectedUrl) {
      logger.info(`[ExtractContent] Skipping protected URL: ${url}`);
      sendResponse?.({ success: false, error: 'Cannot embed browser pages' });
      return;
    }
    
    // Also skip empty URLs or invalid tabs
    if (!url || url === 'about:blank') {
      logger.info(`[ExtractContent] Skipping blank/empty URL`);
      sendResponse?.({ success: false, error: 'Page has no content' });
      return;
    }
    
    // Handle PDF files - they can't have content scripts injected
    if (url.endsWith('.pdf') || url.includes('/pdf/') || url.includes('viewer.html?file=')) {
      logger.info(`[ExtractContent] Skipping PDF URL: ${url}`);
      sendResponse?.({ success: false, error: 'Cannot embed PDF files directly' });
      return;
    }
    
    // Check if tab needs activation using multiple indicators:
    // 1. tab.discarded - explicitly discarded by Chrome
    // 2. tab.status === 'unloaded' - memory saver feature
    // 3. Not active and status is neither 'complete' nor 'loading'
    const isTabSuspended = tab.discarded === true || 
                           tab.status === 'unloaded' ||
                           (!tab.active && tab.status !== 'complete' && tab.status !== 'loading');
    
    logger.info(`[ExtractContent] Tab ${tabId} state: discarded=${tab.discarded}, status=${tab.status}, active=${tab.active}, isSuspended=${isTabSuspended}`);
    
    // Track if tab was active
    wasTabActive = tab.active;
    
    // For ALL inactive tabs (discarded or not), try reload() first (keeps tab in background)
    // Only activate as last resort if reload doesn't work
    if (!skipActivation && !tab.active) {
      logger.info(`[ExtractContent] Tab ${tabId} is inactive, trying reload in background...`);
      try {
        // Try reload first - this may work without bringing tab to foreground
        await chrome.tabs.reload(tabId);
        logger.info(`[ExtractContent] Tab ${tabId} reload triggered, waiting for load...`);
        
        // Wait for the tab to load (5s max - some pages never reach 'complete')
        await waitForTabLoad(tabId, 5000);
        
        // Additional delay for JavaScript to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Re-fetch tab info after reload
        tab = await chrome.tabs.get(tabId);
        logger.info(`[ExtractContent] Tab ${tabId} after reload: status=${tab.status}, discarded=${tab.discarded}`);
        
        // If still discarded after reload, we must activate (last resort)
        // Note: We don't activate for status=loading - some pages never reach 'complete'
        if (tab.discarded || tab.status === 'unloaded') {
          logger.info(`[ExtractContent] Tab ${tabId} still suspended after reload (discarded=${tab.discarded}, status=${tab.status}), must activate...`);
          const [currentActiveTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
          originalActiveTabId = currentActiveTab?.id;
          
          await chrome.tabs.update(tabId, { active: true });
          
          // Wait for tab to become interactive
          logger.info(`[ExtractContent] Tab ${tabId} activated, waiting 3s for page to become interactive...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          tab = await chrome.tabs.get(tabId);
          wasTabActive = false;
          logger.info(`[ExtractContent] Tab ${tabId} ready after activation, status: ${tab.status}`);
        } else if (tab.status === 'loading') {
          // Page is loading but not discarded - just continue, it should be usable
          logger.info(`[ExtractContent] Tab ${tabId} still loading but not suspended, proceeding with extraction...`);
        }
      } catch (reloadError) {
        logger.warn(`[ExtractContent] Failed to reload tab ${tabId}:`, reloadError);
        // Don't return - continue to try message-based extraction anyway
      }
    } else if (skipActivation) {
      logger.info(`[ExtractContent] Skipping activation for tab ${tabId} (handled by caller)`);
    }
    
    // Check if tab is still loading - wait for it
    if (tab.status === 'loading') {
      logger.info(`[ExtractContent] Tab ${tabId} still loading, waiting...`);
      await waitForTabLoad(tabId, 10000); // Wait up to 10 seconds
    }
  } catch (error) {
    logger.error('[ExtractContent] Failed to get tab info:', error);
    sendResponse?.({ success: false, error: 'Failed to get tab info' });
    return;
  }
  
  // Helper to add timeout to promises
  const withTimeout = <T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
    ]);
  };

  try {
    let extractedContent: PageContent | null = null;
    
    // METHOD 1: Try message-based to trigger extraction, then read via executeScript
    // This avoids Chrome's message size limit (~500KB)
    logger.info(`[ExtractContent] Triggering extraction for tab ${tabId}...`);
    
    try {
      const response = await withTimeout(
        chrome.tabs.sendMessage(tabId, { type: 'extractPageContent' }),
        10000,
        'Message timed out'
      );
      
      if (response?.success && response?.ready) {
        // Content is ready! Fetch it via executeScript (no size limit)
        logger.info(`[ExtractContent] Content ready (${(response.contentSize / 1024).toFixed(0)} KB), fetching via executeScript...`);
        
        const contentResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => (window as any).__extractPageContent
        });
        
        if (contentResult?.[0]?.result) {
          extractedContent = contentResult[0].result as PageContent;
          logger.info(`[ExtractContent] Successfully fetched content for tab ${tabId}`);
        } else {
          logger.warn(`[ExtractContent] executeScript returned no content`);
        }
      } else if (response?.error) {
        logger.warn(`[ExtractContent] Extraction failed: ${response.error}`);
      }
    } catch (msgError) {
      // Content script might not be loaded (new tab, or extension was reloaded)
      logger.debug(`[ExtractContent] Message failed, will try executeScript:`, msgError);
    }
    
    // METHOD 2: Use executeScript to READ already-extracted content
    // The extraction script auto-runs on page load and stores result in window.__extractPageContent
    if (!extractedContent) {
      logger.info(`[ExtractContent] Trying to read cached content via executeScript for tab ${tabId}...`);
      
      // First, try to read existing content (extraction script may have already run)
      try {
        const checkResult = await withTimeout(
          chrome.scripting.executeScript({
            target: { tabId },
            func: () => ({
              hasContent: !!(window as any).__extractPageContent,
              isLoaded: !!(window as any).__CEB_EXTRACTION_LOADED__,
              error: (window as any).__extractPageContentError
            })
          }),
          5000,
          'Check timed out'
        );
        
        const status = checkResult?.[0]?.result;
        logger.info(`[ExtractContent] Tab ${tabId} status: hasContent=${status?.hasContent}, isLoaded=${status?.isLoaded}, error=${status?.error}`);
        
        if (status?.hasContent) {
          // Content exists! Read it directly
          logger.info(`[ExtractContent] Content found, reading...`);
          const contentResult = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => (window as any).__extractPageContent
          });
          
          if (contentResult?.[0]?.result) {
            extractedContent = contentResult[0].result as PageContent;
            logger.info(`[ExtractContent] Successfully read cached content for tab ${tabId}`);
          }
        } else if (!status?.isLoaded) {
          // Extraction script hasn't run yet - inject it
          logger.info(`[ExtractContent] No cached content, injecting extraction scripts...`);
          
          // Set up message listener BEFORE injecting script to catch completion message
          const maxWaitTime = 60000; // 60 seconds max for very large pages
          const extractionPromise = new Promise<{success: boolean; error?: string}>((resolve) => {
            const startTime = Date.now();
            
            // Create a one-time listener for extraction completion
            const messageListener = (message: any, sender: chrome.runtime.MessageSender) => {
              // Only handle messages from the target tab
              if (message.type === 'extractionComplete' && sender.tab?.id === tabId) {
                chrome.runtime.onMessage.removeListener(messageListener);
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                logger.info(`[ExtractContent] Received extractionComplete from tab ${tabId} after ${duration}s (success=${message.success}, size=${(message.contentSize / 1024).toFixed(0)}KB)`);
                resolve({ success: message.success, error: message.error });
              }
            };
            
            chrome.runtime.onMessage.addListener(messageListener);
            
            // Set timeout to clean up listener and resolve if no message received
            setTimeout(() => {
              chrome.runtime.onMessage.removeListener(messageListener);
              logger.warn(`[ExtractContent] Extraction message timeout after ${maxWaitTime / 1000}s`);
              resolve({ success: false, error: 'Extraction timed out' });
            }, maxWaitTime);
          });
          
          // Inject utils.js first
          try {
            await withTimeout(
              chrome.scripting.executeScript({
                target: { tabId },
                files: ['utils.js']
              }),
              10000,
              'utils.js injection timed out'
            );
            logger.debug(`[ExtractContent] utils.js injected for tab ${tabId}`);
          } catch (utilsError) {
            logger.warn(`[ExtractContent] utils.js injection failed:`, utilsError);
          }
          
          // Inject extraction script (returns quickly since extraction is async)
          try {
            await withTimeout(
              chrome.scripting.executeScript({
                target: { tabId },
                files: ['content-runtime/extraction.iife.js']
              }),
              10000,
              'extraction.iife.js injection timed out'
            );
            logger.debug(`[ExtractContent] extraction.iife.js injected for tab ${tabId}`);
          } catch (extractionError) {
            logger.warn(`[ExtractContent] extraction.iife.js injection failed:`, extractionError);
          }
          
          // Wait for extraction completion message (no polling needed!)
          logger.info(`[ExtractContent] Waiting for extractionComplete message (max ${maxWaitTime / 1000}s)...`);
          const extractionResult = await extractionPromise;
          
          if (!extractionResult.success) {
            logger.error(`[ExtractContent] Extraction failed: ${extractionResult.error}`);
          }
          
          // Read the extracted content
          const contentResult = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => (window as any).__extractPageContent
          });
          
          if (contentResult?.[0]?.result) {
            extractedContent = contentResult[0].result as PageContent;
            logger.info(`[ExtractContent] Got content after injection for tab ${tabId}`);
          }
        }
      } catch (execError) {
        logger.error(`[ExtractContent] executeScript failed for tab ${tabId}:`, execError);
      }
    }
    
    if (extractedContent) {
      logger.info(`[ExtractContent] Success for tab ${tabId}: ${extractedContent.title}`);
      
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
      logger.error(`[ExtractContent] Failed for tab ${tabId} - no results after all attempts`);
      sendResponse?.({ success: false, error: 'Content extraction failed - page may not be accessible' });
    }
  } catch (error) {
    logger.error(`[ExtractContent] Failed for tab ${tabId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Provide more helpful error messages based on error type
    let userMessage = errorMessage;
    if (errorMessage.includes('Cannot access')) {
      userMessage = 'Cannot access this page - it may be protected or restricted.';
    } else if (errorMessage.includes('No frame')) {
      userMessage = 'Page is not accessible - try visiting the tab first.';
    } else if (errorMessage.includes('Extension context invalidated')) {
      userMessage = 'Extension was updated - please refresh the page.';
    } else if (errorMessage.includes('No tab with id')) {
      userMessage = 'Tab was closed or navigated away.';
    }
    
    sendResponse?.({ success: false, error: userMessage });
  } finally {
    // Restore the original active tab if we temporarily activated a different one
    // Skip if caller is handling restoration (e.g., bulk operations)
    if (!wasTabActive && originalActiveTabId && !skipActivation) {
      try {
        logger.info(`[ExtractContent] Restoring original active tab ${originalActiveTabId}`);
        await chrome.tabs.update(originalActiveTabId, { active: true });
      } catch (restoreError) {
        logger.warn(`[ExtractContent] Failed to restore original tab:`, restoreError);
      }
    }
  }
}

/**
 * Wait for a tab to finish loading
 * @param tabId - Tab ID to wait for
 * @param timeout - Maximum time to wait in milliseconds
 */
async function waitForTabLoad(tabId: number, timeout: number): Promise<void> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkTab = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          resolve();
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          logger.warn(`[ExtractContent] Timeout waiting for tab ${tabId} to load`);
          resolve(); // Resolve anyway, extraction will fail if tab isn't ready
          return;
        }
        
        // Check again in 200ms
        setTimeout(checkTab, 200);
      } catch {
        resolve(); // Tab might have been closed
      }
    };
    
    checkTab();
  });
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
