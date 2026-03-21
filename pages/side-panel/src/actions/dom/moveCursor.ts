import { debug as baseDebug } from '@extension/shared';
import { assertExtensionContext } from '@src/utils/extensionOnly';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for move cursor actions */
const LOG_PREFIX = '[MoveCursor]';

/** Timeout for move cursor operation in milliseconds */
const MOVE_CURSOR_TIMEOUT_MS = 8000;

/**
 * Handler-level lock timeout in milliseconds.
 * Should cover: scroll (600ms) + delay (200ms) + animation (600ms) + buffer
 */
const HANDLER_LOCK_TIMEOUT_MS = 3000;

/** Content script lock timeout in milliseconds */
const CONTENT_LOCK_TIMEOUT_MS = 3000;

/** Animation settings */
const ANIMATION = {
  duration: 600,
  cursorDelayNew: 200,
  cursorDelayExisting: 0,
  highlightDuration: 5000,
  autoHideDelay: 300000,
  scrollWaitDelay: 600,
} as const;

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/** Timestamp helper for consistent logging */
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/** Timestamped debug wrappers */
const debug = {
  log: (...args: unknown[]) => baseDebug.log(ts(), ...args),
  warn: (...args: unknown[]) => baseDebug.warn(ts(), ...args),
  error: (...args: unknown[]) => baseDebug.error(ts(), ...args),
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result type for move cursor operation
 */
export interface MoveCursorResult {
  status: 'success' | 'error';
  message: string;
  elementInfo?: {
    tag: string;
    text: string;
    id: string;
    className: string;
    foundInShadowDOM: boolean;
    shadowHost: string | null;
  };
}

/**
 * Internal result from content script
 */
interface ScriptMoveCursorResult {
  success: boolean;
  message: string;
  elementInfo?: {
    tag: string;
    text: string;
    id: string;
    className: string;
    foundInShadowDOM: boolean;
    shadowHost: string | null;
  };
}

/**
 * Script execution result from chrome.scripting.executeScript
 */
interface ScriptExecutionResult {
  result?: ScriptMoveCursorResult;
}

/**
 * Lock entry for tracking in-flight requests
 */
interface LockEntry {
  timestamp: number;
  promise: Promise<MoveCursorResult>;
}

// ============================================================================
// HANDLER-LEVEL DEDUPLICATION
// ============================================================================

/**
 * Handler-level pending operations map.
 * Prevents duplicate calls before content script lock is set.
 */
const pendingMoveCursorOperations = new Map<string, LockEntry>();

/**
 * Clean up stale locks older than threshold
 */
function cleanupStaleLocks(callId: string): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, lock] of pendingMoveCursorOperations.entries()) {
    if (now - lock.timestamp > 30000) {
      pendingMoveCursorOperations.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    debug.log(`${LOG_PREFIX}:${callId}`, `Passively cleaned ${cleaned} stale lock(s)`);
  }
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
 * Create a timeout promise for move cursor operation
 */
function createTimeoutPromise(): Promise<ScriptExecutionResult[]> {
  return new Promise(resolve =>
    setTimeout(
      () =>
        resolve([
          {
            result: {
              success: false,
              message: 'Timeout while moving cursor',
            },
          },
        ]),
      MOVE_CURSOR_TIMEOUT_MS,
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
// MAIN HANDLER
// ============================================================================

/**
 * Moves the cursor to a specific element on the current web page
 * @param cssSelector - A valid CSS selector string from the page HTML content
 * @returns Promise with status and message object
 */
export async function handleMoveCursorToElement(cssSelector: string): Promise<MoveCursorResult> {
  assertExtensionContext('Move cursor');
  // Validate input early
  if (!cssSelector || cssSelector.trim().length === 0) {
    return { status: 'error', message: 'Empty CSS selector provided' };
  }

  // Normalize selector for deduplication key
  const normalizedSelector = cssSelector.trim();
  const callId = Math.random().toString(36).substring(2, 9);

  // Check for pending operation on the same selector (handler-level deduplication)
  const existingLock = pendingMoveCursorOperations.get(normalizedSelector);
  const lockAge = existingLock ? Date.now() - existingLock.timestamp : -1;

  if (existingLock && lockAge < HANDLER_LOCK_TIMEOUT_MS) {
    debug.log(
      `${LOG_PREFIX}:${callId}`,
      `DUPLICATE REQUEST BLOCKED - Reusing existing execution (lock age: ${lockAge}ms)`,
    );
    return existingLock.promise;
  }

  debug.log(LOG_PREFIX, 'Moving cursor to element with selector:', normalizedSelector);

  // Create and track the operation
  const operationPromise = executeMoveCursorOperation(normalizedSelector, callId).finally(() => {
    // Always clean up the lock after execution completes
    pendingMoveCursorOperations.delete(normalizedSelector);
    debug.log(`${LOG_PREFIX}:${callId}`, 'Lock released after execution');
  });

  // Store the promise to prevent duplicate execution
  pendingMoveCursorOperations.set(normalizedSelector, {
    timestamp: Date.now(),
    promise: operationPromise,
  });

  debug.log(`${LOG_PREFIX}:${callId}`, `Lock acquired, total locks: ${pendingMoveCursorOperations.size}`);

  // Passive cleanup of stale locks
  cleanupStaleLocks(callId);

  try {
    return await operationPromise;
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error in handleMoveCursorToElement:', error);
    return { status: 'error', message: getErrorMessage(error) };
  }
}

// ============================================================================
// INTERNAL EXECUTION
// ============================================================================

/**
 * Internal function to execute the move cursor operation
 */
async function executeMoveCursorOperation(cssSelector: string, callId: string): Promise<MoveCursorResult> {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;

    if (!tabId) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    // Execute script in content page to find and highlight the element
    const execPromise = chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (
        selector: string,
        lockTimeout: number,
        animation: typeof ANIMATION,
      ): ScriptMoveCursorResult | Promise<ScriptMoveCursorResult> => {
        // Window type for content script
        type WindowWithState = Window & {
          __copilotCursorState__?: {
            lastX: number;
            lastY: number;
            hideTimeout: ReturnType<typeof setTimeout> | null;
          };
          [key: string]: unknown;
        };

        const win = window as unknown as WindowWithState;

        // Prevent duplicate injection
        const injectionKey = `__copilotMoveCursorInjected_${selector}`;
        if (win[injectionKey]) {
          console.log('[MoveCursor] Duplicate move prevented for selector:', selector);
          return {
            success: true,
            message: 'Cursor move already in progress for this element. Duplicate request ignored.',
          };
        }
        win[injectionKey] = true;
        setTimeout(() => delete win[injectionKey], lockTimeout);

        try {
          // Shadow DOM helper - supports >> notation
          const querySelectorWithShadowDOM = (sel: string): Element | null => {
            if (!sel.includes(' >> ')) {
              return document.querySelector(sel);
            }

            const parts = sel.split(' >> ');
            if (parts.length !== 2) {
              throw new Error(`Invalid shadow DOM selector format. Expected "shadowPath >> elementSelector"`);
            }

            const shadowPath = parts[0].trim();
            const elementSelector = parts[1].trim();

            const pathSegments = shadowPath
              .split(' > ')
              .map(s => s.trim())
              .filter(s => s && s !== 'document');

            if (pathSegments.length === 0) {
              throw new Error(`Shadow path must contain at least one element`);
            }

            let currentRoot: Document | ShadowRoot = document;

            for (const segment of pathSegments) {
              const hostElement: Element | null = currentRoot.querySelector(segment);

              if (!hostElement) {
                throw new Error(`Shadow host not found: ${segment}`);
              }

              if (!hostElement.shadowRoot) {
                throw new Error(`Element ${segment} does not have a shadow root`);
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

          // Build composed ancestor chain from leaf → ... → shadowHost → ... → documentElement
          const getComposedChain = (el: Element | null): Element[] => {
            if (!el) return [];
            const chain: Element[] = [];
            forEachAncestor(el, e => chain.push(e));
            return chain;
          };

          // Diff previous and next chains; chains are leaf→...→root
          const diffChains = (prev: Element[], next: Element[]) => {
            let iPrev = prev.length - 1;
            let iNext = next.length - 1;
            while (iPrev >= 0 && iNext >= 0 && prev[iPrev] === next[iNext]) {
              iPrev--;
              iNext--;
            }
            return {
              leaving: prev.slice(0, iPrev + 1),
              entering: next.slice(0, iNext + 1).reverse(),
            };
          };

          // Dispatch helpers with correct bubbling/composed defaults
          const dispatchPointerMove = (el: Element, x: number, y: number): void => {
            el.dispatchEvent(
              new PointerEvent('pointermove', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: x,
                clientY: y,
                pointerType: 'mouse',
              }),
            );
            el.dispatchEvent(
              new MouseEvent('mousemove', {
                view: window,
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: x,
                clientY: y,
              }),
            );
          };

          const dispatchEnterSequence = (targets: Element[], x: number, y: number): void => {
            for (const t of targets) {
              t.dispatchEvent(
                new PointerEvent('pointerover', {
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  clientX: x,
                  clientY: y,
                  pointerType: 'mouse',
                }),
              );
              t.dispatchEvent(
                new MouseEvent('mouseover', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  clientX: x,
                  clientY: y,
                }),
              );
              t.dispatchEvent(
                new PointerEvent('pointerenter', {
                  bubbles: false,
                  cancelable: true,
                  composed: true,
                  clientX: x,
                  clientY: y,
                  pointerType: 'mouse',
                }),
              );
              t.dispatchEvent(
                new MouseEvent('mouseenter', {
                  view: window,
                  bubbles: false,
                  cancelable: true,
                  composed: true,
                  clientX: x,
                  clientY: y,
                }),
              );
            }
          };

          const dispatchLeaveSequence = (targets: Element[], x: number, y: number, oldLeaf: Element | null): void => {
            if (oldLeaf) {
              oldLeaf.dispatchEvent(
                new PointerEvent('pointerout', {
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  clientX: x,
                  clientY: y,
                  pointerType: 'mouse',
                }),
              );
              oldLeaf.dispatchEvent(
                new MouseEvent('mouseout', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  clientX: x,
                  clientY: y,
                }),
              );
            }
            for (const t of targets) {
              t.dispatchEvent(
                new PointerEvent('pointerleave', {
                  bubbles: false,
                  cancelable: true,
                  composed: true,
                  clientX: x,
                  clientY: y,
                  pointerType: 'mouse',
                }),
              );
              t.dispatchEvent(
                new MouseEvent('mouseleave', {
                  view: window,
                  bubbles: false,
                  cancelable: true,
                  composed: true,
                  clientX: x,
                  clientY: y,
                }),
              );
            }
          };

          // Hit testing helper
          const hitTest = (x: number, y: number): Element | null => {
            const el = document.elementFromPoint(x, y);
            if (el && !el.isConnected) return null;
            return el;
          };

          // Find element using shadow-aware query
          const element = querySelectorWithShadowDOM(selector);
          const foundInShadowDOM = selector.includes(' >> ');
          const shadowHostInfo = foundInShadowDOM ? selector.split(' >> ')[0].trim() : '';

          if (!element) {
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
            return {
              success: false,
              message: `Element found but is hidden: "${selector}"`,
            };
          }

          // Scroll element into view smoothly
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

          // Return promise that resolves after animation completes
          return new Promise<ScriptMoveCursorResult>(resolve => {
            setTimeout(() => {
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

                // Highlight the element
                const originalStyle = (targetElement as HTMLElement).style.cssText;
                const highlightStyle = `
                  outline: 3px solid #4CAF50 !important;
                  outline-offset: 4px !important;
                  background-color: rgba(76, 175, 80, 0.1) !important;
                  cursor: pointer !important;
                  transition: all 0.3s ease !important;
                `;
                (targetElement as HTMLElement).style.cssText += highlightStyle;

                // Get element position
                const rect = targetElement.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                // Animate cursor to element position
                const animateCursor = (): void => {
                  const startX = cursorState.lastX;
                  const startY = cursorState.lastY;
                  let lastLeaf: Element | null = null;
                  let lastChain: Element[] = [];

                  const frame = (tStart: number): void => {
                    const tick = (now: number): void => {
                      const elapsed = Math.min(animation.duration, now - tStart);
                      const progress = elapsed / (animation.duration || 1);
                      const x = startX + (centerX - startX) * progress;
                      const y = startY + (centerY - startY) * progress;

                      // Slight natural movement
                      const randomX = (Math.random() - 0.5) * 2;
                      const randomY = (Math.random() - 0.5) * 2;

                      cursor!.style.left = x + randomX + 'px';
                      cursor!.style.top = y + randomY + 'px';
                      cursor!.style.opacity = '1';
                      cursor!.style.animation = 'none';

                      // Hit test and dispatch proper transitions
                      const hit = hitTest(x, y);
                      const chain = getComposedChain(hit);
                      if (hit) {
                        const { leaving, entering } = diffChains(lastChain, chain);
                        if (leaving.length || entering.length || hit !== lastLeaf) {
                          dispatchLeaveSequence(leaving, x, y, lastLeaf);
                          dispatchEnterSequence(entering, x, y);
                          dispatchPointerMove(hit, x, y);
                          lastLeaf = hit;
                          lastChain = chain;
                          try {
                            const cur = window.getComputedStyle(hit as HTMLElement).cursor || 'default';
                            (cursor as HTMLElement).style.cursor = cur;
                          } catch {
                            // Ignore style errors
                          }
                        } else {
                          dispatchPointerMove(hit, x, y);
                        }
                      }

                      if (elapsed < animation.duration) {
                        requestAnimationFrame(tick);
                      } else {
                        // Finalize
                        cursorState.lastX = centerX;
                        cursorState.lastY = centerY;

                        if (hit) {
                          const { entering } = diffChains(lastChain, chain);
                          if (entering.length) dispatchEnterSequence(entering, centerX, centerY);
                          try {
                            const cur = window.getComputedStyle(hit as HTMLElement).cursor || 'default';
                            (cursor as HTMLElement).style.cursor = cur;
                          } catch {
                            // Ignore style errors
                          }
                        }

                        // Final position
                        cursor!.style.left = centerX + 'px';
                        cursor!.style.top = centerY + 'px';
                        cursor!.style.animation = 'copilotPulse 1.2s ease-in-out infinite';

                        const elemAtCursor = document.elementFromPoint(centerX, centerY);
                        if (elemAtCursor) {
                          dispatchPointerMove(elemAtCursor, centerX, centerY);
                        }

                        // Auto-hide cursor
                        cursorState.hideTimeout = setTimeout(() => {
                          if (cursor) {
                            cursor.style.animation = 'copilotFadeOut 0.5s ease-out forwards';
                            setTimeout(() => cursor?.remove(), 500);
                          }
                        }, animation.autoHideDelay);

                        // Remove highlight after delay
                        setTimeout(() => {
                          (targetElement as HTMLElement).style.cssText = originalStyle;
                        }, animation.highlightDuration);

                        // Resolve with success
                        resolve({
                          success: true,
                          message: `Cursor moved to: "${(targetElement.textContent || targetElement.tagName).substring(0, 50)}"${foundInShadowDOM ? ` (in Shadow DOM: ${shadowHostInfo})` : ''}`,
                          elementInfo: {
                            tag: targetElement.tagName,
                            text: (targetElement.textContent || '').trim().substring(0, 100),
                            id: targetElement.id,
                            className: typeof targetElement.className === 'string' ? targetElement.className : '',
                            foundInShadowDOM: foundInShadowDOM,
                            shadowHost: foundInShadowDOM ? shadowHostInfo : null,
                          },
                        });
                      }
                    };
                    requestAnimationFrame(tick);
                  };

                  requestAnimationFrame(frame);
                };

                // Start cursor animation with delay for new cursor
                setTimeout(animateCursor, isNewCursor ? animation.cursorDelayNew : animation.cursorDelayExisting);
              } catch (error) {
                resolve({
                  success: false,
                  message: `Error moving cursor: ${error instanceof Error ? error.message : 'Unknown error'}`,
                });
              }
            }, animation.scrollWaitDelay);
          });
        } catch (error) {
          return {
            success: false,
            message: `Invalid CSS selector: "${selector}". Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
      args: [cssSelector, CONTENT_LOCK_TIMEOUT_MS, ANIMATION] as const,
    });

    const results = await Promise.race([execPromise, createTimeoutPromise()]);

    if (!isValidScriptResult(results)) {
      return {
        status: 'error',
        message: 'Unable to move cursor to element',
      };
    }

    const result = results[0].result;
    debug.log(`${LOG_PREFIX}:${callId}`, 'Result:', result?.success ? 'success' : 'error');

    if (result?.success && result.elementInfo) {
      return {
        status: 'success',
        message: result.message,
        elementInfo: {
          tag: result.elementInfo.tag,
          text: result.elementInfo.text || '',
          id: result.elementInfo.id || '',
          className: result.elementInfo.className || '',
          foundInShadowDOM: result.elementInfo.foundInShadowDOM,
          shadowHost: result.elementInfo.shadowHost,
        },
      };
    }

    return {
      status: 'error',
      message: `${result?.message ?? 'Element not found'}\n\nTry being more specific or use a different description.`,
    };
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error moving cursor:', error);
    return {
      status: 'error',
      message: `Error: ${getErrorMessage(error)}`,
    };
  }
}
