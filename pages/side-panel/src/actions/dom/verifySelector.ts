/**
 * Verify Selector Action
 *
 * Validates CSS selectors and checks if they can find elements in DOM or Shadow DOM.
 */

import { debug as baseDebug } from '@extension/shared';
import { QUERY_SELECTOR_SHADOW_DOM_CODE } from './shadowDOMHelper';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[VerifySelector]';

/** Timeout for script execution in ms */
const SCRIPT_TIMEOUT_MS = 8000;

/** Maximum text content length to return */
const MAX_TEXT_LENGTH = 100;

/** Maximum number of elements to process */
const MAX_ELEMENTS_TO_PROCESS = 5;

// ============================================================================
// DEBUG HELPERS
// ============================================================================

const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: unknown[]) => baseDebug.log(ts(), ...args),
  warn: (...args: unknown[]) => baseDebug.warn(ts(), ...args),
  error: (...args: unknown[]) => baseDebug.error(ts(), ...args),
} as const;

// ============================================================================
// TYPES
// ============================================================================

/** Details about a found element */
interface ElementDetails {
  tag: string;
  text: string;
  id: string;
  className: string;
  foundInShadowDOM: boolean;
  shadowHost: string | null;
}

/** Information about selector validation */
interface SelectorInfo {
  isValid: boolean;
  foundInMainDOM: boolean;
  foundInShadowDOM: boolean;
  elementCount: number;
  shadowHosts: string[];
  elementDetails: ElementDetails[];
}

/** Result type for verify selector operation */
export interface VerifySelectorResult {
  status: 'success' | 'error';
  message: string;
  selectorInfo?: SelectorInfo;
}

/** Script execution result shape */
interface ScriptVerifyResult {
  success: boolean;
  message: string;
  selectorInfo?: SelectorInfo;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Create a timeout promise for Promise.race
 */
function createTimeoutPromise<T>(ms: number, fallbackValue: T): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(fallbackValue), ms));
}

/**
 * Type guard for valid script result
 */
function isValidScriptResult(result: unknown): result is { result: ScriptVerifyResult } {
  return (
    result !== null &&
    typeof result === 'object' &&
    'result' in result &&
    result.result !== null &&
    typeof result.result === 'object'
  );
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Verify if a CSS selector is valid and can find elements in DOM or Shadow DOM
 *
 * @param cssSelector - A CSS selector string to validate
 * @returns Promise with validation results and element information
 *
 * @example
 * // Verify a simple selector
 * await handleVerifySelector('#my-button')
 *
 * // Verify a shadow DOM selector
 * await handleVerifySelector('document > x-app >> #my-button')
 */
export async function handleVerifySelector(cssSelector: string): Promise<VerifySelectorResult> {
  try {
    debug.log(LOG_PREFIX, 'Verifying selector:', cssSelector);

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

    // Execute script in content page to validate the selector
    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (selector: string, maxTextLen: number, maxElements: number, shadowHelperCode: string) => {
        // Inject shadow DOM helpers
        // eslint-disable-next-line no-eval
        eval(shadowHelperCode);

        // Access injected functions
        const querySelectorAllWithShadowDOM = (
          window as unknown as { querySelectorAllWithShadowDOM: (sel: string) => Element[] }
        ).querySelectorAllWithShadowDOM;

        try {
          interface ElementDetailItem {
            tag: string;
            text: string;
            id: string;
            className: string;
            foundInShadowDOM: boolean;
            shadowHost: string | null;
          }

          const elementDetails: ElementDetailItem[] = [];
          const shadowHosts: string[] = [];
          let foundInMainDOM = false;
          let foundInShadowDOM = false;
          let totalElementCount = 0;

          // First, check if selector is syntactically valid
          try {
            querySelectorAllWithShadowDOM(selector);
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

          // Query elements using the shadow-aware helper
          const elements = querySelectorAllWithShadowDOM(selector);
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

            // Collect details for first few elements
            const elementsToProcess = Math.min(elements.length, maxElements);
            for (let i = 0; i < elementsToProcess; i++) {
              const element = elements[i];
              elementDetails.push({
                tag: element.tagName,
                text: (element.textContent || '').trim().substring(0, maxTextLen),
                id: element.id || '',
                className: typeof element.className === 'string' ? element.className : '',
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
      args: [cssSelector, MAX_TEXT_LENGTH, MAX_ELEMENTS_TO_PROCESS, QUERY_SELECTOR_SHADOW_DOM_CODE] as [
        string,
        number,
        number,
        string,
      ],
    });

    const timeoutFallback = [
      { result: { success: false, message: 'Timeout while verifying selector' } as ScriptVerifyResult },
    ];
    const results = await Promise.race([execPromise, createTimeoutPromise(SCRIPT_TIMEOUT_MS, timeoutFallback)]);

    if (results && results[0] && isValidScriptResult(results[0])) {
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
    debug.error(LOG_PREFIX, 'Error verifying selector:', error);
    return {
      status: 'error',
      message: `Error: ${getErrorMessage(error)}`,
    };
  }
}
