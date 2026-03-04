/**
 * Custom Code Block Components
 * 
 * Provides:
 * - CodeBlock: Shared code block with syntax highlighting (used by graph card, markdown, etc.)
 * - CustomCodeBlockWrapper: Wrapper for CopilotKit that extracts code from children and handles mermaid diagrams
 */
import * as React from 'react';
import { useState, useCallback, Children, isValidElement, memo } from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { MermaidBlock } from '../MermaidBlock';
// @ts-ignore - Types package not installed, but functionality works fine
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Map common language aliases to file extensions
 */
const getFileExtension = (language: string): string => {
  const extensionMap: Record<string, string> = {
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    ruby: 'rb',
    java: 'java',
    csharp: 'cs',
    cpp: 'cpp',
    c: 'c',
    go: 'go',
    rust: 'rs',
    php: 'php',
    swift: 'swift',
    kotlin: 'kt',
    scala: 'scala',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    yaml: 'yaml',
    yml: 'yml',
    xml: 'xml',
    markdown: 'md',
    sql: 'sql',
    shell: 'sh',
    bash: 'sh',
    powershell: 'ps1',
    dockerfile: 'dockerfile',
    text: 'txt',
  };
  const normalizedLang = language?.toLowerCase() || 'text';
  return extensionMap[normalizedLang] || normalizedLang;
};

// =============================================================================
// CodeBlock - Shared component for rendering code with syntax highlighting
// =============================================================================

export interface CodeBlockProps {
  language: string;
  code: string;
  isLight: boolean;
  hideToolbar?: boolean;
}

/**
 * CodeBlock - Renders a code block with syntax highlighting and toolbar
 * 
 * Used by:
 * - CustomCodeBlockWrapper (for CopilotKit V2 chat)
 * - MarkdownRenderer (for graph card and other markdown rendering)
 */
export const CodeBlock: React.FC<CodeBlockProps> = memo(({ language, code, isLight, hideToolbar = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  }, [code]);

  const handleDownload = useCallback(() => {
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
  }, [code, language]);

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
      {!hideToolbar && (
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
        </div>
      </div>
      )}
      {/* Code Content with Syntax Highlighting */}
      <SyntaxHighlighter
        style={isLight ? oneLight : oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: hideToolbar ? '12px 14px' : '12px 14px',
          borderRadius: 0,
          backgroundColor: isLight ? '#ffffff' : '#0d1117',
          fontSize: '13px',
          fontWeight: 'normal',
          lineHeight: '1.5',
        }}
        codeTagProps={{
          style: {
            backgroundColor: 'transparent',
            fontSize: '13px',
            fontWeight: 'normal',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            display: 'block',
          }
        }}
        lineProps={{
          style: {
            backgroundColor: 'transparent',
            display: 'block',
          }
        }}
        lineNumberStyle={{
          display: 'none',
        }}
      >
        {code.replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
});

CodeBlock.displayName = 'CodeBlock';

// =============================================================================
// CustomCodeBlockWrapper - Wrapper for CopilotKit/Markdown renderers
// =============================================================================

interface CustomCodeBlockWrapperProps {
  children?: React.ReactNode;
  className?: string;
  node?: any;
  hideToolbars?: boolean;
  [key: string]: any;
}

/**
 * Extract code content and language from code element children
 */
function extractCodeInfo(children: React.ReactNode): { code: string; language: string } {
  let code = '';
  let language = 'text';

  // Handle string children directly
  if (typeof children === 'string') {
    code = children;
  }
  // Handle React elements (usually <code> element with className containing language)
  else if (isValidElement(children)) {
    const childElement = children as React.ReactElement<any>;
    
    // Extract language from className (e.g., "language-python")
    const className = childElement.props?.className || '';
    const langMatch = className.match(/language-(\w+)/);
    if (langMatch) {
      language = langMatch[1];
    }
    
    // Extract code content
    const childContent = childElement.props?.children;
    if (typeof childContent === 'string') {
      code = childContent;
    } else if (Array.isArray(childContent)) {
      code = childContent.map(c => typeof c === 'string' ? c : '').join('');
    }
  }
  // Handle array of children
  else if (Array.isArray(children)) {
    Children.forEach(children, (child) => {
      if (typeof child === 'string') {
        code += child;
      } else if (isValidElement(child)) {
        const result = extractCodeInfo(child);
        code += result.code;
        if (result.language !== 'text') {
          language = result.language;
        }
      }
    });
  }

  return { code: code.trim(), language };
}

/**
 * CustomCodeBlockWrapper - Custom pre element renderer
 * 
 * Extracts code and language from children and renders using:
 * - MermaidBlock for mermaid diagrams
 * - CodeBlock for all other code languages
 * 
 * Used as the `pre` component override in markdown renderers.
 */
export const CustomCodeBlockWrapper: React.FC<CustomCodeBlockWrapperProps> = memo(({
  children,
  className,
  hideToolbars = false,
  ...props
}) => {
  const themeState = useStorage(themeStorage);
  const isLight = themeState.isLight;

  const { code, language } = extractCodeInfo(children);

  // If no code content, render as plain pre
  if (!code) {
    return <pre className={className} {...props}>{children}</pre>;
  }

  // Handle mermaid diagrams with MermaidBlock
  if (language === 'mermaid') {
    return <MermaidBlock>{code}</MermaidBlock>;
  }

  // Handle all other code with syntax highlighting
  return <CodeBlock language={language} code={code} isLight={isLight} hideToolbar={hideToolbars} />;
});

CustomCodeBlockWrapper.displayName = 'CustomCodeBlockWrapper';

export default CustomCodeBlockWrapper;

