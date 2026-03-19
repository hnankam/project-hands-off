/**
 * VirtualizedMessageViewContentVirtua
 *
 * Virtualization using Virtua's Virtualizer - similar to React Virtualized,
 * works with an external scroll container (scrollRef) without changing the main DOM tree.
 *
 * The scroll container stays in place (CopilotKit's StickToBottom); Virtua only
 * renders visible items inside it. Zero-config dynamic sizing, small bundle (~3kB).
 *
 * Toggle via VIRTUALIZATION_MODE in ChatInner.
 *
 * TODO: Fix distortion when streaming
 * TODO: Fix chat input sometimes being pushed out of view
 */

import * as React from 'react';
import { Virtualizer, type VirtualizerHandle } from 'virtua';
import { useRegisterScrollToBottom } from '../../context/ScrollToBottomContext';
import { CustomCursor } from './slots';

/** Px to render before/after viewport. Higher = more prerender for smoother scroll; Virtua default 200. */
const BUFFER_SIZE = 2000;

/** Item size hint for unmeasured items. Omit for auto-estimation (recommended for dynamic content). */
const ITEM_SIZE_HINT: number | undefined = undefined;

/** Number of recent messages to keep mounted when off-screen (avoids unmount during scroll). */
const KEEP_MOUNTED_COUNT = 1000;

/** First N indices to always keep mounted - prevents Virtua from truncating scroll range at top. */
const KEEP_MOUNTED_FIRST = 5;


/**
 * Find the scroll container that actually contains our list.
 * Walk UP from our element to find the nearest ancestor with overflow-y that scrolls.
 */
function findScrollAncestor(element: HTMLElement | null): HTMLElement | null {
  // Start from parentElement — skip the element itself (it has overflow-y:visible, not the scroll container)
  let el: HTMLElement | null = element?.parentElement ?? null;
  while (el) {
    const style = getComputedStyle(el);
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

export type VirtualizedMessageViewContentVirtuaProps = {
  messageElements: React.ReactElement[];
  messages: Array<{ id?: string; role?: string }>;
  isRunning: boolean;
  interruptElement: React.ReactNode;
};

export function VirtualizedMessageViewContentVirtua({
  messageElements,
  messages,
  isRunning,
  interruptElement,
}: VirtualizedMessageViewContentVirtuaProps): React.JSX.Element {
  const listContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollElementRef = React.useRef<HTMLElement | null>(null);
  const virtualizerRef = React.useRef<VirtualizerHandle | null>(null);
  const messageCountRef = React.useRef(0);
  const [scrollElement, setScrollElement] = React.useState<HTMLElement | null>(null);

  messageCountRef.current = messageElements.length;

  React.useEffect(() => {
    const found = findScrollAncestor(listContainerRef.current);
    scrollElementRef.current = found;
    setScrollElement(found);
  }, [messageElements.length]);

  const registerScrollToBottom = useRegisterScrollToBottom();
  React.useEffect(() => {
    const scrollToBottom = () => {
      const lastIndex = messageCountRef.current - 1;
      if (lastIndex < 0) return;
      const v = virtualizerRef.current;
      const el = scrollElementRef.current;
      if (v) {
        v.scrollToIndex(lastIndex, { smooth: false });
      } else if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      }
    };
    return registerScrollToBottom(scrollToBottom);
  }, [registerScrollToBottom]);

  // When messages are prepended (load-more history), scroll to restore position.
  // Strategy: track first-message-ID to detect prepend, and use ELEMENT count delta
  // as the scrollToIndex target — element indices map 1:1 to Virtua's rendered list.
  // Deps use [firstMessageId, messageElements.length] so this only fires on structural
  // changes, not on every streaming render.
  const prevFirstMsgIdRef = React.useRef<string | undefined>(undefined);
  const prevElementCountRef = React.useRef(0);
  const firstMessageId = messages[0]?.id;
  React.useLayoutEffect(() => {
    const prevFirstId = prevFirstMsgIdRef.current;
    const prevCount = prevElementCountRef.current;
    prevFirstMsgIdRef.current = firstMessageId;
    prevElementCountRef.current = messageElements.length;
    if (prevFirstId === undefined || prevFirstId === firstMessageId) return;
    // First message changed → messages were prepended
    const addedElements = messageElements.length - prevCount;
    if (addedElements > 0) {
      virtualizerRef.current?.scrollToIndex(addedElements, { smooth: false });
    }
  }, [firstMessageId, messageElements.length]);

  const showCursor = isRunning && messages[messages.length - 1]?.role !== 'reasoning';

  const keepMounted = React.useMemo(() => {
    const n = messageElements.length;
    const firstIndices = Array.from(
      { length: Math.min(KEEP_MOUNTED_FIRST, n) },
      (_, i) => i
    );
    const lastStart = Math.max(KEEP_MOUNTED_FIRST, n - KEEP_MOUNTED_COUNT);
    const lastIndices = Array.from(
      { length: Math.max(0, n - lastStart) },
      (_, i) => lastStart + i
    );
    return [...firstIndices, ...lastIndices];
  }, [messageElements.length]);

  const useFallback = !scrollElement || messageElements.length === 0;

  if (useFallback) {
    return (
      <div
        ref={listContainerRef}
        className="copilotKitMessages cpk:flex cpk:flex-col"
        style={{ overflowY: 'visible' }}
        data-testid="copilot-message-list-virtua-fallback"
      >
        {messageElements.map((el, i) => (
          <div key={el?.key ?? i}>{el}</div>
        ))}
        {interruptElement}
        {showCursor && (
          <div className="cpk:mt-2">
            <CustomCursor />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={listContainerRef}
      className="copilotKitMessages cpk:flex cpk:flex-col"
      style={{ overflowY: 'visible' }}
      data-testid="copilot-message-list-virtua"
    >
      <Virtualizer
        ref={virtualizerRef}
        data={messageElements}
        scrollRef={scrollElementRef as React.RefObject<HTMLElement | null>}
        bufferSize={BUFFER_SIZE}
        {...(ITEM_SIZE_HINT !== undefined && { itemSize: ITEM_SIZE_HINT })}
        keepMounted={keepMounted}
        shift={false}
      >
        {(el: React.ReactElement, i: number) => (
          <div key={el?.key ?? i} data-index={i}>
            {el}
          </div>
        )}
      </Virtualizer>
      {interruptElement}
      {showCursor && (
        <div className="cpk:mt-2">
          <CustomCursor />
        </div>
      )}
    </div>
  );
}
