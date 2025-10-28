/**
 * Offscreen document for running transformers.js embeddings
 * Service workers don't have XMLHttpRequest, so we need an offscreen document
 * Based on: https://github.com/huggingface/transformers.js/tree/main/examples/extension
 */

import { pipeline, env } from '@huggingface/transformers';

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

// Timestamp helper (defined early for use in initialization)
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const DEBUG = true; // set true for development
const log = (...args: any[]) => DEBUG && console.log(...args);
const warn = (...args: any[]) => DEBUG && console.warn(...args);
const err = (...args: any[]) => console.error(...args); // always log errors

log(ts(), '[Offscreen] Starting offscreen document for embeddings...');

// Runtime preference: default to WebGPU when available, else worker fallback.
const EMBEDDING_RUNTIME_PREFERENCE: 'worker' | 'auto' = 'auto';

// ===== EMBEDDING MODEL SELECTION =====
// Choose your embedding model (comment/uncomment to switch):
const EMBEDDING_MODEL = 'Xenova/paraphrase-MiniLM-L3-v2'; // 🚀 FASTEST (14MB, ~40% faster, good quality)
// const EMBEDDING_MODEL = 'Supabase/gte-small';          // ⭐ RECOMMENDED (33MB, most stable, best accuracy)
// const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';    // ⭐ ALTERNATIVE (33MB, state-of-the-art small model)
// const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';     // 📊 ORIGINAL (23MB, baseline)
// const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L12-v2';    // 🎯 HIGHEST QUALITY (45MB, slower but best quality)

// ===== QUANTIZATION SELECTION =====
// Choose quantization level (comment/uncomment to switch):
const USE_AGGRESSIVE_QUANTIZATION = true;  // ⚡ FASTEST (fp16/q4, ~30-40% faster, minimal quality loss)
// const USE_AGGRESSIVE_QUANTIZATION = false; // 🎯 BALANCED (fp32/q8, default quality)
// =====================================

// Configure transformers.js environment
env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useBrowserCache = true;

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = '';
}

let embeddingPipeline: any = null;
let pipelineDevice: 'webgpu' | 'wasm' | null = null;
let embeddingWorker: Worker | null = null;

// Initialize the pipeline
async function initializePipeline() {
  if (embeddingPipeline) {
    log(ts(), '[Offscreen] ✅ Pipeline already initialized');
    return;
  }

  log(ts(), `[Offscreen] 🔄 Initializing pipeline with model: ${EMBEDDING_MODEL} (this will take a few seconds)...`);
  const startTime = performance.now();

  // Try WebGPU first (GPU-accelerated), fallback to WASM
  let device: 'webgpu' | 'wasm' = 'webgpu';

  try {
    // Check if WebGPU is available
    if (!navigator.gpu) {
      log(ts(), '[Offscreen] ⚠️  WebGPU not available (navigator.gpu is undefined), falling back to WASM');
      device = 'wasm';
    } else {
      log(ts(), '[Offscreen] ✅ WebGPU API detected (navigator.gpu exists), attempting GPU acceleration...');
    }
    
    log(ts(), `[Offscreen] 🎯 Attempting to initialize with device: ${device.toUpperCase()}`);
    
    // Select dtype based on device and quantization setting
    const dtype = USE_AGGRESSIVE_QUANTIZATION 
      ? (device === 'webgpu' ? 'fp16' : 'q4')  // Aggressive: fp16 for GPU, q4 for CPU
      : (device === 'webgpu' ? 'fp32' : 'q8'); // Balanced: fp32 for GPU, q8 for CPU
    
    log(ts(), `[Offscreen] ⚙️  Quantization: ${dtype} ${USE_AGGRESSIVE_QUANTIZATION ? '(aggressive)' : '(balanced)'}`);
    
    embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      device: device,
      dtype: dtype,
    });
    pipelineDevice = device;
    
    const duration = performance.now() - startTime;
    log(ts(), `[Offscreen] ✅ Pipeline initialized in ${duration.toFixed(2)}ms`);
    log(ts(), `[Offscreen] 🚀 FINAL DEVICE: ${device.toUpperCase()} ${device === 'webgpu' ? '(GPU-accelerated, should not block UI)' : '(CPU-based, may block UI)'}`);
    log(ts(), `[Offscreen] ℹ️  Model: ${EMBEDDING_MODEL} (${dtype}) is now loaded in memory and ready for fast embeddings`);
  } catch (error) {
    err(ts(), '[Offscreen] ❌ Failed to initialize with', device, ':', error);
    err(ts(), '[Offscreen] ❌ Error details:', error instanceof Error ? error.message : String(error));
    err(ts(), '[Offscreen] ❌ Stack:', error instanceof Error ? error.stack : 'No stack trace');

    // Fallback to WASM if WebGPU fails
    if (device === 'webgpu') {
      log(ts(), '[Offscreen] 🔄 Falling back to WASM...');
      try {
        const dtype = USE_AGGRESSIVE_QUANTIZATION ? 'q4' : 'q8';
        log(ts(), `[Offscreen] ⚙️  Quantization: ${dtype} ${USE_AGGRESSIVE_QUANTIZATION ? '(aggressive)' : '(balanced)'}`);
        
        embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL, {
          device: 'wasm',
          dtype: dtype,
        });
        pipelineDevice = 'wasm';
        const duration = performance.now() - startTime;
        log(ts(), `[Offscreen] ✅ Pipeline initialized with WASM fallback in ${duration.toFixed(2)}ms`);
        log(ts(), `[Offscreen] 🚀 FINAL DEVICE: WASM (CPU-based, may block UI)`);
        log(ts(), `[Offscreen] ℹ️  Model: ${EMBEDDING_MODEL} (${dtype})`);
      } catch (wasmError) {
        err(ts(), '[Offscreen] ❌ WASM fallback also failed:', wasmError);
        throw wasmError;
      }
    } else {
      throw error;
    }
  }
}

// Generate embedding for a single text (prefer worker by default; WebGPU when preference is 'auto')
async function generateEmbedding(text: string): Promise<number[]> {
  // Prefer WebGPU only when explicitly allowed
  if (EMBEDDING_RUNTIME_PREFERENCE === 'auto' && pipelineDevice === 'webgpu' && embeddingPipeline) {
    const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
    // Small (384) – conversion here is fine; avoid worker hop for single item
    const embedding = Array.from(output.data as Iterable<number>).map((v: number) => Number(v));
    
  // Validate: replace NaN values with zeros, keep valid values
  if (!embedding || embedding.length === 0) {
    warn(ts(), '[Offscreen] ⚠️  Empty embedding detected, replacing entire vector with zeros');
    return new Array(384).fill(0);
  }
  
  const hasInvalid = embedding.some(v => v === null || v === undefined || isNaN(v));
  if (hasInvalid) {
    const invalidCount = embedding.filter(v => v === null || v === undefined || isNaN(v)).length;
    warn(ts(), `[Offscreen] ⚠️  Found ${invalidCount} invalid values in embedding, replacing with zeros`);
    return embedding.map(v => (v === null || v === undefined || isNaN(v)) ? 0 : v);
  }
  
  return embedding;
  }

  // Otherwise, initialize worker lazily
  if (!embeddingWorker) {
    log(ts(), '[Offscreen] Spawning embedding worker...');
    embeddingWorker = new Worker(new URL('./embedding-worker.ts', import.meta.url), { type: 'module' });
    await new Promise<void>((resolve, reject) => {
      const requestId = `init_${Date.now()}`;
      const onMessage = (ev: MessageEvent) => {
        if (ev.data?.type === 'workerResponse' && ev.data.requestId === requestId) {
          (embeddingWorker as Worker).removeEventListener('message', onMessage);
          ev.data.success ? resolve() : reject(new Error(ev.data.error));
        }
      };
      (embeddingWorker as Worker).addEventListener('message', onMessage);
      (embeddingWorker as Worker).postMessage({ type: 'initialize', requestId });
    });
    log(ts(), '[Offscreen] Embedding worker ready');
  }

  // Delegate to worker so WASM compute is off the offscreen main thread
  const embedding = await new Promise<number[]>((resolve, reject) => {
    const requestId = `single_${Date.now()}`;
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'workerResponse' && ev.data.requestId === requestId) {
        (embeddingWorker as Worker).removeEventListener('message', onMessage);
        ev.data.success ? resolve(ev.data.embedding as number[]) : reject(new Error(ev.data.error));
      }
    };
    (embeddingWorker as Worker).addEventListener('message', onMessage);
    (embeddingWorker as Worker).postMessage({ type: 'embedText', text, requestId });
  });
  
  // Validate: replace NaN values with zeros, keep valid values
  if (!embedding || embedding.length === 0) {
    warn(ts(), '[Offscreen] ⚠️  Empty embedding from worker, replacing entire vector with zeros');
    return new Array(384).fill(0);
  }
  
  const hasInvalid = embedding.some(v => v === null || v === undefined || isNaN(v));
  if (hasInvalid) {
    const invalidCount = embedding.filter(v => v === null || v === undefined || isNaN(v)).length;
    warn(ts(), `[Offscreen] ⚠️  Found ${invalidCount} invalid values in worker embedding, replacing with zeros`);
    return embedding.map(v => (v === null || v === undefined || isNaN(v)) ? 0 : v);
  }
  
  return embedding;
}

// Generate embeddings for multiple texts (prefer worker by default; WebGPU when preference is 'auto')
async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (EMBEDDING_RUNTIME_PREFERENCE === 'auto' && pipelineDevice === 'webgpu' && embeddingPipeline) {
    const BATCH_SIZE = 16; // Optimal batch size for GPU performance
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
    
    // Ensure worker is ready before parallel processing
    if (!embeddingWorker) {
      log(ts(), '[Offscreen] Spawning embedding worker...');
      embeddingWorker = new Worker(new URL('./embedding-worker.ts', import.meta.url), { type: 'module' });
      await new Promise<void>((resolve, reject) => {
        const requestId = `init_${Date.now()}`;
        const onMessage = (ev: MessageEvent) => {
          if (ev.data?.type === 'workerResponse' && ev.data.requestId === requestId) {
            (embeddingWorker as Worker).removeEventListener('message', onMessage);
            ev.data.success ? resolve() : reject(new Error(ev.data.error));
          }
        };
        (embeddingWorker as Worker).addEventListener('message', onMessage);
        (embeddingWorker as Worker).postMessage({ type: 'initialize', requestId });
      });
      log(ts(), '[Offscreen] Embedding worker ready');
    }

    log(ts(), `[Offscreen] 🚀 Processing ${texts.length} texts in ${totalBatches} parallel batches (WebGPU)...`);
    const startTime = performance.now();

    // Process ALL batches in parallel (true parallelism)
    const batchPromises = Array.from({ length: totalBatches }, async (_, i) => {
      const batchStartTime = performance.now();
      const startIdx = i * BATCH_SIZE;
      const batch = texts.slice(startIdx, Math.min(startIdx + BATCH_SIZE, texts.length));
      
      log(ts(), `[Offscreen] 📦 Batch ${i + 1}/${totalBatches} started (${batch.length} texts)`);
      
      const output = await embeddingPipeline(batch, { pooling: 'mean', normalize: true });
      const size = 384;
      
      const typed = output.data as Float32Array;
      const viewBuffer = typed.buffer.slice(typed.byteOffset, typed.byteOffset + typed.byteLength);

      const embeddingsFromWorker: number[][] = await new Promise((resolve, reject) => {
        const requestId = `post_${Date.now()}_${i}_${Math.random()}`;
        const onMessage = (ev: MessageEvent) => {
          if (ev.data?.type === 'workerResponse' && ev.data.requestId === requestId) {
            (embeddingWorker as Worker).removeEventListener('message', onMessage);
            ev.data.success ? resolve(ev.data.embeddings as number[][]) : reject(new Error(ev.data.error));
          }
        };
        (embeddingWorker as Worker).addEventListener('message', onMessage);
        // Transfer buffer for zero-copy move off offscreen main thread
        (embeddingWorker as Worker).postMessage({
          type: 'postprocessEmbeddings',
          requestId,
          buffer: viewBuffer,
          count: batch.length,
          embeddingSize: size,
        }, [viewBuffer]);
      });

      const batchDuration = (performance.now() - batchStartTime).toFixed(0);
      log(ts(), `[Offscreen] ✅ Batch ${i + 1}/${totalBatches} complete (${batchDuration}ms)`);

      return embeddingsFromWorker;
    });

    const batchResults = await Promise.all(batchPromises);
    const results = batchResults.flat();
    
    const totalDuration = (performance.now() - startTime).toFixed(0);
    log(ts(), `[Offscreen] ✅ All ${totalBatches} batches completed in parallel (total: ${totalDuration}ms)`);
    
    // Validate all embeddings: replace NaN values with zeros, keep valid values
    const validatedResults = results.map((embedding, index) => {
      if (!embedding || embedding.length === 0) {
        warn(ts(), `[Offscreen] ⚠️  Empty embedding at index ${index}, replacing entire vector with zeros`);
        return new Array(384).fill(0);
      }
      
      const hasInvalid = embedding.some(v => v === null || v === undefined || isNaN(v));
      if (hasInvalid) {
        const invalidCount = embedding.filter(v => v === null || v === undefined || isNaN(v)).length;
        if (invalidCount === 384) {
          // All values are invalid - this is a pipeline error, replace entire vector
          warn(ts(), `[Offscreen] ⚠️  Embedding at index ${index} has ALL 384 values invalid (pipeline error), replacing entire vector with zeros`);
          return new Array(384).fill(0);
        }
        warn(ts(), `[Offscreen] ⚠️  Embedding at index ${index} has ${invalidCount} invalid values, replacing with zeros`);
        return embedding.map(v => (v === null || v === undefined || isNaN(v)) ? 0 : v);
      }
      
      return embedding;
    });
    
    return validatedResults;
  }

  if (!embeddingWorker) {
    log(ts(), '[Offscreen] Spawning embedding worker (WASM)...');
    embeddingWorker = new Worker(new URL('./embedding-worker.ts', import.meta.url), { type: 'module' });
    await new Promise<void>((resolve, reject) => {
      const requestId = `init_${Date.now()}`;
      const onMessage = (ev: MessageEvent) => {
        if (ev.data?.type === 'workerResponse' && ev.data.requestId === requestId) {
          (embeddingWorker as Worker).removeEventListener('message', onMessage);
          ev.data.success ? resolve() : reject(new Error(ev.data.error));
        }
      };
      (embeddingWorker as Worker).addEventListener('message', onMessage);
      (embeddingWorker as Worker).postMessage({ type: 'initialize', requestId });
    });
    log(ts(), '[Offscreen] Embedding worker ready');
  }

  log(ts(), `[Offscreen] 🚀 Processing ${texts.length} texts via WASM worker...`);
  const startTime = performance.now();

  const embeddings = await new Promise<number[][]>((resolve, reject) => {
    const requestId = `batch_${Date.now()}`;
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'workerResponse' && ev.data.requestId === requestId) {
        (embeddingWorker as Worker).removeEventListener('message', onMessage);
        ev.data.success ? resolve(ev.data.embeddings as number[][]) : reject(new Error(ev.data.error));
      }
    };
    (embeddingWorker as Worker).addEventListener('message', onMessage);
    (embeddingWorker as Worker).postMessage({ type: 'generateEmbeddings', texts, requestId });
  });

  const totalDuration = (performance.now() - startTime).toFixed(0);
  log(ts(), `[Offscreen] ✅ WASM worker completed ${texts.length} embeddings (${totalDuration}ms)`);
  
  // Validate all embeddings: replace NaN values with zeros, keep valid values
  const validatedEmbeddings = embeddings.map((embedding, index) => {
    if (!embedding || embedding.length === 0) {
      warn(ts(), `[Offscreen] ⚠️  Empty embedding from worker at index ${index}, replacing entire vector with zeros`);
      return new Array(384).fill(0);
    }
    
    const hasInvalid = embedding.some(v => v === null || v === undefined || isNaN(v));
    if (hasInvalid) {
      const invalidCount = embedding.filter(v => v === null || v === undefined || isNaN(v)).length;
      if (invalidCount === 384) {
        // All values are invalid - this is a pipeline error, replace entire vector
        warn(ts(), `[Offscreen] ⚠️  Worker embedding at index ${index} has ALL 384 values invalid (pipeline error), replacing entire vector with zeros`);
        return new Array(384).fill(0);
      }
      warn(ts(), `[Offscreen] ⚠️  Worker embedding at index ${index} has ${invalidCount} invalid values, replacing with zeros`);
      return embedding.map(v => (v === null || v === undefined || isNaN(v)) ? 0 : v);
    }
    
    return embedding;
  });
  
  return validatedEmbeddings;
}

// Listen for messages from background script - using onMessage pattern only
chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'offscreen') return false;
  
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
          break; }
          
        case 'embedText':
          const embedding = await generateEmbedding(message.text);
          result = { success: true, embedding };
          break;
          
        case 'generateEmbeddings':
          // TRUE batch embedding - process all texts in one transformer call
      log(ts(), '[Offscreen] Batch embedding request:', message.texts.length, 'texts');
          const embeddings = await generateEmbeddingsBatch(message.texts);
      log(ts(), '[Offscreen] ✅ Batch embedding complete:', embeddings.length, 'embeddings');
          result = { success: true, embeddings };
          break;
          
        default:
          result = { success: false, error: 'Unknown message type' };
      }
      
      // Send response back via sendMessage
      const responseMsg = {
        type: 'offscreenResponse',
        requestId,
        ...result
      };
      log(ts(), '[Offscreen] 📤 Sending response:', JSON.stringify({ 
        type: responseMsg.type, 
        requestId: responseMsg.requestId, 
        success: responseMsg.success,
        embeddingsCount: (responseMsg as any).embeddings?.length 
      }));
      
      chrome.runtime.sendMessage(responseMsg).then(() => {
        log(ts(), '[Offscreen] ✅ Response sent successfully');
      }).catch(err => {
        err(ts(), '[Offscreen] ❌ Failed to send response:', err);
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
// Slight delay to ensure message listener is fully registered
setTimeout(() => {
  log(ts(), '[Offscreen] Sending ready signal to background...');
  chrome.runtime.sendMessage({ type: 'offscreenReady' }).then(() => {
    log(ts(), '[Offscreen] ✅ Ready signal sent successfully');
  }).catch((err) => {
    warn(ts(), '[Offscreen] Failed to send ready signal:', err);
  });
}, 100);
