/**
 * ContextSelector Component
 *
 * Unified multi-select dropdown for:
 * 1. Selecting indexed pages for agent context (via useCopilotReadable)
 * 2. Browsing all open browser tabs grouped by window and tab group
 * 3. Embedding new tabs on-the-fly without leaving the selector
 *
 * Displays indexed pages with metadata and browser tabs with embed capability.
 */

import { embeddingsStorage, debug } from '@extension/shared';
import { cn } from '@extension/ui';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type React from 'react';

// ============================================================================
// TYPES
// ============================================================================

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

interface BrowserTab {
  id: number;
  url: string;
  title: string;
  windowId: number;
  groupId: number; // -1 if ungrouped
  discarded: boolean;
  favIconUrl?: string;
  isCurrentTab?: boolean;
}

interface TabGroup {
  id: number;
  title: string;
  color: string;
  windowId: number;
}

interface BrowserWindow {
  id: number;
  focused: boolean;
  type: string;
}

interface WorkspaceNote {
  id: string;
  title: string;
  preview?: string; // First 200 characters of content (generated)
  content: string; // Full note content
  folder: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface Credential {
  id: string;
  name: string;
  type: string;
  key?: string; // API key identifier (not the secret)
  created_at: string;
  updated_at: string;
}

interface CredentialWithSecret extends Credential {
  password?: string | null; // The decrypted secret/password from encrypted_data column
}

type ViewMode = 'all' | 'indexed' | 'tabs' | 'workspace';
type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';

// Tab group colors from Chrome API
const TAB_GROUP_COLORS: Record<string, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#1e8e3e',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#007b83',
  orange: '#e8710a',
};

interface ContextSelectorProps {
  isLight: boolean;
  selectedPageURLs: string[];
  currentPageURL: string | null;
  sessionId?: string;
  onPagesChange: (pageURLs: string[]) => void;
  isLoadingSession?: boolean;
  variant?: 'compact' | 'default'; // compact = input controls, default = selector bar
  showBrowserTabs?: boolean; // Enable browser tabs integration (default: true)
  // Workspace context
  selectedNoteIds?: string[];
  selectedCredentialIds?: string[];
  onNotesChange?: (noteIds: string[]) => void;
  onCredentialsChange?: (credentialIds: string[]) => void;
  onNotesWithContentChange?: (notes: WorkspaceNote[]) => void; // Callback with full note content
  onCredentialsWithSecretsChange?: (credentials: CredentialWithSecret[]) => void; // Callback with full credential data including secrets
}

export const ContextSelector: React.FC<ContextSelectorProps> = ({
  isLight,
  selectedPageURLs,
  currentPageURL,
  sessionId,
  onPagesChange,
  isLoadingSession = false,
  variant = 'default',
  showBrowserTabs = true,
  selectedNoteIds = [],
  selectedCredentialIds = [],
  onNotesChange,
  onCredentialsChange,
  onNotesWithContentChange,
  onCredentialsWithSecretsChange,
}) => {
  // ============================================================================
  // STATE - Existing
  // ============================================================================
  const [isOpen, setIsOpen] = useState(false);
  const [pages, setPages] = useState<IndexedPage[]>(() => cachedPages || []);
  const [loading, setLoading] = useState(() => !cachedPages);
  const [deletingPages, setDeletingPages] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // ============================================================================
  // STATE - Browser Tabs Integration
  // ============================================================================
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>([]);
  const [tabGroups, setTabGroups] = useState<TabGroup[]>([]);
  const [windows, setWindows] = useState<BrowserWindow[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [expandedWindows, setExpandedWindows] = useState<Set<number>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  // Embedding state
  const [embeddingTabs, setEmbeddingTabs] = useState<Set<number>>(new Set());
  const [embeddingProgress, setEmbeddingProgress] = useState<{ current: number; total: number } | null>(null);
  const [embeddingErrors, setEmbeddingErrors] = useState<Map<number, string>>(new Map());
  const embeddingAbortRef = useRef<AbortController | null>(null);

  // Track newly embedded URLs for immediate UI feedback (before pages refresh)
  const [newlyEmbeddedURLs, setNewlyEmbeddedURLs] = useState<Set<string>>(new Set());

  // ============================================================================
  // STATE - Workspace Items
  // ============================================================================
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  // Protected URL patterns that can't be embedded
  const PROTECTED_PATTERNS = ['chrome://', 'chrome-extension://', 'devtools://', 'about:', 'edge://', 'brave://'];

  // ============================================================================
  // PORTAL SETUP
  // ============================================================================

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

  // ============================================================================
  // TEXT TRUNCATION CHECK
  // ============================================================================

  useEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        const isOverflowing = textRef.current.scrollWidth > textRef.current.clientWidth;
        setIsTruncated(isOverflowing);
      }
    };

    checkTruncation();

    const resizeObserver = new ResizeObserver(checkTruncation);
    if (textRef.current) {
      resizeObserver.observe(textRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [selectedPageURLs, pages]);

  // ============================================================================
  // DATA FETCHING - Indexed Pages
  // ============================================================================

  const fetchPages = useCallback(async () => {
    try {
      const result = await embeddingsStorage.getAllIndexedPages({
        limit: 50,
        includeEmpty: false,
      });

      cachedPages = result;
      lastFetchedCount = result.length;
      setPages(result);
      // Clear newly embedded URLs since they're now in the pages list
      setNewlyEmbeddedURLs(new Set());
      debug.log(`[ContextSelector] Fetched ${result.length} indexed pages`);
    } catch (error) {
      debug.error('[ContextSelector] Failed to load indexed pages:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================================================
  // DATA FETCHING - Browser Tabs
  // ============================================================================

  const fetchBrowserTabs = useCallback(async () => {
    if (!showBrowserTabs) return;

    setLoadingTabs(true);
    try {
      // Get current tab ID for marking
      let currentTabId: number | null = null;
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTabId = activeTab?.id ?? null;
      } catch (e) {
        debug.warn('[ContextSelector] Could not get current tab:', e);
      }

      // Get all windows
      const allWindows = await chrome.windows.getAll();
      setWindows(
        allWindows.map(w => ({
          id: w.id!,
          focused: w.focused ?? false,
          type: w.type ?? 'normal',
        })),
      );

      // Auto-expand focused window
      const focusedWindow = allWindows.find(w => w.focused);
      if (focusedWindow?.id) {
        setExpandedWindows(prev => new Set(prev).add(focusedWindow.id!));
      }

      // Get all tabs
      const allTabs = await chrome.tabs.query({});

      // Filter out protected URLs
      const accessibleTabs = allTabs.filter(tab => tab.url && !PROTECTED_PATTERNS.some(p => tab.url!.startsWith(p)));

      // IMPORTANT: Fetch tab groups BEFORE setting browserTabs
      // This prevents timing issues where organizedTabs runs with empty tabGroups
      let fetchedGroups: TabGroup[] = [];

      if (chrome.tabGroups) {
        try {
          const allGroups = await chrome.tabGroups.query({});

          if (allGroups.length > 0) {
            fetchedGroups = allGroups.map(g => ({
              id: g.id,
              title: g.title || '',
              color: g.color,
              windowId: g.windowId,
            }));
          }
        } catch (e) {
          debug.warn('[ContextSelector] Tab groups API error:', e);
        }
      }

      // Set tab groups FIRST, then browser tabs
      // This ensures groups are available when tabs trigger organizedTabs memo
      setTabGroups(fetchedGroups);
      // Tab groups are collapsed by default - don't auto-expand

      // Now set browser tabs - organizedTabs will have access to groups
      // Check multiple indicators for discarded/suspended tabs:
      // 1. tab.discarded - explicitly discarded by Chrome
      // 2. tab.status === 'unloaded' - content not loaded
      // 3. !tab.active && tab never loaded content (no status 'complete')
      const mappedTabs = accessibleTabs.map(tab => {
        // A tab is considered "discarded" if:
        // - Chrome's discarded property is true, OR
        // - The tab status is 'unloaded' (memory saver feature), OR
        // - The tab is not active and status is not 'complete' or 'loading'
        const isDiscarded =
          tab.discarded === true ||
          tab.status === 'unloaded' ||
          (!tab.active && tab.status !== 'complete' && tab.status !== 'loading');

        return {
          id: tab.id!,
          url: tab.url!,
          title: tab.title || 'Untitled',
          windowId: tab.windowId,
          groupId: tab.groupId ?? -1,
          discarded: isDiscarded,
          favIconUrl: tab.favIconUrl,
          isCurrentTab: tab.id === currentTabId,
        };
      });

      setBrowserTabs(mappedTabs);

      const discardedCount = mappedTabs.filter(t => t.discarded).length;
      debug.log(
        `[ContextSelector] Fetched ${accessibleTabs.length} browser tabs (${discardedCount} discarded)`,
        accessibleTabs.slice(0, 3).map(t => ({ id: t.id, status: t.status, discarded: t.discarded, active: t.active })),
      );
    } catch (error) {
      debug.error('[ContextSelector] Failed to fetch browser tabs:', error);
    } finally {
      setLoadingTabs(false);
    }
  }, [showBrowserTabs]);

  // ============================================================================
  // DATA FETCHING - Workspace Items
  // ============================================================================

  const fetchWorkspaceItems = useCallback(async () => {
    if (!onNotesChange && !onCredentialsChange) return; // Only fetch if handlers are provided

    setLoadingWorkspace(true);
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

      // Fetch notes
      if (onNotesChange) {
        try {
          const notesResponse = await fetch(`${baseURL}/api/workspace/notes`, {
            credentials: 'include',
          });
          if (notesResponse.ok) {
            const notesData = await notesResponse.json();
            setNotes(notesData.notes || []);
            debug.log(`[ContextSelector] Fetched ${notesData.notes?.length || 0} workspace notes`);
          }
        } catch (error) {
          debug.error('[ContextSelector] Failed to fetch notes:', error);
        }
      }

      // Fetch credentials
      if (onCredentialsChange) {
        try {
          const credsResponse = await fetch(`${baseURL}/api/workspace/credentials`, {
            credentials: 'include',
          });
          if (credsResponse.ok) {
            const credsData = await credsResponse.json();
            setCredentials(credsData.credentials || []);
            debug.log(`[ContextSelector] Fetched ${credsData.credentials?.length || 0} credentials`);
          }
        } catch (error) {
          debug.error('[ContextSelector] Failed to fetch credentials:', error);
        }
      }
    } finally {
      setLoadingWorkspace(false);
    }
  }, [onNotesChange, onCredentialsChange]);

  // ============================================================================
  // INITIAL FETCH & REFRESH
  // ============================================================================

  useEffect(() => {
    fetchPages();
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPages();
      if (showBrowserTabs) {
        fetchBrowserTabs();
      }
      fetchWorkspaceItems();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 10);
    } else {
      setSearchQuery('');
    }
  }, [isOpen, fetchPages, fetchBrowserTabs, showBrowserTabs, fetchWorkspaceItems]);

  // ============================================================================
  // DROPDOWN POSITION
  // ============================================================================

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

  // ============================================================================
  // OUTSIDE CLICK & ESCAPE HANDLING
  // ============================================================================

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (target.closest('[data-pages-selector-dropdown]')) {
        return;
      }

      if (target.closest('[data-pages-selector-trigger]')) {
        return;
      }

      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

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

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [showSortMenu]);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getDomain = useCallback((url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }, []);

  const formatRelativeTime = (date: Date | string | number): string => {
    try {
      let dateObj: Date;
      if (date instanceof Date) {
        dateObj = date;
      } else if (typeof date === 'string') {
        dateObj = new Date(date);
      } else {
        dateObj = new Date(date);
      }

      if (isNaN(dateObj.getTime())) {
        return 'Recently';
      }

      const now = new Date();
      const diff = now.getTime() - dateObj.getTime();

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

  // ============================================================================
  // INDEXED PAGES - Filtering & Selection
  // ============================================================================

  const filteredPages = useMemo(() => {
    // First filter
    let result = pages;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = pages.filter(
        page =>
          page.pageTitle.toLowerCase().includes(query) ||
          page.pageURL.toLowerCase().includes(query) ||
          getDomain(page.pageURL).toLowerCase().includes(query),
      );
    }

    // Then sort
    return [...result].sort((a, b) => {
      switch (sortOption) {
        case 'date-desc':
          return new Date(b.lastIndexed).getTime() - new Date(a.lastIndexed).getTime();
        case 'date-asc':
          return new Date(a.lastIndexed).getTime() - new Date(b.lastIndexed).getTime();
        case 'name-asc':
          return a.pageTitle.localeCompare(b.pageTitle);
        case 'name-desc':
          return b.pageTitle.localeCompare(a.pageTitle);
        default:
          return 0;
      }
    });
  }, [pages, searchQuery, getDomain, sortOption]);

  const handleTogglePage = useCallback(
    (pageURL: string) => {
      const newSelection = selectedPageURLs.includes(pageURL)
        ? selectedPageURLs.filter(url => url !== pageURL)
        : [...selectedPageURLs, pageURL];
      onPagesChange(newSelection);
    },
    [selectedPageURLs, onPagesChange],
  );

  const handleDeletePage = useCallback(
    async (pageURL: string, e: React.MouseEvent) => {
      e.stopPropagation();

      // Allow deleting any page including the current one
      // User should have full control over their indexed pages
      setDeletingPages(prev => new Set(prev).add(pageURL));

      try {
        debug.log('[ContextSelector] Deleting page embeddings:', pageURL);
        const result = await embeddingsStorage.deletePageEmbeddings(pageURL);

        if (result.deleted) {
          setPages(prev => prev.filter(p => p.pageURL !== pageURL));

          if (selectedPageURLs.includes(pageURL)) {
            onPagesChange(selectedPageURLs.filter(url => url !== pageURL));
          }

          debug.log('[ContextSelector] Successfully deleted page:', pageURL, result.counts);
        }
      } catch (error) {
        debug.error('[ContextSelector] Failed to delete page:', error);
      } finally {
        setDeletingPages(prev => {
          const next = new Set(prev);
          next.delete(pageURL);
          return next;
        });
      }
    },
    [currentPageURL, selectedPageURLs, onPagesChange],
  );

  const handleSelectAllIndexed = useCallback(() => {
    const filteredURLs = filteredPages.map(p => p.pageURL);
    const allFilteredSelected = filteredURLs.every(url => selectedPageURLs.includes(url));

    if (allFilteredSelected) {
      // Deselect all filtered pages - user can choose to have no pages selected
      const newSelection = selectedPageURLs.filter(url => !filteredURLs.includes(url));
      onPagesChange(newSelection);
    } else {
      const newSelection = Array.from(new Set([...selectedPageURLs, ...filteredURLs]));
      onPagesChange(newSelection);
    }
  }, [filteredPages, selectedPageURLs, onPagesChange]);

  // Bulk delete selected indexed pages
  const handleBulkDeleteIndexed = useCallback(async () => {
    // Get all selected pages to delete (including current page if selected)
    const pagesToDelete = [...selectedPageURLs];

    if (pagesToDelete.length === 0) {
      debug.warn('[ContextSelector] No pages to delete');
      return;
    }

    // Mark all as deleting
    setDeletingPages(new Set(pagesToDelete));

    try {
      debug.log('[ContextSelector] Bulk deleting pages:', pagesToDelete.length);

      // Delete in parallel with concurrency limit
      const CONCURRENCY = 3;
      let successCount = 0;

      for (let i = 0; i < pagesToDelete.length; i += CONCURRENCY) {
        const batch = pagesToDelete.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(batch.map(url => embeddingsStorage.deletePageEmbeddings(url)));

        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.deleted) {
            successCount++;
            const url = batch[index];
            setPages(prev => prev.filter(p => p.pageURL !== url));
          }
        });
      }

      // Remove deleted pages from selection
      onPagesChange(selectedPageURLs.filter(url => !pagesToDelete.includes(url)));

      debug.log('[ContextSelector] Bulk delete complete:', successCount, '/', pagesToDelete.length);
    } catch (error) {
      debug.error('[ContextSelector] Bulk delete failed:', error);
    } finally {
      setDeletingPages(new Set());
    }
  }, [selectedPageURLs, onPagesChange]);

  // Open page in new tab
  const handleOpenInNewTab = useCallback((pageURL: string, e: React.MouseEvent) => {
    e.stopPropagation();
    chrome.tabs.create({ url: pageURL, active: false });
  }, []);

  // Switch to an existing tab
  const handleSwitchToTab = useCallback(
    (url: string) => {
      // Find the tab with this URL and switch to it
      const tab = browserTabs.find(t => t.url === url);
      if (tab) {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
      }
    },
    [browserTabs],
  );

  // ============================================================================
  // BROWSER TABS - Filtering & Organization
  // ============================================================================

  // Combine pages with newly embedded URLs for immediate UI feedback
  const indexedURLs = useMemo(() => {
    const urls = new Set(pages.map(p => p.pageURL));
    newlyEmbeddedURLs.forEach(url => urls.add(url));
    return urls;
  }, [pages, newlyEmbeddedURLs]);

  const filteredBrowserTabs = useMemo(() => {
    if (!searchQuery.trim()) return browserTabs;
    const query = searchQuery.toLowerCase().trim();
    return browserTabs.filter(
      tab =>
        tab.title.toLowerCase().includes(query) ||
        tab.url.toLowerCase().includes(query) ||
        getDomain(tab.url).toLowerCase().includes(query),
    );
  }, [browserTabs, searchQuery, getDomain]);

  // Organize tabs by window and group
  const organizedTabs = useMemo(() => {
    const result: Map<
      number,
      {
        window: BrowserWindow;
        groups: Map<number, { group: TabGroup | null; tabs: BrowserTab[] }>;
        ungroupedTabs: BrowserTab[];
      }
    > = new Map();

    // Initialize windows
    for (const window of windows) {
      result.set(window.id, {
        window,
        groups: new Map(),
        ungroupedTabs: [],
      });
    }

    // Organize tabs
    for (const tab of filteredBrowserTabs) {
      const windowData = result.get(tab.windowId);
      if (!windowData) continue;

      if (tab.groupId === -1) {
        windowData.ungroupedTabs.push(tab);
      } else {
        if (!windowData.groups.has(tab.groupId)) {
          const group = tabGroups.find(g => g.id === tab.groupId) || null;
          windowData.groups.set(tab.groupId, { group, tabs: [] });
        }
        windowData.groups.get(tab.groupId)!.tabs.push(tab);
      }
    }

    return result;
  }, [filteredBrowserTabs, windows, tabGroups]);

  // Count unindexed tabs
  const unindexedTabCount = useMemo(
    () => browserTabs.filter(tab => !indexedURLs.has(tab.url)).length,
    [browserTabs, indexedURLs],
  );

  // ============================================================================
  // EMBEDDING FUNCTIONS
  // ============================================================================

  /**
   * Store embedding results to IndexedDB
   */
  const storeEmbeddings = useCallback(
    async (result: any, pageURL: string, pageTitle: string): Promise<void> => {
      try {
        debug.log('[ContextSelector] Storing embeddings in IndexedDB...');

        // Store HTML chunks
        if (result.chunks && result.chunks.length > 0) {
          await embeddingsStorage.storeHTMLChunks({
            pageURL,
            pageTitle,
            chunks: result.chunks.map((chunk: any, index: number) => ({
              text: chunk.text,
              html: chunk.html || '',
              embedding: chunk.embedding,
              index,
            })),
            sessionId: sessionId || 'default',
          });
          debug.log('[ContextSelector] HTML chunks stored:', result.chunks.length);
        }

        // Store form field groups
        if (result.formFieldGroupEmbeddings && result.formFieldGroupEmbeddings.length > 0) {
          await embeddingsStorage.storeFormFields({
            pageURL,
            groups: result.formFieldGroupEmbeddings,
            sessionId: sessionId || 'default',
          });
          debug.log('[ContextSelector] Form field groups stored:', result.formFieldGroupEmbeddings.length);
        }

        // Store clickable element groups
        if (result.clickableElementGroupEmbeddings && result.clickableElementGroupEmbeddings.length > 0) {
          await embeddingsStorage.storeClickableElements({
            pageURL,
            groups: result.clickableElementGroupEmbeddings,
            sessionId: sessionId || 'default',
          });
          debug.log(
            '[ContextSelector] Clickable element groups stored:',
            result.clickableElementGroupEmbeddings.length,
          );
        }

        debug.log('[ContextSelector] All embeddings stored successfully for:', pageURL);
      } catch (error) {
        debug.error('[ContextSelector] Failed to store embeddings:', error);
        throw error;
      }
    },
    [sessionId],
  );

  const embedTab = useCallback(
    async (tabId: number, url: string, title: string, skipActivation?: boolean): Promise<boolean> =>
      new Promise(resolve => {
        const requestId = `embed_tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const timeout = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          debug.error('[ContextSelector] Embed timeout for tab:', tabId);
          setEmbeddingErrors(prev => new Map(prev).set(tabId, 'Timeout'));
          resolve(false);
        }, 60000);

        const listener = async (message: any) => {
          if (message.type === 'embeddingComplete' && message.requestId === requestId) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);

            if (message.error) {
              debug.error('[ContextSelector] Embed failed:', message.error);
              setEmbeddingErrors(prev => new Map(prev).set(tabId, message.error));
              resolve(false);
            } else {
              debug.log('[ContextSelector] Tab embedded, now storing...', tabId);

              try {
                // Store the embeddings to IndexedDB
                await storeEmbeddings(message.result, url, title);
                debug.log('[ContextSelector] Tab embedded and stored successfully:', tabId);
                resolve(true);
              } catch (storeError) {
                debug.error('[ContextSelector] Failed to store embeddings:', storeError);
                setEmbeddingErrors(prev => new Map(prev).set(tabId, 'Failed to save embeddings'));
                resolve(false);
              }
            }
          }
        };

        chrome.runtime.onMessage.addListener(listener);

        chrome.runtime
          .sendMessage({
            type: 'embedPageContentForTab',
            tabId,
            requestId,
            skipActivation,
          })
          .catch(err => {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            debug.error('[ContextSelector] Failed to send embed request:', err);
            setEmbeddingErrors(prev => new Map(prev).set(tabId, err.message));
            resolve(false);
          });
      }),
    [storeEmbeddings],
  );

  const handleEmbedAndSelect = useCallback(
    async (tab: BrowserTab) => {
      if (embeddingTabs.has(tab.id)) return;

      setEmbeddingTabs(prev => new Set(prev).add(tab.id));
      setEmbeddingErrors(prev => {
        const next = new Map(prev);
        next.delete(tab.id);
        return next;
      });

      // For discarded tabs, the background script will handle activation and loading
      // We don't need to pre-activate here - just let embedTab handle it
      // This avoids duplicate activation and simplifies the flow

      try {
        const success = await embedTab(tab.id, tab.url, tab.title);

        if (success) {
          // Refresh indexed pages
          await fetchPages();

          // Auto-select the newly embedded page
          if (!selectedPageURLs.includes(tab.url)) {
            onPagesChange([...selectedPageURLs, tab.url]);
          }
        }
      } finally {
        setEmbeddingTabs(prev => {
          const next = new Set(prev);
          next.delete(tab.id);
          return next;
        });
      }
    },
    [embeddingTabs, embedTab, fetchPages, selectedPageURLs, onPagesChange],
  );

  // Initiate bulk embed - processes tabs in parallel with real-time updates
  // Background script handles discarded tab activation/reload automatically
  const handleBulkEmbed = useCallback(
    async (tabs: BrowserTab[]) => {
      // Helper to check if URL is protected/uembeddable
      const isProtectedUrl = (url: string) => {
        // Skip protected browser pages
        if (PROTECTED_PATTERNS.some(pattern => url.startsWith(pattern))) return true;
        // Skip PDF files
        if (url.endsWith('.pdf') || url.includes('/pdf/viewer')) return true;
        // Skip empty URLs
        if (!url || url === 'about:blank') return true;
        return false;
      };

      // Filter to only embeddable, unindexed tabs that aren't already being embedded
      const tabsToEmbed = tabs.filter(
        tab => !indexedURLs.has(tab.url) && !embeddingTabs.has(tab.id) && !isProtectedUrl(tab.url),
      );

      const skippedCount =
        tabs.length - tabsToEmbed.length - tabs.filter(t => indexedURLs.has(t.url) || embeddingTabs.has(t.id)).length;
      if (skippedCount > 0) {
        debug.log('[ContextSelector] Skipped', skippedCount, 'protected/PDF pages');
      }

      if (tabsToEmbed.length === 0) return;

      const discardedCount = tabsToEmbed.filter(tab => tab.discarded).length;
      debug.log('[ContextSelector] Bulk embed starting (parallel):', {
        total: tabsToEmbed.length,
        discarded: discardedCount,
        regular: tabsToEmbed.length - discardedCount,
      });

      embeddingAbortRef.current = new AbortController();
      setEmbeddingProgress({ current: 0, total: tabsToEmbed.length });

      // Add all tabs to embedding set
      const newEmbeddingSet = new Set(embeddingTabs);
      tabsToEmbed.forEach(tab => newEmbeddingSet.add(tab.id));
      setEmbeddingTabs(newEmbeddingSet);

      let completedCount = 0;
      const successfulUrls: string[] = [];

      // Process each tab and update UI immediately when complete
      const embedSingleTab = async (tab: BrowserTab) => {
        if (embeddingAbortRef.current?.signal.aborted) return;

        try {
          const success = await embedTab(tab.id, tab.url, tab.title);

          if (success) {
            successfulUrls.push(tab.url);
            debug.log('[ContextSelector] Bulk: Tab embedded successfully:', tab.title);

            // Immediately update newlyEmbeddedURLs so UI reflects completion
            setNewlyEmbeddedURLs(prev => new Set(prev).add(tab.url));

            // Auto-select the newly embedded page
            if (!selectedPageURLs.includes(tab.url)) {
              onPagesChange([...selectedPageURLs, tab.url]);
            }
          } else {
            debug.warn('[ContextSelector] Bulk: Failed to embed tab:', tab.title);
          }
        } catch (embedError) {
          debug.error('[ContextSelector] Bulk embed error for tab:', tab.id, embedError);
          setEmbeddingErrors(prev => new Map(prev).set(tab.id, 'Failed to embed'));
        } finally {
          // Remove from embedding set immediately
          setEmbeddingTabs(prev => {
            const next = new Set(prev);
            next.delete(tab.id);
            return next;
          });

          // Update progress
          completedCount++;
          setEmbeddingProgress(prev => (prev ? { current: completedCount, total: prev.total } : null));
        }
      };

      // Run all embeds in parallel with concurrency limit
      const CONCURRENCY = 5; // Process 5 tabs at a time
      const chunks: BrowserTab[][] = [];
      for (let i = 0; i < tabsToEmbed.length; i += CONCURRENCY) {
        chunks.push(tabsToEmbed.slice(i, i + CONCURRENCY));
      }

      for (const chunk of chunks) {
        if (embeddingAbortRef.current?.signal.aborted) break;
        await Promise.all(chunk.map(tab => embedSingleTab(tab)));
      }

      // Cleanup
      setEmbeddingProgress(null);
      embeddingAbortRef.current = null;

      // Final refresh to ensure everything is in sync
      await fetchPages();

      debug.log('[ContextSelector] Bulk embed complete:', successfulUrls.length, 'of', tabsToEmbed.length, 'succeeded');
    },
    [indexedURLs, embeddingTabs, embedTab, fetchPages, selectedPageURLs, onPagesChange],
  );

  const handleCancelBulkEmbed = useCallback(() => {
    embeddingAbortRef.current?.abort();
  }, []);

  // ============================================================================
  // TOGGLE HANDLERS
  // ============================================================================

  const toggleWindow = useCallback((windowId: number) => {
    setExpandedWindows(prev => {
      const next = new Set(prev);
      if (next.has(windowId)) {
        next.delete(windowId);
      } else {
        next.add(windowId);
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupId: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // ============================================================================
  // WORKSPACE ITEM HANDLERS
  // ============================================================================

  const handleToggleNote = useCallback(
    async (noteId: string) => {
      if (!onNotesChange) return;
      const newSelection = selectedNoteIds.includes(noteId)
        ? selectedNoteIds.filter(id => id !== noteId)
        : [...selectedNoteIds, noteId];
      onNotesChange(newSelection);

      // If callback for full notes is provided, fetch content
      if (onNotesWithContentChange && newSelection.length > 0) {
        try {
          const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          const response = await fetch(`${baseURL}/api/workspace/notes/bulk`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: newSelection }),
          });

          if (response.ok) {
            const data = await response.json();
            onNotesWithContentChange(data.notes || []);
            debug.log('[ContextSelector] Fetched', data.notes?.length || 0, 'notes with content');
          }
        } catch (error) {
          debug.error('[ContextSelector] Failed to fetch note content:', error);
        }
      } else if (onNotesWithContentChange && newSelection.length === 0) {
        // Clear notes if nothing selected
        onNotesWithContentChange([]);
      }
    },
    [selectedNoteIds, onNotesChange, onNotesWithContentChange],
  );

  const handleToggleCredential = useCallback(
    async (credentialId: string) => {
      if (!onCredentialsChange) return;
      const newSelection = selectedCredentialIds.includes(credentialId)
        ? selectedCredentialIds.filter(id => id !== credentialId)
        : [...selectedCredentialIds, credentialId];
      onCredentialsChange(newSelection);

      // If callback for full credentials is provided, fetch secrets
      if (onCredentialsWithSecretsChange && newSelection.length > 0) {
        try {
          const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          const response = await fetch(`${baseURL}/api/workspace/credentials/bulk`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: newSelection }),
          });

          if (response.ok) {
            const data = await response.json();
            onCredentialsWithSecretsChange(data.credentials || []);
            debug.log('[ContextSelector] Fetched', data.credentials?.length || 0, 'credentials with secrets');
          }
        } catch (error) {
          debug.error('[ContextSelector] Failed to fetch credential secrets:', error);
        }
      } else if (onCredentialsWithSecretsChange && newSelection.length === 0) {
        // Clear credentials if nothing selected
        onCredentialsWithSecretsChange([]);
      }
    },
    [selectedCredentialIds, onCredentialsChange, onCredentialsWithSecretsChange],
  );

  // ============================================================================
  // DISPLAY TEXT
  // ============================================================================

  const displayText = useMemo(() => {
    const totalSelected = selectedPageURLs.length + selectedNoteIds.length + selectedCredentialIds.length;

    if (loading) return 'Loading...';
    if (pages.length === 0 && browserTabs.length === 0 && notes.length === 0 && credentials.length === 0) {
      return 'No items available';
    }
    if (totalSelected === 0) return 'No context added';
    if (totalSelected === 1) return '1 item selected';
    return `${totalSelected} items selected`;
  }, [
    loading,
    pages.length,
    browserTabs.length,
    notes.length,
    credentials.length,
    selectedPageURLs.length,
    selectedNoteIds.length,
    selectedCredentialIds.length,
  ]);

  const allFilteredSelected =
    filteredPages.length > 0 && filteredPages.every(p => selectedPageURLs.includes(p.pageURL));
  const isCompact = variant === 'compact';
  const hasSelectedItems =
    selectedPageURLs.length > 0 || selectedNoteIds.length > 0 || selectedCredentialIds.length > 0;

  // ============================================================================
  // RENDER
  // ============================================================================

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
          'mt-[3px] flex h-[22px] items-center gap-1.5 rounded-xl transition-all',
          isCompact
            ? 'ml-1.5 min-w-0 px-2 py-1 text-[12px] leading-tight'
            : 'max-w-[200px] min-w-[120px] border px-0 pt-[3px] text-xs',
          isLoadingSession
            ? 'cursor-wait opacity-70'
            : loading
              ? 'animate-pulse cursor-wait opacity-70'
              : 'cursor-pointer',
          isCompact
            ? isLight
              ? hasSelectedItems
                ? 'bg-gray-200/60 text-gray-700 hover:bg-gray-200/80' // Same color as addMenuButton when items selected
                : 'bg-gray-200/60 text-gray-500 hover:bg-gray-200/80' // Dull when no items selected
              : hasSelectedItems
                ? 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60' // Same color as addMenuButton when items selected
                : 'bg-gray-700/40 text-gray-500 hover:bg-gray-700/60' // Dull when no items selected
            : isLight
              ? 'border-gray-300 bg-gray-100 text-gray-600 hover:border-gray-400 hover:bg-gray-200'
              : 'border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500 hover:bg-gray-700',
        )}>
        <span className={cn('flex-shrink-0 font-semibold', isCompact ? 'text-sm' : 'text-base')}>@</span>

        <span className={cn('relative truncate overflow-hidden', isCompact ? 'min-w-0 flex-1' : 'flex-1 text-left')}>
          <span ref={textRef} className="block truncate">
            {displayText}
          </span>
          {isTruncated && isCompact && (
            <span
              className={cn(
                'pointer-events-none absolute top-0 right-0 bottom-0 w-8',
                isLight
                  ? 'bg-gradient-to-l from-white via-white/80 to-transparent'
                  : 'bg-gradient-to-l from-[#151C24] via-[#151C24]/80 to-transparent',
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

      {/* Dropdown - Portal */}
      {isOpen &&
        dropdownPosition &&
        portalContainer &&
        createPortal(
          <div
            ref={dropdownRef}
            data-pages-selector-dropdown
            style={{
              position: 'fixed',
              top: dropdownPosition.top - 8,
              left: dropdownPosition.left,
              transform: 'translateY(-100%)',
              minWidth: Math.max(dropdownPosition.width, 340),
              maxWidth: 420,
              minHeight: 300,
              pointerEvents: 'auto',
            }}
            className={cn(
              'flex max-h-[500px] flex-col rounded-md border shadow-lg',
              isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
            )}>
            {/* Header with Search */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-t-md border-b px-2 py-1.5',
                isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]',
              )}>
              <div className="relative flex-1">
                <svg
                  className={cn(
                    'absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2',
                    isLight ? 'text-gray-400' : 'text-gray-500',
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  placeholder="Search indexed pages, tabs, and workspace items..."
                  className={cn(
                    'w-full rounded-md py-1.5 pr-2 pl-7 text-xs transition-colors outline-none',
                    isLight
                      ? 'bg-gray-100 text-gray-700 placeholder-gray-400 focus:bg-gray-100'
                      : 'bg-gray-800/60 text-[#bcc1c7] placeholder-gray-500 focus:bg-gray-800',
                  )}
                />
              </div>
            </div>

            {/* View Mode Tabs */}
            {(showBrowserTabs || onNotesChange || onCredentialsChange) && (
              <div
                className={cn(
                  'flex items-center justify-center gap-1 border-b px-2 py-1.5',
                  isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
                )}>
                {[
                  'all',
                  'indexed',
                  ...(showBrowserTabs ? ['tabs'] : []),
                  ...(onNotesChange || onCredentialsChange ? ['workspace'] : []),
                ].map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode as ViewMode)}
                    className={cn(
                      'flex-shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors',
                      viewMode === mode
                        ? isLight
                          ? 'bg-gray-200 text-gray-700'
                          : 'bg-gray-700 text-[#bcc1c7]'
                        : isLight
                          ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-700'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-[#bcc1c7]',
                    )}>
                    {mode === 'all' && 'All'}
                    {mode === 'indexed' && `Indexed (${pages.length})`}
                    {mode === 'tabs' && `Tabs (${browserTabs.length})`}
                    {mode === 'workspace' && `Workspace (${notes.length + credentials.length})`}
                  </button>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="min-h-[200px] flex-1 overflow-y-auto">
              {loading && loadingTabs ? (
                <div className="flex items-center justify-center py-6">
                  <div className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>Loading...</div>
                </div>
              ) : (
                <>
                  {/* INDEXED PAGES SECTION */}
                  {(viewMode === 'all' || viewMode === 'indexed') && (
                    <>
                      {/* Section Header */}
                      <div
                        className={cn(
                          'sticky top-0 z-10 flex items-center justify-between px-2.5 py-1.5',
                          isLight
                            ? 'border-b border-gray-200 bg-gray-100/95'
                            : 'border-b border-gray-700 bg-gray-800/95',
                        )}>
                        <span
                          className={cn(
                            'text-[10px] font-semibold tracking-wider uppercase',
                            isLight ? 'text-gray-500' : 'text-gray-400',
                          )}>
                          Indexed ({filteredPages.length})
                        </span>
                        <div className="flex items-center gap-2">
                          {/* Delete Selected Button */}
                          {selectedPageURLs.filter(url => filteredPages.some(p => p.pageURL === url)).length > 0 && (
                            <button
                              type="button"
                              onClick={handleBulkDeleteIndexed}
                              disabled={deletingPages.size > 0}
                              className={cn(
                                'flex items-center gap-1 text-[10px] font-medium transition-colors',
                                deletingPages.size > 0
                                  ? 'cursor-not-allowed opacity-50'
                                  : isLight
                                    ? 'text-red-600 hover:text-red-700'
                                    : 'text-red-400 hover:text-red-300',
                              )}>
                              {deletingPages.size > 0 ? (
                                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="h-3 w-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  strokeWidth={2}>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              )}
                              Delete (
                              {selectedPageURLs.filter(url => filteredPages.some(p => p.pageURL === url)).length})
                            </button>
                          )}
                          {/* Select All Button */}
                          {filteredPages.length > 0 && (
                            <button
                              type="button"
                              onClick={handleSelectAllIndexed}
                              className={cn(
                                'flex items-center gap-1 text-[10px] font-medium transition-colors',
                                isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300',
                              )}>
                              <div
                                className={cn(
                                  'flex h-3 w-3 items-center justify-center rounded',
                                  allFilteredSelected
                                    ? 'bg-blue-600'
                                    : cn('border', isLight ? 'border-gray-400' : 'border-gray-500'),
                                )}>
                                {allFilteredSelected && (
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
                              All
                            </button>
                          )}
                          {/* Sort Button with Dropdown */}
                          <div className="relative" ref={sortMenuRef}>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setShowSortMenu(!showSortMenu);
                              }}
                              title={`Sort: ${sortOption === 'date-desc' ? 'Newest' : sortOption === 'date-asc' ? 'Oldest' : sortOption === 'name-asc' ? 'A-Z' : 'Z-A'}`}
                              className={cn(
                                'rounded p-1 transition-colors',
                                isLight
                                  ? 'text-gray-400 hover:bg-gray-200 hover:text-gray-700'
                                  : 'text-gray-500 hover:bg-gray-700 hover:text-gray-200',
                              )}>
                              {/* Sort icon - up/down arrows */}
                              <svg
                                className="h-3.5 w-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2.5}
                                strokeLinecap="round"
                                strokeLinejoin="round">
                                {/* Up arrow */}
                                <path d="M8 5L8 19M4 9L8 5L12 9" />
                                {/* Down arrow */}
                                <path d="M16 19L16 5M12 15L16 19L20 15" />
                              </svg>
                            </button>
                            {/* Sort Menu */}
                            {showSortMenu && (
                              <div
                                className={cn(
                                  'absolute top-full right-0 z-50 mt-1 min-w-[100px] rounded-md border py-1 shadow-lg',
                                  isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-gray-800',
                                )}>
                                {[
                                  { value: 'date-desc', label: 'Newest' },
                                  { value: 'date-asc', label: 'Oldest' },
                                  { value: 'name-asc', label: 'A-Z' },
                                  { value: 'name-desc', label: 'Z-A' },
                                ].map(option => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setSortOption(option.value as SortOption);
                                      setShowSortMenu(false);
                                    }}
                                    className={cn(
                                      'w-full px-3 py-1 text-left text-[10px] transition-colors',
                                      sortOption === option.value
                                        ? isLight
                                          ? 'bg-blue-50 text-blue-600'
                                          : 'bg-blue-900/30 text-blue-400'
                                        : isLight
                                          ? 'text-gray-700 hover:bg-gray-100'
                                          : 'text-gray-300 hover:bg-gray-700',
                                    )}>
                                    {option.label}
                                    {sortOption === option.value && <span className="ml-2">✓</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Indexed Pages List */}
                      {filteredPages.length === 0 ? (
                        <div
                          className={cn('px-3 py-4 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          {pages.length === 0 ? 'No pages indexed yet' : 'No indexed pages match your search'}
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
                                'group flex w-full items-center gap-2 border-b px-2.5 py-1 text-left text-xs transition-colors',
                                isLight ? 'border-gray-100' : 'border-gray-700/50',
                                isDeleting && 'pointer-events-none opacity-50',
                                isSelected
                                  ? isLight
                                    ? 'bg-gray-100/80 text-gray-700'
                                    : 'bg-gray-700/40 text-gray-200'
                                  : isLight
                                    ? 'text-gray-500 hover:bg-gray-100'
                                    : 'text-gray-400 hover:bg-gray-700/50',
                              )}>
                              {/* Status indicator */}
                              <span
                                className={cn(
                                  'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full',
                                  isLight ? 'bg-gray-100 text-gray-500' : 'bg-gray-800 text-gray-400',
                                )}>
                                <svg
                                  className="h-2.5 w-2.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </span>

                              <div className="flex min-w-0 flex-1 flex-col text-left">
                                <div className="flex items-center gap-1.5 truncate leading-tight font-medium">
                                  {isCurrent && (
                                    <span
                                      className={cn(
                                        'flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold',
                                        isLight ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400',
                                      )}>
                                      CURRENT
                                    </span>
                                  )}
                                  <span className="truncate">{page.pageTitle}</span>
                                </div>
                                <div
                                  className={cn(
                                    'truncate text-[10px] leading-tight',
                                    isLight ? 'text-gray-500' : 'text-gray-500',
                                  )}>
                                  {getDomain(page.pageURL)} • {totalChunks} chunks •{' '}
                                  {formatRelativeTime(page.lastIndexed)}
                                </div>
                              </div>

                              {/* Action buttons - equally spaced */}
                              <div className="flex flex-shrink-0 items-center gap-1.5">
                                {/* Open in new tab button */}
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={e => handleOpenInNewTab(page.pageURL, e)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.stopPropagation();
                                      handleOpenInNewTab(page.pageURL, e as any);
                                    }
                                  }}
                                  title="Open in new tab"
                                  className={cn(
                                    'flex h-6 w-6 cursor-pointer items-center justify-center rounded opacity-0 transition-all group-hover:opacity-100',
                                    isLight ? 'text-gray-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400',
                                  )}>
                                  <svg
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}>
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                    />
                                  </svg>
                                </span>

                                {/* Delete button */}
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleDeletePage(page.pageURL, e);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.stopPropagation();
                                      handleDeletePage(page.pageURL, e as any);
                                    }
                                  }}
                                  title="Delete indexed page"
                                  className={cn(
                                    'flex h-6 w-6 cursor-pointer items-center justify-center rounded opacity-0 transition-all group-hover:opacity-100',
                                    isLight ? 'text-gray-400 hover:text-red-600' : 'text-gray-500 hover:text-red-400',
                                  )}>
                                  {isDeleting ? (
                                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      />
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      className="h-3.5 w-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      strokeWidth={2}>
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  )}
                                </span>

                                {/* Checkbox */}
                                <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center')}>
                                  <div
                                    className={cn(
                                      'flex h-3.5 w-3.5 items-center justify-center rounded transition-opacity',
                                      isSelected
                                        ? 'bg-blue-600/60 opacity-100'
                                        : cn(
                                            'border opacity-0 group-hover:opacity-100',
                                            isLight ? 'border-gray-400' : 'border-gray-500',
                                          ),
                                    )}>
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
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </>
                  )}

                  {/* BROWSER TABS SECTION */}
                  {showBrowserTabs && (viewMode === 'all' || viewMode === 'tabs') && (
                    <>
                      {/* Section Header */}
                      <div
                        className={cn(
                          'sticky top-0 z-10 flex items-center justify-between px-2.5 py-1.5',
                          isLight
                            ? 'border-b border-gray-200 bg-gray-100/95'
                            : 'border-b border-gray-700 bg-gray-800/95',
                        )}>
                        <span
                          className={cn(
                            'flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase',
                            isLight ? 'text-gray-500' : 'text-gray-400',
                          )}>
                          Browser Tabs ({filteredBrowserTabs.length})
                          {unindexedTabCount > 0 && (
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium normal-case',
                                isLight ? 'bg-gray-200/80 text-gray-600' : 'bg-gray-700 text-gray-300',
                              )}>
                              {unindexedTabCount} not indexed
                            </span>
                          )}
                        </span>
                        {unindexedTabCount > 0 && (
                          <button
                            type="button"
                            onClick={() => handleBulkEmbed(browserTabs.filter(t => !indexedURLs.has(t.url)))}
                            disabled={embeddingProgress !== null}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                              embeddingProgress
                                ? 'cursor-not-allowed opacity-50'
                                : isLight
                                  ? 'text-blue-600 hover:bg-blue-50'
                                  : 'text-blue-400 hover:bg-blue-900/30',
                            )}>
                            Embed All
                          </button>
                        )}
                      </div>

                      {loadingTabs ? (
                        <div
                          className={cn('px-3 py-4 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          Loading browser tabs...
                        </div>
                      ) : filteredBrowserTabs.length === 0 ? (
                        <div
                          className={cn('px-3 py-4 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          {browserTabs.length === 0 ? 'No accessible tabs' : 'No tabs match your search'}
                        </div>
                      ) : (
                        /* Render organized tabs by window and group */
                        Array.from(organizedTabs.entries()).map(([windowId, windowData]) => (
                          <div key={windowId}>
                            {/* Window Header */}
                            <button
                              type="button"
                              onClick={() => toggleWindow(windowId)}
                              className={cn(
                                'flex w-full items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors',
                                isLight
                                  ? 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                                  : 'bg-gray-800/50 text-gray-300 hover:bg-gray-800',
                              )}>
                              <svg
                                className={cn(
                                  'h-3 w-3 transition-transform',
                                  expandedWindows.has(windowId) && 'rotate-90',
                                )}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2}>
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <path d="M3 9h18" />
                              </svg>
                              <span>Window {windowData.window.focused ? '(Current)' : ''}</span>
                              <span className={cn('ml-auto text-[10px]', isLight ? 'text-gray-400' : 'text-gray-500')}>
                                {windowData.ungroupedTabs.length +
                                  Array.from(windowData.groups.values()).reduce((a, g) => a + g.tabs.length, 0)}{' '}
                                tabs
                              </span>
                            </button>

                            {expandedWindows.has(windowId) && (
                              <div className="pl-2">
                                {/* Tab Groups */}
                                {Array.from(windowData.groups.entries()).map(([groupId, groupData]) => (
                                  <div key={groupId}>
                                    {/* Group Header */}
                                    <button
                                      type="button"
                                      onClick={() => toggleGroup(groupId)}
                                      className={cn(
                                        'flex w-full items-center gap-1.5 px-2 py-1 text-[10px] font-medium transition-colors',
                                        isLight
                                          ? 'text-gray-600 hover:bg-gray-100'
                                          : 'text-gray-400 hover:bg-gray-800/40',
                                      )}>
                                      <svg
                                        className={cn(
                                          'h-2.5 w-2.5 transition-transform',
                                          expandedGroups.has(groupId) && 'rotate-90',
                                        )}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                      </svg>
                                      <span
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: TAB_GROUP_COLORS[groupData.group?.color || 'grey'] }}
                                      />
                                      <span>{groupData.group?.title || 'Untitled Group'}</span>
                                      <span className={cn('ml-auto', isLight ? 'text-gray-400' : 'text-gray-500')}>
                                        {groupData.tabs.length}
                                      </span>
                                      {/* Group embed button */}
                                      {groupData.tabs.some(t => !indexedURLs.has(t.url)) && (
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation();
                                            handleBulkEmbed(groupData.tabs.filter(t => !indexedURLs.has(t.url)));
                                          }}
                                          className={cn(
                                            'rounded px-1 py-0.5 text-[9px]',
                                            isLight
                                              ? 'text-blue-600 hover:bg-blue-50'
                                              : 'text-blue-400 hover:bg-blue-900/30',
                                          )}>
                                          Embed
                                        </button>
                                      )}
                                    </button>

                                    {/* Group Tabs */}
                                    {expandedGroups.has(groupId) && (
                                      <div className="pl-4">
                                        {groupData.tabs.map(tab => (
                                          <TabItem
                                            key={tab.id}
                                            tab={tab}
                                            isLight={isLight}
                                            isIndexed={indexedURLs.has(tab.url)}
                                            isSelected={selectedPageURLs.includes(tab.url)}
                                            isEmbedding={embeddingTabs.has(tab.id)}
                                            error={embeddingErrors.get(tab.id)}
                                            getDomain={getDomain}
                                            onToggle={handleTogglePage}
                                            onEmbed={() => handleEmbedAndSelect(tab)}
                                            onOpenTab={handleSwitchToTab}
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}

                                {/* Ungrouped Tabs */}
                                {windowData.ungroupedTabs.length > 0 && (
                                  <div
                                    className={cn(
                                      'pl-2',
                                      windowData.groups.size > 0 && 'border-t',
                                      isLight ? 'border-gray-100' : 'border-gray-700/50',
                                    )}>
                                    {windowData.groups.size > 0 && (
                                      <div
                                        className={cn(
                                          'px-2 py-1 text-[9px] font-medium tracking-wider uppercase',
                                          isLight ? 'text-gray-400' : 'text-gray-500',
                                        )}>
                                        Ungrouped
                                      </div>
                                    )}
                                    {windowData.ungroupedTabs.map(tab => (
                                      <TabItem
                                        key={tab.id}
                                        tab={tab}
                                        isLight={isLight}
                                        isIndexed={indexedURLs.has(tab.url)}
                                        isSelected={selectedPageURLs.includes(tab.url)}
                                        isEmbedding={embeddingTabs.has(tab.id)}
                                        error={embeddingErrors.get(tab.id)}
                                        getDomain={getDomain}
                                        onToggle={handleTogglePage}
                                        onEmbed={() => handleEmbedAndSelect(tab)}
                                        onOpenTab={handleSwitchToTab}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {/* WORKSPACE SECTION */}
                  {(onNotesChange || onCredentialsChange) && (viewMode === 'all' || viewMode === 'workspace') && (
                    <>
                      {/* Section Header */}
                      <div
                        className={cn(
                          'sticky top-0 z-10 flex items-center justify-between px-2.5 py-1.5',
                          isLight
                            ? 'border-b border-gray-200 bg-gray-100/95'
                            : 'border-b border-gray-700 bg-gray-800/95',
                        )}>
                        <span
                          className={cn(
                            'text-[10px] font-semibold tracking-wider uppercase',
                            isLight ? 'text-gray-500' : 'text-gray-400',
                          )}>
                          Workspace ({notes.length + credentials.length})
                        </span>
                      </div>

                      {loadingWorkspace ? (
                        <div
                          className={cn('px-3 py-4 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          Loading workspace items...
                        </div>
                      ) : notes.length === 0 && credentials.length === 0 ? (
                        <div
                          className={cn('px-3 py-4 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          No notes or credentials available
                        </div>
                      ) : (
                        <>
                          {/* Notes subsection */}
                          {onNotesChange && notes.length > 0 && (
                            <>
                              <div
                                className={cn(
                                  'px-2.5 py-1 text-[9px] font-medium tracking-wider uppercase',
                                  isLight ? 'bg-gray-50 text-gray-400' : 'bg-gray-800/50 text-gray-500',
                                )}>
                                Notes ({notes.length})
                              </div>
                              {notes.map(note => {
                                const isSelected = selectedNoteIds.includes(note.id);
                                return (
                                  <button
                                    type="button"
                                    key={note.id}
                                    onClick={() => handleToggleNote(note.id)}
                                    className={cn(
                                      'group flex w-full items-center gap-2 border-b px-2.5 py-1.5 text-left text-xs transition-colors',
                                      isLight ? 'border-gray-100' : 'border-gray-700/50',
                                      isSelected
                                        ? isLight
                                          ? 'bg-gray-100/80 text-gray-700'
                                          : 'bg-gray-700/40 text-gray-200'
                                        : isLight
                                          ? 'text-gray-500 hover:bg-gray-100'
                                          : 'text-gray-400 hover:bg-gray-700/50',
                                    )}>
                                    {/* Icon */}
                                    <svg
                                      className="h-4 w-4 flex-shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      strokeWidth={2}>
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                      />
                                    </svg>

                                    <div className="flex min-w-0 flex-1 flex-col text-left">
                                      <div className="truncate leading-tight font-medium">{note.title}</div>
                                      {note.preview && (
                                        <div
                                          className={cn(
                                            'truncate text-[10px] leading-tight',
                                            isLight ? 'text-gray-500' : 'text-gray-500',
                                          )}>
                                          {note.preview}
                                        </div>
                                      )}
                                    </div>

                                    {/* Checkbox */}
                                    <div
                                      className={cn(
                                        'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
                                        isSelected
                                          ? 'bg-blue-600/60 opacity-100'
                                          : cn(
                                              'border opacity-0 group-hover:opacity-100',
                                              isLight ? 'border-gray-400' : 'border-gray-500',
                                            ),
                                      )}>
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
                                  </button>
                                );
                              })}
                            </>
                          )}

                          {/* Credentials subsection */}
                          {onCredentialsChange && credentials.length > 0 && (
                            <>
                              <div
                                className={cn(
                                  'px-2.5 py-1 text-[9px] font-medium tracking-wider uppercase',
                                  isLight ? 'bg-gray-50 text-gray-400' : 'bg-gray-800/50 text-gray-500',
                                )}>
                                Credentials ({credentials.length})
                              </div>
                              {credentials.map(cred => {
                                const isSelected = selectedCredentialIds.includes(cred.id);
                                return (
                                  <button
                                    type="button"
                                    key={cred.id}
                                    onClick={() => handleToggleCredential(cred.id)}
                                    className={cn(
                                      'group flex w-full items-center gap-2 border-b px-2.5 py-1.5 text-left text-xs transition-colors',
                                      isLight ? 'border-gray-100' : 'border-gray-700/50',
                                      isSelected
                                        ? isLight
                                          ? 'bg-gray-100/80 text-gray-700'
                                          : 'bg-gray-700/40 text-gray-200'
                                        : isLight
                                          ? 'text-gray-500 hover:bg-gray-100'
                                          : 'text-gray-400 hover:bg-gray-700/50',
                                    )}>
                                    {/* Icon */}
                                    <svg
                                      className="h-4 w-4 flex-shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      strokeWidth={2}>
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                                      />
                                    </svg>

                                    <div className="flex min-w-0 flex-1 flex-col text-left">
                                      <div className="truncate leading-tight font-medium">{cred.name}</div>
                                      <div
                                        className={cn(
                                          'truncate text-[10px] leading-tight',
                                          isLight ? 'text-gray-500' : 'text-gray-500',
                                        )}>
                                        {cred.type}
                                      </div>
                                    </div>

                                    {/* Checkbox */}
                                    <div
                                      className={cn(
                                        'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
                                        isSelected
                                          ? 'bg-blue-600/60 opacity-100'
                                          : cn(
                                              'border opacity-0 group-hover:opacity-100',
                                              isLight ? 'border-gray-400' : 'border-gray-500',
                                            ),
                                      )}>
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
                                  </button>
                                );
                              })}
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Progress Bar - Shows for bulk embedding OR multiple individual embeddings */}
            {(embeddingProgress || embeddingTabs.size > 1) && (
              <div
                className={cn(
                  'flex items-center gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-gray-800/50',
                )}>
                <div className="flex-1">
                  {embeddingProgress ? (
                    <>
                      <div
                        className={cn('h-1.5 overflow-hidden rounded-full', isLight ? 'bg-gray-200' : 'bg-gray-700')}>
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${(embeddingProgress.current / embeddingProgress.total) * 100}%` }}
                        />
                      </div>
                      <div className={cn('mt-0.5 text-[10px]', isLight ? 'text-gray-600' : 'text-gray-400')}>
                        Embedding {embeddingProgress.current}/{embeddingProgress.total}...
                      </div>
                    </>
                  ) : (
                    <div
                      className={cn(
                        'flex items-center gap-2 text-[10px]',
                        isLight ? 'text-gray-600' : 'text-gray-400',
                      )}>
                      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Embedding {embeddingTabs.size} tabs...
                    </div>
                  )}
                </div>
                {embeddingProgress && (
                  <button
                    type="button"
                    onClick={handleCancelBulkEmbed}
                    className={cn(
                      'rounded px-2 py-1 text-[10px] font-medium',
                      isLight ? 'text-red-600 hover:bg-red-50' : 'text-red-400 hover:bg-red-900/20',
                    )}>
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>,
          portalContainer,
        )}
    </div>
  );
};

// ============================================================================
// TAB ITEM COMPONENT
// ============================================================================

interface TabItemProps {
  tab: BrowserTab;
  isLight: boolean;
  isIndexed: boolean;
  isSelected: boolean;
  isEmbedding: boolean;
  error?: string;
  getDomain: (url: string) => string;
  onToggle: (url: string) => void;
  onEmbed: () => void;
  onOpenTab: (url: string) => void;
}

const TabItem: React.FC<TabItemProps> = ({
  tab,
  isLight,
  isIndexed,
  isSelected,
  isEmbedding,
  error,
  getDomain,
  onToggle,
  onEmbed,
  onOpenTab,
}) => {
  const handleClick = () => {
    if (isIndexed) {
      onToggle(tab.url);
    } else if (!isEmbedding) {
      onEmbed();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isEmbedding}
      className={cn(
        'group flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-xs transition-colors',
        isLight ? 'border-gray-100' : 'border-gray-700/50',
        isEmbedding && 'opacity-70',
        isSelected
          ? isLight
            ? 'bg-gray-100/80 text-gray-700'
            : 'bg-gray-700/40 text-gray-200'
          : isLight
            ? 'text-gray-500 hover:bg-gray-100'
            : 'text-gray-400 hover:bg-gray-700/50',
      )}>
      {/* Status indicator */}
      <span
        className={cn(
          'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px]',
          isLight ? 'bg-gray-100 text-gray-500' : 'bg-gray-800 text-gray-400',
        )}>
        {isEmbedding ? (
          <svg
            className={cn('h-3 w-3 animate-spin', isLight ? 'text-gray-500' : 'text-gray-400')}
            fill="none"
            viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : isIndexed ? (
          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : tab.discarded ? (
          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        ) : (
          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="12" cy="12" r="8" />
          </svg>
        )}
      </span>

      {/* Favicon */}
      {tab.favIconUrl && (
        <img
          src={tab.favIconUrl}
          alt=""
          className="h-3.5 w-3.5 flex-shrink-0 rounded-sm"
          onError={e => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col text-left">
        <div className="flex items-center gap-1.5 truncate leading-tight font-medium">
          {tab.isCurrentTab && (
            <span
              className={cn(
                'flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold',
                isLight ? 'bg-gray-200 text-gray-600' : 'bg-gray-700 text-gray-300',
              )}>
              CURRENT
            </span>
          )}
          <span className="truncate">{tab.title}</span>
        </div>
        <div className={cn('truncate text-[10px] leading-tight', isLight ? 'text-gray-500' : 'text-gray-500')}>
          {getDomain(tab.url)}
          {tab.discarded && ' • Discarded'}
          {error && <span className="text-red-500"> • {error}</span>}
        </div>
      </div>

      {/* Open tab button - switches to this tab */}
      {!tab.isCurrentTab && (
        <span
          role="button"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation();
            onOpenTab(tab.url);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onOpenTab(tab.url);
            }
          }}
          title="Switch to this tab"
          className={cn(
            'flex-shrink-0 cursor-pointer rounded p-1 opacity-0 transition-all group-hover:opacity-100',
            isLight ? 'text-gray-400 hover:text-blue-600' : 'text-gray-500 hover:text-blue-400',
          )}>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </span>
      )}

      {/* Embed button for unindexed tabs */}
      {!isIndexed && !isEmbedding && (
        <span
          role="button"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation();
            onEmbed();
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onEmbed();
            }
          }}
          className={cn(
            'flex-shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
            isLight
              ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              : 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50',
          )}>
          Embed
        </span>
      )}

      {/* Checkbox for indexed/selected tabs */}
      {isIndexed && (
        <div
          className={cn(
            'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded transition-opacity',
            isSelected
              ? 'bg-blue-600/60 opacity-100'
              : cn('border opacity-0 group-hover:opacity-100', isLight ? 'border-gray-400' : 'border-gray-500'),
          )}>
          {isSelected && (
            <svg className="h-2 w-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}
    </button>
  );
};
