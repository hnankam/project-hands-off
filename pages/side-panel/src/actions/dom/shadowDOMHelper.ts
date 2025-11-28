/**
 * Shared Shadow DOM Helper Functions
 *
 * These functions provide a consistent way to query elements in both main DOM and Shadow DOM
 * using the >> notation (e.g., "document > x-app > x-component >> #element")
 */

// ============================================================================
// TYPES
// ============================================================================

/** Result of selector metadata lookup */
export interface SelectorMetadata {
  foundInShadowDOM: boolean;
  shadowHostInfo: string;
}

/** Element info returned from content scripts */
export interface ElementInfo {
  tag: string;
  id: string | null;
  classes: string[];
  textSnippet: string;
}

/** Result from buildSelector in content scripts */
export interface BuildSelectorResult {
  selector: string;
  elementInfo: ElementInfo;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of classes to include in selector */
export const MAX_SELECTOR_CLASSES = 3;

/** Maximum length for text snippets */
export const TEXT_SNIPPET_MAX_LENGTH = 60;

/** Attributes to check for unique selectors */
export const SELECTOR_HINT_ATTRS = ['name', 'role', 'type', 'aria-label', 'data-testid', 'data-test'] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Query selector with Shadow DOM support (for single element)
 * Supports the >> notation to traverse shadow DOM
 *
 * @param selector - CSS selector or shadow DOM selector with >> notation
 * @returns Element or null
 *
 * @example
 * // Main DOM
 * querySelectorWithShadowDOM("#button")
 *
 * // Shadow DOM
 * querySelectorWithShadowDOM("document > x-app > x-component >> #button")
 */
export function querySelectorWithShadowDOM(selector: string): Element | null {
  // Check if this is a shadow DOM selector with >> notation
  if (!selector.includes(' >> ')) {
    // Regular selector - just query the document
    return document.querySelector(selector);
  }

  // Shadow DOM selector: "shadowPath >> elementSelector"
  const parts = selector.split(' >> ');
  if (parts.length !== 2) {
    throw new Error(`Invalid shadow DOM selector format. Expected "shadowPath >> elementSelector", got: ${selector}`);
  }

  const shadowPath = parts[0].trim();
  const elementSelector = parts[1].trim();

  // Parse shadow path: "document > element1 > element2 > ..."
  const pathSegments = shadowPath
    .split(' > ')
    .map(s => s.trim())
    .filter(s => s && s !== 'document');

  if (pathSegments.length === 0) {
    throw new Error(`Shadow path must contain at least one element, got: ${shadowPath}`);
  }

  // Traverse the shadow path
  let currentRoot: Document | ShadowRoot = document;

  for (const segment of pathSegments) {
    // Query for the host element in the current root
    const hostElement: Element | null = currentRoot.querySelector(segment);

    if (!hostElement) {
      throw new Error(`Shadow host not found: ${segment} in path ${shadowPath}`);
    }

    if (!hostElement.shadowRoot) {
      throw new Error(`Element ${segment} does not have a shadow root in path ${shadowPath}`);
    }

    // Move into the shadow root
    currentRoot = hostElement.shadowRoot;
  }

  // Now query for the element selector within the final shadow root
  return currentRoot.querySelector(elementSelector);
}

/**
 * Query selector with Shadow DOM support (for multiple elements)
 * Supports the >> notation to traverse shadow DOM
 *
 * @param selector - CSS selector or shadow DOM selector with >> notation
 * @returns Array of Elements
 *
 * @example
 * // Main DOM
 * querySelectorAllWithShadowDOM(".button")
 *
 * // Shadow DOM
 * querySelectorAllWithShadowDOM("document > x-app > x-component >> .button")
 */
export function querySelectorAllWithShadowDOM(selector: string): Element[] {
  // Check if this is a shadow DOM selector with >> notation
  if (!selector.includes(' >> ')) {
    // Regular selector - just query the document
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (e) {
      throw new Error(`Invalid CSS selector: ${selector}`);
    }
  }

  // Shadow DOM selector: "shadowPath >> elementSelector"
  const parts = selector.split(' >> ');
  if (parts.length !== 2) {
    throw new Error(`Invalid shadow DOM selector format. Expected "shadowPath >> elementSelector", got: ${selector}`);
  }

  const shadowPath = parts[0].trim();
  const elementSelector = parts[1].trim();

  // Parse shadow path: "document > element1 > element2 > ..."
  const pathSegments = shadowPath
    .split(' > ')
    .map(s => s.trim())
    .filter(s => s && s !== 'document');

  if (pathSegments.length === 0) {
    throw new Error(`Shadow path must contain at least one element, got: ${shadowPath}`);
  }

  // Traverse the shadow path
  let currentRoot: Document | ShadowRoot = document;

  for (const segment of pathSegments) {
    // Query for the host element in the current root
    const hostElement: Element | null = currentRoot.querySelector(segment);

    if (!hostElement) {
      throw new Error(`Shadow host not found: ${segment} in path ${shadowPath}`);
    }

    if (!hostElement.shadowRoot) {
      throw new Error(`Element ${segment} does not have a shadow root in path ${shadowPath}`);
    }

    // Move into the shadow root
    currentRoot = hostElement.shadowRoot;
  }

  // Now query for the element selector within the final shadow root
  try {
    return Array.from(currentRoot.querySelectorAll(elementSelector));
  } catch (e) {
    throw new Error(`Invalid element selector in shadow DOM: ${elementSelector}`);
  }
}

/**
 * Get metadata about where an element was found (main DOM vs shadow DOM)
 *
 * @param selector - The selector used to find the element
 * @returns Metadata about element location
 */
export function getSelectorMetadata(selector: string): SelectorMetadata {
  const isShadowDOMSelector = selector.includes(' >> ');

  return {
    foundInShadowDOM: isShadowDOMSelector,
    shadowHostInfo: isShadowDOMSelector ? selector.split(' >> ')[0].trim() : '',
  };
}

// ============================================================================
// INLINE HELPERS FOR CONTENT SCRIPTS
// ============================================================================

/**
 * CSS.escape polyfill code for injection into content scripts
 * Returns code string to be included in executeScript functions
 */
export const CSS_ESCAPE_POLYFILL = `
  if (typeof window.CSS === 'undefined' || typeof CSS.escape !== 'function') {
    window.CSS = window.CSS || {};
    CSS.escape = function (value) {
      return String(value).replace(/([!"#$%&'()*+,./:;<=>?@[\\]^\`{|}~])/g, '\\\\$1');
    };
  }
`;

/**
 * Creates the buildSelector function code for injection into content scripts.
 * This function generates a unique CSS selector for any DOM element.
 *
 * @param maxClasses - Maximum number of classes to include (default: 3)
 * @param textSnippetLength - Maximum length for text snippets (default: 60)
 * @returns Function code string
 */
export function createBuildSelectorCode(maxClasses = 3, textSnippetLength = 60): string {
  return `
    function buildSelector(node) {
      const MAX_CLASSES = ${maxClasses};
      const TEXT_SNIPPET_LENGTH = ${textSnippetLength};
      const HINT_ATTRS = ['name', 'role', 'type', 'aria-label', 'data-testid', 'data-test'];

      // Try global utils.generateFastSelector first
      try {
        const gen = window.utils && window.utils.generateFastSelector;
        if (typeof gen === 'function') {
          const res = gen(node);
          if (res && typeof res.selector === 'string' && res.selector.length > 0) {
            try {
              const hits = document.querySelectorAll(res.selector);
              if (hits.length === 1 && hits[0] === node) return res.selector;
            } catch (e) {}
          }
        }
      } catch (e) {}

      // Prefer unique id
      if (node.id) {
        const idSel = '#' + CSS.escape(node.id);
        try {
          if (document.querySelectorAll(idSel).length === 1) return idSel;
        } catch (e) {}
      }

      const candidates = [];
      const tag = node.tagName.toLowerCase();
      const classList = Array.from(node.classList);

      // Try class-based selector
      if (classList.length) {
        const classSel = tag + '.' + classList
          .map(function(c) { return CSS.escape(c); })
          .slice(0, MAX_CLASSES)
          .join('.');
        candidates.push(classSel);
      }

      // Try attribute-based selectors
      for (var i = 0; i < HINT_ATTRS.length; i++) {
        var attr = HINT_ATTRS[i];
        var val = node.getAttribute && node.getAttribute(attr);
        if (val) candidates.push(tag + '[' + attr + '="' + CSS.escape(val) + '"]');
      }

      candidates.push(tag);

      // Try short unique candidates
      for (var j = 0; j < candidates.length; j++) {
        var sel = candidates[j];
        try {
          if (document.querySelectorAll(sel).length === 1) return sel;
        } catch (e) {}
      }

      // Build path with nth-of-type
      var parts = [];
      var cur = node;
      while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
        var part = cur.tagName.toLowerCase();
        if (cur.id) {
          part = '#' + CSS.escape(cur.id);
          parts.push(part);
          break;
        }
        var sibs = Array.from(cur.parentElement ? cur.parentElement.children : []).filter(
          function(c) { return c.tagName === cur.tagName; }
        );
        var idx = sibs.indexOf(cur) + 1;
        part += ':nth-of-type(' + idx + ')';
        parts.push(part);
        cur = cur.parentElement;
      }
      parts.push('html');
      var full = parts.reverse().join(' > ');

      // Verify uniqueness
      try {
        var hits = document.querySelectorAll(full);
        if (hits.length === 1 && hits[0] === node) return full;
      } catch (e) {}

      // Guaranteed unique fallback with nth-child from body
      var path = [];
      var current = node;
      while (current && current !== document.body) {
        var parentEl = current.parentElement;
        if (!parentEl) break;
        var siblings = Array.from(parentEl.children);
        var index = siblings.indexOf(current) + 1;
        path.unshift(current.tagName.toLowerCase() + ':nth-child(' + index + ')');
        current = parentEl;
      }
      return path.length > 0 ? 'body > ' + path.join(' > ') : node.tagName.toLowerCase();
    }

    function getElementInfo(el) {
      return {
        tag: el.tagName,
        id: el.id || null,
        classes: Array.from(el.classList || []),
        textSnippet: (el.textContent || '').trim().slice(0, ${textSnippetLength}),
      };
    }
  `;
}

/**
 * Creates the querySelectorWithShadowDOM function code for injection into content scripts.
 * Returns code string for shadow DOM traversal.
 */
export const QUERY_SELECTOR_SHADOW_DOM_CODE = `
  function querySelectorWithShadowDOM(selector) {
    if (!selector.includes(' >> ')) {
      return document.querySelector(selector);
    }

    var parts = selector.split(' >> ');
    if (parts.length !== 2) {
      throw new Error('Invalid shadow DOM selector format. Expected "shadowPath >> elementSelector"');
    }

    var shadowPath = parts[0].trim();
    var elementSelector = parts[1].trim();

    var pathSegments = shadowPath
      .split(' > ')
      .map(function(s) { return s.trim(); })
      .filter(function(s) { return s && s !== 'document'; });

    if (pathSegments.length === 0) {
      throw new Error('Shadow path must contain at least one element');
    }

    var currentRoot = document;

    for (var i = 0; i < pathSegments.length; i++) {
      var segment = pathSegments[i];
      var hostElement = currentRoot.querySelector(segment);

      if (!hostElement) {
        throw new Error('Shadow host not found: ' + segment);
      }

      if (!hostElement.shadowRoot) {
        throw new Error('Element does not have a shadow root: ' + segment);
      }

      currentRoot = hostElement.shadowRoot;
    }

    return currentRoot.querySelector(elementSelector);
  }

  function querySelectorAllWithShadowDOM(selector) {
    if (!selector.includes(' >> ')) {
      try {
        return Array.from(document.querySelectorAll(selector));
      } catch (e) {
        throw new Error('Invalid CSS selector: ' + selector);
      }
    }

    var parts = selector.split(' >> ');
    if (parts.length !== 2) {
      throw new Error('Invalid shadow DOM selector format. Expected "shadowPath >> elementSelector"');
    }

    var shadowPath = parts[0].trim();
    var elementSelector = parts[1].trim();

    var pathSegments = shadowPath
      .split(' > ')
      .map(function(s) { return s.trim(); })
      .filter(function(s) { return s && s !== 'document'; });

    if (pathSegments.length === 0) {
      throw new Error('Shadow path must contain at least one element');
    }

    var currentRoot = document;

    for (var i = 0; i < pathSegments.length; i++) {
      var segment = pathSegments[i];
      var hostElement = currentRoot.querySelector(segment);

      if (!hostElement) {
        throw new Error('Shadow host not found: ' + segment);
      }

      if (!hostElement.shadowRoot) {
        throw new Error('Element does not have a shadow root: ' + segment);
      }

      currentRoot = hostElement.shadowRoot;
    }

    try {
      return Array.from(currentRoot.querySelectorAll(elementSelector));
    } catch (e) {
      throw new Error('Invalid element selector in shadow DOM: ' + elementSelector);
    }
  }
`;
