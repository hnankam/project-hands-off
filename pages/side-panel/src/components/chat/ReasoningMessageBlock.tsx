/**
 * ReasoningMessageBlock
 *
 * A ThinkingBlock-styled renderer for CopilotKit reasoning messages.
 * Supports "Thought for X seconds" via the built-in label from CopilotChatReasoningMessage.
 *
 * @see https://docs.copilotkit.ai/custom-look-and-feel/reasoning-messages
 */

import type { FC } from 'react';
import * as React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { CopilotChatReasoningMessage } from '@copilotkitnext/react';
import type { CopilotChatReasoningMessageProps } from '@copilotkitnext/react';
import { CustomMarkdownRenderer } from './CustomMarkdownRenderer';

/** Custom header: ThinkingBlock-style with lightbulb, label ("Thinking…" / "Thought for X seconds"), chevron */
const ReasoningMessageHeader: FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    isOpen?: boolean;
    label?: string;
    hasContent?: boolean;
    isStreaming?: boolean;
  }
> = ({ isOpen, label = 'Thought', hasContent, isStreaming, onClick, ...props }) => {
  const { isLight } = useStorage(themeStorage);
  const [isHovered, setIsHovered] = useState(false);
  const isExpandable = !!hasContent;

  return (
    <button
      type="button"
      onClick={isExpandable ? onClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`thinking-block ${isLight ? 'text-gray-600' : 'text-gray-500'}`}
      style={{
        padding: 6,
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        display: 'flex',
        alignItems: 'center',
        cursor: isExpandable ? 'pointer' : 'default',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        fontSize: 12,
      }}
      aria-expanded={isExpandable ? isOpen : undefined}
      {...props}
    >
      {/* Lightbulb icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          flexShrink: 0,
          marginRight: 6,
          color: isLight ? '#4b5563' : '#6b7280',
        }}
      >
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>

      {/* Label: "Thinking…" or "Thought for X seconds" */}
      <span style={{ flex: 1 }}>{label}</span>

      {/* Streaming indicator when no content yet */}
      {isStreaming && !hasContent && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: isLight ? '#9ca3af' : '#6b7280',
            animation: 'thinking-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Chevron - visible on hover when expandable */}
      {isExpandable && (
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
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            opacity: isHovered ? 1 : 0,
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
};

/** Custom content: Markdown-rendered reasoning text with theme support. Matches ThinkingBlock layout. */
const ReasoningMessageContent: FC<
  React.HTMLAttributes<HTMLDivElement> & {
    isStreaming?: boolean;
    hasContent?: boolean;
  }
> = ({ isStreaming, hasContent, children, ...props }) => {
  const { isLight } = useStorage(themeStorage);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showTopFeather, setShowTopFeather] = useState(false);

  const syncTopFeather = useCallback(() => {
    const el = contentRef.current;
    if (!el) {
      setShowTopFeather(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setShowTopFeather(false);
    } else {
      setShowTopFeather(scrollTop > 2);
    }
  }, []);

  useEffect(() => {
    if (!hasContent && !isStreaming) return;
    const id = requestAnimationFrame(() => syncTopFeather());
    return () => cancelAnimationFrame(id);
  }, [hasContent, isStreaming, children, syncTopFeather]);

  if (!hasContent && !isStreaming) return null;

  return (
    <div
      style={{
        paddingLeft: 8,
        paddingRight: 6,
        paddingBottom: 0,
        paddingTop: 0,
        marginLeft: 12,
      }}
      {...props}
    >
      <div style={{ position: 'relative' }}>
        <div
          ref={contentRef}
          onScroll={syncTopFeather}
          className={`mb-4 text-xs opacity-80 recent-sessions-scroll ${
            isStreaming
              ? 'max-h-[75vh] overflow-y-auto overscroll-contain'
              : 'max-h-80 overflow-y-auto overscroll-contain'
          }`}
          style={{ paddingRight: 6, paddingBottom: 8 }}
        >
          <div className="thinking-block-content">
            {typeof children === 'string' && children ? (
              <CustomMarkdownRenderer content={children} isLight={isLight} />
            ) : (
              <span className="text-muted-foreground">{children ?? ''}</span>
            )}
            {isStreaming && hasContent && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-muted-foreground animate-pulse ml-1 align-middle"
                aria-hidden
              />
            )}
          </div>
        </div>
        <div
          className={`thinking-block-feather-top pointer-events-none absolute left-0 right-0 top-0 z-10 h-2 transition-opacity duration-150 ${
            showTopFeather ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden
        />
        <div
          className="thinking-block-feather pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-2"
          aria-hidden
        />
      </div>
    </div>
  );
};

/**
 * ReasoningMessageBlock - CopilotChatReasoningMessage with ThinkingBlock styling.
 * Uses built-in "Thought for X seconds" label via custom header.
 */
const ReasoningMessageBlockComponent: FC<CopilotChatReasoningMessageProps> = (props) => {
  const { isLight } = useStorage(themeStorage);

  return (
    <div
      className={`thinking-block ${isLight ? 'text-gray-600' : 'text-gray-500'}`}
      style={{
        fontSize: 12,
        '--thinking-block-feather-bg': isLight ? '#ffffff' : '#0D1117',
        marginLeft: 12,
      } as React.CSSProperties}
    >
      <CopilotChatReasoningMessage
        {...props}
        header={ReasoningMessageHeader}
        contentView={ReasoningMessageContent}
      />
    </div>
  );
};

// Copy static properties from CopilotChatReasoningMessage to match the expected slot type
export const ReasoningMessageBlock = Object.assign(ReasoningMessageBlockComponent, {
  Header: CopilotChatReasoningMessage.Header,
  Content: CopilotChatReasoningMessage.Content,
  Toggle: CopilotChatReasoningMessage.Toggle,
}) as typeof CopilotChatReasoningMessage;
