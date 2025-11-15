import { Editor } from '@tiptap/react';

/**
 * Converts Tiptap editor content to Markdown format
 * Supports: bold, italic, code blocks, code inline, mentions, paragraphs, hard breaks
 */
export function editorToMarkdown(editor: Editor): string {
  const json = editor.getJSON();
  return jsonToMarkdown(json);
}

function jsonToMarkdown(node: any, depth = 0): string {
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

  // Handle mention nodes
  if (node.type === 'mention') {
    return `@${node.attrs?.label || node.attrs?.id || 'unknown'}`;
  }

  // Handle hard break
  if (node.type === 'hardBreak') {
    return '\n';
  }

  // Handle paragraph
  if (node.type === 'paragraph') {
    const content = node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('') || '';
    return depth === 0 ? content + '\n' : content;
  }

  // Handle code block
  if (node.type === 'codeBlock') {
    const content = node.content?.map((child: any) => jsonToMarkdown(child, depth + 1)).join('') || '';
    const language = node.attrs?.language || '';
    return `\`\`\`${language}\n${content}\`\`\`\n`;
  }

  // Handle document root
  if (node.type === 'doc') {
    const content = node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('') || '';
    // Remove trailing newlines
    return content.trim();
  }

  // Handle other block nodes
  if (node.content) {
    return node.content.map((child: any) => jsonToMarkdown(child, depth)).join('');
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

