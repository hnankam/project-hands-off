/**
 * InlineThinkingBlock Component
 * 
 * A simplified thinking block component for use within GraphStateCard.
 * Matches the design of the main ThinkingBlock but without streaming coordination.
 */

import type { FC } from 'react';
import * as React from 'react';
import { useState, useRef, memo } from 'react';
import { CustomMarkdownRenderer } from '../chat/CustomMarkdownRenderer';

interface InlineThinkingBlockProps {
  content: string;
  isLight: boolean;
  defaultOpen?: boolean;
  isComplete?: boolean;
}

export const InlineThinkingBlock: FC<InlineThinkingBlockProps> = memo(({ 
  content, 
  isLight, 
  defaultOpen = false, 
  isComplete = true 
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  if (!content) return null;
  
  return (
    <div className={`thinking-block ${isLight ? 'text-gray-600' : 'text-gray-500'}`} style={{ fontSize: 12 }}>
      {/* Accordion Header - matches ThinkingBlock design */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: 4,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        aria-expanded={isOpen}
      >
        {/* Lightbulb icon - matches ThinkingBlock */}
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

        {/* Title */}
        <span style={{ flex: 1 }}>{isComplete ? 'Thought' : 'Thinking...'}</span>

        {/* Chevron icon - only visible on hover */}
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
      </div>
      
      {/* Accordion Content */}
      <div
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
          maxHeight: isOpen ? (isComplete ? '500px' : '75vh') : '0',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div
          style={{
            paddingLeft: 8,
            paddingRight: 6,
            paddingBottom: 0,
            paddingTop: 0,
            marginLeft: 13,
          }}
        >
          <div
            ref={contentRef}
            className={`mb-4 text-xs opacity-80 ${
              isComplete
                ? 'max-h-40 overflow-y-auto overscroll-contain'
                : 'max-h-[75vh] overflow-y-auto overscroll-contain'
            }`}
          >
            <div className="thinking-block-content">
              <CustomMarkdownRenderer content={content} isLight={isLight} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

InlineThinkingBlock.displayName = 'InlineThinkingBlock';

