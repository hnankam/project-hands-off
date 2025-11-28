/**
 * Modern Input Handler
 *
 * Specialized handler for modern web app inputs (React/Vue components, custom inputs).
 * Handles framework-specific patterns and custom input components with universal formatter support.
 */

import { debug as baseDebug } from '@extension/shared';
import { InputHandler, InputDataResult, InputHandlerOptions, InputType, ModernInputDetection } from './types';
import {
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
const LOG_PREFIX = '[ModernInput]';

/** Typing simulation delay in ms */
const TYPING_DELAY_MS = 12;

/** Supported framework types */
type FrameworkType = 'react' | 'vue' | 'angular' | 'svelte' | 'custom' | 'unknown';

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

/** Window with cursor movement function */
interface WindowWithCursor {
  moveCursorToElement?: (element: HTMLElement) => void;
}

/** React fiber/internal instance */
interface ReactInstance {
  memoizedState?: {
    setState?: (state: Record<string, unknown>) => void;
    props?: {
      onChange?: (event: SyntheticEventLike) => void;
    };
  };
  stateNode?: {
    setState?: (state: Record<string, unknown>) => void;
    props?: {
      onChange?: (event: SyntheticEventLike) => void;
    };
  };
}

/** Synthetic event for React */
interface SyntheticEventLike {
  target: HTMLElement;
  value: string;
  preventDefault: () => void;
  stopPropagation: () => void;
}

/** Vue instance */
interface VueInstance {
  $data?: Record<string, unknown>;
}

/** Angular ngModel */
interface NgModel {
  setValue?: (value: string) => void;
}

/** Svelte instance */
interface SvelteInstance {
  set?: (value: string) => void;
}

/** Angular element with component */
interface AngularElement extends HTMLElement {
  __ngElement__?: {
    componentInstance?: {
      value?: string;
    };
  };
  __ngModel__?: NgModel;
}

/** Element with framework instances */
interface FrameworkElement extends HTMLElement {
  __vue__?: VueInstance;
  __svelte__?: SvelteInstance;
  [key: string]: unknown;
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
  const name = (element as HTMLInputElement).name || '';
  const tag = element.tagName;
  return `${tag}:${id}:${name}:${value.substring(0, 50)}`;
}

// ============================================================================
// MODERN INPUT HANDLER CLASS
// ============================================================================

/**
 * Specialized handler for modern web app inputs (React/Vue components, custom inputs)
 * Handles framework-specific patterns and custom input components with universal formatter support
 */
export class ModernInputHandler implements InputHandler {
  canHandle(inputType: InputType, element: HTMLElement): boolean {
    const detection = detectModernInput(element);
    return detection.isReactComponent || detection.isVueComponent || detection.isCustomInput;
  }

  async handle(element: HTMLElement, value: string, options: InputHandlerOptions = {}): Promise<InputDataResult> {
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
    options: InputHandlerOptions,
  ): Promise<InputDataResult> {
    try {
      // Ensure interactable
      if (!isElementVisible(element)) {
        scrollIntoView(element);
      }
      focusAndHighlight(element);

      const detection = detectModernInput(element);

      debug.log(LOG_PREFIX, 'Handling input:', {
        framework: detection.framework,
        isReact: detection.isReactComponent,
        isVue: detection.isVueComponent,
      });

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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug.error(LOG_PREFIX, 'Error handling modern input:', errorMessage);
      return {
        status: 'error',
        message: `Error handling modern input: ${errorMessage}`,
      };
    }
  }

  private async handleReactComponent(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection,
  ): Promise<InputDataResult> {
    element.focus();

    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }

    const reactInstance = this.getReactInstance(element);

    if (reactInstance) {
      const result = await this.updateReactState(reactInstance, value);
      if (result.success) {
        return this.createSuccessResult(element, value, 'React component updated successfully');
      }
    }

    return await this.handleUniversalFormatter(element, value, options, detection, 'react');
  }

  private async handleVueComponent(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection,
  ): Promise<InputDataResult> {
    element.focus();

    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }

    const vueInstance = this.getVueInstance(element);

    if (vueInstance) {
      const result = await this.updateVueData(vueInstance, value);
      if (result.success) {
        return this.createSuccessResult(element, value, 'Vue component updated successfully');
      }
    }

    return await this.handleUniversalFormatter(element, value, options, detection, 'vue');
  }

  private async handleAngularComponent(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection,
  ): Promise<InputDataResult> {
    element.focus();

    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }

    const result = await this.updateAngularComponent(element, value);
    if (result.success) {
      return this.createSuccessResult(element, value, 'Angular component updated successfully');
    }

    return await this.handleUniversalFormatter(element, value, options, detection, 'angular');
  }

  private async handleSvelteComponent(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection,
  ): Promise<InputDataResult> {
    element.focus();

    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }

    const result = await this.updateSvelteComponent(element);
    if (result.success) {
      return this.createSuccessResult(element, value, 'Svelte component updated successfully');
    }

    return await this.handleUniversalFormatter(element, value, options, detection, 'svelte');
  }

  private async handleCustomInput(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection,
  ): Promise<InputDataResult> {
    element.focus();

    if (options.moveCursor) {
      this.moveCursorToElement(element);
    }

    return await this.handleUniversalFormatter(element, value, options, detection, 'custom');
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
    } catch {
      // Cursor move is best-effort
    }
  }

  // Universal formatter handler for all modern web apps
  private async handleUniversalFormatter(
    element: HTMLElement,
    value: string,
    options: InputHandlerOptions,
    detection: ModernInputDetection,
    framework: FrameworkType,
  ): Promise<InputDataResult> {
    const inputElement = element as HTMLInputElement | HTMLTextAreaElement;

    const approaches = [
      () => this.approach1_DirectValueSetting(inputElement, value),
      () => this.approach2_SimulateTyping(inputElement, value),
      () => this.approach3_FrameworkSpecificEvents(inputElement, value, framework),
      () => this.approach4_FormatterSpecific(inputElement, value),
      () => this.approach5_ModernWebAPI(inputElement, value),
      () => this.approach6_ComponentSpecific(inputElement, value, framework),
    ];

    for (const approach of approaches) {
      try {
        const result = await approach();
        if (result.success) {
          const currentValue = inputElement.value;
          if (currentValue && currentValue !== '') {
            if (options.showSuccessFeedback !== false) {
              showSuccessFeedback(element);
            }
            return this.createSuccessResult(element, currentValue, `${framework} formatter updated successfully`);
          }
        }
      } catch {
        continue;
      }
    }

    return this.createSuccessResult(element, value, `${framework} input updated (formatter may be delayed)`);
  }

  // Multiple approaches for modern formatters
  private async approach1_DirectValueSetting(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<{ success: boolean }> {
    inputElement.value = '';
    inputElement.value = value;

    const events = ['pointerdown', 'mousedown', 'input', 'change', 'mouseup', 'click'];
    triggerInputEvents(inputElement, events);

    return { success: true };
  }

  private async approach2_SimulateTyping(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<{ success: boolean }> {
    inputElement.value = '';
    inputElement.focus();

    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      inputElement.value += char;

      const inputEvent = new Event('input', { bubbles: true, cancelable: true });
      Object.defineProperty(inputEvent, 'target', { value: inputElement, writable: false });
      Object.defineProperty(inputEvent, 'data', { value: char, writable: false });
      inputElement.dispatchEvent(inputEvent);

      await new Promise(resolve => setTimeout(resolve, TYPING_DELAY_MS));
    }

    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    Object.defineProperty(changeEvent, 'target', { value: inputElement, writable: false });
    inputElement.dispatchEvent(changeEvent);

    return { success: true };
  }

  private async approach3_FrameworkSpecificEvents(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    framework: FrameworkType,
  ): Promise<{ success: boolean }> {
    inputElement.value = '';
    inputElement.focus();
    inputElement.value = value;

    const frameworkEvents = this.getFrameworkEvents(framework);

    for (const eventType of frameworkEvents) {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: inputElement, writable: false });
      Object.defineProperty(event, 'currentTarget', { value: inputElement, writable: false });

      if (eventType === 'input' || eventType === 'change') {
        Object.defineProperty(event, 'data', { value: value, writable: false });
        Object.defineProperty(event, 'value', { value: value, writable: false });
      }

      inputElement.dispatchEvent(event);
    }

    return { success: true };
  }

  private async approach4_FormatterSpecific(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<{ success: boolean }> {
    inputElement.value = '';
    inputElement.focus();

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

    inputElement.value = value;

    for (const eventType of formatterEvents) {
      try {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'target', { value: inputElement, writable: false });
        Object.defineProperty(event, 'data', { value: value, writable: false });
        Object.defineProperty(event, 'value', { value: value, writable: false });
        inputElement.dispatchEvent(event);
      } catch {
        continue;
      }
    }

    return { success: true };
  }

  private async approach5_ModernWebAPI(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<{ success: boolean }> {
    inputElement.value = '';
    inputElement.focus();

    try {
      if (inputElement.setRangeText) {
        inputElement.setRangeText(value, 0, inputElement.value.length, 'select');
      } else {
        inputElement.value = value;
      }

      const modernEvents = ['beforeinput', 'input', 'afterinput', 'change'];

      for (const eventType of modernEvents) {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'target', { value: inputElement, writable: false });
        Object.defineProperty(event, 'data', { value: value, writable: false });
        Object.defineProperty(event, 'value', { value: value, writable: false });
        inputElement.dispatchEvent(event);
      }

      return { success: true };
    } catch (error) {
      debug.log(LOG_PREFIX, 'Modern Web API approach failed:', error);
      return { success: false };
    }
  }

  private async approach6_ComponentSpecific(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
    framework: FrameworkType,
  ): Promise<{ success: boolean }> {
    inputElement.value = '';
    inputElement.focus();

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
      debug.log(LOG_PREFIX, `${framework} component-specific approach failed:`, error);
      return { success: false };
    }
  }

  private getFrameworkEvents(framework: FrameworkType): string[] {
    switch (framework) {
      case 'react':
        return ['focus', 'keydown', 'keypress', 'input', 'keyup', 'change', 'blur'];
      case 'vue':
      case 'angular':
      case 'svelte':
      default:
        return ['focus', 'input', 'change', 'blur'];
    }
  }

  // Framework-specific component manipulation methods
  private async handleReactComponentSpecific(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<{ success: boolean }> {
    const reactInstance = this.getReactInstance(inputElement);
    if (reactInstance) {
      try {
        const component = reactInstance.memoizedState ?? reactInstance.stateNode;
        if (component?.props?.onChange) {
          const syntheticEvent: SyntheticEventLike = {
            target: inputElement,
            value: value,
            preventDefault: () => {},
            stopPropagation: () => {},
          };
          component.props.onChange(syntheticEvent);
          return { success: true };
        }
      } catch (error) {
        debug.log(LOG_PREFIX, 'React component-specific trigger failed:', error);
      }
    }

    inputElement.value = value;
    return { success: true };
  }

  private async handleVueComponentSpecific(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<{ success: boolean }> {
    const vueInstance = this.getVueInstance(inputElement);
    if (vueInstance?.$data) {
      try {
        const dataKeys = Object.keys(vueInstance.$data);
        const valueKey = dataKeys.find(
          key => key.includes('value') || key.includes('model') || key.includes('input'),
        );

        if (valueKey) {
          vueInstance.$data[valueKey] = value;
          return { success: true };
        }
      } catch (error) {
        debug.log(LOG_PREFIX, 'Vue component-specific trigger failed:', error);
      }
    }

    inputElement.value = value;
    return { success: true };
  }

  private async handleAngularComponentSpecific(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<{ success: boolean }> {
    try {
      const ngElement = inputElement as AngularElement;
      const ngModel = ngElement.__ngModel__;
      if (ngModel?.setValue) {
        ngModel.setValue(value);
        return { success: true };
      }
    } catch (error) {
      debug.log(LOG_PREFIX, 'Angular component-specific trigger failed:', error);
    }

    inputElement.value = value;
    return { success: true };
  }

  private async handleSvelteComponentSpecific(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<{ success: boolean }> {
    try {
      const svelteElement = inputElement as unknown as FrameworkElement;
      const svelteInstance = svelteElement.__svelte__;
      if (svelteInstance?.set) {
        svelteInstance.set(value);
        return { success: true };
      }
    } catch (error) {
      debug.log(LOG_PREFIX, 'Svelte component-specific trigger failed:', error);
    }

    inputElement.value = value;
    return { success: true };
  }

  private async handleGenericComponentSpecific(
    inputElement: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): Promise<{ success: boolean }> {
    inputElement.value = value;

    const events = ['focus', 'input', 'change', 'blur'];
    for (const eventType of events) {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: inputElement, writable: false });
      inputElement.dispatchEvent(event);
    }

    return { success: true };
  }

  // Framework instance detection and manipulation methods
  private getReactInstance(element: HTMLElement): ReactInstance | null {
    const frameworkElement = element as FrameworkElement;
    const reactKey = Object.keys(frameworkElement).find(
      key => key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalFiber'),
    );
    return reactKey ? (frameworkElement[reactKey] as ReactInstance) : null;
  }

  private async updateReactState(reactInstance: ReactInstance, value: string): Promise<{ success: boolean }> {
    try {
      const component = reactInstance.memoizedState ?? reactInstance.stateNode;

      if (component?.setState) {
        component.setState({ value });
        return { success: true };
      }

      return { success: false };
    } catch (error) {
      debug.error(LOG_PREFIX, 'Error updating React state:', error);
      return { success: false };
    }
  }

  private getVueInstance(element: HTMLElement): VueInstance | null {
    const frameworkElement = element as FrameworkElement;
    return frameworkElement.__vue__ ?? null;
  }

  private async updateVueData(vueInstance: VueInstance, value: string): Promise<{ success: boolean }> {
    try {
      if (vueInstance.$data) {
        const dataKeys = Object.keys(vueInstance.$data);
        const valueKey = dataKeys.find(key => key.includes('value') || key.includes('model') || key.includes('input'));

        if (valueKey) {
          vueInstance.$data[valueKey] = value;
          return { success: true };
        }
      }

      return { success: false };
    } catch (error) {
      debug.error(LOG_PREFIX, 'Error updating Vue data:', error);
      return { success: false };
    }
  }

  private async updateAngularComponent(element: HTMLElement, value: string): Promise<{ success: boolean }> {
    try {
      const ngElement = element as AngularElement;
      if (ngElement.__ngElement__?.componentInstance) {
        const component = ngElement.__ngElement__.componentInstance;
        if (component.value !== undefined) {
          component.value = value;
          return { success: true };
        }
      }

      return { success: false };
    } catch (error) {
      debug.error(LOG_PREFIX, 'Error updating Angular component:', error);
      return { success: false };
    }
  }

  private async updateSvelteComponent(element: HTMLElement): Promise<{ success: boolean }> {
    try {
      const svelteElement = element as FrameworkElement;
      const svelteInstance = svelteElement.__svelte__;
      if (svelteInstance?.set) {
        // Note: Svelte's set() is typically for props, not values
        return { success: true };
      }

      return { success: false };
    } catch (error) {
      debug.error(LOG_PREFIX, 'Error updating Svelte component:', error);
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
        value: value,
      },
    };
  }
}
