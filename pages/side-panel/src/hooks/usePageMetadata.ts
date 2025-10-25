import { useMemo, useEffect } from 'react';
import { debug } from '@extension/shared';

// Timestamp helper for consistent logging
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/**
 * Page Metadata Interface
 * Metadata about the current page provided to the AI agent
 */
export interface PageMetadata {
  pageTitle: string;
  pageURL: string;
  hasContent: boolean;
  hasEmbeddings: boolean;
  totalHtmlChunks?: number;
  totalClickableChunks?: number;
  totalFormChunks?: number;
  documentInfo?: any;
  windowInfo?: any;
  timestamp: number;
  dataSource: 'chrome-extension-live-extraction' | 'no-content';
}

interface UsePageMetadataParams {
  currentPageContent: any;
  pageContentEmbedding: any;
  totals: { html: number; form: number; click: number };
  enableLogging?: boolean;
}

/**
 * usePageMetadata Hook
 * 
 * Constructs page metadata for the AI agent from current page content and embeddings.
 * Provides minimal metadata (no large HTML/form data) optimized for agent context.
 * 
 * Features:
 * - Extracts essential page information (title, URL, document/window info)
 * - Includes DB-backed totals for HTML, form, and clickable chunks
 * - Optional debug logging for monitoring
 * - Returns empty state when no content is available
 * - Memoized to prevent unnecessary recalculations
 * 
 * @param currentPageContent - Current page content object
 * @param pageContentEmbedding - Page content embeddings
 * @param totals - DB-backed counts of HTML, form, and clickable chunks
 * @param enableLogging - Enable debug logging (default: true)
 * @returns PageMetadata object for agent consumption
 * 
 * @example
 * ```tsx
 * const pageMetadata = usePageMetadata({
 *   currentPageContent,
 *   pageContentEmbedding,
 *   totals: { html: 150, form: 20, click: 45 },
 *   enableLogging: true,
 * });
 * ```
 */
export const usePageMetadata = ({
  currentPageContent,
  pageContentEmbedding,
  totals,
  enableLogging = true,
}: UsePageMetadataParams): PageMetadata => {
  // Construct page metadata (memoized)
  const pageMetadata = useMemo(() => {
    // Return empty state if no content
    if (!currentPageContent) {
      if (enableLogging) {
        debug.log(ts(), '📭 [ChatSession] No currentPageContent available');
      }
      return {
        pageTitle: 'No page loaded',
        pageURL: '',
        hasContent: false,
        hasEmbeddings: false,
        totalHtmlChunks: 0,
        totalClickableChunks: 0,
        totalFormChunks: 0,
        documentInfo: {},
        windowInfo: {},
        timestamp: 0,
        dataSource: 'no-content' as const,
      };
    }

    // Extract page information
    const pageTitle = String(currentPageContent.title || 'Untitled Page');
    const pageURL = String(currentPageContent.url || '');
    const documentInfo = currentPageContent.allDOMContent?.documentInfo || {};
    const windowInfo = currentPageContent.allDOMContent?.windowInfo || {};
    
    if (enableLogging) {
      debug.log(ts(), '📦 [ChatSession] Page metadata prepared for agent:', {
        pageTitle,
        pageURL,
        hasEmbeddings: !!pageContentEmbedding,
        timestamp: currentPageContent.timestamp,
      });
    }
    
    // Return full metadata
    return {
      pageTitle,
      pageURL,
      hasContent: true,
      hasEmbeddings: !!pageContentEmbedding,
      // DB-backed totals
      totalHtmlChunks: totals.html || 0,
      totalClickableChunks: totals.click || 0,
      totalFormChunks: totals.form || 0,
      documentInfo,
      windowInfo,
      timestamp: currentPageContent.timestamp || Date.now(),
      dataSource: 'chrome-extension-live-extraction' as const,
    };
  }, [currentPageContent, pageContentEmbedding, totals, enableLogging]);

  // Log detailed metadata for debugging (separate effect for better separation)
  useEffect(() => {
    if (!enableLogging) return;
    
    if (pageMetadata && pageMetadata.dataSource !== 'no-content') {
      debug.log(ts(), '📄 [ChatSession] Page Metadata for Agent:', {
        pageTitle: pageMetadata.pageTitle,
        pageURL: pageMetadata.pageURL,
        hasContent: pageMetadata.hasContent,
        hasEmbeddings: pageMetadata.hasEmbeddings,
        totalHtmlChunks: pageMetadata.totalHtmlChunks,
        totalClickableChunks: pageMetadata.totalClickableChunks,
        totalFormChunks: pageMetadata.totalFormChunks,
        documentInfo: pageMetadata.documentInfo,
        windowInfo: pageMetadata.windowInfo,
        timestamp: new Date(pageMetadata.timestamp).toISOString(),
      });
    }
  }, [pageMetadata, currentPageContent, enableLogging]);

  return pageMetadata;
};

