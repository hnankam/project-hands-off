import { InputHandler, InputDataResult, InputHandlerOptions, NumberInputOptions, InputType } from './types';
import { 
  findElement, 
  isElementVisible, 
  scrollIntoView, 
  focusAndHighlight, 
  streamText, 
  showSuccessFeedback, 
  getElementValue,
  triggerInputEvents,
  detectModernInput,
  moveCursorToElement
} from './utils';

/**
 * Specialized handler for number inputs (number, range)
 * Handles numeric validation, formatting, and modern web app patterns
 */
export class NumberInputHandler implements InputHandler {
  private supportedTypes: InputType[] = ['number', 'range'];

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return this.supportedTypes.includes(inputType) && element.tagName === 'INPUT';
  }

  async handle(
    element: HTMLElement, 
    value: string, 
    options: NumberInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const inputElement = element as HTMLInputElement;
      const inputType = inputElement.type;
      
      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }
      if (!isElementVisible(inputElement)) {
        await scrollIntoView(inputElement);
      }
      await focusAndHighlight(inputElement);
      
      // Parse and validate the number
      const numberValue = this.parseNumber(value, options);
      
      if (numberValue === null) {
        return {
          status: 'error',
          message: `Invalid number format: "${value}". Expected a valid number.`
        };
      }
      
      // Validate against input constraints
      const validation = this.validateNumber(numberValue, inputElement, options);
      if (!validation.valid) {
        return {
          status: 'error',
          message: validation.error || 'Number validation failed'
        };
      }
      
      // Format the number based on precision
      const formattedValue = this.formatNumber(numberValue, options);
      
      // Clear field if requested
      if (options.clearFirst !== false) {
        inputElement.value = '';
      }
      
      // Handle different number input types
      if (inputType === 'range') {
        return await this.handleRangeInput(inputElement, numberValue, formattedValue, options);
      } else {
        return await this.handleNumberInput(inputElement, numberValue, formattedValue, options);
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling ${(element as HTMLInputElement).type} input: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleNumberInput(
    inputElement: HTMLInputElement,
    numberValue: number,
    formattedValue: string,
    options: NumberInputOptions
  ): Promise<InputDataResult> {
    const modernDetection = detectModernInput(inputElement);
    
    // For number inputs, we can use direct value assignment or streaming
    if (options.typingSpeed && options.typingSpeed > 0) {
      // Use streaming for visual effect
      await streamText(inputElement, formattedValue, {
        speed: options.typingSpeed,
        triggerInputEvents: options.triggerEvents !== false,
        triggerChangeEvents: options.triggerEvents !== false,
        triggerKeyboardEvents: modernDetection.isReactComponent
      });
    } else {
      // Direct assignment for better performance
      inputElement.value = formattedValue;
      
      // Trigger events
      const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      triggerInputEvents(inputElement, events);
    }
    
    // Show success feedback
    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }
    
    return {
      status: 'success',
      message: `Number input successful: ${formattedValue}`,
      elementInfo: {
        tag: inputElement.tagName,
        type: inputElement.type,
        id: inputElement.id,
        name: inputElement.name || '',
        value: formattedValue
      }
    };
  }

  private async handleRangeInput(
    inputElement: HTMLInputElement,
    numberValue: number,
    formattedValue: string,
    options: NumberInputOptions
  ): Promise<InputDataResult> {
    const modernDetection = detectModernInput(inputElement);
    
    // For range inputs, we typically want immediate value setting
    inputElement.value = formattedValue;
    
    // Trigger events for range inputs
    const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];
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
      message: `Range input set to: ${formattedValue}`,
      elementInfo: {
        tag: inputElement.tagName,
        type: inputElement.type,
        id: inputElement.id,
        name: inputElement.name || '',
        value: formattedValue
      }
    };
  }

  private parseNumber(value: string, options: NumberInputOptions): number | null {
    // Remove thousands separators and normalize decimal delimiter
    const normalized = value
      .trim()
      .replace(/\s/g, '')
      .replace(/,(?=\d{3}(\D|$))/g, '') // drop grouping commas
      .replace(/(?<=\d),(?=\d)/g, ',');
    // Allow only digits, minus, and dot
    const cleanValue = normalized.replace(/[^\d.-]/g, '');
    
    // Handle empty string
    if (cleanValue === '' || cleanValue === '-') {
      return null;
    }
    
    // Parse the number
    const number = parseFloat(cleanValue);
    
    // Check if it's a valid number
    if (isNaN(number)) {
      return null;
    }
    
    return number;
  }

  private validateNumber(
    number: number, 
    inputElement: HTMLInputElement, 
    options: NumberInputOptions
  ): { valid: boolean; error?: string } {
    // Check min constraint
    const min = options.min !== undefined ? options.min : parseFloat(inputElement.min);
    if (!isNaN(min) && number < min) {
      return { valid: false, error: `Number must be at least ${min}` };
    }
    
    // Check max constraint
    const max = options.max !== undefined ? options.max : parseFloat(inputElement.max);
    if (!isNaN(max) && number > max) {
      return { valid: false, error: `Number must be at most ${max}` };
    }
    
    // Check step constraint
    const step = options.step !== undefined ? options.step : parseFloat(inputElement.step);
    if (!isNaN(step) && step > 0) {
      const remainder = (number - (min || 0)) % step;
      if (Math.abs(remainder) > 0.0001 && Math.abs(remainder - step) > 0.0001) {
        return { valid: false, error: `Number must be a multiple of ${step}` };
      }
    }
    
    return { valid: true };
  }

  private formatNumber(number: number, options: NumberInputOptions): string {
    const precision = options.precision;
    
    if (precision !== undefined) {
      return number.toFixed(precision);
    }
    
    // Default formatting - remove unnecessary decimal places
    if (number % 1 === 0) {
      return number.toString();
    } else {
      return number.toString();
    }
  }

  /**
   * Handle number input with increment/decrement
   */
  async handleNumberIncrement(
    selector: string,
    increment: number,
    options: NumberInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`
        };
      }
      
      const inputElement = elementInfo.element as HTMLInputElement;
      const currentValue = parseFloat(inputElement.value) || 0;
      const newValue = currentValue + increment;
      
      return await this.handle(inputElement, newValue.toString(), options);
    } catch (error) {
      return {
        status: 'error',
        message: `Error incrementing number: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Handle range input with smooth animation
   */
  async handleRangeWithAnimation(
    selector: string,
    targetValue: number,
    duration: number = 1000,
    options: NumberInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`
        };
      }
      
      const inputElement = elementInfo.element as HTMLInputElement;
      const startValue = parseFloat(inputElement.value) || 0;
      const difference = targetValue - startValue;
      const steps = 50; // Number of animation steps
      const stepDuration = duration / steps;
      const stepIncrement = difference / steps;
      
      // Animate the range input
      for (let i = 0; i <= steps; i++) {
        const currentValue = startValue + (stepIncrement * i);
        inputElement.value = this.formatNumber(currentValue, options);
        
        // Trigger input event for each step
        inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        
        // Wait for next step
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }
      
      // Final change event
      inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(inputElement);
      }
      
      return {
        status: 'success',
        message: `Range animated to: ${this.formatNumber(targetValue, options)}`,
        elementInfo: {
          tag: inputElement.tagName,
          type: inputElement.type,
          id: inputElement.id,
          name: inputElement.name || '',
          value: this.formatNumber(targetValue, options)
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error animating range: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Handle number input with currency formatting
   */
  async handleCurrencyInput(
    selector: string,
    value: string,
    currency: string = 'USD',
    options: NumberInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`
        };
      }
      
      const inputElement = elementInfo.element as HTMLInputElement;
      
      // Parse currency value
      const numberValue = this.parseCurrency(value, currency);
      if (numberValue === null) {
        return {
          status: 'error',
          message: `Invalid currency format: ${value}`
        };
      }
      
      // Format as currency
      const formattedValue = this.formatCurrency(numberValue, currency, options);
      
      // Set the value
      inputElement.value = formattedValue;
      
      // Trigger events
      const modernDetection = detectModernInput(inputElement);
      const events = ['input', 'change'];
      if (modernDetection.isReactComponent) {
        events.push('focus', 'blur');
      }
      triggerInputEvents(inputElement, events);
      
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(inputElement);
      }
      
      return {
        status: 'success',
        message: `Currency input successful: ${formattedValue}`,
        elementInfo: {
          tag: inputElement.tagName,
          type: inputElement.type,
          id: inputElement.id,
          name: inputElement.name || '',
          value: formattedValue
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling currency input: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private parseCurrency(value: string, currency: string): number | null {
    // Remove currency symbols and formatting
    const cleanValue = value.replace(/[^\d.-]/g, '');
    return this.parseNumber(cleanValue, {});
  }

  private formatCurrency(number: number, currency: string, options: NumberInputOptions): string {
    const precision = options.precision !== undefined ? options.precision : 2;
    
    // Basic currency formatting - in a real app you might use Intl.NumberFormat
    switch (currency.toUpperCase()) {
      case 'USD':
        return `$${number.toFixed(precision)}`;
      case 'EUR':
        return `€${number.toFixed(precision)}`;
      case 'GBP':
        return `£${number.toFixed(precision)}`;
      case 'JPY':
        return `¥${number.toFixed(0)}`; // JPY typically doesn't use decimals
      default:
        return `${number.toFixed(precision)} ${currency}`;
    }
  }
}
