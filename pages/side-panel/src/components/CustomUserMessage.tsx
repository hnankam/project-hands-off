import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStorage } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { useCopilotChatHeadless_c } from '@copilotkit/react-core';
import { ImageRenderer, type UserMessageProps } from '@copilotkit/react-ui';

/**
 * Custom UserMessage Component for CopilotChat
 *
 * Features:
 * - Edit message content
 * - Delete message with options:
 *   - Delete this message only
 *   - Delete all messages above (and this one)
 *   - Delete all messages below (and this one)
 * - Copy message content to clipboard
 * - Undo last edit (keeps edit history)
 * - Maintains the simplistic design of the default component
 * - Shows controls on hover
 * - Supports image rendering with the CopilotKit ImageRenderer
 */
export const CustomUserMessage: React.FC<UserMessageProps> = ({
  message,
  ImageRenderer: ImageRendererComponent = ImageRenderer,
}) => {
  const { isLight } = useStorage(exampleThemeStorage);
  const { messages, setMessages, reloadMessages } = useCopilotChatHeadless_c();

  // Find the index of the current message
  const index = useMemo(() => {
    if (!messages || !message) return -1;
    return messages.findIndex(msg => msg.id === message.id);
  }, [messages, message]);

  const isLast = useMemo(() => {
    if (!messages || index === -1) return false;
    return index === messages.length - 1;
  }, [messages, index]);

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [editHistory, setEditHistory] = useState<string[]>([]);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);

  // Get message content (handle both string and array content)
  const getMessageContent = (): string => {
    if (!message?.content) return '';
    const content = message.content as any; // Type assertion for flexible content handling
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((item: any) => {
          if (typeof item === 'string') return item;
          if (item?.text) return item.text;
          if (item?.type === 'text' && item?.text) return item.text;
          return '';
        })
        .join(' ');
    }
    if (typeof content === 'object' && content !== null) {
      return JSON.stringify(content);
    }
    return '';
  };

  const content = getMessageContent();

  // Parse hidden attachment manifest from content
  type AttachmentItem = { name: string; type: string; size: number; url: string };
  const { cleanedContent, attachments } = useMemo(() => {
    try {
      const re = /<!--ATTACHMENTS:\s*([\s\S]*?)\s*-->/m;
      const m = content.match(re);
      if (!m) return { cleanedContent: content, attachments: [] as AttachmentItem[] };
      const json = m[1];
      const list = JSON.parse(json) as AttachmentItem[];
      const cleaned = content.replace(re, '').trimEnd();
      return { cleanedContent: cleaned, attachments: Array.isArray(list) ? list : [] };
    } catch {
      return { cleanedContent: content, attachments: [] as AttachmentItem[] };
    }
  }, [content]);

  const formatSize = (bytes: number): string => {
    const kb = bytes / 1024;
    if (kb >= 1024) {
      const mb = kb / 1024;
      return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
    }
    return `${Math.max(1, Math.round(kb))} KB`;
  };

  // Check if this is an image message
  const isImageMessage = message && 'image' in message && message.image;

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
      textareaRef.current.focus();
    }
  }, [isEditing]);

  // Close delete menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setShowDeleteMenu(false);
      }
    };

    if (showDeleteMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [showDeleteMenu]);

  // Handle edit
  const handleEdit = () => {
    setEditedContent(content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!messages) return;

    // Save current content to edit history before editing
    setEditHistory(prev => [...prev, content]);

    const updatedMessages = [...messages];
    updatedMessages[index] = {
      ...updatedMessages[index],
      content: editedContent,
    };
    setMessages(updatedMessages);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent('');
  };

  // Handle undo last edit
  const handleUndoEdit = () => {
    if (!messages || editHistory.length === 0) return;

    const previousContent = editHistory[editHistory.length - 1];
    const updatedMessages = [...messages];
    updatedMessages[index] = {
      ...updatedMessages[index],
      content: previousContent,
    };
    setMessages(updatedMessages);

    // Remove the last item from history
    setEditHistory(prev => prev.slice(0, -1));
  };

  // Handle copy message content
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  // Handle rerun (regenerate assistant response for this user message)
  const handleRerun = () => {
    try {
      if (!messages || !message) return;
      // Find the next assistant message after this user message
      const following = messages.slice(index + 1).find(m => (m as any)?.role === 'assistant');
      if (following?.id) {
        reloadMessages(following.id);
        return;
      }
      // Fallback: rerun starting from this user message
      if ((message as any)?.id) {
        reloadMessages((message as any).id);
      }
    } catch (e) {
      console.warn('[CustomUserMessage] Failed to rerun message:', e);
    }
  };

  // Handle delete operations
  const handleDeleteMessage = () => {
    if (!messages || index === -1) return;

    const updatedMessages = messages.filter((_, i) => i !== index);
    setMessages(updatedMessages);
    setShowDeleteMenu(false);
  };

  const handleDeleteAbove = () => {
    if (!messages || index === -1) return;

    // Delete all messages from index 0 to current index (inclusive)
    const updatedMessages = messages.filter((_, i) => i > index);
    setMessages(updatedMessages);
    setShowDeleteMenu(false);
  };

  const handleDeleteBelow = () => {
    if (!messages || index === -1) return;

    // Delete all messages from current index to end (inclusive)
    const updatedMessages = messages.filter((_, i) => i < index);
    setMessages(updatedMessages);
    setShowDeleteMenu(false);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div
      className="copilotKitMessage copilotKitUserMessage"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        borderRadius: '10px',
        marginLeft: '0',
        maxWidth: '100%',
        width: '100%',
        marginBottom: '0',
        marginTop: '1rem',
        padding: '0.5rem 0.75rem 0.75rem 0.75rem',
        transition: 'all 0.2s ease-in-out',
        overflow: 'visible',
      }}>
      {/* Message Content or Edit Mode */}
      {isEditing ? (
        <div className="edit-mode" style={{ width: '100%' }}>
          <textarea
            ref={textareaRef}
            value={editedContent}
            onChange={e => setEditedContent(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              minHeight: '60px',
              padding: '0.5rem',
              borderRadius: '6px',
              border: isLight ? '1px solid #d1d5db' : '1px solid #4b5563',
              backgroundColor: isLight ? '#ffffff' : '#0C1117',
              color: isLight ? '#0C1117' : '#f9fafb',
              fontSize: '13px',
              lineHeight: '1.4',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
            }}
          />
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginTop: '0.25rem',
              marginBottom: '-0.55rem',
              justifyContent: 'flex-end',
            }}>
            <button
              onClick={handleCancelEdit}
              title="Cancel (Esc)"
              style={{
                width: '30px',
                height: '30px',
                padding: '0rem 0.5rem 0.5rem 0.5rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: isLight ? '#374151' : '#d1d5db',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
                strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <button
              onClick={handleSaveEdit}
              title="Save (⌘↵)"
              style={{
                width: '30px',
                height: '30px',
                padding: '0rem 0.5rem 0.5rem 0.5rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#22c55e',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
                strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* Render image if present */}
          {isImageMessage && <ImageRendererComponent image={message.image!} content={message.content} />}

          {/* Attachment chips rendered from hidden manifest */}
          {attachments.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '2px',
                marginBottom: '6px',
                position: 'relative',
                zIndex: 10001,
              }}
            >
              {attachments.map((att, idx) => (
                <div
                  key={`${att.url}-${idx}`}
                  title={att.name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '1px 4px',
                    borderRadius: 9999,
                    border: isLight ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.15)',
                    background: isLight ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.07)',
                    fontSize: 9,
                    color: isLight ? '#0C1117' : '#e5e7eb',
                    fontWeight: isLight ? 500 : 400,
                    maxWidth: '100%',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <a href={att.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {att.name}
                  </a>
                  <span style={{ opacity: 0.7, fontSize: 8 }}>({formatSize(att.size)})</span>
                </div>
              ))}
            </div>
          )}

          {/* Render text content for non-image messages or alongside images (with manifest removed) */}
          {!isImageMessage && (
            <div
              style={{
                fontSize: '13px',
                lineHeight: '1.4',
                color: isLight ? '#0C1117' : '#f9fafb',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
              {cleanedContent}
            </div>
          )}
        </div>
      )}

      {/* Message Controls - Show on Hover */}
      {!isEditing && (
        <div
          className="copilotKitMessageControls"
          style={{
            position: 'absolute',
            bottom: '0rem',
            right: '0.5rem',
            display: 'flex',
            maxHeight: '100%',
            gap: '0.25rem',
            opacity: isHovered ? 1 : 0,
            visibility: isHovered ? 'visible' : 'hidden',
            transition: 'opacity 0.2s ease-in-out, visibility 0.2s ease-in-out',
            zIndex: 10000,
            // Add background with left-side fade
            background: isLight
              ? 'linear-gradient(to right, rgba(229, 231, 235, 0) 0%, rgba(229, 231, 235, 0.8) 20%, rgba(229, 231, 235, 0.95) 40%, rgb(229, 231, 235) 60%)'
              : 'linear-gradient(to right, rgba(21, 28, 36, 0) 0%, rgba(21, 28, 36, 0.8) 20%, rgba(21, 28, 36, 0.95) 40%, rgb(21, 28, 36) 60%)',
            paddingLeft: '3rem',
            paddingRight: '0.5rem',
            paddingTop: '0.35rem',
            // paddingBottom: '-0.25rem',
            borderRadius: '6px',
            marginRight: '-0.5rem',
          }}>
          {/* Copy Button */}
          <button
            onClick={handleRerun}
            className="copilotKitMessageControlButton"
            title="Rerun response"
            style={{
              width: '28px',
              height: '28px',
              padding: '0.5rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#3b82f6',
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
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0115.54-5.657" />
              <path d="M4.5 4.5v3h3" />
              <path d="M21 12a9 9 0 01-15.54 5.657" />
              <path d="M19.5 19.5v-3h-3" />
            </svg>
          </button>
          
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="copilotKitMessageControlButton"
            title="Copy message"
            style={{
              width: '28px',
              height: '28px',
              padding: '0.5rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: showCopyFeedback
                ? isLight
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(34, 197, 94, 0.25)'
                : 'transparent',
              color: showCopyFeedback ? '#22c55e' : isLight ? '#0C1117' : '#ffffff',
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
            {showCopyFeedback ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>

          {/* Undo Edit Button - Only show if there's edit history */}
          {editHistory.length > 0 && (
            <button
              onClick={handleUndoEdit}
              className="copilotKitMessageControlButton"
              title="Undo last edit"
              style={{
                width: '28px',
                height: '28px',
                padding: '0.5rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#3b82f6',
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
                strokeLinejoin="round">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            </button>
          )}

          {/* Edit Button */}
          <button
            onClick={handleEdit}
            className="copilotKitMessageControlButton"
            title="Edit message"
            style={{
              width: '28px',
              height: '28px',
              padding: '0.5rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: isLight ? '#0C1117' : '#ffffff',
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
              strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>

          {/* Delete Button with Dropdown */}
          <div style={{ position: 'relative' }} ref={deleteMenuRef}>
            <button
              onClick={() => setShowDeleteMenu(!showDeleteMenu)}
              className="copilotKitMessageControlButton"
              title="Delete options"
              style={{
                width: '28px',
                height: '28px',
                padding: '0.5rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#ef4444',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                margin: '0px',
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
                strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>

            {/* Delete Dropdown Menu */}
            {showDeleteMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  marginTop: '0.25rem',
                  backgroundColor: isLight ? '#f9fafb' : '#151C24',
                  border: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
                  borderRadius: '6px',
                  boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
                  zIndex: 99999,
                  minWidth: '160px',
                  overflow: 'visible',
                }}>
                <button
                  onClick={handleDeleteMessage}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: isLight ? '#374151' : '#d1d5db',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    borderBottom: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#1f2937';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}>
                  Delete this message
                </button>
                <button
                  onClick={handleDeleteAbove}
                  disabled={index === 0}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: index === 0 ? (isLight ? '#9ca3af' : '#6b7280') : isLight ? '#374151' : '#d1d5db',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    borderBottom: isLight ? '1px solid #e5e7eb' : '1px solid #374151',
                  }}
                  onMouseEnter={e => {
                    if (index !== 0) {
                      e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#1f2937';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}>
                  Delete all above
                </button>
                <button
                  onClick={handleDeleteBelow}
                  disabled={isLast}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: isLast ? (isLight ? '#9ca3af' : '#6b7280') : isLight ? '#374151' : '#d1d5db',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: isLast ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isLast) {
                      e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#1f2937';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}>
                  Delete all below
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
