import { InputHandler, InputDataResult, InputHandlerOptions, CheckboxRadioOptions, InputType } from './types';
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
 * Specialized handler for checkbox and radio inputs
 * Handles modern web app patterns and grouped radio buttons
 */
export class CheckboxRadioHandler implements InputHandler {
  private supportedTypes: InputType[] = ['checkbox', 'radio'];

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return this.supportedTypes.includes(inputType) && element.tagName === 'INPUT';
  }

  async handle(
    element: HTMLElement, 
    value: string, 
    options: CheckboxRadioOptions = {}
  ): Promise<InputDataResult> {
    try {
      const inputElement = element as HTMLInputElement;
      const inputType = inputElement.type;
      
      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }
      
      // Parse the value to determine if it should be checked
      const shouldCheck = this.parseCheckValue(value, options);
      
      // Handle radio button groups
      if (inputType === 'radio') {
        return await this.handleRadioButton(inputElement, shouldCheck, options);
      } else {
        return await this.handleCheckbox(inputElement, shouldCheck, options);
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling ${(element as HTMLInputElement).type} input: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleCheckbox(
    inputElement: HTMLInputElement,
    shouldCheck: boolean,
    options: CheckboxRadioOptions
  ): Promise<InputDataResult> {
    const modernDetection = detectModernInput(inputElement);
    
    // Set the checked state
    inputElement.checked = shouldCheck;
    
    // Trigger events for modern frameworks
    const events = ['input', 'change'];
    
    // For React components, also trigger focus/blur events
    if (modernDetection.isReactComponent) {
      events.push('focus', 'blur');
    }
    
    triggerInputEvents(inputElement, events);
    
    // Show success feedback
    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }
    
    return {
      status: 'success',
      message: `Checkbox ${shouldCheck ? 'checked' : 'unchecked'} successfully`,
      elementInfo: {
        tag: inputElement.tagName,
        type: inputElement.type,
        id: inputElement.id,
        name: inputElement.name || '',
        value: shouldCheck ? 'checked' : 'unchecked'
      }
    };
  }

  private async handleRadioButton(
    inputElement: HTMLInputElement,
    shouldCheck: boolean,
    options: CheckboxRadioOptions
  ): Promise<InputDataResult> {
    const modernDetection = detectModernInput(inputElement);
    
    if (shouldCheck) {
      // For radio buttons, we need to uncheck other radio buttons in the same group
      this.uncheckRadioGroup(inputElement);
      
      // Then check this radio button
      inputElement.checked = true;
      
      // Trigger events for the checked radio button
      const events = ['input', 'change'];
      
      // For React components, also trigger focus/blur events
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      
      triggerInputEvents(inputElement, events);
      
      // Show success feedback
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(inputElement);
      }
      
      return {
        status: 'success',
        message: 'Radio button selected successfully',
        elementInfo: {
          tag: inputElement.tagName,
          type: inputElement.type,
          id: inputElement.id,
          name: inputElement.name || '',
          value: 'selected'
        }
      };
    } else {
      // For radio buttons, we can't uncheck them directly (they're part of a group)
      // Instead, we'll return an error explaining this
      return {
        status: 'error',
        message: 'Cannot uncheck a radio button. Radio buttons are part of a group and one must always be selected. Use a different radio button in the group to change the selection.'
      };
    }
  }

  private parseCheckValue(value: string, options: CheckboxRadioOptions): boolean {
    const interpretAs = options.interpretAs || 'boolean';
    
    switch (interpretAs) {
      case 'boolean':
        // Handle various boolean representations
        const lowerValue = value.toLowerCase().trim();
        return lowerValue === 'true' || 
               lowerValue === '1' || 
               lowerValue === 'yes' || 
               lowerValue === 'on' || 
               lowerValue === 'checked' ||
               lowerValue === 'select' ||
               lowerValue === 'enable';
               
      case 'string':
        // Treat as string comparison
        return value.trim() !== '' && value.trim() !== 'false' && value.trim() !== '0';
        
      case 'number':
        // Treat as number comparison
        const numValue = parseFloat(value);
        return !isNaN(numValue) && numValue !== 0;
        
      default:
        return false;
    }
  }

  private uncheckRadioGroup(selectedRadio: HTMLInputElement): void {
    const groupName = selectedRadio.name;
    
    if (!groupName) {
      // If no name attribute, we can't determine the group
      return;
    }
    
    // Find all radio buttons in the same group
    const radioGroup = document.querySelectorAll(`input[type="radio"][name="${groupName}"]`);
    
    // Uncheck all radio buttons in the group
    radioGroup.forEach(radio => {
      if (radio !== selectedRadio) {
        (radio as HTMLInputElement).checked = false;
        
        // Trigger change event for unchecked radios (for modern frameworks)
        const modernDetection = detectModernInput(radio as HTMLElement);
        if (modernDetection.isReactComponent || modernDetection.isVueComponent) {
          radio.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        }
      }
    });
  }

  /**
   * Handle checkbox groups (multiple checkboxes with the same name)
   */
  async handleCheckboxGroup(
    selector: string,
    values: string[],
    options: CheckboxRadioOptions = {}
  ): Promise<InputDataResult> {
    try {
      const checkboxes = document.querySelectorAll(selector) as NodeListOf<HTMLInputElement>;
      
      if (checkboxes.length === 0) {
        return {
          status: 'error',
          message: `No checkboxes found with selector: ${selector}`
        };
      }
      
      let successCount = 0;
      const results: string[] = [];
      
      // Process each checkbox
      checkboxes.forEach(checkbox => {
        const shouldCheck = values.includes(checkbox.value) || 
                          values.includes(checkbox.id) ||
                          values.includes(checkbox.getAttribute('data-value') || '');
        
        if (shouldCheck !== checkbox.checked) {
          checkbox.checked = shouldCheck;
          
          // Trigger events
          const modernDetection = detectModernInput(checkbox);
          const events = ['input', 'change'];
          
          if (modernDetection.isReactComponent) {
            events.push('focus', 'blur');
          }
          
          triggerInputEvents(checkbox, events);
          successCount++;
        }
        
        results.push(`${checkbox.value || checkbox.id}: ${checkbox.checked ? 'checked' : 'unchecked'}`);
      });
      
      if (options.showSuccessFeedback !== false && successCount > 0) {
        // Show feedback on the first changed checkbox
        const firstChanged = Array.from(checkboxes).find(cb => 
          values.includes(cb.value) || values.includes(cb.id)
        );
        if (firstChanged) {
          showSuccessFeedback(firstChanged);
        }
      }
      
      return {
        status: 'success',
        message: `Processed ${successCount} checkboxes in group`,
        elementInfo: {
          tag: 'INPUT',
          type: 'checkbox',
          id: selector,
          name: checkboxes[0]?.name || '',
          value: results.join(', ')
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling checkbox group: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Handle radio button group selection by value
   */
  async handleRadioGroup(
    groupName: string,
    value: string,
    options: CheckboxRadioOptions = {}
  ): Promise<InputDataResult> {
    try {
      const radioButtons = document.querySelectorAll(`input[type="radio"][name="${groupName}"]`) as NodeListOf<HTMLInputElement>;
      
      if (radioButtons.length === 0) {
        return {
          status: 'error',
          message: `No radio buttons found with name: ${groupName}`
        };
      }
      
      // Find the radio button to select
      const targetRadio = Array.from(radioButtons).find(radio => 
        radio.value === value || 
        radio.id === value ||
        radio.getAttribute('data-value') === value
      );
      
      if (!targetRadio) {
        return {
          status: 'error',
          message: `No radio button found with value: ${value} in group: ${groupName}`
        };
      }
      
      // Uncheck all radio buttons in the group
      this.uncheckRadioGroup(targetRadio);
      
      // Check the target radio button
      targetRadio.checked = true;
      
      // Trigger events
      const modernDetection = detectModernInput(targetRadio);
      const events = ['input', 'change'];
      
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      
      triggerInputEvents(targetRadio, events);
      
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(targetRadio);
      }
      
      return {
        status: 'success',
        message: `Radio button "${value}" selected in group "${groupName}"`,
        elementInfo: {
          tag: 'INPUT',
          type: 'radio',
          id: targetRadio.id,
          name: targetRadio.name,
          value: targetRadio.value
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling radio group: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
