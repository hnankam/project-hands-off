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

    // Focus target if provided
    if (req.targetSelector) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id as number },
        world: 'MAIN',
        func: (selector: string) => {
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
      world: 'MAIN',
      func: async (sequence: Keystroke[], delayMsInner: number) => {
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
      args: [req.sequence, delayMs],
    });

    const executed = exec?.[0]?.result ?? 0;
    debug.log(`[Keyboard] ✅ Successfully executed: ${formattedKeys}`);
    debug.log(`[Keyboard] 📊 Total keyboard events dispatched: ${executed}`);
    return { status: 'success', message: `Keystrokes executed: ${formattedKeys}`, executed, target: req.targetSelector };
  } catch (error) {
    debug.error('[Keyboard] ❌ Error executing keystrokes:', error);
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}



