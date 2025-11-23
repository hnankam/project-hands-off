/**
 * @fileoverview Shadow DOM utilities for traversal and mapping
 */

import type { ShadowContext, ShadowRootMetadata } from './types';

/**
 * Escape special characters in CSS selectors
 */
export const escapeCSSIdentifier = (identifier: string): string => {
  return identifier.replace(/([\\.#\[\]:(),>+~"'])/g, '\\$1');
};

/**
 * Build complete shadow root map with metadata (runs once)
 */
export const buildShadowRootMap = (
  root: Document | ShadowRoot | Element,
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata>,
  depth: number = 0,
  parentPath: string = 'document'
): void => {
  const elements = root.querySelectorAll('*');
  
  for (const element of Array.from(elements)) {
    if (element.shadowRoot && !shadowRootMap.has(element.shadowRoot)) {
      // Build host identifier with proper CSS escaping
      let hostIdentifier = element.tagName.toLowerCase();
      
      if (element.id) {
        hostIdentifier += '#' + escapeCSSIdentifier(element.id);
      }
      
      if (element.className && typeof element.className === 'string' && element.classList.length > 0) {
        const escapedClasses = Array.from(element.classList)
          .slice(0, 2)
          .map(cls => escapeCSSIdentifier(cls))
          .join('.');
        if (escapedClasses) {
          hostIdentifier += '.' + escapedClasses;
        }
      }
      
      const currentPath = `${parentPath} > ${hostIdentifier}`;
      
      shadowRootMap.set(element.shadowRoot, {
        host: element,
        depth: depth,
        path: currentPath
      });
      
      // Recursively map nested shadow roots
      buildShadowRootMap(element.shadowRoot, shadowRootMap, depth + 1, currentPath);
    }
  }
};

/**
 * Collect elements using cached shadow root map (including shadow DOM)
 */
export const collectElementsRecursively = (
  selector: string,
  root: Document | ShadowRoot | Element,
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata>
): Element[] => {
  const elements: Element[] = [];
  
  // Collect from current root
  try {
    elements.push(...Array.from(root.querySelectorAll(selector)));
  } catch (e) {
    // Skip invalid selectors
  }
  
  // Use cached map for shadow roots (fast lookup)
  if (root === document) {
    for (const shadowRoot of shadowRootMap.keys()) {
      try {
        elements.push(...Array.from(shadowRoot.querySelectorAll(selector)));
      } catch (e) {
        // Skip invalid selectors
      }
    }
  }
  
  return elements;
};

/**
 * Find shadow root context using cached map
 */
export const getShadowContext = (
  el: Element,
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata>
): ShadowContext => {
  let currentNode: Node | null = el.parentNode;
  
  // Walk up the tree until we find a shadow root
  while (currentNode && currentNode !== document) {
    if (currentNode instanceof ShadowRoot) {
      // Use cached metadata
      const metadata = shadowRootMap.get(currentNode);
      if (metadata) {
        // Build host identifier with proper CSS escaping
        let hostIdentifier = metadata.host.tagName.toLowerCase();
        if (metadata.host.id) {
          hostIdentifier += '#' + escapeCSSIdentifier(metadata.host.id);
        }
        
        return {
          foundInShadowDOM: true,
          shadowPath: metadata.path,
          shadowDepth: metadata.depth,
          shadowHostSelector: hostIdentifier,
          shadowRoot: currentNode
        };
      }
    }
    currentNode = currentNode.parentNode;
  }
  
  return {
    foundInShadowDOM: false,
    shadowPath: '',
    shadowDepth: 0,
    shadowHostSelector: '',
    shadowRoot: null
  };
};

