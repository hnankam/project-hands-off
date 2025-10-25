/**
 * Data Retrieval CopilotKit Actions
 * 
 * Actions for fetching HTML, form, and clickable element chunks by index range.
 */

import React from 'react';
import { debug, embeddingsStorage } from '@extension/shared';
import { ActionStatus } from '../../components/ActionStatus';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

interface DataRetrievalDependencies {
  currentPageContent: any;
  isLight: boolean;
}

/**
 * Creates the getHtmlChunksByRange action
 * Fetches HTML chunks by chunk index range from the database
 */
export const createGetHtmlChunksByRangeAction = ({ currentPageContent, isLight }: DataRetrievalDependencies) => ({
  name: 'getHtmlChunksByRange',
  description: 'Fetch HTML chunks by chunk index range (inclusive).',
  parameters: [
    { name: 'start', type: 'number', description: 'Start chunk index (>=0)', required: true },
    { name: 'end', type: 'number', description: 'End chunk index (>=start)', required: true },
  ],
  render: ({ status, result, args }: any) => {
    const start = Number((args as any)?.start);
    const end = Number((args as any)?.end);
    const numChunks = status === 'complete' && result ? ((result as any)?.chunks?.length || 0) : 0;
    
    const htmlPaginationIcon = (
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
          <linearGradient id="htmlPaginationGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#3B82F6', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#8B5CF6', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <path stroke="url(#htmlPaginationGradient)" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path stroke="url(#htmlPaginationGradient)" d="M14 2v6h6" />
        <path stroke="url(#htmlPaginationGradient)" strokeWidth="1.5" d="M16 13H8M16 17H8M10 9H8" opacity="0.5" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName={`HTML chunks ${start}–${end}`}
        status={status as any}
        isLight={isLight}
        icon={htmlPaginationIcon}
        messages={{
          pending: `Fetching HTML chunks ${start}–${end}`,
          inProgress: `Fetching HTML chunks ${start}–${end}`,
          complete: `Fetched ${numChunks} HTML chunk${numChunks !== 1 ? 's' : ''}`
        }}
      />
    );
  },
  handler: async ({ start, end }: { start: number; end: number }) => {
    const url = currentPageContent?.url || '';
    if (!url) return { status: 'error', message: 'No page URL' };
    const s = Math.max(0, Number(start));
    const e = Math.max(s, Number(end));
    try {
      debug.log(ts(), '[AgentAction] getHtmlChunksByRange → querying DB:', { url: url.substring(0, 80), start: s, end: e });
      const rows = await embeddingsStorage.fetchHTMLChunksByRange(url, s, e);
      debug.log(ts(), '[AgentAction] getHtmlChunksByRange → fetched:', rows.length);
      return { status: 'success', message: `Fetched ${rows.length} chunk(s)`, chunks: rows };
    } catch (err) {
      debug.error('[AgentAction] getHtmlChunksByRange error:', err);
      return { status: 'error', message: 'DB query failed' };
    }
  },
});

/**
 * Creates the getFormChunksByRange action
 * Fetches form chunks by group index range from the database
 */
export const createGetFormChunksByRangeAction = ({ currentPageContent, isLight }: DataRetrievalDependencies) => ({
  name: 'getFormChunksByRange',
  description: 'Fetch form chunks (groups) by group index range (inclusive).',
  parameters: [
    { name: 'start', type: 'number', description: 'Start group index (>=0)', required: true },
    { name: 'end', type: 'number', description: 'End group index (>=start)', required: true },
  ],
  render: ({ status, result, args }: any) => {
    const start = Number((args as any)?.start);
    const end = Number((args as any)?.end);
    const numChunks = status === 'complete' && result ? ((result as any)?.chunks?.length || 0) : 0;
    
    const formPaginationIcon = (
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
          <linearGradient id="formPaginationGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#10B981', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#06B6D4', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <path stroke="url(#formPaginationGradient)" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <path stroke="url(#formPaginationGradient)" d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
        <path stroke="url(#formPaginationGradient)" strokeWidth="1.5" d="M9 12h6M9 16h6" opacity="0.5" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName={`Form chunks ${start}–${end}`}
        status={status as any}
        isLight={isLight}
        icon={formPaginationIcon}
        messages={{
          pending: `Fetching form chunks ${start}–${end}`,
          inProgress: `Fetching form chunks ${start}–${end}`,
          complete: `Fetched ${numChunks} form chunk${numChunks !== 1 ? 's' : ''}`
        }}
      />
    );
  },
  handler: async ({ start, end }: { start: number; end: number }) => {
    const url = currentPageContent?.url || '';
    if (!url) return { status: 'error', message: 'No page URL' };
    const s = Math.max(0, Number(start));
    const e = Math.max(s, Number(end));
    try {
      debug.log(ts(), '[AgentAction] getFormChunksByRange → querying DB:', { url: url.substring(0, 80), start: s, end: e });
      const rows = await embeddingsStorage.fetchFormChunksByRange(url, s, e);
      debug.log(ts(), '[AgentAction] getFormChunksByRange → fetched:', rows.length);
      return { status: 'success', message: `Fetched ${rows.length} chunk(s)`, chunks: rows };
    } catch (err) {
      debug.error('[AgentAction] getFormChunksByRange error:', err);
      return { status: 'error', message: 'DB query failed' };
    }
  },
});

/**
 * Creates the getClickableChunksByRange action
 * Fetches clickable element chunks by group index range from the database
 */
export const createGetClickableChunksByRangeAction = ({ currentPageContent, isLight }: DataRetrievalDependencies) => ({
  name: 'getClickableChunksByRange',
  description: 'Fetch clickable chunks (groups) by group index range (inclusive).',
  parameters: [
    { name: 'start', type: 'number', description: 'Start group index (>=0)', required: true },
    { name: 'end', type: 'number', description: 'End group index (>=start)', required: true },
  ],
  render: ({ status, result, args }: any) => {
    const start = Number((args as any)?.start);
    const end = Number((args as any)?.end);
    const numChunks = status === 'complete' && result ? ((result as any)?.chunks?.length || 0) : 0;
    
    const clickablePaginationIcon = (
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
          <linearGradient id="clickablePaginationGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#F59E0B', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#EF4444', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <path stroke="url(#clickablePaginationGradient)" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path stroke="url(#clickablePaginationGradient)" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName={`Clickable chunks ${start}–${end}`}
        status={status as any}
        isLight={isLight}
        icon={clickablePaginationIcon}
        messages={{
          pending: `Fetching clickable chunks ${start}–${end}`,
          inProgress: `Fetching clickable chunks ${start}–${end}`,
          complete: `Fetched ${numChunks} clickable chunk${numChunks !== 1 ? 's' : ''}`
        }}
      />
    );
  },
  handler: async ({ start, end }: { start: number; end: number }) => {
    const url = currentPageContent?.url || '';
    if (!url) return { status: 'error', message: 'No page URL' };
    const s = Math.max(0, Number(start));
    const e = Math.max(s, Number(end));
    try {
      debug.log(ts(), '[AgentAction] getClickableChunksByRange → querying DB:', {
        url: url.substring(0, 80),
        start: s,
        end: e,
      });
      const rows = await embeddingsStorage.fetchClickableChunksByRange(url, s, e);
      debug.log(ts(), '[AgentAction] getClickableChunksByRange → fetched:', rows.length);
      return { status: 'success', message: `Fetched ${rows.length} chunk(s)`, chunks: rows };
    } catch (err) {
      debug.error('[AgentAction] getClickableChunksByRange error:', err);
      return { status: 'error', message: 'DB query failed' };
    }
  },
});

