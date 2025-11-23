/**
 * @fileoverview Context Menu Handlers for Chrome Extension
 *
 * This module handles context menu click events and dispatches appropriate
 * actions to the side panel. It includes special handling for element analysis
 * which requires content script injection to capture element details.
 *
 * Features:
 * - Side panel auto-opening on menu click
 * - Message formatting for different menu actions
 * - Element inspection via content script injection
 * - HTML cleaning for element analysis
 * - Context data passing to side panel
 *
 * @module context-menu/handlers
 */

import { logger } from '../utils/logger';
import { sanitizeText } from '../utils/sanitization';

/**
 * Last recorded context menu click position
 * Used for element analysis to get the element at the cursor
 */
let lastContextMenuClickPosition: { x: number; y: number } | null = null;

/**
 * Set the last context menu click position
 * This should be called from the content script when the context menu opens
 * 
 * @param position - Click coordinates
 */
export function setContextMenuClickPosition(position: { x: number; y: number }): void {
  lastContextMenuClickPosition = position;
  logger.debug('[Context Menu] Click position captured:', lastContextMenuClickPosition);
}

/**
 * Handle context menu clicks
 * 
 * This function is the main entry point for all context menu interactions.
 * It handles:
 * - Opening the side panel
 * - Formatting messages based on menu action
 * - Extracting element details for element analysis
 * - Sending formatted messages to the side panel
 * 
 * @param info - Context menu click info from Chrome API
 * @param tab - Tab where the click occurred
 */
export async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined
): Promise<void> {
  if (!tab?.id) return;
  
  logger.info('[Context Menu] Clicked:', info.menuItemId);
  
  // Ensure side panel is open
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    logger.error('[Context Menu] Failed to open side panel:', err);
  }
  
  // Wait for side panel to initialize
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Prepare message based on context
  let message = '';
  let additionalData: any = null;
  
  switch (info.menuItemId) {
    case 'copilot-explain':
      message = `Explain this: "${info.selectionText}"`;
      break;
      
    case 'copilot-summarize':
      message = `Summarize this: "${info.selectionText}"`;
      break;
      
    case 'copilot-translate':
      message = `Translate this to English: "${info.selectionText}"`;
      break;
      
    case 'copilot-ask':
      message = `Tell me about: "${info.selectionText}"`;
      break;
      
    case 'copilot-analyze-page':
      message = `Analyze the content and structure of this page: ${info.pageUrl}`;
      break;
      
    case 'copilot-summarize-page':
      message = `Summarize the main points of this page: ${info.pageUrl}`;
      break;
      
    case 'copilot-analyze-link':
      message = `What can you tell me about this link: ${info.linkUrl}`;
      break;
      
    case 'copilot-analyze-image':
      message = `Analyze this image: ${info.srcUrl}`;
      break;
      
    case 'copilot-analyze-element':
      const elementResult = await analyzeElement(tab.id);
      message = elementResult.message;
      additionalData = elementResult.additionalData;
      break;
      
    case 'copilot-open-panel':
      // Just open panel, already done above
      return;
      
    default:
      return;
  }
  
  // Send message to side panel
  if (message) {
    chrome.runtime.sendMessage({
      type: 'CONTEXT_MENU_ACTION',
      message: message,
      context: {
        selectionText: info.selectionText,
        pageUrl: info.pageUrl,
        linkUrl: info.linkUrl,
        srcUrl: info.srcUrl,
        frameUrl: info.frameUrl,
        ...additionalData
      }
    }).catch(err => {
      logger.error('[Context Menu] Failed to send message to side panel:', err);
    });
  }
}

/**
 * Analyze element at the last click position
 * 
 * This function injects a content script to:
 * 1. Get the element at the cursor position
 * 2. Extract element metadata (tag, classes, dimensions, etc.)
 * 3. Clean the element's HTML
 * 4. Format a detailed analysis request
 * 
 * @param tabId - Tab ID where the element exists
 * @returns Formatted message and additional data
 */
async function analyzeElement(tabId: number): Promise<{
  message: string;
  additionalData: any;
}> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (clickX: number, clickY: number) => {
        // Get element at click position
        const element = document.elementFromPoint(clickX, clickY);
        if (!element) {
          return { success: false, error: 'No element found at click position' };
        }
        
        // Text sanitization (inline for injection)
        const sanitizeText = (text: string | null | undefined): string => {
          if (!text) return '';
          let result = text;
          result = result.replace(/[\u200B-\u200D\uFEFF]/g, '');
          result = result.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
          result = result.replace(/\t/g, ' ');
          result = result.replace(/ {2,}/g, ' ');
          result = result.split('\n').map(line => line.trim()).join('\n');
          result = result.replace(/\n{3,}/g, '\n\n');
          result = result.trim();
          return result;
        };
        
        // HTML cleaning (inline for injection)
        const cleanHtmlForElement = (html: string) => {
          if (!html || html.length === 0) {
            return { cleanedHtml: '', originalSize: 0, cleanedSize: 0 };
          }

          const originalSize = html.length;
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          // Remove unnecessary elements
          const selectorsToRemove = ['script', 'style', 'link', 'meta', 'noscript'];
          selectorsToRemove.forEach(selector => {
            const elements = doc.querySelectorAll(selector);
            elements.forEach(el => el.remove());
          });

          // Remove inline styles
          doc.querySelectorAll('*').forEach(el => {
            el.removeAttribute('style');
          });

          // Remove inline event handlers
          doc.querySelectorAll('*').forEach(el => {
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
              if (attr.name && attr.name.toLowerCase().startsWith('on')) {
                el.removeAttribute(attr.name);
              }
            }
          });

          // Neutralize javascript: URLs
          doc.querySelectorAll('[href], [src], form[action]').forEach(el => {
            const attrs = ['href', 'src', 'action'];
            for (const name of attrs) {
              if (el.hasAttribute(name)) {
                const val = (el.getAttribute(name) || '').trim();
                if (/^javascript:/i.test(val)) {
                  el.removeAttribute(name);
                }
              }
            }
          });

          // Remove data URLs from images
          doc.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (src && src.startsWith('data:')) {
              img.setAttribute('data-original-src', 'data:image/...[removed]');
              img.removeAttribute('src');
            }
            img.removeAttribute('srcset');
          });

          // Remove comments
          const removeComments = (node: Node) => {
            const childNodes = Array.from(node.childNodes);
            childNodes.forEach(child => {
              if (child.nodeType === Node.COMMENT_NODE) {
                child.remove();
              } else if (child.nodeType === Node.ELEMENT_NODE) {
                removeComments(child);
              }
            });
          };
          
          const parsedElement = doc.body.firstElementChild;
          if (parsedElement) {
            removeComments(parsedElement);
          }

          let cleanedHtml = parsedElement?.outerHTML || '';
          
          // Normalize whitespace
          cleanedHtml = cleanedHtml
            .replace(/>\s+</g, '><')
            .replace(/\n\s*\n+/g, '\n')
            .replace(/^\s+|\s+$/g, '');
          
          const cleanedSize = cleanedHtml.length;

          return {
            cleanedHtml,
            originalSize,
            cleanedSize
          };
        };
        
        // Extract element data
        const rawOuterHTML = element.outerHTML;
        const cleaningResult = cleanHtmlForElement(rawOuterHTML);
        
        const tagName = element.tagName.toLowerCase();
        const classes = element.className ? Array.from(element.classList).join(' ') : '';
        const id = element.id || '';
        
        const computedStyle = window.getComputedStyle(element);
        const display = computedStyle.display;
        const position = computedStyle.position;
        
        const textContent = sanitizeText(element.textContent)?.substring(0, 200) || '';
        const rect = element.getBoundingClientRect();
        
        return {
          success: true,
          outerHTML: cleaningResult.cleanedHtml.substring(0, 50000), // 50KB limit
          originalSize: cleaningResult.originalSize,
          cleanedSize: cleaningResult.cleanedSize,
          metadata: {
            tagName,
            id,
            classes,
            textContent,
            display,
            position,
            dimensions: {
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              top: Math.round(rect.top),
              left: Math.round(rect.left)
            }
          }
        };
      },
      args: [lastContextMenuClickPosition?.x || 0, lastContextMenuClickPosition?.y || 0]
    });
    
    if (result && result[0]?.result?.success) {
      const elementData = result[0].result;
      const meta = elementData?.metadata;
      
      if (meta) {
        const sizeReduction = elementData.originalSize > 0
          ? Math.round(((elementData.originalSize - elementData.cleanedSize) / elementData.originalSize) * 100)
          : 0;
        
        let message = `Analyze this element:\n\n`;
        message += `**Element Type:** ${meta.tagName}\n`;
        if (meta.id) message += `**ID:** ${meta.id}\n`;
        if (meta.classes) message += `**Classes:** ${meta.classes}\n`;
        if (meta.textContent) message += `**Text Preview:** ${meta.textContent}\n`;
        message += `**Dimensions:** ${meta.dimensions.width}x${meta.dimensions.height}px\n`;
        message += `**Display:** ${meta.display}\n`;
        message += `**HTML Size:** ${elementData.cleanedSize} bytes (cleaned from ${elementData.originalSize} bytes, ${sizeReduction}% reduction)\n\n`;
        message += `**HTML Content (Cleaned):**\n\`\`\`html\n${elementData.outerHTML}\n\`\`\`\n\n`;
        message += `*Note: Scripts, styles, and inline CSS have been removed for clarity. Data URLs in images have been stripped.*\n\n`;
        message += `Please provide a deep analysis of this element, including its structure, purpose, any data it contains, and potential issues or insights.`;
        
        return {
          message,
          additionalData: {
            elementHTML: elementData.outerHTML,
            elementMetadata: meta,
            htmlStats: {
              originalSize: elementData.originalSize,
              cleanedSize: elementData.cleanedSize,
              reductionPercentage: sizeReduction
            }
          }
        };
      }
    }
    
    return {
      message: `Failed to capture element. Error: ${result?.[0]?.result?.error || 'Unknown error'}`,
      additionalData: null
    };
  } catch (error) {
    logger.error('[Context Menu] Failed to capture element:', error);
    return {
      message: `Failed to capture element: ${error instanceof Error ? error.message : 'Unknown error'}`,
      additionalData: null
    };
  }
}

/**
 * Setup context menu click listener
 * This should be called during extension initialization
 */
export function setupContextMenuClickListener(): void {
  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
  logger.info('[Context Menu] Click listener registered');
}

