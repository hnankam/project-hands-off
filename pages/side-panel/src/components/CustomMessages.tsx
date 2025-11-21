import { useEffect, useMemo, useRef, useCallback, useState } from "react";
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
 * - Sticky user messages using Virtua's official pattern
 * - Auto-scrolls to bottom when new messages arrive
 * - Handles initial messages from labels
 * - Supports custom AssistantMessage and UserMessage components
 * - Supports custom markdown renderers and image renderer
 * - Shows error messages and interrupts
 * - Maintains user scroll position when scrolled up
 */

// Layout and timing constants
const TOP_MARGIN = 5; // Small margin to ensure message is fully visible at top
const SPACER_VISIBILITY_THRESHOLD = 5; // Minimum height to consider spacer visible
const AUTO_SCROLL_FLAG_DURATION = 50; // Duration to keep auto-scroll flag active (ms)
const INITIAL_SCROLL_DELAY = 100; // Delay before initial scroll on mount (ms)
const SCROLL_VERIFY_DELAY = 150; // Delay before verifying scroll position (ms)
const SCROLL_BOTTOM_THRESHOLD = 20; // Distance from bottom to consider "at bottom" (px)
const MAX_ELEMENT_QUERY_RETRIES = 5; // Max retries for finding DOM elements

interface CustomMessagesProps extends MessagesProps {
  /**
   * Agent mode: when true, latest user message stays at top with dynamic
   * spacer that shrinks as assistant response streams in
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

  // Dynamic spacer height for agent mode
  const { spacerHeight, latestUserMessageIdRef } = useAgentSpacer(
    messages,
    messagesRef,
    agentMode,
    inProgress,
    getContainer
  );

  // Handle auto-scrolling behavior
  const { isAutoScrollingRef } = useAutoScroll(
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
  const { stickyMessageId, keepMounted, handleScroll } = useStickyUserMessage(
    messages,
    messagesRef,
    agentMode,
    spacerHeight,
    latestUserMessageIdRef,
    vListRef,
    getContainer,
    MessageRenderer,
    isAutoScrollingRef
  );

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
          // Ensure key is always a string (messages are already filtered to have id)
          const messageKey = String(message.id || `message-${index}`);
            
            return (
              <MessageRenderer
              key={messageKey}
                message={message}
                inProgress={inProgress}
                index={index}
              isCurrentMessage={index === messages.length - 1}
                AssistantMessage={AssistantMessage}
                UserMessage={UserMessage}
                ImageRenderer={ImageRenderer}
                onRegenerate={onRegenerate}
                onCopy={onCopy}
                onThumbsUp={onThumbsUp}
                onThumbsDown={onThumbsDown}
                markdownTagRenderers={markdownTagRenderers}
              />
            );
          })}
        
        {/* Dynamic spacer for agent mode - shrinks as assistant response streams */}
        {(() => {
          const hasTrackedUserMessage = latestUserMessageIdRef.current !== null;
          // Allow rendering even if height is 0 to support smooth entry/exit animations
          const shouldRenderSpacer = agentMode && hasTrackedUserMessage;
          
          return shouldRenderSpacer && (
            <div 
              key="viewport-spacer"
              data-spacer="true"
              style={{ 
                height: spacerHeight,
                flexShrink: 0,
                pointerEvents: 'none',
                transition: 'height 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)',
                willChange: 'height',
                backgroundColor: 'transparent',
                transform: 'translateZ(0)', // Force hardware acceleration
                backfaceVisibility: 'hidden' as const, // Prevent flickering
              }} 
            />
          );
        })()}
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

  // Unified scroll logic for streaming and content changes
  useEffect(() => {
    const currentMessages = messagesRef.current;
    if (!vListRef.current || currentMessages.length === 0) {
      return;
    }
    
    const container = getContainer();
    if (!container) return undefined;
    
    // Helper to scroll to bottom if needed
    const maintainBottomScroll = () => {
      if (!vListRef.current) return;
      
      // Check if spacer is visible (content fits in viewport)
      const spacerElement = container.querySelector('[data-spacer="true"]') as HTMLElement;
      const spacerIsVisible = spacerElement && spacerElement.offsetHeight > SPACER_VISIBILITY_THRESHOLD;
      
      // If spacer is visible, let it handle the layout (pushing content to top).
      // ONLY force scroll to bottom if the spacer has shrunk to near zero (content overflows).
      if (inProgress && !spacerIsVisible) {
        isAutoScrollingRef.current = true;
        scrollToBottom(container);
        
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, AUTO_SCROLL_FLAG_DURATION);
      }
    };
    
    // 1. Initial scroll to bottom on mount/update
    requestAnimationFrame(() => {
      requestAnimationFrame(maintainBottomScroll);
    });
    
    // 2. Observer for content changes (streaming growth)
    const resizeObserver = new ResizeObserver(() => {
      if (inProgress) {
        maintainBottomScroll();
      } else {
        // If not streaming, only auto-scroll if we were already at the bottom
        if (isAtBottom(container)) {
          maintainBottomScroll();
        }
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
  }, [inProgress, messages.length, agentMode, getContainer]);

  // Initial scroll to bottom on tab open (agent mode)
  useEffect(() => {
    if (!agentMode || !vListRef.current || messages.length === 0) {
      return;
    }
    
    // Only run once when component mounts or when messages first load
    const container = getContainer();
    if (!container) return;
    
    // Wait for content to be fully rendered
    const initialScroll = () => {
      if (!vListRef.current) return;
      
      isAutoScrollingRef.current = true;
      
      // Use Virtua's API
      vListRef.current.scrollToIndex(messages.length - 1, { align: "end" });
      
      // Then force scroll to absolute bottom
      requestAnimationFrame(() => {
        scrollToBottom(container);
        
        // Verify and correct if needed
        setTimeout(() => {
          if (!isAtBottom(container, SPACER_VISIBILITY_THRESHOLD)) {
            scrollToBottom(container);
          }
          isAutoScrollingRef.current = false;
        }, SCROLL_VERIFY_DELAY);
      });
    };
    
    // Use multiple delays to ensure content is rendered
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          initialScroll();
        });
      });
    }, INITIAL_SCROLL_DELAY);
  }, [agentMode, messages.length, getContainer]);

  // Auto-scroll when new messages arrive (normal mode only - agent mode handled by spacer effects)
  useEffect(() => {
    if (!vListRef.current || messages.length === 0) {
      return;
    }
    
    // Skip in agent mode - handled by spacer scroll effects
    if (agentMode) {
      return;
    }
    
    // Normal mode - scroll to bottom
    isAutoScrollingRef.current = true;
    vListRef.current.scrollToIndex(messages.length - 1, { align: "end" });
    
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 100);
  }, [messages.length, agentMode]);

  return { isAutoScrollingRef };
};

/**
 * Hook to manage sticky user messages
 */
const useStickyUserMessage = (
  messages: Message[],
  messagesRef: React.MutableRefObject<Message[]>,
  agentMode: boolean,
  spacerHeight: number,
  latestUserMessageIdRef: React.MutableRefObject<string | null>,
  vListRef: React.RefObject<VListHandle | null>,
  getContainer: () => HTMLElement,
  MessageRenderer: React.ComponentType<any> | undefined,
  isAutoScrollingRef: React.MutableRefObject<boolean>
) => {
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null);
  const [stickyMessageIndex, setStickyMessageIndex] = useState<number | null>(null);
  const previousStickyIdRef = useRef<string | null>(null);
  const currentStickyWrapperRef = useRef<HTMLElement | null>(null);

  // Handle scroll using VList's findItemIndex API
  const handleScroll = useCallback((offset: number) => {
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

    // Check specific agent mode condition
    if (agentMode && spacerHeight > 0 && newStickyId === latestUserMessageIdRef.current) {
      newStickyId = null;
      newStickyIndex = null;
    }

    // Update sticky state if changed
    if (stickyMessageId !== newStickyId) {
      setStickyMessageId(newStickyId);
      setStickyMessageIndex(newStickyIndex);
    }
  }, [stickyMessageId, agentMode, spacerHeight]);

  // Clear sticky when agent mode is enabled and spacer exists
  useEffect(() => {
    if (agentMode && spacerHeight > 0 && stickyMessageId !== null && stickyMessageId === latestUserMessageIdRef.current) {
      setStickyMessageId(null);
      setStickyMessageIndex(null);
    }
  }, [agentMode, spacerHeight, stickyMessageId]);

  // Calculate keepMounted array
  const keepMounted = useMemo(() => {
    if (stickyMessageIndex !== null && 
        stickyMessageIndex !== undefined && 
        stickyMessageIndex >= 0 && 
        stickyMessageIndex < messages.length) {
      return [stickyMessageIndex];
    }
    return undefined;
  }, [stickyMessageIndex, stickyMessageId, messages.length, agentMode, spacerHeight]);

  // Apply sticky styles
  useEffect(() => {
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
  }, [stickyMessageId, MessageRenderer, agentMode, getContainer]);

  return { stickyMessageId, keepMounted, handleScroll };
};

/**
 * Hook to handle the dynamic spacer in Agent Mode
 */
const useAgentSpacer = (
  messages: Message[],
  messagesRef: React.MutableRefObject<Message[]>,
  agentMode: boolean,
  inProgress: boolean,
  getContainer: () => HTMLElement
) => {
  const [spacerHeight, setSpacerHeight] = useState(0);
  const latestUserMessageIdRef = useRef<string | null>(null);
  const previousMessagesLengthRef = useRef(0);

  // Step 1: Track user messages for spacer
  useEffect(() => {
    if (!agentMode || messages.length === 0) {
      // Single cleanup path for exiting agent mode or no messages
      if (spacerHeight > 0) {
        setSpacerHeight(0);
      }
      if (latestUserMessageIdRef.current !== null) {
        latestUserMessageIdRef.current = null;
      }
      previousMessagesLengthRef.current = messages.length;
      return;
    }
    
    // Find the latest user message (always track the most recent one)
    const latestUserMessageId = findLatestUserMessageId(messages);
    
    if (latestUserMessageId && latestUserMessageIdRef.current !== latestUserMessageId) {
      latestUserMessageIdRef.current = latestUserMessageId;
    }
    
    previousMessagesLengthRef.current = messages.length;
  }, [messages.length, agentMode]);

  // Step 3: Observer shrinks spacer as assistant message grows
  useEffect(() => {
    if (!agentMode) {
      setSpacerHeight(0);
      return;
    }
    
    const container = getContainer();
    if (!container) {
      return;
    }
    
    let retryCount = 0;
    
    const updateSpacer = (isRetry = false) => {
      const currentMessages = messagesRef.current;
      
      // Only calculate spacer if we have messages and a tracked user message
      if (currentMessages.length === 0 || latestUserMessageIdRef.current === null) {
        if (spacerHeight > 0) {
          setSpacerHeight(0);
        }
        return;
      }
      
      const containerHeight = container.clientHeight;
      
      // Find the tracked user message element using helper function
      const trackedMessageElement = findTrackedMessageElement(container, latestUserMessageIdRef.current);
      
      if (!trackedMessageElement) {
        // Retry if the message might not be rendered yet
        if (retryCount < MAX_ELEMENT_QUERY_RETRIES) {
          retryCount++;
          setTimeout(() => {
            updateSpacer(true);
          }, 100 * retryCount); // Exponential backoff
          return;
        }
        // Don't clear tracking - keep trying with observer
        return;
      }
      
      // Reset retry count on success
      retryCount = 0;
      
      // Get the Virtua wrapper for this message
      const messageWrapper = findVirtuaWrapper(trackedMessageElement);
      
      if (!messageWrapper) {
        return;
      }
      
      const trackedMessageHeight = messageWrapper.offsetHeight;
      
      // Calculate height of content after the tracked message
      const contentAfterHeight = calculateSiblingsHeight(messageWrapper);
      
      // Spacer calculation to ensure message is fully visible at top
      const newSpacerHeight = Math.max(
        containerHeight - trackedMessageHeight - contentAfterHeight - TOP_MARGIN, 
        0
      );
      
      setSpacerHeight(newSpacerHeight);
    };
    
    // Initial calculation after messages are rendered
    // Use multiple frames to ensure DOM is fully updated
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateSpacer();
        });
      });
    });
    
    // Watch for content size changes (streaming, images, etc.)
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => updateSpacer());
    });
    
    resizeObserver.observe(container);
    
    // Also observe inner wrapper for content changes
    const innerWrapper = container.querySelector('[style*="position: relative"]');
    if (innerWrapper) {
      resizeObserver.observe(innerWrapper);
    }
    
    // Also observe the tracked user message element directly (if it exists)
    if (latestUserMessageIdRef.current) {
      const trackedMessage = container.querySelector(
        `.copilotKitUserMessage[data-message-id="${latestUserMessageIdRef.current}"][data-message-role="user"]`
      );
      if (trackedMessage) {
        resizeObserver.observe(trackedMessage);
      }
    }
    
    return () => {
      resizeObserver.disconnect();
      // Clear tracking when observer is cleaned up (agent mode disabled)
      if (!agentMode) {
        latestUserMessageIdRef.current = null;
        if (spacerHeight > 0) {
          setSpacerHeight(0);
        }
      }
    };
  }, [agentMode, inProgress, messages.length, getContainer]); // Uses messagesRef internally

  return { spacerHeight, latestUserMessageIdRef };
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
function findLatestUserMessageId(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && typeof msg === 'object' && 'role' in msg && msg.role === 'user' && 'id' in msg) {
      return String(msg.id);
    }
  }
  return null;
}

/**
 * Finds a tracked message element in the DOM using multiple selector strategies
 */
function findTrackedMessageElement(
  container: HTMLElement,
  messageId: string
): HTMLElement | null {
  // Try with role attribute first
  let element = container.querySelector(
    `.copilotKitUserMessage[data-message-id="${messageId}"][data-message-role="user"]`
  ) as HTMLElement;
  
  if (element) return element;
  
  // Try without role attribute
  element = container.querySelector(
    `.copilotKitUserMessage[data-message-id="${messageId}"]`
  ) as HTMLElement;
  
  if (element) return element;
  
  // Try with just data-message-id
  return container.querySelector(
    `[data-message-id="${messageId}"]`
  ) as HTMLElement;
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
 * Calculates the total height of sibling elements after the given element
 * Stops when hitting the spacer element
 */
function calculateSiblingsHeight(element: HTMLElement): number {
  let height = 0;
  let nextSibling = element.nextElementSibling;
  
  while (nextSibling) {
    // Stop if we hit the spacer
    if (nextSibling.hasAttribute('data-spacer') || nextSibling.querySelector('[data-spacer="true"]')) {
      break;
    }
    
    height += (nextSibling as HTMLElement).offsetHeight;
    nextSibling = nextSibling.nextElementSibling;
  }
  
  return height;
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