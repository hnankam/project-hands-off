import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

/**
 * Result type for click element operation
 */
interface ClickElementResult {
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
  try {
    debug.log('[ClickElement] Clicking element with selector:', cssSelector, 'autoMoveCursor:', autoMoveCursor);
    if (!cssSelector || cssSelector.trim().length === 0) {
      return { status: 'error', message: 'Empty CSS selector provided' };
    }

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    // Execute script in content page to find and click the element (with timeout)
    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (selector: string, moveCursor: boolean): any => {
        try {
          // Helper: Parse and query shadow DOM selectors with >> notation
          const querySelectorWithShadowDOM = (selector: string): Element | null => {
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
          };

          // Helper: iterate through ancestors, including across shadow boundaries
          const forEachAncestor = (start: Element, cb: (el: Element) => void) => {
            let node: Element | null = start;
            const visited = new Set<Element>();
            while (node && !visited.has(node)) {
              visited.add(node);
              cb(node);
              const rootNode: Node | Document | ShadowRoot = (node.getRootNode && (node.getRootNode() as Node)) || document;
              const maybeHost = (rootNode as any as ShadowRoot).host as Element | undefined;
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
            const tag = el.tagName.toLowerCase();
            const attr = (name: string) => (el as HTMLElement).getAttribute?.(name);
            const has = (name: string) => (el as HTMLElement).hasAttribute?.(name);
            const role = attr('role') || '';
            const tabindex = Number((el as HTMLElement).getAttribute('tabindex') || 'NaN');
            const style = (el as HTMLElement).style?.pointerEvents || '';
            if (style === 'none') return false;

            const interactiveTags = new Set([
              'a', 'button', 'input', 'textarea', 'select', 'option', 'summary', 'label', 'details'
            ]);
            if (interactiveTags.has(tag)) return true;
            if (tag === 'a' && !!(el as HTMLAnchorElement).href) return true;
            if (has('onclick')) return true;
            if (has('aria-haspopup') || has('aria-controls')) return true;
            if (!Number.isNaN(tabindex) && tabindex >= 0) return true;
            if (/^(button|link|menuitem|tab|checkbox|radio|switch)$/i.test(role)) return true;
            return false;
          };

          // Utility: walk up to the best clickable ancestor commonly used across sites
          const getBestClickableTarget = (start: Element): HTMLElement => {
            let el: Element | null = start;
            // Prefer the nearest ancestor that is clearly interactive
            const selector = [
              'a[href]',
              'button',
              'input:not([type="hidden"])',
              'textarea',
              'select',
              '[role="button"]',
              '[role="link"]',
              '[onclick]',
              '[tabindex]'
            ].join(',');
            const nearest = (start as HTMLElement).closest(selector) as HTMLElement | null;
            if (nearest) return nearest;
            // Otherwise climb until we hit something probably clickable
            while (el && el !== document.body && !isPotentiallyClickable(el)) el = el.parentElement;
            return (el as HTMLElement) || (start as HTMLElement);
          };

          // First, check if selector is syntactically valid by trying to use it
          try {
            // Test selector validity by attempting to parse and use it
            querySelectorWithShadowDOM(selector);
          } catch (selectorError) {
            return {
              success: false,
              message: `Invalid CSS selector syntax: "${selector}". Error: ${(selectorError as Error).message}`,
            };
          }

          // Find element using shadow-aware query
          let element = querySelectorWithShadowDOM(selector);
          const foundInShadowDOM = selector.includes(' >> ');
          const shadowHostInfo = foundInShadowDOM ? selector.split(' >> ')[0].trim() : '';

          if (!element) {
            const res = {
              success: false,
              message: `No element found with selector: "${selector}". Please analyze the HTML and provide a valid CSS selector.`,
            };
            console.log('[ClickElement] No element found with selector:', selector);
            console.log('[ClickElement] Returning error result:', res);
            return res;
          }

          // At this point, element is guaranteed to be non-null
          const targetElement = element;

          // Check if element is visible
          const computedStyle = window.getComputedStyle(targetElement);
          if (
            computedStyle.display === 'none' ||
            computedStyle.visibility === 'hidden' ||
            computedStyle.opacity === '0'
          ) {
            const res = {
              success: false,
              message: `Element found but is hidden: "${selector}"`,
            };
            console.log('[ClickElement] Element found but is hidden:', selector);
            return res;
          }

          // Scroll into view (using 'nearest' to avoid viewport distortion)
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

          // Return promise that resolves after click completes
          return new Promise(resolve => {
            // Function to perform the actual click
            const performClick = () => {
              // Brief highlight before clicking
              const originalStyle = (targetElement as HTMLElement).style.cssText;
              (targetElement as HTMLElement).style.cssText += `
              outline: 3px solid #FF5722 !important;
              outline-offset: 4px !important;
              background-color: rgba(255, 87, 34, 0.1) !important;
            `;

              setTimeout(() => {
                (targetElement as HTMLElement).style.cssText = originalStyle;

                // Focus the element (important for forms and keyboard events)
                (targetElement as HTMLElement).focus();

                // CRITICAL FIX: Verify what element is ACTUALLY at the target position
                // This prevents clicking wrong element due to overlapping children/parents
                const rect = targetElement.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const actualElementAtPoint = document.elementFromPoint(centerX, centerY);
                
                // Determine which element to click
                let elementToClick = targetElement;
                let clickNote = '';
                
                if (actualElementAtPoint && actualElementAtPoint !== targetElement) {
                  // Element at cursor is different from selector target
                  const isChild = targetElement.contains(actualElementAtPoint);
                  const isParent = actualElementAtPoint.contains(targetElement);
                  
                  if (isChild) {
                    // Child element covers the center - click the child (what user would click)
                    elementToClick = actualElementAtPoint;
                    clickNote = ' [clicked child at cursor position]';
                    console.log('[ClickElement] Clicking child element at cursor:', {
                      selectorTarget: targetElement.tagName + (targetElement.id ? '#' + targetElement.id : ''),
                      actualAtPoint: actualElementAtPoint.tagName + (actualElementAtPoint.id ? '#' + actualElementAtPoint.id : ''),
                    });
                  } else if (isParent) {
                    // Target is child of element at point - click the target (more specific)
                    elementToClick = targetElement;
                    clickNote = ' [kept target, more specific than parent]';
                    console.log('[ClickElement] Keeping target (more specific):', {
                      selectorTarget: targetElement.tagName + (targetElement.id ? '#' + targetElement.id : ''),
                      parentAtPoint: actualElementAtPoint.tagName + (actualElementAtPoint.id ? '#' + actualElementAtPoint.id : ''),
                    });
                  } else {
                    // Completely different element - possible overlay
                    clickNote = ' [WARNING: different element at cursor]';
                    console.warn('[ClickElement] Different element at cursor position:', {
                      selectorTarget: targetElement.tagName + (targetElement.id ? '#' + targetElement.id : ''),
                      actualAtPoint: actualElementAtPoint.tagName + (actualElementAtPoint.id ? '#' + actualElementAtPoint.id : ''),
                    });
                  }
                }

                // Enhanced clicking for modern web apps
                const clickElement = (el: Element) => {
                  // Resolve the most likely clickable target for generic sites
                  const primaryTarget = getBestClickableTarget(el) || (el as HTMLElement);
                  // If the element is a label tied to a control, prefer the control
                  const htmlEl = primaryTarget as HTMLElement;
                  let finalTarget: HTMLElement = htmlEl;
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

                  // Create comprehensive event sequence including pointer + mouse + focus
                  const events = [
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

                  // Dispatch all events in sequence
                  events.forEach(event => finalTarget.dispatchEvent(event));

                  // Also try clicking the nearest clickable ancestor (common with icons inside buttons)
                  const ancestor = (finalTarget as HTMLElement).closest(
                    'a[href],button,[role="button"],[onclick],[data-action],[tabindex],*[aria-controls],*[aria-haspopup]'
                  ) as HTMLElement | null;
                  if (ancestor && ancestor !== finalTarget) {
                    const aRect = ancestor.getBoundingClientRect();
                    const ax = aRect.left + aRect.width / 2;
                    const ay = aRect.top + aRect.height / 2;

                    const ancestorEvents = [
                      new PointerEvent('pointerover', { bubbles: true, cancelable: true, composed: true, clientX: ax, clientY: ay, pointerType: 'mouse' }),
                      new MouseEvent('mouseenter', { view: window, bubbles: true, cancelable: true, composed: true, clientX: ax, clientY: ay }),
                      new MouseEvent('mouseover', { view: window, bubbles: true, cancelable: true, composed: true, clientX: ax, clientY: ay }),
                      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, clientX: ax, clientY: ay, pointerType: 'mouse', button: 0 }),
                      new MouseEvent('mousedown', { view: window, bubbles: true, cancelable: true, composed: true, clientX: ax, clientY: ay, button: 0 }),
                      new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true, clientX: ax, clientY: ay, pointerType: 'mouse', button: 0 }),
                      new MouseEvent('mouseup', { view: window, bubbles: true, cancelable: true, composed: true, clientX: ax, clientY: ay, button: 0 }),
                      new MouseEvent('click', { view: window, bubbles: true, cancelable: true, composed: true, clientX: ax, clientY: ay, button: 0 }),
                    ];
                    ancestorEvents.forEach(ev => ancestor.dispatchEvent(ev));

                    // If it's a link or button, also invoke native click
                    try { (ancestor as HTMLElement).click?.(); } catch {}
                  }

                  // Keyboard fallback (some UIs respond to Enter/Space on focused elements)
                  try {
                    const kdEnter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
                    const kuEnter = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
                    el.dispatchEvent(kdEnter);
                    el.dispatchEvent(kuEnter);

                    const kdSpace = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
                    const kuSpace = new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
                    el.dispatchEvent(kdSpace);
                    el.dispatchEvent(kuSpace);
                  } catch {}

                  // Fallback: call native click to trigger default handlers
                  try { (finalTarget as HTMLElement).click?.(); } catch {}
                };

                // Click the verified element (what's actually at the cursor)
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

                // Cleanup and resolve after animation completes
                setTimeout(() => {
                  clickFeedback.remove();

                  const successResult = {
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
                }, 1000); // Keep ripple visible for 1 second
              }, 800); // Wait 800ms to show highlight before clicking
            };

            // Move cursor to element if requested, then perform click
            if (moveCursor) {
              // Inline cursor movement logic (since shared utilities aren't available in content script)
              try {
                // Get or create cursor tracking object in window (preserve existing state)
                if (!(window as any).__copilotCursorState__) {
                  (window as any).__copilotCursorState__ = {
                    lastX: window.innerWidth / 2,
                    lastY: window.innerHeight / 2,
                    hideTimeout: null,
                  };
                }
                const cursorState = (window as any).__copilotCursorState__;

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

                // Animation constants
                const ANIMATION_STEPS = 30;
                const STEP_DURATION = 20;
                const CURSOR_DELAY_NEW = 200;
                const CURSOR_DELAY_EXISTING = 0;

                // Animate cursor to element position
                const animateCursor = () => {
                  const stepX = (centerX - cursorState.lastX) / ANIMATION_STEPS;
                  const stepY = (centerY - cursorState.lastY) / ANIMATION_STEPS;
                  let step = 0;

                  const moveStep = () => {
                    if (step < ANIMATION_STEPS) {
                      cursorState.lastX += stepX;
                      cursorState.lastY += stepY;

                      // Add slight randomness for natural movement
                      const randomX = (Math.random() - 0.5) * 2;
                      const randomY = (Math.random() - 0.5) * 2;

                      cursor!.style.left = cursorState.lastX + randomX + 'px';
                      cursor!.style.top = cursorState.lastY + randomY + 'px';
                      cursor!.style.opacity = '1';
                      cursor!.style.animation = 'none';

                      // Dispatch mousemove to trigger hover effects as cursor moves
                      const elemUnderCursor = document.elementFromPoint(cursorState.lastX, cursorState.lastY);
                      if (elemUnderCursor) {
                        // Propagate hover to ancestors so parent :hover effects apply
                        forEachAncestor(elemUnderCursor, target => {
                          target.dispatchEvent(new MouseEvent('mousemove', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                            clientX: cursorState.lastX,
                            clientY: cursorState.lastY,
                          }));
                        });
                      }

                      step++;
                      setTimeout(moveStep, STEP_DURATION);
                    } else {
                      // Final position - animation complete
                      cursorState.lastX = centerX;
                      cursorState.lastY = centerY;
                      cursor!.style.left = centerX + 'px';
                      cursor!.style.top = centerY + 'px';
                      cursor!.style.animation = 'copilotPulse 1.2s ease-in-out infinite';

                      // Trigger hover effects at final position
                      const elemAtCursor = document.elementFromPoint(centerX, centerY);
                      if (elemAtCursor) {
                        // Dispatch hover chain to element and its ancestors
                        forEachAncestor(elemAtCursor, target => {
                          target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true, composed: true, clientX: centerX, clientY: centerY, pointerType: 'mouse' }));
                          target.dispatchEvent(new MouseEvent('mouseenter', { view: window, bubbles: true, cancelable: true, composed: true, clientX: centerX, clientY: centerY }));
                          target.dispatchEvent(new MouseEvent('mouseover', { view: window, bubbles: true, cancelable: true, composed: true, clientX: centerX, clientY: centerY }));
                        });
                      }

                      // Perform click after cursor animation completes
                      performClick();
                    }
                  };

                  moveStep();
                };

                // Start cursor animation with delay for new cursor
                setTimeout(animateCursor, isNewCursor ? CURSOR_DELAY_NEW : CURSOR_DELAY_EXISTING);
              } catch (cursorError) {
                console.log('[ClickElement] Cursor movement error:', cursorError);
                // If cursor movement fails, still perform the click
                performClick();
              }
            } else {
              // No cursor movement needed, perform click immediately
              performClick();
            }

            // Ensure animation style exists (singleton pattern to prevent memory leaks)
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
          const res = {
            success: false,
            message: `Unexpected error while clicking element: "${selector}". Error: ${(error as Error).message || 'Unknown error'}`,
          };
          console.log('[ClickElement] Unexpected error:', selector, error);
          return res;
        }
      },
      args: [cssSelector, autoMoveCursor] as [string, boolean],
    });

    const results = await Promise.race([
      execPromise,
      new Promise<any>(resolve =>
        setTimeout(() => resolve([{ result: { success: false, message: 'Timeout while clicking element' } }]), 8000),
      ),
    ]);

    if (results && results[0]?.result) {
      const result = results[0].result;
      debug.log('[ClickElement] Raw result from content script:', result);

      if (result.success && result.elementInfo) {
        const info = result.elementInfo;
        debug.log('[ClickElement] Returning success with element info:', info);
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
      } else {
        debug.log('[ClickElement] Returning error - success:', result.success, 'message:', result.message);
        return {
          status: 'error',
          message: `${result.message}\n\nTry being more specific or use a different description.`,
        };
      }
    }

    return {
      status: 'error',
      message: 'Unable to click element',
    };
  } catch (error) {
    debug.error('[ClickElement] Error clicking element:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
