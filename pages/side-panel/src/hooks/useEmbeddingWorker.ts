/**
 * React hook for using embeddings via background service worker.
 * Updated to use chrome.runtime.sendMessage instead of web worker.
 */

import { useState, useEffect, useCallback } from 'react';
import { debug } from '@extension/shared';

interface UseEmbeddingWorkerOptions {
  autoInitialize?: boolean;
  onProgress?: (progress: { status: string; progress?: number }) => void;
}

interface EmbeddingState {
  isInitialized: boolean;
  isInitializing: boolean;
  isProcessing: boolean;
  error: Error | null;
  progress: { status: string; progress?: number } | null;
}

/**
 * React hook for using embeddings via background service worker.
 * Provides methods to initialize the embedding service and generate embeddings.
 * 
 * @param options - Configuration options
 * @param options.autoInitialize - Whether to automatically initialize on mount (default: false)
 * @param options.onProgress - Callback for progress updates
 * 
 * @returns Object containing:
 *   - isInitialized: boolean - Whether embedding service is ready
 *   - isInitializing: boolean - Whether initialization is in progress
 *   - isProcessing: boolean - Whether embedding generation is in progress
 *   - error: Error | null - Last error that occurred
 *   - progress: Progress object with status and percentage
 *   - initialize: Function to manually initialize the service
 *   - embedPageContent: Function to embed page content directly
 *   - embedPageContentForTab: Function to embed content for a specific tab
 *   - embedTexts: Function to generate embeddings for multiple texts
 * 
 * @example
 * ```tsx
 * const {
 *   isInitialized,
 *   initialize,
 *   embedPageContent,
 *   embedTexts
 * } = useEmbeddingWorker({ autoInitialize: true });
 * 
 * // Later...
 * const embeddings = await embedTexts(['hello', 'world']);
 * ```
 */
export function useEmbeddingWorker(options: UseEmbeddingWorkerOptions = {}) {
  const { autoInitialize = false, onProgress } = options;

  const [state, setState] = useState<EmbeddingState>({
    isInitialized: false,
    isInitializing: false,
    isProcessing: false,
    error: null,
    progress: null,
  });

  // Initialize embedding service in background - using onMessage pattern
  const initialize = useCallback(() => {
    if (state.isInitialized || state.isInitializing) {
      debug.log('[useEmbeddingWorker] Already initialized or initializing');
      return Promise.resolve();
    }

    debug.log('[useEmbeddingWorker] Initializing embedding service in background...');
    setState(prev => ({ ...prev, isInitializing: true, error: null }));

    return new Promise<void>((resolve, reject) => {
      const requestId = `init_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Set up listener for response with timeout
      const responseListener = (message: any, sender: any) => {
        debug.log(
          '[useEmbeddingWorker] Received message:',
          message.type,
          'requestId:',
          message.requestId,
          'looking for:',
          requestId,
        );

        if (message.type === 'initializeEmbeddingResponse' && message.requestId === requestId) {
          debug.log('[useEmbeddingWorker] Message matched! Full message:', JSON.stringify(message));
          clearTimeout(timeoutHandle);
          chrome.runtime.onMessage.removeListener(responseListener);

          if (message.success) {
            debug.log('[useEmbeddingWorker] Embedding service initialized');
            setState(prev => ({
              ...prev,
              isInitialized: true,
              isInitializing: false,
              progress: { status: 'Ready', progress: 100 },
            }));
            onProgress?.({ status: 'Ready', progress: 100 });
            resolve();
          } else {
            const e = new Error(message.error || 'Failed to initialize');
            debug.error('[useEmbeddingWorker] Initialization failed:', e);
            setState(prev => ({
              ...prev,
              isInitializing: false,
              error: e,
            }));
            reject(e);
          }
        }
      };

      chrome.runtime.onMessage.addListener(responseListener);

      // Timeout after 30 seconds
      const timeoutHandle = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(responseListener);
        const err = new Error('Initialization timeout - no response from background');
        debug.error('[useEmbeddingWorker] Initialization timeout');
        setState(prev => ({
          ...prev,
          isInitializing: false,
          error: err,
        }));
        reject(err);
      }, 30000);

      // Send initialization request
      debug.log('[useEmbeddingWorker] Sending init request with ID:', requestId);
      chrome.runtime
        .sendMessage({
          type: 'initializeEmbedding',
          requestId,
        })
        .then(() => {
          debug.log('[useEmbeddingWorker] Init request sent successfully');
        })
        .catch(e => {
          clearTimeout(timeoutHandle);
          chrome.runtime.onMessage.removeListener(responseListener);
          debug.error('[useEmbeddingWorker] Failed to send init request:', e);
          setState(prev => ({
            ...prev,
            isInitializing: false,
            error: e,
          }));
          reject(e);
        });
    });
  }, [onProgress, state.isInitialized, state.isInitializing]);

  // Generate embedding for page content - Direct message passing (no storage)
  const embedPageContent = useCallback(
    async (content: any): Promise<any> => {
      if (!state.isInitialized) {
        throw new Error('Embedding service not initialized');
      }

      // Avoid heavy stringify in the panel thread: only log an approximate size
      let sizeKB = '0.00';
      let sizeMB = '0.00';
      try {
        const approxHtml = content?.allDOMContent?.fullHTML?.length || 0;
        const approxText = content?.textContent?.length || 0;
        const approxForms = (content?.allDOMContent?.allFormData?.length || 0) * 200;
        const approxClickable = (content?.allDOMContent?.clickableElements?.length || 0) * 140;
        const approxTotal = approxHtml + approxText + approxForms + approxClickable;
        sizeKB = (approxTotal / 1024).toFixed(2);
        sizeMB = (approxTotal / (1024 * 1024)).toFixed(2);
      } catch {}

      debug.log('[useEmbeddingWorker] Sending page content embedding request...');
      debug.log('[useEmbeddingWorker] Approx content size:', sizeKB, 'KB (', sizeMB, 'MB)');
      debug.log(
        '[useEmbeddingWorker] content.allDOMContent.allFormData:',
        content.allDOMContent?.allFormData?.length || 0,
        'items',
      );
      debug.log(
        '[useEmbeddingWorker] content.allDOMContent.clickableElements:',
        content.allDOMContent?.clickableElements?.length || 0,
        'items',
      );
      debug.log('[useEmbeddingWorker] About to serialize and send - this may freeze UI temporarily...');
      setState(prev => ({ ...prev, isProcessing: true, error: null }));

      return new Promise((resolve, reject) => {
        let requestId: string;
        let timeoutHandle: NodeJS.Timeout;

        // Set up listener for the result
        const resultListener = (message: any) => {
          debug.log(
            '[useEmbeddingWorker] Received message type:',
            message.type,
            'requestId:',
            message.requestId,
            'expectedId:',
            requestId,
          );

          if (message.type === 'embeddingComplete' && message.requestId === requestId) {
            const receiveTime = performance.now();
            debug.log('[useEmbeddingWorker] embeddingComplete matched, processing response...');
            clearTimeout(timeoutHandle);
            chrome.runtime.onMessage.removeListener(resultListener);

            if (message.error) {
              const e = new Error(message.error);
              debug.error('[useEmbeddingWorker] Page content embedding failed:', e);
              setState(prev => ({ ...prev, isProcessing: false, error: e }));
              reject(e);
            } else {
              debug.log(
                '[useEmbeddingWorker] Response size - embeddings:',
                message.result.fullEmbedding.length,
                'dimensions,',
                message.result.chunks.length,
                'chunks',
              );

              debug.log(
                '[useEmbeddingWorker] Page content embedded (processing took',
                (performance.now() - receiveTime).toFixed(0),
                'ms)',
              );
              setState(prev => ({ ...prev, isProcessing: false }));
              resolve(message.result);
            }
          }
        };

        chrome.runtime.onMessage.addListener(resultListener);

        // Timeout after 60 seconds for large content
        timeoutHandle = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(resultListener);
          const err = new Error('Page content embedding timeout');
          debug.error('[useEmbeddingWorker] Page content embedding timeout');
          setState(prev => ({ ...prev, isProcessing: false, error: err }));
          reject(err);
        }, 60000);

        // Generate request ID
        requestId = `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Send content directly in message
        const sendStartTime = performance.now();
        debug.log('[useEmbeddingWorker] Starting sendMessage (serialization begins now)...');

        chrome.runtime
          .sendMessage({
            type: 'embedPageContent',
            content,
            requestId,
          })
          .then(() => {
            const sendDuration = (performance.now() - sendStartTime).toFixed(0);
            debug.log('[useEmbeddingWorker] Request sent, waiting for result... (serialization took', sendDuration, 'ms)');
          })
          .catch(e => {
            clearTimeout(timeoutHandle);
            debug.error('[useEmbeddingWorker] Failed to send request:', e);
            chrome.runtime.onMessage.removeListener(resultListener);
            setState(prev => ({ ...prev, isProcessing: false, error: e }));
            reject(e);
          });
      });
    },
    [state.isInitialized],
  );

  // NEW: Generate embeddings for the current tab WITHOUT sending large payloads.
  // This avoids main-thread freeze from structured cloning in the side panel.
  const embedPageContentForTab = useCallback(
    async (tabId: number, contentTimestamp?: number): Promise<any> => {
      if (!state.isInitialized) {
        throw new Error('Embedding service not initialized');
      }

      debug.log('[useEmbeddingWorker TAB] Requesting embedding for TAB (no payload):', { tabId, contentTimestamp });
      setState(prev => ({ ...prev, isProcessing: true, error: null }));

      return new Promise((resolve, reject) => {
        const requestId = `embed_tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Timeout after 60 seconds
        const timeoutHandle = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(resultListener);
          const err = new Error('Tab embedding timeout');
          debug.error('[useEmbeddingWorker TAB] Tab embedding timeout');
          setState(prev => ({ ...prev, isProcessing: false, error: err }));
          reject(err);
        }, 60000);

        const resultListener = (message: any) => {
          debug.log(
            '[useEmbeddingWorker TAB] Received message type:',
            message.type,
            'requestId:',
            message.requestId,
            'expectedId:',
            requestId,
          );

          if (message.type === 'embeddingComplete' && message.requestId === requestId) {
            debug.log('[useEmbeddingWorker TAB] embeddingComplete matched!');
            clearTimeout(timeoutHandle);
            chrome.runtime.onMessage.removeListener(resultListener);

            if (message.error) {
              const e = new Error(message.error);
              debug.error('[useEmbeddingWorker TAB] Tab embedding failed:', e);
              setState(prev => ({ ...prev, isProcessing: false, error: e }));
              reject(e);
            } else {
              debug.log('[useEmbeddingWorker TAB] Tab embedding complete');
              setState(prev => ({ ...prev, isProcessing: false }));
              resolve(message.result);
            }
          }
        };

        chrome.runtime.onMessage.addListener(resultListener);

        chrome.runtime
          .sendMessage({
            type: 'embedPageContentForTab',
            tabId,
            timestamp: contentTimestamp,
            requestId,
          })
          .catch(e => {
            clearTimeout(timeoutHandle);
            chrome.runtime.onMessage.removeListener(resultListener);
            setState(prev => ({ ...prev, isProcessing: false, error: e }));
            reject(e);
          });
      });
    },
    [state.isInitialized],
  );

  // Generate embeddings for multiple texts - using onMessage pattern
  const embedTexts = useCallback(
    (texts: string[]): Promise<number[][]> => {
      if (!state.isInitialized) {
        throw new Error('Embedding service not initialized');
      }

      debug.log('[useEmbeddingWorker] Sending batch embedding request to background...');
      setState(prev => ({ ...prev, isProcessing: true, error: null }));

      return new Promise((resolve, reject) => {
        const requestId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Timeout after 30 seconds for batch operations
        const timeoutHandle = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(responseListener);
          const err = new Error('Batch embedding timeout');
          debug.error('[useEmbeddingWorker] Batch embedding timeout');
          setState(prev => ({ ...prev, isProcessing: false, error: err }));
          reject(err);
        }, 30000);

        // Set up listener for response
        const responseListener = (message: any) => {
          if (message.type === 'generateEmbeddingsResponse' && message.requestId === requestId) {
            clearTimeout(timeoutHandle);
            chrome.runtime.onMessage.removeListener(responseListener);

            if (message.success) {
              debug.log(
                '[useEmbeddingWorker] Batch embeddings generated:',
                message.embeddings.length,
                'embeddings',
              );
              setState(prev => ({ ...prev, isProcessing: false }));
              resolve(message.embeddings as number[][]);
            } else {
              const err = new Error(message.error || 'Failed to generate embeddings');
              debug.error('[useEmbeddingWorker] Batch embedding generation failed:', err);
              setState(prev => ({ ...prev, isProcessing: false, error: err }));
              reject(err);
            }
          }
        };

        chrome.runtime.onMessage.addListener(responseListener);

        // Send request
        chrome.runtime
          .sendMessage({
            type: 'generateEmbeddings',
            texts,
            requestId,
          })
          .catch(err => {
            clearTimeout(timeoutHandle);
            chrome.runtime.onMessage.removeListener(responseListener);
            setState(prev => ({ ...prev, isProcessing: false, error: err }));
            reject(err);
          });
      });
    },
    [state.isInitialized],
  );

  // Auto-initialize on mount if requested
  useEffect(() => {
    if (autoInitialize && !state.isInitialized && !state.isInitializing && !state.error) {
      debug.log('[useEmbeddingWorker] Auto-initializing...');
      initialize();
    }
  }, [autoInitialize, initialize, state.isInitialized, state.isInitializing, state.error]);

  return {
    isInitialized: state.isInitialized,
    isInitializing: state.isInitializing,
    isProcessing: state.isProcessing,
    error: state.error,
    progress: state.progress,
    initialize,
    embedPageContent,
    embedPageContentForTab,
    embedTexts,
  };
}
