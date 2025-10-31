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

// Use globalThis to ensure the Map persists across module reloads/HMR
// This is critical for extension background scripts where modules may be reloaded
declare global {
  var __openTabRequestLocks__: Map<string, { timestamp: number; promise: Promise<OpenNewTabResult> }> | undefined;
}

// Static map to track in-flight tab opening requests (background-side deduplication)
// Use globalThis to survive module reloads
if (!globalThis.__openTabRequestLocks__) {
  globalThis.__openTabRequestLocks__ = new Map<string, { timestamp: number; promise: Promise<OpenNewTabResult> }>();
  console.log('[OpenNewTab] 🏗️  Initializing global lock Map');
}
const openTabRequestLocks = globalThis.__openTabRequestLocks__;

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
  // Generate unique call ID for tracking FIRST
  const callId = Math.random().toString(36).substring(2, 9);
  console.log(`[OpenNewTab:${callId}] 🚀 FUNCTION CALLED with:`, { url, active, options });
  
  try {
    const opts: OpenNewTabOptions = {
      active,
      adjacent: true,
      bringWindowToFront: true,
      pinned: false,
      reuseExisting: true, // default to reusing existing tab to avoid duplicates
      ...options,
    };
    
    console.log(`[OpenNewTab:${callId}] 📝 Merged options:`, opts);
    
    // Normalize URL early for signature
    let normalizedUrl: string;
    try {
      const tempUrl = url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/) ? url : 'https://' + url;
      normalizedUrl = new URL(tempUrl).toString();
      console.log(`[OpenNewTab:${callId}] ✅ URL normalized: ${normalizedUrl.substring(0, 80)}`);
    } catch (err) {
      normalizedUrl = url; // fallback to original if normalization fails
      console.log(`[OpenNewTab:${callId}] ⚠️  URL normalization failed, using original: ${url}`);
    }
    
    // Create stable signature for background-side deduplication
    const requestSignature = `${normalizedUrl}|${opts.active}|${opts.pinned}`;
    console.log(`[OpenNewTab:${callId}] 🔑 Request signature: ${requestSignature.substring(0, 100)}`);
    
    // Check if identical request is already in-flight
    // Force refresh the reference in case it was reset
    const lockMap = globalThis.__openTabRequestLocks__ || new Map();
    if (!globalThis.__openTabRequestLocks__) {
      console.log(`[OpenNewTab:${callId}] ⚠️  WARNING: Global lock Map was undefined, recreating it!`);
      globalThis.__openTabRequestLocks__ = lockMap;
    }
    
    console.log(`[OpenNewTab:${callId}] 🔍 Pre-check - Map reference:`, {
      mapExists: !!globalThis.__openTabRequestLocks__,
      mapSize: globalThis.__openTabRequestLocks__?.size || 0,
      mapKeys: Array.from(globalThis.__openTabRequestLocks__?.keys() || []).map(k => k.substring(0, 50)),
    });
    
    const existingLock = lockMap.get(requestSignature);
    const lockAge = existingLock ? Date.now() - existingLock.timestamp : -1;
    
    console.log(`[OpenNewTab:${callId}] 🔍 Lock check:`, { 
      signature: requestSignature.substring(0, 60),
      hasLock: !!existingLock,
      lockAge,
      lockTimestamp: existingLock?.timestamp,
      currentTime: Date.now(),
      willReuse: existingLock && lockAge < 10000,
      totalLocksInMap: lockMap.size,
    });
    
    // Reuse existing promise if request came within 10 seconds (covers slower agent calls)
    if (existingLock && lockAge < 10000) {
      console.log(`[OpenNewTab:${callId}] ⚠️  DUPLICATE REQUEST BLOCKED - Reusing existing execution (lock age: ${lockAge}ms)`);
      return existingLock.promise;
    }
    
    console.log(`[OpenNewTab:${callId}] ✅ No active lock found, proceeding with tab creation`);
    
    // Create execution promise
    const executionPromise = (async (): Promise<OpenNewTabResult> => {
      console.log(`[OpenNewTab:${callId}] 🏃 Starting async execution`);
      try {
        const result = await executeOpenNewTabInternal(url, opts, normalizedUrl, requestSignature, callId);
        
        console.log(`[OpenNewTab:${callId}] ✅ Execution completed successfully:`, {
          status: result.status,
          tabId: result.tabInfo?.tabId,
          url: result.tabInfo?.url?.substring(0, 60),
        });
        
        // DON'T delete lock immediately - let it expire naturally via timestamp check
        // This allows subsequent rapid requests (within 5s) to reuse the same result
        console.log(`[OpenNewTab:${callId}] 🔒 Lock retained (will expire via timestamp check)`);
        
        return result;
      } catch (error) {
        console.error(`[OpenNewTab:${callId}] ❌ Execution failed:`, error);
        // Delete lock immediately on error so retries can proceed
        if (globalThis.__openTabRequestLocks__) {
          globalThis.__openTabRequestLocks__.delete(requestSignature);
          console.log(`[OpenNewTab:${callId}] 🗑️  Lock deleted due to error`);
        }
        throw error;
      }
    })();
    
    // Store the promise to prevent duplicate execution
    const lockTimestamp = Date.now();
    
    // Ensure we're using the global Map reference
    if (!globalThis.__openTabRequestLocks__) {
      console.error(`[OpenNewTab:${callId}] ❌ CRITICAL: Global Map is undefined when trying to set lock!`);
      globalThis.__openTabRequestLocks__ = new Map();
    }
    
    globalThis.__openTabRequestLocks__.set(requestSignature, {
      timestamp: lockTimestamp,
      promise: executionPromise,
    });
    
    console.log(`[OpenNewTab:${callId}] 🔒 Lock acquired at ${lockTimestamp}, total locks:`, globalThis.__openTabRequestLocks__.size);
    console.log(`[OpenNewTab:${callId}] 🗺️  All lock keys:`, Array.from(globalThis.__openTabRequestLocks__.keys()).map(k => k.substring(0, 80)));
    console.log(`[OpenNewTab:${callId}] 🔗 Map reference check:`, {
      globalMapSize: globalThis.__openTabRequestLocks__?.size,
      localMapSize: openTabRequestLocks.size,
      areSame: globalThis.__openTabRequestLocks__ === openTabRequestLocks,
    });
    
    // Passive cleanup: Remove stale locks older than 30 seconds when new requests come in
    if (globalThis.__openTabRequestLocks__) {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, lock] of globalThis.__openTabRequestLocks__.entries()) {
        if (now - lock.timestamp > 30000) {
          globalThis.__openTabRequestLocks__.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[OpenNewTab:${callId}] 🧹 Passively cleaned ${cleaned} stale lock(s)`);
      }
    }
    
    console.log(`[OpenNewTab:${callId}] 📤 Returning execution promise`);
    return executionPromise;
  } catch (error) {
    console.error(`[OpenNewTab:${callId}] ❌ Error in handleOpenNewTab:`, error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function executeOpenNewTabInternal(
  url: string,
  opts: OpenNewTabOptions,
  normalizedUrl: string,
  requestSignature: string,
  callId: string,
): Promise<OpenNewTabResult> {
  console.log(`[OpenNewTab:${callId}] 🔧 executeOpenNewTabInternal called`);
  try {
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

    // Normalize URL (again) so we can use it as a stable key and comparison value
    const normalizedUrlObj = new URL(validUrl);
    const finalNormalizedUrl = normalizedUrlObj.toString();

    // Reuse existing tab if requested
    if (opts.reuseExisting) {
      const candidates = await chrome.tabs.query({ currentWindow: true });
      const found = candidates.find(t => t.url === finalNormalizedUrl);
      if (found && found.id) {
        await chrome.tabs.update(found.id, { active: !!opts.active, pinned: !!opts.pinned });
        if (opts.active && opts.bringWindowToFront && found.windowId) {
          await chrome.windows.update(found.windowId, { focused: true });
        }
        const uo = normalizedUrlObj;
        return {
          status: 'success',
          message: `Focused existing tab for ${uo.hostname}`,
          tabInfo: {
            tabId: found.id,
            url: finalNormalizedUrl,
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
    console.log(`[OpenNewTab:${callId}] 🌐 Calling chrome.tabs.create with:`, createProps);
    const newTab = await chrome.tabs.create(createProps);
    console.log(`[OpenNewTab:${callId}] ✅ chrome.tabs.create returned:`, { id: newTab?.id, url: newTab?.url?.substring(0, 60) });

    if (!newTab || !newTab.id) {
      console.error(`[OpenNewTab:${callId}] ❌ Tab creation failed - no ID returned`);
      return {
        status: 'error',
        message: 'Failed to create new tab',
      };
    }
    
    console.log(`[OpenNewTab:${callId}] 🎉 Tab ${newTab.id} created successfully`);

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
    const urlObj = normalizedUrlObj;
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
        url: finalNormalizedUrl,
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
