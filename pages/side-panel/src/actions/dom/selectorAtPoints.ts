import { debug as baseDebug } from '@extension/shared';

// Timestamped debug wrappers
const ts = () => `[${new Date().toISOString().split('T')[1].slice(0, -1)}]`;
const debug = {
  log: (...args: any[]) => baseDebug.log(ts(), ...args),
  warn: (...args: any[]) => baseDebug.warn(ts(), ...args),
  error: (...args: any[]) => baseDebug.error(ts(), ...args),
} as const;

interface SelectorAtPointResult {
  status: 'success' | 'error';
  message: string;
  selector?: string;
  elementInfo?: {
    tag: string;
    id: string | null;
    classes: string[];
    textSnippet: string;
  };
}

interface Point {
  x: number;
  y: number;
}

interface BatchSelectorResultItem extends SelectorAtPointResult {
  point: Point;
}

interface BatchSelectorAtPointsResult {
  status: 'success' | 'error';
  message: string;
  results: BatchSelectorResultItem[];
}

export async function handleGetSelectorAtPoint(x: number, y: number): Promise<SelectorAtPointResult> {
  try {
    debug.log('[SelectorAtPoint] Request:', { x, y });

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return { status: 'error', message: 'Unable to access current tab' };
    }

    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (px: number, py: number) => {
        // CSS.escape polyfill
        // @ts-ignore
        if (typeof (window as any).CSS === 'undefined' || typeof (CSS as any).escape !== 'function') {
          // @ts-ignore
          (window as any).CSS = (window as any).CSS || {};
          // @ts-ignore
          (CSS as any).escape = function (value: string) {
            return value.replace(/([!"#$%&'()*+,./:;<=>?@\[\]^`{|}~])/g, '\\$1');
          };
        }

        const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
        const vx = clamp(px, 0, window.innerWidth - 1);
        const vy = clamp(py, 0, window.innerHeight - 1);

        const el = document.elementFromPoint(vx, vy) as Element | null;
        if (!el) {
          return { success: false, message: 'No element at given point' };
        }

        // Generate a unique selector for the element (prefer global utils.generateFastSelector)
        const buildSelector = (node: Element): string => {
          try {
            const gen = (window as any).utils && (window as any).utils.generateFastSelector;
            if (typeof gen === 'function') {
              const res = gen(node);
              if (res && typeof res.selector === 'string' && res.selector.length > 0) {
                try {
                  const hits = document.querySelectorAll(res.selector);
                  if (hits.length === 1 && hits[0] === node) return res.selector; // verified unique
                } catch {}
              }
            }
          } catch {}
          // Prefer unique id
          if ((node as HTMLElement).id) {
            const idSel = `#${CSS.escape((node as HTMLElement).id)}`;
            try {
              if (document.querySelectorAll(idSel).length === 1) return idSel;
            } catch {}
          }

          const candidates: string[] = [];
          const tag = node.tagName.toLowerCase();
          const classList = Array.from(node.classList);
          if (classList.length) {
            const classSel = `${tag}.${classList
              .map(c => CSS.escape(c))
              .slice(0, 3)
              .join('.')}`;
            candidates.push(classSel);
          }
          // Attribute hints
          const attrs = ['name', 'role', 'type', 'aria-label', 'data-testid', 'data-test'];
          for (const attr of attrs) {
            const val = (node as HTMLElement).getAttribute && (node as HTMLElement).getAttribute(attr);
            if (val) candidates.push(`${tag}[${attr}="${CSS.escape(val)}"]`);
          }
          candidates.push(tag);

          // Try short unique candidates scoped to document
          for (const sel of candidates) {
            try {
              if (document.querySelectorAll(sel).length === 1) return sel;
            } catch {}
          }

          // Build path with nth-of-type
          const parts: string[] = [];
          let cur: Element | null = node;
          // Stop at html
          while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
            let part = cur.tagName.toLowerCase();
            if ((cur as HTMLElement).id) {
              part = `#${CSS.escape((cur as HTMLElement).id)}`;
              parts.push(part);
              break;
            }
            const sibs = Array.from(cur.parentElement?.children || []).filter(
              c => (c as Element).tagName === cur!.tagName,
            );
            const idx = sibs.indexOf(cur) + 1;
            part += `:nth-of-type(${idx})`;
            parts.push(part);
            cur = cur.parentElement;
          }
          parts.push('html');
          const full = parts.reverse().join(' > ');
          // As a final safety, verify uniqueness
          try {
            const hits = document.querySelectorAll(full);
            if (hits.length === 1 && hits[0] === node) return full;
          } catch {}
          // Guaranteed unique fallback by walking from body with nth-child
          const path: string[] = [];
          let current: Element | null = node;
          while (current && current !== document.body) {
            const parentEl: Element | null = current.parentElement;
            if (!parentEl) break;
            const siblings = Array.from(parentEl.children);
            const index = siblings.indexOf(current) + 1;
            path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
            current = parentEl;
          }
          return path.length > 0 ? `body > ${path.join(' > ')}` : node.tagName.toLowerCase();
        };

        const selector = buildSelector(el);
        const info = {
          tag: el.tagName,
          id: (el as HTMLElement).id || null,
          classes: Array.from(el.classList || []),
          textSnippet: (el.textContent || '').trim().slice(0, 60),
        };
        return { success: true, message: 'Selector generated', selector, elementInfo: info };
      },
      args: [x, y] as [number, number],
    });

    const results = await Promise.race([
      execPromise,
      new Promise<any>(resolve =>
        setTimeout(() => resolve([{ result: { success: false, message: 'Timeout generating selector' } }]), 8000),
      ),
    ]);

    debug.log('[SelectorAtPoint] Script execution results:', results);

    if (results && results[0]?.result) {
      const result = results[0].result;
      if (result.success) {
        return {
          status: 'success',
          message: result.message,
          selector: result.selector,
          elementInfo: result.elementInfo,
        };
      }
      return { status: 'error', message: result.message };
    }

    return { status: 'error', message: 'No result from script' };
  } catch (error) {
    debug.error('[SelectorAtPoint] Error:', error);
    return { status: 'error', message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export async function handleGetSelectorsAtPoints(points: Point[]): Promise<BatchSelectorAtPointsResult> {
  try {
    debug.log('[SelectorAtPoints] Request:', points);

    if (!Array.isArray(points) || points.length === 0) {
      return { status: 'error', message: 'No points provided', results: [] };
    }

    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      return { status: 'error', message: 'Unable to access current tab', results: [] };
    }

    const execPromise = chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: (pts: { x: number; y: number }[]) => {
        // CSS.escape polyfill
        // @ts-ignore
        if (typeof (window as any).CSS === 'undefined' || typeof (CSS as any).escape !== 'function') {
          // @ts-ignore
          (window as any).CSS = (window as any).CSS || {};
          // @ts-ignore
          (CSS as any).escape = function (value: string) {
            return value.replace(/([!"#$%&'()*+,./:;<=>?@\[\]^`{|}~])/g, '\\$1');
          };
        }

        const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

        const buildSelector = (node: Element): string => {
          try {
            const gen = (window as any).utils && (window as any).utils.generateFastSelector;
            if (typeof gen === 'function') {
              const res = gen(node);
              if (res && typeof res.selector === 'string' && res.selector.length > 0) {
                try {
                  const hits = document.querySelectorAll(res.selector);
                  if (hits.length === 1 && hits[0] === node) return res.selector; // verified unique
                } catch {}
              }
            }
          } catch {}
          if ((node as HTMLElement).id) {
            const idSel = `#${CSS.escape((node as HTMLElement).id)}`;
            try {
              if (document.querySelectorAll(idSel).length === 1) return idSel;
            } catch {}
          }
          const candidates: string[] = [];
          const tag = node.tagName.toLowerCase();
          const classList = Array.from(node.classList);
          if (classList.length) {
            const classSel = `${tag}.${classList
              .map(c => CSS.escape(c))
              .slice(0, 3)
              .join('.')}`;
            candidates.push(classSel);
          }
          const attrs = ['name', 'role', 'type', 'aria-label', 'data-testid', 'data-test'];
          for (const attr of attrs) {
            const val = (node as HTMLElement).getAttribute && (node as HTMLElement).getAttribute(attr);
            if (val) candidates.push(`${tag}[${attr}="${CSS.escape(val)}"]`);
          }
          candidates.push(tag);
          for (const sel of candidates) {
            try {
              if (document.querySelectorAll(sel).length === 1) return sel;
            } catch {}
          }
          const parts: string[] = [];
          let cur: Element | null = node;
          while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
            let part = cur.tagName.toLowerCase();
            if ((cur as HTMLElement).id) {
              part = `#${CSS.escape((cur as HTMLElement).id)}`;
              parts.push(part);
              break;
            }
            const sibs = Array.from(cur.parentElement?.children || []).filter(
              c => (c as Element).tagName === cur!.tagName,
            );
            const idx = sibs.indexOf(cur) + 1;
            part += `:nth-of-type(${idx})`;
            parts.push(part);
            cur = cur.parentElement;
          }
          parts.push('html');
          const full = parts.reverse().join(' > ');
          try {
            const hits = document.querySelectorAll(full);
            if (hits.length === 1 && hits[0] === node) return full;
          } catch {}
          const path: string[] = [];
          let current: Element | null = node;
          while (current && current !== document.body) {
            const parentEl: Element | null = current.parentElement;
            if (!parentEl) break;
            const siblings = Array.from(parentEl.children);
            const index = siblings.indexOf(current) + 1;
            path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
            current = parentEl;
          }
          return path.length > 0 ? `body > ${path.join(' > ')}` : node.tagName.toLowerCase();
        };

        const results = pts.map(p => {
          const vx = clamp(p.x, 0, window.innerWidth - 1);
          const vy = clamp(p.y, 0, window.innerHeight - 1);
          const el = document.elementFromPoint(vx, vy) as Element | null;
          if (!el) {
            return { success: false, message: 'No element at given point', point: { x: p.x, y: p.y } };
          }
          const selector = buildSelector(el);
          const info = {
            tag: el.tagName,
            id: (el as HTMLElement).id || null,
            classes: Array.from(el.classList || []),
            textSnippet: (el.textContent || '').trim().slice(0, 60),
          };
          return {
            success: true,
            message: 'Selector generated',
            selector,
            elementInfo: info,
            point: { x: p.x, y: p.y },
          };
        });

        return results;
      },
      args: [points] as [{ x: number; y: number }[]],
    });

    const results = await Promise.race([
      execPromise,
      new Promise<any>(resolve => setTimeout(() => resolve([{ result: [] }]), 8000)),
    ]);

    const payload = (results && results[0]?.result) || [];
    const mapped: BatchSelectorResultItem[] = payload.map((r: any) => {
      if (r && r.success) {
        return {
          status: 'success',
          message: r.message,
          selector: r.selector,
          elementInfo: r.elementInfo,
          point: r.point,
        } as BatchSelectorResultItem;
      }
      return {
        status: 'error',
        message: r?.message || 'Unknown error',
        point: r?.point || { x: 0, y: 0 },
      } as BatchSelectorResultItem;
    });

    return { status: 'success', message: 'Processed points', results: mapped };
  } catch (error) {
    debug.error('[SelectorAtPoints] Error:', error);
    return {
      status: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      results: [],
    };
  }
}
