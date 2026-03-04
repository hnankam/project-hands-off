import * as React from 'react';
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { CodeBlock } from '../chat/slots/CustomCodeBlock';
import { API_CONFIG } from '../../constants';

// Add spin animation for loading indicator
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  if (!document.querySelector('style[data-action-status-animations]')) {
    style.setAttribute('data-action-status-animations', '');
    document.head.appendChild(style);
  }
}

/**
 * V2 API Status Values:
 * - 'inProgress' - Tool is being processed/streamed
 * - 'executing' - Tool is actively executing
 * - 'complete' - Tool finished successfully
 * - undefined - Initial state before processing starts
 */
export type ActionPhase = 'inProgress' | 'executing' | 'complete' | string | undefined;

export interface ActionStatusMessages {
  /** Message shown when status is undefined (before processing starts) */
  pending?: string;
  /** Message shown when status is 'inProgress' */
  inProgress?: string;
  /** Message shown when status is 'executing' (falls back to inProgress if absent) */
  executing?: string;
  /** Message shown when status is 'complete' */
  complete?: string;
}

// Persist expanded state across remounts (for Virtua virtualization)
const expandedStateCache: Map<string, boolean> = new Map();

export interface ActionStatusProps {
  toolName: string;
  status?: ActionPhase;
  messages?: ActionStatusMessages;
  className?: string;
  extra?: React.ReactNode; // optional trailing content (icons, counters, etc.)
  icon?: React.ReactNode; // optional custom icon (defaults to magic wand)
  args?: any; // input arguments to the tool
  result?: any; // output result from the tool
  error?: any; // error if tool failed
  instanceId?: string; // unique ID to persist expanded state across remounts
}

export const ActionStatus: React.FC<ActionStatusProps> = memo(({
  toolName,
  status,
  messages,
  className,
  extra,
  icon: customIcon,
  args,
  result,
  error,
  instanceId,
}) => {
  // Read theme directly from storage for live updates
  const { isLight } = useStorage(themeStorage);
  // Generate a stable cache key from instanceId or fallback to toolName + args hash
  const cacheKey = instanceId ?? `${toolName}-${JSON.stringify(args ?? {})}`;
  
  // Initialize from cache if available, otherwise default to false
  const [isExpanded, setIsExpanded] = useState(() => {
    return expandedStateCache.get(cacheKey) ?? false;
  });
  
  // Sync expanded state to cache whenever it changes
  useEffect(() => {
    expandedStateCache.set(cacheKey, isExpanded);
  }, [cacheKey, isExpanded]);
  const [isHovered, setIsHovered] = useState(false);
  const isWorking = status === 'inProgress' || status === 'executing';
  
  // Track if user manually closed the dropdown
  const userClosedRef = useRef(false);
  
  // Timer ref for delayed auto-collapse
  const autoCollapseTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Refs for auto-scrolling content sections (using HTMLElement to work with both div and pre)
  const inputScrollRef = useRef<HTMLElement>(null);
  const outputScrollRef = useRef<HTMLElement>(null);
  const errorScrollRef = useRef<HTMLElement>(null);
  
  // State for loading full truncated content
  const [fullContent, setFullContent] = useState<any>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Auto-expand when in progress or executing (unless user manually closed it)
  useEffect(() => {
    // Clear any pending auto-collapse timer when status changes
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
      autoCollapseTimerRef.current = null;
    }
    
    if (isWorking) {
      // Reset user control when a new action starts
      userClosedRef.current = false;
      setIsExpanded(true);
    } else if (status === 'complete' && !userClosedRef.current) {
      // Auto-collapse after 5 seconds when complete (unless user manually interacted)
      autoCollapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 5000);
    }
    
    // Cleanup timer on unmount
    return () => {
      if (autoCollapseTimerRef.current) {
        clearTimeout(autoCollapseTimerRef.current);
      }
    };
  }, [status, isWorking]);
  
  // Auto-scroll to bottom when content changes during active work
  useEffect(() => {
    if (!isWorking || !isExpanded) return;
    
    // Scroll all content sections to bottom
    [inputScrollRef, outputScrollRef, errorScrollRef].forEach(ref => {
      if (ref.current) {
        ref.current.scrollTo({
          top: ref.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    });
  }, [args, result, error, isWorking, isExpanded]);

  const defaultMessages: Required<ActionStatusMessages> = {
    pending: `Starting ${toolName}…`,
    inProgress: `${toolName} in progress…`,
    executing: `${toolName} executing…`,
    complete: `${toolName} complete`,
  } as const;

  // Select message based on V2 status:
  // - 'complete' → complete message
  // - 'executing' → executing message (fallback to inProgress)
  // - 'inProgress' → inProgress message (fallback to executing)
  // - undefined/other → pending message
  const getStatusMessage = (): string => {
    if (status === 'complete') {
      return messages?.complete ?? defaultMessages.complete;
    }
    if (status === 'executing') {
      return messages?.executing ?? messages?.inProgress ?? defaultMessages.executing;
    }
    if (status === 'inProgress') {
      return messages?.inProgress ?? messages?.executing ?? defaultMessages.inProgress;
    }
    // Pending or unknown status
    return messages?.pending ?? defaultMessages.pending;
  };

  const baseText = getStatusMessage();

  // Add contextual tool name so short phrases like "Search complete" read with meaning
  const text = `${baseText}`;

  // Icon color based on status and current theme
  // Disabled state (muted) when not complete, enabled state when complete
  const getIconColor = (): string => {
    if (status === 'complete') {
      // Enabled state - normal text color
      return isLight ? '#374151' : '#d1d5db'; // gray-700 for light, gray-300 for dark
    }
    // Disabled state - muted color for in-progress/pending
    return isLight ? '#9ca3af' : '#6b7280'; // gray-400 for light, gray-500 for dark
  };
  
  const iconColor = getIconColor();

  // Default icon: use a playful sparkle/magic wand icon for agent actions
  const defaultIcon = (
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
        color: iconColor,
      }}
    >
      {/* Magic wand with sparkles */}
      <path stroke="currentColor" d="M3 21l9-9" />
      <path stroke="currentColor" d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M12.2 6.2 11 5" />
    </svg>
  );

  // Wrap custom icon to apply theme-aware color (icons may have stale colors from creation time)
  const icon = customIcon ? (
    <span style={{ color: iconColor, display: 'inline-flex', alignItems: 'center' }}>
      {customIcon}
    </span>
  ) : defaultIcon;

  // Check if we have data to show in expanded view
  const hasExpandableData = args || result || error;
  
  // Toggle handler that tracks user manual close
  const handleToggle = useCallback(() => {
    if (!hasExpandableData) return;
    const newState = !isExpanded;
    setIsExpanded(newState);
    // Mark as user-controlled after any manual interaction
    userClosedRef.current = true;
    // Clear auto-collapse timer on manual interaction
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
      autoCollapseTimerRef.current = null;
    }
  }, [hasExpandableData, isExpanded]);

  // Chevron icon for expand/collapse (points right, rotates down when expanded)
  const chevronIcon = (
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
        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        opacity: isHovered ? 1 : 0,
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );

  // Check if content is truncated
  const isTruncated = useCallback((data: any): { isTruncated: boolean; metadata?: any } => {
    if (!data) return { isTruncated: false };
    
    // Check if data is a string that looks like truncated metadata JSON
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (trimmed.startsWith('{') && trimmed.includes('"truncated"')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.truncated === true && parsed.toolCallId && parsed.runId) {
            return { isTruncated: true, metadata: parsed };
          }
        } catch {
          // Not valid JSON, not truncated
        }
      }
    }
    
    // Check if data is already a parsed object with truncated flag
    if (typeof data === 'object' && data !== null && data.truncated === true) {
      if (data.toolCallId && data.runId) {
        return { isTruncated: true, metadata: data };
      }
    }
    
    return { isTruncated: false };
  }, []);
  
  // Load full content from backend
  const loadFullContent = useCallback(async (metadata: any) => {
    setIsLoadingContent(true);
    setLoadError(null);
    
    try {
      const { toolCallId, runId, eventType } = metadata;
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/runs/${runId}/tool-result/${toolCallId}?eventType=${eventType}`,
        {
          credentials: 'include',
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to load content: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.found && data.content !== undefined) {
        setFullContent(data.content);
      } else {
        throw new Error('Content not found in response');
      }
    } catch (error) {
      console.error('Error loading full content:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load content');
    } finally {
      setIsLoadingContent(false);
    }
  }, []);

  // Format data for display
  // isInput flag indicates this is input args (always show full JSON for args)
  const formatData = (data: any, isInput: boolean = false): { content: string; isMarkdown: boolean; language?: string } => {
    if (data === null || data === undefined) return { content: 'null', isMarkdown: false, language: 'text' };
    
    // If data is a string, check if it's JSON or markdown
    if (typeof data === 'string') {
      // Check if string is valid JSON (starts with { or [ and can be parsed)
      const trimmed = data.trim();
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 0) {
        try {
          JSON.parse(trimmed);
          // Valid JSON - format it nicely and render as code block
          return { content: JSON.stringify(JSON.parse(trimmed), null, 2), isMarkdown: false, language: 'json' };
        } catch {
          // Not valid JSON, treat as markdown
        }
      }
      // Not JSON, treat as markdown
      return { content: data, isMarkdown: true };
    }
    
    if (typeof data === 'number' || typeof data === 'boolean') return { content: String(data), isMarkdown: false, language: 'text' };
    
    // If data is an object, check for common markdown content fields (SKIP for input args)
    if (typeof data === 'object' && data !== null && !isInput) {
      // Check for common field names that contain markdown content
      const markdownFields = ['prompt', 'input', 'message', 'content', 'text', 'query', 'code', 'description'];
      
      for (const field of markdownFields) {
        if (field in data && typeof data[field] === 'string') {
          // Found a markdown field - render it as markdown
          return { content: data[field], isMarkdown: true };
        }
      }
    }
    
    try {
      // Object/array - render as JSON code block
      return { content: JSON.stringify(data, null, 2), isMarkdown: false, language: 'json' };
    } catch (e) {
      return { content: String(data), isMarkdown: false, language: 'text' };
    }
  };

  return (
    <div 
      className={`action-status ${isLight ? 'text-gray-600' : 'text-gray-500'}`}
      style={{ 
        fontSize: 12,
        maxWidth: '56rem',
        width: '100%',
        marginLeft: 'auto',
        marginRight: 'auto',
        // paddingLeft: 12,
        // paddingRight: 12,
      }}
    >
      {/* Header (always visible) */}
      <div
        style={{
          paddingTop: 0,
          paddingBottom: 6,
          display: 'flex',
          alignItems: 'center',
          cursor: hasExpandableData ? 'pointer' : 'default',
        }}
        onClick={handleToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {icon}
        <span className={isWorking ? 'copilot-action-sparkle-text' : undefined} style={{ flex: 1 }}>
          {text}
        </span>
        {extra ? <span style={{ marginLeft: 6 }}>{extra}</span> : null}
        {hasExpandableData && chevronIcon}
      </div>

      {/* Expanded content */}
      <div
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
          maxHeight: isExpanded && hasExpandableData ? '500px' : '0',
          opacity: isExpanded && hasExpandableData ? 1 : 0,
        }}
      >
        <div
          style={{
            paddingLeft: 8,
            paddingRight: 6,
            paddingBottom: 6,
            // borderLeft: `2px solid ${isLight ? '#e5e7eb' : '#374151'}`,
            marginLeft: 13,
            opacity: 0.8,
          }}
        >
          {/* Input Arguments */}
          {args && (() => {
            const { content, isMarkdown, language } = formatData(args, true);
            return (
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isLight ? '#6b7280' : '#9ca3af',
                    marginBottom: 4,
                  }}
                >
                  Input:
                </div>
                {isMarkdown ? (
                  <div
                    ref={inputScrollRef as any}
                    style={{
                      fontSize: 11,
                      overflow: 'auto',
                      maxHeight: 200,
                    }}
                  >
                    <CustomMarkdownRenderer content={content} isLight={isLight} hideToolbars={true} />
                  </div>
                ) : (
                  <div ref={inputScrollRef as any} style={{ maxHeight: 200, overflow: 'auto' }}>
                    <CodeBlock language={language || 'text'} code={content} isLight={isLight} hideToolbar={true} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Output Result */}
          {result && (() => {
            // Check if result is truncated
            const { isTruncated: resultIsTruncated, metadata } = isTruncated(result);
            
            // Use full content if loaded, otherwise use result
            const displayData = fullContent !== null ? fullContent : result;
            const { content, isMarkdown, language } = formatData(displayData, false);
            
            return (
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isLight ? '#6b7280' : '#9ca3af',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Output:</span>
                  {resultIsTruncated && fullContent === null && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        loadFullContent(metadata);
                      }}
                      disabled={isLoadingContent}
                      style={{
                        fontSize: 10,
                        padding: '2px 8px',
                        borderRadius: 4,
                        border: isLight ? '1px solid #d1d5db' : '1px solid #4b5563',
                        background: isLight ? '#ffffff' : '#1f2937',
                        color: isLight ? '#374151' : '#d1d5db',
                        cursor: isLoadingContent ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      onMouseEnter={(e) => {
                        if (!isLoadingContent) {
                          e.currentTarget.style.background = isLight ? '#f3f4f6' : '#374151';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isLight ? '#ffffff' : '#1f2937';
                      }}
                    >
                      {isLoadingContent ? (
                        <>
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            style={{ animation: 'spin 1s linear infinite' }}
                          >
                            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                            <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
                          </svg>
                          Loading...
                        </>
                      ) : (
                        <>
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          Load full content ({metadata?.originalLength?.toLocaleString()} chars)
                        </>
                      )}
                    </button>
                  )}
                  {fullContent !== null && (
                    <span style={{ fontSize: 10, color: isLight ? '#10b981' : '#34d399' }}>
                      ✓ Full content loaded
                    </span>
                  )}
                </div>
                {loadError && (
                  <div
                    style={{
                      fontSize: 10,
                      color: '#ef4444',
                      marginBottom: 4,
                      padding: 4,
                      background: isLight ? '#fee2e2' : '#7f1d1d',
                      borderRadius: 4,
                    }}
                  >
                    Error: {loadError}
                  </div>
                )}
                {isMarkdown ? (
                  <div
                    ref={outputScrollRef as any}
                    style={{
                      fontSize: 11,
                      overflow: 'auto',
                      maxHeight: 200,
                    }}
                  >
                    <CustomMarkdownRenderer content={content} isLight={isLight} hideToolbars={true} />
                  </div>
                ) : (
                  <div ref={outputScrollRef as any} style={{ maxHeight: 200, overflow: 'auto' }}>
                    <CodeBlock language={language || 'text'} code={content} isLight={isLight} hideToolbar={true} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Error */}
          {error && (() => {
            const { content, isMarkdown, language } = formatData(error, false);
            return (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#ef4444',
                    marginBottom: 4,
                  }}
                >
                  Error:
                </div>
                {isMarkdown ? (
                  <div
                    ref={errorScrollRef as any}
                    style={{
                      fontSize: 11,
                      overflow: 'auto',
                      maxHeight: 200,
                      borderLeft: '3px solid #ef4444',
                      paddingLeft: 8,
                    }}
                  >
                    <CustomMarkdownRenderer content={content} isLight={isLight} hideToolbars={true} />
                  </div>
                ) : (
                  <div 
                    ref={errorScrollRef as any} 
                    style={{ 
                      maxHeight: 200, 
                      overflow: 'auto',
                      borderLeft: '3px solid #ef4444',
                      paddingLeft: 8,
                    }}
                  >
                    <CodeBlock language={language || 'text'} code={content} isLight={isLight} hideToolbar={true} />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
});

ActionStatus.displayName = 'ActionStatus';

export default ActionStatus;
