import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

// Timing constants for drag and drop animation
const TIMING = {
  SCROLL_DELAY: 600,          // Time to wait for smooth scroll completion
  ANIMATION_DURATION: 1500,   // Duration of drag animation
  ANIMATION_SETUP_DELAY: 300, // Delay before starting drag animation
  DROP_EFFECT_DELAY: 200,     // Delay before showing drop effect
  CLEANUP_DELAY: 800          // Time to keep visual feedback before cleanup
};

// Visual styling constants
const VISUAL_STYLES = {
  INDICATOR_SIZE: 40,         // Size of drag indicator circle
  PATH_STROKE_WIDTH: 3,       // Width of drag path line
  OUTLINE_WIDTH: 3,           // Width of element outlines
  DROP_RIPPLE_SIZE: 60        // Size of drop ripple effect
};

/**
 * Result type for drag and drop operation
 */
interface DragAndDropResult {
  status: 'success' | 'error';
  message: string;
  dragInfo?: {
    source: {
      selector: string;
      tag: string;
      text: string;
      position: { x: number; y: number };
      foundInShadowDOM?: boolean;
      shadowHost?: string | null;
    };
    target: {
      selector: string;
      tag: string;
      text: string;
      position: { x: number; y: number };
      foundInShadowDOM?: boolean;
      shadowHost?: string | null;
    };
    usedDropPoint?: { x: number; y: number; mode: string };
  };
}

// Extra options to support dragging from component lists to canvases
export interface DragAndDropOptions {
  dropPoint?:
    | { mode: 'offset'; x: number; y: number }            // from target top-left in px
    | { mode: 'percent'; x: number; y: number }           // 0..1 relative to target size
    | { mode: 'absolute'; x: number; y: number }          // viewport client coords
    | { mode: 'center'; x?: number; y?: number };         // center, optional offsets
  dataTransfer?: Record<string, string>;                   // additional payload
  effectAllowed?: DataTransfer['effectAllowed'];
  dropEffect?: DataTransfer['dropEffect'];
  dragImageSelector?: string;                              // element to use as drag image
}

/**
 * Drag and drop an element from source to target location
 * @param sourceCssSelector - CSS selector for the element to drag
 * @param targetCssSelector - CSS selector for the drop target element
 * @param offsetX - Optional horizontal offset from target center (default: 0)
 * @param offsetY - Optional vertical offset from target center (default: 0)
 * @returns Promise with status and message object
 */
export async function handleDragAndDrop(
  sourceCssSelector: string,
  targetCssSelector: string,
  offsetX: number = 0,
  offsetY: number = 0,
  options?: DragAndDropOptions
): Promise<DragAndDropResult> {
  try {
    debug.log('[DragAndDrop] Drag and drop:', { sourceCssSelector, targetCssSelector, offsetX, offsetY, options });

    if (!sourceCssSelector || !sourceCssSelector.trim()) {
      return { status: 'error', message: 'Source selector is empty' };
    }
    if (!targetCssSelector || !targetCssSelector.trim()) {
      return { status: 'error', message: 'Target selector is empty' };
    }
    
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return {
        status: 'error',
        message: 'Unable to access current tab'
      };
    }

    // Execute script in content page to perform drag and drop
    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (sourceSelector: string, targetSelector: string, xOffset: number, yOffset: number, timing: any, visualStyles: any, extraOpts?: any): any => {
        // Helper function to check if element is visible
        const isVisible = (el: Element): boolean => {
          const style = window.getComputedStyle(el);
          const hasBox = (el as HTMLElement).offsetWidth > 0 || (el as HTMLElement).offsetHeight > 0 || el.getClientRects().length > 0;
          return hasBox && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        };

        // Helper function for delays
        const delay = (ms: number): Promise<void> => {
          return new Promise(resolve => setTimeout(resolve, ms));
        };

        try {
          // Helper function to find element in main DOM or Shadow DOM
          const findElement = (selector: string, elementName: string) => {
            // First try to find element in main DOM
            let element = document.querySelector(selector);
            let foundInShadowDOM = false;
            let shadowHostInfo = '';
            
            // If not found in main DOM, search in Shadow DOM
            if (!element) {
              console.log(`[DragAndDrop] ${elementName} element not found in main DOM, searching Shadow DOM...`);
              
              // Search through all shadow roots with early exit
              for (const hostElement of Array.from(document.querySelectorAll('*'))) {
                if (hostElement.shadowRoot && !element) {
                  try {
                    const shadowElement = hostElement.shadowRoot.querySelector(selector);
                    if (shadowElement) {
                      element = shadowElement;
                      foundInShadowDOM = true;
                      shadowHostInfo = `${hostElement.tagName}${hostElement.id ? '#' + hostElement.id : ''}${hostElement.className ? '.' + hostElement.className.split(' ')[0] : ''}`;
                      console.log(`[DragAndDrop] Found ${elementName} element in Shadow DOM:`, shadowHostInfo);
                      break; // Early exit - stop searching once element is found
                    }
                  } catch (shadowError) {
                    // Ignore shadow DOM query errors (invalid selectors, etc.)
                    console.log(`[DragAndDrop] Shadow DOM query error for ${elementName}:`, shadowError);
                  }
                }
              }
            }
            
            return { element, foundInShadowDOM, shadowHostInfo };
          };

          // Find source element
          const sourceResult = findElement(sourceSelector, 'source');
          const sourceElement = sourceResult.element;
          if (!sourceElement) {
            return { 
              success: false, 
              message: `Source element not found with selector: "${sourceSelector}" in main DOM or Shadow DOM. Please analyze the HTML and provide a valid CSS selector.` 
            };
          }

          // Find target element
          const targetResult = findElement(targetSelector, 'target');
          const targetElement = targetResult.element;
          if (!targetElement) {
            return { 
              success: false, 
              message: `Target element not found with selector: "${targetSelector}" in main DOM or Shadow DOM. Please analyze the HTML and provide a valid CSS selector.` 
            };
          }

          // Check if elements are visible
          if (!isVisible(sourceElement)) {
            return { 
              success: false, 
              message: `Source element is hidden: "${sourceSelector}"` 
            };
          }

          if (!isVisible(targetElement)) {
            return { 
              success: false, 
              message: `Target element is hidden: "${targetSelector}"` 
            };
          }

          // Main async function to perform drag and drop with proper cleanup
          return (async () => {
            // Variables for cleanup (declared outside try block)
            let dragIndicator: HTMLElement | null = null;
            let pathLine: SVGElement | null = null;
            let dropEffect: HTMLElement | null = null;
            let sourceOriginalStyle = '';
            let targetOriginalStyle = '';

            try {
              // Scroll source element into view
              sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
              await delay(timing.SCROLL_DELAY);
              
              // Scroll target element into view
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
              await delay(timing.SCROLL_DELAY);
              // Get element positions
              const sourceRect = sourceElement.getBoundingClientRect();
              const targetRect = targetElement.getBoundingClientRect();

              const sourceX = sourceRect.left + sourceRect.width / 2;
              const sourceY = sourceRect.top + sourceRect.height / 2;
            // Resolve drop coordinates according to options
            let targetX = targetRect.left + targetRect.width / 2 + xOffset;
            let targetY = targetRect.top + targetRect.height / 2 + yOffset;
            let usedMode = 'center+offset';
            if (extraOpts && extraOpts.dropPoint) {
              const dp = extraOpts.dropPoint as any;
              if (dp.mode === 'offset') {
                targetX = targetRect.left + dp.x;
                targetY = targetRect.top + dp.y;
                usedMode = 'offset';
              } else if (dp.mode === 'percent') {
                targetX = targetRect.left + Math.max(0, Math.min(1, dp.x)) * targetRect.width;
                targetY = targetRect.top + Math.max(0, Math.min(1, dp.y)) * targetRect.height;
                usedMode = 'percent';
              } else if (dp.mode === 'absolute') {
                targetX = dp.x;
                targetY = dp.y;
                usedMode = 'absolute';
              } else if (dp.mode === 'center') {
                targetX = targetRect.left + targetRect.width / 2 + (dp.x || 0);
                targetY = targetRect.top + targetRect.height / 2 + (dp.y || 0);
                usedMode = 'center';
              }
            }

              // Save original styles for cleanup
              sourceOriginalStyle = (sourceElement as HTMLElement).style.cssText;
              targetOriginalStyle = (targetElement as HTMLElement).style.cssText;

              // Mark elements with data attribute for cleanup
              (sourceElement as HTMLElement).setAttribute('data-copilot-drag-source', 'true');
              (targetElement as HTMLElement).setAttribute('data-copilot-drag-target', 'true');

              // Highlight source element
              (sourceElement as HTMLElement).style.cssText += `
                outline: ${visualStyles.OUTLINE_WIDTH}px solid #FF9800 !important;
                outline-offset: 4px !important;
                background-color: rgba(255, 152, 0, 0.1) !important;
                cursor: grabbing !important;
              `;

              // Highlight target element
              (targetElement as HTMLElement).style.cssText += `
                outline: ${visualStyles.OUTLINE_WIDTH}px dashed #4CAF50 !important;
                outline-offset: 4px !important;
                background-color: rgba(76, 175, 80, 0.1) !important;
              `;

              // Create visual drag indicator
              dragIndicator = document.createElement('div');
              dragIndicator.id = '__copilot_drag_indicator__';
              dragIndicator.style.cssText = `
                position: fixed;
                left: ${sourceX}px;
                top: ${sourceY}px;
                width: ${visualStyles.INDICATOR_SIZE}px;
                height: ${visualStyles.INDICATOR_SIZE}px;
                background: linear-gradient(135deg, #FF9800 0%, #FF5722 100%);
                border-radius: 50%;
                pointer-events: none;
                z-index: 2147483647;
                box-shadow: 0 4px 12px rgba(255, 152, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                color: white;
                transition: all 0.05s linear;
              `;
              dragIndicator.textContent = '⇄';
              document.body.appendChild(dragIndicator);

              // Create path line
              pathLine = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              pathLine.id = '__copilot_drag_path__';
              pathLine.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 2147483646;
              `;
              const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              path.setAttribute('stroke', '#FF9800');
              path.setAttribute('stroke-width', visualStyles.PATH_STROKE_WIDTH.toString());
              path.setAttribute('stroke-dasharray', '10,5');
              path.setAttribute('fill', 'none');
              path.setAttribute('d', `M ${sourceX} ${sourceY} L ${sourceX} ${sourceY}`);
              pathLine.appendChild(path);
              document.body.appendChild(pathLine);

              // Wait before starting animation
              await delay(timing.ANIMATION_SETUP_DELAY);

              // Animate drag movement & emit pointer/dragover moves for builder canvases
              const animateDrag = async (): Promise<void> => {
                const steps = 60;
                const stepDuration = timing.ANIMATION_DURATION / steps;

                for (let currentStep = 0; currentStep <= steps; currentStep++) {
                  const progress = currentStep / steps;
                  const easeProgress = progress < 0.5 
                    ? 2 * progress * progress 
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2; // Ease in-out

                  const currentX = sourceX + (targetX - sourceX) * easeProgress;
                  const currentY = sourceY + (targetY - sourceY) * easeProgress;

                  // Update drag indicator position
                  if (dragIndicator) {
                    dragIndicator.style.left = currentX + 'px';
                    dragIndicator.style.top = currentY + 'px';
                    dragIndicator.style.transform = `scale(${1 + Math.sin(progress * Math.PI) * 0.3}) rotate(${progress * 360}deg)`;
                  }

                  // Update path
                  path.setAttribute('d', `M ${sourceX} ${sourceY} Q ${(sourceX + currentX) / 2} ${Math.min(sourceY, currentY) - 50} ${currentX} ${currentY}`);

                  // Emit pointer move along the path
                  const moveEvt = new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: currentX,
                    clientY: currentY,
                    pointerType: 'mouse'
                  });
                  document.dispatchEvent(moveEvt);

                  // Feed continuous dragover coordinates to the canvas/target
                  targetElement.dispatchEvent(new DragEvent('dragover', {
                    bubbles: true,
                    cancelable: true,
                    clientX: currentX,
                    clientY: currentY,
                    dataTransfer,
                  }));

                  await delay(stepDuration);
                }
              };

              // Perform the drag animation
              await animateDrag();

              // Wait before drop effect
              await delay(timing.DROP_EFFECT_DELAY);
              // Create drop effect
              dropEffect = document.createElement('div');
              dropEffect.id = '__copilot_drop_effect__';
              dropEffect.style.cssText = `
                position: fixed;
                left: ${targetX}px;
                top: ${targetY}px;
                width: ${visualStyles.DROP_RIPPLE_SIZE}px;
                height: ${visualStyles.DROP_RIPPLE_SIZE}px;
                border: 4px solid #4CAF50;
                border-radius: 50%;
                pointer-events: none;
                z-index: 2147483647;
                animation: dropRipple 0.6s ease-out;
                transform: translate(-50%, -50%);
              `;

              // Add animation style (if not already present)
              if (!document.getElementById('__copilot_drag_drop_style__')) {
                const styleEl = document.createElement('style');
                styleEl.id = '__copilot_drag_drop_style__';
                styleEl.textContent = `
                  @keyframes dropRipple {
                    0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
                  }
                `;
                document.head.appendChild(styleEl);
              }

              document.body.appendChild(dropEffect);

            // Dispatch drag and drop events with data
              const dataTransfer = new DataTransfer();
              // Add drag data for better compatibility
              dataTransfer.setData('text/html', sourceElement.outerHTML);
              dataTransfer.setData('text/plain', (sourceElement.textContent || '').trim());
              dataTransfer.effectAllowed = 'move';
            if (extraOpts && extraOpts.effectAllowed) dataTransfer.effectAllowed = extraOpts.effectAllowed;
            if (extraOpts && extraOpts.dropEffect) dataTransfer.dropEffect = extraOpts.dropEffect;
            if (extraOpts && extraOpts.dataTransfer) {
              try {
                for (const [k, v] of Object.entries(extraOpts.dataTransfer)) {
                  dataTransfer.setData(k, String(v));
                }
              } catch {}
            }
              // Ensure draggable attribute for HTML5 DnD sources
              if (!(sourceElement as HTMLElement).draggable) {
                (sourceElement as HTMLElement).setAttribute('draggable', 'true');
              }

            // Optional custom drag image
            if (extraOpts && extraOpts.dragImageSelector) {
              const imgEl = document.querySelector(extraOpts.dragImageSelector) as Element | null;
              if (imgEl) {
                const r = (imgEl as HTMLElement).getBoundingClientRect();
                dataTransfer.setDragImage(imgEl as any, r.width / 2, r.height / 2);
              }
            }
              
              // Dragstart on source
              sourceElement.dispatchEvent(new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer,
                clientX: sourceX,
                clientY: sourceY
              }));

              // Suggest drop allowance via preventing default on synthetic dragover if no handlers
              targetElement.addEventListener('dragover', (e) => e.preventDefault(), { once: true });

              // Dragenter on target
              targetElement.dispatchEvent(new DragEvent('dragenter', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer,
                clientX: targetX,
                clientY: targetY
              }));

              // Dragover on target
              targetElement.dispatchEvent(new DragEvent('dragover', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer,
                clientX: targetX,
                clientY: targetY
              }));

              // Also emit a few extra dragover events to mimic real dragging
              for (let i = 0; i < 3; i++) {
                await delay(20);
                targetElement.dispatchEvent(new DragEvent('dragover', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer: dataTransfer,
                  clientX: targetX,
                  clientY: targetY
                }));
              }

              // Drop on target
              targetElement.dispatchEvent(new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer,
                clientX: targetX,
                clientY: targetY
              }));

              // Dragend on source
              sourceElement.dispatchEvent(new DragEvent('dragend', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer,
                clientX: targetX,
                clientY: targetY
              }));

              // Also dispatch mouse/pointer events for compatibility
              sourceElement.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: sourceX,
                clientY: sourceY,
                button: 0
              }));
              sourceElement.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                clientX: sourceX,
                clientY: sourceY,
                pointerType: 'mouse'
              }));

              targetElement.dispatchEvent(new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                clientX: targetX,
                clientY: targetY,
                button: 0
              }));
              targetElement.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                clientX: targetX,
                clientY: targetY,
                pointerType: 'mouse'
              }));

              // Wait before cleanup
              await delay(timing.CLEANUP_DELAY);

              // Create success message with Shadow DOM info
              const sourceShadowInfo = sourceResult.foundInShadowDOM ? ` (source in Shadow DOM: ${sourceResult.shadowHostInfo})` : '';
              const targetShadowInfo = targetResult.foundInShadowDOM ? ` (target in Shadow DOM: ${targetResult.shadowHostInfo})` : '';
              const successMessage = `Drag and drop completed${sourceShadowInfo}${targetShadowInfo}`;

              // Return success
              return {
                success: true,
                message: successMessage,
                dragInfo: {
                  source: {
                    selector: sourceSelector,
                    tag: sourceElement.tagName,
                    text: (sourceElement.textContent || '').trim().substring(0, 50),
                    position: { x: Math.round(sourceX), y: Math.round(sourceY) },
                    foundInShadowDOM: sourceResult.foundInShadowDOM,
                    shadowHost: sourceResult.foundInShadowDOM ? sourceResult.shadowHostInfo : null
                  },
                  target: {
                    selector: targetSelector,
                    tag: targetElement.tagName,
                    text: (targetElement.textContent || '').trim().substring(0, 50),
                    position: { x: Math.round(targetX), y: Math.round(targetY) },
                    foundInShadowDOM: targetResult.foundInShadowDOM,
                    shadowHost: targetResult.foundInShadowDOM ? targetResult.shadowHostInfo : null
                  },
                  usedDropPoint: { x: Math.round(targetX), y: Math.round(targetY), mode: usedMode }
                }
              };
            } finally {
              // CRITICAL: Always cleanup, even if error occurs
              if (dragIndicator) dragIndicator.remove();
              if (pathLine) pathLine.remove();
              if (dropEffect) dropEffect.remove();
              if (sourceOriginalStyle) {
                (sourceElement as HTMLElement).style.cssText = sourceOriginalStyle;
                (sourceElement as HTMLElement).removeAttribute('data-copilot-drag-source');
              }
              if (targetOriginalStyle) {
                (targetElement as HTMLElement).style.cssText = targetOriginalStyle;
                (targetElement as HTMLElement).removeAttribute('data-copilot-drag-target');
              }
            }
          })();
        } catch (error) {
          return { 
            success: false, 
            message: `Error during drag and drop: ${(error as Error).message || 'Unknown error'}` 
          };
        }
      },
      args: [sourceCssSelector, targetCssSelector, offsetX, offsetY, TIMING, VISUAL_STYLES] as [string, string, number, number, typeof TIMING, typeof VISUAL_STYLES]
    });

    const results = await Promise.race([
      execPromise,
      new Promise<any>((resolve) => setTimeout(() => resolve([{ result: { success: false, message: 'Timeout during drag and drop' } }]), 15000))
    ]);

    if (results && results[0]?.result) {
      const result = results[0].result;
      debug.log('[DragAndDrop] Script result:', result);
      if (result.success && result.dragInfo) {
        return {
          status: 'success',
          message: result.message,
          dragInfo: {
            source: {
              selector: result.dragInfo.source.selector,
              tag: result.dragInfo.source.tag,
              text: result.dragInfo.source.text,
              position: result.dragInfo.source.position,
              foundInShadowDOM: result.dragInfo.source.foundInShadowDOM || false,
              shadowHost: result.dragInfo.source.shadowHost || null
            },
            target: {
              selector: result.dragInfo.target.selector,
              tag: result.dragInfo.target.tag,
              text: result.dragInfo.target.text,
              position: result.dragInfo.target.position,
              foundInShadowDOM: result.dragInfo.target.foundInShadowDOM || false,
              shadowHost: result.dragInfo.target.shadowHost || null
            }
          }
        };
      } else {
        return {
          status: 'error',
          message: result.message
        };
      }
    }

    return {
      status: 'error',
      message: 'Unable to perform drag and drop'
    };
  } catch (error) {
    debug.error('[DragAndDrop] Error during drag and drop:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}