/**
 * Shared types and interfaces for all input handlers
 */

export interface InputDataResult {
  status: 'success' | 'error';
  message: string;
  elementInfo?: {
    tag: string;
    type: string;
    id: string;
    name: string;
    value: string;
    foundInShadowDOM?: boolean;
    shadowHost?: string | null;
    // Optional bounding box of the interacted element (for diagnostics/UX)
    bbox?: { x: number; y: number; width: number; height: number };
  };
}

export interface InputHandlerOptions {
  clearFirst?: boolean;
  typingSpeed?: number;
  triggerEvents?: boolean;
  highlightElement?: boolean;
  showSuccessFeedback?: boolean;
  moveCursor?: boolean;
  // Optional per-call timeout budget for complex handlers (ms)
  timeoutMs?: number;
}

export interface ElementInfo {
  element: HTMLElement;
  foundInShadowDOM: boolean;
  shadowHostInfo: string;
  inputType: string;
  tagName: string;
}

export interface StreamingOptions {
  speed: number;
  triggerInputEvents: boolean;
  triggerChangeEvents: boolean;
  triggerKeyboardEvents: boolean;
  // Emit selectionchange for editors
  triggerSelectionChange?: boolean;
}

export interface ModernInputDetection {
  isReactComponent: boolean;
  isVueComponent: boolean;
  isCustomInput: boolean;
  framework: 'react' | 'vue' | 'angular' | 'svelte' | 'vanilla' | 'unknown';
  componentName?: string;
  props?: Record<string, any>;
}

export interface DateInputOptions extends InputHandlerOptions {
  format?: 'ISO' | 'US' | 'EU' | 'custom';
  customFormat?: string;
  timezone?: string;
}

export interface NumberInputOptions extends InputHandlerOptions {
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
}

export interface SelectInputOptions extends InputHandlerOptions {
  matchBy?: 'value' | 'text' | 'index' | 'both';
  caseSensitive?: boolean;
  partialMatch?: boolean;
  // If true, prefers value match over text when both match
  preferValueOverText?: boolean;
}

export interface CheckboxRadioOptions extends InputHandlerOptions {
  value?: boolean | string;
  interpretAs?: 'boolean' | 'string' | 'number';
}

export interface ContentEditableOptions extends InputHandlerOptions {
  preserveFormatting?: boolean;
  insertMode?: 'replace' | 'append' | 'prepend';
  htmlContent?: boolean;
  // When streaming, stream by lines if large multi-line content
  streamByLinesThreshold?: number;
}

export interface TextInputOptions extends InputHandlerOptions {
  mask?: string;
  validation?: RegExp;
  maxLength?: number;
  autoComplete?: boolean;
  // If provided, enforce input to match this regex after input
  enforcePattern?: RegExp;
}

export type InputType =
  | 'text'
  | 'email'
  | 'password'
  | 'search'
  | 'tel'
  | 'url'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'datetime-local'
  | 'time'
  | 'month'
  | 'week'
  | 'number'
  | 'range'
  | 'select'
  | 'textarea'
  | 'contenteditable'
  | 'file'
  | 'hidden'
  | 'button'
  | 'submit'
  | 'reset'
  | 'color'
  | 'image';

export interface InputHandler {
  canHandle(inputType: InputType, element: HTMLElement): boolean;
  handle(element: HTMLElement, value: string, options: InputHandlerOptions): Promise<InputDataResult>;
}
