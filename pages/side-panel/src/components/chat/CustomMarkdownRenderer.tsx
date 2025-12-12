/**
 * Custom Markdown Renderer for CopilotKit V2
 * 
 * Wraps Streamdown with custom code block, mermaid diagram, table, and thinking block rendering.
 */
import React from 'react';
import { Streamdown } from 'streamdown';
import { CustomCodeBlockWrapper } from './slots/CustomCodeBlock';
import { CustomTableWrapper } from './slots/CustomTable';
import { ThinkingBlockWrapper } from './ThinkingBlockWrapper';

interface CustomMarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * CustomMarkdownRenderer - Replacement for CopilotChatAssistantMessage.MarkdownRenderer
 * 
 * Uses Streamdown with custom components:
 * - `pre` for code blocks with react-syntax-highlighter and mermaid diagram rendering
 * - `table` for styled tables matching graph card design
 * - `think` and `thinking` for collapsible thinking blocks (with auto-detection of completion state)
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
        table: CustomTableWrapper,
        // Custom HTML tags for thinking blocks
        think: ThinkingBlockWrapper,
        thinking: ThinkingBlockWrapper,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any}
      {...props}
    >
      {content ?? ''}
    </Streamdown>
  );
};

export default CustomMarkdownRenderer;

