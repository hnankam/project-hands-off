import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { useCopilotChatHeadless_c } from "@copilotkit/react-core";
import { useChatContext } from "@copilotkit/react-ui";
import type { MessagesProps } from "@copilotkit/react-ui";
import { VList, type VListHandle } from "virtua";
import type { Message } from "@copilotkit/shared";

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
  maxWaitMs: number = SCROLL_READY_MAX_WAIT
): Promise<boolean> => {
  return new Promise((resolve) => {
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
          waitTime: Date.now() - startTime
        });
        resolve(true);
        return;
      }
      
      // Check timeout
      if (Date.now() - startTime > maxWaitMs) {
        scrollLog('⚠️ VList ready timeout, proceeding anyway:', {
          renderedItems: renderedItems.length,
          scrollHeight: container.scrollHeight
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
    getContainer
  );

  // Determine which render component to use
  const MessageRenderer = RenderMessage;

  // Internal sticky state - managed via floating header
  const { stickyMessageId, handleScroll } = useStickyUserMessage(
    messagesRef,
    agentMode,
    vListRef,
    isAutoScrollingRef,
    inProgress
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

  // ============== AGENT MODE BLANKSIZE LOGIC ==============
  // Based on Virtua Chatbot example with dynamic calculation for tool messages:
  // Key formula: blankSize = viewport - userHeight - heightOfAllMessagesBetweenUserAndLast
  
  const [trackedUserIndex, setTrackedUserIndex] = useState<number | null>(null);
  const [measureTrigger, setMeasureTrigger] = useState(0); // Trigger re-calculation after VList measures
  const previousInProgressRef = useRef<boolean>(false);
  const previousMessagesLengthRef = useRef<number>(0);
  const lastValidBlankSizeRef = useRef<number>(0); // Store last valid blankSize to avoid flicker
  
  // Calculate blankSize synchronously using useMemo (prevents flash)
  const blankSize = useMemo(() => {
    // Include measureTrigger in deps to allow re-calculation after VList measures
    void measureTrigger;
    
    if (!agentMode || trackedUserIndex === null) {
      lastValidBlankSizeRef.current = 0;
      return 0;
    }
    
    const handle = vListRef.current;
    if (!handle) return lastValidBlankSizeRef.current;
    
    const currentMessages = messagesRef.current;
    const lastIndex = currentMessages.length - 1;
    
    if (lastIndex <= trackedUserIndex) {
      lastValidBlankSizeRef.current = 0;
      return 0;
    }
    
    // Sum heights of all messages from user to second-to-last (excluding last which gets blankSize)
    let totalHeight = 0;
    let allMeasured = true;
    
    for (let i = trackedUserIndex; i < lastIndex; i++) {
      const size = handle.getItemSize(i);
      if (size <= 0) {
        allMeasured = false;
        break; // Stop if any item is unmeasured
      }
      totalHeight += size;
    }
    
    // If not all items are measured, keep the previous valid blankSize
    if (!allMeasured) {
      return lastValidBlankSizeRef.current;
    }
    
    // blankSize = viewport - totalHeight (user + all messages between user and last)
    const newBlankSize = Math.max(handle.viewportSize - totalHeight, 0);
    lastValidBlankSizeRef.current = newBlankSize;
    return newBlankSize;
  }, [agentMode, trackedUserIndex, messages.length, measureTrigger]);
  
  // Effect: Trigger re-calculation after VList has time to measure new items
  useEffect(() => {
    if (!agentMode || trackedUserIndex === null) return;
    
    const timeoutId = setTimeout(() => {
      setMeasureTrigger(prev => prev + 1);
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [agentMode, trackedUserIndex, messages.length]);
  
  // Effect: Handle streaming start and message deletion
  useEffect(() => {
    if (!agentMode) return;
    
    const currentMessages = messagesRef.current;
    const wasStreaming = previousInProgressRef.current;
    const isNowStreaming = inProgress;
    const prevLength = previousMessagesLengthRef.current;
    
    // Update refs
    previousInProgressRef.current = inProgress;
    previousMessagesLengthRef.current = currentMessages.length;
    
    // Messages deleted - clear tracking
    if (currentMessages.length < prevLength) {
      setTrackedUserIndex(null);
      return;
    }
    
    // Streaming just started (new user message sent)
    if (!wasStreaming && isNowStreaming) {
      shouldStickToBottomRef.current = false;
      
      // Find user message index (second to last, since assistant message is added after)
      const userIndex = currentMessages.length - 2;
      if (userIndex < 0) return;
      
      setTrackedUserIndex(userIndex);
      
      // Wait for items to mount, then scroll
      setTimeout(() => {
        if (!vListRef.current) return;
        vListRef.current.scrollToIndex(userIndex, { align: "start", smooth: true });
      }, 50);
      
      // Enable stick-to-bottom after delay
      setTimeout(() => {
        shouldStickToBottomRef.current = true;
      }, 200);
    }
  }, [agentMode, inProgress, messages.length, shouldStickToBottomRef]);

  // Early return if no valid messages
  if (!MessageRenderer) {
    return (
      <div className="copilotKitMessages">
        <footer className="copilotKitMessagesFooter">
          {children}
        </footer>
      </div>
    );
  }

  return (
    <div className="copilotKitMessages" style={{ position: 'relative' }}>
      {/* Floating Sticky Header */}
      {stickyMessage && UserMessage && (
        <div 
          className="sticky-message-header"
          role="presentation"
        >
          <UserMessage 
            message={stickyMessage as any}
            ImageRenderer={ImageRenderer}
            rawData={undefined}
            // Passing standard props, styling handled by CSS .sticky-message-header class
          />
        </div>
      )}

      <VList 
        ref={vListRef} 
        className="copilotKitMessagesContainer"
        onScroll={handleScroll}
      >
          {messages.map((message, index) => {
          const messageKey = String(message.id || `message-${index}`);
          const isLastMessage = index === messages.length - 1;
          
          // Apply blankSize to LAST message (dynamically)
          const shouldApplyBlankSize = agentMode && isLastMessage && blankSize > 0;
            
            return (
              <div
              key={messageKey}
                data-message-wrapper="true"
                style={shouldApplyBlankSize ? { minHeight: `${blankSize}px` } : undefined}
              >
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
      <footer className="copilotKitMessagesFooter">
        {children}
      </footer>
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
  getContainer: () => HTMLElement
) => {
  const isAutoScrollingRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  
  // Use refs for values that callbacks need to read (avoids stale closures)
  const inProgressRef = useRef(inProgress);
  const agentModeRef = useRef(agentMode);

  // Keep refs in sync
  useEffect(() => {
    inProgressRef.current = inProgress;
    agentModeRef.current = agentMode;
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
          vListRef.current.scrollToIndex(currentMessages.length - 1, { align: "end" });
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
  
  useEffect(() => {
    const len = messages.length;
    if (len === 0) {
      // Don't reset scroll signature when messages are temporarily empty (hydration)
      // This prevents duplicate scroll sequences when messages are restored
      scrollLog('No messages, skipping scroll (preserving signature for hydration)');
      return;
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
      messageCount: len
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
          vListRef.current.scrollToIndex(currentLen - 1, { align: "end" });
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
              clientHeight: container.clientHeight
            });
            
            // Retry once if not at bottom
            if (!isAtBottomNow && vListRef.current) {
              scrollLog('⚠️ Not at bottom, retrying...');
              vListRef.current.scrollToIndex(currentLen - 1, { align: "end" });
              
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
  }, [messages.length, messages[0]?.id, messages[messages.length - 1]?.id, getContainer]); // Depend on first AND last message ID

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
    vListRef.current.scrollToIndex(messages.length - 1, { align: "end" });

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
 * Hook to manage sticky user messages
 */
const useStickyUserMessage = (
  messagesRef: React.MutableRefObject<Message[]>,
  agentMode: boolean,
  vListRef: React.RefObject<VListHandle | null>,
  isAutoScrollingRef: React.MutableRefObject<boolean>,
  inProgress: boolean
) => {
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null);

  // Disable sticky in agent mode ONLY when streaming
  useEffect(() => {
    if (agentMode && inProgress && stickyMessageId !== null) {
      setStickyMessageId(null);
    }
  }, [agentMode, inProgress, stickyMessageId]);

  // Handle scroll using VList's findItemIndex API
  const handleScroll = useCallback((offset: number) => {
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
        if (message && typeof message === 'object' && 'role' in message && 'id' in message && (message as any).role === 'user') {
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
          if (message && typeof message === 'object' && 'role' in message && 'id' in message && (message as any).role === 'user') {
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
  }, [stickyMessageId, agentMode, inProgress]);

  return { stickyMessageId, handleScroll };
};

/**
 * Creates initial messages from labels configuration
 */
function makeInitialMessages(initial: string | string[] | undefined): Message[] {
  if (!initial) return [];

  if (Array.isArray(initial)) {
    return initial.map((message) => {
      return {
        id: message,
        role: "assistant",
        content: message,
      };
    });
  }

  return [
    {
      id: initial,
      role: "assistant",
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
  return (maxScroll - currentScroll) < threshold;
}
