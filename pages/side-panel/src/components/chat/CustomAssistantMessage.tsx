import React, { useMemo, useState, useCallback } from "react";
import {
  useCopilotChat,
  useCopilotChatContext,
  Markdown,
  type AssistantMessageProps,
} from '../../hooks/copilotkit';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { MermaidBlock } from './MermaidBlock';
// @ts-ignore - Types package not installed, but functionality works fine
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

const extractTextFromMessage = (msg: any): string => {
  if (!msg) return '';
  const rawContent = msg?.content;
  if (!rawContent) return '';

  if (typeof rawContent === 'string') {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part: any) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (typeof part.text === 'string') return part.text;
        if (typeof part.content === 'string') return part.content;
        if (typeof part.value === 'string') return part.value;
        return '';
      })
      .filter(Boolean)
      .join('');
  }

  if (typeof rawContent === 'object') {
    if (typeof rawContent.text === 'string') {
      return rawContent.text;
    }
    if (Array.isArray(rawContent.parts)) {
      return rawContent.parts
        .map((part: any) => {
          if (!part) return '';
          if (typeof part === 'string') return part;
          if (typeof part.text === 'string') return part.text;
          if (typeof part.content === 'string') return part.content;
          return '';
        })
        .filter(Boolean)
        .join('');
    }
    if (typeof rawContent.content === 'string') {
      return rawContent.content;
    }
    try {
      return JSON.stringify(rawContent);
    } catch {
      return '';
    }
  }

  try {
    return String(rawContent);
  } catch {
    return '';
  }
};

/**
 * Maps language identifiers to their proper file extensions
 */
const getFileExtension = (language: string): string => {
  if (!language) return 'txt';
  
  const normalizedLang = language.toLowerCase().trim();
  
  const extensionMap: Record<string, string> = {
    // JavaScript/TypeScript
    'javascript': 'js',
    'js': 'js',
    'jsx': 'jsx',
    'typescript': 'ts',
    'ts': 'ts',
    'tsx': 'tsx',
    
    // Python
    'python': 'py',
    'py': 'py',
    'python3': 'py',
    
    // Web technologies
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    
    // Data formats
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'csv': 'csv',
    
    // Shell/Bash
    'bash': 'sh',
    'sh': 'sh',
    'shell': 'sh',
    'zsh': 'zsh',
    'fish': 'fish',
    'powershell': 'ps1',
    'ps1': 'ps1',
    
    // C/C++
    'c': 'c',
    'cpp': 'cpp',
    'c++': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'h': 'h',
    'hpp': 'hpp',
    'h++': 'hpp',
    
    // Java
    'java': 'java',
    
    // C#
    'csharp': 'cs',
    'cs': 'cs',
    'c#': 'cs',
    
    // Go
    'go': 'go',
    'golang': 'go',
    
    // Rust
    'rust': 'rs',
    'rs': 'rs',
    
    // PHP
    'php': 'php',
    
    // Ruby
    'ruby': 'rb',
    'rb': 'rb',
    
    // Swift
    'swift': 'swift',
    
    // Kotlin
    'kotlin': 'kt',
    'kt': 'kt',
    
    // Dart
    'dart': 'dart',
    
    // SQL
    'sql': 'sql',
    'mysql': 'sql',
    'postgresql': 'sql',
    'postgres': 'sql',
    
    // Markdown
    'markdown': 'md',
    'md': 'md',
    
    // Configuration
    'ini': 'ini',
    'conf': 'conf',
    'config': 'conf',
    
    // Other common languages
    'r': 'r',
    'matlab': 'm',
    'perl': 'pl',
    'pl': 'pl',
    'lua': 'lua',
    'scala': 'scala',
    'clojure': 'clj',
    'clj': 'clj',
    'haskell': 'hs',
    'hs': 'hs',
    'erlang': 'erl',
    'erl': 'erl',
    'elixir': 'ex',
    'ex': 'ex',
    'exs': 'exs',
    'ocaml': 'ml',
    'ml': 'ml',
    'fsharp': 'fs',
    'fs': 'fs',
    'f#': 'fs',
    'vb': 'vb',
    'vbnet': 'vb',
    'objective-c': 'm',
    'objc': 'm',
    'objectivec': 'm',
    'd': 'd',
    'fortran': 'f90',
    'f90': 'f90',
    'f95': 'f95',
    'cobol': 'cob',
    'cob': 'cob',
    
    // WebAssembly
    'wasm': 'wat',
    'wat': 'wat',
    
    // GraphQL
    'graphql': 'graphql',
    'gql': 'graphql',
    
    // Docker
    'dockerfile': 'dockerfile',
    'docker': 'dockerfile',
    
    // Makefile
    'makefile': 'makefile',
    'make': 'makefile',
    
    // Git
    'git': 'git',
    'gitignore': 'gitignore',
    'gitattributes': 'gitattributes',
    
    // Logs
    'log': 'log',
    
    // Plain text
    'text': 'txt',
    'plain': 'txt',
    'txt': 'txt',
  };
  
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
          fontSize: '11px',
          color: isLight ? '#6b7280' : '#9ca3af',
        }}
      >
        <span style={{ fontWeight: 500 }}>{language || 'text'}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {/* Download Button */}
          <button
            onClick={handleDownload}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '20px',
              width: '20px',
              padding: 0,
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Download"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '20px',
              width: '20px',
              padding: 0,
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: copied ? (isLight ? '#22c55e' : '#4ade80') : 'inherit',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            )}
          </button>
        </div>
      </div>
      {/* Code Content */}
      <SyntaxHighlighter
        style={isLight ? oneLight : oneDark}
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

/**
 * CustomAssistantMessage Component
 * 
 * Custom implementation of the AssistantMessage component based on CopilotKit's default.
 * Source: https://github.com/CopilotKit/CopilotKit/blob/main/CopilotKit/packages/react-ui/src/components/chat/messages/AssistantMessage.tsx
 */
export const CustomAssistantMessage = (props: AssistantMessageProps) => {
  const { icons, labels } = useCopilotChatContext();
  const { isLight } = useStorage(themeStorage);
  const {
    message,
    isLoading,
    onRegenerate,
    onCopy,
    onThumbsUp,
    onThumbsDown,
    isCurrentMessage,
    markdownTagRenderers,
  } = props;
  const [copied, setCopied] = useState(false);
  const { messages } = useCopilotChat();

  const { isLastInSeries, assistantSeries } = useMemo(() => {
    if (!message) {
      return { isLastInSeries: true, assistantSeries: [] as any[] };
    }

    if (!messages || messages.length === 0) {
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

    let prevUserIndex = -1;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const role = (messages[i] as any)?.role;
      if (role === 'user') {
        prevUserIndex = i;
        break;
      }
    }

    let nextUserIndex = messages.length;
    for (let i = currentIndex + 1; i < messages.length; i++) {
      const role = (messages[i] as any)?.role;
      if (role === 'user') {
        nextUserIndex = i;
        break;
      }
    }

    const assistantGroup: any[] = [];
    for (let i = prevUserIndex + 1; i < nextUserIndex; i++) {
      const candidate = messages[i];
      if ((candidate as any)?.role === 'assistant') {
        assistantGroup.push(candidate);
      }
    }

    if (assistantGroup.length === 0) {
      return { isLastInSeries: true, assistantSeries: [message] };
    }

    const lastAssistant = assistantGroup[assistantGroup.length - 1];
    return {
      isLastInSeries: lastAssistant?.id === message.id,
      assistantSeries: assistantGroup,
    };
  }, [messages, message]);

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
  }, [assistantSeries]);

  const handleCopy = async () => {
    const textToCopy = aggregatedSeriesContent || extractTextFromMessage(message);
    const safeText = textToCopy?.trim();

    if (!safeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(safeText);
      setCopied(true);
      if (onCopy) {
        onCopy(safeText);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy assistant response:', error);
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) onRegenerate();
  };

  const handleThumbsUp = () => {
    if (onThumbsUp && message) {
      onThumbsUp(message);
    }
  };

  const handleThumbsDown = () => {
    if (onThumbsDown && message) {
      onThumbsDown(message);
    }
  };

  const LoadingIcon = () => <span>{icons.activityIcon}</span>;
  const content = message?.content || "";
  const subComponent = message?.generativeUI?.();
  const shouldRenderControls = Boolean(content) && !isLoading && isLastInSeries;

  const assistantMessageStyle = shouldRenderControls
    ? {
        marginBottom: '1rem',
      }
    : undefined;

  // Parse content to extract custom tags (tags with renderers) and render them directly
  // This bypasses CopilotKit for custom tags to allow immediate rendering during streaming
  // Works generically for any tag that has a renderer in markdownTagRenderers
  const contentParts = useMemo(() => {
    if (!content) return { before: '', incompleteTag: null, after: '', hasIncomplete: false };
    
    // Common HTML tags to exclude (these shouldn't be treated as custom tags)
    const htmlTags = new Set([
      'p', 'div', 'span', 'a', 'img', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
      'thead', 'tbody', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'u',
      'code', 'pre', 'blockquote', 'section', 'article', 'header', 'footer', 'nav', 'main'
    ]);
    
    // Generic regex to match XML-style tags
    const openTagRegex = /<([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?:[^>]*)?>/g;
    const closeTagRegex = /<\/([a-zA-Z_][a-zA-Z0-9_-]*)\s*>/g;
    
    const openTags: Array<{ index: number; tag: string; name: string; fullMatch: string }> = [];
    const closeTags: Array<{ index: number; tag: string; name: string }> = [];
    
    // Reset regex lastIndex
    openTagRegex.lastIndex = 0;
    closeTagRegex.lastIndex = 0;
    
    // Find all opening tags (excluding common HTML tags)
    let match;
    while ((match = openTagRegex.exec(content)) !== null) {
      const tagName = match[1].toLowerCase();
      // Only track custom tags, not standard HTML tags
      if (!htmlTags.has(tagName)) {
        openTags.push({
          index: match.index,
          tag: match[0],
          name: tagName,
          fullMatch: match[0],
        });
      }
    }
    
    // Find all closing tags (excluding common HTML tags)
    while ((match = closeTagRegex.exec(content)) !== null) {
      const tagName = match[1].toLowerCase();
      if (!htmlTags.has(tagName)) {
        closeTags.push({
          index: match.index,
          tag: match[0],
          name: tagName,
        });
      }
    }
    
    // Find tags that have custom renderers - handle them specially for consistent rendering
    // This works generically for any tag that has a renderer in markdownTagRenderers
    const customTagNames = new Set(
      markdownTagRenderers ? Object.keys(markdownTagRenderers) : []
    );
    
    const customOpenTags = openTags.filter(tag => customTagNames.has(tag.name));
    
    if (customOpenTags.length > 0) {
      // Find the last custom tag (most recent during streaming)
      const lastCustomTag = customOpenTags[customOpenTags.length - 1];
      
      // Find matching closing tag
      const matchingClose = closeTags.find(
        close => close.name === lastCustomTag.name && close.index > lastCustomTag.index
      );
      
      const openIndex = lastCustomTag.index;
      const openTagLength = lastCustomTag.fullMatch.length;
      const contentStart = openIndex + openTagLength;
      
      if (matchingClose) {
        // Complete tag - extract content between tags
        const closeIndex = matchingClose.index;
        const tagContent = content.slice(contentStart, closeIndex);
        const afterContent = content.slice(closeIndex + matchingClose.tag.length);
        
        return {
          before: content.slice(0, openIndex),
          incompleteTag: {
            name: lastCustomTag.name,
            content: tagContent,
            isComplete: true,
          },
          after: afterContent,
          hasIncomplete: true,
        };
      } else {
        // Incomplete tag (streaming) - extract all content after opening tag
        const incompleteContent = content.slice(contentStart);
        
        return {
          before: content.slice(0, openIndex),
          incompleteTag: {
            name: lastCustomTag.name,
            content: incompleteContent,
            isComplete: false,
          },
          after: '',
          hasIncomplete: true,
        };
      }
    }
    
    // No custom tags found - return content as-is
    return {
      before: content,
      incompleteTag: null,
      after: '',
      hasIncomplete: false,
    };
  }, [content, markdownTagRenderers]);

  // Render custom tags directly using their registered renderers
  // This bypasses CopilotKit for consistent rendering during streaming and after completion
  const renderCustomTag = useCallback((tagName: string, tagContent: string, isComplete: boolean = false) => {
    // Get renderer from markdownTagRenderers (generic - works for any registered tag)
    const Renderer = markdownTagRenderers?.[tagName as keyof typeof markdownTagRenderers] as 
      React.ComponentType<{ children?: React.ReactNode; isComplete?: boolean; instanceId?: string }> | undefined;
    
    if (Renderer) {
      // Create unique instance ID from message ID + tag name for state persistence across remounts
      const messageId = (message as any)?.id ?? '';
      const instanceId = `${messageId}-${tagName}`;
      // Pass content and completion status directly to the renderer component
      return <Renderer isComplete={isComplete} instanceId={instanceId}>{tagContent}</Renderer>;
    }
    
    // Fallback: Unknown tag - render as plain text
    return (
      <div style={{ padding: '8px', background: isLight ? '#f9fafb' : '#151C24', borderRadius: '4px', margin: '4px 0' }}>
        <code style={{ fontSize: '11px', color: isLight ? '#6b7280' : '#9ca3af' }}>&lt;{tagName}&gt;</code>
        <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap', fontSize: '12px', color: isLight ? '#1f2937' : '#e6edf3', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{tagContent}</pre>
      </div>
    );
  }, [markdownTagRenderers, isLight, message]);

  // Extend markdownTagRenderers with code block renderer and table components
  // Handle mermaid with MermaidBlock, other code blocks with CodeBlockWithToolbar
  const extendedMarkdownRenderers = useMemo(() => {
    return {
      ...markdownTagRenderers,
      // Override code renderer to handle mermaid and other code blocks
      code: ({ node, inline, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const language = match ? match[1] : '';
        
        // Handle mermaid diagrams - return our custom component
        if (language === 'mermaid' && !inline) {
          return <MermaidBlock>{String(children)}</MermaidBlock>;
        }
        
        // If not inline and has multiple lines, treat as code block
        const isCodeBlock = !inline && (String(children).includes('\n') || language);
        
        return isCodeBlock ? (
          <CodeBlockWithToolbar
            language={language || 'text'}
            code={String(children).replace(/\n$/, '')}
            isLight={isLight}
          />
        ) : (
          <code className={`copilotKitInlineCode ${className || ''}`} {...props}>
            {children}
          </code>
        );
      },
      // Table components (GFM tables) - matches session table design
      // Styles are handled by CSS in content.css
      table: ({ node, children, ...props }: any) => (
        <div className="markdown-table-wrapper">
          <table {...props}>{children}</table>
        </div>
      ),
      thead: ({ node, children, ...props }: any) => (
        <thead {...props}>{children}</thead>
      ),
      tbody: ({ node, children, ...props }: any) => (
        <tbody {...props}>{children}</tbody>
      ),
      tr: ({ node, children, ...props }: any) => (
        <tr {...props}>{children}</tr>
      ),
      th: ({ node, children, ...props }: any) => (
        <th {...props}>{children}</th>
      ),
      td: ({ node, children, ...props }: any) => (
        <td {...props}>{children}</td>
      ),
    };
  }, [markdownTagRenderers, isLight]);

  return (
    <>
      {content && (
        <div
          className="copilotKitMessage copilotKitAssistantMessage"
          data-message-role="assistant"
          data-message-id={(message as any)?.id || ''}
          style={assistantMessageStyle}
        >
          {contentParts.hasIncomplete ? (
            <>
              {/* Render content before custom tag through CopilotKit */}
              {contentParts.before && (
                <Markdown content={contentParts.before} components={extendedMarkdownRenderers} />
              )}
              {/* Render custom tag directly, bypassing CopilotKit for consistent rendering */}
              {contentParts.incompleteTag && renderCustomTag(
                contentParts.incompleteTag.name,
                contentParts.incompleteTag.content,
                contentParts.incompleteTag.isComplete ?? false
              )}
              {/* Render content after custom tag through CopilotKit */}
              {contentParts.after && (
                <Markdown content={contentParts.after} components={extendedMarkdownRenderers} />
              )}
            </>
          ) : (
            /* No custom tags - render normally through CopilotKit */
            <Markdown content={content} components={extendedMarkdownRenderers} />
          )}

          {shouldRenderControls && (
            <div
              className={`copilotKitMessageControls ${isCurrentMessage ? "currentMessage" : ""}`}
            >
              {/* <button
                className="copilotKitMessageControlButton"
                onClick={handleRegenerate}
                aria-label={labels.regenerateResponse}
                title={labels.regenerateResponse}
              >
                {icons.regenerateIcon}
              </button> */}
              <button
                className="copilotKitMessageControlButton"
                onClick={handleCopy}
                aria-label={labels.copyToClipboard}
                title={labels.copyToClipboard}
                style={{
                  width: '28px',
                  height: '28px',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: 'none',
              backgroundColor: 'transparent',
                  color: copied ? '#22c55e' : isLight ? '#0C1117' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                {copied ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      width: '13px',
                      height: '13px',
                      strokeWidth: '2',
                      shapeRendering: 'geometricPrecision',
                      WebkitFontSmoothing: 'antialiased',
                    }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      width: '13px',
                      height: '13px',
                      strokeWidth: '2',
                      shapeRendering: 'geometricPrecision',
                      WebkitFontSmoothing: 'antialiased',
                    }}
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
              {/* {onThumbsUp && (
                <button
                  className="copilotKitMessageControlButton"
                  onClick={handleThumbsUp}
                  aria-label={labels.thumbsUp}
                  title={labels.thumbsUp}
                >
                  {icons.thumbsUpIcon}
                </button>
              )}
              {onThumbsDown && (
                <button
                  className="copilotKitMessageControlButton"
                  onClick={handleThumbsDown}
                  aria-label={labels.thumbsDown}
                  title={labels.thumbsDown}
                >
                  {icons.thumbsDownIcon}
                </button>
              )} */}
            </div>
          )}
        </div>
      )}
      <div>{subComponent}</div>
      {isLoading && (
        <div className="copilotKitMessage copilotKitAssistantMessage">
          <LoadingIcon />
        </div>
      )}
    </>
  );
};

