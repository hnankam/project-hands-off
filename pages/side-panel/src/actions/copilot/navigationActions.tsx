/**
 * Navigation CopilotKit Actions
 * 
 * Actions for page navigation (opening tabs, scrolling, drag and drop)
 */

import React from 'react';
import { debug } from '@extension/shared';
import { ActionStatus } from '../../components/ActionStatus';
import { handleOpenNewTab, handleScroll, handleDragAndDrop } from '../index';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

interface NavigationActionDependencies {
  isLight: boolean;
  clipText: (text: any, maxLength?: number) => string;
  yesNo: (value: any) => string;
}

/**
 * Creates the openNewTab action
 * Opens a new browser tab with the specified URL
 */
export const createOpenNewTabAction = ({ isLight, clipText }: Omit<NavigationActionDependencies, 'yesNo'>) => ({
  name: 'openNewTab',
  description: 'Open a new tab with the given URL (validated and normalized).',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description:
        "The URL to open in the new tab (e.g., 'https://google.com', 'github.com', 'https://example.com/page').",
      required: true,
    },
    {
      name: 'active',
      type: 'boolean',
      description: 'Whether to make the new tab active (default: true). Set to false to open in background.',
      required: false,
    },
  ],
  render: ({ status, args }: any) => {
    const url = clipText((args as any)?.url, 56);
    return (
      <ActionStatus
        toolName={`Open ${url}`}
        status={status as any}
        isLight={isLight}
        messages={{
          pending: `Opening ${url} on a new tab`,
          inProgress: `Opening ${url} on a new tab`,
          complete: `Opened ${url} on new tab ${((args as any)?.active || true) ? 'and made active' : 'in background'}`
        }}
      />
    );
  },
  handler: async ({ url, active = true }: { url: string; active?: boolean }) => {
    debug.log(ts(), '[Agent Request] openNewTab:', { url, active });
    const result = await handleOpenNewTab(url, active);
    debug.log(ts(), '[Agent Response] openNewTab:', result);
    return result;
  },
});

/**
 * Creates the scroll action
 * Scrolls the page or a specific element
 */
export const createScrollAction = ({ isLight, clipText, yesNo }: NavigationActionDependencies) => ({
  name: 'scroll',
  description: 'Scroll the page or an element, or scroll the page to an element.',
  parameters: [
    {
      name: 'cssSelector',
      type: 'string',
      description:
        'Optional CSS selector for the element to scroll within or scroll to. Leave empty to scroll the page.',
      required: false,
    },
    {
      name: 'direction',
      type: 'string',
      description: "Direction to scroll: 'up', 'down', 'left', 'right', 'top', 'bottom', or 'to'. Default: 'down'.",
      required: false,
    },
    {
      name: 'amount',
      type: 'number',
      description:
        "Amount to scroll in pixels (for up/down/left/right). Default: 300. Ignored for 'top', 'bottom', and 'to'.",
      required: false,
    },
    {
      name: 'scrollTo',
      type: 'boolean',
      description:
        'If true, scrolls TO the element (brings it into view). If false, scrolls WITHIN the element. Default: false.',
      required: false,
    },
  ],
  render: ({ status, args }: any) => (
    <ActionStatus
      toolName={`Scroll ${clipText((args as any)?.cssSelector || 'page', 40)} ${String((args as any)?.direction || 'down')}${(args as any)?.amount ? ` by ${Number((args as any)?.amount)}px` : ''}${typeof (args as any)?.scrollTo === 'boolean' ? ` (to=${yesNo((args as any)?.scrollTo)})` : ''}`}
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Scrolling…', inProgress: 'Scrolling…', complete: 'Scroll complete' }}
    />
  ),
  handler: async ({ 
    cssSelector = '', 
    direction = 'down', 
    amount = 300, 
    scrollTo = false 
  }: { 
    cssSelector?: string; 
    direction?: 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom' | 'to'; 
    amount?: number; 
    scrollTo?: boolean;
  }) => {
    debug.log(ts(), '[Agent Request] scroll:', { cssSelector, direction, amount, scrollTo });
    const result = await handleScroll(
      cssSelector, 
      direction as 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom' | 'to', 
      amount,
      scrollTo,
    );
    debug.log(ts(), '[Agent Response] scroll:', result);
    return result;
  },
});

/**
 * Creates the dragAndDrop action
 * Drags an element from source to target
 */
export const createDragAndDropAction = ({ isLight, clipText }: Omit<NavigationActionDependencies, 'yesNo'>) => ({
  name: 'dragAndDrop',
  description: 'Drag from source selector and drop on target selector (supports offsets and canvas cases). Supports Shadow DOM with >> notation.',
  parameters: [
    {
      name: 'sourceCssSelector',
      type: 'string',
      description: "CSS selector for the element to drag (e.g., '#draggable-item', 'document > x-app >> .card').",
      required: true,
    },
    {
      name: 'targetCssSelector',
      type: 'string',
      description: "CSS selector for the drop target element (e.g., '.drop-zone', 'document > x-app >> #container').",
      required: true,
    },
    {
      name: 'offsetX',
      type: 'number',
      description:
        'Optional horizontal offset in pixels from target center (default: 0). Positive = right, negative = left.',
      required: false,
    },
    {
      name: 'offsetY',
      type: 'number',
      description:
        'Optional vertical offset in pixels from target center (default: 0). Positive = down, negative = up.',
      required: false,
    },
  ],
  render: ({ status, args }: any) => (
    <ActionStatus
      toolName={`Drag ${clipText((args as any)?.sourceCssSelector, 32)} → ${clipText((args as any)?.targetCssSelector, 32)}`}
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Dragging and dropping…', inProgress: 'Dragging and dropping…', complete: 'Drag-and-drop complete' }}
    />
  ),
  handler: async ({ 
    sourceCssSelector, 
    targetCssSelector, 
    offsetX = 0, 
    offsetY = 0 
  }: { 
    sourceCssSelector: string; 
    targetCssSelector: string; 
    offsetX?: number; 
    offsetY?: number;
  }) => {
    debug.log(ts(), '[Agent Request] dragAndDrop:', { sourceCssSelector, targetCssSelector, offsetX, offsetY });
    const result = await handleDragAndDrop(sourceCssSelector, targetCssSelector, offsetX, offsetY    );
    debug.log(ts(), '[Agent Response] dragAndDrop:', result);
    return result;
  },
});

