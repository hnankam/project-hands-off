/**
 * Offscreen document for running transformers.js embeddings
 * Service workers don't have XMLHttpRequest, so we need an offscreen document
 * Based on: https://github.com/huggingface/transformers.js/tree/main/examples/extension
 */

import { pipeline, env } from '@huggingface/transformers';

console.log('[Offscreen] Starting offscreen document for embeddings...');

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

// Initialize the pipeline
async function initializePipeline() {
  if (embeddingPipeline) return;
  
  console.log('[Offscreen] Initializing pipeline...');
  embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    device: 'wasm',
    dtype: 'q8',
  });
  console.log('[Offscreen] ✅ Pipeline initialized');
}

// Generate embedding for a single text
async function generateEmbedding(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    await initializePipeline();
  }
  
  const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data) as number[];
}

// Generate embeddings for multiple texts with OPTIMIZED parallel processing
async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!embeddingPipeline) {
    await initializePipeline();
  }
  
  const BATCH_SIZE = 16; // Smaller batches for better parallelization
  const MAX_CONCURRENT = 4; // Process 4 batches in parallel
  
  const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
  
  console.log('[Offscreen] 🚀 PARALLEL BATCH PROCESSING:', texts.length, 'texts in', totalBatches, 'batches (', BATCH_SIZE, 'each,', MAX_CONCURRENT, 'concurrent)');
  const startTime = performance.now();
  
  // Create batch processing function
  const processBatch = async (batchIndex: number): Promise<{ index: number; embeddings: number[][] }> => {
    const batchStart = batchIndex * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, texts.length);
    const batchTexts = texts.slice(batchStart, batchEnd);
    
    // Process this batch
    const output = await embeddingPipeline(batchTexts, { pooling: 'mean', normalize: true });
    
    // Convert output to array of embeddings
    const embeddingSize = 384;
    const batchEmbeddings: number[][] = [];
    
    for (let i = 0; i < batchTexts.length; i++) {
      const start = i * embeddingSize;
      const end = start + embeddingSize;
      batchEmbeddings.push(Array.from(output.data.slice(start, end)));
    }
    
    console.log('[Offscreen]    Batch', batchIndex + 1, '/', totalBatches, 'complete');
    return { index: batchIndex, embeddings: batchEmbeddings };
  };
  
  // Process batches with concurrency limit
  const results: { index: number; embeddings: number[][] }[] = [];
  
  for (let i = 0; i < totalBatches; i += MAX_CONCURRENT) {
    const batchPromises = [];
    for (let j = 0; j < MAX_CONCURRENT && i + j < totalBatches; j++) {
      batchPromises.push(processBatch(i + j));
    }
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  // Sort by index and flatten to get all embeddings in order
  results.sort((a, b) => a.index - b.index);
  const allEmbeddings = results.flatMap(r => r.embeddings);
  
  const duration = performance.now() - startTime;
  console.log('[Offscreen] ⚡ All batches completed in', duration.toFixed(2), 'ms');
  console.log('[Offscreen]    Speed:', (texts.length / (duration / 1000)).toFixed(1), 'embeddings/second');
  
  return allEmbeddings;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;
  
  console.log('[Offscreen] Received message:', message.type);
  
  // Handle synchronously to avoid port closing
  const handleMessage = async () => {
    try {
      switch (message.type) {
        case 'initialize':
          await initializePipeline();
          return { success: true };
          
        case 'embedText':
          const embedding = await generateEmbedding(message.text);
          return { success: true, embedding };
          
        case 'generateEmbeddings':
          // TRUE batch embedding - process all texts in one transformer call
          console.log('[Offscreen] Batch embedding request:', message.texts.length, 'texts');
          const embeddings = await generateEmbeddingsBatch(message.texts);
          console.log('[Offscreen] ✅ Batch embedding complete:', embeddings.length, 'embeddings');
          return { success: true, embeddings };
          
        default:
          return { success: false, error: 'Unknown message type' };
      }
    } catch (error) {
      console.error('[Offscreen] Error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  };
  
  // Execute async handler and send response
  handleMessage().then(sendResponse).catch(err => {
    console.error('[Offscreen] Handler error:', err);
    sendResponse({ success: false, error: err.message });
  });
  
  return true; // Keep channel open for async response
});

console.log('[Offscreen] Ready to receive messages');

// Notify background script that offscreen is ready
// Slight delay to ensure message listener is fully registered
setTimeout(() => {
  console.log('[Offscreen] Sending ready signal to background...');
  chrome.runtime.sendMessage({ type: 'offscreenReady' }).then(() => {
    console.log('[Offscreen] ✅ Ready signal sent successfully');
  }).catch((err) => {
    console.warn('[Offscreen] Failed to send ready signal:', err);
  });
}, 100);

