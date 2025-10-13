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
        } else if (message.type === 'getPageContent') {
          console.log('[CEB] Getting page content on request');
          const content = this.extractPageContent();
          sendResponse({ content });
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
              addedElements.push({
                tagName,
                id: element.id || null,
                className: element.className || null,
                textContent: textContent.substring(0, 500), // Limit size
                innerHTML: element.innerHTML?.substring(0, 1000) || '', // Limited HTML
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
      const content = this.extractPageContent();
      const contentHash = this.generateContentHash(content);

      // Only send update if content has changed significantly
      if (contentHash !== this.lastContentHash) {
        // Double-check if the change is actually significant by comparing key elements
        if (this.isSignificantContentChange(content)) {
          this.lastContentHash = contentHash;
          
          const updateData = {
            ...content,
            timestamp: this.lastAnalysisTime,
            url: window.location.href,
            title: document.title
          };
          
          // Send page content to background script (reduced logging)
          chrome.runtime.sendMessage({
            type: 'pageContentUpdate',
            data: updateData
          }).catch(error => {
            // Only log errors, not success messages
            console.error('[CEB] Failed to send page content update:', error);
          });
        }
        // Removed excessive "not significant enough" logging
      }
      // Removed "unchanged" logging to reduce noise
    } catch (error) {
      console.error('[CEB] Error analyzing page content:', error);
    }
  }

  private isSignificantContentChange(newContent: any): boolean {
    // For the first analysis, always consider it significant
    if (!this.lastContentHash) {
      return true;
    }

    // Check if key structural elements have changed significantly
    const keyElements = [
      'headings', 'forms', 'tables', 'videos', 'iframes'
    ];

    // If any key structural elements changed, it's significant
    for (const element of keyElements) {
      if (newContent[element] && Array.isArray(newContent[element])) {
        // For arrays, check if the count changed significantly
        const currentCount = newContent[element].length;
        // We don't have the previous count easily accessible, so we'll rely on hash comparison
        // This is a placeholder for more sophisticated comparison if needed
      }
    }

    // Check if text content changed significantly (more than 10% change)
    if (newContent.textContent) {
      const textLength = newContent.textContent.length;
      // Since we don't store previous content, we'll rely on the hash comparison
      // This method serves as an additional filter for edge cases
    }

    // For now, if we got here, the hash was different, so consider it significant
    // This method can be enhanced with more sophisticated comparison logic
    return true;
  }

  private extractPageContent() {
    // PERFORMANCE OPTIMIZED: Only extract essential data on demand
    return {
      // Basic page info (always needed)
      url: window.location.href,
      title: document.title,
      
      // Full text content (lightweight)
      textContent: document.body.innerText,
      
      // Complete DOM content with form data (for AI interaction)
      allDOMContent: this.extractOptimizedDOMContent()
    };
  }

  // REMOVED: Dead code - extractHeadings, extractParagraphs, extractLinks, extractImages, 
  // extractMetadata, analyzePageStructure, extractForms, extractButtons, getPerformanceMetrics,
  // getFirstPaint, checkAccessibility, checkHeadingStructure, extractTables, extractLists,
  // extractVideos, extractIframes, extractSEOData, extractSocialMediaData, calculateReadingTime
  // These methods were never called after removing them from extractPageContent()

  private extractOptimizedDOMContent() {
    // Check for Shadow DOM
    const shadowRoots: Array<{
      hostElement: string;
      hostId: string;
      hostClass: string;
      shadowContentSize: number;
      shadowHTML: string;
      fullContent: string;
      textContent: string;
    }> = [];
    let totalShadowContentSize = 0;
    
    // Find all elements with shadow roots
    document.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) {
        const shadowHTML = element.shadowRoot.innerHTML;
        const shadowSize = shadowHTML.length;
        totalShadowContentSize += shadowSize;
        
        shadowRoots.push({
          hostElement: element.tagName,
          hostId: element.id || 'no-id',
          hostClass: element.className || 'no-class',
          shadowContentSize: shadowSize,
          shadowHTML: shadowHTML, // Full shadow content
          fullContent: shadowHTML,
          textContent: element.shadowRoot.textContent || ''
        });
      }
    });
    
    // Log Shadow DOM detection results
    if (shadowRoots.length > 0) {
      console.log(`🔍 [Shadow DOM Detection] Found ${shadowRoots.length} shadow root(s) with total content size: ${totalShadowContentSize} characters`);
      shadowRoots.forEach((root, index) => {
        console.log(`   Shadow Root ${index + 1}:`, {
          host: `${root.hostElement}${root.hostId ? '#' + root.hostId : ''}${root.hostClass ? '.' + root.hostClass.split(' ')[0] : ''}`,
          size: `${root.shadowContentSize} chars`,
          preview: root.shadowHTML
        });
      });
    } else {
      console.log('🔍 [Shadow DOM Detection] No shadow roots detected');
    }
    
    // PERFORMANCE OPTIMIZED: Only extract what's actually needed for AI interactions
    // Removed: 10,000+ element iterations, computed styles, bounding rects, scripts content
    return {
      // Complete HTML structure (needed for CSS selectors)
      fullHTML: document.documentElement.outerHTML,
      
      // Shadow DOM content (for content not visible in main DOM)
      shadowContent: shadowRoots.map(root => ({
        hostElement: root.hostElement,
        hostId: root.hostId,
        hostClass: root.hostClass,
        content: root.fullContent,
        textContent: root.textContent
      })),
      
      // All form data (needed for form interactions)
      allFormData: Array.from(document.querySelectorAll('input, select, textarea')).map(input => ({
        tagName: input.tagName,
        type: input.getAttribute('type') || '',
        name: input.getAttribute('name') || '',
        id: input.id,
        value: (input as HTMLInputElement).value || '',
        placeholder: input.getAttribute('placeholder') || '',
        checked: (input as HTMLInputElement).checked,
        selected: (input as HTMLSelectElement).selectedIndex,
        textContent: input.textContent || ''
      })),
      
      // Document metadata (lightweight)
      documentInfo: {
        title: document.title,
        url: document.URL,
        referrer: document.referrer,
        domain: document.domain,
        lastModified: document.lastModified,
        readyState: document.readyState,
        characterSet: document.characterSet,
        contentType: document.contentType
      },
      
      // Window information (lightweight)
      windowInfo: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        location: {
          href: window.location.href,
          protocol: window.location.protocol,
          host: window.location.host,
          hostname: window.location.hostname,
          port: window.location.port,
          pathname: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash
        },
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform
      },
      
      timestamp: Date.now()
    };
  }


  // REMOVED: extractDynamicContent() - was extremely expensive (10,000+ getComputedStyle calls)
  // The fullHTML and textContent already provide all necessary information

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
