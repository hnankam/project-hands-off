/**
 * VirtualizedMessageViewContentVirtua
 *
 * Virtualization using Virtua's Virtualizer - similar to React Virtualized,
 * works with an external scroll container (scrollRef) without changing the main DOM tree.
 *
 * The scroll container stays in place (CopilotKit's StickToBottom); Virtua only
 * renders visible items inside it. Zero-config dynamic sizing, small bundle (~3kB).
 *
 * Toggle via VIRTUALIZATION_MODE in ChatInner.
 *
 * TODO: Fix distortion when streaming
 * TODO: Fix chat input sometimes being pushed out of view
 */

import { CustomUserMessageV2 } from './CustomUserMessageV2';
import { CustomCursor } from './slots';
import { useChatSessionIdSafe } from '../../context/ChatSessionIdContext';
import { useVirtuaChatSessionVisible } from '../../context/VirtuaChatSessionVisibleContext';
import { useLoadMoreHistoryActive } from '../../context/LoadMoreHistoryContext';
import { useScrollContainerRef } from '../../context/ScrollContainerRefContext';
import { useRegisterScrollToBottom } from '../../context/ScrollToBottomContext';
import { Z_INDEX } from '../../constants/ui';
import { useStorage } from '@extension/shared';
import { themeStorage } from '@extension/storage';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Virtualizer } from 'virtua';
import type { UserMessage } from '@ag-ui/core';
import type { VirtualizerHandle } from 'virtua';

/** Px to render before/after viewport. Higher = more prerender for smoother scroll; Virtua default 200. */
const BUFFER_SIZE = 2000;

/** Item size hint for unmeasured items. Omit for auto-estimation (recommended for dynamic content). */
const ITEM_SIZE_HINT: number | undefined = undefined;

/** Number of recent messages to keep mounted when off-screen (avoids unmount during scroll). */
const KEEP_MOUNTED_COUNT = 2000;

/** First N indices to always keep mounted - prevents Virtua from truncating scroll range at top. */
const KEEP_MOUNTED_FIRST = 5;

/** Keep sticky header from flickering during programmatic scroll (ms). */
const AUTO_SCROLL_FLAG_MS = 50;

/** Same cap as chat-messages `.copilotKitUserMessage` / assistant max-width (56rem). */
const MESSAGE_COLUMN_MAX_WIDTH_PX = 56 * 16;

/** React `key` for the portaled sticky root — must stay stable when paired user changes so header height doesn’t thrash the hit-test. */
const VIRTUA_STICKY_PORTAL_INSTANCE_KEY = 'virtua-sticky-portal';

/**
 * Inner `[data-message-role="user"]` is the markdown shell — it shrink-wraps short text. The Virtua
 * row `[data-index]` (or the widest ancestor under the list) matches the column width of in-list messages.
 */
const getStickyColumnRect = (
  sample: HTMLElement,
  listRoot: HTMLElement | null,
  scrollR: DOMRect,
): { left: number; width: number } => {
  const row = sample.closest('[data-index]');
  if (row instanceof HTMLElement && listRoot?.contains(row)) {
    const r = row.getBoundingClientRect();
    if (r.width >= 8 && r.height >= 1) {
      return { left: r.left, width: r.width };
    }
  }

  let best = sample.getBoundingClientRect();
  let node: HTMLElement | null = sample.parentElement;
  while (node && listRoot?.contains(node) && node !== listRoot) {
    const r = node.getBoundingClientRect();
    if (r.width > best.width + 0.5) best = r;
    node = node.parentElement;
  }
  if (best.width >= 8) {
    return { left: best.left, width: best.width };
  }

  const maxW = Math.min(MESSAGE_COLUMN_MAX_WIDTH_PX, Math.max(0, scrollR.width - 24));
  return {
    left: scrollR.left + (scrollR.width - maxW) / 2,
    width: maxW,
  };
};

/** In-list first-user row top within this band of the scroll viewport top → portaled duplicate hidden */
const STICKY_HIDE_AT_TOP_TOLERANCE_PX = 40;

/**
 * Hide sticky when the paired user is the **first** user in the thread and that message row is still
 * visible at the top of the scroll area (no need to duplicate it).
 */
const shouldHideStickyDuplicateAtTop = (
  scroll: HTMLElement,
  listRoot: HTMLElement | null,
  pairedUserId: string | null,
  thread: MessageRow[],
): boolean => {
  if (!pairedUserId || !listRoot) return false;
  const firstUser = thread.find(m => m.role === 'user' && m.id != null);
  if (!firstUser || String(firstUser.id) !== pairedUserId) return false;

  const el = listRoot.querySelector(
    `[data-message-role="user"][data-message-id="${CSS.escape(pairedUserId)}"]`,
  ) as HTMLElement | null;
  if (!el) return false;

  const scrollR = scroll.getBoundingClientRect();
  const msgR = el.getBoundingClientRect();
  if (msgR.top < scrollR.top - 8) return false;
  return msgR.top <= scrollR.top + STICKY_HIDE_AT_TOP_TOLERANCE_PX;
};

type MessageRow = { id?: string; role?: string; content?: unknown };

const summarizeMessageContent = (content: unknown): string => {
  if (typeof content === 'string') return content.trim().slice(0, 200);
  if (!Array.isArray(content)) return '';
  return content
    .filter((x: { type?: string }) => x?.type === 'text')
    .map((x: { text?: string }) => x.text || '')
    .join(' ')
    .trim()
    .slice(0, 200);
};

/** User message that precedes this assistant in thread order (messages array). */
const findPairedUserMessage = (
  thread: MessageRow[],
  assistantId: string | null,
): { id: string; preview: string } | null => {
  if (!assistantId || thread.length === 0) return null;
  const idx = thread.findIndex(m => m?.id != null && String(m.id) === assistantId);
  if (idx <= 0) return null;
  for (let i = idx - 1; i >= 0; i--) {
    const m = thread[i];
    if (m?.role === 'user' && m.id != null) {
      return { id: String(m.id), preview: summarizeMessageContent(m.content) };
    }
  }
  return null;
};

/**
 * Same user “turn” can include multiple `role:assistant` messages (e.g. after tools). Finds which user’s
 * block (messages until the next user) contains `assistantId`.
 */
const findPairedUserIdForAssistantInThread = (thread: MessageRow[], assistantId: string | null): string | null => {
  if (!assistantId || thread.length === 0) return null;
  for (let i = 0; i < thread.length; i++) {
    if (thread[i]?.role !== 'user' || thread[i].id == null) continue;
    const uid = String(thread[i].id);
    for (let j = i + 1; j < thread.length; j++) {
      const m = thread[j];
      if (m?.role === 'user') break;
      if (m?.role === 'assistant' && m.id != null && String(m.id) === assistantId) {
        return uid;
      }
    }
  }
  return null;
};

/** First assistant after this user in thread order — recovers sticky when hit-test misses after prepend/layout. */
const getAssistantIdFollowingUser = (thread: MessageRow[], userId: string): string | null => {
  const idx = thread.findIndex(m => m.role === 'user' && m.id != null && String(m.id) === userId);
  if (idx < 0) return null;
  for (let i = idx + 1; i < thread.length; i++) {
    const m = thread[i];
    if (m?.role === 'assistant' && m.id != null) {
      return String(m.id);
    }
  }
  return null;
};

/** Extra Virtua rows above/below the visible index range to scan (padding). */
const PROBE_ROW_MARGIN = 6;

/**
 * When the scroll root is transformed off-screen or layout is mid-transition, `getBoundingClientRect`
 * can be huge/negative; probing then pairs the wrong user (e.g. lock-retain + fresh thread slice).
 */
const isStickyProbeScrollLayoutSane = (r: DOMRect, win: Window | null): boolean => {
  if (!Number.isFinite(r.top) || !Number.isFinite(r.height) || !Number.isFinite(r.width)) return false;
  if (r.width < 16 || r.height < 24) return false;
  if (r.bottom < r.top + 8) return false;
  const ih = win?.innerHeight ?? 900;
  if (r.top < -ih) return false;
  if (r.height > ih * 2.5) return false;
  if (r.bottom > ih * 3) return false;
  return true;
};

/**
 * Inner Virtua scroll node often reports insane rects during prepend; the outer chat shell
 * (`data-load-more-scroll` wrapper) usually stays sane — use it for fixed portal Y/width.
 */
const resolveStickyViewportRect = (
  anchorEl: HTMLElement,
  viewportShell: HTMLElement | null,
  lastSane: DOMRect | null,
  win: Window | null,
): DOMRect => {
  const live = anchorEl.getBoundingClientRect();
  if (isStickyProbeScrollLayoutSane(live, win)) {
    return live;
  }
  if (viewportShell != null && viewportShell.contains(anchorEl)) {
    const shellR = viewportShell.getBoundingClientRect();
    if (isStickyProbeScrollLayoutSane(shellR, win)) {
      return shellR;
    }
  }
  if (lastSane != null) {
    return lastSane;
  }
  return live;
};

/** When screen rects are nonsense, Virtua scroll metrics + row indices may still be valid. */
const isScrollClientDimensionsUsable = (scroll: HTMLElement): boolean => {
  const h = scroll.clientHeight;
  const w = scroll.clientWidth;
  return Number.isFinite(h) && Number.isFinite(w) && h >= 24 && w >= 16 && h < 32000 && w < 32000;
};

/**
 * Approximate “under sticky header” using scroll offset only (no getBoundingClientRect on scroll).
 * Uses {@link VirtualizerHandle.findItemIndex} / viewportSize from Virtua.
 */
const VIRTUA_STICKY_PROBE_TOP_INSET_PX = 72;

const virtuaVisibleRowIndexRange = (
  v: VirtualizerHandle,
  scrollTopPx: number,
  itemCount: number,
  margin: number,
): { from: number; to: number } => {
  const vp = Math.max(1, v.viewportSize);
  const iA = v.findItemIndex(scrollTopPx);
  const iB = v.findItemIndex(scrollTopPx + vp - 1);
  const iLo = Math.min(iA, iB);
  const iHi = Math.max(iA, iB);
  return {
    from: Math.max(0, iLo - margin),
    to: Math.min(itemCount - 1, iHi + margin),
  };
};

/** Per Virtua row: role/id from Copilot message slots (`props.message`), no DOM. */
type VirtuaSlotMeta = { role: string | null; messageId: string | null };

const extractVirtuaSlotMeta = (el: React.ReactElement): VirtuaSlotMeta => {
  if (!React.isValidElement(el)) {
    return { role: null, messageId: null };
  }
  const p = el.props as { message?: { id?: unknown; role?: string } };
  const msg = p.message;
  if (msg != null && msg.role != null && msg.id != null) {
    return { role: String(msg.role), messageId: String(msg.id) };
  }
  return { role: null, messageId: null };
};

const buildVirtuaSlotMetas = (elements: readonly React.ReactElement[]): VirtuaSlotMeta[] =>
  elements.map(extractVirtuaSlotMeta);

/**
 * Pick which assistant message is “under” the sticky header using only Virtua scroll offsets + slot metas
 * (mirrors the old DOM window + anchor logic, without querying rows).
 */
const findStickyAssistantIdFromVirtuaModel = (
  v: VirtualizerHandle,
  scrollTopPx: number,
  itemCount: number,
  metas: readonly VirtuaSlotMeta[],
): { assistantId: string; slotIndex: number } | null => {
  if (itemCount <= 0 || metas.length !== itemCount) return null;
  const { from, to } = virtuaVisibleRowIndexRange(v, scrollTopPx, itemCount, PROBE_ROW_MARGIN);
  const anchorOff = scrollTopPx + VIRTUA_STICKY_PROBE_TOP_INSET_PX;
  const anchorIdx = Math.max(0, Math.min(itemCount - 1, v.findItemIndex(anchorOff)));

  let bestIdx = Infinity;
  let bestId: string | null = null;
  for (let i = from; i <= to; i++) {
    const m = metas[i];
    if (m.role !== 'assistant' || !m.messageId) continue;
    if (i < anchorIdx) continue;
    if (i < bestIdx) {
      bestIdx = i;
      bestId = m.messageId;
    }
  }
  if (bestId != null) return { assistantId: bestId, slotIndex: bestIdx };

  bestIdx = Infinity;
  bestId = null;
  for (let i = from; i <= to; i++) {
    const m = metas[i];
    if (m.role !== 'assistant' || !m.messageId) continue;
    if (i < bestIdx) {
      bestIdx = i;
      bestId = m.messageId;
    }
  }
  return bestId != null ? { assistantId: bestId, slotIndex: bestIdx } : null;
};

/**
 * When metas miss (unusual slots) but Virtua rows are mounted, read assistant id from the row DOM.
 * Same index window + anchor rules as {@link findStickyAssistantIdFromVirtuaModel}.
 */
const findStickyAssistantIdFromDomWindow = (
  listRoot: HTMLElement,
  v: VirtualizerHandle,
  scrollTopPx: number,
  itemCount: number,
): { assistantId: string; slotIndex: number } | null => {
  if (itemCount <= 0) return null;
  const { from, to } = virtuaVisibleRowIndexRange(v, scrollTopPx, itemCount, PROBE_ROW_MARGIN);
  const anchorOff = scrollTopPx + VIRTUA_STICKY_PROBE_TOP_INSET_PX;
  const anchorIdx = Math.max(0, Math.min(itemCount - 1, v.findItemIndex(anchorOff)));

  const pickFrom = (requireAnchor: boolean): { assistantId: string; slotIndex: number } | null => {
    let bestIdx = Infinity;
    let bestId: string | null = null;
    for (let i = from; i <= to; i++) {
      const row = listRoot.querySelector(`[data-index="${i}"]`);
      const a = row?.querySelector('[data-message-role="assistant"]');
      if (!(a instanceof HTMLElement)) continue;
      const id = a.getAttribute('data-message-id');
      if (!id) continue;
      if (requireAnchor && i < anchorIdx) continue;
      if (i < bestIdx) {
        bestIdx = i;
        bestId = id;
      }
    }
    return bestId != null && Number.isFinite(bestIdx) ? { assistantId: bestId, slotIndex: bestIdx } : null;
  };

  return pickFrom(true) ?? pickFrom(false);
};

/**
 * Scroll port for Virtua + `scrollTop` — must match the node Copilot / StickToBottom actually drives.
 * Copilot v2 `ScrollView` wraps messages in `use-stick-to-bottom`: `scrollRef` is the **outer** Content
 * wrapper; an inner sibling often has `overflow-y-scroll` too. Walking up and taking the **first**
 * scrollable ancestor binds Virtua to the inner node while `scrollTop` + scroll events track the outer
 * port (probe + pink outline freeze). We therefore pick the **outermost** scrollable ancestor under chat.
 */
const resolveVirtuaScrollElement = (
  listRoot: HTMLElement | null,
  shellRoot: HTMLElement | null,
): HTMLElement | null => {
  if (!listRoot) return null;

  const withinShell = (el: HTMLElement | null) => el != null && (shellRoot == null || shellRoot.contains(el));

  const pickOutermostScrollable = (
    boundary: HTMLElement | null,
    requireOverflowingContent: boolean,
  ): HTMLElement | null => {
    if (!boundary) return null;
    let best: HTMLElement | null = null;
    let el: HTMLElement | null = listRoot.parentElement;
    while (el && boundary.contains(el)) {
      const style = getComputedStyle(el);
      const yScroll = style.overflowY === 'auto' || style.overflowY === 'scroll';
      if (yScroll && (!requireOverflowingContent || el.scrollHeight > el.clientHeight + 1)) {
        best = el;
      }
      el = el.parentElement;
    }
    return best;
  };

  const chatRoot =
    listRoot.closest<HTMLElement>('[data-copilotkit]') ?? listRoot.closest<HTMLElement>('[data-testid="copilot-chat"]');

  let found = chatRoot != null ? pickOutermostScrollable(chatRoot, true) : null;
  if (found == null && chatRoot != null) {
    found = pickOutermostScrollable(chatRoot, false);
  }
  if (found == null) {
    found = pickOutermostScrollable(shellRoot, true);
  }
  if (found == null) {
    found = pickOutermostScrollable(shellRoot, false);
  }
  if (found != null) return found;

  if (shellRoot?.contains(listRoot)) {
    const hints = Array.from(
      shellRoot.querySelectorAll<HTMLElement>(
        '.copilot-chat-container .overflow-y-auto, .copilot-chat-container .overflow-y-scroll, .overflow-y-auto, .overflow-y-scroll',
      ),
    );
    let hintBest: HTMLElement | null = null;
    for (const c of hints) {
      if (!c.contains(listRoot) || !isScrollClientDimensionsUsable(c)) continue;
      if (hintBest == null) {
        hintBest = c;
        continue;
      }
      if (hintBest.contains(c)) continue;
      if (c.contains(hintBest)) hintBest = c;
    }
    if (hintBest != null) return hintBest;
  }

  return null;
};

type VirtualizedMessageViewContentVirtuaProps = {
  messageElements: React.ReactElement[];
  messages: Array<{ id?: string; role?: string }>;
  isRunning: boolean;
  interruptElement: React.ReactNode;
};

/**
 * Pins the duplicate user message to the top edge of the chat scroll viewport.
 * `position: sticky` fails here (Copilot flex + display:contents + external scrollRef);
 * fixed + getBoundingClientRect tracks the real scroll container on screen.
 */
const StickyUserMessagePortal = ({
  anchorEl,
  listRootRef,
  viewportShellRef,
  message,
  onGeometryChange,
  portalHidden,
  layoutBust,
}: {
  anchorEl: HTMLElement;
  listRootRef: React.RefObject<HTMLDivElement | null>;
  /** Outer chat column (`data-load-more-scroll`) — stable rect when inner scroller is insane. */
  viewportShellRef?: React.RefObject<HTMLDivElement | null> | null;
  /** `null` = no paired user this frame; portal shell stays mounted, inner empty. */
  message: UserMessage | null;
  /** Fires after sticky shell layout — used to re-run Virtua pairing (no DOM rect passed; inner layout can be insane). */
  onGeometryChange?: () => void;
  /** Hide duplicate at top or idle: keep portal mounted; suppress geometry for probe. */
  portalHidden?: boolean;
  /** Increment when load-more banner toggles / layout settles — drops stale anchor fallbacks. */
  layoutBust?: number;
}): React.ReactPortal | null => {
  const { isLight } = useStorage(themeStorage);
  /** Column position/size only — `top` always comes from the live anchor rect so load-more / layout can’t strand a stale Y. */
  const [box, setBox] = React.useState<{ left: number; width: number } | null>(null);
  const stickyRootRef = React.useRef<HTMLDivElement | null>(null);

  /** Anchor rect when layout was last plausible — avoids fixed portal at y≈-16k during Virtua prepend/transform. */
  const lastSaneAnchorRectRef = React.useRef<DOMRect | null>(null);
  /** Last rounded anchor `top` from measure — trigger re-render when only Y shifts (column unchanged). */
  const anchorTopMeasuredRef = React.useRef<number | null>(null);
  const measureRetryRafRef = React.useRef(0);
  const insaneMeasureAttemptsRef = React.useRef(0);

  const setStickyRootEl = React.useCallback((node: HTMLDivElement | null) => {
    stickyRootRef.current = node;
  }, []);

  const measure = React.useCallback(() => {
    const win = anchorEl.ownerDocument.defaultView;
    const shellEl = viewportShellRef?.current ?? null;
    const scrollR = resolveStickyViewportRect(anchorEl, shellEl, lastSaneAnchorRectRef.current, win);
    if (!isStickyProbeScrollLayoutSane(scrollR, win)) {
      if (insaneMeasureAttemptsRef.current < 40 && measureRetryRafRef.current === 0) {
        insaneMeasureAttemptsRef.current += 1;
        measureRetryRafRef.current = requestAnimationFrame(() => {
          measureRetryRafRef.current = 0;
          measure();
        });
      }
      return;
    }
    insaneMeasureAttemptsRef.current = 0;
    lastSaneAnchorRectRef.current = scrollR;
    const listRoot = listRootRef.current;
    let left = scrollR.left;
    let width = scrollR.width;

    const msgId = message?.id != null ? String(message.id) : '';
    let sample: HTMLElement | null = null;
    if (msgId && listRoot) {
      sample = listRoot.querySelector(
        `[data-message-role="user"][data-message-id="${CSS.escape(msgId)}"]`,
      ) as HTMLElement | null;
    }
    if (!sample && listRoot) {
      sample = listRoot.querySelector('[data-message-role="user"]') as HTMLElement | null;
    }
    if (!sample && listRoot) {
      sample = listRoot.querySelector('[data-message-role="assistant"]') as HTMLElement | null;
    }
    if (sample) {
      const col = getStickyColumnRect(sample, listRoot, scrollR);
      if (col.width >= 8) {
        left = col.left;
        width = col.width;
      }
    } else {
      const maxW = Math.min(MESSAGE_COLUMN_MAX_WIDTH_PX, Math.max(0, scrollR.width - 24));
      width = maxW;
      left = scrollR.left + (scrollR.width - maxW) / 2;
    }

    const next = { left, width };
    const topRounded = Math.round(scrollR.top);
    const topMoved = anchorTopMeasuredRef.current === null || anchorTopMeasuredRef.current !== topRounded;
    anchorTopMeasuredRef.current = topRounded;

    setBox(prev => {
      const sameCol =
        prev != null &&
        Math.round(prev.left) === Math.round(next.left) &&
        Math.round(prev.width) === Math.round(next.width);
      if (sameCol && !topMoved) {
        return prev;
      }
      return next;
    });
  }, [anchorEl, listRootRef, message?.id, viewportShellRef]);

  const prevLayoutBustRef = React.useRef(0);
  React.useLayoutEffect(() => {
    const b = layoutBust ?? 0;
    if (b === prevLayoutBustRef.current) return;
    prevLayoutBustRef.current = b;
    if (b === 0) return;
    lastSaneAnchorRectRef.current = null;
    anchorTopMeasuredRef.current = null;
    insaneMeasureAttemptsRef.current = 0;
    measure();
  }, [layoutBust, measure]);

  React.useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    ro.observe(anchorEl);
    const lr = listRootRef.current;
    if (lr) ro.observe(lr);
    window.addEventListener('resize', measure);
    const scrollOpts = { passive: true } as const;
    const scrollCleanups: (() => void)[] = [];
    // Do NOT listen on anchorEl: chat scroll fires continuously and would re-render every frame.
    let node: HTMLElement | null = anchorEl.parentElement;
    while (node) {
      const el = node;
      el.addEventListener('scroll', measure, scrollOpts);
      scrollCleanups.push(() => el.removeEventListener('scroll', measure));
      node = node.parentElement;
    }
    return () => {
      if (measureRetryRafRef.current !== 0) {
        cancelAnimationFrame(measureRetryRafRef.current);
        measureRetryRafRef.current = 0;
      }
      ro.disconnect();
      window.removeEventListener('resize', measure);
      scrollCleanups.forEach(fn => fn());
    };
  }, [anchorEl, listRootRef, measure]);

  const reportGeometry = React.useCallback(() => {
    if (portalHidden) return;
    const el = stickyRootRef.current;
    if (el && onGeometryChange) {
      onGeometryChange();
    }
  }, [onGeometryChange, portalHidden]);

  React.useLayoutEffect(() => {
    reportGeometry();
  }, [box, message, reportGeometry, portalHidden]);

  React.useLayoutEffect(() => {
    const el = stickyRootRef.current;
    if (!el || !onGeometryChange) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(reportGeometry);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onGeometryChange, reportGeometry, box]);

  const themeClass = isLight ? 'virtua-sticky-theme-light' : 'virtua-sticky-theme-dark';

  /** CopilotKit theme vars are often defined only under `.copilot-chat-container`; portal may sit outside that subtree. */
  const stickyPortalThemeVars = (
    isLight
      ? { '--copilot-kit-secondary-color': '#f9fafb', '--copilot-kit-border-color': '#e5e7eb' }
      : { '--copilot-kit-secondary-color': '#151C24', '--copilot-kit-border-color': '#374151' }
  ) as React.CSSProperties;

  /** Body would stack above SessionHeader / header dropdowns; keep portal inside the chat column. */
  const portalContainer =
    anchorEl.closest<HTMLElement>('[data-load-more-scroll]') ??
    viewportShellRef?.current ??
    anchorEl.ownerDocument.body;

  const winForBox = anchorEl.ownerDocument.defaultView;
  const shellForBox = viewportShellRef?.current ?? null;
  const scrollRForBox = resolveStickyViewportRect(anchorEl, shellForBox, lastSaneAnchorRectRef.current, winForBox);
  if (isStickyProbeScrollLayoutSane(scrollRForBox, winForBox)) {
    lastSaneAnchorRectRef.current = scrollRForBox;
  }
  const fallbackW = Math.min(MESSAGE_COLUMN_MAX_WIDTH_PX, Math.max(0, scrollRForBox.width - 24));
  const effectiveTop = scrollRForBox.top;
  const effectiveLeft = box && box.width > 0 ? box.left : scrollRForBox.left + (scrollRForBox.width - fallbackW) / 2;
  const effectiveWidth = box && box.width > 0 ? box.width : fallbackW;

  return createPortal(
    <div
      ref={setStickyRootEl}
      data-virtua-sticky-portal
      className={`sticky-message-header sticky-message-header--virtua-fixed ${themeClass}`}
      style={{
        ...stickyPortalThemeVars,
        position: 'fixed',
        top: effectiveTop,
        left: effectiveLeft,
        width: effectiveWidth,
        zIndex: Z_INDEX.virtuaStickyUserHeaderPortal,
        visibility: portalHidden ? 'hidden' : 'visible',
        pointerEvents: portalHidden ? 'none' : 'auto',
      }}
      aria-hidden={portalHidden ? true : undefined}
      role="presentation">
      <div className="virtua-sticky-portal-inner">
        {message ? <CustomUserMessageV2 key={String(message.id ?? '')} message={message} virtuaStickyPortal /> : null}
      </div>
    </div>,
    portalContainer,
  );
};

export const VirtualizedMessageViewContentVirtua = ({
  messageElements,
  messages,
  isRunning,
  interruptElement,
}: VirtualizedMessageViewContentVirtuaProps): React.JSX.Element => {
  const sessionId = useChatSessionIdSafe();
  /** False when this session is mounted but hidden (multi-tab cache); sticky is portaled to body. */
  const virtuaChatVisible = useVirtuaChatSessionVisible();
  const virtuaChatVisibleRef = React.useRef(virtuaChatVisible);
  virtuaChatVisibleRef.current = virtuaChatVisible;
  const loadMoreActive = useLoadMoreHistoryActive();
  const scrollShellRef = useScrollContainerRef();
  const [stickyPortalLayoutBust, setStickyPortalLayoutBust] = React.useState(0);
  const listContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollElementRef = React.useRef<HTMLElement | null>(null);
  const virtualizerRef = React.useRef<VirtualizerHandle | null>(null);
  const messageCountRef = React.useRef(0);
  const messageElementsRef = React.useRef(messageElements);
  const isAutoScrollingRef = React.useRef(false);
  const messagesRef = React.useRef(messages);
  const [scrollElement, setScrollElement] = React.useState<HTMLElement | null>(null);
  const [probePairedUserId, setProbePairedUserId] = React.useState<string | null>(null);
  const [hideStickyDuplicateAtTop, setHideStickyDuplicateAtTop] = React.useState(false);
  const probePairedUserIdRef = React.useRef<string | null>(null);
  probePairedUserIdRef.current = probePairedUserId;

  const assistantProbeRafRef = React.useRef(0);
  /** When true, the current rAF batch must run at least one more probe (geometry/scroll coalesced). */
  const probeReschedulePendingRef = React.useRef(false);
  const prevSessionForStickyRef = React.useRef<string | null>(null);
  const stickyProbeThreadDigestRef = React.useRef<string>('');
  /** Single pending rAF when virtualizer/list isn’t ready yet. */
  const stickyProbeLayoutRetryRafRef = React.useRef(0);
  /** Latest `scheduleAssistantBelowStickyProbe` for stable `runAssistantBelowStickyProbe` ([] deps). */
  const scheduleAssistantProbeRef = React.useRef<() => void>(() => {});
  /** After load-more, allow N sticky geometry callbacks to re-run the probe (paired mode normally skips). */
  const stickyGeometryResyncRemainingRef = React.useRef(0);
  /** Remount Virtua if the real scroll node identity changes (rare); Virtua only binds `scrollRef` on mount. */
  const [virtuaScrollBindingEpoch, setVirtuaScrollBindingEpoch] = React.useState(0);

  messageCountRef.current = messageElements.length;
  messageElementsRef.current = messageElements;

  const attachCopilotMessageListRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      // React calls with `null` when swapping fallback → Virtua list roots. Clearing `scrollElement` there
      // flipped `useFallback` back on and thrashed mounts — Virtua never stayed bound, probe froze.
      if (!node) {
        listContainerRef.current = null;
        return;
      }
      listContainerRef.current = node;
      const found = resolveVirtuaScrollElement(node, scrollShellRef?.current ?? null);
      const prev = scrollElementRef.current;
      scrollElementRef.current = found;
      setScrollElement(prevEl => (prevEl === found ? prevEl : found));
      if (prev != null && found != null && prev !== found) {
        setVirtuaScrollBindingEpoch(e => e + 1);
      }
    },
    [scrollShellRef],
  );

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    if (messages.length === 0) {
      setProbePairedUserId(null);
      setHideStickyDuplicateAtTop(false);
    }
  }, [messages.length]);

  React.useEffect(() => {
    if (sessionId === null) return;
    if (prevSessionForStickyRef.current !== null && prevSessionForStickyRef.current !== sessionId) {
      setProbePairedUserId(null);
      setHideStickyDuplicateAtTop(false);
    }
    prevSessionForStickyRef.current = sessionId;
  }, [sessionId]);

  const pairedStickyUser = React.useMemo(() => {
    if (!probePairedUserId) return null;
    const msg = messages.find(m => m.role === 'user' && String(m.id) === probePairedUserId);
    return msg ? (msg as UserMessage) : null;
  }, [probePairedUserId, messages]);

  /** Thread lookup can miss one frame (streaming / parent batching); keep last good row to avoid portal unmount. */
  const latchedStickyUserRef = React.useRef<UserMessage | null>(null);
  React.useLayoutEffect(() => {
    if (pairedStickyUser) {
      latchedStickyUserRef.current = pairedStickyUser;
    } else if (probePairedUserId === null) {
      latchedStickyUserRef.current = null;
    }
  }, [pairedStickyUser, probePairedUserId]);

  const realStickyUser =
    pairedStickyUser ??
    (probePairedUserId != null &&
    latchedStickyUserRef.current &&
    String(latchedStickyUserRef.current.id) === probePairedUserId
      ? latchedStickyUserRef.current
      : null);

  /** Portal stays mounted for whole Virtua session; visibility tracks paired user + hide-at-top. */
  const stickyPortalHidden = hideStickyDuplicateAtTop || realStickyUser === null;

  const runAssistantBelowStickyProbe = React.useCallback(() => {
    if (!virtuaChatVisibleRef.current) {
      return;
    }
    const scroll = scrollElementRef.current;
    if (!scroll || messageCountRef.current <= 0) {
      setProbePairedUserId(prev => (prev !== null ? null : prev));
      setHideStickyDuplicateAtTop(false);
      return;
    }

    const win = scroll.ownerDocument.defaultView;
    const scrollLayoutRect = scroll.getBoundingClientRect();
    const layoutScreenSane = isStickyProbeScrollLayoutSane(scrollLayoutRect, win);

    const v = virtualizerRef.current;
    const listRoot = listContainerRef.current;
    const itemCount = messageCountRef.current;
    const metas = buildVirtuaSlotMetas(messageElementsRef.current);
    const metasAligned = metas.length === itemCount;
    const canUseVirtuaCore = v != null && listRoot != null && isScrollClientDimensionsUsable(scroll) && itemCount > 0;

    if (!canUseVirtuaCore) {
      if (stickyProbeLayoutRetryRafRef.current === 0) {
        stickyProbeLayoutRetryRafRef.current = requestAnimationFrame(() => {
          stickyProbeLayoutRetryRafRef.current = 0;
          scheduleAssistantProbeRef.current();
        });
      }
      return;
    }

    const thread = messagesRef.current as MessageRow[];
    const stVirt = scroll.scrollTop;
    const { from, to } = virtuaVisibleRowIndexRange(v, stVirt, itemCount, PROBE_ROW_MARGIN);

    let picked = metasAligned ? findStickyAssistantIdFromVirtuaModel(v, stVirt, itemCount, metas) : null;
    if (!picked) {
      picked = findStickyAssistantIdFromDomWindow(listRoot, v, stVirt, itemCount);
    }
    let stickyAssistantId: string | null = picked?.assistantId ?? null;

    if (!stickyAssistantId) {
      const pairedUid = probePairedUserIdRef.current;
      if (pairedUid) {
        const assistId = getAssistantIdFollowingUser(thread, pairedUid);
        if (assistId) {
          let idx = metasAligned ? metas.findIndex(m => m.role === 'assistant' && m.messageId === assistId) : -1;
          if (idx < 0) {
            for (let i = from; i <= to; i++) {
              const row = listRoot.querySelector(`[data-index="${i}"]`);
              const hit = row?.querySelector(
                `[data-message-role="assistant"][data-message-id="${CSS.escape(assistId)}"]`,
              );
              if (hit) {
                idx = i;
                break;
              }
            }
          }
          if (idx >= from && idx <= to) {
            stickyAssistantId = assistId;
          }
        }
      }
    }

    let nextPairedId: string | null = null;

    if (stickyAssistantId) {
      const blockUid = findPairedUserIdForAssistantInThread(thread, stickyAssistantId);
      if (blockUid) {
        nextPairedId = blockUid;
      }
      if (nextPairedId == null) {
        const pairedUser = findPairedUserMessage(thread, stickyAssistantId);
        if (pairedUser?.id != null) {
          nextPairedId = String(pairedUser.id);
        }
      }
      setProbePairedUserId(prev => (prev === nextPairedId ? prev : nextPairedId));
    } else {
      setProbePairedUserId(prev => (prev !== null ? null : prev));
    }

    const hideDup = layoutScreenSane && shouldHideStickyDuplicateAtTop(scroll, listRoot, nextPairedId, thread);
    setHideStickyDuplicateAtTop(prev => (prev === hideDup ? prev : hideDup));
  }, []);

  const scheduleAssistantBelowStickyProbe = React.useCallback(() => {
    probeReschedulePendingRef.current = true;
    if (assistantProbeRafRef.current !== 0) return;
    assistantProbeRafRef.current = requestAnimationFrame(() => {
      do {
        probeReschedulePendingRef.current = false;
        runAssistantBelowStickyProbe();
      } while (probeReschedulePendingRef.current);
      assistantProbeRafRef.current = 0;
    });
  }, [runAssistantBelowStickyProbe]);
  scheduleAssistantProbeRef.current = scheduleAssistantBelowStickyProbe;

  const prevLoadMoreActiveRef = React.useRef<boolean | undefined>(undefined);
  React.useEffect(() => {
    if (prevLoadMoreActiveRef.current === undefined) {
      prevLoadMoreActiveRef.current = loadMoreActive;
      return;
    }
    if (prevLoadMoreActiveRef.current === loadMoreActive) return;
    prevLoadMoreActiveRef.current = loadMoreActive;
    stickyGeometryResyncRemainingRef.current = 4;
    setStickyPortalLayoutBust(n => n + 1);
    scheduleAssistantBelowStickyProbe();
    requestAnimationFrame(() => {
      scheduleAssistantBelowStickyProbe();
      requestAnimationFrame(() => scheduleAssistantBelowStickyProbe());
    });
  }, [loadMoreActive, scheduleAssistantBelowStickyProbe]);

  React.useEffect(() => {
    if (virtuaChatVisible) {
      scheduleAssistantBelowStickyProbe();
      return;
    }
    if (assistantProbeRafRef.current !== 0) {
      cancelAnimationFrame(assistantProbeRafRef.current);
      assistantProbeRafRef.current = 0;
    }
    if (stickyProbeLayoutRetryRafRef.current !== 0) {
      cancelAnimationFrame(stickyProbeLayoutRetryRafRef.current);
      stickyProbeLayoutRetryRafRef.current = 0;
    }
    probeReschedulePendingRef.current = false;
    setProbePairedUserId(null);
    setHideStickyDuplicateAtTop(false);
    latchedStickyUserRef.current = null;
  }, [virtuaChatVisible, scheduleAssistantBelowStickyProbe]);

  const onStickyGeometryChange = React.useCallback(() => {
    let allowProbe = probePairedUserIdRef.current == null;
    if (!allowProbe && stickyGeometryResyncRemainingRef.current > 0) {
      stickyGeometryResyncRemainingRef.current -= 1;
      allowProbe = true;
    }
    if (allowProbe) {
      scheduleAssistantBelowStickyProbe();
    }
  }, [scheduleAssistantBelowStickyProbe]);

  React.useEffect(() => {
    if (!scrollElement) return;
    const onScroll = () => {
      scheduleAssistantBelowStickyProbe();
    };
    scrollElement.addEventListener('scroll', onScroll, { passive: true });
    scheduleAssistantBelowStickyProbe();
    return () => {
      scrollElement.removeEventListener('scroll', onScroll);
      if (assistantProbeRafRef.current !== 0) {
        cancelAnimationFrame(assistantProbeRafRef.current);
        assistantProbeRafRef.current = 0;
      }
      if (stickyProbeLayoutRetryRafRef.current !== 0) {
        cancelAnimationFrame(stickyProbeLayoutRetryRafRef.current);
        stickyProbeLayoutRetryRafRef.current = 0;
      }
      probeReschedulePendingRef.current = false;
    };
  }, [scrollElement, scheduleAssistantBelowStickyProbe]);

  /** Prepend / load-more changes height; StickToBottom may adjust scroll without a scroll event — re-probe. */
  const resizeProbeRafRef = React.useRef(0);
  React.useLayoutEffect(() => {
    const root = listContainerRef.current;
    const scroller = scrollElement;
    if (!root || !scroller) return;
    const schedule = () => {
      if (resizeProbeRafRef.current !== 0) return;
      resizeProbeRafRef.current = requestAnimationFrame(() => {
        resizeProbeRafRef.current = 0;
        scheduleAssistantBelowStickyProbe();
      });
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    ro.observe(scroller);
    return () => {
      ro.disconnect();
      if (resizeProbeRafRef.current !== 0) {
        cancelAnimationFrame(resizeProbeRafRef.current);
        resizeProbeRafRef.current = 0;
      }
    };
  }, [scrollElement, scheduleAssistantBelowStickyProbe]);

  React.useEffect(
    () => () => {
      if (assistantProbeRafRef.current !== 0) {
        cancelAnimationFrame(assistantProbeRafRef.current);
        assistantProbeRafRef.current = 0;
      }
      if (stickyProbeLayoutRetryRafRef.current !== 0) {
        cancelAnimationFrame(stickyProbeLayoutRetryRafRef.current);
        stickyProbeLayoutRetryRafRef.current = 0;
      }
      probeReschedulePendingRef.current = false;
    },
    [],
  );

  React.useLayoutEffect(() => {
    const node = listContainerRef.current;
    if (!node) return;
    const found = resolveVirtuaScrollElement(node, scrollShellRef?.current ?? null);
    const prev = scrollElementRef.current;
    if (found === prev) return;
    scrollElementRef.current = found;
    setScrollElement(found);
    if (prev != null && found != null && prev !== found) {
      setVirtuaScrollBindingEpoch(e => e + 1);
    }
  }, [messageElements.length, loadMoreActive, scrollShellRef]);

  const registerScrollToBottom = useRegisterScrollToBottom();
  React.useEffect(() => {
    const scrollToBottom = () => {
      const lastIndex = messageCountRef.current - 1;
      if (lastIndex < 0) return;
      const v = virtualizerRef.current;
      const el = scrollElementRef.current;
      isAutoScrollingRef.current = true;
      if (v) {
        v.scrollToIndex(lastIndex, { smooth: false });
      } else if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      }
      window.setTimeout(() => {
        isAutoScrollingRef.current = false;
        scrollElementRef.current?.dispatchEvent(new Event('scroll', { bubbles: true }));
      }, AUTO_SCROLL_FLAG_MS);
    };
    return registerScrollToBottom(scrollToBottom);
  }, [registerScrollToBottom]);

  // When messages are prepended (load-more history), scroll to restore position.
  // Strategy: track first-message-ID to detect prepend, and use ELEMENT count delta
  // as the scrollToIndex target — element indices map 1:1 to Virtua's rendered list.
  // Deps use [firstMessageId, messageElements.length] so this only fires on structural
  // changes, not on every streaming render.
  const prevFirstMsgIdRef = React.useRef<string | undefined>(undefined);
  const prevElementCountRef = React.useRef(0);
  const firstMessageId = messages[0]?.id;
  React.useLayoutEffect(() => {
    const prevFirstId = prevFirstMsgIdRef.current;
    const prevCount = prevElementCountRef.current;
    prevFirstMsgIdRef.current = firstMessageId;
    prevElementCountRef.current = messageElements.length;
    if (prevFirstId === undefined || prevFirstId === firstMessageId) return;
    scheduleAssistantBelowStickyProbe();
    const addedElements = messageElements.length - prevCount;
    if (addedElements > 0) {
      isAutoScrollingRef.current = true;
      virtualizerRef.current?.scrollToIndex(addedElements, { smooth: false });
      window.setTimeout(() => {
        isAutoScrollingRef.current = false;
        scrollElementRef.current?.dispatchEvent(new Event('scroll', { bubbles: true }));
      }, AUTO_SCROLL_FLAG_MS);
    }
  }, [firstMessageId, messageElements.length, scheduleAssistantBelowStickyProbe]);

  // Initial probe when thread / scroll container is ready (before first scroll event).
  React.useLayoutEffect(() => {
    if (!virtuaChatVisible) return;
    const el = scrollElementRef.current;
    if (!el || messageElements.length === 0 || !virtualizerRef.current) return;
    scheduleAssistantBelowStickyProbe();
  }, [virtuaChatVisible, scrollElement, messageElements.length, scheduleAssistantBelowStickyProbe]);

  // Re-probe when the **thread tail** changes (new turn / streaming). Prepend does not change tail.
  React.useLayoutEffect(() => {
    if (!virtuaChatVisible) return;
    const last = messages[messages.length - 1];
    const tailDigest = `${String(last?.id ?? '')}:${last?.role ?? ''}`;
    const prevTail = stickyProbeThreadDigestRef.current;
    if (tailDigest === prevTail) return;
    stickyProbeThreadDigestRef.current = tailDigest;
    scheduleAssistantBelowStickyProbe();
  }, [virtuaChatVisible, messages, scheduleAssistantBelowStickyProbe]);

  const showCursor = isRunning && messages[messages.length - 1]?.role !== 'reasoning';

  const keepMounted = React.useMemo(() => {
    const n = messageElements.length;
    const firstIndices = Array.from({ length: Math.min(KEEP_MOUNTED_FIRST, n) }, (_, i) => i);
    const lastStart = Math.max(KEEP_MOUNTED_FIRST, n - KEEP_MOUNTED_COUNT);
    const lastIndices = Array.from({ length: Math.max(0, n - lastStart) }, (_, i) => lastStart + i);
    return [...firstIndices, ...lastIndices];
  }, [messageElements.length]);

  const useFallback = !scrollElement || messageElements.length === 0;

  if (useFallback) {
    return (
      <div
        ref={attachCopilotMessageListRef}
        className="copilotKitMessages cpk:flex cpk:flex-col"
        style={{ overflowY: 'visible' }}
        data-testid="copilot-message-list-virtua-fallback">
        {messageElements.map((el, i) => (
          <div key={el?.key ?? i}>{el}</div>
        ))}
        {interruptElement}
        {showCursor && (
          <div className="cpk:mt-2">
            <CustomCursor />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        ref={attachCopilotMessageListRef}
        className="copilotKitMessages cpk:flex cpk:flex-col"
        style={{ overflowY: 'visible' }}
        data-testid="copilot-message-list-virtua">
        <Virtualizer
          key={virtuaScrollBindingEpoch}
          ref={virtualizerRef}
          data={messageElements}
          scrollRef={scrollElementRef as React.RefObject<HTMLElement | null>}
          bufferSize={BUFFER_SIZE}
          {...(ITEM_SIZE_HINT !== undefined && { itemSize: ITEM_SIZE_HINT })}
          keepMounted={keepMounted}
          shift={false}>
          {(el: React.ReactElement, i: number) => (
            <div key={el?.key ?? i} data-index={i}>
              {el}
            </div>
          )}
        </Virtualizer>
        {interruptElement}
        {showCursor && (
          <div className="cpk:mt-2">
            <CustomCursor />
          </div>
        )}
      </div>
      {virtuaChatVisible && scrollElement && messageElements.length > 0 ? (
        <StickyUserMessagePortal
          key={VIRTUA_STICKY_PORTAL_INSTANCE_KEY}
          anchorEl={scrollElement}
          listRootRef={listContainerRef}
          viewportShellRef={scrollShellRef ?? undefined}
          message={realStickyUser}
          onGeometryChange={onStickyGeometryChange}
          portalHidden={stickyPortalHidden}
          layoutBust={stickyPortalLayoutBust}
        />
      ) : null}
    </>
  );
};

export type { VirtualizedMessageViewContentVirtuaProps };
