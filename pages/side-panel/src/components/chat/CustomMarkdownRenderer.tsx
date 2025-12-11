/**
 * Custom Markdown Renderer for CopilotKit V2
 * 
 * Wraps Streamdown with custom code block rendering using react-syntax-highlighter.
 */
import React from 'react';
import { Streamdown } from 'streamdown';
import { CustomCodeBlockWrapper } from './slots/CustomCodeBlock';

interface CustomMarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * CustomMarkdownRenderer - Replacement for CopilotChatAssistantMessage.MarkdownRenderer
 * 
 * Uses Streamdown with a custom `pre` component that renders code blocks
 * with react-syntax-highlighter and One Dark Pro theme.
 */
export const CustomMarkdownRenderer: React.FC<CustomMarkdownRendererProps> = ({
  content,
  className,
  ...props
}) => {
  return (
    <Streamdown
      className={className}
      components={{
        pre: CustomCodeBlockWrapper,
      }}
      {...props}
    >
      {content ?? ''}
    </Streamdown>
  );
};

export default CustomMarkdownRenderer;

