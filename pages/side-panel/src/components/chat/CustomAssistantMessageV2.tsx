/**
 * Custom Assistant Message for CopilotKit V2
 * 
 * Wraps CopilotChatAssistantMessage with custom MarkdownRenderer
 * and styled toolbar buttons matching user message design (right-aligned, no gradient).
 */
import * as React from 'react';
import { useMemo, useCallback, useState } from 'react';
import { CopilotChatAssistantMessage, useCopilotChat } from '../../hooks/copilotkit';
import { CustomMarkdownRenderer } from './CustomMarkdownRenderer';
import { 
  CustomCopyButton,
  CustomRegenerateButton,
  CustomThumbsUpButton,
  CustomThumbsDownButton,
  CustomReadAloudButton,
} from './slots/CustomAssistantMessageButtons';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';

type AssistantMessageProps = React.ComponentProps<typeof CopilotChatAssistantMessage>;

/**
 * CustomAssistantMessageV2 - Wrapper for CopilotChatAssistantMessage
 * 
 * Features:
 * - Custom MarkdownRenderer with syntax highlighting
 * - Styled toolbar buttons matching user message design
 * - Right-aligned buttons in default toolbar (always visible)
 * 
 * Available Props (from CopilotChatAssistantMessage):
 * 
 * SLOT PROPS (can be customized):
 * - markdownRenderer: Custom markdown renderer component
 * - toolbar: Custom toolbar component
 * - copyButton: Custom copy button component
 * - thumbsUpButton: Custom thumbs up button component
 * - thumbsDownButton: Custom thumbs down button component
 * - readAloudButton: Custom read aloud button component
 * - regenerateButton: Custom regenerate button component
 * - toolCallsView: Custom tool calls view component
 * 
 * CONFIGURATION PROPS:
 * - message: AssistantMessage (REQUIRED) - The message object from @ag-ui/core
 * - messages?: Message[] - Array of all messages (for context)
 * - isRunning?: boolean - Whether the assistant is currently generating a response
 * - onThumbsUp?: (message: AssistantMessage) => void - Callback when thumbs up clicked
 * - onThumbsDown?: (message: AssistantMessage) => void - Callback when thumbs down clicked
 * - onReadAloud?: (message: AssistantMessage) => void - Callback when read aloud clicked
 * - onRegenerate?: (message: AssistantMessage) => void - Callback when regenerate clicked
 * - additionalToolbarItems?: React.ReactNode - Custom toolbar items to add
 * - toolbarVisible?: boolean - Whether to show the toolbar (default: true)
 * 
 * CHILDREN RENDER PROPS (available in children function):
 * - markdownRenderer: React.ReactElement - Rendered markdown content
 * - toolbar: React.ReactElement - Rendered toolbar with buttons
 * - toolCallsView: React.ReactElement - Rendered tool calls view
 * - copyButton: React.ReactElement - Individual copy button element
 * - thumbsUpButton: React.ReactElement - Individual thumbs up button element
 * - thumbsDownButton: React.ReactElement - Individual thumbs down button element
 * - readAloudButton: React.ReactElement - Individual read aloud button element
 * - regenerateButton: React.ReactElement - Individual regenerate button element
 * - message: AssistantMessage - The message object
 * - messages?: Message[] - Array of all messages
 * - isRunning?: boolean - Whether assistant is generating
 * - onThumbsUp, onThumbsDown, onReadAloud, onRegenerate: Callback functions
 * - additionalToolbarItems?: React.ReactNode - Custom toolbar items
 * - toolbarVisible?: boolean - Toolbar visibility state
 * 
 * HTML DIV ATTRIBUTES:
 * - className?: string - CSS classes
 * - style?: React.CSSProperties - Inline styles
 * - id?: string - Element ID
 * - onClick?: React.MouseEventHandler<HTMLDivElement> - Click handler
 * - onMouseEnter?: React.MouseEventHandler<HTMLDivElement> - Mouse enter handler
 * - onMouseLeave?: React.MouseEventHandler<HTMLDivElement> - Mouse leave handler
 * - data-*?: string - Data attributes
 * - aria-*?: string - ARIA attributes
 * - role?: string - ARIA role
 * - tabIndex?: number - Tab index
 * - ... (all other standard HTML div attributes)
 */
const CustomAssistantMessageV2Component: React.FC<AssistantMessageProps> = (props) => {
  const [copied, setCopied] = useState(false);
  const { reloadMessages } = useCopilotChat();
  const [isHovered, setIsHovered] = useState(false);
  const { message, messages, isRunning } = props;
  const { isLight } = useStorage(themeStorage);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  
  // Reset hover state when message changes (for messages loaded from history)
  // This ensures hover state is properly initialized for each message
  React.useEffect(() => {
    setIsHovered(false);
  }, [message?.id]);
  
  // Helper function to extract text from message content
  // Excludes <think> and <thinking> tags and their content
  const extractTextFromMessage = useCallback((msg: any): string => {
    if (!msg) return '';
    const content = msg.content;
    
    let textContent = '';
    if (typeof content === 'string') {
      textContent = content;
    } else if (Array.isArray(content)) {
      textContent = content
        .map((item: any) => {
          if (typeof item === 'string') return item;
          if (item?.type === 'text' && typeof item.text === 'string') return item.text;
          return '';
        })
        .filter((text: string) => text.trim().length > 0)
        .join('\n');
    } else {
      return '';
    }

    // Remove <think>...</think> and <thinking>...</thinking> tags and their content
    // Using regex with dotall flag to match across newlines
    textContent = textContent
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    
    return textContent.trim();
  }, []);

  // Determine if this message is the last in its assistant series
  const { isLastInSeries, assistantSeries } = useMemo(() => {
    if (!message || !messages || messages.length === 0) {
      return { isLastInSeries: true, assistantSeries: [message] };
    }

    const currentIndex = messages.findIndex((msg: any) => {
      if (!msg) return false;
      if (message?.id && msg?.id) {
        return msg.id === message.id;
      }
      return msg === message;
    });

    if (currentIndex === -1) {
      return { isLastInSeries: true, assistantSeries: [message] };
    }

    // Find previous user message relative to current message
    let prevUserIndex = -1;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const role = (messages[i] as any)?.role;
      if (role === 'user') {
        prevUserIndex = i;
        break;
      }
    }

    // Find next user message
    let nextUserIndex = messages.length;
    for (let i = currentIndex + 1; i < messages.length; i++) {
      const role = (messages[i] as any)?.role;
      if (role === 'user') {
        nextUserIndex = i;
        break;
      }
    }

    // Collect all assistant messages between the two user messages
    const assistantGroup: any[] = [];
    for (let i = prevUserIndex + 1; i < nextUserIndex; i++) {
      const candidate = messages[i];
      const role = (candidate as any)?.role;
      if (role === 'assistant') {
        assistantGroup.push(candidate);
      }
    }

    if (assistantGroup.length === 0) {
      return { isLastInSeries: true, assistantSeries: [message] };
    }

    const lastAssistant = assistantGroup[assistantGroup.length - 1];
    const isLast = lastAssistant?.id === message.id || lastAssistant === message;

    return {
      isLastInSeries: isLast,
      assistantSeries: assistantGroup,
    };
  }, [message, messages, isRunning]);

  // Aggregate content from all assistant messages in the series
  const aggregatedSeriesContent = useMemo(() => {
    if (!assistantSeries || assistantSeries.length === 0) {
      return '';
    }

    const parts = assistantSeries
      .map((msg: any) => extractTextFromMessage(msg))
      .filter((value: string) => typeof value === 'string' && value.trim().length > 0);

    if (parts.length === 0) {
      return '';
    }

    return parts.join('\n\n').trim();
  }, [assistantSeries, extractTextFromMessage]);

  // Custom copy handler that copies aggregated content from all assistant messages in series
  const handleCopy = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const textToCopy = aggregatedSeriesContent || extractTextFromMessage(message);
    const safeText = textToCopy?.trim();

    if (!safeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(safeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy assistant response:', error);
    }
  }, [aggregatedSeriesContent, message, extractTextFromMessage]);
  
  // Custom regenerate handler that filters messages correctly
  const handleRegenerate = useCallback(() => {
    if (!message?.id || !messages) return;
    
    // For assistant messages: find the user message that triggered this assistant response
    // Then reload from that user message (which will exclude this assistant response and subsequent messages)
    const messageIndex = messages.findIndex((m: any) => m.id === message.id);
    if (messageIndex === -1) return;
    
    // Find the previous user message before this assistant message
    let userMessageIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      const role = (messages[i] as any)?.role;
      if (role === 'user') {
        userMessageIndex = i;
        break;
      }
    }
    
    if (userMessageIndex !== -1) {
      const userMessage = messages[userMessageIndex];
      if (userMessage?.id) {
        reloadMessages(userMessage.id);
      }
    } else {
      // Fallback: reload from this assistant message (will find user message in reloadMessages)
      reloadMessages(message.id);
    }
  }, [message, messages, reloadMessages]);
  
  return (
    <CopilotChatAssistantMessage
      {...props}
      markdownRenderer={CustomMarkdownRenderer}
      copyButton={CustomCopyButton}
      regenerateButton={CustomRegenerateButton}
      thumbsUpButton={CustomThumbsUpButton}
      thumbsDownButton={CustomThumbsDownButton}
      readAloudButton={CustomReadAloudButton}
      onRegenerate={handleRegenerate}
    >
      {({ 
        markdownRenderer, 
        toolbar, 
        toolCallsView,
        regenerateButton,
        thumbsUpButton,
        thumbsDownButton,
        readAloudButton,
        copyButton,
        isRunning: renderIsRunning,
        message: renderMessage,
        messages: renderMessages,
        onThumbsUp,
        onThumbsDown,
        onReadAloud,
        onRegenerate,
      }) => {
        // Use renderMessage from render context for accurate role checking
        const currentMessage = renderMessage || message;
        
        // Check if this message is truly the LAST message in the entire conversation
        // Not just the last in a series between user messages
        const messagesToCheck = renderMessages || messages;
        const isActuallyLastMessage = messagesToCheck && messagesToCheck.length > 0 && 
                                      currentMessage?.id === messagesToCheck[messagesToCheck.length - 1]?.id;
        
        // Use isRunning from either props or render context (whichever is true)
        // BUT: For old messages loaded from history, isRunning should be false
        // Only the ACTUAL last message in the entire conversation should potentially be running
        // CopilotKit incorrectly marks all messages as running when loading history
        // So we MUST check if this is the actual last message
        const effectiveIsRunning = Boolean((isRunning || renderIsRunning) && isActuallyLastMessage);
        
        // Check if we should render toolbar at all (only for pure assistant messages with content)
        // Explicitly exclude:
        // - Non-assistant messages (user, tool, system, etc.)
        // - Tool result messages (messages with toolCallId)
        // - Assistant messages initiating tool calls (messages with toolCalls array)
        // - Messages with empty content
        const hasContent = currentMessage?.content && (typeof currentMessage.content === 'string' ? currentMessage.content.trim() !== '' : true);
        const isPureAssistantMessage = currentMessage?.role === 'assistant' && 
                                       !(currentMessage as any)?.toolCallId && 
                                       (!(currentMessage as any)?.toolCalls || (currentMessage as any)?.toolCalls?.length === 0);
        
        const shouldRenderToolbar = isPureAssistantMessage && 
                                   hasContent && 
                                   isLastInSeries;
        
        // Determine toolbar visibility - always show on hover only (simplified logic)
        const shouldShowToolbar = Boolean(!effectiveIsRunning && 
                                  shouldRenderToolbar &&
                                  isHovered);

        // Control toolbar visibility with opacity and visibility (only when toolbar should be rendered)
        // Use both opacity and visibility to ensure proper hiding/showing
        const toolbarOpacity = shouldShowToolbar ? 1 : 0;
        const toolbarVisibility = shouldShowToolbar ? 'visible' : 'hidden';
        const toolbarPointerEvents = shouldShowToolbar ? 'auto' : 'none';

        // Clone copy button with custom onClick handler and copied state
        // This ensures we copy aggregated content from all assistant messages in the series
        const customCopyButton = React.isValidElement(copyButton)
          ? React.cloneElement(copyButton as React.ReactElement<any>, {
              onClick: handleCopy,
              copied: copied,
            })
          : copyButton;
        
        // Clone regenerate button with custom onClick handler
        // This ensures we filter messages correctly before regenerating
        const customRegenerateButton = React.isValidElement(regenerateButton)
          ? React.cloneElement(regenerateButton as React.ReactElement<any>, {
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                handleRegenerate();
              },
            })
          : regenerateButton;
        
        // Reorder buttons: Regenerate, ThumbsUp, ThumbsDown, ReadAloud, Copy (rightmost)
        // Only render toolbar for assistant messages with content
        const reorderedToolbar = shouldRenderToolbar ? (
          <div 
            style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            width: '100%',
            gap: '0.25rem',
            opacity: toolbarOpacity,
              visibility: toolbarVisibility,
            pointerEvents: toolbarPointerEvents,
              transition: 'opacity 0.2s ease-in-out, visibility 0.2s ease-in-out',
            }}
            data-toolbar-opacity={toolbarOpacity}
            data-toolbar-visibility={toolbarVisibility}
            data-toolbar-should-show={shouldShowToolbar}
          >
            {/* Regenerate Button */}
            {customRegenerateButton}
            
            {/* Thumbs Up Button */}
            {/* {thumbsUpButton} */}
            
            {/* Thumbs Down Button */}
            {/* {thumbsDownButton} */}
            
            {/* Read Aloud Button */}
            {/* {readAloudButton} */}
            
            {/* Copy Button (rightmost) - with aggregated content */}
            {customCopyButton}
          </div>
        ) : null;
        
        return (
          <div 
            ref={containerRef}
            style={{ 
              color: isLight ? '#374151' : '#d1d5db', 
              paddingLeft: '12px', 
              paddingRight: '12px',
              position: 'relative', // Ensure proper stacking context
              zIndex: 1, // Ensure hover area is above other elements
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              setIsHovered(true);
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              setIsHovered(false);
            }}
            onMouseMove={(e) => {
              // Ensure hover state is set on mouse move (handles edge cases)
              if (!isHovered) {
                setIsHovered(true);
              }
            }}
            data-message-role="assistant"
            data-message-id={currentMessage?.id}
            data-is-hovered={isHovered}
          >
            {markdownRenderer}
            {toolCallsView}
            {reorderedToolbar}
          </div>
        );
      }}
    </CopilotChatAssistantMessage>
  );
};

// Copy static properties from CopilotChatAssistantMessage to match the expected slot type
export const CustomAssistantMessageV2 = Object.assign(
  CustomAssistantMessageV2Component,
  {
    MarkdownRenderer: CopilotChatAssistantMessage.MarkdownRenderer,
    Toolbar: CopilotChatAssistantMessage.Toolbar,
    ToolbarButton: CopilotChatAssistantMessage.ToolbarButton,
    CopyButton: CopilotChatAssistantMessage.CopyButton,
    ThumbsUpButton: CopilotChatAssistantMessage.ThumbsUpButton,
    ThumbsDownButton: CopilotChatAssistantMessage.ThumbsDownButton,
    ReadAloudButton: CopilotChatAssistantMessage.ReadAloudButton,
    RegenerateButton: CopilotChatAssistantMessage.RegenerateButton,
  }
) as typeof CopilotChatAssistantMessage;

export default CustomAssistantMessageV2;

