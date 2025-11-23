/**
 * @fileoverview Embedding Helper Functions
 * 
 * Shared utilities for embedding validation and worker management.
 * Used by offscreen.ts to eliminate code duplication.
 * 
 * @module offscreen/embedding-helpers
 */

import { EMBEDDING_DIMENSION, WORKER_INIT_TIMEOUT_MS } from './embedding-config.js';

// Timestamp helper
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const DEBUG = true;
const log = (...args: any[]) => DEBUG && console.log(...args);
const warn = (...args: any[]) => DEBUG && console.warn(...args);

/**
 * Validate and fix a single embedding vector
 * Replaces invalid values (null, undefined, NaN) with zeros
 * 
 * @param embedding - Embedding vector to validate
 * @param index - Optional index for logging (for batch processing)
 * @param source - Source of embedding (for logging: 'WebGPU', 'WASM', 'worker')
 * @returns Validated embedding vector
 * 
 * @example
 * const validated = validateEmbedding(embedding, 0, 'WebGPU');
 */
export function validateEmbedding(
  embedding: number[] | null | undefined, 
  index?: number, 
  source: string = 'unknown'
): number[] {
  const prefix = index !== undefined ? `Embedding at index ${index}` : 'Embedding';
  
  // Handle empty/null embeddings
  if (!embedding || embedding.length === 0) {
    warn(ts(), `[Offscreen]  ${prefix} from ${source} is empty, replacing entire vector with zeros`);
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }
  
  // Check for invalid values
  const invalidCount = embedding.filter(v => v === null || v === undefined || isNaN(v)).length;
  
  if (invalidCount === 0) {
    return embedding; // All valid
  }
  
  // All values invalid - pipeline error
  if (invalidCount === EMBEDDING_DIMENSION) {
    warn(ts(), `[Offscreen]  ${prefix} from ${source} has ALL ${EMBEDDING_DIMENSION} values invalid (pipeline error), replacing entire vector with zeros`);
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }
  
  // Some values invalid - replace with zeros
  warn(ts(), `[Offscreen]  ${prefix} from ${source} has ${invalidCount}/${EMBEDDING_DIMENSION} invalid values, replacing with zeros`);
  return embedding.map(v => (v === null || v === undefined || isNaN(v)) ? 0 : v);
}

/**
 * Validate a batch of embeddings
 * 
 * @param embeddings - Array of embedding vectors to validate
 * @param source - Source of embeddings (for logging)
 * @returns Array of validated embedding vectors
 * 
 * @example
 * const validated = validateEmbeddingsBatch(embeddings, 'WebGPU');
 */
export function validateEmbeddingsBatch(
  embeddings: number[][], 
  source: string = 'unknown'
): number[][] {
  return embeddings.map((embedding, index) => validateEmbedding(embedding, index, source));
}

/**
 * Ensure embedding worker is initialized and ready
 * Uses singleton pattern - only creates worker once
 * 
 * @param embeddingWorker - Current worker instance (or null)
 * @returns Promise<Worker> - Initialized worker
 * 
 * @example
 * embeddingWorker = await ensureWorkerReady(embeddingWorker);
 */
export async function ensureWorkerReady(
  embeddingWorker: Worker | null
): Promise<Worker> {
  if (embeddingWorker) {
    return embeddingWorker; // Already initialized
  }
  
  log(ts(), '[Offscreen] Spawning embedding worker...');
  const worker = new Worker(
    new URL('./embedding-worker.ts', import.meta.url), 
    { type: 'module' }
  );
  
  // Wait for worker to initialize
  await new Promise<void>((resolve, reject) => {
    const requestId = `init_${Date.now()}`;
    const timeout = setTimeout(() => {
      reject(new Error('Worker initialization timeout'));
    }, WORKER_INIT_TIMEOUT_MS);
    
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'workerResponse' && ev.data.requestId === requestId) {
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        
        if (ev.data.success) {
          resolve();
        } else {
          reject(new Error(ev.data.error || 'Worker initialization failed'));
        }
      }
    };
    
    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'initialize', requestId });
  });
  
  log(ts(), '[Offscreen] Embedding worker ready');
  return worker;
}

/**
 * Send a message to the worker and await response
 * 
 * @param worker - Worker instance
 * @param message - Message to send
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Promise with worker response
 * 
 * @example
 * const result = await sendToWorker(worker, { type: 'embedText', text: 'Hello' });
 */
export async function sendToWorker<T = any>(
  worker: Worker,
  message: any,
  timeoutMs: number = 30000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = `${message.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timeout = setTimeout(() => {
      reject(new Error(`Worker response timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'workerResponse' && ev.data.requestId === requestId) {
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        
        if (ev.data.success) {
          resolve(ev.data as T);
        } else {
          reject(new Error(ev.data.error || 'Worker operation failed'));
        }
      }
    };
    
    worker.addEventListener('message', onMessage);
    worker.postMessage({ ...message, requestId });
  });
}

