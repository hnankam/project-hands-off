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
  const [isOpen, setIsOpen] = useState(true); // Start open while generation begins
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const manualOnlyRef = useRef(false); // After auto-close, only manual toggling allowed
  const prevStreamingRef = useRef<boolean>(false);

  // Open during streaming; close shortly after streaming ends. Once auto-closed, switch to manual-only.
  useEffect(() => {
    const prev = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    // Clear any pending close timer on state change
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    if (isStreaming && !manualOnlyRef.current) {
      // While streaming, keep it open
      setIsOpen(true);
      return;
    }

    // When streaming transitions to false for the first time, auto-close and enter manual-only mode
    if (!isStreaming && prev && !manualOnlyRef.current) {
      autoCloseTimerRef.current = setTimeout(() => {
        setIsOpen(false);
        manualOnlyRef.current = true; // From now on, only manual open/close
      }, 800);
    }
  }, [isStreaming]);
  
  const toggleAccordion = () => {
    setIsOpen(!isOpen);
    // Enter manual-only mode after any user interaction
    manualOnlyRef.current = true;
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };
  
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

    return trimNode(children);
  }, [children]);

  return (
    <div
      className={`thinking-block my-2 rounded-[10px] transition-all ${
        isLight ? 'bg-blue-50/60' : 'bg-blue-900/20'
      }`}>
      {/* Accordion Header - Always visible */}
      <button
        onClick={toggleAccordion}
        className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors rounded-[10px] ${
          isLight ? 'bg-blue-100/60 hover:bg-blue-200/70' : 'bg-blue-900/20 hover:bg-blue-900/30'
        }`}
        aria-expanded={isOpen}
        aria-controls="thinking-content">
        {/* Lightbulb icon indicating thinking/processing */}
        <svg 
          className={`h-3.5 w-3.5 flex-shrink-0 transition-colors ${isLight ? 'text-blue-500' : 'text-blue-400'}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24">
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" 
          />
        </svg>
        
        {/* Title */}
        <div className={`flex-1 text-xs font-medium ${isLight ? 'text-blue-700/80' : 'text-blue-300/80'}`}>
          {isStreaming ? 'Thinking...' : 'Thought'}
        </div>
        
        {/* Chevron icon for accordion state */}
        <svg
          className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          } ${isLight ? 'text-blue-600' : 'text-blue-400'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {/* Accordion Content - Collapsible (scrollable with thin messages scrollbar) */}
      <div
        id="thinking-content"
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}>
        <div
          className={`p-2 pl-3 pr-3 text-xs overflow-y-auto max-h-40 overscroll-contain session-tabs-scroll ${
            isLight ? 'text-blue-900/80' : 'text-blue-100/80'
          } [&_.whitespace-pre-wrap]:m-0 [&_.whitespace-pre-wrap]:p-0 [&_.whitespace-pre-wrap]:text-[13px] [&_.whitespace-pre-wrap]:leading-[1.35]
             [&_.copilotKitMarkdownElement]:m-0 [&_.copilotKitMarkdownElement]:p-0 [&_.copilotKitMarkdownElement:not(:last-child)]:!mb-0`}
        >
          <div className="whitespace-pre-wrap m-0 p-0 [&>*]:m-0 [&>*]:p-0">{normalizedChildren}</div>
        </div>
      </div>
    </div>
  );
};

