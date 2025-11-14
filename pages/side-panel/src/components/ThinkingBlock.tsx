import type { FC } from 'react';
import React, { useState, useEffect, useRef } from 'react';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { useStreaming } from '../context/StreamingContext';

/**
 * ThinkingBlock Component
 * 
 * An accordion-style component that displays the AI agent's thinking process.
 * Used in markdown rendering to show agent's thought process.
 * 
 * Features:
 * - Accordion (collapsible) interface
 * - Auto-opens when message is streaming
 * - Auto-closes when content stops updating (1 second delay)
 * - Theme-aware styling (light/dark modes)
 * - Lightbulb icon to indicate thinking state
 * - Smooth expand/collapse animations
 * 
 * @param children - Content to display within the thinking block
 * 
 * @example
 * ```tsx
 * <thinking>Analyzing the page structure...</thinking>
 * ```
 */
export const ThinkingBlock: FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isLight } = useStorage(exampleThemeStorage);
  const { isStreaming } = useStreaming();
  const [isOpen, setIsOpen] = useState(() => Boolean(isStreaming));
  const [isHovered, setIsHovered] = useState(false);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const manualOnlyRef = useRef(false); // After auto-close, only manual toggling allowed
  const prevStreamingRef = useRef<boolean>(false);
  const myIdRef = useRef<number>(0);
  const [isLatest, setIsLatest] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

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

  // Open during streaming for the latest block; close shortly after streaming ends.
  // Once auto-closed, switch to manual-only.
  useEffect(() => {
    const prev = prevStreamingRef.current;
    const isActiveStreaming = isStreaming && isLatest;
    prevStreamingRef.current = isActiveStreaming;

    // Clear any pending close timer on state change
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    if (isActiveStreaming && !manualOnlyRef.current) {
      // While streaming, keep it open
      setIsOpen(true);
      return;
    }

    // When streaming transitions to false for the first time, auto-close and enter manual-only mode
    if (!isActiveStreaming && prev && !manualOnlyRef.current) {
      autoCloseTimerRef.current = setTimeout(() => {
        setIsOpen(false);
        manualOnlyRef.current = true; // From now on, only manual open/close
      }, 800);
    }
  }, [isStreaming, isLatest]);

  // Auto-scroll to bottom during streaming to keep new content visible
  // Use throttled MutationObserver for smooth, responsive scrolling
  useEffect(() => {
    if (!isStreaming || !isLatest || !isOpen || !contentRef.current) {
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
  }, [isStreaming, isLatest, isOpen]);
  
  const toggleAccordion = () => {
    setIsOpen(!isOpen);
    // Enter manual-only mode after any user interaction
    manualOnlyRef.current = true;
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };
  
  // PERFORMANCE: Pre-compile regex patterns once
  const THINKING_OPEN_RE = React.useMemo(() => /<think(?:ing)?\s*>/i, []);
  const THINKING_CLOSE_RE = React.useMemo(() => /<\/think(?:ing)?\s*>/i, []);
  const THINKING_TAGS_RE = React.useMemo(() => /<\/?think(?:ing)?\s*>/gi, []);

  // Extract only the content that is actually inside <thinking>...</thinking> tags.
  // The markdown renderer should only pass content between the tags, but sometimes
  // malformed markdown causes the entire response to be wrapped. This extracts
  // just the thinking portion and strips any tag artifacts.
  const extractThinkingInner = React.useCallback((node: React.ReactNode): React.ReactNode => {
    // Collapse multiple blank lines to a single newline for cleaner display
    const collapseBlankLines = (text: string): string => text.replace(/(\r?\n)\s*(\r?\n)+/g, '$1');

    // Helper to recursively collect all text content from React nodes
    const collectText = (n: React.ReactNode): string => {
      if (typeof n === 'string') return n;
      if (typeof n === 'number') return String(n);
      if (Array.isArray(n)) return n.map(collectText).join('');
      if (React.isValidElement(n)) {
        const el = n as React.ReactElement<{ children?: React.ReactNode }>;
        return collectText(el.props?.children);
      }
      return '';
    };

    // Get all text to check for thinking tags
    const allText = collectText(node);
    
    // PERFORMANCE: Early exit if no thinking tags present
    if (!allText.includes('<thinking') && !allText.includes('</thinking')) {
      return node;
    }
    
    // If content has thinking tags, extract only what's between the first valid pair
    const openMatch = allText.match(THINKING_OPEN_RE);
    const closeMatch = allText.match(THINKING_CLOSE_RE);
    
    if (openMatch && closeMatch && openMatch.index !== undefined && closeMatch.index !== undefined) {
      const start = openMatch.index + openMatch[0].length;
      const end = closeMatch.index;
      
      if (end > start) {
        // Return only the content between the tags, stripped of any tag artifacts
        return collapseBlankLines(
          allText.slice(start, end).replace(THINKING_TAGS_RE, '').trim()
        );
      }
    }
    
    // If tags are malformed or unmatched, strip all tag artifacts and return content
    return collapseBlankLines(allText.replace(THINKING_TAGS_RE, '').trim());
  }, [THINKING_OPEN_RE, THINKING_CLOSE_RE, THINKING_TAGS_RE]);

  // Remove a single leading space character from the very first text node only,
  // preserving newlines and internal spacing for pre-wrap semantics.
  const normalizedChildren = React.useMemo(() => {
    let removed = false;

    const trimNode = (node: React.ReactNode): React.ReactNode => {
      if (typeof node === 'string') {
        let text = node;
        // Remove a single leading newline first ("\n" or "\r\n")
        if (!removed && /^\r?\n/.test(text)) {
          removed = true;
          text = text.replace(/^\r?\n/, '');
        } else if (!removed && text.startsWith(' ')) {
          // Fallback: remove a single leading space
          removed = true;
          text = text.slice(1);
        }
        // Collapse any double/multiple newlines into a single newline
        text = text.replace(/(\r?\n){2,}/g, '\n');
        return text;
      }
      if (Array.isArray(node)) {
        const isBlockElement = (el: React.ReactNode) => {
          if (!React.isValidElement(el)) return false;
          const t = el.type as any;
          return typeof t === 'string' && (t === 'p' || t === 'div' || t === 'pre');
        };

        const reduced: React.ReactNode[] = [];
        for (const child of node) {
          let next = trimNode(child);
          const last = reduced.length > 0 ? reduced[reduced.length - 1] : undefined;

          // Merge adjacent text nodes and collapse multi-newlines across the boundary
          if (typeof last === 'string' && typeof next === 'string') {
            reduced[reduced.length - 1] = (last + next).replace(/(\r?\n){2,}/g, '\n');
            continue;
          }

          // If a text node is followed by a block element, strip trailing newlines from the text
          if (typeof last === 'string' && isBlockElement(next)) {
            reduced[reduced.length - 1] = last.replace(/\r?\n+$/g, '');
          }

          // If a block element is followed by a text node, strip leading newlines from the text
          if (isBlockElement(last) && typeof next === 'string') {
            next = next.replace(/^\r?\n+/g, '');
          }

          reduced.push(next);
        }
        return reduced;
      }
      if (React.isValidElement(node)) {
        const el = node as React.ReactElement<{ children?: React.ReactNode }>;
        const childNodes = el.props?.children;
        if (childNodes === undefined || childNodes === null) return el;
        const nextChildren = trimNode(childNodes);
        if (nextChildren === childNodes) return el;
        return React.cloneElement(el, { ...(el.props as any), children: nextChildren });
      }
      return node;
    };

    const innerOnly = extractThinkingInner(children);
    return trimNode(innerOnly);
  }, [children, extractThinkingInner]);

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
          {isStreaming && isLatest ? 'Thinking...' : 'Thought'}
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
          maxHeight: isOpen ? (isStreaming && isLatest ? '75vh' : '500px') : '0',
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
              isStreaming && isLatest
                ? 'overflow-y-auto max-h-[75vh] overscroll-contain session-tabs-scroll'
                : 'overflow-y-auto max-h-40 overscroll-contain session-tabs-scroll'
            } [&_.whitespace-pre-wrap]:m-0 [&_.whitespace-pre-wrap]:p-0 [&_.whitespace-pre-wrap]:text-[13px] [&_.whitespace-pre-wrap]:leading-[1.35]
               [&_.copilotKitMarkdownElement]:m-0 [&_.copilotKitMarkdownElement]:p-0 [&_.copilotKitMarkdownElement:not(:last-child)]:!mb-0`}
          >
            <div className="whitespace-pre-wrap m-0 p-0 [&>*]:m-0 [&>*]:p-0">{normalizedChildren}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

