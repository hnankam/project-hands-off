/**
 * @fileoverview Selector uniqueness verification and enforcement
 */

import type { ShadowRootMetadata, UniquenessResult } from './types';

/**
 * Context-aware uniqueness verification (works for both main DOM and shadow DOM)
 */
export const verifySelectorUniqueness = (
  el: Element,
  selector: string,
  shadowRoot: ShadowRoot | null
): boolean => {
  if (!selector || !el) return false;
  
  try {
    if (shadowRoot) {
      const matches = shadowRoot.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === el;
    } else {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === el;
    }
  } catch (e) {
    return false;
  }
};

/**
 * GLOBAL uniqueness verification (checks across ALL shadow roots and main DOM)
 */
export const verifyGlobalUniqueness = (
  el: Element,
  selector: string,
  currentShadowRoot: ShadowRoot | null,
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata>
): boolean => {
  if (!selector || !el) return false;
  
  let totalMatches = 0;
  let matchesTargetElement = false;
  
  try {
    // Check main DOM
    const mainMatches = document.querySelectorAll(selector);
    totalMatches += mainMatches.length;
    if (Array.from(mainMatches).includes(el)) {
      matchesTargetElement = true;
    }
    
    // Check ALL shadow roots
    for (const shadowRoot of shadowRootMap.keys()) {
      try {
        const shadowMatches = shadowRoot.querySelectorAll(selector);
        totalMatches += shadowMatches.length;
        if (Array.from(shadowMatches).includes(el)) {
          matchesTargetElement = true;
        }
      } catch (e) {
        // Skip invalid selectors
      }
    }
    
    return totalMatches === 1 && matchesTargetElement;
  } catch (e) {
    return false;
  }
};

/**
 * Enhanced selector uniqueness enforcer with context-aware strategies
 */
export const ensureUniqueSelector = (
  el: Element,
  initialSelector: string,
  shadowRoot: ShadowRoot | null,
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata>
): UniquenessResult => {
  const makeResult = (selector: string, isUnique: boolean): UniquenessResult => {
    const isGloballyUnique = isUnique ? verifyGlobalUniqueness(el, selector, shadowRoot, shadowRootMap) : false;
    return { selector, isUnique, isGloballyUnique };
  };
  
  if (!el || !initialSelector) {
    return makeResult(initialSelector || el.tagName.toLowerCase(), false);
  }
  
  // Test if initial selector is already unique
  if (verifySelectorUniqueness(el, initialSelector, shadowRoot)) {
    return makeResult(initialSelector, true);
  }
  
  const tagName = el.tagName.toLowerCase();
  
  // Strategy 1: Try rich attributes
  const uniqueAttrs = [
    'data-testid', 'data-cy', 'data-test', 'data-id',
    'aria-label', 'aria-describedby', 'slot', 'name', 'id'
  ];
  
  for (const attr of uniqueAttrs) {
    const value = el.getAttribute(attr);
    if (value) {
      const attrSelector = `${tagName}[${attr}="${CSS.escape(value)}"]`;
      if (verifySelectorUniqueness(el, attrSelector, shadowRoot)) {
        return makeResult(attrSelector, true);
      }
    }
  }
  
  // Strategy 2: Combine class with unique attribute
  if (el.className && typeof el.className === 'string' && el.classList.length > 0) {
    const firstClass = Array.from(el.classList)[0];
    const combineAttrs = ['aria-label', 'slot', 'aria-describedby', 'title'];
    
    for (const attr of combineAttrs) {
      const value = el.getAttribute(attr);
      if (value) {
        const combinedSelector = `${tagName}.${CSS.escape(firstClass)}[${attr}="${CSS.escape(value)}"]`;
        if (verifySelectorUniqueness(el, combinedSelector, shadowRoot)) {
          return makeResult(combinedSelector, true);
        }
      }
    }
  }
  
  // Strategy 3: Try multiple attributes together
  const multiAttrCombos = [
    ['aria-label', 'slot'],
    ['aria-label', 'aria-describedby'],
    ['slot', 'aria-describedby'],
    ['type', 'aria-label'],
    ['class', 'slot']
  ];
  
  for (const combo of multiAttrCombos) {
    const values = combo.map(attr => {
      if (attr === 'class' && el.className && typeof el.className === 'string' && el.classList.length > 0) {
        return { attr: 'class', value: Array.from(el.classList)[0] };
      }
      const value = el.getAttribute(attr);
      return value ? { attr, value } : null;
    }).filter(v => v !== null);
    
    if (values.length === combo.length) {
      let multiSelector = tagName;
      for (const { attr, value } of values) {
        if (attr === 'class') {
          multiSelector += `.${CSS.escape(value)}`;
        } else {
          multiSelector += `[${attr}="${CSS.escape(value)}"]`;
        }
      }
      
      if (verifySelectorUniqueness(el, multiSelector, shadowRoot)) {
        return makeResult(multiSelector, true);
      }
    }
  }
  
  // Strategy 4: Add nth-of-type()
  const root = shadowRoot || document;
  const allOfType = Array.from(root.querySelectorAll(tagName));
  const typeIndex = allOfType.indexOf(el);
  if (typeIndex >= 0) {
    const nthSelector = `${tagName}:nth-of-type(${typeIndex + 1})`;
    if (verifySelectorUniqueness(el, nthSelector, shadowRoot)) {
      return makeResult(nthSelector, true);
    }
  }
  
  // Strategy 5: Add parent context
  if (el.parentElement) {
    const parent = el.parentElement;
    let parentPart = parent.tagName.toLowerCase();
    
    if (parent.id) {
      parentPart = `#${CSS.escape(parent.id)}`;
    } else if (parent.className && typeof parent.className === 'string' && parent.classList.length > 0) {
      const firstClass = Array.from(parent.classList)[0];
      if (firstClass) {
        parentPart = `${parent.tagName.toLowerCase()}.${CSS.escape(firstClass)}`;
      }
    }
    
    const contextSelector = `${parentPart} > ${tagName}`;
    if (verifySelectorUniqueness(el, contextSelector, shadowRoot)) {
      return makeResult(contextSelector, true);
    }
    
    const parentChildren = Array.from(parent.children).filter(child => child.tagName === el.tagName);
    const parentIndex = parentChildren.indexOf(el);
    if (parentIndex >= 0) {
      const parentNthSelector = `${parentPart} > ${tagName}:nth-of-type(${parentIndex + 1})`;
      if (verifySelectorUniqueness(el, parentNthSelector, shadowRoot)) {
        return makeResult(parentNthSelector, true);
      }
    }
  }
  
  // Strategy 6: Build hierarchical path (2 levels up)
  if (el.parentElement?.parentElement) {
    const parent = el.parentElement;
    const grandparent = el.parentElement.parentElement;
    
    let parentPart = parent.tagName.toLowerCase();
    if (parent.id) parentPart = `#${CSS.escape(parent.id)}`;
    else if (parent.className && typeof parent.className === 'string' && parent.classList.length > 0) {
      parentPart += `.${CSS.escape(Array.from(parent.classList)[0])}`;
    }
    
    let grandparentPart = grandparent.tagName.toLowerCase();
    if (grandparent.id) grandparentPart = `#${CSS.escape(grandparent.id)}`;
    
    const hierarchicalSelector = `${grandparentPart} > ${parentPart} > ${tagName}`;
    if (verifySelectorUniqueness(el, hierarchicalSelector, shadowRoot)) {
      return makeResult(hierarchicalSelector, true);
    }
  }
  
  // Strategy 7: Use nth-child as last resort
  if (el.parentElement) {
    const siblings = Array.from(el.parentElement.children);
    const childIndex = siblings.indexOf(el);
    if (childIndex >= 0) {
      const nthChildSelector = `${tagName}:nth-child(${childIndex + 1})`;
      if (verifySelectorUniqueness(el, nthChildSelector, shadowRoot)) {
        return makeResult(nthChildSelector, true);
      }
      
      if (el.parentElement.tagName) {
        const parentTag = el.parentElement.tagName.toLowerCase();
        const parentNthChild = `${parentTag} > ${tagName}:nth-child(${childIndex + 1})`;
        if (verifySelectorUniqueness(el, parentNthChild, shadowRoot)) {
          return makeResult(parentNthChild, true);
        }
      }
    }
  }
  
  console.warn('[Selector Uniqueness] Failed to generate unique selector for element:', el, 'Selector:', initialSelector);
  return makeResult(initialSelector, false);
};

/**
 * Make selector globally unique by incorporating shadow path if needed
 */
export const makeGloballyUniqueSelector = (
  selector: string,
  isGloballyUnique: boolean,
  shadowPath: string | undefined,
  shadowHostSelector: string | undefined,
  foundInShadowDOM: boolean
): string => {
  if (foundInShadowDOM) {
    if (shadowPath) {
      return `${shadowPath} >> ${selector}`;
    }
    if (shadowHostSelector) {
      return `${shadowHostSelector} >> ${selector}`;
    }
  }
  return selector;
};

