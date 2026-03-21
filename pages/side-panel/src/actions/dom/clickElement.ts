import { debug as baseDebug } from '@extension/shared';
import { assertExtensionContext } from '@src/utils/extensionOnly';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Timeout for click operation in milliseconds */
const CLICK_TIMEOUT_MS = 8000;

/**
 * Timeout for duplicate injection prevention in milliseconds.
 * Must be longer than the full click operation:
 * - Cursor animation: ~800ms (30 steps × 20ms + 200ms delay)
 * - Highlight duration: 800ms
 * - Ripple duration: 1000ms
 * - Buffer: 400ms
 * Total: ~3000ms minimum
 */
const INJECTION_LOCK_TIMEOUT_MS = 5000;

/** Duration to show highlight before clicking in milliseconds */
const HIGHLIGHT_DURATION_MS = 800;

/** Duration to show ripple effect in milliseconds */
const RIPPLE_DURATION_MS = 1000;

/** Cursor animation settings */
const CURSOR_ANIMATION = {
  steps: 30,
  stepDuration: 20,
  newCursorDelay: 200,
  existingCursorDelay: 0,
} as const;

/** Log prefix for click actions */
const LOG_PREFIX = '[ClickElement]';

/**
 * Handler-level pending operations map.
 * Prevents duplicate calls before content script lock is set.
 * Key: normalized selector, Value: Promise of the operation
 */
const pendingClickOperations = new Map<string, Promise<ClickElementResult>>();

// ============================================================================
// TYPES
// ============================================================================

/** Timestamp helper for consistent logging */
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/** Timestamped debug wrappers */
const debug = {
  log: (...args: unknown[]) => baseDebug.log(ts(), ...args),
  warn: (...args: unknown[]) => baseDebug.warn(ts(), ...args),
  error: (...args: unknown[]) => baseDebug.error(ts(), ...args),
} as const;

/**
 * Cursor state stored on window
 */
interface CopilotCursorState {
  lastX: number;
  lastY: number;
  hideTimeout: ReturnType<typeof setTimeout> | null;
}

/**
 * Window with cursor state and injection locks
 */
interface WindowWithState extends Window {
  __copilotCursorState__?: CopilotCursorState;
  [key: `__copilotClickInjected_${string}`]: boolean | undefined;
}

/**
 * Internal result from content script
 */
interface ScriptClickResult {
  success: boolean;
  message: string;
  elementInfo?: {
    tag: string;
    text: string;
    id: string;
    href: string | null;
    foundInShadowDOM: boolean;
    shadowHost: string | null;
    clickedActualElement?: boolean;
    actualElementTag?: string;
  };
}

/**
 * Script execution result from chrome.scripting.executeScript
 */
interface ScriptExecutionResult {
  result?: ScriptClickResult;
}

/**
 * Result type for click element operation
 */
export interface ClickElementResult {
  status: 'success' | 'error';
  message: string;
  elementInfo?: {
    tag: string;
    text: string;
    id: string;
    href: string | null;
    foundInShadowDOM: boolean;
    shadowHost: string | null;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Create a timeout promise for click operation
 */
function createTimeoutPromise(): Promise<ScriptExecutionResult[]> {
  return new Promise(resolve =>
    setTimeout(
      () =>
        resolve([
          {
            result: {
              success: false,
              message: 'Timeout while clicking element',
            },
          },
        ]),
      CLICK_TIMEOUT_MS,
    ),
  );
}

/**
 * Type guard to check if script result is valid
 */
function isValidScriptResult(
  results: ScriptExecutionResult[] | undefined,
): results is [ScriptExecutionResult, ...ScriptExecutionResult[]] {
  return Array.isArray(results) && results.length > 0 && results[0]?.result !== undefined;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Click on a specific element on the current web page
 * @param cssSelector - A valid CSS selector string extracted from the pageHTML
 * @param autoMoveCursor - Whether to automatically move the cursor to the element before clicking
 * @returns Promise with status and message object
 */
export async function handleClickElement(
  cssSelector: string,
  autoMoveCursor: boolean = true,
): Promise<ClickElementResult> {
  assertExtensionContext('Click element');
  // Validate input
  if (!cssSelector || cssSelector.trim().length === 0) {
    return { status: 'error', message: 'Empty CSS selector provided' };
  }

  // Normalize selector for deduplication key
  const normalizedSelector = cssSelector.trim();

  // Check for pending operation on the same selector (handler-level deduplication)
  const pendingOperation = pendingClickOperations.get(normalizedSelector);
  if (pendingOperation) {
    debug.log(
      LOG_PREFIX,
      'Duplicate click request detected, returning pending operation result for:',
      normalizedSelector,
    );
    return pendingOperation;
  }

  // Create and track the operation
  const operationPromise = executeClickOperation(normalizedSelector, autoMoveCursor);
  pendingClickOperations.set(normalizedSelector, operationPromise);

  try {
    const result = await operationPromise;
    return result;
  } finally {
    // Always clean up the pending operation
    pendingClickOperations.delete(normalizedSelector);
  }
}

/**
 * Internal function to execute the click operation
 */
async function executeClickOperation(cssSelector: string, autoMoveCursor: boolean): Promise<ClickElementResult> {
  try {
    debug.log(LOG_PREFIX, 'Clicking element with selector:', cssSelector, 'autoMoveCursor:', autoMoveCursor);

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;

    if (!tabId) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    // Execute script in content page to find and click the element
    const execPromise = chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (
        selector: string,
        moveCursor: boolean,
        injectionLockTimeout: number,
        highlightDuration: number,
        rippleDuration: number,
        cursorAnimation: { steps: number; stepDuration: number; newCursorDelay: number; existingCursorDelay: number },
      ): ScriptClickResult | Promise<ScriptClickResult> => {
        const win = window as unknown as WindowWithState;

        // Prevent duplicate injection for the same selector
        const injectionKey = `__copilotClickInjected_${selector}` as const;
        if (win[injectionKey]) {
          console.log('[ClickElement] Duplicate click prevented for selector:', selector);
          return {
            success: true,
            message: 'Click already in progress for this element. Duplicate request ignored.',
            elementInfo: undefined, // No element info since we didn't click
          };
        }
        win[injectionKey] = true;

        // Clear lock after operation completes (longer than actual operation to be safe)
        setTimeout(() => {
          delete win[injectionKey];
          console.log('[ClickElement] Injection lock released for selector:', selector);
        }, injectionLockTimeout);

        try {
          // Helper: Parse and query shadow DOM selectors with >> notation
          const querySelectorWithShadowDOM = (sel: string): Element | null => {
            if (!sel.includes(' >> ')) {
              return document.querySelector(sel);
            }

            const parts = sel.split(' >> ');
            if (parts.length !== 2) {
              throw new Error(
                `Invalid shadow DOM selector format. Expected "shadowPath >> elementSelector", got: ${sel}`,
              );
            }

            const shadowPath = parts[0].trim();
            const elementSelector = parts[1].trim();

            const pathSegments = shadowPath
              .split(' > ')
              .map(s => s.trim())
              .filter(s => s && s !== 'document');

            if (pathSegments.length === 0) {
              throw new Error(`Shadow path must contain at least one element, got: ${shadowPath}`);
            }

            let currentRoot: Document | ShadowRoot = document;

            for (const segment of pathSegments) {
              const hostElement: Element | null = currentRoot.querySelector(segment);

              if (!hostElement) {
                throw new Error(`Shadow host not found: ${segment} in path ${shadowPath}`);
              }

              if (!hostElement.shadowRoot) {
                throw new Error(`Element ${segment} does not have a shadow root in path ${shadowPath}`);
              }

              currentRoot = hostElement.shadowRoot;
            }

            return currentRoot.querySelector(elementSelector);
          };

          // Helper: iterate through ancestors, including across shadow boundaries
          const forEachAncestor = (start: Element, cb: (el: Element) => void): void => {
            let node: Element | null = start;
            const visited = new Set<Element>();
            while (node && !visited.has(node)) {
              visited.add(node);
              cb(node);
              const rootNode = node.getRootNode() as ShadowRoot | Document;
              const maybeHost = 'host' in rootNode ? (rootNode as ShadowRoot).host : null;
              if (maybeHost && maybeHost !== node) {
                node = maybeHost;
              } else {
                node = node.parentElement;
              }
            }
          };

          // Utility: determine if an element is inherently interactive/clickable
          const isPotentiallyClickable = (el: Element | null): boolean => {
            if (!el) return false;
            const htmlEl = el as HTMLElement;
            const tag = el.tagName.toLowerCase();
            const attr = (name: string) => htmlEl.getAttribute?.(name);
            const has = (name: string) => htmlEl.hasAttribute?.(name);
            const role = attr('role') || '';
            const tabindex = Number(htmlEl.getAttribute('tabindex') || 'NaN');
            const style = htmlEl.style?.pointerEvents || '';
            if (style === 'none') return false;

            const interactiveTags = new Set([
              'a',
              'button',
              'input',
              'textarea',
              'select',
              'option',
              'summary',
              'label',
              'details',
            ]);
            if (interactiveTags.has(tag)) return true;
            if (tag === 'a' && !!(el as HTMLAnchorElement).href) return true;
            if (has('onclick')) return true;
            if (has('aria-haspopup') || has('aria-controls')) return true;
            if (!Number.isNaN(tabindex) && tabindex >= 0) return true;
            if (/^(button|link|menuitem|tab|checkbox|radio|switch)$/i.test(role)) return true;
            return false;
          };

          // Utility: walk up to the best clickable ancestor
          const getBestClickableTarget = (start: Element): HTMLElement => {
            let el: Element | null = start;
            const interactiveSelector = [
              'a[href]',
              'button',
              'input:not([type="hidden"])',
              'textarea',
              'select',
              '[role="button"]',
              '[role="link"]',
              '[onclick]',
              '[tabindex]',
            ].join(',');
            const nearest = (start as HTMLElement).closest(interactiveSelector) as HTMLElement | null;
            if (nearest) return nearest;
            while (el && el !== document.body && !isPotentiallyClickable(el)) el = el.parentElement;
            return (el as HTMLElement) || (start as HTMLElement);
          };

          // Test selector validity
          try {
            querySelectorWithShadowDOM(selector);
          } catch (selectorError) {
            return {
              success: false,
              message: `Invalid CSS selector syntax: "${selector}". Error: ${getErrorMessage(selectorError)}`,
            };
          }

          // Find element using shadow-aware query
          const element = querySelectorWithShadowDOM(selector);
          const foundInShadowDOM = selector.includes(' >> ');
          const shadowHostInfo = foundInShadowDOM ? selector.split(' >> ')[0].trim() : '';

          if (!element) {
            console.log('[ClickElement] No element found with selector:', selector);
            return {
              success: false,
              message: `No element found with selector: "${selector}". Please analyze the HTML and provide a valid CSS selector.`,
            };
          }

          const targetElement = element;

          // Check if element is visible
          const computedStyle = window.getComputedStyle(targetElement);
          if (
            computedStyle.display === 'none' ||
            computedStyle.visibility === 'hidden' ||
            computedStyle.opacity === '0'
          ) {
            console.log('[ClickElement] Element found but is hidden:', selector);
            return {
              success: false,
              message: `Element found but is hidden: "${selector}"`,
            };
          }

          // Scroll into view
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

          // Return promise that resolves after click completes
          return new Promise<ScriptClickResult>(resolve => {
            const performClick = (): void => {
              const htmlTarget = targetElement as HTMLElement;
              const originalStyle = htmlTarget.style.cssText;

              // Brief highlight before clicking
              htmlTarget.style.cssText += `
                outline: 3px solid #FF5722 !important;
                outline-offset: 4px !important;
                background-color: rgba(255, 87, 34, 0.1) !important;
              `;

              setTimeout(() => {
                htmlTarget.style.cssText = originalStyle;
                htmlTarget.focus();

                // Verify what element is actually at the target position
                const rect = targetElement.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const actualElementAtPoint = document.elementFromPoint(centerX, centerY);

                let elementToClick: Element = targetElement;
                let clickNote = '';

                if (actualElementAtPoint && actualElementAtPoint !== targetElement) {
                  const isChild = targetElement.contains(actualElementAtPoint);
                  const isParent = actualElementAtPoint.contains(targetElement);

                  if (isChild) {
                    elementToClick = actualElementAtPoint;
                    clickNote = ' [clicked child at cursor position]';
                    console.log('[ClickElement] Clicking child element at cursor:', {
                      selectorTarget: targetElement.tagName + (targetElement.id ? '#' + targetElement.id : ''),
                      actualAtPoint:
                        actualElementAtPoint.tagName + (actualElementAtPoint.id ? '#' + actualElementAtPoint.id : ''),
                    });
                  } else if (isParent) {
                    elementToClick = targetElement;
                    clickNote = ' [kept target, more specific than parent]';
                    console.log('[ClickElement] Keeping target (more specific):', {
                      selectorTarget: targetElement.tagName + (targetElement.id ? '#' + targetElement.id : ''),
                      parentAtPoint:
                        actualElementAtPoint.tagName + (actualElementAtPoint.id ? '#' + actualElementAtPoint.id : ''),
                    });
                  } else {
                    clickNote = ' [WARNING: different element at cursor]';
                    console.warn('[ClickElement] Different element at cursor position:', {
                      selectorTarget: targetElement.tagName + (targetElement.id ? '#' + targetElement.id : ''),
                      actualAtPoint:
                        actualElementAtPoint.tagName + (actualElementAtPoint.id ? '#' + actualElementAtPoint.id : ''),
                    });
                  }
                }

                // Enhanced clicking for modern web apps
                const clickElement = (el: Element): void => {
                  const primaryTarget = getBestClickableTarget(el) || (el as HTMLElement);
                  const htmlEl = primaryTarget as HTMLElement;
                  let finalTarget: HTMLElement = htmlEl;

                  // If the element is a label tied to a control, prefer the control
                  if (htmlEl.tagName.toLowerCase() === 'label') {
                    const forId = htmlEl.getAttribute('for');
                    if (forId) {
                      const ctrl = document.getElementById(forId) as HTMLElement | null;
                      if (ctrl) finalTarget = ctrl;
                    }
                  }

                  const elRect = finalTarget.getBoundingClientRect();
                  const x = elRect.left + elRect.width / 2;
                  const y = elRect.top + elRect.height / 2;

                  // Create comprehensive event sequence
                  const events: Event[] = [
                    new PointerEvent('pointerover', {
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      clientX: x,
                      clientY: y,
                      pointerType: 'mouse',
                    }),
                    new MouseEvent('mouseenter', {
                      view: window,
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      clientX: x,
                      clientY: y,
                    }),
                    new MouseEvent('mouseover', {
                      view: window,
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      clientX: x,
                      clientY: y,
                    }),
                    new FocusEvent('focus', { bubbles: true, cancelable: true }),
                    new PointerEvent('pointerdown', {
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      clientX: x,
                      clientY: y,
                      pointerType: 'mouse',
                      button: 0,
                    }),
                    new MouseEvent('mousedown', {
                      view: window,
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      clientX: x,
                      clientY: y,
                      button: 0,
                    }),
                    new PointerEvent('pointerup', {
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      clientX: x,
                      clientY: y,
                      pointerType: 'mouse',
                      button: 0,
                    }),
                    new MouseEvent('mouseup', {
                      view: window,
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      clientX: x,
                      clientY: y,
                      button: 0,
                    }),
                    new MouseEvent('click', {
                      view: window,
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      clientX: x,
                      clientY: y,
                      button: 0,
                    }),
                  ];

                  events.forEach(event => finalTarget.dispatchEvent(event));
                };

                clickElement(elementToClick);

                // Visual feedback for click
                const clickFeedback = document.createElement('div');
                clickFeedback.style.cssText = `
                  position: fixed;
                  left: ${rect.left + rect.width / 2 - 15}px;
                  top: ${rect.top + rect.height / 2 - 15}px;
                  width: 30px;
                  height: 30px;
                  border: 3px solid #FF5722;
                  border-radius: 50%;
                  pointer-events: none;
                  z-index: 999999;
                  animation: clickRipple 0.6s ease-out;
                `;

                document.body.appendChild(clickFeedback);

                setTimeout(() => {
                  clickFeedback.remove();

                  const successResult: ScriptClickResult = {
                    success: true,
                    message: `Clicked: "${(elementToClick.textContent || elementToClick.tagName).substring(0, 50)}"${clickNote}${foundInShadowDOM ? ` (in Shadow DOM: ${shadowHostInfo})` : ''}`,
                    elementInfo: {
                      tag: elementToClick.tagName,
                      text: (elementToClick.textContent || '').trim().substring(0, 100),
                      id: elementToClick.id || '',
                      href: (elementToClick as HTMLAnchorElement).href || null,
                      foundInShadowDOM: foundInShadowDOM,
                      shadowHost: foundInShadowDOM ? shadowHostInfo : null,
                      clickedActualElement: elementToClick !== targetElement,
                      actualElementTag: elementToClick !== targetElement ? elementToClick.tagName : undefined,
                    },
                  };
                  console.log('[ClickElement] Returning success result:', successResult);
                  resolve(successResult);
                }, rippleDuration);
              }, highlightDuration);
            };

            // Move cursor to element if requested, then perform click
            if (moveCursor) {
              try {
                // Get or create cursor tracking object
                if (!win.__copilotCursorState__) {
                  win.__copilotCursorState__ = {
                    lastX: window.innerWidth / 2,
                    lastY: window.innerHeight / 2,
                    hideTimeout: null,
                  };
                }
                const cursorState = win.__copilotCursorState__;

                // Clear any existing hide timeout
                if (cursorState.hideTimeout) {
                  clearTimeout(cursorState.hideTimeout);
                  cursorState.hideTimeout = null;
                }

                // Get or create cursor element
                let cursor = document.getElementById('__copilot_cursor_indicator__') as HTMLDivElement | null;
                let isNewCursor = false;

                if (!cursor) {
                  isNewCursor = true;
                  cursor = document.createElement('div');
                  cursor.id = '__copilot_cursor_indicator__';
                  cursor.style.cssText = `
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 24px !important;
                    height: 24px !important;
                    background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234CAF50"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>') no-repeat !important;
                    background-size: contain !important;
                    pointer-events: none !important;
                    z-index: 2147483647 !important;
                    transition: all 0.3s ease !important;
                    transform: translate(-50%, -50%) !important;
                    filter: drop-shadow(0 0 8px rgba(76, 175, 80, 0.8)) !important;
                  `;
                  document.body.appendChild(cursor);
                }

                // Ensure cursor style element exists
                let cursorStyleEl = document.getElementById('__copilot_cursor_style__');
                if (!cursorStyleEl) {
                  cursorStyleEl = document.createElement('style');
                  cursorStyleEl.id = '__copilot_cursor_style__';
                  cursorStyleEl.textContent = `
                    @keyframes copilotPulse {
                      0%, 100% { 
                        transform: translate(-50%, -50%) scale(1); 
                        filter: drop-shadow(0 0 8px rgba(76, 175, 80, 0.8));
                      }
                      50% { 
                        transform: translate(-50%, -50%) scale(1.3); 
                        filter: drop-shadow(0 0 12px rgba(76, 175, 80, 1));
                      }
                    }
                    @keyframes copilotFadeOut {
                      0% { 
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1);
                      }
                      100% { 
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.5);
                      }
                    }
                  `;
                  document.head.appendChild(cursorStyleEl);
                }

                // Get element position
                const rect = targetElement.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                // Animate cursor to element position
                const animateCursor = (): void => {
                  const stepX = (centerX - cursorState.lastX) / cursorAnimation.steps;
                  const stepY = (centerY - cursorState.lastY) / cursorAnimation.steps;
                  let step = 0;

                  const moveStep = (): void => {
                    if (step < cursorAnimation.steps) {
                      cursorState.lastX += stepX;
                      cursorState.lastY += stepY;

                      // Add slight randomness for natural movement
                      const randomX = (Math.random() - 0.5) * 2;
                      const randomY = (Math.random() - 0.5) * 2;

                      cursor!.style.left = cursorState.lastX + randomX + 'px';
                      cursor!.style.top = cursorState.lastY + randomY + 'px';
                      cursor!.style.opacity = '1';
                      cursor!.style.animation = 'none';

                      // Dispatch mousemove to trigger hover effects
                      const elemUnderCursor = document.elementFromPoint(cursorState.lastX, cursorState.lastY);
                      if (elemUnderCursor) {
                        forEachAncestor(elemUnderCursor, target => {
                          target.dispatchEvent(
                            new MouseEvent('mousemove', {
                              view: window,
                              bubbles: true,
                              cancelable: true,
                              composed: true,
                              clientX: cursorState.lastX,
                              clientY: cursorState.lastY,
                            }),
                          );
                        });
                      }

                      step++;
                      setTimeout(moveStep, cursorAnimation.stepDuration);
                    } else {
                      // Final position
                      cursorState.lastX = centerX;
                      cursorState.lastY = centerY;
                      cursor!.style.left = centerX + 'px';
                      cursor!.style.top = centerY + 'px';
                      cursor!.style.animation = 'copilotPulse 1.2s ease-in-out infinite';

                      // Trigger hover effects at final position
                      const elemAtCursor = document.elementFromPoint(centerX, centerY);
                      if (elemAtCursor) {
                        forEachAncestor(elemAtCursor, target => {
                          target.dispatchEvent(
                            new PointerEvent('pointerover', {
                              bubbles: true,
                              cancelable: true,
                              composed: true,
                              clientX: centerX,
                              clientY: centerY,
                              pointerType: 'mouse',
                            }),
                          );
                          target.dispatchEvent(
                            new MouseEvent('mouseenter', {
                              view: window,
                              bubbles: true,
                              cancelable: true,
                              composed: true,
                              clientX: centerX,
                              clientY: centerY,
                            }),
                          );
                          target.dispatchEvent(
                            new MouseEvent('mouseover', {
                              view: window,
                              bubbles: true,
                              cancelable: true,
                              composed: true,
                              clientX: centerX,
                              clientY: centerY,
                            }),
                          );
                        });
                      }

                      performClick();
                    }
                  };

                  moveStep();
                };

                // Start cursor animation with delay for new cursor
                setTimeout(
                  animateCursor,
                  isNewCursor ? cursorAnimation.newCursorDelay : cursorAnimation.existingCursorDelay,
                );
              } catch (cursorError) {
                console.log('[ClickElement] Cursor movement error:', cursorError);
                performClick();
              }
            } else {
              performClick();
            }

            // Ensure animation style exists
            let styleEl = document.getElementById('__copilot_click_ripple_style__');
            if (!styleEl) {
              styleEl = document.createElement('style');
              styleEl.id = '__copilot_click_ripple_style__';
              styleEl.textContent = `
                @keyframes clickRipple {
                  0% { transform: scale(0.5); opacity: 1; }
                  100% { transform: scale(2); opacity: 0; }
                }
              `;
              document.head.appendChild(styleEl);
            }
          });
        } catch (error) {
          console.log('[ClickElement] Unexpected error:', selector, error);
          return {
            success: false,
            message: `Unexpected error while clicking element: "${selector}". Error: ${getErrorMessage(error)}`,
          };
        }

        // Helper function for error message (inline for content script context)
        function getErrorMessage(err: unknown): string {
          return err instanceof Error ? err.message : 'Unknown error';
        }
      },
      args: [
        cssSelector,
        autoMoveCursor,
        INJECTION_LOCK_TIMEOUT_MS,
        HIGHLIGHT_DURATION_MS,
        RIPPLE_DURATION_MS,
        CURSOR_ANIMATION,
      ] as const,
    });

    const results = await Promise.race([execPromise, createTimeoutPromise()]);

    if (!isValidScriptResult(results)) {
      return {
        status: 'error',
        message: 'Unable to click element',
      };
    }

    const result = results[0].result;
    debug.log(LOG_PREFIX, 'Raw result from content script:', result);

    if (result?.success && result.elementInfo) {
      const info = result.elementInfo;
      debug.log(LOG_PREFIX, 'Returning success with element info:', info);
      return {
        status: 'success',
        message: result.message,
        elementInfo: {
          tag: info.tag,
          text: info.text || '',
          id: info.id || '',
          href: info.href,
          foundInShadowDOM: info.foundInShadowDOM,
          shadowHost: info.shadowHost,
        },
      };
    }

    debug.log(LOG_PREFIX, 'Returning error - success:', result?.success, 'message:', result?.message);
    return {
      status: 'error',
      message: `${result?.message ?? 'Unknown error'}\n\nTry being more specific or use a different description.`,
    };
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error clicking element:', error);
    return {
      status: 'error',
      message: `Error: ${getErrorMessage(error)}`,
    };
  }
}
