/**
 * @fileoverview Shadow DOM Utilities for Chrome Extension
 *
 * Provides utilities for working with Shadow DOM, including:
 * - Building shadow root maps for efficient traversal
 * - Recursively collecting elements across shadow boundaries
 * - Finding shadow root metadata for elements
 *
 * Key Features:
 * - Single-pass shadow root mapping (O(n) complexity)
 * - Cached shadow root lookups for performance
 * - Shadow path tracking for debugging
 * - Depth tracking for nested shadow roots
 *
 * @module content/shadow-dom
 */

import { escapeCSSIdentifier } from './selector-generator';

/**
 * Shadow root metadata
 */
export interface ShadowRootMetadata {
  host: Element;
  depth: number;
  path: string;
}

/**
 * Build a complete map of all shadow roots in the document
 * 
 * This function performs a single-pass traversal of the DOM to build a map
 * of all shadow roots with their metadata. This map can then be reused for
 * efficient shadow DOM queries.
 * 
 * Performance: O(n) where n = total DOM nodes
 * 
 * @param root - The root element to start traversal from
 * @param depth - Current depth in shadow root hierarchy
 * @param parentPath - Path string for debugging
 * @param shadowRootMap - Map to populate with shadow root metadata
 * 
 * @example
 * const shadowRootMap = new Map();
 * buildShadowRootMap(document, 0, 'document', shadowRootMap);
 * console.log(`Found ${shadowRootMap.size} shadow roots`);
 */
export function buildShadowRootMap(
  root: Document | ShadowRoot | Element,
  depth: number = 0,
  parentPath: string = 'document',
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata> = new Map()
): Map<ShadowRoot, ShadowRootMetadata> {
  const elements = root.querySelectorAll('*');
  
  for (const element of Array.from(elements)) {
    if (element.shadowRoot && !shadowRootMap.has(element.shadowRoot)) {
      // Build host identifier with proper CSS escaping
      let hostIdentifier = element.tagName.toLowerCase();
      
      // Add ID if present (with proper escaping for special characters)
      if (element.id) {
        hostIdentifier += '#' + escapeCSSIdentifier(element.id);
      }
      
      // Add up to 2 classes if present (with proper escaping)
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
      buildShadowRootMap(element.shadowRoot, depth + 1, currentPath, shadowRootMap);
    }
  }
  
  return shadowRootMap;
}

/**
 * Collect elements matching a selector across shadow DOM boundaries
 * 
 * This function queries both the main DOM and all shadow DOMs for elements
 * matching the given selector. It uses a cached shadow root map for efficiency.
 * 
 * Performance: O(m*s) where m = selector complexity, s = number of shadow roots
 * 
 * @param selector - CSS selector to match
 * @param root - Root element to start from (document or shadowRoot)
 * @param shadowRootMap - Cached map of shadow roots
 * @returns Array of matching elements
 * 
 * @example
 * const shadowRootMap = buildShadowRootMap(document);
 * const buttons = collectElementsRecursively('button', document, shadowRootMap);
 * console.log(`Found ${buttons.length} buttons across all shadow DOMs`);
 */
export function collectElementsRecursively(
  selector: string,
  root: Document | ShadowRoot | Element = document,
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata>
): Element[] {
  const elements: Element[] = [];
  
  // Collect from current root
  try {
    elements.push(...Array.from(root.querySelectorAll(selector)));
  } catch (e) {
    // Skip invalid selectors
  }
  
  // Use cached map for shadow roots (fast lookup)
  if (root === document) {
    // Only traverse shadow roots if querying from document root
    for (const shadowRoot of shadowRootMap.keys()) {
      try {
        elements.push(...Array.from(shadowRoot.querySelectorAll(selector)));
      } catch (e) {
        // Skip invalid selectors
      }
    }
  }
  
  return elements;
}

/**
 * Find the shadow root that contains a given element
 * 
 * @param element - Element to find shadow root for
 * @param shadowRootMap - Cached map of shadow roots
 * @returns Shadow root metadata if found, null otherwise
 * 
 * @example
 * const metadata = findShadowRoot(element, shadowRootMap);
 * if (metadata) {
 *   console.log(`Element is in shadow root at depth ${metadata.depth}`);
 *   console.log(`Path: ${metadata.path}`);
 * }
 */
export function findShadowRoot(
  element: Element,
  shadowRootMap: Map<ShadowRoot, ShadowRootMetadata>
): ShadowRootMetadata | null {
  // Walk up the DOM tree to find a shadow root
  let current: Node | null = element;
  
  while (current) {
    if (current.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      const shadowRoot = current as ShadowRoot;
      const metadata = shadowRootMap.get(shadowRoot);
      if (metadata) {
        return metadata;
      }
    }
    current = current.parentNode;
  }
  
  return null;
}

/**
 * Check if an element is inside a shadow DOM
 * 
 * @param element - Element to check
 * @returns True if element is inside a shadow DOM
 * 
 * @example
 * if (isInShadowDOM(element)) {
 *   console.log('Element is in shadow DOM');
 * }
 */
export function isInShadowDOM(element: Element): boolean {
  let current: Node | null = element;
  
  while (current) {
    if (current.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      return true;
    }
    current = current.parentNode;
  }
  
  return false;
}

/**
 * Get the root node for an element (document or shadowRoot)
 * 
 * @param element - Element to get root for
 * @returns Root node (Document or ShadowRoot)
 * 
 * @example
 * const root = getRootNode(element);
 * const allButtons = root.querySelectorAll('button');
 */
export function getRootNode(element: Element): Document | ShadowRoot {
  let current: Node | null = element;
  
  while (current.parentNode) {
    current = current.parentNode;
    if (current.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      return current as ShadowRoot;
    }
  }
  
  return document;
}

