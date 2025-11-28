/**
 * Drag and Drop Action
 *
 * Performs animated drag and drop operations between two elements.
 */

import { debug as baseDebug } from '@extension/shared';
import { QUERY_SELECTOR_SHADOW_DOM_CODE } from '../dom/shadowDOMHelper';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[DragAndDrop]';

/** Timeout for script execution in ms */
const SCRIPT_TIMEOUT_MS = 15000;

/** Content script injection lock timeout in ms */
const INJECTION_LOCK_TIMEOUT_MS = 5000;

/** Maximum text length for element descriptions */
const MAX_TEXT_LENGTH = 50;

/** Timing constants for drag and drop animation */
const TIMING = {
  SCROLL_DELAY: 600,
  ANIMATION_DURATION: 1500,
  ANIMATION_SETUP_DELAY: 300,
  DROP_EFFECT_DELAY: 200,
  CLEANUP_DELAY: 800,
} as const;

/** Visual styling constants */
const VISUAL_STYLES = {
  INDICATOR_SIZE: 40,
  PATH_STROKE_WIDTH: 3,
  OUTLINE_WIDTH: 3,
  DROP_RIPPLE_SIZE: 60,
} as const;

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

/** Position information */
interface Position {
  x: number;
  y: number;
}

/** Element drag info */
interface ElementDragInfo {
  selector: string;
  tag: string;
  text: string;
  position: Position;
  foundInShadowDOM?: boolean;
  shadowHost?: string | null;
}

/** Result type for drag and drop operation */
export interface DragAndDropResult {
  status: 'success' | 'error';
  message: string;
  dragInfo?: {
    source: ElementDragInfo;
    target: ElementDragInfo;
    usedDropPoint?: { x: number; y: number; mode: string };
  };
}

/** Drop point configuration */
type DropPoint =
  | { mode: 'offset'; x: number; y: number }
  | { mode: 'percent'; x: number; y: number }
  | { mode: 'absolute'; x: number; y: number }
  | { mode: 'center'; x?: number; y?: number };

/** Extra options to support dragging from component lists to canvases */
export interface DragAndDropOptions {
  dropPoint?: DropPoint;
  dataTransfer?: Record<string, string>;
  effectAllowed?: DataTransfer['effectAllowed'];
  dropEffect?: DataTransfer['dropEffect'];
  dragImageSelector?: string;
}

/** Script execution result shape */
interface ScriptDragResult {
  success: boolean;
  message: string;
  dragInfo?: {
    source: ElementDragInfo;
    target: ElementDragInfo;
    usedDropPoint?: { x: number; y: number; mode: string };
  };
}

/** Window with drag injection state */
interface WindowWithDragState {
  [key: `__copilotDragInjected_${string}`]: boolean | undefined;
  querySelectorWithShadowDOM?: (selector: string) => Element | null;
}

// ============================================================================
// HANDLER-LEVEL DEDUPLICATION
// ============================================================================

// Use globalThis to ensure the Map persists across module reloads/HMR
declare global {
  // eslint-disable-next-line no-var
  var __dragDropRequestLocks__: Map<string, { timestamp: number; promise: Promise<DragAndDropResult> }> | undefined;
}

if (!globalThis.__dragDropRequestLocks__) {
  globalThis.__dragDropRequestLocks__ = new Map();
  debug.log(LOG_PREFIX, 'Initializing global drag-drop lock Map');
}

const dragDropRequestLocks = globalThis.__dragDropRequestLocks__;

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
 * Create request signature for deduplication
 */
function createRequestSignature(sourceSelector: string, targetSelector: string): string {
  return `drag:${sourceSelector}|${targetSelector}`;
}

/**
 * Type guard for valid script result
 */
function isValidScriptResult(result: unknown): result is { result: ScriptDragResult } {
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
 * Drag and drop an element from source to target location
 *
 * @param sourceCssSelector - CSS selector for the element to drag
 * @param targetCssSelector - CSS selector for the drop target element
 * @param offsetX - Optional horizontal offset from target center (default: 0)
 * @param offsetY - Optional vertical offset from target center (default: 0)
 * @param options - Additional drag and drop options
 * @returns Promise with status and message object
 */
export async function handleDragAndDrop(
  sourceCssSelector: string,
  targetCssSelector: string,
  offsetX: number = 0,
  offsetY: number = 0,
  options?: DragAndDropOptions,
): Promise<DragAndDropResult> {
  const requestSignature = createRequestSignature(sourceCssSelector, targetCssSelector);

  debug.log(LOG_PREFIX, 'Request:', { sourceCssSelector, targetCssSelector, offsetX, offsetY, options });

  // Check for in-flight request
  const lockMap = globalThis.__dragDropRequestLocks__ ?? new Map();
  if (!globalThis.__dragDropRequestLocks__) {
    globalThis.__dragDropRequestLocks__ = lockMap;
  }

  const existingLock = lockMap.get(requestSignature);
  const lockAge = existingLock ? Date.now() - existingLock.timestamp : -1;

  if (existingLock && lockAge < INJECTION_LOCK_TIMEOUT_MS) {
    debug.log(LOG_PREFIX, 'Duplicate request blocked, reusing existing execution');
    return existingLock.promise;
  }

  // Create execution promise
  const executionPromise = executeDragDropOperation(
    sourceCssSelector,
    targetCssSelector,
    offsetX,
    offsetY,
    options,
    requestSignature,
  );

  // Store lock
  lockMap.set(requestSignature, {
    timestamp: Date.now(),
    promise: executionPromise,
  });

  // Cleanup lock after completion
  executionPromise.finally(() => {
    // Delayed cleanup to allow rapid duplicate detection
    setTimeout(() => {
      lockMap.delete(requestSignature);
    }, INJECTION_LOCK_TIMEOUT_MS);
  });

  // Passive cleanup of stale locks
  const now = Date.now();
  for (const [key, lock] of lockMap.entries()) {
    if (now - lock.timestamp > 30000) {
      lockMap.delete(key);
    }
  }

  return executionPromise;
}

/**
 * Execute the actual drag and drop operation
 */
async function executeDragDropOperation(
  sourceCssSelector: string,
  targetCssSelector: string,
  offsetX: number,
  offsetY: number,
  options: DragAndDropOptions | undefined,
  requestSignature: string,
): Promise<DragAndDropResult> {
  try {
    if (!sourceCssSelector || !sourceCssSelector.trim()) {
      return { status: 'error', message: 'Source selector is empty' };
    }
    if (!targetCssSelector || !targetCssSelector.trim()) {
      return { status: 'error', message: 'Target selector is empty' };
    }

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return { status: 'error', message: 'Unable to access current tab' };
    }

    // Execute script in content page
    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (
        sourceSelector: string,
        targetSelector: string,
        xOffset: number,
        yOffset: number,
        timing: typeof TIMING,
        visualStyles: typeof VISUAL_STYLES,
        extraOpts: DragAndDropOptions | undefined,
        shadowHelperCode: string,
        injectionLockTimeout: number,
        maxTextLen: number,
      ) => {
        // Inject shadow DOM helpers
        // eslint-disable-next-line no-eval
        eval(shadowHelperCode);

        const win = window as unknown as WindowWithDragState;

        // Prevent duplicate injection using content-script-level lock
        const injectionKey = `__copilotDragInjected_${sourceSelector}_${targetSelector}` as const;
        if (win[injectionKey]) {
          return { success: true, message: 'Drag skipped (script already in progress)' };
        }
        win[injectionKey] = true;
        setTimeout(() => delete win[injectionKey], injectionLockTimeout);

        // Access injected function
        const querySelectorWithShadowDOM =
          win.querySelectorWithShadowDOM ||
          ((sel: string) => document.querySelector(sel));

        // Helper function to check if element is visible
        const isVisible = (el: Element): boolean => {
          const style = window.getComputedStyle(el);
          const htmlEl = el as HTMLElement;
          const hasBox =
            htmlEl.offsetWidth > 0 || htmlEl.offsetHeight > 0 || el.getClientRects().length > 0;
          return hasBox && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        };

        // Helper function for delays
        const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

        try {
          // Helper function to find element
          const findElement = (selector: string) => {
            const element = querySelectorWithShadowDOM(selector);
            const foundInShadowDOM = selector.includes(' >> ');
            const shadowHostInfo = foundInShadowDOM ? selector.split(' >> ')[0].trim() : '';
            return { element, foundInShadowDOM, shadowHostInfo };
          };

          // Find source element
          const sourceResult = findElement(sourceSelector);
          const sourceElement = sourceResult.element;
          if (!sourceElement) {
            return {
              success: false,
              message: `Source element not found: "${sourceSelector}"`,
            };
          }

          // Find target element
          const targetResult = findElement(targetSelector);
          const targetElement = targetResult.element;
          if (!targetElement) {
            return {
              success: false,
              message: `Target element not found: "${targetSelector}"`,
            };
          }

          // Check visibility
          if (!isVisible(sourceElement)) {
            return { success: false, message: `Source element is hidden: "${sourceSelector}"` };
          }
          if (!isVisible(targetElement)) {
            return { success: false, message: `Target element is hidden: "${targetSelector}"` };
          }

          // Main async function
          return (async () => {
            let dragIndicator: HTMLElement | null = null;
            let pathLine: SVGElement | null = null;
            let dropEffect: HTMLElement | null = null;
            let sourceOriginalStyle = '';
            let targetOriginalStyle = '';

            try {
              // Scroll elements into view
              sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
              await delay(timing.SCROLL_DELAY);
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
              await delay(timing.SCROLL_DELAY);

              // Get positions
              const sourceRect = sourceElement.getBoundingClientRect();
              const targetRect = targetElement.getBoundingClientRect();

              const sourceX = sourceRect.left + sourceRect.width / 2;
              const sourceY = sourceRect.top + sourceRect.height / 2;

              // Resolve drop coordinates
              let targetX = targetRect.left + targetRect.width / 2 + xOffset;
              let targetY = targetRect.top + targetRect.height / 2 + yOffset;
              let usedMode = 'center+offset';

              if (extraOpts?.dropPoint) {
                const dp = extraOpts.dropPoint;
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

              // Save original styles
              sourceOriginalStyle = (sourceElement as HTMLElement).style.cssText;
              targetOriginalStyle = (targetElement as HTMLElement).style.cssText;

              // Mark elements
              (sourceElement as HTMLElement).setAttribute('data-copilot-drag-source', 'true');
              (targetElement as HTMLElement).setAttribute('data-copilot-drag-target', 'true');

              // Highlight source
              (sourceElement as HTMLElement).style.cssText += `
                outline: ${visualStyles.OUTLINE_WIDTH}px solid #FF9800 !important;
                outline-offset: 4px !important;
                background-color: rgba(255, 152, 0, 0.1) !important;
                cursor: grabbing !important;
              `;

              // Highlight target
              (targetElement as HTMLElement).style.cssText += `
                outline: ${visualStyles.OUTLINE_WIDTH}px dashed #4CAF50 !important;
                outline-offset: 4px !important;
                background-color: rgba(76, 175, 80, 0.1) !important;
              `;

              // Create drag indicator
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

              await delay(timing.ANIMATION_SETUP_DELAY);

              // Setup dataTransfer
              const dataTransfer = new DataTransfer();
              dataTransfer.setData('text/html', sourceElement.outerHTML);
              dataTransfer.setData('text/plain', (sourceElement.textContent || '').trim());
              dataTransfer.effectAllowed = extraOpts?.effectAllowed || 'move';
              if (extraOpts?.dropEffect) dataTransfer.dropEffect = extraOpts.dropEffect;
              if (extraOpts?.dataTransfer) {
                for (const [k, v] of Object.entries(extraOpts.dataTransfer)) {
                  dataTransfer.setData(k, String(v));
                }
              }

              // Animate drag
              const steps = 60;
              const stepDuration = timing.ANIMATION_DURATION / steps;

              for (let currentStep = 0; currentStep <= steps; currentStep++) {
                const progress = currentStep / steps;
                const easeProgress =
                  progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                const currentX = sourceX + (targetX - sourceX) * easeProgress;
                const currentY = sourceY + (targetY - sourceY) * easeProgress;

                if (dragIndicator) {
                  dragIndicator.style.left = currentX + 'px';
                  dragIndicator.style.top = currentY + 'px';
                  dragIndicator.style.transform = `scale(${1 + Math.sin(progress * Math.PI) * 0.3}) rotate(${progress * 360}deg)`;
                }

                path.setAttribute(
                  'd',
                  `M ${sourceX} ${sourceY} Q ${(sourceX + currentX) / 2} ${Math.min(sourceY, currentY) - 50} ${currentX} ${currentY}`,
                );

                // Emit events during animation
                document.dispatchEvent(
                  new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX: currentX,
                    clientY: currentY,
                    pointerType: 'mouse',
                  }),
                );

                targetElement.dispatchEvent(
                  new DragEvent('dragover', {
                    bubbles: true,
                    cancelable: true,
                    clientX: currentX,
                    clientY: currentY,
                    dataTransfer,
                  }),
                );

                await delay(stepDuration);
              }

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

              // Ensure draggable
              if (!(sourceElement as HTMLElement).draggable) {
                (sourceElement as HTMLElement).setAttribute('draggable', 'true');
              }

              // Optional custom drag image
              if (extraOpts?.dragImageSelector) {
                const imgEl = document.querySelector(extraOpts.dragImageSelector);
                if (imgEl) {
                  const r = (imgEl as HTMLElement).getBoundingClientRect();
                  dataTransfer.setDragImage(imgEl, r.width / 2, r.height / 2);
                }
              }

              // Dispatch drag events
              sourceElement.dispatchEvent(
                new DragEvent('dragstart', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer,
                  clientX: sourceX,
                  clientY: sourceY,
                }),
              );

              targetElement.addEventListener('dragover', e => e.preventDefault(), { once: true });

              targetElement.dispatchEvent(
                new DragEvent('dragenter', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer,
                  clientX: targetX,
                  clientY: targetY,
                }),
              );

              targetElement.dispatchEvent(
                new DragEvent('dragover', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer,
                  clientX: targetX,
                  clientY: targetY,
                }),
              );

              // Extra dragover events
              for (let i = 0; i < 3; i++) {
                await delay(20);
                targetElement.dispatchEvent(
                  new DragEvent('dragover', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer,
                    clientX: targetX,
                    clientY: targetY,
                  }),
                );
              }

              // Drop and dragend
              targetElement.dispatchEvent(
                new DragEvent('drop', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer,
                  clientX: targetX,
                  clientY: targetY,
                }),
              );

              sourceElement.dispatchEvent(
                new DragEvent('dragend', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer,
                  clientX: targetX,
                  clientY: targetY,
                }),
              );

              // Mouse/pointer events for compatibility
              sourceElement.dispatchEvent(
                new MouseEvent('mousedown', {
                  bubbles: true,
                  cancelable: true,
                  clientX: sourceX,
                  clientY: sourceY,
                  button: 0,
                }),
              );
              sourceElement.dispatchEvent(
                new PointerEvent('pointerdown', {
                  bubbles: true,
                  clientX: sourceX,
                  clientY: sourceY,
                  pointerType: 'mouse',
                }),
              );

              targetElement.dispatchEvent(
                new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  clientX: targetX,
                  clientY: targetY,
                  button: 0,
                }),
              );
              targetElement.dispatchEvent(
                new PointerEvent('pointerup', {
                  bubbles: true,
                  clientX: targetX,
                  clientY: targetY,
                  pointerType: 'mouse',
                }),
              );

              await delay(timing.CLEANUP_DELAY);

              // Build success message
              const sourceShadowInfo = sourceResult.foundInShadowDOM
                ? ` (source in Shadow DOM: ${sourceResult.shadowHostInfo})`
                : '';
              const targetShadowInfo = targetResult.foundInShadowDOM
                ? ` (target in Shadow DOM: ${targetResult.shadowHostInfo})`
                : '';

              return {
                success: true,
                message: `Drag and drop completed${sourceShadowInfo}${targetShadowInfo}`,
                dragInfo: {
                  source: {
                    selector: sourceSelector,
                    tag: sourceElement.tagName,
                    text: (sourceElement.textContent || '').trim().substring(0, maxTextLen),
                    position: { x: Math.round(sourceX), y: Math.round(sourceY) },
                    foundInShadowDOM: sourceResult.foundInShadowDOM,
                    shadowHost: sourceResult.foundInShadowDOM ? sourceResult.shadowHostInfo : null,
                  },
                  target: {
                    selector: targetSelector,
                    tag: targetElement.tagName,
                    text: (targetElement.textContent || '').trim().substring(0, maxTextLen),
                    position: { x: Math.round(targetX), y: Math.round(targetY) },
                    foundInShadowDOM: targetResult.foundInShadowDOM,
                    shadowHost: targetResult.foundInShadowDOM ? targetResult.shadowHostInfo : null,
                  },
                  usedDropPoint: { x: Math.round(targetX), y: Math.round(targetY), mode: usedMode },
                },
              };
            } finally {
              // Always cleanup
              if (dragIndicator) dragIndicator.remove();
              if (pathLine) pathLine.remove();
              if (dropEffect) dropEffect.remove();
              if (sourceOriginalStyle !== undefined) {
                (sourceElement as HTMLElement).style.cssText = sourceOriginalStyle;
                (sourceElement as HTMLElement).removeAttribute('data-copilot-drag-source');
              }
              if (targetOriginalStyle !== undefined) {
                (targetElement as HTMLElement).style.cssText = targetOriginalStyle;
                (targetElement as HTMLElement).removeAttribute('data-copilot-drag-target');
              }
            }
          })();
        } catch (error) {
          return {
            success: false,
            message: `Error during drag and drop: ${(error as Error).message || 'Unknown error'}`,
          };
        }
      },
      args: [
        sourceCssSelector,
        targetCssSelector,
        offsetX,
        offsetY,
        TIMING,
        VISUAL_STYLES,
        options,
        QUERY_SELECTOR_SHADOW_DOM_CODE,
        INJECTION_LOCK_TIMEOUT_MS,
        MAX_TEXT_LENGTH,
      ] as const,
    });

    const timeoutFallback = [{ result: { success: false, message: 'Timeout during drag and drop' } }];
    const results = await Promise.race([execPromise, createTimeoutPromise(SCRIPT_TIMEOUT_MS, timeoutFallback)]);

    if (results && results[0] && isValidScriptResult(results[0])) {
      const result = results[0].result;
      debug.log(LOG_PREFIX, 'Script result:', result);

      if (result.success && result.dragInfo) {
        return {
          status: 'success',
          message: result.message,
          dragInfo: result.dragInfo,
        };
      } else {
        return {
          status: 'error',
          message: result.message,
        };
      }
    }

    return { status: 'error', message: 'Unable to perform drag and drop' };
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error:', error);
    return { status: 'error', message: `Error: ${getErrorMessage(error)}` };
  }
}
