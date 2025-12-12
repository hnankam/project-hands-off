/**
 * Custom Assistant Message for CopilotKit V2
 * 
 * Wraps CopilotChatAssistantMessage with custom MarkdownRenderer
 * and styled toolbar buttons matching user message design (right-aligned, no gradient).
 */
import React from 'react';
import { CopilotChatAssistantMessage } from '../../hooks/copilotkit';
import { CustomMarkdownRenderer } from './CustomMarkdownRenderer';
import { 
  CustomCopyButton,
  CustomRegenerateButton,
  CustomThumbsUpButton,
  CustomThumbsDownButton,
  CustomReadAloudButton,
} from './slots/CustomAssistantMessageButtons';

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
        isRunning,
      }) => {
        // Hide toolbar when running
        if (isRunning) {
          return (
            <>
              {markdownRenderer}
              {toolCallsView}
            </>
          );
        }
        
        // Reorder buttons: Regenerate, ThumbsUp, ThumbsDown, ReadAloud, Copy (rightmost)
        const reorderedToolbar = (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            width: '100%',
            gap: '0.25rem',
          }}>
            {/* Regenerate Button */}
            {regenerateButton}
            
            {/* Thumbs Up Button */}
            {thumbsUpButton}
            
            {/* Thumbs Down Button */}
            {thumbsDownButton}
            
            {/* Read Aloud Button */}
            {readAloudButton}
            
            {/* Copy Button (rightmost) */}
            {copyButton}
          </div>
        );
        
        return (
          <>
            {markdownRenderer}
            {toolCallsView}
            {reorderedToolbar}
          </>
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

