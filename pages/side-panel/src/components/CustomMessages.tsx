import { useEffect, useMemo, useRef } from "react";
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
  const vListRef = useRef<VListHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Determine which render component to use (default to RenderMessage from CopilotKit)
  const MessageRenderer = RenderMessage;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    // Scroll to bottom when messages change
    console.log('[CustomMessages] scrolling to bottom', messages.length);
    if (vListRef.current && messages.length > 0) {
      // Use VList's scrollToIndex to scroll to the last message
      vListRef.current.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages.length]);

  return (
    <div className="copilotKitMessages">
        <VList ref={vListRef} className="copilotKitMessagesContainer">
          {messages.map((message, index) => {
            const isCurrentMessage = index === messages.length - 1;
            
            if (!MessageRenderer) {
              return null;
            }
            
            return (
              <MessageRenderer
                key={message.id || index}
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
        </VList>
        {interrupt}
        {chatError && ErrorMessage && <ErrorMessage error={chatError} isCurrentMessage />}
        <div ref={messagesEndRef} />
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

