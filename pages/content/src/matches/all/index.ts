import { sampleFunction } from '@src/sample-function';

// Debug toggle for this content script (production-safe: set to false)
const DEBUG = true;
const log = (...args: any[]) => DEBUG && console.log(...args);
const warn = (...args: any[]) => DEBUG && console.warn(...args);

// Configuration constants
const IDLE_CALLBACK_TIMEOUT_MS = 500;
const IDLE_FALLBACK_DELAY_MS = 0;
const NOTIFY_DEBOUNCE_MS = 1000;
const RETRY_TIMEOUT_BASE_MS = 2000;
const CHANGE_VALIDITY_MS = 30000;
const MAX_RETRY_ATTEMPTS = 3;
const MAX_CAPTURED_MUTATIONS = 1000;
const MAX_DOM_ELEMENTS_PER_TYPE = 20;
const TEXT_TRUNCATE_LENGTH = 500;
const DOM_READY_RETRY_MS = 100;

// Schedule heavy work during idle time when possible
const scheduleIdle = (fn: () => void) => {
  // @ts-ignore
  const ric: any = (window as any).requestIdleCallback;
  if (typeof ric === 'function') {
    // @ts-ignore
    return ric(fn, { timeout: IDLE_CALLBACK_TIMEOUT_MS });
  }
  return setTimeout(fn, IDLE_FALLBACK_DELAY_MS);
};

log('[CEB] All content script loaded');

// Check if extension context is valid before initializing
if (!chrome.runtime?.id) {
  console.warn('[CEB] Extension context invalidated - content script will not initialize');
  console.warn('[CEB] Please refresh this page after reloading the extension');
  // Exit early - don't initialize anything
  throw new Error('Extension context invalidated');
}

// Add a global indicator that the content script is loaded
(window as any).__CEB_CONTENT_SCRIPT_LOADED__ = true;

void sampleFunction();

// Type definitions
interface DOMElementInfo {
  tagName: string;
  id: string | null;
  className: string | null;
  textContent: string;
  innerHTML?: string;
  attributes?: {
    href?: string | null;
    src?: string | null;
    alt?: string | null;
    title?: string | null;
    value?: string;
  };
}

interface TextChangeInfo {
  type: 'added' | 'removed' | 'modified';
  text: string;
  parentTag: string | null;
}

interface DOMUpdateInfo {
  timestamp: number;
  url: string;
  summary: {
    addedCount: number;
    removedCount: number;
    textChangesCount: number;
  };
  addedElements: DOMElementInfo[];
  removedElements: DOMElementInfo[];
  textChanges: TextChangeInfo[];
}

// Page Analysis Functionality - MUST be defined before instantiation
class PageAnalyzer {
  private lastContentHash: string = '';
  private observer: MutationObserver | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastAnalysisTime: number = 0;
  private rapidChangeCount: number = 0;
  private rapidChangeTimer: NodeJS.Timeout | null = null;
  private shadowObservers: Map<Element, MutationObserver> = new Map();

  constructor() {
    log('[CEB] PageAnalyzer constructor called');
    try {
      this.initializePageAnalysis();
      this.setupMessageListener();
      log('[CEB] PageAnalyzer initialized successfully');
    } catch (error) {
      console.error('[CEB] Failed to initialize PageAnalyzer:', error);
    }
  }

  private initializePageAnalysis() {
    log('[CEB] Page analyzer initialized in on-demand mode');
    
    // Only perform initial analysis when explicitly requested
    // No automatic DOM monitoring to prevent unnecessary updates
    
    // Set up minimal navigation monitoring for major page changes
    this.setupNavigationMonitoring();
    
    // Set up DOM change monitoring for staleness detection
    this.setupDOMChangeMonitoring();
  }

  private setupMessageListener() {
    log('[CEB] Setting up message listener');
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      log('[CEB] Received message:', message.type);
      
      try {
        if (message.type === 'ping') {
          log('[CEB] Ping received');
          sendResponse({ success: true, ready: true });
        } else if (message.type === 'analyzePage') {
          log('[CEB] Analyzing page on request');
          this.analyzePageContent();
          sendResponse({ success: true });
        }
      } catch (error) {
        console.error('[CEB] Error handling message:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
      
      return true;
    });
  }

  private setupNavigationMonitoring() {
    let currentUrl = window.location.href;
    
    const handleUrlChange = (source: string) => {
      const newUrl = window.location.href;
      if (newUrl !== currentUrl) {
        log(`[CEB] Navigation detected (${source}):`, newUrl);
        currentUrl = newUrl;
        
        // Notify background script about URL change to clear cached content
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            type: 'urlChanged',
            url: newUrl
          }).catch(() => {
            // Silently ignore - extension context may be invalidated
          });
        }
      }
    };
    
    // Monitor browser navigation events
    window.addEventListener('popstate', () => handleUrlChange('popstate'));
    window.addEventListener('hashchange', () => handleUrlChange('hashchange'));
    
    // Monitor programmatic navigation (SPA routing)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      handleUrlChange('pushState');
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      handleUrlChange('replaceState');
    };
    
  }

  /**
   * Monitor a single shadow root and its descendants
   * Only scans the provided element, not the entire document
   */
  private monitorShadowRoot(element: Element, depth: number, capturedMutations: MutationRecord[], shadowObservers: Map<Element, MutationObserver>, changeDetectedRef: { value: boolean }, notifyCallback: () => void) {
    if (!element.shadowRoot || shadowObservers.has(element)) {
      return;
    }

    const hostIdentifier = `${element.tagName}${element.id ? '#' + element.id : ''}`;
    
    const shadowObserver = new MutationObserver((mutations) => {
      log(`[CEB] Shadow DOM change detected in ${hostIdentifier} (depth: ${depth})`);
      capturedMutations.push(...mutations);
      
      // Enforce mutation limit
      if (capturedMutations.length > MAX_CAPTURED_MUTATIONS) {
        const removed = capturedMutations.length - MAX_CAPTURED_MUTATIONS;
        capturedMutations.splice(0, removed);
        log(`[CEB] Mutation buffer full, removed ${removed} oldest mutations`);
      }
      
      changeDetectedRef.value = true;
      notifyCallback();
    });

    shadowObserver.observe(element.shadowRoot, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: true,
      characterDataOldValue: false
    });

    shadowObservers.set(element, shadowObserver);
    log(`[CEB] Shadow DOM monitoring started for ${hostIdentifier} (depth: ${depth})`);

    // Recursively monitor nested shadow roots ONLY within this shadow root
    const nestedElements = element.shadowRoot.querySelectorAll('*');
    nestedElements.forEach(child => {
      if (child.shadowRoot) {
        this.monitorShadowRoot(child, depth + 1, capturedMutations, shadowObservers, changeDetectedRef, notifyCallback);
      }
    });
  }

  /**
   * Recursively find and monitor all shadow roots in a subtree
   */
  private monitorAllShadowRoots(root: Document | ShadowRoot | Element, depth: number, capturedMutations: MutationRecord[], shadowObservers: Map<Element, MutationObserver>, changeDetectedRef: { value: boolean }, notifyCallback: () => void) {
    const elements = root.querySelectorAll('*');
    elements.forEach(element => {
      if (element.shadowRoot) {
        this.monitorShadowRoot(element, depth, capturedMutations, shadowObservers, changeDetectedRef, notifyCallback);
      }
    });
  }

  // REMOVED: setupDynamicContentMonitoring()
  // PERFORMANCE: Intercepting XHR/fetch caused constant CPU usage and broke websites
  // Content is now extracted on-demand only, not on every network request

  private setupDOMChangeMonitoring() {
    // Monitor significant DOM changes to detect when content becomes stale
    // This notifies the extension about changes without auto-refreshing
    const changeDetectedRef = { value: false };
    let notifyTimer: NodeJS.Timeout | null = null;
    let observer: MutationObserver | null = null;
    const shadowObservers: Map<Element, MutationObserver> = new Map();
    let lastChangeTimestamp = 0;
    let retryAttempts = 0;
    const capturedMutations: MutationRecord[] = [];

    // Clean up shadow observers
    const cleanupShadowObservers = () => {
      shadowObservers.forEach((observer, element) => {
        observer.disconnect();
        log('[CEB] Shadow DOM monitoring stopped for', element.tagName, element.id || 'no-id');
      });
      shadowObservers.clear();
    };

    const notifyContentChanged = () => {
      if (changeDetectedRef.value) {
        lastChangeTimestamp = Date.now();
        
        // Check if extension context is still valid before sending message
        if (!chrome.runtime?.id) {
          // Extension context invalidated - content script is orphaned
          changeDetectedRef.value = false;
          retryAttempts = 0;
          capturedMutations.length = 0;
          return;
        }
        
        // Extract incremental DOM update details
        const domUpdate = this.extractDOMUpdate(capturedMutations);
        
        // Only notify if there are actual changes (filter out empty updates)
        const hasActualChanges = domUpdate.summary.addedCount > 0 || 
                                 domUpdate.summary.removedCount > 0 || 
                                 domUpdate.summary.textChangesCount > 0;
        
        if (!hasActualChanges) {
          log('[CEB] DOM mutations detected but no significant changes to report, skipping notification');
          changeDetectedRef.value = false;
          capturedMutations.length = 0;
          return;
        }
        
        log('[CEB] Page content changed, notifying extension with incremental update', 
            `(+${domUpdate.summary.addedCount} -${domUpdate.summary.removedCount} ~${domUpdate.summary.textChangesCount})`);
        chrome.runtime.sendMessage({
          type: 'domContentChanged',
          tabId: chrome.runtime.id,
          url: window.location.href,
          timestamp: Date.now(),
          domUpdate: domUpdate
        }).then(() => {
          retryAttempts = 0;
        }).catch((error) => {
          // Failed - retry with backoff
          if (retryAttempts < MAX_RETRY_ATTEMPTS && error.message?.includes('Extension context invalidated')) {
            log(`[CEB] Send failed, will retry (attempt ${retryAttempts + 1}/${MAX_RETRY_ATTEMPTS})`);
            retryAttempts++;
            setTimeout(() => {
              if (Date.now() - lastChangeTimestamp < CHANGE_VALIDITY_MS) {
                changeDetectedRef.value = true;
                notifyContentChanged();
              }
            }, RETRY_TIMEOUT_BASE_MS * retryAttempts);
          } else {
            retryAttempts = 0;
          }
        });
        changeDetectedRef.value = false;
        capturedMutations.length = 0;
      }
    };

    observer = new MutationObserver((mutations) => {
      // Check for new shadow roots that might have been created
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              // Check if the new element has a shadow root - only monitor THIS element
              if (element.shadowRoot && !shadowObservers.has(element)) {
                log('[CEB] New shadow root detected, setting up monitoring');
                this.monitorShadowRoot(element, 0, capturedMutations, shadowObservers, changeDetectedRef, notifyContentChanged);
              }
              // Check descendants for shadow roots - only scan THIS subtree
              const descendants = element.querySelectorAll('*');
              descendants.forEach(descendant => {
                if (descendant.shadowRoot && !shadowObservers.has(descendant)) {
                  log('[CEB] New shadow root detected in descendant, setting up monitoring');
                  this.monitorShadowRoot(descendant, 1, capturedMutations, shadowObservers, changeDetectedRef, notifyContentChanged);
                }
              });
            }
          });
        }
      });

      // Only detect significant content changes: meaningful node additions/removals and text changes
      const hasChanges = mutations.some((mutation) => {
        // Track node additions/removals, but filter out trivial changes
        if (mutation.type === 'childList') {
          const hasSignificantAdditions = Array.from(mutation.addedNodes).some(node => {
            // Ignore text nodes with only whitespace
            if (node.nodeType === Node.TEXT_NODE) {
              return node.textContent && node.textContent.trim().length > 0;
            }
            // Ignore common framework/UI noise elements
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const tagName = element.tagName;
              const className = element.className || '';
              
              // Filter out UI framework noise
              if (tagName === 'STYLE' || tagName === 'SCRIPT' || tagName === 'NOSCRIPT') return false;
              if (tagName === 'svg' || tagName === 'SVG') return false;
              if (typeof className === 'string' && (
                className.includes('ripple') ||
                className.includes('animation') ||
                className.includes('tooltip') ||
                className.includes('popover') ||
                className.includes('transition') ||
                className.includes('loading') ||
                className.includes('spinner')
              )) return false;
              
              // Only count if it has meaningful content
              const hasContent = element.textContent && element.textContent.trim().length > 5;
              return hasContent;
            }
            return true;
          });
          
          const hasSignificantRemovals = Array.from(mutation.removedNodes).some(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              return node.textContent && node.textContent.trim().length > 0;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const hasContent = element.textContent && element.textContent.trim().length > 5;
              return hasContent;
            }
            return true;
          });
          
          return hasSignificantAdditions || hasSignificantRemovals;
        }
        
        // Track meaningful text content changes (not just whitespace)
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
            return false;
          }
          const newText = mutation.target.textContent || '';
          return newText.trim().length > 0;
        }
        
        return false;
      });

      if (hasChanges) {
        changeDetectedRef.value = true;
        
        // Store mutations for incremental update with size limit
        capturedMutations.push(...mutations);
        if (capturedMutations.length > MAX_CAPTURED_MUTATIONS) {
          const removed = capturedMutations.length - MAX_CAPTURED_MUTATIONS;
          capturedMutations.splice(0, removed);
          log(`[CEB] Mutation buffer full, removed ${removed} oldest mutations`);
        }
        
        // Debounce notifications (wait for changes to settle)
        if (notifyTimer) {
          clearTimeout(notifyTimer);
        }
        notifyTimer = setTimeout(notifyContentChanged, NOTIFY_DEBOUNCE_MS);
      }
    });

    // Observe the entire document body for changes
    const startObserving = () => {
      if (!document.body) {
        setTimeout(startObserving, DOM_READY_RETRY_MS);
        return;
      }

      // Clean up existing shadow observers
      cleanupShadowObservers();

      try {
        // Defer observer start to an idle period to avoid blocking page load
        scheduleIdle(() => {
          observer!.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: true,
            characterDataOldValue: false
          });

          // Set up initial shadow DOM monitoring in idle time
          scheduleIdle(() => this.monitorAllShadowRoots(document, 0, capturedMutations, shadowObservers, changeDetectedRef, notifyContentChanged));

          log('[CEB] DOM change monitoring active (including Shadow DOM)');
        });
      } catch (error) {
        console.error('[CEB] Failed to start DOM monitoring:', error);
      }
    };

    startObserving();
  }

  // REMOVED: setupFormMonitoring(), setupMediaMonitoring(), setupViewportMonitoring()
  // PERFORMANCE: These caused constant event listeners and expensive analysis triggers

  /**
   * Extract meaningful DOM update information from mutations
   * Inline HTML cleaner is intentionally simplified for performance (not the same as full cleaner)
   */
  private extractDOMUpdate(mutations: MutationRecord[]): DOMUpdateInfo {
    // Inline HTML cleaner for DOM updates (lightweight version for real-time updates)
    const cleanHtmlQuick = (html: string): string => {
      if (!html || html.length === 0) return '';
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Remove unnecessary elements
      ['script', 'style', 'link', 'meta', 'noscript', 'iframe'].forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => el.remove());
      });
      
      // Remove inline styles
      doc.querySelectorAll('*').forEach(el => el.removeAttribute('style'));
      
      // Get cleaned HTML and normalize whitespace
      let cleaned = doc.body.innerHTML;
      cleaned = cleaned
        .replace(/>\s+</g, '><')
        .replace(/\n\s*\n+/g, '\n')
        .replace(/^\s+|\s+$/g, '');
      
      return cleaned;
    };
    
    const addedElements: DOMElementInfo[] = [];
    const removedElements: DOMElementInfo[] = [];
    const textChanges: TextChangeInfo[] = [];
    
    mutations.forEach((mutation) => {
      // Capture added nodes
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        Array.from(mutation.addedNodes).forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const tagName = element.tagName;
            
            // Skip noise elements
            if (['STYLE', 'SCRIPT', 'NOSCRIPT', 'svg', 'SVG'].includes(tagName)) return;
            
            const textContent = element.textContent?.trim() || '';
            if (textContent.length > 5) {
              // Clean the innerHTML before sending
              const rawInnerHTML = element.innerHTML || '';
              const cleanedInnerHTML = cleanHtmlQuick(rawInnerHTML);
              
              addedElements.push({
                tagName,
                id: element.id || null,
                className: element.className || null,
                textContent: textContent,
                innerHTML: cleanedInnerHTML, // Cleaned HTML
                attributes: {
                  href: element.getAttribute('href'),
                  src: element.getAttribute('src'),
                  alt: element.getAttribute('alt'),
                  title: element.getAttribute('title'),
                  value: (element as HTMLInputElement).value
                }
              });
            }
          } else if (node.nodeType === Node.TEXT_NODE && node.textContent) {
            const text = node.textContent.trim();
            if (text.length > 0) {
              textChanges.push({
                type: 'added',
                text: text.substring(0, TEXT_TRUNCATE_LENGTH),
                parentTag: node.parentElement?.tagName || null
              });
            }
          }
        });
      }
      
      // Capture removed nodes
      if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
        Array.from(mutation.removedNodes).forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const tagName = element.tagName;
            
            if (['STYLE', 'SCRIPT', 'NOSCRIPT', 'svg', 'SVG'].includes(tagName)) return;
            
            const textContent = element.textContent?.trim() || '';
            if (textContent.length > 5) {
              removedElements.push({
                tagName,
                id: element.id || null,
                className: element.className || null,
                textContent: textContent.substring(0, TEXT_TRUNCATE_LENGTH)
              });
            }
          } else if (node.nodeType === Node.TEXT_NODE && node.textContent) {
            const text = node.textContent.trim();
            if (text.length > 0) {
              textChanges.push({
                type: 'removed',
                text: text.substring(0, TEXT_TRUNCATE_LENGTH),
                parentTag: node.parentElement?.tagName || null
              });
            }
          }
        });
      }
      
      // Capture text content changes
      if (mutation.type === 'characterData' && mutation.target.textContent) {
        const text = mutation.target.textContent.trim();
        if (text.length > 0) {
          textChanges.push({
            type: 'modified',
            text: text.substring(0, TEXT_TRUNCATE_LENGTH),
            parentTag: mutation.target.parentElement?.tagName || null
          });
        }
      }
    });
    
    return {
      timestamp: Date.now(),
      url: window.location.href,
      summary: {
        addedCount: addedElements.length,
        removedCount: removedElements.length,
        textChangesCount: textChanges.length
      },
      addedElements: addedElements.slice(0, MAX_DOM_ELEMENTS_PER_TYPE),
      removedElements: removedElements.slice(0, MAX_DOM_ELEMENTS_PER_TYPE),
      textChanges: textChanges.slice(0, MAX_DOM_ELEMENTS_PER_TYPE)
    };
  }
  // Form data is now extracted on-demand when needed, not monitored continuously

  // REMOVED: setupModernWebMonitoring()
  // PERFORMANCE: Intercepting WebSocket, IntersectionObserver, PerformanceObserver, etc. caused:
  // - Constant CPU usage (30-50% on real-time apps)
  // - Broken websites (conflicts with site's own code)
  // - Battery drain
  // Content is now extracted on-demand only via explicit requests

  private analyzePageContent() {
    this.lastAnalysisTime = Date.now();
    
    try {
      // Simple content change detection - just check if the body text changed
      const currentBodyText = document.body.innerText;
      const contentHash = this.generateContentHash({ text: currentBodyText, url: window.location.href });

      // Only notify if content has changed
      if (contentHash !== this.lastContentHash) {
        this.lastContentHash = contentHash;
        
        // Send notification to background script that content changed
        // Background script will extract content on-demand using executeScript
        chrome.runtime.sendMessage({
          type: 'domContentChanged',
          timestamp: this.lastAnalysisTime,
          url: window.location.href,
          title: document.title
        }).catch(error => {
          // Only log errors, not success messages
          console.error('[CEB] Failed to send DOM change notification:', error);
        });
      }
    } catch (error) {
      console.error('[CEB] Error analyzing page content:', error);
    }
  }

  // REMOVED: extractPageContent() and extractOptimizedDOMContent() - dead code
  // All extraction now happens via background script's inline executeScript function
  // which runs in page context and has access to cleanHtmlForAgent

  private generateContentHash(content: any): string {
    // Simple hash function for content comparison
    const str = JSON.stringify(content);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  public cleanup() {
    console.log('[CEB] Cleaning up PageAnalyzer');
    
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.rapidChangeTimer) {
      clearTimeout(this.rapidChangeTimer);
    }
    
    // Note: We don't restore the original methods (fetch, XHR, etc.) 
    // as they might be used by other scripts and could cause issues
    // The monitoring will simply stop when the page unloads
  }
}

// Global reference for cleanup
let pageAnalyzer: PageAnalyzer | null = null;

function initializePageAnalyzer() {
  console.log('[CEB] Initializing page analyzer');
  if (!pageAnalyzer) {
    pageAnalyzer = new PageAnalyzer();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (pageAnalyzer) {
        pageAnalyzer.cleanup();
      }
    });
  }
}

// Log that this content script instance is running
console.log('[CEB] Content script initialized on:', window.location.href);
console.log('[CEB] If you just reloaded the extension, refresh this page for DOM monitoring to work');

// Ensure DOM is ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePageAnalyzer);
} else {
  initializePageAnalyzer();
}

// Capture context menu click position for "Analyze Element" feature
// This allows us to get the exact element that was right-clicked on
document.addEventListener('contextmenu', (event) => {
  // Store the click position
  const position = {
    x: event.clientX,
    y: event.clientY
  };
  
  // Send position to background script
  chrome.runtime.sendMessage({
    type: 'CONTEXT_MENU_CLICK_POSITION',
    position: position
  }).catch(() => {
    // Silently fail if extension context is invalid
  });
  
  log('[CEB] Context menu click position captured:', position);
}, { passive: true });
