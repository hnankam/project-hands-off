/**
 * Shared Shadow DOM Helper Functions
 * 
 * These functions provide a consistent way to query elements in both main DOM and Shadow DOM
 * using the >> notation (e.g., "document > x-app > x-component >> #element")
 */

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
 * @param element - The found element
 * @returns Metadata about element location
 */
export function getSelectorMetadata(selector: string, element: Element | null): {
  foundInShadowDOM: boolean;
  shadowHostInfo: string;
} {
  const isShadowDOMSelector = selector.includes(' >> ');
  
  return {
    foundInShadowDOM: isShadowDOMSelector,
    shadowHostInfo: isShadowDOMSelector ? selector.split(' >> ')[0].trim() : '',
  };
}

/**
 * Create the inline helper for use in chrome.scripting.executeScript
 * Returns the function as a string to be injected into content scripts
 */
export function createInlineShadowDOMHelper(): string {
  return `
    // Inline Shadow DOM helper - supports >> notation
    function querySelectorWithShadowDOM(selector) {
      if (!selector.includes(' >> ')) {
        return document.querySelector(selector);
      }

      const parts = selector.split(' >> ');
      if (parts.length !== 2) {
        throw new Error('Invalid shadow DOM selector format. Expected "shadowPath >> elementSelector"');
      }

      const shadowPath = parts[0].trim();
      const elementSelector = parts[1].trim();

      const pathSegments = shadowPath
        .split(' > ')
        .map(s => s.trim())
        .filter(s => s && s !== 'document');

      if (pathSegments.length === 0) {
        throw new Error('Shadow path must contain at least one element');
      }

      let currentRoot = document;
      
      for (const segment of pathSegments) {
        const hostElement = currentRoot.querySelector(segment);
        
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
  `;
}

