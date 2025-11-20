import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { Message } from "@copilotkit/shared";
import { useCopilotChatHeadless_c } from "@copilotkit/react-core";
import { useChatContext } from "@copilotkit/react-ui";
import type { MessagesProps } from "@copilotkit/react-ui";
import { VList, type VListHandle } from "virtua";

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

interface CustomMessagesProps extends MessagesProps {
  // No additional props needed - handling sticky internally
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
}: CustomMessagesProps) => {
  const { labels } = useChatContext();
  const { messages: visibleMessages, interrupt } = useCopilotChatHeadless_c();
  const initialMessages = useMemo(() => makeInitialMessages(labels.initial), [labels.initial]);
  const messages = [...initialMessages, ...visibleMessages];
  const vListRef = useRef<VListHandle>(null);
  const isAutoScrollingRef = useRef(false);
  const previousStickyIdRef = useRef<string | null>(null);

  // Internal sticky state - managed entirely in this component
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null);
  const [stickyMessageIndex, setStickyMessageIndex] = useState<number | null>(null);

  // Determine which render component to use (default to RenderMessage from CopilotKit)
  const MessageRenderer = RenderMessage;

  // Handle scroll using VList's findItemIndex API - all logic centralized here
  const handleScroll = useCallback((offset: number) => {
    // Skip during auto-scroll
    if (isAutoScrollingRef.current) return;

    const vList = vListRef.current;
    if (!vList) return;

    // Use findItemIndex to get the item index at the scroll offset
    const topItemIndex = vList.findItemIndex(offset);

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
    for (let i = topItemIndex; i < messages.length; i++) {
      const message = messages[i] as any;
      if (message && message.role === 'assistant') {
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
        const message = messages[i] as any;
        if (message && message.role === 'user') {
          newStickyId = message.id;
          newStickyIndex = i;
          break;
        }
      }
    } else {
      // No assistant visible - find the last user message before topItemIndex
      if (topItemIndex > 0) {
        for (let i = topItemIndex - 1; i >= 0; i--) {
          const message = messages[i] as any;
          if (message && message.role === 'user') {
            newStickyId = message.id;
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
  }, [messages, stickyMessageId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (vListRef.current && messages.length > 0) {
      isAutoScrollingRef.current = true;
      vListRef.current.scrollToIndex(messages.length - 1, { align: "end" });
      
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 100);
    }
  }, [messages.length]);

  // Calculate keepMounted array - keep the sticky message mounted even when off-screen
  const keepMounted = useMemo(() => {
    if (stickyMessageIndex !== null && stickyMessageIndex !== undefined && stickyMessageIndex >= 0) {
      return [stickyMessageIndex];
    }
    return undefined;
  }, [stickyMessageIndex, stickyMessageId, messages.length]);

  // Apply sticky styles directly to Virtua's wrapper divs
  useEffect(() => {
    const previousStickyId = previousStickyIdRef.current;
    previousStickyIdRef.current = stickyMessageId;

    // Skip on initial mount (don't interfere with Virtua's initialization)
    if (previousStickyId === undefined) {
      return;
    }

    // Use double requestAnimationFrame to ensure Virtua has fully rendered
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const vListContainer = document.querySelector('.copilotKitMessagesContainer');
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
          
          const messageIndex = messages.findIndex((m: any) => m && m.id === messageId);
          
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
  }, [stickyMessageId]);

  return (
    <div className="copilotKitMessages">
      <VList 
        ref={vListRef} 
        className="copilotKitMessagesContainer"
        keepMounted={keepMounted}
        onScroll={handleScroll}
      >
        {messages.map((message, index) => {
          if (!message) {
            return <div key={`empty-${index}`} style={{ display: 'none' }} />;
          }
          
          if (!MessageRenderer) {
            return null;
          }
          
          return (
            <MessageRenderer
              key={message.id || `message-${index}`}
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

