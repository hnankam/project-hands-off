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
export async function handleClickElement(cssSelector: string, autoMoveCursor: boolean = true): Promise<ClickElementResult> {
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
        message: 'Unable to access current tab'
      };
    }

    // Execute script in content page to find and click the element (with timeout)
    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (selector: string, moveCursor: boolean): any => {
        try {
          // First, check if selector is syntactically valid by trying to use it
          try {
            // Test selector validity by attempting to use it
            document.querySelector(selector);
          } catch (selectorError) {
            return {
              success: false,
              message: `Invalid CSS selector syntax: "${selector}". Error: ${(selectorError as Error).message}`
            };
          }

          // First try to find element in main DOM
          let element = document.querySelector(selector);
          let foundInShadowDOM = false;
          let shadowHostInfo = '';
          
          // If not found in main DOM, search in Shadow DOM
          if (!element) {
            console.log('[ClickElement] Element not found in main DOM, searching Shadow DOM...');
            
            // Search through all shadow roots with early exit
            for (const hostElement of Array.from(document.querySelectorAll('*'))) {
              if (hostElement.shadowRoot && !element) {
                try {
                  const shadowElement = hostElement.shadowRoot.querySelector(selector);
                  if (shadowElement) {
                    element = shadowElement;
                    foundInShadowDOM = true;
                    shadowHostInfo = `${hostElement.tagName}${hostElement.id ? '#' + hostElement.id : ''}${hostElement.className ? '.' + hostElement.className.split(' ')[0] : ''}`;
                    console.log('[ClickElement] Found element in Shadow DOM:', shadowHostInfo);
                    break; // Early exit - stop searching once element is found
                  }
                } catch (shadowError) {
                  // Ignore shadow DOM query errors (invalid selectors, etc.)
                  console.log('[ClickElement] Shadow DOM query error:', shadowError);
                }
              }
            }
          }
          
          if (!element) {
            const res = { 
              success: false, 
              message: `No element found with selector: "${selector}" in main DOM or Shadow DOM. Please analyze the HTML and provide a valid CSS selector.` 
            };
            console.log('[ClickElement] No element found with selector in main DOM or Shadow DOM:', selector);
            console.log('[ClickElement] Returning error result:', res);
            return res;
          }

          // At this point, element is guaranteed to be non-null
          const targetElement = element;

          // Check if element is visible
          const computedStyle = window.getComputedStyle(targetElement);
          if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || computedStyle.opacity === '0') {
            const res = { 
              success: false, 
              message: `Element found but is hidden: "${selector}"` 
            };
            console.log('[ClickElement] Element found but is hidden:', selector);
            return res;
          }

          // Scroll into view (using 'nearest' to avoid viewport distortion)
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

          // Return promise that resolves after click completes
          return new Promise((resolve) => {
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

              // Get rect for visual feedback
              const rect = targetElement.getBoundingClientRect();

              // Enhanced clicking for modern web apps
              const clickElement = (el: Element) => {
                const elRect = el.getBoundingClientRect();
                const x = elRect.left + elRect.width / 2;
                const y = elRect.top + elRect.height / 2;

                // Create comprehensive event sequence including focus
                const events = [
                  new FocusEvent('focus', { bubbles: true, cancelable: true }),
                  new MouseEvent('mousedown', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                    button: 0
                  }),
                  new MouseEvent('mouseup', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                    button: 0
                  }),
                  new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                    button: 0
                  })
                ];

                // Dispatch all events in sequence
                events.forEach(event => el.dispatchEvent(event));
              };

              clickElement(targetElement);

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
                  message: `Clicked: "${(targetElement.textContent || targetElement.tagName).substring(0, 50)}"${foundInShadowDOM ? ` (in Shadow DOM: ${shadowHostInfo})` : ''}`,
                  elementInfo: {
                    tag: targetElement.tagName,
                    text: (targetElement.textContent || '').trim().substring(0, 100),
                    id: targetElement.id,
                    href: (targetElement as HTMLAnchorElement).href || null,
                    foundInShadowDOM: foundInShadowDOM,
                    shadowHost: foundInShadowDOM ? shadowHostInfo : null
                  }
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
                  hideTimeout: null
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

                    cursor!.style.left = (cursorState.lastX + randomX) + 'px';
                    cursor!.style.top = (cursorState.lastY + randomY) + 'px';
                    cursor!.style.opacity = '1';
                    cursor!.style.animation = 'none';

                    step++;
                    setTimeout(moveStep, STEP_DURATION);
                  } else {
                    // Final position - animation complete
                    cursorState.lastX = centerX;
                    cursorState.lastY = centerY;
                    cursor!.style.left = centerX + 'px';
                    cursor!.style.top = centerY + 'px';
                    cursor!.style.animation = 'copilotPulse 1.2s ease-in-out infinite';

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
            message: `Unexpected error while clicking element: "${selector}". Error: ${(error as Error).message || 'Unknown error'}` 
          };
          console.log('[ClickElement] Unexpected error:', selector, error);
          return res;
        }
      },
      args: [cssSelector, autoMoveCursor] as [string, boolean]
    });

    const results = await Promise.race([
      execPromise,
      new Promise<any>((resolve) => setTimeout(() => resolve([{ result: { success: false, message: 'Timeout while clicking element' } }]), 8000))
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
            shadowHost: info.shadowHost
          }
        };
      } else {
        debug.log('[ClickElement] Returning error - success:', result.success, 'message:', result.message);
        return {
          status: 'error',
          message: `${result.message}\n\nTry being more specific or use a different description.`
        };
      }
    }

    return {
      status: 'error',
      message: 'Unable to click element'
    };
  } catch (error) {
    debug.error('[ClickElement] Error clicking element:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

