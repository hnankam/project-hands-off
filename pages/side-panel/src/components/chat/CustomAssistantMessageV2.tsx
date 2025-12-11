/**
 * Custom Assistant Message for CopilotKit V2
 * 
 * Wraps CopilotChatAssistantMessage with custom MarkdownRenderer
 * that uses react-syntax-highlighter for code blocks.
 */
import React from 'react';
import { CopilotChatAssistantMessage } from '../../hooks/copilotkit';
import { CustomMarkdownRenderer } from './CustomMarkdownRenderer';

type AssistantMessageProps = React.ComponentProps<typeof CopilotChatAssistantMessage>;

/**
 * CustomAssistantMessageV2 - Wrapper for CopilotChatAssistantMessage
 * 
 * Passes our custom MarkdownRenderer that uses react-syntax-highlighter
 * with One Dark Pro theme for code blocks.
 */
const CustomAssistantMessageV2Component: React.FC<AssistantMessageProps> = (props) => {
  return (
    <CopilotChatAssistantMessage
      {...props}
      markdownRenderer={CustomMarkdownRenderer}
    />
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

