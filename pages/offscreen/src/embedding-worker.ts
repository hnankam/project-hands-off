/*
 * Dedicated embedding worker. Runs transformers.js in a separate thread so
 * heavy WASM computation does not block the offscreen (and thus side panel) UI.
 */

import { pipeline, env } from '@huggingface/transformers';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSION, BATCH_SIZE, getDtype } from './embedding-config.js';

const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

// Debug toggle (set to false in production)
const DEBUG = true;
const log = (...args: any[]) => DEBUG && console.log(...args);

// Configure environment for worker context
env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useBrowserCache = true;
if (env.backends?.onnx?.wasm) {
  // In Chrome extension workers, ORT proxy threads can hang due to CSP/asset paths.
  // Use stable single-threaded ORT and rely on batch-level concurrency for throughput.
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = '';
}

let embeddingPipeline: any = null;
let pipelineInitPromise: Promise<void> | null = null;

async function ensurePipeline() {
  if (embeddingPipeline) return;
  if (!pipelineInitPromise) {
    pipelineInitPromise = (async () => {
      const dtype = getDtype('wasm');
      log(ts(), `[EmbeddingWorker] Initializing transformers pipeline with model: ${EMBEDDING_MODEL} (WASM, ${dtype})...`);
      const start = performance.now();
      // WebGPU is not available in workers; use WASM
      embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL, {
        device: 'wasm',
        dtype: dtype,
      });
      log(ts(), `[EmbeddingWorker] Pipeline ready in ${(performance.now() - start).toFixed(0)}ms`);
      log(ts(), `[EmbeddingWorker] Model: ${EMBEDDING_MODEL} (${dtype})`);
    })();
  }
  await pipelineInitPromise;
}

async function embedText(text: string): Promise<number[]> {
  await ensurePipeline();
  // Fast-path: empty/whitespace text → zero vector
  if (!text || (typeof text === 'string' && text.trim().length === 0)) {
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }
  const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
  const arr: number[] = Array.from(output.data as Iterable<number>).map((v: number) => Number(v));
  return arr;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  await ensurePipeline();
  // Fast-path: no inputs
  if (!texts || texts.length === 0) return [];
  
  // Clamp concurrency by available cores
  const hc = (self as any)?.navigator?.hardwareConcurrency || 4;
  const MAX_CONCURRENT = Math.max(2, Math.min(8, (hc as number) - 1));
  const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
  log(ts(), '[EmbeddingWorker] PARALLEL BATCH PROCESSING:', texts.length, 'texts in', totalBatches, 'batches (', BATCH_SIZE, 'each,', MAX_CONCURRENT, 'concurrent)');

  // Single-batch runner
  const processBatch = async (batchIndex: number): Promise<{ index: number; embeddings: number[][] }> => {
    const startIdx = batchIndex * BATCH_SIZE;
    const batch = texts.slice(startIdx, Math.min(startIdx + BATCH_SIZE, texts.length));
    const output = await embeddingPipeline(batch, { pooling: 'mean', normalize: true });
    const batchEmbeddings: number[][] = [];
    for (let j = 0; j < batch.length; j++) {
      const slice = (output.data as Float32Array | number[]).slice(j * EMBEDDING_DIMENSION, (j + 1) * EMBEDDING_DIMENSION) as number[];
      const vec: number[] = Array.from(slice as Iterable<number>).map((v: number) => Number(v));
      batchEmbeddings.push(vec);
    }
    return { index: batchIndex, embeddings: batchEmbeddings };
  };

  // Process ALL batches in parallel (no pools - true parallelism)
  const batchPromises = Array.from({ length: totalBatches }, (_, i) => processBatch(i));
  const collected = await Promise.all(batchPromises);

  // Flatten in order (already sorted by index)
  collected.sort((a, b) => a.index - b.index);
  const all = collected.flatMap((r) => r.embeddings);
  return all;
}

// Message bridge
self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  const { type, requestId } = msg;
  try {
    if (type === 'initialize') {
      await ensurePipeline();
      (self as any).postMessage({ type: 'workerResponse', requestId, success: true });
      return;
    }
    if (type === 'embedText') {
      const embedding = await embedText(msg.text);
      (self as any).postMessage({ type: 'workerResponse', requestId, success: true, embedding });
      return;
    }
    if (type === 'generateEmbeddings') {
      const embeddings = await embedBatch(msg.texts as string[]);
      (self as any).postMessage({ type: 'workerResponse', requestId, success: true, embeddings });
      return;
    }
    if (type === 'postprocessEmbeddings') {
      // Convert a packed Float32Array buffer into number[][] off the offscreen main thread
      const embeddingSize: number = msg.embeddingSize || 384;
      const count: number = msg.count;
      const buffer: ArrayBuffer = msg.buffer;
      const data = new Float32Array(buffer);
      const result: number[][] = new Array(count);
      for (let i = 0; i < count; i++) {
        const start = i * embeddingSize;
        const end = start + embeddingSize;
        const slice = data.subarray(start, end);
        result[i] = Array.from(slice as Iterable<number>);
      }
      (self as any).postMessage({ type: 'workerResponse', requestId, success: true, embeddings: result });
      return;
    }
    (self as any).postMessage({ type: 'workerResponse', requestId, success: false, error: 'Unknown message type' });
  } catch (err) {
    (self as any).postMessage({ type: 'workerResponse', requestId, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
};


