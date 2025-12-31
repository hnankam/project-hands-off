/**
 * Optimized File Management Card Component
 * 
 * Handles file creation and updates with large content without freezing the UI.
 * Matches ImageGalleryCard design with proper borders, background, shimmer, and accordion.
 * Supports progressive streaming rendering with auto-scroll (like GraphCard).
 */
import React, { useState, memo, useMemo, useEffect, useRef, useCallback, FC } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import untruncateJson from 'untruncate-json';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { CodeBlock } from '../chat/slots/CustomCodeBlock';
import type { ActionPhase } from './ActionStatus';

// JSON repair utility - uses untruncate-json to fix truncated JSON, then parses
// TEMPORARILY COMMENTED OUT TO SEE RAW RESPONSE
// const repairAndParseJson = (jsonString: string): any => {
//   console.log('[FileManagementCard] 🔧 INPUT:', {
//     length: jsonString.length,
//     preview: jsonString.substring(0, 200),
//   });
//   
//   try {
//     const fixed = untruncateJson(jsonString);
//     console.log('[FileManagementCard] 🔧 FIXED JSON:', {
//       originalLength: jsonString.length,
//       fixedLength: fixed.length,
//       wasModified: fixed !== jsonString,
//       fixedPreview: fixed.substring(0, 200),
//     });
//     
//     const parsed = JSON.parse(fixed);
//     console.log('[FileManagementCard] ✅ PARSED OUTPUT:', {
//       keys: Object.keys(parsed),
//       data: parsed,
//     });
//     return parsed;
//   } catch (error) {
//     console.error('[FileManagementCard] ❌ REPAIR FAILED:', error);
//     return null;
//   }
// };

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
    else if (nearBottom) {
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
  content?: string; // File content for preview
  contentSize?: number; // Size of content in bytes
  instanceId?: string;
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
  operation = 'create',
}) => {
  const { isLight } = useStorage(themeStorage);
  
  // Generate a stable cache key from instanceId or fallback to fileName
  const cacheKey = instanceId ?? `file-${fileName}`;
  
  // Initialize from cache if available
  const [isExpanded, setIsExpanded] = useState(() => {
    return expandedStateCache.get(cacheKey) ?? false;
  });
  
  const [showPreview, setShowPreview] = useState(false);
  
  // Initialize userClosed from cache
  const userClosedRef = useRef(userClosedCache.get(cacheKey) ?? false);
  
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
      // JSON parsing failed - TEMPORARILY NOT REPAIRING TO SEE RAW RESPONSE
      
      // TEMPORARILY COMMENTED OUT: Repair logic to see raw response
      // try {
      //   // Attempt to repair the JSON using untruncate-json
      //   console.log('[FileManagementCard] 🔧 Attempting JSON repair with untruncate-json...');
      //   const repairedData = repairAndParseJson(result);
      //   
      //   if (repairedData) {
      //     console.log('[FileManagementCard] ✅ Successfully repaired incomplete JSON:', {
      //       fields: Object.keys(repairedData),
      //       data: repairedData,
      //     });
      //     
      //     validationError = {
      //       partial_data: repairedData,
      //       error_message: 'AI response was incomplete but recovered. File information extracted and displayed below.',
      //       raw_response: result, // Store the incomplete response
      //     };
      //     
      //     // Use repaired data
      //     fileInfo = {
      //       ...repairedData,
      //       _incomplete: true,
      //     };
      //   } else {
      //     console.log('[FileManagementCard] ❌ Repair failed, response may not be JSON');
      //     
      //     // Store the failed response for debugging
      //     validationError = {
      //       partial_data: {},
      //       error_message: 'Could not parse AI response. The response may be incomplete or malformed.',
      //       raw_response: result,
      //     };
      //   }
      // } catch (repairError) {
      //   console.error('[FileManagementCard] 💥 Error during JSON repair:', repairError);
      //   
      //   validationError = {
      //     partial_data: {},
      //     error_message: 'Failed to parse or repair AI response.',
      //     raw_response: result,
      //   };
      // }
      
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
  
  const isWorking = status === 'inProgress' || status === 'executing';
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
  
  // Use extracted content from validation error if available
  const displayContent = content || validationError?.partial_data?.content || '';
  
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
                  {fileName}
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
                {formatSize(displaySize)}
              </div>
            )}
          </div>
        </div>

        {/* Skeleton Content - with streaming preview */}
        <div className="gallery-carousel" style={{ padding: '8px' }}>
          {/* If we have content, show it streaming; otherwise show shimmer */}
          {displayContent ? (
            <div
              style={{
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                overflow: 'hidden',
              }}
            >
              {/* Writing indicator */}
              <div
                style={{
                  padding: 6,
                  fontSize: 10,
                  fontWeight: 600,
                  backgroundColor: isLight ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.2)',
                  borderBottom: `1px solid ${borderColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span className="copilot-action-sparkle-text" style={{ color: textColor }}>✨ Writing File</span>
                <span className="gallery-count" style={{ marginLeft: 'auto', opacity: 0.7, color: textColor }}>
                  {formatSize(displayContent.length)} • {fileType.language}
                </span>
              </div>
              
              {/* Streaming content with auto-scroll */}
              {fileType.isMarkdown ? (
                <AutoScrollDiv
                  content={displayContent}
                  isStreaming={true}
                  style={{
                    padding: 12,
                    maxHeight: 400,
                    overflow: 'auto',
                    backgroundColor: isLight ? 'rgba(255, 255, 255, 0.5)' : 'rgba(13, 17, 23, 0.5)',
                  }}
                >
                  <CustomMarkdownRenderer content={displayContent} isLight={isLight} />
                </AutoScrollDiv>
              ) : (
                <AutoScrollDiv
                  content={displayContent}
                  isStreaming={true}
                  style={{ 
                    maxHeight: 400, 
                    overflow: 'auto',
                  }}
                >
                  <CodeBlock 
                    language={fileType.language} 
                    code={displayContent} 
                    isLight={isLight} 
                  />
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
              {fileName}
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
              {formatSize(displaySize)}
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
        <div className="gallery-carousel" style={{ padding: '8px' }}>
          {/* File path */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: mutedTextColor,
                marginBottom: 4,
              }}
            >
              Location:
            </div>
            <div
              style={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: textColor,
                padding: '6px 8px',
                backgroundColor: isLight ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.2)',
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                wordBreak: 'break-all',
              }}
            >
              {filePath}
            </div>
          </div>

          {/* File ID (if available) */}
          {fileInfo.file_id && !hasError && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: mutedTextColor,
                  marginBottom: 4,
                }}
              >
                File ID:
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: mutedTextColor,
                  wordBreak: 'break-all',
                }}
              >
                {fileInfo.file_id}
              </div>
            </div>
          )}

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

          {/* File Preview - Show when complete OR when validation error with extracted content OR when streaming */}
          {displayContent && (
            <div>
              {/* Only show toggle button when not streaming (during streaming, always show preview) */}
              {!isWorking && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPreview(!showPreview);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: validationError ? '#ef4444' : textColor,
                    backgroundColor: validationError ? 
                      (isLight ? 'rgba(254, 242, 242, 0.8)' : 'rgba(127, 29, 29, 0.3)') : 
                      (isLight ? 'rgba(243, 244, 246, 0.8)' : 'rgba(55, 65, 81, 0.8)'),
                    border: validationError ? '1px solid #ef4444' : `1px solid ${borderColor}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    width: '100%',
                    marginBottom: showPreview ? 8 : 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = validationError ?
                      (isLight ? 'rgba(254, 226, 226, 0.8)' : 'rgba(153, 27, 27, 0.3)') :
                      (isLight ? 'rgba(229, 231, 235, 0.8)' : 'rgba(75, 85, 99, 0.8)');
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = validationError ?
                      (isLight ? 'rgba(254, 242, 242, 0.8)' : 'rgba(127, 29, 29, 0.3)') :
                      (isLight ? 'rgba(243, 244, 246, 0.8)' : 'rgba(55, 65, 81, 0.8)');
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      transition: 'transform 0.2s ease',
                      transform: showPreview ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="gallery-prompt">{showPreview ? 'Hide' : 'Show'} {validationError ? 'Recovered' : ''} Content Preview</span>
                  <span className="gallery-count" style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>
                    {formatSize(displayContent.length)} • {fileType.language}
                  </span>
                </button>
              )}

              {/* File content preview - always show during streaming, or when showPreview is true */}
              {(isWorking || showPreview) && (
                <div
                  style={{
                    marginTop: isWorking ? 0 : 0,
                    borderRadius: 6,
                    border: validationError ? '1px solid #ef4444' : `1px solid ${borderColor}`,
                    overflow: 'hidden',
                  }}
                >
                  {/* Writing indicator */}
                  {isWorking && (
                    <div
                      style={{
                        padding: 6,
                        fontSize: 10,
                        fontWeight: 600,
                        backgroundColor: isLight ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.2)',
                        borderBottom: `1px solid ${borderColor}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span className="copilot-action-sparkle-text" style={{ color: textColor }}>✨ Writing File</span>
                      <span className="gallery-count" style={{ marginLeft: 'auto', opacity: 0.7, color: textColor }}>
                        {formatSize(displayContent.length)} • {fileType.language}
                      </span>
                    </div>
                  )}
                  
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
                  {fileType.isMarkdown ? (
                    <AutoScrollDiv
                      content={displayContent}
                      isStreaming={isWorking}
                      style={{
                        padding: 12,
                        maxHeight: 400,
                        overflow: 'auto',
                        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.5)' : 'rgba(13, 17, 23, 0.5)',
                      }}
                    >
                      <CustomMarkdownRenderer content={displayContent} isLight={isLight} />
                    </AutoScrollDiv>
                  ) : (
                    <AutoScrollDiv
                      content={displayContent}
                      isStreaming={isWorking}
                      style={{ 
                        maxHeight: 400, 
                        overflow: 'auto',
                      }}
                    >
                      <CodeBlock 
                        language={fileType.language} 
                        code={displayContent} 
                        isLight={isLight} 
                      />
                    </AutoScrollDiv>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

FileManagementCard.displayName = 'FileManagementCard';

export default FileManagementCard;
