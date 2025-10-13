import { debug } from '@extension/shared';

/**
 * Result type for open new tab operation
 */
interface OpenNewTabResult {
  status: 'success' | 'error';
  message: string;
  tabInfo?: {
    tabId: number;
    url: string;
    domain: string;
    path: string;
    isActive: boolean;
  };
}

/**
 * Open a new tab with the specified URL
 * @param url - The URL to open in a new tab
 * @param active - Whether to make the new tab active (default: true)
 * @returns Promise with status and message object
 */
export async function handleOpenNewTab(
  url: string,
  active: boolean = true
): Promise<OpenNewTabResult> {
  try {
    debug.log('[OpenNewTab] Opening new tab with URL:', url);
    
    // Validate URL format and security
    let validUrl: string;
    try {
      // Block potentially dangerous URL schemes
      const dangerousPatterns = [
        /^javascript:/i,
        /^data:/i,
        /^vbscript:/i,
        /^file:/i
      ];

      if (dangerousPatterns.some(pattern => pattern.test(url))) {
        return {
          status: 'error',
          message: 'Security: Blocked potentially dangerous URL scheme. Only HTTP/HTTPS URLs are allowed.'
        };
      }

      // If URL doesn't have a protocol, add https://
      if (!url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
        validUrl = 'https://' + url;
      } else {
        validUrl = url;
      }
      
      // Validate URL and check supported protocols
      const urlObj = new URL(validUrl);
      const supportedProtocols = ['http:', 'https:'];
      
      if (!supportedProtocols.includes(urlObj.protocol)) {
        return {
          status: 'error',
          message: `Unsupported protocol "${urlObj.protocol}". Only HTTP/HTTPS URLs are allowed.`
        };
      }

      // Additional domain validation for better security
      const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/;
      if (!domainPattern.test(urlObj.hostname)) {
        return {
          status: 'error',
          message: `Invalid domain format: "${urlObj.hostname}". Please provide a valid domain name.`
        };
      }
      
    } catch (urlError) {
      return {
        status: 'error',
        message: `Invalid URL format: "${url}". Please provide a valid URL (e.g., "https://example.com" or "example.com")`
      };
    }

    // Create new tab
    const newTab = await chrome.tabs.create({
      url: validUrl,
      active: active
    });

    if (!newTab || !newTab.id) {
      return {
        status: 'error',
        message: 'Failed to create new tab'
      };
    }

    // Enhanced success message with URL preview
    const urlObj = new URL(validUrl);
    const domain = urlObj.hostname;
    const path = urlObj.pathname + urlObj.search + urlObj.hash;
    
    return {
      status: 'success',
      message: `New tab opened successfully! The new tab has been created and ${active ? 'is ready for use' : 'will load in the background'}.`,
      tabInfo: {
        tabId: newTab.id,
        url: validUrl,
        domain: domain,
        path: path || '/',
        isActive: active
      }
    };
  } catch (error) {
    debug.error('[OpenNewTab] Error opening new tab:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

