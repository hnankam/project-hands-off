/**
 * @fileoverview Shared Embedding Configuration
 * 
 * Centralized configuration for embedding models, quantization, and runtime preferences.
 * Imported by both offscreen.ts and embedding-worker.ts to ensure consistency.
 * 
 * @module offscreen/embedding-config
 */

// ===== EMBEDDING MODEL SELECTION =====
// Choose your embedding model (comment/uncomment to switch):
export const EMBEDDING_MODEL = 'Xenova/paraphrase-MiniLM-L3-v2'; // 🚀 FASTEST (14MB, ~40% faster, good quality)
// export const EMBEDDING_MODEL = 'Supabase/gte-small';          // ⭐ RECOMMENDED (33MB, most stable, best accuracy)
// export const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';    // ⭐ ALTERNATIVE (33MB, state-of-the-art small model)
// export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';     // 📊 ORIGINAL (23MB, baseline)
// export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L12-v2';    // 🎯 HIGHEST QUALITY (45MB, slower but best quality)

// ===== QUANTIZATION SELECTION =====
// Choose quantization level (comment/uncomment to switch):
export const USE_AGGRESSIVE_QUANTIZATION = true;  // ⚡ FASTEST (fp16/q4, ~30-40% faster, minimal quality loss)
// export const USE_AGGRESSIVE_QUANTIZATION = false; // 🎯 BALANCED (fp32/q8, default quality)

// ===== MODEL-SPECIFIC CONFIGURATION =====
// Embedding dimensions vary by model
const MODEL_DIMENSIONS: Record<string, number> = {
  'Xenova/paraphrase-MiniLM-L3-v2': 384,
  'Supabase/gte-small': 384,
  'Xenova/bge-small-en-v1.5': 384,
  'Xenova/all-MiniLM-L6-v2': 384,
  'Xenova/all-MiniLM-L12-v2': 384,
};

// Get dimension for current model
export const EMBEDDING_DIMENSION = MODEL_DIMENSIONS[EMBEDDING_MODEL] || 384;

// ===== RUNTIME CONFIGURATION =====
export const EMBEDDING_RUNTIME_PREFERENCE: 'worker' | 'auto' = 'auto';
export const BATCH_SIZE = 16; // Optimal batch size for GPU performance
export const WORKER_INIT_TIMEOUT_MS = 30000;
export const OFFSCREEN_READY_DELAY_MS = 100;

// Valid dtype options for transformers.js
export type DType = 'auto' | 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4' | 'bnb4' | 'q4f16';

/**
 * Get dtype (data type) based on device and quantization setting
 * @param device - Target device ('webgpu' or 'wasm')
 * @returns Appropriate dtype for the device
 */
export function getDtype(device: 'webgpu' | 'wasm'): DType {
  return USE_AGGRESSIVE_QUANTIZATION 
    ? (device === 'webgpu' ? 'fp16' : 'q4')  // Aggressive: fp16 for GPU, q4 for CPU
    : (device === 'webgpu' ? 'fp32' : 'q8'); // Balanced: fp32 for GPU, q8 for CPU
}

