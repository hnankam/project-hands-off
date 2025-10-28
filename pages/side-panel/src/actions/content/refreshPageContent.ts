import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

/**
 * Result type for refresh page content operation
 */
interface RefreshPageContentResult {
  status: 'success' | 'error';
  message: string;
  pageInfo?: {
    title: string;
    url: string;
    htmlLength: number;
  };
}

/**
 * Force refresh the page HTML content
 * @param pageContentForAgent - Current page content object (for stats)
 * @param triggerManualRefresh - Optional manual refresh callback from UI
 * @returns Promise with status and message object
 */
export async function handleRefreshPageContent(
  getCurrentPageContent: () => any,
  triggerManualRefresh?: () => void | Promise<void>
): Promise<RefreshPageContentResult> {
  debug.log('🔄 [RefreshContent] AI requested fresh page content');

  try {
    // Call the manual refresh callback directly to trigger the same UI refresh pathway
    if (triggerManualRefresh) {
      debug.log('[RefreshContent] Triggering manual refresh and waiting for embeddings...');
      await triggerManualRefresh(); // Now awaits the embedding completion

      // Read the latest page content AFTER refresh + embeddings
      const latest = typeof getCurrentPageContent === 'function' ? getCurrentPageContent() : undefined;
      const latestTitle = latest?.pageTitle || latest?.title || 'Unknown';
      const latestUrl = latest?.pageURL || latest?.url || 'Unknown';
      const latestHtmlLength = latest?.pageHTML?.length || latest?.allDOMContent?.fullHTML?.length || 0;

      return {
        status: 'success',
        message:
          'Page content refreshed and embeddings completed! You can now search the page content using semantic search.',
        pageInfo: {
          title: latestTitle,
          url: latestUrl,
          htmlLength: latestHtmlLength,
        },
      };
    } else {
      debug.error('[RefreshContent] No triggerManualRefresh callback available');
      return {
        status: 'error',
        message: 'Unable to refresh: no refresh callback provided',
      };
    }
  } catch (error) {
    debug.error('[RefreshContent] Error refreshing content:', error);
    return {
      status: 'error',
      message: `Error refreshing content: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
