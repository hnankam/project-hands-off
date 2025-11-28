import { useMemo, useEffect } from 'react';
import { debug } from '@extension/shared';

/**
 * Page Metadata Interface
 * Metadata about the current page provided to the AI agent
 */
export interface PageMetadata {
  pageTitle: string;
  pageURL: string;
  hasContent: boolean;
  hasEmbeddings: boolean;
  totalHtmlChunks: number;
  totalClickableChunks: number;
  totalFormChunks: number;
  documentInfo: Record<string, unknown>;
  windowInfo: Record<string, unknown>;
  timestamp: number;
  dataSource: 'chrome-extension-live-extraction' | 'no-content';
}

export interface PageContent {
  title?: string;
  url?: string;
  timestamp?: number;
  allDOMContent?: {
    documentInfo?: Record<string, unknown>;
    windowInfo?: Record<string, unknown>;
  };
}

interface EmbeddingTotals {
  html: number;
  form: number;
  click: number;
}

interface UsePageMetadataParams {
  currentPageContent: PageContent | null;
  pageContentEmbedding: unknown;
  totals: EmbeddingTotals;
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
  // Construct page metadata (pure computation, no side effects)
  const pageMetadata = useMemo(() => {
    // Return empty state if no content
    if (!currentPageContent) {
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
  }, [currentPageContent, pageContentEmbedding, totals]);

  // Logging effect (separate from computation)
  useEffect(() => {
    if (!enableLogging) return;
    
    if (!currentPageContent) {
      debug.log('[usePageMetadata] No page content available');
      return;
    }
    
    // Log summary on content change
    debug.log('[usePageMetadata] Page metadata prepared:', {
      pageTitle: pageMetadata.pageTitle,
      pageURL: pageMetadata.pageURL,
      hasContent: pageMetadata.hasContent,
      hasEmbeddings: pageMetadata.hasEmbeddings,
      totalHtmlChunks: pageMetadata.totalHtmlChunks,
      totalClickableChunks: pageMetadata.totalClickableChunks,
      totalFormChunks: pageMetadata.totalFormChunks,
      timestamp: new Date(pageMetadata.timestamp).toISOString(),
    });
  }, [pageMetadata, currentPageContent, enableLogging]);

  return pageMetadata;
};
