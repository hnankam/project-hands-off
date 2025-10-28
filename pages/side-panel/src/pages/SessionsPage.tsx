import React, { useEffect, useState, useCallback } from 'react';
import { ChatSessionContainer } from '../components/ChatSessionContainer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChatSkeleton } from '../components/LoadingStates';
import type { SessionType } from '@extension/storage';
import { sessionStorage } from '@extension/storage';
import { generateSessionName } from '@extension/shared';
import {
  cn,
  Button,
  SessionTabs,
  SessionList,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownSubmenu,
} from '@extension/ui';

interface SessionsPageProps {
  isLight: boolean;
  sessions: SessionType[];
  currentSessionId: string | null;
  publicApiKey: string;
  contextMenuMessage: string | null;
  onGoHome: () => void;
  onClose: () => void;
  onOpenAbout: () => void;
}

export const SessionsPage: React.FC<SessionsPageProps> = ({
  isLight,
  sessions,
  currentSessionId,
  publicApiKey,
  contextMenuMessage,
  onGoHome,
  onClose,
  onOpenAbout,
}) => {
  // Loading state for initial render
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [clearMessagesConfirmOpen, setClearMessagesConfirmOpen] = useState(false);
  const [resetSessionConfirmOpen, setResetSessionConfirmOpen] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  // Track live message counts per session (same as status bar)
  const [sessionMessageCounts, setSessionMessageCounts] = useState<Record<string, number>>({});
  const [clearSessionsConfirmOpen, setClearSessionsConfirmOpen] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  
  // Ref to store reset functions per session
  const resetFunctionsRef = React.useRef<Record<string, () => void>>({});

  // Initialize with a default session if none exist
  useEffect(() => {
    if (sessions.length === 0) {
      sessionStorage.addSession(generateSessionName());
    }
    // Set initial loading to false after sessions are loaded
    setIsInitialLoading(false);
  }, [sessions.length]);

  // Callback to receive live message counts from ChatSessionContainer
  const handleMessagesCountChange = useCallback((sessionId: string, count: number) => {
    setSessionMessageCounts(prev => ({
      ...prev,
      [sessionId]: count,
    }));
  }, []);
  
  // Callback to register reset function from ChatSessionContainer
  const handleRegisterResetFunction = useCallback((sessionId: string, resetFn: () => void) => {
    resetFunctionsRef.current[sessionId] = resetFn;
  }, []);

  const handleNewSession = () => {
    sessionStorage.addSession(generateSessionName());
  };

  const handleCloseSession = () => {
    if (currentSessionId) {
      sessionStorage.closeSession(currentSessionId);
    }
  };

  const handleCopySessionId = async (e: React.MouseEvent) => {
    // Prevent dropdown from closing immediately
    e.stopPropagation();
    
    if (currentSessionId) {
      try {
        await navigator.clipboard.writeText(currentSessionId);
        setCopiedSessionId(true);
        // Reset the copied state after 1.5 seconds, then allow dropdown to close
        setTimeout(() => {
          setCopiedSessionId(false);
        }, 1500);
      } catch (error) {
        console.error('[SessionsPage] Failed to copy session ID:', error);
      }
    }
  };

  const handleResetSession = () => {
    // Use the live count tracked from ChatSessionContainer (same as StatusBar)
    const count = currentSessionId ? sessionMessageCounts[currentSessionId] || 0 : 0;
    setMessageCount(count);

    // Small delay to ensure dropdown closes first
    setTimeout(() => {
      setResetSessionConfirmOpen(true);
    }, 60);
  };
  
  const handleConfirmResetSession = () => {
    if (!currentSessionId) {
      console.error('[SessionsPage] No current session to reset');
      return;
    }
    
    // Call the reset function for this session
    const resetFn = resetFunctionsRef.current[currentSessionId];
    if (resetFn) {
      console.log('[SessionsPage] Resetting session:', currentSessionId);
      resetFn();
      setResetSessionConfirmOpen(false);
    } else {
      console.error('[SessionsPage] No reset function found for session:', currentSessionId);
    }
  };

  const handleClearAllMessages = () => {
    // Use the live count tracked from ChatSessionContainer (same as StatusBar)
    const count = currentSessionId ? sessionMessageCounts[currentSessionId] || 0 : 0;
    setMessageCount(count);

    // Small delay to ensure dropdown closes first
    setTimeout(() => {
      setClearMessagesConfirmOpen(true);
    }, 60);
  };

  const handleConfirmClearMessages = async () => {
    const CHAT_STORAGE_KEY = 'copilot-chat-messages';
    try {
      if (!currentSessionId) {
        console.error('[SessionsPage] No current session to clear messages from');
        return;
      }

      // Clear messages from Chrome local storage for the current session only
      const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
      const storedData = result[CHAT_STORAGE_KEY] || {};
      delete storedData[currentSessionId];
      await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: storedData });

      // Clear allMessages from the current session in sessionStorage
      await sessionStorage.updateAllMessages(currentSessionId, []);

      // Reload the page to reflect changes
      window.location.reload();
    } catch (error) {
      console.error('[SessionsPage] Failed to clear messages:', error);
    }
  };

  const exportFile = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSessionAsHTML = async () => {
    try {
      console.log('[SessionsPage] Starting HTML export...');
      if (!currentSessionId) {
        console.warn('[SessionsPage] No current session ID');
        return;
      }
      
    const current = sessions.find(s => s.id === currentSessionId);
    const safeTitle = (current?.title || 'session').replace(/[^a-z0-9\-_]+/gi, '-').toLowerCase();
      console.log('[SessionsPage] Exporting session:', safeTitle);

      // Prefer the rendered chat messages area; fall back to the whole chat container
      const chatContainer = document.querySelector('.copilot-chat-container') as HTMLElement | null;
      console.log('[SessionsPage] Found chat container:', !!chatContainer);
      
      const messagesRoot = (chatContainer && (
        chatContainer.querySelector('.copilotKitMessagesContainer') as HTMLElement | null ||
        chatContainer.querySelector('.copilotKitMessages') as HTMLElement | null ||
        chatContainer
      )) as HTMLElement | null;
      console.log('[SessionsPage] Found messages root:', !!messagesRoot);

      // Capture computed theme variables for background/text colors
      const styles = chatContainer ? getComputedStyle(chatContainer) : getComputedStyle(document.body);
      const isDark = document.body.classList.contains('dark');
      const bg = styles.getPropertyValue('--copilot-kit-background-color') || (isDark ? '#0C1117' : '#ffffff');
      const textCol = styles.getPropertyValue('--copilot-kit-text-color') || (isDark ? '#f9fafb' : '#0C1117');
      const borderCol = styles.getPropertyValue('--copilot-kit-border-color') || (isDark ? '#374151' : '#e5e7eb');
      const userBg = isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)';
      const assistantBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';

      let exportedInnerHTML = '';
      if (messagesRoot && messagesRoot.children && messagesRoot.children.length > 0) {
        // Attempt exact export by cloning DOM and inlining computed styles
        try {
          const PROPS = [
            'color','backgroundColor','backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat','opacity',
            'border','borderTop','borderRight','borderBottom','borderLeft','borderRadius','boxShadow','outline','outlineOffset',
            'font','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textDecoration','textTransform','textAlign','whiteSpace','wordBreak','overflowWrap',
            'display','visibility','position','top','right','bottom','left','zIndex','flex','flexDirection','flexWrap','alignItems','justifyContent','gap','rowGap','columnGap','order',
            'width','height','minWidth','minHeight','maxWidth','maxHeight',
            'margin','marginTop','marginRight','marginBottom','marginLeft',
            'padding','paddingTop','paddingRight','paddingBottom','paddingLeft',
            'overflow','overflowX','overflowY','cursor'
          ];
          const cloneWithStyles = (src: Element): Element => {
            const dst = src.cloneNode(false) as Element;
            if (src.nodeType === 1) {
              const cs = getComputedStyle(src as HTMLElement);
              const styleText = PROPS.map(p => `${p}:${cs.getPropertyValue(p as any)}`).join(';');
              if (styleText) (dst as HTMLElement).setAttribute('style', styleText);
              // Copy data attributes that may affect rendering
              const srcEl = src as HTMLElement;
              if (srcEl.className) (dst as HTMLElement).setAttribute('data-export-class', String(srcEl.className));
            }
            // Recurse
            src.childNodes.forEach((child) => {
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
          console.log('[SessionsPage] Exact DOM export length:', exportedInnerHTML.length);
        } catch (err) {
          console.warn('[SessionsPage] Exact export failed, falling back to innerHTML:', err);
          exportedInnerHTML = messagesRoot.innerHTML || '';
        }
      } else {
        exportedInnerHTML = messagesRoot ? messagesRoot.innerHTML : '';
      }
      console.log('[SessionsPage] Exported DOM HTML length:', exportedInnerHTML.length);

      // Fallback: Build static HTML from stored messages when DOM content not available
      if (!exportedInnerHTML || exportedInnerHTML.replace(/\s+/g, '').length < 20) {
        console.log('[SessionsPage] Falling back to messages serialization...');
        let all = (sessionStorage.getAllMessages(currentSessionId) as any[]) || [];
        if (!all || all.length === 0) {
          try {
            const CHAT_STORAGE_KEY = 'copilot-chat-messages';
            const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
            const stored = result[CHAT_STORAGE_KEY] || {};
            if (stored && stored[currentSessionId] && Array.isArray(stored[currentSessionId])) {
              all = stored[currentSessionId];
              console.log('[SessionsPage] Loaded messages from chrome.storage:', all.length);
            }
          } catch (err) {
            console.warn('[SessionsPage] chrome.storage fallback failed:', err);
          }
        }
        const escapeHtml = (s: string) =>
          s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
        const renderMessageContent = (message: any) => {
          let content = '';
          const raw = (message && message.content) as any;
          if (typeof raw === 'string') content = raw;
          else if (Array.isArray(raw)) {
            content = raw
              .map((item: any) => {
                if (typeof item === 'string') return item;
                if (item?.text) return item.text;
                if (item?.type === 'text' && item?.text) return item.text;
                return '';
              })
              .join(' ');
          } else if (raw && typeof raw === 'object') {
            try { content = JSON.stringify(raw, null, 2); } catch { content = String(raw); }
          }
          // Remove hidden reasoning blocks
          try { content = content.replace(/<thinking[\s\S]*?<\/thinking>/gi, '').trim(); } catch {}
          // Parse attachment manifest, render chips, and remove from content
          let attachmentsHtml = '';
          try {
            const re = /<!--ATTACHMENTS:\s*([\s\S]*?)\s*-->/m;
            const m = content.match(re);
            if (m) {
              const list = JSON.parse(m[1]) as Array<{ name: string; size: number; url: string }>;
              content = content.replace(re, '').trimEnd();
              if (Array.isArray(list) && list.length > 0) {
                attachmentsHtml = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:0 0 8px 0;">` +
                  list
                    .map(a =>
                      `<span style="display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border:1px solid ${borderCol.trim()};border-radius:9999px;font-size:11px;">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                        <a href="${a.url}" target="_blank" rel="noreferrer" style="text-decoration:none;">${escapeHtml(a.name)}</a>
                      </span>`
                    )
                    .join('') +
                  `</div>`;
              }
            }
          } catch {}

          // Assistant image support (if present)
          let imageHtml = '';
          if (message && 'image' in message && (message as any).image) {
            const img = (message as any).image;
            imageHtml = `<div style="margin:0 0 8px 0;"><img src="${img}" alt="image" style="max-width:100%;border:1px solid ${borderCol.trim()};border-radius:6px;"/></div>`;
          }

          // Minimal markdown rendering
          const renderMarkdown = (src: string): string => {
            if (!src) return '';
            const codeBlocks: string[] = [];
            let idx = 0;
            const withPlaceholders = src.replace(/```([\s\S]*?)```/g, (_m, p1) => {
              const html = `<pre><code>${escapeHtml(String(p1))}</code></pre>`;
              codeBlocks.push(html);
              return `%%CODE_${idx++}%%`;
            });
            let escaped = escapeHtml(withPlaceholders);
            escaped = escaped.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
                             .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
                             .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
            const lines = escaped.split(/\r?\n/);
            const out: string[] = [];
            let inUl = false, inOl = false;
            const flushUl = () => { if (inUl) { out.push('</ul>'); inUl = false; } };
            const flushOl = () => { if (inOl) { out.push('</ol>'); inOl = false; } };
            for (const line of lines) {
              const ulm = /^\s*[-*]\s+(.+)$/.exec(line);
              const olm = /^\s*\d+\.\s+(.+)$/.exec(line);
              if (ulm) { if (!inUl) { flushOl(); out.push('<ul>'); inUl = true; } out.push(`<li>${ulm[1]}</li>`); continue; }
              if (olm) { if (!inOl) { flushUl(); out.push('<ol>'); inOl = true; } out.push(`<li>${olm[1]}</li>`); continue; }
              flushUl(); flushOl(); out.push(line);
            }
            flushUl(); flushOl();
            let html = out.join('\n');
            html = html.replace(/`([^`]+?)`/g, (_m, p1) => `<code>${p1}</code>`);
            html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/(^|\s)\*(?!\*)([^*]+?)\*(?=\s|$)/g, (_m, p1, p2) => `${p1}<em>${p2}</em>`);
            html = html.split(/\n{2,}/).map(b => /^(<h\d|<ul>|<ol>|<pre>|<blockquote|<table|<img|<div|<code>)/.test(b.trim()) ? b : `<p>${b.trim()}</p>`).join('\n');
            html = html.replace(/%%CODE_(\d+)%%/g, (_m, i) => codeBlocks[Number(i)] || '');
            return html;
          };
          const textHtml = renderMarkdown(content);
          return attachmentsHtml + imageHtml + textHtml;
        };
        exportedInnerHTML = `
          <div class="copilotKitMessages">
            ${all
              .map((m: any) => {
                const roleClass = m.role === 'user' ? 'copilotKitUserMessage' : 'copilotKitAssistantMessage';
                const bubbleBg = m.role === 'user' ? userBg : assistantBg;
                const margin = m.role === 'user' ? '4px 0 4px auto' : '4px auto 4px 0';
                return `<div class="copilotKitMessage ${roleClass}" style="border:1px solid ${borderCol.trim()};border-radius:10px;padding:8px;background:${bubbleBg};margin:${margin};">${renderMessageContent(m)}</div>`;
              })
              .join('')}
          </div>
        `;
      }

      // Extract and replicate app styles for high-fidelity export
      const extractAppStyles = () => {
        try {
          const styleSheets = Array.from(document.styleSheets);
          let extractedCSS = '';
          for (const sheet of styleSheets) {
            try {
              const rules = Array.from(sheet.cssRules || []);
              for (const rule of rules) {
                const text = rule.cssText;
                // Include copilot, message, code, and base styles
                if (text.includes('copilot') || text.includes('Message') || text.includes('code') || text.includes(':root') || text.includes('body')) {
                  extractedCSS += text + '\n';
                }
              }
            } catch (e) {
              // Skip cross-origin stylesheets
            }
          }
          return extractedCSS;
        } catch {
          return '';
        }
      };
      const appStyles = extractAppStyles();

      // Minimal, self-contained styles to make exported markup readable
      const exportStyles = `
        /* CSS Variables */
        :root {
          color-scheme: light dark;
          --copilot-kit-primary-color: ${styles.getPropertyValue('--copilot-kit-primary-color') || '#e5e7eb'};
          --copilot-kit-background-color: ${bg.trim()};
          --copilot-kit-secondary-color: ${styles.getPropertyValue('--copilot-kit-secondary-color') || (isDark ? '#151C24' : '#f9fafb')};
          --copilot-kit-text-color: ${textCol.trim()};
          --copilot-kit-border-color: ${borderCol.trim()};
          --copilot-kit-text-muted-color: ${styles.getPropertyValue('--copilot-kit-text-muted-color') || (isDark ? '#9ca3af' : '#6b7280')};
        }
        
        /* Base styles */
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body {
          background: var(--copilot-kit-background-color);
          color: var(--copilot-kit-text-color);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif;
          font-size: 14px;
          line-height: 1.45;
          padding: 16px;
        }
        
        /* Typography */
        a { color: #3b82f6; text-decoration: none; }
        a:hover { text-decoration: underline; }
        code, pre { font-family: Menlo, Monaco, Consolas, 'Courier New', monospace; }
        pre {
          white-space: pre-wrap;
          word-break: break-word;
          background: rgba(0,0,0,.03);
          padding: 12px;
          border-radius: 6px;
          border: 1px solid var(--copilot-kit-border-color);
        }
        code {
          background: rgba(0,0,0,.05);
          padding: 2px 4px;
          border-radius: 3px;
          font-size: 0.9em;
        }
        h1, h2, h3 { margin: 12px 0 8px 0; line-height: 1.3; }
        h1 { font-size: 1.5em; }
        h2 { font-size: 1.3em; }
        h3 { font-size: 1.1em; }
        p { margin: 8px 0; }
        ul, ol { margin: 8px 0; padding-left: 24px; }
        li { margin: 4px 0; }
        strong { font-weight: 600; }
        em { font-style: italic; }
        
        /* Message layout - match app design */
        .copilotKitMessages, .copilotKitMessagesContainer {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 0;
        }
        .copilotKitMessage {
          width: auto;
          max-width: 100%;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 13px;
          line-height: 1.4;
        }
        .copilotKitUserMessage {
          background: ${userBg};
          border: 1px solid var(--copilot-kit-border-color);
          margin-left: 0;
          margin-right: 0;
          margin-bottom: 0;
          margin-top: 1rem;
        }
        .copilotKitAssistantMessage {
          background: ${assistantBg};
          border: 1px solid var(--copilot-kit-border-color);
          max-width: 100%;
          width: 100%;
          padding-right: 0;
        }
        
        /* Hide interactive controls */
        .copilotKitMessageControls,
        [class*='MessageControls'],
        button,
        [role="button"] {
          display: none !important;
        }
        
        /* Code blocks */
        .copilotKitCodeBlock {
          border-radius: 6px;
          border: 1px solid var(--copilot-kit-border-color);
          background: var(--copilot-kit-secondary-color);
          overflow: hidden;
          margin: 8px 0;
        }
        .copilotKitCodeBlock pre {
          margin: 0;
          background: transparent;
          border: none;
        }
        
        /* App-extracted styles */
        ${appStyles}
      `;

      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob: filesystem: * 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: blob: https: http: *; media-src 'self' data: blob: https: http: *">
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${current?.title || 'Session'}</title>
    <style>${exportStyles}</style>
  </head>
  <body>
    <h1 style="margin:0 0 12px 0;font-size:16px;">${current?.title || 'Session'}</h1>
    <div class="copilotKitMessagesContainer">${exportedInnerHTML}</div>
  </body>
</html>`;

      console.log('[SessionsPage] Creating blob and triggering download...');
    exportFile(`${safeTitle}.html`, new Blob([html], { type: 'text/html' }));
      console.log('[SessionsPage] Export complete');
    } catch (e) {
      console.error('[SessionsPage] Failed to export session as HTML:', e);
      alert('Failed to export session as HTML. Check console for details.');
    }
  };

  const handleExportSessionAsPDF = () => {
    if (!currentSessionId) return;
    const current = sessions.find(s => s.id === currentSessionId);
    const messages = sessionStorage.getAllMessages(currentSessionId);
    const doc = window.open('', '_blank');
    if (!doc) return;
    doc.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/><title>${current?.title || 'Session PDF'}</title><style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;padding:24px}h1{margin-top:0}pre{white-space:pre-wrap;word-break:break-word}</style></head><body><h1>${current?.title || 'Session'}</h1><pre>${JSON.stringify(messages, null, 2)}</pre></body></html>`,
    );
    doc.document.close();
    // Give the new window a moment to render, then open print dialog
    setTimeout(() => {
      try {
        doc.focus();
        doc.print();
      } catch {}
    }, 200);
  };

  const handleExportSessionAsImage = async () => {
    try {
      console.log('[SessionsPage] Starting image export...');
      if (!currentSessionId) {
        console.warn('[SessionsPage] No current session ID');
        return;
      }

      const current = sessions.find(s => s.id === currentSessionId);
      const safeTitle = (current?.title || 'session').replace(/[^a-z0-9\-_]+/gi, '-').toLowerCase();
      
      // Find the chat container (includes theme classes/vars)
      const chatContainer = document.querySelector('.copilot-chat-container') as HTMLElement | null;
      if (!chatContainer) {
        console.warn('[SessionsPage] No chat container found');
        alert('No chat content found to export as image');
        return;
      }

      // Note: captureVisibleTab does not include extension side-panels; always use html2canvas
      let exportCompleted = false;

      // Strategy 2: Fallback to html2canvas on an off-screen clone
      const fallbackHtml2Canvas = async () => {
        const cs = getComputedStyle(chatContainer);
        const bgColor = cs.backgroundColor || getComputedStyle(document.body).backgroundColor || '#ffffff';
        const clone = chatContainer.cloneNode(true) as HTMLElement;
        clone.style.position = 'fixed';
        clone.style.left = '-100000px';
        clone.style.top = '0';
        clone.style.width = `${chatContainer.scrollWidth}px`;
        clone.style.height = `${chatContainer.scrollHeight}px`;
        clone.style.overflow = 'visible';
        clone.style.backgroundColor = bgColor;
        try { clone.querySelectorAll('.sticky').forEach(el => ((el as HTMLElement).style.display = 'none')); } catch {}
        document.body.appendChild(clone);

        // Allow layout to settle
        await new Promise(r => requestAnimationFrame(() => r(null)));

        const html2canvas = await import('html2canvas').then(m => m.default);
        const canvas = await html2canvas(clone, {
          backgroundColor: bgColor,
          scale: 2,
          logging: false,
          useCORS: true,
          allowTaint: true,
          foreignObjectRendering: true,
        });
        try { document.body.removeChild(clone); } catch {}
        canvas.toBlob((blob) => {
          if (blob) {
            if (exportCompleted) return;
            exportCompleted = true;
      exportFile(`${safeTitle}.png`, blob);
            console.log('[SessionsPage] Image export complete (html2canvas)');
          } else {
            alert('Failed to create image. Please try again.');
          }
        }, 'image/png');
      };

      // If we reached here due to an early error, run fallback
      await fallbackHtml2Canvas();
    } catch (e) {
      console.error('[SessionsPage] Failed to export session as image:', e);
      alert('Failed to export session as image. Check console for details.');
    }
  };

  const openClearSessionsConfirm = () => {
    setTimeout(() => setClearSessionsConfirmOpen(true), 60);
  };

  const handleConfirmClearSessions = async () => {
    try {
      const CHAT_STORAGE_KEY = 'copilot-chat-messages';

      // Snapshot session IDs to avoid mutation during deletion
      const sessionIds = sessions.map(s => s.id);

      // Purge messages for all sessions from Chrome storage
      const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
      const storedData = result[CHAT_STORAGE_KEY] || {};
      for (const id of sessionIds) {
        if (storedData[id]) {
          delete storedData[id];
        }
      }
      await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: storedData });

      // Delete all sessions sequentially to avoid race conditions
      for (const id of sessionIds) {
        await sessionStorage.deleteSession(id);
      }

      setClearSessionsConfirmOpen(false);
      // Reload the page to reflect changes fully
      window.location.reload();
    } catch (err) {
      console.error('[SessionsPage] Failed to clear all sessions:', err);
    }
  };

  // Close confirmation modal on escape key
  useEffect(() => {
    if (!clearMessagesConfirmOpen && !clearSessionsConfirmOpen && !resetSessionConfirmOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (clearMessagesConfirmOpen) setClearMessagesConfirmOpen(false);
        if (clearSessionsConfirmOpen) setClearSessionsConfirmOpen(false);
        if (resetSessionConfirmOpen) setResetSessionConfirmOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [clearMessagesConfirmOpen, clearSessionsConfirmOpen, resetSessionConfirmOpen]);

  return (
    <>
      {/* Sessions Page Header */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between border-b px-2 py-[0.4em]',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="mr-2 flex min-w-0 flex-1 items-center overflow-hidden">
          <SessionTabs isLight={isLight} className="flex-1" />
        </div>

        <div className="flex flex-shrink-0 items-center space-x-1">
          {/* Add New Session Button */}
          <button
            onClick={handleNewSession}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              isLight
                ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
            )}
            title="Add new session">
            <svg
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Home Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onGoHome}
            title="Home"
            className={cn(
              'h-6 w-6 p-0',
              isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
            )}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11.47 3.84a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 0 1-.53 1.28H19.5V21a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3.75h-6V21a.75.75 0 0 1-.75.75h-3A.75.75 0 0 1 5.25 21v-7.19H3.31a.75.75 0 0 1-.53-1.28l8.69-8.69Z" />
            </svg>
          </Button>

          {/* More Options Dropdown */}
          <DropdownMenu
            align="right"
            isLight={isLight}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-6 w-6 p-0',
                  isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
                )}>
                <svg
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </Button>
            }>
            <DropdownMenuItem 
              onClick={handleResetSession}
              disabled={!currentSessionId || (sessionMessageCounts[currentSessionId] || 0) === 0}
              isLight={isLight}
            >
              Reset Session
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCloseSession} shortcut="⌘ C" isLight={isLight}>
              Close Session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleClearAllMessages} isLight={isLight}>Clear All Session Messages</DropdownMenuItem>
            <DropdownMenuItem onClick={openClearSessionsConfirm} isLight={isLight}>Clear All Sessions</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownSubmenu label="Export Session" isLight={isLight}>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleExportSessionAsHTML(); }}
                isLight={isLight}
              >
                Export as HTML
              </DropdownMenuItem>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleExportSessionAsPDF(); }}
                isLight={isLight}
                disabled={true}
              >
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleExportSessionAsImage(); }}
                isLight={isLight}
                disabled={true}
              >
                Export as Image
              </DropdownMenuItem>
            </DropdownSubmenu>
            <DropdownMenuItem 
              onClick={handleCopySessionId}
              isLight={isLight}
              className={cn(
                'transition-all duration-200',
                copiedSessionId && (isLight ? 'bg-green-50' : 'bg-green-900/20')
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <span className={cn(
                  'flex-1 transition-colors duration-200',
                  copiedSessionId && (isLight ? 'text-green-700' : 'text-green-400')
                )}>
                  {copiedSessionId ? 'Session ID Copied!' : 'Copy Session ID'}
                </span>
                {copiedSessionId ? (
                  <svg
                    className={cn(
                      'h-3 w-3 flex-shrink-0 transition-all duration-200',
                      isLight ? 'text-green-600' : 'text-green-400'
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ animation: 'scale-in 0.2s ease-out' }}>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg
                    className={cn('h-3 w-3 flex-shrink-0 opacity-60', isLight ? 'text-gray-500' : 'text-gray-400')}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem isLight={isLight}>Give Feedback</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem isLight={isLight}>Session Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenAbout} isLight={isLight}>About Project Hands-Off</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClose} isLight={isLight}>Close Panel</DropdownMenuItem>
          </DropdownMenu>
        </div>
      </div>

      {/* Session Content Area */}
      <div className="relative flex-1 overflow-hidden">
        {isInitialLoading ? (
          <ChatSkeleton />
        ) : sessions.length > 0 ? (
          sessions.map(session => (
            <div
              key={session.id}
              className="absolute inset-0 flex flex-col overflow-hidden"
              style={{
                visibility: session.id === currentSessionId ? 'visible' : 'hidden',
                zIndex: session.id === currentSessionId ? 1 : 0,
              }}>
              <ErrorBoundary
                level="component"
                fallback={
                  <div className="flex flex-1 items-center justify-center p-4">
                    <div className="text-center">
                      <p className="mb-2 text-red-600 dark:text-red-400">Session Error</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        This session encountered an error. Try switching to another session.
                      </p>
                    </div>
                  </div>
                }>
                <ChatSessionContainer
                  sessionId={session.id}
                  isLight={isLight}
                  publicApiKey={publicApiKey}
                  isActive={session.id === currentSessionId}
                  contextMenuMessage={session.id === currentSessionId ? contextMenuMessage : null}
                  onMessagesCountChange={handleMessagesCountChange}
                  onRegisterResetFunction={handleRegisterResetFunction}
                />
              </ErrorBoundary>
            </div>
          ))
        ) : (
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p>No active session</p>
              <p className="text-sm">Create a new session to start chatting</p>
            </div>
          </div>
        )}
      </div>

      {/* Session List - Fixed at bottom */}
      <div
        className={cn(
          'flex-shrink-0 border-t p-2',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <SessionList isLight={isLight} />
      </div>

      {/* Clear Messages Confirmation Modal */}
      {clearMessagesConfirmOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setClearMessagesConfirmOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Clear All Session Messages
                </h2>
                <button
                  onClick={() => setClearMessagesConfirmOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3 px-3 py-4">
                {/* Warning Icon */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                      isLight ? 'bg-red-100' : 'bg-red-900/30',
                    )}>
                    <svg
                      className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')}
                      fill="currentColor"
                      viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Permanently delete session messages?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      All <strong>{messageCount}</strong> {messageCount === 1 ? 'message' : 'messages'} from "
                      {sessions.find(s => s.id === currentSessionId)?.title || 'this session'}" will be permanently
                      deleted from storage and cannot be recovered.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setClearMessagesConfirmOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
                <button
                  onClick={handleConfirmClearMessages}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-600 text-white hover:bg-red-700',
                  )}>
                  Delete All
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Reset Session Confirmation Modal */}
      {resetSessionConfirmOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setResetSessionConfirmOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Reset Session
                </h2>
                <button
                  onClick={() => setResetSessionConfirmOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3 px-3 py-4">
                {/* Warning Icon */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                      isLight ? 'bg-orange-100' : 'bg-orange-900/30',
                    )}>
                    <svg
                      className={cn('h-3.5 w-3.5', isLight ? 'text-orange-600' : 'text-orange-400')}
                      fill="currentColor"
                      viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Clear all messages in this session?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      All <strong>{messageCount}</strong> {messageCount === 1 ? 'message' : 'messages'} in "
                      {sessions.find(s => s.id === currentSessionId)?.title || 'this session'}" will be cleared from
                      the chat. This action cannot be undone, but messages may still exist in storage.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setResetSessionConfirmOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
                <button
                  onClick={handleConfirmResetSession}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-orange-600 text-white hover:bg-orange-700',
                  )}>
                  Reset Session
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Clear Sessions Confirmation Modal */}
      {clearSessionsConfirmOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setClearSessionsConfirmOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Clear All Sessions
                </h2>
                <button
                  onClick={() => setClearSessionsConfirmOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3 px-3 py-4">
                {/* Warning Icon */}
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                      isLight ? 'bg-red-100' : 'bg-red-900/30',
                    )}>
                    <svg
                      className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')}
                      fill="currentColor"
                      viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>

                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Permanently delete all sessions?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      This will remove all sessions and their messages from storage and cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setClearSessionsConfirmOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}>
                  Cancel
                </button>
                <button
                  onClick={handleConfirmClearSessions}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-600 text-white hover:bg-red-700',
                  )}>
                  Delete All
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
