/**
 * GmailItemsModal Component
 * Modal for selecting Gmail emails to attach to chat messages
 */

import { cn } from '@extension/ui';
import DOMPurify from 'dompurify';
import { useState, useEffect, useMemo } from 'react';
import type React from 'react';

interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  labelIds?: string[];
}

interface GmailItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emails: GmailEmail[]) => void;
  connectionId: string;
  isLight: boolean;
}

export const GmailItemsModal: React.FC<GmailItemsModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  connectionId,
  isLight,
}) => {
  const [emails, setEmails] = useState<GmailEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [emailContents, setEmailContents] = useState<Map<string, string>>(new Map());
  const [loadingContent, setLoadingContent] = useState<Set<string>>(new Set());

  // Fetch emails when modal opens
  useEffect(() => {
    if (isOpen && connectionId) {
      fetchEmails();
    }
  }, [isOpen, connectionId]);

  // Server-side search with debouncing
  useEffect(() => {
    if (!isOpen || !connectionId) return;

    const debounceTimer = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery.trim());
      } else {
        fetchEmails(); // Reset to initial load when search is cleared
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, isOpen, connectionId]);

  const fetchEmails = async (reset = true) => {
    if (reset) {
      setLoading(true);
      setEmails([]);
      setNextPageToken(null);
      setHasMore(false);
    }

    setError(null);

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseURL}/api/workspace/connections/${connectionId}/gmail/emails?maxResults=50`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch emails: ${response.status}`);
      }

      const data = await response.json();
      setEmails(data.emails || []);
      setNextPageToken(data.nextPageToken || null);
      setHasMore(!!data.nextPageToken);
    } catch (err: any) {
      console.error('[GmailItemsModal] Error fetching emails:', err);
      setError(err.message || 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreEmails = async () => {
    if (!nextPageToken || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const params = new URLSearchParams({
        maxResults: '50',
        pageToken: nextPageToken,
      });

      const response = await fetch(
        `${baseURL}/api/workspace/connections/${connectionId}/gmail/emails?${params.toString()}`,
        {
          credentials: 'include',
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to load more emails: ${response.status}`);
      }

      const data = await response.json();
      setEmails(prev => [...prev, ...(data.emails || [])]);
      setNextPageToken(data.nextPageToken || null);
      setHasMore(!!data.nextPageToken);
    } catch (err: any) {
      console.error('[GmailItemsModal] Error loading more emails:', err);
      setError(err.message || 'Failed to load more emails');
    } finally {
      setLoadingMore(false);
    }
  };

  const performSearch = async (query: string) => {
    setSearching(true);
    setError(null);
    setEmails([]);
    setNextPageToken(null);
    setHasMore(false);

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const params = new URLSearchParams({
        maxResults: '50',
        query: query,
      });

      const response = await fetch(
        `${baseURL}/api/workspace/connections/${connectionId}/gmail/emails?${params.toString()}`,
        {
          credentials: 'include',
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to search emails: ${response.status}`);
      }

      const data = await response.json();
      setEmails(data.emails || []);
      setNextPageToken(data.nextPageToken || null);
      setHasMore(!!data.nextPageToken);
    } catch (err: any) {
      console.error('[GmailItemsModal] Error searching emails:', err);
      setError(err.message || 'Failed to search emails');
    } finally {
      setSearching(false);
    }
  };

  const fetchEmailContent = async (emailId: string, threadId: string) => {
    // Check if already fetched
    if (emailContents.has(emailId)) {
      return emailContents.get(emailId)!;
    }

    // Mark as loading
    setLoadingContent(prev => new Set(prev).add(emailId));

    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const threadCount = getThreadMessageCount(threadId);
      const isThread = threadCount > 1;

      let content: string;

      if (isThread) {
        // Fetch the full thread
        const response = await fetch(`${baseURL}/api/workspace/connections/${connectionId}/gmail/thread/${threadId}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch thread: ${response.status}`);
        }

        const data = await response.json();
        content = data.threadContent || 'No content available';
      } else {
        // Fetch single email with full content
        const response = await fetch(`${baseURL}/api/workspace/connections/${connectionId}/gmail/email/${emailId}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch email: ${response.status}`);
        }

        const data = await response.json();
        // The response structure is { email: { body, snippet, ... } }
        content = data.email?.body || data.email?.snippet || 'No content available';
      }

      // Store in cache
      setEmailContents(prev => new Map(prev).set(emailId, content));
      return content;
    } catch (err: any) {
      console.error('[GmailItemsModal] Error fetching email content:', err);
      const errorContent = `Failed to load content: ${err.message}`;
      setEmailContents(prev => new Map(prev).set(emailId, errorContent));
      return errorContent;
    } finally {
      setLoadingContent(prev => {
        const next = new Set(prev);
        next.delete(emailId);
        return next;
      });
    }
  };

  const toggleEmailExpansion = async (emailId: string, threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (expandedEmailId === emailId) {
      // Collapse
      setExpandedEmailId(null);
    } else {
      // Expand and fetch content if needed
      setExpandedEmailId(emailId);
      if (!emailContents.has(emailId)) {
        await fetchEmailContent(emailId, threadId);
      }
    }
  };

  const toggleEmailSelection = (emailId: string) => {
    setSelectedEmailIds(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedEmailIds.size === emails.length) {
      setSelectedEmailIds(new Set());
    } else {
      setSelectedEmailIds(new Set(emails.map(e => e.id)));
    }
  };

  const handleAddSelected = () => {
    const selectedEmails = emails.filter(email => selectedEmailIds.has(email.id));

    // Group by threadId to identify threads
    const threadGroups = new Map<string, GmailEmail[]>();
    selectedEmails.forEach(email => {
      if (!threadGroups.has(email.threadId)) {
        threadGroups.set(email.threadId, []);
      }
      threadGroups.get(email.threadId)!.push(email);
    });

    // Pass selected emails with thread information
    const emailsWithThreadInfo = selectedEmails.map(email => ({
      ...email,
      isPartOfThread:
        threadGroups.get(email.threadId)!.length > 1 || emails.filter(e => e.threadId === email.threadId).length > 1,
      threadMessageCount: emails.filter(e => e.threadId === email.threadId).length,
    }));

    onSelect(emailsWithThreadInfo);
    setSelectedEmailIds(new Set());
    onClose();
  };

  // Count messages in each thread
  const getThreadMessageCount = (threadId: string): number => emails.filter(e => e.threadId === threadId).length;

  // Format date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
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
      return dateString;
    }
  };

  // Extract sender name from "Name <email@domain.com>" format
  const extractSenderName = (from: string) => {
    const match = from.match(/^(.+?)\s*<.+>$/);
    return match ? match[1].replace(/"/g, '').trim() : from;
  };

  // Check if content is HTML
  const isHTML = (str: string) => {
    const htmlPattern = /<\/?[a-z][\s\S]*>/i;
    return htmlPattern.test(str);
  };

  // Sanitize HTML content
  const sanitizeHTML = (html: string) =>
    DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'ul',
        'ol',
        'li',
        'a',
        'img',
        'div',
        'span',
        'blockquote',
        'pre',
        'code',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'hr',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'style', 'target'],
      ALLOW_DATA_ATTR: false,
    });

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
              Select Gmail Emails
            </h2>
            <button
              onClick={onClose}
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

          {/* Content Header */}
          <div className={cn('border-b px-4 pt-2 pb-1.5', isLight ? 'border-gray-200' : 'border-gray-700')}>
            {/* Search Bar with Select All */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search Gmail (subject:report, from:john, etc)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={cn(
                    'w-full rounded-md px-3 py-1.5 text-[12px] transition-colors outline-none',
                    isLight
                      ? 'bg-gray-100 text-gray-700 placeholder-gray-400 focus:bg-gray-100'
                      : 'bg-gray-800/60 text-[#bcc1c7] placeholder-gray-500 focus:bg-gray-800',
                  )}
                />
                {searching && (
                  <div className="absolute top-1/2 right-2 -translate-y-1/2">
                    <svg
                      className={cn('h-4 w-4 animate-spin', isLight ? 'text-gray-400' : 'text-gray-500')}
                      fill="none"
                      viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </div>

              {/* Select All Button */}
              {emails.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors',
                    isLight ? 'text-gray-700' : 'text-[#bcc1c7]',
                  )}>
                  <div
                    className={cn(
                      'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
                      selectedEmailIds.size === emails.length && emails.length > 0
                        ? 'bg-blue-600/60 opacity-100'
                        : cn('border opacity-100', isLight ? 'border-gray-400' : 'border-gray-500'),
                    )}>
                    {selectedEmailIds.size === emails.length && emails.length > 0 && (
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
            <div className="h-full overflow-y-auto pr-2 pb-4" style={{ maxHeight: 'calc(85vh - 200px)' }}>
              {loading || searching ? (
                <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  {searching ? 'Searching emails...' : 'Loading emails...'}
                </div>
              ) : error ? (
                <div className="py-8 text-center">
                  <div className={cn('mb-2 text-sm', isLight ? 'text-red-600' : 'text-red-400')}>{error}</div>
                  <button
                    onClick={() => fetchEmails()}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs transition-colors',
                      isLight
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                    )}>
                    Retry
                  </button>
                </div>
              ) : emails.length === 0 ? (
                <div className={cn('py-8 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  {searchQuery ? 'No emails match your search' : 'No emails found'}
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Email List */}
                  {emails.map(email => {
                    const isSelected = selectedEmailIds.has(email.id);
                    const hasUnread = email.labelIds?.includes('UNREAD');
                    const threadCount = getThreadMessageCount(email.threadId);
                    const isThread = threadCount > 1;
                    const isExpanded = expandedEmailId === email.id;
                    const isLoadingContent = loadingContent.has(email.id);
                    const content = emailContents.get(email.id);

                    return (
                      <div
                        key={email.id}
                        className={cn(
                          'rounded-md border transition-colors',
                          isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-gray-800/50',
                        )}>
                        {/* Email Header */}
                        <div
                          onClick={() => toggleEmailSelection(email.id)}
                          className={cn(
                            'group flex cursor-pointer items-start rounded-md px-3 py-1.5 transition-colors',
                            isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-800/70',
                          )}>
                          {/* Expand/Collapse Chevron - Left Side */}
                          <button
                            onClick={e => toggleEmailExpansion(email.id, email.threadId, e)}
                            className={cn(
                              'mt-0.5 mr-2 flex-shrink-0 rounded p-0.5 transition-colors',
                              isLight ? 'hover:bg-gray-200' : 'hover:bg-gray-700',
                            )}
                            title={isExpanded ? 'Collapse' : 'Expand to view content'}>
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
                                ? 'bg-blue-600/60 opacity-100'
                                : cn('border opacity-100', isLight ? 'border-gray-400' : 'border-gray-500'),
                            )}
                            onClick={e => {
                              e.stopPropagation();
                              toggleEmailSelection(email.id);
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
                              <span
                                className={cn(
                                  'truncate text-[12px]',
                                  hasUnread ? 'font-semibold' : 'font-medium',
                                  isLight ? 'text-gray-900' : 'text-gray-100',
                                )}>
                                {extractSenderName(email.from)}
                              </span>
                              <span
                                className={cn(
                                  'flex-shrink-0 text-[12px]',
                                  isLight ? 'text-gray-500' : 'text-gray-400',
                                )}>
                                {formatDate(email.date)}
                              </span>
                            </div>
                            <div className="mb-0.5 flex items-center gap-2">
                              <div
                                className={cn(
                                  'flex-1 truncate text-[12px]',
                                  hasUnread ? 'font-medium' : '',
                                  isLight ? 'text-gray-800' : 'text-gray-200',
                                )}>
                                {email.subject || '(No Subject)'}
                              </div>
                              {isThread && (
                                <span
                                  className={cn(
                                    'inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 text-[12px]',
                                    isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/40 text-blue-300',
                                  )}
                                  title={`This email is part of a thread with ${threadCount} messages. All messages in the thread will be attached.`}>
                                  <span className="text-[12px] font-medium">{threadCount}</span>
                                </span>
                              )}
                            </div>
                            <div className={cn('truncate text-[12px]', isLight ? 'text-gray-600' : 'text-gray-400')}>
                              {email.snippet}
                            </div>
                          </div>
                        </div>

                        {/* Email Content Accordion */}
                        {isExpanded && (
                          <div
                            className={cn(
                              'border-t px-3 pt-1 pb-2',
                              isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-gray-900/30',
                            )}>
                            {isLoadingContent ? (
                              <div
                                className={cn(
                                  'py-4 text-center text-[12px]',
                                  isLight ? 'text-gray-500' : 'text-gray-400',
                                )}>
                                <svg
                                  className={cn(
                                    'mx-auto mb-2 h-4 w-4 animate-spin',
                                    isLight ? 'text-gray-400' : 'text-gray-500',
                                  )}
                                  fill="none"
                                  viewBox="0 0 24 24">
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Loading {isThread ? 'thread' : 'email'} content...
                              </div>
                            ) : content ? (
                              isHTML(content) ? (
                                // Render HTML content
                                <div
                                  className={cn(
                                    'prose prose-sm max-h-96 max-w-none overflow-y-auto rounded p-3 text-[12px] break-words',
                                    isLight
                                      ? 'prose-gray bg-white text-gray-800'
                                      : 'prose-invert bg-gray-800 text-gray-300',
                                  )}
                                  dangerouslySetInnerHTML={{ __html: sanitizeHTML(content) }}
                                  style={{
                                    lineHeight: '1.6',
                                  }}
                                />
                              ) : (
                                // Render plain text content
                                <div
                                  className={cn(
                                    'max-h-96 overflow-y-auto rounded p-3 text-[12px] break-words whitespace-pre-wrap',
                                    isLight ? 'bg-white text-gray-800' : 'bg-gray-800 text-gray-300',
                                  )}
                                  style={{
                                    fontFamily: 'monospace',
                                    lineHeight: '1.6',
                                  }}>
                                  {content}
                                </div>
                              )
                            ) : (
                              <div
                                className={cn(
                                  'py-4 text-center text-[12px]',
                                  isLight ? 'text-gray-500' : 'text-gray-400',
                                )}>
                                No content available
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Load More Button */}
                  {hasMore && !loading && !searching && (
                    <div className="mt-4 pt-2 text-center">
                      <button
                        onClick={loadMoreEmails}
                        disabled={loadingMore}
                        className={cn(
                          'rounded-md px-4 py-2 text-[12px] font-medium transition-colors',
                          loadingMore
                            ? 'cursor-not-allowed bg-gray-400 text-gray-600 opacity-50'
                            : isLight
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : 'bg-blue-900/40 text-blue-300 hover:bg-blue-900/60',
                        )}>
                        {loadingMore ? 'Loading...' : 'Load More Emails'}
                      </button>
                    </div>
                  )}
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
              {selectedEmailIds.size} email(s) selected
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
                disabled={selectedEmailIds.size === 0}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
                  selectedEmailIds.size === 0
                    ? 'cursor-not-allowed bg-gray-400 text-gray-600 opacity-50'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                )}>
                Add {selectedEmailIds.size > 0 && `(${selectedEmailIds.size})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
