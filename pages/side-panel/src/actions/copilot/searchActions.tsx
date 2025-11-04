/**
 * Search-related CopilotKit Actions
 * 
 * Actions for semantic search over page content, forms, DOM updates, and clickable elements.
 */

import React from 'react';
import type { SemanticSearchManager } from '../../lib/SemanticSearchManager';
import { ActionStatus } from '../../components/ActionStatus';

import { debug } from '@extension/shared';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

interface SearchActionDependencies {
  searchManager: SemanticSearchManager;
  isLight: boolean;
  clipText: (text: any, maxLength?: number) => string;
}

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
  render: ({ status, result, args, error }: any) => {
    const query = clipText((args as any)?.query, 48);
    const numChunks = status === 'complete' && result ? ((result as any)?.resultsCount || 0) : 0;
    
    const searchContentIcon = (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, marginRight: 6 }}>
        <defs>
          <linearGradient id="searchContentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#3B82F6', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#8B5CF6', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <circle stroke="url(#searchContentGradient)" cx="11" cy="11" r="8" />
        <path stroke="url(#searchContentGradient)" d="M21 21l-4.35-4.35" />
        <path stroke="url(#searchContentGradient)" strokeWidth="1.5" d="M8 11h6M8 8h4" opacity="0.5" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName={`Search page for "${query}"`}
        status={status as any}
        isLight={isLight}
        icon={searchContentIcon}
        messages={{
          pending: `Searching for "${query}"`,
          inProgress: `Searching for "${query}"`,
          complete: `Search complete for "${query}". Found ${numChunks} chunk${numChunks !== 1 ? 's' : ''}`
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ query, topK = 3 }: { query: string; topK?: number }) => {
    debug.log(ts(), '[Agent Request] searchPageContent:', { query, topK });
    const result = await searchManager.searchPageContent(query, topK);
    debug.log(ts(), '[Agent Response] searchPageContent:', result);
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
  render: ({ status, result, args, error }: any) => {
    const query = clipText((args as any)?.query, 48);
    const numFields = status === 'complete' && result ? ((result as any)?.resultsCount || 0) : 0;
    
    const searchFormIcon = (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, marginRight: 6 }}>
        <defs>
          <linearGradient id="searchFormGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#10B981', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#06B6D4', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <circle stroke="url(#searchFormGradient)" cx="11" cy="11" r="8" />
        <path stroke="url(#searchFormGradient)" d="M21 21l-4.35-4.35" />
        <rect stroke="url(#searchFormGradient)" strokeWidth="1.5" x="7.5" y="8.5" width="2" height="2" opacity="0.5" />
        <rect stroke="url(#searchFormGradient)" strokeWidth="1.5" x="7.5" y="11.5" width="2" height="2" opacity="0.5" />
        <path stroke="url(#searchFormGradient)" strokeWidth="1.5" d="M11 9h2M11 12h2" opacity="0.5" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName={`Form fields for "${query}"`}
        status={status as any}
        isLight={isLight}
        icon={searchFormIcon}
        messages={{
          pending: `Searching form fields for "${query}"`,
          inProgress: `Searching form fields for "${query}"`,
          complete: `Found ${numFields} form field${numFields !== 1 ? 's' : ''} for "${query}"`
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ query, topK = 5 }: { query: string; topK?: number }) => {
    debug.log(ts(), '[Agent Request] searchFormData:', { query, topK });
    const result = await searchManager.searchFormData(query, topK);
    debug.log(ts(), '[Agent Response] searchFormData:', result);
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
  render: ({ status, result, args, error }: any) => {
    const query = clipText((args as any)?.query, 48);
    const numUpdates = status === 'complete' && result ? ((result as any)?.resultsCount || 0) : 0;
    
    return (
      <ActionStatus
        toolName={`DOM updates for "${query}"`}
        status={status as any}
        isLight={isLight}
        messages={{
          pending: `Searching DOM updates for "${query}"`,
          inProgress: `Searching DOM updates for "${query}"`,
          complete: `Found ${numUpdates} DOM update${numUpdates !== 1 ? 's' : ''} for "${query}"`
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ query, topK = 5 }: { query: string; topK?: number }) => {
    debug.log(ts(), '[Agent Request] searchDOMUpdates:', { query, topK });
    const result = await searchManager.searchDOMUpdates(query, topK);
    debug.log(ts(), '[Agent Response] searchDOMUpdates:', result);
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
  render: ({ status, result, args, error }: any) => {
    const query = clipText((args as any)?.query, 48);
    const numElements = status === 'complete' && result ? ((result as any)?.resultsCount || 0) : 0;
    
    const searchClickableIcon = (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, marginRight: 6 }}>
        <defs>
          <linearGradient id="searchClickableGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#F59E0B', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#EF4444', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <circle stroke="url(#searchClickableGradient)" cx="11" cy="11" r="8" />
        <path stroke="url(#searchClickableGradient)" d="M21 21l-4.35-4.35" />
        <path stroke="url(#searchClickableGradient)" strokeWidth="1.5" d="M7.5 11.5l2.5 2.5 5-5" opacity="0.6" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName={`Clickable elements for "${query}"`}
        status={status as any}
        isLight={isLight}
        icon={searchClickableIcon}
        messages={{
          pending: `Searching clickable elements for "${query}"`,
          inProgress: `Searching clickable elements for "${query}"`,
          complete: `Found ${numElements} clickable element${numElements !== 1 ? 's' : ''} for "${query}"`
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
  handler: async ({ query, topK = 5 }: { query: string; topK?: number }) => {
    debug.log(ts(), '[Agent Request] searchClickableElements:', { query, topK });
    const result = await searchManager.searchClickableElements(query, topK);
    debug.log(ts(), '[Agent Response] searchClickableElements:', result);
    return result;
  },
});

