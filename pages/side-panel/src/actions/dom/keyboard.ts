import { debug as baseDebug } from '@extension/shared';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Log prefix for keyboard actions */
const LOG_PREFIX = '[Keyboard]';

/**
 * Handler-level lock timeout in milliseconds.
 * Should be longer than typical keystroke sequence execution.
 * Used to prevent duplicate handler calls.
 */
const HANDLER_LOCK_TIMEOUT_MS = 5000;

/**
 * Content script lock timeout in milliseconds.
 * Used for DOM attribute and window-level locks.
 */
const CONTENT_LOCK_TIMEOUT_MS = 3000;

/**
 * Stale lock cleanup threshold in milliseconds.
 * Locks older than this are removed during passive cleanup.
 */
const STALE_LOCK_THRESHOLD_MS = 30000;

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/** Timestamp helper for consistent logging */
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

export type KeyInput = string; // e.g. "K", "Enter", "Escape", "ArrowLeft"

export interface Keystroke {
  key: KeyInput;
  ctrl?: boolean;
  meta?: boolean; // Command on macOS
  alt?: boolean;
  shift?: boolean;
  repeat?: number; // default 1
}

export interface KeystrokeSequenceRequest {
  sequence: Keystroke[]; // executed in order
  targetSelector?: string; // optional focus target (supports shadow >> notation)
  delayMs?: number; // delay between keys, default 20ms
}

/**
 * Result of a keystroke sequence operation
 */
export interface KeystrokeResult {
  status: 'success' | 'error';
  message: string;
  executed?: number; // number of keypress events dispatched
  target?: string; // target selector if any
}

// ============================================================================
// HANDLER-LEVEL DEDUPLICATION
// ============================================================================

/**
 * Lock entry for tracking in-flight requests
 */
interface LockEntry {
  timestamp: number;
  promise: Promise<KeystrokeResult>;
}

// Use globalThis to ensure the Map persists across module reloads/HMR
declare global {
  // eslint-disable-next-line no-var
  var __keystrokeRequestLocks__: Map<string, LockEntry> | undefined;
}

/**
 * Get or create the global lock map.
 * Uses globalThis to persist across HMR.
 */
function getOrCreateLockMap(): Map<string, LockEntry> {
  if (!globalThis.__keystrokeRequestLocks__) {
    globalThis.__keystrokeRequestLocks__ = new Map<string, LockEntry>();
    debug.log(LOG_PREFIX, '🏗️ Initializing global lock Map');
  }
  return globalThis.__keystrokeRequestLocks__;
}

/**
 * Clean up stale locks older than threshold
 */
function cleanupStaleLocks(lockMap: Map<string, LockEntry>, callId: string): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, lock] of lockMap.entries()) {
    if (now - lock.timestamp > STALE_LOCK_THRESHOLD_MS) {
      lockMap.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    debug.log(`${LOG_PREFIX}:${callId}`, `🧹 Passively cleaned ${cleaned} stale lock(s)`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a keystroke for human-readable logging
 */
function formatKeystroke(stroke: Keystroke): string {
  const modifiers: string[] = [];
  if (stroke.ctrl) modifiers.push('Ctrl');
  if (stroke.meta) modifiers.push('Cmd');
  if (stroke.alt) modifiers.push('Alt');
  if (stroke.shift) modifiers.push('Shift');

  const key = stroke.key;
  const repeat = stroke.repeat && stroke.repeat > 1 ? `×${stroke.repeat}` : '';

  if (modifiers.length > 0) {
    return `${modifiers.join('+')}+${key}${repeat}`;
  }
  return `${key}${repeat}`;
}

/**
 * Create a stable signature for request deduplication
 */
function createRequestSignature(req: KeystrokeSequenceRequest): string {
  const keysPart = req.sequence
    .map((k) => {
      const mods = [k.ctrl && 'C', k.meta && 'M', k.alt && 'A', k.shift && 'S'].filter(Boolean).join('');
      return `${mods}${k.key}${k.repeat || 1}`;
    })
    .join('|');
  return keysPart + (req.targetSelector ? `@${req.targetSelector}` : '');
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Execute a sequence of keystrokes on the current page
 * @param req - The keystroke sequence request
 * @returns Promise with status and execution details
 */
export async function handleKeystrokeSequence(req: KeystrokeSequenceRequest): Promise<KeystrokeResult> {
  // Validate input early
  if (!req || !Array.isArray(req.sequence) || req.sequence.length === 0) {
    return { status: 'error', message: 'Empty keystroke sequence' };
  }

  const formattedKeys = req.sequence.map(formatKeystroke).join(' ');
  const requestSignature = createRequestSignature(req);
  const callId = Math.random().toString(36).substring(2, 9);

  // Get lock map
  const lockMap = getOrCreateLockMap();

  // Check for existing in-flight request (handler-level deduplication)
  const existingLock = lockMap.get(requestSignature);
  const lockAge = existingLock ? Date.now() - existingLock.timestamp : -1;

  debug.log(`${LOG_PREFIX}:${callId}`, 'Lock check:', {
    signature: requestSignature.substring(0, 50),
    hasLock: !!existingLock,
    lockAge,
    willReuse: existingLock && lockAge < HANDLER_LOCK_TIMEOUT_MS,
    totalLocksInMap: lockMap.size,
  });

  // If an identical request is in-flight (within timeout), reuse it
  if (existingLock && lockAge < HANDLER_LOCK_TIMEOUT_MS) {
    debug.log(`${LOG_PREFIX}:${callId}`, `DUPLICATE REQUEST BLOCKED - Reusing existing execution (lock age: ${lockAge}ms)`);
    return existingLock.promise;
  }

  // Log execution start
  debug.log(LOG_PREFIX, `Executing keystrokes: ${formattedKeys}`);
  if (req.targetSelector) {
    debug.log(LOG_PREFIX, `Target: ${req.targetSelector}`);
  }
  if (req.delayMs && req.delayMs > 0) {
    debug.log(LOG_PREFIX, `Delay: ${req.delayMs}ms between keys`);
  }

  // Create execution promise with cleanup in finally block
  const executionPromise = executeKeystrokeSequenceInternal(req, formattedKeys, requestSignature, callId)
    .finally(() => {
      // Always clean up the lock after execution completes (success or error)
      lockMap.delete(requestSignature);
      debug.log(`${LOG_PREFIX}:${callId}`, 'Lock released after execution');
    });

  // Store the promise to prevent duplicate execution
  const lockTimestamp = Date.now();
  lockMap.set(requestSignature, {
    timestamp: lockTimestamp,
    promise: executionPromise,
  });

  debug.log(`${LOG_PREFIX}:${callId}`, `Lock acquired at ${lockTimestamp}, total locks: ${lockMap.size}`);

  // Passive cleanup of stale locks
  cleanupStaleLocks(lockMap, callId);

  try {
    return await executionPromise;
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error in handleKeystrokeSequence:', error);
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// INTERNAL EXECUTION
// ============================================================================

async function executeKeystrokeSequenceInternal(
  req: KeystrokeSequenceRequest,
  formattedKeys: string,
  requestSignature: string,
  callId: string
): Promise<KeystrokeResult> {
  try {
    // Focus target if provided - using ISOLATED world to match keystroke execution
    // This ensures locks and state are shared between focus and keystroke phases
    if (req.targetSelector) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (tabId) {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'ISOLATED',
          func: (selector: string, lockTimeout: number) => {
            // Prevent duplicate focus injection
            const focusKey = `__copilotFocusInjected_${selector}`;
            const win = window as unknown as { [key: string]: boolean | undefined };
            if (win[focusKey]) {
              return true; // Already focused
            }
            win[focusKey] = true;
            setTimeout(() => delete win[focusKey], lockTimeout);

            const el = ((): Element | null => {
              if (!selector.includes(' >> ')) return document.querySelector(selector);
              const [shadowPath, leafSelector] = selector.split(' >> ').map((s) => s.trim());
              const segments = shadowPath
                .split(' > ')
                .map((s) => s.trim())
                .filter(Boolean)
                .filter((s) => s !== 'document');
              let root: Document | ShadowRoot = document;
              for (const seg of segments) {
                const host = root.querySelector(seg);
                if (!host || !(host as Element).shadowRoot) return null;
                root = (host as Element).shadowRoot as ShadowRoot;
              }
              return root.querySelector(leafSelector);
            })();
            if (el && (el as HTMLElement).focus) {
              (el as HTMLElement).focus({ preventScroll: true });
              return true;
            }
            return false;
          },
          args: [req.targetSelector, CONTENT_LOCK_TIMEOUT_MS],
        });
        const focused = result?.result ? 'focused' : 'focus failed';
        debug.log(LOG_PREFIX, `Target element: ${focused}`);
      }
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return { status: 'error', message: 'Unable to access current tab' };
    }

    const delayMs = Number.isFinite(req.delayMs) ? Math.max(0, Math.min(250, req.delayMs as number)) : 20;

    const exec = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'ISOLATED', // Use ISOLATED world to prevent Chrome from re-injecting
      func: async (sequence: Keystroke[], delayMsInner: number, signature: string, lockTimeout: number) => {
        // Window type for content script
        type WindowWithState = Window & {
          __copilotKeyLogInstalled?: boolean;
          __copilotKeyLog?: unknown[];
          __copilotSyntheticKeyGuard?: {
            current: null | {
              id: string;
              key: string;
              keyupHandled: boolean;
              cleanupScheduled?: boolean;
            };
          };
          [key: string]: unknown;
        };

        const win = window as unknown as WindowWithState;

        // ATOMIC lock check using compare-and-set pattern via DOM
        const injectionKey = `__copilotKeyboardInjected_${signature}`;
        const lockAttr = `data-copilot-keyboard-lock-${signature.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // One-time debug logger for inbound keyboard events within the page.
        if (!win.__copilotKeyLogInstalled) {
          win.__copilotKeyLogInstalled = true;
          win.__copilotKeyLog = [];
          if (!win.__copilotSyntheticKeyGuard) {
            win.__copilotSyntheticKeyGuard = {
              current: null,
            };
          }
          const capture = (type: string) => (event: KeyboardEvent) => {
            const formatNode = (node: EventTarget | null): string => {
              if (!node) return 'null';
              if (node instanceof HTMLElement) return node.tagName;
              if (node instanceof Document) return '#document';
              if (node instanceof Window) return 'window';
              const anyNode = node as { tagName?: string; nodeName?: string };
              return anyNode.tagName || anyNode.nodeName || typeof anyNode;
            };

            const guard = win.__copilotSyntheticKeyGuard;
            if (guard?.current && guard.current.key === event.key) {
              const currentGuard = guard.current;
              if (type === 'keyup') {
                if (currentGuard.keyupHandled) {
                  // Prevent duplicate synthetic keyup events from propagating
                  event.stopImmediatePropagation();
                  event.preventDefault();
                  console.log('[Copilot][Guard] Suppressed duplicate keyup', {
                    key: event.key,
                    trusted: event.isTrusted,
                    time: performance.now(),
                  });
                  return;
                }
                currentGuard.keyupHandled = true;
                if (!currentGuard.cleanupScheduled) {
                  currentGuard.cleanupScheduled = true;
                  setTimeout(() => {
                    if (guard.current === currentGuard) {
                      guard.current = null;
                    }
                  }, 120);
                }
              }
            }

            const entry = {
              type,
              key: event.key,
              time: performance.now(),
              target: formatNode(event.target),
              composedPath: event.composedPath().map(formatNode).slice(0, 4),
            };
            win.__copilotKeyLog?.push(entry);
            console.log('[Copilot][KeyLog]', entry);
          };
          (['keydown', 'keypress', 'keyup'] as const).forEach((evt) => {
            window.addEventListener(evt, capture(evt), true);
          });
        }

        // Try to acquire lock atomically using DOM attribute
        const existingLock = document.documentElement.getAttribute(lockAttr);
        if (existingLock) {
          const lockTime = parseInt(existingLock, 10);
          if (!isNaN(lockTime) && Date.now() - lockTime < lockTimeout) {
            console.log('[Keyboard] Atomic lock already held, skipping duplicate:', signature);
            return 0; // Return 0 dispatched events when skipping
          }
        }

        // Set atomic lock with timestamp
        document.documentElement.setAttribute(lockAttr, Date.now().toString());

        // Also set window-level lock for additional safety
        if (win[injectionKey]) {
          console.log('[Keyboard] Window lock already held, skipping duplicate:', signature);
          return 0;
        }
        win[injectionKey] = true;

        // Cleanup function to be called immediately after dispatch
        const cleanup = () => {
          delete win[injectionKey];
          document.documentElement.removeAttribute(lockAttr);
        };

        // Fallback cleanup after timeout (in case immediate cleanup fails)
        const cleanupTimer = setTimeout(cleanup, lockTimeout);

        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        let dispatched = 0;
        const normalizeKey = (key: string) => (key.length === 1 ? key : key); // keep named keys intact

        try {
          const guard = win.__copilotSyntheticKeyGuard;

          for (const stroke of sequence) {
            const repeat = Math.max(1, Math.min(50, Number(stroke.repeat ?? 1)));
            for (let i = 0; i < repeat; i++) {
              const key = normalizeKey(stroke.key);
              const initCommon: KeyboardEventInit = {
                key,
                code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
                ctrlKey: !!stroke.ctrl,
                metaKey: !!stroke.meta,
                altKey: !!stroke.alt,
                shiftKey: !!stroke.shift,
                bubbles: true,
                cancelable: true,
                composed: true,
              };

              const target = (document.activeElement as HTMLElement | null) || document.body || document.documentElement;
              const dispatchKeyEvent = (type: 'keydown' | 'keypress' | 'keyup') => {
                console.log('[Copilot][DispatchEvent]', { type, key, time: performance.now() });
                const event = new KeyboardEvent(type, initCommon);
                target?.dispatchEvent(event);
                dispatched += 1;
              };

              const isCharacterKey = key.length === 1 && !stroke.ctrl && !stroke.meta && !stroke.alt;
              const releaseDelay = Math.max(8, Math.min(80, delayMsInner || 12));

              if (guard) {
                guard.current = {
                  id: `${signature}-${key}-${Date.now()}-${i}`,
                  key,
                  keyupHandled: false,
                };
              }

              // keydown always fires
              dispatchKeyEvent('keydown');

              if (isCharacterKey) {
                // keypress for character keys (legacy compatibility)
                dispatchKeyEvent('keypress');

                // insert text for focused inputs/contenteditable
                const ae = target as HTMLElement | null;
                if (ae) {
                  const inputEl = ae as HTMLInputElement | HTMLTextAreaElement;
                  if (inputEl.value !== undefined) {
                    const start = inputEl.selectionStart ?? inputEl.value.length;
                    const end = inputEl.selectionEnd ?? inputEl.value.length;
                    inputEl.setRangeText(key, start, end, 'end');
                    ae.dispatchEvent(
                      new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                        data: key,
                        inputType: 'insertText',
                      })
                    );
                    dispatched += 1;
                  } else if (ae.isContentEditable) {
                    document.execCommand('insertText', false, key);
                  }
                }
              } else {
                // Give non-character keys a small hold time before keyup
                await wait(releaseDelay);
              }

              // keyup releases the key
              dispatchKeyEvent('keyup');

              if (guard?.current && guard.current.key === key) {
                setTimeout(() => {
                  if (guard.current && guard.current.key === key && guard.current.keyupHandled) {
                    guard.current = null;
                  }
                }, 150);
              }

              if (delayMsInner > 0) await wait(delayMsInner);
            }
          }

          // Post-dispatch settle: Allow page event handlers to complete before returning
          // This prevents race conditions where subsequent actions (like screenshot) might
          // trigger pending handlers or re-dispatch events
          await wait(16); // One frame at 60fps

          // Clear locks immediately now that dispatch is complete
          clearTimeout(cleanupTimer);
          cleanup();
          console.log('[Keyboard] Locks cleared immediately after dispatch completion');

          return dispatched;
        } catch (error) {
          // Ensure cleanup happens even if an error occurs
          clearTimeout(cleanupTimer);
          cleanup();
          throw error;
        }
      },
      args: [req.sequence, delayMs, requestSignature, CONTENT_LOCK_TIMEOUT_MS],
    });

    const executed = exec?.[0]?.result ?? 0;
    debug.log(`${LOG_PREFIX}:${callId}`, `Successfully executed: ${formattedKeys}`);
    debug.log(`${LOG_PREFIX}:${callId}`, `Total keyboard events dispatched: ${executed}`);
    return { status: 'success', message: `Keystrokes executed: ${formattedKeys}`, executed, target: req.targetSelector };
  } catch (error) {
    debug.error(LOG_PREFIX, 'Error executing keystrokes:', error);
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
