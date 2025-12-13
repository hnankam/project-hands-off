/**
 * Custom User Message Renderer for CopilotKit V2
 * 
 * Renders user message content with V1 styling (border, background colors)
 * and full width support.
 */

import React from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { MarkdownRenderer } from '../../tiptap/MarkdownRenderer';

export interface CustomUserMessageRendererProps {
  content: string;
  className?: string;
  isEditing?: boolean;
  editedContent?: string;
  onContentChange?: (content: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  attachments?: Array<{ filename: string; mimeType: string; url: string; }>;
}

/**
 * CustomUserMessageRenderer - Full width message renderer with V1 styling
 * 
 * Features:
 * - Full width content (100% width, max-width 100%)
 * - Word wrapping for long content
 * - V1 border and background colors (theme-aware)
 * - Position relative container (for absolute positioned buttons in parent)
 * - Matches copilotKitUserMessage styling from V1
 */
export const CustomUserMessageRenderer: React.FC<CustomUserMessageRendererProps> = ({
  content,
  className = '',
  isEditing = false,
  editedContent = '',
  onContentChange,
  onSave,
  onCancel,
  textareaRef,
  onKeyDown,
  attachments = [],
}) => {
  const { isLight } = useStorage(themeStorage);
  
  // V1 styling colors
  const containerStyles = React.useMemo(() => {
    const baseStyles = {
      position: 'relative' as const,
      width: '100%',
      maxWidth: '100%',
      wordBreak: 'break-word' as const,
      overflowWrap: 'break-word' as const,
      borderRadius: '10px',
      padding: '0.6rem',
      overflow: 'visible' as const,
      transition: 'all 0.2s ease-in-out' as const,
      marginTop: '1.2rem',
      // marginBottom: '1rem'
    };
    
    if (isLight) {
      // Light mode: matches V1 copilotKitUserMessage
      return {
        ...baseStyles,
        backgroundColor: '#f9fafb', // Light mode background
        border: '1px solid #e5e7eb', // Light mode border
        color: '#374151', // Light mode text color - matches custom buttons (gray-700)
      };
    } else {
      // Dark mode: matches V1 copilotKitUserMessage
      return {
        ...baseStyles,
        backgroundColor: '#151C24', // Dark mode background
        border: '1px solid #374151', // Dark mode border
        color: '#d1d5db', // Dark mode text color - matches custom buttons (gray-300)
      };
    }
  }, [isLight]);
  
  // Edit mode view
  if (isEditing) {
    return (
      <div 
        className={className}
        style={containerStyles}
      >
        <textarea
          ref={textareaRef}
          value={editedContent}
          onChange={(e) => onContentChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '0.5rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: isLight ? '#ffffff' : '#0C1117',
            color: isLight ? '#374151' : '#d1d5db', // Matches message text and buttons
            fontSize: '13px',
            lineHeight: '1.4',
            fontFamily: 'inherit',
            resize: 'none',
            outline: 'none',
            marginBottom: '0.5rem',
          }}
        />
        <div
          style={{
            display: 'flex',
            gap: '0.25rem',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onCancel}
            title="Cancel (Esc)"
            style={{
              width: '28px',
              height: '28px',
              padding: '0.5rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: isLight ? '#374151' : '#d1d5db', // Matches custom buttons
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="16"
              height="16"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <button
            onClick={onSave}
            title="Save (⌘↵)"
            style={{
              width: '28px',
              height: '28px',
              padding: '0.5rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#22c55e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="16"
              height="16"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }
  
  // View mode (default) - render markdown with attachments
  return (
    <div 
      className={className}
      style={containerStyles}
    >
      {/* Attachment chips - displayed above message content */}
      {attachments && attachments.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '2px',
            marginBottom: '6px',
            position: 'relative',
            zIndex: 10001,
          }}>
          {attachments.map((att, idx) => (
            <div
              key={`${att.url}-${idx}`}
              title={att.filename}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '1px 4px',
                borderRadius: '6px',
                background: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.07)',
                fontSize: 9,
                color: isLight ? '#374151' : '#d1d5db', // Matches message text and buttons
                fontWeight: isLight ? 500 : 400,
                maxWidth: '100%',
                whiteSpace: 'nowrap',
              }}>
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <a
                href={att.url}
                target="_blank"
                rel="noreferrer"
                style={{ 
                  textDecoration: 'none', 
                  color: 'inherit', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis' 
                }}>
                {att.filename}
              </a>
            </div>
          ))}
        </div>
      )}
      
      <div
        style={{
          fontSize: '13px',
          lineHeight: '1.4',
          color: 'inherit', // Inherit muted color from container
          maxHeight: '150px',
          overflowY: 'auto' as const,
          overflowX: 'visible' as const,
        }}
      >
        <MarkdownRenderer content={content} isLight={isLight} />
      </div>
    </div>
  );
};

export default CustomUserMessageRenderer;

