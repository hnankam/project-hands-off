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
  const initialMessages = useMemo(() => makeInitialMessages(labels.initial), [labels.initial]);
  
  // Filter out any undefined/null messages and ensure all have required properties
  const messages = useMemo(() => {
    const allMessages = [...initialMessages, ...visibleMessages];
    const filtered = allMessages.filter((msg): msg is Message => {
      return msg != null && typeof msg === 'object' && 'id' in msg;
    });
    return filtered;
  }, [initialMessages, visibleMessages]);

  // Performance: Keep a ref to messages to avoid effect re-runs/re-creations
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const vListRef = useRef<VListHandle>(null);
  const isAutoScrollingRef = useRef(false);
  const previousStickyIdRef = useRef<string | null>(null);
  const previousMessagesLengthRef = useRef(0); // Start at 0 to detect initial messages
  const latestUserMessageIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  // Helper to get container efficiently
  const getContainer = useCallback(() => {
    if (!containerRef.current) {
      containerRef.current = document.querySelector('.copilotKitMessagesContainer') as HTMLElement;
    }
    return containerRef.current;
  }, []);

  // Internal sticky state - managed entirely in this component
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null);
  const [stickyMessageIndex, setStickyMessageIndex] = useState<number | null>(null);
  
  // Dynamic spacer height for agent mode
  const [spacerHeight, setSpacerHeight] = useState(0);

  // Determine which render component to use (default to RenderMessage from CopilotKit)
  const MessageRenderer = RenderMessage;

  // Handle scroll using VList's findItemIndex API - all logic centralized here
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

    // Check specific agent mode condition:
    // If the candidate sticky message is the LATEST user message, and we have a spacer (it fits in viewport),
    // then disable sticky for this specific message.
    if (agentMode && spacerHeight > 0 && newStickyId === latestUserMessageIdRef.current) {
      newStickyId = null;
      newStickyIndex = null;
    }

    // Update sticky state if changed
    if (stickyMessageId !== newStickyId) {
      setStickyMessageId(newStickyId);
      setStickyMessageIndex(newStickyIndex);
    }
  }, [stickyMessageId, agentMode, spacerHeight]); // Removed messages dependency, uses messagesRef

  // Clear sticky when agent mode is enabled and spacer exists (new message)
  // Re-enable sticky when spacer is gone (content overflows)
  useEffect(() => {
    if (agentMode && spacerHeight > 0 && stickyMessageId !== null && stickyMessageId === latestUserMessageIdRef.current) {
      setStickyMessageId(null);
      setStickyMessageIndex(null);
    }
  }, [agentMode, spacerHeight, stickyMessageId]);

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
  }, [inProgress, messages.length, agentMode, getContainer]); // Removed spacerHeight dependency

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

  // Note: Removed old scroll effect - now handled by spacer change effect above

  // Calculate keepMounted array - keep the sticky message mounted even when off-screen
  const keepMounted = useMemo(() => {
    if (stickyMessageIndex !== null && 
        stickyMessageIndex !== undefined && 
        stickyMessageIndex >= 0 && 
        stickyMessageIndex < messages.length) {
      return [stickyMessageIndex];
    }
    return undefined;
  }, [stickyMessageIndex, stickyMessageId, messages.length, agentMode, spacerHeight]);

  // Apply sticky styles directly to Virtua's wrapper divs
  useEffect(() => {
    // Skip if no messages or MessageRenderer
    if (messagesRef.current.length === 0 || !MessageRenderer) return;
    
    const previousStickyId = previousStickyIdRef.current;
    previousStickyIdRef.current = stickyMessageId;

    // Skip on initial mount (don't interfere with Virtua's initialization)
    if (previousStickyId === undefined) {
      return;
    }

    // Use double requestAnimationFrame to ensure Virtua has fully rendered
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const vListContainer = getContainer();
        if (!vListContainer) return;

        // Helper function to find and clean up sticky styles for a message
        const removeSticky = (messageId: string) => {
          const userMessageEl = vListContainer.querySelector(`.copilotKitUserMessage[data-message-id="${messageId}"][data-message-role="user"]`) as HTMLElement;
          if (!userMessageEl) return;

          // Find Virtua wrapper - traverse up from the user message element
          let virtuaWrapper: HTMLElement | null = userMessageEl.parentElement;
          let depth = 0;
          
          while (virtuaWrapper && depth < 3) {
            const inlinePosition = virtuaWrapper.style.position;
            const computedPosition = window.getComputedStyle(virtuaWrapper).position;
            const hasOriginalTop = virtuaWrapper.hasAttribute('data-original-top');
            const isContainer = virtuaWrapper.classList.contains('copilotKitMessagesContainer');
            
            if (hasOriginalTop || ((inlinePosition === 'sticky' || computedPosition === 'sticky' || computedPosition === 'absolute') && !isContainer)) {
              break;
            }
            
            virtuaWrapper = virtuaWrapper.parentElement as HTMLElement | null;
            depth++;
          }

          if (!virtuaWrapper) return;

          // Check if it's actually sticky
          const hasOriginalTopAttr = virtuaWrapper.hasAttribute('data-original-top');
          const inlinePosition = virtuaWrapper.style.position;
          const computedPosition = window.getComputedStyle(virtuaWrapper).position;
          const isSticky = hasOriginalTopAttr || inlinePosition === 'sticky' || computedPosition === 'sticky';
          
          if (!isSticky) return;

          // Restore Virtua's original positioning
          const storedOriginalTop = virtuaWrapper.getAttribute('data-original-top');
          
          // Remove our style overrides
          virtuaWrapper.style.removeProperty('position');
          virtuaWrapper.style.removeProperty('z-index');
          virtuaWrapper.style.marginTop = '';
          virtuaWrapper.style.paddingTop = '';
          
          // Restore the original top value
          if (storedOriginalTop) {
            virtuaWrapper.style.top = storedOriginalTop;
          } else {
            virtuaWrapper.style.removeProperty('top');
          }
          
          virtuaWrapper.removeAttribute('data-original-top');
          
          // Ensure position is absolute for Virtua
          if (!virtuaWrapper.style.position) {
            virtuaWrapper.style.position = 'absolute';
          }
          
          // Remove the is-sticky class from the user message element
          userMessageEl.classList.remove('is-sticky');
          
          const currentMessages = messagesRef.current;
          const messageIndex = currentMessages.findIndex((m) => {
            return m && typeof m === 'object' && 'id' in m && String(m.id) === messageId;
          });
          
          // Trigger Virtua recalculation
          void virtuaWrapper.offsetHeight;
          
          requestAnimationFrame(() => {
            const computedPosition = window.getComputedStyle(virtuaWrapper!).position;
            if (computedPosition !== 'absolute') {
              virtuaWrapper!.style.position = 'absolute';
            }
            
            void virtuaWrapper!.offsetHeight;
            
            if (vListRef.current && messageIndex >= 0) {
              try {
                const scrollContainer = vListContainer as HTMLElement;
                const scrollTop = scrollContainer?.scrollTop || 0;
                vListRef.current.findItemIndex(scrollTop);
              } catch (e) {
                // Silently fail
              }
            }
          });
        };

        // Remove sticky from previous message if it changed
        if (previousStickyId && previousStickyId !== stickyMessageId) {
          removeSticky(previousStickyId);
          
          // Apply sticky to new message after previous is cleaned up
          setTimeout(() => {
            if (stickyMessageId) {
              const userMessageEl = vListContainer.querySelector(`.copilotKitUserMessage[data-message-id="${stickyMessageId}"][data-message-role="user"]`) as HTMLElement;
              if (!userMessageEl) return;
              
              // Find Virtua's wrapper div
              let virtuaWrapper: HTMLElement | null = userMessageEl.parentElement;
              let depth = 0;
              
              while (virtuaWrapper && depth < 3) {
                const computedStyle = window.getComputedStyle(virtuaWrapper);
                const isContainer = virtuaWrapper.classList.contains('copilotKitMessagesContainer');
                
                if (computedStyle.position === 'absolute' && !isContainer) {
                  break;
                }
                virtuaWrapper = virtuaWrapper.parentElement as HTMLElement | null;
                depth++;
              }
              
              if (!virtuaWrapper || virtuaWrapper.style.position === 'sticky') return;
              
              // Store and apply sticky styles
              const originalTop = virtuaWrapper.style.top;
              virtuaWrapper.setAttribute('data-original-top', originalTop);
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

        // Apply sticky to new message if set (only if no previous sticky to remove)
        if (stickyMessageId) {
          const userMessageEl = vListContainer.querySelector(`.copilotKitUserMessage[data-message-id="${stickyMessageId}"][data-message-role="user"]`) as HTMLElement;
          if (!userMessageEl) return;
          
          // Find Virtua's wrapper div
          let virtuaWrapper: HTMLElement | null = userMessageEl.parentElement;
          let depth = 0;
          
          while (virtuaWrapper && depth < 3) {
            const computedStyle = window.getComputedStyle(virtuaWrapper);
            if (computedStyle.position === 'absolute' && !virtuaWrapper.classList.contains('copilotKitMessagesContainer')) {
              break;
            }
            virtuaWrapper = virtuaWrapper.parentElement as HTMLElement | null;
            depth++;
          }
          
          if (!virtuaWrapper || virtuaWrapper.style.position === 'sticky') return;
          
          // Store and apply sticky styles
          const originalTop = virtuaWrapper.style.top;
          virtuaWrapper.setAttribute('data-original-top', originalTop);
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
  }, [stickyMessageId, MessageRenderer, agentMode, getContainer]); // Removed messages dependency, added getContainer

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

