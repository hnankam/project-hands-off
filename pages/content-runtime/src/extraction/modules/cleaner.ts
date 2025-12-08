/**
 * @fileoverview HTML cleaning utilities
 * 
 * OPTIMIZED: Single-pass DOM traversal for large pages (1MB+)
 * Previous implementation did 4+ querySelectorAll('*') passes which
 * caused timeouts on pages with many elements.
 */

import { sanitizeText } from './sanitizer';
import type { CleaningResult } from './types';

// Content size warning threshold (5MB)
const LARGE_CONTENT_THRESHOLD = 5 * 1024 * 1024;

// Tags to remove entirely
const TAGS_TO_REMOVE = new Set(['head', 'script', 'style', 'link', 'meta', 'noscript', 'object', 'embed']);

export const cleanHtmlForAgent = (html: string): CleaningResult => {
  if (!html || html.length === 0) {
    return {
      cleanedHtml: '',
      originalSize: 0,
      cleanedSize: 0,
      reductionPercentage: 0,
      originalSample: '',
      cleanedSample: ''
    };
  }

  const originalSize = html.length;
  const originalSample = html.substring(0, 500);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Collect elements to remove first (avoid modifying DOM while iterating)
  const elementsToRemove: Element[] = [];
  const elementsToReplace: Array<{element: Element, replacement: Element}> = [];
  
  // Use TreeWalker for efficient single-pass traversal
  const walker = document.createTreeWalker(
    doc.documentElement,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
    null
  );
  
  let node: Node | null = walker.currentNode;
  const nodesToRemove: Node[] = [];
  
  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      // Collect comments for removal
      nodesToRemove.push(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();
      
      // Check if element should be removed or replaced
      if (TAGS_TO_REMOVE.has(tagName)) {
        elementsToRemove.push(element);
      } else if (tagName === 'iframe') {
        const placeholder = doc.createElement('div');
        placeholder.setAttribute('data-iframe-placeholder', 'true');
        placeholder.setAttribute('data-src', element.getAttribute('src') || '');
        placeholder.textContent = `[IFRAME: ${element.getAttribute('src') || 'unknown'}]`;
        elementsToReplace.push({ element, replacement: placeholder });
      } else if (tagName === 'svg') {
        const placeholder = doc.createElement('div');
        placeholder.setAttribute('data-svg-placeholder', 'true');
        placeholder.textContent = '[SVG]';
        elementsToReplace.push({ element, replacement: placeholder });
      } else if (tagName === 'source') {
        const placeholder = doc.createElement('span');
        placeholder.textContent = `[SOURCE: ${element.getAttribute('src') || 'unknown'}]`;
        elementsToReplace.push({ element, replacement: placeholder });
      } else {
        // Process attributes in single pass (instead of 4 separate querySelectorAll('*'))
        const attrsToRemove: string[] = [];
        const attrsToUpdate: Array<{name: string, value: string}> = [];
        
        for (const attr of Array.from(element.attributes)) {
          const attrName = attr.name.toLowerCase();
          
          // Remove style attribute
          if (attrName === 'style') {
            attrsToRemove.push(attr.name);
            continue;
          }
          
          // Remove event handlers (onclick, onload, etc.)
          if (attrName.startsWith('on')) {
            attrsToRemove.push(attr.name);
            continue;
          }
          
          // Remove empty attributes
          if (attr.value === '') {
            attrsToRemove.push(attr.name);
            continue;
          }
          
          // Neutralize javascript: URLs
          if ((attrName === 'href' || attrName === 'src' || attrName === 'action') &&
              /^javascript:/i.test(attr.value.trim())) {
            attrsToRemove.push(attr.name);
            continue;
          }
          
          // Handle img-specific attributes
          if (tagName === 'img') {
            if (attrName === 'src' && attr.value.startsWith('data:')) {
              element.setAttribute('data-original-src', 'data:image/...[removed]');
              attrsToRemove.push('src');
              continue;
            }
            if (attrName === 'srcset') {
              attrsToRemove.push('srcset');
              continue;
            }
          }
          
          // Sanitize attribute values (skip if too expensive for very large values)
          if (attr.value.length > 0 && attr.value.length < 10000) {
            const cleaned = sanitizeText(attr.value, {
              trimLines: true,
              collapseSpaces: true,
              collapseNewlines: true,
              maxNewlines: 1,
              trim: true,
              removeZeroWidth: true,
              normalizeUnicode: true
            });
            if (cleaned !== attr.value) {
              attrsToUpdate.push({ name: attr.name, value: cleaned });
            }
          }
        }
        
        // Apply attribute changes
        for (const name of attrsToRemove) {
          element.removeAttribute(name);
        }
        for (const { name, value } of attrsToUpdate) {
          element.setAttribute(name, value);
        }
      }
    }
    
    node = walker.nextNode();
  }
  
  // Remove collected comments
  for (const comment of nodesToRemove) {
    comment.parentNode?.removeChild(comment);
  }
  
  // Remove collected elements
  for (const element of elementsToRemove) {
    element.remove();
  }
  
  // Replace collected elements
  for (const { element, replacement } of elementsToReplace) {
    element.replaceWith(replacement);
  }

  let cleanedHtml = doc.documentElement.outerHTML;
  
  // Normalize whitespace
  cleanedHtml = cleanedHtml
    .replace(/>\s+</g, '><')
    .replace(/\n\s*\n+/g, '\n')
    .replace(/^\s+|\s+$/g, '');
  
  const cleanedSize = cleanedHtml.length;
  const cleanedSample = cleanedHtml.substring(0, 500);
  const reductionPercentage = ((originalSize - cleanedSize) / originalSize) * 100;

  // Log warning for very large content (will be chunked during embedding)
  if (cleanedSize > LARGE_CONTENT_THRESHOLD) {
    console.warn(`[Cleaner] Large content: ${(cleanedSize / 1024 / 1024).toFixed(2)} MB (will be chunked during embedding)`);
  }

  return {
    cleanedHtml,
    originalSize,
    cleanedSize,
    reductionPercentage,
    originalSample,
    cleanedSample
  };
};

