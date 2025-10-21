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

          // First, check if selector is syntactically valid by trying to use it
          try {
            // Test selector validity by attempting to use it
            document.querySelector(selector);
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

          // Search in main DOM
          const mainDOMElements = document.querySelectorAll(selector);
          if (mainDOMElements.length > 0) {
            foundInMainDOM = true;
            totalElementCount += mainDOMElements.length;

            // Collect details for first few elements (limit to avoid overwhelming response)
            const elementsToProcess = Math.min(mainDOMElements.length, 5);
            for (let i = 0; i < elementsToProcess; i++) {
              const element = mainDOMElements[i];
              elementDetails.push({
                tag: element.tagName,
                text: (element.textContent || '').trim().substring(0, 100),
                id: element.id || '',
                className: element.className || '',
                foundInShadowDOM: false,
                shadowHost: null,
              });
            }
          }

          // Search in Shadow DOM
          const shadowRoots: ShadowRoot[] = [];

          // Find all shadow roots
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
            acceptNode: node => {
              const element = node as Element;
              if (element.shadowRoot) {
                shadowRoots.push(element.shadowRoot);
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          });

          // Walk the tree to find all shadow roots
          while (walker.nextNode()) {}

          // Search each shadow root
          for (const shadowRoot of shadowRoots) {
            try {
              const shadowElements = shadowRoot.querySelectorAll(selector);
              if (shadowElements.length > 0) {
                foundInShadowDOM = true;
                totalElementCount += shadowElements.length;

                // Get shadow host info
                const shadowHost = shadowRoot.host;
                const hostInfo = `${shadowHost.tagName}${shadowHost.id ? '#' + shadowHost.id : ''}${shadowHost.className ? '.' + shadowHost.className.split(' ')[0] : ''}`;

                if (!shadowHosts.includes(hostInfo)) {
                  shadowHosts.push(hostInfo);
                }

                // Collect details for first few shadow elements
                const elementsToProcess = Math.min(shadowElements.length, 3);
                for (let i = 0; i < elementsToProcess; i++) {
                  const element = shadowElements[i];
                  elementDetails.push({
                    tag: element.tagName,
                    text: (element.textContent || '').trim().substring(0, 100),
                    id: element.id || '',
                    className: element.className || '',
                    foundInShadowDOM: true,
                    shadowHost: hostInfo,
                  });
                }
              }
            } catch (shadowError) {
              // Ignore individual shadow DOM query errors
              console.log('[VerifySelector] Shadow DOM query error:', shadowError);
            }
          }

          const isValid = foundInMainDOM || foundInShadowDOM;

          let message = '';
          if (isValid) {
            const parts = [];
            if (foundInMainDOM) {
              const mainCount = document.querySelectorAll(selector).length;
              parts.push(`${mainCount} element(s) in main DOM`);
            }
            if (foundInShadowDOM) {
              const shadowCount = totalElementCount - (foundInMainDOM ? document.querySelectorAll(selector).length : 0);
              parts.push(`${shadowCount} element(s) in ${shadowHosts.length} shadow DOM(s)`);
            }
            message = `Selector is valid and found ${totalElementCount} total element(s): ${parts.join(', ')}`;
          } else {
            message = `Selector is valid but found no elements in main DOM or Shadow DOM. Please check if the element exists or use a different selector.`;
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
