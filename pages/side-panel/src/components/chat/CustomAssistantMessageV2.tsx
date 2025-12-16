/**
 * Custom Assistant Message for CopilotKit V2
 * 
 * Wraps CopilotChatAssistantMessage with custom MarkdownRenderer
 * and styled toolbar buttons matching user message design (right-aligned, no gradient).
 */
import React, { useMemo, useCallback, useState } from 'react';
import { CopilotChatAssistantMessage } from '../../hooks/copilotkit';
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
  const [isHovered, setIsHovered] = useState(false);
  const { message, messages, isRunning } = props;
  const { isLight } = useStorage(themeStorage);
  
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
  
  return (
    <CopilotChatAssistantMessage
      {...props}
      markdownRenderer={CustomMarkdownRenderer}
      copyButton={CustomCopyButton}
      regenerateButton={CustomRegenerateButton}
      thumbsUpButton={CustomThumbsUpButton}
      thumbsDownButton={CustomThumbsDownButton}
      readAloudButton={CustomReadAloudButton}
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
        // Use isRunning from either props or render context (whichever is true)
        const effectiveIsRunning = isRunning || renderIsRunning;
        
        // Use renderMessage from render context for accurate role checking
        const currentMessage = renderMessage || message;
        
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
        const shouldShowToolbar = !effectiveIsRunning && 
                                  shouldRenderToolbar &&
                                  isHovered;

        // Control toolbar visibility with opacity (only when toolbar should be rendered)
        const toolbarOpacity = shouldShowToolbar ? 1 : 0;
        const toolbarPointerEvents = shouldShowToolbar ? 'auto' : 'none';

        // Clone copy button with custom onClick handler and copied state
        // This ensures we copy aggregated content from all assistant messages in the series
        const customCopyButton = React.isValidElement(copyButton)
          ? React.cloneElement(copyButton as React.ReactElement<any>, {
              onClick: handleCopy,
              copied: copied,
            })
          : copyButton;
        
        // Reorder buttons: Regenerate, ThumbsUp, ThumbsDown, ReadAloud, Copy (rightmost)
        // Only render toolbar for assistant messages with content
        const reorderedToolbar = shouldRenderToolbar ? (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            width: '100%',
            gap: '0.25rem',
            opacity: toolbarOpacity,
            pointerEvents: toolbarPointerEvents,
            transition: 'opacity 0.2s ease-in-out',
          }}>
            {/* Regenerate Button */}
            {regenerateButton}
            
            {/* Thumbs Up Button */}
            {thumbsUpButton}
            
            {/* Thumbs Down Button */}
            {thumbsDownButton}
            
            {/* Read Aloud Button */}
            {readAloudButton}
            
            {/* Copy Button (rightmost) - with aggregated content */}
            {customCopyButton}
          </div>
        ) : null;
        
        return (
          <div 
            style={{ color: isLight ? '#374151' : '#d1d5db', paddingLeft: '12px', paddingRight: '12px' }} // , paddingTop: '12px'
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            data-message-role="assistant"
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

