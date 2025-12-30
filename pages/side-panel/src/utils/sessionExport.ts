/**
 * Session Export Utilities
 * 
 * Functions for exporting chat sessions to various formats.
 * 
 * Note: Messages are now managed by the runtime server, so they must be
 * passed as a parameter from the React component state.
 */

import type { SessionMetadata } from '@extension/shared';

// ============================================================================
// TYPES
// ============================================================================

interface ExportMessage {
  role: 'user' | 'assistant';
  content: string | unknown[];
  image?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Triggers a file download in the browser
 */
const downloadFile = (filename: string, blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Escapes HTML special characters
 */
const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Creates a safe filename from session title
 */
const createSafeFilename = (title: string): string =>
  (title || 'session').replace(/[^a-z0-9\-_]+/gi, '-').toLowerCase();

/**
 * Extracts text content from a message
 */
const extractMessageContent = (message: ExportMessage): string => {
  const raw = message.content;
  let content = '';

  if (typeof raw === 'string') {
    content = raw;
  } else if (Array.isArray(raw)) {
    content = raw
      .map((item: unknown) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          if (obj.text) return String(obj.text);
          if (obj.type === 'text' && obj.text) return String(obj.text);
        }
        return '';
      })
      .join(' ');
  } else if (raw && typeof raw === 'object') {
    try {
      content = JSON.stringify(raw, null, 2);
    } catch {
      content = String(raw);
    }
  }

  // Remove hidden reasoning blocks
  try {
    content = content.replace(/<thinking[\s\S]*?<\/thinking>/gi, '').trim();
  } catch {
    // Ignore regex errors
  }

  return content;
};

/**
 * Parses and removes attachment manifest from content
 */
const parseAttachments = (
  content: string
): { cleanContent: string; attachments: Array<{ name: string; size: number; url: string }> } => {
  const attachments: Array<{ name: string; size: number; url: string }> = [];
  let cleanContent = content;

  try {
    const re = /<!--ATTACHMENTS:\s*([\s\S]*?)\s*-->/m;
    const match = content.match(re);
    if (match) {
      const list = JSON.parse(match[1]);
      if (Array.isArray(list)) {
        attachments.push(...list);
      }
      cleanContent = content.replace(re, '').trimEnd();
    }
  } catch {
    // Ignore parse errors
  }

  return { cleanContent, attachments };
};

// ============================================================================
// MARKDOWN EXPORT
// ============================================================================

/**
 * Exports a session as Markdown
 * 
 * @param sessionId - Session/thread ID
 * @param sessions - Array of session metadata
 * @param messages - Array of messages from React state (required, no longer fetched from IndexedDB)
 */
export const exportSessionAsMarkdown = async (
  sessionId: string,
  sessions: SessionMetadata[],
  messages: any[] = []
): Promise<void> => {
  if (!sessionId) {
    console.warn('[SessionExport] No session ID provided');
    return;
  }

  if (!messages || messages.length === 0) {
    console.warn('[SessionExport] No messages provided - messages must be passed from React state');
    return;
  }

  const session = sessions.find(s => s.id === sessionId);
  const title = session?.title || 'Session';
  const safeFilename = createSafeFilename(title);

  // Build markdown content
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`_Exported on ${new Date().toLocaleString()}_`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages as ExportMessage[]) {
    const roleLabel = msg.role === 'user' ? '👤 **User**' : '🤖 **Assistant**';
    lines.push(roleLabel);
    lines.push('');

    let content = extractMessageContent(msg);
    const { cleanContent, attachments } = parseAttachments(content);
    content = cleanContent;

    // Add attachments as links
    if (attachments.length > 0) {
      for (const att of attachments) {
        lines.push(`📎 [${att.name}](${att.url})`);
      }
      lines.push('');
    }

    // Add image if present
    if (msg.image) {
      lines.push(`![Image](${msg.image})`);
      lines.push('');
    }

    // Add message content
    lines.push(content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const markdown = lines.join('\n');
  downloadFile(`${safeFilename}.md`, new Blob([markdown], { type: 'text/markdown' }));
};

// ============================================================================
// HTML EXPORT
// ============================================================================

/**
 * Renders minimal markdown to HTML
 */
const renderMarkdownToHtml = (src: string): string => {
  if (!src) return '';

  const codeBlocks: string[] = [];
  let idx = 0;

  // Extract code blocks first
  const withPlaceholders = src.replace(/```([\s\S]*?)```/g, (_m, p1) => {
    const html = `<pre><code>${escapeHtml(String(p1))}</code></pre>`;
    codeBlocks.push(html);
    return `%%CODE_${idx++}%%`;
  });

  let escaped = escapeHtml(withPlaceholders);

  // Headings
  escaped = escaped
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Lists
  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  let inOl = false;

  const flushUl = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
  };
  const flushOl = () => {
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  for (const line of lines) {
    const ulMatch = /^\s*[-*]\s+(.+)$/.exec(line);
    const olMatch = /^\s*\d+\.\s+(.+)$/.exec(line);

    if (ulMatch) {
      if (!inUl) {
        flushOl();
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${ulMatch[1]}</li>`);
      continue;
    }
    if (olMatch) {
      if (!inOl) {
        flushUl();
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${olMatch[1]}</li>`);
      continue;
    }
    flushUl();
    flushOl();
    out.push(line);
  }
  flushUl();
  flushOl();

  let html = out.join('\n');

  // Inline formatting
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|\s)\*(?!\*)([^*]+?)\*(?=\s|$)/g, '$1<em>$2</em>');

  // Paragraphs
  html = html
    .split(/\n{2,}/)
    .map(block =>
      /^(<h\d|<ul>|<ol>|<pre>|<blockquote|<table|<img|<div|<code>)/.test(block.trim())
        ? block
        : `<p>${block.trim()}</p>`
    )
    .join('\n');

  // Restore code blocks
  html = html.replace(/%%CODE_(\d+)%%/g, (_m, i) => codeBlocks[Number(i)] || '');

  return html;
};

/**
 * Exports a session as HTML
 * 
 * @param sessionId - Session/thread ID
 * @param sessions - Array of session metadata
 * @param messages - Array of messages from React state (optional, will use DOM if not provided)
 */
export const exportSessionAsHTML = async (
  sessionId: string,
  sessions: SessionMetadata[],
  messages?: any[]
): Promise<void> => {
  if (!sessionId) {
    console.warn('[SessionExport] No session ID provided');
    return;
  }

  const session = sessions.find(s => s.id === sessionId);
  const title = session?.title || 'Session';
  const safeFilename = createSafeFilename(title);

  // Detect theme
  const isDark = document.body.classList.contains('dark');
  const bg = isDark ? '#0C1117' : '#ffffff';
  const textCol = isDark ? '#f9fafb' : '#0C1117';
  const borderCol = isDark ? '#374151' : '#e5e7eb';
  const userBg = isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)';
  const assistantBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';

  // Try to capture from DOM first
  let exportedInnerHTML = '';
  const chatContainer = document.querySelector('.copilot-chat-container') as HTMLElement | null;
  const messagesRoot =
    chatContainer &&
    ((chatContainer.querySelector('.copilotKitMessagesContainer') as HTMLElement | null) ||
      (chatContainer.querySelector('.copilotKitMessages') as HTMLElement | null) ||
      chatContainer);

  if (messagesRoot && messagesRoot.children && messagesRoot.children.length > 0) {
    try {
      const PROPS = [
        'color',
        'backgroundColor',
        'backgroundImage',
        'backgroundSize',
        'backgroundPosition',
        'backgroundRepeat',
        'opacity',
        'border',
        'borderTop',
        'borderRight',
        'borderBottom',
        'borderLeft',
        'borderRadius',
        'boxShadow',
        'font',
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'lineHeight',
        'letterSpacing',
        'textDecoration',
        'textTransform',
        'textAlign',
        'whiteSpace',
        'wordBreak',
        'display',
        'visibility',
        'position',
        'flex',
        'flexDirection',
        'alignItems',
        'justifyContent',
        'gap',
        'width',
        'height',
        'minWidth',
        'minHeight',
        'maxWidth',
        'maxHeight',
        'margin',
        'marginTop',
        'marginRight',
        'marginBottom',
        'marginLeft',
        'padding',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
      ];

      const cloneWithStyles = (src: Element): Element => {
        const dst = src.cloneNode(false) as Element;
        if (src.nodeType === 1) {
          const cs = getComputedStyle(src as HTMLElement);
          const styleText = PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';');
          if (styleText) (dst as HTMLElement).setAttribute('style', styleText);
        }
        src.childNodes.forEach(child => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            dst.appendChild(cloneWithStyles(child as Element));
          } else {
            dst.appendChild(child.cloneNode(true));
          }
        });
        return dst;
      };

      const cloned = cloneWithStyles(messagesRoot);
      exportedInnerHTML = (cloned as HTMLElement).innerHTML || messagesRoot.innerHTML || '';
    } catch (err) {
      console.warn('[SessionExport] Exact export failed, falling back to serialization:', err);
      exportedInnerHTML = messagesRoot.innerHTML || '';
    }
  }

  // Fallback: Build from provided messages (or empty array if not provided)
  if ((!exportedInnerHTML || exportedInnerHTML.replace(/\s+/g, '').length < 20) && messages && messages.length > 0) {

    const renderMessageContent = (message: ExportMessage): string => {
      let content = extractMessageContent(message);
      const { cleanContent, attachments } = parseAttachments(content);
      content = cleanContent;

      let attachmentsHtml = '';
      if (attachments.length > 0) {
        attachmentsHtml =
          `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:0 0 8px 0;">` +
          attachments
            .map(
              a =>
                `<span style="display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border:1px solid ${borderCol};border-radius:9999px;font-size:11px;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                  <a href="${a.url}" target="_blank" rel="noreferrer" style="text-decoration:none;">${escapeHtml(a.name)}</a>
                </span>`
            )
            .join('') +
          `</div>`;
      }

      let imageHtml = '';
      if (message.image) {
        imageHtml = `<div style="margin:0 0 8px 0;"><img src="${message.image}" alt="image" style="max-width:100%;border:1px solid ${borderCol};border-radius:6px;"/></div>`;
      }

      const textHtml = renderMarkdownToHtml(content);
      return attachmentsHtml + imageHtml + textHtml;
    };

    exportedInnerHTML = `
      <div class="copilotKitMessages">
        ${(messages as ExportMessage[])
          .map(m => {
            const roleClass = m.role === 'user' ? 'copilotKitUserMessage' : 'copilotKitAssistantMessage';
            const bubbleBg = m.role === 'user' ? userBg : assistantBg;
            const margin = m.role === 'user' ? '4px 0 4px auto' : '4px auto 4px 0';
            return `<div class="copilotKitMessage ${roleClass}" style="border:1px solid ${borderCol};border-radius:10px;padding:8px;background:${bubbleBg};margin:${margin};">${renderMessageContent(m)}</div>`;
          })
          .join('')}
      </div>
    `;
  }

  // Build full HTML document
  const exportStyles = `
    :root {
      color-scheme: light dark;
      --bg: ${bg};
      --text: ${textCol};
      --border: ${borderCol};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.45;
      padding: 16px;
    }
    a { color: #3b82f6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code, pre { font-family: Menlo, Monaco, Consolas, monospace; }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: rgba(0,0,0,.03);
      padding: 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
    }
    code {
      background: rgba(0,0,0,.05);
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    h1, h2, h3 { margin: 12px 0 8px 0; line-height: 1.3; }
    p { margin: 8px 0; }
    ul, ol { margin: 8px 0; padding-left: 24px; }
    li { margin: 4px 0; }
    .copilotKitMessages { display: flex; flex-direction: column; gap: 10px; }
    .copilotKitMessage { border-radius: 10px; padding: 8px 12px; font-size: 13px; }
    .copilotKitUserMessage { background: ${userBg}; border: 1px solid var(--border); margin-top: 1rem; }
    .copilotKitAssistantMessage { background: ${assistantBg}; border: 1px solid var(--border); width: 100%; }
    button, [role="button"] { display: none !important; }
  `;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${escapeHtml(title)}</title>
    <style>${exportStyles}</style>
  </head>
  <body>
    <h1 style="margin:0 0 12px 0;font-size:16px;">${escapeHtml(title)}</h1>
    <div class="copilotKitMessagesContainer">${exportedInnerHTML}</div>
  </body>
</html>`;

  downloadFile(`${safeFilename}.html`, new Blob([html], { type: 'text/html' }));
};