/**
 * PagesSelector Component
 * 
 * Multi-select dropdown for choosing which indexed pages should be included
 * in the agent's context via useCopilotReadable.
 * 
 * Displays all indexed pages with metadata (title, chunk counts, last indexed time)
 * and allows users to select multiple pages to share with the agent.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@extension/ui';
import { embeddingsStorage, debug } from '@extension/shared';

// Simple module-level cache - no complex TTL, just stores last fetched pages
let cachedPages: IndexedPage[] | null = null;
let lastFetchedCount = 0; // Track page count to detect new embeddings

interface IndexedPage {
  pageURL: string;
  pageTitle: string;
  htmlChunkCount: number;
  formChunkCount: number;
  clickableChunkCount: number;
  lastIndexed: Date;
  sessionId?: string;
}

interface PagesSelectorProps {
  isLight: boolean;
  selectedPageURLs: string[];
  currentPageURL: string | null;
  sessionId?: string;
  onPagesChange: (pageURLs: string[]) => void;
  isLoadingSession?: boolean;
  variant?: 'compact' | 'default'; // compact = input controls, default = selector bar
}

export const PagesSelector: React.FC<PagesSelectorProps> = ({
  isLight,
  selectedPageURLs,
  currentPageURL,
  sessionId,
  onPagesChange,
  isLoadingSession = false,
  variant = 'default',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // Initialize from cache if available
  const [pages, setPages] = useState<IndexedPage[]>(() => cachedPages || []);
  // Show loading if no cache exists
  const [loading, setLoading] = useState(() => !cachedPages);
  const [deletingPages, setDeletingPages] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Create or get portal container (same pattern as DropdownMenu)
  useEffect(() => {
    let container = document.getElementById('pages-selector-portal');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pages-selector-portal';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '99999';
      document.body.appendChild(container);
    }
    setPortalContainer(container);
  }, []);

  // Check if text is truncated
  useEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        const isOverflowing = textRef.current.scrollWidth > textRef.current.clientWidth;
        setIsTruncated(isOverflowing);
      }
    };

    checkTruncation();
    
    // Re-check on resize
    const resizeObserver = new ResizeObserver(checkTruncation);
    if (textRef.current) {
      resizeObserver.observe(textRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [selectedPageURLs, pages]);

  // Simple fetch function - called on mount and when dropdown opens
  const fetchPages = useCallback(async () => {
    try {
      const result = await embeddingsStorage.getAllIndexedPages({
        limit: 50,
        includeEmpty: false,
      });
      
      // Always update cache and state
      cachedPages = result;
      lastFetchedCount = result.length;
      setPages(result);
      debug.log(`[PagesSelector] Fetched ${result.length} indexed pages`);
    } catch (error) {
      debug.error('[PagesSelector] Failed to load indexed pages:', error);
      // Don't clear pages on error - keep showing cached data
    } finally {
        setLoading(false);
    }
  }, []);

  // Fetch on mount - always fetch, don't skip
  useEffect(() => {
    fetchPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Refresh when dropdown opens (background refresh)
  useEffect(() => {
    if (isOpen) {
      fetchPages();
      // Focus search input when dropdown opens
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 10);
    } else {
      // Clear search when dropdown closes
      setSearchQuery('');
    }
  }, [isOpen, fetchPages]);

  // Update dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.top,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Check if clicking inside dropdown using data attribute (more reliable than refs for portals)
      if (target.closest('[data-pages-selector-dropdown]')) {
        return; // Don't close - clicking inside dropdown
      }
      
      // Check if clicking on trigger button
      if (target.closest('[data-pages-selector-trigger]')) {
        return; // Don't close - clicking on trigger (it will toggle)
      }
      
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    // Use 'click' instead of 'mousedown' to avoid race conditions
    // and add delay to ensure dropdown is rendered
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
      document.addEventListener('keydown', handleEscape);
    }, 10);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Handle page toggle
  const handleTogglePage = useCallback((pageURL: string) => {
    const newSelection = selectedPageURLs.includes(pageURL)
      ? selectedPageURLs.filter(url => url !== pageURL)
      : [...selectedPageURLs, pageURL];
    onPagesChange(newSelection);
  }, [selectedPageURLs, onPagesChange]);

  // Handle page deletion
  const handleDeletePage = useCallback(async (pageURL: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent toggle
    
    // Don't allow deleting current page
    if (pageURL === currentPageURL) {
      debug.warn('[PagesSelector] Cannot delete current page');
      return;
    }
    
    // Mark as deleting
    setDeletingPages(prev => new Set(prev).add(pageURL));
    
    try {
      debug.log('[PagesSelector] Deleting page embeddings:', pageURL);
      const result = await embeddingsStorage.deletePageEmbeddings(pageURL);
      
      if (result.deleted) {
        // Remove from pages list
        setPages(prev => prev.filter(p => p.pageURL !== pageURL));
        
        // Remove from selection if selected
        if (selectedPageURLs.includes(pageURL)) {
          onPagesChange(selectedPageURLs.filter(url => url !== pageURL));
        }
        
        debug.log('[PagesSelector] Successfully deleted page:', pageURL, result.counts);
      }
    } catch (error) {
      debug.error('[PagesSelector] Failed to delete page:', error);
    } finally {
      setDeletingPages(prev => {
        const next = new Set(prev);
        next.delete(pageURL);
        return next;
      });
    }
  }, [currentPageURL, selectedPageURLs, onPagesChange]);

  // Get domain from URL - defined before filteredPages which uses it
  const getDomain = useCallback((url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }, []);

  // Filter pages by search query
  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return pages;
    const query = searchQuery.toLowerCase().trim();
    return pages.filter(page => 
      page.pageTitle.toLowerCase().includes(query) ||
      page.pageURL.toLowerCase().includes(query) ||
      getDomain(page.pageURL).toLowerCase().includes(query)
    );
  }, [pages, searchQuery, getDomain]);

  // Handle select all (filtered)
  const handleSelectAll = useCallback(() => {
    const filteredURLs = filteredPages.map(p => p.pageURL);
    const allFilteredSelected = filteredURLs.every(url => selectedPageURLs.includes(url));
    
    if (allFilteredSelected) {
      // Deselect all filtered except current page
      const newSelection = selectedPageURLs.filter(url => !filteredURLs.includes(url));
      onPagesChange(currentPageURL && !filteredURLs.includes(currentPageURL) ? [...newSelection, currentPageURL] : newSelection);
    } else {
      // Select all filtered
      const newSelection = Array.from(new Set([...selectedPageURLs, ...filteredURLs]));
      onPagesChange(newSelection);
    }
  }, [filteredPages, selectedPageURLs, currentPageURL, onPagesChange]);

  // Display text
  const displayText = useMemo(() => {
    if (loading) return 'Loading pages...';
    if (pages.length === 0) return 'No pages indexed';
    if (selectedPageURLs.length === 0) return 'No pages selected';
    if (selectedPageURLs.length === 1) return '1 page selected';
    return `${selectedPageURLs.length} pages selected`;
  }, [loading, pages.length, selectedPageURLs.length]);

  // Format relative time - matches session timestamp format
  const formatRelativeTime = (date: Date | string | number): string => {
    try {
      // Handle string dates that might be in ISO format
      let dateObj: Date;
      if (date instanceof Date) {
        dateObj = date;
      } else if (typeof date === 'string') {
        dateObj = new Date(date);
      } else {
        dateObj = new Date(date);
      }
      
      // Check if date is valid
      if (isNaN(dateObj.getTime())) {
        return 'Recently';
      }
      
      const now = new Date();
      const diff = now.getTime() - dateObj.getTime();
      
      // Handle future dates
      if (diff < 0) {
        return 'Just now';
      }
      
      const seconds = Math.floor(diff / 1000);
      
      if (seconds < 60) return `${seconds}s ago`;
      
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      
      const weeks = Math.floor(days / 7);
      if (weeks < 5) return `${weeks}w ago`;
      
      const months = Math.floor(days / 30);
      if (months < 12) return `${months}mo ago`;
      
      const years = Math.floor(days / 365);
      return `${years}y ago`;
    } catch (error) {
      return 'Recently';
    }
  };

  const allFilteredSelected = filteredPages.length > 0 && filteredPages.every(p => selectedPageURLs.includes(p.pageURL));

  const isCompact = variant === 'compact';

  return (
    <div className="relative">
      {/* Selector Button */}
      <button
        ref={buttonRef}
        type="button"
        data-pages-selector-trigger
        onClick={() => !loading && setIsOpen(!isOpen)}
        disabled={loading || isLoadingSession}
        title={isTruncated ? displayText : undefined}
        className={cn(
          'flex items-center gap-1.5 rounded-xl h-[22px] transition-all mt-[3px]',
          isCompact
            ? 'min-w-0 px-2 py-1 ml-1.5 text-[12px] leading-tight'
            : 'min-w-[120px] max-w-[200px] px-0 pt-[3px] border text-xs',
          isLoadingSession
            ? 'cursor-wait opacity-70'
            : loading
            ? 'cursor-wait opacity-70 animate-pulse'
            : 'cursor-pointer',
          isCompact
            ? isLight
              ? 'text-gray-500 bg-gray-200/60 hover:bg-gray-200/80'
              : 'text-gray-500 bg-gray-700/40 hover:bg-gray-700/60'
            : isLight
            ? 'border-gray-300 bg-gray-100 text-gray-600 hover:border-gray-400 hover:bg-gray-200'
            : 'border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500 hover:bg-gray-700',
        )}>
        {!isCompact && (
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
            className="flex-shrink-0">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}

        <span className={cn('truncate relative overflow-hidden', isCompact ? 'flex-1 min-w-0' : 'flex-1 text-left')}>
          <span ref={textRef} className="block truncate">
            {displayText}
          </span>
          {isTruncated && isCompact && (
            <span 
              className={cn(
                'absolute right-0 top-0 bottom-0 w-8 pointer-events-none',
                isLight
                  ? 'bg-gradient-to-l from-white via-white/80 to-transparent'
                  : 'bg-gradient-to-l from-[#151C24] via-[#151C24]/80 to-transparent'
              )}
            />
          )}
        </span>

        <svg
          className={cn('flex-shrink-0 transition-transform', isOpen && 'rotate-180')}
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown - Rendered via portal with fixed positioning */}
      {isOpen && dropdownPosition && portalContainer && createPortal(
          <div
            ref={dropdownRef}
            data-pages-selector-dropdown
            style={{
              position: 'fixed',
              top: dropdownPosition.top - 8,
              left: dropdownPosition.left,
              transform: 'translateY(-100%)',
              minWidth: Math.max(dropdownPosition.width, 300),
              maxWidth: 400,
              pointerEvents: 'auto',
            }}
            className={cn(
              'max-h-[400px] rounded-md border shadow-lg flex flex-col',
              isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
            )}>
          {/* Header with Search and Select All */}
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 border-b rounded-t-md',
            isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]',
          )}>
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className={cn(
                'absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5',
                isLight ? 'text-gray-400' : 'text-gray-500'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="Search pages..."
              className={cn(
                'w-full pl-7 pr-2 py-1 text-xs rounded border outline-none focus:ring-2 focus:ring-blue-500',
                isLight
                  ? 'bg-gray-50 border-gray-300 text-gray-700 placeholder-gray-400'
                  : 'bg-[#0D1117] border-gray-600 text-[#bcc1c7] placeholder-gray-500'
              )}
            />
          </div>

          {/* Select All with Checkbox */}
          {filteredPages.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAll}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 text-xs font-medium transition-colors rounded whitespace-nowrap',
                isLight
                  ? 'text-gray-700 hover:bg-gray-200'
                  : 'text-gray-200 hover:bg-gray-700'
              )}
            >
              <div className={cn(
                'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                allFilteredSelected
                  ? 'bg-blue-600 border-blue-600'
                  : isLight
                    ? 'border-gray-400'
                    : 'border-gray-500'
              )}>
                {allFilteredSelected && (
                  <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span>All ({filteredPages.length})</span>
            </button>
          )}
        </div>

        {/* Pages List */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                Loading pages...
              </div>
            </div>
          ) : pages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 px-4">
              <svg
                className={cn('h-8 w-8 mb-2', isLight ? 'text-gray-400' : 'text-gray-600')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <div className={cn('text-xs text-center', isLight ? 'text-gray-500' : 'text-gray-400')}>
                No pages indexed yet
              </div>
              <div className={cn('text-[10px] text-center mt-1', isLight ? 'text-gray-400' : 'text-gray-500')}>
                Navigate to pages to index them
              </div>
            </div>
          ) : filteredPages.length === 0 ? (
            <div className={cn('px-3 py-4 text-xs text-center', isLight ? 'text-gray-500' : 'text-gray-400')}>
              No pages match your search
            </div>
          ) : (
            filteredPages.map(page => {
              const isSelected = selectedPageURLs.includes(page.pageURL);
              const isCurrent = page.pageURL === currentPageURL;
              const isDeleting = deletingPages.has(page.pageURL);
              const totalChunks = page.htmlChunkCount + page.formChunkCount + page.clickableChunkCount;

              return (
                <button
                  type="button"
                  key={page.pageURL}
                  onClick={() => !isDeleting && handleTogglePage(page.pageURL)}
                  disabled={isDeleting}
                  className={cn(
                    'flex w-full items-center px-2.5 py-1 text-xs transition-colors border-b gap-2 group text-left',
                    isLight ? 'border-gray-100' : 'border-gray-700/50',
                    isDeleting && 'opacity-50 pointer-events-none',
                    isSelected
                      ? isLight
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-blue-900/30 text-blue-300'
                      : isLight
                      ? 'text-gray-500 hover:bg-gray-100'
                      : 'text-gray-400 hover:bg-gray-700/50',
                  )}>
                  <div className="flex-1 min-w-0 flex flex-col text-left">
                    <div className="font-medium truncate leading-tight">
                      {isCurrent && (
                        <span
                          className={cn(
                            'text-[9px] font-semibold px-1 py-0.5 rounded mr-1.5',
                            isLight ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400',
                          )}>
                          CURRENT
                        </span>
                      )}
                      <span className="truncate">{page.pageTitle}</span>
                    </div>
                    <div className={cn('text-[10px] truncate leading-tight', isLight ? 'text-gray-500' : 'text-gray-500')}>
                      {getDomain(page.pageURL)} • {totalChunks} chunks • {formatRelativeTime(page.lastIndexed)}
                    </div>
                  </div>
                  
                  {/* Delete button - hidden for current page, turns red on hover (color only, no bg) */}
                  {!isCurrent && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleDeletePage(page.pageURL, e); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleDeletePage(page.pageURL, e as any); } }}
                      title="Delete indexed page"
                      className={cn(
                        'flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-all cursor-pointer',
                        isLight 
                          ? 'text-gray-400 hover:text-red-600' 
                          : 'text-gray-500 hover:text-red-400',
                      )}>
                      {isDeleting ? (
                        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </span>
                  )}
                  
                  {/* Checkbox - only show on hover or when selected */}
                  <div className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-opacity',
                    isSelected
                      ? 'bg-blue-600 border-blue-600 opacity-100'
                      : cn(
                          'opacity-0 group-hover:opacity-100',
                          isLight ? 'border-gray-400' : 'border-gray-500'
                        )
                  )}>
                    {isSelected && (
                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>,
      portalContainer
      )}
    </div>
  );
};

