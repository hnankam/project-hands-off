/**
 * Offscreen document for running transformers.js embeddings
 * Service workers don't have XMLHttpRequest, so we need an offscreen document
 * Based on: https://github.com/huggingface/transformers.js/tree/main/examples/extension
 */

import { pipeline, env } from '@huggingface/transformers';
import { 
  EMBEDDING_MODEL, 
  EMBEDDING_RUNTIME_PREFERENCE,
  EMBEDDING_DIMENSION,
  BATCH_SIZE,
  OFFSCREEN_READY_DELAY_MS,
  getDtype
} from './embedding-config.js';
import { 
  validateEmbedding, 
  validateEmbeddingsBatch, 
  ensureWorkerReady,
  sendToWorker
} from './embedding-helpers.js';

// WebGPU type declaration
declare global {
  interface Navigator {
    gpu?: GPU;
  }
  interface GPU {
    requestAdapter(): Promise<GPUAdapter | null>;
  }
  interface GPUAdapter {}
}

// Logging helpers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const DEBUG = true;
const log = (...args: any[]) => DEBUG && console.log(...args);
const warn = (...args: any[]) => DEBUG && console.warn(...args);
const err = (...args: any[]) => console.error(...args);

log(ts(), '[Offscreen] Starting offscreen document for embeddings...');

// Configure transformers.js environment
env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useBrowserCache = true;

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = '';
}

// State
let embeddingPipeline: any = null;
let pipelineDevice: 'webgpu' | 'wasm' | null = null;
let embeddingWorker: Worker | null = null;

/**
 * Initialize the embedding pipeline with WebGPU or WASM
 */
async function initializePipeline(): Promise<void> {
  if (embeddingPipeline) {
    log(ts(), '[Offscreen] Pipeline already initialized');
    return;
  }

  log(ts(), `[Offscreen] Initializing pipeline with model: ${EMBEDDING_MODEL} (this will take a few seconds)...`);
  const startTime = performance.now();

  let device: 'webgpu' | 'wasm' = 'webgpu';

  try {
    // Check WebGPU availability
    if (!navigator.gpu) {
      log(ts(), '[Offscreen] WebGPU not available, falling back to WASM');
      device = 'wasm';
    } else {
      log(ts(), '[Offscreen] WebGPU API detected, attempting GPU acceleration...');
    }
    
    log(ts(), `[Offscreen] Attempting to initialize with device: ${device.toUpperCase()}`);
    
    const dtype = getDtype(device);
    log(ts(), `[Offscreen] Quantization: ${dtype}`);
    
    embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      device: device,
      dtype: dtype,
    });
    pipelineDevice = device;
    
    const duration = performance.now() - startTime;
    log(ts(), `[Offscreen] Pipeline initialized in ${duration.toFixed(2)}ms`);
    log(ts(), `[Offscreen] FINAL DEVICE: ${device.toUpperCase()} ${device === 'webgpu' ? '(GPU-accelerated)' : '(CPU-based)'}`);
    log(ts(), `[Offscreen]    Model: ${EMBEDDING_MODEL} (${dtype})`);
  } catch (error) {
    err(ts(), '[Offscreen] Failed to initialize with', device, ':', error);

    // Fallback to WASM if WebGPU fails
    if (device === 'webgpu') {
      log(ts(), '[Offscreen] Falling back to WASM...');
      try {
        const dtype = getDtype('wasm');
        log(ts(), `[Offscreen] Quantization: ${dtype}`);
        
        embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL, {
          device: 'wasm',
          dtype: dtype,
        });
        pipelineDevice = 'wasm';
        const duration = performance.now() - startTime;
        log(ts(), `[Offscreen] Pipeline initialized with WASM fallback in ${duration.toFixed(2)}ms`);
        log(ts(), `[Offscreen] FINAL DEVICE: WASM (CPU-based)`);
      } catch (wasmError) {
        err(ts(), '[Offscreen] WASM fallback also failed:', wasmError);
        throw wasmError;
      }
    } else {
      throw error;
    }
  }
}

/**
 * Generate embedding for a single text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  // Use WebGPU pipeline if available and preference is 'auto'
  if (EMBEDDING_RUNTIME_PREFERENCE === 'auto' && pipelineDevice === 'webgpu' && embeddingPipeline) {
    const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data as Iterable<number>).map((v: number) => Number(v));
    return validateEmbedding(embedding, undefined, 'WebGPU');
  }

  // Otherwise, use worker
  embeddingWorker = await ensureWorkerReady(embeddingWorker);
  const response = await sendToWorker<{ success: boolean; embedding: number[] }>(
    embeddingWorker, 
    { type: 'embedText', text }
  );
  return validateEmbedding(response.embedding, undefined, 'worker');
}

/**
 * Generate embeddings for multiple texts using WebGPU
 */
async function generateEmbeddingsBatchWebGPU(texts: string[]): Promise<number[][]> {
  embeddingWorker = await ensureWorkerReady(embeddingWorker);

  const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
  log(ts(), `[Offscreen] Processing ${texts.length} texts in ${totalBatches} parallel batches (WebGPU)...`);
  const startTime = performance.now();

  // Process ALL batches in parallel (true parallelism)
  const batchPromises = Array.from({ length: totalBatches }, async (_, i) => {
    const batchStartTime = performance.now();
    const startIdx = i * BATCH_SIZE;
    const batch = texts.slice(startIdx, Math.min(startIdx + BATCH_SIZE, texts.length));
    
    log(ts(), `[Offscreen] Batch ${i + 1}/${totalBatches} started (${batch.length} texts)`);
    
    const output = await embeddingPipeline(batch, { pooling: 'mean', normalize: true });
    
    const typed = output.data as Float32Array;
    const viewBuffer = typed.buffer.slice(typed.byteOffset, typed.byteOffset + typed.byteLength);

    const embeddingsFromWorker: number[][] = await sendToWorker<{ success: boolean; embeddings: number[][] }>(
      embeddingWorker!,
      {
        type: 'postprocessEmbeddings',
        buffer: viewBuffer,
        count: batch.length,
        embeddingSize: EMBEDDING_DIMENSION,
      }
    ).then(response => response.embeddings);

    const batchDuration = (performance.now() - batchStartTime).toFixed(0);
    log(ts(), `[Offscreen] Batch ${i + 1}/${totalBatches} complete (${batchDuration}ms)`);

    return embeddingsFromWorker;
  });

  const batchResults = await Promise.all(batchPromises);
  const results = batchResults.flat();
  
  const totalDuration = (performance.now() - startTime).toFixed(0);
  log(ts(), `[Offscreen] All ${totalBatches} batches completed in parallel (total: ${totalDuration}ms)`);
  
  return validateEmbeddingsBatch(results, 'WebGPU');
}

/**
 * Generate embeddings for multiple texts using WASM worker
 */
async function generateEmbeddingsBatchWASM(texts: string[]): Promise<number[][]> {
  embeddingWorker = await ensureWorkerReady(embeddingWorker);

  log(ts(), `[Offscreen] Processing ${texts.length} texts via WASM worker...`);
  const startTime = performance.now();

  const response = await sendToWorker<{ success: boolean; embeddings: number[][] }>(
    embeddingWorker,
    { type: 'generateEmbeddings', texts }
  );

  const totalDuration = (performance.now() - startTime).toFixed(0);
  log(ts(), `[Offscreen] WASM worker completed ${texts.length} embeddings (${totalDuration}ms)`);
  
  return validateEmbeddingsBatch(response.embeddings, 'WASM worker');
}

/**
 * Generate embeddings for multiple texts (batch processing)
 */
async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  // Prefer WebGPU when available and preference is 'auto'
  if (EMBEDDING_RUNTIME_PREFERENCE === 'auto' && pipelineDevice === 'webgpu' && embeddingPipeline) {
    return await generateEmbeddingsBatchWebGPU(texts);
  }
  
  // Fallback to WASM worker
  return await generateEmbeddingsBatchWASM(texts);
}

/**
 * Message handler for background script communication
 */
chrome.runtime.onMessage.addListener((message) => {
  // Only handle messages explicitly targeted to offscreen
  if (message.target !== 'offscreen') {
    // Silently ignore messages for other components
    return false;
  }
  
  console.log(ts(), '[Offscreen] Received message:', message.type);
  const requestId = message.requestId;
  
  // Handle asynchronously and send response via sendMessage
  (async () => {
    try {
      let result: any;
      
      switch (message.type) {
        case 'initialize': {
          // Initialize both main-thread pipeline (for WebGPU fallback) and worker warmup
          try { await initializePipeline(); } catch {}
          result = { success: true };
          break;
        }
          
        case 'embedText': {
          const embedding = await generateEmbedding(message.text);
          result = { success: true, embedding };
          break;
        }
          
        case 'generateEmbeddings': {
          log(ts(), '[Offscreen] Batch embedding request:', message.texts.length, 'texts');
          const embeddings = await generateEmbeddingsBatch(message.texts);
          log(ts(), '[Offscreen] Batch embedding complete:', embeddings.length, 'embeddings');
          result = { success: true, embeddings };
          break;
        }
          
        default:
          result = { success: false, error: 'Unknown message type' };
      }
      
      // Send response back via sendMessage
      const responseMsg = {
        type: 'offscreenResponse',
        requestId,
        ...result
      };
      log(ts(), '[Offscreen] Sending response:', JSON.stringify({ 
        type: responseMsg.type, 
        requestId: responseMsg.requestId, 
        success: responseMsg.success,
        embeddingsCount: (responseMsg as any).embeddings?.length 
      }));
      
      chrome.runtime.sendMessage(responseMsg).then(() => {
        log(ts(), '[Offscreen] Response sent successfully');
      }).catch(err => {
        err(ts(), '[Offscreen] Failed to send response:', err);
      });
    } catch (error) {
      err(ts(), '[Offscreen] Error:', error);
      chrome.runtime.sendMessage({
        type: 'offscreenResponse',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }).catch(() => {});
    }
  })();
  
  return false; // Don't keep channel open
});

log(ts(), '[Offscreen] Ready to receive messages');

// Notify background script that offscreen is ready
setTimeout(() => {
  log(ts(), '[Offscreen] Sending ready signal to background...');
  chrome.runtime.sendMessage({ type: 'offscreenReady' }).then(() => {
    log(ts(), '[Offscreen] Ready signal sent successfully');
  }).catch((err) => {
    warn(ts(), '[Offscreen] Failed to send ready signal:', err);
  });
}, OFFSCREEN_READY_DELAY_MS);
