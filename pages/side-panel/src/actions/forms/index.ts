/**
 * Forms module exports
 * Provides access to all specialized input handlers and the main dispatcher
 */

// Export types and interfaces
export * from './types';

// Export utilities
export * from './utils';

// Export specialized handlers
export { TextInputHandler } from './textInputHandler';
export { CheckboxRadioHandler } from './checkboxRadioHandler';
export { DateInputHandler } from './dateInputHandler';
export { NumberInputHandler } from './numberInputHandler';
export { SelectInputHandler } from './selectInputHandler';
export { ContentEditableHandler } from './contentEditableHandler';
export { TextareaHandler } from './textareaHandler';
export { ModernInputHandler } from './modernInputHandler';

// Export main dispatcher
export { InputDispatcher, inputDispatcher, handleInputData } from './inputDispatcher';

// Export for backward compatibility
export { handleInputData as inputData } from './inputDispatcher';
