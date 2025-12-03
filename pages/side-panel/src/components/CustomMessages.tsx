import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useCopilotChatHeadless_c } from '@copilotkit/react-core';
import { useChatContext } from '@copilotkit/react-ui';
import type { MessagesProps } from '@copilotkit/react-ui';
import { VList, type VListHandle } from 'virtua';
import type { Message } from '@copilotkit/shared';

/**
 * Custom Messages Component for CopilotChat
 *
 * Features:
 * - Virtual scrolling with Virtua
 * - Floating sticky user messages (custom implementation)
 * - Auto-scrolling behavior
 * - Agent mode support
 */

// Layout and timing constants
const AUTO_SCROLL_FLAG_DURATION = 50; // Duration to keep auto-scroll flag active (ms)
const INITIAL_SCROLL_DELAY = 300; // Delay before initial scroll on mount (ms)
const SCROLL_BOTTOM_THRESHOLD = 20; // Distance from bottom to consider "at bottom" (px)

// Scroll timing constants
const SCROLL_READY_CHECK_INTERVAL = 50; // ms between VList ready checks
const SCROLL_READY_MAX_WAIT = 2000; // Max time to wait for VList to be ready
const SCROLL_SETTLE_DELAY = 100; // Delay after scroll for VList to settle

// Debug logging key for filtering - use console filter: [SCROLL]
const SCROLL_DEBUG = true; // Set to true to enable scroll debug logs
const scrollLog = (...args: unknown[]) => {
  if (SCROLL_DEBUG) {
    console.log('[SCROLL]', ...args);
  }
};

/**
 * Wait for VList to be ready (mounted and has items rendered)
 * Uses polling with requestAnimationFrame for efficient checking
 */
const waitForVListReady = (
  vListRef: React.RefObject<VListHandle | null>,
  getContainer: () => HTMLElement,
  expectedItemCount: number,
  maxWaitMs: number = SCROLL_READY_MAX_WAIT,
): Promise<boolean> => {
  return new Promise(resolve => {
    const startTime = Date.now();

    const checkReady = () => {
      // Check if VList ref is available
      if (!vListRef.current) {
        if (Date.now() - startTime > maxWaitMs) {
          scrollLog('❌ VList ref never became available');
          resolve(false);
          return;
        }
        requestAnimationFrame(checkReady);
        return;
      }

      // Check if container has rendered items
      const container = getContainer();
      if (!container) {
        if (Date.now() - startTime > maxWaitMs) {
          scrollLog('❌ Container never became available');
          resolve(false);
          return;
        }
        requestAnimationFrame(checkReady);
        return;
      }

      // Check if VList has rendered items (look for message elements)
      const renderedItems = container.querySelectorAll('[data-message-id]');
      const hasItems = renderedItems.length > 0;

      // Also check scrollHeight to ensure content is measured
      const hasHeight = container.scrollHeight > container.clientHeight || expectedItemCount <= 1;

      if (hasItems || hasHeight) {
        scrollLog('✅ VList ready:', {
          renderedItems: renderedItems.length,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          waitTime: Date.now() - startTime,
        });
        resolve(true);
        return;
      }

      // Check timeout
      if (Date.now() - startTime > maxWaitMs) {
        scrollLog('⚠️ VList ready timeout, proceeding anyway:', {
          renderedItems: renderedItems.length,
          scrollHeight: container.scrollHeight,
        });
        resolve(true); // Still try to scroll
        return;
      }

      // Keep checking
      requestAnimationFrame(checkReady);
    };

    requestAnimationFrame(checkReady);
  });
};

interface CustomMessagesProps extends MessagesProps {
  /**
   * Agent mode: when true, disables sticky messages and scrolls user message to top
   * when streaming starts (like the Virtua Chat example pattern)
   */
  agentMode?: boolean;
}

export const CustomMessages = ({
  inProgress,
  children,
  RenderMessage,
  AssistantMessage,
  UserMessage,
  ErrorMessage,
  ImageRenderer,
  onRegenerate,
  onCopy,
  onThumbsUp,
  onThumbsDown,
  markdownTagRenderers,
  chatError,
  agentMode = false,
}: CustomMessagesProps) => {
  const { labels } = useChatContext();
  const { messages: visibleMessages, interrupt } = useCopilotChatHeadless_c();

  const { messages, messagesRef } = useProcessedMessages(labels.initial, visibleMessages);

  const vListRef = useRef<VListHandle>(null);

  // Helper to get container efficiently
  const getContainer = useContainerRef();

  // Handle auto-scrolling behavior
  const { isAutoScrollingRef, shouldStickToBottomRef } = useAutoScroll(
    messages,
    messagesRef,
    inProgress,
    agentMode,
    vListRef,
    getContainer,
  );

  // Determine which render component to use
  const MessageRenderer = RenderMessage;

  // Internal sticky state - managed via floating header
  // Also handles user scroll detection for manual scroll override during streaming
  const { stickyMessageId, handleScroll } = useStickyUserMessage(
    messagesRef,
    agentMode,
    vListRef,
    isAutoScrollingRef,
    inProgress,
    shouldStickToBottomRef,
    getContainer,
  );

  // Find the actual message object for the sticky header
  const stickyMessage = useMemo(() => {
    if (!stickyMessageId) return null;
    const msg = messages.find(m => String(m.id) === stickyMessageId);
    // Type guard: only return if it's a user message
    if (msg && typeof msg === 'object' && 'role' in msg && (msg as any).role === 'user') {
      return msg;
    }
    return null;
  }, [stickyMessageId, messages]);

  // ============== AGENT MODE BLANKSIZE LOGIC (BUDGET-BASED) ==============
  // Instead of recalculating from scratch each time, we use a "remaining space budget":
  // 1. When streaming starts: budget = viewport - userMessageHeight
  // 2. ResizeObserver tracks all messages after user, subtracting height deltas
  // 3. Budget only decreases (never increases mid-turn), eliminating flicker
  // 4. Budget is applied as minHeight to the last message only

  const [trackedUserIndex, setTrackedUserIndex] = useState<number | null>(null);
  const [minHeightBudget, setMinHeightBudget] = useState<number>(0);
  const previousInProgressRef = useRef<boolean>(false);
  const previousMessagesLengthRef = useRef<number>(0);

  // Track heights of each message after the user (messageId -> height)
  const trackedHeightsRef = useRef<Map<string, number>>(new Map());
  // Prevent re-initializing budget mid-stream
  const budgetInitializedRef = useRef<boolean>(false);
  // Debounce timer for budget updates to prevent flickering
  const budgetUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Current budget ref to avoid stale closures - DO NOT sync from state on every render
  // as that would reset it before debounced updates apply
  const currentBudgetRef = useRef<number>(0);
  // Track last update time to prevent rapid successive updates
  const lastUpdateTimeRef = useRef<number>(0);
  // Accumulate deltas during debounce period instead of updating ref immediately
  const pendingDeltaRef = useRef<number>(0);

  // Alias for compatibility with existing render logic
  const blankSize = minHeightBudget;

  // Effect: Reset budget when not in agent mode or no tracked user
  useEffect(() => {
    if (!agentMode || trackedUserIndex === null) {
      if (minHeightBudget !== 0) {
        currentBudgetRef.current = 0;
        setMinHeightBudget(0);
        pendingDeltaRef.current = 0;
      }
      trackedHeightsRef.current.clear();
      budgetInitializedRef.current = false;
    }
  }, [agentMode, trackedUserIndex, minHeightBudget]);

  // Effect: Initialize budget when streaming starts, observe all wrappers for height changes
  useEffect(() => {
    if (!agentMode || trackedUserIndex === null) {
      return;
    }

    const container = getContainer();
    if (!container) return;

    // Get all message wrappers with their indices
    const wrappers = Array.from(container.querySelectorAll('[data-message-wrapper="true"]')) as HTMLElement[];

    if (wrappers.length === 0) return;

    // Find user wrapper by data-wrapper-index attribute (handles Virtua virtualization)
    const userWrapper = container.querySelector(
      `[data-message-wrapper="true"][data-wrapper-index="${trackedUserIndex}"]`,
    ) as HTMLElement | null;

    // Initialize budget on first run (streaming just started)
    if (!budgetInitializedRef.current && userWrapper) {
      const viewportHeight = container.clientHeight;
      const userHeight = userWrapper.getBoundingClientRect().height;

      const initialBudget = Math.max(viewportHeight - userHeight, 0);

      console.log('[BLANKSIZE] Budget initialized:', {
        viewportHeight: Math.round(viewportHeight),
        userHeight: Math.round(userHeight),
        initialBudget: Math.round(initialBudget),
        trackedUserIndex,
      });

      // Update both ref and state for initialization (no debounce needed)
      currentBudgetRef.current = initialBudget;
      setMinHeightBudget(initialBudget);
      pendingDeltaRef.current = 0;
      lastUpdateTimeRef.current = Date.now();
      trackedHeightsRef.current.clear();
      budgetInitializedRef.current = true;
    }

    // Measure and track current heights of all messages after user (EXCEPT the last one)
    // The last wrapper has minHeight applied which distorts its measured height,
    // so we skip it. When a new message arrives, the previous-last becomes measurable.
    const measureAndUpdateBudget = () => {
      const allWrappers = Array.from(container.querySelectorAll('[data-message-wrapper="true"]')) as HTMLElement[];

      // Find the highest wrapper index (last message) - we'll skip this one
      let maxWrapperIndex = -1;
      for (const wrapper of allWrappers) {
        const idx = parseInt(wrapper.getAttribute('data-wrapper-index') || '-1', 10);
        if (idx > maxWrapperIndex) maxWrapperIndex = idx;
      }

      let totalDelta = 0;
      const heightUpdates: {
        idx: number;
        oldH: number;
        newH: number;
        delta: number;
        cappedDelta?: number;
        isFirst?: boolean;
      }[] = [];

      // Iterate through all wrappers and filter by index
      for (const wrapper of allWrappers) {
        const indexAttr = wrapper.getAttribute('data-wrapper-index');
        if (!indexAttr) continue;

        const wrapperIndex = parseInt(indexAttr, 10);

        // Skip user message and earlier messages
        if (wrapperIndex <= trackedUserIndex) continue;

        // Skip the LAST wrapper - it has minHeight applied which distorts measurement
        // Its height will be tracked when it's no longer the last (when a new message arrives)
        if (wrapperIndex === maxWrapperIndex) continue;

        const messageId = `msg-${wrapperIndex}`;

        // Measure wrapper height directly (no minHeight on non-last wrappers)
        const newHeight = wrapper.getBoundingClientRect().height;

        const oldHeight = trackedHeightsRef.current.get(messageId) || 0;
        const isFirstMeasurement = oldHeight === 0;
        const delta = newHeight - oldHeight;

        if (delta !== 0) {
          // For FIRST measurement of a message (when it transitions from "last" to "not-last"),
          // cap the delta to prevent large jumps. The message may have grown significantly
          // while we couldn't measure it (e.g., expanded thinking block).
          // Subsequent measurements will track incremental growth accurately.
          const cappedDelta = isFirstMeasurement ? Math.min(delta, 60) : delta;

          heightUpdates.push({
            idx: wrapperIndex,
            oldH: Math.round(oldHeight),
            newH: Math.round(newHeight),
            delta: Math.round(delta),
            cappedDelta: Math.round(cappedDelta),
            isFirst: isFirstMeasurement,
          });
          trackedHeightsRef.current.set(messageId, newHeight);
          // Only count positive deltas (growth) - ignore shrinking
          if (cappedDelta > 0) {
            totalDelta += cappedDelta;
          }
        }
      }

      if (totalDelta > 0) {
        // Accumulate deltas instead of updating immediately to batch rapid updates
        pendingDeltaRef.current += totalDelta;

        const currentBudget = currentBudgetRef.current;
        const projectedBudget = Math.max(currentBudget - pendingDeltaRef.current, 0);

        console.log('[BLANKSIZE] Budget update queued:', {
          previousBudget: Math.round(currentBudget),
          totalDelta: Math.round(totalDelta),
          pendingDelta: Math.round(pendingDeltaRef.current),
          projectedBudget: Math.round(projectedBudget),
          updates: heightUpdates,
        });

        // Clear existing timer and set new one
        if (budgetUpdateTimerRef.current) {
          clearTimeout(budgetUpdateTimerRef.current);
        }

        // Use requestAnimationFrame + setTimeout for smoother batching
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
        const minUpdateInterval = 150; // Minimum 150ms between updates

        const debounceDelay = timeSinceLastUpdate < minUpdateInterval ? minUpdateInterval - timeSinceLastUpdate : 100;

        budgetUpdateTimerRef.current = setTimeout(() => {
          requestAnimationFrame(() => {
            // Apply accumulated delta
            const finalBudget = Math.max(currentBudgetRef.current - pendingDeltaRef.current, 0);
            currentBudgetRef.current = finalBudget;
            setMinHeightBudget(finalBudget);
            pendingDeltaRef.current = 0;
            lastUpdateTimeRef.current = Date.now();
          });
        }, debounceDelay);
      }
    };

    // Initial measurement
    measureAndUpdateBudget();

    // Set up ResizeObserver on all wrappers after user message (by index)
    const wrappersToObserve = wrappers.filter(w => {
      const idx = parseInt(w.getAttribute('data-wrapper-index') || '-1', 10);
      return idx > trackedUserIndex;
    });

    if (wrappersToObserve.length === 0) {
      console.log('[BLANKSIZE] ResizeObserver: No wrappers to observe after user');
      return;
    }

    console.log(
      '[BLANKSIZE] ResizeObserver: Observing',
      wrappersToObserve.length,
      'wrappers after index',
      trackedUserIndex,
    );

    const observer = new ResizeObserver(() => {
      measureAndUpdateBudget();
    });

    wrappersToObserve.forEach(wrapper => observer.observe(wrapper));

    return () => {
      observer.disconnect();
      // Clear pending budget update timer and apply any accumulated delta immediately
      if (budgetUpdateTimerRef.current) {
        clearTimeout(budgetUpdateTimerRef.current);
        budgetUpdateTimerRef.current = null;
      }
      // Apply any pending delta before cleanup
      if (pendingDeltaRef.current > 0) {
        const finalBudget = Math.max(currentBudgetRef.current - pendingDeltaRef.current, 0);
        currentBudgetRef.current = finalBudget;
        setMinHeightBudget(finalBudget);
        pendingDeltaRef.current = 0;
      }
    };
  }, [agentMode, trackedUserIndex, messages.length, getContainer]);

  // Effect: Handle streaming start and message deletion
  useEffect(() => {
    if (!agentMode) return;

    const currentMessages = messagesRef.current;
    const wasStreaming = previousInProgressRef.current;
    const isNowStreaming = inProgress;
    const prevLength = previousMessagesLengthRef.current;

    // Log message count changes
    if (currentMessages.length !== prevLength) {
      console.log('[BLANKSIZE] Message count changed:', {
        prevLength,
        newLength: currentMessages.length,
        change: currentMessages.length - prevLength,
        trackedUserIndex,
        lastMessageRole:
          currentMessages.length > 0 ? (currentMessages[currentMessages.length - 1] as any)?.role : 'N/A',
      });
    }

    // Update refs
    previousInProgressRef.current = inProgress;
    previousMessagesLengthRef.current = currentMessages.length;

    // Messages deleted - clear tracking
    if (currentMessages.length < prevLength) {
      console.log('[BLANKSIZE] Messages deleted, clearing trackedUserIndex');
      setTrackedUserIndex(null);
      return;
    }

    // Streaming just started (new user message sent)
    if (!wasStreaming && isNowStreaming) {
      shouldStickToBottomRef.current = false;

      // Find user message index (second to last, since assistant message is added after)
      const userIndex = currentMessages.length - 2;
      if (userIndex < 0) {
        console.log('[BLANKSIZE] Streaming started but userIndex < 0, skipping');
        return;
      }

      console.log('[BLANKSIZE] Streaming started:', {
        userIndex,
        messageCount: currentMessages.length,
        userMessageId: (currentMessages[userIndex] as any)?.id?.toString().slice(0, 12),
        lastMessageId: (currentMessages[currentMessages.length - 1] as any)?.id?.toString().slice(0, 12),
        lastMessageRole: (currentMessages[currentMessages.length - 1] as any)?.role,
      });

      // Reset budget tracking for new turn
      budgetInitializedRef.current = false;
      trackedHeightsRef.current.clear();

      setTrackedUserIndex(userIndex);

      // Wait for items to mount, then scroll user message to top
      setTimeout(() => {
        if (!vListRef.current) return;
        console.log('[BLANKSIZE] Scrolling user message to top, index:', userIndex);
        vListRef.current.scrollToIndex(userIndex, { align: 'start', smooth: true });
      }, 50);

      // Note: shouldStickToBottomRef will be enabled by the blankSize effect
      // when content grows beyond viewport (blankSize becomes 0)
    }
  }, [agentMode, inProgress, messages.length, shouldStickToBottomRef]);

  // Effect: Enable scroll-to-bottom when content exceeds viewport (blankSize becomes 0)
  // This allows the user message to scroll out of view as the assistant message grows
  useEffect(() => {
    if (!agentMode || !inProgress || trackedUserIndex === null) return;

    // When blankSize is 0, content has exceeded viewport - enable scroll-to-bottom
    if (blankSize === 0 && !shouldStickToBottomRef.current) {
      shouldStickToBottomRef.current = true;
      scrollLog('📐 Content exceeded viewport - auto-scroll enabled');
    }
  }, [agentMode, inProgress, trackedUserIndex, blankSize, shouldStickToBottomRef]);

  // Early return if no valid messages
  if (!MessageRenderer) {
    return (
      <div className="copilotKitMessages">
        <footer className="copilotKitMessagesFooter">{children}</footer>
      </div>
    );
  }

  return (
    <div className="copilotKitMessages" style={{ position: 'relative' }}>
      {/* Floating Sticky Header */}
      {stickyMessage && UserMessage && (
        <div className="sticky-message-header" role="presentation">
          <UserMessage
            message={stickyMessage as any}
            ImageRenderer={ImageRenderer}
            rawData={undefined}
            // Passing standard props, styling handled by CSS .sticky-message-header class
          />
        </div>
      )}

      <VList ref={vListRef} className="copilotKitMessagesContainer" onScroll={handleScroll}>
        {messages.map((message, index) => {
          const messageKey = String(message.id || `message-${index}`);
          const isLastMessage = index === messages.length - 1;

          // Apply blankSize to LAST message (dynamically)
          const shouldApplyBlankSize = agentMode && isLastMessage && blankSize > 0;

          // Log when blankSize is applied
          if (isLastMessage && agentMode && trackedUserIndex !== null) {
            console.log('[BLANKSIZE] Rendering last message:', {
              index,
              messageId: String(message.id).slice(0, 12),
              role: (message as any).role,
              shouldApplyBlankSize,
              blankSize: Math.round(blankSize),
              trackedUserIndex,
            });
          }

          return (
            <div
              key={messageKey}
              data-message-wrapper="true"
              data-wrapper-index={index}
              style={shouldApplyBlankSize ? { minHeight: `${blankSize}px` } : undefined}>
              <MessageRenderer
                message={message}
                inProgress={inProgress}
                index={index}
                isCurrentMessage={isLastMessage}
                AssistantMessage={AssistantMessage}
                UserMessage={UserMessage}
                ImageRenderer={ImageRenderer}
                onRegenerate={onRegenerate}
                onCopy={onCopy}
                onThumbsUp={onThumbsUp}
                onThumbsDown={onThumbsDown}
                markdownTagRenderers={markdownTagRenderers}
              />
            </div>
          );
        })}
      </VList>
      {interrupt}
      {chatError && ErrorMessage && <ErrorMessage error={chatError} isCurrentMessage />}
      <footer className="copilotKitMessagesFooter">{children}</footer>
    </div>
  );
};

// --- Helpers & Hooks ---

/**
 * Hook to manage message processing and filtering
 */
const useProcessedMessages = (initialLabel: string | string[] | undefined, visibleMessages: Message[]) => {
  const initialMessages = useMemo(() => makeInitialMessages(initialLabel), [initialLabel]);

  const messages = useMemo(() => {
    const allMessages = [...initialMessages, ...visibleMessages];
    return allMessages.filter((msg): msg is Message => {
      return msg != null && typeof msg === 'object' && 'id' in msg;
    });
  }, [initialMessages, visibleMessages]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  return { messages, messagesRef };
};

/**
 * Hook to get and cache the container ref
 */
const useContainerRef = () => {
  const containerRef = useRef<HTMLElement | null>(null);
  return useCallback(() => {
    if (!containerRef.current) {
      containerRef.current = document.querySelector('.copilotKitMessagesContainer') as HTMLElement;
    }
    return containerRef.current;
  }, []);
};

/**
 * Hook to handle all auto-scroll behavior
 */
const useAutoScroll = (
  messages: Message[],
  messagesRef: React.MutableRefObject<Message[]>,
  inProgress: boolean,
  agentMode: boolean,
  vListRef: React.RefObject<VListHandle | null>,
  getContainer: () => HTMLElement,
) => {
  const isAutoScrollingRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);

  // Use refs for values that callbacks need to read (avoids stale closures)
  const inProgressRef = useRef(inProgress);
  const agentModeRef = useRef(agentMode);

  // Track previous inProgress state to detect streaming end
  const prevInProgressRef = useRef(inProgress);

  // Keep refs in sync and reset shouldStickToBottom when streaming ends
  useEffect(() => {
    const wasStreaming = prevInProgressRef.current;
    const isNowStreaming = inProgress;

    // Update refs
    prevInProgressRef.current = inProgress;
    inProgressRef.current = inProgress;
    agentModeRef.current = agentMode;

    // Reset shouldStickToBottom when streaming ends (so next message starts with auto-scroll enabled)
    if (wasStreaming && !isNowStreaming) {
      shouldStickToBottomRef.current = true;
      scrollLog('🔄 Streaming ended - auto-scroll re-enabled for next message');
    }
  }, [inProgress, agentMode]);

  // Unified scroll logic for streaming and content changes
  useEffect(() => {
    const currentMessages = messagesRef.current;
    if (!vListRef.current || currentMessages.length === 0) {
      return;
    }

    const container = getContainer();
    if (!container) return undefined;

    // Helper to scroll to bottom during streaming
    const maintainBottomScroll = () => {
      if (!vListRef.current) return;

      const isCurrentlyStreaming = inProgressRef.current;
      const shouldScroll = shouldStickToBottomRef.current;

      // Auto-scroll during streaming when enabled
      if (isCurrentlyStreaming && shouldScroll) {
        isAutoScrollingRef.current = true;
        const currentMessages = messagesRef.current;
        if (currentMessages.length > 0) {
          vListRef.current.scrollToIndex(currentMessages.length - 1, { align: 'end' });
        }
        setTimeout(() => {
          isAutoScrollingRef.current = false;
          // Trigger scroll event to update sticky header
          const container = getContainer();
          if (container) {
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
          }
        }, AUTO_SCROLL_FLAG_DURATION);
      }
    };

    // 1. Initial scroll to bottom on mount/update (skip in agent mode)
    if (!agentMode) {
      requestAnimationFrame(() => {
        requestAnimationFrame(maintainBottomScroll);
      });
    }

    // 2. Observer for content changes (streaming growth)
    const resizeObserver = new ResizeObserver(() => {
      if (inProgressRef.current) {
        maintainBottomScroll();
      } else if (!agentModeRef.current && isAtBottom(container)) {
        maintainBottomScroll();
      }
    });

    resizeObserver.observe(container);
    const lastMessage = container.querySelector('[data-message-id]:last-of-type');
    if (lastMessage) resizeObserver.observe(lastMessage);

    // 3. Interval safety net during streaming
    let intervalId: NodeJS.Timeout | null = null;
    if (inProgress) {
      intervalId = setInterval(maintainBottomScroll, 100);
    }

    return () => {
      resizeObserver.disconnect();
      if (intervalId) clearInterval(intervalId);
    };
  }, [inProgress, messages.length, agentMode, getContainer, vListRef]);

  // Scroll to bottom when messages are initially loaded or tab opens
  // Uses a composite signature to detect message set changes more reliably
  const lastScrollSignatureRef = useRef<string>('');
  const scrollAbortRef = useRef<boolean>(false);
  const hasAgentModeInitialScrollRef = useRef<boolean>(false);

  useEffect(() => {
    const len = messages.length;
    if (len === 0) {
      // Don't reset scroll signature when messages are temporarily empty (hydration)
      // This prevents duplicate scroll sequences when messages are restored
      scrollLog('No messages, skipping scroll (preserving signature for hydration)');
      return;
    }

    // ========= AGENT MODE: ONE-TIME SCROLL TO BOTTOM ON TAB OPEN =========
    if (agentModeRef.current) {
      // Only perform a single initial bottom scroll per mount in agent mode
      if (hasAgentModeInitialScrollRef.current) {
        scrollLog('Agent mode: initial bottom scroll already performed, skipping');
        return;
      }

      scrollLog('Agent mode: performing one-time initial bottom scroll');
      hasAgentModeInitialScrollRef.current = true;
      scrollAbortRef.current = false;
      isAutoScrollingRef.current = true;

      const performInitialAgentScroll = async () => {
        const isReady = await waitForVListReady(vListRef, getContainer, len);
        if (scrollAbortRef.current) {
          scrollLog('Agent mode: initial scroll aborted');
          isAutoScrollingRef.current = false;
          return;
        }
        if (!isReady) {
          scrollLog('Agent mode: VList not ready, skipping initial scroll');
          isAutoScrollingRef.current = false;
          return;
        }

        const currentLen = messagesRef.current.length;
        if (currentLen === 0 || !vListRef.current) {
          scrollLog('Agent mode: no messages or VList unavailable for initial scroll');
          isAutoScrollingRef.current = false;
          return;
        }

        scrollLog(`Agent mode: scrolling to index ${currentLen - 1} on tab open`);
        vListRef.current.scrollToIndex(currentLen - 1, { align: 'end' });
        isAutoScrollingRef.current = false;
      };

      performInitialAgentScroll();

      return () => {
        scrollLog('Agent mode: cleanup, aborting initial bottom scroll if pending');
        scrollAbortRef.current = true;
      };
    }

    // Create a composite signature using first message ID + count + last message ID
    // This catches more cases: session switch, message load, and content changes
    const firstId = String(messages[0]?.id || '');
    const lastId = String(messages[len - 1]?.id || '');
    const currentSignature = `${firstId}:${len}:${lastId}`;

    const hasMessagesChanged = lastScrollSignatureRef.current !== currentSignature;

    scrollLog('Checking scroll trigger:', {
      currentSignature: currentSignature.slice(0, 50),
      previousSignature: lastScrollSignatureRef.current.slice(0, 50),
      hasMessagesChanged,
      messageCount: len,
    });

    // If messages changed (new session/tab/load), scroll to bottom
    if (hasMessagesChanged) {
      scrollLog('📜 Messages changed, waiting for VList to be ready...');
      // Don't commit signature yet - only after scroll succeeds
      const targetSignature = currentSignature;
      scrollAbortRef.current = false;
      isAutoScrollingRef.current = true;

      // Async scroll function that waits for VList to be ready
      const performScroll = async () => {
        // Wait for VList to be ready (mounted and has rendered items)
        const isReady = await waitForVListReady(vListRef, getContainer, len);

        // Check if we should abort (component unmounted or new scroll started)
        if (scrollAbortRef.current) {
          scrollLog('Scroll aborted (cleanup called) - signature NOT committed, will retry on next render');
          isAutoScrollingRef.current = false;
          return;
        }

        if (!isReady) {
          scrollLog('❌ VList never became ready, skipping scroll');
          isAutoScrollingRef.current = false;
          return;
        }

        // VList is ready, now scroll
        const currentLen = messagesRef.current.length;
        if (currentLen === 0 || !vListRef.current) {
          scrollLog('❌ No messages or VList unavailable after ready check');
          isAutoScrollingRef.current = false;
          return;
        }

        scrollLog(`Scrolling to index ${currentLen - 1}`);

        try {
          vListRef.current.scrollToIndex(currentLen - 1, { align: 'end' });
          // Commit signature now that scroll was initiated
          lastScrollSignatureRef.current = targetSignature;
          scrollLog('✅ Scroll command sent, signature committed');

          // Give VList time to settle, then verify
          await new Promise(resolve => setTimeout(resolve, SCROLL_SETTLE_DELAY));

          if (scrollAbortRef.current) return;

          // Verify scroll position
          const container = getContainer();
          if (container) {
            const isAtBottomNow = isAtBottom(container);
            scrollLog('Verify scroll position:', {
              isAtBottom: isAtBottomNow,
              scrollTop: container.scrollTop,
              scrollHeight: container.scrollHeight,
              clientHeight: container.clientHeight,
            });

            // Retry once if not at bottom
            if (!isAtBottomNow && vListRef.current) {
              scrollLog('⚠️ Not at bottom, retrying...');
              vListRef.current.scrollToIndex(currentLen - 1, { align: 'end' });

              // One more verification after retry
              await new Promise(resolve => setTimeout(resolve, SCROLL_SETTLE_DELAY));
              if (!scrollAbortRef.current && container) {
                const finalCheck = isAtBottom(container);
                scrollLog(finalCheck ? '✅ Scroll successful after retry' : '❌ Scroll failed after retry');
              }
            }
          }
        } catch (error) {
          scrollLog('❌ Scroll failed:', error);
        } finally {
          isAutoScrollingRef.current = false;
          scrollLog('Scroll sequence complete');

          // Trigger a scroll event to update sticky header
          // This ensures the sticky header is calculated after auto-scroll completes
          const container = getContainer();
          if (container) {
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
          }
        }
      };

      // Start the scroll process
      performScroll();

      return () => {
        scrollLog('Cleanup: Aborting scroll');
        scrollAbortRef.current = true;
      };
    }

    return undefined;
  }, [messages.length, messages[0]?.id, messages[messages.length - 1]?.id, getContainer, agentModeRef]); // Depend on first AND last message ID

  // Track previous messages length to detect new messages (not initial load)
  const prevMessagesLengthRef = useRef(messages.length);

  // Auto-scroll when new messages arrive (not on initial load)
  useEffect(() => {
    const prevLength = prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (!vListRef.current || messages.length === 0) {
      return;
    }

    // Only scroll when messages are ADDED (not on initial load or deletion)
    if (messages.length <= prevLength) {
      return;
    }

    if (agentModeRef.current && !inProgressRef.current) {
      return;
    }

    // Scroll to bottom when new messages arrive
    isAutoScrollingRef.current = true;
    vListRef.current.scrollToIndex(messages.length - 1, { align: 'end' });

    setTimeout(() => {
      isAutoScrollingRef.current = false;
      // Trigger scroll event to update sticky header
      const container = getContainer();
      if (container) {
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    }, 100);
  }, [messages.length, getContainer]);

  return { isAutoScrollingRef, shouldStickToBottomRef };
};

/**
 * Hook to manage sticky user messages and user scroll detection
 */
const useStickyUserMessage = (
  messagesRef: React.MutableRefObject<Message[]>,
  agentMode: boolean,
  vListRef: React.RefObject<VListHandle | null>,
  isAutoScrollingRef: React.MutableRefObject<boolean>,
  inProgress: boolean,
  shouldStickToBottomRef: React.MutableRefObject<boolean>,
  getContainer: () => HTMLElement,
) => {
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null);

  // Disable sticky in agent mode ONLY when streaming
  useEffect(() => {
    if (agentMode && inProgress && stickyMessageId !== null) {
      setStickyMessageId(null);
    }
  }, [agentMode, inProgress, stickyMessageId]);

  // Handle scroll using VList's findItemIndex API
  const handleScroll = useCallback(
    (offset: number) => {
      // ============== USER SCROLL DETECTION ==============
      // When user manually scrolls during streaming, detect if they scrolled away from bottom
      // This allows users to scroll up to read earlier content without being forced back down
      if (!isAutoScrollingRef.current && inProgress) {
        const container = getContainer();
        if (container) {
          const atBottom = isAtBottom(container);
          // Only update if the value actually changed to avoid unnecessary updates
          if (shouldStickToBottomRef.current !== atBottom) {
            shouldStickToBottomRef.current = atBottom;
            if (!atBottom) {
              scrollLog('👆 User scrolled away from bottom - auto-scroll disabled');
            } else {
              scrollLog('👇 User scrolled back to bottom - auto-scroll re-enabled');
            }
          }
        }
      }

      // ============== STICKY MESSAGE LOGIC ==============
      // Disable sticky in agent mode only when streaming
      if (agentMode && inProgress) {
        if (stickyMessageId !== null) {
          setStickyMessageId(null);
        }
        return;
      }

      const currentMessages = messagesRef.current;

      // Skip during auto-scroll or if no messages
      if (isAutoScrollingRef.current || currentMessages.length === 0) return;

      const vList = vListRef.current;
      if (!vList) return;

      // Use findItemIndex to get the item index at the scroll offset
      const topItemIndex = vList.findItemIndex(offset);

      // Guard against invalid index
      if (topItemIndex < 0 || topItemIndex >= currentMessages.length) return;

      // If at the top (index 0), no sticky needed
      if (topItemIndex === 0) {
        if (stickyMessageId !== null) {
          setStickyMessageId(null);
        }
        return;
      }

      // Find the topmost visible assistant message starting from topItemIndex
      let topmostVisibleAssistantIndex = -1;
      for (let i = topItemIndex; i < currentMessages.length; i++) {
        const message = currentMessages[i];
        if (message && typeof message === 'object' && 'role' in message && (message as any).role === 'assistant') {
          topmostVisibleAssistantIndex = i;
          break;
        }
      }

      // Find the user message that comes before the topmost visible assistant
      let newStickyId: string | null = null;

      if (topmostVisibleAssistantIndex !== -1) {
        // Find the user message immediately before this assistant message
        for (let i = topmostVisibleAssistantIndex - 1; i >= 0; i--) {
          const message = currentMessages[i];
          if (
            message &&
            typeof message === 'object' &&
            'role' in message &&
            'id' in message &&
            (message as any).role === 'user'
          ) {
            newStickyId = String(message.id);
            break;
          }
        }
      } else {
        // No assistant visible - find the last user message before topItemIndex
        // This handles cases where we are scrolled past all assistant messages
        // or between user messages
        if (topItemIndex > 0) {
          for (let i = topItemIndex - 1; i >= 0; i--) {
            const message = currentMessages[i];
            if (
              message &&
              typeof message === 'object' &&
              'role' in message &&
              'id' in message &&
              (message as any).role === 'user'
            ) {
              newStickyId = String(message.id);
              break;
            }
          }
        }
      }

      // Update sticky state if changed
      if (stickyMessageId !== newStickyId) {
        setStickyMessageId(newStickyId);
      }
    },
    [stickyMessageId, agentMode, inProgress, getContainer],
  );

  return { stickyMessageId, handleScroll };
};

/**
 * Creates initial messages from labels configuration
 */
function makeInitialMessages(initial: string | string[] | undefined): Message[] {
  if (!initial) return [];

  if (Array.isArray(initial)) {
    return initial.map(message => {
      return {
        id: message,
        role: 'assistant',
        content: message,
      };
    });
  }

  return [
    {
      id: initial,
      role: 'assistant',
      content: initial,
    },
  ];
}

/**
 * Checks if the container is scrolled to the bottom within a threshold
 */
function isAtBottom(container: HTMLElement, threshold: number = SCROLL_BOTTOM_THRESHOLD): boolean {
  const maxScroll = container.scrollHeight - container.clientHeight;
  const currentScroll = container.scrollTop;
  return maxScroll - currentScroll < threshold;
}
