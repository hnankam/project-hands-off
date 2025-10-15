import { sampleFunction } from '@src/sample-function';

console.log('[CEB] All content script loaded');

// Add a global indicator that the content script is loaded
(window as any).__CEB_CONTENT_SCRIPT_LOADED__ = true;

void sampleFunction();

// Page Analysis Functionality - MUST be defined before instantiation
class PageAnalyzer {
  private lastContentHash: string = '';
  private observer: MutationObserver | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastAnalysisTime: number = 0;
  private rapidChangeCount: number = 0;
  private rapidChangeTimer: NodeJS.Timeout | null = null;

  constructor() {
    console.log('[CEB] PageAnalyzer constructor called');
    try {
      this.initializePageAnalysis();
      this.setupMessageListener();
      console.log('[CEB] PageAnalyzer initialized successfully');
    } catch (error) {
      console.error('[CEB] Failed to initialize PageAnalyzer:', error);
    }
  }

  private initializePageAnalysis() {
    console.log('[CEB] Page analyzer initialized in on-demand mode');
    
    // Only perform initial analysis when explicitly requested
    // No automatic DOM monitoring to prevent unnecessary updates
    
    // Set up minimal navigation monitoring for major page changes
    this.setupNavigationMonitoring();
    
    // Set up DOM change monitoring for staleness detection
    this.setupDOMChangeMonitoring();
  }

  private setupMessageListener() {
    console.log('[CEB] Setting up message listener');
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[CEB] Received message:', message.type);
      
      try {
        if (message.type === 'ping') {
          console.log('[CEB] Ping received');
          sendResponse({ success: true, ready: true });
        } else if (message.type === 'analyzePage') {
          console.log('[CEB] Analyzing page on request');
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

  // Removed automatic mutation handling - now using on-demand analysis only


  private isMinorFrameworkChange(mutation: MutationRecord): boolean {
    // Detect framework-specific changes that are less significant
    if (mutation.type === 'attributes') {
      const target = mutation.target as Element;
      const attributeName = mutation.attributeName;
      
      // Framework internal attributes and state changes
      if (attributeName?.startsWith('__') || 
          attributeName?.startsWith('data-react') ||
          attributeName?.startsWith('data-v-') || // Vue
          attributeName?.startsWith('ng-') || // Angular
          attributeName === 'style' && target.getAttribute('style')?.includes('--')) {
        return true;
      }
    }
    
    if (mutation.type === 'childList') {
      // Check if it's just framework reconciliation (small styling/text changes)
      const hasOnlySmallChanges = Array.from(mutation.addedNodes).every(node => 
        node.nodeType === Node.TEXT_NODE || 
        (node.nodeType === Node.ELEMENT_NODE && 
         ['SPAN', 'EM', 'STRONG', 'I', 'B', 'SMALL'].includes((node as Element).tagName))
      ) && Array.from(mutation.removedNodes).every(node => 
        node.nodeType === Node.TEXT_NODE || 
        (node.nodeType === Node.ELEMENT_NODE && 
         ['SPAN', 'EM', 'STRONG', 'I', 'B', 'SMALL'].includes((node as Element).tagName))
      );
      
      return hasOnlySmallChanges;
    }
    
    return false;
  }

  private isSignificantNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    
    const element = node as Element;
    const tagName = element.tagName;
    
    // Significant structural elements
    const significantTags = [
      'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE',
      'FORM', 'TABLE', 'UL', 'OL', 'DL',
      'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
      'P', 'IMG', 'VIDEO', 'AUDIO', 'IFRAME', 'CANVAS', 'SVG'
    ];
    
    if (significantTags.includes(tagName)) {
      return true;
    }
    
    // DIVs are significant if they have meaningful content or structure
    if (tagName === 'DIV') {
      const textContent = element.textContent?.trim() || '';
      const hasSignificantContent = element.children.length > 2 || textContent.length > 30;
      
      const hasStructuralRole = element.hasAttribute('role') || 
                               element.hasAttribute('data-testid') ||
                               element.className.includes('container') ||
                               element.className.includes('wrapper') ||
                               element.className.includes('section') ||
                               element.className.includes('message') ||
                               element.className.includes('chat') ||
                               element.className.includes('conversation') ||
                               element.className.includes('content') ||
                               element.className.includes('item') ||
                               element.className.includes('component');
      
      return hasSignificantContent || hasStructuralRole;
    }
    
    return false;
  }


  private isSignificantAttributeChange(mutation: MutationRecord, target: Element): boolean {
    const attributeName = mutation.attributeName;
    if (!attributeName) return false;
    
    // Always significant attributes
    const alwaysSignificant = ['src', 'href', 'alt', 'title', 'role', 'aria-label', 'aria-describedby'];
    if (alwaysSignificant.includes(attributeName)) {
      return true;
    }
    
    // Class changes are significant if they affect layout/visibility
    if (attributeName === 'class') {
      const oldValue = mutation.oldValue || '';
      const newValue = target.getAttribute('class') || '';
      
      // Check for layout/visibility related class changes
      const layoutClasses = ['hidden', 'visible', 'show', 'hide', 'active', 'inactive', 'open', 'closed', 'expanded', 'collapsed'];
      const hasLayoutChange = layoutClasses.some(cls => 
        (oldValue.includes(cls) && !newValue.includes(cls)) ||
        (!oldValue.includes(cls) && newValue.includes(cls))
      );
      
      return hasLayoutChange;
    }
    
    // Style changes are significant if they affect visibility/layout
    if (attributeName === 'style') {
      const style = target.getAttribute('style') || '';
      const hasLayoutStyle = /display|visibility|opacity|position|transform|width|height/.test(style);
      return hasLayoutStyle;
    }
    
    // Data attributes are less significant unless they're semantic
    if (attributeName.startsWith('data-')) {
      const semanticDataAttrs = ['data-id', 'data-value', 'data-state', 'data-status'];
      return semanticDataAttrs.some(attr => attributeName.startsWith(attr));
    }
    
    return false;
  }

  private isSignificantTextChange(parent: Element, mutation: MutationRecord): boolean {
    const tagName = parent.tagName;
    
    // Always significant in these elements
    const significantTextElements = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TITLE', 'BUTTON', 'A'];
    if (significantTextElements.includes(tagName)) {
      return true;
    }
    
    // Significant in paragraphs if the change is substantial
    if (tagName === 'P') {
      const oldText = mutation.oldValue || '';
      const newText = mutation.target.textContent || '';
      const changeRatio = Math.abs(oldText.length - newText.length) / Math.max(oldText.length, newText.length, 1);
      return changeRatio > 0.3; // More than 30% change
    }
    
    // Significant in labels and spans if they're form-related
    if (['LABEL', 'SPAN'].includes(tagName)) {
      return parent.closest('form') !== null || parent.hasAttribute('for');
    }
    
    return false;
  }

  private debouncedAnalysisLong() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.analyzePageContent();
    }, 3000); // Longer debounce for React component changes
  }

  private debouncedAnalysisMedium() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // For text/content changes, use medium debounce to capture dynamic updates
    this.debounceTimer = setTimeout(() => {
      this.analyzePageContent();
    }, 800); // Medium debounce for text/content changes
  }

  private debouncedAnalysis() {
    // Implement rate limiting to prevent excessive updates
    const now = Date.now();
    const timeSinceLastAnalysis = now - this.lastAnalysisTime;
    
    // If we've analyzed recently, increase the debounce time
    if (timeSinceLastAnalysis < 2000) {
      this.rapidChangeCount++;
      
      // Reset rapid change counter after a period of calm
      if (this.rapidChangeTimer) {
        clearTimeout(this.rapidChangeTimer);
      }
      this.rapidChangeTimer = setTimeout(() => {
        this.rapidChangeCount = 0;
      }, 5000);
    } else {
      this.rapidChangeCount = 0;
    }
    
    // Calculate adaptive debounce time based on change frequency
    let debounceTime = 500; // Base debounce time
    
    if (this.rapidChangeCount > 5) {
      debounceTime = 5000; // 5 seconds for very rapid changes
    } else if (this.rapidChangeCount > 3) {
      debounceTime = 3000; // 3 seconds for frequent changes
    } else if (this.rapidChangeCount > 1) {
      debounceTime = 1500; // 1.5 seconds for moderate changes
    }
    
    console.log(`[CEB] Scheduling analysis with ${debounceTime}ms debounce (rapid changes: ${this.rapidChangeCount})`);
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.analyzePageContent();
    }, debounceTime);
  }

  private setupNavigationMonitoring() {
    let currentUrl = window.location.href;
    
    const handleUrlChange = (source: string) => {
      const newUrl = window.location.href;
      if (newUrl !== currentUrl) {
        console.log(`[CEB] Navigation detected (${source}):`, newUrl);
        currentUrl = newUrl;
        
        // Notify background script about URL change to clear cached content
        // Check if extension context is still valid
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
    
    // Monitor browser navigation
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
    
    // Monitor URL changes (fallback)
    setInterval(() => handleUrlChange('polling'), 2000);
  }

  // REMOVED: setupDynamicContentMonitoring()
  // PERFORMANCE: Intercepting XHR/fetch caused constant CPU usage and broke websites
  // Content is now extracted on-demand only, not on every network request

  private setupDOMChangeMonitoring() {
    // Monitor significant DOM changes to detect when content becomes stale
    // This notifies the extension about changes without auto-refreshing
    let changeDetected = false;
    let notifyTimer: NodeJS.Timeout | null = null;
    let observer: MutationObserver | null = null;
    let shadowObservers: Map<Element, MutationObserver> = new Map(); // Track shadow DOM observers
    let lastChangeTimestamp = 0;
    let retryAttempts = 0;
    const MAX_RETRY_ATTEMPTS = 3;
    let capturedMutations: MutationRecord[] = []; // Store mutations for incremental update

    // Monitor Shadow DOM changes
    const setupShadowDOMMonitoring = () => {
      // Find all existing shadow roots
      document.querySelectorAll('*').forEach(element => {
        if (element.shadowRoot && !shadowObservers.has(element)) {
          const shadowObserver = new MutationObserver((mutations) => {
            console.log('[CEB] Shadow DOM change detected in', element.tagName, element.id || 'no-id');
            capturedMutations.push(...mutations);
            changeDetected = true;
            notifyContentChanged();
          });
          
          shadowObserver.observe(element.shadowRoot, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: true,
            characterDataOldValue: false
          });
          
          shadowObservers.set(element, shadowObserver);
          console.log('[CEB] Shadow DOM monitoring started for', element.tagName, element.id || 'no-id');
        }
      });
    };

    // Clean up shadow observers
    const cleanupShadowObservers = () => {
      shadowObservers.forEach((observer, element) => {
        observer.disconnect();
        console.log('[CEB] Shadow DOM monitoring stopped for', element.tagName, element.id || 'no-id');
      });
      shadowObservers.clear();
    };

    const notifyContentChanged = () => {
      if (changeDetected) {
        lastChangeTimestamp = Date.now();
        
        // Check if extension context is still valid before sending message
        if (!chrome.runtime?.id) {
          // Extension context invalidated - content script is orphaned
          // This is normal after extension reload - just skip silently
          changeDetected = false;
          retryAttempts = 0; // Reset since we can't recover
          capturedMutations = [];
          return;
        }
        
        // Extract incremental DOM update details
        const domUpdate = this.extractDOMUpdate(capturedMutations);
        
        console.log('[CEB] Page content changed, notifying extension with incremental update');
        chrome.runtime.sendMessage({
          type: 'domContentChanged',
          tabId: chrome.runtime.id, // Will be set by background script
          url: window.location.href,
          timestamp: Date.now(),
          domUpdate: domUpdate // Include the incremental update
        }).then(() => {
          // Success - reset retry counter
          retryAttempts = 0;
        }).catch((error) => {
          // Failed - retry with backoff
          if (retryAttempts < MAX_RETRY_ATTEMPTS && error.message?.includes('Extension context invalidated')) {
            console.log(`[CEB] Send failed, will retry (attempt ${retryAttempts + 1}/${MAX_RETRY_ATTEMPTS})`);
            retryAttempts++;
            setTimeout(() => {
              if (Date.now() - lastChangeTimestamp < 30000) {
                changeDetected = true;
                notifyContentChanged();
              }
            }, 2000 * retryAttempts);
          } else {
            retryAttempts = 0;
          }
        });
        changeDetected = false;
        capturedMutations = []; // Clear after sending
      }
    };

    observer = new MutationObserver((mutations) => {
      // Check for new shadow roots that might have been created
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              // Check if the new element has a shadow root
              if (element.shadowRoot && !shadowObservers.has(element)) {
                console.log('[CEB] New shadow root detected, setting up monitoring');
                setupShadowDOMMonitoring();
              }
              // Check if any descendant has a shadow root
              element.querySelectorAll('*').forEach(descendant => {
                if (descendant.shadowRoot && !shadowObservers.has(descendant)) {
                  console.log('[CEB] New shadow root detected in descendant, setting up monitoring');
                  setupShadowDOMMonitoring();
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
        changeDetected = true;
        
        // Store mutations for incremental update
        capturedMutations.push(...mutations);
        
        // Debounce notifications (wait 1 second after last change - optimal for agent responsiveness)
        if (notifyTimer) {
          clearTimeout(notifyTimer);
        }
        notifyTimer = setTimeout(notifyContentChanged, 1000);
      }
    });

    // Observe the entire document body for changes
    const startObserving = () => {
      if (!document.body) {
        setTimeout(startObserving, 100);
        return;
      }

      // Clean up existing shadow observers
      cleanupShadowObservers();

      try {
        observer.observe(document.body, {
          childList: true,        // Track node additions/removals
          subtree: true,          // Monitor entire tree
          attributes: false,      // Don't track attribute changes (reduces noise)
          characterData: true,    // Track text content changes
          characterDataOldValue: false
        });

        // Set up initial shadow DOM monitoring
        setupShadowDOMMonitoring();

        console.log('[CEB] DOM change monitoring active (including Shadow DOM)');
      } catch (error) {
        console.error('[CEB] Failed to start DOM monitoring:', error);
      }
    };

    startObserving();
  }

  // REMOVED: setupFormMonitoring(), setupMediaMonitoring(), setupViewportMonitoring()
  // PERFORMANCE: These caused constant event listeners and expensive analysis triggers

  // Extract meaningful DOM update information from mutations
  private extractDOMUpdate(mutations: MutationRecord[]) {
    // Inline HTML cleaner for DOM updates
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
    
    const addedElements: any[] = [];
    const removedElements: any[] = [];
    const textChanges: any[] = [];
    
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
                text: text.substring(0, 500),
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
                textContent: textContent.substring(0, 500)
              });
            }
          } else if (node.nodeType === Node.TEXT_NODE && node.textContent) {
            const text = node.textContent.trim();
            if (text.length > 0) {
              textChanges.push({
                type: 'removed',
                text: text.substring(0, 500),
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
            text: text.substring(0, 500),
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
      addedElements: addedElements.slice(0, 20), // Limit to 20 most recent
      removedElements: removedElements.slice(0, 20),
      textChanges: textChanges.slice(0, 20)
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
