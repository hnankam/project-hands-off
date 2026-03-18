/**
 * ExploreAccordionToolCallsView
 *
 * Custom toolCallsView that groups consecutive tool messages into a collapsible
 * "Exploring..." accordion. Each tool is still rendered via useRenderToolCall (ActionStatus).
 * After N seconds of streaming, consecutive groupable tools collapse. When an assistant
 * message or excluded tool arrives, the accordion shows "Explored" and auto-closes after M seconds.
 */
import * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRenderToolCall } from '../../hooks/copilotkit';
import { useStorage } from '@extension/shared';
import { SharedAgentContext } from '../../hooks/copilotkit/useCopilotAgent';
import { themeStorage } from '@extension/storage';
import { useExploreAccordionEnabled } from '../../context/ExploreAccordionContext';

// =============================================================================
// CONFIG
// =============================================================================

const GROUP_DELAY_MS = 3000;
const CLOSE_AFTER_MS = 5000;
const MIN_TOOLS_FOR_ACCORDION = 2;

const EXCLUDED_TOOLS = new Set([
  'create_plan',
  'update_plan_step',
  'run_graph',
]);

/** Tool names that map to "files" in the Explored summary */
const FILE_TOOLS = new Set([
  'get_file_content',
  'get_note_content',
  'create_text_file',
  'update_file_content',
]);

/** Tool names that map to "searches" in the Explored summary */
const SEARCH_TOOLS = new Set([
  'searchPageContent',
  'searchFormData',
  'searchDOMUpdates',
  'searchClickableElements',
  'search_workspace_files',
  'search_workspace_notes',
  'web_search',
]);

/** Tool names that map to "fetch" in the Explored summary */
const FETCH_TOOLS = new Set([
  'url_context',
  'refreshPageContent',
  'getHtmlChunksByRange',
  'getFormChunksByRange',
  'getClickableChunksByRange',
]);

/** Workspace tools (backend) - from copilotkit-pydantic tools/backend_tools.py */
const WORKSPACE_TOOLS = new Set([
  'search_workspace_files', 'get_file_content', 'search_workspace_notes', 'get_note_content',
  'get_file_metadata', 'list_folders', 'create_folder', 'rename_folder', 'delete_folder',
  'list_files', 'delete_file', 'rename_file', 'move_file', 'create_text_file',
  'update_file_content', 'read_file', 'glob_files', 'grep_files', 'edit_file',
]);

/** Workspace action subtypes for breakdown (e.g. "5 file creations, 1 fetch") */
const WORKSPACE_FILE_CREATIONS = new Set(['create_text_file', 'create_folder']);
const WORKSPACE_FILE_UPDATES = new Set(['update_file_content']);
const WORKSPACE_FETCH = new Set([
  'get_file_content', 'get_note_content', 'read_file', 'list_files',
  'get_file_metadata', 'list_folders', 'glob_files',
]);
const WORKSPACE_SEARCH = new Set(['search_workspace_files', 'search_workspace_notes', 'grep_files']);
const WORKSPACE_MUTATIONS = new Set([
  'delete_file', 'rename_file', 'move_file', 'delete_folder', 'rename_folder', 'edit_file',
]);

/** Builtin backend tools (non-workspace, non-MCP) - map to display label */
const BUILTIN_BACKEND_LABELS: Record<string, string> = {
  load_full_tool_result: 'Load Result',
  web_search: 'Web Search',
  code_execution: 'Code Execution',
  url_context: 'URL Fetch',
  call_agent: 'Agent Call',
  // Skill tools (pydantic-ai-skills SkillsToolset)
  list_skills: 'Skill',
  load_skill: 'Skill',
  read_skill_resource: 'Skill',
  run_skill_script: 'Skill',
  // Graph tools (graph_tools.py)
  create_graph: 'Graph',
  resume_graph: 'Graph',
  update_graph_status: 'Graph',
  pause_graph: 'Graph',
  cancel_graph: 'Graph',
  rename_graph: 'Graph',
  list_graphs: 'Graph',
  get_graph_details: 'Graph',
  delete_graph: 'Graph',
  run_graph: 'Graph',
};

/** Plan action subtypes for breakdown */
const PLAN_CREATE = new Set(['create_plan']);
const PLAN_UPDATE = new Set(['update_plan_step', 'update_plan_steps', 'update_plan_status']);
const PLAN_FETCH = new Set(['list_plans', 'get_plan_details']);
const PLAN_DELETE = new Set(['delete_plan']);
const PLAN_RENAME = new Set(['rename_plan']);

/** Frontend tools - from useEnabledFrontendTools */
const FRONTEND_TOOLS = new Set([
  'searchPageContent', 'searchFormData', 'searchDOMUpdates', 'searchClickableElements',
  'getHtmlChunksByRange', 'getFormChunksByRange', 'getClickableChunksByRange',
  'moveCursorToElement', 'refreshPageContent', 'cleanupExtensionUI', 'clickElement',
  'verifySelector', 'getSelectorAtPoint', 'getSelectorsAtPoints', 'sendKeystrokes',
  'inputData', 'openNewTab', 'scroll', 'dragAndDrop', 'takeScreenshot',
  'generate_images', 'wait', 'confirmAction',
]);

/**
 * First-party MCP server prefixes from copilotkit-pydantic/first-party-mcp-servers/
 * Tool keys are formatted as {server_key}_{tool_name}, e.g. github_list_repositories
 */
const MCP_SERVER_PREFIXES: Array<[string, string]> = [
  ['github_', 'GitHub'],
  ['confluence_', 'Confluence'],
  ['jira_', 'Jira'],
  ['databricks_', 'Databricks'],
  ['microsoft365_', 'Microsoft 365'],
];

// =============================================================================
// TYPES
// =============================================================================

interface ToolCallInfo {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

interface MessageLike {
  id?: string;
  role?: string;
  toolCallId?: string;
  content?: unknown;
  toolCalls?: ToolCallInfo[];
}

interface ExploreAccordionToolCallsViewProps {
  message: MessageLike;
  messages?: readonly MessageLike[] | MessageLike[];
}

// Persist expanded state across remounts (for Virtua virtualization)
const accordionExpandedCache: Map<string, boolean> = new Map();

// =============================================================================
// HELPERS
// =============================================================================

function getToolName(toolCall: ToolCallInfo | null): string {
  return toolCall?.function?.name ?? 'unknown';
}

function isExcluded(toolName: string): boolean {
  return EXCLUDED_TOOLS.has(toolName);
}

function isGroupable(toolName: string): boolean {
  return !EXCLUDED_TOOLS.has(toolName);
}

type ActionCategory = 'files' | 'searches' | 'fetch';
type SourceCategory = 'workspace' | 'frontend' | 'mcp';

function getActionCategory(toolName: string): ActionCategory | 'other' | null {
  if (FILE_TOOLS.has(toolName)) return 'files';
  if (SEARCH_TOOLS.has(toolName)) return 'searches';
  if (FETCH_TOOLS.has(toolName)) return 'fetch';
  // Excluded tools (create_plan, etc.) - don't count in summary
  if (EXCLUDED_TOOLS.has(toolName)) return null;
  return 'other';
}

function getSourceCategory(toolName: string): SourceCategory {
  if (WORKSPACE_TOOLS.has(toolName)) return 'workspace';
  if (FRONTEND_TOOLS.has(toolName)) return 'frontend';
  return 'mcp';
}

/** Get MCP server display name from tool key (e.g. github_list_repositories → "GitHub") */
function getMcpServerType(toolName: string): string | null {
  for (const [prefix, displayName] of MCP_SERVER_PREFIXES) {
    if (toolName.startsWith(prefix)) return displayName;
  }
  return null;
}

/** Get builtin backend tool label (e.g. load_full_tool_result → "Load Result") */
function getBuiltinBackendLabel(toolName: string): string | null {
  return BUILTIN_BACKEND_LABELS[toolName] ?? null;
}

/** Get Plan action subtype for breakdown (e.g. "Plan create", "Plan update") */
function getPlanActionLabel(toolName: string): string | null {
  if (PLAN_CREATE.has(toolName)) return 'Plan create';
  if (PLAN_UPDATE.has(toolName)) return 'Plan update';
  if (PLAN_FETCH.has(toolName)) return 'Plan fetch';
  if (PLAN_DELETE.has(toolName)) return 'Plan delete';
  if (PLAN_RENAME.has(toolName)) return 'Plan rename';
  return null;
}

/** Get workspace action subtype for breakdown (e.g. "5 file creations, 1 fetch") */
function getWorkspaceActionLabel(toolName: string): string {
  if (WORKSPACE_FILE_CREATIONS.has(toolName)) return 'file creation';
  if (WORKSPACE_FILE_UPDATES.has(toolName)) return 'file update';
  if (WORKSPACE_FETCH.has(toolName)) return 'fetch';
  if (WORKSPACE_SEARCH.has(toolName)) return 'search';
  if (WORKSPACE_MUTATIONS.has(toolName)) return 'mutation';
  return 'workspace';
}

/**
 * Get Databricks action subtype for MCP breakdown.
 * execute_*, run_now, submit_run, start_*, stop_*, etc. → Databricks Executions
 * get_*, list_*, search_*, retrieve_*, query_*, scan_* → Databricks Fetch
 * create_*, update_*, delete_*, put_*, etc. → Databricks Mutations
 */
function getDatabricksActionLabel(toolName: string): string {
  if (!toolName.startsWith('databricks_')) return 'Databricks';
  const suffix = toolName.slice('databricks_'.length);
  if (
    suffix.startsWith('execute_') ||
    suffix === 'execute_command' ||
    suffix === 'run_now' ||
    suffix === 'submit_run' ||
    suffix.startsWith('start_') ||
    suffix.startsWith('stop_') ||
    suffix.startsWith('restart_') ||
    suffix.startsWith('cancel_') ||
    suffix === 'reset_pipeline'
  ) {
    return 'Databricks Executions';
  }
  if (
    suffix.startsWith('get_') ||
    suffix.startsWith('list_') ||
    suffix.startsWith('search_') ||
    suffix.startsWith('retrieve_') ||
    suffix.startsWith('query_') ||
    suffix.startsWith('scan_') ||
    suffix.startsWith('download_') ||
    suffix === 'table_exists'
  ) {
    return 'Databricks Fetch';
  }
  if (
    suffix.startsWith('create_') ||
    suffix.startsWith('update_') ||
    suffix.startsWith('delete_') ||
    suffix.startsWith('put_') ||
    suffix.startsWith('add_') ||
    suffix.startsWith('remove_') ||
    suffix.startsWith('set_') ||
    suffix.startsWith('insert_') ||
    suffix.startsWith('upsert_') ||
    suffix.startsWith('publish_') ||
    suffix.startsWith('sync_') ||
    suffix === 'edit_cluster' ||
    suffix === 'reorder_notebook_cells'
  ) {
    return 'Databricks Mutations';
  }
  return 'Databricks';
}

/**
 * Build Explored summary string from tool items.
 * Format: "Explored 1 file, 5 searches, 1 fetch" (action-oriented, from screenshot).
 * Adds workspace/frontend/MCP breakdown. MCP is broken down by first-party server type
 * (GitHub, Confluence, Jira, Databricks, Microsoft 365) from first-party-mcp-servers/.
 */
function buildExploredSummary(items: ToolItem[]): string {
  const actionCounts: Record<ActionCategory | 'other', number> = {
    files: 0,
    searches: 0,
    fetch: 0,
    other: 0,
  };
  const sourceCounts: Record<SourceCategory, number> = {
    workspace: 0,
    frontend: 0,
    mcp: 0,
  };
  const mcpByServer: Record<string, number> = {};
  const workspaceByAction: Record<string, number> = {};

  for (const { toolCall } of items) {
    const name = getToolName(toolCall);
    const actionCat = getActionCategory(name);
    if (actionCat === 'other') actionCounts.other += 1;
    else if (actionCat) actionCounts[actionCat] += 1;
    const sourceCat = getSourceCategory(name);
    sourceCounts[sourceCat] += 1;
    if (sourceCat === 'workspace') {
      const wsLabel = getWorkspaceActionLabel(name);
      workspaceByAction[wsLabel] = (workspaceByAction[wsLabel] ?? 0) + 1;
    }
    if (sourceCat === 'mcp') {
      const baseServer = getMcpServerType(name);
      let label: string;
      if (baseServer === 'Databricks') {
        label = getDatabricksActionLabel(name);
      } else if (baseServer) {
        label = baseServer;
      } else {
        label = getPlanActionLabel(name) ?? getBuiltinBackendLabel(name) ?? 'other MCP';
      }
      mcpByServer[label] = (mcpByServer[label] ?? 0) + 1;
    }
  }

  const hasSourceBreakdown = sourceCounts.workspace > 0 || sourceCounts.frontend > 0 || sourceCounts.mcp > 0;

  const parts: string[] = [];
  // When we have source breakdown, skip action breakdown (files/searches/fetch) to avoid
  // confusing mismatches (e.g. "5 files" vs "6 workspace" when list_files is workspace but not a "file" action)
  if (!hasSourceBreakdown) {
    if (actionCounts.files > 0) parts.push(`${actionCounts.files} file${actionCounts.files !== 1 ? 's' : ''}`);
    if (actionCounts.searches > 0) parts.push(`${actionCounts.searches} search${actionCounts.searches !== 1 ? 'es' : ''}`);
    if (actionCounts.fetch > 0) parts.push(`${actionCounts.fetch} fetch${actionCounts.fetch !== 1 ? 'es' : ''}`);
    if (actionCounts.other > 0) parts.push(`${actionCounts.other} other`);
  }

  // Add source breakdown when we have workspace, frontend, or MCP tools
  const sourceParts: string[] = [];
  if (sourceCounts.workspace > 0) {
    const wsOrder = ['file creation', 'file update', 'fetch', 'search', 'mutation', 'workspace'];
    const pluralize = (label: string, count: number) => {
      if (count === 1) return `1 ${label}`;
      if (label === 'file creation') return `${count} file creations`;
      if (label === 'file update') return `${count} file updates`;
      if (label === 'fetch') return `${count} fetch${count !== 1 ? 'es' : ''}`;
      if (label === 'search') return `${count} search${count !== 1 ? 'es' : ''}`;
      if (label === 'mutation') return `${count} mutation${count !== 1 ? 's' : ''}`;
      return `${count} ${label}`;
    };
    const wsParts = Object.entries(workspaceByAction)
      .sort(([a], [b]) => {
        const ia = wsOrder.indexOf(a);
        const ib = wsOrder.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
      })
      .map(([label, count]) => pluralize(label, count));
    sourceParts.push(wsParts.join(', '));
  }
  if (sourceCounts.frontend > 0) sourceParts.push(`${sourceCounts.frontend} frontend`);
  if (sourceCounts.mcp > 0) {
    // Break down MCP by server/type (Databricks subtypes, builtin backend labels)
    const mcpOrder = [
      'GitHub', 'Confluence', 'Jira',
      'Databricks Executions', 'Databricks Fetch', 'Databricks Mutations', 'Databricks',
      'Microsoft 365',
      'Plan create', 'Plan update', 'Plan fetch', 'Plan delete', 'Plan rename',
      'Graph', 'Skill',
      'Load Result', 'Web Search', 'Code Execution', 'URL Fetch', 'Agent Call',
      'other MCP',
    ];
    const mcpPluralize = (label: string, count: number) => {
      if (count === 1) return `1 ${label}`;
      if (label.startsWith('Plan ')) {
        const suffix = label.slice(5);
        const plural = suffix === 'fetch' ? 'fetches' : `${suffix}s`;
        return `${count} Plan ${plural}`;
      }
      return `${count} ${label}`;
    };
    const mcpParts = Object.entries(mcpByServer)
      .sort(([a], [b]) => {
        const ia = mcpOrder.indexOf(a);
        const ib = mcpOrder.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
      })
      .map(([server, count]) => mcpPluralize(server, count));
    sourceParts.push(mcpParts.join(', '));
  }

  if (sourceParts.length > 0) {
    parts.push(`(${sourceParts.join(', ')})`);
  }

  return parts.length > 0 ? parts.join(', ') : '';
}

/** Assistant message that has toolCalls but no meaningful text content */
function isAssistantWithOnlyToolCalls(msg: MessageLike): boolean {
  if (msg?.role !== 'assistant') return false;
  const hasTools = (msg.toolCalls?.length ?? 0) > 0;
  const content = msg.content;
  const hasText = content != null && String(content).trim().length > 0;
  return hasTools && !hasText;
}

/**
 * Collect tool items from a run of consecutive assistant messages (each with only tool calls).
 * Returns { items, isContinuation }.
 * - isContinuation: true when this message is a "follower" in a run (tools already rendered by the start message).
 * - items: collected ToolItems when we're the start of a run; empty when continuation.
 */
function collectToolRun(
  messages: readonly MessageLike[] | MessageLike[],
  currentMessage: MessageLike
): { items: ToolItem[]; isContinuation: boolean; runStartId: string } | null {
  const msgList = Array.isArray(messages) ? [...messages] : [];
  const idx = msgList.findIndex((m) => m?.id === currentMessage?.id);
  if (idx < 0 || !isAssistantWithOnlyToolCalls(currentMessage)) return null;

  // Continuation: scan backwards past tool messages to find the previous assistant.
  // If that assistant has toolCalls (with or without text), we're part of the same block - already rendered.
  let prevIdx = idx - 1;
  while (prevIdx >= 0 && msgList[prevIdx]?.role === 'tool') prevIdx -= 1;
  const prevAssistant = prevIdx >= 0 ? msgList[prevIdx] : null;
  const prevHasTools = prevAssistant?.role === 'assistant' && (prevAssistant.toolCalls?.length ?? 0) > 0;
  if (prevHasTools) {
    return { items: [], isContinuation: true, runStartId: prevAssistant!.id ?? 'unknown' };
  }

  // Start of run: collect tools from this message and following consecutive assistant-with-only-tools
  const items: ToolItem[] = [];
  let i = idx;

  while (i < msgList.length) {
    const msg = msgList[i];
    if (msg?.role === 'user') break;
    if (msg?.role === 'assistant') {
      if (!isAssistantWithOnlyToolCalls(msg)) break;
      const toolCalls = msg.toolCalls ?? [];
      for (const toolCall of toolCalls) {
        const toolMessage =
          msgList.find((m) => m?.role === 'tool' && m?.toolCallId === toolCall.id) ?? null;
        items.push({ toolMessage, toolCall });
      }
      i += 1;
      // Skip following tool messages until next assistant or user
      while (i < msgList.length && msgList[i]?.role === 'tool') i += 1;
    } else {
      i += 1;
    }
  }

  return { items, isContinuation: false, runStartId: currentMessage.id ?? 'unknown' };
}

/**
 * Build list of { toolCall, toolMessage } for each tool call in the assistant.
 * Uses message.toolCalls as source (includes in-progress tools without results yet).
 * Tool message may be undefined when tool is still executing.
 */
function getToolItemsForAssistant(
  messages: readonly MessageLike[] | MessageLike[],
  assistantMessage: MessageLike
): Array<{ toolMessage: MessageLike | null; toolCall: ToolCallInfo }> {
  const toolCalls = assistantMessage?.toolCalls ?? [];
  if (!toolCalls.length) return [];

  return toolCalls.map((toolCall) => {
    const toolMessage =
      messages.find(
        (m) => m?.role === 'tool' && m?.toolCallId === toolCall.id
      ) ?? null;
    return { toolMessage, toolCall };
  });
}

/**
 * For assistant with text + tools: get our tools plus the following run of assistant-with-only-tools.
 * Merges consecutive tool blocks into one so we render a single accordion.
 */
function getToolItemsWithFollowingRun(
  messages: readonly MessageLike[] | MessageLike[],
  assistantMessage: MessageLike
): Array<{ toolMessage: MessageLike | null; toolCall: ToolCallInfo }> {
  const msgList = Array.isArray(messages) ? [...messages] : [];
  const baseItems = getToolItemsForAssistant(msgList, assistantMessage);
  if (!baseItems.length) return [];

  const idx = msgList.findIndex((m) => m?.id === assistantMessage?.id);
  if (idx < 0) return baseItems;

  const items: ToolItem[] = [...baseItems];
  let i = idx + 1;
  while (i < msgList.length) {
    const msg = msgList[i];
    if (msg?.role === 'user') break;
    if (msg?.role === 'assistant') {
      if (!isAssistantWithOnlyToolCalls(msg)) break;
      const toolCalls = msg.toolCalls ?? [];
      for (const toolCall of toolCalls) {
        const toolMessage =
          msgList.find((m) => m?.role === 'tool' && m?.toolCallId === toolCall.id) ?? null;
        items.push({ toolMessage, toolCall });
      }
      i += 1;
      while (i < msgList.length && msgList[i]?.role === 'tool') i += 1;
    } else {
      i += 1;
    }
  }
  return items;
}

type ToolItem = { toolMessage: MessageLike | null; toolCall: ToolCallInfo };

/**
 * Partition tool items into segments. Excluded tools break a run.
 */
function partitionToolItems(items: ToolItem[]): ToolItem[][] {
  const segments: ToolItem[][] = [];
  let current: ToolItem[] = [];

  for (const item of items) {
    const name = getToolName(item.toolCall);
    if (isExcluded(name)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      segments.push([item]); // Excluded as single-item segment
    } else {
      current.push(item);
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

// =============================================================================
// ACCORDION UI
// =============================================================================

interface ToolMessageAccordionProps {
  items: ToolItem[];
  messageId: string;
  segmentIndex: number;
  isExploring: boolean;
  isRunning: boolean;
  /** True when all tools in this segment have received their result messages */
  allToolsComplete: boolean;
  renderToolCall: (opts: { toolCall: ToolCallInfo; toolMessage: MessageLike | null | undefined }) => React.ReactNode;
  isLight: boolean;
}

const ToolMessageAccordion: React.FC<ToolMessageAccordionProps> = ({
  items,
  messageId,
  segmentIndex,
  isExploring,
  isRunning,
  allToolsComplete,
  renderToolCall,
  isLight,
}) => {
  const cacheKey = `${messageId}-accordion-${segmentIndex}`;
  const [isExpanded, setIsExpanded] = useState(() => {
    return accordionExpandedCache.get(cacheKey) ?? true;
  });
  const [phase, setPhase] = useState<'exploring' | 'explored'>(
    isExploring ? 'exploring' : 'explored'
  );
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoClosedRef = useRef(false);

  useEffect(() => {
    accordionExpandedCache.set(cacheKey, isExpanded);
  }, [cacheKey, isExpanded]);

  // Transition to "explored" when all tools have results (data-driven) or agent stops
  // Auto-close after CLOSE_AFTER_MS when explored (on transition from streaming, or on tab load)
  useEffect(() => {
    const isDone = allToolsComplete || !isRunning;
    if (isDone && phase === 'exploring') {
      setPhase('explored');
    }
    if (phase === 'explored' && !hasAutoClosedRef.current) {
      hasAutoClosedRef.current = true;
      closeTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, CLOSE_AFTER_MS);
    }
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [allToolsComplete, isRunning, phase]);

  const exploredSummary = buildExploredSummary(items);
  const headerText = phase === 'exploring' ? 'Exploring...' : (exploredSummary ? `Explored ${exploredSummary}` : 'Explored');

  const chevronIcon = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: 'transform 0.2s ease-in-out',
        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );

  const textColor = isLight ? '#374151' : '#d1d5db';
  const mutedColor = isLight ? '#6b7280' : '#9ca3af';

  return (
    <div
      style={{
        marginTop: 4,
        marginBottom: 4,
        fontSize: 12,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          padding: '0',
          color: textColor,
          userSelect: 'none',
          marginTop: -6,
        }}
      >
        {chevronIcon}
        <span style={{ marginLeft: 4, color: mutedColor }}>{headerText}</span>
      </div>
      <div
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
          maxHeight: isExpanded ? '5000px' : 0,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div style={{ paddingLeft: 18, marginTop: 4 }}>
          {items.map(({ toolMessage, toolCall }) => (
            <div key={toolCall.id}>
              {renderToolCall({ toolCall, toolMessage: toolMessage ?? undefined })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ExploreAccordionToolCallsView: React.FC<ExploreAccordionToolCallsViewProps> = ({
  message,
  messages = [],
}) => {
  const renderToolCall = useRenderToolCall();
  const { isLight } = useStorage(themeStorage);
  const accordionEnabled = useExploreAccordionEnabled();
  const agentContext = React.useContext(SharedAgentContext);
  const isRunning = agentContext?.running ?? false;

  const groupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shouldShowAccordion, setShouldShowAccordion] = useState(false);

  // Cross-message run: collect tools from consecutive assistant-with-only-tools messages
  const runResult = useMemo(
    () => collectToolRun(messages, message),
    [messages, message]
  );

  // Fallback: assistant with tools + text, or no run found. Include following run to merge consecutive blocks.
  // Must run unconditionally (before any early return) to satisfy React's rules of hooks.
  const toolItems = useMemo(() => {
    if (runResult?.isContinuation) return [];
    if (runResult && runResult.items.length > 0) return runResult.items;
    return getToolItemsWithFollowingRun(messages, message);
  }, [runResult, messages, message]);

  const runStartId = runResult?.runStartId ?? message.id ?? 'unknown';
  const segments = useMemo(() => partitionToolItems(toolItems), [toolItems]);

  // Enable accordion when we have 2+ groupable tools.
  // During streaming: delay GROUP_DELAY_MS before collapsing.
  // When complete (!isRunning): show accordion immediately (fixes edge case where completed runs rendered inline).
  useEffect(() => {
    if (groupTimerRef.current) {
      clearTimeout(groupTimerRef.current);
      groupTimerRef.current = null;
    }

    const hasGroupable = segments.some(
      (seg) => seg.length >= MIN_TOOLS_FOR_ACCORDION && seg.every((i) => isGroupable(getToolName(i.toolCall)))
    );

    if (hasGroupable) {
      if (isRunning) {
        groupTimerRef.current = setTimeout(() => {
          setShouldShowAccordion(true);
        }, GROUP_DELAY_MS);
      } else {
        // Completed run: show accordion immediately (no delay)
        setShouldShowAccordion(true);
      }
    } else {
      setShouldShowAccordion(false);
    }

    return () => {
      if (groupTimerRef.current) {
        clearTimeout(groupTimerRef.current);
      }
    };
  }, [isRunning, toolItems.length, segments]);

  // Early returns AFTER all hooks - prevents React error #300 (fewer hooks than expected)
  // when loading more messages changes runResult?.isContinuation between renders
  if (runResult?.isContinuation) return null;
  if (!message.toolCalls?.length && toolItems.length === 0) return null;

  const rendered: React.ReactNode[] = [];

  segments.forEach((segment, segIndex) => {
    const allGroupable = segment.every((i) => isGroupable(getToolName(i.toolCall)));
    const useAccordion =
      accordionEnabled &&
      shouldShowAccordion &&
      segment.length >= MIN_TOOLS_FOR_ACCORDION &&
      allGroupable;

    if (useAccordion) {
      const allToolsComplete = segment.every((item) => item.toolMessage !== null);
      rendered.push(
        <ToolMessageAccordion
          key={`accordion-${runStartId}-${segIndex}`}
          items={segment}
          messageId={runStartId}
          segmentIndex={segIndex}
          isExploring={isRunning}
          isRunning={isRunning}
          allToolsComplete={allToolsComplete}
          renderToolCall={(opts) => renderToolCall(opts as any)}
          isLight={isLight}
        />
      );
    } else {
      segment.forEach(({ toolMessage, toolCall }) => {
        rendered.push(
          <div key={toolCall.id}>
            {renderToolCall({ toolCall: toolCall as any, toolMessage: (toolMessage ?? undefined) as any })}
          </div>
        );
      });
    }
  });

  return <>{rendered}</>;
};

export default ExploreAccordionToolCallsView;
