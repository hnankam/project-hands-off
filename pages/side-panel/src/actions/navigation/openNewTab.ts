/**
 * Open New Tab Action
 *
 * Opens a new browser tab with the specified URL, with deduplication and security validation.
 */

import { debug as baseDebug } from '@extension/shared';
import { isExtensionContext } from '@extension/platform';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for consistent logging */
const LOG_PREFIX = '[OpenNewTab]';

/** Lock timeout for deduplication (covers slower agent calls) */
const LOCK_TIMEOUT_MS = 10000;

/** Stale lock cleanup threshold */
const STALE_LOCK_THRESHOLD_MS = 30000;

/** Dangerous URL patterns to block */
const DANGEROUS_URL_PATTERNS = [/^javascript:/i, /^data:/i, /^vbscript:/i, /^file:/i];

/** Supported URL protocols */
const SUPPORTED_PROTOCOLS = ['http:', 'https:'];

// ============================================================================
// DEBUG HELPERS
// ============================================================================

const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: unknown[]) => baseDebug.log(ts(), ...args),
  warn: (...args: unknown[]) => baseDebug.warn(ts(), ...args),
  error: (...args: unknown[]) => baseDebug.error(ts(), ...args),
} as const;

// ============================================================================
// TYPES
// ============================================================================

/** Tab information in result */
interface TabInfo {
  tabId: number;
  url: string;
  domain: string;
  path: string;
  isActive: boolean;
  pinned?: boolean;
  windowId?: number;
}

/** Result type for open new tab operation */
export interface OpenNewTabResult {
  status: 'success' | 'error';
  message: string;
  tabInfo?: TabInfo;
}

/** Options for opening a new tab */
export interface OpenNewTabOptions {
  active?: boolean;
  pinned?: boolean;
  adjacent?: boolean;
  reuseExisting?: boolean;
  bringWindowToFront?: boolean;
  index?: number;
  waitForCompleteMs?: number;
}

/** Lock entry for deduplication */
interface LockEntry {
  timestamp: number;
  promise: Promise<OpenNewTabResult>;
}

// ============================================================================
// HANDLER-LEVEL DEDUPLICATION
// ============================================================================

// Use globalThis to ensure the Map persists across module reloads/HMR
declare global {
  // eslint-disable-next-line no-var
  var __openTabRequestLocks__: Map<string, LockEntry> | undefined;
}

if (!globalThis.__openTabRequestLocks__) {
  globalThis.__openTabRequestLocks__ = new Map<string, LockEntry>();
  debug.log(LOG_PREFIX, 'Initializing global lock Map');
}

const openTabRequestLocks = globalThis.__openTabRequestLocks__;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Normalize URL for comparison and signature generation
 */
function normalizeUrl(url: string): string {
  try {
    const tempUrl = url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/) ? url : 'https://' + url;
    return new URL(tempUrl).toString();
  } catch {
    return url;
  }
}

/**
 * Create request signature for deduplication
 */
function createRequestSignature(normalizedUrl: string, active: boolean, pinned: boolean): string {
  return `${normalizedUrl}|${active}|${pinned}`;
}

/**
 * Validate URL and return validated URL or error
 */
function validateUrl(url: string): { valid: true; url: string; urlObj: URL } | { valid: false; error: string } {
  // Check dangerous patterns
  if (DANGEROUS_URL_PATTERNS.some(pattern => pattern.test(url))) {
    return {
      valid: false,
      error: 'Security: Blocked potentially dangerous URL scheme. Only HTTP/HTTPS URLs are allowed.',
    };
  }

  // Add protocol if missing
  const urlWithProtocol = url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/) ? url : 'https://' + url;

  try {
    const urlObj = new URL(urlWithProtocol);

    // Check protocol
    if (!SUPPORTED_PROTOCOLS.includes(urlObj.protocol)) {
      return {
        valid: false,
        error: `Unsupported protocol "${urlObj.protocol}". Only HTTP/HTTPS URLs are allowed.`,
      };
    }

    // Validate domain
    const hostname = urlObj.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const isIPv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
    const isIPv6 = /:/.test(hostname);
    const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*(?:\.[a-zA-Z0-9-]+)+$/;

    if (!(isLocalhost || isIPv4 || isIPv6 || domainPattern.test(hostname))) {
      return {
        valid: false,
        error: `Invalid domain format: "${hostname}". Please provide a valid domain or localhost/IP.`,
      };
    }

    return { valid: true, url: urlWithProtocol, urlObj };
  } catch {
    return {
      valid: false,
      error: `Invalid URL format: "${url}". Please provide a valid URL (e.g., "https://example.com" or "example.com")`,
    };
  }
}

/**
 * Clean up stale locks from the lock map
 */
function cleanupStaleLocks(lockMap: Map<string, LockEntry>): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, lock] of lockMap.entries()) {
    if (now - lock.timestamp > STALE_LOCK_THRESHOLD_MS) {
      lockMap.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Open a new tab with the specified URL
 *
 * @param url - The URL to open in a new tab
 * @param active - Whether to make the new tab active (default: true)
 * @param options - Additional options for tab creation
 * @returns Promise with status and tab info
 *
 * @example
 * await handleOpenNewTab('https://example.com')
 * await handleOpenNewTab('example.com', true, { reuseExisting: true })
 */
export async function handleOpenNewTab(
  url: string,
  active: boolean = true,
  options?: OpenNewTabOptions,
): Promise<OpenNewTabResult> {
  const callId = Math.random().toString(36).substring(2, 9);
  debug.log(LOG_PREFIX, `[${callId}] Request:`, { url, active, options });

  if (!isExtensionContext()) {
    const validation = validateUrl(url);
    if (!validation.valid) {
      return { status: 'error', message: validation.error };
    }
    window.open(validation.urlObj.toString(), '_blank', 'noopener,noreferrer');
    return {
      status: 'success',
      message: `Opened ${validation.urlObj.href}`,
      tabInfo: {
        tabId: -1,
        url: validation.urlObj.href,
        domain: validation.urlObj.hostname,
        path: validation.urlObj.pathname,
        isActive: active,
      },
    };
  }

  try {
    const opts: Required<Omit<OpenNewTabOptions, 'index' | 'waitForCompleteMs'>> &
      Pick<OpenNewTabOptions, 'index' | 'waitForCompleteMs'> = {
      active,
      adjacent: true,
      bringWindowToFront: true,
      pinned: false,
      reuseExisting: true,
      ...options,
    };

    // Normalize URL for signature
    const normalizedUrl = normalizeUrl(url);
    debug.log(LOG_PREFIX, `[${callId}] Normalized URL:`, normalizedUrl.substring(0, 80));

    // Create request signature
    const requestSignature = createRequestSignature(normalizedUrl, opts.active, opts.pinned);

    // Get or create lock map
    const lockMap = globalThis.__openTabRequestLocks__ ?? new Map<string, LockEntry>();
    if (!globalThis.__openTabRequestLocks__) {
      globalThis.__openTabRequestLocks__ = lockMap;
    }

    // Check for existing lock
    const existingLock = lockMap.get(requestSignature);
    const lockAge = existingLock ? Date.now() - existingLock.timestamp : -1;

    debug.log(LOG_PREFIX, `[${callId}] Lock check:`, {
      hasLock: !!existingLock,
      lockAge,
      willReuse: existingLock && lockAge < LOCK_TIMEOUT_MS,
    });

    // Reuse existing promise if within timeout
    if (existingLock && lockAge < LOCK_TIMEOUT_MS) {
      debug.log(LOG_PREFIX, `[${callId}] Duplicate request blocked, reusing existing execution`);
      return existingLock.promise;
    }

    debug.log(LOG_PREFIX, `[${callId}] No active lock, proceeding with tab creation`);

    // Create execution promise
    const executionPromise = executeOpenNewTabInternal(url, opts, normalizedUrl, callId);

    // Store lock
    lockMap.set(requestSignature, {
      timestamp: Date.now(),
      promise: executionPromise,
    });

    debug.log(LOG_PREFIX, `[${callId}] Lock acquired, total locks:`, lockMap.size);

    // Cleanup on completion (delayed to allow duplicate detection)
    executionPromise.catch(() => {
      // On error, delete lock immediately for retries
      lockMap.delete(requestSignature);
      debug.log(LOG_PREFIX, `[${callId}] Lock deleted due to error`);
    });

    // Passive cleanup of stale locks
    const cleaned = cleanupStaleLocks(lockMap);
    if (cleaned > 0) {
      debug.log(LOG_PREFIX, `[${callId}] Cleaned ${cleaned} stale lock(s)`);
    }

    return executionPromise;
  } catch (error) {
    debug.error(LOG_PREFIX, `[${callId}] Error:`, error);
    return {
      status: 'error',
      message: `Error: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Internal function to execute tab opening
 */
async function executeOpenNewTabInternal(
  url: string,
  opts: Required<Omit<OpenNewTabOptions, 'index' | 'waitForCompleteMs'>> &
    Pick<OpenNewTabOptions, 'index' | 'waitForCompleteMs'>,
  normalizedUrl: string,
  callId: string,
): Promise<OpenNewTabResult> {
  debug.log(LOG_PREFIX, `[${callId}] Executing tab creation`);

  try {
    // Validate URL
    const validation = validateUrl(url);
    if (!validation.valid) {
      return { status: 'error', message: validation.error };
    }

    const { url: validUrl, urlObj } = validation;
    const finalNormalizedUrl = urlObj.toString();

    // Get current tab for placement
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Build create properties
    const createProps: chrome.tabs.CreateProperties = {
      url: validUrl,
      active: opts.active,
      pinned: opts.pinned,
    };

    if (typeof opts.index === 'number') {
      createProps.index = opts.index;
    } else if (opts.adjacent && currentTab && typeof currentTab.index === 'number') {
      createProps.index = currentTab.index + 1;
    }

    if (currentTab && typeof currentTab.id === 'number') {
      createProps.openerTabId = currentTab.id;
    }

    // Reuse existing tab if requested
    if (opts.reuseExisting) {
      const candidates = await chrome.tabs.query({ currentWindow: true });
      const found = candidates.find(t => t.url === finalNormalizedUrl);

      if (found && found.id) {
        await chrome.tabs.update(found.id, { active: opts.active, pinned: opts.pinned });

        if (opts.active && opts.bringWindowToFront && found.windowId) {
          await chrome.windows.update(found.windowId, { focused: true });
        }

        debug.log(LOG_PREFIX, `[${callId}] Focused existing tab:`, found.id);

        return {
          status: 'success',
          message: `Focused existing tab for ${urlObj.hostname}`,
          tabInfo: {
            tabId: found.id,
            url: finalNormalizedUrl,
            domain: urlObj.hostname,
            path: urlObj.pathname + urlObj.search + urlObj.hash,
            isActive: opts.active,
            pinned: opts.pinned,
            windowId: found.windowId,
          },
        };
      }
    }

    // Create new tab
    debug.log(LOG_PREFIX, `[${callId}] Creating tab with:`, createProps);
    const newTab = await chrome.tabs.create(createProps);

    if (!newTab || !newTab.id) {
      debug.error(LOG_PREFIX, `[${callId}] Tab creation failed - no ID returned`);
      return { status: 'error', message: 'Failed to create new tab' };
    }

    debug.log(LOG_PREFIX, `[${callId}] Tab created:`, newTab.id);

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

    // Focus window if needed
    if (opts.active && opts.bringWindowToFront && newTab.windowId) {
      await chrome.windows.update(newTab.windowId, { focused: true });
    }

    return {
      status: 'success',
      message: `New tab opened successfully; ${opts.active ? 'active' : 'background'}.`,
      tabInfo: {
        tabId: newTab.id,
        url: finalNormalizedUrl,
        domain: urlObj.hostname,
        path: urlObj.pathname + urlObj.search + urlObj.hash || '/',
        isActive: opts.active,
        pinned: opts.pinned,
        windowId: newTab.windowId,
      },
    };
  } catch (error) {
    debug.error(LOG_PREFIX, `[${callId}] Error opening tab:`, error);
    return {
      status: 'error',
      message: `Error: ${getErrorMessage(error)}`,
    };
  }
}
