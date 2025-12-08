/**
 * @fileoverview Page Content Extraction Script
 * 
 * This script extracts comprehensive page content including:
 * - Form fields (traditional + custom dropdowns)
 * - Clickable elements
 * - Shadow DOM content
 * - Document and window metadata
 * 
 * Executed in page context via chrome.scripting.executeScript
 * The result is assigned to window.__extractPageContent
 */

// Import all modules
import type { WindowWithUtils, ShadowRootMetadata } from './modules/types';
import { sanitizeText } from './modules/sanitizer';
import { cleanHtmlForAgent } from './modules/cleaner';
import { buildShadowRootMap } from './modules/shadow-dom';
import { extractFormFields } from './modules/form-extractor';
import { extractClickableElements } from './modules/clickable-extractor';

// Immediate logging to verify script execution
console.log('[Extraction] Script starting execution...');

// Cast window to include utils
const win = window as WindowWithUtils;

// Flag to check if script is loaded
(window as any).__CEB_EXTRACTION_LOADED__ = true;
console.log('[Extraction] Script flag set, __CEB_EXTRACTION_LOADED__ = true');

/**
 * Main extraction function
 */
const extractPageContent = () => {
    // Build shadow root map once (O(n) where n = total DOM nodes)
    const shadowRootMap = new Map<ShadowRoot, ShadowRootMetadata>();
    buildShadowRootMap(document, shadowRootMap, 0, 'document');
    
    // Build shadow roots array from cached map
    const shadowRoots: Array<{
      hostElement: string;
      hostId: string;
      hostClass: string;
      shadowContentSize: number;
      shadowHTML: string;
      fullContent: string;
      textContent: string;
      depth: number;
      path: string;
      hasNestedShadowRoots: boolean;
    }> = [];
    
    let totalShadowContentSize = 0;
    
    for (const [shadowRoot, metadata] of shadowRootMap.entries()) {
      const host = metadata.host;
      const shadowHTML = shadowRoot.innerHTML;
      const shadowSize = shadowHTML.length;
      totalShadowContentSize += shadowSize;
      
      // Check if this shadow root contains other shadow roots
      let hasNested = false;
      for (const [otherShadowRoot, otherMetadata] of shadowRootMap.entries()) {
        if (otherShadowRoot !== shadowRoot && otherMetadata.depth > metadata.depth) {
          let parent: Node | null = otherMetadata.host.parentNode;
          while (parent) {
            if (parent === shadowRoot) {
              hasNested = true;
              break;
            }
            parent = parent.parentNode;
          }
          if (hasNested) break;
        }
      }
      
      shadowRoots.push({
        hostElement: host.tagName,
        hostId: host.id || 'no-id',
        hostClass: (host.className && typeof host.className === 'string') ? host.className : 'no-class',
        shadowContentSize: shadowSize,
        shadowHTML: shadowHTML,
        fullContent: shadowHTML,
        textContent: shadowRoot.textContent || '',
        depth: metadata.depth,
        path: metadata.path,
        hasNestedShadowRoots: hasNested
      });
    }
    
    // Log Shadow DOM detection results
    if (shadowRoots.length > 0) {
      const maxDepth = Math.max(...shadowRoots.map(r => r.depth));
      const nestedCount = shadowRoots.filter(r => r.depth > 0).length;
      
      console.log(`[Shadow DOM Detection] Found ${shadowRoots.length} shadow root(s) (${nestedCount} nested) with max depth: ${maxDepth}, total content size: ${totalShadowContentSize} characters`);
      
      // Group by depth for better visualization
      const byDepth = shadowRoots.reduce((acc, root) => {
        acc[root.depth] = acc[root.depth] || [];
        acc[root.depth].push(root);
        return acc;
      }, {} as Record<number, typeof shadowRoots>);
      
      Object.entries(byDepth).forEach(([depth, roots]) => {
        console.log(`   Depth ${depth} (${roots.length} shadow root${roots.length > 1 ? 's' : ''}):`);
        roots.slice(0, 3).forEach((root, index) => {
          console.log(`      ${index + 1}. ${root.path}`, {
            size: `${root.shadowContentSize} chars`,
            hasNested: root.hasNestedShadowRoots,
            preview: root.shadowHTML.substring(0, 100) + '...'
          });
        });
        if (roots.length > 3) {
          console.log(`      ... and ${roots.length - 3} more at this depth`);
        }
      });
    } else {
      console.log('[Shadow DOM Detection] No shadow roots detected');
    }
    
    // Extract and clean HTML
    const rawFullHTML = document.documentElement.outerHTML;
    const mainHtmlCleaningResult = cleanHtmlForAgent(rawFullHTML);
    
    // Log main HTML cleaning results
    console.log('[Background] Main HTML Cleaning Results:', {
      originalSize: `${(mainHtmlCleaningResult.originalSize / 1024).toFixed(2)} KB`,
      cleanedSize: `${(mainHtmlCleaningResult.cleanedSize / 1024).toFixed(2)} KB`,
      reductionPercentage: `${mainHtmlCleaningResult.reductionPercentage.toFixed(2)}%`,
      savedBytes: `${((mainHtmlCleaningResult.originalSize - mainHtmlCleaningResult.cleanedSize) / 1024).toFixed(2)} KB`
    });
    
    console.log('[Background] Original HTML Sample (first 500 chars):', mainHtmlCleaningResult.originalSample);
    console.log('[Background] Cleaned HTML Sample (first 500 chars):', mainHtmlCleaningResult.cleanedSample);
    
    // Clean shadow content
    const cleanedShadowRoots = shadowRoots.map((root, index) => {
      const shadowCleaningResult = cleanHtmlForAgent(root.fullContent);
      
      // Log shadow content cleaning results
      if (shadowCleaningResult.originalSize > 0) {
        const isFirstAtDepth = shadowRoots.findIndex(r => r.depth === root.depth) === index;
        if (index === 0) {
          console.log(`[Background] Shadow DOM Cleaning Results (${shadowRoots.length} shadow root${shadowRoots.length > 1 ? 's' : ''}):`);
        }
        if (isFirstAtDepth) {
          console.log(`   Depth ${root.depth} - ${root.path}:`, {
            shadowRootIndex: index + 1,
            hostElement: root.hostElement,
            hostId: root.hostId,
            originalSize: `${(shadowCleaningResult.originalSize / 1024).toFixed(2)} KB`,
            cleanedSize: `${(shadowCleaningResult.cleanedSize / 1024).toFixed(2)} KB`,
            reductionPercentage: `${shadowCleaningResult.reductionPercentage.toFixed(2)}%`,
            savedBytes: `${((shadowCleaningResult.originalSize - shadowCleaningResult.cleanedSize) / 1024).toFixed(2)} KB`
          });
          if (index === 0) {
            console.log('[Background] Original Shadow Content Sample:', shadowCleaningResult.originalSample);
            console.log('[Background] Cleaned Shadow Content Sample:', shadowCleaningResult.cleanedSample);
          }
        }
      }
      
      return {
        hostElement: root.hostElement,
        hostId: root.hostId,
        hostClass: root.hostClass,
        content: shadowCleaningResult.cleanedHtml,
        depth: root.depth,
        path: root.path,
        hasNestedShadowRoots: root.hasNestedShadowRoots
      };
    });
    
    // Calculate total savings
    const totalOriginalSize = mainHtmlCleaningResult.originalSize + shadowRoots.reduce((sum, root) => sum + root.fullContent.length, 0);
    const totalCleanedSize = mainHtmlCleaningResult.cleanedSize + cleanedShadowRoots.reduce((sum, root) => sum + root.content.length, 0);
    const totalSavedBytes = totalOriginalSize - totalCleanedSize;
    const totalReductionPercentage = totalOriginalSize > 0 ? (totalSavedBytes / totalOriginalSize) * 100 : 0;
    
    if (shadowRoots.length > 0) {
      console.log('[Background] Total Cleaning Results (Main HTML + Shadow DOM):', {
        totalOriginalSize: `${(totalOriginalSize / 1024).toFixed(2)} KB`,
        totalCleanedSize: `${(totalCleanedSize / 1024).toFixed(2)} KB`,
        totalReductionPercentage: `${totalReductionPercentage.toFixed(2)}%`,
        totalSavedBytes: `${(totalSavedBytes / 1024).toFixed(2)} KB`
      });
    }
    
    // Extract form fields and clickable elements using modular functions
    const allFormData = extractFormFields(win, shadowRootMap);
    const clickableElements = extractClickableElements(win, shadowRootMap);
    
    return {
      url: window.location.href,
      title: document.title,
      textContent: sanitizeText(document.body.innerText || ''),
      
      allDOMContent: {
        fullHTML: mainHtmlCleaningResult.cleanedHtml,
        shadowContent: cleanedShadowRoots,
        allFormData,
        clickableElements,
        
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
        
        windowInfo: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
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
      },
      timestamp: Date.now()
    };
  };

// Set up message listener for on-demand extraction
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'extractPageContent') {
    console.log('[Extraction] Received extraction request');
    try {
      // First check if we have valid cached content from auto-extraction
      let content = (window as any).__extractPageContent;
      
      // Validate cached content has required fields
      if (content && content.url && content.allDOMContent) {
        console.log('[Extraction] Using cached content from auto-extraction');
      } else {
        console.log('[Extraction] No valid cached content, extracting now...');
        content = extractPageContent();
        if (content) {
          (window as any).__extractPageContent = content;
        }
      }
      
      if (!content) {
        console.error('[Extraction] Failed to extract content');
        sendResponse({ success: false, error: 'Extraction returned null' });
        return true;
      }
      
      // DON'T send full content via message (Chrome has ~500KB limit)
      // Instead, signal that content is ready and let background use executeScript to fetch it
      console.log('[Extraction] Content ready, signaling to background');
      sendResponse({ 
        success: true, 
        ready: true,
        url: content.url,
        title: content.title,
        // Only send metadata, not the full content
        contentSize: JSON.stringify(content).length
      });
    } catch (error) {
      console.error('[Extraction] Extraction failed:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return true; // Keep channel open for async response
  }
  return false;
});

// Auto-extract on script load (ASYNC to avoid blocking executeScript)
// This allows the script injection to return immediately while extraction runs in background
console.log('[Extraction] Script loaded, scheduling async auto-extraction...');

// Use setTimeout to make extraction async - executeScript will return immediately
setTimeout(() => {
  console.log('[Extraction] Starting auto-extraction (async)...');
  const startTime = performance.now();
  let success = false;
  let error: string | undefined;
  
  try {
    const result = extractPageContent();
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    if (result) {
      (window as any).__extractPageContent = result;
      console.log(`[Extraction] Auto-extraction successful in ${duration}s, result stored in window.__extractPageContent`);
      success = true;
    } else {
      console.error('[Extraction] Auto-extraction returned null/undefined result');
      error = 'Extraction returned null';
    }
  } catch (e) {
    console.error('[Extraction] Auto-extraction failed:', e);
    error = e instanceof Error ? e.message : String(e);
    (window as any).__extractPageContentError = error;
  }
  
  // Notify background script that extraction is complete via message passing
  // This is more efficient than polling
  try {
    chrome.runtime.sendMessage({
      type: 'extractionComplete',
      success,
      error,
      contentSize: success ? JSON.stringify((window as any).__extractPageContent).length : 0
    }).catch(() => {
      // Message may fail if no listener - that's OK (e.g., page loaded normally without on-demand request)
    });
    console.log('[Extraction] Sent extractionComplete message to background');
  } catch (msgError) {
    // Sending message may fail in some contexts - that's OK
    console.log('[Extraction] Could not send extractionComplete message (normal if page loaded naturally)');
  }
}, 0);

console.log('[Extraction] Content extraction script loaded, __extractPageContent set:', !!(window as any).__extractPageContent);

// Export for Vite/Rollup - export the extraction function for potential direct use
export default extractPageContent;
