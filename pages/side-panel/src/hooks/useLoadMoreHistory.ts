/**
 * useLoadMoreHistory Hook
 *
 * Paginated history loading for agent runs. Fetches older runs from the API,
 * converts events to messages, and merges with current messages.
 * Preserves scroll position when prepending older messages.
 */

import type * as React from 'react';
import { useCallback, useState, useEffect, useRef } from 'react';
import type { Message } from '@ag-ui/core';
import { applyPatch, type Operation } from 'fast-json-patch';
import { API_CONFIG } from '../constants';

const SCROLL_CONTAINER_SELECTOR = '.copilotKitMessagesContainer';

/** CopilotKit messages wrapper - has overflow-y: auto in CSS */
const SCROLL_CONTAINER_MESSAGES = '.copilotKitMessages';

/** Content div we mark explicitly (excludes loading indicator). Has overflow-y: auto via CSS. */
const SCROLL_CONTAINER_FALLBACK = '[data-load-more-scroll]';

/** CopilotKit may use overflow-y-auto on a wrapper */
const SCROLL_CONTAINER_OVERFLOW = '.overflow-y-auto';

/** Root runs loaded per "load more" request. */
export const LOAD_MORE_RUNS_LIMIT = 5;

/** Scroll distance from top (px) that triggers auto load more - triggers when scroll bar is close to top */
const SCROLL_TOP_THRESHOLD = 150;

function isScrollable(el: HTMLElement): boolean {
  const { scrollHeight, clientHeight } = el;
  return scrollHeight > clientHeight;
}

/** Find the element that actually scrolls (scrollHeight > clientHeight). May search within a candidate. */
function findScrollableWithin(root: HTMLElement): HTMLElement | null {
  const style = getComputedStyle(root);
  if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') return null;
  if (isScrollable(root)) return root;
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const found = findScrollableWithin(child);
    if (found) return found;
  }
  return null;
}

/** Collect all elements that could be scroll containers (overflow-y). Deduped. */
function collectScrollCandidates(container: HTMLElement | null): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const add = (el: HTMLElement | null) => {
    if (el instanceof HTMLElement && !seen.has(el)) {
      seen.add(el);
      candidates.push(el);
    }
  };

  const collect = (root: HTMLElement) => {
    const els = [
      root.querySelector(SCROLL_CONTAINER_SELECTOR),
      root.querySelector(SCROLL_CONTAINER_MESSAGES),
      root.querySelector(SCROLL_CONTAINER_FALLBACK),
      root.querySelector(SCROLL_CONTAINER_OVERFLOW),
    ];
    for (const el of els) add(el as HTMLElement | null);
    // Walk for any overflow-y
    const walk = (node: Element) => {
      if (!(node instanceof HTMLElement)) return;
      const style = getComputedStyle(node);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') add(node);
      for (const child of Array.from(node.children)) walk(child);
    };
    walk(root);
  };

  if (container) collect(container);
  const chatRoot = document.querySelector('.copilot-chat-container');
  if (chatRoot instanceof HTMLElement) collect(chatRoot);

  return candidates;
}

function findScrollContainer(container: HTMLElement | null): HTMLElement | null {
  const candidates = collectScrollCandidates(container);
  // Prefer the element that actually scrolls
  for (const el of candidates) {
    const scrollable = findScrollableWithin(el) ?? (isScrollable(el) ? el : null);
    if (scrollable) return scrollable;
  }
  return candidates[0] ?? null;
}

/** AG-UI event types we handle */
const EventType = {
  RUN_STARTED: 'RUN_STARTED',
  TEXT_MESSAGE_START: 'TEXT_MESSAGE_START',
  TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
  TEXT_MESSAGE_END: 'TEXT_MESSAGE_END',
  TOOL_CALL_START: 'TOOL_CALL_START',
  TOOL_CALL_ARGS: 'TOOL_CALL_ARGS',
  TOOL_CALL_END: 'TOOL_CALL_END',
  TOOL_CALL_RESULT: 'TOOL_CALL_RESULT',
  STATE_SNAPSHOT: 'STATE_SNAPSHOT',
  STATE_DELTA: 'STATE_DELTA',
} as const;

const LOG_PREFIX = '[useLoadMoreHistory]';

/**
 * Apply STATE_SNAPSHOT and STATE_DELTA events to agent state.
 * Load-more returns events from older runs; applying them ensures plans/graphs and their
 * incremental updates (deltas) appear in the UI.
 *
 * Process all state events in a single setAgentState call so each delta is applied
 * to the result of the previous operation (snapshot or delta). Multiple setState
 * calls can be batched by React, causing deltas to apply to stale state.
 */
function applyStateEventsToAgent(
  events: Array<Record<string, unknown>>,
  setAgentState: (state: AgentStateWithPlans | ((prev: AgentStateWithPlans) => AgentStateWithPlans)) => void
): void {
  const stateEvents = events.filter(
    (e) =>
      (e.type === EventType.STATE_SNAPSHOT && e.snapshot && typeof e.snapshot === 'object') ||
      (e.type === EventType.STATE_DELTA && e.delta && Array.isArray(e.delta))
  );
  const eventTypeCounts = events.reduce<Record<string, number>>((acc, e) => {
    const t = (e.type as string) || 'unknown';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  console.log(`${LOG_PREFIX} applyStateEventsToAgent: totalEvents=${events.length} stateEvents=${stateEvents.length}`, {
    eventTypeCounts,
    stateEventTypes: stateEvents.map((e) => e.type),
  });
  if (stateEvents.length === 0) return;

  setAgentState((prev) => {
    let state: AgentStateWithPlans = prev ? { ...prev } : {};
    console.log(`${LOG_PREFIX} applyStateEventsToAgent: prevState`, {
      planIds: prev ? Object.keys(prev.plans || {}) : [],
      graphIds: prev ? Object.keys(prev.graphs || {}) : [],
    });
    for (let i = 0; i < stateEvents.length; i++) {
      const event = stateEvents[i];
      const type = event.type as string;
      if (type === EventType.STATE_SNAPSHOT && event.snapshot && typeof event.snapshot === 'object') {
        const snapshot = event.snapshot as AgentStateWithPlans;
        const planIds = Object.keys(snapshot.plans || {});
        const graphIds = Object.keys(snapshot.graphs || {});
        console.log(`${LOG_PREFIX} applyStateEventsToAgent: [${i}] STATE_SNAPSHOT`, {
          planIds,
          graphIds,
          planSteps: planIds.map((id) => ({
            id,
            steps: (snapshot.plans as Record<string, { steps?: unknown[] }>)?.[id]?.steps?.length ?? 0,
          })),
        });
        state = {
          ...state,
          sessionId: state.sessionId,
          plans: { ...(snapshot.plans || {}), ...(state.plans || {}) },
          graphs: { ...(snapshot.graphs || {}), ...(state.graphs || {}) },
        };
      } else if (type === EventType.STATE_DELTA && event.delta && Array.isArray(event.delta)) {
        const delta = event.delta as Operation[];
        console.log(`${LOG_PREFIX} applyStateEventsToAgent: [${i}] STATE_DELTA`, {
          opCount: delta.length,
          ops: delta.map((op) => ({ op: op.op, path: op.path })),
        });
        try {
          const result = applyPatch({ ...state }, delta, true, false);
          state = result.newDocument as AgentStateWithPlans;
          console.log(`${LOG_PREFIX} applyStateEventsToAgent: [${i}] STATE_DELTA applied OK`);
        } catch (err) {
          console.warn(`${LOG_PREFIX} applyStateEventsToAgent: [${i}] STATE_DELTA applyPatch FAILED`, err);
        }
      }
    }
    console.log(`${LOG_PREFIX} applyStateEventsToAgent: finalState`, {
      planIds: Object.keys(state.plans || {}),
      graphIds: Object.keys(state.graphs || {}),
      planSteps: Object.entries(state.plans || {}).map(([id, p]) => ({
        id,
        steps: ((p as { steps?: Array<{ status?: string }> })?.steps ?? []).map((s) => s?.status),
      })),
    });
    return state;
  });
}

/**
 * Convert AG-UI events to Message[] (minimal reducer for pagination)
 */
function eventsToMessages(events: Array<Record<string, unknown>>): Message[] {
  const messages: Message[] = [];
  const messageMap = new Map<string, Message>();

  for (const event of events) {
    const type = event.type as string;

    if (type === EventType.RUN_STARTED) {
      const input = event.input as { messages?: Message[] } | undefined;
      const inputMessages = input?.messages ?? [];
      for (const msg of inputMessages) {
        if (msg?.id && !messageMap.has(msg.id)) {
          messageMap.set(msg.id, msg as Message);
          messages.push(msg as Message);
        }
      }
      continue;
    }

    if (type === EventType.TEXT_MESSAGE_START) {
      const messageId = event.messageId as string;
      const role = (event.role as string) || 'assistant';
      if (messageId && !messageMap.has(messageId)) {
        const msg = { id: messageId, role: role as Message['role'], content: '' } as Message;
        messageMap.set(messageId, msg);
        messages.push(msg);
      }
      continue;
    }

    if (type === EventType.TEXT_MESSAGE_CONTENT) {
      const messageId = event.messageId as string;
      const delta = (event.delta as string) || '';
      const msg = messageMap.get(messageId);
      if (msg) {
        const prev = typeof msg.content === 'string' ? msg.content : '';
        msg.content = prev + delta;
      }
      continue;
    }

    if (type === EventType.TOOL_CALL_START) {
      const toolCallId = event.toolCallId as string;
      const toolCallName = event.toolCallName as string;
      const parentMessageId = event.parentMessageId as string | undefined;
      let assistantMsg = messages.length > 0 ? messages[messages.length - 1] : null;
      if (parentMessageId && messageMap.has(parentMessageId)) {
        assistantMsg = messageMap.get(parentMessageId)!;
      } else if (!assistantMsg || assistantMsg.role !== 'assistant') {
        assistantMsg = { id: parentMessageId || toolCallId, role: 'assistant', toolCalls: [] };
        messageMap.set(assistantMsg.id, assistantMsg);
        messages.push(assistantMsg);
      }
      const toolCalls = (assistantMsg as { toolCalls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }).toolCalls ?? [];
      (assistantMsg as { toolCalls?: typeof toolCalls }).toolCalls = [
        ...toolCalls,
        { id: toolCallId, type: 'function', function: { name: toolCallName, arguments: '' } },
      ];
      continue;
    }

    if (type === EventType.TOOL_CALL_ARGS) {
      const toolCallId = event.toolCallId as string;
      const delta = (event.delta as string) || '';
      for (const msg of messages) {
        const tc = (msg as { toolCalls?: Array<{ id: string; function: { arguments: string } }> }).toolCalls;
        if (tc) {
          const t = tc.find((c) => c.id === toolCallId);
          if (t) {
            t.function.arguments += delta;
            break;
          }
        }
      }
      continue;
    }

    if (type === EventType.TOOL_CALL_RESULT) {
      const messageId = event.messageId as string;
      const toolCallId = event.toolCallId as string;
      const content = event.content ?? event.result ?? '';
      const role = (event.role as string) || 'tool';
      if (messageId && !messageMap.has(messageId)) {
        const msg: Message = { id: messageId, role, toolCallId, content } as Message;
        messageMap.set(messageId, msg);
        messages.push(msg);
      }
      continue;
    }
  }

  return messages;
}

/** Agent state with plans and graphs - matches UnifiedAgentState */
type AgentStateWithPlans = {
  sessionId?: string;
  plans?: Record<string, unknown>;
  graphs?: Record<string, unknown>;
};

export interface UseLoadMoreHistoryOptions {
  threadId: string | null;
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  enabled?: boolean;
  /** Ref to a container that includes the chat scroll area. Used to preserve scroll position when prepending. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Agent setState from useCopilotAgent. When load-more returns STATE_SNAPSHOT/STATE_DELTA events,
   * they are applied so plans/graphs from older runs appear in the UI.
   */
  setAgentState?: (state: AgentStateWithPlans | ((prev: AgentStateWithPlans) => AgentStateWithPlans)) => void;
}

export interface UseLoadMoreHistoryResult {
  loadMore: () => Promise<void>;
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
}

export function useLoadMoreHistory({
  threadId,
  messages,
  setMessages,
  enabled = true,
  scrollContainerRef,
  setAgentState,
}: UseLoadMoreHistoryOptions): UseLoadMoreHistoryResult {
  console.log('[useLoadMoreHistory] hook called', { threadId: threadId?.slice(0, 8), messagesLength: messages.length });
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRestoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const afterRunIdRef = useRef<string | null>(null);
  const prependedCountRef = useRef(0);
  /** When true, load only child runs (exclude root) so Review is loaded last. When false, include root. */
  const excludeRootRef = useRef(false);
  /** Oldest runId from last successful batch; used when beforeMessageId lookup fails (e.g. tool/activity messages) */
  const oldestRunIdRef = useRef<string | null>(null);

  // Reset when thread changes
  useEffect(() => {
    setHasMore(true);
    setError(null);
    afterRunIdRef.current = null;
    prependedCountRef.current = 0;
    excludeRootRef.current = false;
    oldestRunIdRef.current = null;
  }, [threadId]);

  const loadMore = useCallback(async () => {
    if (!threadId || !enabled || isLoading || !hasMore || messages.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[useLoadMoreHistory] loadMore skipped:', {
          hasThreadId: !!threadId,
          enabled,
          isLoading,
          hasMore,
          messageCount: messages.length,
        });
      }
      return;
    }

    // Oldest message is at index 0 (chronological order). Fallback: first message with id
    const oldestMessage = messages[0];
    const beforeMessageId =
      typeof oldestMessage?.id === 'string'
        ? oldestMessage.id
        : messages.find((m) => typeof m?.id === 'string')?.id ?? null;
    // Prefer beforeRunId when we have it from a previous batch - avoids loop when prepended
    // messages are deduplicated by the agent (same content already in newer run's history).
    // Must use run-based cursor for 2nd+ request to advance past duplicate content.
    const useBeforeRunId = !afterRunIdRef.current && !!oldestRunIdRef.current;
    if (!useBeforeRunId && !beforeMessageId) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useLoadMoreHistory] No message with id found in messages');
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    const doFetch = async (params: URLSearchParams) => {
      const res = await fetch(
        `${API_CONFIG.BASE_URL}/api/threads/${threadId}/history?${params}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Failed to load history: ${res.status}`);
      }
      return res.json();
    };

    try {
      const useAfter = !!afterRunIdRef.current;
      const excludeRoot = excludeRootRef.current;
      // For "after": cap at first message of initial (avoids overlap with content loaded via excludeRoot)
      const afterBeforeMessageId = useAfter && prependedCountRef.current < messages.length
        ? (messages[prependedCountRef.current] as { id?: string })?.id
        : null;
      const params = useAfter
        ? new URLSearchParams({
            afterRunId: afterRunIdRef.current!,
            ...(afterBeforeMessageId ? { beforeMessageId: afterBeforeMessageId } : {}),
          })
        : useBeforeRunId
          ? new URLSearchParams({
              before: oldestRunIdRef.current!,
              limit: String(LOAD_MORE_RUNS_LIMIT),
              ...(excludeRoot ? { excludeRoot: 'true' } : {}),
            })
          : new URLSearchParams({
              beforeMessageId: beforeMessageId!,
              limit: String(LOAD_MORE_RUNS_LIMIT),
              ...(excludeRoot ? { excludeRoot: 'true' } : {}),
            });

      const data = (await doFetch(params)) as {
        events: Array<Record<string, unknown>>;
        hasMore: boolean;
        afterRunId?: string | null;
        oldestRunId?: string | null;
        nextBeforeRunId?: string | null;
      };
      const { events, hasMore: more, afterRunId: nextAfter, oldestRunId, nextBeforeRunId } = data;

      setHasMore(more);
      afterRunIdRef.current = nextAfter || null;
      const cursorForNext = nextBeforeRunId ?? oldestRunId;
      if (cursorForNext && Array.isArray(events) && events.length > 0) {
        oldestRunIdRef.current = cursorForNext;
      }

      if (setAgentState && Array.isArray(events) && events.length > 0) {
        console.log(`${LOG_PREFIX} Applying state events from main fetch (events=${events.length})`);
        applyStateEventsToAgent(events, setAgentState as (s: AgentStateWithPlans | ((p: AgentStateWithPlans) => AgentStateWithPlans)) => void);
      } else if (Array.isArray(events) && events.length > 0 && !setAgentState) {
        console.warn(`${LOG_PREFIX} Skipping state events: setAgentState not provided`);
      }

      if (!Array.isArray(events) || events.length === 0) {
        if (useAfter) afterRunIdRef.current = null;
        // When message lookup fails (0 runs), retry with beforeRunId if we have it from previous batch
        if (!useAfter && oldestRunIdRef.current) {
          const runParams = new URLSearchParams({
            before: oldestRunIdRef.current,
            limit: String(LOAD_MORE_RUNS_LIMIT),
            ...(excludeRoot ? { excludeRoot: 'true' } : {}),
          });
          let runData = (await doFetch(runParams)) as {
            events: Array<Record<string, unknown>>;
            hasMore: boolean;
            afterRunId?: string | null;
            oldestRunId?: string | null;
          };
          // If still 0 and excludeRoot, try with root included (load Review)
          if (
            (!Array.isArray(runData.events) || runData.events.length === 0) &&
            excludeRoot
          ) {
            excludeRootRef.current = false;
            runData = (await doFetch(
              new URLSearchParams({
                before: oldestRunIdRef.current,
                limit: String(LOAD_MORE_RUNS_LIMIT),
              })
            )) as typeof runData;
          }
          const { events: runEvents, hasMore: runMore, afterRunId: runAfter, oldestRunId: runOldest } = runData;
          setHasMore(runMore);
          afterRunIdRef.current = runAfter || null;
          if (runOldest) oldestRunIdRef.current = runOldest;
          if (Array.isArray(runEvents) && runEvents.length > 0) {
            if (setAgentState) {
              console.log(`${LOG_PREFIX} Applying state events from runData retry (events=${runEvents.length})`);
              applyStateEventsToAgent(runEvents, setAgentState as (s: AgentStateWithPlans | ((p: AgentStateWithPlans) => AgentStateWithPlans)) => void);
            }
            const runMessages = eventsToMessages(runEvents);
            if (runMessages.length > 0) {
              const scrollEl = findScrollContainer(scrollContainerRef?.current ?? null);
              if (scrollEl && scrollEl instanceof HTMLElement) {
                scrollRestoreRef.current = { scrollHeight: scrollEl.scrollHeight, scrollTop: scrollEl.scrollTop };
              }
              setMessages([...runMessages, ...messages]);
              prependedCountRef.current += runMessages.length;
            }
            return;
          }
        }
        if (!useAfter && excludeRoot) {
          // No more child runs; retry with root included (load Review last)
          excludeRootRef.current = false;
          const retryParams = new URLSearchParams({
            ...(beforeMessageId ? { beforeMessageId } : {}),
            limit: String(LOAD_MORE_RUNS_LIMIT),
          });
          const retryData = (await doFetch(retryParams)) as {
            events: Array<Record<string, unknown>>;
            hasMore: boolean;
            afterRunId?: string | null;
          };
          const { events: retryEvents, hasMore: retryMore, afterRunId: retryAfter } = retryData;
          setHasMore(retryMore);
          afterRunIdRef.current = retryAfter || null;
          if (!Array.isArray(retryEvents) || retryEvents.length === 0) {
            setHasMore(false);
            return;
          }
          if (setAgentState) {
            console.log(`${LOG_PREFIX} Applying state events from excludeRoot retry (events=${retryEvents.length})`);
            applyStateEventsToAgent(retryEvents, setAgentState as (s: AgentStateWithPlans | ((p: AgentStateWithPlans) => AgentStateWithPlans)) => void);
          }
          const retryMessages = eventsToMessages(retryEvents);
          if (retryMessages.length === 0) {
            setHasMore(false);
            return;
          }
          const scrollEl = findScrollContainer(scrollContainerRef?.current ?? null);
          if (scrollEl && scrollEl instanceof HTMLElement) {
            scrollRestoreRef.current = {
              scrollHeight: scrollEl.scrollHeight,
              scrollTop: scrollEl.scrollTop,
            };
          }
          setMessages([...retryMessages, ...messages]);
          prependedCountRef.current += retryMessages.length;
        } else if (!nextAfter) {
          setHasMore(false);
        }
        return;
      }

      const newMessages = eventsToMessages(events);
      if (newMessages.length === 0) {
        if (!nextAfter) setHasMore(false);
        return;
      }

      if (!useAfter) {
        const scrollEl = findScrollContainer(scrollContainerRef?.current ?? null);
        if (scrollEl && scrollEl instanceof HTMLElement) {
          scrollRestoreRef.current = {
            scrollHeight: scrollEl.scrollHeight,
            scrollTop: scrollEl.scrollTop,
          };
        }
      }

      if (useAfter) {
        const insertAt = prependedCountRef.current;
        setMessages([
          ...messages.slice(0, insertAt),
          ...newMessages,
          ...messages.slice(insertAt),
        ]);
        prependedCountRef.current += newMessages.length;
      } else {
        setMessages([...newMessages, ...messages]);
        prependedCountRef.current += newMessages.length;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load more history';
      setError(msg);
      console.error('[useLoadMoreHistory]', msg);
    } finally {
      setIsLoading(false);
    }
  }, [threadId, messages, setMessages, enabled, isLoading, hasMore, scrollContainerRef, setAgentState]);

  // Restore scroll position after React commits the prepended messages
  useEffect(() => {
    if (!scrollRestoreRef.current || !scrollContainerRef?.current) return;
    const scrollEl = findScrollContainer(scrollContainerRef.current);
    if (!(scrollEl instanceof HTMLElement)) return;
    const { scrollHeight, scrollTop } = scrollRestoreRef.current;
    scrollRestoreRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const added = scrollEl.scrollHeight - scrollHeight;
        scrollEl.scrollTop = scrollTop + added;
      });
    });
  }, [messages, scrollContainerRef]);

  // Auto-trigger load more when user scrolls near the top.
  // Only trigger when user scrolls FROM below threshold TO at top (not on initial load when already at top).
  const lastLoadMoreRef = useRef(0);
  const attachTimeRef = useRef(0);
  const prevScrollTopByEl = useRef<WeakMap<HTMLElement, number>>(new WeakMap());
  const LOAD_MORE_THROTTLE_MS = 400;
  const GRACE_PERIOD_MS = 800; // Ignore scroll events shortly after attach (layout/initial paint)

  useEffect(() => {
    const container = scrollContainerRef?.current;
    const root = container ?? document.querySelector('.copilot-chat-container');
    if (!(root instanceof HTMLElement)) return;

    const handleScroll = (el: HTMLElement) => {
      const now = Date.now();
      if (now - attachTimeRef.current < GRACE_PERIOD_MS) return; // Ignore initial layout scrolls
      const { scrollTop } = el;
      const prev = prevScrollTopByEl.current.get(el);
      prevScrollTopByEl.current.set(el, scrollTop);
      // Only trigger when THIS element scrolled from below threshold to at top (not on initial render)
      if (scrollTop > SCROLL_TOP_THRESHOLD) return;
      if (prev === undefined || prev <= SCROLL_TOP_THRESHOLD) return; // first event or was already at top
      if (now - lastLoadMoreRef.current < LOAD_MORE_THROTTLE_MS) return;
      lastLoadMoreRef.current = now;
      loadMore();
    };

    const attachToAll = (candidates: HTMLElement[]) => {
      attachTimeRef.current = Date.now();
      const cleanups: (() => void)[] = [];
      for (const el of candidates) {
        prevScrollTopByEl.current.set(el, el.scrollTop); // Initialize with current position
        const handler = () => handleScroll(el);
        el.addEventListener('scroll', handler, { passive: true });
        cleanups.push(() => el.removeEventListener('scroll', handler));
      }
      return () => cleanups.forEach((c) => c());
    };

    const run = () => {
      const candidates = collectScrollCandidates(container ?? null);
      if (candidates.length > 0) {
        return attachToAll(candidates);
      }
      return undefined;
    };

    let cleanup = run();
    if (cleanup) return cleanup;

    // Wait for scroll containers to appear (CopilotChat renders async)
    let timeoutId: ReturnType<typeof setTimeout>;
    let timeoutId2: ReturnType<typeof setTimeout>;
    const tryAttach = () => {
      if (cleanup) return;
      cleanup = run();
      if (cleanup) {
        observer.disconnect();
        clearTimeout(timeoutId);
        clearTimeout(timeoutId2);
      }
    };
    const observer = new MutationObserver(tryAttach);
    observer.observe(root, { childList: true, subtree: true });
    timeoutId = setTimeout(tryAttach, 400);
    timeoutId2 = setTimeout(tryAttach, 1200);
    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      cleanup?.();
    };
  }, [scrollContainerRef, loadMore, messages.length]);

  return { loadMore, isLoading, hasMore, error };
}
