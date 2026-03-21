import { debug as baseDebug } from '@extension/shared';
import { assertExtensionContext } from '@src/utils/extensionOnly';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for scroll actions */
const LOG_PREFIX = '[Scroll]';

/** Timeout for scroll operation in milliseconds */
const SCROLL_TIMEOUT_MS = 10000;

/**
 * Handler-level lock timeout in milliseconds.
 * Should cover scroll animation (650-1800ms) + fallback delays + buffer
 */
const HANDLER_LOCK_TIMEOUT_MS = 5000;

/** Content script lock timeout in milliseconds */
const CONTENT_LOCK_TIMEOUT_MS = 3000;

/** Wait for smooth scroll animation to complete */
const SCROLL_COMPLETION_DELAY = 800;

/** Show scroll indicator duration */
const INDICATOR_DURATION = 1000;

/** Default scroll distance in pixels */
const DEFAULT_SCROLL_AMOUNT = 300;

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
 * Internal result type for scroll operation (used by script)
 */
interface ScrollResult {
  success: boolean;
  message: string;
  scrollInfo?: ScrollInfo;
}

/**
 * Scroll position and metadata
 */
interface ScrollInfo {
  target: string;
  direction: string;
  before: { x: number; y: number };
  after: { x: number; y: number };
  scrolled: { x: number; y: number };
  max: { x: number; y: number };
}

/**
 * Result type for scroll operation
 */
export interface ScrollOperationResult {
  status: 'success' | 'error';
  message: string;
  scrollInfo?: ScrollInfo;
}

/**
 * Script execution result from chrome.scripting.executeScript
 */
interface ScriptExecutionResult {
  result?: ScrollResult;
}

/**
 * Lock entry for tracking in-flight requests
 */
interface LockEntry {
  timestamp: number;
  promise: Promise<ScrollOperationResult>;
}

/**
 * Scroll direction type
 */
type ScrollDirection = 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom' | 'to';

// ============================================================================
// HANDLER-LEVEL DEDUPLICATION
// ============================================================================

/**
 * Handler-level pending operations map.
 * Prevents duplicate calls before content script lock is set.
 */
const pendingScrollOperations = new Map<string, LockEntry>();

/**
 * Create a unique key for the scroll operation
 */
function createScrollKey(cssSelector: string, direction: string, amount: number, scrollTo: boolean): string {
  return `${cssSelector.trim()}|${direction}|${amount}|${scrollTo}`;
}

/**
 * Clean up stale locks older than threshold
 */
function cleanupStaleLocks(callId: string): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, lock] of pendingScrollOperations.entries()) {
    if (now - lock.timestamp > 30000) {
      pendingScrollOperations.delete(key);
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
 * Create a timeout promise for scroll operation
 */
function createTimeoutPromise(): Promise<ScriptExecutionResult[]> {
  return new Promise(resolve =>
    setTimeout(
      () =>
        resolve([
          {
            result: {
              success: false,
              message: 'Timeout while scrolling',
            },
          },
        ]),
      SCROLL_TIMEOUT_MS,
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
 * Scroll on the page, within a specific element, or to a specific element
 * @param cssSelector - CSS selector for the element to scroll within or scroll to
 * @param direction - Direction to scroll: "up", "down", "left", "right", "top", "bottom", or "to"
 * @param amount - Amount to scroll in pixels (for up/down/left/right, ignored for "to")
 * @param scrollTo - If true, scrolls TO the element. If false, scrolls WITHIN the element
 * @returns Promise with status and message object
 */
export async function handleScroll(
  cssSelector: string = '',
  direction: ScrollDirection = 'down',
  amount: number = DEFAULT_SCROLL_AMOUNT,
  scrollTo: boolean = false,
): Promise<ScrollOperationResult> {
  assertExtensionContext('Scroll');
  const callId = Math.random().toString(36).substring(2, 9);
  const scrollKey = createScrollKey(cssSelector, direction, amount, scrollTo);

  // Check for pending operation (handler-level deduplication)
  const existingLock = pendingScrollOperations.get(scrollKey);
  const lockAge = existingLock ? Date.now() - existingLock.timestamp : -1;

  if (existingLock && lockAge < HANDLER_LOCK_TIMEOUT_MS) {
    debug.log(
      `${LOG_PREFIX}:${callId}`,
      `DUPLICATE REQUEST BLOCKED - Reusing existing execution (lock age: ${lockAge}ms)`,
    );
    return existingLock.promise;
  }

  debug.log(LOG_PREFIX, 'Scrolling:', { cssSelector, direction, amount, scrollTo });

  // Create and track the operation
  const operationPromise = executeScrollOperation(cssSelector, direction, amount, scrollTo, callId).finally(() => {
    pendingScrollOperations.delete(scrollKey);
    debug.log(`${LOG_PREFIX}:${callId}`, 'Lock released after execution');
  });

  pendingScrollOperations.set(scrollKey, {
    timestamp: Date.now(),
    promise: operationPromise,
  });

  debug.log(`${LOG_PREFIX}:${callId}`, `Lock acquired, total locks: ${pendingScrollOperations.size}`);

  cleanupStaleLocks(callId);

  try {
    return await operationPromise;
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error in handleScroll:', error);
    return { status: 'error', message: getErrorMessage(error) };
  }
}

// ============================================================================
// INTERNAL EXECUTION
// ============================================================================

/**
 * Internal function to execute the scroll operation
 */
async function executeScrollOperation(
  cssSelector: string,
  direction: ScrollDirection,
  amount: number,
  scrollTo: boolean,
  callId: string,
): Promise<ScrollOperationResult> {
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

    // Execute script in content page to perform scroll
    const execPromise = chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (
        selector: string,
        scrollDirection: string,
        scrollAmount: number,
        shouldScrollTo: boolean,
        lockTimeout: number,
        scrollCompletionDelay: number,
        indicatorDuration: number,
      ): Promise<ScrollResult> => {
        // Window type for content script
        type WindowWithState = Window & {
          [key: string]: unknown;
        };

        const win = window as unknown as WindowWithState;

        // Create unique key for this specific scroll operation
        const injectionKey = `__copilotScrollInjected_${selector}_${scrollDirection}_${scrollAmount}`;

        // Prevent duplicate injection
        if (win[injectionKey]) {
          return Promise.resolve({
            success: true,
            message: 'Scroll already in progress. Duplicate request ignored.',
          });
        }
        win[injectionKey] = true;
        setTimeout(() => delete win[injectionKey], lockTimeout);

        console.log('[Scroll] Internal script started with params:', {
          selector,
          scrollDirection,
          scrollAmount,
          shouldScrollTo,
        });

        return new Promise<ScrollResult>(resolve => {
          try {
            let targetElement: Element | Window = window;
            let targetName = 'page';

            // If selector provided, find the element
            if (selector && selector.trim() !== '') {
              let element = document.querySelector(selector);
              let foundInShadowDOM = false;
              let shadowHostInfo = '';

              // If not found in main DOM, search in Shadow DOM
              if (!element) {
                console.log('[Scroll] Element not found in main DOM, searching Shadow DOM...');

                for (const hostElement of Array.from(document.querySelectorAll('*'))) {
                  if (hostElement.shadowRoot && !element) {
                    try {
                      const shadowElement = hostElement.shadowRoot.querySelector(selector);
                      if (shadowElement) {
                        element = shadowElement;
                        foundInShadowDOM = true;
                        shadowHostInfo = `${hostElement.tagName}${hostElement.id ? '#' + hostElement.id : ''}${hostElement.className ? '.' + String(hostElement.className).split(' ')[0] : ''}`;
                        console.log('[Scroll] Found element in Shadow DOM:', shadowHostInfo);
                        break;
                      }
                    } catch (shadowError) {
                      console.log('[Scroll] Shadow DOM query error:', shadowError);
                    }
                  }
                }
              }

              if (!element) {
                resolve({
                  success: false,
                  message: `No element found with selector: "${selector}" in main DOM or Shadow DOM. Please analyze the HTML and provide a valid CSS selector, or leave empty to scroll the page.`,
                });
                return;
              }

              // Handle different scroll modes
              if (shouldScrollTo || scrollDirection === 'to') {
                targetElement = window;
                targetName = `page (scrolling to element: ${element.tagName}${element.id ? `#${element.id}` : ''}${element.className ? `.${String(element.className).split(' ')[0]}` : ''}${foundInShadowDOM ? ` in Shadow DOM: ${shadowHostInfo}` : ''})`;
              } else {
                const style = window.getComputedStyle(element);
                const isScrollable =
                  style.overflow === 'auto' ||
                  style.overflow === 'scroll' ||
                  style.overflowY === 'auto' ||
                  style.overflowY === 'scroll' ||
                  style.overflowX === 'auto' ||
                  style.overflowX === 'scroll';

                if (
                  !isScrollable &&
                  element.scrollHeight <= element.clientHeight &&
                  element.scrollWidth <= element.clientWidth
                ) {
                  console.log('[Scroll] Element is not scrollable, automatically scrolling TO the element instead');
                  targetElement = window;
                  targetName = `page (auto-scrolling to non-scrollable element: ${element.tagName}${element.id ? `#${element.id}` : ''}${element.className ? `.${String(element.className).split(' ')[0]}` : ''}${foundInShadowDOM ? ` in Shadow DOM: ${shadowHostInfo}` : ''})`;
                } else {
                  targetElement = element;
                  targetName = `${element.tagName}${element.id ? `#${element.id}` : ''}${element.className ? `.${String(element.className).split(' ')[0]}` : ''}${foundInShadowDOM ? ` (in Shadow DOM: ${shadowHostInfo})` : ''}`;
                }
              }
            }

            // Get current scroll position
            const getCurrentScroll = (el: Element | Window) => {
              if (el === window) {
                const doc = document.documentElement;
                const body = document.body;
                const curX = window.scrollX || window.pageXOffset || doc.scrollLeft || body.scrollLeft || 0;
                const curY = window.scrollY || window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
                const scrollWidth = Math.max(
                  body.scrollWidth,
                  doc.scrollWidth,
                  body.offsetWidth,
                  doc.offsetWidth,
                  body.clientWidth,
                  doc.clientWidth,
                );
                const scrollHeight = Math.max(
                  body.scrollHeight,
                  doc.scrollHeight,
                  body.offsetHeight,
                  doc.offsetHeight,
                  body.clientHeight,
                  doc.clientHeight,
                );
                return {
                  x: curX,
                  y: curY,
                  maxX: Math.max(0, scrollWidth - window.innerWidth),
                  maxY: Math.max(0, scrollHeight - window.innerHeight),
                };
              } else {
                const elem = el as Element;
                return {
                  x: elem.scrollLeft,
                  y: elem.scrollTop,
                  maxX: Math.max(0, elem.scrollWidth - elem.clientWidth),
                  maxY: Math.max(0, elem.scrollHeight - elem.clientHeight),
                };
              }
            };

            const beforeScroll = getCurrentScroll(targetElement);

            // Humanized scroll helpers
            const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
            const estimateDurationMs = (distancePx: number) => {
              const MS_PER_1000 = 700;
              const MIN_MS = 650;
              const MAX_MS = 1800;
              const ms = (distancePx / 1000) * MS_PER_1000;
              return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(ms)));
            };

            const animateScrollY = (el: Element | Window, fromY: number, toY: number): number => {
              const distance = Math.abs(toY - fromY);
              const duration = estimateDurationMs(distance);
              const start = performance.now();
              const isWindowTarget = el === window;
              const startX = isWindowTarget ? window.scrollX || window.pageXOffset || 0 : (el as Element).scrollLeft;

              const frame = (now: number): void => {
                const t = Math.min(1, (now - start) / duration);
                const eased = easeInOutCubic(t);
                const currentY = fromY + (toY - fromY) * eased;
                if (isWindowTarget) {
                  window.scrollTo({ top: currentY, left: startX });
                } else {
                  (el as Element).scrollTo({ top: currentY, left: startX });
                }
                if (t < 1) requestAnimationFrame(frame);
              };

              if (distance > 4) requestAnimationFrame(frame);
              return duration;
            };

            // Calculate scroll position
            const calculatePosition = (
              dir: string,
              curr: { x: number; y: number; maxX: number; maxY: number },
              amt: number,
              targetEl?: Element,
            ): ScrollToOptions => {
              const opts: ScrollToOptions = { behavior: 'smooth' };

              switch (dir) {
                case 'up':
                  opts.top = Math.max(0, curr.y - amt);
                  break;
                case 'down':
                  opts.top = Math.min(curr.maxY, curr.y + amt);
                  break;
                case 'left':
                  opts.left = Math.max(0, curr.x - amt);
                  break;
                case 'right':
                  opts.left = Math.min(curr.maxX, curr.x + amt);
                  break;
                case 'top':
                  opts.top = 0;
                  break;
                case 'bottom':
                  opts.top = curr.maxY;
                  break;
                case 'to':
                  if (targetEl) {
                    const rect = targetEl.getBoundingClientRect();
                    const currentScrollY = window.scrollY || window.pageYOffset;
                    const currentScrollX = window.scrollX || window.pageXOffset;
                    const targetY = currentScrollY + rect.top - window.innerHeight / 2 + rect.height / 2;
                    const targetX = currentScrollX + rect.left - window.innerWidth / 2 + rect.width / 2;
                    opts.top = Math.max(
                      0,
                      Math.min(document.documentElement.scrollHeight - window.innerHeight, targetY),
                    );
                    opts.left = Math.max(
                      0,
                      Math.min(document.documentElement.scrollWidth - window.innerWidth, targetX),
                    );
                  }
                  break;
              }

              return opts;
            };

            // Get target element for scroll-to functionality
            const isAutoScrollTo = targetElement === window && !shouldScrollTo && scrollDirection !== 'to';
            const targetElForScrollTo =
              (shouldScrollTo || scrollDirection === 'to' || isAutoScrollTo) && selector
                ? document.querySelector(selector) || undefined
                : undefined;

            const effectiveDirection = isAutoScrollTo ? 'to' : scrollDirection;
            const scrollOptions = calculatePosition(
              effectiveDirection,
              beforeScroll,
              scrollAmount,
              targetElForScrollTo,
            );

            // Perform scroll
            let effectiveDelay = scrollCompletionDelay;
            if (typeof scrollOptions.top === 'number') {
              const targetY = scrollOptions.top;
              const fromY = beforeScroll.y;
              effectiveDelay = Math.max(scrollCompletionDelay, animateScrollY(targetElement, fromY, targetY) + 120);
            } else {
              if (targetElement === window) {
                const opts = { ...scrollOptions } as ScrollToOptions & { behavior?: ScrollBehavior };
                if (!opts.behavior) opts.behavior = 'smooth';
                window.scrollTo(opts);
              } else {
                (targetElement as Element).scrollTo(scrollOptions);
              }
            }

            console.log(
              '[Scroll] Starting scroll animation with targetElement:',
              targetElement === window ? 'window' : (targetElement as Element).tagName,
            );

            // Timeout fallback
            const timeoutId = setTimeout(() => {
              console.log('[Scroll] Timeout reached, resolving with fallback result');
              resolve({
                success: true,
                message: 'Scroll completed (timeout fallback)',
                scrollInfo: {
                  target: targetName,
                  direction: scrollDirection,
                  before: { x: 0, y: 0 },
                  after: { x: 0, y: 0 },
                  scrolled: { x: 0, y: 0 },
                  max: { x: 0, y: 0 },
                },
              });
            }, scrollCompletionDelay + 2000);

            setTimeout(() => {
              try {
                let afterScroll = getCurrentScroll(targetElement);

                // Visual feedback for scroll
                const existingIndicator = document.getElementById('__copilot_scroll_indicator__');
                if (existingIndicator) {
                  existingIndicator.remove();
                }

                const scrollIndicator = document.createElement('div');
                scrollIndicator.id = '__copilot_scroll_indicator__';
                const arrowSymbol =
                  scrollDirection === 'up'
                    ? '↑'
                    : scrollDirection === 'down'
                      ? '↓'
                      : scrollDirection === 'left'
                        ? '←'
                        : scrollDirection === 'right'
                          ? '→'
                          : scrollDirection === 'top'
                            ? '⇈'
                            : '⇊';

                scrollIndicator.textContent = arrowSymbol;
                scrollIndicator.style.cssText = `
                  position: fixed;
                  ${scrollDirection === 'up' || scrollDirection === 'top' ? 'top: 20px;' : ''}
                  ${scrollDirection === 'down' || scrollDirection === 'bottom' ? 'bottom: 20px;' : ''}
                  ${scrollDirection === 'left' ? 'left: 20px; top: 50%;' : ''}
                  ${scrollDirection === 'right' ? 'right: 20px; top: 50%;' : ''}
                  ${scrollDirection === 'down' || scrollDirection === 'up' || scrollDirection === 'top' || scrollDirection === 'bottom' ? 'left: 50%;' : ''}
                  transform: translate(-50%, -50%);
                  font-size: 48px;
                  color: #2196F3;
                  text-shadow: 0 0 10px rgba(33, 150, 243, 0.8);
                  pointer-events: none;
                  z-index: 2147483647;
                  animation: scrollFade 1s ease-out forwards;
                `;

                let styleEl = document.getElementById('__copilot_scroll_style__');
                if (!styleEl) {
                  styleEl = document.createElement('style');
                  styleEl.id = '__copilot_scroll_style__';
                  styleEl.textContent = `
                    @keyframes scrollFade {
                      0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); }
                      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                      100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
                    }
                  `;
                  document.head.appendChild(styleEl);
                }

                document.body.appendChild(scrollIndicator);
                setTimeout(() => scrollIndicator.remove(), indicatorDuration);

                let scrolledX = Math.abs(afterScroll.x - beforeScroll.x);
                let scrolledY = Math.abs(afterScroll.y - beforeScroll.y);

                // Fallback logic if window did not scroll
                if (
                  scrolledX === 0 &&
                  scrolledY === 0 &&
                  targetElement === window &&
                  (scrollDirection === 'down' ||
                    scrollDirection === 'up' ||
                    scrollDirection === 'top' ||
                    scrollDirection === 'bottom')
                ) {
                  if (scrollDirection === 'down' || scrollDirection === 'bottom') {
                    window.scrollTo({ top: Number.MAX_SAFE_INTEGER });
                  } else if (scrollDirection === 'up' || scrollDirection === 'top') {
                    window.scrollTo({ top: 0 });
                  }
                  afterScroll = getCurrentScroll(window);
                  scrolledX = Math.abs(afterScroll.x - beforeScroll.x);
                  scrolledY = Math.abs(afterScroll.y - beforeScroll.y);
                }

                // Try scrollable container fallback
                if (
                  scrolledX === 0 &&
                  scrolledY === 0 &&
                  targetElement === window &&
                  (scrollDirection === 'down' ||
                    scrollDirection === 'up' ||
                    scrollDirection === 'top' ||
                    scrollDirection === 'bottom')
                ) {
                  const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
                    const s = getComputedStyle(el);
                    const scrollable =
                      s.overflowY === 'auto' ||
                      s.overflowY === 'scroll' ||
                      s.overflow === 'auto' ||
                      s.overflow === 'scroll';
                    return scrollable && el.scrollHeight > el.clientHeight && (el as HTMLElement).offsetParent !== null;
                  }) as Element[];

                  if (candidates.length > 0) {
                    candidates.sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight));
                    const mainScroller = candidates[0];
                    const beforeInner = getCurrentScroll(mainScroller);
                    const innerTarget =
                      scrollDirection === 'down' || scrollDirection === 'bottom' ? beforeInner.maxY : 0;
                    const innerDuration = animateScrollY(mainScroller, beforeInner.y, innerTarget) + 120;

                    setTimeout(
                      () => {
                        const afterInner = getCurrentScroll(mainScroller);
                        const innerScrolledY = Math.abs(afterInner.y - beforeInner.y);
                        const innerScrolledX = Math.abs(afterInner.x - beforeInner.x);
                        const usedName = `${mainScroller.tagName}${(mainScroller as HTMLElement).id ? `#${(mainScroller as HTMLElement).id}` : ''}`;
                        clearTimeout(timeoutId);
                        resolve({
                          success: true,
                          message:
                            innerScrolledY > 0 || innerScrolledX > 0
                              ? `Scrolled ${scrollDirection} within main container ${usedName}`
                              : 'No scroll occurred in main container (maybe already at bounds)',
                          scrollInfo: {
                            target: usedName,
                            direction: scrollDirection,
                            before: { x: Math.round(beforeInner.x), y: Math.round(beforeInner.y) },
                            after: { x: Math.round(afterInner.x), y: Math.round(afterInner.y) },
                            scrolled: { x: Math.round(innerScrolledX), y: Math.round(innerScrolledY) },
                            max: { x: Math.round(beforeInner.maxX), y: Math.round(beforeInner.maxY) },
                          },
                        });
                      },
                      Math.max(400, scrollCompletionDelay, innerDuration),
                    );
                    return;
                  }

                  // Ancestor fallback
                  const center = document.elementFromPoint(
                    Math.floor(window.innerWidth / 2),
                    Math.floor(window.innerHeight / 2),
                  );
                  let walker: Element | null = center || null;
                  while (walker) {
                    const s = getComputedStyle(walker);
                    const scrollable =
                      (s.overflowY === 'auto' || s.overflowY === 'scroll') && walker.scrollHeight > walker.clientHeight;
                    if (scrollable) {
                      const beforeAnc = getCurrentScroll(walker);
                      const ancTarget = scrollDirection === 'down' || scrollDirection === 'bottom' ? beforeAnc.maxY : 0;
                      const ancDuration = animateScrollY(walker, beforeAnc.y, ancTarget) + 120;
                      const walkerRef = walker;
                      setTimeout(
                        () => {
                          if (!walkerRef) {
                            clearTimeout(timeoutId);
                            resolve({ success: false, message: 'Scrollable container disappeared during scroll' });
                            return;
                          }
                          const afterAnc = getCurrentScroll(walkerRef);
                          const dY = Math.abs(afterAnc.y - beforeAnc.y);
                          const usedName = `${walkerRef.tagName}${(walkerRef as HTMLElement).id ? `#${(walkerRef as HTMLElement).id}` : ''}`;
                          clearTimeout(timeoutId);
                          resolve({
                            success: true,
                            message:
                              dY > 0
                                ? `Scrolled ${scrollDirection} within container ${usedName}`
                                : 'No scroll occurred in container (maybe already at bounds)',
                            scrollInfo: {
                              target: usedName,
                              direction: scrollDirection,
                              before: { x: Math.round(beforeAnc.x), y: Math.round(beforeAnc.y) },
                              after: { x: Math.round(afterAnc.x), y: Math.round(afterAnc.y) },
                              scrolled: { x: Math.round(Math.abs(afterAnc.x - beforeAnc.x)), y: Math.round(dY) },
                              max: { x: Math.round(beforeAnc.maxX), y: Math.round(beforeAnc.maxY) },
                            },
                          });
                        },
                        Math.max(400, scrollCompletionDelay, ancDuration),
                      );
                      return;
                    }
                    walker = walker.parentElement;
                  }
                }

                // Build message
                let message = '';
                if (scrolledX === 0 && scrolledY === 0) {
                  if (targetElement === window && beforeScroll.maxY === 0 && beforeScroll.maxX === 0) {
                    message = 'Page is not scrollable (already at bounds)';
                  } else if (targetElement !== window && beforeScroll.maxY === 0 && beforeScroll.maxX === 0) {
                    message = 'Element is not scrollable (already at bounds)';
                  } else if (scrollDirection === 'top' && beforeScroll.y === 0) {
                    message = 'Already at the top';
                  } else if (scrollDirection === 'bottom' && beforeScroll.y === beforeScroll.maxY) {
                    message = 'Already at the bottom';
                  } else if (scrollDirection === 'left' && beforeScroll.x === 0) {
                    message = 'Already at the left edge';
                  } else if (scrollDirection === 'right' && beforeScroll.x === beforeScroll.maxX) {
                    message = 'Already at the right edge';
                  } else if (scrollDirection === 'up' && beforeScroll.y === 0) {
                    message = 'Already at the top';
                  } else if (scrollDirection === 'down' && beforeScroll.y === beforeScroll.maxY) {
                    message = 'Already at the bottom';
                  } else {
                    message = 'No scroll occurred (element may not be scrollable)';
                  }
                } else {
                  if (scrollDirection === 'to' || shouldScrollTo || isAutoScrollTo) {
                    message = isAutoScrollTo
                      ? 'Auto-scrolled to element (element was not scrollable)'
                      : 'Scrolled to element';
                    if (scrolledY > 0) message += ` ${Math.round(scrolledY)}px vertically`;
                    if (scrolledX > 0) message += ` ${Math.round(scrolledX)}px horizontally`;
                  } else {
                    message = `Scrolled ${scrollDirection}`;
                    if (scrolledY > 0) message += ` ${Math.round(scrolledY)}px vertically`;
                    if (scrolledX > 0) message += ` ${Math.round(scrolledX)}px horizontally`;
                  }
                }

                const result: ScrollResult = {
                  success: true,
                  message: message,
                  scrollInfo: {
                    target: targetName,
                    direction: scrollDirection,
                    before: { x: Math.round(beforeScroll.x), y: Math.round(beforeScroll.y) },
                    after: { x: Math.round(afterScroll.x), y: Math.round(afterScroll.y) },
                    scrolled: { x: Math.round(scrolledX), y: Math.round(scrolledY) },
                    max: { x: Math.round(beforeScroll.maxX), y: Math.round(beforeScroll.maxY) },
                  },
                };

                console.log('[Scroll] Resolving with result:', result);
                clearTimeout(timeoutId);
                resolve(result);
              } catch (innerError) {
                console.error('[Scroll] Error in scroll completion:', innerError);
                clearTimeout(timeoutId);
                resolve({
                  success: false,
                  message: `Error during scroll completion: ${innerError instanceof Error ? innerError.message : 'Unknown error'}`,
                });
              }
            }, effectiveDelay);
          } catch (error) {
            console.error('[Scroll] Error in script execution:', error);
            resolve({
              success: false,
              message: `Error scrolling: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
          }
        });
      },
      args: [
        cssSelector,
        direction,
        amount,
        scrollTo,
        CONTENT_LOCK_TIMEOUT_MS,
        SCROLL_COMPLETION_DELAY,
        INDICATOR_DURATION,
      ] as const,
    });

    const results = await Promise.race([execPromise, createTimeoutPromise()]);

    debug.log(`${LOG_PREFIX}:${callId}`, 'Script execution completed');

    if (!isValidScriptResult(results)) {
      debug.error(LOG_PREFIX, 'No results from script execution or invalid result structure');
      return {
        status: 'error',
        message: 'Unable to scroll - no results from script execution',
      };
    }

    const result = results[0].result;
    debug.log(`${LOG_PREFIX}:${callId}`, 'Script result:', result?.success ? 'success' : 'error');

    if (result?.success) {
      return {
        status: 'success',
        message: result.message,
        scrollInfo: result.scrollInfo || {
          target: 'unknown',
          direction: 'unknown',
          before: { x: 0, y: 0 },
          after: { x: 0, y: 0 },
          scrolled: { x: 0, y: 0 },
          max: { x: 0, y: 0 },
        },
      };
    }

    return {
      status: 'error',
      message: result?.message ?? 'Unknown scroll error',
    };
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error scrolling:', error);
    return {
      status: 'error',
      message: `Error: ${getErrorMessage(error)}`,
    };
  }
}
