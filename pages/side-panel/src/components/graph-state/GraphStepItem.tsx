/**
 * GraphStepItem Component
 * 
 * Renders a single step in the multi-agent graph execution.
 * Shows status, prompt, tool calls, streaming text, and results.
 */

import type { FC } from 'react';
import React, { useState, useMemo, useEffect, memo, useRef, useCallback } from 'react';
import { MarkdownRenderer } from '../tiptap/MarkdownRenderer';
import { 
  SpinningLoader, 
  CheckIcon, 
  ErrorIcon, 
  PendingIcon, 
  CancelledIcon,
  getNodeIcon 
} from './icons';
import { InlineThinkingBlock } from './InlineThinkingBlock';
import { ImageGallery } from './ImageGallery';
import { parseContentIntoSections } from './utils/thinking-parser';
import {
  extractImageUrls,
  removeImageMarkdown,
  formatToolArgsAsMarkdown,
  formatToolResultAsMarkdown,
  formatCodeResultAsMarkdown,
  formatStepResultAsMarkdown,
} from './utils/format-helpers';
import { stepResultExpandedCache, stepProcessExpandedCache } from './utils/cache';
import type { GraphStep } from './types';

// ========== Auto-Scroll Component ==========

/**
 * A scrollable div that auto-scrolls to bottom when content changes,
 * but respects user scroll position (pauses auto-scroll when user scrolls up)
 */
interface AutoScrollDivProps {
  content: string;
  isStreaming: boolean;
  className?: string;
  children: React.ReactNode;
  threshold?: number;
}

const AutoScrollDiv: FC<AutoScrollDivProps> = memo(({ 
  content, 
  isStreaming, 
  className = '', 
  children,
  threshold = 50 
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const lastContentLength = useRef(0);
  const isAutoScrolling = useRef(false);
  const wasStreamingRef = useRef(false);
  const prevScrollTopRef = useRef(0);

  // Check if user is near the bottom of the container
  const isNearBottom = useCallback((element: HTMLDivElement): boolean => {
    const { scrollTop, scrollHeight, clientHeight } = element;
    // Handle case where container isn't scrollable
    if (scrollHeight <= clientHeight) return true;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }, [threshold]);

  // Handle scroll events to detect user scrolling up by tracking scroll DIRECTION
  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    
    // Skip if this scroll was triggered by our auto-scroll
    if (isAutoScrolling.current) return;
    
    // Only track user scroll during streaming
    if (!isStreaming) return;

    const currentScrollTop = element.scrollTop;
    const prevScrollTop = prevScrollTopRef.current;
    const nearBottom = isNearBottom(element);
    
    // Detect scroll direction (5px threshold to avoid noise)
    const scrolledUp = currentScrollTop < prevScrollTop - 5;
    
    // Update previous scroll position
    prevScrollTopRef.current = currentScrollTop;
    
    // User actively scrolled UP - disable auto-scroll
    if (scrolledUp && !nearBottom) {
      isUserScrolledUp.current = true;
    }
    // User scrolled back to bottom - re-enable auto-scroll
    else if (nearBottom && isUserScrolledUp.current) {
      isUserScrolledUp.current = false;
    }
  }, [isNearBottom, isStreaming]);

  // Auto-scroll when content changes (if user hasn't scrolled up)
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const contentGrew = content.length > lastContentLength.current;
    lastContentLength.current = content.length;

    // Only auto-scroll if content grew AND user hasn't scrolled up AND we're streaming
    if (contentGrew && !isUserScrolledUp.current && isStreaming) {
      isAutoScrolling.current = true;
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth'
      });
      // Reset auto-scroll flag after scroll initiated
      setTimeout(() => {
        isAutoScrolling.current = false;
      }, 50);
    }
  }, [content, isStreaming]);

  // Reset scroll state only when a NEW streaming session starts
  // (transition from not streaming to streaming)
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    
    // Only reset on transition from false -> true (new streaming session)
    if (!wasStreaming && isStreaming) {
      isUserScrolledUp.current = false;
      lastContentLength.current = 0;
      prevScrollTopRef.current = 0;
    }
  }, [isStreaming]);

  return (
    <div 
      ref={scrollRef} 
      onScroll={handleScroll} 
      className={className}
    >
      {children}
    </div>
  );
});

AutoScrollDiv.displayName = 'AutoScrollDiv';

interface GraphStepItemProps {
  step: GraphStep;
  isLight: boolean;
  isLast: boolean;
}

export const GraphStepItem: FC<GraphStepItemProps> = memo(({ step, isLight, isLast }) => {
  // Create stable cache key based on step node and timestamp
  const stepCacheKey = `${step.node}-${step.timestamp || ''}`;
  
  // Initialize from cache or defaults
  const [isResultExpanded, setIsResultExpanded] = useState(() => {
    return stepResultExpandedCache.get(stepCacheKey) ?? true; // Default open
  });
  const [isProcessExpanded, setIsProcessExpanded] = useState(() => {
    return stepProcessExpandedCache.get(stepCacheKey) ?? false; // Default collapsed
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isProcessHovered, setIsProcessHovered] = useState(false);
  
  // Sync state changes to cache
  useEffect(() => {
    stepResultExpandedCache.set(stepCacheKey, isResultExpanded);
  }, [stepCacheKey, isResultExpanded]);
  
  useEffect(() => {
    stepProcessExpandedCache.set(stepCacheKey, isProcessExpanded);
  }, [stepCacheKey, isProcessExpanded]);
  
  // Check if we have meaningful process content to show
  const hasToolCalls = Boolean(step.tool_calls && step.tool_calls.length > 0);
  const isResultAggregator = step.node === 'ResultAggregator';
  const hasPrompt = !isResultAggregator && Boolean(step.prompt && step.prompt.trim().length > 0);
  const hasProcessContent = hasToolCalls;
  
  // Show process content when: in_progress (always show), or user has expanded it
  const showProcessBlock = step.status === 'in_progress' || isProcessExpanded;
  
  // Step icons are colored based on status
  const statusIcon = useMemo(() => {
    switch (step.status) {
      case 'completed':
        return <CheckIcon color={isLight ? '#22c55e' : '#4ade80'} />;
      case 'in_progress':
        return <SpinningLoader color={isLight ? '#6366f1' : '#818cf8'} />;
      case 'error':
        return <ErrorIcon color={isLight ? '#ef4444' : '#f87171'} />;
      case 'cancelled':
        return <CancelledIcon color={isLight ? '#9ca3af' : '#6b7280'} />;
      default:
        return <PendingIcon color={isLight ? '#9ca3af' : '#6b7280'} />;
    }
  }, [step.status, isLight]);

  // Node text is always gray - only the check icon shows status color
  const textColor = isLight ? 'text-gray-700' : 'text-gray-300';

  const bgColor = useMemo(() => {
    if (step.status === 'in_progress') {
      return isLight ? 'bg-indigo-50' : 'bg-indigo-900/20';
    }
    return '';
  }, [step.status, isLight]);

  // Show content section if we have result OR streaming_text
  const hasResult = Boolean(step.result?.trim() || step.streaming_text?.trim());

  return (
    <div className={`relative flex items-start gap-3 py-2 px-3 rounded-lg transition-colors duration-200 ${bgColor}`}>
      {/* Vertical connector line */}
      {!isLast && (
        <div
          className={`absolute w-0.5 ${isLight ? 'bg-gray-200' : 'bg-gray-700'}`}
          style={{ 
            left: 'calc(0.75rem + 8px)',
            top: '2rem',
            height: 'calc(100% - 1.5rem)' 
          }}
        />
      )}

      {/* Status icon */}
      <div className="relative z-10 flex-shrink-0">{statusIcon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div 
          className={`flex items-center gap-2 ${(hasResult || hasPrompt || hasProcessContent) ? 'cursor-pointer' : ''}`}
          onClick={() => (hasResult || hasPrompt || hasProcessContent) && setIsResultExpanded(!isResultExpanded)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <span className="flex-shrink-0" style={{ color: isLight ? '#6b7280' : '#9ca3af' }}>
            {getNodeIcon(step.node, 'h-4 w-4')}
          </span>
          <span className={`font-medium ${textColor}`}>{step.node}</span>
          {step.status === 'in_progress' && (
            <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>Processing...</span>
          )}
          {/* Expand/collapse chevron */}
          {(hasResult || hasPrompt || hasProcessContent) && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-auto"
              style={{
                transition: 'transform 0.2s ease-in-out, opacity 0.2s ease-in-out',
                transform: isResultExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                opacity: isHovered ? 1 : 0.5,
                color: isLight ? '#6b7280' : '#9ca3af',
              }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </div>
        
        {/* Result accordion - contains prompt, process block, and result content */}
        <div
          style={{
            overflow: 'hidden',
            transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
            maxHeight: (hasResult || hasPrompt || hasProcessContent) && isResultExpanded ? '2000px' : '0',
            opacity: (hasResult || hasPrompt || hasProcessContent) && isResultExpanded ? 1 : 0,
          }}
        >
          {/* Prompt sent to sub-agent */}
          {hasPrompt && (
            <div className={`mt-2 p-2.5 rounded-md ${isLight ? 'bg-slate-50' : 'bg-slate-800/50'}`}>
              <p className={`text-xs font-medium mb-1.5 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>Prompt</p>
              <div className={`max-h-32 overflow-y-auto text-sm ${isLight ? 'text-gray-700' : 'text-gray-200'}`}>
                <MarkdownRenderer content={step.prompt || ''} isLight={isLight} />
              </div>
            </div>
          )}
          
          {/* First thought block - render before Process block if both exist */}
          {hasProcessContent && (() => {
            const primarySource = step.streaming_text?.trim() || step.result?.trim() || '';
            const rawTextContent = removeImageMarkdown(primarySource);
            const sections = parseContentIntoSections(rawTextContent);
            const firstThinking = sections.find(s => s.type === 'thinking');
            
            if (firstThinking) {
              return (
                <InlineThinkingBlock 
                  content={firstThinking.content} 
                  isLight={isLight} 
                  defaultOpen={step.status !== 'completed'}
                  isComplete={step.status === 'completed'}
                />
              );
            }
            return null;
          })()}
          
          {/* Process Block - shows tool calls */}
          {hasProcessContent && (
            <div className={`mt-2 rounded-md ${isLight ? 'bg-slate-50/80' : 'bg-slate-800/30'}`}>
              {/* Process block header */}
              <div 
                className={`flex items-center gap-1.5 cursor-pointer py-1.5 px-2 text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'} rounded-md`}
                onClick={() => setIsProcessExpanded(!isProcessExpanded)}
                onMouseEnter={() => setIsProcessHovered(true)}
                onMouseLeave={() => setIsProcessHovered(false)}
              >
                {/* Clock icon */}
                <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span style={{ flex: 1 }}>Process {step.tool_calls?.length ? `(${step.tool_calls.length} tool${step.tool_calls.length > 1 ? 's' : ''})` : ''}</span>
                {/* Chevron icon */}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    marginLeft: 6,
                    transition: 'transform 0.2s ease-in-out, opacity 0.2s ease-in-out',
                    transform: showProcessBlock ? 'rotate(90deg)' : 'rotate(0deg)',
                    opacity: isProcessHovered ? 1 : 0,
                  }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              
              {/* Process content - animated expand/collapse */}
              <div
                style={{
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
                  maxHeight: showProcessBlock ? '2000px' : '0',
                  opacity: showProcessBlock ? 1 : 0,
                }}
              >
                <div className="px-2 pb-2">
                  {/* Tool calls made during this step */}
                  {step.tool_calls && step.tool_calls.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {step.tool_calls.map((tc, idx) => (
                        <div 
                          key={idx} 
                          className={`rounded-md p-2.5 text-xs ${isLight ? 'bg-white border border-slate-200 shadow-sm' : 'bg-slate-900/50 border border-slate-700'}`}
                        >
                          <div className="flex items-center gap-2">
                            {/* Tool icon */}
                            <svg className={`h-3.5 w-3.5 flex-shrink-0 ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                            </svg>
                            <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                              {tc.tool_name}
                            </span>
                            {/* Status indicator */}
                            {tc.status === 'in_progress' && (
                              <SpinningLoader size="h-3 w-3" color={isLight ? '#6366f1' : '#818cf8'} />
                            )}
                            {tc.status === 'completed' && (
                              <CheckIcon className="h-3 w-3" color="#22c55e" />
                            )}
                            {tc.status === 'error' && (
                              <ErrorIcon className="h-3 w-3" color="#ef4444" />
                            )}
                          </div>
                          {/* Tool Input (arguments) */}
                          {tc.args && (
                            <AutoScrollDiv 
                              content={tc.args}
                              isStreaming={tc.status === 'in_progress'}
                              className={`mt-2 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'} max-h-48 overflow-y-auto`}
                            >
                              <MarkdownRenderer 
                                content={formatToolArgsAsMarkdown(tc.tool_name, tc.args)} 
                                isLight={isLight} 
                              />
                            </AutoScrollDiv>
                          )}
                          {/* Tool Output (result) */}
                          {tc.result && (
                            <div className={`mt-2 rounded ${tc.status === 'error' ? (isLight ? 'bg-red-50' : 'bg-red-900/20') : (isLight ? 'bg-green-50' : 'bg-green-900/20')} p-2`}>
                              <div className={`text-[10px] uppercase tracking-wider font-medium mb-1 ${tc.status === 'error' ? (isLight ? 'text-red-600' : 'text-red-400') : (isLight ? 'text-green-600' : 'text-green-400')}`}>
                                {tc.status === 'error' ? 'Error' : 'Output'}
                              </div>
                              <AutoScrollDiv 
                                content={tc.result}
                                isStreaming={tc.status === 'in_progress'}
                                className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'} max-h-60 overflow-y-auto`}
                              >
                                <MarkdownRenderer content={formatToolResultAsMarkdown(tc.tool_name, tc.result)} isLight={isLight} />
                              </AutoScrollDiv>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Streaming cursor when in progress */}
                  {step.status === 'in_progress' && !step.result && step.streaming_text && (
                    <div className="mt-2">
                      <span className={`inline-block w-2 h-4 bg-current animate-pulse ${isLight ? 'text-gray-400' : 'text-gray-500'}`} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Result content */}
          {hasResult && <ResultContent step={step} isLight={isLight} hasProcessContent={hasProcessContent} />}
        </div>
      </div>
    </div>
  );
});

GraphStepItem.displayName = 'GraphStepItem';

// Separate component for result content to keep GraphStepItem cleaner
const ResultContent: FC<{ step: GraphStep; isLight: boolean; hasProcessContent: boolean }> = memo(({ step, isLight, hasProcessContent }) => {
  // Combine streaming_text and result
  const streamingText = step.streaming_text?.trim() || '';
  const resultText = step.result?.trim() || '';
  
  // Extract images from both sources
  const streamingImages = extractImageUrls(streamingText);
  const resultImages = extractImageUrls(resultText);
  const imageUrls = resultImages.length > 0 ? resultImages : streamingImages;
  
  // Build combined text content
  const streamingContent = removeImageMarkdown(streamingText);
  const resultContent = removeImageMarkdown(resultText);
  
  let rawTextContent = streamingContent;
  
  // Check if result has unique content not in streaming
  const resultIsUnique = resultContent && (
    !streamingContent || 
    !streamingContent.includes(resultContent.slice(0, Math.min(100, resultContent.length)))
  );
  
  if (resultIsUnique) {
    rawTextContent = streamingContent 
      ? `${streamingContent}\n\n${resultContent}` 
      : resultContent;
  }
  
  // Parse content into ordered sections
  const allSections = parseContentIntoSections(rawTextContent);
  
  // If there's a Process block, skip the first thinking section (already rendered before Process)
  const sections = hasProcessContent 
    ? (() => {
        let skippedFirst = false;
        return allSections.filter(s => {
          if (!skippedFirst && s.type === 'thinking') {
            skippedFirst = true;
            return false;
          }
          return true;
        });
      })()
    : allSections;
  
  // Helper to extract JSON from markdown code blocks
  const extractJsonFromMarkdown = (text: string): { json: string; remaining: string } | null => {
    // Match ```json ... ``` or ``` ... ``` code blocks containing JSON
    const codeBlockMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)```(.*)$/s);
    if (codeBlockMatch) {
      const inner = codeBlockMatch[1].trim();
      const remaining = codeBlockMatch[2].trim();
      if (inner.startsWith('{') || inner.startsWith('[')) {
        return { json: inner, remaining };
      }
    }
    return null;
  };

  // Helper to extract raw JSON object from text
  const extractJsonObject = (text: string): { json: string; remaining: string } | null => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) return null;
    
    // Find matching closing brace
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
      return {
        json: trimmed.substring(0, jsonEndIndex + 1),
        remaining: trimmed.substring(jsonEndIndex + 1).trim()
      };
    }
    return null;
  };

  // Helper to format a content section
  const formatContentSection = (content: string): string => {
    if (step.node === 'CodeExecution') {
      const trimmed = content.trim();
      
      // Try to extract JSON from markdown code block first
      let extracted = extractJsonFromMarkdown(trimmed);
      
      // If not in code block, try raw JSON
      if (!extracted) {
        extracted = extractJsonObject(trimmed);
      }
      
      if (extracted) {
        try {
          const parsed = JSON.parse(extracted.json);
          if (parsed.code !== undefined) {
            // If tool calls are present, they already show the code/output
            if (step.tool_calls && step.tool_calls.length > 0) {
              return extracted.remaining || '';
            }
            const formatted = formatCodeResultAsMarkdown(extracted.json);
            return extracted.remaining ? `${formatted}\n\n${extracted.remaining}` : formatted;
          }
        } catch {
          // Not valid JSON, fall through
        }
      }
    }
    return formatStepResultAsMarkdown(content);
  };
  
  const isComplete = step.status === 'completed';
  
  // Find first thinking section (to render before images)
  const firstThinkingIdx = sections.findIndex(s => s.type === 'thinking');
  const firstThinking = firstThinkingIdx >= 0 ? sections[firstThinkingIdx] : null;
  const hasImages = imageUrls.length > 0;
  
  // Sections to render after first thinking and images
  const remainingSections = firstThinking && hasImages
    ? sections.filter((_, idx) => idx !== firstThinkingIdx)
    : sections;
  
  return (
    <div className="mt-2">
      {/* First thinking block - render before images if both exist */}
      {firstThinking && hasImages && (
        <InlineThinkingBlock 
          content={firstThinking.content} 
          isLight={isLight} 
          defaultOpen={!isComplete}
          isComplete={isComplete}
        />
      )}
      
      {/* Image Gallery */}
      {hasImages && (
        <ImageGallery urls={imageUrls} isLight={isLight} />
      )}
      
      {/* Render remaining sections in order */}
      {remainingSections.map((section, idx) => {
        if (section.type === 'thinking') {
          return (
            <InlineThinkingBlock 
              key={`thinking-${idx}`}
              content={section.content} 
              isLight={isLight} 
              defaultOpen={!isComplete}
              isComplete={isComplete}
            />
          );
        } else {
          const formattedContent = formatContentSection(section.content);
          if (!formattedContent) return null;
          return (
            <AutoScrollDiv 
              key={`content-${idx}`}
              content={formattedContent}
              isStreaming={step.status === 'in_progress'}
              className={`max-h-64 overflow-y-auto text-sm ${isLight ? 'text-gray-600' : 'text-gray-300'} ${idx > 0 ? 'mt-2' : ''}`}
            >
              <MarkdownRenderer content={formattedContent} isLight={isLight} />
            </AutoScrollDiv>
          );
        }
      })}
    </div>
  );
});

ResultContent.displayName = 'ResultContent';

