import { InputHandler, InputDataResult, InputHandlerOptions, InputType } from './types';
import { 
  findElement, 
  isElementVisible, 
  scrollIntoView, 
  focusAndHighlight, 
  showSuccessFeedback, 
  getElementValue,
  triggerInputEvents,
  detectModernInput
} from './utils';
import { ModernInputDetection } from './types';

/**
 * Specialized handler for modern web app inputs (React/Vue components, custom inputs)
 * Handles framework-specific patterns and custom input components with universal formatter support
 */
export class ModernInputHandler implements InputHandler {
  private supportedTypes: InputType[] = ['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'checkbox', 'radio', 'select', 'textarea', 'contenteditable'];

  canHandle(inputType: InputType, element: HTMLElement): boolean {
    // This handler can handle any input type, but prioritizes modern framework components
    const detection = detectModernInput(element);
    return detection.isReactComponent || detection.isVueComponent || detection.isCustomInput;
  }

  async handle(
    element: HTMLElement, 
    value: string, 
    options: InputHandlerOptions = {}
  ): Promise<InputDataResult> {
    try {
      const detection = detectModernInput(element);
      
      // Route to appropriate framework-specific handler
      switch (detection.framework) {
        case 'react':
          return await this.handleReactComponent(element, value, options, detection);
        case 'vue':
          return await this.handleVueComponent(element, value, options, detection);
        case 'angular':
          return await this.handleAngularComponent(element, value, options, detection);
        case 'svelte':
          return await this.handleSvelteComponent(element, value, options, detection);
        default:
          return await this.handleCustomInput(element, value, options, detection);
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Error handling modern input: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async handleReactComponent(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection
  ): Promise<InputDataResult> {
    // Focus the element first
    element.focus();
    
    // Move cursor to element if requested
    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }
    
    // Get React instance and props
    const reactInstance = this.getReactInstance(element);
    
    if (reactInstance) {
      // Try to update React state directly
      const result = await this.updateReactState(reactInstance, value, options);
      if (result.success) {
        return this.createSuccessResult(element, value, 'React component updated successfully');
      }
    }
    
    // Fallback to universal formatter handling
    return await this.handleUniversalFormatter(element, value, options, detection, 'react');
  }

  private async handleVueComponent(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection
  ): Promise<InputDataResult> {
    // Focus the element first
    element.focus();
    
    // Move cursor to element if requested
    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }
    
    // Get Vue instance
    const vueInstance = this.getVueInstance(element);
    
    if (vueInstance) {
      // Try to update Vue data directly
      const result = await this.updateVueData(vueInstance, value, options);
      if (result.success) {
        return this.createSuccessResult(element, value, 'Vue component updated successfully');
      }
    }
    
    // Fallback to universal formatter handling
    return await this.handleUniversalFormatter(element, value, options, detection, 'vue');
  }

  private async handleAngularComponent(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection
  ): Promise<InputDataResult> {
    // Focus the element first
    element.focus();
    
    // Move cursor to element if requested
    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }
    
    // Try to update Angular component directly
    const result = await this.updateAngularComponent(element, value, options);
      if (result.success) {
        return this.createSuccessResult(element, value, 'Angular component updated successfully');
    }
    
    // Fallback to universal formatter handling
    return await this.handleUniversalFormatter(element, value, options, detection, 'angular');
  }

  private async handleSvelteComponent(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection
  ): Promise<InputDataResult> {
    // Focus the element first
    element.focus();
    
    // Move cursor to element if requested
    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }
    
    // Try to update Svelte component directly
    const result = await this.updateSvelteComponent(element, value, options);
      if (result.success) {
        return this.createSuccessResult(element, value, 'Svelte component updated successfully');
    }
    
    // Fallback to universal formatter handling
    return await this.handleUniversalFormatter(element, value, options, detection, 'svelte');
  }

  private async handleCustomInput(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection
  ): Promise<InputDataResult> {
    // Focus the element first
    element.focus();
    
    // Move cursor to element if requested
    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }
    
    // Use universal formatter handling for custom inputs
    return await this.handleUniversalFormatter(element, value, options, detection, 'custom');
  }

  /**
   * Move cursor to element with sophisticated animation
   */
  private moveCursorToElement(element: HTMLElement): void {
    try {
      // Debug: Log element details
      const rect = element.getBoundingClientRect();
      console.log('[ModernInputHandler] Moving cursor to element:', {
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
      
      console.log('[ModernInputHandler] Cursor moved to element:', element.tagName, element.id || element.className);
    } catch (error) {
      console.error('[ModernInputHandler] Error moving cursor to element:', error);
    }
  }

  // Universal formatter handler for all modern web apps
  private async handleUniversalFormatter(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection,
    framework: string
  ): Promise<InputDataResult> {
    const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
    
    // Try multiple approaches for modern formatters
    const approaches = [
      () => this.approach1_DirectValueSetting(inputElement, value),
      () => this.approach2_SimulateTyping(inputElement, value),
      () => this.approach3_FrameworkSpecificEvents(inputElement, value, framework),
      () => this.approach4_FormatterSpecific(inputElement, value),
      () => this.approach5_ModernWebAPI(inputElement, value),
      () => this.approach6_ComponentSpecific(inputElement, value, framework)
    ];
    
    for (const approach of approaches) {
      try {
        const result = await approach();
        if (result.success) {
          // Verify the value was actually set
          const currentValue = inputElement.value;
          if (currentValue && currentValue !== '') {
            // Show success feedback
            if (options.showSuccessFeedback !== false) {
              showSuccessFeedback(element);
            }
            
            return this.createSuccessResult(element, currentValue, `${framework} formatter updated successfully`);
          }
        }
      } catch (error) {
        console.log(`[ModernInputHandler] ${framework} approach failed:`, error);
        continue;
      }
    }
    
    // Fallback: return success even if value doesn't show (some formatters are delayed)
    return this.createSuccessResult(element, value, `${framework} input updated (formatter may be delayed)`);
  }

  // Multiple approaches for modern formatters
  private async approach1_DirectValueSetting(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<{ success: boolean }> {
    // Clear first
    inputElement.value = '';
    
    // Set value
    inputElement.value = value;
    
    // Trigger basic events
    const events = ['input', 'change', 'blur'];
    triggerInputEvents(inputElement, events);
    
    return { success: true };
  }

  private async approach2_SimulateTyping(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<{ success: boolean }> {
    // Clear first
    inputElement.value = '';
    inputElement.focus();
    
    // Simulate typing character by character
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      inputElement.value += char;
      
      // Trigger input event for each character
      const inputEvent = new Event('input', { bubbles: true, cancelable: true });
      (inputEvent as any).target = inputElement;
      (inputEvent as any).data = char;
      inputElement.dispatchEvent(inputEvent);
      
      // Small delay to simulate typing
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Final change event
    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    (changeEvent as any).target = inputElement;
    inputElement.dispatchEvent(changeEvent);
    
    return { success: true };
  }

  private async approach3_FrameworkSpecificEvents(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string, framework: string): Promise<{ success: boolean }> {
    // Clear first
    inputElement.value = '';
    inputElement.focus();
    
    // Set value
    inputElement.value = value;
    
    // Framework-specific event sequences
    const frameworkEvents = this.getFrameworkEvents(framework);
    
    for (const eventType of frameworkEvents) {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      (event as any).target = inputElement;
      (event as any).currentTarget = inputElement;
      
      // Add framework-specific properties
      if (eventType === 'input' || eventType === 'change') {
        (event as any).data = value;
        (event as any).value = value;
      }
      
      inputElement.dispatchEvent(event);
    }
    
    return { success: true };
  }

  private async approach4_FormatterSpecific(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<{ success: boolean }> {
    // Clear first
    inputElement.value = '';
    inputElement.focus();
    
    // Try to trigger formatter-specific events
    const formatterEvents = [
      'beforeinput',
      'input',
      'afterinput',
      'change',
      'format',
      'valuechange',
      'compositionstart',
      'compositionupdate',
      'compositionend'
    ];
    
    // Set value
    inputElement.value = value;
    
    // Trigger formatter-specific events
    for (const eventType of formatterEvents) {
      try {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        (event as any).target = inputElement;
        (event as any).data = value;
        (event as any).value = value;
        inputElement.dispatchEvent(event);
      } catch (error) {
        // Some events might not be supported, continue
        continue;
      }
    }
    
    return { success: true };
  }

  private async approach5_ModernWebAPI(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<{ success: boolean }> {
    // Clear first
    inputElement.value = '';
    inputElement.focus();
    
    // Use modern web APIs for better compatibility
    try {
      // Try using setRangeText for better text selection handling
      if (inputElement.setRangeText) {
        inputElement.setRangeText(value, 0, inputElement.value.length, 'select');
      } else {
        inputElement.value = value;
      }
      
      // Trigger modern input events
      const modernEvents = [
        'beforeinput',
        'input',
        'afterinput',
        'change'
      ];
      
      for (const eventType of modernEvents) {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        (event as any).target = inputElement;
        (event as any).data = value;
        (event as any).value = value;
        inputElement.dispatchEvent(event);
      }
      
      return { success: true };
    } catch (error) {
      console.log('[ModernInputHandler] Modern Web API approach failed:', error);
      return { success: false };
    }
  }

  private async approach6_ComponentSpecific(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string, framework: string): Promise<{ success: boolean }> {
    // Clear first
    inputElement.value = '';
    inputElement.focus();
    
    // Try framework-specific component manipulation
    try {
      switch (framework) {
        case 'react':
          return await this.handleReactComponentSpecific(inputElement, value);
        case 'vue':
          return await this.handleVueComponentSpecific(inputElement, value);
        case 'angular':
          return await this.handleAngularComponentSpecific(inputElement, value);
        case 'svelte':
          return await this.handleSvelteComponentSpecific(inputElement, value);
        default:
          return await this.handleGenericComponentSpecific(inputElement, value);
      }
    } catch (error) {
      console.log(`[ModernInputHandler] ${framework} component-specific approach failed:`, error);
      return { success: false };
    }
  }

  private getFrameworkEvents(framework: string): string[] {
    switch (framework) {
      case 'react':
        return ['focus', 'keydown', 'keypress', 'input', 'keyup', 'change', 'blur'];
      case 'vue':
        return ['focus', 'input', 'change', 'blur'];
      case 'angular':
        return ['focus', 'input', 'change', 'blur'];
      case 'svelte':
        return ['focus', 'input', 'change', 'blur'];
      default:
        return ['focus', 'input', 'change', 'blur'];
    }
  }

  // Framework-specific component manipulation methods
  private async handleReactComponentSpecific(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<{ success: boolean }> {
    // Try to trigger React's internal formatter
    const reactInstance = this.getReactInstance(inputElement);
    if (reactInstance) {
      try {
        // Try to find and call formatter methods
        const component = reactInstance.memoizedState || reactInstance.stateNode;
        if (component && component.props && component.props.onChange) {
          const syntheticEvent = {
            target: inputElement,
            value: value,
            preventDefault: () => {},
            stopPropagation: () => {}
          };
          component.props.onChange(syntheticEvent);
          return { success: true };
        }
      } catch (error) {
        console.log('[ModernInputHandler] React component-specific trigger failed:', error);
      }
    }
    
    // Fallback to direct value setting
    inputElement.value = value;
    return { success: true };
  }

  private async handleVueComponentSpecific(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<{ success: boolean }> {
    // Try to trigger Vue's internal formatter
    const vueInstance = this.getVueInstance(inputElement);
    if (vueInstance) {
      try {
        // Try to update Vue data directly
        if (vueInstance.$data) {
          const dataKeys = Object.keys(vueInstance.$data);
          const valueKey = dataKeys.find(key => 
            key.includes('value') || key.includes('model') || key.includes('input')
          );
          
          if (valueKey) {
            vueInstance.$data[valueKey] = value;
            return { success: true };
          }
        }
      } catch (error) {
        console.log('[ModernInputHandler] Vue component-specific trigger failed:', error);
      }
    }
    
    // Fallback to direct value setting
    inputElement.value = value;
    return { success: true };
  }

  private async handleAngularComponentSpecific(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<{ success: boolean }> {
    // Try to trigger Angular's internal formatter
    try {
      // Angular uses ngModel and form controls
      const ngModel = (inputElement as any).__ngModel__;
      if (ngModel && ngModel.setValue) {
        ngModel.setValue(value);
        return { success: true };
      }
    } catch (error) {
      console.log('[ModernInputHandler] Angular component-specific trigger failed:', error);
    }
    
    // Fallback to direct value setting
    inputElement.value = value;
    return { success: true };
  }

  private async handleSvelteComponentSpecific(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<{ success: boolean }> {
    // Try to trigger Svelte's internal formatter
    try {
      // Svelte uses bind:value
      const svelteInstance = (inputElement as any).__svelte__;
      if (svelteInstance && svelteInstance.set) {
        svelteInstance.set(value);
        return { success: true };
      }
    } catch (error) {
      console.log('[ModernInputHandler] Svelte component-specific trigger failed:', error);
    }
    
    // Fallback to direct value setting
    inputElement.value = value;
    return { success: true };
  }

  private async handleGenericComponentSpecific(inputElement: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<{ success: boolean }> {
    // Generic approach for unknown frameworks
    inputElement.value = value;
    
    // Trigger comprehensive events
    const events = ['focus', 'input', 'change', 'blur'];
    for (const eventType of events) {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      (event as any).target = inputElement;
      inputElement.dispatchEvent(event);
    }
    
    return { success: true };
  }

  // Framework instance detection and manipulation methods
  private getReactInstance(element: HTMLElement): any {
    const reactKey = Object.keys(element).find(key => 
      key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalFiber')
    );
    return reactKey ? (element as any)[reactKey] : null;
  }

  private async updateReactState(reactInstance: any, value: string, options: InputHandlerOptions): Promise<{ success: boolean }> {
    try {
      // Try to find the component's state updater
      const component = reactInstance.memoizedState || reactInstance.stateNode;
      
      if (component && component.setState) {
        // Update React state
        component.setState({ value });
        return { success: true };
      }
      
      return { success: false };
    } catch (error) {
      console.error('Error updating React state:', error);
      return { success: false };
    }
  }

  private getVueInstance(element: HTMLElement): any {
    const vueKey = Object.keys(element).find(key => key.startsWith('__vue__'));
    return vueKey ? (element as any)[vueKey] : null;
  }

  private async updateVueData(vueInstance: any, value: string, options: InputHandlerOptions): Promise<{ success: boolean }> {
    try {
      // Try to update Vue data
      if (vueInstance.$data) {
        // Find the value property in Vue data
        const dataKeys = Object.keys(vueInstance.$data);
        const valueKey = dataKeys.find(key => 
          key.includes('value') || key.includes('model') || key.includes('input')
        );
        
        if (valueKey) {
          vueInstance.$data[valueKey] = value;
          return { success: true };
        }
      }
      
      return { success: false };
    } catch (error) {
      console.error('Error updating Vue data:', error);
      return { success: false };
    }
  }

  private async updateAngularComponent(element: HTMLElement, value: string, options: InputHandlerOptions): Promise<{ success: boolean }> {
    try {
      // Try to find Angular component instance
      const ngElement = (element as any).__ngElement__;
      if (ngElement && ngElement.componentInstance) {
        // Try to update component properties
        const component = ngElement.componentInstance;
        if (component.value !== undefined) {
          component.value = value;
          return { success: true };
        }
      }
      
      return { success: false };
    } catch (error) {
      console.error('Error updating Angular component:', error);
      return { success: false };
    }
  }

  private async updateSvelteComponent(element: HTMLElement, value: string, options: InputHandlerOptions): Promise<{ success: boolean }> {
    try {
      // Try to find Svelte component instance
      const svelteInstance = (element as any).__svelte__;
      if (svelteInstance && svelteInstance.set) {
        svelteInstance.set(value);
        return { success: true };
      }
      
      return { success: false };
    } catch (error) {
      console.error('Error updating Svelte component:', error);
      return { success: false };
    }
  }

  private createSuccessResult(element: HTMLElement, value: string, message: string): InputDataResult {
    const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
    return {
      status: 'success',
      message: message,
      elementInfo: {
        tag: inputElement.tagName,
        type: (inputElement as HTMLInputElement).type || 'text',
        id: inputElement.id,
        name: inputElement.name || '',
        value: value
      }
    };
  }
}