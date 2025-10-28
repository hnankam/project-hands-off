/**
 * Form Manipulation CopilotKit Actions
 * 
 * Actions for filling form fields (inputs, textareas, selects, checkboxes, contenteditable)
 */

import React from 'react';
import { debug } from '@extension/shared';
import { ActionStatus } from '../../components/ActionStatus';
import { handleInputData } from '../index';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

interface FormActionDependencies {
  isLight: boolean;
  clipText: (text: any, maxLength?: number) => string;
}

/**
 * Creates the inputData action
 * Fills a form field with the provided value
 */
export const createInputDataAction = ({ isLight, clipText }: FormActionDependencies) => ({
  name: 'inputData',
  description: 'Fill a form field matched by selector (inputs, textareas, selects, checkboxes, contenteditable). Supports Shadow DOM with >> notation.',
  parameters: [
    {
      name: 'cssSelector',
      type: 'string',
      description:
        "A valid CSS selector for the input field (e.g., '#email', 'document > x-app >> #message'). Use searchPageContent() to find appropriate selectors.",
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description:
        "The value to input into the field. For checkboxes/radio, use 'true' or 'false'. For select, use option value or text.",
      required: true,
    },
    {
      name: 'clearFirst',
      type: 'boolean',
      description: 'Whether to clear the field before inputting (default: true). Set to false to append.',
      required: false,
    },
    {
      name: 'moveCursor',
      type: 'boolean',
      description:
        'Whether to move the mouse cursor to the input element (default: true). Set to false to disable cursor movement.',
      required: false,
    },
  ],
  render: ({ status, args }: any) => (
    <ActionStatus
      toolName={`Input into ${clipText((args as any)?.cssSelector, 52)}: "${clipText((args as any)?.value, 24)}"`}
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Filling field…', inProgress: 'Filling field…', complete: 'Field filled' }}
    />
  ),
  handler: async ({ cssSelector, value, clearFirst = true, moveCursor = true }: { 
    cssSelector: string; 
    value: string; 
    clearFirst?: boolean; 
    moveCursor?: boolean;
  }) => {
    debug.log(ts(), '[Agent Request] inputData:', { cssSelector, value, clearFirst, moveCursor });
    const result = await handleInputData(cssSelector, value, clearFirst, moveCursor);
    debug.log(ts(), '[Agent Response] inputData:', result);
    return result;
  },
});

