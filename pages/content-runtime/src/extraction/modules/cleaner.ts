/**
 * @fileoverview HTML cleaning utilities
 */

import { sanitizeText } from './sanitizer';
import type { CleaningResult } from './types';

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

  // Remove unnecessary elements
  const selectorsToRemove = ['head', 'script', 'style', 'link', 'meta', 'noscript', 'iframe', 'object', 'embed', 'svg'];

  selectorsToRemove.forEach(selector => {
    const elements = doc.querySelectorAll(selector);
    elements.forEach(element => {
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

  // Remove inline styles
  doc.querySelectorAll('*').forEach(element => {
    element.removeAttribute('style');
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

  // Remove video/audio sources
  doc.querySelectorAll('source').forEach(source => {
    const placeholder = doc.createElement('span');
    placeholder.textContent = `[SOURCE: ${source.getAttribute('src') || 'unknown'}]`;
    source.replaceWith(placeholder);
  });

  // Remove comments
  const removeComments = (node: Node) => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        removeComments(child);
      }
    });
  };
  removeComments(doc.body);

  // Remove empty attributes
  doc.querySelectorAll('*').forEach(element => {
    Array.from(element.attributes).forEach(attr => {
      if (attr.value === '') {
        element.removeAttribute(attr.name);
      }
    });
  });

  // Sanitize attribute values
  doc.querySelectorAll('*').forEach(element => {
    Array.from(element.attributes).forEach(attr => {
      if (attr.value && attr.value.length > 0) {
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
    });
  });

  let cleanedHtml = doc.documentElement.outerHTML;
  
  // Normalize whitespace
  cleanedHtml = cleanedHtml
    .replace(/>\s+</g, '><')
    .replace(/\n\s*\n+/g, '\n')
    .replace(/^\s+|\s+$/g, '');
  
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
};

