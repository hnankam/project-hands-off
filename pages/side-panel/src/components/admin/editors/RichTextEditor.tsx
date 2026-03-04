import * as React from 'react';
import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { cn } from '@extension/ui';
import { Markdown } from 'tiptap-markdown';

// Create lowlight instance for code highlighting
const lowlight = createLowlight(common);

// Common HTML tags that should be allowed (not escaped)
// Only standard HTML and markdown tags should be rendered - all custom tags are escaped
const HTML_TAGS = new Set([
  'p', 'div', 'span', 'a', 'img', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
  'thead', 'tbody', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'u',
  'code', 'pre', 'blockquote', 'section', 'article', 'header', 'footer', 'nav', 'main'
]);

/**
 * Escapes all custom tags (non-HTML tags) so they appear as plain text.
 * Only standard HTML tags are allowed - all other tags are escaped.
 */
function escapeCustomTags(markdown: string): string {
  if (!markdown) return markdown;
  
  // Regex to match XML-style tags (captures closing slash, tag name, and attributes)
  const tagRegex = /<(\/?)([a-zA-Z_][a-zA-Z0-9_-]*)(\s[^>]*)?>/g;
  
  return markdown.replace(tagRegex, (match, closingSlash, tagName, attrs) => {
    const normalizedTagName = tagName.toLowerCase();
    
    // Only allow standard HTML tags - escape all custom tags
    if (HTML_TAGS.has(normalizedTagName)) {
      return match; // Keep as-is
    }
    
    // Escape all custom tags - convert <tag> to &lt;tag&gt;
    const attrsStr = attrs || '';
    return `&lt;${closingSlash}${tagName}${attrsStr}&gt;`;
  });
}

/**
 * Unescapes custom tags that were previously escaped.
 * Converts HTML entities back to tag syntax.
 */
function unescapeCustomTags(markdown: string): string {
  if (!markdown) return markdown;
  
  // Regex to match escaped tags (HTML entities) - captures closing slash, tag name, and attributes
  const escapedTagRegex = /&lt;(\/?)([a-zA-Z_][a-zA-Z0-9_-]*)(\s[^&]*)?&gt;/g;
  
  return markdown.replace(escapedTagRegex, (match, closingSlash, tagName, attrs) => {
    const normalizedTagName = tagName.toLowerCase();
    
    // Only unescape tags that aren't HTML tags (all custom tags should be unescaped)
    if (!HTML_TAGS.has(normalizedTagName)) {
      const attrsStr = attrs || '';
      return `<${closingSlash}${tagName}${attrsStr}>`;
    }
    
    return match; // Keep escaped if it's an HTML tag (shouldn't happen, but safe)
  });
}

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLight: boolean;
  minHeight?: string;
  maxHeight?: string;
}

/**
 * RichTextEditor Component
 * 
 * A rich text editor with toolbar for the admin page.
 * Features:
 * - Bold, italic, code formatting
 * - Headings (H1-H3)
 * - Bullet and numbered lists
 * - Blockquotes
 * - Code blocks
 * - Horizontal rules
 * - Consistent with app design
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start typing...',
  isLight,
  minHeight = '150px',
  maxHeight = '400px',
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        horizontalRule: {},
        blockquote: {},
        codeBlock: false, // We'll use CodeBlockLowlight instead
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'code-block-editor',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Markdown.configure({
        html: true, // Allow HTML for backwards compatibility
        tightLists: true,
        tightListClass: 'tight',
        bulletListMarker: '-',
        linkify: false,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    // Escape custom tags before loading into editor so they appear as plain text
    content: escapeCustomTags(value || ''),
    onUpdate: ({ editor }) => {
      const markdown = (editor.storage as any).markdown.getMarkdown();
      // Unescape custom tags when serializing back to markdown
      onChange(unescapeCustomTags(markdown));
    },
    editorProps: {
      attributes: {
        class: 'admin-rich-text-editor',
      },
    },
  });

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value !== undefined) {
      const currentMarkdown = (editor.storage as any).markdown.getMarkdown();
      const unescapedCurrentMarkdown = unescapeCustomTags(currentMarkdown);
      if (value !== unescapedCurrentMarkdown) {
        // Escape custom tags before setting content
        editor.commands.setContent(escapeCustomTags(value || ''));
      }
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  const ToolbarButton: React.FC<{
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
  }> = ({ onClick, isActive = false, disabled = false, title, children }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1 rounded transition-colors text-sm',
        isActive
          ? isLight
            ? 'bg-blue-100 text-blue-700'
            : 'bg-blue-900/30 text-blue-300'
          : isLight
            ? 'text-gray-700 hover:bg-gray-100'
            : 'text-gray-300 hover:bg-gray-700',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );

  const ToolbarDivider = () => (
    <div
      className={cn(
        'w-px h-4 mx-0.5',
        isLight ? 'bg-gray-300' : 'bg-gray-600'
      )}
    />
  );

  return (
    <div
      className={cn(
        'border rounded overflow-hidden flex flex-col',
        isLight ? 'border-gray-300 bg-white' : 'border-gray-600 bg-[#151C24]'
      )}
      style={{ height: maxHeight, minHeight }}
    >
      {/* Toolbar */}
      <div
        className={cn(
          'flex items-center gap-0.5 px-1.5 py-0.5 border-b flex-wrap',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#0C1117]'
        )}
      >
        {/* Text Formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
            <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <line x1="19" y1="4" x2="10" y2="4" />
            <line x1="14" y1="20" x2="5" y2="20" />
            <line x1="15" y1="4" x2="9" y2="20" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive('code')}
          title="Inline Code (Ctrl+E)"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </ToolbarButton>

        <ToolbarDivider />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <span className="font-bold text-xs">H1</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <span className="font-bold text-xs">H2</span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <span className="font-bold text-xs">H3</span>
        </ToolbarButton>

        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
            <path d="M4 6h1v4" />
            <path d="M4 10h2" />
            <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
          </svg>
        </ToolbarButton>

        <ToolbarDivider />

        {/* Block Elements */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive('codeBlock')}
          title="Code Block"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="Blockquote"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        </ToolbarButton>

        <ToolbarDivider />

        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Y)"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Editor Content */}
      <div
        className={cn(
          'flex-1 admin-rich-text-editor',
          isLight ? 'text-gray-700' : 'text-[#bcc1c7]'
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichTextEditor;

