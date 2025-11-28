/**
 * Select Input Handler
 *
 * Specialized handler for select dropdowns.
 * Handles single and multiple selections, modern web app patterns, and custom dropdowns.
 */

import { debug as baseDebug } from '@extension/shared';
import { InputHandler, InputDataResult, SelectInputOptions, InputType, ModernInputDetection } from './types';
import {
  findElement,
  isElementVisible,
  scrollIntoView,
  focusAndHighlight,
  showSuccessFeedback,
  triggerInputEvents,
  detectModernInput,
} from './utils';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[SelectInput]';

/** Supported input types */
const SUPPORTED_TYPES: InputType[] = ['select'];

/** Timing constants */
const TIMING = {
  DROPDOWN_OPEN_DELAY_MS: 100,
  OPTION_CLICK_DELAY_MS: 50,
  CURSOR_MOVE_DELAY_MS: 500,
  FOCUS_DELAY_MS: 100,
  KEYBOARD_NAV_MIN_DELAY_MS: 150,
  KEYBOARD_NAV_RANGE_MS: 100,
  ENTER_DELAY_MIN_MS: 200,
  ENTER_DELAY_RANGE_MS: 100,
} as const;

/** Option text length limit for filtering */
const MAX_OPTION_TEXT_LENGTH = 50;

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

/** Option match result */
interface OptionMatch {
  option: HTMLOptionElement;
  index: number;
}

/** Custom dropdown option */
interface CustomOption {
  element: HTMLElement;
  text: string;
  value: string;
}

/** Window with cursor function */
interface WindowWithCursor {
  moveCursorToElement?: (element: HTMLElement) => void;
}

// ============================================================================
// HANDLER-LEVEL DEDUPLICATION
// ============================================================================

/** Active operations map for deduplication */
const activeOperations = new Map<string, Promise<InputDataResult>>();

/**
 * Create a unique operation key
 */
function createOperationKey(element: HTMLElement, value: string): string {
  const id = element.id || '';
  const name = (element as HTMLSelectElement).name || '';
  const tag = element.tagName;
  return `${tag}:${id}:${name}:${value.substring(0, 50)}`;
}

// ============================================================================
// SELECT INPUT HANDLER CLASS
// ============================================================================

/**
 * Specialized handler for select dropdowns
 * Handles single and multiple selections, modern web app patterns, and custom dropdowns
 */
export class SelectInputHandler implements InputHandler {
  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return SUPPORTED_TYPES.includes(inputType) && element.tagName === 'SELECT';
  }

  async handle(element: HTMLElement, value: string, options: SelectInputOptions = {}): Promise<InputDataResult> {
    // Handler-level deduplication
    const opKey = createOperationKey(element, value);
    const existingOp = activeOperations.get(opKey);
    if (existingOp) {
      debug.log(LOG_PREFIX, 'Duplicate operation detected, reusing existing promise');
      return existingOp;
    }

    const operationPromise = this.executeHandle(element, value, options);
    activeOperations.set(opKey, operationPromise);

    try {
      return await operationPromise;
    } finally {
      activeOperations.delete(opKey);
    }
  }

  private async executeHandle(
    element: HTMLElement,
    value: string,
    options: SelectInputOptions,
  ): Promise<InputDataResult> {
    try {
      const selectElement = element as HTMLSelectElement;

      debug.log(LOG_PREFIX, 'Handling select:', { id: selectElement.id, value });

      if (!isElementVisible(selectElement)) {
        scrollIntoView(selectElement);
      }
      await focusAndHighlight(selectElement);

      // Move cursor to element if requested
      if (options.moveCursor) {
        this.moveCursorToElement(element);
      }

      // Find the matching option
      const optionInfo = this.findMatchingOption(selectElement, value, options);

      if (!optionInfo) {
        return {
          status: 'error',
          message: `No option found matching: "${value}" in select element. Available options: ${this.getAvailableOptions(selectElement)}`,
        };
      }

      // Simulate click on dropdown trigger first (best-effort)
      await this.simulateDropdownClick(selectElement);

      // Set the selection
      selectElement.selectedIndex = optionInfo.index;

      // Simulate click on the selected option
      await this.simulateOptionClick(optionInfo.option);

      // Trigger events for modern frameworks
      const modernDetection = detectModernInput(selectElement);
      const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];

      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }

      triggerInputEvents(selectElement, events);

      // Show success feedback
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(selectElement);
      }

      debug.log(LOG_PREFIX, 'Selection successful:', optionInfo.option.text);

      return {
        status: 'success',
        message: `Select option "${optionInfo.option.text}" selected successfully`,
        elementInfo: {
          tag: selectElement.tagName,
          type: 'select',
          id: selectElement.id,
          name: selectElement.name || '',
          value: optionInfo.option.value,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error:', errorMessage);
      return {
        status: 'error',
        message: `Error handling select input: ${errorMessage}`,
      };
    }
  }

  private findMatchingOption(
    selectElement: HTMLSelectElement,
    value: string,
    options: SelectInputOptions,
  ): OptionMatch | null {
    const matchBy = options.matchBy ?? 'both';
    const caseSensitive = options.caseSensitive ?? false;
    const partialMatch = options.partialMatch ?? false;
    const preferValueOverText = options.preferValueOverText ?? true;

    const searchValue = caseSensitive ? value : value.toLowerCase();

    for (let i = 0; i < selectElement.options.length; i++) {
      const option = selectElement.options[i];

      // Skip disabled options
      if (option.disabled) continue;

      const optionValue = caseSensitive ? option.value : option.value.toLowerCase();
      const optionText = caseSensitive ? option.text : option.text.toLowerCase();

      // Check for exact match first (prefer value matching before text)
      if (preferValueOverText && (matchBy === 'value' || matchBy === 'both')) {
        if (partialMatch) {
          if (optionValue.includes(searchValue)) {
            return { option, index: i };
          }
        } else {
          if (optionValue === searchValue) {
            return { option, index: i };
          }
        }
      }

      if (matchBy === 'text' || matchBy === 'both') {
        if (partialMatch) {
          if (optionText.includes(searchValue)) {
            return { option, index: i };
          }
        } else {
          if (optionText === searchValue) {
            return { option, index: i };
          }
        }
      }

      // Check for index match
      if (matchBy === 'index') {
        const indexValue = parseInt(value);
        if (!isNaN(indexValue) && indexValue === i) {
          return { option, index: i };
        }
      }
    }

    return null;
  }

  private getAvailableOptions(selectElement: HTMLSelectElement): string {
    const options: string[] = [];

    for (let i = 0; i < selectElement.options.length; i++) {
      const option = selectElement.options[i];
      if (!option.disabled) {
        options.push(`"${option.text}" (value: "${option.value}")`);
      }
    }

    return options.join(', ');
  }

  /**
   * Handle multiple select (select with multiple attribute)
   */
  async handleMultipleSelect(
    selector: string,
    values: string[],
    options: SelectInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const selectElement = elementInfo.element as HTMLSelectElement;

      if (!selectElement.multiple) {
        return {
          status: 'error',
          message: 'Select element does not support multiple selections. Use handle() for single selection.',
        };
      }

      debug.log(LOG_PREFIX, 'Handling multiple select:', { values });

      // Simulate click on dropdown trigger first
      await this.simulateDropdownClick(selectElement);

      // Clear existing selections
      for (let i = 0; i < selectElement.options.length; i++) {
        selectElement.options[i].selected = false;
      }

      let selectedCount = 0;
      const selectedOptions: string[] = [];

      // Select matching options
      for (const value of values) {
        const optionInfo = this.findMatchingOption(selectElement, value, options);
        if (optionInfo) {
          optionInfo.option.selected = true;
          // Simulate click on each selected option
          await this.simulateOptionClick(optionInfo.option);
          selectedCount++;
          selectedOptions.push(optionInfo.option.text);
        }
      }

      if (selectedCount === 0) {
        return {
          status: 'error',
          message: `No options found matching any of: ${values.join(', ')}`,
        };
      }

      // Trigger events
      const modernDetection = detectModernInput(selectElement);
      const events = ['input', 'change'];

      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }

      triggerInputEvents(selectElement, events);

      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(selectElement);
      }

      return {
        status: 'success',
        message: `Multiple select successful: ${selectedOptions.join(', ')}`,
        elementInfo: {
          tag: selectElement.tagName,
          type: 'select',
          id: selectElement.id,
          name: selectElement.name || '',
          value: selectedOptions.join(', '),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error handling multiple select:', errorMessage);
      return {
        status: 'error',
        message: `Error handling multiple select: ${errorMessage}`,
      };
    }
  }

  /**
   * Handle select with search/filter functionality
   */
  async handleSelectWithSearch(
    selector: string,
    searchTerm: string,
    options: SelectInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const selectElement = elementInfo.element as HTMLSelectElement;

      // Find options that match the search term
      const matchingOptions = this.findMatchingOptions(selectElement, searchTerm, {
        ...options,
        partialMatch: true,
      });

      if (matchingOptions.length === 0) {
        return {
          status: 'error',
          message: `No options found matching search term: "${searchTerm}"`,
        };
      }

      // If multiple matches, select the first one
      const selectedOption = matchingOptions[0];

      debug.log(LOG_PREFIX, 'Search found option:', selectedOption.option.text);

      // Simulate click on dropdown trigger first
      await this.simulateDropdownClick(selectElement);

      // Set the selection
      selectElement.selectedIndex = selectedOption.index;

      // Simulate click on the selected option
      await this.simulateOptionClick(selectedOption.option);

      // Trigger events
      const modernDetection = detectModernInput(selectElement);
      const events = ['input', 'change'];

      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }

      triggerInputEvents(selectElement, events);

      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(selectElement);
      }

      return {
        status: 'success',
        message: `Select search successful: "${selectedOption.option.text}" selected`,
        elementInfo: {
          tag: selectElement.tagName,
          type: 'select',
          id: selectElement.id,
          name: selectElement.name || '',
          value: selectedOption.option.value,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error handling select search:', errorMessage);
      return {
        status: 'error',
        message: `Error handling select search: ${errorMessage}`,
      };
    }
  }

  private findMatchingOptions(
    selectElement: HTMLSelectElement,
    searchTerm: string,
    options: SelectInputOptions,
  ): OptionMatch[] {
    const matches: OptionMatch[] = [];
    const caseSensitive = options.caseSensitive ?? false;
    const searchValue = caseSensitive ? searchTerm : searchTerm.toLowerCase();

    for (let i = 0; i < selectElement.options.length; i++) {
      const option = selectElement.options[i];

      if (option.disabled) continue;

      const optionText = caseSensitive ? option.text : option.text.toLowerCase();

      if (optionText.includes(searchValue)) {
        matches.push({ option, index: i });
      }
    }

    return matches;
  }

  /**
   * Handle custom dropdown (non-select elements that behave like dropdowns)
   * Uses keyboard navigation for better reliability
   */
  async handleCustomDropdown(
    selector: string,
    value: string,
    options: SelectInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const dropdownElement = elementInfo.element;

      debug.log(LOG_PREFIX, 'Handling custom dropdown:', { value });

      // Move cursor to element if requested
      if (options.moveCursor) {
        this.moveCursorToElement(dropdownElement);
        await new Promise(resolve => setTimeout(resolve, TIMING.CURSOR_MOVE_DELAY_MS));
      }

      // Try keyboard navigation approach first
      const keyboardResult = await this.tryKeyboardNavigation(dropdownElement, value, options);
      if (keyboardResult.success && keyboardResult.result) {
        return keyboardResult.result;
      }

      // Fallback to traditional approach
      const dropdownOptions = this.findCustomDropdownOptions(dropdownElement);

      if (dropdownOptions.length === 0) {
        return {
          status: 'error',
          message: 'No dropdown options found. This may not be a dropdown element.',
        };
      }

      // Find matching option
      const matchingOption = this.findMatchingCustomOption(dropdownOptions, value, {
        caseSensitive: options.caseSensitive ?? false,
        partialMatch: options.partialMatch ?? false,
      });

      if (!matchingOption) {
        return {
          status: 'error',
          message: `No option found matching: "${value}"`,
        };
      }

      // Click the option to select it
      matchingOption.element.click();

      // Trigger events
      const modernDetection = detectModernInput(dropdownElement);
      const events = ['click', 'change'];

      if (modernDetection.isReactComponent) {
        events.push('input', 'focus', 'blur');
      }

      events.forEach(eventType => {
        dropdownElement.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
      });

      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(dropdownElement);
      }

      return {
        status: 'success',
        message: `Custom dropdown option "${matchingOption.text}" selected successfully`,
        elementInfo: {
          tag: dropdownElement.tagName,
          type: 'custom-dropdown',
          id: dropdownElement.id,
          name: dropdownElement.getAttribute('name') || '',
          value: matchingOption.value,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error handling custom dropdown:', errorMessage);
      return {
        status: 'error',
        message: `Error handling custom dropdown: ${errorMessage}`,
      };
    }
  }

  private findCustomDropdownOptions(dropdownElement: HTMLElement): CustomOption[] {
    const options: CustomOption[] = [];

    // Common dropdown option selectors
    const optionSelectors = [
      '[role="option"]',
      '.dropdown-option',
      '.select-option',
      '.menu-item',
      'li[data-value]',
      'div[data-value]',
      'span[data-value]',
    ];

    for (const selector of optionSelectors) {
      const optionElements = dropdownElement.querySelectorAll(selector);
      optionElements.forEach(element => {
        const text = element.textContent?.trim() || '';
        const value = element.getAttribute('data-value') || element.getAttribute('value') || text;

        if (text) {
          options.push({
            element: element as HTMLElement,
            text,
            value,
          });
        }
      });
    }

    return options;
  }

  private findMatchingCustomOption(
    options: CustomOption[],
    searchValue: string,
    matchOptions: { caseSensitive: boolean; partialMatch: boolean },
  ): CustomOption | null {
    const search = matchOptions.caseSensitive ? searchValue : searchValue.toLowerCase();

    for (const option of options) {
      const optionText = matchOptions.caseSensitive ? option.text : option.text.toLowerCase();
      const optionValue = matchOptions.caseSensitive ? option.value : option.value.toLowerCase();

      if (matchOptions.partialMatch) {
        if (optionText.includes(search) || optionValue.includes(search)) {
          return option;
        }
      } else {
        if (optionText === search || optionValue === search) {
          return option;
        }
      }
    }

    return null;
  }

  /**
   * Get all available options from a select element
   */
  getSelectOptions(selector: string): Array<{ text: string; value: string; index: number }> {
    const elementInfo = findElement(selector);
    if (!elementInfo || elementInfo.element.tagName !== 'SELECT') {
      return [];
    }

    const selectElement = elementInfo.element as HTMLSelectElement;
    const options: Array<{ text: string; value: string; index: number }> = [];

    for (let i = 0; i < selectElement.options.length; i++) {
      const option = selectElement.options[i];
      if (!option.disabled) {
        options.push({
          text: option.text,
          value: option.value,
          index: i,
        });
      }
    }

    return options;
  }

  /**
   * Move cursor to element with sophisticated animation
   */
  private moveCursorToElement(element: HTMLElement): void {
    try {
      const win = window as unknown as WindowWithCursor;
      if (typeof win.moveCursorToElement === 'function') {
        win.moveCursorToElement(element);
        return;
      }

      // Fallback to simple cursor movement
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const mouseMoveEvent = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        screenX: centerX + window.screenX,
        screenY: centerY + window.screenY,
      });

      element.dispatchEvent(mouseMoveEvent);

      debug.log(LOG_PREFIX, 'Cursor moved to element:', element.tagName);
    } catch (error) {
      debug.error(LOG_PREFIX, 'Error moving cursor:', error);
    }
  }

  /**
   * Simulate click on dropdown trigger to open the dropdown
   */
  private async simulateDropdownClick(selectElement: HTMLSelectElement): Promise<void> {
    return new Promise(resolve => {
      selectElement.focus();

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      selectElement.dispatchEvent(clickEvent);

      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      selectElement.dispatchEvent(mouseDownEvent);
      selectElement.dispatchEvent(mouseUpEvent);

      setTimeout(resolve, TIMING.DROPDOWN_OPEN_DELAY_MS);
    });
  }

  /**
   * Simulate click on the selected option
   */
  private async simulateOptionClick(optionElement: HTMLOptionElement): Promise<void> {
    return new Promise(resolve => {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      optionElement.dispatchEvent(clickEvent);

      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      optionElement.dispatchEvent(mouseDownEvent);
      optionElement.dispatchEvent(mouseUpEvent);

      setTimeout(resolve, TIMING.OPTION_CLICK_DELAY_MS);
    });
  }

  /**
   * Try keyboard navigation approach for custom dropdowns
   */
  private async tryKeyboardNavigation(
    dropdownElement: HTMLElement,
    value: string,
    _options: SelectInputOptions,
  ): Promise<{ success: boolean; result?: InputDataResult }> {
    try {
      debug.log(LOG_PREFIX, 'Starting keyboard navigation for:', value);

      // Helper function to determine if an option is selectable
      const isSelectableOption = (text: string): boolean => {
        if (!text || text.length === 0) return false;
        return text.length < MAX_OPTION_TEXT_LENGTH && !text.includes('?') && !text.includes('*');
      };

      // First, ensure the dropdown is focused
      dropdownElement.focus();
      debug.log(LOG_PREFIX, 'Focused dropdown');

      await new Promise(resolve => setTimeout(resolve, TIMING.FOCUS_DELAY_MS));

      // Get all available options
      const allOptions: Array<{ element: Element; text: string }> = [];
      const optionSelectors = [
        '[role="option"]',
        '.dropdown-option',
        '.select-option',
        '.menu-item',
        '[data-slot="select-item"]',
        '[data-slot="select-option"]',
        'li[data-value]',
        'div[data-value]',
        'span[data-value]',
        'button[data-value]',
        '[class*="option"]',
        '[class*="item"]',
        'option',
      ];

      // Find the container
      const container =
        dropdownElement.closest('[data-slot="form-item"], .dropdown, .select, [role="listbox"], [role="menu"]') ||
        dropdownElement.parentElement;

      for (const selector of optionSelectors) {
        const optionElements = container?.querySelectorAll(selector) ?? [];
        for (let i = 0; i < optionElements.length; i++) {
          const option = optionElements[i];
          const text = option.textContent?.trim();
          if (text && isSelectableOption(text)) {
            allOptions.push({ element: option, text });
          }
        }
      }

      debug.log(
        LOG_PREFIX,
        'Available options:',
        allOptions.map(opt => opt.text),
      );

      // Find the target option index
      const targetIndex = allOptions.findIndex(opt => opt.text === value);
      if (targetIndex === -1) {
        debug.log(LOG_PREFIX, 'Target option not found');
        return { success: false };
      }

      debug.log(LOG_PREFIX, 'Target found at index:', targetIndex);

      // Navigate using arrow keys
      for (let i = 0; i <= targetIndex; i++) {
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

        const delay = TIMING.KEYBOARD_NAV_MIN_DELAY_MS + Math.random() * TIMING.KEYBOARD_NAV_RANGE_MS;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      debug.log(LOG_PREFIX, 'Pressing Enter to select');

      await new Promise(resolve =>
        setTimeout(resolve, TIMING.ENTER_DELAY_MIN_MS + Math.random() * TIMING.ENTER_DELAY_RANGE_MS),
      );

      // Press Enter to select
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

      // Trigger change event on any hidden select
      const hiddenSelect = container?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement | null;
      if (hiddenSelect) {
        hiddenSelect.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      }

      debug.log(LOG_PREFIX, 'Keyboard navigation completed');

      return {
        success: true,
        result: {
          status: 'success',
          message: `Custom dropdown option "${value}" selected successfully via keyboard navigation`,
          elementInfo: {
            tag: dropdownElement.tagName,
            type: 'custom-dropdown',
            id: dropdownElement.id,
            name: dropdownElement.getAttribute('name') || '',
            value: value,
          },
        },
      };
    } catch (keyboardError) {
      debug.log(LOG_PREFIX, 'Keyboard navigation failed:', keyboardError);
      return { success: false };
    }
  }
}
