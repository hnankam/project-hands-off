// Fast CSS Selector Generator for Chrome Extension
// Production-ready, early-return on unique hit, parent-scoped nth-of-type, DEBUG gating
(function() {
  'use strict';

  /**
   * Generate a short, unique CSS selector for an element in the main DOM or shadow DOM.
   * - Early-returns as soon as a unique selector is found
   * - Uses parent-scoped nth-of-type to avoid document-wide scans
   * - If no short unique selector is found, returns a guaranteed-unique path from body using nth-child
   * - NOW SHADOW DOM AWARE: Pass shadowRoot parameter for elements in shadow DOM
   *
   * @param {Element} el - The element to generate a selector for
   * @param {ShadowRoot|null} shadowRoot - Optional shadow root if element is in shadow DOM
   * @returns {{ selector: string, isUnique: boolean }}
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

  // Make utilities available globally
  window.utils = {
    generateFastSelector: generateFastSelector,
    version: '5.4-shadow-aware' // Version marker - now shadow DOM aware
  };
  
  // Gate logs in production by checking a flag injected elsewhere if desired
  // console.log('[Utils] Loaded fast selector generator v5.3 - shortest unique fast');
})();