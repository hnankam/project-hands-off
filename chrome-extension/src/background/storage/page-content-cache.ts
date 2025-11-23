/**
 * @fileoverview Page Content Cache with LRU eviction
 * 
 * In-memory cache for page content with size limits and LRU eviction policy.
 * 
 * @module background/storage/page-content-cache
 */

import { MAX_CACHE_ENTRIES, MAX_CACHE_SIZE_BYTES } from '../config/index.js';
import { log } from '../utils/logger.js';
import type { PageContent, CachedContent } from '../types/index.js';

/**
 * Page Content Cache with LRU eviction
 */
class PageContentCache {
  private cache = new Map<string, CachedContent>();
  private accessOrder: string[] = [];
  
  constructor(
    private maxEntries = MAX_CACHE_ENTRIES,
    private maxSizeBytes = MAX_CACHE_SIZE_BYTES
  ) {}

  /**
   * Store page content in cache
   * @param tabId - Tab ID as string
   * @param content - Page content to cache
   * @param url - Page URL
   * @param title - Page title
   */
  set(tabId: string, content: PageContent, url: string, title: string): void {
    const size = JSON.stringify(content).length;
    
    // Evict if over size limit
    while (this.getTotalSize() + size > this.maxSizeBytes && this.cache.size > 0) {
      this.evictLRU();
    }
    
    // Evict if over entry limit
    if (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }
    
    this.cache.set(tabId, { 
      content, 
      timestamp: Date.now(), 
      size 
    });
    this.updateAccessOrder(tabId);
  }

  /**
   * Get page content from cache
   * @param tabId - Tab ID as string
   * @returns Cached content or undefined
   */
  get(tabId: string): PageContent | undefined {
    const cached = this.cache.get(tabId);
    if (cached) {
      this.updateAccessOrder(tabId);
      return cached.content;
    }
    return undefined;
  }

  /**
   * Delete page content from cache
   * @param tabId - Tab ID as string
   */
  delete(tabId: string): void {
    this.cache.delete(tabId);
    this.accessOrder = this.accessOrder.filter(id => id !== tabId);
  }

  /**
   * Clear all cached content
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   */
  getStats(): { entries: number; totalSize: number; maxSize: number } {
    return {
      entries: this.cache.size,
      totalSize: this.getTotalSize(),
      maxSize: this.maxSizeBytes
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    const oldest = this.accessOrder.shift();
    if (oldest) {
      this.cache.delete(oldest);
      log(`[Cache] Evicted ${oldest} (LRU policy)`);
    }
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(tabId: string): void {
    // Remove from current position
    this.accessOrder = this.accessOrder.filter(id => id !== tabId);
    // Add to end (most recently used)
    this.accessOrder.push(tabId);
  }

  /**
   * Get total size of all cached content
   */
  private getTotalSize(): number {
    return Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
  }
}

/**
 * Global page content cache instance
 */
export const pageContentCache = new PageContentCache();

