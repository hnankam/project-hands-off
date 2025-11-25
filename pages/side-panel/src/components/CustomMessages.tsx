import { useEffect, useLayoutEffect, useMemo, useRef, useCallback, useState } from "react";
import { useCopilotChatHeadless_c } from "@copilotkit/react-core";
import { useChatContext } from "@copilotkit/react-ui";
import type { MessagesProps } from "@copilotkit/react-ui";
import { VList, type VListHandle } from "virtua";
import type { Message } from "@copilotkit/shared";

/**
 * Custom Messages Component for CopilotChat
 * 
 * Based on CopilotKit's Messages component implementation:
 * https://github.com/CopilotKit/CopilotKit/blob/main/CopilotKit/packages/react-ui/src/components/chat/Messages.tsx
 * 
 * Features:
 * - Renders all chat messages with custom message components
 * - Virtual scrolling with Virtua for optimal performance with large message lists
 * - Sticky user messages using Virtua's official pattern (disabled in agent mode)
 * - Auto-scrolls to bottom when new messages arrive
 * - Agent mode: scrolls user message to top when streaming starts (Virtua Chat pattern)
 * - Handles initial messages from labels
 * - Supports custom AssistantMessage and UserMessage components
 * - Supports custom markdown renderers and image renderer
 * - Shows error messages and interrupts
 * - Maintains user scroll position when scrolled up
 */

// Layout and timing constants
const AUTO_SCROLL_FLAG_DURATION = 50; // Duration to keep auto-scroll flag active (ms)
  const INITIAL_SCROLL_DELAY = 300; // Delay before initial scroll on mount (ms)
const SCROLL_BOTTOM_THRESHOLD = 20; // Distance from bottom to consider "at bottom" (px)

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
  const previousStickyIdRef = useRef<string | null>(null);

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

  // Determine which render component to use (default to RenderMessage from CopilotKit)
  const MessageRenderer = RenderMessage;

  // Internal sticky state - managed entirely in this component
  // In agent mode: disabled during streaming, enabled when not streaming
  const { stickyMessageId, keepMounted, handleScroll } = useStickyUserMessage(
    messages,
    messagesRef,
    agentMode,
    vListRef,
    getContainer,
    MessageRenderer,
    isAutoScrollingRef,
    inProgress
  );

  // ============== AGENT MODE BLANKSIZE LOGIC ==============
  // Based on Virtua Chatbot example with dynamic calculation for tool messages:
  // https://github.com/inokawa/virtua/blob/main/stories/react/advanced/Chatbot.stories.tsx
  //
  // Key formula: blankSize = viewport - userHeight - heightOfAllMessagesBetweenUserAndLast
  // This keeps user message at top as new messages arrive (blankSize shrinks proportionally)
  
  const [trackedUserIndex, setTrackedUserIndex] = useState<number | null>(null);
  const [measureTrigger, setMeasureTrigger] = useState(0); // Trigger re-calculation after VList measures
  const previousInProgressRef = useRef<boolean>(false);
  const previousMessagesLengthRef = useRef<number>(0);
  const lastValidBlankSizeRef = useRef<number>(0); // Store last valid blankSize to avoid flicker
  
  // Calculate blankSize synchronously using useMemo (prevents flash)
  // This runs during render, before paint, so UI never shows wrong position
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
    // This prevents flicker when new messages arrive before VList measures them
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
    
    // Wait for VList to measure, then trigger re-calculation
    const timeoutId = setTimeout(() => {
      setMeasureTrigger(prev => prev + 1);
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [agentMode, trackedUserIndex, messages.length]);
  
  // Effect: Handle streaming start and message deletion
  useEffect(() => {
    if (!agentMode) return;
    
    const handle = vListRef.current;
    if (!handle) return;
    
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

  // Early return if no valid messages to prevent rendering errors
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
    <div className="copilotKitMessages">
      <VList 
        ref={vListRef} 
        className="copilotKitMessagesContainer"
        keepMounted={keepMounted}
        onScroll={handleScroll}
      >
          {messages.map((message, index) => {
          const messageKey = String(message.id || `message-${index}`);
          const isLastMessage = index === messages.length - 1;
          
          // Apply blankSize to LAST message (dynamically)
          // blankSize is recalculated to account for all messages between user and last
          // Formula: blankSize = viewport - userHeight - allMessageHeightsBetween
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
 * 
 * In agent mode, follows the Virtua Chat example pattern:
 * https://github.com/inokawa/virtua/blob/main/stories/react/advanced/Chat.stories.tsx
 * - When streaming starts, scroll the AI message to the top of viewport (align: "start")
 * - This places the user message at/near the top, with AI response streaming below
 * - Disable auto-scroll to bottom during streaming
 * - Re-enable after streaming completes
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
    // Uses refs to always get current values (avoids stale closure issues)
    const maintainBottomScroll = () => {
      if (!vListRef.current) return;
      
      // Check current values via refs (not stale closure values)
      const isCurrentlyStreaming = inProgressRef.current;
      const shouldScroll = shouldStickToBottomRef.current;
      
      // Auto-scroll during streaming when enabled
      if (isCurrentlyStreaming && shouldScroll) {
      isAutoScrollingRef.current = true;
        // Use Virtua's API for virtual list scrolling (not browser scrollTop)
        const currentMessages = messagesRef.current;
        if (currentMessages.length > 0) {
          vListRef.current.scrollToIndex(currentMessages.length - 1, { align: "end" });
        }
      setTimeout(() => {
        isAutoScrollingRef.current = false;
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
      // Use ref to get current streaming state
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

  // Initial scroll to bottom on tab open - runs ONCE on mount
  // Uses multiple attempts because VList needs time to render virtualized items
  useEffect(() => {
    const scrollToEnd = () => {
      if (!vListRef.current) return;
      const len = messagesRef.current.length;
      if (len === 0) return;
      // Use VList's scrollToIndex (DOM scroll won't work with virtualized items)
      vListRef.current.scrollToIndex(len - 1, { align: "end" });
    };
    
    isAutoScrollingRef.current = true;
    
    // Multiple scroll attempts to ensure we reach the end
    // VList needs time to render items, so we retry a few times
    const attempts = [50, 150, INITIAL_SCROLL_DELAY, 500];
    const timeoutIds: NodeJS.Timeout[] = [];
    
    attempts.forEach((delay) => {
      timeoutIds.push(setTimeout(scrollToEnd, delay));
    });
    
    // Reset auto-scroll flag after all attempts
    timeoutIds.push(setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 600));
    
    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = runs once on mount

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
    
    // In agent mode when NOT streaming, don't auto-scroll (preserve user message position)
    // Use ref to get current streaming state
    if (agentModeRef.current && !inProgressRef.current) {
      return;
    }
    
    // Scroll to bottom when new messages arrive
        isAutoScrollingRef.current = true;
    vListRef.current.scrollToIndex(messages.length - 1, { align: "end" });

            setTimeout(() => {
              isAutoScrollingRef.current = false;
    }, 100);
  }, [messages.length]);

  return { isAutoScrollingRef, shouldStickToBottomRef };
};

/**
 * Hook to manage sticky user messages
 */
const useStickyUserMessage = (
  messages: Message[],
  messagesRef: React.MutableRefObject<Message[]>,
  agentMode: boolean,
  vListRef: React.RefObject<VListHandle | null>,
  getContainer: () => HTMLElement,
  MessageRenderer: React.ComponentType<any> | undefined,
  isAutoScrollingRef: React.MutableRefObject<boolean>,
  inProgress: boolean
) => {
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null);
  const [stickyMessageIndex, setStickyMessageIndex] = useState<number | null>(null);
  const previousStickyIdRef = useRef<string | null>(null);
  const currentStickyWrapperRef = useRef<HTMLElement | null>(null);

  // Disable sticky in agent mode ONLY when streaming
  // When not streaming, sticky messages are enabled in agent mode
  useEffect(() => {
    if (agentMode && inProgress && stickyMessageId !== null) {
      setStickyMessageId(null);
      setStickyMessageIndex(null);
    }
  }, [agentMode, inProgress, stickyMessageId]);

  // Handle scroll using VList's findItemIndex API
  const handleScroll = useCallback((offset: number) => {
    // Disable sticky in agent mode only when streaming
    if (agentMode && inProgress) {
      if (stickyMessageId !== null) {
        setStickyMessageId(null);
        setStickyMessageIndex(null);
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
        setStickyMessageIndex(null);
      }
      return;
    }

    // Find the topmost visible assistant message starting from topItemIndex
    let topmostVisibleAssistantIndex = -1;
    for (let i = topItemIndex; i < currentMessages.length; i++) {
      const message = currentMessages[i];
      if (message && typeof message === 'object' && 'role' in message && message.role === 'assistant') {
        topmostVisibleAssistantIndex = i;
        break;
      }
    }

    // Find the user message that comes before the topmost visible assistant
    let newStickyId: string | null = null;
    let newStickyIndex: number | null = null;

    if (topmostVisibleAssistantIndex !== -1) {
      // Find the user message immediately before this assistant message
      for (let i = topmostVisibleAssistantIndex - 1; i >= 0; i--) {
        const message = currentMessages[i];
        if (message && typeof message === 'object' && 'role' in message && 'id' in message && message.role === 'user') {
          newStickyId = String(message.id);
          newStickyIndex = i;
          break;
        }
      }
    } else {
      // No assistant visible - find the last user message before topItemIndex
      if (topItemIndex > 0) {
        for (let i = topItemIndex - 1; i >= 0; i--) {
          const message = currentMessages[i];
          if (message && typeof message === 'object' && 'role' in message && 'id' in message && message.role === 'user') {
            newStickyId = String(message.id);
            newStickyIndex = i;
            break;
          }
        }
      }
    }

    // Update sticky state if changed
    if (stickyMessageId !== newStickyId) {
      setStickyMessageId(newStickyId);
      setStickyMessageIndex(newStickyIndex);
    }
  }, [stickyMessageId, agentMode, inProgress]);

  // Calculate keepMounted array
  const keepMounted = useMemo(() => {
    // Disable sticky in agent mode only when streaming
    if (agentMode && inProgress) {
      return undefined;
    }
    
    if (stickyMessageIndex !== null && 
        stickyMessageIndex !== undefined && 
        stickyMessageIndex >= 0 && 
        stickyMessageIndex < messages.length) {
      return [stickyMessageIndex];
    }
    return undefined;
  }, [stickyMessageIndex, stickyMessageId, messages.length, agentMode, inProgress]);

  // Apply sticky styles
  useEffect(() => {
    // Disable sticky in agent mode only when streaming
    if (agentMode && inProgress) {
      return;
    }
    
    if (messagesRef.current.length === 0 || !MessageRenderer) return;
    
    const previousStickyId = previousStickyIdRef.current;
    previousStickyIdRef.current = stickyMessageId;

    if (previousStickyId === undefined) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const vListContainer = getContainer();
        if (!vListContainer) return;

        const removeSticky = (messageId: string) => {
          // Try to find via ref first (in case element was recycled/ID changed)
          let virtuaWrapper = currentStickyWrapperRef.current;
          let userMessageEl: HTMLElement | null = null;

          // If we have a stored wrapper, check if it's still valid for this message
          // If it was recycled, the ID inside will be different
          if (virtuaWrapper) {
            const innerMessage = virtuaWrapper.querySelector('.copilotKitUserMessage') as HTMLElement;
            if (innerMessage) {
              userMessageEl = innerMessage;
              const currentId = innerMessage.getAttribute('data-message-id');
              
              // If ID mismatch, it was recycled. Just clear styles, don't restore position.
              if (currentId !== messageId) {
                // Recycled case
                virtuaWrapper.style.removeProperty('position');
                virtuaWrapper.style.removeProperty('z-index');
                virtuaWrapper.style.marginTop = '';
                virtuaWrapper.style.paddingTop = '';
                virtuaWrapper.removeAttribute('data-original-top');
                
                if (!virtuaWrapper.style.position) {
                  virtuaWrapper.style.position = 'absolute';
                }
                
                // Remove sticky class from whatever is inside now
                innerMessage.classList.remove('is-sticky');
                
                currentStickyWrapperRef.current = null;
                return;
              }
            }
          }

          // Normal cleanup (not recycled or ref missing)
          if (!userMessageEl) {
            userMessageEl = vListContainer.querySelector(`.copilotKitUserMessage[data-message-id="${messageId}"][data-message-role="user"]`) as HTMLElement;
          }
          
          if (!userMessageEl) {
            currentStickyWrapperRef.current = null;
            return;
          }

          if (!virtuaWrapper) {
            virtuaWrapper = findVirtuaWrapper(userMessageEl);
          }
          
          if (!virtuaWrapper) return;

          // Restore Virtua's original positioning
          const storedOriginalTop = virtuaWrapper.getAttribute('data-original-top');
          
          virtuaWrapper.style.removeProperty('position');
          virtuaWrapper.style.removeProperty('z-index');
          virtuaWrapper.style.marginTop = '';
          virtuaWrapper.style.paddingTop = '';
          
          if (storedOriginalTop) {
            virtuaWrapper.style.top = storedOriginalTop;
          } else {
            virtuaWrapper.style.removeProperty('top');
          }
          
          virtuaWrapper.removeAttribute('data-original-top');
          
          if (!virtuaWrapper.style.position) {
            virtuaWrapper.style.position = 'absolute';
          }
          
          userMessageEl.classList.remove('is-sticky');
          currentStickyWrapperRef.current = null;
          
          // Trigger Virtua recalculation
          void virtuaWrapper.offsetHeight;
          
          requestAnimationFrame(() => {
            if (window.getComputedStyle(virtuaWrapper!).position !== 'absolute') {
              virtuaWrapper!.style.position = 'absolute';
            }
            void virtuaWrapper!.offsetHeight;
          });
        };

        // Remove sticky from previous message if it changed
        if (previousStickyId && previousStickyId !== stickyMessageId) {
          removeSticky(previousStickyId);
          
          setTimeout(() => {
            if (stickyMessageId) {
              const userMessageEl = vListContainer.querySelector(`.copilotKitUserMessage[data-message-id="${stickyMessageId}"][data-message-role="user"]`) as HTMLElement;
              if (!userMessageEl) return;
              
              const virtuaWrapper = findVirtuaWrapper(userMessageEl);
              if (!virtuaWrapper || virtuaWrapper.style.position === 'sticky') return;
              
              // Store original top only if not already stored to avoid overwriting with '0px'
              if (!virtuaWrapper.hasAttribute('data-original-top')) {
                const originalTop = virtuaWrapper.style.top;
                virtuaWrapper.setAttribute('data-original-top', originalTop);
              }
              
              currentStickyWrapperRef.current = virtuaWrapper;
              
              virtuaWrapper.style.setProperty('position', 'sticky', 'important');
              virtuaWrapper.style.top = '0';
              virtuaWrapper.style.zIndex = '10001';
              virtuaWrapper.style.marginTop = '0';
              virtuaWrapper.style.paddingTop = '0';
              
              userMessageEl.classList.add('is-sticky');
            }
          }, 0);
          return;
        }

        // Apply sticky to new message if set
        if (stickyMessageId) {
          const userMessageEl = vListContainer.querySelector(`.copilotKitUserMessage[data-message-id="${stickyMessageId}"][data-message-role="user"]`) as HTMLElement;
          if (!userMessageEl) return;
          
          const virtuaWrapper = findVirtuaWrapper(userMessageEl);
          if (!virtuaWrapper || virtuaWrapper.style.position === 'sticky') return;
          
          const originalTop = virtuaWrapper.style.top;
          // Store original top only if not already stored to avoid overwriting with '0px'
          if (!virtuaWrapper.hasAttribute('data-original-top')) {
            virtuaWrapper.setAttribute('data-original-top', originalTop);
          }
          
          currentStickyWrapperRef.current = virtuaWrapper;
          
          virtuaWrapper.style.setProperty('position', 'sticky', 'important');
          virtuaWrapper.style.top = '0';
          virtuaWrapper.style.zIndex = '10001';
          virtuaWrapper.style.marginTop = '0';
          virtuaWrapper.style.paddingTop = '0';
          
          userMessageEl.classList.add('is-sticky');
        } else if (previousStickyId) {
          removeSticky(previousStickyId);
        }
      });
    });
  }, [stickyMessageId, MessageRenderer, agentMode, inProgress, getContainer]);

  return { stickyMessageId, keepMounted, handleScroll };
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
 * Finds the latest user message in the messages array
 */
function findLatestUserMessage(messages: Message[]): { id: string; index: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && typeof msg === 'object' && 'role' in msg && (msg as any).role === 'user' && 'id' in msg) {
      return { id: String(msg.id), index: i };
    }
  }
  return null;
}

/**
 * Finds the Virtua wrapper element (parent with position: absolute)
 */
function findVirtuaWrapper(element: HTMLElement): HTMLElement | null {
  let wrapper = element.parentElement;
  while (wrapper && window.getComputedStyle(wrapper).position !== 'absolute') {
    wrapper = wrapper.parentElement;
  }
  return wrapper;
}

/**
 * Checks if the container is scrolled to the bottom within a threshold
 */
function isAtBottom(container: HTMLElement, threshold: number = SCROLL_BOTTOM_THRESHOLD): boolean {
  const maxScroll = container.scrollHeight - container.clientHeight;
  const currentScroll = container.scrollTop;
  return (maxScroll - currentScroll) < threshold;
}

/**
 * Scrolls the container to the absolute bottom
 */
function scrollToBottom(container: HTMLElement): void {
  const maxScroll = container.scrollHeight - container.clientHeight;
  container.scrollTop = maxScroll;
}