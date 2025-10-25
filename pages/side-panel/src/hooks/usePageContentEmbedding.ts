/**
 * ================================================================================
 * usePageContentEmbedding Hook
 * ================================================================================
 * 
 * Custom hook that manages page content embedding lifecycle:
 * - Generates embeddings for HTML chunks, form fields, and clickable elements
 * - Stores embeddings in SurrealDB with HNSW indexes for fast vector search
 * - Prevents duplicate embedding of the same content
 * - Manages embedding state and progress
 * - Updates database totals for agent consumption
 * 
 * @module usePageContentEmbedding
 * ================================================================================
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { embeddingsStorage } from '@extension/shared';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

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

export const usePageContentEmbedding = ({
  currentPageContent,
  isEmbeddingInitialized,
  isEmbeddingProcessing,
  embedPageContentForTab,
  initialize,
  sessionId,
  currentTabId,
}: UsePageContentEmbeddingParams) => {
  // Embedding state
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState('');
  
  // DB-backed totals for agent consumption
  const [dbTotals, setDbTotals] = useState<{ html: number; form: number; click: number }>({
    html: 0,
    form: 0,
    click: 0,
  });

  // Ref to store current embedding result
  const pageContentEmbeddingRef = useRef<PageContentEmbeddingResult | null>(null);

  // Refs to prevent infinite loops and duplicate embeddings
  const isEmbeddingRef = useRef(false);
  const lastEmbeddedKeyRef = useRef<string>('');
  const isEmbeddingProcessingRef = useRef<boolean>(false);

  // Update processing ref when state changes
  useEffect(() => {
    isEmbeddingProcessingRef.current = isEmbeddingProcessing;
  }, [isEmbeddingProcessing]);

  // Main embedding effect
  useEffect(() => {
    const embedContent = () => {
      // DEBUG: Log state for diagnosis
      console.log(ts(), '[usePageContentEmbedding] 🔍 Embedding check:', {
        hasContent: !!currentPageContent,
        isInitialized: isEmbeddingInitialized,
        isProcessing: isEmbeddingProcessingRef.current,
        contentURL: currentPageContent?.url,
        contentTimestamp: currentPageContent?.timestamp,
      });

      // Only embed if we have content and the embedding worker is ready
      if (!currentPageContent || !isEmbeddingInitialized || isEmbeddingProcessingRef.current) {
        // Always log the reason for skipping (critical for debugging)
        if (!currentPageContent) {
          console.log(ts(), '[usePageContentEmbedding] ⏸️  No page content yet, skipping embedding');
        } else if (!isEmbeddingInitialized) {
          console.log(ts(), '[usePageContentEmbedding] ⏸️  Embedding worker NOT initialized yet, waiting...');
          // Trigger on-demand initialization (debounced by hook guards)
          initialize().catch(() => {});
        } else if (isEmbeddingProcessingRef.current) {
          console.log(ts(), '[usePageContentEmbedding] ⏸️  Embedding already in progress, waiting...');
        }
        return;
      }

      // Prevent infinite loop - check if already embedding
      if (isEmbeddingRef.current) {
        console.log(ts(), '[usePageContentEmbedding] ⏸️  Already embedding, skipping to prevent loop');
        return;
      }

      // Create a unique key for this content (URL + content timestamp)
      const contentTimestamp = currentPageContent.timestamp;
      const contentKey = `${currentPageContent.url}_${contentTimestamp}`;

      // Check if we've already embedded this exact content
      if (lastEmbeddedKeyRef.current === contentKey) {
        console.log(ts(), '[usePageContentEmbedding] ⏸️  Content already embedded (same URL + timestamp), skipping');
        return;
      }

      console.log(ts(), '[usePageContentEmbedding] 📝 Content key:', contentKey);
      console.log(ts(), '[usePageContentEmbedding] 📝 Last embedded key:', lastEmbeddedKeyRef.current);

      // Also check if content has changed since last embedding (legacy check)
      if (pageContentEmbeddingRef.current && pageContentEmbeddingRef.current.timestamp >= contentTimestamp) {
        // Content already embedded, no need to log
        return;
      }

      // Check if we have actual content data (not just stale/empty content)
      if (currentPageContent.allDOMContent) {
        const hasFormData =
          currentPageContent.allDOMContent.allFormData && currentPageContent.allDOMContent.allFormData.length > 0;
        const hasClickableElements =
          currentPageContent.allDOMContent.clickableElements &&
          currentPageContent.allDOMContent.clickableElements.length > 0;
        const hasHTML =
          currentPageContent.allDOMContent.fullHTML && currentPageContent.allDOMContent.fullHTML.length > 0;

        if (!hasHTML && !hasFormData && !hasClickableElements) {
          console.log(ts(), '[usePageContentEmbedding] ⏸️  Skipping embedding - waiting for fresh content with actual data');
          return;
        }
      }

      // All checks passed - set flag NOW to prevent race conditions
      isEmbeddingRef.current = true;
      console.log(ts(), '[usePageContentEmbedding] 🔄 About to trigger React state updates (may cause re-renders)...');
      const stateUpdateStart = performance.now();
      setIsEmbedding(true);
      setEmbeddingStatus('Generating embeddings...');
      console.log(
        ts(),
        '[usePageContentEmbedding] ✅ State updates complete, took',
        (performance.now() - stateUpdateStart).toFixed(2),
        'ms',
      );

      // Log embedding trigger
      console.log(ts(), '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(ts(), '[usePageContentEmbedding] 🚀 AUTO-EMBEDDING TRIGGERED');
      console.log(ts(), '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(ts(), '[usePageContentEmbedding]    Trigger: Page content changed');
      console.log(ts(), '[usePageContentEmbedding]    Page URL:', currentPageContent.url || 'unknown');
      console.log(ts(), '[usePageContentEmbedding]    Page title:', currentPageContent.title || 'untitled');
      console.log(ts(), '[usePageContentEmbedding]    Session ID:', sessionId);
      console.log(ts(), '[usePageContentEmbedding]    Content timestamp:', contentTimestamp);
      console.log(ts(), '[usePageContentEmbedding]    Current time:', new Date().toISOString());
      console.log(
        ts(),
        '[usePageContentEmbedding] DEBUG - allFormData:',
        currentPageContent.allDOMContent?.allFormData?.length || 0,
        'items',
      );
      console.log(
        ts(),
        '[usePageContentEmbedding] DEBUG - clickableElements:',
        currentPageContent.allDOMContent?.clickableElements?.length || 0,
        'items',
      );

      // Fire embedding request and handle response asynchronously
      const startTabEmbedding = (tabIdToUse: number) => embedPageContentForTab(tabIdToUse, contentTimestamp);

      const embedPromise: Promise<any> = currentTabId
        ? startTabEmbedding(currentTabId)
        : new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'getCurrentTab' }, response => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
              }
              const tabIdResp = response?.tabId as number | null;
              if (tabIdResp) {
                startTabEmbedding(tabIdResp).then(resolve).catch(reject);
              } else {
                reject(new Error('No active tabId available for embedding'));
              }
            });
          });

      embedPromise
        .then(result => {
          try {
            if (result) {
              const timestamp = Date.now();

              pageContentEmbeddingRef.current = {
                fullEmbedding: result.fullEmbedding,
                chunks: result.chunks as Array<{ text: string; html: string; embedding: number[] }>,
                formFieldEmbeddings: result.formFieldEmbeddings,
                clickableElementEmbeddings: result.clickableElementEmbeddings,
                timestamp,
              };

              console.log(ts(), '[usePageContentEmbedding] ✅ AUTO-EMBEDDING COMPLETE');
              console.log(ts(), '[usePageContentEmbedding]    Full embedding dimensions:', result.fullEmbedding.length);
              console.log(
                ts(),
                '[usePageContentEmbedding]    Full embedding sample:',
                result.fullEmbedding
                  .slice(0, 5)
                  .map((v: number) => v.toFixed(4))
                  .join(', ') + '...',
              );
              console.log(ts(), '[usePageContentEmbedding]    Chunks generated:', result.chunks?.length || 0);
              
              if (result.chunks && result.chunks.length > 0) {
                const firstChunk = result.chunks[0] as { text: string; html: string; embedding: number[] };
                console.log(ts(), '[usePageContentEmbedding]    First chunk text length:', firstChunk.text.length, 'chars');
                console.log(ts(), '[usePageContentEmbedding]    First chunk HTML length:', firstChunk.html.length, 'chars');
                console.log(
                  ts(),
                  '[usePageContentEmbedding]    First chunk embedding sample:',
                  firstChunk.embedding
                    .slice(0, 5)
                    .map((v: number) => v.toFixed(4))
                    .join(', ') + '...',
                );
              }

              // Store in SurrealDB asynchronously
              (async () => {
                try {
                  console.log(ts(), '[usePageContentEmbedding]    Storing in SurrealDB with HNSW indexes...');
                  const pageURL = currentPageContent.url || window.location.href;
                  const pageTitle = currentPageContent.title || document.title;

                  // Store HTML chunks with HNSW index
                  if (result.chunks && result.chunks.length > 0) {
                    console.log(ts(), '[usePageContentEmbedding]    → Storing HTML chunks with HNSW index...');
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
                    console.log(ts(), '[usePageContentEmbedding]    ✅ HTML chunks stored with HNSW index');
                  }

                  // Store form field groups with HNSW index
                  if (result.formFieldGroupEmbeddings && result.formFieldGroupEmbeddings.length > 0) {
                    console.log(ts(), '[usePageContentEmbedding]    → Storing form field groups with HNSW index...');
                    await embeddingsStorage.storeFormFields({
                      pageURL,
                      groups: result.formFieldGroupEmbeddings,
                      sessionId,
                    });
                    console.log(ts(), '[usePageContentEmbedding]    ✅ Form field groups stored with HNSW index');
                  }

                  // Store clickable element groups with HNSW index
                  if (result.clickableElementGroupEmbeddings && result.clickableElementGroupEmbeddings.length > 0) {
                    console.log(ts(), '[usePageContentEmbedding]    → Storing clickable element groups with HNSW index...');
                    await embeddingsStorage.storeClickableElements({
                      pageURL,
                      groups: result.clickableElementGroupEmbeddings,
                      sessionId,
                    });
                    console.log(ts(), '[usePageContentEmbedding]    ✅ Clickable element groups stored with HNSW index');
                  }

                  console.log(ts(), '[usePageContentEmbedding] ✅ ALL EMBEDDINGS STORED in SurrealDB with HNSW indexes');
                  console.log(ts(), '[usePageContentEmbedding]    Storage type: In-memory with native vector search');
                  console.log(ts(), '[usePageContentEmbedding]    HTML chunks:', result.chunks?.length || 0, '(HNSW indexed)');
                  console.log(
                    ts(),
                    '[usePageContentEmbedding]    Form field groups:',
                    result.formFieldGroupEmbeddings?.length || 0,
                    '(HNSW indexed)',
                  );
                  console.log(
                    ts(),
                    '[usePageContentEmbedding]    Clickable element groups:',
                    result.clickableElementGroupEmbeddings?.length || 0,
                    '(HNSW indexed)',
                  );
                  console.log(ts(), '[usePageContentEmbedding]    Session ID:', sessionId);
                  
                  // Set totals based on rows just inserted
                  const htmlTotal = Array.isArray(result.chunks) ? result.chunks.length : 0;
                  const formTotal = Array.isArray(result.formFieldGroupEmbeddings)
                    ? result.formFieldGroupEmbeddings.length
                    : 0;
                  const clickTotal = Array.isArray(result.clickableElementGroupEmbeddings)
                    ? result.clickableElementGroupEmbeddings.length
                    : 0;
                  
                  setDbTotals({ html: htmlTotal, form: formTotal, click: clickTotal });
                  console.log(ts(), '[usePageContentEmbedding] 📊 Totals (from insert rows):', {
                    htmlTotal,
                    formTotal,
                    clickTotal,
                  });
                } catch (storageError) {
                  console.warn(ts(), '[usePageContentEmbedding] ⚠️  Failed to store in SurrealDB:', storageError);
                }
              })();
              
              console.log(ts(), '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            }
          } catch (error) {
            console.error(ts(), '[usePageContentEmbedding] ❌ Failed to embed page content:', error);
            console.log(ts(), '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          } finally {
            // Always clear the flag when done
            isEmbeddingRef.current = false;
            lastEmbeddedKeyRef.current = contentKey;
            
            console.log(ts(), '[usePageContentEmbedding] 🔄 About to clear embedding state (may cause re-render)...');
            const clearStateStart = performance.now();
            setIsEmbedding(false);
            setEmbeddingStatus('');
            console.log(
              ts(),
              '[usePageContentEmbedding] ✅ State cleared, took',
              (performance.now() - clearStateStart).toFixed(2),
              'ms',
            );
          }
        })
        .catch(error => {
          console.error(ts(), '[usePageContentEmbedding] ❌ Failed to embed page content:', error);
          console.log(ts(), '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          
          isEmbeddingRef.current = false;
          lastEmbeddedKeyRef.current = contentKey;
          
          console.log(ts(), '[usePageContentEmbedding] 🔄 About to clear embedding state (error path)...');
          const clearStateStart = performance.now();
          setIsEmbedding(false);
          setEmbeddingStatus('');
          console.log(
            ts(),
            '[usePageContentEmbedding] ✅ State cleared, took',
            (performance.now() - clearStateStart).toFixed(2),
            'ms',
          );
        });
    };

    embedContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageContent?.url, currentPageContent?.timestamp, isEmbeddingInitialized, sessionId]);

  return {
    pageContentEmbeddingRef,
    isEmbedding,
    embeddingStatus,
    dbTotals,
  };
};

