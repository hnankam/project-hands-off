/**
 * @fileoverview Configuration constants for Background Service Worker
 * 
 * Centralized configuration for the background service worker including
 * offscreen document paths, timeouts, and feature flags.
 * 
 * @module background/config
 */

// ============================================================================
// Offscreen Document Configuration
// ============================================================================

/**
 * Path to the offscreen document HTML file
 * Used for running transformers.js for text embeddings
 */
export const OFFSCREEN_DOCUMENT_PATH = 'offscreen/src/index.html';

/**
 * Timeout for offscreen document ready signal (milliseconds)
 */
export const OFFSCREEN_READY_TIMEOUT_MS = 30000;

/**
 * Timeout for offscreen document responses (milliseconds)
 */
export const OFFSCREEN_RESPONSE_TIMEOUT_MS = 30000;

// ============================================================================
// Embedding Configuration
// ============================================================================

/**
 * Default chunk size for text chunking (characters)
 */
export const DEFAULT_CHUNK_SIZE = 1000;

/**
 * Target chunk size for JSON array chunking (bytes)
 */
export const JSON_CHUNK_TARGET_SIZE = 10000;

// ============================================================================
// Content Extraction Configuration
// ============================================================================

/**
 * Maximum number of clickable elements to extract
 */
export const MAX_CLICKABLE_ELEMENTS = 200;

/**
 * Maximum size for cleaned HTML (bytes)
 */
export const MAX_HTML_SIZE = 500000;

/**
 * Maximum size for element HTML in context menu (bytes)
 */
export const MAX_ELEMENT_HTML_SIZE = 50000;

// ============================================================================
// Cache Configuration
// ============================================================================

/**
 * Maximum number of page content entries to cache
 */
export const MAX_CACHE_ENTRIES = 10;

/**
 * Maximum total cache size (bytes)
 */
export const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Enable debug logging (set to false in production)
 */
export const DEBUG = true;

/**
 * Enable shadow DOM content extraction
 */
export const ENABLE_SHADOW_DOM = true;

/**
 * Enable custom dropdown detection
 */
export const ENABLE_CUSTOM_DROPDOWNS = true;

