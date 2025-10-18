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

console.log(ts(), '[Offscreen] Starting offscreen document for embeddings...');

// Runtime preference: default to WebGPU when available, else worker fallback.
const EMBEDDING_RUNTIME_PREFERENCE: 'worker' | 'auto' = 'auto';

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
    console.log(ts(), '[Offscreen] ✅ Pipeline already initialized');
    return;
  }

  console.log(ts(), '[Offscreen] 🔄 Initializing pipeline (this will take a few seconds)...');
  const startTime = performance.now();

  // Try WebGPU first (GPU-accelerated), fallback to WASM
  let device: 'webgpu' | 'wasm' = 'webgpu';

  try {
    // Check if WebGPU is available
    if (!navigator.gpu) {
      console.log(ts(), '[Offscreen] ⚠️  WebGPU not available (navigator.gpu is undefined), falling back to WASM');
      device = 'wasm';
    } else {
      console.log(ts(), '[Offscreen] ✅ WebGPU API detected (navigator.gpu exists), attempting GPU acceleration...');
    }
    
    console.log(ts(), `[Offscreen] 🎯 Attempting to initialize with device: ${device.toUpperCase()}`);
    
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: device,
      dtype: device === 'webgpu' ? 'fp32' : 'q8', // WebGPU requires fp32
    });
    pipelineDevice = device;
    
    const duration = performance.now() - startTime;
    console.log(ts(), `[Offscreen] ✅ Pipeline initialized in ${duration.toFixed(2)}ms`);
    console.log(ts(), `[Offscreen] 🚀 FINAL DEVICE: ${device.toUpperCase()} ${device === 'webgpu' ? '(GPU-accelerated, should not block UI)' : '(CPU-based, may block UI)'}`);
    console.log(ts(), '[Offscreen] ℹ️  Model is now loaded in memory and ready for fast embeddings');
  } catch (error) {
    console.error(ts(), '[Offscreen] ❌ Failed to initialize with', device, ':', error);
    console.error(ts(), '[Offscreen] ❌ Error details:', error instanceof Error ? error.message : String(error));
    console.error(ts(), '[Offscreen] ❌ Stack:', error instanceof Error ? error.stack : 'No stack trace');

    // Fallback to WASM if WebGPU fails
    if (device === 'webgpu') {
      console.log(ts(), '[Offscreen] 🔄 Falling back to WASM...');
      try {
        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          device: 'wasm',
          dtype: 'q8',
        });
        pipelineDevice = 'wasm';
        const duration = performance.now() - startTime;
        console.log(ts(), `[Offscreen] ✅ Pipeline initialized with WASM fallback in ${duration.toFixed(2)}ms`);
        console.log(ts(), `[Offscreen] 🚀 FINAL DEVICE: WASM (CPU-based, may block UI)`);
      } catch (wasmError) {
        console.error(ts(), '[Offscreen] ❌ WASM fallback also failed:', wasmError);
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
    
    // Validate: replace NULL/undefined with zero array
    if (!embedding || embedding.length === 0 || embedding.some(v => v === null || v === undefined || isNaN(v))) {
      console.warn(ts(), '[Offscreen] ⚠️  Invalid embedding detected, replacing with zeros');
      return new Array(384).fill(0);
    }
    
    return embedding;
  }

  // Otherwise, initialize worker lazily
  if (!embeddingWorker) {
    console.log(ts(), '[Offscreen] Spawning embedding worker...');
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
    console.log(ts(), '[Offscreen] Embedding worker ready');
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
  
  // Validate: replace NULL/undefined with zero array
  if (!embedding || embedding.length === 0 || embedding.some(v => v === null || v === undefined || isNaN(v))) {
    console.warn(ts(), '[Offscreen] ⚠️  Invalid embedding from worker, replacing with zeros');
    return new Array(384).fill(0);
  }
  
  return embedding;
}

// Generate embeddings for multiple texts (prefer worker by default; WebGPU when preference is 'auto')
async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (EMBEDDING_RUNTIME_PREFERENCE === 'auto' && pipelineDevice === 'webgpu' && embeddingPipeline) {
    const BATCH_SIZE = 32;
  const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
    const results: number[][] = [];
    for (let i = 0; i < totalBatches; i++) {
      const startIdx = i * BATCH_SIZE;
      const batch = texts.slice(startIdx, Math.min(startIdx + BATCH_SIZE, texts.length));
      const output = await embeddingPipeline(batch, { pooling: 'mean', normalize: true });
      const size = 384;
      // Offload heavy conversion to worker: pack view buffer and transfer
      // Ensure worker is ready
      if (!embeddingWorker) {
        console.log(ts(), '[Offscreen] Spawning embedding worker...');
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
        console.log(ts(), '[Offscreen] Embedding worker ready');
      }

      const typed = output.data as Float32Array;
      const viewBuffer = typed.buffer.slice(typed.byteOffset, typed.byteOffset + typed.byteLength);

      const embeddingsFromWorker: number[][] = await new Promise((resolve, reject) => {
        const requestId = `post_${Date.now()}_${i}`;
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

      results.push(...embeddingsFromWorker);
    }
    
    // Validate all embeddings: replace NULL/undefined with zero arrays
    const validatedResults = results.map((embedding, index) => {
      if (!embedding || embedding.length === 0 || embedding.some(v => v === null || v === undefined || isNaN(v))) {
        console.warn(ts(), `[Offscreen] ⚠️  Invalid embedding at index ${index}, replacing with zeros`);
        return new Array(384).fill(0);
      }
      return embedding;
    });
    
    return validatedResults;
  }

  if (!embeddingWorker) {
    console.log(ts(), '[Offscreen] Spawning embedding worker...');
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
    console.log(ts(), '[Offscreen] Embedding worker ready');
  }

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
  
  // Validate all embeddings: replace NULL/undefined with zero arrays
  const validatedEmbeddings = embeddings.map((embedding, index) => {
    if (!embedding || embedding.length === 0 || embedding.some(v => v === null || v === undefined || isNaN(v))) {
      console.warn(ts(), `[Offscreen] ⚠️  Invalid embedding from worker at index ${index}, replacing with zeros`);
      return new Array(384).fill(0);
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
          console.log(ts(), '[Offscreen] Batch embedding request:', message.texts.length, 'texts');
          const embeddings = await generateEmbeddingsBatch(message.texts);
          console.log(ts(), '[Offscreen] ✅ Batch embedding complete:', embeddings.length, 'embeddings');
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
      console.log(ts(), '[Offscreen] 📤 Sending response:', JSON.stringify({ 
        type: responseMsg.type, 
        requestId: responseMsg.requestId, 
        success: responseMsg.success,
        embeddingsCount: (responseMsg as any).embeddings?.length 
      }));
      
      chrome.runtime.sendMessage(responseMsg).then(() => {
        console.log(ts(), '[Offscreen] ✅ Response sent successfully');
      }).catch(err => {
        console.error(ts(), '[Offscreen] ❌ Failed to send response:', err);
      });
    } catch (error) {
      console.error(ts(), '[Offscreen] Error:', error);
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

console.log(ts(), '[Offscreen] Ready to receive messages');

// Notify background script that offscreen is ready
// Slight delay to ensure message listener is fully registered
setTimeout(() => {
  console.log(ts(), '[Offscreen] Sending ready signal to background...');
  chrome.runtime.sendMessage({ type: 'offscreenReady' }).then(() => {
    console.log(ts(), '[Offscreen] ✅ Ready signal sent successfully');
  }).catch((err) => {
    console.warn(ts(), '[Offscreen] Failed to send ready signal:', err);
  });
}, 100);
