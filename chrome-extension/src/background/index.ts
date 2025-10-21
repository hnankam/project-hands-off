import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';

// Type declaration for utils library
declare global {
  interface Window {
    utils: {
      generateFastSelector: (element: Element) => { selector: string; isUnique: boolean };
    };
  }
}

// Offscreen document constants
const OFFSCREEN_DOCUMENT_PATH = 'offscreen/src/index.html';
let creatingOffscreen: Promise<void> | null = null;
let offscreenReadyPromise: Promise<void> | null = null;
let offscreenReadyResolve: (() => void) | null = null;

exampleThemeStorage.get().then(theme => {
  // console.log('theme', theme);
});

// Conditional logging (set to false in production)
const DEBUG = true;
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const log = (...args: any[]) => DEBUG && console.log(ts(), ...args);
const logError = (...args: any[]) => console.error(ts(), ...args); // Always log errors

log('Background loaded');
// log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");

// Create offscreen document for embeddings
async function setupOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) {
    // Document exists, wait for ready signal if not already ready
    if (offscreenReadyPromise) {
      await offscreenReadyPromise;
    }
    return;
  }
  
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  
  // Create promise that will be resolved when offscreen sends ready signal
  offscreenReadyPromise = new Promise(resolve => {
    offscreenReadyResolve = resolve;
  });
  
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run transformers.js for text embeddings',
  });
  
  await creatingOffscreen;
  creatingOffscreen = null;
  
  log('[Background] ✅ Offscreen document created, waiting for ready signal...');
  
  // Wait for offscreen to signal it's ready (or timeout after 30s)
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Offscreen ready timeout')), 30000)
  );
  
  try {
    await Promise.race([offscreenReadyPromise, timeoutPromise]);
    log('[Background] ✅ Offscreen ready signal received');
  } catch (error) {
    logError('[Background] ❌ Offscreen ready timeout');
    throw error;
  }
}

// Send message to offscreen document using onMessage listener pattern
async function sendToOffscreen(message: any): Promise<any> {
  await setupOffscreenDocument();
  
  return new Promise((resolve, reject) => {
    const requestId = `offscreen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Set up listener for response from offscreen
    const responseListener = (msg: any) => {
      log('[Background] 📬 sendToOffscreen received message:', msg.type, 'requestId:', msg.requestId, 'looking for:', requestId);
      
      if (msg.type === 'offscreenResponse' && msg.requestId === requestId) {
        log('[Background] ✅ Message matched! success:', msg.success, 'embeddingsCount:', msg.embeddings?.length);
        chrome.runtime.onMessage.removeListener(responseListener);
        
        if (msg.success) {
          log('[Background] ✅ Resolving with response');
          resolve(msg);
      } else {
          log('[Background] ❌ Rejecting with error:', msg.error);
          reject(new Error(msg.error || 'Unknown error'));
        }
      }
    };
    
    chrome.runtime.onMessage.addListener(responseListener);
    
    // Send message without callback - response comes via listener
    chrome.runtime.sendMessage({ 
      ...message, 
      target: 'offscreen',
      requestId 
    }).catch(err => {
      chrome.runtime.onMessage.removeListener(responseListener);
      reject(err);
    });
  });
}

// Initialize embeddings service
async function initializeEmbeddingService() {
  log('[Background] Initializing embedding service via offscreen...');
  await sendToOffscreen({ type: 'initialize' });
  log('[Background] ✅ Embedding service initialized');
}

// Generate embedding for text
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await sendToOffscreen({ type: 'embedText', text });
  return response.embedding;
}

/**
 * Chunk HTML by complete elements to maintain tag balance
 * This ensures each chunk has valid HTML with balanced opening/closing tags
 */
function chunkHTML(html: string, textContent: string, textChunkSize: number): Array<{ text: string; html: string }> {
  const chunks: Array<{ text: string; html: string }> = [];
  
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
 * Ensures chunks don't split in the middle of objects (similar to HTML tag splitting).
 * 
 * @param items - The array of items to chunk
 * @param targetChunkSize - Target size in characters for each chunk
 * @returns Array of JSON string chunks, each a valid JSON array
 */
function chunkJSONArray(items: any[], targetChunkSize: number = 10000): string[] {
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

// Generate embeddings with chunks for page content (GROUPED for form fields and clickable elements)
async function embedPageContent(content: any): Promise<{ 
  fullEmbedding: number[]; 
  chunks: Array<{ text: string; html: string; embedding: number[] }>;
  formFieldGroupEmbeddings?: Array<{ groupIndex: number; fieldsJSON: string; embedding: number[] }>;
  clickableElementGroupEmbeddings?: Array<{ groupIndex: number; elementsJSON: string; embedding: number[] }>;
}> {
  // Debug: Log what we received
  log('[Background] 🔍 DEBUG - Received content object:');
  log('[Background]    - content.allDOMContent?:', !!content.allDOMContent);
  log('[Background]    - content.allDOMContent?.allFormData:', content.allDOMContent?.allFormData?.length || 0, 'items');
  log('[Background]    - content.allDOMContent?.clickableElements:', content.allDOMContent?.clickableElements?.length || 0, 'items');
  
  const textContent = content.textContent || JSON.stringify(content);
  const fullHTML = content.allDOMContent?.fullHTML || '';

  // ========================================
  // OPTIMIZED: Batch all embeddings into ONE request
  // ========================================
  
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
    // Convert all form fields to clean format
    const cleanedFormFields = allFormData.map((field: any) => ({
      selector: field.bestSelector || field.selector || 'unknown',
      tagName: field.tagName || 'unknown',
      fieldType: field.type || 'unknown',
      fieldName: field.name || '',
      fieldId: field.id || '',
      placeholder: field.placeholder,
      fieldValue: field.value,
    }));
    
    // Intelligently chunk the array directly (target ~10KB per chunk)
    const formFieldChunks = chunkJSONArray(cleanedFormFields, 10000);
    
    log('[Background] 📊 Form field chunking:', cleanedFormFields.length, 'fields →', formFieldChunks.length, 'chunks');
    
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
    // Convert all clickable elements to clean format
    const cleanedClickableElements = clickableElements.map((element: any) => ({
      selector: element.bestSelector || element.selector || 'unknown',
      tagName: element.tagName || 'unknown',
      text: element.text || '',
      ariaLabel: element.ariaLabel,
      href: element.href,
    }));
    
    // Intelligently chunk the array directly (target ~10KB per chunk)
    const clickableElementChunks = chunkJSONArray(cleanedClickableElements, 10000);
    
    log('[Background] 📊 Clickable element chunking:', cleanedClickableElements.length, 'elements →', clickableElementChunks.length, 'chunks');
    
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
  log('[Background] 🔍 DEBUG - Prepared data arrays:');
  log('[Background]    - formFieldGroups.length:', formFieldGroups.length);
  log('[Background]    - clickableElementGroups.length:', clickableElementGroups.length);
  
  // 5. Generate ALL embeddings in ONE batch request
  log('[Background] 🚀 Batch embedding:', allTextsToEmbed.length, 'items in one request');
  log('[Background]    - Full page: 1');
  log('[Background]    - HTML chunks:', chunkData.length);
  log('[Background]    - Form field GROUPS:', formFieldGroups.length, '(intelligently chunked)');
  log('[Background]    - Clickable element GROUPS:', clickableElementGroups.length, '(intelligently chunked)');
  
  // Send ONE batch request to offscreen document using onMessage pattern
  log('[Background] ⏳ About to call sendToOffscreen (awaiting WASM work)...');
  const sendStartTime = performance.now();
  const response = await sendToOffscreen({
    type: 'generateEmbeddings',
    texts: allTextsToEmbed
  });
  const sendDuration = (performance.now() - sendStartTime).toFixed(0);
  log('[Background] ✅ sendToOffscreen completed (took', sendDuration, 'ms)');
  
  if (!response.success) {
    throw new Error(response.error || 'Batch embedding failed');
  }
  
  const allEmbeddings = response.embeddings as number[][];
  
  log('[Background] ✅ Batch embedding complete:', allEmbeddings.length, 'embeddings generated');
  
  // 6. Map embeddings back to their respective items
  const fullEmbedding = allEmbeddings[0];
  
  log('[Background] 🔍 DEBUG - First embedding from offscreen:', {
    isArray: Array.isArray(allEmbeddings[0]),
    length: allEmbeddings[0]?.length,
    firstValue: allEmbeddings[0]?.[0],
    type: typeof allEmbeddings[0]?.[0]
  });
  
  const chunks: Array<{ text: string; html: string; embedding: number[] }> = chunkData.map((chunk, i) => ({
    text: chunk.text,
    html: chunk.html,
    embedding: allEmbeddings[textIndexMap.find(m => m.type === 'chunk' && m.dataIndex === i)!.index]
  }));
  
  log('[Background] 🔍 DEBUG - First chunk after mapping:', {
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

  // Debug: Log what we're returning
  log('[Background] 📊 Final results:');
  log('[Background]    - chunks:', chunks.length);
  log('[Background]    - formFieldGroupEmbeddings:', formFieldGroupEmbeddings.length, 'groups');
  log('[Background]    - clickableElementGroupEmbeddings:', clickableElementGroupEmbeddings.length, 'groups');
  
  return { 
    fullEmbedding, 
    chunks,
    formFieldGroupEmbeddings: formFieldGroupEmbeddings.length > 0 ? formFieldGroupEmbeddings : undefined,
    clickableElementGroupEmbeddings: clickableElementGroupEmbeddings.length > 0 ? clickableElementGroupEmbeddings : undefined
  };
}

// Interface for page content data (memory-only, not persisted to storage for small pages, use indexedDB for large pages)
interface PageContentData {
  [tabId: string]: {
    content: any;
    timestamp: number;
    url: string;
    title: string;
  };
}

// Store for current page content
let currentPageContent: PageContentData = {};

// Set up side panel behavior - enable auto-open on action click
chrome.runtime.onInstalled.addListener(() => {
  // Enable auto-opening side panel when extension icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  // log('Extension installed - side panel auto-open enabled');
  
  // PRE-LOAD the embedding model on installation to prevent UI freeze on first use
  log('[Background] Pre-loading embedding model on install...');
  initializeEmbeddingService().catch(err => {
    logError('[Background] Failed to pre-load model:', err);
  });
});

// Also set on startup to ensure side panel auto-open works
chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  // log('Extension startup - side panel auto-open enabled');
  
  // PRE-LOAD the embedding model to prevent UI freeze on first use
  log('[Background] Pre-loading embedding model...');
  initializeEmbeddingService().catch(err => {
    logError('[Background] Failed to pre-load model:', err);
  });
});

// Handle messages from content scripts, side panel, and offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle offscreen ready signal
  if (message.type === 'offscreenReady') {
    log('[Background] ✅ Offscreen document ready');
    if (offscreenReadyResolve) {
      offscreenReadyResolve();
      offscreenReadyResolve = null;
    }
    return false;
  }
  
  // Handle offscreen responses
  if (message.type === 'offscreenResponse') {
    // These are handled by listeners in sendToOffscreen
    return false;
  }
  
  // ============ EMBEDDING MESSAGES (onMessage pattern only) ============
  if (message.type === 'initializeEmbedding') {
    const requestId = message.requestId || `init_${Date.now()}`;
    log('[Background] 📥 Received initializeEmbedding request:', requestId);
    
    // Respond immediately to avoid panel timeout; warm up offscreen asynchronously.
    chrome.runtime.sendMessage({
      type: 'initializeEmbeddingResponse',
      requestId,
      success: true
    }).then(() => {
      log('[Background] ✅ initializeEmbeddingResponse sent (optimistic)');
    }).catch(err => {
      logError('[Background] ❌ Failed to send initializeEmbeddingResponse:', err);
    });

    // Ensure offscreen exists, then fire-and-forget warmup
    (async () => {
      try {
        await setupOffscreenDocument();
        const warmId = `warm_${Date.now()}`;
        chrome.runtime.sendMessage({ type: 'initialize', target: 'offscreen', requestId: warmId }).catch(() => {});
      } catch (err) {
        logError('[Background] ❌ Offscreen setup failed:', err);
      }
    })();
    
    return false;
  } else if (message.type === 'embedPageContent') {
    // Process content directly from message (no storage)
    const requestId = message.requestId || `embed_${Date.now()}`;
    log('[Background] 📥 Received embedPageContent request:', requestId);
    
    (async () => {
      try {
        log('[Background] 🔄 DEBUG - Received content object:');
        log('[Background]    - content.allDOMContent?:', !!message.content.allDOMContent);
        const result = await embedPageContent(message.content);
        
        // DEBUG: Check embeddings RIGHT BEFORE sending to side panel
        log('[Background] 🔍 DEBUG - Result BEFORE sending to side panel:', {
          hasChunks: !!result.chunks,
          chunksLength: result.chunks?.length,
          firstChunkEmbedding: {
            exists: !!result.chunks?.[0]?.embedding,
            isArray: Array.isArray(result.chunks?.[0]?.embedding),
            length: result.chunks?.[0]?.embedding?.length,
            firstValue: result.chunks?.[0]?.embedding?.[0],
            first5: result.chunks?.[0]?.embedding?.slice(0, 5)
          }
        });
        
        log('[Background] 📤 Sending embeddingComplete (success):', requestId);
        chrome.runtime.sendMessage({
          type: 'embeddingComplete',
          requestId,
          result
        }).then(() => {
          log('[Background] ✅ embeddingComplete sent successfully');
        }).catch(err => {
          logError('[Background] ❌ Failed to send embeddingComplete:', err);
        });
      } catch (error) {
        logError('[Background] ❌ Embedding failed:', error);
        chrome.runtime.sendMessage({
          type: 'embeddingComplete',
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }).catch(() => {});
      }
    })();
    
    return false;
  } else if (message.type === 'embedPageContentForTab') {
    // NEW: Avoid large payload serialization from side panel by embedding using cached/on-demand content
    const requestId = message.requestId || `embed_tab_${Date.now()}`;
    const tabId: number | undefined = message.tabId || sender.tab?.id;
    log('[Background] 📥 Received embedPageContentForTab request:', requestId, 'tabId:', tabId);
    
    (async () => {
      try {
        if (!tabId) {
          throw new Error('No tabId provided');
        }

        // Try cached content first
        const cached = currentPageContent[tabId.toString()];
        let content = cached?.content;

        if (!content) {
          log('[Background] ⚠️ No cached content for tab. Fetching on-demand...');
          const response = await new Promise<any>((resolve) => {
            // Reuse existing on-demand path; it responds via callback
            chrome.runtime.sendMessage({ type: 'getPageContentOnDemand', tabId }, (resp) => resolve(resp));
          });
          if (!response?.success || !response?.content) {
            throw new Error(response?.error || 'Failed to fetch page content');
          }
          content = response.content;
        }

        const result = await embedPageContent(content);

        chrome.runtime.sendMessage({
          type: 'embeddingComplete',
          requestId,
          result
        }).catch(() => {});
      } catch (error) {
        logError('[Background] ❌ embedPageContentForTab failed:', error);
        chrome.runtime.sendMessage({
          type: 'embeddingComplete',
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }).catch(() => {});
      }
    })();
    
    return false;
  } else if (message.type === 'generateEmbedding') {
    const requestId = message.requestId || `single_${Date.now()}`;
    
    generateEmbedding(message.text)
      .then(embedding => {
        chrome.runtime.sendMessage({
          type: 'generateEmbeddingResponse',
          requestId,
          success: true,
          embedding
        }).catch(() => {});
      })
      .catch(error => {
        chrome.runtime.sendMessage({
          type: 'generateEmbeddingResponse',
          requestId,
          success: false,
          error: error.message
        }).catch(() => {});
      });
    
    return false;
  } else if (message.type === 'generateEmbeddings') {
    const requestId = message.requestId || `batch_${Date.now()}`;
    const texts = message.texts as string[];
    
    Promise.all(texts.map(text => generateEmbedding(text)))
      .then(embeddings => {
        chrome.runtime.sendMessage({
          type: 'generateEmbeddingsResponse',
          requestId,
          success: true,
          embeddings
        }).catch(() => {});
      })
      .catch(error => {
        chrome.runtime.sendMessage({
          type: 'generateEmbeddingsResponse',
          requestId,
          success: false,
          error: error.message
        }).catch(() => {});
      });
    
    return false;
  }
  
  // ============ NON-EMBEDDING MESSAGES (sendResponse pattern) ============
  if (message.type === 'pageContentUpdate') {
    handlePageContentUpdate(message.data, sender.tab?.id);
    sendResponse({ success: true });
  } else if (message.type === 'getPageContent') {
    const tabId = message.tabId || sender.tab?.id;
    const content = tabId ? currentPageContent[tabId.toString()] : null;
    sendResponse({ content: content?.content || null });
  } else if (message.type === 'requestPageAnalysis') {
    extractPageContent(message.tabId || sender.tab?.id);
    sendResponse({ success: true });
  } else if (message.type === 'getCurrentTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab) {
        sendResponse({ 
          tabId: activeTab.id, 
          url: activeTab.url, 
          title: activeTab.title 
        });
      } else {
        sendResponse({ tabId: null, url: null, title: null });
      }
    });
    return true; // Async response via sendResponse
  } else if (message.type === 'urlChanged') {
    const tabId = sender.tab?.id;
    if (tabId) {
      log('URL changed, clearing cached content for tab:', tabId);
      delete currentPageContent[tabId.toString()];
      
      chrome.runtime.sendMessage({
        type: 'urlChanged',
        tabId: tabId,
        url: message.url
      }).catch(() => {});
    }
    sendResponse({ success: true });
  } else if (message.type === 'getPageContentOnDemand') {
    extractPageContent(message.tabId || sender.tab?.id, sendResponse);
    return true;
  } else if (message.type === 'domContentChanged') {
    const tabId = sender.tab?.id;
    if (tabId) {
      log('[Background] DOM changes detected on tab:', tabId);
      
      chrome.runtime.sendMessage({
        type: 'contentBecameStale',
        tabId: tabId,
        url: message.url,
        timestamp: message.timestamp,
        domUpdate: message.domUpdate
      }).catch(() => {});
    }
    sendResponse({ success: true });
  }
  // Only return true for messages that use sendResponse pattern
  // Messages that use chrome.runtime.sendMessage for responses should return false
  return false;
});

// Handle page content updates from content scripts
async function handlePageContentUpdate(data: any, tabId?: number, skipBroadcast = false) {
  if (!tabId) return;

  const tabIdStr = tabId.toString();
  currentPageContent[tabIdStr] = {
    content: data,
    timestamp: data.timestamp || Date.now(),
    url: data.url,
    title: data.title
  };

  // Skip broadcast for on-demand fetches (they get direct response)
  // This prevents duplicate processing in the side panel
  if (!skipBroadcast) {
    // Log content size before broadcasting to content manager
    const contentString = JSON.stringify(data);
    const totalSizeKB = (contentString.length / 1024).toFixed(2);
    const totalSizeMB = (contentString.length / (1024 * 1024)).toFixed(2);
    
    log('📊 [Background] Content size before sending to ContentManager:');
    log(`   Total size: ${totalSizeKB} KB (${totalSizeMB} MB)`);
    log(`   URL: ${data.url}`);
    log(`   Title: ${data.title}`);
    
    // Log sizes of individual content sections
    if (data.allDOMContent) {
      if (data.allDOMContent.fullHTML) {
        log('   - fullHTML sample: ', data.allDOMContent.fullHTML.substring(0, 200));
        const htmlSizeKB = (data.allDOMContent.fullHTML.length / 1024).toFixed(2);
        log(`   - fullHTML: ${htmlSizeKB} KB`);
      }
      if (data.textContent) {
        log('   - textContent sample: ', data.textContent.substring(0, 200));
        const textSizeKB = (data.textContent.length / 1024).toFixed(2);
        log(`   - textContent: ${textSizeKB} KB`);
      }
      if (data.allDOMContent.allFormData) {
        const formDataSize = (JSON.stringify(data.allDOMContent.allFormData).length / 1024).toFixed(2);
        log(`   - allFormData: ${formDataSize} KB (${data.allDOMContent.allFormData.length} elements)`);
        if (data.allDOMContent.allFormData.length > 0) {
          log('   - allFormData first 3 elements:', data.allDOMContent.allFormData.slice(0, 3).map((f: any) => ({
            type: f.type,
            name: f.name,
            label: f.label,
            selector: f.bestSelector
          })));
        }
      }
      if (data.allDOMContent.clickableElements) {
        const clickableSize = (JSON.stringify(data.allDOMContent.clickableElements).length / 1024).toFixed(2);
        log(`   - clickableElements: ${clickableSize} KB (${data.allDOMContent.clickableElements.length} elements)`);
        if (data.allDOMContent.clickableElements.length > 0) {
          log('   - clickableElements first 3 elements:', data.allDOMContent.clickableElements.slice(0, 3).map((c: any) => ({
            tagName: c.tagName,
            text: c.text?.substring(0, 50),
            selector: c.selector
          })));
        }
      }
      if (data.allDOMContent.shadowContent && data.allDOMContent.shadowContent.length > 0) {
        const shadowSize = (JSON.stringify(data.allDOMContent.shadowContent).length / 1024).toFixed(2);
        log(`   - shadowContent: ${shadowSize} KB (${data.allDOMContent.shadowContent.length} shadow roots)`);
        // data.allDOMContent.shadowContent.forEach((shadow: any, index: number) => {
        //   log(`   - shadowContent root ${index + 1}:`, {
        //     host: `${shadow.hostElement}${shadow.hostId ? '#' + shadow.hostId : ''}`,
        //     contentSize: (shadow.content?.length || 0) + ' chars',
        //     textPreview: shadow.textContent?.substring(0, 100)
        //   });
        // });
      }
    }
    
    log('[Background] Broadcasting pageContentUpdated for tab:', tabId);
    // Notify side panel about the update
    chrome.runtime.sendMessage({
      type: 'pageContentUpdated',
      tabId: tabId,
      data: data
    }).catch(() => {
      // Side panel might not be open, ignore error
    });
  } else {
    log('[Background] Skipping broadcast (on-demand fetch) for tab:', tabId);
  }
}

// Unified page content extraction function
async function extractPageContent(tabId?: number, sendResponse?: (response: any) => void) {
  if (!tabId) {
    sendResponse?.({ success: false, error: 'No tab ID provided' });
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
      log('[Background] Skipping tab with no URL:', tab?.url);
      sendResponse?.({ success: false, error: 'Tab has no URL' });
      return;
    }

    // Check for restricted Chrome URLs that cannot be accessed via content scripts
    const isRestrictedURL = tab.url.startsWith('chrome://') || 
                           tab.url.startsWith('chrome-extension://') || 
                           tab.url.startsWith('about:') ||
                           tab.url.startsWith('edge://') ||
                           tab.url.startsWith('moz-extension://');
    
    if (isRestrictedURL) {
      log('[Background] Cannot extract from restricted URL:', tab.url);
      
      // Return basic info for restricted pages
      const basicInfo = {
        url: tab.url,
        title: tab.title || 'Restricted Page',
        textContent: `This is a browser internal page (${tab.url}). Content extraction is not allowed by browser security policies.`,
        allDOMContent: {
          fullHTML: '',
          allFormData: [],
          documentInfo: {
            title: tab.title || 'Restricted Page',
            url: tab.url,
            referrer: '',
            domain: '',
            lastModified: '',
            readyState: 'complete',
            characterSet: 'UTF-8',
            contentType: 'text/html'
          },
          windowInfo: {
            innerWidth: 0,
            innerHeight: 0,
            outerWidth: 0,
            outerHeight: 0,
            scrollX: 0,
            scrollY: 0,
            location: {
              href: tab.url,
              protocol: tab.url.split(':')[0] + ':',
              host: '',
              hostname: '',
              port: '',
              pathname: '',
              search: '',
              hash: ''
            },
            userAgent: '',
            language: '',
            platform: ''
          },
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };
      
      // Skip broadcast if this is an on-demand fetch (has sendResponse)
      await handlePageContentUpdate(basicInfo, tabId, !!sendResponse);
      sendResponse?.({ success: true, content: basicInfo, restricted: true });
      return;
    }

    log('[Background] Extracting page content for:', tab.url);

    // Optimized extraction - only essential data for the AI agent
    try {
      // First inject the utils library
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['utils.js']
      });
      
      // Then run the content extraction script
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {

          // HTML Cleaning Function (runs in page context to clean before sending data)
          const cleanHtmlForAgent = (html: string) => {
            if (!html || html.length === 0) {
              return {
                cleanedHtml: '',
                originalSize: 0,
                cleanedSize: 0,
                reductionPercentage: 0,
                originalSample: '',
                cleanedSample: ''
              };
            }

            const originalSize = html.length;
            const originalSample = html.substring(0, 500);

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Remove unnecessary elements
            const selectorsToRemove = ['head', 'script', 'style', 'link', 'meta', 'noscript', 'iframe', 'object', 'embed', 'svg'];

            selectorsToRemove.forEach(selector => {
              const elements = doc.querySelectorAll(selector);
              elements.forEach(element => {
                // For iframes and SVGs, keep a placeholder with relevant attributes
                if (selector === 'iframe') {
                  const placeholder = doc.createElement('div');
                  placeholder.setAttribute('data-iframe-placeholder', 'true');
                  placeholder.setAttribute('data-src', element.getAttribute('src') || '');
                  placeholder.textContent = `[IFRAME: ${element.getAttribute('src') || 'unknown'}]`;
                  element.replaceWith(placeholder);
                } else if (selector === 'svg') {
                  const placeholder = doc.createElement('div');
                  placeholder.setAttribute('data-svg-placeholder', 'true');
                  placeholder.textContent = '[SVG]';
                  element.replaceWith(placeholder);
                } else {
                  element.remove();
                }
              });
            });

            // Remove inline styles from all elements
            doc.querySelectorAll('*').forEach(element => {
              element.removeAttribute('style');
            });

            // Remove data URLs from images (keep src but remove base64 data)
            doc.querySelectorAll('img').forEach(img => {
              const src = img.getAttribute('src');
              if (src && src.startsWith('data:')) {
                img.setAttribute('data-original-src', 'data:image/...[removed]');
                img.removeAttribute('src');
              }
              // Remove srcset which can contain large data
              img.removeAttribute('srcset');
            });

            // Remove video/audio source elements but keep the video/audio tags
            doc.querySelectorAll('source').forEach(source => {
              const placeholder = doc.createElement('span');
              placeholder.textContent = `[SOURCE: ${source.getAttribute('src') || 'unknown'}]`;
              source.replaceWith(placeholder);
            });

            // Remove comments
            const removeComments = (node: Node) => {
              const childNodes = Array.from(node.childNodes);
              childNodes.forEach(child => {
                if (child.nodeType === Node.COMMENT_NODE) {
                  child.remove();
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                  removeComments(child);
                }
              });
            };
            removeComments(doc.body);

            let cleanedHtml = doc.documentElement.outerHTML;
            
            // Normalize whitespace: remove multiple newlines and excessive spaces
            cleanedHtml = cleanedHtml
              .replace(/>\s+</g, '><')           // Remove whitespace between tags
              .replace(/\n\s*\n+/g, '\n')        // Replace multiple newlines with single newline
              .replace(/^\s+|\s+$/g, '');        // Trim leading/trailing whitespace
            
            const cleanedSize = cleanedHtml.length;
            const cleanedSample = cleanedHtml.substring(0, 500);
            const reductionPercentage = ((originalSize - cleanedSize) / originalSize) * 100;

            return {
              cleanedHtml,
              originalSize,
              cleanedSize,
              reductionPercentage,
              originalSample,
              cleanedSample
            };
          };

          // Robust fallback selector generation when finder fails
          const generateRobustFallbackSelector = (el: Element): { selector: string; isUnique: boolean } => {
            const tagName = el.tagName.toLowerCase();
            
            // Strategy 1: ID selector (most reliable)
            if (el.id) {
              const idSelector = `#${CSS.escape(el.id)}`;
              const matches = document.querySelectorAll(idSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: idSelector, isUnique: true };
              }
            }
            
            // Strategy 2: Data attributes (testing-friendly)
            const testId = el.getAttribute('data-testid');
            if (testId) {
              const dataSelector = `[data-testid="${CSS.escape(testId)}"]`;
              const matches = document.querySelectorAll(dataSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: dataSelector, isUnique: true };
              }
            }
            
            const dataCy = el.getAttribute('data-cy');
            if (dataCy) {
              const dataSelector = `[data-cy="${CSS.escape(dataCy)}"]`;
              const matches = document.querySelectorAll(dataSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: dataSelector, isUnique: true };
              }
            }
            
            // Strategy 3: Name attribute
            const name = el.getAttribute('name');
            if (name) {
              const nameSelector = `${tagName}[name="${CSS.escape(name)}"]`;
              const matches = document.querySelectorAll(nameSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: nameSelector, isUnique: true };
              }
            }
            
            // Strategy 4: Type + name combination
            const type = el.getAttribute('type');
            if (type && name) {
              const typeNameSelector = `${tagName}[type="${CSS.escape(type)}"][name="${CSS.escape(name)}"]`;
              const matches = document.querySelectorAll(typeNameSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: typeNameSelector, isUnique: true };
              }
            }
            
            // Strategy 5: Hierarchical path with classes
            const path: string[] = [];
            let current: Element | null = el;
            let depth = 0;
            
            while (current && current.nodeType === Node.ELEMENT_NODE && depth < 10) {
              let selector = current.tagName.toLowerCase();
              
              // Add classes if available
              if (current.className && typeof current.className === 'string') {
                const classes = Array.from(current.classList);
                if (classes.length > 0) {
                  const classString = classes.map(cls => CSS.escape(cls)).join('.');
                  selector += '.' + classString;
                }
              }
              
              // Add nth-child for disambiguation
              if (current.parentElement) {
                const siblings = Array.from(current.parentElement.children);
                const matchingSiblings = siblings.filter(child => 
                  child.tagName === current!.tagName
                );
                
                if (matchingSiblings.length > 1) {
                  const index = siblings.indexOf(current) + 1;
                  selector += `:nth-child(${index})`;
                }
              }
              
              path.unshift(selector);
              current = current.parentElement;
              depth++;
            }
            
            const fullSelector = path.join(' > ');
            const matches = document.querySelectorAll(fullSelector);
            if (matches.length === 1 && matches[0] === el) {
              return { selector: fullSelector, isUnique: true };
            }
            
            // Strategy 6: Simple tag + class combination
            if (el.className && typeof el.className === 'string') {
              const classes = Array.from(el.classList);
              if (classes.length > 0) {
                const firstClass = classes[0];
                const classSelector = `${tagName}.${CSS.escape(firstClass)}`;
                const matches = document.querySelectorAll(classSelector);
                if (matches.length === 1 && matches[0] === el) {
                  return { selector: classSelector, isUnique: true };
                }
              }
            }
            
            // Strategy 7: Final fallback - tag with nth-child from body
            const allSameTag = document.querySelectorAll(tagName);
            if (allSameTag.length > 1) {
              const index = Array.from(allSameTag).indexOf(el) + 1;
              const nthSelector = `${tagName}:nth-of-type(${index})`;
              const matches = document.querySelectorAll(nthSelector);
              if (matches.length === 1 && matches[0] === el) {
                return { selector: nthSelector, isUnique: true };
              }
            }
            
            // If all strategies fail, return generic selector as non-unique
            return { selector: tagName, isUnique: false };
          };

          // Extract only the minimal data needed by the AI agent
          const extractPageContent = () => {
            
            // Check for Shadow DOM
            const shadowRoots: Array<{
              hostElement: string;
              hostId: string;
              hostClass: string;
              shadowContentSize: number;
              shadowHTML: string;
              fullContent: string;
              textContent: string;
            }> = [];
            let totalShadowContentSize = 0;
            
            // Find all elements with shadow roots
            document.querySelectorAll('*').forEach(element => {
              if (element.shadowRoot) {
                const shadowHTML = element.shadowRoot.innerHTML;
                const shadowSize = shadowHTML.length;
                totalShadowContentSize += shadowSize;
                
                shadowRoots.push({
                  hostElement: element.tagName,
                  hostId: element.id || 'no-id',
                  hostClass: element.className || 'no-class',
                  shadowContentSize: shadowSize,
                  shadowHTML: shadowHTML, // Full shadow content
                  fullContent: shadowHTML,
                  textContent: element.shadowRoot.textContent || ''
                });
              }
            });
            
            // Log Shadow DOM detection results
            // Shadow DOM detection logging disabled to reduce console noise
            // if (shadowRoots.length > 0) {
            //   console.log(`🔍 [Shadow DOM Detection] Found ${shadowRoots.length} shadow root(s) with total content size: ${totalShadowContentSize} characters`);
            //   // shadowRoots.forEach((root, index) => {
            //   //   console.log(`   Shadow Root ${index + 1}:`, {
            //   //     host: `${root.hostElement}${root.hostId ? '#' + root.hostId : ''}${root.hostClass ? '.' + root.hostClass.split(' ')[0] : ''}`,
            //   //     size: `${root.shadowContentSize} chars`,
            //   //     preview: root.shadowHTML
            //   //   });
            //   // });
            // } else {
            //   console.log('🔍 [Shadow DOM Detection] No shadow roots detected');
            // }
            
            // Extract and clean HTML before sending
            const rawFullHTML = document.documentElement.outerHTML;
            const mainHtmlCleaningResult = cleanHtmlForAgent(rawFullHTML);
            
            // Log main HTML cleaning results
            console.log('🧹 [Background] Main HTML Cleaning Results:', {
              originalSize: `${(mainHtmlCleaningResult.originalSize / 1024).toFixed(2)} KB`,
              cleanedSize: `${(mainHtmlCleaningResult.cleanedSize / 1024).toFixed(2)} KB`,
              reductionPercentage: `${mainHtmlCleaningResult.reductionPercentage.toFixed(2)}%`,
              savedBytes: `${((mainHtmlCleaningResult.originalSize - mainHtmlCleaningResult.cleanedSize) / 1024).toFixed(2)} KB`
            });
            
            console.log('📄 [Background] Original HTML Sample (first 500 chars):', mainHtmlCleaningResult.originalSample);
            console.log('✨ [Background] Cleaned HTML Sample (first 500 chars):', mainHtmlCleaningResult.cleanedSample);
            
            // Clean shadow content
            const cleanedShadowRoots = shadowRoots.map((root, index) => {
              const shadowCleaningResult = cleanHtmlForAgent(root.fullContent);
              
              // Log shadow content cleaning results for the first shadow root
              if (index === 0 && shadowCleaningResult.originalSize > 0) {
                console.log(`🧹 [Background] Shadow DOM Cleaning Results (${shadowRoots.length} shadow root${shadowRoots.length > 1 ? 's' : ''}):`, {
                  shadowRootIndex: index + 1,
                  hostElement: root.hostElement,
                  hostId: root.hostId,
                  originalSize: `${(shadowCleaningResult.originalSize / 1024).toFixed(2)} KB`,
                  cleanedSize: `${(shadowCleaningResult.cleanedSize / 1024).toFixed(2)} KB`,
                  reductionPercentage: `${shadowCleaningResult.reductionPercentage.toFixed(2)}%`,
                  savedBytes: `${((shadowCleaningResult.originalSize - shadowCleaningResult.cleanedSize) / 1024).toFixed(2)} KB`
                });
                console.log('📄 [Background] Original Shadow Content Sample:', shadowCleaningResult.originalSample);
                console.log('✨ [Background] Cleaned Shadow Content Sample:', shadowCleaningResult.cleanedSample);
              }
              
              return {
                hostElement: root.hostElement,
                hostId: root.hostId,
                hostClass: root.hostClass,
                content: shadowCleaningResult.cleanedHtml
                // textContent removed - it's huge (251KB) and redundant since agent can parse HTML
              };
            });
            
            // Calculate total savings
            const totalOriginalSize = mainHtmlCleaningResult.originalSize + shadowRoots.reduce((sum, root) => sum + root.fullContent.length, 0);
            const totalCleanedSize = mainHtmlCleaningResult.cleanedSize + cleanedShadowRoots.reduce((sum, root) => sum + root.content.length, 0);
            const totalSavedBytes = totalOriginalSize - totalCleanedSize;
            const totalReductionPercentage = totalOriginalSize > 0 ? (totalSavedBytes / totalOriginalSize) * 100 : 0;
            
            if (shadowRoots.length > 0) {
              console.log('📊 [Background] Total Cleaning Results (Main HTML + Shadow DOM):', {
                totalOriginalSize: `${(totalOriginalSize / 1024).toFixed(2)} KB`,
                totalCleanedSize: `${(totalCleanedSize / 1024).toFixed(2)} KB`,
                totalReductionPercentage: `${totalReductionPercentage.toFixed(2)}%`,
                totalSavedBytes: `${(totalSavedBytes / 1024).toFixed(2)} KB`
              });
            }
            
            return {
              url: window.location.href,
              title: document.title,
              textContent: document.body.innerText || '',
              
              // ONLY extract what the AI agent actually uses:
              allDOMContent: {
                // 1. Full HTML (CLEANED - for CSS selector extraction)
                  fullHTML: mainHtmlCleaningResult.cleanedHtml,
                  
                // 2. Shadow DOM content (CLEANED - for content not visible in main DOM)
                  shadowContent: cleanedShadowRoots,
                  
                // 2. Form data (for form filling actions) - Enhanced to handle custom dropdowns
                  allFormData: (() => {
                    const formElements: Array<{ element: Element; isCustom: boolean; index: number }> = [];
                    
                    // First, collect traditional form elements
                    const traditionalElements = Array.from(document.querySelectorAll('input, select, textarea'));
                    
                    // Then, collect custom dropdown components (button with role="combobox" or data-slot="select-trigger")
                    const customDropdowns = Array.from(document.querySelectorAll('button[role="combobox"], button[data-slot="select-trigger"], [role="combobox"]'));
                    
                    // Process traditional elements
                    traditionalElements.forEach((input, index) => {
                      // Skip hidden select elements that are part of custom dropdowns
                      if (input.tagName === 'SELECT' && 
                          (input.getAttribute('aria-hidden') === 'true' || 
                           input.getAttribute('tabindex') === '-1' ||
                           (input as HTMLElement).style.position === 'absolute')) {
                        // Check if there's a corresponding custom dropdown trigger
                        const container = input.closest('[data-slot="form-item"]');
                        if (container) {
                          const trigger = container.querySelector('button[role="combobox"], button[data-slot="select-trigger"]');
                          if (trigger) {
                            // Skip this hidden select, we'll handle it with the custom dropdown
                            return;
                          }
                        }
                      }
                      
                      formElements.push({ element: input, isCustom: false, index: formElements.length });
                    });
                    
                    // Process custom dropdowns
                    customDropdowns.forEach((button, index) => {
                      formElements.push({ element: button, isCustom: true, index: formElements.length });
                    });
                    
                    return formElements;
                  })().map((item, index) => {
                    const input = item.element;
                    const id = input.id;
                    const name = input.getAttribute('name') || '';
                    const type = input.getAttribute('type') || '';
                    const placeholder = input.getAttribute('placeholder') || '';
                    const tagName = input.tagName.toLowerCase();
                    const isCustom = item.isCustom;
                    
                    // For custom dropdowns, get the associated hidden select element for value extraction
                    let associatedSelect = null;
                    if (isCustom && tagName === 'button') {
                      const container = input.closest('[data-slot="form-item"]');
                      if (container) {
                        associatedSelect = container.querySelector('select[aria-hidden="true"]');
                      }
                    }
                    
                    // Extract label text (multiple methods for different label patterns)
                    let label = '';
                    
                    // Method 1: <label for="inputId">Label Text</label> (direct ID match)
                    if (id) {
                      const labelElement = document.querySelector(`label[for="${CSS.escape(id)}"]`);
                      if (labelElement) {
                        label = labelElement.textContent?.trim() || '';
                      }
                    }
                    
                    // Method 1.5: Look for label that targets a container with the input inside
                    if (!label) {
                      // Check if input is inside a container that has an ID referenced by a label
                      const container = input.closest('[id]');
                      if (container && container.id) {
                        const labelElement = document.querySelector(`label[for="${CSS.escape(container.id)}"]`);
                        if (labelElement) {
                          label = labelElement.textContent?.trim() || '';
                        }
                      }
                    }
                    
                    // Method 2: <label><input>Label Text</label> (wrapping label)
                    if (!label) {
                      const parentLabel = input.closest('label');
                      if (parentLabel) {
                        label = parentLabel.textContent?.trim() || '';
                        // Remove the input's own text content if it's included
                        if (input.textContent) {
                          label = label.replace(input.textContent, '').trim();
                        }
                      }
                    }
                    
                    // Method 3: Look for nearby text elements (aria-label, aria-labelledby, or preceding text)
                    if (!label) {
                      const ariaLabel = input.getAttribute('aria-label');
                      if (ariaLabel) {
                        label = ariaLabel;
                      } else {
                        const ariaLabelledBy = input.getAttribute('aria-labelledby');
                        if (ariaLabelledBy) {
                          const labelElement = document.getElementById(ariaLabelledBy);
                          if (labelElement) {
                            label = labelElement.textContent?.trim() || '';
                          }
                        }
                      }
                    }
                    
                    // Method 4: Look for preceding text in the same container
                    if (!label) {
                      const parent = input.parentElement;
                      if (parent) {
                        const textNodes = Array.from(parent.childNodes)
                          .filter(node => node.nodeType === Node.TEXT_NODE)
                          .map(node => node.textContent?.trim())
                          .filter((text): text is string => text !== undefined && text.length > 0);
                        
                        if (textNodes.length > 0) {
                          label = textNodes[0];
                        }
                      }
                    }
                    
                    // Method 5: Look for label in the same form item container
                    if (!label) {
                      const formItem = input.closest('[data-slot="form-item"]');
                      if (formItem) {
                        const labelElement = formItem.querySelector('label[data-slot="form-label"]');
                        if (labelElement) {
                          label = labelElement.textContent?.trim() || '';
                        }
                      }
                    }
                    
                    // Generate CSS selectors using our optimized fast generator
                    const generateFormSelector = (el: Element): { selector: string; isUnique: boolean } => {
                      if (!el || el.nodeType !== Node.ELEMENT_NODE) {
                        return { selector: el.tagName.toLowerCase(), isUnique: false };
                      }

                      // Check if utils is available
                      if (typeof window.utils !== 'object' || typeof window.utils.generateFastSelector !== 'function') {
                        return generateRobustFallbackSelector(el);
                      }

                      // Using fast selector generator - tested and confirmed as best performer
                      return window.utils.generateFastSelector(el);
                    };

                    // Generate the best selector using finder
                    const selectorResult = generateFormSelector(input);
                    const bestSelector = selectorResult.selector;
                    const isSelectorUnique = selectorResult.isUnique;
                    
                    // Get value from appropriate source
                    let value = '';
                    if (isCustom && tagName === 'button' && associatedSelect) {
                      // For custom dropdowns, get value from the hidden select
                      value = (associatedSelect as HTMLSelectElement).value || '';
                    } else {
                      // For traditional elements, get value directly
                      value = (input as HTMLInputElement).value || '';
                    }
                    
                    // Get selected index from appropriate source
                    let selected = -1;
                    if (isCustom && tagName === 'button' && associatedSelect) {
                      selected = (associatedSelect as HTMLSelectElement).selectedIndex;
                    } else if (tagName === 'select') {
                      selected = (input as HTMLSelectElement).selectedIndex;
                    }
                    
                    return {
                    tagName: input.tagName,
                      type: isCustom ? 'select' : type, // Treat custom dropdowns as select type
                      name: name,
                      id: id,
                      value: value,
                      placeholder: placeholder,
                      label: label,
                    checked: (input as HTMLInputElement).checked,
                      selected: selected,
                      textContent: input.textContent || '',
                      selectors: [bestSelector], // Use finder-generated selector
                      bestSelector: bestSelector,
                      elementIndex: index,
                      isUnique: isSelectorUnique, // Use actual uniqueness verification
                      isCustomDropdown: isCustom
                    };
                  }),
                  
                // 3. Clickable elements (for clicking actions) - OPTIMIZED MODERN WEB APP SUPPORT
                  clickableElements: (() => {
                    try {
                      // Use finder library for CSS selector generation with robust fallback
                      const generateSelector = (el: Element): string => {
                        if (!el || el.nodeType !== Node.ELEMENT_NODE) {
                          return '';
                        }

                        const tagName = el.tagName.toLowerCase();

                        // Strategy 1: Use ID selector if available (most reliable, skip finder)
                        if (el.id) {
                          const idSelector = `#${CSS.escape(el.id)}`;
                          const matches = document.querySelectorAll(idSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return idSelector;
                          }
                        }

                        // Strategy 2: Data attributes (testing-friendly)
                        const testId = el.getAttribute('data-testid');
                        if (testId) {
                          const dataSelector = `[data-testid="${CSS.escape(testId)}"]`;
                          const matches = document.querySelectorAll(dataSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return dataSelector;
                          }
                        }

                        const dataCy = el.getAttribute('data-cy');
                        if (dataCy) {
                          const dataSelector = `[data-cy="${CSS.escape(dataCy)}"]`;
                          const matches = document.querySelectorAll(dataSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return dataSelector;
                          }
                        }

                        // Strategy 3: Name attribute
                        const name = el.getAttribute('name');
                        if (name) {
                          const nameSelector = `${tagName}[name="${CSS.escape(name)}"]`;
                          const matches = document.querySelectorAll(nameSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return nameSelector;
                          }
                        }

                        // Strategy 4: Type + name combination
                        const type = el.getAttribute('type');
                        if (type && name) {
                          const typeNameSelector = `${tagName}[type="${CSS.escape(type)}"][name="${CSS.escape(name)}"]`;
                          const matches = document.querySelectorAll(typeNameSelector);
                          if (matches.length === 1 && matches[0] === el) {
                            return typeNameSelector;
                          }
                        }

                        // Check if utils is available
                        if (typeof window.utils !== 'object' || typeof window.utils.generateFastSelector !== 'function') {
                          const fallback = generateRobustFallbackSelector(el);
                          return fallback.selector;
                        }

                        // Use our optimized fast selector generator from utils
                        const result = window.utils.generateFastSelector(el);
                        return result.selector;
                      };
                      
                      // Optimized element collection
                      const elements = new Set<Element>();
                      const selectors = [
                        // Standard HTML elements
                        'button', 'a[href]', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]', 'input[type="checkbox"]', 'input[type="radio"]',
                        // ARIA roles (accessibility)
                        '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]', '[role="option"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
                        // Event handlers (modern frameworks)
                        '[onclick]', '[onmousedown]', '[onmouseup]', '[ontouchstart]', '[ontouchend]',
                        // Data attributes (testing frameworks)
                        '[data-testid]', '[data-cy]', '[data-test]', '[data-testid*="button"]', '[data-testid*="link"]', '[data-testid*="click"]',
                        // Framework patterns (React/Vue/Angular)
                        '[class*="button"]', '[class*="btn"]', '[class*="link"]', '[class*="clickable"]', '[class*="interactive"]', '[class*="action"]',
                        '[class*="card"]', '[class*="item"]', '[class*="menu"]', '[class*="tab"]', '[class*="option"]', '[class*="select"]',
                        // UI libraries (Ant Design, Element UI, Vuetify, etc.)
                        '[class*="ant-btn"]', '[class*="el-button"]', '[class*="v-btn"]', '[class*="btn-"]', '[class*="button-"]', '[class*="link-"]',
                        // Common interactive patterns
                        '[class*="dropdown"]', '[class*="modal"]', '[class*="dialog"]', '[class*="popup"]', '[class*="tooltip"]'
                      ];
                      
                      // Batch element collection
                      selectors.forEach(selector => {
                        try {
                          document.querySelectorAll(selector).forEach(el => elements.add(el));
                        } catch (e) {
                          // Skip invalid selectors
                        }
                      });
                      
                      // Add cursor pointer elements (optimized - only check elements with common interactive classes)
                      const cursorSelectors = ['[style*="cursor: pointer"]', '[style*="cursor:grab"]', '.cursor-pointer', '.cursor-grab'];
                      cursorSelectors.forEach(selector => {
                        try {
                          document.querySelectorAll(selector).forEach(el => elements.add(el));
                        } catch (e) {
                          // Skip invalid selectors
                        }
                      });
                      
                      // Process elements in single pipeline
                      return Array.from(elements)
                        .filter(el => {
                          const rect = el.getBoundingClientRect();
                          return rect.width > 0 && rect.height > 0;
                        })
                        .map(el => {
                          const rect = el.getBoundingClientRect();
                          const text = el.textContent?.trim() || '';
                          
                          return {
                            selector: generateSelector(el),
                            tagName: el.tagName.toLowerCase(),
                            text: text.substring(0, 100),
                            href: (el as HTMLAnchorElement).href || '',
                            title: el.getAttribute('title')?.substring(0, 100) || '',
                            type: el.getAttribute('type') || ''
                          };
                        })
                        .filter(item => 
                          item.text || item.title || item.href || item.tagName === 'button' || item.tagName === 'a'
                        )
                        .reduce((unique, item) => {
                          if (!unique.find(existing => existing.selector === item.selector)) {
                            unique.push(item);
                          }
                          return unique;
                        }, [] as any[])
                        .slice(0, 200);
                        
                    } catch (error) {
                      console.warn('Clickable elements extraction failed:', error);
                      return [];
                    }
                  })(),
                  
                // 4. Document metadata
                  documentInfo: {
                    title: document.title,
                    url: document.URL,
                    referrer: document.referrer,
                    domain: document.domain,
                    lastModified: document.lastModified,
                    readyState: document.readyState,
                    characterSet: document.characterSet,
                    contentType: document.contentType
                  },
                  
                // 5. Window information
                  windowInfo: {
                    innerWidth: window.innerWidth,
                    innerHeight: window.innerHeight,
                    outerWidth: window.outerWidth,
                    outerHeight: window.outerHeight,
                    scrollX: window.scrollX,
                    scrollY: window.scrollY,
                    location: {
                      href: window.location.href,
                      protocol: window.location.protocol,
                      host: window.location.host,
                      hostname: window.location.hostname,
                      port: window.location.port,
                      pathname: window.location.pathname,
                      search: window.location.search,
                      hash: window.location.hash
                    },
                    userAgent: navigator.userAgent,
                    language: navigator.language,
                    platform: navigator.platform
                  },
                  
                  timestamp: Date.now()
              },
              timestamp: Date.now()
            };
          };
          
          return extractPageContent();
        }
      });

      if (results && results[0] && results[0].result) {
        const extractedContent = results[0].result;
        log('[Background] Content extracted successfully for:', extractedContent.title);
        
        // Log extracted content size immediately after extraction
        const extractedString = JSON.stringify(extractedContent);
        const extractedSizeKB = (extractedString.length / 1024).toFixed(2);
        const extractedSizeMB = (extractedString.length / (1024 * 1024)).toFixed(2);
        
        log('📦 [Background] Extracted content size:');
        log(`   Total size: ${extractedSizeKB} KB (${extractedSizeMB} MB)`);
        log(`   URL: ${extractedContent.url}`);
        
        // Store the extracted content
        // Skip broadcast if this is an on-demand fetch (has sendResponse) to prevent duplicate processing
        await handlePageContentUpdate(extractedContent, tabId, !!sendResponse);
        
        sendResponse?.({ success: true, content: extractedContent });
        return;
      } else {
        log('[Background] Failed to extract content - no results returned');
        log('[Background] Results object:', results);
        if (results && results[0]) {
          log('[Background] First result:', results[0]);
        }
      }
    } catch (extractError) {
      logError('[Background] Content extraction failed:', extractError);
    }

    sendResponse?.({ success: false, error: 'Could not extract page content' });
  } catch (error) {
    logError('[Background] Failed to get page content:', error);
    sendResponse?.({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Clean up old page content when tabs are closed (memory only)
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabIdStr = tabId.toString();
  delete currentPageContent[tabIdStr];
  // No storage cleanup needed - page content is not persisted
});

// No need to load page content on startup - it's memory-only
// Page content will be fetched fresh when needed
