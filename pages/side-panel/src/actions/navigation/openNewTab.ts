import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

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
    pinned?: boolean;
    windowId?: number;
  };
}

interface OpenNewTabOptions {
  active?: boolean; // default true
  pinned?: boolean; // default false
  adjacent?: boolean; // place next to current tab (default true)
  reuseExisting?: boolean; // focus existing tab with same URL if present
  bringWindowToFront?: boolean; // focus window when activating (default true)
  index?: number; // explicit index overrides adjacent
  waitForCompleteMs?: number; // wait until tab completes loading
}

/**
 * Open a new tab with the specified URL
 * @param url - The URL to open in a new tab
 * @param active - Whether to make the new tab active (default: true)
 * @returns Promise with status and message object
 */
export async function handleOpenNewTab(
  url: string,
  active: boolean = true,
  options?: OpenNewTabOptions,
): Promise<OpenNewTabResult> {
  try {
    const opts: OpenNewTabOptions = {
      active,
      adjacent: true,
      bringWindowToFront: true,
      pinned: false,
      reuseExisting: false,
      ...options,
    };
    debug.log('[OpenNewTab] Opening new tab with URL:', url, 'options:', opts);

    // Validate URL format and security
    let validUrl: string;
    try {
      // Block potentially dangerous URL schemes
      const dangerousPatterns = [/^javascript:/i, /^data:/i, /^vbscript:/i, /^file:/i];

      if (dangerousPatterns.some(pattern => pattern.test(url))) {
        return {
          status: 'error',
          message: 'Security: Blocked potentially dangerous URL scheme. Only HTTP/HTTPS URLs are allowed.',
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
          message: `Unsupported protocol "${urlObj.protocol}". Only HTTP/HTTPS URLs are allowed.`,
        };
      }

      // Additional domain validation for better security (allow localhost and IPs)
      const hostname = urlObj.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
      const isIPv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
      const isIPv6 = /:/.test(hostname);
      const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*(?:\.[a-zA-Z0-9-]+)+$/; // at least one dot
      if (!(isLocalhost || isIPv4 || isIPv6 || domainPattern.test(hostname))) {
        return {
          status: 'error',
          message: `Invalid domain format: "${urlObj.hostname}". Please provide a valid domain or localhost/IP.`,
        };
      }
    } catch (urlError) {
      return {
        status: 'error',
        message: `Invalid URL format: "${url}". Please provide a valid URL (e.g., "https://example.com" or "example.com")`,
      };
    }

    // Determine placement relative to current tab
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const createProps: chrome.tabs.CreateProperties = {
      url: validUrl,
      active: !!opts.active,
      pinned: !!opts.pinned,
    };
    if (typeof opts.index === 'number') {
      createProps.index = opts.index;
    } else if (opts.adjacent && currentTab && typeof currentTab.index === 'number') {
      createProps.index = currentTab.index + 1;
    }
    if (currentTab && typeof currentTab.id === 'number') {
      (createProps as any).openerTabId = currentTab.id;
    }

    // Reuse existing tab if requested
    if (opts.reuseExisting) {
      const candidates = await chrome.tabs.query({ currentWindow: true });
      const found = candidates.find(t => t.url === validUrl);
      if (found && found.id) {
        await chrome.tabs.update(found.id, { active: !!opts.active, pinned: !!opts.pinned });
        if (opts.active && opts.bringWindowToFront && found.windowId) {
          await chrome.windows.update(found.windowId, { focused: true });
        }
        const uo = new URL(validUrl);
        return {
          status: 'success',
          message: `Focused existing tab for ${uo.hostname}`,
          tabInfo: {
            tabId: found.id,
            url: validUrl,
            domain: uo.hostname,
            path: uo.pathname + uo.search + uo.hash,
            isActive: !!opts.active,
            pinned: !!opts.pinned,
            windowId: found.windowId,
          },
        };
      }
    }

    // Create new tab
    const newTab = await chrome.tabs.create(createProps);

    if (!newTab || !newTab.id) {
      return {
        status: 'error',
        message: 'Failed to create new tab',
      };
    }

    // Optionally wait for tab to complete loading
    if (opts.waitForCompleteMs && opts.waitForCompleteMs > 0) {
      await new Promise<void>(resolve => {
        let done = false;
        const timeout = setTimeout(() => {
          if (!done) {
            done = true;
            resolve();
          }
        }, opts.waitForCompleteMs);
        const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            if (!done) {
              done = true;
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }

    // Enhanced success message with URL preview
    const urlObj = new URL(validUrl);
    const domain = urlObj.hostname;
    const path = urlObj.pathname + urlObj.search + urlObj.hash;

    if (opts.active && opts.bringWindowToFront && newTab.windowId) {
      await chrome.windows.update(newTab.windowId, { focused: true });
    }

    return {
      status: 'success',
      message: `New tab ${opts.reuseExisting ? 'focused or' : ''} opened successfully; ${opts.active ? 'active' : 'background'}.`,
      tabInfo: {
        tabId: newTab.id,
        url: validUrl,
        domain: domain,
        path: path || '/',
        isActive: !!opts.active,
        pinned: !!opts.pinned,
        windowId: newTab.windowId,
      },
    };
  } catch (error) {
    debug.error('[OpenNewTab] Error opening new tab:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
