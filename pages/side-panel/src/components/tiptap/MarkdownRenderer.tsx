import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore - Types package not installed, but functionality works fine
import remarkGfm from 'remark-gfm';
// @ts-ignore - Types package not installed, but functionality works fine
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MermaidBlock } from '../chat/MermaidBlock';

// Type for syntax highlighter style
type SyntaxStyle = Record<string, React.CSSProperties>;

/**
 * Get file extension based on language
 */
const getFileExtension = (language: string): string => {
  const extensionMap: Record<string, string> = {
    javascript: 'js', typescript: 'ts', python: 'py', java: 'java',
    cpp: 'cpp', 'c++': 'cpp', c: 'c', csharp: 'cs', 'c#': 'cs',
    ruby: 'rb', go: 'go', rust: 'rs', swift: 'swift', kotlin: 'kt',
    php: 'php', html: 'html', css: 'css', scss: 'scss', sass: 'sass',
    less: 'less', json: 'json', yaml: 'yaml', yml: 'yml', xml: 'xml',
    markdown: 'md', md: 'md', sql: 'sql', bash: 'sh', shell: 'sh',
    sh: 'sh', zsh: 'zsh', powershell: 'ps1', dockerfile: 'dockerfile',
    text: 'txt',
  };
  const normalizedLang = language?.toLowerCase() || 'text';
  return extensionMap[normalizedLang] || normalizedLang;
};

/**
 * CodeBlockWithToolbar Component
 * Renders a code block with syntax highlighting and a toolbar (copy/download buttons)
 */
const CodeBlockWithToolbar: React.FC<{
  language: string;
  code: string;
  isLight: boolean;
}> = ({ language, code, isLight }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  const handleDownload = () => {
    const extension = getFileExtension(language);
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-${Date.now()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '6px',
        border: `1px solid ${isLight ? '#e5e7eb' : '#374151'}`,
        backgroundColor: isLight ? '#f9fafb' : '#151C24',
        overflow: 'hidden',
        margin: '0.25em 0',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '28px',
          padding: '0 8px',
          background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
          borderBottom: `1px solid ${isLight ? '#e5e7eb' : '#374151'}`,
        }}
      >
        {/* Language label */}
        <span
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: isLight ? '#6b7280' : '#9ca3af',
            textTransform: 'lowercase',
          }}
        >
          {language || 'text'}
        </span>
        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={handleDownload}
            title="Download"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isLight ? '#6b7280' : '#9ca3af',
              borderRadius: '4px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: copied ? '#22c55e' : (isLight ? '#6b7280' : '#9ca3af'),
              borderRadius: '4px',
              transition: 'background-color 0.2s, color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!copied) e.currentTarget.style.backgroundColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {/* Code Content */}
      <SyntaxHighlighter
        style={(isLight ? oneLight : oneDark) as SyntaxStyle}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: '12px 14px',
          borderRadius: 0,
          backgroundColor: isLight ? '#ffffff' : '#0d1117',
          fontSize: '13px',
        }}
        codeTagProps={{
          style: {
            backgroundColor: 'transparent',
          }
        }}
      >
        {code.replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
};

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
  if (!content) return content;
  
  let processed = content;
  
  // Only fix: ensure newline before ``` if text is directly adjacent
  // This handles "text```python" -> "text\n```python"
  processed = processed.replace(/([^\n\s])```/g, '$1\n```');
  
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
 * - Headings (H1-H6)
 * - Blockquotes
 * - Horizontal rules
 * - Lists (ordered and unordered)
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
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[]}
        components={{
          // Code blocks with syntax highlighting and mermaid diagram support
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code(props: any) {
            const { node, className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeString = String(children);
            
            // Determine if this is an inline code or a block
            // Block code has newlines or a language specifier
            const isInline = !codeString.includes('\n') && !language;
            
            // Handle mermaid diagrams
            if (language === 'mermaid' && !isInline) {
              return <MermaidBlock>{codeString}</MermaidBlock>;
            }
            
            // If not inline and has multiple lines, treat as code block even without language
            const isCodeBlock = !isInline;
            
            return isCodeBlock ? (
              <CodeBlockWithToolbar
                language={language || 'text'}
                code={codeString.replace(/\n$/, '')}
                isLight={isLight}
              />
            ) : (
              <code className={className} {...rest}>
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
          // Headings (H1-H6)
          h1({ node, children, ...props }: any) {
            return <h1 {...props}>{children}</h1>;
          },
          h2({ node, children, ...props }: any) {
            return <h2 {...props}>{children}</h2>;
          },
          h3({ node, children, ...props }: any) {
            return <h3 {...props}>{children}</h3>;
          },
          h4({ node, children, ...props }: any) {
            return <h4 {...props}>{children}</h4>;
          },
          h5({ node, children, ...props }: any) {
            return <h5 {...props}>{children}</h5>;
          },
          h6({ node, children, ...props }: any) {
            return <h6 {...props}>{children}</h6>;
          },
          // Blockquote
          blockquote({ node, children, ...props }: any) {
            return <blockquote {...props}>{children}</blockquote>;
          },
          // Horizontal rule
          hr({ node, ...props }: any) {
            return <hr {...props} />;
          },
          // Unordered list
          ul({ node, children, ...props }: any) {
            return <ul {...props}>{children}</ul>;
          },
          // Ordered list
          ol({ node, children, ...props }: any) {
            return <ol {...props}>{children}</ol>;
          },
          // List item
          li({ node, children, ...props }: any) {
            return <li {...props}>{children}</li>;
          },
          // Strong/bold text
          strong({ node, children, ...props }) {
            return <strong className="markdown-bold" {...props}>{children}</strong>;
          },
          // Emphasized/italic text
          em({ node, children, ...props }) {
            return <em className="markdown-italic" {...props}>{children}</em>;
          },
          // Table components (GFM tables) - matches session table design
          // Wrapper provides horizontal scroll with fixed header
          table({ node, children, ...props }: any) {
            return (
              <div className="markdown-table-wrapper">
                <table {...props}>
                  {children}
                </table>
              </div>
            );
          },
          thead({ node, children, ...props }: any) {
            return <thead {...props}>{children}</thead>;
          },
          tbody({ node, children, ...props }: any) {
            return <tbody {...props}>{children}</tbody>;
          },
          tr({ node, children, ...props }: any) {
            return <tr {...props}>{children}</tr>;
          },
          th({ node, children, ...props }: any) {
            return <th {...props}>{children}</th>;
          },
          td({ node, children, ...props }: any) {
            return <td {...props}>{children}</td>;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

