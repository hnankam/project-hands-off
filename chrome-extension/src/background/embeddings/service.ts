/**
 * @fileoverview Embedding Service
 * 
 * Manages text embedding generation using the offscreen document.
 * Provides initialization, single embedding, and batch embedding capabilities.
 * 
 * @module background/embeddings/service
 */

import { sendToOffscreen } from '../offscreen/manager.js';
import { chunkHTML, chunkJSONArray } from './chunking.js';
import { log, logError } from '../utils/logger.js';
import type { EmbeddingResult, PageContent } from '../types/index.js';

// ============================================================================
// State Management
// ============================================================================

let embeddingInitialized = false;
let embeddingInitPromise: Promise<void> | null = null;

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize embeddings service (deduplicated)
 * Multiple calls will wait for the same initialization promise
 * 
 * @returns Promise that resolves when service is initialized
 */
export async function initializeEmbeddingService(): Promise<void> {
  if (embeddingInitialized) {
    log('[Embeddings] Service already initialized (dedup)');
    return;
  }
  if (embeddingInitPromise) {
    log('[Embeddings] Service init in-flight (dedup)');
    return embeddingInitPromise;
  }
  embeddingInitPromise = (async () => {
    log('[Embeddings] Initializing embedding service via offscreen...');
    await sendToOffscreen({ type: 'initialize' });
    embeddingInitialized = true;
    log('[Embeddings] Service initialized');
  })().finally(() => {
    embeddingInitPromise = null;
  });
  return embeddingInitPromise;
}

/**
 * Generate embedding for a single text
 * 
 * @param text - Text to embed
 * @returns Embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await sendToOffscreen({ type: 'embedText', text });
  return response.embedding!;
}

/**
 * Generate embeddings for multiple texts in batch
 * 
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await sendToOffscreen({ type: 'generateEmbeddings', texts });
  return response.embeddings!;
}

/**
 * Generate embeddings with chunks for page content (GROUPED for form fields and clickable elements)
 * 
 * This function optimizes embedding generation by:
 * 1. Batching all embeddings into a single request
 * 2. Chunking form fields and clickable elements intelligently
 * 3. Maintaining associations between chunks and their embeddings
 * 
 * @param content - Page content to embed
 * @returns Embedding result with full embedding, chunks, and grouped embeddings
 */
export async function embedPageContent(content: PageContent): Promise<EmbeddingResult> {
  // Calculate and log incoming content size
  const contentSize = JSON.stringify(content).length;
  log('[Embeddings] embedPageContent called with content size:', (contentSize / 1024 / 1024).toFixed(2), 'MB');
  
  // Debug: Log what we received
  log('[Embeddings] DEBUG - Received content object:');
  log('[Embeddings]   - content.allDOMContent?:', !!content.allDOMContent);
  log('[Embeddings]   - content.allDOMContent?.allFormData:', content.allDOMContent?.allFormData?.length || 0, 'items');
  log('[Embeddings]   - content.allDOMContent?.clickableElements:', content.allDOMContent?.clickableElements?.length || 0, 'items');
  
  const textContent = content.textContent || JSON.stringify(content);
  const fullHTML = content.allDOMContent?.fullHTML || '';
  
  log('[Embeddings]   - textContent length:', (textContent.length / 1024).toFixed(2), 'KB');
  log('[Embeddings]   - fullHTML length:', (fullHTML.length / 1024).toFixed(2), 'KB');

  // OPTIMIZED: Batch all embeddings into ONE request
  const allTextsToEmbed: string[] = [];
  const textIndexMap: { type: string; index: number; dataIndex: number }[] = [];
  
  // 1. Add full page text
  allTextsToEmbed.push(textContent);
  textIndexMap.push({ type: 'fullPage', index: 0, dataIndex: 0 });
  
  // 2. Prepare chunks with balanced HTML tags (no split tags)
  const chunkSize = 1000;
  const chunkData = chunkHTML(fullHTML, textContent, chunkSize);
  
  // Add chunks to embedding queue
  for (const chunk of chunkData) {
    allTextsToEmbed.push(chunk.text);
    textIndexMap.push({ type: 'chunk', index: allTextsToEmbed.length - 1, dataIndex: chunkData.indexOf(chunk) });
  }
  
  // 3. Prepare form field GROUPS - convert to clean format, then intelligently chunk
  const formFieldGroups: Array<{ groupIndex: number; jsonString: string }> = [];
  const allFormData = content.allDOMContent?.allFormData;
  
  if (allFormData && Array.isArray(allFormData) && allFormData.length > 0) {
    // Convert all form fields to clean format (selector is ALWAYS globally unique)
    const cleanedFormFields = allFormData.map((field: any) => ({
      selector: field.bestSelector || field.selector || 'unknown',
      tagName: field.tagName || 'unknown',
      fieldType: field.type || 'unknown',
      fieldName: field.name || '',
      fieldId: field.id || '',
      placeholder: field.placeholder,
      fieldValue: field.value,
      isUnique: field.isUnique !== undefined ? field.isUnique : false,
      foundInShadowDOM: field.foundInShadowDOM || false,
      shadowHostSelector: field.shadowHostSelector || undefined,
      shadowPath: field.shadowPath || undefined,
      shadowDepth: field.shadowDepth || undefined,
    }));
    
    // Intelligently chunk the array directly (target ~10KB per chunk)
    const formFieldChunks = chunkJSONArray(cleanedFormFields, 10000);
    
    log('[Embeddings] Form field chunking:', cleanedFormFields.length, 'fields →', formFieldChunks.length, 'chunks');
    
    // Add each chunk to embedding queue
    formFieldChunks.forEach((jsonChunk, index) => {
      formFieldGroups.push({
        groupIndex: index,
        jsonString: jsonChunk,
      });
      
      allTextsToEmbed.push(jsonChunk);
      textIndexMap.push({ type: 'formFieldGroup', index: allTextsToEmbed.length - 1, dataIndex: index });
    });
  }
  
  // 4. Prepare clickable element GROUPS - convert to clean format, then intelligently chunk
  const clickableElementGroups: Array<{ groupIndex: number; jsonString: string }> = [];
  const clickableElements = content.allDOMContent?.clickableElements;
  
  if (clickableElements && Array.isArray(clickableElements) && clickableElements.length > 0) {
    // Convert all clickable elements to clean format (selector is ALWAYS globally unique)
    const cleanedClickableElements = clickableElements.map((element: any) => ({
      selector: element.bestSelector || element.selector || 'unknown',
      tagName: element.tagName || 'unknown',
      text: element.text || '',
      ariaLabel: element.ariaLabel,
      href: element.href,
      isUnique: element.isUnique !== undefined ? element.isUnique : false,
      foundInShadowDOM: element.foundInShadowDOM || false,
      shadowHostSelector: element.shadowHostSelector || undefined,
      shadowPath: element.shadowPath || undefined,
      shadowDepth: element.shadowDepth || undefined,
    }));
    
    // Intelligently chunk the array directly (target ~10KB per chunk)
    const clickableElementChunks = chunkJSONArray(cleanedClickableElements, 10000);
    
    log('[Embeddings] Clickable element chunking:', cleanedClickableElements.length, 'elements →', clickableElementChunks.length, 'chunks');
    
    // Add each chunk to embedding queue
    clickableElementChunks.forEach((jsonChunk, index) => {
      clickableElementGroups.push({
        groupIndex: index,
        jsonString: jsonChunk,
      });
      
      allTextsToEmbed.push(jsonChunk);
      textIndexMap.push({ type: 'clickableGroup', index: allTextsToEmbed.length - 1, dataIndex: index });
    });
  }
  
  // Debug: Log prepared data BEFORE batch embedding
  log('[Embeddings]   DEBUG - Prepared data arrays:');
  log('[Embeddings]   - formFieldGroups.length:', formFieldGroups.length);
  log('[Embeddings]   - clickableElementGroups.length:', clickableElementGroups.length);
  
  // 5. Generate ALL embeddings in ONE batch request
  log('[Embeddings]   Batch embedding:', allTextsToEmbed.length, 'items in one request');
  log('[Embeddings]   - Full page: 1');
  log('[Embeddings]   - HTML chunks:', chunkData.length);
  log('[Embeddings]   - Form field GROUPS:', formFieldGroups.length, '(intelligently chunked)');
  log('[Embeddings]   - Clickable element GROUPS:', clickableElementGroups.length, '(intelligently chunked)');
  
  // Send ONE batch request to offscreen document using onMessage pattern
  log('[Embeddings]   About to call sendToOffscreen (awaiting WASM work)...');
  const sendStartTime = performance.now();
  const response = await sendToOffscreen({
    type: 'generateEmbeddings',
    texts: allTextsToEmbed
  });
  const sendDuration = (performance.now() - sendStartTime).toFixed(0);
  log('[Embeddings] sendToOffscreen completed (took', sendDuration, 'ms)');
  
  if (!response.success) {
    throw new Error(response.error || 'Batch embedding failed');
  }
  
  const allEmbeddings = response.embeddings as number[][];
  
  log('[Embeddings]   Batch embedding complete:', allEmbeddings.length, 'embeddings generated');
  
  // 6. Map embeddings back to their respective items
  const fullEmbedding = allEmbeddings[0];
  
  log('[Embeddings]   DEBUG - First embedding from offscreen:', {
    isArray: Array.isArray(allEmbeddings[0]),
    length: allEmbeddings[0]?.length,
    firstValue: allEmbeddings[0]?.[0],
    type: typeof allEmbeddings[0]?.[0]
  });
  
  // For large content, truncate text/html to reduce message size
  // Embeddings are what matter for search - full content can be refetched
  const MAX_CHUNK_TEXT_SIZE = 500; // Reduced from full ~1000 chars
  const MAX_CHUNK_HTML_SIZE = 1000;
  
  const chunks = chunkData.map((chunk, i) => ({
    text: chunk.text.length > MAX_CHUNK_TEXT_SIZE 
      ? chunk.text.substring(0, MAX_CHUNK_TEXT_SIZE) + '...' 
      : chunk.text,
    html: chunk.html.length > MAX_CHUNK_HTML_SIZE 
      ? chunk.html.substring(0, MAX_CHUNK_HTML_SIZE) + '<!-- truncated -->' 
      : chunk.html,
    embedding: allEmbeddings[textIndexMap.find(m => m.type === 'chunk' && m.dataIndex === i)!.index]
  }));
  
  log('[Embeddings]   DEBUG - First chunk after mapping:', {
    hasEmbedding: !!chunks[0].embedding,
    isArray: Array.isArray(chunks[0].embedding),
    length: chunks[0].embedding?.length,
    firstValue: chunks[0].embedding?.[0]
  });
  
  // Map form field groups with their embeddings (from JSON strings)
  const formFieldGroupEmbeddings = formFieldGroups.map((group, i) => ({
    groupIndex: group.groupIndex,
    fieldsJSON: group.jsonString,
    embedding: allEmbeddings[textIndexMap.find(m => m.type === 'formFieldGroup' && m.dataIndex === i)!.index]
  }));
  
  // Map clickable element groups with their embeddings (from JSON strings)
  const clickableElementGroupEmbeddings = clickableElementGroups.map((group, i) => ({
    groupIndex: group.groupIndex,
    elementsJSON: group.jsonString,
    embedding: allEmbeddings[textIndexMap.find(m => m.type === 'clickableGroup' && m.dataIndex === i)!.index]
  }));

  // Debug: Log what we're returning and estimate size
  const resultSizeEstimate = JSON.stringify({ 
    fullEmbedding, 
    chunks,
    formFieldGroupEmbeddings,
    clickableElementGroupEmbeddings
  }).length;
  
  log('[Embeddings]   Final results:');
  log('[Embeddings]   - chunks:', chunks.length);
  log('[Embeddings]   - formFieldGroupEmbeddings:', formFieldGroupEmbeddings.length, 'groups');
  log('[Embeddings]   - clickableElementGroupEmbeddings:', clickableElementGroupEmbeddings.length, 'groups');
  log('[Embeddings]   - Estimated result size:', (resultSizeEstimate / 1024 / 1024).toFixed(2), 'MB');
  
  return { 
    fullEmbedding, 
    chunks,
    formFieldGroupEmbeddings: formFieldGroupEmbeddings.length > 0 ? formFieldGroupEmbeddings : undefined,
    clickableElementGroupEmbeddings: clickableElementGroupEmbeddings.length > 0 ? clickableElementGroupEmbeddings : undefined
  };
}

