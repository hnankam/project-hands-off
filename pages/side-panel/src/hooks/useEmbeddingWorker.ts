/**
 * React hook for using embeddings via background service worker
 * Updated to use chrome.runtime.sendMessage instead of web worker
 */

import { useState, useEffect, useCallback } from 'react';
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
  const {
    autoInitialize = false,
    model = EmbeddingModel.ALL_MINILM_L6_V2,
    onProgress,
  } = options;

  const [state, setState] = useState<EmbeddingState>({
    isInitialized: false,
    isInitializing: false,
    isProcessing: false,
    error: null,
    progress: null,
  });

  // Initialize embedding service in background
  const initialize = useCallback(async () => {
    if (state.isInitialized || state.isInitializing) {
      console.log('[useEmbeddingWorker] Already initialized or initializing');
      return;
    }

    console.log('[useEmbeddingWorker] 🚀 Initializing embedding service in background...');
    setState(prev => ({ ...prev, isInitializing: true, error: null }));

    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'initializeEmbedding',
        model 
      });

      if (response.success) {
        console.log('[useEmbeddingWorker] ✅ Embedding service initialized');
        setState(prev => ({ 
          ...prev, 
          isInitialized: true, 
          isInitializing: false,
          progress: { status: 'Ready', progress: 100 }
        }));
        onProgress?.({ status: 'Ready', progress: 100 });
      } else {
        throw new Error(response.error || 'Failed to initialize');
      }
    } catch (error) {
      console.error('[useEmbeddingWorker] ❌ Initialization failed:', error);
      const err = error instanceof Error ? error : new Error('Unknown error');
      setState(prev => ({ 
        ...prev, 
        isInitializing: false, 
        error: err 
      }));
    }
  }, [model, onProgress, state.isInitialized, state.isInitializing]);

  // Generate embedding for page content
  const embedPageContent = useCallback(async (content: any) => {
    if (!state.isInitialized) {
      throw new Error('Embedding service not initialized');
    }

    console.log('[useEmbeddingWorker] 📤 Sending page content embedding request to background...');
    console.log('[useEmbeddingWorker] DEBUG - content.allDOMContent?.allFormData:', content.allDOMContent?.allFormData?.length || 0, 'items');
    console.log('[useEmbeddingWorker] DEBUG - content.allDOMContent?.clickableElements:', content.allDOMContent?.clickableElements?.length || 0, 'items');
    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'embedPageContent',
        content
      });

      if (response.success) {
        console.log('[useEmbeddingWorker] ✅ Page content embedded:', response.result.fullEmbedding.length, 'dimensions,', response.result.chunks.length, 'chunks');
        setState(prev => ({ ...prev, isProcessing: false }));
        return response.result;
      } else {
        throw new Error(response.error || 'Failed to embed page content');
      }
    } catch (error) {
      console.error('[useEmbeddingWorker] ❌ Page content embedding failed:', error);
      const err = error instanceof Error ? error : new Error('Unknown error');
      setState(prev => ({ ...prev, isProcessing: false, error: err }));
      throw err;
    }
  }, [state.isInitialized]);

  // Generate embeddings for multiple texts
  const embedTexts = useCallback(async (texts: string[]) => {
    if (!state.isInitialized) {
      throw new Error('Embedding service not initialized');
    }

    console.log('[useEmbeddingWorker] 📤 Sending batch embedding request to background...');
    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'generateEmbeddings',
        texts
      });

      if (response.success) {
        console.log('[useEmbeddingWorker] ✅ Batch embeddings generated:', response.embeddings.length, 'embeddings');
        setState(prev => ({ ...prev, isProcessing: false }));
        return response.embeddings as number[][];
      } else {
        throw new Error(response.error || 'Failed to generate embeddings');
      }
    } catch (error) {
      console.error('[useEmbeddingWorker] ❌ Batch embedding generation failed:', error);
      const err = error instanceof Error ? error : new Error('Unknown error');
      setState(prev => ({ ...prev, isProcessing: false, error: err }));
      throw err;
    }
  }, [state.isInitialized]);

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
    embedTexts,
  };
}
