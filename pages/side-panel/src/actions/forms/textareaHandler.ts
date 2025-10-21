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
  detectModernInput,
  moveCursorToElement,
} from './utils';

/**
 * Specialized handler for textarea elements
 * Handles multi-line text input, auto-resize, and modern web app patterns
 */
export class TextareaHandler implements InputHandler {
  private supportedTypes: InputType[] = ['textarea'];

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    return this.supportedTypes.includes(inputType) && element.tagName === 'TEXTAREA';
  }

  async handle(element: HTMLElement, value: string, options: TextInputOptions = {}): Promise<InputDataResult> {
    try {
      const textareaElement = element as HTMLTextAreaElement;
      if (!isElementVisible(textareaElement)) {
        scrollIntoView(textareaElement);
      }
      await focusAndHighlight(textareaElement);

      // Move cursor to element if requested
      if (options.moveCursor) {
        moveCursorToElement(element);
      }

      // Handle line breaks and formatting
      const formattedValue = this.formatTextareaValue(value, options);

      // Validate max length
      if (options.maxLength && formattedValue.length > options.maxLength) {
        return {
          status: 'error',
          message: `Text exceeds maximum length of ${options.maxLength} characters. Current length: ${formattedValue.length}`,
        };
      }

      // Clear field if requested
      if (options.clearFirst !== false) {
        textareaElement.value = '';
      }

      // Handle auto-resize if enabled
      if (this.isAutoResizeEnabled(textareaElement)) {
        this.handleAutoResize(textareaElement, formattedValue);
      }

      // Insert content with streaming or direct assignment
      if (options.typingSpeed && options.typingSpeed > 0) {
        await this.streamTextareaContent(textareaElement, formattedValue, options);
      } else {
        textareaElement.value = formattedValue;
        this.triggerTextareaEvents(textareaElement, options);
      }

      // Show success feedback
      if (options.showSuccessFeedback !== false) {
        showSuccessFeedback(textareaElement);
      }

      return {
        status: 'success',
        message: 'Textarea content updated successfully',
        elementInfo: {
          tag: textareaElement.tagName,
          type: 'textarea',
          id: textareaElement.id,
          name: textareaElement.name || '',
          value: formattedValue.substring(0, 100) + (formattedValue.length > 100 ? '...' : ''),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling textarea: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private formatTextareaValue(value: string, options: TextInputOptions): string {
    // Handle different line break formats
    let formattedValue = value;

    // Convert different line break formats to standard \n
    formattedValue = formattedValue.replace(/\r\n/g, '\n'); // Windows
    formattedValue = formattedValue.replace(/\r/g, '\n'); // Mac

    // Handle text mask if provided
    if (options.mask) {
      formattedValue = this.applyTextareaMask(formattedValue, options.mask);
    }

    // Handle validation
    if (options.validation) {
      const lines = formattedValue.split('\n');
      const validLines = lines.filter(line => options.validation!.test(line));
      formattedValue = validLines.join('\n');
    }

    return formattedValue;
  }

  private applyTextareaMask(value: string, mask: string): string {
    // Simple mask implementation for textarea
    // This can be extended for more complex patterns
    const lines = value.split('\n');
    const maskedLines = lines.map(line => {
      // Apply mask to each line
      let maskedLine = '';
      let valueIndex = 0;

      for (let i = 0; i < mask.length && valueIndex < line.length; i++) {
        if (mask[i] === '#') {
          // Placeholder for any character
          maskedLine += line[valueIndex];
          valueIndex++;
        } else if (mask[i] === 'A') {
          // Placeholder for letter
          if (/[a-zA-Z]/.test(line[valueIndex])) {
            maskedLine += line[valueIndex];
            valueIndex++;
          }
        } else if (mask[i] === '9') {
          // Placeholder for digit
          if (/[0-9]/.test(line[valueIndex])) {
            maskedLine += line[valueIndex];
            valueIndex++;
          }
        } else {
          // Literal character
          maskedLine += mask[i];
        }
      }

      return maskedLine;
    });

    return maskedLines.join('\n');
  }

  private isAutoResizeEnabled(textareaElement: HTMLTextAreaElement): boolean {
    // Check for common auto-resize patterns
    const styles = window.getComputedStyle(textareaElement);
    const hasAutoResize =
      textareaElement.classList.contains('auto-resize') ||
      textareaElement.hasAttribute('data-auto-resize') ||
      textareaElement.style.resize === 'none';

    return hasAutoResize;
  }

  private handleAutoResize(textareaElement: HTMLTextAreaElement, content: string): void {
    // Reset height to auto to get the correct scrollHeight
    textareaElement.style.height = 'auto';

    // Calculate new height based on content
    const lineHeight = parseInt(window.getComputedStyle(textareaElement).lineHeight) || 20;
    const padding =
      parseInt(window.getComputedStyle(textareaElement).paddingTop) +
        parseInt(window.getComputedStyle(textareaElement).paddingBottom) || 0;

    const lines = content.split('\n').length;
    const minHeight = lineHeight * 3 + padding; // Minimum 3 lines
    const contentHeight = lineHeight * lines + padding;
    const newHeight = Math.max(minHeight, contentHeight);

    // Set new height
    textareaElement.style.height = `${newHeight}px`;
  }

  private async streamTextareaContent(
    textareaElement: HTMLTextAreaElement,
    content: string,
    options: TextInputOptions,
  ): Promise<void> {
    const modernDetection = detectModernInput(textareaElement);

    // For textarea, we can stream character by character or line by line
    const streamByLines = content.includes('\n') && content.length > 100;

    if (streamByLines) {
      await this.streamByLines(textareaElement, content, options);
    } else {
      await streamText(textareaElement, content, {
        speed: options.typingSpeed || 20,
        triggerInputEvents: options.triggerEvents !== false,
        triggerChangeEvents: options.triggerEvents !== false,
        triggerKeyboardEvents: modernDetection.isReactComponent,
      });
    }
  }

  private async streamByLines(
    textareaElement: HTMLTextAreaElement,
    content: string,
    options: TextInputOptions,
  ): Promise<void> {
    const lines = content.split('\n');
    const modernDetection = detectModernInput(textareaElement);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Add line content
      if (i > 0) {
        textareaElement.value += '\n';
      }

      // Stream the line
      await streamText(textareaElement, line, {
        speed: options.typingSpeed || 20,
        triggerInputEvents: options.triggerEvents !== false,
        triggerChangeEvents: false, // Only trigger change at the end
        triggerKeyboardEvents: modernDetection.isReactComponent,
      });

      // Handle auto-resize after each line
      if (this.isAutoResizeEnabled(textareaElement)) {
        this.handleAutoResize(textareaElement, textareaElement.value);
      }
    }

    // Final change event
    if (options.triggerEvents !== false) {
      textareaElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
  }

  private triggerTextareaEvents(textareaElement: HTMLTextAreaElement, options: TextInputOptions): void {
    const modernDetection = detectModernInput(textareaElement);
    const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];
    if (modernDetection.isReactComponent) {
      events.push('focus', 'blur', 'keyup');
    }
    if (modernDetection.isVueComponent) {
      events.push('keyup');
    }
    triggerInputEvents(textareaElement, events);
  }

  /**
   * Handle textarea with placeholder text
   */
  async handleWithPlaceholder(
    selector: string,
    value: string,
    placeholder: string,
    options: TextInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const textareaElement = elementInfo.element as HTMLTextAreaElement;

      // Check if textarea is empty or contains only placeholder
      const currentContent = textareaElement.value || '';
      const isEmpty = currentContent === '' || currentContent === placeholder;

      if (isEmpty && options.clearFirst !== false) {
        textareaElement.value = '';
      }

      // Handle the content
      return await this.handle(textareaElement, value, options);
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling textarea with placeholder: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Handle textarea with character/word count
   */
  async handleWithCounters(
    selector: string,
    value: string,
    options: TextInputOptions & {
      showCharacterCount?: boolean;
      showWordCount?: boolean;
      maxCharacters?: number;
      maxWords?: number;
    } = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const textareaElement = elementInfo.element as HTMLTextAreaElement;

      // Validate limits
      if (options.maxCharacters && value.length > options.maxCharacters) {
        return {
          status: 'error',
          message: `Text exceeds maximum character limit of ${options.maxCharacters}. Current length: ${value.length}`,
        };
      }

      if (options.maxWords) {
        const wordCount = value
          .trim()
          .split(/\s+/)
          .filter(word => word.length > 0).length;
        if (wordCount > options.maxWords) {
          return {
            status: 'error',
            message: `Text exceeds maximum word limit of ${options.maxWords}. Current word count: ${wordCount}`,
          };
        }
      }

      // Handle the content
      const result = await this.handle(textareaElement, value, options);

      if (result.status === 'success') {
        // Add counters if requested
        if (options.showCharacterCount || options.showWordCount) {
          this.addCounters(textareaElement, options);
        }
      }

      return result;
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling textarea with counters: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private addCounters(
    textareaElement: HTMLTextAreaElement,
    options: {
      showCharacterCount?: boolean;
      showWordCount?: boolean;
      maxCharacters?: number;
      maxWords?: number;
    },
  ): void {
    // Check if counters already exist
    const existingCounters = textareaElement.parentElement?.querySelector('.textarea-counters');
    if (existingCounters) {
      return;
    }

    // Create counter container
    const counterContainer = document.createElement('div');
    counterContainer.className = 'textarea-counters';
    counterContainer.style.cssText = `
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    `;

    const updateCounters = () => {
      const content = textareaElement.value;
      const characterCount = content.length;
      const wordCount = content
        .trim()
        .split(/\s+/)
        .filter(word => word.length > 0).length;

      let counterText = '';

      if (options.showCharacterCount) {
        const charLimit = options.maxCharacters ? `/${options.maxCharacters}` : '';
        counterText += `Characters: ${characterCount}${charLimit}`;
      }

      if (options.showWordCount) {
        if (counterText) counterText += ' | ';
        const wordLimit = options.maxWords ? `/${options.maxWords}` : '';
        counterText += `Words: ${wordCount}${wordLimit}`;
      }

      counterContainer.textContent = counterText;

      // Color coding for limits
      if (options.maxCharacters && characterCount > options.maxCharacters * 0.9) {
        counterContainer.style.color = characterCount > options.maxCharacters ? '#f44336' : '#ff9800';
      } else if (options.maxWords && wordCount > options.maxWords * 0.9) {
        counterContainer.style.color = wordCount > options.maxWords ? '#f44336' : '#ff9800';
      } else {
        counterContainer.style.color = '#666';
      }
    };

    // Insert counter after the textarea
    textareaElement.parentElement?.insertBefore(counterContainer, textareaElement.nextSibling);

    // Update counters initially and on input
    updateCounters();
    textareaElement.addEventListener('input', updateCounters);
  }

  /**
   * Handle textarea with auto-save functionality
   */
  async handleWithAutoSave(
    selector: string,
    value: string,
    saveCallback?: (content: string) => void,
    options: TextInputOptions & { autoSaveDelay?: number } = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const textareaElement = elementInfo.element as HTMLTextAreaElement;

      // Handle the content
      const result = await this.handle(textareaElement, value, options);

      if (result.status === 'success' && saveCallback) {
        // Set up auto-save
        const delay = options.autoSaveDelay || 2000; // 2 seconds default

        // Clear any existing auto-save timeout
        if ((textareaElement as any).__autoSaveTimeout) {
          clearTimeout((textareaElement as any).__autoSaveTimeout);
        }

        // Set up new auto-save timeout
        (textareaElement as any).__autoSaveTimeout = setTimeout(() => {
          saveCallback(textareaElement.value);
        }, delay);
      }

      return result;
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling textarea with auto-save: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Handle textarea with syntax highlighting (for code editors)
   */
  async handleWithSyntaxHighlighting(
    selector: string,
    value: string,
    language: string = 'plaintext',
    options: TextInputOptions = {},
  ): Promise<InputDataResult> {
    try {
      const elementInfo = findElement(selector);
      if (!elementInfo) {
        return {
          status: 'error',
          message: `Element not found with selector: ${selector}`,
        };
      }

      const textareaElement = elementInfo.element as HTMLTextAreaElement;

      // Handle the content
      const result = await this.handle(textareaElement, value, options);

      if (result.status === 'success') {
        // Add syntax highlighting class if not already present
        if (!textareaElement.classList.contains('syntax-highlighted')) {
          textareaElement.classList.add('syntax-highlighted');
          textareaElement.setAttribute('data-language', language);
        }
      }

      return result;
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling textarea with syntax highlighting: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
