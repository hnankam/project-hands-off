/*
 * Dedicated embedding worker. Runs transformers.js in a separate thread so
 * heavy WASM computation does not block the offscreen (and thus side panel) UI.
 */

import { pipeline, env } from '@huggingface/transformers';

const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

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
  if (embeddingPipeline) return;
  if (!pipelineInitPromise) {
    pipelineInitPromise = (async () => {
      console.log(ts(), '[EmbeddingWorker] Initializing transformers pipeline (WASM, single-threaded in worker)...');
      const start = performance.now();
      // WebGPU is not available in workers; use WASM
      embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: 'wasm',
        dtype: 'q8',
      });
      console.log(ts(), '[EmbeddingWorker] Pipeline ready in', (performance.now() - start).toFixed(0), 'ms');
    })();
  }
  await pipelineInitPromise;
}

async function embedText(text: string): Promise<number[]> {
  await ensurePipeline();
  const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
  const arr: number[] = Array.from(output.data as Iterable<number>).map((v: number) => Number(v));
  return arr;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  await ensurePipeline();
  const BATCH_SIZE = 32;
  const MAX_CONCURRENT = 8; // Reinstate limited concurrency inside worker
  const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
  console.log(ts(), '[EmbeddingWorker] PARALLEL BATCH PROCESSING:', texts.length, 'texts in', totalBatches, 'batches (', BATCH_SIZE, 'each,', MAX_CONCURRENT, 'concurrent)');

  // Single-batch runner
  const processBatch = async (batchIndex: number): Promise<{ index: number; embeddings: number[][] }> => {
    const startIdx = batchIndex * BATCH_SIZE;
    const batch = texts.slice(startIdx, Math.min(startIdx + BATCH_SIZE, texts.length));
    const output = await embeddingPipeline(batch, { pooling: 'mean', normalize: true });
    const size = 384;
    const batchEmbeddings: number[][] = [];
    for (let j = 0; j < batch.length; j++) {
      const slice = (output.data as Float32Array | number[]).slice(j * size, (j + 1) * size) as number[];
      const vec: number[] = Array.from(slice as Iterable<number>).map((v: number) => Number(v));
      batchEmbeddings.push(vec);
    }
    return { index: batchIndex, embeddings: batchEmbeddings };
  };

  // Schedule with concurrency window
  const collected: { index: number; embeddings: number[][] }[] = [];
  for (let i = 0; i < totalBatches; i += MAX_CONCURRENT) {
    const windowPromises: Array<Promise<{ index: number; embeddings: number[][] }>> = [];
    for (let j = 0; j < MAX_CONCURRENT && i + j < totalBatches; j++) {
      windowPromises.push(processBatch(i + j));
    }
    const windowResults = await Promise.all(windowPromises);
    collected.push(...windowResults);
  }

  // Flatten in order
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


