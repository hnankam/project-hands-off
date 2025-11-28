/**
 * Search-related CopilotKit Actions
 *
 * Actions for semantic search over page content, forms, DOM updates, and clickable elements.
 */

import React from 'react';
import type { SemanticSearchManager } from '../../lib/SemanticSearchManager';
import { ActionStatus } from '../../components/ActionStatus';
import { debug } from '@extension/shared';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum length for query display */
const MAX_QUERY_LENGTH = 48;

/** Icon size in pixels */
const ICON_SIZE = 14;

/** Icon margin right in pixels */
const ICON_MARGIN_RIGHT = 6;

/** Icon colors by theme */
const ICON_COLORS = {
  light: '#4b5563',
  dark: '#6b7280',
} as const;

/** Log prefix for agent actions */
const LOG_PREFIX = {
  request: '[Agent Request]',
  response: '[Agent Response]',
} as const;

// ============================================================================
// TYPES
// ============================================================================

/** Timestamp helper for consistent logging */
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/** Status values for action render */
type ActionPhase = 'pending' | 'inProgress' | 'complete' | 'error';

/** Search arguments */
interface SearchArgs {
  query?: string;
  topK?: number;
}

/** Search result with count */
interface SearchResult {
  resultsCount?: number;
  [key: string]: unknown;
}

/** Props passed to action render functions */
interface ActionRenderProps {
  status: ActionPhase;
  args?: SearchArgs;
  result?: SearchResult;
  error?: Error | string;
}

/** Dependencies for search actions */
interface SearchActionDependencies {
  searchManager: SemanticSearchManager;
  isLight: boolean;
  clipText: (text: string, maxLength?: number) => string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get icon style based on theme
 */
function getIconStyle(isLight: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    marginRight: ICON_MARGIN_RIGHT,
    color: isLight ? ICON_COLORS.light : ICON_COLORS.dark,
  };
}

/**
 * Common SVG props for icons
 */
const svgProps = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/**
 * Pluralize helper
 */
function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

// ============================================================================
// ICONS
// ============================================================================

/** Base search icon (magnifying glass) */
function SearchIconBase({ style, children }: { style: React.CSSProperties; children?: React.ReactNode }): React.ReactElement {
  return (
    <svg {...svgProps} style={style}>
      <circle stroke="currentColor" cx="11" cy="11" r="8" />
      <path stroke="currentColor" d="M21 21l-4.35-4.35" />
      {children}
    </svg>
  );
}

/** Search content icon (with lines) */
function SearchContentIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <SearchIconBase style={style}>
      <path stroke="currentColor" strokeWidth="1.5" d="M8 11h6M8 8h4" opacity="0.5" />
    </SearchIconBase>
  );
}

/** Search form icon (with checkboxes) */
function SearchFormIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <SearchIconBase style={style}>
      <rect stroke="currentColor" strokeWidth="1.5" x="7.5" y="8.5" width="2" height="2" opacity="0.5" />
      <rect stroke="currentColor" strokeWidth="1.5" x="7.5" y="11.5" width="2" height="2" opacity="0.5" />
      <path stroke="currentColor" strokeWidth="1.5" d="M11 9h2M11 12h2" opacity="0.5" />
    </SearchIconBase>
  );
}

/** Search clickable icon (with checkmark) */
function SearchClickableIcon({ style }: { style: React.CSSProperties }): React.ReactElement {
  return (
    <SearchIconBase style={style}>
      <path stroke="currentColor" strokeWidth="1.5" d="M7.5 11.5l2.5 2.5 5-5" opacity="0.6" />
    </SearchIconBase>
  );
}

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Creates the searchPageContent action
 * Performs semantic search over current page HTML content
 */
export const createSearchPageContentAction = ({ searchManager, isLight, clipText }: SearchActionDependencies) => ({
  name: 'searchPageContent',
  description: 'Semantic search over current page content. Returns top‑K relevant HTML chunks.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description:
        "A semantically rich search query with key concepts and entities. Transform the user's natural language request into focused search terms (nouns, adjectives, domain terms). DO NOT use full sentences or action verbs like 'find', 'show', 'get'.",
      required: true,
    },
    {
      name: 'topK',
      type: 'number',
      description: 'Number of results to return (default: 3, max: 10)',
      required: false,
    },
  ],
  render: ({ status, result, args, error }: ActionRenderProps) => {
    const query = clipText(args?.query ?? '', MAX_QUERY_LENGTH);
    const numChunks = status === 'complete' ? (result?.resultsCount ?? 0) : 0;

    return (
      <ActionStatus
        toolName={`Search page for "${query}"`}
        status={status}
        isLight={isLight}
        icon={<SearchContentIcon style={getIconStyle(isLight)} />}
        messages={{
          pending: `Searching for "${query}"`,
          inProgress: `Searching for "${query}"`,
          complete: `Search complete for "${query}". Found ${numChunks} ${pluralize(numChunks, 'chunk')}`,
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ query, topK = 3 }: { query: string; topK?: number }) => {
    debug.log(ts(), LOG_PREFIX.request, 'searchPageContent:', { query, topK });
    const result = await searchManager.searchPageContent(query, topK);
    debug.log(ts(), LOG_PREFIX.response, 'searchPageContent:', result);
    return result;
  },
});

/**
 * Creates the searchFormData action
 * Searches form fields (inputs, textareas, selects, checkboxes/radios)
 */
export const createSearchFormDataAction = ({ searchManager, isLight, clipText }: SearchActionDependencies) => ({
  name: 'searchFormData',
  description: 'Search form fields (inputs, textareas, selects, checkboxes/radios). Returns fields with selectors.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description:
        "A field-focused search query describing the form field's purpose and type. Focus on: field purpose (email, password, name, etc.), field type (input, select, textarea, checkbox), and context (login, registration, search, etc.). Use descriptive nouns, not action verbs.",
      required: true,
    },
    {
      name: 'topK',
      type: 'number',
      description: 'Number of results to return (default: 5, max: 20)',
      required: false,
    },
  ],
  render: ({ status, result, args, error }: ActionRenderProps) => {
    const query = clipText(args?.query ?? '', MAX_QUERY_LENGTH);
    const numFields = status === 'complete' ? (result?.resultsCount ?? 0) : 0;

    return (
      <ActionStatus
        toolName={`Form fields for "${query}"`}
        status={status}
        isLight={isLight}
        icon={<SearchFormIcon style={getIconStyle(isLight)} />}
        messages={{
          pending: `Searching form fields for "${query}"`,
          inProgress: `Searching form fields for "${query}"`,
          complete: `Found ${numFields} form ${pluralize(numFields, 'field')} for "${query}"`,
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ query, topK = 5 }: { query: string; topK?: number }) => {
    debug.log(ts(), LOG_PREFIX.request, 'searchFormData:', { query, topK });
    const result = await searchManager.searchFormData(query, topK);
    debug.log(ts(), LOG_PREFIX.response, 'searchFormData:', result);
    return result;
  },
});

/**
 * Creates the searchDOMUpdates action
 * Searches recent DOM changes (added/removed/modified elements)
 */
export const createSearchDOMUpdatesAction = ({ searchManager, isLight, clipText }: SearchActionDependencies) => ({
  name: 'searchDOMUpdates',
  description: 'Search recent DOM changes (added/removed/modified). Returns summaries with timestamps.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description:
        'A search query describing the type of change or element. Focus on: element type, change type (added, removed, modified), or content keywords. Examples: "new buttons", "removed forms", "modified headers".',
      required: true,
    },
    {
      name: 'topK',
      type: 'number',
      description: 'Number of results to return (default: 5, max: 20)',
      required: false,
    },
  ],
  render: ({ status, result, args, error }: ActionRenderProps) => {
    const query = clipText(args?.query ?? '', MAX_QUERY_LENGTH);
    const numUpdates = status === 'complete' ? (result?.resultsCount ?? 0) : 0;

    return (
      <ActionStatus
        toolName={`DOM updates for "${query}"`}
        status={status}
        isLight={isLight}
        messages={{
          pending: `Searching DOM updates for "${query}"`,
          inProgress: `Searching DOM updates for "${query}"`,
          complete: `Found ${numUpdates} DOM ${pluralize(numUpdates, 'update')} for "${query}"`,
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ query, topK = 5 }: { query: string; topK?: number }) => {
    debug.log(ts(), LOG_PREFIX.request, 'searchDOMUpdates:', { query, topK });
    const result = await searchManager.searchDOMUpdates(query, topK);
    debug.log(ts(), LOG_PREFIX.response, 'searchDOMUpdates:', result);
    return result;
  },
});

/**
 * Creates the searchClickableElements action
 * Searches clickable elements (buttons, links, etc.)
 */
export const createSearchClickableElementsAction = ({ searchManager, isLight, clipText }: SearchActionDependencies) => ({
  name: 'searchClickableElements',
  description: 'Search clickable elements (buttons/links/etc.). Returns items with reliable selectors.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description:
        'A search query describing the clickable element. Focus on: button/link text, element purpose, visual appearance. Examples: "submit button", "navigation link", "close icon".',
      required: true,
    },
    {
      name: 'topK',
      type: 'number',
      description: 'Number of results to return (default: 5, max: 20)',
      required: false,
    },
  ],
  render: ({ status, result, args, error }: ActionRenderProps) => {
    const query = clipText(args?.query ?? '', MAX_QUERY_LENGTH);
    const numElements = status === 'complete' ? (result?.resultsCount ?? 0) : 0;

    return (
      <ActionStatus
        toolName={`Clickable elements for "${query}"`}
        status={status}
        isLight={isLight}
        icon={<SearchClickableIcon style={getIconStyle(isLight)} />}
        messages={{
          pending: `Searching clickable elements for "${query}"`,
          inProgress: `Searching clickable elements for "${query}"`,
          complete: `Found ${numElements} clickable ${pluralize(numElements, 'element')} for "${query}"`,
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ query, topK = 5 }: { query: string; topK?: number }) => {
    debug.log(ts(), LOG_PREFIX.request, 'searchClickableElements:', { query, topK });
    const result = await searchManager.searchClickableElements(query, topK);
    debug.log(ts(), LOG_PREFIX.response, 'searchClickableElements:', result);
    return result;
  },
});
