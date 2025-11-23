/**
 * @fileoverview HTML Cleaner for Chrome Extension
 *
 * Provides utilities for cleaning and sanitizing HTML content before processing.
 * This module removes unnecessary elements, inline scripts, styles, and reduces
 * HTML size while preserving semantic structure.
 *
 * Key Features:
 * - Removes scripts, styles, and other non-content elements
 * - Neutralizes javascript: URLs and inline event handlers
 * - Replaces data URLs with placeholders
 * - Removes comments and empty attributes
 * - Normalizes whitespace
 * - Provides size reduction metrics
 *
 * @module content/cleaner
 */

import { sanitizeText } from '../utils/sanitization';

/**
 * Result of HTML cleaning operation
 */
export interface CleanHtmlResult {
  cleanedHtml: string;
  originalSize: number;
  cleanedSize: number;
  reductionPercentage: number;
  originalSample: string;
  cleanedSample: string;
}

/**
 * Clean HTML content for AI agent processing
 * 
 * This function performs comprehensive HTML cleaning to:
 * - Remove non-content elements (scripts, styles, etc.)
 * - Neutralize security risks (javascript: URLs, inline handlers)
 * - Reduce file size by removing unnecessary attributes
 * - Normalize whitespace for consistent processing
 * 
 * The cleaning process is safe and preserves semantic structure while
 * significantly reducing payload size.
 * 
 * @param html - Raw HTML string to clean
 * @returns Cleaning result with metrics
 * 
 * @example
 * const result = cleanHtmlForAgent('<html><script>alert(1)</script><body>Content</body></html>');
 * console.log(`Reduced by ${result.reductionPercentage.toFixed(1)}%`);
 * console.log(`Clean HTML: ${result.cleanedHtml}`);
 */
export function cleanHtmlForAgent(html: string): CleanHtmlResult {
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

  // Remove unnecessary elements
  const selectorsToRemove = ['head', 'script', 'style', 'link', 'meta', 'noscript', 'iframe', 'object', 'embed', 'svg'];

  selectorsToRemove.forEach(selector => {
    const elements = doc.querySelectorAll(selector);
    elements.forEach(element => {
      // For iframes and SVGs, keep a placeholder with relevant attributes
      if (selector === 'iframe') {
        const placeholder = doc.createElement('div');
        placeholder.setAttribute('data-iframe-placeholder', 'true');
        placeholder.setAttribute('data-src', element.getAttribute('src') || '');
        placeholder.textContent = `[IFRAME: ${element.getAttribute('src') || 'unknown'}]`;
        element.replaceWith(placeholder);
      } else if (selector === 'svg') {
        const placeholder = doc.createElement('div');
        placeholder.setAttribute('data-svg-placeholder', 'true');
        placeholder.textContent = '[SVG]';
        element.replaceWith(placeholder);
      } else {
        element.remove();
      }
    });
  });

  // Remove inline styles from all elements
  doc.querySelectorAll('*').forEach(element => {
    element.removeAttribute('style');
  });

  // Remove inline event handler attributes (onclick, onload, ...)
  doc.querySelectorAll('*').forEach(el => {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (attr.name && attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // Neutralize javascript: URLs in href/src/action attributes
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

  // Remove data URLs from images (keep src but remove base64 data)
  doc.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (src && src.startsWith('data:')) {
      img.setAttribute('data-original-src', 'data:image/...[removed]');
      img.removeAttribute('src');
    }
    // Remove srcset which can contain large data
    img.removeAttribute('srcset');
  });

  // Remove video/audio source elements but keep the video/audio tags
  doc.querySelectorAll('source').forEach(source => {
    const placeholder = doc.createElement('span');
    placeholder.textContent = `[SOURCE: ${source.getAttribute('src') || 'unknown'}]`;
    source.replaceWith(placeholder);
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
  removeComments(doc.body);

  // Remove empty attributes (attributes with empty string values)
  doc.querySelectorAll('*').forEach(element => {
    const attrs = Array.from(element.attributes);
    for (const attr of attrs) {
      if (attr.value === '') {
        element.removeAttribute(attr.name);
      }
    }
  });

  // Sanitize attribute values (normalize whitespace in attribute values)
  doc.querySelectorAll('*').forEach(element => {
    const attrs = Array.from(element.attributes);
    for (const attr of attrs) {
      if (attr.value && attr.value.length > 0) {
        // Apply text sanitization to attribute values with more conservative settings
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
          element.setAttribute(attr.name, cleaned);
        }
      }
    }
  });

  let cleanedHtml = doc.documentElement.outerHTML;
  
  // Normalize whitespace: remove multiple newlines and excessive spaces
  cleanedHtml = cleanedHtml
    .replace(/>\s+</g, '><')           // Remove whitespace between tags
    .replace(/\n\s*\n+/g, '\n')        // Replace multiple newlines with single newline
    .replace(/^\s+|\s+$/g, '');        // Trim leading/trailing whitespace
  
  const cleanedSize = cleanedHtml.length;
  const cleanedSample = cleanedHtml.substring(0, 500);
  const reductionPercentage = ((originalSize - cleanedSize) / originalSize) * 100;

  return {
    cleanedHtml,
    originalSize,
    cleanedSize,
    reductionPercentage,
    originalSample,
    cleanedSample
  };
}

