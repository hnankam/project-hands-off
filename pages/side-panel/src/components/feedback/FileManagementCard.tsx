/**
 * Optimized File Management Card Component
 * 
 * Handles file creation and updates with large content without freezing the UI.
 * Matches ImageGalleryCard design with proper borders, background, shimmer, and accordion.
 */
import React, { useState, memo, useMemo, useEffect, useRef } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';
import { CodeBlock } from '../chat/slots/CustomCodeBlock';
import type { ActionPhase } from './ActionStatus';

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
  
  const isWorking = status === 'inProgress' || status === 'executing';
  const isComplete = status === 'complete';
  const hasError = !!error;

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

  // Parse result for file info
  let fileInfo: { file_id?: string; file_path?: string; size_bytes?: number } = {};
  if (result && typeof result === 'string') {
    try {
      fileInfo = JSON.parse(result);
    } catch {
      // Result is not JSON
    }
  } else if (result && typeof result === 'object') {
    fileInfo = result;
  }

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
            
            {/* File size - show if available */}
            {displaySize > 0 && (
              <div
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

        {/* Skeleton Content - shimmer animation */}
        <div style={{ padding: '8px' }}>
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
        </div>
      </div>
    );
  }

  // Don't render if not complete and no error
  if (!isComplete && !hasError) return null;

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
        <div style={{ padding: '8px' }}>
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

          {/* Error message */}
          {hasError && (
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

          {/* File Preview - Only show when complete and content is available */}
          {isComplete && !hasError && content && (
            <div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPreview(!showPreview);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: textColor,
                  backgroundColor: isLight ? 'rgba(243, 244, 246, 0.8)' : 'rgba(55, 65, 81, 0.8)',
                  border: `1px solid ${borderColor}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  marginBottom: showPreview ? 8 : 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = isLight ? 'rgba(229, 231, 235, 0.8)' : 'rgba(75, 85, 99, 0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isLight ? 'rgba(243, 244, 246, 0.8)' : 'rgba(55, 65, 81, 0.8)';
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
                <span>{showPreview ? 'Hide' : 'Show'} File Preview</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>
                  {formatSize(content.length)} • {fileType.language}
                </span>
              </button>

              {/* File content preview */}
              {showPreview && (
                <div
                  style={{
                    marginTop: 0,
                    borderRadius: 6,
                    border: `1px solid ${borderColor}`,
                    overflow: 'hidden',
                  }}
                >
                  {fileType.isMarkdown ? (
                    <div
                      style={{
                        padding: 12,
                        maxHeight: 400,
                        overflow: 'auto',
                        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.5)' : 'rgba(13, 17, 23, 0.5)',
                      }}
                    >
                      <CustomMarkdownRenderer content={content} isLight={isLight} />
                    </div>
                  ) : (
                    <div style={{ maxHeight: 400, overflow: 'auto' }}>
                      <CodeBlock 
                        language={fileType.language} 
                        code={content} 
                        isLight={isLight} 
                      />
                    </div>
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
