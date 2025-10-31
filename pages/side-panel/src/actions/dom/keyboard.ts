import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

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

interface KeystrokeResult {
  status: 'success' | 'error';
  message: string;
  executed?: number; // number of keypress events dispatched
  target?: string; // target selector if any
}

function findElementWithShadow(selector: string): Element | null {
  if (!selector.includes(' >> ')) {
    return document.querySelector(selector);
  }
  const [shadowPath, leafSelector] = selector.split(' >> ').map(s => s.trim());
  const pathSegments = shadowPath
    .split(' > ')
    .map(s => s.trim())
    .filter(s => s && s !== 'document');
  let root: Document | ShadowRoot = document;
  for (const seg of pathSegments) {
    const host = root.querySelector(seg);
    if (!host) return null;
    if (!(host as Element).shadowRoot) return null;
    root = (host as Element).shadowRoot as ShadowRoot;
  }
  return root.querySelector(leafSelector);
}

// Use globalThis to ensure the Map persists across module reloads/HMR
declare global {
  var __keystrokeRequestLocks__: Map<string, { timestamp: number; promise: Promise<KeystrokeResult> }> | undefined;
}

// Static map to track in-flight keystroke requests (background-side deduplication)
if (!globalThis.__keystrokeRequestLocks__) {
  globalThis.__keystrokeRequestLocks__ = new Map<string, { timestamp: number; promise: Promise<KeystrokeResult> }>();
  console.log('[Keyboard] 🏗️  Initializing global lock Map');
}
const keystrokeRequestLocks = globalThis.__keystrokeRequestLocks__;

export async function handleKeystrokeSequence(req: KeystrokeSequenceRequest): Promise<KeystrokeResult> {
  try {
    // Format keystrokes for logging (e.g., "Cmd+K", "Ctrl+F", "hello")
    const formatKeystroke = (stroke: Keystroke): string => {
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
    };

    const formattedKeys = req.sequence.map(formatKeystroke).join(' ');
    
    // Create stable signature for background-side deduplication
    const requestSignature = req.sequence.map(k => {
      const mods = [k.ctrl && 'C', k.meta && 'M', k.alt && 'A', k.shift && 'S'].filter(Boolean).join('');
      return `${mods}${k.key}${k.repeat || 1}`;
    }).join('|') + (req.targetSelector ? `@${req.targetSelector}` : '');
    
    // Generate unique call ID for tracking
    const callId = Math.random().toString(36).substring(2, 9);
    
    // Check if identical request is already in-flight
    // Force refresh the reference in case it was reset
    const lockMap = globalThis.__keystrokeRequestLocks__ || new Map();
    if (!globalThis.__keystrokeRequestLocks__) {
      console.log(`[Keyboard:${callId}] ⚠️  WARNING: Global lock Map was undefined, recreating it!`);
      globalThis.__keystrokeRequestLocks__ = lockMap;
    }
    
    const existingLock = lockMap.get(requestSignature);
    const lockAge = existingLock ? Date.now() - existingLock.timestamp : -1;
    
    console.log(`[Keyboard:${callId}] 🔍 Lock check:`, { 
      signature: requestSignature.substring(0, 50),
      hasLock: !!existingLock,
      lockAge,
      willReuse: existingLock && lockAge < 10000,
      totalLocksInMap: lockMap.size,
    });
    
    if (existingLock && lockAge < 10000) {
      console.log(`[Keyboard:${callId}] ⚠️  DUPLICATE REQUEST BLOCKED - Reusing existing execution (lock age: ${lockAge}ms)`);
      return existingLock.promise;
    }
    
    debug.log(`[Keyboard] 🎹 Executing keystrokes: ${formattedKeys}`);
    if (req.targetSelector) {
      debug.log(`[Keyboard] 🎯 Target: ${req.targetSelector}`);
    }
    if (req.delayMs && req.delayMs > 0) {
      debug.log(`[Keyboard] ⏱️  Delay: ${req.delayMs}ms between keys`);
    }

    if (!req || !Array.isArray(req.sequence) || req.sequence.length === 0) {
      return { status: 'error', message: 'Empty keystroke sequence' };
    }
    
    // Create execution promise
    const executionPromise = (async (): Promise<KeystrokeResult> => {
      try {
        return await executeKeystrokeSequenceInternal(req, formattedKeys, requestSignature, callId);
      } catch (error) {
        // Delete lock immediately on error so retries can proceed
        if (globalThis.__keystrokeRequestLocks__) {
          globalThis.__keystrokeRequestLocks__.delete(requestSignature);
          console.log(`[Keyboard:${callId}] 🗑️  Lock deleted due to error`);
        }
        throw error;
      }
    })();
    
    // Store the promise to prevent duplicate execution
    const lockTimestamp = Date.now();
    
    // Ensure we're using the global Map reference
    if (!globalThis.__keystrokeRequestLocks__) {
      console.error(`[Keyboard:${callId}] ❌ CRITICAL: Global Map is undefined when trying to set lock!`);
      globalThis.__keystrokeRequestLocks__ = new Map();
    }
    
    globalThis.__keystrokeRequestLocks__.set(requestSignature, {
      timestamp: lockTimestamp,
      promise: executionPromise,
    });
    
    console.log(`[Keyboard:${callId}] 🔒 Lock acquired at ${lockTimestamp}, total locks:`, globalThis.__keystrokeRequestLocks__.size);
    
    // Passive cleanup: Remove stale locks older than 30 seconds when new requests come in
    if (globalThis.__keystrokeRequestLocks__) {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, lock] of globalThis.__keystrokeRequestLocks__.entries()) {
        if (now - lock.timestamp > 30000) {
          globalThis.__keystrokeRequestLocks__.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[Keyboard:${callId}] 🧹 Passively cleaned ${cleaned} stale lock(s)`);
      }
    }
    
    return executionPromise;
  } catch (error) {
    debug.error('[Keyboard] ❌ Error in handleKeystrokeSequence:', error);
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function executeKeystrokeSequenceInternal(
  req: KeystrokeSequenceRequest,
  formattedKeys: string,
  requestSignature: string,
  callId: string,
): Promise<KeystrokeResult> {
  try {

    // Focus target if provided
    if (req.targetSelector) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id as number },
        world: 'MAIN',
        func: (selector: string) => {
          // Prevent duplicate focus injection
          const focusKey = `__copilotFocusInjected_${selector}`;
          if ((window as any)[focusKey]) {
            return true; // Already focused
          }
          (window as any)[focusKey] = true;
          setTimeout(() => delete (window as any)[focusKey], 2000);
          
          const el = ((): Element | null => {
            if (!selector.includes(' >> ')) return document.querySelector(selector);
            const [shadowPath, leafSelector] = selector.split(' >> ').map(s => s.trim());
            const segments = shadowPath.split(' > ').map(s => s.trim()).filter(Boolean).filter(s => s !== 'document');
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
        args: [req.targetSelector],
      });
      const focused = result?.result ? '✅ focused' : '❌ focus failed';
      debug.log(`[Keyboard] Target element: ${focused}`);
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return { status: 'error', message: 'Unable to access current tab' };
    }

    const delayMs = Number.isFinite(req.delayMs) ? Math.max(0, Math.min(250, req.delayMs as number)) : 20;

    const exec = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'ISOLATED', // Use ISOLATED world to prevent Chrome from re-injecting
      func: async (sequence: Keystroke[], delayMsInner: number, signature: string) => {
        // ATOMIC lock check using compare-and-set pattern via DOM
        const injectionKey = `__copilotKeyboardInjected_${signature}`;
        const lockAttr = `data-copilot-keyboard-lock-${signature.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Try to acquire lock atomically using DOM attribute
        const existingLock = document.documentElement.getAttribute(lockAttr);
        if (existingLock) {
          const lockTime = parseInt(existingLock, 10);
          if (!isNaN(lockTime) && Date.now() - lockTime < 3000) {
            console.log('[Keyboard] 🚫 Atomic lock already held, skipping duplicate:', signature);
            return 0; // Return 0 dispatched events when skipping
          }
        }
        
        // Set atomic lock with timestamp
        document.documentElement.setAttribute(lockAttr, Date.now().toString());
        
        // Also set window-level lock for additional safety
        if ((window as any)[injectionKey]) {
          console.log('[Keyboard] 🚫 Window lock already held, skipping duplicate:', signature);
          return 0;
        }
        (window as any)[injectionKey] = true;
        
        // Auto-cleanup locks after 3 seconds
        setTimeout(() => {
          delete (window as any)[injectionKey];
          document.documentElement.removeAttribute(lockAttr);
        }, 3000);
        
        const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
        let dispatched = 0;
        const normalizeKey = (key: string) => key.length === 1 ? key : key; // keep named keys intact

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

            // keydown
            document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', initCommon));
            // keypress (optional; many modern apps rely on keydown/up only)
            document.activeElement?.dispatchEvent(new KeyboardEvent('keypress', initCommon));
            // input (text insertion for single-character keys)
            if (key.length === 1) {
              const ae = document.activeElement as HTMLElement | null;
              if (ae && (ae as HTMLInputElement).value !== undefined) {
                const inputEl = ae as HTMLInputElement | HTMLTextAreaElement;
                const start = (inputEl as any).selectionStart ?? inputEl.value.length;
                const end = (inputEl as any).selectionEnd ?? inputEl.value.length;
                inputEl.setRangeText(key, start, end, 'end');
                ae.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true, data: key, inputType: 'insertText' }));
              } else if (ae && (ae as HTMLElement).isContentEditable) {
                document.execCommand('insertText', false, key);
              }
            }
            // keyup
            document.activeElement?.dispatchEvent(new KeyboardEvent('keyup', initCommon));

            dispatched += 3; // rough count of events; input may add 1 more
            if (delayMsInner > 0) await wait(delayMsInner);
          }
        }
        return dispatched;
      },
      args: [req.sequence, delayMs, requestSignature],
    });

    const executed = exec?.[0]?.result ?? 0;
    debug.log(`[Keyboard:${callId}] ✅ Successfully executed: ${formattedKeys}`);
    debug.log(`[Keyboard:${callId}] 📊 Total keyboard events dispatched: ${executed}`);
    console.log(`[Keyboard:${callId}] 🔒 Lock retained (will expire via timestamp check)`);
    return { status: 'success', message: `Keystrokes executed: ${formattedKeys}`, executed, target: req.targetSelector };
  } catch (error) {
    debug.error('[Keyboard] ❌ Error executing keystrokes:', error);
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}



