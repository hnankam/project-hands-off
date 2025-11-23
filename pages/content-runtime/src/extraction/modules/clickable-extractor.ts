/**
 * @fileoverview Clickable elements extraction utilities
 */

import type { WindowWithUtils, ShadowRootMetadata } from './types';
import { sanitizeText } from './sanitizer';
import { generateRobustFallbackSelector } from './selector-generator';
import { collectElementsRecursively, getShadowContext } from './shadow-dom';
import { ensureUniqueSelector, makeGloballyUniqueSelector } from './uniqueness';

export const extractClickableElements = (
  win: WindowWithUtils,
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata>
) => {
  try {
    // Generate CSS selector
    const generateClickableSelector = (el: Element, shadowRoot: ShadowRoot | null) => {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) {
        return { selector: el.tagName.toLowerCase(), isUnique: false };
      }
      
      if (typeof win.utils !== 'object' || typeof win.utils.generateFastSelector !== 'function') {
        return generateRobustFallbackSelector(el);
      }
      
      return win.utils.generateFastSelector(el, shadowRoot);
    };
    
    // Collect elements
    const elements = new Set<Element>();
    const selectors = [
      // Standard HTML elements
      'button', 'a[href]', 'input[type="button"]', 'input[type="submit"]', 
      'input[type="reset"]', 'input[type="checkbox"]', 'input[type="radio"]',
      // ARIA roles
      '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]', 
      '[role="option"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
      // Event handlers
      '[onclick]', '[onmousedown]', '[onmouseup]', '[ontouchstart]', '[ontouchend]',
      // Data attributes
      '[data-testid]', '[data-cy]', '[data-test]', '[data-testid*="button"]', 
      '[data-testid*="link"]', '[data-testid*="click"]',
      // Framework patterns
      '[class*="button"]', '[class*="btn"]', '[class*="link"]', '[class*="clickable"]', 
      '[class*="interactive"]', '[class*="action"]', '[class*="card"]', '[class*="item"]', 
      '[class*="menu"]', '[class*="tab"]', '[class*="option"]', '[class*="select"]',
      // UI libraries
      '[class*="ant-btn"]', '[class*="el-button"]', '[class*="v-btn"]', 
      '[class*="btn-"]', '[class*="button-"]', '[class*="link-"]',
      // Common patterns
      '[class*="dropdown"]', '[class*="modal"]', '[class*="dialog"]', 
      '[class*="popup"]', '[class*="tooltip"]'
    ];
    
    // Batch element collection
    selectors.forEach(selector => {
      collectElementsRecursively(selector, document, shadowRootMap).forEach(el => elements.add(el));
    });
    
    // Add cursor pointer elements
    const cursorSelectors = [
      '[style*="cursor: pointer"]', '[style*="cursor:grab"]', 
      '.cursor-pointer', '.cursor-grab'
    ];
    cursorSelectors.forEach(selector => {
      collectElementsRecursively(selector, document, shadowRootMap).forEach(el => elements.add(el));
    });
    
    // Process elements
    return Array.from(elements)
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map(el => {
        const text = sanitizeText(el.textContent);
        
        // Get shadow DOM context
        const shadowContext = getShadowContext(el, shadowRootMap);
        
        // Generate initial selector
        const selectorResult = generateClickableSelector(el, shadowContext.shadowRoot);
        const initialSelector = selectorResult.selector;
        
        // Enforce uniqueness
        const uniqueResult = ensureUniqueSelector(el, initialSelector, shadowContext.shadowRoot, shadowRootMap);
        let bestSelector = uniqueResult.selector;
        const isScopedUnique = uniqueResult.isUnique;
        const isGloballyUnique = uniqueResult.isGloballyUnique;
        
        // Make selector globally unique
        bestSelector = makeGloballyUniqueSelector(
          bestSelector,
          isGloballyUnique,
          shadowContext.shadowPath,
          shadowContext.shadowHostSelector,
          shadowContext.foundInShadowDOM
        );
        
        return {
          selector: bestSelector,
          isUnique: isGloballyUnique || isScopedUnique,
          tagName: el.tagName.toLowerCase(),
          text: text.substring(0, 100),
          href: (el as HTMLAnchorElement).href || '',
          title: el.getAttribute('title')?.substring(0, 100) || '',
          type: el.getAttribute('type') || '',
          foundInShadowDOM: shadowContext.foundInShadowDOM,
          shadowPath: shadowContext.shadowPath || undefined,
          shadowDepth: shadowContext.shadowDepth || undefined,
          shadowHostSelector: shadowContext.shadowHostSelector || undefined
        };
      })
      .filter(item => 
        item.text || item.title || item.href || item.tagName === 'button' || item.tagName === 'a'
      )
      .reduce((unique, item) => {
        if (!unique.find(existing => existing.selector === item.selector)) {
          unique.push(item);
        }
        return unique;
      }, [] as any[])
      .slice(0, 200);
      
  } catch (error) {
    console.warn('Clickable elements extraction failed:', error);
    return [];
  }
};

