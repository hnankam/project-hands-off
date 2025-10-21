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
 * @returns Promise with status and message object
 */
export async function handleRefreshPageContent(pageContentForAgent: any): Promise<RefreshPageContentResult> {
  debug.log('🔄 [RefreshContent] AI requested fresh page content');

  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return {
        status: 'error',
        message: 'Unable to access current tab',
      };
    }

    // Force fetch fresh content (promisified with timeout)
    await new Promise<void>(resolve => {
      let done = false;
      const timeout = setTimeout(() => {
        if (!done) {
          debug.warn('⏱️  [RefreshContent] getPageContentOnDemand timed out');
          done = true;
          resolve();
        }
      }, 5000);

      chrome.runtime.sendMessage({ type: 'getPageContentOnDemand', tabId: tabs[0].id }, response => {
        if (!done) {
          clearTimeout(timeout);
          done = true;
          if (response?.success && response?.content) {
            debug.log('✅ [RefreshContent] Fresh content received');
          } else {
            debug.error('❌ [RefreshContent] Failed to get fresh content');
          }
          resolve();
        }
      });
    });

    // Small delay to allow state propagation; avoid long sleeps
    await new Promise(resolve => setTimeout(resolve, 300));

    // Return summary
    const htmlLength = pageContentForAgent.pageHTML?.length || 0;

    return {
      status: 'success',
      message:
        'Page content refreshed successfully! You can now analyze the pageHTML to find elements and extract CSS selectors.',
      pageInfo: {
        title: pageContentForAgent.pageTitle || 'Unknown',
        url: pageContentForAgent.pageURL || 'Unknown',
        htmlLength: htmlLength,
      },
    };
  } catch (error) {
    debug.error('[RefreshContent] Error refreshing content:', error);
    return {
      status: 'error',
      message: `Error refreshing content: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
