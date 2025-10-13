// Fast CSS Selector Generator for Chrome Extension
(function() {
  'use strict';

  // Fast selector generator optimized for shortest unique selectors
  function generateFastSelector(el) {
    const tagName = el.tagName.toLowerCase();
    const candidates = [];
    
    // Collect all potential selectors with their lengths
    const addCandidate = (selector) => {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1 && matches[0] === el) {
        candidates.push({ selector, length: selector.length });
      }
    };
    
    // Strategy 1: ID selector (shortest, most reliable)
    if (el.id) {
      addCandidate(`#${CSS.escape(el.id)}`);
    }

    // Strategy 2: Attribute-only selectors (shortest possible)
    const testId = el.getAttribute('data-testid');
    if (testId) {
      addCandidate(`[data-testid="${CSS.escape(testId)}"]`);
    }

    const dataCy = el.getAttribute('data-cy');
    if (dataCy) {
      addCandidate(`[data-cy="${CSS.escape(dataCy)}"]`);
    }

    const name = el.getAttribute('name');
    if (name) {
      addCandidate(`[name="${CSS.escape(name)}"]`);
    }

    const type = el.getAttribute('type');
    if (type) {
      addCandidate(`[type="${CSS.escape(type)}"]`);
    }

    const role = el.getAttribute('role');
    if (role) {
      addCandidate(`[role="${CSS.escape(role)}"]`);
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      addCandidate(`[aria-label="${CSS.escape(ariaLabel)}"]`);
    }

    // Strategy 3: Class-only selectors (short)
    if (el.className && typeof el.className === 'string') {
      const classes = Array.from(el.classList);
      for (const cls of classes) {
        addCandidate(`.${CSS.escape(cls)}`);
      }
    }

    // Strategy 4: Tag + attribute combinations
    if (name) {
      addCandidate(`${tagName}[name="${CSS.escape(name)}"]`);
    }
    if (type) {
      addCandidate(`${tagName}[type="${CSS.escape(type)}"]`);
    }

    // Strategy 5: Tag + class combinations
    if (el.className && typeof el.className === 'string') {
      const classes = Array.from(el.classList);
      for (const cls of classes) {
        addCandidate(`${tagName}.${CSS.escape(cls)}`);
      }
    }

    // Strategy 6: Parent ID + tag (short hierarchical)
    if (el.parentElement && el.parentElement.id) {
      const parentId = el.parentElement.id;
      addCandidate(`#${CSS.escape(parentId)} > ${tagName}`);
    }

    // Strategy 7: nth-of-type (short position-based)
    const allSameTag = document.querySelectorAll(tagName);
    if (allSameTag.length > 1) {
      const index = Array.from(allSameTag).indexOf(el) + 1;
      addCandidate(`${tagName}:nth-of-type(${index})`);
    }

    // Return the shortest unique selector if found
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.length - b.length);
      return { selector: candidates[0].selector, isUnique: true };
    }

    // Final fallback: Build path from body using nth-child (guaranteed unique)
    const path = [];
    let current = el;

    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) break;
      
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(current) + 1;
      path.unshift(`:nth-child(${index})`);
      current = parent;
    }
    
    // Always return a unique selector, even if it's long
    const uniqueSelector = path.length > 0 ? `body > ${path.join(' > ')}` : tagName;
    return { selector: uniqueSelector, isUnique: true };
  }

  // Make utilities available globally
  window.utils = {
    generateFastSelector: generateFastSelector,
    version: '5.2-shortest-unique' // Version marker to verify new code is loaded
  };
  
  console.log('[Utils] Loaded fast selector generator v5.2 - shortest unique');
})();