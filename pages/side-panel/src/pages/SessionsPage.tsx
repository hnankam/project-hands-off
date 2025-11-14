import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ChatSessionContainer } from '../components/ChatSessionContainer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChatSkeleton, MessagesOnlySkeleton, StatusBarSkeleton, SelectorsBarSkeleton } from '../components/LoadingStates';
import type { SessionMetadata } from '@extension/shared';
import { sessionStorageDBWrapper, generateSessionName } from '@extension/shared';
import { useAuth } from '../context/AuthContext';
import UserMenu from '../components/UserMenu';
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
import { SessionRuntimeProvider } from '../context/SessionRuntimeContext';

interface SessionsPageProps {
  isLight: boolean;
  sessions: SessionMetadata[];
  currentSessionId: string | null;
  sessionsLoading?: boolean;
  publicApiKey: string;
  contextMenuMessage: string | null;
  onGoHome: () => void;
  onClose: () => void;
  onOpenAbout: () => void;
  onGoAdmin?: (tab?: 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents') => void;
}

export const SessionsPage: React.FC<SessionsPageProps> = ({
  isLight,
  sessions: sessionsProp,
  currentSessionId,
  sessionsLoading = false,
  publicApiKey,
  contextMenuMessage,
  onGoHome,
  onClose,
  onOpenAbout,
  onGoAdmin,
}) => {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  // Auth
  const { user } = useAuth();
  
  // Ensure sessions is always an array (defensive programming)
  const sessions = useMemo(() => {
    const validSessions = Array.isArray(sessionsProp) ? sessionsProp : [];
    console.log('[SessionsPage] Sessions validation:', { 
      isArray: Array.isArray(sessionsProp), 
      count: validSessions.length 
    });
    return validSessions;
  }, [sessionsProp]);
  
  // Loading state for initial render
  const [isEnsuringInitialSession, setIsEnsuringInitialSession] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const sessionReadyTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [clearMessagesConfirmOpen, setClearMessagesConfirmOpen] = useState(false);
  const [resetSessionConfirmOpen, setResetSessionConfirmOpen] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  // Track live message counts per session (same as status bar)
  const [sessionMessageCounts, setSessionMessageCounts] = useState<Record<string, number>>({});
  const [clearSessionsConfirmOpen, setClearSessionsConfirmOpen] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  // Track if messages are currently loading for the active session
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  // Track when skeleton started showing to enforce minimum display time
  const skeletonStartTimeRef = React.useRef<number | null>(null);
  const MIN_SKELETON_DISPLAY_TIME = 100; // milliseconds
  const SKELETON_FALLBACK_TIMEOUT = 900; // milliseconds
  
  // Ref to store reset functions per session
  const resetFunctionsRef = React.useRef<Record<string, () => void>>({});
  const hasAttemptedInitialSessionRef = React.useRef(false);
  const lastStorageUserIdRef = React.useRef<string | null>(null);
  const hasSeenSessionsForCurrentUserRef = React.useRef<boolean>(false);
  const renderCountRef = React.useRef(0);

  // Track render count
  renderCountRef.current += 1;
  console.log(`[SessionsPage] 🔄 RENDER #${renderCountRef.current}`, {
    sessionsCount: sessions.length,
    currentSessionId: currentSessionId?.slice(0, 8),
    sessionsLoading,
    userId: user?.id?.slice(0, 8),
    storageUserId: sessionStorageDBWrapper.getCurrentUserId()?.slice(0, 8),
  });

  // Track when the storage userId changes; require at least one sessions fetch after change
  useEffect(() => {
    const storageUserId = sessionStorageDBWrapper.getCurrentUserId();
    console.log('[SessionsPage] 👤 User ID change check:', {
      hasUser: !!user?.id,
      storageUserId: storageUserId?.slice(0, 8),
      lastUserId: lastStorageUserIdRef.current?.slice(0, 8),
    });
    
    if (!user?.id || !storageUserId) {
      return;
    }
    if (lastStorageUserIdRef.current !== storageUserId) {
      console.log('[SessionsPage] 🔄 USER ID CHANGED - resetting session state', {
        from: lastStorageUserIdRef.current?.slice(0, 8),
        to: storageUserId?.slice(0, 8),
      });
      lastStorageUserIdRef.current = storageUserId;
      hasSeenSessionsForCurrentUserRef.current = false;
      // Also reset the initial-session attempt gate when user changes
      hasAttemptedInitialSessionRef.current = false;
    }
  }, [user?.id]);

  // Mark that we've observed at least one sessions snapshot for the current user
  useEffect(() => {
    const storageUserId = sessionStorageDBWrapper.getCurrentUserId();
    console.log('[SessionsPage] 📸 Sessions snapshot effect:', {
      hasUser: !!user?.id,
      storageUserId: storageUserId?.slice(0, 8),
      lastUserId: lastStorageUserIdRef.current?.slice(0, 8),
      sessionsCount: sessions.length,
      hasSeenSessions: hasSeenSessionsForCurrentUserRef.current,
    });
    
    if (!user?.id || !storageUserId) {
      return;
    }
    if (lastStorageUserIdRef.current === storageUserId) {
      if (!hasSeenSessionsForCurrentUserRef.current) {
        console.log('[SessionsPage] ✅ FIRST SESSIONS SNAPSHOT for current user observed');
      }
      hasSeenSessionsForCurrentUserRef.current = true;
    }
  }, [sessions, user?.id]);

  // Initialize with a default session if none exist
  useEffect(() => {
    const storageUserId = sessionStorageDBWrapper.getCurrentUserId();

    console.log('[SessionsPage] 🔍 Ensure initial session effect:', {
      sessionsLoading,
      hasUser: !!user?.id,
      storageUserId: storageUserId?.slice(0, 8),
      sessionsCount: sessions.length,
      hasSeenSessions: hasSeenSessionsForCurrentUserRef.current,
      hasAttempted: hasAttemptedInitialSessionRef.current,
      isEnsuring: isEnsuringInitialSession,
    });

    // Don't check for sessions while still loading or before the user context is ready
    if (sessionsLoading || !user?.id || !storageUserId) {
      console.log('[SessionsPage] ⏸️  Sessions or user not ready, waiting...');
      return;
    }

    // Require that we've seen at least one sessions snapshot for this user
    if (!hasSeenSessionsForCurrentUserRef.current) {
      console.log('[SessionsPage] ⏸️  Waiting for first sessions snapshot after user ID set');
      return;
    }

    if (sessions.length > 0) {
      console.log('[SessionsPage] ✅ Sessions exist, no need to create initial session');
      hasAttemptedInitialSessionRef.current = true;
      return;
    }

    if (isEnsuringInitialSession || hasAttemptedInitialSessionRef.current) {
      console.log('[SessionsPage] ⏸️  Already ensuring or attempted initial session');
      return;
    }

    console.log('[SessionsPage] 🚀 NO SESSIONS FOUND - creating initial session');
    let isCancelled = false;
    hasAttemptedInitialSessionRef.current = true;

    const ensureInitialSession = async () => {
      console.log('[SessionsPage] Starting ensureInitialSession, setting isEnsuringInitialSession = true');
      setIsEnsuringInitialSession(true);
      try {
        await sessionStorageDBWrapper.addSession(generateSessionName());
        console.log('[SessionsPage] ✅ Initial session created successfully');
      } catch (error) {
        console.error('[SessionsPage] ❌ Failed to ensure initial session:', error);
        if (!isCancelled) {
          hasAttemptedInitialSessionRef.current = false;
        }
      } finally {
        console.log('[SessionsPage] ensureInitialSession finally block, always resetting isEnsuringInitialSession');
        // Always reset, even if cancelled - the session was created, UI needs to update
        setIsEnsuringInitialSession(false);
      }
    };

    ensureInitialSession();

    return () => {
      isCancelled = true;
    };
  }, [sessions.length, isEnsuringInitialSession, sessionsLoading, user?.id]);

  // Callback to receive live message counts from ChatSessionContainer
  const handleMessagesCountChange = useCallback((sessionId: string, count: number) => {
    console.log(`🎯 [SessionsPage] Received message count update: ${count} for session ${sessionId}`);
    setSessionMessageCounts(prev => {
      const oldCount = prev[sessionId];
      if (oldCount !== count) {
        console.log(`🔄 [SessionsPage] Updating UI counter: ${oldCount ?? 'undefined'} → ${count} for session ${sessionId}`);
      }
      return {
        ...prev,
        [sessionId]: count,
      };
    });
  }, []);
  
  // Callback to register reset function from ChatSessionContainer
  const handleRegisterResetFunction = useCallback((sessionId: string, resetFn: () => void) => {
    resetFunctionsRef.current[sessionId] = resetFn;
  }, []);

  // Callback to track when messages are loading
  const handleMessagesLoadingChange = useCallback(
    (sessionId: string, isLoading: boolean) => {
      if (sessionId !== currentSessionId) {
        // console.log(
        //   `[MSG_SKELETON] 🚫 Ignoring messages loading change for inactive session ${sessionId} (current: ${currentSessionId})`,
        // );
        return;
      }

      // console.log(`[MSG_SKELETON] 📨 Messages loading change: ${isLoading} for session ${sessionId}`);
      
      // When messages finish loading, enforce minimum display time
      if (!isLoading && skeletonStartTimeRef.current) {
        const now = Date.now();
        const elapsed = now - skeletonStartTimeRef.current;
        const remaining = MIN_SKELETON_DISPLAY_TIME - elapsed;
        
        if (remaining > 0) {
          // console.log(`[MSG_SKELETON] ⏱️  Messages loaded fast, waiting ${remaining}ms more for minimum display time`);
          setTimeout(() => {
            // console.log('[MSG_SKELETON] ✅ Setting isMessagesLoading = false (after minimum display time)');
            setIsMessagesLoading(false);
          }, remaining);
          return;
        }
      }
      
      setIsMessagesLoading(isLoading);
    },
    [currentSessionId, MIN_SKELETON_DISPLAY_TIME],
  );

  const handleSessionReady = useCallback(
    (sessionId: string) => {
      console.log('[SessionsPage] handleSessionReady called:', { sessionId, currentSessionId });
      if (!currentSessionId || sessionId !== currentSessionId) {
        console.log('[SessionsPage] Session ID mismatch, ignoring ready signal');
        return;
      }

      if (sessionReadyTimeoutRef.current) {
        clearTimeout(sessionReadyTimeoutRef.current);
        sessionReadyTimeoutRef.current = null;
      }

      // Enforce minimum skeleton display time
      const now = Date.now();
      const skeletonStartTime = skeletonStartTimeRef.current;
      
      if (skeletonStartTime) {
        const elapsed = now - skeletonStartTime;
        const remaining = MIN_SKELETON_DISPLAY_TIME - elapsed;
        
        if (remaining > 0) {
          // console.log(`[MSG_SKELETON] ⏱️  Enforcing minimum display time: waiting ${remaining}ms more`);
          setTimeout(() => {
            // console.log('[SessionsPage] ✅ Setting isSessionReady = true (after minimum display time)');
            setIsSessionReady(true);
            skeletonStartTimeRef.current = null;
          }, remaining);
          return;
        }
      }

      console.log('[SessionsPage] ✅ Setting isSessionReady = true');
      setIsSessionReady(true);
      skeletonStartTimeRef.current = null;
    },
    [currentSessionId, MIN_SKELETON_DISPLAY_TIME],
  );

  useEffect(() => {
    console.log('[SessionsPage] 🎬 Session ready effect triggered:', { 
      currentSessionId: currentSessionId?.slice(0, 8), 
      isSessionReady 
    });
    
    if (!currentSessionId) {
      console.log('[SessionsPage] ❌ No currentSessionId, setting ready states');
      if (sessionReadyTimeoutRef.current) {
        clearTimeout(sessionReadyTimeoutRef.current);
        sessionReadyTimeoutRef.current = null;
      }
      setIsSessionReady(true);
      setIsMessagesLoading(false);
      skeletonStartTimeRef.current = null;
      return;
    }

    console.log('[SessionsPage] 🔄 Session changed, starting skeleton display for:', currentSessionId.slice(0, 8));
    // Record when skeleton starts showing
    skeletonStartTimeRef.current = Date.now();
    
    setIsSessionReady(false);
    // Immediately show message skeleton when switching sessions
    setIsMessagesLoading(true);

    if (sessionReadyTimeoutRef.current) {
      clearTimeout(sessionReadyTimeoutRef.current);
    }

    // Fallback timeout: ensure skeleton can't linger if ready signal is missed
    console.log('[SessionsPage] ⏰ Setting fallback timeout for session:', currentSessionId.slice(0, 8));
    sessionReadyTimeoutRef.current = setTimeout(() => {
      console.log('[SessionsPage] ⏰ FALLBACK TIMEOUT fired, forcing ready state');
      sessionReadyTimeoutRef.current = null;
      setIsSessionReady(true);
      skeletonStartTimeRef.current = null;
    }, SKELETON_FALLBACK_TIMEOUT);

    return () => {
      if (sessionReadyTimeoutRef.current) {
        clearTimeout(sessionReadyTimeoutRef.current);
        sessionReadyTimeoutRef.current = null;
      }
    };
  }, [currentSessionId]);

  const handleNewSession = () => {
    sessionStorageDBWrapper.addSession(generateSessionName());
  };

  const handleCloseSession = () => {
    if (currentSessionId) {
      sessionStorageDBWrapper.closeSession(currentSessionId);
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

  const activeSession = useMemo(() => {
    if (!currentSessionId) {
      return null;
    }
    return sessions.find(session => session.id === currentSessionId) || null;
  }, [sessions, currentSessionId]);

  const hasSessions = sessions.length > 0;
  const isWaitingForFirstSession = !hasSessions && !hasAttemptedInitialSessionRef.current;
  const shouldShowSkeleton = isEnsuringInitialSession || isWaitingForFirstSession || (!!currentSessionId && !isSessionReady);
  // Full skeleton overlay only for initial loading states (not for session transitions)
  const shouldShowSkeletonOverlay = Boolean(activeSession) && (isEnsuringInitialSession || isWaitingForFirstSession);
  const shouldShowStandaloneSkeleton = !activeSession && shouldShowSkeleton;

  // Debug skeleton visibility - only log when skeleton state actually changes
  useEffect(() => {
    // console.log('[MSG_SKELETON] 👁️ Skeleton visibility state:', {
    //   shouldShowSkeleton,
    //   shouldShowSkeletonOverlay,
    //   isEnsuringInitialSession,
    //   isWaitingForFirstSession,
    //   currentSessionId: currentSessionId?.slice(0, 8),
    //   isSessionReady,
    //   hasSessions,
    //   isMessagesLoading,
    //   activeSession: !!activeSession,
    // });
  }, [shouldShowSkeleton, shouldShowSkeletonOverlay, isEnsuringInitialSession, isWaitingForFirstSession, currentSessionId, isSessionReady, hasSessions, isMessagesLoading, activeSession]);

  // Log when full skeleton overlay is shown/hidden
  useEffect(() => {
    if (shouldShowSkeletonOverlay) {
      // console.log('[MSG_SKELETON] 🎭 Rendering FULL skeleton overlay (z-20)');
    }
  }, [shouldShowSkeletonOverlay]);

  // Log when message skeleton is shown/hidden
  useEffect(() => {
    const shouldShowMessageSkeleton = activeSession && shouldShowSkeleton && !shouldShowSkeletonOverlay;
    if (shouldShowMessageSkeleton) {
      // console.log('[MSG_SKELETON] 🎬 Rendering MESSAGE skeleton (z-[15]) - tied to session transition timing');
    }
  }, [activeSession, shouldShowSkeleton, shouldShowSkeletonOverlay]);


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
    try {
      if (!currentSessionId) {
        console.error('[SessionsPage] No current session to clear messages from');
        return;
      }

      // Clear allMessages from the current session in sessionStorage
      await sessionStorageDBWrapper.updateAllMessages(currentSessionId, []);

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
        let all = (await sessionStorageDBWrapper.getAllMessagesAsync(currentSessionId)) || [];
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

  const handleExportSessionAsPDF = async () => {
    if (!currentSessionId) return;
    const current = sessions.find(s => s.id === currentSessionId);
    const messages = await sessionStorageDBWrapper.getAllMessagesAsync(currentSessionId);
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
      // Snapshot session IDs to avoid mutation during deletion
      const sessionIds = sessions.map(s => s.id);

      // Delete all sessions sequentially to avoid race conditions
      for (const id of sessionIds) {
        await sessionStorageDBWrapper.deleteSession(id);
      }

      // Create a fresh session immediately so the UI can recover without reload
      try {
        await sessionStorageDBWrapper.addSession(generateSessionName());
        hasAttemptedInitialSessionRef.current = true;
      } catch (createError) {
        // If session creation fails, allow the ensureInitialSession effect to retry
        console.error('[SessionsPage] Failed to create new session after clearing:', createError);
        hasAttemptedInitialSessionRef.current = false;
      }

      setClearSessionsConfirmOpen(false);
    } catch (err) {
      console.error('[SessionsPage] Failed to clear all sessions:', err);
      setClearSessionsConfirmOpen(false);
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
    <SessionRuntimeProvider>
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

          {/* More Options Dropdown */}
          <DropdownMenu
            align="right"
            isLight={isLight}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 p-0',
                  isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
                )}>
                <svg
                  width="16"
                  height="16"
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

          {/* Home Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onGoHome}
            title="Home"
            className={cn(
              'h-7 w-7 p-0',
              isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-800',
            )}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </Button>

          {/* User Menu with Organization and Team Selectors */}
          <UserMenu isLight={isLight} onGoAdmin={onGoAdmin} />
        </div>
      </div>

      {/* Session Content Area */}
      <div className="relative flex-1 overflow-hidden">
        {activeSession ? (
          <div className={cn('absolute inset-0 z-0 flex flex-col overflow-hidden animate-fadeIn')}>
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
                  sessionId={activeSession.id}
                  isLight={isLight}
                  publicApiKey={publicApiKey}
                  isActive
                  contextMenuMessage={contextMenuMessage}
                  onMessagesCountChange={handleMessagesCountChange}
                  onRegisterResetFunction={handleRegisterResetFunction}
                  onReady={handleSessionReady}
                  onMessagesLoadingChange={handleMessagesLoadingChange}
                />
            </ErrorBoundary>
          </div>
        ) : shouldShowStandaloneSkeleton ? (
          <ChatSkeleton isLight={isLight} />
        ) : hasSessions ? (
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p>Select a session to begin</p>
              <p className="text-sm">Choose a session from the list below to continue chatting</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p>No active session</p>
              <p className="text-sm">Create a new session to start chatting</p>
            </div>
          </div>
        )}

        {/* Full skeleton overlay when session is loading */}
        {shouldShowSkeletonOverlay && (
            <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col overflow-hidden">
              <ChatSkeleton isLight={isLight} />
            </div>
        )}
        
        {/* Individual skeletons during session transitions (covers all three sections) */}
        {activeSession && shouldShowSkeleton && !shouldShowSkeletonOverlay && (
          <>
            {/* Status Bar Skeleton - positioned at top, h-[34px] */}
            <div className="pointer-events-auto absolute left-0 right-0 top-0 z-[15]">
              <StatusBarSkeleton isLight={isLight} />
            </div>
            
            {/* Messages Skeleton - positioned in middle (between status bar and selectors bar) */}
            <div className="pointer-events-auto absolute bottom-[48px] left-0 right-0 top-[34px] z-[15] flex flex-col overflow-hidden">
              <MessagesOnlySkeleton isLight={isLight} />
            </div>
            
            {/* Selectors Bar Skeleton - positioned at bottom, approximately h-[48px] */}
            <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[15]">
              <SelectorsBarSkeleton isLight={isLight} />
            </div>
          </>
        )}
      </div>

      {/* Session List - Fixed at bottom */}
      <div
        className={cn(
          'flex-shrink-0 border-t py-1',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <SessionList isLight={isLight} />
      </div>

      {/* Clear Messages Confirmation Modal */}
      <>
        {/* Backdrop - conditionally rendered */}
        {clearMessagesConfirmOpen && (
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setClearMessagesConfirmOpen(false)}
          />
        )}

        {/* Modal - Always mounted, visibility controlled with CSS */}
        <div 
          className={cn(
            'fixed inset-0 z-[10001] flex items-center justify-center p-4 transition-opacity',
            clearMessagesConfirmOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
        >
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
                <h2 className={cn('text-sm font-semibold', mainTextColor)}>
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
                    <p className={cn('text-sm font-medium', mainTextColor)}>
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
                      ? 'bg-gray-200 hover:bg-gray-300'
                      : 'bg-gray-700 hover:bg-gray-600',
                  )}
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                >
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

      {/* Reset Session Confirmation Modal */}
      <>
        {/* Backdrop - conditionally rendered */}
        {resetSessionConfirmOpen && (
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setResetSessionConfirmOpen(false)}
          />
        )}

        {/* Modal - Always mounted, visibility controlled with CSS */}
        <div 
          className={cn(
            'fixed inset-0 z-[10001] flex items-center justify-center p-4 transition-opacity',
            resetSessionConfirmOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
        >
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
                <h2 className={cn('text-sm font-semibold', mainTextColor)}>
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
                    <p className={cn('text-sm font-medium', mainTextColor)}>
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
                      ? 'bg-gray-200 hover:bg-gray-300'
                      : 'bg-gray-700 hover:bg-gray-600',
                  )}
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                >
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

      {/* Clear Sessions Confirmation Modal */}
      <>
        {/* Backdrop - conditionally rendered */}
        {clearSessionsConfirmOpen && (
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setClearSessionsConfirmOpen(false)}
          />
        )}

        {/* Modal - Always mounted, visibility controlled with CSS */}
        <div 
          className={cn(
            'fixed inset-0 z-[10001] flex items-center justify-center p-4 transition-opacity',
            clearSessionsConfirmOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
        >
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
                <h2 className={cn('text-sm font-semibold', mainTextColor)}>
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
                    <p className={cn('text-sm font-medium', mainTextColor)}>
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
                      ? 'bg-gray-200 hover:bg-gray-300'
                      : 'bg-gray-700 hover:bg-gray-600',
                  )}
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                >
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
    </SessionRuntimeProvider>
  );
};


