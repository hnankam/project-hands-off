/**
 * @fileoverview Chunking utilities for embeddings
 * 
 * Provides functions for chunking HTML and JSON data into smaller pieces
 * suitable for embedding generation.
 * 
 * @module background/embeddings/chunking
 */

import { DEFAULT_CHUNK_SIZE, JSON_CHUNK_TARGET_SIZE } from '../config/index.js';
import type { HTMLChunk } from '../types/index.js';

/**
 * Chunk HTML by complete elements to maintain tag balance
 * 
 * This ensures each chunk has valid HTML with balanced opening/closing tags.
 * 
 * @param html - Full HTML string
 * @param textContent - Plain text content for proportional chunking
 * @param textChunkSize - Target size for each text chunk
 * @returns Array of chunks with text and HTML
 */
export function chunkHTML(
  html: string,
  textContent: string,
  textChunkSize: number = DEFAULT_CHUNK_SIZE
): HTMLChunk[] {
  const chunks: HTMLChunk[] = [];
  
  // Simple text chunking
  for (let i = 0; i < textContent.length; i += textChunkSize) {
    const chunkText = textContent.slice(i, i + textChunkSize);
    
    // For HTML, try to find a corresponding section that doesn't split tags
    let chunkHTML = '';
    if (html) {
      // Calculate proportional position in HTML
      const startRatio = i / textContent.length;
      const endRatio = Math.min((i + textChunkSize) / textContent.length, 1);
      
      let startPos = Math.floor(startRatio * html.length);
      let endPos = Math.floor(endRatio * html.length);
      
      // Adjust start to not split a tag - find previous '>' or start of string
      while (startPos > 0 && html[startPos - 1] !== '>') {
        startPos--;
      }
      
      // Adjust end to not split a tag - find next '>' or end of string
      while (endPos < html.length && html[endPos] !== '>') {
        endPos++;
      }
      if (endPos < html.length) endPos++; // Include the '>'
      
      chunkHTML = html.slice(startPos, endPos).trim();
    }
    
    chunks.push({ text: chunkText, html: chunkHTML });
  }
  
  return chunks;
}

/**
 * Intelligently chunk an array into smaller valid JSON array strings.
 * 
 * Ensures chunks don't split in the middle of objects (similar to HTML tag splitting).
 * 
 * @param items - The array of items to chunk
 * @param targetChunkSize - Target size in characters for each chunk
 * @returns Array of JSON string chunks, each a valid JSON array
 * 
 * @example
 * const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
 * const chunks = chunkJSONArray(items, 100);
 * // Each chunk is a valid JSON array string
 */
export function chunkJSONArray(
  items: any[],
  targetChunkSize: number = JSON_CHUNK_TARGET_SIZE
): string[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  
  const chunks: string[] = [];
  let currentChunk: any[] = [];
  let currentSize = 2; // Account for opening and closing brackets "[]"
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemJSON = JSON.stringify(item);
    const itemSize = itemJSON.length + (currentChunk.length > 0 ? 1 : 0); // +1 for comma if not first
    
    // If adding this item would exceed target size and we already have items, finalize current chunk
    if (currentSize + itemSize > targetChunkSize && currentChunk.length > 0) {
      chunks.push(JSON.stringify(currentChunk));
      currentChunk = [];
      currentSize = 2; // Reset for new chunk
    }
    
    // Add item to current chunk
    currentChunk.push(item);
    currentSize += itemSize;
  }
  
  // Add final chunk if not empty
  if (currentChunk.length > 0) {
    chunks.push(JSON.stringify(currentChunk));
  }
  
  return chunks;
}

