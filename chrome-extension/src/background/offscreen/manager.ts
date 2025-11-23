/**
 * @fileoverview Offscreen Document Manager
 * 
 * Manages the lifecycle of the offscreen document used for running
 * transformers.js for text embeddings. Handles creation, ready signaling,
 * and message passing.
 * 
 * @module background/offscreen/manager
 */

import { OFFSCREEN_DOCUMENT_PATH, OFFSCREEN_READY_TIMEOUT_MS, OFFSCREEN_RESPONSE_TIMEOUT_MS } from '../config/index.js';
import { log, logError } from '../utils/logger.js';
import type { OffscreenMessage, OffscreenResponse } from '../types/index.js';

// ============================================================================
// State Management
// ============================================================================

let creatingOffscreen: Promise<void> | null = null;
let offscreenReadyPromise: Promise<void> | null = null;
let offscreenReadyResolve: (() => void) | null = null;

// ============================================================================
// Public API
// ============================================================================

/**
 * Set up offscreen document for ML model execution.
 * 
 * This function ensures the offscreen document is created and ready before
 * attempting to send messages to it. It implements:
 * - Deduplication: Multiple concurrent calls wait for the same promise
 * - Ready signal: Waits for offscreen to signal it's initialized
 * - Timeout: Fails after 30 seconds if offscreen doesn't respond
 * 
 * @returns Promise that resolves when offscreen is ready
 * @throws Error if offscreen creation fails or times out
 * 
 * @example
 * await setupOffscreenDocument();
 * // Now safe to call sendToOffscreen()
 */
export async function setupOffscreenDocument(): Promise<void> {
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
  
  log('[Offscreen] Document created, waiting for ready signal...');
  
  // Wait for offscreen to signal it's ready (or timeout)
  const timeoutPromise = new Promise<void>((_, reject) => 
    setTimeout(() => reject(new Error('Offscreen ready timeout')), OFFSCREEN_READY_TIMEOUT_MS)
  );
  
  try {
    await Promise.race([offscreenReadyPromise, timeoutPromise]);
    log('[Offscreen] Ready signal received');
  } catch (error) {
    logError('[Offscreen] Ready timeout');
    throw error;
  }
}

/**
 * Send a message to the offscreen document and await response.
 * 
 * Uses a request-response pattern with:
 * - Unique request IDs for correlation
 * - 30-second timeout per request
 * - Automatic cleanup of listeners
 * 
 * @param message - Message to send
 * @returns Response from offscreen
 * @throws Error if offscreen not ready, timeout, or processing fails
 * 
 * @example
 * const response = await sendToOffscreen({
 *   type: 'embedText',
 *   text: 'Hello world'
 * });
 * console.log('Embedding:', response.embedding);
 */
export async function sendToOffscreen(message: OffscreenMessage): Promise<OffscreenResponse> {
  await setupOffscreenDocument();
  
  return new Promise((resolve, reject) => {
    const requestId = `offscreen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let timeoutHandle: NodeJS.Timeout | null = null;
    
    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      chrome.runtime.onMessage.removeListener(responseListener);
    };
    
    // Set up listener for response from offscreen
    const responseListener = (msg: any) => {
      // Only log and process offscreen-related messages
      if (msg.type !== 'offscreenResponse') {
        return; // Ignore non-offscreen messages
      }
      
      log('[Offscreen] Received message:', msg.type, 'requestId:', msg.requestId, 'looking for:', requestId);
      
      if (msg.requestId === requestId) {
        log('[Offscreen] Message matched! success:', msg.success, 'embeddingsCount:', msg.embeddings?.length);
        cleanup();
        
        if (msg.success) {
          log('[Offscreen] Resolving with response');
          resolve(msg as OffscreenResponse);
        } else {
          log('[Offscreen] Rejecting with error:', msg.error);
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
      cleanup();
      reject(err);
    });
    
    // Enforce per-request timeout
    timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error('Offscreen response timeout'));
    }, OFFSCREEN_RESPONSE_TIMEOUT_MS);
  });
}

/**
 * Handle offscreen ready signal
 * Called when offscreen document sends ready message
 */
export function handleOffscreenReady(): void {
  log('[Offscreen] Document ready');
  if (offscreenReadyResolve) {
    offscreenReadyResolve();
    offscreenReadyResolve = null;
  }
}

