/**
 * DOM Manipulation CopilotKit Actions
 * 
 * Actions for interacting with page DOM elements (cursor movement, clicks, verification, etc.)
 */

import React from 'react';
import { debug } from '@extension/shared';
import { ActionStatus } from '../../components/ActionStatus';
import {
  handleMoveCursorToElement,
  handleRefreshPageContent,
  handleCleanupExtensionUI,
  handleClickElement,
  handleVerifySelector,
  handleGetSelectorAtPoint,
  handleGetSelectorsAtPoints,
  handleKeystrokeSequence,
} from '../index';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

interface DOMActionDependencies {
  isLight: boolean;
  clipText: (text: any, maxLength?: number) => string;
  pageDataRef: React.MutableRefObject<{ embeddings: any; pageContent: any }>;
  triggerManualRefresh?: () => void;
}

/**
 * Creates the moveCursorToElement action
 * Shows/moves cursor to a specific element on the page
 */
export const createMoveCursorToElementAction = ({ isLight, clipText }: Omit<DOMActionDependencies, 'pageDataRef'>) => ({
  name: 'moveCursorToElement',
  description: 'Show/move cursor to the element matching the selector. Supports Shadow DOM with >> notation. Auto-hides after 5 minutes.',
  parameters: [
    {
      name: 'cssSelector',
      type: 'string',
      description:
        "A CSS selector to identify the element (e.g., '#create-account-btn', 'document > x-app >> #input'). Use searchPageContent() to find appropriate selectors.",
      required: true,
    },
  ],
  render: ({ status, args }: any) => (
    <ActionStatus
      toolName={`Move cursor to ${clipText((args as any)?.cssSelector, 60)}`}
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Moving cursor…', inProgress: 'Moving cursor…', complete: 'Cursor moved' }}
    />
  ),
  handler: async ({ cssSelector }: { cssSelector: string }) => {
    debug.log(ts(), '[Agent Request] moveCursorToElement:', { cssSelector });
    const result = await handleMoveCursorToElement(cssSelector);
    debug.log(ts(), '[Agent Response] moveCursorToElement:', result);
    return result;
  },
});

/**
 * Creates the refreshPageContent action
 * Refreshes current page HTML for latest content/embeddings
 */
export const createRefreshPageContentAction = ({ isLight, pageDataRef, triggerManualRefresh }: Omit<DOMActionDependencies, 'clipText'>) => ({
  name: 'refreshPageContent',
  description: 'Refresh current page HTML (for latest content/embeddings).',
  parameters: [],
  render: ({ status }: any) => (
    <ActionStatus
      toolName="Refresh page content"
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Refreshing page content…', inProgress: 'Refreshing page content…', complete: 'Page refreshed' }}
    />
  ),
  handler: async () => {
    debug.log(ts(), '[Agent Request] refreshPageContent');
    const getCurrentPageContent = () => pageDataRef.current?.pageContent;
    const result = await handleRefreshPageContent(getCurrentPageContent, triggerManualRefresh);
    debug.log(ts(), '[Agent Response] refreshPageContent:', result);
    return result;
  },
});

/**
 * Creates the cleanupExtensionUI action
 * Removes all extension UI elements and styles from the page
 */
export const createCleanupExtensionUIAction = ({ isLight }: Omit<DOMActionDependencies, 'clipText' | 'pageDataRef'>) => ({
  name: 'cleanupExtensionUI',
  description: 'Remove all extension UI elements and styles from the page.',
  parameters: [],
  render: ({ status }: any) => (
    <ActionStatus
      toolName="Clean up UI"
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Cleaning up UI…', inProgress: 'Cleaning up UI…', complete: 'UI cleaned' }}
    />
  ),
  handler: async () => {
    debug.log(ts(), '[Agent Request] cleanupExtensionUI');
    const result = await handleCleanupExtensionUI();
    debug.log(ts(), '[Agent Response] cleanupExtensionUI:', result);
    return result;
  },
});

/**
 * Creates the clickElement action
 * Clicks an element on the page
 */
export const createClickElementAction = ({ isLight, clipText }: Omit<DOMActionDependencies, 'pageDataRef'>) => ({
  name: 'clickElement',
  description: 'Click the element matching the provided CSS selector. Supports Shadow DOM with >> notation (e.g., "shadowPath >> #element").',
  parameters: [
    {
      name: 'cssSelector',
      type: 'string',
      description:
        "A CSS selector to identify the element (e.g., '#create-account-btn', 'document > x-app >> #input'). Use searchPageContent() to find appropriate selectors.",
      required: true,
    },
    {
      name: 'autoMoveCursor',
      type: 'boolean',
      description: 'Whether to automatically move the cursor to the element before clicking (default: true).',
      required: false,
    },
  ],
  render: ({ status, args }: any) => (
    <ActionStatus
      toolName={`Click ${clipText((args as any)?.cssSelector, 60)}`}
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Clicking…', inProgress: 'Clicking…', complete: 'Click done' }}
    />
  ),
  handler: async ({ cssSelector, autoMoveCursor }: { cssSelector: string; autoMoveCursor?: boolean }) => {
    debug.log(ts(), '[Agent Request] clickElement:', { cssSelector, autoMoveCursor });
    const result = await handleClickElement(cssSelector, autoMoveCursor);
    debug.log(ts(), '[Agent Response] clickElement:', result);
    return result;
  },
});

/**
 * Creates the verifySelector action
 * Validates a CSS selector (syntax, match count, shadow DOM info, element details)
 */
export const createVerifySelectorAction = ({ isLight, clipText }: Omit<DOMActionDependencies, 'pageDataRef'>) => ({
  name: 'verifySelector',
  description: 'Validate a CSS selector (syntax, match count, shadow DOM info, element details). Supports Shadow DOM with >> notation.',
  parameters: [
    {
      name: 'cssSelector',
      type: 'string',
      description: "The CSS selector to verify (e.g., '#submit-btn', 'document > x-app >> #input'). Use >> to traverse shadow DOM.",
      required: true,
    },
  ],
  render: ({ status, args }: any) => (
    <ActionStatus
      toolName={`Verify ${clipText((args as any)?.cssSelector, 60)}`}
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Verifying selector…', inProgress: 'Verifying selector…', complete: 'Selector verified' }}
    />
  ),
  handler: async ({ cssSelector }: { cssSelector: string }) => {
    debug.log(ts(), '[Agent Request] verifySelector:', { cssSelector });
    const result = await handleVerifySelector(cssSelector);
    debug.log(ts(), '[Agent Response] verifySelector:', result);
    return result;
  },
});

/**
 * Creates the getSelectorAtPoint action
 * Returns a unique CSS selector for the element at given viewport coordinates
 */
export const createGetSelectorAtPointAction = ({ isLight }: Omit<DOMActionDependencies, 'clipText' | 'pageDataRef'>) => ({
  name: 'getSelectorAtPoint',
  description: `Return a unique CSS selector for the element at the given viewport coordinates (x, y). Coordinates are in CSS pixels relative to the viewport (0,0 is top-left).`,
  parameters: [
    { name: 'x', type: 'number', description: 'Viewport X coordinate in CSS px', required: true },
    { name: 'y', type: 'number', description: 'Viewport Y coordinate in CSS px', required: true },
  ],
  render: ({ status, args }: any) => (
    <ActionStatus
      toolName={`Selector at (${Number((args as any)?.x)}, ${Number((args as any)?.y)})`}
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Finding selector at point…', inProgress: 'Finding selector at point…', complete: 'Selector found' }}
    />
  ),
  handler: async ({ x, y }: { x: number; y: number }) => {
    debug.log(ts(), '[Agent Request] getSelectorAtPoint:', { x, y });
    const result = await handleGetSelectorAtPoint(Number(x), Number(y));
    debug.log(ts(), '[Agent Response] getSelectorAtPoint:', result);
    return result;
  },
});

/**
 * Creates the getSelectorsAtPoints action
 * Returns unique CSS selectors for elements at multiple viewport coordinates
 */
export const createGetSelectorsAtPointsAction = ({ isLight }: Omit<DOMActionDependencies, 'clipText' | 'pageDataRef'>) => ({
  name: 'getSelectorsAtPoints',
  description: `Return unique CSS selectors for elements at the provided list of viewport coordinates. Each item is { x, y } in CSS pixels relative to the viewport.`,
  parameters: [
    { name: 'points', type: 'object[]', description: 'Array of points {x:number,y:number}', required: true },
  ],
  render: ({ status, args }: any) => (
    <ActionStatus
      toolName={`Selectors at ${Array.isArray((args as any)?.points) ? (args as any).points.length : 0} point(s)`}
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Finding selectors…', inProgress: 'Finding selectors…', complete: 'Selectors found' }}
    />
  ),
  handler: async ({ points }: { points: Array<{ x: number; y: number }> }) => {
    debug.log(ts(), '[Agent Request] getSelectorsAtPoints:', { pointsCount: points?.length });
    const safe = Array.isArray(points) ? points.map((p: any) => ({ x: Number(p.x), y: Number(p.y) })) : [];
    const result = await handleGetSelectorsAtPoints(safe);
    debug.log(ts(), '[Agent Response] getSelectorsAtPoints:', result);
    return result;
  },
});

/**
 * Creates the sendKeystrokes action
 * Sends keyboard shortcuts and sequences to the active page (supports modifiers and repeats)
 */
export const createSendKeystrokesAction = ({ isLight, clipText }: Omit<DOMActionDependencies, 'pageDataRef'>) => ({
  name: 'sendKeystrokes',
  description:
    'Send keyboard shortcuts or sequences to the page. Supports modifiers (ctrl/meta/alt/shift), repeats, optional target focus via selector (supports shadow >>), and per-key delay.',
  parameters: [
    {
      name: 'sequence',
      type: 'object[]',
      description:
        "Array of keystrokes. Each item: { key: string, ctrl?: boolean, meta?: boolean, alt?: boolean, shift?: boolean, repeat?: number }. Example: [{ key: 'k', meta: true }] for Cmd+K.",
      required: true,
    },
    {
      name: 'targetSelector',
      type: 'string',
      description: 'Optional CSS selector to focus before typing. Supports Shadow DOM with >> notation.',
      required: false,
    },
    {
      name: 'delayMs',
      type: 'number',
      description: 'Optional delay between keystrokes in milliseconds (default 20ms, max 250ms).',
      required: false,
    },
  ],
  render: ({ status, args }: any) => (
    <ActionStatus
      toolName={`Send keystrokes${(args as any)?.targetSelector ? ` to ${clipText((args as any)?.targetSelector, 48)}` : ''}`}
      status={status as any}
      isLight={isLight}
      messages={{ pending: 'Sending keystrokes…', inProgress: 'Sending keystrokes…', complete: 'Keystrokes sent' }}
    />
  ),
  handler: async ({ sequence, targetSelector, delayMs }: { sequence: any[]; targetSelector?: string; delayMs?: number }) => {
    // Format keystrokes for logging
    const formatKeystroke = (s: any): string => {
      const mods: string[] = [];
      if (s?.ctrl) mods.push('Ctrl');
      if (s?.meta) mods.push('Cmd');
      if (s?.alt) mods.push('Alt');
      if (s?.shift) mods.push('Shift');
      const key = String(s?.key ?? '');
      const repeat = s?.repeat && s.repeat > 1 ? `×${s.repeat}` : '';
      return mods.length > 0 ? `${mods.join('+')}+${key}${repeat}` : `${key}${repeat}`;
    };
    const formattedKeys = Array.isArray(sequence) ? sequence.map(formatKeystroke).join(' ') : '';
    
    debug.log(ts(), `[Agent Request] sendKeystrokes: ${formattedKeys}`, { targetSelector, delayMs });
    
    const safeSeq = Array.isArray(sequence)
      ? sequence.map((s: any) => ({
          key: String(s?.key ?? ''),
          ctrl: !!s?.ctrl,
          meta: !!s?.meta,
          alt: !!s?.alt,
          shift: !!s?.shift,
          repeat: Number.isFinite(s?.repeat) ? Math.max(1, Math.min(50, Number(s.repeat))) : 1,
        }))
      : [];
    const req = { sequence: safeSeq, targetSelector: targetSelector ? String(targetSelector) : undefined, delayMs: Number(delayMs) } as any;
    const result = await handleKeystrokeSequence(req);
    debug.log(ts(), '[Agent Response] sendKeystrokes:', result);
    return result;
  },
});

