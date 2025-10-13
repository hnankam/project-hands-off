import { InputHandler, InputDataResult, InputHandlerOptions, SelectInputOptions, InputType } from './types';
import { 
  findElement, 
  isElementVisible, 
  scrollIntoView, 
  focusAndHighlight, 
  showSuccessFeedback, 
  getElementValue,
  triggerInputEvents,
  detectModernInput,
  moveCursorToElement
} from './utils';

/**
 * Specialized handler for select dropdowns
 * Handles single and multiple selections, modern web app patterns, and custom dropdowns
 */
export class SelectInputHandler implements InputHandler {
  private supportedTypes: InputType[] = ['select'];

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return this.supportedTypes.includes(inputType) && element.tagName === 'SELECT';
  }

  async handle(
    element: HTMLElement, 
    value: string, 
    options: SelectInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const selectElement = element as HTMLSelectElement;
      
      // Move cursor to element if requested
      if (options.moveCursor) {
        this.moveCursorToElement(element);
      }
      
      // Find the matching option
      const optionInfo = this.findMatchingOption(selectElement, value, options);
      
      if (!optionInfo) {
        return {
          status: 'error',
          message: `No option found matching: "${value}" in select element. Available options: ${this.getAvailableOptions(selectElement)}`
        };
      }
      
      // Simulate click on dropdown trigger first
      await this.simulateDropdownClick(selectElement);
      
      // Set the selection
      selectElement.selectedIndex = optionInfo.index;
      
      // Simulate click on the selected option
      await this.simulateOptionClick(optionInfo.option);
      
      // Trigger events for modern frameworks
      const modernDetection = detectModernInput(selectElement);
      const events = ['input', 'change'];
      
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      
      triggerInputEvents(selectElement, events);
      
      // Show success feedback
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(selectElement);
      }
      
      return {
        status: 'success',
        message: `Select option "${optionInfo.option.text}" selected successfully`,
        elementInfo: {
          tag: selectElement.tagName,
          type: 'select',
          id: selectElement.id,
          name: selectElement.name || '',
          value: optionInfo.option.value
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling select input: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private findMatchingOption(
    selectElement: HTMLSelectElement, 
    value: string, 
    options: SelectInputOptions
  ): { option: HTMLOptionElement; index: number } | null {
    const matchBy = options.matchBy || 'both';
    const caseSensitive = options.caseSensitive || false;
    const partialMatch = options.partialMatch || false;
    
    const searchValue = caseSensitive ? value : value.toLowerCase();
    
    for (let i = 0; i < selectElement.options.length; i++) {
      const option = selectElement.options[i];
      
      // Skip disabled options
      if (option.disabled) continue;
      
      let optionValue = caseSensitive ? option.value : option.value.toLowerCase();
      let optionText = caseSensitive ? option.text : option.text.toLowerCase();
      
      // Check for exact match first
      if (matchBy === 'value' || matchBy === 'both') {
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
    options: SelectInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`
        };
      }
      
      const selectElement = elementInfo.element as HTMLSelectElement;
      
      if (!selectElement.multiple) {
        return {
          status: 'error',
          message: 'Select element does not support multiple selections. Use handle() for single selection.'
        };
      }
      
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
          message: `No options found matching any of: ${values.join(', ')}`
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
          value: selectedOptions.join(', ')
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling multiple select: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Handle select with search/filter functionality
   */
  async handleSelectWithSearch(
    selector: string,
    searchTerm: string,
    options: SelectInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`
        };
      }
      
      const selectElement = elementInfo.element as HTMLSelectElement;
      
      // Find options that match the search term
      const matchingOptions = this.findMatchingOptions(selectElement, searchTerm, {
        ...options,
        partialMatch: true
      });
      
      if (matchingOptions.length === 0) {
        return {
          status: 'error',
          message: `No options found matching search term: "${searchTerm}"`
        };
      }
      
      // If multiple matches, select the first one
      const selectedOption = matchingOptions[0];
      
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
          value: selectedOption.option.value
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling select search: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private findMatchingOptions(
    selectElement: HTMLSelectElement,
    searchTerm: string,
    options: SelectInputOptions
  ): { option: HTMLOptionElement; index: number }[] {
    const matches: { option: HTMLOptionElement; index: number }[] = [];
    const caseSensitive = options.caseSensitive || false;
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
    options: SelectInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`
        };
      }
      
      const dropdownElement = elementInfo.element;
      
      // Move cursor to element if requested
      if (options.moveCursor) {
        this.moveCursorToElement(dropdownElement);
        // Wait for cursor movement to complete
        await new Promise(resolve => setTimeout(resolve, 500));
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
          message: 'No dropdown options found. This may not be a dropdown element.'
        };
      }
      
      // Find matching option
      const matchingOption = this.findMatchingCustomOption(dropdownOptions, value, {
        caseSensitive: options.caseSensitive || false,
        partialMatch: options.partialMatch || false
      });
      
      if (!matchingOption) {
        return {
          status: 'error',
          message: `No option found matching: "${value}"`
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
          value: matchingOption.value
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling custom dropdown: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private findCustomDropdownOptions(dropdownElement: HTMLElement): Array<{
    element: HTMLElement;
    text: string;
    value: string;
  }> {
    const options: Array<{ element: HTMLElement; text: string; value: string }> = [];
    
    // Common dropdown option selectors
    const optionSelectors = [
      '[role="option"]',
      '.dropdown-option',
      '.select-option',
      '.menu-item',
      'li[data-value]',
      'div[data-value]',
      'span[data-value]'
    ];
    
    for (const selector of optionSelectors) {
      const optionElements = dropdownElement.querySelectorAll(selector);
      optionElements.forEach(element => {
        const text = element.textContent?.trim() || '';
        const value = element.getAttribute('data-value') || 
                     element.getAttribute('value') || 
                     text;
        
        if (text) {
          options.push({
            element: element as HTMLElement,
            text,
            value
          });
        }
      });
    }
    
    return options;
  }

  private findMatchingCustomOption(
    options: Array<{ element: HTMLElement; text: string; value: string }>,
    searchValue: string,
    matchOptions: { caseSensitive: boolean; partialMatch: boolean }
  ): { element: HTMLElement; text: string; value: string } | null {
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
          index: i
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
      // Debug: Log element details
      const rect = element.getBoundingClientRect();
      console.log('[SelectInputHandler] Moving cursor to element:', {
        tagName: element.tagName,
        id: element.id,
        className: element.className,
        position: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      });
      
      // Use the moveCursorToElement function from the content script context if available
      if (typeof (window as any).moveCursorToElement === 'function') {
        (window as any).moveCursorToElement(element);
        return;
      }
      
      // Fallback to simple cursor movement
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Create and dispatch a mouse move event
      const mouseMoveEvent = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        screenX: centerX + window.screenX,
        screenY: centerY + window.screenY
      });
      
      // Dispatch the event on the element
      element.dispatchEvent(mouseMoveEvent);
      
      console.log('[SelectInputHandler] Cursor moved to element:', element.tagName, element.id || element.className);
    } catch (error) {
      console.error('[SelectInputHandler] Error moving cursor to element:', error);
    }
  }

  /**
   * Simulate click on dropdown trigger to open the dropdown
   */
  private async simulateDropdownClick(selectElement: HTMLSelectElement): Promise<void> {
    return new Promise((resolve) => {
      // Focus the select element first
      selectElement.focus();
      
      // Create and dispatch click event
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      selectElement.dispatchEvent(clickEvent);
      
      // Also dispatch mousedown and mouseup events for more realistic interaction
      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      selectElement.dispatchEvent(mouseDownEvent);
      selectElement.dispatchEvent(mouseUpEvent);
      
      // Small delay to allow dropdown to open
      setTimeout(() => {
        resolve();
      }, 100);
    });
  }

  /**
   * Simulate click on the selected option
   */
  private async simulateOptionClick(optionElement: HTMLOptionElement): Promise<void> {
    return new Promise((resolve) => {
      // Create and dispatch click event on the option
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      optionElement.dispatchEvent(clickEvent);
      
      // Also dispatch mousedown and mouseup events for more realistic interaction
      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      optionElement.dispatchEvent(mouseDownEvent);
      optionElement.dispatchEvent(mouseUpEvent);
      
      // Small delay to allow option selection to process
      setTimeout(() => {
        resolve();
      }, 50);
    });
  }

  /**
   * Try keyboard navigation approach for custom dropdowns
   */
  private async tryKeyboardNavigation(
    dropdownElement: HTMLElement, 
    value: string, 
    options: SelectInputOptions
  ): Promise<{ success: boolean; result?: InputDataResult }> {
    try {
      console.log('[SelectInputHandler] Starting keyboard navigation to find option:', value);
      
      // Helper function to determine if an option is selectable
      const isSelectableOption = (text: string): boolean => {
        if (!text || text.length === 0) return false;
        // Filter out non-selectable options (labels, descriptions, etc.)
        // Skip options that are too long (likely descriptions) or contain question marks
        return text.length < 50 && !text.includes('?') && !text.includes('*');
      };
      
      // First, ensure the dropdown is focused
      dropdownElement.focus();
      console.log('[SelectInputHandler] Focused dropdown button');
      
      // Wait for focus to take effect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get all available options to determine navigation path
      const allOptions = [];
      const optionSelectors = [
        '[role="option"]', '.dropdown-option', '.select-option', '.menu-item',
        '[data-slot="select-item"]', '[data-slot="select-option"]',
        'li[data-value]', 'div[data-value]', 'span[data-value]', 'button[data-value]',
        '[class*="option"]', '[class*="item"]', 'option'
      ];
      
      // Find the container (parent of dropdown)
      const container = dropdownElement.closest('[data-slot="form-item"], .dropdown, .select, [role="listbox"], [role="menu"]') || dropdownElement.parentElement;
      
      for (const selector of optionSelectors) {
        const options = container?.querySelectorAll(selector) || [];
        for (let i = 0; i < options.length; i++) {
          const option = options[i];
          const text = option.textContent?.trim();
          if (isSelectableOption(text)) {
            allOptions.push({
              element: option,
              text: text
            });
          }
        }
      }
      
      console.log('[SelectInputHandler] Available options for keyboard navigation:', allOptions.map(opt => opt.text));
      
      // Find the target option index
      const targetIndex = allOptions.findIndex(opt => opt.text === value);
      if (targetIndex === -1) {
        console.log('[SelectInputHandler] Target option not found in available options, cannot use keyboard navigation');
        return { success: false };
      }
      
      console.log('[SelectInputHandler] Target option found at index:', targetIndex);
      
      // Navigate to the target option using arrow down keys with human-like delays
      for (let i = 0; i <= targetIndex; i++) {
        console.log('[SelectInputHandler] Pressing ArrowDown key (step', i + 1, 'of', targetIndex + 1, ')');
        
        const keyDownEvent = new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          code: 'ArrowDown',
          keyCode: 40,
          which: 40,
          bubbles: true,
          cancelable: true,
          view: window
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
          view: window
        });
        
        dropdownElement.dispatchEvent(keyUpEvent);
        
        // Human-like delay between key presses (150-250ms)
        const delay = 150 + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      console.log('[SelectInputHandler] Reached target option, pressing Enter to select');
      
      // Human-like delay before pressing Enter
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 100));
      
      // Press Enter to select the option
      const enterDownEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      dropdownElement.dispatchEvent(enterDownEvent);
      
      const enterUpEvent = new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      dropdownElement.dispatchEvent(enterUpEvent);
      
      // Trigger change event on any hidden select element
      const hiddenSelect = container?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
      if (hiddenSelect) {
        hiddenSelect.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      }
      
      console.log('[SelectInputHandler] Keyboard navigation completed successfully');
      
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
            value: value
          }
        }
      };
      
    } catch (keyboardError) {
      console.log('[SelectInputHandler] Keyboard navigation failed:', keyboardError);
      return { success: false };
    }
  }
}
