import { Editor } from '@tiptap/react';

/**
 * Converts Tiptap editor content to Markdown format
 * Uses tiptap-markdown extension if available, falls back to custom serializer
 * Supports: headings, bold, italic, code blocks, code inline, mentions, paragraphs, 
 *           hard breaks, blockquotes, horizontal rules, lists (ordered and unordered), links
 */
export function editorToMarkdown(editor: Editor): string {
  // ALWAYS use custom serializer to handle mentions properly
  // tiptap-markdown doesn't support mention nodes in non-html mode
  // console.log('[editorToMarkdown] Using custom JSON serializer for mentions support');
  const json = editor.getJSON();
  return jsonToMarkdown(json);
}

/**
 * Serializes Tiptap JSON to Markdown
 */
export function serializeToMarkdown(json: any): string {
  return jsonToMarkdown(json);
}

/**
 * Converts Markdown string to Tiptap-compatible content
 * Note: This returns the raw string which Tiptap will parse
 * For existing HTML content, it will also work as Tiptap can parse HTML
 */
export function markdownToJson(markdown: string): string {
  return markdown || '';
}

function jsonToMarkdown(node: any, depth = 0, listContext?: { type: 'bullet' | 'ordered'; index: number }): string {
  if (!node) return '';

  // Handle text nodes with marks
  if (node.type === 'text') {
    let text = node.text || '';
    
    // Apply marks in order: code, link, bold, italic
    if (node.marks) {
      const hasCode = node.marks.some((m: any) => m.type === 'code');
      const linkMark = node.marks.find((m: any) => m.type === 'link');
      const hasBold = node.marks.some((m: any) => m.type === 'bold');
      const hasItalic = node.marks.some((m: any) => m.type === 'italic');
      
      if (hasCode) {
        text = `\`${text}\``;
      } else {
        // Apply bold and italic first, then wrap in link
        if (hasBold) {
          text = `**${text}**`;
        }
        if (hasItalic) {
          text = `*${text}*`;
        }
        if (linkMark && linkMark.attrs?.href) {
          text = `[${text}](${linkMark.attrs.href})`;
        }
      }
    }
    
    return text;
  }

  // Handle mention nodes - serialize with type prefix for agent
  if (node.type === 'mention') {
    console.log('[markdownSerializer] Mention node:', {
      type: node.type,
      attrs: node.attrs,
      hasLabel: !!node.attrs?.label,
      hasId: !!node.attrs?.id,
      mentionType: node.attrs?.type,
    });
    const mentionText = node.attrs?.label || node.attrs?.id || 'unknown';
    const mentionType = node.attrs?.type;
    
    // Add type prefix for the agent based on mention type
    let typePrefix = '';
    switch(mentionType) {
      case 'page':
        typePrefix = '[Page]';
        break;
      case 'note':
        typePrefix = '[Note]';
        break;
      case 'credential':
        typePrefix = '[Credential]';
        break;
      case 'plan':
        typePrefix = '[Plan]';
        break;
      case 'graph':
        typePrefix = '[Graph]';
        break;
      default:
        typePrefix = '';
    }
    
    // Include type prefix in the markdown so agent sees it: @[Type]label
    // Wrap in backticks for easy extraction (handles spaces): `@[Type]label`
    // This is different from code blocks because it starts with @
    const fullMention = typePrefix ? `@${typePrefix}${mentionText}` : `@${mentionText}`;
    const wrappedMention = `\`${fullMention}\``;
    console.log('[markdownSerializer] Serialized mention to:', wrappedMention);
    return wrappedMention;
  }

  // Handle hard break
  if (node.type === 'hardBreak') {
    return '\n';
  }

  // Handle headings
  if (node.type === 'heading') {
    const level = node.attrs?.level || 1;
    const content = node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('') || '';
    return '#'.repeat(level) + ' ' + content + '\n\n';
  }

  // Handle paragraph
  if (node.type === 'paragraph') {
    const content = node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('') || '';
    return depth === 0 ? content + '\n' : content;
  }

  // Handle blockquote
  if (node.type === 'blockquote') {
    const content = node.content?.map((child: any) => jsonToMarkdown(child, depth + 1)).join('') || '';
    // Prefix each line with "> "
    return content.split('\n').filter((line: string) => line.trim()).map((line: string) => `> ${line}`).join('\n') + '\n\n';
  }

  // Handle horizontal rule
  if (node.type === 'horizontalRule') {
    return '---\n\n';
  }

  // Handle code block
  if (node.type === 'codeBlock') {
    const content = node.content?.map((child: any) => jsonToMarkdown(child, depth + 1)).join('') || '';
    const language = node.attrs?.language || '';
    return `\`\`\`${language}\n${content}\`\`\`\n\n`;
  }

  // Handle bullet list
  if (node.type === 'bulletList') {
    const items = node.content?.map((child: any, index: number) => 
      jsonToMarkdown(child, depth, { type: 'bullet', index })
    ).join('') || '';
    return items + (depth === 0 ? '\n' : '');
  }

  // Handle ordered list
  if (node.type === 'orderedList') {
    const items = node.content?.map((child: any, index: number) => 
      jsonToMarkdown(child, depth, { type: 'ordered', index: index + 1 })
    ).join('') || '';
    return items + (depth === 0 ? '\n' : '');
  }

  // Handle list item
  if (node.type === 'listItem') {
    const indent = '  '.repeat(depth);
    const bullet = listContext?.type === 'ordered' 
      ? `${listContext.index}. `
      : '- ';
    const content = node.content?.map((child: any) => {
      // For nested lists or paragraphs in list items
      if (child.type === 'paragraph') {
        return child.content?.map((c: any) => jsonToMarkdown(c, depth + 1)).join('') || '';
      }
      return jsonToMarkdown(child, depth + 1, listContext);
    }).join('') || '';
    return `${indent}${bullet}${content}\n`;
  }

  // Handle document root
  if (node.type === 'doc') {
    const content = node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('') || '';
    // Remove excessive trailing newlines
    return content.replace(/\n{3,}/g, '\n\n').trim();
  }

  // Handle other block nodes
  if (node.content) {
    return node.content.map((child: any) => jsonToMarkdown(child, depth, listContext)).join('');
  }

  return '';
}

/**
 * Preview function to see how markdown will be rendered
 */
export function previewMarkdown(editor: Editor): void {
  const markdown = editorToMarkdown(editor);
  console.log('Generated Markdown:');
  console.log('---');
  console.log(markdown);
  console.log('---');
}

