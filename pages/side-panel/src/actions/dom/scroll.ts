import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

// Constants for timing and scroll behavior
const SCROLL_COMPLETION_DELAY = 800; // Wait for smooth scroll animation to complete
const INDICATOR_DURATION = 1000; // Show scroll indicator for 1 second
const DEFAULT_SCROLL_AMOUNT = 300; // Default scroll distance in pixels

/**
 * Internal result type for scroll operation (used by script)
 */
interface ScrollResult {
  success: boolean;
  message: string;
  scrollInfo?: {
    target: string;
    direction: string;
    before: { x: number; y: number };
    after: { x: number; y: number };
    scrolled: { x: number; y: number };
    max: { x: number; y: number };
  };
}

/**
 * Result type for scroll operation
 */
interface ScrollOperationResult {
  status: 'success' | 'error';
  message: string;
  scrollInfo?: {
    target: string;
    direction: string;
    before: { x: number; y: number };
    after: { x: number; y: number };
    scrolled: { x: number; y: number };
    max: { x: number; y: number };
  };
}

/**
 * Calculate scroll position based on direction and current position
 */
function calculateScrollPosition(
  direction: string,
  current: { x: number; y: number; maxX: number; maxY: number },
  scrollAmount: number,
): ScrollToOptions {
  const options: ScrollToOptions = { behavior: 'smooth' };

  switch (direction) {
    case 'up':
      options.top = Math.max(0, current.y - scrollAmount);
      break;
    case 'down':
      options.top = Math.min(current.maxY, current.y + scrollAmount);
      break;
    case 'left':
      options.left = Math.max(0, current.x - scrollAmount);
      break;
    case 'right':
      options.left = Math.min(current.maxX, current.x + scrollAmount);
      break;
    case 'top':
      options.top = 0;
      break;
    case 'bottom':
      options.top = current.maxY;
      break;
  }

  return options;
}

/**
 * Scroll on the page, within a specific element, or to a specific element
 * @param cssSelector - CSS selector for the element to scroll within or scroll to
 * @param direction - Direction to scroll: "up", "down", "left", "right", "top", "bottom", or "to" (scroll to element)
 * @param amount - Amount to scroll in pixels (for up/down/left/right, ignored for "to")
 * @param scrollTo - If true, scrolls TO the element (brings it into view). If false, scrolls WITHIN the element
 * @returns Promise with status and message object
 */
export async function handleScroll(
  cssSelector: string = '',
  direction: 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom' | 'to' = 'down',
  amount: number = DEFAULT_SCROLL_AMOUNT,
  scrollTo: boolean = false,
): Promise<ScrollOperationResult> {
  try {
    debug.log('[Scroll] Scrolling:', { cssSelector, direction, amount });

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    // Execute script in content page to perform scroll (with outer timeout)
    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (
        selector: string,
        scrollDirection: string,
        scrollAmount: number,
        shouldScrollTo: boolean,
        scrollCompletionDelay: number,
        indicatorDuration: number,
      ): Promise<ScrollResult> => {
        console.log('[Scroll] Internal script started with params:', {
          selector,
          scrollDirection,
          scrollAmount,
          shouldScrollTo,
        });

        console.log('[Scroll] Creating Promise for scroll operation');
        return new Promise<ScrollResult>(resolve => {
          console.log('[Scroll] Promise created, starting scroll logic');
          try {
            let targetElement: Element | Window = window;
            let targetName = 'page';

            // If selector provided, find the element
            if (selector && selector.trim() !== '') {
              // First try to find element in main DOM
              let element = document.querySelector(selector);
              let foundInShadowDOM = false;
              let shadowHostInfo = '';

              // If not found in main DOM, search in Shadow DOM
              if (!element) {
                console.log('[Scroll] Element not found in main DOM, searching Shadow DOM...');

                // Search through all shadow roots with early exit
                for (const hostElement of Array.from(document.querySelectorAll('*'))) {
                  if (hostElement.shadowRoot && !element) {
                    try {
                      const shadowElement = hostElement.shadowRoot.querySelector(selector);
                      if (shadowElement) {
                        element = shadowElement;
                        foundInShadowDOM = true;
                        shadowHostInfo = `${hostElement.tagName}${hostElement.id ? '#' + hostElement.id : ''}${hostElement.className ? '.' + hostElement.className.split(' ')[0] : ''}`;
                        console.log('[Scroll] Found element in Shadow DOM:', shadowHostInfo);
                        break; // Early exit - stop searching once element is found
                      }
                    } catch (shadowError) {
                      // Ignore shadow DOM query errors (invalid selectors, etc.)
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
                // Scroll TO the element (bring it into view)
                targetElement = window; // Always scroll the page to bring element into view
                targetName = `page (scrolling to element: ${element.tagName}${element.id ? `#${element.id}` : ''}${element.className ? `.${element.className.split(' ')[0]}` : ''}${foundInShadowDOM ? ` in Shadow DOM: ${shadowHostInfo}` : ''})`;
              } else {
                // Scroll WITHIN the element (element must be scrollable)
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
                  // Element is not scrollable, automatically fall back to scrolling TO the element
                  console.log('[Scroll] Element is not scrollable, automatically scrolling TO the element instead');
                  targetElement = window; // Scroll the page to bring element into view
                  targetName = `page (auto-scrolling to non-scrollable element: ${element.tagName}${element.id ? `#${element.id}` : ''}${element.className ? `.${element.className.split(' ')[0]}` : ''}${foundInShadowDOM ? ` in Shadow DOM: ${shadowHostInfo}` : ''})`;
                } else {
                  targetElement = element;
                  targetName = `${element.tagName}${element.id ? `#${element.id}` : ''}${element.className ? `.${element.className.split(' ')[0]}` : ''}${foundInShadowDOM ? ` (in Shadow DOM: ${shadowHostInfo})` : ''}`;
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
                const element = el as Element;
                return {
                  x: element.scrollLeft,
                  y: element.scrollTop,
                  maxX: Math.max(0, element.scrollWidth - element.clientWidth),
                  maxY: Math.max(0, element.scrollHeight - element.clientHeight),
                };
              }
            };

            const beforeScroll = getCurrentScroll(targetElement);

            // Humanized scroll helpers
            const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
            const estimateDurationMs = (distancePx: number) => {
              const MS_PER_1000 = 700; // speed factor
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
              const frame = (now: number) => {
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
              if (distance > 4) requestAnimationFrame(frame); // ignore tiny distances
              return duration;
            };

            // Calculate scroll position using helper function (eliminates duplicate logic)
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
                  // Scroll to element - calculate position to bring element into view
                  if (targetEl) {
                    const rect = targetEl.getBoundingClientRect();
                    const currentScrollY = window.scrollY || window.pageYOffset;
                    const currentScrollX = window.scrollX || window.pageXOffset;

                    // Calculate position to center the element in viewport
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

            // Get the target element for scroll-to functionality
            // Include automatic fallback case when element is not scrollable
            const isAutoScrollTo = targetElement === window && !shouldScrollTo && scrollDirection !== 'to';
            const targetElForScrollTo =
              (shouldScrollTo || scrollDirection === 'to' || isAutoScrollTo) && selector
                ? document.querySelector(selector) || undefined
                : undefined;

            // Use "to" direction for automatic fallback case
            const effectiveDirection = isAutoScrollTo ? 'to' : scrollDirection;
            const scrollOptions = calculatePosition(
              effectiveDirection,
              beforeScroll,
              scrollAmount,
              targetElForScrollTo,
            );

            // Perform scroll on appropriate target (humanized)
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

            // Wait for scroll to complete and get new position
            console.log(
              '[Scroll] Starting scroll animation with targetElement:',
              targetElement === window ? 'window' : (targetElement as Element).tagName,
            );

            // Add a timeout to ensure the Promise always resolves
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
            }, scrollCompletionDelay + 2000); // 2 seconds after expected completion

            setTimeout(() => {
              try {
                let afterScroll = getCurrentScroll(targetElement);

                // Visual feedback for scroll (singleton pattern)
                // Remove any existing scroll indicator first to prevent buildup
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

                // Add animation style
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

                setTimeout(() => {
                  scrollIndicator.remove();
                }, indicatorDuration);

                // Check if scroll actually happened
                let scrolledX = Math.abs(afterScroll.x - beforeScroll.x);
                let scrolledY = Math.abs(afterScroll.y - beforeScroll.y);

                let message = '';
                // If the window did not scroll, try a smart fallback to a scrollable container
                if (
                  scrolledX === 0 &&
                  scrolledY === 0 &&
                  targetElement === window &&
                  (scrollDirection === 'down' ||
                    scrollDirection === 'up' ||
                    scrollDirection === 'top' ||
                    scrollDirection === 'bottom')
                ) {
                  // Force-scroll fallback: try extreme positions if computed max was inaccurate
                  if (scrollDirection === 'down' || scrollDirection === 'bottom') {
                    window.scrollTo({ top: Number.MAX_SAFE_INTEGER });
                  } else if (scrollDirection === 'up' || scrollDirection === 'top') {
                    window.scrollTo({ top: 0 });
                  }
                  // Re-measure quickly
                  afterScroll = getCurrentScroll(window);
                  scrolledX = Math.abs(afterScroll.x - beforeScroll.x);
                  scrolledY = Math.abs(afterScroll.y - beforeScroll.y);
                }

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
                    const s = getComputedStyle(el as Element);
                    const scrollable =
                      s.overflowY === 'auto' ||
                      s.overflowY === 'scroll' ||
                      s.overflow === 'auto' ||
                      s.overflow === 'scroll';
                    return (
                      scrollable &&
                      (el as Element).scrollHeight > (el as Element).clientHeight &&
                      (el as HTMLElement).offsetParent !== null
                    );
                  }) as Element[];
                  if (candidates.length > 0) {
                    // Choose the tallest scrollable container as the most likely main scroller
                    candidates.sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight));
                    const mainScroller = candidates[0];
                    const beforeInner = getCurrentScroll(mainScroller);
                    const innerOpts: ScrollToOptions = { behavior: 'smooth' };
                    if (scrollDirection === 'down' || scrollDirection === 'bottom') {
                      innerOpts.top = beforeInner.maxY;
                    } else if (scrollDirection === 'up' || scrollDirection === 'top') {
                      innerOpts.top = 0;
                    }
                    // Humanized inner scroll
                    const innerTarget = typeof innerOpts.top === 'number' ? innerOpts.top : beforeInner.y;
                    const innerDuration = animateScrollY(mainScroller, beforeInner.y, innerTarget) + 120;
                    // Re-measure after a short delay
                    setTimeout(
                      () => {
                        const afterInner = getCurrentScroll(mainScroller);
                        const innerScrolledY = Math.abs(afterInner.y - beforeInner.y);
                        const innerScrolledX = Math.abs(afterInner.x - beforeInner.x);
                        const usedName = `${mainScroller.tagName}${(mainScroller as HTMLElement).id ? `#${(mainScroller as HTMLElement).id}` : ''}`;
                        const fallbackResult = {
                          success: true,
                          message:
                            innerScrolledY > 0 || innerScrolledX > 0
                              ? `Scrolled ${scrollDirection} within main container ${usedName}`
                              : 'No scroll occurred in main container (maybe already at bounds)'.trim(),
                          scrollInfo: {
                            target: usedName,
                            direction: scrollDirection,
                            before: { x: Math.round(beforeInner.x), y: Math.round(beforeInner.y) },
                            after: { x: Math.round(afterInner.x), y: Math.round(afterInner.y) },
                            scrolled: { x: Math.round(innerScrolledX), y: Math.round(innerScrolledY) },
                            max: { x: Math.round(beforeInner.maxX), y: Math.round(beforeInner.maxY) },
                          },
                        } as ScrollResult;
                        clearTimeout(timeoutId);
                        resolve(fallbackResult);
                      },
                      Math.max(400, scrollCompletionDelay, innerDuration),
                    );
                    return; // Defer resolution to inner fallback
                  }

                  // Second fallback: walk ancestors from the viewport center element
                  const center = document.elementFromPoint(
                    Math.floor(window.innerWidth / 2),
                    Math.floor(window.innerHeight / 2),
                  );
                  let walker: Element | null = (center as Element) || null;
                  while (walker) {
                    const s = getComputedStyle(walker);
                    const scrollable =
                      (s.overflowY === 'auto' || s.overflowY === 'scroll') && walker.scrollHeight > walker.clientHeight;
                    if (scrollable) {
                      const beforeAnc = getCurrentScroll(walker as Element);
                      const ancOpts: ScrollToOptions = { behavior: 'smooth' };
                      if (scrollDirection === 'down' || scrollDirection === 'bottom') ancOpts.top = beforeAnc.maxY;
                      if (scrollDirection === 'up' || scrollDirection === 'top') ancOpts.top = 0;
                      const ancTarget = typeof ancOpts.top === 'number' ? ancOpts.top : beforeAnc.y;
                      const ancDuration = animateScrollY(walker as Element, beforeAnc.y, ancTarget) + 120;
                      setTimeout(
                        () => {
                          if (!walker) {
                            clearTimeout(timeoutId);
                            resolve({ success: false, message: 'Scrollable container disappeared during scroll' });
                            return;
                          }
                          const afterAnc = getCurrentScroll(walker as Element);
                          const dY = Math.abs(afterAnc.y - beforeAnc.y);
                          const usedName = `${walker.tagName}${(walker as HTMLElement).id ? `#${(walker as HTMLElement).id}` : ''}`;
                          const fallbackResult2 = {
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
                          } as ScrollResult;
                          clearTimeout(timeoutId);
                          resolve(fallbackResult2);
                        },
                        Math.max(400, scrollCompletionDelay, ancDuration),
                      );
                      return;
                    }
                    walker = walker.parentElement;
                  }
                }

                if (scrolledX === 0 && scrolledY === 0) {
                  // Special-case: page not scrollable
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
                    if (isAutoScrollTo) {
                      message = `Auto-scrolled to element (element was not scrollable)`;
                    } else {
                      message = `Scrolled to element`;
                    }
                    if (scrolledY > 0) message += ` ${Math.round(scrolledY)}px vertically`;
                    if (scrolledX > 0) message += ` ${Math.round(scrolledX)}px horizontally`;
                  } else {
                    message = `Scrolled ${scrollDirection}`;
                    if (scrolledY > 0) message += ` ${Math.round(scrolledY)}px vertically`;
                    if (scrolledX > 0) message += ` ${Math.round(scrolledX)}px horizontally`;
                  }
                }

                const result = {
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
                clearTimeout(timeoutId); // Clear the timeout since we're resolving successfully
                resolve(result);
              } catch (innerError) {
                console.error('[Scroll] Error in scroll completion:', innerError);
                clearTimeout(timeoutId); // Clear the timeout
                resolve({
                  success: false,
                  message: `Error during scroll completion: ${(innerError as Error).message || 'Unknown error'}`,
                });
              }
            }, effectiveDelay); // Wait for animation to complete
          } catch (error) {
            console.error('[Scroll] Error in script execution:', error);
            resolve({
              success: false,
              message: `Error scrolling: ${(error as Error).message || 'Unknown error'}`,
            });
          }
        });
      },
      args: [cssSelector, direction, amount, scrollTo, SCROLL_COMPLETION_DELAY, INDICATOR_DURATION] as [
        string,
        string,
        number,
        boolean,
        number,
        number,
      ],
    });

    const results = await Promise.race([
      execPromise,
      new Promise<any>(resolve =>
        setTimeout(() => resolve([{ result: { success: false, message: 'Timeout while scrolling' } }]), 10000),
      ),
    ]);

    debug.log('[Scroll] Script execution results:', results);

    if (results && results[0]?.result) {
      const result = results[0].result;
      debug.log('[Scroll] Script result:', result);

      if (result.success) {
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
      } else {
        return {
          status: 'error',
          message: result.message,
        };
      }
    }

    debug.error('[Scroll] No results from script execution or invalid result structure');
    return {
      status: 'error',
      message: 'Unable to scroll - no results from script execution',
    };
  } catch (error) {
    debug.error('[Scroll] Error scrolling:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
