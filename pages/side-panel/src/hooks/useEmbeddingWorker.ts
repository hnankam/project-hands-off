/**
 * React hook for using embeddings via background service worker
 * Updated to use chrome.runtime.sendMessage instead of web worker
 */

import { useState, useEffect, useCallback } from 'react';

// Debug toggle (set false in production)
const DEBUG = false;
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const log = (...args: any[]) => DEBUG && console.log(ts(), ...args);
const elog = (...args: any[]) => console.error(ts(), ...args);
import { EmbeddingModel } from '@extension/shared';

interface UseEmbeddingWorkerOptions {
  autoInitialize?: boolean;
  model?: EmbeddingModel;
  onProgress?: (progress: { status: string; progress?: number }) => void;
}

interface EmbeddingState {
  isInitialized: boolean;
  isInitializing: boolean;
  isProcessing: boolean;
  error: Error | null;
  progress: { status: string; progress?: number } | null;
}

export function useEmbeddingWorker(options: UseEmbeddingWorkerOptions = {}) {
  const { autoInitialize = false, model = EmbeddingModel.ALL_MINILM_L6_V2, onProgress } = options;

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
      log('[useEmbeddingWorker] Already initialized or initializing');
      return Promise.resolve();
    }

    log('[useEmbeddingWorker] 🚀 Initializing embedding service in background...');
    setState(prev => ({ ...prev, isInitializing: true, error: null }));

    return new Promise<void>((resolve, reject) => {
      const requestId = `init_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Set up listener for response with timeout
      const responseListener = (message: any, sender: any) => {
        log(
          '[useEmbeddingWorker] 📬 Received message:',
          message.type,
          'requestId:',
          message.requestId,
          'looking for:',
          requestId,
        );

        if (message.type === 'initializeEmbeddingResponse' && message.requestId === requestId) {
          log('[useEmbeddingWorker] ✅ Message matched! Full message:', JSON.stringify(message));
          clearTimeout(timeoutHandle);
          chrome.runtime.onMessage.removeListener(responseListener);

          if (message.success) {
            log('[useEmbeddingWorker] ✅ Embedding service initialized');
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
            elog('[useEmbeddingWorker] ❌ Initialization failed:', e);
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
        console.error('[useEmbeddingWorker] ❌ Initialization timeout');
        setState(prev => ({
          ...prev,
          isInitializing: false,
          error: err,
        }));
        reject(err);
      }, 30000);

      // Send initialization request
      log('[useEmbeddingWorker] 📤 Sending init request with ID:', requestId);
      chrome.runtime
        .sendMessage({
          type: 'initializeEmbedding',
          model,
          requestId,
        })
        .then(() => {
          log('[useEmbeddingWorker] ✅ Init request sent successfully');
        })
        .catch(e => {
          clearTimeout(timeoutHandle);
          chrome.runtime.onMessage.removeListener(responseListener);
          elog('[useEmbeddingWorker] ❌ Failed to send init request:', e);
          setState(prev => ({
            ...prev,
            isInitializing: false,
            error: e,
          }));
          reject(e);
        });
    });
  }, [model, onProgress, state.isInitialized, state.isInitializing]);

  // Generate embedding for page content - Direct message passing (no storage)
  const embedPageContent = useCallback(
    async (content: any): Promise<any> => {
      if (!state.isInitialized) {
        throw new Error('Embedding service not initialized');
      }

      const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

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

      log('[useEmbeddingWorker] 📤 Sending page content embedding request...');
      log('[useEmbeddingWorker] 📦 Approx content size:', sizeKB, 'KB (', sizeMB, 'MB)');
      log(
        '[useEmbeddingWorker] DEBUG - content.allDOMContent?.allFormData:',
        content.allDOMContent?.allFormData?.length || 0,
        'items',
      );
      log(
        '[useEmbeddingWorker] DEBUG - content.allDOMContent?.clickableElements:',
        content.allDOMContent?.clickableElements?.length || 0,
        'items',
      );
      log('[useEmbeddingWorker] ⚠️  About to serialize and send - this may freeze UI temporarily...');
      setState(prev => ({ ...prev, isProcessing: true, error: null }));

      return new Promise((resolve, reject) => {
        let requestId: string;

        // Set up listener for the result
        const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
        const resultListener = (message: any) => {
          log(
            '[useEmbeddingWorker] 📬 Received message type:',
            message.type,
            'requestId:',
            message.requestId,
            'expectedId:',
            requestId,
          );

          if (message.type === 'embeddingComplete' && message.requestId === requestId) {
            const receiveTime = performance.now();
            log('[useEmbeddingWorker] 🎯 embeddingComplete matched, processing response...');
            chrome.runtime.onMessage.removeListener(resultListener);

            if (message.error) {
              const e = new Error(message.error);
              elog('[useEmbeddingWorker] ❌ Page content embedding failed:', e);
              setState(prev => ({ ...prev, isProcessing: false, error: e }));
              reject(e);
            } else {
              log(
                '[useEmbeddingWorker] 📦 Response size - embeddings:',
                message.result.fullEmbedding.length,
                'dimensions,',
                message.result.chunks.length,
                'chunks',
              );

              // DEBUG: Check embeddings RIGHT AFTER receiving from background
              log('[useEmbeddingWorker] 🔍 DEBUG - First chunk AFTER receiving:', {
                hasEmbedding: !!message.result.chunks?.[0]?.embedding,
                isArray: Array.isArray(message.result.chunks?.[0]?.embedding),
                length: message.result.chunks?.[0]?.embedding?.length,
                firstValue: message.result.chunks?.[0]?.embedding?.[0],
                first5: message.result.chunks?.[0]?.embedding?.slice(0, 5),
                typeOfFirst: typeof message.result.chunks?.[0]?.embedding?.[0],
              });

              log(
                '[useEmbeddingWorker] ✅ Page content embedded (processing took',
                (performance.now() - receiveTime).toFixed(0),
                'ms)',
              );
              setState(prev => ({ ...prev, isProcessing: false }));
              resolve(message.result);
            }
          }
        };

        chrome.runtime.onMessage.addListener(resultListener);

        // Generate request ID
        requestId = `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Send content directly in message
        const sendStartTime = performance.now();
        log('[useEmbeddingWorker] 🔄 Starting sendMessage (serialization begins now)...');

        chrome.runtime
          .sendMessage({
            type: 'embedPageContent',
            content,
            requestId,
          })
          .then(() => {
            const sendDuration = (performance.now() - sendStartTime).toFixed(0);
            log('[useEmbeddingWorker] ✅ Request sent, waiting for result... (serialization took', sendDuration, 'ms)');
          })
          .catch(e => {
            elog('[useEmbeddingWorker] ❌ Failed to send request:', e);
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

      const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

      log('[useEmbeddingWorker] 📤 Requesting embedding for TAB (no payload):', { tabId, contentTimestamp });
      setState(prev => ({ ...prev, isProcessing: true, error: null }));

      return new Promise((resolve, reject) => {
        const requestId = `embed_tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const resultListener = (message: any) => {
          log(
            '[useEmbeddingWorker TAB] 📬 Received message type:',
            message.type,
            'requestId:',
            message.requestId,
            'expectedId:',
            requestId,
          );

          if (message.type === 'embeddingComplete' && message.requestId === requestId) {
            log('[useEmbeddingWorker TAB] 🎯 embeddingComplete matched!');
            chrome.runtime.onMessage.removeListener(resultListener);

            if (message.error) {
              const e = new Error(message.error);
              elog('[useEmbeddingWorker TAB] ❌ Tab embedding failed:', e);
              setState(prev => ({ ...prev, isProcessing: false, error: e }));
              reject(e);
            } else {
              log('[useEmbeddingWorker TAB] ✅ Tab embedding complete');
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

      console.log('[useEmbeddingWorker] 📤 Sending batch embedding request to background...');
      setState(prev => ({ ...prev, isProcessing: true, error: null }));

      return new Promise((resolve, reject) => {
        const requestId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Set up listener for response
        const responseListener = (message: any) => {
          if (message.type === 'generateEmbeddingsResponse' && message.requestId === requestId) {
            chrome.runtime.onMessage.removeListener(responseListener);

            if (message.success) {
              console.log(
                '[useEmbeddingWorker] ✅ Batch embeddings generated:',
                message.embeddings.length,
                'embeddings',
              );
              setState(prev => ({ ...prev, isProcessing: false }));
              resolve(message.embeddings as number[][]);
            } else {
              const err = new Error(message.error || 'Failed to generate embeddings');
              console.error('[useEmbeddingWorker] ❌ Batch embedding generation failed:', err);
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
      console.log('[useEmbeddingWorker] Auto-initializing...');
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
