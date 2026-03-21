/**
 * Custom Assistant Message for CopilotKit V2
 *
 * Wraps CopilotChatAssistantMessage with custom MarkdownRenderer
 * and styled toolbar buttons matching user message design (right-aligned, no gradient).
 */
import * as React from 'react';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CopilotChatAssistantMessage, deleteMessagesFromBackend } from '../../hooks/copilotkit';
import { useMessageOperations } from '../../context/MessageOperationsContext';
import { useChatSessionIdSafe } from '../../context/ChatSessionIdContext';
import { CustomMarkdownRenderer } from './CustomMarkdownRenderer';
import {
  CustomCopyButton,
  CustomRegenerateButton,
  CustomAssistantMoreOptionsButton,
  CustomThumbsUpButton,
  CustomThumbsDownButton,
  CustomReadAloudButton,
} from './slots/CustomAssistantMessageButtons';
import { ExploreAccordionToolCallsView } from './ExploreAccordionToolCallsView';
import { useStorage, debug } from '@extension/shared';
import { themeStorage } from '@extension/storage';

// [FREEZE-DEBUG] module-level render counter shared across all instances
let _assistantMsgRenderCount = 0;
let _assistantMsgFirstRenderTime = 0;

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
const CustomAssistantMessageV2Component: React.FC<AssistantMessageProps> = props => {
  // [FREEZE-DEBUG] per-instance render counter
  const instanceRenderRef = React.useRef(0);
  instanceRenderRef.current += 1;
  _assistantMsgRenderCount += 1;
  if (_assistantMsgFirstRenderTime === 0) _assistantMsgFirstRenderTime = performance.now();
  if (_assistantMsgRenderCount % 500 === 0) {
    debug.log(
      `[FREEZE-DEBUG] CustomAssistantMessageV2 total renders: ${_assistantMsgRenderCount}`,
      `| this instance renders: ${instanceRenderRef.current}`,
      `| msg id: ${(props.message as any)?.id?.slice(0, 8)}`,
      `| elapsed: ${(performance.now() - _assistantMsgFirstRenderTime).toFixed(0)}ms`,
    );
  }

  const [copied, setCopied] = useState(false);
  // Use context instead of useCopilotChat() — avoids subscribing every message component
  // to the global messages state (which causes all 200 components to re-render per SSE event).
  const { getMessages, setMessages, reloadMessages } = useMessageOperations();
  const sessionId = useChatSessionIdSafe();
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement | null>(null);
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
    textContent = textContent.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

    return textContent.trim();
  }, []);

  // Determine if this message is the last in its assistant series.
  // Deps use message?.id and messages?.length (not the full messages reference) so this
  // only recomputes when messages are structurally added/removed — NOT on every streaming
  // content delta that creates a new array reference but doesn't change message count.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id, messages?.length, isRunning]);

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
  const handleCopy = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
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
    },
    [aggregatedSeriesContent, message, extractTextFromMessage],
  );

  // Retry without deleting: re-run agent with current messages
  const handleRetryKeep = useCallback(() => {
    reloadMessages();
  }, [reloadMessages]);

  // Custom regenerate handler that filters messages correctly (deletes and retries)
  const handleRegenerate = useCallback(() => {
    if (!message?.id) return;
    const currentMessages = getMessages();
    if (!currentMessages.length) return;

    const messageIndex = currentMessages.findIndex((m: any) => m.id === message.id);
    if (messageIndex === -1) return;

    let userMessageIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if ((currentMessages[i] as any)?.role === 'user') {
        userMessageIndex = i;
        break;
      }
    }

    if (userMessageIndex !== -1) {
      const userMessage = currentMessages[userMessageIndex];
      if (userMessage?.id) {
        reloadMessages(userMessage.id);
      }
    } else {
      reloadMessages(message.id);
    }
  }, [message?.id, getMessages, reloadMessages]);

  // Delete this assistant message
  const handleDelete = useCallback(async () => {
    setContextMenu(null);
    if (!message?.id) return;
    const currentMessages = getMessages() as any[];
    const messageIndex = currentMessages.findIndex((m: any) => m.id === message.id);
    if (messageIndex === -1) return;
    try {
      if (sessionId) {
        await deleteMessagesFromBackend(sessionId, [message.id]);
      }
      setMessages(currentMessages.filter((_, i) => i !== messageIndex));
    } catch (error) {
      console.error('[CustomAssistantMessageV2] Error deleting message:', error);
    }
  }, [message?.id, getMessages, setMessages, sessionId]);

  // Close context menu when clicking outside the dropdown
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!contextMenuRef.current?.contains(target)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClose, true);
    return () => document.removeEventListener('mousedown', handleClose, true);
  }, [contextMenu]);

  return (
    <CopilotChatAssistantMessage
      {...props}
      toolCallsView={ExploreAccordionToolCallsView as any}
      markdownRenderer={CustomMarkdownRenderer}
      copyButton={CustomCopyButton}
      regenerateButton={CustomRegenerateButton}
      thumbsUpButton={CustomThumbsUpButton}
      thumbsDownButton={CustomThumbsDownButton}
      readAloudButton={CustomReadAloudButton}
      onRegenerate={handleRegenerate}>
      {({
        markdownRenderer,
        toolbar,
        toolCallsView,
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
        const isActuallyLastMessage =
          messagesToCheck &&
          messagesToCheck.length > 0 &&
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
        const hasContent =
          currentMessage?.content &&
          (typeof currentMessage.content === 'string' ? currentMessage.content.trim() !== '' : true);
        const isPureAssistantMessage =
          currentMessage?.role === 'assistant' &&
          !(currentMessage as any)?.toolCallId &&
          (!(currentMessage as any)?.toolCalls || (currentMessage as any)?.toolCalls?.length === 0);

        const shouldRenderToolbar = isPureAssistantMessage && hasContent && isLastInSeries;

        // Determine toolbar visibility - always show on hover only (simplified logic)
        const shouldShowToolbar = Boolean(!effectiveIsRunning && shouldRenderToolbar && isHovered);

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

        // Copy left, More options (… Regenerate + Retry) right — flex-end aligns group to the message edge
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
              marginBottom: '12px',
            }}
            data-toolbar-opacity={toolbarOpacity}
            data-toolbar-visibility={toolbarVisibility}
            data-toolbar-should-show={shouldShowToolbar}>
            {customCopyButton}
            <CustomAssistantMoreOptionsButton
              onRegenerate={() => {
                void handleRegenerate();
              }}
              onRetryKeep={() => {
                void handleRetryKeep();
              }}
            />
          </div>
        ) : null;

        return (
          <>
            <div
              ref={containerRef}
              style={{
                color: isLight ? '#374151' : '#d1d5db',
                paddingLeft: '12px',
                paddingRight: '12px',
                position: 'relative', // Ensure proper stacking context
                zIndex: 1, // Ensure hover area is above other elements
                borderRadius: contextMenu ? '8px' : undefined,
                border: contextMenu ? (isLight ? '1px solid #3b82f6' : '1px solid #60a5fa') : undefined,
              }}
              onMouseEnter={e => {
                e.stopPropagation();
                setIsHovered(true);
              }}
              onMouseLeave={e => {
                e.stopPropagation();
                setIsHovered(false);
              }}
              onMouseMove={e => {
                // Ensure hover state is set on mouse move (handles edge cases)
                if (!isHovered) {
                  setIsHovered(true);
                }
              }}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                // Slight offset so cursor doesn't obscure first menu item
                setContextMenu({ x: e.clientX + 2, y: e.clientY + 2 });
              }}
              data-message-role="assistant"
              data-message-id={currentMessage?.id}
              data-is-hovered={isHovered}>
              {markdownRenderer}
              {toolCallsView}
              {reorderedToolbar}
            </div>
            {/* Context menu dropdown - Copy and Delete */}
            {contextMenu &&
              createPortal(
                <div
                  ref={contextMenuRef}
                  className="copilotKitAssistantMessageContextMenu"
                  style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    backgroundColor: isLight ? '#f9fafb' : '#151C24',
                    border: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
                    borderRadius: '6px',
                    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
                    zIndex: 10002,
                    minWidth: '140px',
                    overflow: 'hidden',
                  }}>
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCopy(e as unknown as React.MouseEvent<HTMLButtonElement>);
                      setContextMenu(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: isLight ? '#374151' : '#d1d5db',
                      fontSize: '12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = isLight ? '#e5e7eb' : '#374151';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete();
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: isLight ? '#374151' : '#d1d5db',
                      fontSize: '12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderTop: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = isLight ? '#e5e7eb' : '#374151';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    Delete
                  </button>
                </div>,
                document.body,
              )}
          </>
        );
      }}
    </CopilotChatAssistantMessage>
  );
};

// Copy static properties from CopilotChatAssistantMessage to match the expected slot type
export const CustomAssistantMessageV2 = Object.assign(CustomAssistantMessageV2Component, {
  MarkdownRenderer: CopilotChatAssistantMessage.MarkdownRenderer,
  Toolbar: CopilotChatAssistantMessage.Toolbar,
  ToolbarButton: CopilotChatAssistantMessage.ToolbarButton,
  CopyButton: CopilotChatAssistantMessage.CopyButton,
  ThumbsUpButton: CopilotChatAssistantMessage.ThumbsUpButton,
  ThumbsDownButton: CopilotChatAssistantMessage.ThumbsDownButton,
  ReadAloudButton: CopilotChatAssistantMessage.ReadAloudButton,
  RegenerateButton: CopilotChatAssistantMessage.RegenerateButton,
}) as typeof CopilotChatAssistantMessage;

export default CustomAssistantMessageV2;
