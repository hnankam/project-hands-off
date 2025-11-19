import { useEffect, useMemo, useRef } from "react";
import { Message } from "@copilotkit/shared";
import { useCopilotChatHeadless_c } from "@copilotkit/react-core";
import { useChatContext } from "@copilotkit/react-ui";
import type { MessagesProps } from "@copilotkit/react-ui";

/**
 * Custom Messages Component for CopilotChat
 * 
 * Based on CopilotKit's Messages component implementation:
 * https://github.com/CopilotKit/CopilotKit/blob/main/CopilotKit/packages/react-ui/src/components/chat/Messages.tsx
 * 
 * Features:
 * - Renders all chat messages with custom message components
 * - Auto-scrolls to bottom when new messages arrive
 * - Handles initial messages from labels
 * - Supports custom AssistantMessage and UserMessage components
 * - Supports custom markdown renderers and image renderer
 * - Shows error messages and interrupts
 * - Maintains user scroll position when scrolled up
 */
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
}: MessagesProps) => {
  const { labels } = useChatContext();
  const { messages: visibleMessages, interrupt } = useCopilotChatHeadless_c();
  const initialMessages = useMemo(() => makeInitialMessages(labels.initial), [labels.initial]);
  const messages = [...initialMessages, ...visibleMessages];
  const { messagesContainerRef, messagesEndRef } = useScrollToBottom(messages);

  // Determine which render component to use (default to RenderMessage from CopilotKit)
  const MessageRenderer = RenderMessage;

  return (
    <div className="copilotKitMessages" ref={messagesContainerRef}>
      <div className="copilotKitMessagesContainer">
        {messages.map((message, index) => {
          const isCurrentMessage = index === messages.length - 1;
          
          if (!MessageRenderer) {
            return null;
          }
          
          return (
            <MessageRenderer
              key={index}
              message={message}
              inProgress={inProgress}
              index={index}
              isCurrentMessage={isCurrentMessage}
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
        {interrupt}
        {chatError && ErrorMessage && <ErrorMessage error={chatError} isCurrentMessage />}
      </div>
      <footer className="copilotKitMessagesFooter" ref={messagesEndRef}>
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

/**
 * Hook to manage auto-scroll-to-bottom behavior
 * 
 * Features:
 * - Auto-scrolls to bottom when new messages arrive
 * - Detects when user scrolls up manually
 * - Maintains scroll position when user is reading older messages
 * - Scrolls to bottom when user sends a new message
 */
export function useScrollToBottom(messages: Message[]) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const isUserScrollUpRef = useRef(false);

  const scrollToBottom = () => {
    if (messagesContainerRef.current && messagesEndRef.current) {
      isProgrammaticScrollRef.current = true;
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      return;
    }

    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      isUserScrollUpRef.current = scrollTop + clientHeight < scrollHeight;
    }
  };

  // Attach scroll listener
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  // Observe DOM mutations and scroll to bottom when content changes
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const mutationObserver = new MutationObserver(() => {
      if (!isUserScrollUpRef.current) {
        scrollToBottom();
      }
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      mutationObserver.disconnect();
    };
  }, []);

  // Scroll to bottom when user sends a new message
  useEffect(() => {
    isUserScrollUpRef.current = false;
    scrollToBottom();
  }, [messages.filter((m) => m.role === "user").length]);

  return { messagesEndRef, messagesContainerRef };
}

