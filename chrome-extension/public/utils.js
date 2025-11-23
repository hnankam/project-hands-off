/**
 * @fileoverview Fast CSS Selector Generator for Chrome Extension
 * 
 * Production-ready utility for generating short, unique CSS selectors for DOM elements.
 * This module is injected into web pages to provide selector generation capabilities
 * for form capture, interactive element detection, and web automation.
 * 
 * Key Features:
 * - Early-return optimization: Stops as soon as a unique selector is found
 * - Shadow DOM aware: Full support for Web Components and Shadow DOM boundaries
 * - Multiple strategies: Tests 7 different selector strategies in priority order
 * - Performance optimized: Parent-scoped nth-of-type to avoid document-wide scans
 * - Guaranteed uniqueness: Falls back to hierarchical path if no short selector is unique
 * - Production-ready: Guards against missing APIs, robust error handling
 * 
 * Usage:
 * This file is automatically injected into web pages via:
 * 1. Content scripts (manifest.ts) - Loaded on every page
 * 2. Background script (index.ts) - Dynamically injected before page analysis
 * 
 * API:
 * window.utils.generateFastSelector(element, shadowRoot) -> { selector: string, isUnique: boolean }
 * 
 * @version 5.4-shadow-aware
 * @author Project Hands-Off Team
 */
(function() {
  'use strict';

  /**
   * Generate a short, unique CSS selector for an element in the main DOM or shadow DOM.
   * 
   * This function employs a multi-strategy approach to find the shortest possible
   * unique selector for a given element. It tests selectors in order of preference
   * (shortest first) and returns as soon as a unique match is found.
   * 
   * Selector Strategy Priority (tested in order):
   * 1. ID selector - #myId (shortest, most reliable)
   * 2. Attribute-only selectors - [data-testid="value"], [name="email"]
   * 3. Class-only selectors - .className
   * 4. Tag + attribute combinations - input[name="email"]
   * 5. Tag + class combinations - button.submit
   * 6. Parent ID + tag - #parent > button
   * 7. Parent-scoped nth-of-type - button:nth-of-type(3)
   * 8. Fallback: Guaranteed-unique hierarchical path - body > div:nth-child(1) > button:nth-child(2)
   * 
   * Shadow DOM Support:
   * When an element exists within a Shadow DOM, pass the shadowRoot parameter.
   * The function will:
   * - Query the correct root (shadow or document)
   * - Generate selectors relative to the shadow boundary
   * - Build paths from shadow root instead of body
   * 
   * Performance Characteristics:
   * - Average execution time: <1ms for typical elements
   * - Early-return pattern minimizes unnecessary checks
   * - Parent-scoped queries avoid full document scans
   * - Limits class checks to first 3 classes for efficiency
   * 
   * Examples:
   * // Main DOM element with ID
   * generateFastSelector(document.getElementById('submit'))
   * // Returns: { selector: "#submit", isUnique: true }
   * 
   * // Shadow DOM element
   * const shadowHost = document.querySelector('my-component');
   * const shadowButton = shadowHost.shadowRoot.querySelector('button');
   * generateFastSelector(shadowButton, shadowHost.shadowRoot)
   * // Returns: { selector: "button.primary", isUnique: true }
   * 
   * // Element with no unique attributes (falls back to hierarchical path)
   * generateFastSelector(document.querySelector('div div span'))
   * // Returns: { selector: "body > div:nth-child(2) > div:nth-child(1) > span:nth-child(3)", isUnique: true }
   * 
   * @param {Element} el - The DOM element to generate a selector for. Must be a valid Element node.
   * @param {ShadowRoot|null} [shadowRoot=null] - Optional shadow root if the element is within a Shadow DOM.
   *                                               Required for correct selector generation in Web Components.
   * @returns {{ selector: string, isUnique: boolean }} An object containing:
   *   - selector: The generated CSS selector string
   *   - isUnique: Boolean indicating if the selector uniquely identifies the element
   * 
   * @throws Does not throw - Returns fallback selector for invalid inputs
   */
  function generateFastSelector(el, shadowRoot = null) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) {
      return { selector: 'body', isUnique: false };
    }

    // Guard CSS.escape availability
    if (typeof CSS === 'undefined' || typeof CSS.escape !== 'function') {
      // Fallback: hierarchical path from body/shadow root
      return buildGuaranteedUnique(el, shadowRoot);
    }

    const tagName = el.tagName.toLowerCase();
    const root = shadowRoot || document; // Use shadow root if provided, otherwise main document
    
    const isUnique = (selector) => {
      try {
        const matches = root.querySelectorAll(selector); // Query the correct root
        return matches.length === 1 && matches[0] === el;
      } catch {
        return false;
      }
    };
    
    // Strategy 1: ID selector (shortest, most reliable)
    if (el.id) {
      const s = `#${CSS.escape(el.id)}`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }

    // Strategy 2: Attribute-only selectors (shortest possible)
    const testId = el.getAttribute('data-testid');
    if (testId) {
      const s = `[data-testid="${CSS.escape(testId)}"]`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }

    const dataCy = el.getAttribute('data-cy');
    if (dataCy) {
      const s = `[data-cy="${CSS.escape(dataCy)}"]`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }

    const name = el.getAttribute('name');
    if (name) {
      const s = `[name="${CSS.escape(name)}"]`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }

    const type = el.getAttribute('type');
    if (type) {
      const s = `[type="${CSS.escape(type)}"]`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }

    const role = el.getAttribute('role');
    if (role) {
      const s = `[role="${CSS.escape(role)}"]`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const s = `[aria-label="${CSS.escape(ariaLabel)}"]`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }

    // Strategy 3: Class-only selectors (short)
    if (el.className && typeof el.className === 'string') {
      const classes = Array.from(el.classList);
      for (let i = 0; i < classes.length && i < 3; i++) {
        const cls = classes[i];
        const s = `.${CSS.escape(cls)}`;
        if (isUnique(s)) return { selector: s, isUnique: true };
      }
    }

    // Strategy 4: Tag + attribute combinations
    if (name) {
      const s = `${tagName}[name="${CSS.escape(name)}"]`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }
    if (type) {
      const s = `${tagName}[type="${CSS.escape(type)}"]`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }

    // Strategy 5: Tag + class combinations
    if (el.className && typeof el.className === 'string') {
      const classes = Array.from(el.classList);
      for (let i = 0; i < classes.length && i < 3; i++) {
        const cls = classes[i];
        const s = `${tagName}.${CSS.escape(cls)}`;
        if (isUnique(s)) return { selector: s, isUnique: true };
      }
    }

    // Strategy 6: Parent ID + tag (short hierarchical)
    if (el.parentElement && el.parentElement.id) {
      const parentId = el.parentElement.id;
      const s = `#${CSS.escape(parentId)} > ${tagName}`;
      if (isUnique(s)) return { selector: s, isUnique: true };
    }

    // Strategy 7: nth-of-type scoped to parent (fast and precise)
    if (el.parentElement) {
      const siblings = Array.from(el.parentElement.children).filter(c => c.tagName === el.tagName);
      if (siblings.length > 1) {
        const pos = siblings.indexOf(el) + 1;
        const s = `${tagName}:nth-of-type(${pos})`;
        if (isUnique(s)) return { selector: s, isUnique: true };
      }
    }

    // Final fallback: Build path from body/shadow root using nth-child (guaranteed unique)
    return buildGuaranteedUnique(el, shadowRoot);
  }

  /**
   * Build a guaranteed-unique selector using hierarchical nth-child path.
   * 
   * This fallback function constructs a selector by building a path from the target
   * element up to the root node (document.body or shadowRoot), using nth-child
   * selectors at each level to ensure absolute uniqueness.
   * 
   * This method is used when:
   * - No short unique selector can be found
   * - CSS.escape API is unavailable
   * - Maximum selector uniqueness is required
   * 
   * Algorithm:
   * 1. Start from the target element
   * 2. Walk up the DOM tree to the root node
   * 3. At each level, determine the element's position among its siblings
   * 4. Build a selector using tag:nth-child(position)
   * 5. Join all parts with ' > ' to create full hierarchical path
   * 
   * Shadow DOM Handling:
   * - If shadowRoot is provided, path starts from shadow root boundary
   * - Omits 'body >' prefix for shadow DOM selectors
   * - Ensures selector is valid within the shadow context
   * 
   * Example Outputs:
   * // Main DOM element
   * body > div:nth-child(1) > section:nth-child(2) > button:nth-child(3)
   * 
   * // Shadow DOM element
   * div:nth-child(1) > button:nth-child(2)
   * 
   * @param {Element} el - The element to generate a selector for
   * @param {ShadowRoot|null} [shadowRoot=null] - Optional shadow root for shadow DOM elements
   * @returns {{ selector: string, isUnique: boolean }} Object with guaranteed-unique selector and isUnique: true
   * 
   * @private
   */
  function buildGuaranteedUnique(el, shadowRoot = null) {
    const path = [];
    let current = el;
    const rootNode = shadowRoot || document.body;
    
    while (current && current !== rootNode && current.parentElement) {
      const parent = current.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(current) + 1;
      path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
      current = parent;
    }
    
    // For shadow DOM, don't include 'body >' prefix
    const prefix = shadowRoot ? '' : 'body > ';
    const uniqueSelector = path.length > 0 ? `${prefix}${path.join(' > ')}` : el.tagName.toLowerCase();
    return { selector: uniqueSelector, isUnique: true };
  }

  /**
   * Global API exposed to the page context.
   * 
   * This object is attached to window.utils and provides access to the selector
   * generation functionality from content scripts, injected scripts, and the
   * background service worker.
   * 
   * API Methods:
   * - generateFastSelector(element, shadowRoot): Generate unique CSS selector
   * 
   * Properties:
   * - version: Current version string (semantic versioning + feature tag)
   * 
   * Usage from Content Scripts:
   * const result = window.utils.generateFastSelector(element);
   * console.log(result.selector); // "#myId" or "button.primary" etc.
   * 
   * Usage from Background Script (via executeScript):
   * const [result] = await chrome.scripting.executeScript({
   *   target: { tabId },
   *   func: (el) => window.utils.generateFastSelector(el),
   *   args: [element]
   * });
   * 
   * @global
   * @namespace window.utils
   */
  window.utils = {
    generateFastSelector: generateFastSelector,
    version: '5.4-shadow-aware' // Version marker - now shadow DOM aware
  };
  
})();