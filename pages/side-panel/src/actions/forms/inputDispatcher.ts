import { debug } from '@extension/shared';
import { InputDataResult, InputHandlerOptions, InputType } from './types';
import { findElement, isElementVisible, scrollIntoView, focusAndHighlight, detectModernInput } from './utils';

// Import all specialized handlers
import { TextInputHandler } from './textInputHandler';
import { CheckboxRadioHandler } from './checkboxRadioHandler';
import { DateInputHandler } from './dateInputHandler';
import { NumberInputHandler } from './numberInputHandler';
import { SelectInputHandler } from './selectInputHandler';
import { ContentEditableHandler } from './contentEditableHandler';
import { TextareaHandler } from './textareaHandler';
import { ModernInputHandler } from './modernInputHandler';

// Create handler instances
const selectInputHandler = new SelectInputHandler();

/**
 * Main input dispatcher that routes to appropriate specialized handlers
 * This replaces the monolithic inputData.ts with a modular system
 */
export class InputDispatcher {
  private handlers: Array<{
    handler: any;
    priority: number;
    name: string;
  }> = [];

  constructor() {
    // Initialize handlers in priority order (higher priority = checked first)
    this.handlers = [
      { handler: new ModernInputHandler(), priority: 100, name: 'ModernInput' },
      { handler: new TextInputHandler(), priority: 90, name: 'TextInput' },
      { handler: new CheckboxRadioHandler(), priority: 80, name: 'CheckboxRadio' },
      { handler: new DateInputHandler(), priority: 70, name: 'DateInput' },
      { handler: new NumberInputHandler(), priority: 60, name: 'NumberInput' },
      { handler: new SelectInputHandler(), priority: 50, name: 'SelectInput' },
      { handler: new ContentEditableHandler(), priority: 40, name: 'ContentEditable' },
      { handler: new TextareaHandler(), priority: 30, name: 'Textarea' },
    ];

    // Sort handlers by priority (highest first)
    this.handlers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Main entry point for input data handling
   * @param cssSelector - CSS selector for the input element
   * @param value - Value to input
   * @param clearFirst - Whether to clear the field first
   * @param moveCursor - Whether to move cursor to the input element (default: true)
   * @returns Promise with result
   */
  async handleInputData(
    cssSelector: string,
    value: string,
    clearFirst: boolean = true,
    moveCursor: boolean = true,
  ): Promise<InputDataResult> {
    try {
      // debug.log('[InputDispatcher] Inputting data into field with selector:', cssSelector, 'value:', value);
      // Execute directly in the current page context using scripting API
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        return { status: 'error', message: 'Unable to access current tab' };
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: async (
          selector: string,
          inputValue: string,
          shouldClear: boolean,
          shouldMoveCursor: boolean,
        ): Promise<any> => {
          // Define content script functions inline
          // Shadow DOM helper - supports >> notation
          function querySelectorWithShadowDOM(selector: string): HTMLElement | null {
            if (!selector.includes(' >> ')) {
              return document.querySelector(selector) as HTMLElement;
            }

            const parts = selector.split(' >> ');
            if (parts.length !== 2) {
              throw new Error('Invalid shadow DOM selector format. Expected "shadowPath >> elementSelector"');
            }

            const shadowPath = parts[0].trim();
            const elementSelector = parts[1].trim();

            const pathSegments = shadowPath
              .split(' > ')
              .map((s: string) => s.trim())
              .filter((s: string) => s && s !== 'document');

            if (pathSegments.length === 0) {
              throw new Error('Shadow path must contain at least one element');
            }

            let currentRoot: Document | ShadowRoot = document;
            
            for (const segment of pathSegments) {
              const hostElement: Element | null = currentRoot.querySelector(segment);
              
              if (!hostElement) {
                throw new Error('Shadow host not found: ' + segment);
              }
              
              if (!hostElement.shadowRoot) {
                throw new Error('Element does not have a shadow root: ' + segment);
              }
              
              currentRoot = hostElement.shadowRoot;
            }

            return currentRoot.querySelector(elementSelector) as HTMLElement;
          }

          function findElement(selector: string): any {
            // Use shadow-aware query
            const element = querySelectorWithShadowDOM(selector);
            const foundInShadowDOM = selector.includes(' >> ');
            const shadowHostInfo = foundInShadowDOM ? selector.split(' >> ')[0].trim() : '';

            if (!element) {
              return null;
            }

            const inputType =
              (element as HTMLInputElement).type || (element.hasAttribute('contenteditable') ? 'contenteditable' : '');
            const tagName = element.tagName.toLowerCase();

            return {
              element,
              foundInShadowDOM,
              shadowHostInfo,
              inputType,
              tagName,
            };
          }

          function isElementVisible(element: HTMLElement): boolean {
            const style = window.getComputedStyle(element);
            return !(
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              style.opacity === '0' ||
              element.offsetWidth === 0 ||
              element.offsetHeight === 0
            );
          }

          function scrollIntoView(element: HTMLElement): void {
            try {
              element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            } catch {}
          }

          function moveCursorToElement(element: HTMLElement): void {
            // Make this function globally available for handlers
            (window as any).moveCursorToElement = moveCursorToElement;
            try {
              const rect = element.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;

              // console.log('[InputDispatcher] moveCursorToElement called - target position:', { x: centerX, y: centerY });

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
                isNewCursor = true;
              }

              // Animation constants
              const ANIMATION_STEPS = 16;
              const STEP_DURATION = 16;
              const CURSOR_DELAY_NEW = 100;
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

                    step++;
                    setTimeout(moveStep, STEP_DURATION);
                  } else {
                    // Final position - animation complete
                    cursorState.lastX = centerX;
                    cursorState.lastY = centerY;
                    cursor!.style.left = centerX + 'px';
                    cursor!.style.top = centerY + 'px';
                    cursor!.style.animation = 'copilotPulse 1.2s ease-in-out infinite';

                    // console.log('[InputDispatcher] Cursor animation COMPLETED - final position:', { x: centerX, y: centerY });

                    // Try to set the cursor position if it's a text input that supports selection
                    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                      const inputElement = element as HTMLInputElement | HTMLTextAreaElement;

                      // Check if the input type supports text selection
                      const inputType = (inputElement as HTMLInputElement).type || 'text';
                      const supportsSelection =
                        ['text', 'search', 'url', 'tel'].includes(inputType) ||
                        element.tagName === 'TEXTAREA' ||
                        element.hasAttribute('contenteditable');

                      if (supportsSelection && inputElement.setSelectionRange) {
                        try {
                          const length = inputElement.value.length;
                          inputElement.setSelectionRange(length, length);
                        } catch (selectionError) {
                          // Some input types don't support selection, ignore the error
                          // console.log('[InputUtils] Input type does not support selection:', inputType);
                        }
                      }
                    }

                    // console.log('[InputUtils] Cursor moved to element:', element.tagName, element.id || element.className);

                    // Call the input callback after a brief delay to ensure cursor is fully positioned
                    if ((window as any).__copilotInputCallback__) {
                      setTimeout(() => {
                        (window as any).__copilotInputCallback__();
                        (window as any).__copilotInputCallback__ = null; // Clean up
                      }, 200); // Small delay to ensure cursor is fully positioned
                    }
                  }
                };

                moveStep();
              };

              // Start cursor animation with delay for new cursor
              setTimeout(animateCursor, isNewCursor ? CURSOR_DELAY_NEW : CURSOR_DELAY_EXISTING);
            } catch (error) {
              console.error('[InputUtils] Error moving cursor to element:', error);
            }
          }

          function focusAndHighlight(element: HTMLElement, moveCursor: boolean = true): void {
            // Store original styles
            const originalOutline = element.style.outline;
            const originalOutlineOffset = element.style.outlineOffset;
            const originalBackground = element.style.backgroundColor;

            // Focus the element
            element.focus();

            // Move cursor to element if requested
            if (moveCursor) {
              moveCursorToElement(element);
            }

            // Highlight the element
            element.style.outline = '3px solid #2196F3';
            element.style.outlineOffset = '4px';
            element.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
            element.style.transition = 'all 0.3s ease';

            // Remove highlight after 2 seconds
            setTimeout(() => {
              element.style.outline = originalOutline;
              element.style.outlineOffset = originalOutlineOffset;
              element.style.backgroundColor = originalBackground;
              element.style.transition = '';
            }, 2000);
          }

          function getElementValue(element: HTMLElement): string {
            if (element.tagName === 'INPUT') {
              const inputElement = element as HTMLInputElement;
              const type = inputElement.type;

              if (type === 'checkbox' || type === 'radio') {
                return inputElement.checked ? 'checked' : 'unchecked';
              }

              return inputElement.value;
            }

            if (element.tagName === 'TEXTAREA') {
              return (element as HTMLTextAreaElement).value;
            }

            if (element.tagName === 'SELECT') {
              return (element as HTMLSelectElement).value;
            }

            if (element.hasAttribute('contenteditable')) {
              return element.textContent || '';
            }

            return '';
          }

          // Keyboard navigation function for custom dropdowns
          async function tryKeyboardNavigation(
            dropdownElement: HTMLElement,
            value: string,
          ): Promise<{ success: boolean; message?: string }> {
            try {
              // console.log('[InputDispatcher] Starting keyboard navigation to find option:', value);

              // Helper function to determine if an option is selectable
              const isSelectableOption = (text: string): boolean => {
                if (!text || text.length === 0) return false;
                // Filter out non-selectable options (labels, descriptions, etc.)
                // Skip options that are too long (likely descriptions) or contain question marks
                return text.length < 50 && !text.includes('?') && !text.includes('*');
              };

              // First, click the dropdown button to open it
              // console.log('[InputDispatcher] Clicking dropdown button to open it');
              dropdownElement.click();

              // Wait for dropdown to open and render
              await new Promise(resolve => setTimeout(resolve, 600));

              // Check if the element is in a hidden container before focusing
              const isInHiddenContainer = (element: HTMLElement): boolean => {
                let current = element.parentElement;
                while (current) {
                  const style = window.getComputedStyle(current);
                  if (
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    current.getAttribute('aria-hidden') === 'true'
                  ) {
                    return true;
                  }
                  current = current.parentElement;
                }
                return false;
              };

              // Only focus if not in a hidden container to avoid aria-hidden warnings
              if (!isInHiddenContainer(dropdownElement)) {
                dropdownElement.focus();
                // console.log('[InputDispatcher] Focused dropdown button');
              } else {
                // console.log('[InputDispatcher] Skipping focus to avoid aria-hidden warning');
              }

              // Wait for focus to take effect
              await new Promise(resolve => setTimeout(resolve, 200));

              // Find the container (parent of dropdown)
              const container =
                dropdownElement.closest(
                  '[data-slot="form-item"], .dropdown, .select, [role="listbox"], [role="menu"]',
                ) || dropdownElement.parentElement;

              // Get all available options to determine navigation path
              const allOptions: Array<{ element: Element; text: string }> = [];

              // Prioritize visual elements over hidden native elements
              const visualElementSelectors = [
                // ARIA-based (most reliable for visual elements)
                '[role="option"]:not(option)', // Exclude native option elements
                '[role="menuitem"]:not(option)',
                '[role="listitem"]:not(option)',

                // Framework-specific selectors (visual elements only)
                // Radix UI
                '[data-radix-select-item]',
                '[data-radix-collection-item]',
                // Headless UI
                '.headlessui-listbox-option',
                '.headlessui-menu-item',
                // Ant Design
                '.ant-select-item',
                '.ant-select-item-option',
                '.ant-dropdown-menu-item',
                // Material UI
                '.MuiMenuItem-root',
                '.MuiListItem-root',
                '.MuiSelect-select',
                // Chakra UI
                '.chakra-select__option',
                '.chakra-menu__menuitem',
                // Bootstrap
                '.dropdown-item',
                '.list-group-item',
                // Semantic UI
                '.item',
                '.menu .item',
                // Element UI
                '.el-select-dropdown__item',
                '.el-option',
                // Vuetify
                '.v-list-item',
                '.v-select-list .v-list-item',
                // Quasar
                '.q-item',
                '.q-option',
                // PrimeNG
                '.p-dropdown-item',
                '.p-selectable-row',
                // Kendo UI
                '.k-item',
                '.k-list-item',
                // DevExtreme
                '.dx-item',
                '.dx-list-item',

                // Generic component patterns (visual elements)
                '[data-slot="select-item"]',
                '[data-slot="select-option"]',
                '[data-slot="menu-item"]',
                '[data-testid*="option"]',
                '[data-testid*="item"]',
                '[data-testid*="select"]',
                '[data-cy*="option"]',
                '[data-cy*="item"]',
                '[data-cy*="select"]',

                // Class-based patterns (framework-agnostic, visual elements)
                '.select-item',
                '.select-option',
                '.dropdown-item',
                '.menu-item',
                '.option-item',
                '.list-item',
                '.choice-item',
                '.pick-item',
                '[class*="select-item"]',
                '[class*="select-option"]',
                '[class*="dropdown-item"]',
                '[class*="menu-item"]',
                '[class*="option-item"]',
                '[class*="list-item"]',
                '[class*="choice"]',
                '[class*="pick"]',
                '[class*="item"]',

                // Data attribute patterns (visual elements)
                'div[data-value]',
                'span[data-value]',
                'button[data-value]',
                'li[data-value]',
                '[data-option]:not(option)',
                '[data-item]:not(option)',
                '[data-choice]:not(option)',
              ];

              // Try each selector and collect unique elements, excluding native options
              const foundElements = new Set<Element>();

              // Search in multiple areas: container, document body, and any dropdown portals
              const searchAreas = [
                container,
                document.body,
                document.querySelector('[data-radix-portal]'),
                document.querySelector('[data-radix-select-content]'),
                document.querySelector('[role="listbox"]'),
                document.querySelector('[role="menu"]'),
              ].filter(Boolean);

              for (const selector of visualElementSelectors) {
                try {
                  searchAreas.forEach(area => {
                    if (area) {
                      const elements = area.querySelectorAll(selector);
                      if (elements.length > 0) {
                        elements.forEach(el => {
                          // Only add visual elements, not native options
                          if (el.tagName !== 'OPTION') {
                            foundElements.add(el);
                          }
                        });
                      }
                    }
                  });
                } catch (e) {
                  // Skip invalid selectors
                }
              }

              // Also do the original comprehensive search that was working
              // console.log('[InputDispatcher] Doing comprehensive search for visual elements...');

              // Common selectors for visual dropdown components (original search)
              const originalVisualSelectors = [
                // Radix UI Select
                '[data-radix-select-content]',
                '[data-radix-select-viewport]',
                '[data-radix-select-item]',
                // Headless UI
                '[role="listbox"]',
                '[role="option"]',
                '.headlessui-listbox-option',
                // Ant Design
                '.ant-select-dropdown',
                '.ant-select-item',
                '.ant-select-item-option',
                // Material UI
                '.MuiSelect-select',
                '.MuiMenuItem-root',
                '.MuiList-root',
                // Chakra UI
                '[data-chakra-select]',
                '.chakra-select__menu',
                '.chakra-select__option',
                // Custom components
                '.dropdown-menu',
                '.dropdown-content',
                '.select-menu',
                '.select-content',
                '.option-list',
                '.menu-list',
                '.dropdown-list',
                '.select-list',
                // Generic patterns
                '[class*="dropdown"]',
                '[class*="select-menu"]',
                '[class*="option"]',
                '[class*="menu-item"]',
                '[class*="list-item"]',
                '[class*="select-item"]',
              ];

              // Search in the container and its children (original approach)
              const originalSearchAreas = [container, dropdownElement.parentElement, document.body].filter(Boolean);

              originalVisualSelectors.forEach(selector => {
                originalSearchAreas.forEach(area => {
                  if (area) {
                    const elements = area.querySelectorAll(selector);
                    if (elements.length > 0) {
                      elements.forEach(el => {
                        // Only add visual elements, not native options
                        if (el.tagName !== 'OPTION') {
                          foundElements.add(el);
                        }
                      });
                    }
                  }
                });
              });

              // Also search for elements that contain the option text values (original approach)
              // First, get option texts from the hidden select to know what to search for
              const hiddenSelectForTexts = container?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
              const optionTexts: string[] = [];

              if (hiddenSelectForTexts) {
                for (let i = 0; i < hiddenSelectForTexts.options.length; i++) {
                  const option = hiddenSelectForTexts.options[i];
                  const text = option.text?.trim();
                  if (text && text.length > 0) {
                    optionTexts.push(text);
                  }
                }
              }

              // console.log('[InputDispatcher] Searching for elements containing option texts:', optionTexts);

              optionTexts.forEach(text => {
                // Search for elements containing this text
                const textElements = document.querySelectorAll('*');
                const matchingElements = Array.from(textElements).filter(
                  el =>
                    el.textContent?.trim() === text &&
                    el.tagName !== 'OPTION' && // Exclude the hidden option elements
                    el !== dropdownElement, // Exclude the main dropdown button
                );

                if (matchingElements.length > 0) {
                  matchingElements.forEach(el => {
                    // Only add visual elements, not native options
                    if (el.tagName !== 'OPTION') {
                      foundElements.add(el);
                    }
                  });
                }
              });

              // Convert to array and filter for selectable options
              const candidateElements = Array.from(foundElements);

              // Process each candidate element, prioritizing visual elements
              candidateElements.forEach((element, index) => {
                const text = element.textContent?.trim();
                if (text && text.length > 0 && isSelectableOption(text)) {
                  // Skip the dropdown button itself - we want the option elements within the dropdown
                  if (
                    element === dropdownElement ||
                    element.getAttribute('role') === 'combobox' ||
                    element.getAttribute('data-slot') === 'select-trigger'
                  ) {
                    // console.log(`[InputDispatcher] Skipping dropdown button: ${text}`);
                    return;
                  }

                  // Check if we already have this text (avoid duplicates)
                  const existingOption = allOptions.find(opt => opt.text === text);
                  if (!existingOption) {
                    allOptions.push({
                      element: element,
                      text: text,
                    });
                    // console.log(`[InputDispatcher] Added visual element: ${text} (${element.tagName})`);
                  }
                }
              });

              // If no visual elements found, fallback to hidden select options
              if (allOptions.length === 0) {
                console.log('[InputDispatcher] No visual elements found, falling back to hidden select options');
                const hiddenSelect = container?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
                if (hiddenSelect) {
                  for (let i = 0; i < hiddenSelect.options.length; i++) {
                    const option = hiddenSelect.options[i];
                    const text = option.text?.trim();
                    if (text && text.length > 0) {
                      allOptions.push({
                        element: option,
                        text: text,
                      });
                    }
                  }
                }
              }

              // Log the full HTML of the options found
              // console.log('[InputDispatcher] Found visual options:', allOptions.length);
              allOptions.forEach((option, index) => {
                // console.log(`[InputDispatcher] Option ${index} (${option.text}):`, {
                //   tagName: option.element.tagName,
                //   className: option.element.className,
                //   innerHTML: option.element.innerHTML,
                //   outerHTML: option.element.outerHTML,
                //   getBoundingClientRect: option.element.getBoundingClientRect(),
                //   computedStyle: {
                //     display: window.getComputedStyle(option.element).display,
                //     visibility: window.getComputedStyle(option.element).visibility,
                //     opacity: window.getComputedStyle(option.element).opacity,
                //     position: window.getComputedStyle(option.element).position,
                //     width: window.getComputedStyle(option.element).width,
                //     height: window.getComputedStyle(option.element).height
                //   }
                // });
              });

              // console.log('[InputDispatcher] Available options:', allOptions.map(opt => opt.text));

              // Find the target option index
              const targetIndex = allOptions.findIndex(opt => opt.text === value);
              if (targetIndex === -1) {
                // console.log('[InputDispatcher] Target option not found in available options, cannot use keyboard navigation');
                return { success: false, message: 'Target option not found' };
              }

              // console.log('[InputDispatcher] Target option found at index:', targetIndex);
              // console.log('[InputDispatcher] Available options:', allOptions);

              // Calculate how many ArrowDown presses we need
              // If we're at index 0 (first option) and want index 2 (third option), we need 2 presses
              const arrowDownCount = targetIndex;
              // console.log('[InputDispatcher] Need to press ArrowDown', arrowDownCount, 'times to reach target option');

              // Navigate to the target option using arrow down keys with human-like delays
              // Also hover over each option as we navigate through them
              for (let i = 0; i < arrowDownCount; i++) {
                // console.log('[InputDispatcher] Pressing ArrowDown key (step', i + 1, 'of', arrowDownCount, ')');

                const keyDownEvent = new KeyboardEvent('keydown', {
                  key: 'ArrowDown',
                  code: 'ArrowDown',
                  keyCode: 40,
                  which: 40,
                  bubbles: true,
                  cancelable: true,
                  view: window,
                });

                dropdownElement.dispatchEvent(keyDownEvent);

                // Also dispatch keyup
                const keyUpEvent = new KeyboardEvent('keyup', {
                  key: 'ArrowDown',
                  code: 'ArrowDown',
                  keyCode: 40,
                  which: 40,
                  bubbles: true,
                  cancelable: true,
                  view: window,
                });

                dropdownElement.dispatchEvent(keyUpEvent);

                // Simulate hover over the current option (i+1 because we're moving to the next option)
                if (i + 1 < allOptions.length) {
                  const currentOptionElement = allOptions[i + 1].element as HTMLElement;
                  console.log(`[InputDispatcher] Simulating hover over option: ${allOptions[i + 1].text}`);

                  // Move the actual cursor to the visual option element
                  console.log(`[InputDispatcher] Moving cursor to option: ${allOptions[i + 1].text}`);

                  // Use the existing moveCursorToElement function
                  if (typeof (window as any).moveCursorToElement === 'function') {
                    (window as any).moveCursorToElement(currentOptionElement);

                    // Wait for cursor movement to complete
                    await new Promise(resolve => setTimeout(resolve, 300));
                  }
                }

                // Human-like delay between key presses (600-1000ms for more realistic timing)
                const delay = 600 + Math.random() * 400;
                await new Promise(resolve => setTimeout(resolve, delay));
              }

              // Simulate final hover over the target option before selecting
              if (targetIndex < allOptions.length) {
                const targetOptionElement = allOptions[targetIndex].element as HTMLElement;
                console.log(
                  `[InputDispatcher] Final hover simulation over target option: ${allOptions[targetIndex].text}`,
                );

                // Move the actual cursor to the target option element
                console.log(`[InputDispatcher] Moving cursor to final target option: ${allOptions[targetIndex].text}`);

                // Use the existing moveCursorToElement function
                if (typeof (window as any).moveCursorToElement === 'function') {
                  (window as any).moveCursorToElement(targetOptionElement);

                  // Wait for cursor movement to complete
                  await new Promise(resolve => setTimeout(resolve, 300));
                }
              }

              // Brief pause before selecting to make it feel more natural
              await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 200));

              console.log('[InputDispatcher] Reached target option, pressing Enter to select');

              // Human-like delay before pressing Enter
              await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 200));

              // Press Enter to select the option
              const enterDownEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
                view: window,
              });

              dropdownElement.dispatchEvent(enterDownEvent);

              const enterUpEvent = new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
                view: window,
              });

              dropdownElement.dispatchEvent(enterUpEvent);

              // Also try Space key as alternative
              const spaceDownEvent = new KeyboardEvent('keydown', {
                key: ' ',
                code: 'Space',
                keyCode: 32,
                which: 32,
                bubbles: true,
                cancelable: true,
                view: window,
              });

              dropdownElement.dispatchEvent(spaceDownEvent);

              const spaceUpEvent = new KeyboardEvent('keyup', {
                key: ' ',
                code: 'Space',
                keyCode: 32,
                which: 32,
                bubbles: true,
                cancelable: true,
                view: window,
              });

              dropdownElement.dispatchEvent(spaceUpEvent);

              // Trigger change event on any hidden select element
              const hiddenSelect = container?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
              if (hiddenSelect) {
                // Set the value directly on the hidden select
                for (let i = 0; i < hiddenSelect.options.length; i++) {
                  const option = hiddenSelect.options[i];
                  if (option.value === value || option.text === value) {
                    hiddenSelect.selectedIndex = i;
                    break;
                  }
                }
                hiddenSelect.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                hiddenSelect.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              }

              // Also trigger events on the dropdown element itself
              dropdownElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              dropdownElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

              // Wait a bit for the selection to process
              await new Promise(resolve => setTimeout(resolve, 200));

              // Close the dropdown by pressing Escape or clicking outside
              console.log('[InputDispatcher] Closing dropdown after selection');

              // Try pressing Escape to close dropdown
              const escapeDownEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true,
                view: window,
              });

              dropdownElement.dispatchEvent(escapeDownEvent);

              const escapeUpEvent = new KeyboardEvent('keyup', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true,
                view: window,
              });

              dropdownElement.dispatchEvent(escapeUpEvent);

              // Also try clicking outside the dropdown to close it
              setTimeout(() => {
                const clickOutsideEvent = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: 0,
                  clientY: 0,
                });
                document.body.dispatchEvent(clickOutsideEvent);
              }, 100);

              console.log('[InputDispatcher] Keyboard navigation completed successfully');

              return {
                success: true,
                message: `Custom dropdown option "${value}" selected successfully via keyboard navigation`,
              };
            } catch (keyboardError) {
              console.log('[InputDispatcher] Keyboard navigation failed:', keyboardError);
              return { success: false, message: 'Keyboard navigation failed' };
            }
          }

          function showSuccessFeedback(element: HTMLElement): void {
            const rect = element.getBoundingClientRect();

            // Ensure animation style exists (only add once)
            let styleEl = document.getElementById('__copilot_input_success_style__');
            if (!styleEl) {
              styleEl = document.createElement('style');
              styleEl.id = '__copilot_input_success_style__';
              styleEl.textContent = `
                @keyframes copilotInputSuccess {
                  0% { 
                    transform: scale(0) translateY(0); 
                    opacity: 1; 
                  }
                  50% { 
                    transform: scale(1.2) translateY(-5px); 
                    opacity: 1; 
                  }
                  100% { 
                    transform: scale(1) translateY(-15px); 
                    opacity: 0; 
                  }
                }
              `;
              document.head.appendChild(styleEl);
            }

            // Create feedback element
            const inputFeedback = document.createElement('div');
            inputFeedback.className = '__copilot_input_feedback__';
            inputFeedback.textContent = '✓';
            inputFeedback.style.cssText = `
              position: fixed;
              left: ${rect.right - 25}px;
              top: ${rect.top - 5}px;
              width: 20px;
              height: 20px;
              background: #4CAF50;
              color: white;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 14px;
              font-weight: bold;
              pointer-events: none;
              z-index: 999999;
              animation: copilotInputSuccess 0.8s ease-out;
            `;

            document.body.appendChild(inputFeedback);

            // Remove after animation completes
            setTimeout(() => {
              inputFeedback.remove();
            }, 800);
          }

          // Optimized formatter approaches
          async function approach0_ClickAndType(
            inputElement: HTMLInputElement,
            value: string,
          ): Promise<{ success: boolean; message: string }> {
            console.log('[InputDispatcher] Attempting click and type approach');

            try {
              // Click to focus
              const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
              inputElement.dispatchEvent(clickEvent);
              inputElement.focus();

              // Wait for focus
              await new Promise(resolve => setTimeout(resolve, 50));

              // Type each character with optimized events
              for (let i = 0; i < value.length; i++) {
                const char = value[i];

                // Keydown event
                const keydownEvent = new KeyboardEvent('keydown', {
                  bubbles: true,
                  cancelable: true,
                  key: char,
                  code: `Key${char.toUpperCase()}`,
                  charCode: char.charCodeAt(0),
                  keyCode: char.charCodeAt(0),
                  which: char.charCodeAt(0),
                });
                inputElement.dispatchEvent(keydownEvent);

                // Input event (formatters listen to this)
                const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                (inputEvent as any).target = inputElement;
                (inputEvent as any).data = char;
                inputElement.dispatchEvent(inputEvent);

                // Keyup event
                const keyupEvent = new KeyboardEvent('keyup', {
                  bubbles: true,
                  cancelable: true,
                  key: char,
                  code: `Key${char.toUpperCase()}`,
                  charCode: char.charCodeAt(0),
                  keyCode: char.charCodeAt(0),
                  which: char.charCodeAt(0),
                });
                inputElement.dispatchEvent(keyupEvent);

                // Optimized delay
                await new Promise(resolve => setTimeout(resolve, 5));
              }

              // Final events
              const changeEvent = new Event('change', { bubbles: true, cancelable: true });
              inputElement.dispatchEvent(changeEvent);

              // Wait for processing
              await new Promise(resolve => setTimeout(resolve, 100));

              return { success: true, message: 'Click and type completed' };
            } catch (error) {
              console.log('[InputDispatcher] Click and type approach failed:', error);
              return { success: false, message: 'Click and type failed' };
            }
          }

          async function approach1_DirectValueSetting(
            inputElement: HTMLInputElement,
            value: string,
          ): Promise<{ success: boolean; message: string }> {
            // Check if input is readonly
            const wasReadonly = inputElement.hasAttribute('readonly');
            if (wasReadonly) {
              inputElement.removeAttribute('readonly');
            }

            inputElement.value = value;
            const events = ['input', 'change', 'blur'];
            for (const eventType of events) {
              const event = new Event(eventType, { bubbles: true, cancelable: true });
              (event as any).target = inputElement;
              inputElement.dispatchEvent(event);
            }

            // Restore readonly if it was there
            if (wasReadonly) {
              inputElement.setAttribute('readonly', '');
            }

            return { success: true, message: 'Direct value setting completed' };
          }

          async function approach2_SimulateTyping(
            inputElement: HTMLInputElement,
            value: string,
          ): Promise<{ success: boolean; message: string }> {
            // Check if input is readonly
            const wasReadonly = inputElement.hasAttribute('readonly');
            if (wasReadonly) {
              inputElement.removeAttribute('readonly');
            }

            inputElement.focus();
            for (let i = 0; i < value.length; i++) {
              const char = value[i];
              inputElement.value += char;
              const inputEvent = new Event('input', { bubbles: true, cancelable: true });
              (inputEvent as any).target = inputElement;
              (inputEvent as any).data = char;
              inputElement.dispatchEvent(inputEvent);
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            const changeEvent = new Event('change', { bubbles: true, cancelable: true });
            (changeEvent as any).target = inputElement;
            inputElement.dispatchEvent(changeEvent);

            // Restore readonly if it was there
            if (wasReadonly) {
              inputElement.setAttribute('readonly', '');
            }

            return { success: true, message: 'Simulated typing completed' };
          }

          async function approach3_ModernWebAPI(
            inputElement: HTMLInputElement,
            value: string,
          ): Promise<{ success: boolean; message: string }> {
            try {
              // Check if input is readonly
              const wasReadonly = inputElement.hasAttribute('readonly');
              if (wasReadonly) {
                inputElement.removeAttribute('readonly');
              }

              if (inputElement.setRangeText) {
                inputElement.setRangeText(value, 0, inputElement.value.length, 'select');
              } else {
                inputElement.value = value;
              }
              const modernEvents = ['beforeinput', 'input', 'afterinput', 'change'];
              for (const eventType of modernEvents) {
                const event = new Event(eventType, { bubbles: true, cancelable: true });
                (event as any).target = inputElement;
                (event as any).data = value;
                (event as any).value = value;
                inputElement.dispatchEvent(event);
              }

              // Restore readonly if it was there
              if (wasReadonly) {
                inputElement.setAttribute('readonly', '');
              }

              return { success: true, message: 'Modern Web API approach completed' };
            } catch (error) {
              return { success: false, message: 'Modern Web API approach failed' };
            }
          }

          async function approach4_FormatterSpecific(
            inputElement: HTMLInputElement,
            value: string,
          ): Promise<{ success: boolean; message: string }> {
            // Check if input is readonly
            const wasReadonly = inputElement.hasAttribute('readonly');
            if (wasReadonly) {
              inputElement.removeAttribute('readonly');
            }

            inputElement.value = value;
            const formatterEvents = [
              'beforeinput',
              'input',
              'afterinput',
              'change',
              'format',
              'valuechange',
              'compositionstart',
              'compositionupdate',
              'compositionend',
            ];
            for (const eventType of formatterEvents) {
              try {
                const event = new Event(eventType, { bubbles: true, cancelable: true });
                (event as any).target = inputElement;
                (event as any).data = value;
                (event as any).value = value;
                inputElement.dispatchEvent(event);
              } catch (error) {
                continue;
              }
            }

            // Restore readonly if it was there
            if (wasReadonly) {
              inputElement.setAttribute('readonly', '');
            }

            return { success: true, message: 'Formatter-specific events completed' };
          }

          async function approach5_ComprehensiveEvents(
            inputElement: HTMLInputElement,
            value: string,
          ): Promise<{ success: boolean; message: string }> {
            // Check if input is readonly
            const wasReadonly = inputElement.hasAttribute('readonly');
            if (wasReadonly) {
              inputElement.removeAttribute('readonly');
            }

            inputElement.value = value;
            const events = ['focus', 'keydown', 'keypress', 'input', 'keyup', 'change', 'blur'];
            for (const eventType of events) {
              const event = new Event(eventType, { bubbles: true, cancelable: true });
              (event as any).target = inputElement;
              (event as any).currentTarget = inputElement;
              if (eventType === 'input' || eventType === 'change') {
                (event as any).data = value;
                (event as any).value = value;
              }
              inputElement.dispatchEvent(event);
            }

            // Restore readonly if it was there
            if (wasReadonly) {
              inputElement.setAttribute('readonly', '');
            }

            return { success: true, message: 'Comprehensive events completed' };
          }

          // Main execution logic
          try {
            // Find element using the dispatcher logic
            const elementInfo = findElement(selector);
            if (!elementInfo) {
              return {
                success: false,
                message: `No element found with selector: "${selector}" in main DOM or Shadow DOM. Please analyze the HTML and provide a valid CSS selector.`,
              };
            }

            // Check if element is visible
            if (!isElementVisible(elementInfo.element)) {
              return {
                success: false,
                message: `Element found but is hidden: "${selector}"`,
              };
            }

            // Scroll into view and focus
            scrollIntoView(elementInfo.element);

            // Function to perform the actual input
            const performInput = async () => {
              // Handle different input types
              const { element, inputType, tagName } = elementInfo;

              if (element.tagName === 'INPUT') {
                const inputElement = element as HTMLInputElement;
                const type = inputElement.type || 'text';

                if (type === 'checkbox' || type === 'radio') {
                  const shouldCheck = inputValue.toLowerCase() === 'true' || inputValue === '1';
                  inputElement.checked = shouldCheck;
                  inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                } else if (type === 'file') {
                  return {
                    success: false,
                    message: `File input fields cannot be programmatically set for security reasons`,
                  };
                } else {
                  // Text input - use advanced formatter handling
                  // Always clear the field for formatters to work properly
                  console.log('[InputDispatcher] Clearing field for formatter - Current value:', inputElement.value);
                  inputElement.value = '';

                  // Don't remove readonly at top level - let individual approaches handle it
                  // This ensures the formatter component's internal logic works correctly

                  // Try optimized formatter approaches (SimulateTyping works consistently)
                  const tryFormatterApproaches = async () => {
                    const approaches = [
                      { name: 'SimulateTyping', fn: () => approach2_SimulateTyping(inputElement, inputValue) },
                      { name: 'DirectValueSetting', fn: () => approach1_DirectValueSetting(inputElement, inputValue) },
                      { name: 'ClickAndType', fn: () => approach0_ClickAndType(inputElement, inputValue) },
                    ];

                    for (const approach of approaches) {
                      try {
                        // Log the initial value before the approach
                        const initialValue = inputElement.value;
                        console.log(`[InputDispatcher] 🔄 Trying ${approach.name} - Initial value:`, initialValue);

                        const result = await approach.fn();

                        // Log the value after the approach
                        const afterValue = inputElement.value;
                        console.log(
                          `[InputDispatcher] 📊 ${approach.name} result - Value:`,
                          afterValue,
                          'Success:',
                          result.success,
                        );

                        if (result.success) {
                          // Verify the value was actually set
                          const currentValue = inputElement.value;
                          if (currentValue && currentValue !== '') {
                            console.log(`[InputDispatcher] ✅ ${approach.name} SUCCEEDED:`, result.message);
                            console.log(
                              `[InputDispatcher] ✅ Value changed from "${initialValue}" to "${currentValue}"`,
                            );

                            // Force UI update with optimized event sequence
                            console.log('[InputDispatcher] Forcing UI update...');
                            const updateEvent = new Event('change', { bubbles: true, cancelable: true });
                            (updateEvent as any).target = inputElement;
                            inputElement.dispatchEvent(updateEvent);

                            // Try to trigger React re-render if it's a React component
                            const reactKey = Object.keys(inputElement).find(
                              key => key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalFiber'),
                            );
                            if (reactKey) {
                              try {
                                const reactInstance = (inputElement as any)[reactKey];
                                const component = reactInstance.memoizedState || reactInstance.stateNode;
                                if (component && component.forceUpdate) {
                                  component.forceUpdate();
                                  console.log('[InputDispatcher] Triggered React forceUpdate');
                                }
                              } catch (e) {
                                console.log('[InputDispatcher] React forceUpdate failed:', e);
                              }
                            }

                            return;
                          }
                        }
                      } catch (error) {
                        console.log(`[InputDispatcher] ❌ ${approach.name} failed:`, error);
                        continue;
                      }
                    }

                    // Fallback: basic streaming if all approaches fail
                    console.log('[InputDispatcher] All formatter approaches failed, using basic streaming');
                    const chars = inputValue.split('');
                    const typingSpeed = Math.max(10, Math.min(30, 500 / chars.length));

                    for (let i = 0; i < chars.length; i++) {
                      inputElement.value = inputValue.substring(0, i + 1);
                      inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                      await new Promise(resolve => setTimeout(resolve, typingSpeed));
                    }

                    inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                  };

                  // Start formatter approaches (non-blocking)
                  tryFormatterApproaches();
                }
              } else if (element.tagName === 'TEXTAREA') {
                const textareaElement = element as HTMLTextAreaElement;
                // Always clear the field for formatters to work properly
                console.log(
                  '[InputDispatcher] Clearing textarea for formatter - Current value:',
                  textareaElement.value,
                );
                textareaElement.value = '';

                // Don't remove readonly at top level - let individual approaches handle it
                // This ensures the formatter component's internal logic works correctly

                // Use optimized formatter handling for textarea as well
                const tryFormatterApproaches = async () => {
                  const approaches = [
                    { name: 'SimulateTyping', fn: () => approach2_SimulateTyping(textareaElement as any, inputValue) },
                    {
                      name: 'DirectValueSetting',
                      fn: () => approach1_DirectValueSetting(textareaElement as any, inputValue),
                    },
                    { name: 'ClickAndType', fn: () => approach0_ClickAndType(textareaElement as any, inputValue) },
                  ];

                  for (const approach of approaches) {
                    try {
                      // Log the initial value before the approach
                      const initialValue = textareaElement.value;
                      console.log(
                        `[InputDispatcher] 🔄 Trying textarea ${approach.name} - Initial value:`,
                        initialValue,
                      );

                      const result = await approach.fn();

                      // Log the value after the approach
                      const afterValue = textareaElement.value;
                      console.log(
                        `[InputDispatcher] 📊 Textarea ${approach.name} result - Value:`,
                        afterValue,
                        'Success:',
                        result.success,
                      );

                      if (result.success) {
                        const currentValue = textareaElement.value;
                        if (currentValue && currentValue !== '') {
                          console.log(`[InputDispatcher] ✅ Textarea ${approach.name} SUCCEEDED:`, result.message);
                          console.log(
                            `[InputDispatcher] ✅ Textarea value changed from "${initialValue}" to "${currentValue}"`,
                          );

                          // Force UI update with optimized event sequence
                          console.log('[InputDispatcher] Forcing textarea UI update...');
                          const updateEvent = new Event('change', { bubbles: true, cancelable: true });
                          (updateEvent as any).target = textareaElement;
                          textareaElement.dispatchEvent(updateEvent);

                          return;
                        }
                      }
                    } catch (error) {
                      console.log(`[InputDispatcher] ❌ Textarea ${approach.name} failed:`, error);
                      continue;
                    }
                  }

                  // Fallback: basic streaming
                  console.log('[InputDispatcher] All textarea formatter approaches failed, using basic streaming');
                  const chars = inputValue.split('');
                  const typingSpeed = Math.max(10, Math.min(30, 500 / chars.length));

                  for (let i = 0; i < chars.length; i++) {
                    textareaElement.value = inputValue.substring(0, i + 1);
                    textareaElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, typingSpeed));
                  }

                  textareaElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                };

                tryFormatterApproaches();
              } else if (element.tagName === 'SELECT') {
                // Handle regular select elements
                console.log('[InputDispatcher] Handling SELECT element');

                const selectElement = element as HTMLSelectElement;
                let optionFound = false;
                for (let i = 0; i < selectElement.options.length; i++) {
                  const option = selectElement.options[i];
                  if (option.value === inputValue || option.text === inputValue) {
                    selectElement.selectedIndex = i;
                    optionFound = true;
                    break;
                  }
                }
                if (!optionFound) {
                  return {
                    success: false,
                    message: `No option found with value or text: "${inputValue}"`,
                  };
                }
                selectElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              } else if (
                element.tagName === 'BUTTON' &&
                (element.getAttribute('data-slot') === 'select-trigger' || element.getAttribute('role') === 'combobox')
              ) {
                // Handle custom dropdown buttons with keyboard navigation
                console.log('[InputDispatcher] Handling custom dropdown button with keyboard navigation');

                // Try keyboard navigation approach
                const keyboardResult = await tryKeyboardNavigation(element, inputValue);
                if (keyboardResult.success) {
                  return {
                    success: true,
                    message:
                      keyboardResult.message ||
                      `Custom dropdown option "${inputValue}" selected successfully via keyboard navigation`,
                    elementInfo: {
                      tag: element.tagName,
                      type: 'select',
                      id: element.id || '',
                      name: (element as HTMLInputElement).name || '',
                      value: inputValue,
                      foundInShadowDOM: elementInfo.foundInShadowDOM,
                      shadowHost: elementInfo.shadowHostInfo,
                    },
                  };
                } else {
                  return {
                    success: false,
                    message: keyboardResult.message || 'Keyboard navigation failed for custom dropdown',
                  };
                }
              } else if (element.hasAttribute('contenteditable')) {
                if (shouldClear) {
                  element.textContent = '';
                }

                // Stream text for contenteditable as well
                const streamText = async () => {
                  const chars = inputValue.split('');
                  const typingSpeed = Math.max(10, Math.min(30, 500 / chars.length));

                  for (let i = 0; i < chars.length; i++) {
                    element.textContent = inputValue.substring(0, i + 1);
                    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, typingSpeed));
                  }
                };

                streamText();
              } else {
                return {
                  success: false,
                  message: `Element is not an input field: ${element.tagName}`,
                };
              }

              // Show success feedback
              showSuccessFeedback(element);

              return {
                success: true,
                message: 'Input successful',
                elementInfo: {
                  tag: element.tagName,
                  type: inputType || 'N/A',
                  id: element.id || '',
                  name: (element as HTMLInputElement).name || '',
                  value: getElementValue(element),
                  foundInShadowDOM: elementInfo.foundInShadowDOM,
                  shadowHost: elementInfo.shadowHostInfo,
                },
              };
            };

            // If cursor movement is enabled, wait for cursor animation to complete
            if (shouldMoveCursor) {
              focusAndHighlight(elementInfo.element, shouldMoveCursor);

              // The input will be triggered from within the cursor animation completion
              // We need to modify the cursor animation to call performInput when done
              return new Promise(resolve => {
                // Store the resolve function so cursor animation can call it
                (window as any).__copilotInputCallback__ = async () => {
                  const result = await performInput();
                  resolve(result);
                };
              });
            } else {
              // No cursor movement, perform input immediately
              focusAndHighlight(elementInfo.element, shouldMoveCursor);
              return await performInput();
            }
          } catch (error) {
            return {
              success: false,
              message: `Error inputting data: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }
        },
        args: [cssSelector, value, clearFirst, moveCursor] as [string, string, boolean, boolean],
      });

      if (results && results[0]?.result) {
        const result = results[0].result;
        if (result.success && result.elementInfo) {
          return {
            status: 'success',
            message: result.message,
            elementInfo: {
              tag: result.elementInfo.tag,
              type: result.elementInfo.type || 'N/A',
              id: result.elementInfo.id || '',
              name: result.elementInfo.name || '',
              value: result.elementInfo.value || '',
              foundInShadowDOM: result.elementInfo.foundInShadowDOM || false,
              shadowHost: result.elementInfo.shadowHost || null,
            },
          };
        } else {
          return {
            status: 'error',
            message: result.message,
          };
        }
      }

      return {
        status: 'error',
        message: 'Unable to input data into field',
      };
    } catch (error) {
      debug.error('[InputDispatcher] Error inputting data:', error);
      return {
        status: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Route to the appropriate handler based on element type and characteristics
   */
  private routeToHandler(elementInfo: any, value: string, clearFirst: boolean, moveCursor: boolean): any {
    const { element, inputType, tagName } = elementInfo;

    // Debug: Log element details
    console.log('[InputDispatcher] Routing to handler for element:', {
      tagName: element.tagName,
      inputType,
      id: element.id,
      className: element.className,
      name: element.name,
    });

    // Create options object
    const options: InputHandlerOptions = {
      clearFirst,
      triggerEvents: true,
      highlightElement: true,
      showSuccessFeedback: true,
      moveCursor,
    };

    // Try each handler in priority order
    for (const { handler, name } of this.handlers) {
      try {
        if (handler.canHandle(inputType as InputType, element)) {
          console.log(`[InputDispatcher] Using ${name} handler for ${inputType} input`);
          debug.log(`[InputDispatcher] Using ${name} handler for ${inputType} input`);

          // Execute the handler
          const result = handler.handle(element, value, options);

          // If it's a promise, we need to handle it differently in the content script
          if (result && typeof result.then === 'function') {
            // For async handlers, we'll need to handle this differently
            // For now, we'll use a synchronous approach
            return this.handleAsyncResult(result, elementInfo);
          }

          return result;
        }
      } catch (error) {
        debug.error(`[InputDispatcher] Error with ${name} handler:`, error);
        // Continue to next handler
      }
    }

    // If no handler can handle the element, return error
    return {
      success: false,
      message: `No suitable handler found for element type: ${inputType || tagName}`,
    };
  }

  /**
   * Handle async results from handlers (simplified for content script context)
   */
  private handleAsyncResult(asyncResult: Promise<any>, elementInfo: any): any {
    // In a real implementation, we'd need to handle async operations
    // For now, we'll return a synchronous result
    return {
      success: true,
      message: 'Input handled successfully',
      elementInfo: {
        tag: elementInfo.element.tagName,
        type: elementInfo.inputType || 'N/A',
        id: elementInfo.element.id || '',
        name: (elementInfo.element as HTMLInputElement).name || '',
        value: this.getElementValue(elementInfo.element),
        foundInShadowDOM: elementInfo.foundInShadowDOM,
        shadowHost: elementInfo.shadowHostInfo,
      },
    };
  }

  /**
   * Find element in DOM or Shadow DOM (content script version)
   */
  private findElement(selector: string): any {
    // First try to find element in main DOM
    let element = document.querySelector(selector) as HTMLElement;
    let foundInShadowDOM = false;
    let shadowHostInfo = '';

    // If not found in main DOM, search in Shadow DOM
    if (!element) {
      console.log('[InputDispatcher] Element not found in main DOM, searching Shadow DOM...');

      // Search through all shadow roots with early exit
      for (const hostElement of Array.from(document.querySelectorAll('*'))) {
        if (hostElement.shadowRoot && !element) {
          try {
            const shadowElement = hostElement.shadowRoot.querySelector(selector) as HTMLElement;
            if (shadowElement) {
              element = shadowElement;
              foundInShadowDOM = true;
              shadowHostInfo = `${hostElement.tagName}${hostElement.id ? '#' + hostElement.id : ''}${hostElement.className ? '.' + hostElement.className.split(' ')[0] : ''}`;
              console.log('[InputDispatcher] Found element in Shadow DOM:', shadowHostInfo);
              break;
            }
          } catch (shadowError) {
            console.log('[InputDispatcher] Shadow DOM query error:', shadowError);
          }
        }
      }
    }

    if (!element) {
      return null;
    }

    const inputType = (element as HTMLInputElement).type || '';
    const tagName = element.tagName.toLowerCase();

    return {
      element,
      foundInShadowDOM,
      shadowHostInfo,
      inputType,
      tagName,
    };
  }

  /**
   * Check if element is visible (content script version)
   */
  private isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return !(
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      element.offsetWidth === 0 ||
      element.offsetHeight === 0
    );
  }

  /**
   * Scroll element into view (content script version)
   */
  private scrollIntoView(element: HTMLElement): void {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }

  /**
   * Focus and highlight element (content script version)
   */
  private focusAndHighlight(element: HTMLElement): void {
    // Store original styles
    const originalStyle = element.style.cssText;
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;
    const originalBackground = element.style.backgroundColor;

    // Focus the element
    element.focus();

    // Highlight the element
    element.style.outline = '3px solid #2196F3';
    element.style.outlineOffset = '4px';
    element.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
    element.style.transition = 'all 0.3s ease';

    // Remove highlight after 2 seconds
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.outlineOffset = originalOutlineOffset;
      element.style.backgroundColor = originalBackground;
      element.style.transition = '';
    }, 2000);
  }

  /**
   * Get element value (content script version)
   */
  private getElementValue(element: HTMLElement): string {
    if (element.tagName === 'INPUT') {
      const inputElement = element as HTMLInputElement;
      const type = inputElement.type;

      if (type === 'checkbox' || type === 'radio') {
        return inputElement.checked ? 'checked' : 'unchecked';
      }

      return inputElement.value;
    }

    if (element.tagName === 'TEXTAREA') {
      return (element as HTMLTextAreaElement).value;
    }

    if (element.tagName === 'SELECT') {
      return (element as HTMLSelectElement).value;
    }

    if (element.hasAttribute('contenteditable')) {
      return element.textContent || '';
    }

    return '';
  }

  /**
   * Get handler statistics for debugging
   */
  getHandlerStats(): Array<{ name: string; priority: number; supportedTypes: string[] }> {
    return this.handlers.map(({ handler, priority, name }) => ({
      name,
      priority,
      supportedTypes: handler.supportedTypes || [],
    }));
  }

  /**
   * Add a custom handler
   */
  addHandler(handler: any, priority: number = 50, name: string = 'Custom'): void {
    this.handlers.push({ handler, priority, name });
    this.handlers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a handler by name
   */
  removeHandler(name: string): boolean {
    const index = this.handlers.findIndex(h => h.name === name);
    if (index !== -1) {
      this.handlers.splice(index, 1);
      return true;
    }
    return false;
  }
}

// Create and export a singleton instance
export const inputDispatcher = new InputDispatcher();

// Export the main function for backward compatibility
export async function handleInputData(
  cssSelector: string,
  value: string,
  clearFirst: boolean = true,
  moveCursor: boolean = true,
): Promise<InputDataResult> {
  return inputDispatcher.handleInputData(cssSelector, value, clearFirst, moveCursor);
}
