import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@extension/ui';
import { useStorage } from '@extension/shared';
import { themeStorage, preferencesStorage, type ChatFontSize } from '@extension/storage';

interface SettingsModalProps {
  isOpen: boolean;
  isLight: boolean;
  showAgentCursor: boolean;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  agentModeChat: boolean;
  agentType?: string;
  modelType?: string;
  organizationId?: string;
  teamId?: string;
  onClose: () => void;
  onShowAgentCursorChange: (show: boolean) => void;
  onShowSuggestionsChange: (show: boolean) => void;
  onShowThoughtBlocksChange: (show: boolean) => void;
  onAgentModeChatChange: (enabled: boolean) => void;
  sharedContexts?: {
    multiPageMetadata?: any;
    userContext?: any;
    workspaceContext?: any;
    selectedNotes?: any[];
    selectedCredentials?: any[];
  };
}

interface ToolParameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

interface ToolDefinition {
  name: string;
  description?: string;
  source?: string;
  available?: string;
  parameters?: ToolParameter[];
  mcp_server?: string;
  mcpServer?: {
    id: string;
    serverKey: string;
    displayName: string;
    transport: string;
  } | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  isLight,
  showAgentCursor,
  showSuggestions,
  showThoughtBlocks,
  agentModeChat,
  agentType,
  modelType,
  organizationId,
  teamId,
  onClose,
  onShowAgentCursorChange,
  onShowSuggestionsChange,
  onShowThoughtBlocksChange,
  onAgentModeChatChange,
  sharedContexts,
}) => {
  const { theme } = useStorage(themeStorage);
  const { chatFontSize } = useStorage(preferencesStorage);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [contextsExpanded, setContextsExpanded] = useState(false);
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(new Set());
  const [categoryExpanded, setCategoryExpanded] = useState<Record<string, boolean>>({
    frontend: false,
    backend: false,
    builtin: false,
    mcp: false,
    custom: false,
  });
  const [expandedMcpServers, setExpandedMcpServers] = useState<Set<string>>(new Set());
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [hasFetchedTools, setHasFetchedTools] = useState(false);

  const canFetchTools = Boolean(agentType && modelType && organizationId && teamId);

  const backendUrl = useMemo(() => process.env.CEB_BACKEND_URL || 'http://localhost:8001', []);

  const fetchTools = useCallback(async () => {
    if (!agentType || !modelType || !organizationId || !teamId) {
      return;
    }
    setToolsLoading(true);
    setToolsError(null);
    try {
      const response = await fetch(`${backendUrl}/tools/${agentType}/${modelType}`, {
        headers: {
          'x-copilot-organization-id': organizationId,
          'x-copilot-team-id': teamId,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to load tools (${response.status})`);
      }

      const data = await response.json();
      const fetchedTools = Array.isArray(data?.tools) ? data.tools : [];
      setTools(fetchedTools);
    } catch (err) {
      console.error('[SettingsModal] Failed to load tools', err);
      setToolsError(err instanceof Error ? err.message : 'Failed to load available tools');
    } finally {
      setToolsLoading(false);
      setHasFetchedTools(true);
    }
  }, [agentType, backendUrl, modelType, organizationId, teamId]);

  useEffect(() => {
    setTools([]);
    setToolsError(null);
    setHasFetchedTools(false);
    setCategoryExpanded({});
  }, [agentType, modelType, organizationId, teamId]);

  useEffect(() => {
    if (isOpen && canFetchTools && !hasFetchedTools) {
      fetchTools().catch(() => {
        /* handled above */
      });
    }
  }, [canFetchTools, fetchTools, hasFetchedTools, isOpen]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const groupedTools = useMemo(() => {
    const grouped: Record<string, ToolDefinition[]> = {};
    const mcpServerGroups: Record<string, { server: NonNullable<ToolDefinition['mcpServer']>; tools: ToolDefinition[] }> = {};
    
    tools.forEach(tool => {
      const key = (tool?.source || 'custom').toLowerCase();
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(tool);
      
      // Group MCP tools by server
      if (key === 'mcp') {
        if (tool.mcpServer) {
          const serverId = tool.mcpServer.id;
          if (!mcpServerGroups[serverId]) {
            mcpServerGroups[serverId] = {
              server: tool.mcpServer,
              tools: [],
            };
          }
          mcpServerGroups[serverId].tools.push(tool);
        } else {
          // Fallback: create a default server group for tools without mcpServer
          const defaultServerId = tool.mcp_server || 'unknown';
          if (!mcpServerGroups[defaultServerId]) {
            mcpServerGroups[defaultServerId] = {
              server: {
                id: defaultServerId,
                serverKey: defaultServerId,
                displayName: tool.mcp_server || 'Unknown Server',
                transport: 'unknown',
              },
              tools: [],
            };
          }
          mcpServerGroups[defaultServerId].tools.push(tool);
        }
      }
    });
    
    return { grouped, mcpServerGroups };
  }, [tools]);

  const totalToolCount = tools.length;

  const sourceStyles = useCallback(
    (source?: string) => {
      const normalized = (source || 'custom').toLowerCase();
      switch (normalized) {
        case 'mcp':
          return {
            label: 'MCP',
            className: isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/30 text-purple-300',
          };
        case 'builtin':
          return {
            label: 'Built-in',
            className: isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/30 text-amber-300',
          };
        case 'backend':
          return {
            label: 'Backend',
            className: isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-300',
          };
        case 'frontend':
          return {
            label: 'Frontend',
            className: isLight ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-300',
          };
        default:
          return {
            label: 'Custom',
            className: isLight ? 'bg-gray-200 text-gray-700' : 'bg-gray-800 text-gray-300',
          };
      }
    },
    [isLight],
  );

  const formatToolName = useCallback((value: string) => {
    if (!value) return 'Untitled Tool';
    const cleaned = value.replace(/^(corp-|mcp_|builtin_)/, '').replace(/_/g, ' ').trim();
    if (!cleaned) return value;
    return cleaned
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }, []);

  const handleToggleTools = useCallback(() => {
    const next = !toolsExpanded;
    setToolsExpanded(next);
    if (next && canFetchTools && !hasFetchedTools) {
      fetchTools().catch(() => {
        /* handled above */
      });
    }
  }, [canFetchTools, fetchTools, hasFetchedTools, toolsExpanded]);

  return (
    <>
      {/* Backdrop - conditionally rendered */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[10000] backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Modal - Always mounted, visibility controlled with CSS */}
      <div 
        className={cn(
          'fixed inset-0 z-[10001] flex items-center justify-center p-4 transition-opacity',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        <div
          className={cn(
            'w-full max-w-sm rounded-lg shadow-xl',
            isLight
              ? 'bg-gray-50 border border-gray-200'
              : 'bg-[#151C24] border border-gray-700'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between px-3 py-2 border-b',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          >
            <h2
              className={cn(
                'text-sm font-semibold',
                isLight ? 'text-gray-900' : 'text-gray-100'
              )}
            >
              Settings
            </h2>
            <button
              onClick={onClose}
              className={cn(
                'p-0.5 rounded-md transition-colors',
                isLight
                  ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              )}
            >
              <svg
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-3 py-3 space-y-3">
            {/* Theme Selection */}
            <div className="space-y-1.5">
              <label
                className={cn(
                  'text-xs font-medium',
                  isLight ? 'text-gray-900' : 'text-gray-100'
                )}
              >
                Theme
              </label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => themeStorage.setTheme('light')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'light'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>Light</span>
                </button>
                
                <button
                  onClick={() => themeStorage.setTheme('dark')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'dark'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span>Dark</span>
                </button>
                
                <button
                  onClick={() => themeStorage.setTheme('system')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'system'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>System</span>
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />

            {/* Font Size Selection */}
            <div className="space-y-1.5">
              <label
                className={cn(
                  'text-xs font-medium',
                  isLight ? 'text-gray-900' : 'text-gray-100'
                )}
              >
                Chat Font Size
              </label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => preferencesStorage.setChatFontSize('small')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    chatFontSize === 'small'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                  </svg>
                  <span>Small</span>
                </button>
                
                <button
                  onClick={() => preferencesStorage.setChatFontSize('medium')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    chatFontSize === 'medium'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  <span>Medium</span>
                </button>
                
                <button
                  onClick={() => preferencesStorage.setChatFontSize('large')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    chatFontSize === 'large'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  )}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <span>Large</span>
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />

            {/* Show Agent Cursor Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label
                  htmlFor="show-agent-cursor"
                  className="text-xs font-medium cursor-pointer"
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                >
                  Show Agent Cursor
                </label>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isLight ? 'text-gray-500' : 'text-gray-400'
                  )}
                >
                  Display typing indicator
                </p>
              </div>
              <button
                id="show-agent-cursor"
                role="switch"
                aria-checked={showAgentCursor}
                onClick={() => onShowAgentCursorChange(!showAgentCursor)}
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1 ml-3',
                  showAgentCursor
                    ? 'bg-blue-600 focus:ring-blue-500'
                    : isLight
                    ? 'bg-gray-200 focus:ring-gray-300'
                    : 'bg-gray-600 focus:ring-gray-500'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    showAgentCursor ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* Divider */}
            <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />

            {/* Show Suggestions Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label
                  htmlFor="show-suggestions"
                  className="text-xs font-medium cursor-pointer"
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                >
                  Show Suggestions
                </label>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isLight ? 'text-gray-500' : 'text-gray-400'
                  )}
                >
                  Display contextual suggestions
                </p>
              </div>
              <button
                id="show-suggestions"
                role="switch"
                aria-checked={showSuggestions}
                onClick={() => onShowSuggestionsChange(!showSuggestions)}
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1 ml-3',
                  showSuggestions
                    ? 'bg-blue-600 focus:ring-blue-500'
                    : isLight
                    ? 'bg-gray-200 focus:ring-gray-300'
                    : 'bg-gray-600 focus:ring-gray-500'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    showSuggestions ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* Divider */}
            <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />

            {/* Show Thought Blocks Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label
                  htmlFor="show-thought-blocks"
                  className="text-xs font-medium cursor-pointer"
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                >
                  Show Thought Blocks
                </label>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isLight ? 'text-gray-500' : 'text-gray-400'
                  )}
                >
                  Reveal the assistant's hidden reasoning
                </p>
              </div>
              <button
                id="show-thought-blocks"
                role="switch"
                aria-checked={showThoughtBlocks}
                onClick={() => onShowThoughtBlocksChange(!showThoughtBlocks)}
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1 ml-3',
                  showThoughtBlocks
                    ? 'bg-blue-600 focus:ring-blue-500'
                    : isLight
                    ? 'bg-gray-200 focus:ring-gray-300'
                    : 'bg-gray-600 focus:ring-gray-500'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    showThoughtBlocks ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* Divider */}
            <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />

            {/* Available Tools Accordion */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label
                  htmlFor="available-tools-toggle"
                  className="text-xs font-medium cursor-pointer"
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                >
                  Available Tools
                </label>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isLight ? 'text-gray-500' : 'text-gray-400'
                  )}
                >
                  Tools registered for the selected agent and model
                </p>
              </div>
              <button
                id="available-tools-toggle"
                type="button"
                onClick={handleToggleTools}
                className={cn(
                  'flex items-center gap-2 ml-3 transition-colors',
                  isLight ? 'text-gray-700 hover:text-gray-900' : 'text-gray-300 hover:text-white',
                )}
              >
                {toolsLoading ? (
                  <svg className="h-4 w-4 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <span
                    className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded',
                      isLight ? 'bg-gray-200 text-gray-700' : 'bg-gray-800 text-gray-300',
                    )}
                  >
                    {totalToolCount}
                  </span>
                )}
                <svg
                  className={cn(
                    'h-4 w-4 flex-shrink-0 transition-transform duration-300 ease-in-out',
                    toolsExpanded && 'rotate-180',
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            {toolsExpanded && (
              <div className="mt-2">
                {!canFetchTools ? (
                  <div className={cn('rounded-md border px-3 py-2 text-xs', isLight ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-gray-700 bg-gray-800/50 text-gray-400')}>
                    Select an agent, model, organization, and team to view available tools.
                  </div>
                ) : toolsLoading ? (
                  <div className={cn('rounded-md border px-3 py-2 flex items-center gap-2 text-xs', isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-gray-800/50')}>
                    <svg className="h-4 w-4 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span className={cn(isLight ? 'text-gray-600' : 'text-gray-400')}>Loading tools...</span>
                  </div>
                ) : toolsError ? (
                  <div className={cn('rounded-md border px-3 py-2 text-xs', isLight ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-800 bg-red-900/20 text-red-300')}>
                    {toolsError}
                  </div>
                ) : totalToolCount === 0 ? (
                  <div className={cn('rounded-md border px-3 py-2 text-xs', isLight ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-gray-700 bg-gray-800/50 text-gray-400')}>
                    No tools are currently registered for this agent.
                  </div>
                ) : (
                  <div
                    className={cn(
                      'rounded-md border',
                      isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                    )}
                  >
                    {/* Tool Categories */}
                    <div 
                      className="max-h-[320px] overflow-y-auto rounded-md"
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: isLight ? '#d1d5db #f3f4f6' : '#4b5563 #1f2937',
                      }}
                    >
                      {tools.length === 0 ? (
                        <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          No tools available
                        </div>
                      ) : (
                        <>
                          {(['frontend', 'builtin', 'backend', 'mcp'] as const).map(type => {
                            const categoryTools = groupedTools.grouped[type] || [];
                            if (categoryTools.length === 0) return null;

                            const isExpanded = categoryExpanded[type] ?? false;
                            const toolCount = categoryTools.length;

                            return (
                              <div key={type} className={cn('border-b last:border-b-0', isLight ? 'border-gray-200' : 'border-gray-700')}>
                                {/* Category Header */}
                                <div className={cn('sticky top-0 z-10 flex items-center justify-between gap-2 px-2 py-1.5', isLight ? 'bg-white' : 'bg-[#151C24]')}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCategoryExpanded(prev => ({
                                        ...prev,
                                        [type]: !prev[type],
                                      }));
                                    }}
                                    className={cn(
                                      'flex items-center gap-1.5 text-xs font-medium transition-colors text-left',
                                      isLight ? 'text-gray-700 hover:text-gray-700' : 'text-gray-300 hover:text-[#bcc1c7]'
                                    )}
                                  >
                                    <svg
                                      className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-90')}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      strokeWidth={2}
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                    <span>{sourceStyles(type).label}</span>
                                  </button>
                                  <span className={cn('text-[10px] flex-shrink-0', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                    {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
                                  </span>
                                </div>

                                {/* Category Tools */}
                                {isExpanded && type !== 'mcp' && (
                                  <div 
                                    className="overflow-x-auto"
                                    style={{
                                      scrollbarWidth: 'thin',
                                      scrollbarColor: isLight ? '#d1d5db #f3f4f6' : '#4b5563 #1f2937',
                                    }}
                                  >
                                    {categoryTools.map((tool, index) => (
                                      <div
                                        key={`${tool.name}-${index}`}
                                        className={cn(
                                          'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                                          isLight
                                            ? 'text-gray-700 hover:bg-gray-100'
                                            : 'text-gray-200 hover:bg-gray-700'
                                        )}
                                      >
                                        <div className={cn(
                                          'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 bg-blue-600 border-blue-600'
                                        )}>
                                          <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                        </div>
                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                          <span className="font-medium">{formatToolName(tool.name)}</span>
                                          {tool.description && (
                                            <>
                                              <span className={cn('flex-shrink-0', isLight ? 'text-gray-400' : 'text-gray-500')}>|</span>
                                              <span className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                                {tool.description}
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* MCP Server Groups */}
                                {isExpanded && type === 'mcp' && (
                                  <div>
                                    {Object.values(groupedTools.mcpServerGroups).map(({ server, tools: serverTools }) => {
                                      if (serverTools.length === 0) return null;

                                      const isServerExpanded = expandedMcpServers.has(server.id);

                                      return (
                                        <div key={server.id} className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')}>
                                          {/* MCP Server Header */}
                                          <div className={cn('sticky top-0 z-10 flex items-center gap-2 pl-6 pr-4 py-1.5', isLight ? 'bg-white' : 'bg-[#151C24]')}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setExpandedMcpServers(prev => {
                                                  const next = new Set(prev);
                                                  if (next.has(server.id)) {
                                                    next.delete(server.id);
                                                  } else {
                                                    next.add(server.id);
                                                  }
                                                  return next;
                                                });
                                              }}
                                              className={cn('flex-shrink-0', isLight ? 'text-gray-500' : 'text-gray-400')}
                                            >
                                              <svg
                                                className={cn('w-3 h-3 transition-transform', isServerExpanded && 'rotate-90')}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                strokeWidth={2.5}
                                              >
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                              </svg>
                                            </button>
                                            <span className={cn('flex-1 text-[11px] font-medium truncate', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                              {server.displayName}
                                            </span>
                                            <span className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-500')}>
                                              {serverTools.length} {serverTools.length === 1 ? 'tool' : 'tools'}
                                            </span>
                                          </div>

                                          {/* MCP Server Tools */}
                                          {isServerExpanded && (
                                            <div 
                                              className="overflow-x-auto"
                                              style={{
                                                scrollbarWidth: 'thin',
                                                scrollbarColor: isLight ? '#d1d5db #f3f4f6' : '#4b5563 #1f2937',
                                              }}
                                            >
                                              {serverTools.map((tool, index) => (
                                                <div
                                                  key={`${tool.name}-${index}`}
                                                  className={cn(
                                                    'flex items-center gap-2 w-full pl-12 pr-3 py-1.5 text-xs transition-colors',
                                                    isLight
                                                      ? 'text-gray-700 hover:bg-gray-100'
                                                      : 'text-gray-200 hover:bg-gray-700'
                                                  )}
                                                >
                                                  <div className={cn(
                                                    'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 bg-blue-600 border-blue-600'
                                                  )}>
                                                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                    <span className="font-medium">{formatToolName(tool.name)}</span>
                                                    {tool.description && (
                                                      <>
                                                        <span className={cn('flex-shrink-0', isLight ? 'text-gray-400' : 'text-gray-500')}>|</span>
                                                        <span className={cn('text-[10px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                                          {tool.description}
                                                        </span>
                                                      </>
                                                    )}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            <div className={cn('border-t', isLight ? 'border-gray-200' : 'border-gray-700')} />

            {/* Shared Contexts Accordion */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label
                  htmlFor="shared-contexts-toggle"
                  className="text-xs font-medium cursor-pointer"
                  style={{ color: isLight ? '#374151' : '#bcc1c7' }}
                >
                  Shared Contexts
                </label>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isLight ? 'text-gray-500' : 'text-gray-400'
                  )}
                >
                  Context data shared with the agent
                </p>
              </div>
              <button
                id="shared-contexts-toggle"
                type="button"
                onClick={() => setContextsExpanded(!contextsExpanded)}
                className={cn(
                  'flex items-center gap-2 ml-3 transition-colors',
                  isLight ? 'text-gray-600 hover:text-gray-700' : 'text-gray-400 hover:text-[#bcc1c7]'
                )}
              >
                <span
                  className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded',
                    isLight ? 'bg-gray-200 text-gray-700' : 'bg-gray-800 text-gray-300',
                  )}
                >
                  {(() => {
                    // Calculate sum of selected items: notes + credentials + pages
                    let count = 0;
                    if (sharedContexts?.selectedNotes) count += sharedContexts.selectedNotes.length;
                    if (sharedContexts?.selectedCredentials) count += sharedContexts.selectedCredentials.length;
                    if (sharedContexts?.multiPageMetadata?.selectedPages?.count) {
                      count += sharedContexts.multiPageMetadata.selectedPages.count;
                    }
                    return count;
                  })()}
                </span>
                <svg
                  className={cn(
                    'h-4 w-4 flex-shrink-0 transition-transform duration-300 ease-in-out',
                    contextsExpanded && 'rotate-180',
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            {contextsExpanded && (
              <div className="mt-2">
                <div
                  className={cn(
                    'rounded-md border',
                    isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                  )}
                >
                  <div 
                    className="max-h-[320px] overflow-y-auto rounded-md"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: isLight ? '#d1d5db #f3f4f6' : '#4b5563 #1f2937',
                    }}
                  >
                    {/* Multi-page Context */}
                    <div className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedContexts(prev => {
                            const next = new Set(prev);
                            if (next.has('multiPage')) {
                              next.delete('multiPage');
                            } else {
                              next.add('multiPage');
                            }
                            return next;
                          });
                        }}
                        className={cn('w-full px-3 py-2 text-left transition-colors', isLight ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-800/30 hover:bg-gray-800/50')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <svg
                              className={cn('w-3 h-3 flex-shrink-0 transition-transform', expandedContexts.has('multiPage') && 'rotate-90')}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <div className={cn('text-xs font-medium', isLight ? 'text-gray-800' : 'text-gray-200')}>
                              Multi-page Context
                            </div>
                          </div>
                          {(() => {
                            const pageCount = sharedContexts?.multiPageMetadata?.selectedPages?.count ?? 0;
                            return pageCount > 0 ? (
                              <span className={cn('text-[10px] flex-shrink-0', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </button>
                      {expandedContexts.has('multiPage') && (
                        <div className={cn('px-3 pb-3 pt-2', isLight ? 'bg-gray-50' : 'bg-gray-800/30')}>
                          <pre className={cn(
                            'text-[10px] p-2 rounded overflow-x-auto',
                            isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-900/50 text-gray-300'
                          )}
                          style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: isLight ? '#d1d5db #f3f4f6' : '#4b5563 #1f2937',
                          }}
                          >
                            {JSON.stringify(sharedContexts?.multiPageMetadata || { note: 'No data available' }, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* User Context */}
                    <div className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedContexts(prev => {
                            const next = new Set(prev);
                            if (next.has('user')) {
                              next.delete('user');
                            } else {
                              next.add('user');
                            }
                            return next;
                          });
                        }}
                        className={cn('w-full px-3 py-2 text-left transition-colors', isLight ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-800/30 hover:bg-gray-800/50')}
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            className={cn('w-3 h-3 flex-shrink-0 transition-transform', expandedContexts.has('user') && 'rotate-90')}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <div className={cn('text-xs font-medium', isLight ? 'text-gray-800' : 'text-gray-200')}>
                            User Context
                          </div>
                        </div>
                      </button>
                      {expandedContexts.has('user') && (
                        <div className={cn('px-3 pb-3 pt-2', isLight ? 'bg-gray-50' : 'bg-gray-800/30')}>
                          <pre className={cn(
                            'text-[10px] p-2 rounded overflow-x-auto',
                            isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-900/50 text-gray-300'
                          )}
                          style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: isLight ? '#d1d5db #f3f4f6' : '#4b5563 #1f2937',
                          }}
                          >
                            {JSON.stringify(sharedContexts?.userContext || { note: 'No data available' }, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* Workspace Context */}
                    <div className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedContexts(prev => {
                            const next = new Set(prev);
                            if (next.has('workspace')) {
                              next.delete('workspace');
                            } else {
                              next.add('workspace');
                            }
                            return next;
                          });
                        }}
                        className={cn('w-full px-3 py-2 text-left transition-colors', isLight ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-800/30 hover:bg-gray-800/50')}
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            className={cn('w-3 h-3 flex-shrink-0 transition-transform', expandedContexts.has('workspace') && 'rotate-90')}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <div className={cn('text-xs font-medium', isLight ? 'text-gray-800' : 'text-gray-200')}>
                            Workspace Context
                          </div>
                        </div>
                      </button>
                      {expandedContexts.has('workspace') && (
                        <div className={cn('px-3 pb-3 pt-2', isLight ? 'bg-gray-50' : 'bg-gray-800/30')}>
                          <pre className={cn(
                            'text-[10px] p-2 rounded overflow-x-auto',
                            isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-900/50 text-gray-300'
                          )}
                          style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: isLight ? '#d1d5db #f3f4f6' : '#4b5563 #1f2937',
                          }}
                          >
                            {JSON.stringify(sharedContexts?.workspaceContext || { note: 'No data available' }, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* Selected Notes Context - Only show when notes are available */}
                    {sharedContexts?.selectedNotes && sharedContexts.selectedNotes.length > 0 && (
                      <div className={cn('border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedContexts(prev => {
                              const next = new Set(prev);
                              if (next.has('notes')) {
                                next.delete('notes');
                              } else {
                                next.add('notes');
                              }
                              return next;
                            });
                          }}
                          className={cn('w-full px-3 py-2 text-left transition-colors', isLight ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-800/30 hover:bg-gray-800/50')}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <svg
                                className={cn('w-3 h-3 flex-shrink-0 transition-transform', expandedContexts.has('notes') && 'rotate-90')}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2.5}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <div className={cn('text-xs font-medium', isLight ? 'text-gray-800' : 'text-gray-200')}>
                                Selected Notes Context
                              </div>
                            </div>
                            <span className={cn('text-[10px] flex-shrink-0', isLight ? 'text-gray-500' : 'text-gray-400')}>
                              {sharedContexts.selectedNotes.length} {sharedContexts.selectedNotes.length === 1 ? 'note' : 'notes'}
                            </span>
                          </div>
                        </button>
                        {expandedContexts.has('notes') && (
                          <div className={cn('px-3 pb-3 pt-2', isLight ? 'bg-gray-50' : 'bg-gray-800/30')}>
                            <pre className={cn(
                              'text-[10px] p-2 rounded overflow-x-auto',
                              isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-900/50 text-gray-300'
                            )}
                            style={{
                              scrollbarWidth: 'thin',
                              scrollbarColor: isLight ? '#d1d5db #f3f4f6' : '#4b5563 #1f2937',
                            }}
                            >
                              {JSON.stringify(sharedContexts.selectedNotes.map(note => ({
                                id: note.id,
                                title: note.title,
                                content: note.content,
                              })), null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Selected Credentials Context - Only show when credentials are available */}
                    {sharedContexts?.selectedCredentials && sharedContexts.selectedCredentials.length > 0 && (
                      <div className={cn('border-b last:border-b-0', isLight ? 'border-gray-200' : 'border-gray-700')}>
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedContexts(prev => {
                              const next = new Set(prev);
                              if (next.has('credentials')) {
                                next.delete('credentials');
                              } else {
                                next.add('credentials');
                              }
                              return next;
                            });
                          }}
                          className={cn('w-full px-3 py-2 text-left transition-colors', isLight ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-800/30 hover:bg-gray-800/50')}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <svg
                                className={cn('w-3 h-3 flex-shrink-0 transition-transform', expandedContexts.has('credentials') && 'rotate-90')}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2.5}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <div className={cn('text-xs font-medium', isLight ? 'text-gray-800' : 'text-gray-200')}>
                                Selected Credentials Context
                              </div>
                            </div>
                            <span className={cn('text-[10px] flex-shrink-0', isLight ? 'text-gray-500' : 'text-gray-400')}>
                              {sharedContexts.selectedCredentials.length} {sharedContexts.selectedCredentials.length === 1 ? 'credential' : 'credentials'}
                            </span>
                          </div>
                        </button>
                        {expandedContexts.has('credentials') && (
                          <div className={cn('px-3 pb-3 pt-2', isLight ? 'bg-gray-50' : 'bg-gray-800/30')}>
                            <pre className={cn(
                              'text-[10px] p-2 rounded overflow-x-auto',
                              isLight ? 'bg-gray-100 text-gray-800' : 'bg-gray-900/50 text-gray-300'
                            )}
                            style={{
                              scrollbarWidth: 'thin',
                              scrollbarColor: isLight ? '#d1d5db #f3f4f6' : '#4b5563 #1f2937',
                            }}
                            >
                              {JSON.stringify(sharedContexts.selectedCredentials.map(cred => ({
                                id: cred.id,
                                name: cred.name,
                                type: cred.type,
                                key: cred.key,
                              })), null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className={cn(
              'flex items-center justify-end gap-2 px-3 py-2 border-t',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          >
            <button
              onClick={onClose}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                isLight
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

