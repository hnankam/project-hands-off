/**
 * ================================================================================
 * usePageContentEmbedding Hook
 * ================================================================================
 *
 * Custom hook that manages page content embedding lifecycle:
 * - Generates embeddings for HTML chunks, form fields, and clickable elements
 * - Stores embeddings in IndexedDB (via Web Worker) with HNSW indexes for fast vector search
 * - Prevents duplicate embedding of the same content
 * - Manages embedding state and progress
 * - Updates database totals for agent consumption
 *
 * @module usePageContentEmbedding
 * ================================================================================
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { FEATURES } from '@extension/platform';
import { embeddingsStorage, debug } from '@extension/shared';

// ============================================================================
// CONSTANTS
// ============================================================================

const MESSAGE_TYPE_GET_CURRENT_TAB = 'getCurrentTab';

// ============================================================================
// TYPES
// ============================================================================

interface UsePageContentEmbeddingParams {
  currentPageContent: any;
  isEmbeddingInitialized: boolean;
  isEmbeddingProcessing: boolean;
  embedPageContentForTab: (tabId: number, contentTimestamp: number) => Promise<any>;
  initialize: () => Promise<void>;
  sessionId: string;
  currentTabId: number | null;
}

interface PageContentEmbeddingResult {
  fullEmbedding: number[];
  chunks?: Array<{ text: string; html: string; embedding: number[] }>;
  formFieldEmbeddings?: Array<{
    selector: string;
    tagName: string;
    type: string;
    name: string;
    id: string;
    placeholder?: string;
    embedding: number[];
    index: number;
  }>;
  clickableElementEmbeddings?: Array<{
    selector: string;
    tagName: string;
    text: string;
    ariaLabel?: string;
    href?: string;
    embedding: number[];
    index: number;
  }>;
  timestamp: number;
}

interface EmbeddingTotals {
  html: number;
  form: number;
  click: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a unique key for content based on URL and timestamp.
 */
function createContentKey(url: string, timestamp: number): string {
  return `${url}_${timestamp}`;
}

/**
 * Validates that page content has actual data to embed.
 */
function hasValidContentData(content: any): boolean {
  if (!content?.allDOMContent) return false;

  const hasFormData = content.allDOMContent.allFormData && content.allDOMContent.allFormData.length > 0;

  const hasClickableElements =
    content.allDOMContent.clickableElements && content.allDOMContent.clickableElements.length > 0;

  const hasHTML = content.allDOMContent.fullHTML && content.allDOMContent.fullHTML.length > 0;

  return hasHTML || hasFormData || hasClickableElements;
}

/**
 * Gets the current active tab ID.
 */
async function getCurrentTabId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPE_GET_CURRENT_TAB }, response => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const tabId = response?.tabId as number | null;
      if (tabId) {
        resolve(tabId);
      } else {
        reject(new Error('No active tabId available for embedding'));
      }
    });
  });
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Custom hook for managing page content embeddings.
 *
 * Automatically generates and stores embeddings when page content changes.
 * Prevents duplicate embeddings and manages embedding state.
 *
 * @param params - Hook parameters
 * @returns Object containing embedding state and results
 *
 * @example
 * ```tsx
 * const { pageContentEmbeddingRef, isEmbedding, dbTotals } = usePageContentEmbedding({
 *   currentPageContent,
 *   isEmbeddingInitialized,
 *   isEmbeddingProcessing,
 *   embedPageContentForTab,
 *   initialize,
 *   sessionId,
 *   currentTabId,
 * });
 * ```
 */
export const usePageContentEmbedding = ({
  currentPageContent,
  isEmbeddingInitialized,
  isEmbeddingProcessing,
  embedPageContentForTab,
  initialize,
  sessionId,
  currentTabId,
}: UsePageContentEmbeddingParams) => {
  // ============================================================================
  // STATE
  // ============================================================================

  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState('');
  const [dbTotals, setDbTotals] = useState<EmbeddingTotals>({
    html: 0,
    form: 0,
    click: 0,
  });

  // ============================================================================
  // REFS
  // ============================================================================

  // Ref to store current embedding result
  const pageContentEmbeddingRef = useRef<PageContentEmbeddingResult | null>(null);

  // Refs to prevent infinite loops and duplicate embeddings
  const isEmbeddingRef = useRef(false);
  const lastEmbeddedKeyRef = useRef<string>('');
  const isEmbeddingProcessingRef = useRef<boolean>(false);

  // Cleanup tracker for async operations
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Update processing ref when state changes
  useEffect(() => {
    isEmbeddingProcessingRef.current = isEmbeddingProcessing;
  }, [isEmbeddingProcessing]);

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  /**
   * Stores embedding results in IndexedDB asynchronously.
   * Tracks operation with AbortController for cleanup.
   */
  const storeEmbeddingsInDB = useCallback(
    async (result: any, pageURL: string, pageTitle: string, sessionId: string, signal: AbortSignal): Promise<void> => {
      try {
        debug.log('[usePageContentEmbedding] Storing embeddings in IndexedDB with HNSW indexes');

        // Store HTML chunks with HNSW index
        if (result.chunks && result.chunks.length > 0) {
          if (signal.aborted) return;

          await embeddingsStorage.storeHTMLChunks({
            pageURL,
            pageTitle,
            chunks: result.chunks.map((chunk: any, index: number) => ({
              text: chunk.text,
              html: chunk.html || '',
              embedding: chunk.embedding,
              index,
            })),
            sessionId,
          });

          debug.log('[usePageContentEmbedding] HTML chunks stored:', result.chunks.length);
        }

        // Store form field groups with HNSW index
        if (result.formFieldGroupEmbeddings && result.formFieldGroupEmbeddings.length > 0) {
          if (signal.aborted) return;

          await embeddingsStorage.storeFormFields({
            pageURL,
            groups: result.formFieldGroupEmbeddings,
            sessionId,
          });

          debug.log('[usePageContentEmbedding] Form field groups stored:', result.formFieldGroupEmbeddings.length);
        }

        // Store clickable element groups with HNSW index
        if (result.clickableElementGroupEmbeddings && result.clickableElementGroupEmbeddings.length > 0) {
          if (signal.aborted) return;

          await embeddingsStorage.storeClickableElements({
            pageURL,
            groups: result.clickableElementGroupEmbeddings,
            sessionId,
          });

          debug.log(
            '[usePageContentEmbedding] Clickable element groups stored:',
            result.clickableElementGroupEmbeddings.length,
          );
        }

        if (!signal.aborted) {
          debug.log('[usePageContentEmbedding] All embeddings stored successfully');
        }
      } catch (storageError) {
        if (!signal.aborted) {
          debug.error('[usePageContentEmbedding] Failed to store embeddings:', storageError);
        }
      }
    },
    [],
  );

  /**
   * Main embedding function - generates and stores embeddings for page content.
   */
  const embedContent = useCallback(async (): Promise<void> => {
    if (!FEATURES.embeddingWorker()) {
      return;
    }

    // Guard: Check prerequisites
    if (!currentPageContent || !isEmbeddingInitialized || isEmbeddingProcessingRef.current) {
      if (!currentPageContent) {
        debug.log('[usePageContentEmbedding] No page content, skipping embedding');
      } else if (!isEmbeddingInitialized) {
        debug.log('[usePageContentEmbedding] Embedding worker not initialized, triggering initialization');
        initialize().catch(() => {});
      } else if (isEmbeddingProcessingRef.current) {
        debug.log('[usePageContentEmbedding] Embedding already in progress');
      }
      return;
    }

    // Guard: Prevent infinite loop
    if (isEmbeddingRef.current) {
      debug.log('[usePageContentEmbedding] Already embedding, skipping to prevent loop');
      return;
    }

    // Guard: Check for duplicate content (URL + timestamp)
    const contentTimestamp = currentPageContent.timestamp;
    const contentKey = createContentKey(currentPageContent.url, contentTimestamp);

    if (lastEmbeddedKeyRef.current === contentKey) {
      return; // Already embedded this exact content
    }

    // Guard: Validate content has actual data
    if (!hasValidContentData(currentPageContent)) {
      debug.log('[usePageContentEmbedding] No valid content data, waiting for fresh content');
      return;
    }

    // All guards passed - begin embedding
    isEmbeddingRef.current = true;
    setIsEmbedding(true);
    setEmbeddingStatus('Generating embeddings...');

    debug.log('[usePageContentEmbedding] Starting auto-embedding');
    debug.log('[usePageContentEmbedding] Page:', currentPageContent.url || 'unknown');
    debug.log('[usePageContentEmbedding] Session:', sessionId.slice(0, 8));

    // Create abort controller for this embedding operation
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      // Get embedding result
      const tabIdToUse = currentTabId ? currentTabId : await getCurrentTabId();

      if (signal.aborted) return;

      const result = await embedPageContentForTab(tabIdToUse, contentTimestamp);

      if (signal.aborted) return;

      if (result) {
        const timestamp = Date.now();

        // Store result in ref
        pageContentEmbeddingRef.current = {
          fullEmbedding: result.fullEmbedding,
          chunks: result.chunks as Array<{ text: string; html: string; embedding: number[] }>,
          formFieldEmbeddings: result.formFieldEmbeddings,
          clickableElementEmbeddings: result.clickableElementEmbeddings,
          timestamp,
        };

        debug.log('[usePageContentEmbedding] Embedding complete');
        debug.log('[usePageContentEmbedding] Chunks:', result.chunks?.length || 0);
        debug.log('[usePageContentEmbedding] Form groups:', result.formFieldGroupEmbeddings?.length || 0);
        debug.log('[usePageContentEmbedding] Clickable groups:', result.clickableElementGroupEmbeddings?.length || 0);

        // Store in IndexedDB asynchronously
        const pageURL = currentPageContent.url || window.location.href;
        const pageTitle = currentPageContent.title || document.title;

        // Fire async storage (tracked with signal)
        storeEmbeddingsInDB(result, pageURL, pageTitle, sessionId, signal)
          .then(() => {
            if (signal.aborted) return;

            // Update totals based on stored counts
            const htmlTotal = Array.isArray(result.chunks) ? result.chunks.length : 0;
            const formTotal = Array.isArray(result.formFieldGroupEmbeddings)
              ? result.formFieldGroupEmbeddings.length
              : 0;
            const clickTotal = Array.isArray(result.clickableElementGroupEmbeddings)
              ? result.clickableElementGroupEmbeddings.length
              : 0;

            setDbTotals({ html: htmlTotal, form: formTotal, click: clickTotal });

            debug.log('[usePageContentEmbedding] Totals updated:', {
              html: htmlTotal,
              form: formTotal,
              click: clickTotal,
            });
          })
          .catch(error => {
            if (!signal.aborted) {
              debug.error('[usePageContentEmbedding] Storage error:', error);
            }
          });
      }
    } catch (error) {
      if (!signal.aborted) {
        debug.error('[usePageContentEmbedding] Embedding failed:', error);
      }
    } finally {
      // Always clean up
      if (!signal.aborted) {
        isEmbeddingRef.current = false;
        lastEmbeddedKeyRef.current = contentKey;
        setIsEmbedding(false);
        setEmbeddingStatus('');
      }
    }
  }, [
    currentPageContent,
    isEmbeddingInitialized,
    embedPageContentForTab,
    initialize,
    sessionId,
    currentTabId,
    storeEmbeddingsInDB,
  ]);

  // ============================================================================
  // MAIN EFFECT
  // ============================================================================

  useEffect(() => {
    embedContent();

    // Cleanup: Abort any ongoing operations
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isEmbeddingRef.current = false;
    };
  }, [embedContent]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    pageContentEmbeddingRef,
    isEmbedding,
    embeddingStatus,
    dbTotals,
  };
};
