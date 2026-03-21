/**
 * Custom User Message Renderer for CopilotKit V2
 *
 * Renders user message content with V1 styling (border, background colors)
 * and full width support.
 */

import * as React from 'react';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { CustomMarkdownRenderer } from '../../chat/CustomMarkdownRenderer';
import { DEBUG_USER_MESSAGE_SCROLL } from '../../../debug/user-message-scroll';

const noopMirrorDraft: (value: string) => void = () => {};

/** Uncontrolled textarea — keystrokes do not re-render React (only mirror ref for save). Parent sets `key` when opening edit. */
const UserMessageEditField = React.memo(function UserMessageEditField({
  initialText,
  textareaRef,
  savedScrollTopRef,
  savedCursorRef,
  onMirrorDraft,
  onKeyDown,
  isLight,
}: {
  initialText: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  savedScrollTopRef?: React.MutableRefObject<number>;
  savedCursorRef?: React.MutableRefObject<number>;
  onMirrorDraft: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isLight: boolean;
}) {
  const textareaStyle = React.useMemo(
    () =>
      ({
        width: '100%',
        minHeight: '80px',
        maxHeight: '200px',
        overflowY: 'auto' as const,
        padding: '0.5rem',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: isLight ? '#ffffff' : '#0C1117',
        color: isLight ? '#374151' : '#d1d5db',
        fontSize: '13px',
        lineHeight: '1.4',
        fontFamily: 'inherit',
        resize: 'none' as const,
        outline: 'none',
        marginBottom: '0.5rem',
      }) satisfies React.CSSProperties,
    [isLight],
  );

  return (
    <textarea
      ref={textareaRef}
      className="user-message-edit-textarea"
      defaultValue={initialText}
      onChange={e => {
        const el = e.target;
        // Save both scroll and cursor BEFORE the state update that triggers a remount
        if (savedScrollTopRef) savedScrollTopRef.current = el.scrollTop;
        if (savedCursorRef) savedCursorRef.current = el.selectionStart ?? 0;
        onMirrorDraft(el.value);
      }}
      onKeyDown={onKeyDown}
      style={textareaStyle}
    />
  );
});

function logScrollAncestors(label: string, from: HTMLElement | null, maxDepth = 14) {
  if (!DEBUG_USER_MESSAGE_SCROLL || !from) return;
  let p: HTMLElement | null = from.parentElement;
  let depth = 0;
  while (p && depth < maxDepth) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === 'auto' || overflowY === 'scroll' || p.scrollTop > 0) {
      // eslint-disable-next-line no-console
      console.log(`[user-msg-scroll] ${label}`, p.tagName, {
        scrollTop: p.scrollTop,
        scrollHeight: p.scrollHeight,
        clientHeight: p.clientHeight,
        overflowY,
        class: typeof p.className === 'string' ? p.className.slice(0, 100) : '',
      });
    }
    p = p.parentElement;
    depth += 1;
  }
}

export interface CustomUserMessageRendererProps {
  content: string;
  className?: string;
  isEditing?: boolean;
  editedContent?: string;
  onContentChange?: (content: string, cursorPos?: number) => void;
  onSave?: () => void;
  onCancel?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  attachments?: Array<{ filename: string; mimeType: string; url: string }>;
  isFirstMessage?: boolean;
  /** Ref owned by parent — survives textarea remounts — used to save/restore scrollTop */
  savedScrollTopRef?: React.MutableRefObject<number>;
  /** Ref owned by parent — survives textarea remounts — used to save/restore cursor position */
  savedCursorRef?: React.MutableRefObject<number>;
  /** Bump when opening edit so the uncontrolled textarea remounts with fresh defaultValue */
  editFieldMountKey?: number;
  /** Portaled Virtua sticky duplicate — V2 DOM may omit `.copilotKitUserMessage`; layout fixed here (not only CSS). */
  virtuaStickyPortal?: boolean;
  /** For Virtua sticky width sync — matches `data-message-id` on in-list row */
  messageId?: string;
}

/**
 * CustomUserMessageRenderer - Full width message renderer with V1 styling
 *
 * Features:
 * - Full width content (100% width, max-width 100%)
 * - Word wrapping for long content
 * - V1 border and background colors (theme-aware)
 * - Position relative container (for absolute positioned buttons in parent)
 * - Matches copilotKitUserMessage styling from V1
 */
export const CustomUserMessageRenderer: React.FC<CustomUserMessageRendererProps> = React.memo(
  ({
    content,
    className = '',
    isEditing = false,
    editedContent = '',
    onContentChange,
    onSave,
    onCancel,
    textareaRef,
    onKeyDown,
    attachments = [],
    isFirstMessage = false,
    savedScrollTopRef,
    savedCursorRef,
    editFieldMountKey = 0,
    virtuaStickyPortal = false,
    messageId,
  }) => {
    const debugIdRef = React.useRef(Math.random().toString(36).slice(2, 9));
    const { isLight } = useStorage(themeStorage);

    // V1 styling colors
    const containerStyles = React.useMemo(() => {
      const radiusAndVerticalMargin = virtuaStickyPortal
        ? {
            marginTop: 0,
            marginBottom: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomLeftRadius: '10px',
            borderBottomRightRadius: '10px',
          }
        : {
            borderRadius: '10px',
            marginTop: isFirstMessage ? '1rem' : 0,
            marginBottom: '12px',
          };

      const baseStyles = {
        position: 'relative' as const,
        width: '100%',
        maxWidth: '100%',
        wordBreak: 'break-word' as const,
        overflowWrap: 'break-word' as const,
        padding: '0.6rem',
        overflow: 'visible' as const,
        transition: 'all 0.2s ease-in-out' as const,
        ...radiusAndVerticalMargin,
      };

      if (isLight) {
        // Light: gray-50 — Virtua sticky matches CustomInputV2 and in-list user bubble
        const lightBg = '#f9fafb';
        const lightBorder = '1px solid #e5e7eb';
        return {
          ...baseStyles,
          backgroundColor: lightBg,
          ...(virtuaStickyPortal
            ? {
                borderTop: 'none',
                borderLeft: lightBorder,
                borderRight: lightBorder,
                borderBottom: lightBorder,
              }
            : { border: lightBorder }),
          color: '#374151',
        };
      } else {
        // Dark mode: matches V1 copilotKitUserMessage
        const darkBorder = '1px solid #374151';
        return {
          ...baseStyles,
          backgroundColor: '#151C24', // Dark mode background
          ...(virtuaStickyPortal
            ? {
                borderTop: 'none',
                borderLeft: darkBorder,
                borderRight: darkBorder,
                borderBottom: darkBorder,
              }
            : { border: darkBorder }),
          color: '#d1d5db', // Dark mode text color - matches custom buttons (gray-300)
        };
      }
    }, [isLight, isFirstMessage, virtuaStickyPortal]);

    /** Portaled sticky: beat Copilot `cpk:bg-*` !important without a stylesheet rule that overrides `element.style` in DevTools. */
    const virtuaStickySurfaceRef = React.useRef<HTMLDivElement | null>(null);
    React.useLayoutEffect(() => {
      if (!virtuaStickyPortal) return;
      const el = virtuaStickySurfaceRef.current;
      if (!el) return;
      const s = containerStyles as React.CSSProperties;
      if (s.backgroundColor != null && s.backgroundColor !== '') {
        el.style.setProperty('background-color', String(s.backgroundColor), 'important');
      }
      if (virtuaStickyPortal) {
        el.style.setProperty('border-top', 'none', 'important');
        if (s.borderLeft != null && s.borderLeft !== '') {
          el.style.setProperty('border-left', String(s.borderLeft), 'important');
        }
        if (s.borderRight != null && s.borderRight !== '') {
          el.style.setProperty('border-right', String(s.borderRight), 'important');
        }
        if (s.borderBottom != null && s.borderBottom !== '') {
          el.style.setProperty('border-bottom', String(s.borderBottom), 'important');
        }
      } else if (s.border != null && s.border !== '') {
        el.style.setProperty('border', String(s.border), 'important');
      }
      if (s.color != null && s.color !== '') {
        el.style.setProperty('color', String(s.color), 'important');
      }
    }, [virtuaStickyPortal, containerStyles, isEditing]);

    // After each remount, synchronously restore scroll + focus + cursor before the browser paints.
    // onChange saves both refs before the state update that triggers the remount.
    React.useLayoutEffect(() => {
      if (!isEditing || !textareaRef?.current) return;
      const ta = textareaRef.current;
      // 1. Restore scroll position
      if (savedScrollTopRef) ta.scrollTop = savedScrollTopRef.current;
      // 2. Restore focus if not already focused (remount always drops focus)
      if (document.activeElement !== ta) {
        ta.focus({ preventScroll: true });
        // 3. Restore cursor position
        if (savedCursorRef) {
          const pos = Math.min(savedCursorRef.current, ta.value.length);
          ta.setSelectionRange(pos, pos);
        }
      }
      if (DEBUG_USER_MESSAGE_SCROLL) {
        // eslint-disable-next-line no-console
        console.log('[user-msg-scroll] layoutEffect restore', {
          id: debugIdRef.current,
          scrollTop: ta.scrollTop,
          cursor: savedCursorRef?.current,
          focused: document.activeElement === ta,
        });
        logScrollAncestors('layoutEffect ancestors', ta);
      }
    }, [isEditing]);

    // Log after parent rAF (e.g. CustomUserMessageV2 focus effect) — see if scroll jumps post-layout.
    React.useEffect(() => {
      if (!DEBUG_USER_MESSAGE_SCROLL || !isEditing || !textareaRef?.current || !savedScrollTopRef) return;
      const ta = textareaRef.current;
      const saved = savedScrollTopRef.current;
      const raf = requestAnimationFrame(() => {
        if (!textareaRef?.current) return;
        const el = textareaRef.current;
        // eslint-disable-next-line no-console
        console.log('[user-msg-scroll] after rAF', {
          id: debugIdRef.current,
          textareaScrollTop: el.scrollTop,
          savedRef: saved,
          mismatch: el.scrollTop !== saved,
        });
        logScrollAncestors('after rAF ancestors', el);
      });
      return () => cancelAnimationFrame(raf);
    }, [isEditing]);

    const surfaceClass = virtuaStickyPortal ? 'virtua-sticky-user-message-surface' : '';

    // Edit mode view
    if (isEditing) {
      return (
        <div
          ref={virtuaStickyPortal ? virtuaStickySurfaceRef : undefined}
          className={[className, surfaceClass].filter(Boolean).join(' ')}
          style={containerStyles}
          data-message-role="user"
          {...(messageId != null && messageId !== '' ? { 'data-message-id': messageId } : {})}>
          <UserMessageEditField
            key={editFieldMountKey}
            initialText={editedContent}
            textareaRef={textareaRef as React.RefObject<HTMLTextAreaElement | null>}
            savedScrollTopRef={savedScrollTopRef}
            savedCursorRef={savedCursorRef}
            onMirrorDraft={onContentChange ?? noopMirrorDraft}
            onKeyDown={onKeyDown}
            isLight={isLight}
          />
          <div
            style={{
              display: 'flex',
              gap: '0.25rem',
              justifyContent: 'flex-end',
            }}>
            <button
              onClick={onCancel}
              title="Cancel (Esc)"
              style={{
                width: '28px',
                height: '28px',
                padding: '0.5rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: isLight ? '#374151' : '#d1d5db', // Matches custom buttons
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)';
              }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="16"
                height="16">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <button
              onClick={onSave}
              title="Save (⌘↵)"
              style={{
                width: '28px',
                height: '28px',
                padding: '0.5rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#22c55e',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)';
              }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="16"
                height="16">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        </div>
      );
    }

    // View mode (default) - render markdown with attachments
    return (
      <div
        ref={virtuaStickyPortal ? virtuaStickySurfaceRef : undefined}
        className={[className, surfaceClass].filter(Boolean).join(' ')}
        style={containerStyles}
        data-message-role="user"
        {...(messageId != null && messageId !== '' ? { 'data-message-id': messageId } : {})}>
        {/* Attachment chips - displayed above message content */}
        {attachments && attachments.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '2px',
              marginBottom: '6px',
              position: 'relative',
              zIndex: 10001,
            }}>
            {attachments.map((att, idx) => (
              <div
                key={`${att.url}-${idx}`}
                title={att.filename}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '1px 4px',
                  borderRadius: '6px',
                  background: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.07)',
                  fontSize: 9,
                  color: isLight ? '#374151' : '#d1d5db', // Matches message text and buttons
                  fontWeight: isLight ? 500 : 400,
                  maxWidth: '100%',
                  whiteSpace: 'nowrap',
                }}>
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <a
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                  {att.filename}
                </a>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            fontSize: '13px',
            lineHeight: '1.4',
            color: 'inherit', // Inherit muted color from container
            maxHeight: '150px',
            overflowY: 'auto' as const,
            overflowX: 'visible' as const,
          }}>
          <CustomMarkdownRenderer content={content} isLight={isLight} hideToolbars={true} />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    const propsChanged = {
      content: prevProps.content !== nextProps.content,
      isEditing: prevProps.isEditing !== nextProps.isEditing,
      editedContent: prevProps.editedContent !== nextProps.editedContent,
      editFieldMountKey: prevProps.editFieldMountKey !== nextProps.editFieldMountKey,
      isFirstMessage: prevProps.isFirstMessage !== nextProps.isFirstMessage,
      virtuaStickyPortal: prevProps.virtuaStickyPortal !== nextProps.virtuaStickyPortal,
      messageId: prevProps.messageId !== nextProps.messageId,
      attachments: prevProps.attachments?.length !== nextProps.attachments?.length,
    };

    return (
      !propsChanged.content &&
      !propsChanged.isEditing &&
      !propsChanged.editedContent &&
      !propsChanged.editFieldMountKey &&
      !propsChanged.isFirstMessage &&
      !propsChanged.virtuaStickyPortal &&
      !propsChanged.messageId &&
      !propsChanged.attachments
    );
  },
);

export default CustomUserMessageRenderer;
