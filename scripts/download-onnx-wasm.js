#!/usr/bin/env node

/**
 * Download ONNX Runtime Web WASM files for local hosting in Chrome extension
 * Based on how transformers.js-chrome handles WASM files
 */

import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { get } from 'https';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Target directory at chrome-extension/public
// This gets copied to dist root by vite build
// Allows env.backends.onnx.wasm.wasmPaths = '' to work
// See: https://github.com/huggingface/transformers.js/issues/1248
const WASM_DIR = join(__dirname, '../chrome-extension/public');

// ONNX Runtime Web files we need to download
// Version should match what transformers.js uses
const ONNX_VERSION = '1.20.1';
const CDN_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_VERSION}/dist/`;

// Only download the files that actually exist on the CDN
// The other variants don't exist for the version we're using
const FILES_TO_DOWNLOAD = [
  'ort-wasm-simd-threaded.jsep.wasm',  // 21MB - Main WASM file
  'ort-wasm-simd-threaded.jsep.mjs',   // 46KB - JS loader
];

/**
 * Download a file from URL to local path
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading: ${url}`);
    const file = createWriteStream(dest);
    
    get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log(`✅ Downloaded: ${dest}`);
            resolve();
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✅ Downloaded: ${dest}`);
          resolve();
        });
      }
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
    
    file.on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

/**
 * Main download function
 */
async function downloadOnnxWasm() {
  console.log('🚀 Starting ONNX Runtime WASM download...\n');
  
  // Create wasm directory if it doesn't exist
  if (!existsSync(WASM_DIR)) {
    console.log(`📁 Creating directory: ${WASM_DIR}`);
    mkdirSync(WASM_DIR, { recursive: true });
  }
  
  // Download all files
  for (const file of FILES_TO_DOWNLOAD) {
    const url = CDN_BASE + file;
    const dest = join(WASM_DIR, file);
    
    try {
      await downloadFile(url, dest);
    } catch (error) {
      console.error(`❌ Failed to download ${file}:`, error.message);
      // Continue with other files even if one fails
    }
  }
  
  console.log('\n✅ ONNX Runtime WASM files downloaded successfully!');
  console.log(`📂 Files located at: ${WASM_DIR}`);
}

// Run the download
downloadOnnxWasm().catch((error) => {
  console.error('❌ Download failed:', error);
  process.exit(1);
});

