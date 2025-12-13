/**
 * GraphStateCard Component
 *
 * Displays the execution state of a multi-agent graph with visual progress tracking.
 * Shows each step (WebSearch, ImageGeneration, etc.) with its status.
 * 
 * This is the main orchestrating component that composes:
 * - GraphDiagram: Shows the execution plan
 * - GraphStepItem: Renders individual steps with their details
 */

import type { FC } from 'react';
import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { 
  SpinningLoader, 
  CheckIcon, 
  ErrorIcon, 
  GraphIcon,
  WaitingIcon 
} from './icons';
import { GraphDiagram } from './GraphDiagram';
import { GraphStepItem } from './GraphStepItem';
import { InlineThinkingBlock } from './InlineThinkingBlock';
import { parseContentIntoSections } from './utils/thinking-parser';
import { formatCodeResultAsMarkdown, formatStepResultAsMarkdown } from './utils/format-helpers';
import { expandedStateCache, userClosedCache } from './utils/cache';
import type { GraphStateCardProps, GraphAgentState } from './types';

export const GraphStateCard: FC<GraphStateCardProps> = ({ 
  state, 
  isCollapsed = false, 
  sessionId, 
  instanceId 
}) => {
  const { isLight } = useStorage(themeStorage);
  
  // Generate a stable cache key from instanceId or fallback to sessionId + query
  const cacheKey = instanceId ?? `graph-${sessionId ?? 'default'}-${state.query?.slice(0, 50) ?? ''}`;
  
  // Initialize from cache if available
  const [isExpanded, setIsExpanded] = useState(() => {
    return expandedStateCache.get(cacheKey) ?? !isCollapsed;
  });
  
  // Initialize userClosed from cache
  const userClosedRef = useRef(userClosedCache.get(cacheKey) ?? false);
  
  // Sync expanded state to cache whenever it changes
  useEffect(() => {
    expandedStateCache.set(cacheKey, isExpanded);
  }, [cacheKey, isExpanded]);
  
  // Keep newly created cards open unless user manually closes them
  useEffect(() => {
    const isRunning = state.status === 'running' || state.status === 'waiting' || 
      state.steps.some(s => s.status === 'in_progress' || s.status === 'waiting');
    if (isRunning && !userClosedRef.current) {
      setIsExpanded(true);
    }
  }, [state.status, state.steps]);

  // Don't render if no steps
  if (!state?.steps || state.steps.length === 0) {
    return null;
  }

  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    // Track if user is closing a running or waiting card
    if (!newState && (state.status === 'running' || state.status === 'waiting' || 
        state.steps.some(s => s.status === 'in_progress' || s.status === 'waiting'))) {
      userClosedRef.current = true;
      userClosedCache.set(cacheKey, true);
    }
  };

  // Calculate progress - count steps by status
  const completedSteps = state.steps.filter(s => s.status === 'completed').length;
  const errorSteps = state.steps.filter(s => s.status === 'error').length;
  const inProgressSteps = state.steps.filter(s => s.status === 'in_progress').length;
  const pendingSteps = state.steps.filter(s => s.status === 'pending').length;
  const waitingSteps = state.steps.filter(s => s.status === 'waiting').length;
  const totalSteps = state.steps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Compute actual status - prefer backend state.status when available
  const computedStatus = useMemo(() => {
    // Prefer backend-provided status for 'waiting' and 'error' states
    if (state.status === 'waiting' || waitingSteps > 0) {
      return 'waiting';
    }
    if (state.status === 'error' || errorSteps > 0) {
      return 'error';
    }
    if (inProgressSteps > 0) {
      return 'running';
    }
    // Graph is done when no steps are pending, in_progress, or waiting
    if (pendingSteps === 0 && waitingSteps === 0 && totalSteps > 0) {
      return 'completed';
    }
    if (completedSteps > 0 || pendingSteps > 0) {
      return 'running';
    }
    // Fall back to backend status if available
    if (state.status && state.status !== 'pending') {
      return state.status;
    }
    return 'pending';
  }, [state.status, errorSteps, inProgressSteps, completedSteps, pendingSteps, waitingSteps, totalSteps]);

  // Status badge based on computed status
  const statusBadge = useMemo(() => {
    switch (computedStatus) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckIcon className="h-3 w-3" />
            Complete
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
            <SpinningLoader size="h-3 w-3" color="currentColor" />
            Running
          </span>
        );
      case 'waiting':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-300">
            <WaitingIcon className="h-3 w-3" />
            Waiting
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <ErrorIcon className="h-3 w-3" />
            Error
          </span>
        );
      default:
        return null;
    }
  }, [computedStatus]);

  return (
    <div
      className={`rounded-lg border ${
        isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]'
      } overflow-hidden shadow-sm`}
      data-graph-state="true"
      data-session-id={sessionId}
    >
      {/* Header */}
      <button
        onClick={toggleExpanded}
        className={`w-full flex items-center justify-between px-3 py-2 ${
          isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-700/50'
        } transition-colors`}
      >
        <div className="flex items-center gap-3">
          <GraphIcon className="h-5 w-5" color={isLight ? '#6b7280' : '#9ca3af'} />
          <div className="text-left">
            <h3 style={{ color: isLight ? '#374151' : '#d1d5db' }} className="font-medium">Multi-Agent Graph</h3>
            <p style={{ color: isLight ? '#374151' : '#d1d5db' }} className="text-xs opacity-75">
              Iteration {state.iteration}/{state.max_iterations} • {completedSteps}/{totalSteps} steps
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statusBadge}
          {/* Chevron */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: 'transform 0.2s ease-in-out',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              color: isLight ? '#6b7280' : '#9ca3af',
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>

      {/* Progress bar */}
      {isExpanded && (
        <div className={`h-1 ${isLight ? 'bg-gray-200/60' : 'bg-gray-700/40'}`}>
          <div
            className={`h-full transition-all duration-500 ${isLight ? 'bg-gray-300/80' : 'bg-gray-600/60'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Expanded content with animation */}
      <div
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
          maxHeight: isExpanded ? '5000px' : '0',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className={`px-4 py-3 ${isLight ? 'border-t border-gray-100' : 'border-t border-gray-700'}`}>
          {/* Graph Flow Diagram */}
          <GraphDiagram 
            isLight={isLight} 
            steps={state.steps}
            plannedSteps={state.planned_steps}
            mermaidDiagram={state.mermaid_diagram}
            isComplete={computedStatus === 'completed'} 
          />

          {/* Query */}
          {state.original_query && (
            <div className={`mb-3 p-3 rounded ${isLight ? 'bg-gray-50' : 'bg-[#1a2332]'}`}>
              <p style={{ color: isLight ? '#374151' : '#d1d5db' }} className="text-xs font-medium mb-1 opacity-75">Query</p>
              <div style={{ color: isLight ? '#374151' : '#d1d5db' }}>
                <CustomMarkdownRenderer content={state.original_query} isLight={isLight} />
              </div>
            </div>
          )}

          {/* Steps */}
          <div className="space-y-1">
            {state.steps.map((step, index) => (
              <GraphStepItem 
                key={`${step.node}-${index}`} 
                step={step} 
                isLight={isLight} 
                isLast={index === state.steps.length - 1} 
              />
            ))}
          </div>

          {/* Final result */}
          {computedStatus === 'completed' && state.final_result && (
            <FinalResult 
              result={state.final_result} 
              isLight={isLight} 
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Separate component for final result to keep main component clean
const FinalResult: FC<{ result: string; isLight: boolean }> = memo(({ result, isLight }) => {
  const sections = parseContentIntoSections(result);
  
  // Helper to format final result content
  const formatFinalContent = (content: string): string => {
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      let braceCount = 0;
      let jsonEndIndex = -1;
      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '{') braceCount++;
        else if (trimmed[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEndIndex = i;
            break;
          }
        }
      }
      
      if (jsonEndIndex > 0) {
        const jsonPart = trimmed.substring(0, jsonEndIndex + 1);
        const remainingText = trimmed.substring(jsonEndIndex + 1).trim();
        
        try {
          const parsed = JSON.parse(jsonPart);
          if (parsed.code !== undefined) {
            const formatted = formatCodeResultAsMarkdown(jsonPart);
            return remainingText ? `${formatted}\n\n${remainingText}` : formatted;
          }
        } catch {
          // Not valid JSON, fall through
        }
      }
    }
    return formatStepResultAsMarkdown(content);
  };
  
  return (
    <div className={`mt-3 p-3 rounded ${isLight ? 'bg-gray-50' : 'bg-[#1a2332]'}`}>
      <p className={`text-xs font-medium mb-2 ${isLight ? 'text-green-600' : 'text-green-400'}`}>Result</p>
      
      {sections.map((section, idx) => {
        if (section.type === 'thinking') {
          return (
            <div key={`final-thinking-${idx}`} className="mb-2">
              <InlineThinkingBlock 
                content={section.content} 
                isLight={isLight} 
                defaultOpen={false}
              />
            </div>
          );
        } else {
          const formattedContent = formatFinalContent(section.content);
          if (!formattedContent) return null;
          return (
            <div 
              key={`final-content-${idx}`}
              style={{ color: isLight ? '#374151' : '#d1d5db' }}
              className={`max-h-96 overflow-y-auto ${idx > 0 ? 'mt-2' : ''}`}
            >
              <CustomMarkdownRenderer content={formattedContent} isLight={isLight} />
            </div>
          );
        }
      })}
    </div>
  );
});

FinalResult.displayName = 'FinalResult';

export default GraphStateCard;

