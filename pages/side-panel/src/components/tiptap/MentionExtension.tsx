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
  type?: 'user' | 'agent' | 'file' | 'variable' | 'page' | 'plan' | 'graph' | 'note' | 'credential' | 'workspace_file';
  pageURL?: string; // For page mentions
  planId?: string; // For plan mentions
  graphId?: string; // For graph mentions
  noteId?: string; // For note mentions
  credentialId?: string; // For credential mentions
  workspaceFileId?: string; // For workspace file mentions
}

interface MentionListProps {
  items: MentionSuggestion[];
  command: (item: MentionSuggestion) => void;
  query?: string; // The current query string from the editor
  selectedPageURLs?: string[]; // Filter to only show these pages
  agentState?: { // Plans and graphs from agent state
    plans?: Record<string, any>;
    graphs?: Record<string, any>;
  };
  selectedNotes?: any[]; // Selected workspace notes
  selectedCredentials?: any[]; // Selected workspace credentials
  selectedFiles?: any[]; // Selected workspace files
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>((props, ref) => {
  const { isLight } = useStorage(themeStorage);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState(props.query || '');
  const [pages, setPages] = useState<Array<{ pageURL: string; pageTitle: string }>>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<any[]>([]);
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

  // Fetch workspace files on mount
  useEffect(() => {
    const fetchWorkspaceFiles = async () => {
      try {
        const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const response = await fetch(`${baseURL}/api/workspace/files?limit=1000`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          const files = data.files || [];
          console.log('[MentionList] Loaded workspace files:', files.length);
          setWorkspaceFiles(files);
        } else {
          console.error('[MentionList] Failed to fetch workspace files:', response.status);
        }
      } catch (error) {
        console.error('[MentionList] Error fetching workspace files:', error);
      }
    };
    fetchWorkspaceFiles();
  }, []);

  // Convert pages to mention suggestions, filtered by selectedPageURLs if provided
  const pageSuggestions: MentionSuggestion[] = useMemo(() => {
    const allPages = pages.map(page => ({
      id: `page-${page.pageURL}`,
      label: page.pageTitle,
      type: 'page' as const,
      pageURL: page.pageURL,
    }));
    
    // If selectedPageURLs is provided (even if empty), only show selected pages
    if (props.selectedPageURLs !== undefined) {
      // If empty array, show no pages (user hasn't selected any)
      if (props.selectedPageURLs.length === 0) {
        return [];
      }
      // Otherwise filter to only show selected pages
      return allPages.filter(page => 
        page.pageURL && props.selectedPageURLs!.includes(page.pageURL)
      );
    }
    
    // Fallback: if selectedPageURLs not provided at all, show all pages
    return allPages;
  }, [pages, props.selectedPageURLs]);

  // Convert plans to mention suggestions
  const planSuggestions: MentionSuggestion[] = useMemo(() => {
    if (!props.agentState?.plans) return [];
    
    return Object.entries(props.agentState.plans).map(([planId, plan]) => ({
      id: `plan-${planId}`,
      label: plan.name || `Plan ${planId.slice(0, 8)}`,
      type: 'plan' as const,
      planId,
    }));
  }, [props.agentState?.plans]);

  // Convert graphs to mention suggestions
  const graphSuggestions: MentionSuggestion[] = useMemo(() => {
    if (!props.agentState?.graphs) return [];
    
    return Object.entries(props.agentState.graphs).map(([graphId, graph]) => ({
      id: `graph-${graphId}`,
      label: graph.name || `Graph ${graphId.slice(0, 8)}`,
      type: 'graph' as const,
      graphId,
    }));
  }, [props.agentState?.graphs]);

  // Convert notes to mention suggestions
  const noteSuggestions: MentionSuggestion[] = useMemo(() => {
    console.log('[MentionList] Computing noteSuggestions from:', props.selectedNotes);
    if (!props.selectedNotes || props.selectedNotes.length === 0) return [];
    
    return props.selectedNotes.map(note => ({
      id: `note-${note.id}`,
      label: note.title,
      type: 'note' as const,
      noteId: note.id,
    }));
  }, [props.selectedNotes]);

  // Convert credentials to mention suggestions
  const credentialSuggestions: MentionSuggestion[] = useMemo(() => {
    console.log('[MentionList] Computing credentialSuggestions from:', props.selectedCredentials);
    if (!props.selectedCredentials || props.selectedCredentials.length === 0) return [];
    
    return props.selectedCredentials.map(cred => ({
      id: `credential-${cred.id}`,
      label: cred.name,
      type: 'credential' as const,
      credentialId: cred.id,
    }));
  }, [props.selectedCredentials]);

  // Convert workspace files to mention suggestions
  // Use props.selectedFiles if provided (explicitly selected), otherwise use all loaded files
  const fileSuggestions: MentionSuggestion[] = useMemo(() => {
    const filesToUse = props.selectedFiles && props.selectedFiles.length > 0 
      ? props.selectedFiles 
      : workspaceFiles;
    
    console.log('[MentionList] Computing fileSuggestions:', {
      fromProps: props.selectedFiles?.length || 0,
      fromLoaded: workspaceFiles.length,
      using: filesToUse.length,
    });
    
    if (!filesToUse || filesToUse.length === 0) return [];
    
    return filesToUse.map(file => ({
      id: `workspace_file-${file.id}`,
      label: file.file_name,
      type: 'workspace_file' as const,
      workspaceFileId: file.id,
    }));
  }, [props.selectedFiles, workspaceFiles]);

  // Combine all suggestions: pages, plans, graphs, notes, credentials, and workspace files
  const allSuggestions = useMemo(() => {
    return [...pageSuggestions, ...planSuggestions, ...graphSuggestions, ...noteSuggestions, ...credentialSuggestions, ...fileSuggestions];
  }, [pageSuggestions, planSuggestions, graphSuggestions, noteSuggestions, credentialSuggestions, fileSuggestions]);

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

  // Update search query when props.query changes (from editor typing)
  useEffect(() => {
    if (props.query !== undefined) {
      setSearchQuery(props.query);
    }
  }, [props.query]);

  // Note: We don't auto-focus the search input to keep focus in the editor
  // This allows users to continue typing after @ without losing focus
  // Users can still manually click the search input if they want to type there

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
      case 'plan':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <path d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            <path d="M9 14l2 2 4-4" />
          </svg>
        );
      case 'graph':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        );
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
      case 'note':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'credential':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        );
      case 'workspace_file':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
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
            placeholder="Search pages, plans, notes, files..."
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
                {item.type === 'plan' && item.planId && props.agentState?.plans?.[item.planId] && (
                  <span className={cn('text-[10px] truncate w-full', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    {props.agentState.plans[item.planId].steps?.length || 0} steps
                  </span>
                )}
                {item.type === 'graph' && item.graphId && props.agentState?.graphs?.[item.graphId] && (
                  <span className={cn('text-[10px] truncate w-full', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    Status: {props.agentState.graphs[item.graphId].status || 'unknown'}
                  </span>
                )}
                {item.type === 'note' && item.noteId && props.selectedNotes && (
                  <span className={cn('text-[10px] truncate w-full', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    {props.selectedNotes.find(n => n.id === item.noteId)?.folder || 'Workspace note'}
                  </span>
                )}
                {item.type === 'credential' && item.credentialId && props.selectedCredentials && (
                  <span className={cn('text-[10px] truncate w-full', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    {props.selectedCredentials.find(c => c.id === item.credentialId)?.type || 'Credential'}
                  </span>
                )}
                {item.type === 'workspace_file' && item.workspaceFileId && (
                  <span className={cn('text-[10px] truncate w-full', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    {(() => {
                      // Try to find file in props.selectedFiles first, then workspaceFiles
                      const file = (props.selectedFiles && props.selectedFiles.find(f => f.id === item.workspaceFileId)) ||
                                   workspaceFiles.find(f => f.id === item.workspaceFileId);
                      if (!file) return 'Workspace file';
                      // Show folder path, or "Root" if no folder
                      const folder = file.folder;
                      if (!folder || folder === 'root' || folder === '') return 'Root';
                      return folder;
                    })()}
                  </span>
                )}
              </div>
            </button>
          ))
        ) : (
          <div className={cn('mention-empty text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {searchQuery.trim() 
              ? 'No matches found' 
              : (props.selectedPageURLs !== undefined && props.selectedPageURLs.length === 0 && 
                 (!props.agentState?.plans || Object.keys(props.agentState.plans).length === 0) &&
                 (!props.agentState?.graphs || Object.keys(props.agentState.graphs).length === 0)
                  ? 'No pages selected and no active plans/graphs. Select pages using the pages button below.'
                  : 'No items available')}
          </div>
        )}
      </div>
    </div>
  );
});

MentionList.displayName = 'MentionList';

export const createMentionSuggestion = (
  suggestions: MentionSuggestion[],
  selectedPageURLsRef?: React.MutableRefObject<string[]>,
  agentStateRef?: React.MutableRefObject<{ plans?: Record<string, any>; graphs?: Record<string, any> } | undefined>,
  selectedNotesRef?: React.MutableRefObject<any[]>,
  selectedCredentialsRef?: React.MutableRefObject<any[]>,
  selectedFilesRef?: React.MutableRefObject<any[]>
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
              selectedPageURLs: selectedPageURLsRef?.current,
              agentState: agentStateRef?.current,
              selectedNotes: selectedNotesRef?.current,
              selectedCredentials: selectedCredentialsRef?.current,
              selectedFiles: selectedFilesRef?.current,
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
            selectedPageURLs: selectedPageURLsRef?.current,
            agentState: agentStateRef?.current,
            selectedNotes: selectedNotesRef?.current,
            selectedCredentials: selectedCredentialsRef?.current,
            selectedFiles: selectedFilesRef?.current,
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

