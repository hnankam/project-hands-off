import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

/**
 * Result type for verify selector operation
 */
interface VerifySelectorResult {
  status: 'success' | 'error';
  message: string;
  selectorInfo?: {
    isValid: boolean;
    foundInMainDOM: boolean;
    foundInShadowDOM: boolean;
    elementCount: number;
    shadowHosts: string[];
    elementDetails: {
      tag: string;
      text: string;
      id: string;
      className: string;
      foundInShadowDOM: boolean;
      shadowHost: string | null;
    }[];
  };
}

/**
 * Verify if a CSS selector is valid and can find elements in DOM or Shadow DOM
 * @param cssSelector - A CSS selector string to validate
 * @returns Promise with validation results and element information
 */
export async function handleVerifySelector(cssSelector: string): Promise<VerifySelectorResult> {
  try {
    debug.log('[VerifySelector] Verifying selector:', cssSelector);
    if (!cssSelector || cssSelector.trim().length === 0) {
      return {
        status: 'error',
        message: 'Empty CSS selector provided',
      };
    }

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    // Execute script in content page to validate the selector (with timeout)
    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (selector: string): any => {
        try {
          const elementDetails: any[] = [];
          const shadowHosts: string[] = [];
          let foundInMainDOM = false;
          let foundInShadowDOM = false;
          let totalElementCount = 0;

          // Helper: Parse and query shadow DOM selectors with >> notation
          const querySelectorWithShadowDOM = (selector: string): Element[] => {
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
          };

          // First, check if selector is syntactically valid by trying to use it
          try {
            // Test selector validity by attempting to parse and use it
            querySelectorWithShadowDOM(selector);
          } catch (selectorError) {
            return {
              success: false,
              message: `Invalid CSS selector syntax: "${selector}". Error: ${(selectorError as Error).message}`,
              selectorInfo: {
                isValid: false,
                foundInMainDOM: false,
                foundInShadowDOM: false,
                elementCount: 0,
                shadowHosts: [],
                elementDetails: [],
              },
            };
          }

          // Use the shadow-aware query helper
          const elements = querySelectorWithShadowDOM(selector);
          totalElementCount = elements.length;
          
          // Determine if elements are in shadow DOM based on selector syntax
          const isShadowDOMSelector = selector.includes(' >> ');
          
          if (elements.length > 0) {
            if (isShadowDOMSelector) {
              foundInShadowDOM = true;
              // Extract shadow path for display
              const shadowPath = selector.split(' >> ')[0].trim();
              shadowHosts.push(shadowPath);
            } else {
              foundInMainDOM = true;
            }

            // Collect details for first few elements (limit to avoid overwhelming response)
            const elementsToProcess = Math.min(elements.length, 5);
            for (let i = 0; i < elementsToProcess; i++) {
              const element = elements[i];
              elementDetails.push({
                tag: element.tagName,
                text: (element.textContent || '').trim().substring(0, 100),
                id: element.id || '',
                className: element.className || '',
                foundInShadowDOM: isShadowDOMSelector,
                shadowHost: isShadowDOMSelector ? selector.split(' >> ')[0].trim() : null,
              });
            }
          }

          const isValid = elements.length > 0;

          let message = '';
          if (isValid) {
            if (isShadowDOMSelector) {
              message = `Selector is valid and found ${totalElementCount} element(s) in Shadow DOM`;
            } else {
              message = `Selector is valid and found ${totalElementCount} element(s) in main DOM`;
            }
          } else {
            message = `Selector is valid but found no elements. Please check if the element exists or use a different selector.`;
          }

          return {
            success: isValid,
            message,
            selectorInfo: {
              isValid,
              foundInMainDOM,
              foundInShadowDOM,
              elementCount: totalElementCount,
              shadowHosts,
              elementDetails,
            },
          };
        } catch (error) {
          return {
            success: false,
            message: `Error validating selector: "${selector}". Error: ${(error as Error).message || 'Unknown error'}`,
            selectorInfo: {
              isValid: false,
              foundInMainDOM: false,
              foundInShadowDOM: false,
              elementCount: 0,
              shadowHosts: [],
              elementDetails: [],
            },
          };
        }
      },
      args: [cssSelector] as [string],
    });

    const results = await Promise.race([
      execPromise,
      new Promise<any>(resolve =>
        setTimeout(() => resolve([{ result: { success: false, message: 'Timeout while verifying selector' } }]), 8000),
      ),
    ]);

    if (results && results[0]?.result) {
      const result = results[0].result;
      if (result.success && result.selectorInfo) {
        return {
          status: 'success',
          message: result.message,
          selectorInfo: result.selectorInfo,
        };
      } else {
        return {
          status: 'error',
          message: result.message,
          selectorInfo: result.selectorInfo,
        };
      }
    }

    return {
      status: 'error',
      message: 'Unable to verify selector',
    };
  } catch (error) {
    debug.error('[VerifySelector] Error verifying selector:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
