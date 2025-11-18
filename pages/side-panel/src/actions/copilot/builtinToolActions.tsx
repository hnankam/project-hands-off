/**
 * Builtin Tool CopilotKit Actions
 * 
 * Render hooks for web_search, code_execution, and url_context builtin tools
 */

import React from 'react';
import { ActionStatus } from '../../components/ActionStatus';

interface BuiltinToolDependencies {
  isLight: boolean;
  clipText: (text: string, maxLength: number) => string;
}

/**
 * Creates the web_search render hook
 * Uses ActionStatus with a search icon
 */
export const createWebSearchRender = ({ isLight, clipText }: BuiltinToolDependencies) => ({
  name: 'web_search',
  render: ({ args, status, result, error }: any) => {
    const prompt = args?.prompt || '';
    const promptDisplay = prompt ? ` "${clipText(prompt, 60)}"` : '';
    
    // Globe icon for web search
    const searchIcon = (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ 
          flexShrink: 0, 
          marginRight: 6,
          color: isLight ? '#4b5563' : '#6b7280'
        }}
      >
        {/* Globe */}
        <circle stroke="currentColor" cx="12" cy="12" r="10" />
        <path stroke="currentColor" d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        <path stroke="currentColor" d="M2 12h20" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName="Web Search"
        status={status as any}
        isLight={isLight}
        icon={searchIcon}
        messages={{ 
          pending: `Starting web search${promptDisplay}…`, 
          inProgress: `Searching the web${promptDisplay}…`, 
          complete: `Web search complete${promptDisplay}`
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
});

/**
 * Creates the code_execution render hook
 * Uses ActionStatus with a code/terminal icon
 */
export const createCodeExecutionRender = ({ isLight, clipText }: BuiltinToolDependencies) => ({
  name: 'code_execution',
  render: ({ args, status, result, error }: any) => {
    const prompt = args?.prompt || '';
    const promptDisplay = prompt ? ` "${clipText(prompt, 60)}"` : '';
    
    // Code/terminal icon
    const codeIcon = (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ 
          flexShrink: 0, 
          marginRight: 6,
          color: isLight ? '#4b5563' : '#6b7280'
        }}
      >
        {/* Terminal window */}
        <rect stroke="currentColor" x="2" y="4" width="20" height="16" rx="2" />
        {/* Command prompt chevron */}
        <path stroke="currentColor" d="M6 10l4 4-4 4" />
        {/* Cursor line */}
        <line stroke="currentColor" x1="14" y1="14" x2="18" y2="14" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName="Code Execution"
        status={status as any}
        isLight={isLight}
        icon={codeIcon}
        messages={{ 
          pending: `Starting code execution${promptDisplay}…`, 
          inProgress: `Executing code${promptDisplay}…`, 
          complete: `Code execution complete${promptDisplay}`
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
});

/**
 * Creates the url_context render hook
 * Uses ActionStatus with a link/globe icon
 */
export const createUrlContextRender = ({ isLight, clipText }: BuiltinToolDependencies) => ({
  name: 'url_context',
  render: ({ args, status, result, error }: any) => {
    const urls = args?.urls || [];
    const urlCount = Array.isArray(urls) ? urls.length : 0;
    const urlDisplay = urlCount > 0 ? ` (${urlCount} URL${urlCount !== 1 ? 's' : ''})` : '';
    const firstUrl = urlCount > 0 ? ` - ${clipText(urls[0], 50)}` : '';
    
    // Link chain icon
    const linkIcon = (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ 
          flexShrink: 0, 
          marginRight: 6,
          color: isLight ? '#4b5563' : '#6b7280'
        }}
      >
        {/* Link chain icon */}
        <path stroke="currentColor" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path stroke="currentColor" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
    
    return (
      <ActionStatus
        toolName="Load URL Context"
        status={status as any}
        isLight={isLight}
        icon={linkIcon}
        messages={{ 
          pending: `Starting URL context load${urlDisplay}…`, 
          inProgress: `Loading URL context${urlDisplay}${firstUrl}…`, 
          complete: `URL context loaded${urlDisplay}`
        }}
        args={args}
        result={result}
        error={error}
      />
    );
  },
});

