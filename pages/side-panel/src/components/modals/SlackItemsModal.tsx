/**
 * SlackItemsModal Component
 * Modal for selecting Slack messages to attach to chat messages
 */

import { DropdownMenu, DropdownMenuItem, cn } from '@extension/ui';
import { useState, useEffect } from 'react';
import type React from 'react';
import { API_CONFIG } from '../../constants';
import { ModalCloseButton } from './ModalCloseButton';

interface SlackMessage {
  ts: string;
  text: string;
  user?: string;
  channelId: string;
  channelName: string;
  channelType: string;
  thread_ts?: string;
  reply_count?: number;
  reply_users_count?: number;
  attachments?: any[];
  files?: any[];
}

interface SlackItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (messages: SlackMessage[]) => void;
  connectionId: string;
  isLight: boolean;
}

export const SlackItemsModal: React.FC<SlackItemsModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  connectionId,
  isLight,
}) => {
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [threadContents, setThreadContents] = useState<Record<string, any[]>>({});
  const [loadingThreads, setLoadingThreads] = useState<Set<string>>(new Set());

  // Fetch messages when modal opens
  useEffect(() => {
    if (isOpen && connectionId) {
      fetchMessages();
    }
  }, [isOpen, connectionId]);

  const fetchMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const baseURL = API_CONFIG.BASE_URL;
      const response = await fetch(`${baseURL}/api/workspace/connections/${connectionId}/slack/messages?limit=100`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.status}`);
      }

      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error('[SlackItemsModal] Error fetching messages:', err);
      setError(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedMessageIds.size === filteredMessages.length) {
      setSelectedMessageIds(new Set());
    } else {
      setSelectedMessageIds(new Set(filteredMessages.map(m => m.ts)));
    }
  };

  const handleAddSelected = () => {
    const selectedMessages = messages.filter(msg => selectedMessageIds.has(msg.ts));
    onSelect(selectedMessages);
    setSelectedMessageIds(new Set());
    onClose();
  };

  const fetchThreadContent = async (message: SlackMessage) => {
    const threadKey = message.ts;

    // Don't fetch if already loaded or loading
    if (threadContents[threadKey] || loadingThreads.has(threadKey)) {
      return;
    }

    // Check if this message is actually a thread
    const isThread = message.reply_count && message.reply_count > 0;
    if (!isThread) {
      return;
    }

    setLoadingThreads(prev => new Set(prev).add(threadKey));

    try {
      const baseURL = API_CONFIG.BASE_URL;
      const response = await fetch(
        `${baseURL}/api/workspace/connections/${connectionId}/slack/thread/${message.channelId}/${message.ts}`,
        { credentials: 'include' },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch thread: ${response.status}`);
      }

      const data = await response.json();
      setThreadContents(prev => ({
        ...prev,
        [threadKey]: data.messages || [],
      }));
    } catch (err: any) {
      console.error('[SlackItemsModal] Error fetching thread:', err);
    } finally {
      setLoadingThreads(prev => {
        const next = new Set(prev);
        next.delete(threadKey);
        return next;
      });
    }
  };

  const toggleMessageExpansion = (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const wasExpanded = expandedMessageId === messageId;
    setExpandedMessageId(prev => (prev === messageId ? null : messageId));

    // If expanding (not collapsing), fetch thread content
    if (!wasExpanded) {
      const message = messages.find(m => m.ts === messageId);
      if (message) {
        fetchThreadContent(message);
      }
    }
  };

  // Format channel name (remove # if it exists at the start)
  const formatChannelName = (name: string) => (name.startsWith('#') ? name.slice(1) : name);

  // Get unique channels
  const channels = Array.from(new Set(messages.map(m => m.channelName))).sort();

  // Filter messages by search query and channel
  const filteredMessages = messages.filter(msg => {
    // Channel filter
    if (filterChannel !== 'all' && msg.channelName !== filterChannel) {
      return false;
    }

    // Search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return msg.text?.toLowerCase().includes(query) || msg.channelName?.toLowerCase().includes(query);
  });

  // Format timestamp
  const formatTimestamp = (ts: string) => {
    try {
      const timestamp = parseFloat(ts) * 1000;
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      } else if (diffDays < 7) {
        return `${diffDays}d ago`;
      } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    } catch {
      return ts;
    }
  };

  // Get channel icon
  const getChannelIcon = (type: string) => {
    const iconClass = cn('w-3 h-3 flex-shrink-0', isLight ? 'text-gray-500' : 'text-gray-400');

    if (type === 'channel') {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      );
    } else if (type === 'group') {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      );
    } else {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" style={{ zIndex: 10000 }} onClick={onClose} />

      {/* Modal */}
      <div className="attachment-modal fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 10001 }}>
        <div
          className={cn(
            'w-full max-w-4xl rounded-lg shadow-xl',
            isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
          )}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 'min(56rem, 90vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between border-b px-4 py-3',
              isLight ? 'border-gray-200' : 'border-gray-700',
            )}>
            <h2 className={cn('text-base font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
              Select Slack Messages
            </h2>
            <ModalCloseButton onClick={onClose} isLight={isLight} />
          </div>

          {/* Content Header */}
          <div className={cn('border-b px-4 pt-2 pb-1.5', isLight ? 'border-gray-200' : 'border-gray-700')}>
            {/* Search Bar with Select All */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search messages by content or channel..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={cn(
                    'w-full rounded-md px-3 py-1.5 text-[12px] transition-colors outline-none',
                    isLight
                      ? 'bg-gray-100 text-gray-700 placeholder-gray-400 focus:bg-gray-100'
                      : 'bg-gray-800/60 text-[#bcc1c7] placeholder-gray-500 focus:bg-gray-800',
                  )}
                />
              </div>

              {/* Channel Filter */}
              {channels.length > 1 && (
                <DropdownMenu
                  trigger={
                    <button
                      className={cn(
                        'flex items-center justify-between rounded-md px-3 py-1.5 text-[12px] transition-colors outline-none',
                        isLight
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-100'
                          : 'bg-gray-800/60 text-[#bcc1c7] hover:bg-gray-800',
                      )}
                      style={{ minWidth: '150px' }}>
                      <span className="truncate">
                        {filterChannel === 'all' ? 'All Channels' : `#${formatChannelName(filterChannel)}`}
                      </span>
                      <svg
                        className={cn('ml-1.5 h-3 w-3 flex-shrink-0', isLight ? 'text-gray-500' : 'text-gray-400')}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  }
                  align="right"
                  direction="down"
                  isLight={isLight}>
                  <DropdownMenuItem
                    onClick={() => setFilterChannel('all')}
                    isLight={isLight}
                    className={filterChannel === 'all' ? 'bg-gray-100 dark:bg-gray-700' : ''}>
                    <span>All Channels</span>
                  </DropdownMenuItem>
                  {channels.map(channel => (
                    <DropdownMenuItem
                      key={channel}
                      onClick={() => setFilterChannel(channel)}
                      isLight={isLight}
                      className={filterChannel === channel ? 'bg-gray-100 dark:bg-gray-700' : ''}>
                      <span>#{formatChannelName(channel)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenu>
              )}

              {/* Select All Button */}
              {filteredMessages.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors',
                    isLight ? 'text-gray-700' : 'text-[#bcc1c7]',
                  )}>
                  <div
                    className={cn(
                      'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
                      selectedMessageIds.size === filteredMessages.length && filteredMessages.length > 0
                        ? 'bg-blue-600/80 opacity-100'
                        : cn('border opacity-100', isLight ? 'border-gray-400' : 'border-gray-500'),
                    )}>
                    {selectedMessageIds.size === filteredMessages.length && filteredMessages.length > 0 && (
                      <svg
                        className="h-2 w-2 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[12px]">Select All</span>
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden px-4 py-1.5">
            <div
              className="recent-sessions-scroll h-full overflow-y-auto overscroll-contain pr-2 pb-4"
              style={
                {
                  maxHeight: 'calc(85vh - 200px)',
                  '--table-scroll-bg': isLight ? '#f9fafb' : '#151C24',
                } as React.CSSProperties
              }>
              {loading ? (
                <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  Loading messages...
                </div>
              ) : error ? (
                <div className="py-8 text-center">
                  <div className={cn('mb-2 text-sm', isLight ? 'text-red-600' : 'text-red-400')}>{error}</div>
                  <button
                    onClick={fetchMessages}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs transition-colors',
                      isLight
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                    )}>
                    Retry
                  </button>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  {searchQuery || filterChannel !== 'all' ? 'No messages match your filters' : 'No messages found'}
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Message List */}
                  {filteredMessages.map(message => {
                    const isSelected = selectedMessageIds.has(message.ts);
                    const isExpanded = expandedMessageId === message.ts;
                    const hasAttachments = (message.attachments?.length ?? 0) > 0 || (message.files?.length ?? 0) > 0;
                    const isThread = message.reply_count && message.reply_count > 0;
                    const replyCount = message.reply_count || 0;

                    return (
                      <div
                        key={message.ts}
                        className={cn(
                          'rounded-md border transition-colors',
                          isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-gray-800/50',
                        )}>
                        {/* Message Header */}
                        <div
                          onClick={() => toggleMessageSelection(message.ts)}
                          className={cn(
                            'group flex cursor-pointer items-start rounded-md px-3 py-1.5 transition-colors',
                            isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-800/70',
                          )}>
                          {/* Expand/Collapse Chevron */}
                          <button
                            onClick={e => toggleMessageExpansion(message.ts, e)}
                            className={cn(
                              'mt-0.5 mr-2 flex-shrink-0 rounded p-0.5 transition-colors',
                              isLight ? 'hover:bg-gray-200' : 'hover:bg-gray-700',
                            )}
                            title={isExpanded ? 'Collapse' : 'Expand to view full message'}>
                            <svg
                              className={cn(
                                'h-3.5 w-3.5 flex-shrink-0 transition-transform',
                                isLight ? 'text-gray-400' : 'text-gray-500',
                                isExpanded && 'rotate-90',
                              )}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>

                          {/* Checkbox */}
                          <div
                            className={cn(
                              'mt-0.5 mr-3 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
                              isSelected
                                ? 'bg-blue-600/80 opacity-100'
                                : cn('border opacity-100', isLight ? 'border-gray-400' : 'border-gray-500'),
                            )}
                            onClick={e => {
                              e.stopPropagation();
                              toggleMessageSelection(message.ts);
                            }}>
                            {isSelected && (
                              <svg
                                className="h-2 w-2 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                {getChannelIcon(message.channelType)}
                                <span
                                  className={cn(
                                    'truncate text-[12px] font-medium',
                                    isLight ? 'text-gray-900' : 'text-gray-100',
                                  )}>
                                  #{formatChannelName(message.channelName)}
                                </span>
                              </div>
                              <span
                                className={cn(
                                  'flex-shrink-0 text-[12px]',
                                  isLight ? 'text-gray-500' : 'text-gray-400',
                                )}>
                                {formatTimestamp(message.ts)}
                              </span>
                            </div>
                            <div
                              className={cn(
                                'mb-0.5 text-[12px]',
                                isExpanded ? '' : 'truncate',
                                isLight ? 'text-gray-800' : 'text-gray-200',
                              )}>
                              {message.text || '[No text content]'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {hasAttachments && (
                                <div
                                  className={cn('truncate text-[12px]', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                  {(message.attachments?.length ?? 0) > 0 &&
                                    `📎 ${message.attachments?.length ?? 0} attachment(s) `}
                                  {(message.files?.length ?? 0) > 0 && `📁 ${message.files?.length ?? 0} file(s)`}
                                </div>
                              )}
                              {isThread && (
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                                    isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/40 text-blue-300',
                                  )}
                                  title={`This message has ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}>
                                  {replyCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div
                            className={cn('border-t px-3 pt-1 pb-2', isLight ? 'border-gray-100' : 'border-gray-700')}>
                            {isThread && threadContents[message.ts] ? (
                              // Display thread with all replies
                              <div
                                className="recent-sessions-scroll max-h-96 space-y-2 overflow-y-auto overscroll-contain"
                                style={
                                  {
                                    '--table-scroll-bg': isLight ? '#f9fafb' : '#151C24',
                                  } as React.CSSProperties
                                }>
                                {threadContents[message.ts].map((threadMsg: any, idx: number) => {
                                  const isParent = idx === 0;
                                  return (
                                    <div
                                      key={threadMsg.ts}
                                      className={cn('rounded p-3 text-[12px]', isLight ? 'bg-gray-50' : 'bg-gray-800')}>
                                      <div
                                        className={cn('mb-1 font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                        {isParent ? '📌 Parent Message' : `💬 Reply ${idx}`}
                                        <span
                                          className={cn(
                                            'ml-2 text-[11px] font-normal',
                                            isLight ? 'text-gray-500' : 'text-gray-400',
                                          )}>
                                          {formatTimestamp(threadMsg.ts)}
                                        </span>
                                      </div>
                                      <div
                                        className={cn(
                                          'break-words whitespace-pre-wrap',
                                          isLight ? 'text-gray-800' : 'text-gray-300',
                                        )}>
                                        {threadMsg.text || '[No text content]'}
                                      </div>
                                      {(threadMsg.attachments?.length > 0 || threadMsg.files?.length > 0) && (
                                        <div
                                          className={cn(
                                            'mt-2 text-[11px]',
                                            isLight ? 'text-gray-600' : 'text-gray-400',
                                          )}>
                                          {threadMsg.attachments?.map((att: any, attIdx: number) => (
                                            <div key={attIdx}>📎 {att.title || att.fallback || 'Attachment'}</div>
                                          ))}
                                          {threadMsg.files?.map((file: any, fileIdx: number) => (
                                            <div key={fileIdx}>📁 {file.name || file.title || 'File'}</div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : isThread && loadingThreads.has(message.ts) ? (
                              // Loading thread content
                              <div
                                className={cn(
                                  'py-4 text-center text-[12px]',
                                  isLight ? 'text-gray-500' : 'text-gray-400',
                                )}>
                                Loading thread...
                              </div>
                            ) : (
                              // Single message (not a thread) or thread not loaded yet
                              <>
                                <div
                                  className={cn(
                                    'recent-sessions-scroll max-h-96 overflow-y-auto overscroll-contain rounded p-3 text-[12px] break-words whitespace-pre-wrap',
                                    isLight ? 'bg-gray-50 text-gray-800' : 'bg-gray-800 text-gray-300',
                                  )}
                                  style={
                                    {
                                      '--table-scroll-bg': isLight ? '#f9fafb' : '#1f2937',
                                    } as React.CSSProperties
                                  }>
                                  {message.text || '[No text content]'}
                                </div>

                                {/* Show attachment details if expanded */}
                                {hasAttachments && (
                                  <div className={cn('mt-2 text-[12px]', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                    <div className="mb-1 font-medium">Attachments:</div>
                                    {message.attachments?.map((attachment, idx) => (
                                      <div key={idx} className="ml-2">
                                        • {attachment.title || attachment.fallback || 'Attachment ' + (idx + 1)}
                                      </div>
                                    ))}
                                    {message.files?.map((file, idx) => (
                                      <div key={idx} className="ml-2">
                                        • {file.name || file.title || 'File ' + (idx + 1)}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            className={cn(
              'flex items-center justify-between border-t px-4 py-3',
              isLight ? 'border-gray-200' : 'border-gray-700',
            )}>
            <span className="text-[12px]" style={{ color: isLight ? '#6b7280' : '#9ca3af' }}>
              {selectedMessageIds.size} message(s) selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
                  isLight
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                )}>
                Cancel
              </button>
              <button
                onClick={handleAddSelected}
                disabled={selectedMessageIds.size === 0}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
                  selectedMessageIds.size === 0
                    ? 'cursor-not-allowed bg-gray-400 text-gray-600 opacity-50'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                )}>
                Add {selectedMessageIds.size > 0 && `(${selectedMessageIds.size})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
