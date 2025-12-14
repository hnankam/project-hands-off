import React, { forwardRef, useEffect, useImperativeHandle, useState, useMemo, useRef } from 'react';
import { ReactRenderer } from '@tiptap/react';
import { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import { embeddingsStorage } from '@extension/shared';
import { cn } from '@extension/ui';

export interface MentionSuggestion {
  id: string;
  label: string;
  avatar?: string;
  type?: 'user' | 'agent' | 'file' | 'variable' | 'page';
  pageURL?: string; // For page mentions
}

interface MentionListProps {
  items: MentionSuggestion[];
  command: (item: MentionSuggestion) => void;
  query?: string; // The current query string from the editor
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>((props, ref) => {
  const { isLight } = useStorage(themeStorage);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState(props.query || '');
  const [pages, setPages] = useState<Array<{ pageURL: string; pageTitle: string }>>([]);
  const [loading, setLoading] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch embedded pages on mount
  useEffect(() => {
    const fetchPages = async () => {
      try {
        const indexedPages = await embeddingsStorage.getAllIndexedPages({
          limit: 100,
          includeEmpty: false,
        });
        setPages(indexedPages.map(p => ({ pageURL: p.pageURL, pageTitle: p.pageTitle })));
      } catch (error) {
        console.error('[MentionList] Failed to fetch pages:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPages();
  }, []);

  // Convert pages to mention suggestions
  const pageSuggestions: MentionSuggestion[] = useMemo(() => {
    return pages.map(page => ({
      id: `page-${page.pageURL}`,
      label: page.pageTitle,
      type: 'page' as const,
      pageURL: page.pageURL,
    }));
  }, [pages]);

  // Only use pages (no static suggestions)
  const allSuggestions = useMemo(() => {
    return pageSuggestions;
  }, [pageSuggestions]);

  // Filter suggestions based on search query
  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) {
      return allSuggestions.slice(0, 20); // Show first 20 when no search
    }
    const query = searchQuery.toLowerCase().trim();
    return allSuggestions.filter(item => 
      item.label.toLowerCase().includes(query) ||
      (item.pageURL && item.pageURL.toLowerCase().includes(query))
    ).slice(0, 20);
  }, [allSuggestions, searchQuery]);

  // Update search query when props.query changes
  useEffect(() => {
    if (props.query !== undefined) {
      setSearchQuery(props.query);
    }
  }, [props.query]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (searchInputRef.current) {
      // Small delay to ensure dropdown is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, []);

  const selectItem = (index: number) => {
    const item = filteredSuggestions[index];
    if (item) {
      console.log('[MentionExtension] Selecting item:', {
        id: item.id,
        label: item.label,
        pageURL: item.pageURL,
        type: item.type,
      });
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + filteredSuggestions.length - 1) % filteredSuggestions.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % filteredSuggestions.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [filteredSuggestions]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      // Don't intercept if user is typing in search input
      if (event.target instanceof HTMLInputElement) {
        return false;
      }
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }
      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }
      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'agent':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
            <path d="M12 6v6l4 2" />
          </svg>
        );
      case 'file':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        );
      case 'page':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        );
      case 'variable':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V4h16v3" />
            <path d="M9 20h6" />
            <path d="M12 4v16" />
          </svg>
        );
      default: // user
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
    }
  };

  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  return (
    <div className="mention-list" style={{ minWidth: '300px', maxWidth: '400px' }}>
      {/* Search Bar */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1 m-1.5 rounded-t-md',
          isLight ? 'bg-white' : 'bg-[#151C24]',
        )}
      >
        <div className="relative flex-1">
          <svg
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5',
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
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0); // Reset selection when search changes
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                downHandler();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                upHandler();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                enterHandler();
              }
            }}
            placeholder="Search pages..."
            className={cn(
              'w-full pl-8 pr-3 py-1.5 text-xs rounded-md outline-none transition-colors',
              isLight
                ? 'bg-gray-100 text-gray-700 placeholder-gray-400 focus:bg-gray-100'
                : 'bg-gray-800/60 text-[#bcc1c7] placeholder-gray-500 focus:bg-gray-800'
            )}
          />
        </div>
      </div>

      {/* Border separator */}
      <div
        className={cn(
          'border-b',
          isLight ? 'border-gray-200' : 'border-gray-700',
        )}
        style={{ marginTop: '0px' }}
      />

      {/* Results List */}
      <div style={{ maxHeight: '300px', overflowY: 'auto', paddingTop: '4px' }}>
        {loading ? (
          <div className={cn('flex items-center justify-center py-6 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            Loading pages...
          </div>
        ) : filteredSuggestions.length > 0 ? (
          filteredSuggestions.map((item, index) => (
            <button
              key={item.id}
              className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => selectItem(index)}
              type="button"
            >
              <span className="mention-icon">{getTypeIcon(item.type)}</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', flex: 1, minWidth: 0 }}>
                <span className="mention-label" style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                {item.pageURL && (
                  <span className={cn('text-[10px] truncate w-full', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    {getDomain(item.pageURL)}
                  </span>
                )}
              </div>
            </button>
          ))
        ) : (
          <div className={cn('mention-empty text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {searchQuery.trim() ? 'No pages found' : 'No pages available'}
          </div>
        )}
      </div>
    </div>
  );
});

MentionList.displayName = 'MentionList';

export const createMentionSuggestion = (
  suggestions: MentionSuggestion[]
): Omit<SuggestionOptions, 'editor'> => {
  return {
    char: '@',
    startOfLine: false,
    items: ({ query }: { query: string }) => {
      // Return all suggestions - filtering will be done in the component
      // This allows the search bar to work independently
      return suggestions;
    },
    render: () => {
      let component: ReactRenderer<MentionListRef, MentionListProps>;
      let popup: TippyInstance[];

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(MentionList, {
            props: {
              ...props,
              query: props.query || '',
            },
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as any,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'top-start',
            animation: false,
            duration: 0,
          });
        },
        onUpdate(props: SuggestionProps) {
          component.updateProps({
            ...props,
            query: props.query || '',
          });

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as any,
          });
        },
        onKeyDown(props: any) {
          if (props.event.key === 'Escape') {
            popup[0].hide();
            return true;
          }
          return component.ref?.onKeyDown(props) ?? false;
        },
        onExit() {
          popup[0].destroy();
          component.destroy();
        },
      };
    },
  };
};

