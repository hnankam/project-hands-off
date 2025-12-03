import type { FC } from 'react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { MarkdownRenderer } from './tiptap/MarkdownRenderer';

// Persist open state across remounts (for Virtua virtualization)
const openStateCache: Map<string, boolean> = new Map();
// Track if user has manually interacted (persists across remounts)
const manualOnlyCache: Map<string, boolean> = new Map();

/**
 * ThinkingBlock Component
 * 
 * An accordion-style component that displays the AI agent's thinking process.
 * Used in markdown rendering to show agent's thought process.
 * 
 * Features:
 * - Accordion (collapsible) interface
 * - Auto-opens when opening tag is encountered (streaming)
 * - Auto-closes when closing tag is received
 * - Theme-aware styling (light/dark modes)
 * - Lightbulb icon to indicate thinking state
 * - Smooth expand/collapse animations
 * 
 * @param children - Content to display within the thinking block
 * @param isComplete - Whether the thinking tag has its closing tag
 * @param instanceId - Unique ID to persist open state across remounts
 * 
 * @example
 * ```tsx
 * <think>Analyzing the page structure...</think>
 * ```
 */
export const ThinkingBlock: FC<{ children?: React.ReactNode; isComplete?: boolean; instanceId?: string }> = ({ children, isComplete = false, instanceId }) => {
  const { isLight } = useStorage(themeStorage);
  
  // Generate a stable cache key from instanceId or fallback to content hash
  // Use first 100 chars of content as a stable prefix (content grows during streaming)
  const contentPrefix = typeof children === 'string' ? children.slice(0, 100) : '';
  const cacheKey = instanceId ?? `thinking-${contentPrefix}`;
  
  // Initialize from cache if available, otherwise use default behavior
  const [isOpen, setIsOpen] = useState(() => {
    if (openStateCache.has(cacheKey)) {
      return openStateCache.get(cacheKey)!;
    }
    return !isComplete;
  });
  const [isHovered, setIsHovered] = useState(false);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize manualOnly from cache
  const manualOnlyRef = useRef(manualOnlyCache.get(cacheKey) ?? false);
  const prevCompleteRef = useRef<boolean>(false);
  const myIdRef = useRef<number>(0);
  const [isLatest, setIsLatest] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Sync open state to cache whenever it changes
  useEffect(() => {
    openStateCache.set(cacheKey, isOpen);
  }, [cacheKey, isOpen]);

  // Global coordination: ensure only the newest mounted block is considered "latest"
  // so only that block reflects the global streaming state in its title.
  // We coordinate via a window-level custom event to update all instances.
  // Module-scoped vars
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  (window as any).__thinkingBlockSeq = (window as any).__thinkingBlockSeq || 0;
  (window as any).__thinkingBlockLatest = (window as any).__thinkingBlockLatest || 0;

  useEffect(() => {
    // Assign a unique id to this instance
    const seq = (window as any).__thinkingBlockSeq + 1;
    (window as any).__thinkingBlockSeq = seq;
    myIdRef.current = seq;
    // Mark this as latest and notify others
    (window as any).__thinkingBlockLatest = seq;
    const ev = new CustomEvent('thinking-latest-changed', { detail: { id: seq } });
    window.dispatchEvent(ev);
    setIsLatest(true);

    const handler = (e: any) => {
      const latestId = e?.detail?.id;
      setIsLatest(latestId === myIdRef.current);
    };
    const closeAllHandler = () => {
      // Close block unless it was manually forced open recently
      setIsOpen(false);
      manualOnlyRef.current = true; // After programmatic close, keep manual-only to avoid auto-opening
    };
    window.addEventListener('thinking-latest-changed', handler);
    window.addEventListener('thinking-close-all', closeAllHandler);
    return () => {
      window.removeEventListener('thinking-latest-changed', handler);
      window.removeEventListener('thinking-close-all', closeAllHandler);
    };
  }, []);

  // Open when tag is incomplete (streaming); close when closing tag is received.
  // Once auto-closed, switch to manual-only.
  useEffect(() => {
    const prev = prevCompleteRef.current;
    prevCompleteRef.current = isComplete;

    // Clear any pending close timer on state change
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    if (!isComplete && !manualOnlyRef.current) {
      // While tag is incomplete (no closing tag), keep it open
      setIsOpen(true);
      return;
    }

    // When tag becomes complete (closing tag received), auto-close and enter manual-only mode
    if (isComplete && !prev && !manualOnlyRef.current) {
      autoCloseTimerRef.current = setTimeout(() => {
        setIsOpen(false);
        manualOnlyRef.current = true; // From now on, only manual open/close
      }, 800);
    }
  }, [isComplete]);

  // Auto-scroll to bottom while tag is incomplete to keep new content visible
  // Use throttled MutationObserver for smooth, responsive scrolling
  useEffect(() => {
    if (isComplete || !isOpen || !contentRef.current) {
      return;
    }

    const element = contentRef.current;
    let lastScrollTime = 0;
    const SCROLL_THROTTLE_MS = 50; // Throttle to max once per 50ms for smooth scrolling
    
    // Throttled scroll function - immediate first scroll, then max once per 50ms
    const scrollToBottom = () => {
      const now = Date.now();
      
      // Allow scroll if enough time has passed since last scroll
      if (now - lastScrollTime >= SCROLL_THROTTLE_MS) {
        lastScrollTime = now;
        requestAnimationFrame(() => {
          if (element) {
            element.scrollTop = element.scrollHeight;
          }
        });
      }
    };
    
    // Scroll immediately on mount
    scrollToBottom();

    // Set up MutationObserver with immediate throttled scrolling
    const observer = new MutationObserver(() => {
      // Scroll immediately (or wait for throttle window)
      scrollToBottom();
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [isComplete, isOpen]);
  
  const toggleAccordion = () => {
    setIsOpen(!isOpen);
    // Enter manual-only mode after any user interaction
    manualOnlyRef.current = true;
    manualOnlyCache.set(cacheKey, true);
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };
  
  // Light sanitization: remove consecutive newlines and trim content when tag is complete
  const sanitizeContent = useMemo(() => {
    if (typeof children !== 'string') {
      return children;
      }
    
    let sanitized = children;
    
    // Apply sanitization only when closing tag is received
    if (isComplete) {
      // Normalize different line break types (Windows \r\n, Mac \r, Unix \n) to \n
      sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // Light sanitization: Only remove excessive newlines (3+), keep double newlines
      // This preserves markdown list formatting (which needs double newlines) while
      // removing excessive blank lines
      sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
      
      // Trim leading and trailing whitespace (including newlines)
      sanitized = sanitized.trim();
    }
    
    return sanitized;
  }, [children, isComplete]);

  // Render content - handle both string (from CustomAssistantMessage) and React nodes (from CopilotKit)
  const renderedContent = useMemo(() => {
    // If children is a string, render it as markdown using MarkdownRenderer for better formatting
    if (typeof sanitizeContent === 'string') {
      return <MarkdownRenderer content={sanitizeContent} isLight={isLight} />;
    }
    // Otherwise, render React nodes as-is
    return sanitizeContent;
  }, [sanitizeContent, isLight]);

  return (
    <div className={`thinking-block ${isLight ? 'text-gray-600' : 'text-gray-500'}`} style={{ fontSize: 12 }}>
      {/* Accordion Header - Always visible */}
      <div
        onClick={toggleAccordion}
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleAccordion();
          }
        }}
        aria-expanded={isOpen}
        aria-controls="thinking-content">
        {/* Lightbulb icon indicating thinking/processing */}
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
            color: isLight ? '#4b5563' : '#6b7280' // gray-600 for light, gray-500 for dark
          }}>
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        
        {/* Title */}
        <span style={{ flex: 1 }}>
          {isComplete ? 'Thought' : 'Thinking...'}
        </span>
        
        {/* Chevron icon for accordion state - only visible on hover */}
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
          }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      
      {/* Accordion Content - Collapsible with auto-scroll during streaming */}
      <div
        id="thinking-content"
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
          maxHeight: isOpen ? (isComplete ? '500px' : '75vh') : '0',
          opacity: isOpen ? 1 : 0,
        }}>
        <div
          style={{
            paddingLeft: 8,
            paddingRight: 6,
            paddingBottom: 0,
            paddingTop: 0,
            // borderLeft: `2px solid ${isLight ? '#e5e7eb' : '#374151'}`,
            marginLeft: 13,
          }}>
          <div
            ref={contentRef}
            className={`text-xs mb-4 opacity-80 ${
              isComplete
                ? 'overflow-y-auto max-h-40 overscroll-contain session-tabs-scroll'
                : 'overflow-y-auto max-h-[75vh] overscroll-contain session-tabs-scroll'
            }`}
          >
            <div className="thinking-block-content">{renderedContent}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

