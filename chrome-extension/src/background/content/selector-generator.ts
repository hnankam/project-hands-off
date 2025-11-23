/**
 * @fileoverview CSS Selector Generation for Chrome Extension
 *
 * Provides robust CSS selector generation with multiple fallback strategies.
 * This module generates the shortest, most reliable selector possible for any
 * DOM element, with special handling for shadow DOM elements.
 *
 * Key Features:
 * - Multi-strategy selector generation (ID, data attributes, names, paths)
 * - Uniqueness verification for each strategy
 * - Shadow DOM aware selector generation
 * - CSS identifier escaping for special characters
 * - Early return optimization (stops at first unique selector)
 *
 * @module content/selector-generator
 */

/**
 * Result of selector generation
 */
export interface SelectorResult {
  selector: string;
  isUnique: boolean;
}

/**
 * Helper function to escape CSS identifiers
 * Escapes special CSS characters like . # [ ] : ( ) , > + ~ " '
 * 
 * @param identifier - String to escape
 * @returns Escaped CSS identifier
 */
export function escapeCSSIdentifier(identifier: string): string {
  return identifier.replace(/([\\.#\[\]:(),>+~"'])/g, '\\$1');
}

/**
 * Generate robust CSS selector for an element with multiple fallback strategies
 * 
 * This function attempts to generate the shortest, most reliable CSS selector
 * for the given element. It tries multiple strategies in order of reliability:
 * 
 * Strategy Priority:
 * 1. ID selector (#id) - Most reliable and shortest
 * 2. Data attributes (data-testid, data-cy) - Testing-friendly
 * 3. Name attribute (input[name="..."]) - Form elements
 * 4. Type + name combination - More specific form elements
 * 5. Hierarchical path with classes - Full DOM path
 * 6. Simple tag + class - Single class selector
 * 7. nth-of-type - Position-based fallback
 * 
 * Each strategy verifies uniqueness before returning. If no unique selector
 * is found, returns a non-unique generic selector as a last resort.
 * 
 * Usage:
 * - For main DOM elements: Pass the element only
 * - For shadow DOM elements: Also pass the shadowRoot
 * 
 * @param el - The DOM element to generate a selector for
 * @param root - The root to query from (document or shadowRoot)
 * @returns Selector result with uniqueness flag
 * 
 * @example
 * // Main DOM element
 * const result = generateRobustFallbackSelector(element, document);
 * if (result.isUnique) {
 *   console.log('Unique selector:', result.selector);
 * }
 * 
 * @example
 * // Shadow DOM element
 * const shadowHost = document.querySelector('my-component');
 * const shadowElement = shadowHost.shadowRoot.querySelector('button');
 * const result = generateRobustFallbackSelector(shadowElement, shadowHost.shadowRoot);
 */
export function generateRobustFallbackSelector(
  el: Element,
  root: Document | ShadowRoot = document
): SelectorResult {
  const tagName = el.tagName.toLowerCase();
  
  // Strategy 1: ID selector (most reliable)
  if (el.id) {
    const idSelector = `#${CSS.escape(el.id)}`;
    const matches = root.querySelectorAll(idSelector);
    if (matches.length === 1 && matches[0] === el) {
      return { selector: idSelector, isUnique: true };
    }
  }
  
  // Strategy 2: Data attributes (testing-friendly)
  const testId = el.getAttribute('data-testid');
  if (testId) {
    const dataSelector = `[data-testid="${CSS.escape(testId)}"]`;
    const matches = root.querySelectorAll(dataSelector);
    if (matches.length === 1 && matches[0] === el) {
      return { selector: dataSelector, isUnique: true };
    }
  }
  
  const dataCy = el.getAttribute('data-cy');
  if (dataCy) {
    const dataSelector = `[data-cy="${CSS.escape(dataCy)}"]`;
    const matches = root.querySelectorAll(dataSelector);
    if (matches.length === 1 && matches[0] === el) {
      return { selector: dataSelector, isUnique: true };
    }
  }
  
  // Strategy 3: Name attribute
  const name = el.getAttribute('name');
  if (name) {
    const nameSelector = `${tagName}[name="${CSS.escape(name)}"]`;
    const matches = root.querySelectorAll(nameSelector);
    if (matches.length === 1 && matches[0] === el) {
      return { selector: nameSelector, isUnique: true };
    }
  }
  
  // Strategy 4: Type + name combination
  const type = el.getAttribute('type');
  if (type && name) {
    const typeNameSelector = `${tagName}[type="${CSS.escape(type)}"][name="${CSS.escape(name)}"]`;
    const matches = root.querySelectorAll(typeNameSelector);
    if (matches.length === 1 && matches[0] === el) {
      return { selector: typeNameSelector, isUnique: true };
    }
  }
  
  // Strategy 5: Hierarchical path with classes
  const path: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  
  while (current && current.nodeType === Node.ELEMENT_NODE && depth < 10) {
    let selector = current.tagName.toLowerCase();
    
    // Add classes if available
    if (current.className && typeof current.className === 'string') {
      const classes = Array.from(current.classList);
      if (classes.length > 0) {
        const classString = classes.map(cls => CSS.escape(cls)).join('.');
        selector += '.' + classString;
      }
    }
    
    // Add nth-child for disambiguation
    if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children);
      const matchingSiblings = siblings.filter(child => 
        child.tagName === current!.tagName
      );
      
      if (matchingSiblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }
    
    path.unshift(selector);
    current = current.parentElement;
    depth++;
  }
  
  const fullSelector = path.join(' > ');
  const matches = root.querySelectorAll(fullSelector);
  if (matches.length === 1 && matches[0] === el) {
    return { selector: fullSelector, isUnique: true };
  }
  
  // Strategy 6: Simple tag + class combination
  if (el.className && typeof el.className === 'string') {
    const classes = Array.from(el.classList);
    if (classes.length > 0) {
      const firstClass = classes[0];
      const classSelector = `${tagName}.${CSS.escape(firstClass)}`;
      const matches = root.querySelectorAll(classSelector);
      if (matches.length === 1 && matches[0] === el) {
        return { selector: classSelector, isUnique: true };
      }
    }
  }
  
  // Strategy 7: Final fallback - tag with nth-of-type
  const allSameTag = root.querySelectorAll(tagName);
  if (allSameTag.length > 1) {
    const index = Array.from(allSameTag).indexOf(el) + 1;
    const nthSelector = `${tagName}:nth-of-type(${index})`;
    const matches = root.querySelectorAll(nthSelector);
    if (matches.length === 1 && matches[0] === el) {
      return { selector: nthSelector, isUnique: true };
    }
  }
  
  // If all strategies fail, return generic selector as non-unique
  return { selector: tagName, isUnique: false };
}

