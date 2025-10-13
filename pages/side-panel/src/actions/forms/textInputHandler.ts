import { InputHandler, InputDataResult, InputHandlerOptions, TextInputOptions, InputType } from './types';
import { 
  findElement, 
  isElementVisible, 
  scrollIntoView, 
  focusAndHighlight, 
  streamText, 
  showSuccessFeedback, 
  getElementValue,
  triggerInputEvents,
  validateInputValue,
  detectModernInput,
  moveCursorToElement
} from './utils';

/**
 * Specialized handler for text inputs (text, email, password, search, tel, url)
 * Handles modern web app patterns and formatted input fields
 */
export class TextInputHandler implements InputHandler {
  private supportedTypes: InputType[] = ['text', 'email', 'password', 'search', 'tel', 'url'];

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return this.supportedTypes.includes(inputType) && 
           (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA');
  }

  async handle(
    element: HTMLElement, 
    value: string, 
    options: TextInputOptions = {}
  ): Promise<InputDataResult> {
    try {
      const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
      const inputType = (element as HTMLInputElement).type || 'text';
      
      // Validate input value
      const validation = validateInputValue(element, value);
      if (!validation.valid) {
        return {
          status: 'error',
          message: validation.error || 'Invalid input value'
        };
      }

      // Detect modern framework
      const modernDetection = detectModernInput(element);
      
      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }
      
      // Clear field if requested
      if (options.clearFirst !== false) {
        inputElement.value = '';
      }

      // Handle different text input types with specialized logic
      switch (inputType) {
        case 'email':
          return await this.handleEmailInput(inputElement, value, options, modernDetection);
        case 'password':
          return await this.handlePasswordInput(inputElement, value, options, modernDetection);
        case 'search':
          return await this.handleSearchInput(inputElement, value, options, modernDetection);
        case 'tel':
          return await this.handleTelInput(inputElement, value, options, modernDetection);
        case 'url':
          return await this.handleUrlInput(inputElement, value, options, modernDetection);
        default:
          return await this.handleTextInput(inputElement, value, options, modernDetection);
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling text input: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleTextInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: any
  ): Promise<InputDataResult> {
    // Apply input mask if provided
    if (options.mask) {
      value = this.applyInputMask(value, options.mask);
    }

    // Handle max length
    if (options.maxLength && value.length > options.maxLength) {
      value = value.substring(0, options.maxLength);
    }

    // Stream text with typing effect
    await streamText(inputElement, value, {
      speed: options.typingSpeed || 20,
      triggerInputEvents: options.triggerEvents !== false,
      triggerChangeEvents: options.triggerEvents !== false,
      triggerKeyboardEvents: modernDetection.isReactComponent || modernDetection.isVueComponent
    });

    // Show success feedback
    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    return {
      status: 'success',
      message: 'Text input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: (inputElement as HTMLInputElement).type || 'text',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement)
      }
    };
  }

  private async handleEmailInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: any
  ): Promise<InputDataResult> {
    // Normalize email format
    value = value.toLowerCase().trim();

    // Stream email with validation
    await streamText(inputElement, value, {
      speed: options.typingSpeed || 25,
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: modernDetection.isReactComponent
    });

    // Trigger email-specific events for modern frameworks
    if (modernDetection.isReactComponent) {
      inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    return {
      status: 'success',
      message: 'Email input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'email',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement)
      }
    };
  }

  private async handlePasswordInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: any
  ): Promise<InputDataResult> {
    // For password fields, we don't show the actual value in feedback
    const displayValue = '•'.repeat(value.length);

    // Stream password (no visual feedback during typing for security)
    await streamText(inputElement, value, {
      speed: options.typingSpeed || 15, // Slightly slower for security
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: false // Don't trigger keyboard events for passwords
    });

    // Trigger password-specific events
    if (modernDetection.isReactComponent || modernDetection.isVueComponent) {
      inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    return {
      status: 'success',
      message: 'Password input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'password',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: displayValue // Don't expose actual password
      }
    };
  }

  private async handleSearchInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: any
  ): Promise<InputDataResult> {
    // Handle search-specific formatting
    value = value.trim();

    // Stream search term
    await streamText(inputElement, value, {
      speed: options.typingSpeed || 30,
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: modernDetection.isReactComponent
    });

    // Trigger search-specific events
    if (modernDetection.isReactComponent) {
      // Simulate search button press or enter key
      inputElement.dispatchEvent(new KeyboardEvent('keydown', { 
        key: 'Enter', 
        bubbles: true, 
        cancelable: true 
      }));
    }

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    return {
      status: 'success',
      message: 'Search input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'search',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement)
      }
    };
  }

  private async handleTelInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: any
  ): Promise<InputDataResult> {
    // Format phone number
    value = this.formatPhoneNumber(value);

    // Stream phone number
    await streamText(inputElement, value, {
      speed: options.typingSpeed || 20,
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: modernDetection.isReactComponent
    });

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    return {
      status: 'success',
      message: 'Phone number input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'tel',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement)
      }
    };
  }

  private async handleUrlInput(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    options: TextInputOptions,
    modernDetection: any
  ): Promise<InputDataResult> {
    // Normalize URL format
    value = this.normalizeUrl(value);

    // Stream URL
    await streamText(inputElement, value, {
      speed: options.typingSpeed || 25,
      triggerInputEvents: true,
      triggerChangeEvents: true,
      triggerKeyboardEvents: modernDetection.isReactComponent
    });

    if (options.showSuccessFeedback !== false) {
      showSuccessFeedback(inputElement);
    }

    return {
      status: 'success',
      message: 'URL input successful',
      elementInfo: {
        tag: inputElement.tagName,
        type: 'url',
        id: inputElement.id,
        name: (inputElement as HTMLInputElement).name || '',
        value: getElementValue(inputElement)
      }
    };
  }

  private applyInputMask(value: string, mask: string): string {
    // Simple mask implementation - can be extended for more complex patterns
    let maskedValue = '';
    let valueIndex = 0;
    
    for (let i = 0; i < mask.length && valueIndex < value.length; i++) {
      if (mask[i] === '#') {
        // Placeholder for digit
        if (/[0-9]/.test(value[valueIndex])) {
          maskedValue += value[valueIndex];
          valueIndex++;
        }
      } else if (mask[i] === 'A') {
        // Placeholder for letter
        if (/[a-zA-Z]/.test(value[valueIndex])) {
          maskedValue += value[valueIndex];
          valueIndex++;
        }
      } else if (mask[i] === '*') {
        // Placeholder for any character
        maskedValue += value[valueIndex];
        valueIndex++;
      } else {
        // Literal character
        maskedValue += mask[i];
      }
    }
    
    return maskedValue;
  }

  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Format based on length
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phoneNumber; // Return as-is if not standard format
  }

  private normalizeUrl(url: string): string {
    url = url.trim();
    
    // Add protocol if missing
    if (!url.match(/^https?:\/\//)) {
      url = 'https://' + url;
    }
    
    return url;
  }
}
