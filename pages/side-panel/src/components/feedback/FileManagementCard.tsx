/**
 * Optimized File Management Card Component
 * 
 * Handles file creation and updates with large content without freezing the UI.
 * Matches ImageGalleryCard design with proper borders, background, shimmer, and accordion.
 * Supports progressive streaming rendering with auto-scroll (like GraphCard).
 */
import * as React from 'react';
import { useState, memo, useMemo, useEffect, useRef, useCallback, FC } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import untruncateJson from 'untruncate-json';
import { cn } from '@extension/ui';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { IncrementalMarkdownRenderer } from '../chat/IncrementalMarkdownRenderer';
import { CodeBlock } from '../chat/slots/CustomCodeBlock';
import type { ActionPhase } from './ActionStatus';
import { API_CONFIG } from '../../constants';

// ========== Auto-Scroll Component ==========

interface AutoScrollDivProps {
  content: string;
  isStreaming: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  threshold?: number;
}

/**
 * Auto-scrolling container that follows streaming content.
 * Same behavior as GraphCard - scrolls to bottom as content streams,
 * but respects user scrolling up.
 * Uses RAF-based smooth scrolling to prevent flickering.
 */
const AutoScrollDiv: FC<AutoScrollDivProps> = memo(({ 
  content, 
  isStreaming, 
  className = '', 
  style,
  children,
  threshold = 50 
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const lastContentLength = useRef(0);
  const isAutoScrolling = useRef(false);
  const wasStreamingRef = useRef(false);
  const prevScrollTopRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);

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
    
    // Only track user scroll during streaming
    if (!isStreaming) return;
    
    // Skip if this is an auto-scroll we triggered
    if (isAutoScrolling.current) return;

    const currentScrollTop = element.scrollTop;
    const prevScrollTop = prevScrollTopRef.current;
    const nearBottom = isNearBottom(element);
    
    // Detect scroll direction (5px threshold to avoid noise)
    const scrolledUp = currentScrollTop < prevScrollTop - 5;
    
    // Update previous scroll position
    prevScrollTopRef.current = currentScrollTop;
    
    // If user scrolled up and not near bottom, disable auto-scroll
    if (scrolledUp && !nearBottom) {
      isUserScrolledUp.current = true;
    }
    // If user is near bottom (regardless of scroll direction), re-enable auto-scroll
    else if (nearBottom) {
      isUserScrolledUp.current = false;
    }
  }, [isNearBottom, isStreaming]);

  // Scroll to bottom - instant during streaming for smooth following
  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    
    isAutoScrolling.current = true;
    // Use RAF to batch with render for smoother visual
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight - element.clientHeight;
      isAutoScrolling.current = false;
      scrollRafRef.current = null;
    });
  }, []);

  // Auto-scroll when content changes (if user hasn't scrolled up)
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const contentGrew = content.length > lastContentLength.current;
    lastContentLength.current = content.length;

    // Only auto-scroll if content grew AND user hasn't scrolled up AND we're streaming
    if (contentGrew && !isUserScrolledUp.current && isStreaming) {
      scrollToBottom();
    }
  }, [content, isStreaming, scrollToBottom]);

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
  
  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  return (
    <div 
      ref={scrollRef} 
      onScroll={handleScroll} 
      className={className}
      style={style}
    >
      {children}
    </div>
  );
});

AutoScrollDiv.displayName = 'AutoScrollDiv';

// ========== Cache Management ==========

// Persist expanded state across remounts (for Virtua virtualization)
const expandedStateCache: Map<string, boolean> = new Map();
// Track if user has manually closed a card (persists across remounts)
const userClosedCache: Map<string, boolean> = new Map();


export interface FileManagementCardProps {
  fileName: string;
  folder?: string;
  status?: ActionPhase;
  result?: any;
  error?: any;
  content?: string; // File content for preview (streaming)
  contentSize?: number; // Size of content in bytes
  instanceId?: string;
  fileId?: string; // File ID for fetching content from database
  operation?: 'create' | 'update'; // Type of operation
}

export const FileManagementCard: React.FC<FileManagementCardProps> = memo(({
  fileName,
  folder,
  status,
  result,
  error,
  content = '',
  contentSize = 0,
  instanceId,
  fileId,
  operation = 'create',
}) => {
  const { isLight } = useStorage(themeStorage);
  
  // Generate a stable cache key from instanceId or fallback to fileName
  const cacheKey = instanceId ?? `file-${fileName}`;
  
  // === File content fetching (from database) ===
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [isFetchingContent, setIsFetchingContent] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const hasAttemptedFetch = useRef(false);
  
  // === Performance optimization for streaming content ===
  // Track content length to detect new chunks, batch display updates with RAF
  const lastContentLengthRef = useRef(0);
  const rafPendingRef = useRef(false);
  const [displayContent, setDisplayContent] = useState(content);
  
  const isWorking = status === 'inProgress' || status === 'executing';
  
  // Batch content updates with requestAnimationFrame for smooth 60fps
  useEffect(() => {
    if (content.length > lastContentLengthRef.current) {
      lastContentLengthRef.current = content.length;
      
      if (!rafPendingRef.current) {
        rafPendingRef.current = true;
        requestAnimationFrame(() => {
          setDisplayContent(content);
          rafPendingRef.current = false;
        });
      }
    } else if (content.length < lastContentLengthRef.current) {
      // Content reset (new file) - update immediately
      lastContentLengthRef.current = content.length;
      setDisplayContent(content);
    }
  }, [content]);
  
  // Ensure final content is displayed when streaming completes
  useEffect(() => {
    if (status === 'complete') {
      setDisplayContent(content);
    }
  }, [status, content]);
  // === End performance optimization ===
  
  // Initialize from cache if available
  const [isExpanded, setIsExpanded] = useState(() => {
    return expandedStateCache.get(cacheKey) ?? false;
  });
  
  // Initialize userClosed from cache
  const userClosedRef = useRef(userClosedCache.get(cacheKey) ?? false);
  
  // Fetch file content from database when preview is shown and content is not available from streaming
  const fetchFileContent = useCallback(async () => {
    if (!fileId || isFetchingContent || hasAttemptedFetch.current) {
      return;
    }
    
    hasAttemptedFetch.current = true;
    setIsFetchingContent(true);
    setFetchError(null);
    
    try {
      const baseURL = API_CONFIG.BASE_URL;
      const response = await fetch(`${baseURL}/api/workspace/files/${fileId}/content`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file content: ${response.status}`);
      }
      
      const data = await response.json();
      setFetchedContent(data.content || '');
    } catch (err: any) {
      console.error('[FileManagementCard] Error fetching file content:', err);
      setFetchError(err.message || 'Failed to load content');
    } finally {
      setIsFetchingContent(false);
    }
  }, [fileId]); // Removed isFetchingContent from dependencies to avoid circular dependency
  
  // Trigger fetch when accordion is expanded (for completed files)
  useEffect(() => {
    if (isExpanded && !isWorking && fileId && !content && !fetchedContent && !isFetchingContent && !hasAttemptedFetch.current) {
      fetchFileContent();
    }
  }, [isExpanded, isWorking, fileId, content, fetchedContent, isFetchingContent, fetchFileContent]);
  
  // Sync expanded state to cache whenever it changes
  useEffect(() => {
    expandedStateCache.set(cacheKey, isExpanded);
  }, [cacheKey, isExpanded]);
  
  // Keep newly created cards open unless user manually closes them
  useEffect(() => {
    const isBeingCreated = status === 'inProgress' || status === 'executing';
    if (isBeingCreated && !userClosedRef.current) {
      setIsExpanded(true);
    }
  }, [status]);
  
  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    // Track if user is closing a card that's being created
    if (!newState && (status === 'inProgress' || status === 'executing')) {
      userClosedRef.current = true;
      userClosedCache.set(cacheKey, true);
    }
  };
  
  // Parse result for file info first to detect validation errors
  let fileInfo: { file_id?: string; file_path?: string; size_bytes?: number } = {};
  let validationError: { partial_data?: any; error_message?: string; raw_response?: string } | null = null;
  
  if (result && typeof result === 'string') {
    try {
      // Try normal JSON parse first
      fileInfo = JSON.parse(result);
    } catch (parseError) {
      
      // Store the failed response for debugging (without repair)
      validationError = {
        partial_data: {},
        error_message: `JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        raw_response: result,
      };
    }
  } else if (result && typeof result === 'object') {
    fileInfo = result;
  }
  
  // Note: isWorking is defined earlier in the performance optimization section
  // Treat validation errors as failures
  const isComplete = status === 'complete' && !validationError;
  const hasError = !!error || !!validationError;

  // Card styling matching ImageGalleryCard
  const cardBackground = isLight ? 'rgba(249, 250, 251, 0.5)' : 'rgba(21, 28, 36, 0.4)';
  const borderColor = isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.4)';
  const textColor = isLight ? '#1f2937' : '#f3f4f6';
  const mutedTextColor = isLight ? '#6b7280' : '#9ca3af';
  const chevronColor = isLight ? '#6b7280' : '#6b7280';
  const skeletonBase = isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.5)';
  const skeletonShimmer = isLight ? 'rgba(255, 255, 255, 0.5)' : 'rgba(75, 85, 99, 0.5)';

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // Detect file type from extension
  const getFileType = (filename: string): { language: string; isMarkdown: boolean } => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    
    // Markdown files
    if (['md', 'markdown'].includes(ext)) {
      return { language: 'markdown', isMarkdown: true };
    }
    
    // Code files with specific languages
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'rb': 'ruby',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'sql': 'sql',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'ps1': 'powershell',
      'dockerfile': 'dockerfile',
      'txt': 'text',
    };
    
    return { 
      language: languageMap[ext] || 'text', 
      isMarkdown: false 
    };
  };

  const fileType = useMemo(() => getFileType(fileName), [fileName]);
  const filePath = folder ? `${folder}/${fileName}` : fileName;
  
  // Determine final content to display with proper fallback chain and state messages
  const finalContent = (() => {
    // If fetching, show loading message
    if (isFetchingContent) {
      return '// Loading file content from database...\n\n// Please wait...';
    }
    
    // If fetch failed, show error message
    if (fetchError) {
      return `// Failed to load file content: ${fetchError}\n\n// The file was created successfully, but preview is unavailable.`;
    }
    
    // Use content hierarchy: streaming → fetched → validation error → empty
    return displayContent || fetchedContent || validationError?.partial_data?.content || '';
  })();
  
  // Operation-specific text
  const operationText = {
    create: {
      inProgress: 'Creating File',
      complete: 'File Created',
      failed: 'File Creation Failed',
      loadingMessage: 'Creating File...',
    },
    update: {
      inProgress: 'Updating File',
      complete: 'File Updated',
      failed: 'File Update Failed',
      loadingMessage: 'Updating File...',
    },
  }[operation];

  const displaySize = fileInfo.size_bytes || contentSize;

  // Render skeleton loading state
  if (isWorking) {
    return (
      <div
        className="rounded-lg border transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: cardBackground,
          borderColor: borderColor,
          marginTop: '0px',
          marginBottom: '6px',
        }}
      >
        {/* Skeleton Header - matches final rendering structure */}
        <div
          style={{
            width: '100%',
            padding: '6px',
            paddingRight: '0',
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {/* Chevron - pulsing */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                flexShrink: 0,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{ 
                  color: chevronColor,
                  opacity: 0.5,
                  animation: 'skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }}
              >
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            
            {/* File icon - pulsing */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                flexShrink: 0,
              }}
            >
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
                  color: isLight ? '#6b7280' : '#9ca3af',
                  opacity: 0.7,
                  animation: 'skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M12 18v-6" />
                <path d="M9 15h6" />
              </svg>
            </div>
            
            {/* Title with actual filename */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                overflow: 'hidden',
              }}
            >
              <span
                className="copilot-action-sparkle-text"
                style={{
                  fontSize: '12px',
                  fontWeight: 350,
                  color: textColor,
                  flexShrink: 0,
                }}
              >
                {operationText.inProgress}
              </span>
              <span style={{ color: mutedTextColor }}>|</span>
              <span
                className="gallery-prompt"
                style={{
                  fontSize: '10px',
                  fontWeight: 300,
                  backgroundColor: isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.5)',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span className={isWorking ? 'copilot-action-sparkle-text' : ''} style={{ color: mutedTextColor }}>
                  {filePath}
                </span>
              </span>
            </div>
            
            {/* File size - show if available */}
            {displaySize > 0 && (
              <div
                className="gallery-count"
                style={{
                  fontSize: '11px',
                  color: mutedTextColor,
                  paddingRight: '12px',
                  flexShrink: 0,
                }}
              >
                {formatSize(displaySize)} • {fileType.language}
              </div>
            )}
          </div>
        </div>

        {/* Skeleton Content - with streaming preview */}
        <div className="gallery-carousel" style={{ padding: '8px' }}>
          {/* If we have content, show it streaming; otherwise show shimmer */}
          {finalContent ? (
            <div
              style={{
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                overflow: 'hidden',
              }}
            >
              {/* Streaming content with auto-scroll and cursor */}
              {fileType.isMarkdown ? (
                <AutoScrollDiv
                  content={finalContent}
                  isStreaming={true}
                  style={{
                    maxHeight: 400,
                    overflow: 'auto',
                  }}
                >
                  <div className={cn('files-card-markdown', isLight ? '' : 'dark')}>
                    <CustomMarkdownRenderer 
                      content={finalContent} 
                      isLight={isLight} 
                      hideToolbars={true} 
                      className="markdown-content"
                    />
                  </div>
                  {/* Blinking bar cursor */}
                  <span
                    style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '14px',
                      marginLeft: '2px',
                      backgroundColor: isLight ? '#374151' : '#d1d5db',
                      animation: 'blink-cursor 1s step-end infinite',
                      verticalAlign: 'middle',
                    }}
                  />
                </AutoScrollDiv>
              ) : (
                <AutoScrollDiv
                  content={finalContent}
                  isStreaming={true}
                  style={{ 
                    maxHeight: 400, 
                    overflow: 'auto',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                  <CodeBlock 
                    language={fileType.language} 
                      code={finalContent} 
                    isLight={isLight} 
                    hideToolbar={true}
                  />
                    {/* Blinking bar cursor */}
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        right: '12px',
                        width: '6px',
                        height: '14px',
                        backgroundColor: isLight ? '#374151' : '#d1d5db',
                        animation: 'blink-cursor 1s step-end infinite',
                      }}
                    />
                  </div>
                </AutoScrollDiv>
              )}
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                height: '60px',
                borderRadius: '6px',
                backgroundColor: skeletonBase,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Shimmer effect */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: `linear-gradient(90deg, transparent, ${skeletonShimmer}, transparent)`,
                  animation: 'skeleton-shimmer 2s infinite',
                }}
              />
              {/* Loading text */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: mutedTextColor,
                  fontSize: '12px',
                  fontWeight: 300,
                }}
              >
                {operationText.loadingMessage}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Don't render if not complete and no error
  if (!isComplete && !hasError) {
    return null;
  }

  // File icon
  const fileIcon = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: hasError ? '#ef4444' : (isLight ? '#6b7280' : '#9ca3af') }}
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M12 18v-6" />
        <path d="M9 15h6" />
      </svg>
    </div>
  );

  return (
    <div
      className="rounded-lg border transition-all duration-300 ease-in-out"
      style={{
        backgroundColor: cardBackground,
        borderColor: hasError ? (isLight ? '#fecaca' : '#7f1d1d') : borderColor,
        marginTop: '0px',
        marginBottom: '6px',
      }}
    >
      {/* Header - Accordion Toggle */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: '6px',
          paddingRight: '0',
          backgroundColor: 'transparent',
          border: 'none',
          borderBottom: isExpanded ? `1px solid ${borderColor}` : 'none',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease, border-bottom 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isLight ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {/* Expand/Collapse Chevron */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
              height: '16px',
              flexShrink: 0,
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{ color: chevronColor }}
            >
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* File icon */}
          {fileIcon}

          {/* Title - single line */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 350,
                color: hasError ? '#ef4444' : textColor,
                flexShrink: 0,
              }}
            >
              {hasError ? operationText.failed : operationText.complete}
            </span>
            <span style={{ color: mutedTextColor }}>|</span>
            <span
              className="gallery-prompt"
              style={{
                fontSize: '10px',
                fontWeight: 300,
                color: mutedTextColor,
                backgroundColor: isLight ? 'rgba(229, 231, 235, 0.5)' : 'rgba(55, 65, 81, 0.5)',
                padding: '2px 6px',
                borderRadius: '6px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {filePath}
            </span>
          </div>

          {/* File size */}
          {displaySize > 0 && !hasError && (
            <div
              className="gallery-count"
              style={{
                fontSize: '11px',
                color: mutedTextColor,
                paddingRight: '12px',
                flexShrink: 0,
              }}
            >
              {formatSize(displaySize)} • {fileType.language}
            </div>
          )}
        </div>
      </button>

      {/* Content - Collapsible */}
      <div
        style={{
          maxHeight: isExpanded ? '1000px' : '0',
          opacity: isExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
        }}
      >
        <div className="gallery-content" style={{ padding: '8px' }}>
          {/* Validation Error - Incomplete JSON Arguments */}
          {validationError && (
            <div style={{ marginBottom: 8 }}>
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
              <div
                style={{
                  fontSize: 11,
                  color: '#ef4444',
                  padding: '8px',
                  backgroundColor: isLight ? '#fef2f2' : 'rgba(127, 29, 29, 0.3)',
                  borderRadius: 6,
                  borderLeft: '3px solid #ef4444',
                }}
              >
                <div style={{ marginBottom: 6 }}>
                  {validationError.error_message || 'AI response was incomplete. Could not create file.'}
                </div>
                
                {validationError.raw_response && (
                  <div style={{ marginTop: 12, fontSize: 10, opacity: 0.9 }}>
                    <strong>Incomplete AI response:</strong>
                    <div 
                      style={{ 
                        marginTop: 4, 
                        fontFamily: 'monospace',
                        padding: '8px',
                        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.3)',
                        borderRadius: 4,
                        border: `1px solid ${isLight ? '#fecaca' : 'rgba(239, 68, 68, 0.3)'}`,
                        maxHeight: '200px',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {validationError.raw_response}
                    </div>
                  </div>
                )}
                
                {validationError.partial_data && Object.keys(validationError.partial_data).length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 10, opacity: 0.8 }}>
                    <strong>Extracted fields:</strong>
                    <div style={{ marginTop: 4, fontFamily: 'monospace' }}>
                      {JSON.stringify(validationError.partial_data, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {hasError && !validationError && error && (
            <div style={{ marginBottom: 8 }}>
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
              <div
                style={{
                  fontSize: 11,
                  color: '#ef4444',
                  padding: '8px',
                  backgroundColor: isLight ? '#fef2f2' : 'rgba(127, 29, 29, 0.3)',
                  borderRadius: 6,
                  borderLeft: '3px solid #ef4444',
                }}
              >
                {typeof error === 'string' ? error : JSON.stringify(error)}
              </div>
            </div>
          )}

          {/* File Preview - Show when complete OR when validation error with extracted content OR when streaming OR when fileId is available for fetching */}
          {(finalContent || (fileId && !isWorking)) && (
            <div>
              {/* File content preview - always show when accordion is expanded */}
              <div
                style={{
                  marginTop: 0,
                  borderRadius: 6,
                  border: validationError ? '1px solid #ef4444' : `1px solid ${borderColor}`,
                  overflow: 'hidden',
                }}
              >
                {validationError && !isWorking && (
                  <div
                    style={{
                      padding: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#ef4444',
                      backgroundColor: isLight ? '#fef2f2' : 'rgba(127, 29, 29, 0.3)',
                      borderBottom: '1px solid #ef4444',
                    }}
                  >
                    ⚠️ This content was recovered from an incomplete AI response
                  </div>
                )}
                
                {/* Content with auto-scroll during streaming */}
                {/* Uses IncrementalMarkdownRenderer for O(1) per-update performance */}
                {fileType.isMarkdown ? (
                  <AutoScrollDiv
                    content={finalContent}
                    isStreaming={isWorking}
                    style={{
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    <div className={cn('files-card-markdown', isLight ? '' : 'dark')}>
                      <IncrementalMarkdownRenderer 
                        content={finalContent} 
                        isLight={isLight} 
                        isStreaming={isWorking}
                        hideToolbars={true} 
                        className="markdown-content"
                      />
                    </div>
                  </AutoScrollDiv>
                ) : (
                  <AutoScrollDiv
                    content={finalContent}
                    isStreaming={isWorking}
                    style={{ 
                      maxHeight: 400, 
                      overflow: 'auto',
                    }}
                  >
                    <CodeBlock 
                      language={fileType.language} 
                      code={finalContent} 
                      isLight={isLight} 
                      hideToolbar={true}
                    />
                  </AutoScrollDiv>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

FileManagementCard.displayName = 'FileManagementCard';

export default FileManagementCard;
