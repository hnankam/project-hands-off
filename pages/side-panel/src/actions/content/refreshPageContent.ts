import { debug as baseDebug } from '@extension/shared';

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/** Timestamp generator for debug logs */
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;

/** Timestamped debug wrappers */
const debug = {
  log: (...args: unknown[]) => baseDebug.log(ts(), ...args),
  warn: (...args: unknown[]) => baseDebug.warn(ts(), ...args),
  error: (...args: unknown[]) => baseDebug.error(ts(), ...args),
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Page content structure returned by getCurrentPageContent
 */
export interface PageContent {
  pageTitle?: string;
  title?: string;
  pageURL?: string;
  url?: string;
  pageHTML?: string;
  allDOMContent?: {
    fullHTML?: string;
  };
}

/**
 * Result type for refresh page content operation
 */
export interface RefreshPageContentResult {
  status: 'success' | 'error';
  message: string;
  pageInfo?: {
    title: string;
    url: string;
    htmlLength: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Timeout for refresh operation (30 seconds) */
const REFRESH_TIMEOUT_MS = 30000;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Force refresh the page HTML content and wait for embeddings to complete.
 * 
 * @param getCurrentPageContent - Function to get current page content
 * @param triggerManualRefresh - Optional manual refresh callback from UI
 * @returns Promise with status and message object
 * 
 * @example
 * ```ts
 * const result = await handleRefreshPageContent(
 *   () => pageContentRef.current,
 *   triggerManualRefresh
 * );
 * if (result.status === 'success') {
 *   console.log('Refreshed:', result.pageInfo);
 * }
 * ```
 */
export async function handleRefreshPageContent(
  getCurrentPageContent: () => PageContent | undefined,
  triggerManualRefresh?: () => void | Promise<void>
): Promise<RefreshPageContentResult> {
  debug.log('[RefreshContent] AI requested fresh page content');

  // Early return if no refresh callback provided
  if (!triggerManualRefresh) {
    debug.error('[RefreshContent] No triggerManualRefresh callback available');
    return {
      status: 'error',
      message: 'Unable to refresh: no refresh callback provided',
    };
  }

  try {
    debug.log('[RefreshContent] Triggering manual refresh and waiting for embeddings...');
    
    // Add timeout to prevent hanging indefinitely
    await Promise.race([
      triggerManualRefresh(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Refresh timed out after 30 seconds')), REFRESH_TIMEOUT_MS)
      ),
    ]);

    // Read the latest page content AFTER refresh + embeddings
    const latest = getCurrentPageContent();
    
    // Extract page info with fallbacks for different property names
    const title = latest?.pageTitle ?? latest?.title ?? 'Unknown';
    const url = latest?.pageURL ?? latest?.url ?? 'Unknown';
    const htmlLength = latest?.pageHTML?.length ?? latest?.allDOMContent?.fullHTML?.length ?? 0;

    debug.log('[RefreshContent] Refresh complete:', { title, url, htmlLength });

    return {
      status: 'success',
      message: 'Page content refreshed and embeddings completed! You can now search the page content using semantic search.',
      pageInfo: {
        title,
        url,
        htmlLength,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug.error('[RefreshContent] Error refreshing content:', errorMessage);
    
    return {
      status: 'error',
      message: `Error refreshing content: ${errorMessage}`,
    };
  }
}
