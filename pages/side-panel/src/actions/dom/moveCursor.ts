import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

/**
 * Result type for move cursor operation
 */
interface MoveCursorResult {
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
 * Moves the cursor to a specific element on the current web page
 * @param cssSelector - A valid CSS selector string from the page HTML content
 * @returns Promise with status and message object
 */
export async function handleMoveCursorToElement(cssSelector: string): Promise<MoveCursorResult> {
  try {
    debug.log('[MoveCursor] Moving cursor to element with selector:', cssSelector);
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

    // Execute script in content page to find and highlight the element (with timeout)
    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (selector: string): any => {
        try {
          // Shadow DOM helper - supports >> notation
          const querySelectorWithShadowDOM = (selector: string): Element | null => {
            if (!selector.includes(' >> ')) {
              return document.querySelector(selector);
            }

            const parts = selector.split(' >> ');
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
              iPrev--; iNext--;
            }
            return {
              leaving: prev.slice(0, iPrev + 1), // from leaf up to divergence
              entering: next.slice(0, iNext + 1).reverse(), // from outermost new → leaf
            } as { leaving: Element[]; entering: Element[] };
          };

          // Dispatch helpers with correct bubbling/composed defaults
          const dispatchPointerMove = (el: Element, x: number, y: number) => {
            el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerType: 'mouse' }));
            el.dispatchEvent(new MouseEvent('mousemove', { view: window, bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
          };
          const dispatchEnterSequence = (targets: Element[], x: number, y: number) => {
            // outermost → leaf
            for (const t of targets) {
              t.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerType: 'mouse' }));
              t.dispatchEvent(new MouseEvent('mouseover', { view: window, bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
              t.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, cancelable: true, composed: true, clientX: x, clientY: y, pointerType: 'mouse' }));
              t.dispatchEvent(new MouseEvent('mouseenter', { view: window, bubbles: false, cancelable: true, composed: true, clientX: x, clientY: y }));
            }
          };
          const dispatchLeaveSequence = (targets: Element[], x: number, y: number, oldLeaf: Element | null) => {
            // pointerout/mouseout bubble from leaf; send once from old leaf if available
            if (oldLeaf) {
              oldLeaf.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerType: 'mouse' }));
              oldLeaf.dispatchEvent(new MouseEvent('mouseout', { view: window, bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
            }
            // pointerleave/mouseleave do not bubble; fire on each leaving element (leaf→outer)
            for (const t of targets) {
              t.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, cancelable: true, composed: true, clientX: x, clientY: y, pointerType: 'mouse' }));
              t.dispatchEvent(new MouseEvent('mouseleave', { view: window, bubbles: false, cancelable: true, composed: true, clientX: x, clientY: y }));
            }
          };

          // Hit testing helper (skip detached or null)
          const hitTest = (x: number, y: number): Element | null => {
            let el = document.elementFromPoint(x, y);
            // elementFromPoint already respects pointer-events; keep as-is but guard detached
            if (el && !(el as Element).isConnected) return null;
            return el;
          };

          // Find element using shadow-aware query
          let element = querySelectorWithShadowDOM(selector);
          const foundInShadowDOM = selector.includes(' >> ');
          const shadowHostInfo = foundInShadowDOM ? selector.split(' >> ')[0].trim() : '';

          if (!element) {
            return {
              success: false,
              message: `No element found with selector: "${selector}". Please analyze the HTML and provide a valid CSS selector.`,
            };
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
            return {
              success: false,
              message: `Element found but is hidden: "${selector}"`,
            };
          }

          // Scroll element into view smoothly (using 'nearest' to avoid viewport distortion)
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

          // Return promise that resolves after animation completes
          return new Promise(resolve => {
            // Wait for scroll to complete
            setTimeout(() => {
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

                // Animation constants
                const ANIMATION_DURATION = 600; // ms
                const CURSOR_DELAY_NEW = 200;
                const CURSOR_DELAY_EXISTING = 0;
                const HIGHLIGHT_DURATION = 5000;
                const AUTO_HIDE_DELAY = 300000;

                // Animate cursor to element position
                const animateCursor = () => {
                  const startX = cursorState.lastX;
                  const startY = cursorState.lastY;
                  let lastLeaf: Element | null = null;
                  let lastChain: Element[] = [];
                  let rafId = 0;

                  const frame = (tStart: number) => {
                    const tick = (now: number) => {
                      const elapsed = Math.min(ANIMATION_DURATION, now - tStart);
                      const progress = elapsed / (ANIMATION_DURATION || 1);
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
                      // Hit exactly what's under the cursor - events bubble naturally to parents
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
                          // Mirror cursor style
                          try {
                            const cur = window.getComputedStyle(hit as HTMLElement).cursor || 'default';
                            (cursor as HTMLElement).style.cursor = cur;
                          } catch {}
                        } else {
                          dispatchPointerMove(hit, x, y);
                        }
                      }

                      if (elapsed < ANIMATION_DURATION) {
                        rafId = requestAnimationFrame(tick);
                      } else {
                        // Finalize
                        cursorState.lastX = centerX;
                        cursorState.lastY = centerY;
                        // Perform final hover enter on the last target to ensure parity
                        if (hit) {
                          const { entering } = diffChains(lastChain, chain);
                          if (entering.length) dispatchEnterSequence(entering, centerX, centerY);
                          // Mirror cursor style from hovered element
                          try {
                            const cur = window.getComputedStyle(hit as HTMLElement).cursor || 'default';
                            (cursor as HTMLElement).style.cursor = cur;
                          } catch {}
                        }
                        // Continue completion logic
                      // Final position - animation complete
                        cursor!.style.left = centerX + 'px';
                        cursor!.style.top = centerY + 'px';
                        cursor!.style.animation = 'copilotPulse 1.2s ease-in-out infinite';

                        const elemAtCursor = document.elementFromPoint(centerX, centerY);
                        if (elemAtCursor) {
                          // Ensure final enter/move sequence
                          dispatchPointerMove(elemAtCursor, centerX, centerY);
                        }

                        // Auto-hide cursor after 5 minutes
                        cursorState.hideTimeout = setTimeout(() => {
                          if (cursor) {
                            cursor.style.animation = 'copilotFadeOut 0.5s ease-out forwards';
                            setTimeout(() => {
                              if (cursor) {
                                cursor.remove();
                              }
                            }, 500);
                          }
                        }, AUTO_HIDE_DELAY);

                        // Remove highlight after delay
                        setTimeout(() => {
                          (targetElement as HTMLElement).style.cssText = originalStyle;
                        }, HIGHLIGHT_DURATION);

                        // Resolve with success
                        resolve({
                          success: true,
                          message: `Cursor moved to: "${(targetElement.textContent || targetElement.tagName).substring(0, 50)}"${foundInShadowDOM ? ` (in Shadow DOM: ${shadowHostInfo})` : ''}`,
                          elementInfo: {
                            tag: targetElement.tagName,
                            text: (targetElement.textContent || '').trim().substring(0, 100),
                            id: targetElement.id,
                            className: targetElement.className,
                            foundInShadowDOM: foundInShadowDOM,
                            shadowHost: foundInShadowDOM ? shadowHostInfo : null,
                          },
                        });
                      }
                    };
                    rafId = requestAnimationFrame(now => tick(now));
                  };

                  requestAnimationFrame(start => frame(start));
                };

                // Start cursor animation with delay for new cursor
                setTimeout(animateCursor, isNewCursor ? CURSOR_DELAY_NEW : CURSOR_DELAY_EXISTING);
              } catch (error) {
                resolve({
                  success: false,
                  message: `Error moving cursor: ${(error as Error).message || 'Unknown error'}`,
                });
              }
            }, 600); // Wait for scroll to complete
          });
        } catch (error) {
          return {
            success: false,
            message: `Invalid CSS selector: "${selector}". Error: ${(error as Error).message || 'Unknown error'}`,
          };
        }
      },
      args: [cssSelector] as [string],
    });

    const results = await Promise.race([
      execPromise,
      new Promise<any>(resolve =>
        setTimeout(() => resolve([{ result: { success: false, message: 'Timeout while moving cursor' } }]), 8000),
      ),
    ]);

    if (results && results[0]?.result) {
      const result = results[0].result as any;
      if (result.success && result.elementInfo) {
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
      } else {
        return {
          status: 'error',
          message: `${result.message || 'Element not found'}\n\nTry being more specific or use a different description.`,
        };
      }
    }

    return {
      status: 'error',
      message: 'Unable to move cursor to element',
    };
  } catch (error) {
    debug.error('[MoveCursor] Error moving cursor:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
