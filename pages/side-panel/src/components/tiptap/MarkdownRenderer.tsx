import React from 'react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore - Types package not installed, but functionality works fine
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MermaidBlock } from '../MermaidBlock';

export interface MarkdownRendererProps {
  /**
   * Markdown content to render
   */
  content: string;
  
  /**
   * Whether to use light theme
   */
  isLight?: boolean;
  
  /**
   * Additional CSS class
   */
  className?: string;
}

/**
 * Preprocess markdown content to ensure proper spacing around code blocks
 */
const preprocessMarkdown = (content: string): string => {
  // Ensure newlines before and after code block fences
  let processed = content;
  
  // Add newline before opening ``` if not present (but not at start of content)
  processed = processed.replace(/([^\n])```/g, '$1\n```');
  
  // Add single newline after closing ``` if not present (and there's content after)
  processed = processed.replace(/```([^\n\s])/g, '```\n$1');
  
  // Handle closing ``` followed by whitespace but not newline
  processed = processed.replace(/```([ \t]+)([^\n])/g, '```\n$2');
  
  return processed.trim();
};

/**
 * Process text to convert @mentions into styled spans
 */
const processMentions = (text: string): (string | React.ReactElement)[] => {
  const mentionRegex = /@([a-zA-Z0-9_.-]+)/g;
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // Add the mention as a styled span
    parts.push(
      <span key={match.index} className="mention">
        {match[0]}
      </span>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : [text];
};

/**
 * Markdown Renderer Component
 * 
 * Renders markdown content with:
 * - Syntax-highlighted code blocks
 * - Clickable links (styled like editor links)
 * - @Mentions (styled as blue pills)
 * - Bold/italic text
 * - Inline code
 * - Proper styling
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isLight = true,
  className = '',
}) => {
  // Preprocess content to ensure proper markdown formatting
  const processedContent = preprocessMarkdown(content);
  
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        components={{
          // Code blocks with syntax highlighting and mermaid diagram support
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            // Handle mermaid diagrams
            if (language === 'mermaid' && !inline) {
              return <MermaidBlock>{String(children)}</MermaidBlock>;
            }
            
            // If not inline and has multiple lines, treat as code block even without language
            const isCodeBlock = !inline && (String(children).includes('\n') || language);
            
            return isCodeBlock ? (
              <SyntaxHighlighter
                style={isLight ? oneLight : oneDark}
                language={language || 'text'}
                PreTag="div"
                customStyle={{
                  margin: '0',
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: isLight ? '#e8eaed' : '#0d1117',
                  fontSize: '13px',
                }}
                codeTagProps={{
                  style: {
                    backgroundColor: 'transparent',
                  }
                }}
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Links styled like editor links with icon
          a({ node, children, ...props }: any) {
            return (
              <a
                href={props.href}
                target="_blank"
                rel="noopener noreferrer"
                className="markdown-link editor-link-style"
                {...props}
              >
                {children}
              </a>
            );
          },
          // Paragraphs with proper spacing and mention processing
          p({ node, children, ...props }) {
            // Process text children to handle mentions (only in text, not in code/links)
            const processedChildren = React.Children.map(children, child => {
              if (typeof child === 'string') {
                const parts = processMentions(child);
                return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
              }
              return child;
            });
            
            return <p className="markdown-paragraph" {...props}>{processedChildren}</p>;
          },
          // Strong/bold text
          strong({ node, children, ...props }) {
            return <strong className="markdown-bold" {...props}>{children}</strong>;
          },
          // Emphasized/italic text
          em({ node, children, ...props }) {
            return <em className="markdown-italic" {...props}>{children}</em>;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

