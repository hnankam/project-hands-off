import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn, Button } from '@extension/ui';
import { authClient } from '../../lib/auth-client';
import { OrganizationSelector } from './OrganizationSelector';
import { TeamSelector } from './TeamSelector';
import { TeamMultiSelector } from './TeamMultiSelector';
import { Checkbox, Radio } from './FormControls';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: any;
  createdAt: string | Date;
}

interface Team {
  id: string;
  name: string;
  organizationId: string;
}

type ToolType = 'frontend' | 'backend' | 'builtin' | 'mcp';

interface ToolRecord {
  id: string;
  toolKey: string;
  toolName: string;
  toolType: ToolType;
  description: string;
  metadata: Record<string, any>;
  config: Record<string, any>;
  organizationId: string | null;
  teams: Array<{ id: string; name?: string }>;
  enabled: boolean;
  readonly: boolean;
  remoteToolName?: string | null;
  mcpServerId?: string | null;
  mcpServer?: {
    id: string;
    serverKey: string;
    displayName: string;
    transport: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface McpServerRecord {
  id: string;
  serverKey: string;
  displayName: string;
  transport: 'stdio' | 'sse' | 'ws';
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
  metadata: Record<string, any>;
  organizationId: string | null;
  teams: Array<{ id: string; name: string }>; // Multi-team support
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ToolsTabProps {
  isLight: boolean;
  organizations: Organization[];
  preselectedOrgId?: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

type McpServerScope = 'organization' | 'team';

interface McpServerFormState {
  serverKey: string;
  displayName: string;
  transport: 'stdio' | 'sse' | 'ws';
  command: string;
  args: string;
  url: string;
  env: string;
  metadata: string;
  scope: McpServerScope;
  teamIds: string[]; // Multi-team support
  enabled: boolean;
}

const INITIAL_SERVER_FORM: McpServerFormState = {
  serverKey: '',
  displayName: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  env: '{}',
  metadata: '{}',
  scope: 'organization',
  teamIds: [], // Multi-team support
  enabled: true,
};

// Transport Selector Component
interface TransportSelectorProps {
  isLight: boolean;
  value: 'stdio' | 'sse' | 'ws';
  onChange: (value: 'stdio' | 'sse' | 'ws') => void;
}

const TransportSelector: React.FC<TransportSelectorProps> = ({ isLight, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  const options: Array<{ value: 'stdio' | 'sse' | 'ws'; label: string }> = [
    { value: 'stdio', label: 'stdio' },
    { value: 'sse', label: 'sse' },
    { value: 'ws', label: 'ws' },
  ];

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-between gap-1.5 px-3 py-1.5 text-xs rounded-md min-h-[32px] w-full border',
          isLight
            ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <span className="font-medium">{selectedOption?.label}</span>
        <svg
          className={cn('transition-transform flex-shrink-0', isOpen ? 'rotate-180' : '')}
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1 w-full rounded-md border shadow-lg max-h-[240px] overflow-auto',
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#1C2630] border-gray-700',
          )}
        >
          {options.map(option => (
            <button
              type="button"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors',
                value === option.value
                  ? isLight
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-blue-900/30 text-blue-400'
                  : isLight
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-200 hover:bg-gray-700',
              )}
            >
              <div className={cn(
                'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                value === option.value
                  ? 'bg-blue-600 border-blue-600'
                  : isLight
                    ? 'border-gray-300'
                    : 'border-gray-600'
              )}>
                {value === option.value && (
                  <svg
                    width="10"
                    height="10"
                    fill="none"
                    stroke="white"
                    viewBox="0 0 24 24"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ToolsTab: React.FC<ToolsTabProps> = ({ isLight, organizations, preselectedOrgId, onError, onSuccess }) => {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const [selectedOrgId, setSelectedOrgId] = useState<string>(() => preselectedOrgId || organizations[0]?.id || '');
  const [teamFilterIds, setTeamFilterIds] = useState<string[]>([]);

  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [servers, setServers] = useState<McpServerRecord[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const [loadingTools, setLoadingTools] = useState(false);
  const [loadingServers, setLoadingServers] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingToolsForServer, setLoadingToolsForServer] = useState<string | null>(null);
  const [showAddServerForm, setShowAddServerForm] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [expandedServerArgs, setExpandedServerArgs] = useState<Set<string>>(new Set());
  const [testStatus, setTestStatus] = useState<{
    state: 'idle' | 'loading' | 'success' | 'error';
    message?: string;
  }>({ state: 'idle' });
  const [testStatusClosing, setTestStatusClosing] = useState(false);
  const [loadToolsStatus, setLoadToolsStatus] = useState<{
    state: 'idle' | 'loading' | 'success' | 'error';
    message?: string;
  }>({ state: 'idle' });
  const [loadToolsStatusClosing, setLoadToolsStatusClosing] = useState(false);

  const [serverForm, setServerForm] = useState<McpServerFormState>(INITIAL_SERVER_FORM);
  const [editServerForm, setEditServerForm] = useState<McpServerFormState | null>(null);

  // Bulk edit state
  const [editMode, setEditMode] = useState<Record<ToolType, boolean>>({
    frontend: false,
    backend: false,
    builtin: false,
    mcp: false,
  });
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [bulkScope, setBulkScope] = useState<'organization' | 'team'>('organization');
  const [bulkTeamIds, setBulkTeamIds] = useState<string[]>([]);
  const [applyingBulkEdit, setApplyingBulkEdit] = useState(false);

  const canSubmitServer = serverForm.serverKey.trim() !== '' && serverForm.displayName.trim() !== '';
  const canSubmitEditServer = editServerForm 
    ? editServerForm.serverKey.trim() !== '' && editServerForm.displayName.trim() !== ''
    : false;

  const fetchTeams = useCallback(async () => {
    if (!selectedOrgId) {
      setTeams([]);
      return;
    }
    setLoadingTeams(true);
    try {
      try {
        await (authClient.organization as any).setActive({ organizationId: selectedOrgId });
      } catch (err) {
        console.warn('[ToolsTab] Failed to set active organization', err);
      }

      const { data, error } = await (authClient.organization as any).listTeams({
        query: { organizationId: selectedOrgId },
      });

      if (error) throw new Error(error.message);

      const teamsForOrg = (data || []).filter((team: Team) => team.organizationId === selectedOrgId);
      setTeams(teamsForOrg);
    } catch (err) {
      console.warn('[ToolsTab] Failed to load teams:', err);
      setTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  }, [selectedOrgId]);

  // Auto-dismiss test status after timeout
  useEffect(() => {
    if (testStatus.state === 'idle' || testStatus.state === 'loading') return;

    const timeout = testStatus.state === 'success' ? 5000 : 8000;
    const timer = setTimeout(() => {
      setTestStatusClosing(true);
      setTimeout(() => {
        setTestStatus({ state: 'idle' });
        setTestStatusClosing(false);
      }, 300);
    }, timeout);

    return () => clearTimeout(timer);
  }, [testStatus.state]);

  // Auto-dismiss load tools status after timeout
  useEffect(() => {
    if (loadToolsStatus.state === 'idle' || loadToolsStatus.state === 'loading') return;

    const timeout = loadToolsStatus.state === 'success' ? 5000 : 8000;
    const timer = setTimeout(() => {
      setLoadToolsStatusClosing(true);
      setTimeout(() => {
        setLoadToolsStatus({ state: 'idle' });
        setLoadToolsStatusClosing(false);
      }, 300);
    }, timeout);

    return () => clearTimeout(timer);
  }, [loadToolsStatus.state]);

  const loadTools = useCallback(async () => {
    if (!selectedOrgId) {
      setTools([]);
      return;
    }
    setLoadingTools(true);
    try {
      const params = new URLSearchParams({ organizationId: selectedOrgId });
      // Add all selected teams for filtering
      teamFilterIds.forEach(teamId => {
        if (teamId) params.append('teamIds', teamId);
      });
      const response = await fetch(`${baseURL}/api/admin/tools?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to load tools (${response.status})`);
      }
      const data = await response.json();
      setTools(Array.isArray(data.tools) ? data.tools : []);
    } catch (err) {
      console.error('[ToolsTab] Failed to load tools', err);
      onError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setLoadingTools(false);
    }
  }, [baseURL, onError, selectedOrgId, teamFilterIds]);

  const loadServers = useCallback(async () => {
    if (!selectedOrgId) {
      setServers([]);
      return;
    }
    setLoadingServers(true);
    try {
      const params = new URLSearchParams({ organizationId: selectedOrgId });
      // Add all selected teams for filtering
      teamFilterIds.forEach(teamId => {
        if (teamId) params.append('teamIds', teamId);
      });
      const response = await fetch(`${baseURL}/api/admin/tools/mcp-servers?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to load MCP servers (${response.status})`);
      }
      const data = await response.json();
      setServers(Array.isArray(data.servers) ? data.servers : []);
    } catch (err) {
      console.error('[ToolsTab] Failed to load MCP servers', err);
      onError(err instanceof Error ? err.message : 'Failed to load MCP servers');
    } finally {
      setLoadingServers(false);
    }
  }, [baseURL, onError, selectedOrgId, teamFilterIds]);

  useEffect(() => {
    if (!selectedOrgId && organizations.length > 0) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [organizations, selectedOrgId]);

  useEffect(() => {
    if (preselectedOrgId && preselectedOrgId !== selectedOrgId) {
      setSelectedOrgId(preselectedOrgId);
    }
  }, [preselectedOrgId]); // Only react to parent changes, not user selections

  useEffect(() => {
    if (!selectedOrgId) {
      setTeamFilterIds([]);
      setTeams([]);
      setTools([]);
      setServers([]);
      return;
    }
    fetchTeams();
  }, [fetchTeams, selectedOrgId]);

  useEffect(() => {
    loadTools();
    loadServers();
  }, [loadTools, loadServers]);

  const groupedTools = useMemo(() => {
    const groups: Record<ToolType, ToolRecord[]> = {
      frontend: [],
      backend: [],
      builtin: [],
      mcp: [],
    };
    for (const tool of tools) {
      if (groups[tool.toolType]) {
        groups[tool.toolType].push(tool);
      }
    }
    return groups;
  }, [tools]);

  const renderToolScopeBadge = (tool: ToolRecord) => {
    if (tool.teams && tool.teams.length > 0) {
      // Show team chips for each team
      return (
        <div className="flex flex-wrap gap-1">
          {tool.teams.map((toolTeam) => {
            const team = teams.find(t => t.id === toolTeam.id);
            return (
              <span
                key={toolTeam.id}
                className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                  isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400',
                )}
              >
                Team · {team?.name || 'Unknown'}
              </span>
            );
          })}
        </div>
      );
    }
    return (
      <span
        className={cn(
          'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
          isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/30 text-purple-400',
        )}
      >
        Organization
      </span>
    );
  };

  const renderServerScopeBadge = (server: McpServerRecord) => {
    if (server.teams.length > 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {server.teams.map(team => (
            <span
              key={team.id}
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400',
              )}
            >
              Team · {team.name}
            </span>
          ))}
        </div>
      );
    }
    return (
      <span
        className={cn(
          'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
          isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/30 text-purple-400',
        )}
      >
        Organization
      </span>
    );
  };

  const handleToggleTool = async (tool: ToolRecord) => {
    // Optimistically update the UI immediately
    const newEnabledState = !tool.enabled;
    setTools(prevTools =>
      prevTools.map(t => (t.id === tool.id ? { ...t, enabled: newEnabledState } : t))
    );

    try {
      // For global tools (frontend, builtin, backend), pass selectedOrgId for auth
      // but the backend will handle them as global tools
      // For scoped tools (MCP), use their actual org/team IDs
      const isGlobalTool = !tool.organizationId && tool.teams.length === 0;
      const organizationId = isGlobalTool ? selectedOrgId : tool.organizationId;
      const teamIds = isGlobalTool ? [] : tool.teams.map(t => t.id);

      const response = await fetch(`${baseURL}/api/admin/tools/${tool.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          organizationId,
          teamIds,
          enabled: newEnabledState,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        // Revert on error
        setTools(prevTools =>
          prevTools.map(t => (t.id === tool.id ? { ...t, enabled: tool.enabled } : t))
        );
        throw new Error(errorText || 'Failed to update tool');
      }
      onSuccess(`${tool.toolName} ${newEnabledState ? 'enabled' : 'disabled'} successfully`);
    } catch (err) {
      console.error('[ToolsTab] Failed to toggle tool', err);
      onError(err instanceof Error ? err.message : 'Failed to update tool');
    }
  };

  const handleDeleteTool = async (tool: ToolRecord) => {
    if (tool.readonly) {
      onError('Frontend tools cannot be deleted');
      return;
    }
    try {
      const params = new URLSearchParams({ organizationId: selectedOrgId });
      // Use first selected team for filtering, or null for all teams
      if (teamFilterIds.length > 0) {
        params.append('teamId', teamFilterIds[0]);
      }
      const response = await fetch(`${baseURL}/api/admin/tools/${tool.id}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete tool');
      }
      await loadTools();
      onSuccess(`${tool.toolName} deleted successfully`);
    } catch (err) {
      console.error('[ToolsTab] Failed to delete tool', err);
      onError(err instanceof Error ? err.message : 'Failed to delete tool');
    }
  };

  const handleSubmitServer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitServer) {
      return;
    }
    try {
      // Parse JSON fields
      let envJSON = {};
      let metadataJSON = {};
      
      try {
        envJSON = serverForm.env.trim() ? JSON.parse(serverForm.env) : {};
      } catch (e) {
        throw new Error('Invalid JSON in Environment Variables field');
      }
      
      try {
        metadataJSON = serverForm.metadata.trim() ? JSON.parse(serverForm.metadata) : {};
      } catch (e) {
        throw new Error('Invalid JSON in Metadata field');
      }

      const response = await fetch(`${baseURL}/api/admin/tools/mcp-servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          organizationId: selectedOrgId,
          teamIds: serverForm.scope === 'team' ? serverForm.teamIds : [],
          serverKey: serverForm.serverKey.trim(),
          displayName: serverForm.displayName.trim(),
          transport: serverForm.transport,
          command: serverForm.command.trim() || null,
          args: serverForm.args
            .split(',')
            .map(value => value.trim())
            .filter(Boolean),
          enabled: serverForm.enabled,
          url: serverForm.url.trim() || null,
          env: envJSON,
          metadata: metadataJSON,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create MCP server');
      }
      setServerForm(INITIAL_SERVER_FORM);
      setShowAddServerForm(false);
      await loadServers();
      onSuccess('MCP server created successfully');
    } catch (err) {
      console.error('[ToolsTab] Failed to create MCP server', err);
      onError(err instanceof Error ? err.message : 'Failed to create MCP server');
    }
  };

  const handleDeleteServer = async (server: McpServerRecord) => {
    try {
      const params = new URLSearchParams({ organizationId: selectedOrgId });
      // Use first selected team for filtering, or null for all teams
      if (teamFilterIds.length > 0) {
        params.append('teamId', teamFilterIds[0]);
      }
      const response = await fetch(`${baseURL}/api/admin/tools/mcp-servers/${server.id}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete MCP server');
      }
      await Promise.all([loadServers(), loadTools()]);
      onSuccess('MCP server deleted successfully');
    } catch (err) {
      console.error('[ToolsTab] Failed to delete MCP server', err);
      onError(err instanceof Error ? err.message : 'Failed to delete MCP server');
    }
  };

  const startEditServer = (server: McpServerRecord) => {
    setEditingServerId(server.id);
    setEditServerForm({
      serverKey: server.serverKey,
      displayName: server.displayName,
      transport: server.transport,
      command: server.command || '',
      args: server.args.join(','),
      url: server.url || '',
      env: JSON.stringify(server.env || {}, null, 2),
      metadata: JSON.stringify(server.metadata || {}, null, 2),
      scope: server.teams.length > 0 ? 'team' : 'organization',
      teamIds: server.teams.map(t => t.id),
      enabled: server.enabled,
    });
  };

  const cancelEditServer = () => {
    setEditingServerId(null);
    setEditServerForm(null);
    setTestStatus({ state: 'idle' });
  };

  const handleUpdateServer = async (serverId: string) => {
    if (!editServerForm) return;
    
    try {
      // Parse JSON fields
      let envJSON = {};
      let metadataJSON = {};
      
      try {
        envJSON = editServerForm.env.trim() ? JSON.parse(editServerForm.env) : {};
      } catch (e) {
        throw new Error('Invalid JSON in Environment Variables field');
      }
      
      try {
        metadataJSON = editServerForm.metadata.trim() ? JSON.parse(editServerForm.metadata) : {};
      } catch (e) {
        throw new Error('Invalid JSON in Metadata field');
      }

      const response = await fetch(`${baseURL}/api/admin/tools/mcp-servers/${serverId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          organizationId: selectedOrgId,
          teamIds: editServerForm.scope === 'team' ? editServerForm.teamIds : [],
          serverKey: editServerForm.serverKey.trim(),
          displayName: editServerForm.displayName.trim(),
          transport: editServerForm.transport,
          command: editServerForm.command.trim() || null,
          args: editServerForm.args
            .split(',')
            .map(value => value.trim())
            .filter(Boolean),
          enabled: editServerForm.enabled,
          url: editServerForm.url.trim() || null,
          env: envJSON,
          metadata: metadataJSON,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update MCP server');
      }
      cancelEditServer();
      await loadServers();
      onSuccess('MCP server updated successfully');
    } catch (err) {
      console.error('[ToolsTab] Failed to update MCP server', err);
      onError(err instanceof Error ? err.message : 'Failed to update MCP server');
    }
  };

  const handleTestServerConnectivity = async (serverId: string) => {
    setTestStatus({ state: 'loading' });
    
    try {
      const response = await fetch(`${baseURL}/api/admin/tools/mcp-servers/${serverId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          organizationId: selectedOrgId,
          teamIds: [],
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Unknown error' }));
        setTestStatus({
          state: 'error',
          message: result.details || result.error || 'Failed to connect to MCP server',
        });
      return;
    }

      const result = await response.json();
      setTestStatus({
        state: 'success',
        message: result.message || 'Successfully connected to MCP server',
      });
    } catch (err) {
      console.error('[ToolsTab] Failed to test MCP server connectivity', err);
      setTestStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Failed to test connectivity',
      });
    }
  };

  const handleTestServerConnectivityFromForm = async () => {
    setTestStatus({ state: 'loading' });
    try {
      // Parse args and env
      let argsArray: string[] = [];
      if (serverForm.args.trim()) {
        argsArray = serverForm.args.split(',').map(arg => arg.trim()).filter(Boolean);
      }

      let envObject: Record<string, string> = {};
      try {
        if (serverForm.env.trim()) {
          envObject = JSON.parse(serverForm.env);
        }
      } catch (e) {
        setTestStatus({
          state: 'error',
          message: 'Invalid JSON in environment variables field',
        });
        return;
      }

      const response = await fetch(`${baseURL}/api/admin/tools/mcp-servers/test-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          organizationId: selectedOrgId,
          serverConfig: {
            transport: serverForm.transport,
            command: serverForm.command,
            args: argsArray,
            url: serverForm.url,
            env: envObject,
          },
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Unknown error' }));
        setTestStatus({
          state: 'error',
          message: result.details || result.error || 'Failed to connect to MCP server',
        });
        return;
      }

      const result = await response.json();
      setTestStatus({
        state: 'success',
        message: result.message || 'Successfully connected to MCP server',
      });
    } catch (err) {
      console.error('[ToolsTab] Failed to test MCP server connectivity', err);
      setTestStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Failed to test connectivity',
      });
    }
  };

  const handleLoadToolsInEdit = async (serverId: string) => {
    setLoadingToolsForServer(serverId);
    setLoadToolsStatus({ state: 'loading' });
    try {
      const server = servers.find(s => s.id === serverId);
      if (!server) return;

      const response = await fetch(`${baseURL}/api/admin/tools/mcp-servers/${serverId}/load-tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          organizationId: server.organizationId || selectedOrgId,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to load tools from MCP server');
      }
      const result = await response.json();
      await loadTools();
      setLoadToolsStatus({
        state: 'success',
        message: `Successfully loaded ${result.toolsLoaded} tool(s) from ${server.displayName}`,
      });
    } catch (err) {
      console.error('[ToolsTab] Failed to load MCP server tools', err);
      setLoadToolsStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Failed to load tools from MCP server',
      });
    } finally {
      setLoadingToolsForServer(null);
    }
  };

  const [expandedSections, setExpandedSections] = useState<Set<ToolType>>(new Set());

  const toggleSection = (type: ToolType) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Add custom scrollbar styles for this component
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .tools-tab-scrollbar {
        background-color: var(--table-scroll-bg, transparent);
      }
      .tools-tab-scrollbar::-webkit-scrollbar {
        width: 3px;
        height: 3px;
      }
      .tools-tab-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .tools-tab-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(156, 163, 175, 0.3);
        border-radius: 3px;
      }
      .tools-tab-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(156, 163, 175, 0.5);
      }
      .tools-tab-scrollbar::-webkit-scrollbar-corner {
        background: var(--table-scroll-bg, transparent);
      }
      .dark .tools-tab-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(75, 85, 99, 0.3);
      }
      .dark .tools-tab-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(75, 85, 99, 0.5);
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const toggleEditMode = (type: ToolType) => {
    const isCurrentlyEditing = editMode[type];
    
    // If entering edit mode, expand the accordion
    if (!isCurrentlyEditing && !expandedSections.has(type)) {
      toggleSection(type);
    }
    
    setEditMode(prev => ({
      ...prev,
      [type]: !prev[type],
    }));
    
    // Clear selections when exiting edit mode
    if (isCurrentlyEditing) {
      const itemsOfType = (groupedTools[type] || []).map(t => t.id);
      setSelectedTools(prev => {
        const next = new Set(prev);
        itemsOfType.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  const toggleToolSelection = (toolId: string) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const toggleSelectAll = (type: ToolType) => {
    const items = groupedTools[type] || [];
    const allSelected = items.every(item => selectedTools.has(item.id));
    
    setSelectedTools(prev => {
      const next = new Set(prev);
      items.forEach(item => {
        if (allSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      });
      return next;
    });
  };

  const handleApplyBulkEdit = async () => {
    if (selectedTools.size === 0) return;

    setApplyingBulkEdit(true);
    try {
      const toolIds = Array.from(selectedTools);
      const teamIds = bulkScope === 'team' ? bulkTeamIds : [];

      // Use bulk update endpoint
      const response = await fetch(`${baseURL}/api/admin/tools/bulk/scope`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          toolIds,
          organizationId: selectedOrgId,
          teamIds,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        onError(errorData.error || 'Failed to update tools');
        return;
      }

      const result = await response.json();
      onSuccess(result.message || `Successfully updated ${toolIds.length} tool(s)`);

      // Refresh tools list
      await loadTools();

      // Clear selections and exit edit mode
      setSelectedTools(new Set());
      setEditMode({
        frontend: false,
        backend: false,
        builtin: false,
        mcp: false,
      });
      setBulkScope('organization');
      setBulkTeamIds([]);
    } catch (error) {
      console.error('Error applying bulk edit:', error);
      onError('Failed to apply bulk changes');
    } finally {
      setApplyingBulkEdit(false);
    }
  };

  const renderToolAccordion = (type: ToolType, title: string, description: string) => {
    const items = groupedTools[type] || [];
    const isExpanded = expandedSections.has(type);
    const isReadonlyType = type === 'frontend' || type === 'builtin' || type === 'backend';
    const enabledCount = items.filter(item => item.enabled).length;
    const isEditing = editMode[type];
    const selectedCount = items.filter(item => selectedTools.has(item.id)).length;
    const allSelected = items.length > 0 && items.every(item => selectedTools.has(item.id));
    const hasSelections = selectedCount > 0;

    return (
      <div
        className={cn(
          'rounded-lg border transition-all duration-200 overflow-hidden relative',
          isLight
            ? 'bg-white border-gray-200 hover:border-gray-300'
            : 'bg-[#151C24] border-gray-700 hover:border-gray-600',
          isExpanded && (isLight ? 'shadow-sm' : 'shadow-[0_6px_20px_rgba(0,0,0,0.35)]'),
        )}
      >
        <div className="flex items-center px-4 py-3">
          <button
            type="button"
            onClick={() => toggleSection(type)}
            className={cn(
              'flex flex-1 items-center gap-3',
              isLight ? 'text-gray-700' : 'text-gray-200',
            )}
          >
            <svg
              className={cn(
                'h-3.5 w-3.5 flex-shrink-0 transition-transform duration-300 ease-in-out',
                isExpanded && 'rotate-90',
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <div className="text-left">
              <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                {title}
              </h3>
            <p className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>{description}</p>
          </div>
          </button>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <span
                  className={cn(
                    'text-xs px-2 py-1 rounded transition-colors',
                    isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400',
                  )}
                >
                  {enabledCount}
          </span>
                <span
                  className={cn(
                    'text-xs px-2 py-1 rounded transition-colors',
                    isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-300',
                  )}
                >
                  {items.length}
                </span>
              </>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleEditMode(type);
              }}
              className={cn(
                'p-1 rounded transition-colors',
                isEditing
                  ? isLight
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50'
                  : isLight
                  ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
              )}
              title={isEditing ? 'Exit edit mode' : 'Edit scope'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
        </div>
        </div>

        {/* Separator between header and content */}
        {isExpanded && (
          <div className={cn('h-px', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        )}

        <div
          className={cn(
            'transition-all ease-in-out',
            isExpanded ? 'max-h-[400px] opacity-100 duration-500' : 'max-h-0 opacity-0 duration-300 overflow-hidden',
            isExpanded && 'overflow-visible',
          )}
        >
          <div
            className={cn(
              'transition-all ease-in-out',
              isExpanded ? 'translate-y-0 duration-300 delay-75' : '-translate-y-2 duration-200',
            )}
          >
            <div
              className={cn(
                'max-h-60 w-full overflow-auto tools-tab-scrollbar transition-opacity ease-in-out',
                isExpanded ? 'opacity-100 duration-400 delay-150' : 'opacity-0 duration-150',
              )}
              style={{ '--table-scroll-bg': isLight ? '#FFFFFF' : '#151C24' } as React.CSSProperties}
            >
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50 text-gray-600' : 'bg-[#111820] text-gray-400')}>
              <tr>
                    {isEditing && (
                      <th className="px-4 py-2 font-medium w-10">
                        <Checkbox
                          checked={allSelected}
                          onChange={() => toggleSelectAll(type)}
                          label=""
                          isLight={isLight}
                        />
                      </th>
                    )}
                    {isReadonlyType ? (
                      <>
                        {!isEditing && <th className="px-4 py-2 font-medium">Enabled</th>}
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                        <th className="px-4 py-2 font-medium">Description</th>
                      </>
                    ) : (
                      <>
                        {!isEditing && <th className="px-4 py-2 font-medium">Enabled</th>}
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">MCP Server</th>
                        <th className="px-4 py-2 font-medium">Scope</th>
                        <th className="px-4 py-2 font-medium">Description</th>
                      </>
                    )}
              </tr>
              {/* Full-width separator after header */}
              <tr>
                <td colSpan={isEditing ? 10 : 10} className="p-0">
                  <div className={cn('h-px', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
                </td>
              </tr>
            </thead>
            <tbody className={cn(isLight ? 'divide-y divide-gray-100' : 'divide-y divide-gray-800')}>
              {items.length === 0 ? (
                <tr>
                      <td colSpan={5} className={cn('px-4 py-6 text-center text-xs italic', isLight ? 'text-gray-400' : 'text-gray-500')}>
                    No tools configured for this category.
                  </td>
                </tr>
              ) : (
                items.map(tool => (
                  <tr key={tool.id}>
                        {isEditing && (
                          <td className="px-4 py-2">
                            <Checkbox
                              checked={selectedTools.has(tool.id)}
                              onChange={() => toggleToolSelection(tool.id)}
                              label=""
                              isLight={isLight}
                            />
                          </td>
                        )}
                        {isReadonlyType ? (
                          <>
                            {!isEditing && (
                              <td className="px-4 py-2">
                                <Checkbox
                                  checked={tool.enabled}
                                  disabled={loadingTools}
                                  onChange={() => handleToggleTool(tool)}
                                  label=""
                                  isLight={isLight}
                                />
                    </td>
                            )}
                            <td className={cn('px-4 py-2 whitespace-nowrap', isLight ? 'text-gray-900' : 'text-gray-100')}>
                              {tool.toolName}
                    </td>
                            <td className={cn('px-4 py-2 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                              {tool.toolKey}
                      </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              {renderToolScopeBadge(tool)}
                            </td>
                            <td className={cn('px-4 py-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-md', isLight ? 'text-gray-600' : 'text-gray-400')}>
                              {tool.description || '—'}
                            </td>
                          </>
                        ) : (
                          <>
                            {!isEditing && (
                              <td className="px-4 py-2">
                      <Checkbox
                        checked={tool.enabled}
                        disabled={loadingTools}
                        onChange={() => handleToggleTool(tool)}
                                  label=""
                        isLight={isLight}
                      />
                    </td>
                            )}
                            <td className={cn('px-4 py-2 whitespace-nowrap', isLight ? 'text-gray-900' : 'text-gray-100')}>
                              {tool.toolName}
                    </td>
                            <td className={cn('px-4 py-2 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                              {tool.mcpServer?.displayName || '—'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              {renderToolScopeBadge(tool)}
                            </td>
                            <td className={cn('px-4 py-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-md', isLight ? 'text-gray-600' : 'text-gray-400')}>
                              {tool.description || '—'}
                            </td>
                          </>
                        )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
            </div>

            {/* Compact Bulk Edit Panel - Inside Accordion */}
            {isEditing && hasSelections && (
              <>
                {/* Separator */}
                <div className={cn('h-px', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
                
                <div
                  className={cn(
                    'px-4 py-2 overflow-visible',
                    isLight
                      ? 'bg-white'
                      : 'bg-[#151C24]',
                  )}
                >
                  <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 overflow-visible">
                    <span className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {selectedCount} selected
                    </span>
                    <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
                    <div className="flex items-center gap-2">
                      <Radio
                        name={`bulkScope-${type}`}
                        value="organization"
                        checked={bulkScope === 'organization'}
                        onChange={() => {
                          setBulkScope('organization');
                          setBulkTeamIds([]);
                        }}
                        label="Org"
                        isLight={isLight}
                      />
                      <Radio
                        name={`bulkScope-${type}`}
                        value="team"
                        checked={bulkScope === 'team'}
                        onChange={() => setBulkScope('team')}
                        label="Team"
                        isLight={isLight}
                      />
                    </div>
                    {bulkScope === 'team' && (
                      <div className="flex-1 min-w-[200px] relative z-10">
                        <TeamMultiSelector
                          isLight={isLight}
                          teams={teams}
                          selectedTeamIds={bulkTeamIds}
                          onTeamChange={(teamIds: string[]) => setBulkTeamIds(teamIds)}
                          placeholder="Select teams..."
                          disabled={loadingTeams}
                          dropdownPosition="up"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const itemsOfType = items.map(t => t.id);
                        setSelectedTools(prev => {
                          const next = new Set(prev);
                          itemsOfType.forEach(id => next.delete(id));
                          return next;
                        });
                        setBulkScope('organization');
                        setBulkTeamIds([]);
                      }}
                      disabled={applyingBulkEdit}
                      className={cn(
                        'px-3 py-1.5 text-xs rounded-md transition-colors',
                        isLight
                          ? 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700',
                        applyingBulkEdit && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyBulkEdit}
                      disabled={applyingBulkEdit || (bulkScope === 'team' && bulkTeamIds.length === 0)}
                      className={cn(
                        'px-3 py-1.5 text-xs rounded-md transition-colors font-medium',
                        isLight
                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                          : 'bg-blue-600 text-white hover:bg-blue-700',
                        (applyingBulkEdit || (bulkScope === 'team' && bulkTeamIds.length === 0)) &&
                          'opacity-50 cursor-not-allowed',
                      )}
                    >
                      {applyingBulkEdit ? 'Applying...' : 'Apply'}
                    </button>
                  </div>
                </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Organization
          </label>
          <OrganizationSelector
            isLight={isLight}
            organizations={organizations}
            selectedOrgId={selectedOrgId}
            onOrgChange={(value: string) => {
              setSelectedOrgId(value);
              setTeamFilterIds([]);
            }}
          />
        </div>
        <div>
          <label className={cn('block text-xs font-medium mb-1.5', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Team
          </label>
          {loadingTeams && teams.length === 0 ? (
            <div
              className={cn(
                'h-[34px] w-full rounded-md border animate-pulse',
                isLight ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800',
              )}
            />
          ) : (
          <TeamSelector
            isLight={isLight}
            teams={teams}
              selectedTeamIds={teamFilterIds}
              onTeamChange={setTeamFilterIds}
              placeholder="All teams"
              allowEmpty
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        {renderToolAccordion(
          'frontend',
          'Frontend Tools',
          'CopilotKit actions (non-deletable, toggle to enable/disable)'
        )}
        {renderToolAccordion(
          'builtin',
          'Built-in Tools',
          'Pydantic-AI built-in tools (non-deletable, toggle to enable/disable)'
        )}
        {renderToolAccordion(
          'backend',
          'Backend Tools',
          'Python-defined backend tools (non-deletable, toggle to enable/disable)'
        )}

        {renderToolAccordion(
          'mcp',
          'MCP Tools',
          'Tools from Model Context Protocol servers'
        )}

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className={cn('w-5 h-5', isLight ? 'text-blue-500' : 'text-blue-400')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                MCP Servers{' '}
                <span className={cn('text-xs font-normal', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  ({servers.length})
            </span>
              </h3>
          </div>
            {!showAddServerForm && (
              <button
                onClick={() => {
                  setShowAddServerForm(true);
                  setEditingServerId(null);
                  setEditServerForm(null);
                }}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors',
                  isLight
                    ? 'text-blue-600 border-blue-200 hover:bg-blue-50'
                    : 'text-blue-300 border-blue-800 hover:bg-blue-900/20',
                )}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Server
              </button>
            )}
          </div>

          {showAddServerForm && (
            <form onSubmit={handleSubmitServer} className={cn('space-y-4 rounded-lg border p-4', isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700')}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Server Key
                  </label>
                <input
                  type="text"
                  value={serverForm.serverKey}
                    onChange={e => setServerForm(prev => ({ ...prev, serverKey: e.target.value }))}
                  className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                  )}
                  placeholder="corp-jira"
                  required
                />
              </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Display Name
                  </label>
                <input
                  type="text"
                  value={serverForm.displayName}
                    onChange={e => setServerForm(prev => ({ ...prev, displayName: e.target.value }))}
                  className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                  )}
                  placeholder="Corporate Jira"
                  required
                />
              </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Transport
                  </label>
                  <TransportSelector
                  isLight={isLight}
                    value={serverForm.transport}
                    onChange={value => setServerForm(prev => ({ ...prev, transport: value }))}
                />
              </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Command
                  </label>
                <input
                  type="text"
                  value={serverForm.command}
                    onChange={e => setServerForm(prev => ({ ...prev, command: e.target.value }))}
                  className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                  )}
                  placeholder="node /path/to/server.js"
                />
              </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Arguments (comma separated)
                </label>
                <input
                  type="text"
                  value={serverForm.args}
                    onChange={e => setServerForm(prev => ({ ...prev, args: e.target.value }))}
                  className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                  )}
                  placeholder="--flagA,--flagB"
                />
              </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    URL (SSE/WS)
                  </label>
                <input
                  type="text"
                  value={serverForm.url}
                    onChange={e => setServerForm(prev => ({ ...prev, url: e.target.value }))}
                  className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                  )}
                  placeholder="https://server.example.com/mcp"
                />
              </div>
              </div>

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Environment Variables JSON
                </label>
                <textarea
                  rows={3}
                  value={serverForm.env}
                  onChange={e => setServerForm(prev => ({ ...prev, env: e.target.value }))}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                    isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-gray-100',
                  )}
                />
                </div>

                        <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Metadata JSON
                </label>
                <textarea
                  rows={3}
                  value={serverForm.metadata}
                  onChange={e => setServerForm(prev => ({ ...prev, metadata: e.target.value }))}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                    isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-gray-100',
                  )}
                />
                          </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Scope
                  </label>
                  <div className="flex items-center gap-4">
                    <Radio
                      name="server-scope"
                      value="organization"
                      checked={serverForm.scope === 'organization'}
                      onChange={() => setServerForm(prev => ({ ...prev, scope: 'organization', teamIds: [] }))}
                      label="Organization"
                      isLight={isLight}
                    />
                    <Radio
                      name="server-scope"
                      value="team"
                      checked={serverForm.scope === 'team'}
                      onChange={() => setServerForm(prev => ({ ...prev, scope: 'team' }))}
                      label="Team"
                      isLight={isLight}
                    />
                          </div>
                        </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Teams (optional)
                  </label>
                  <TeamMultiSelector
                            isLight={isLight}
                    teams={teams}
                    selectedTeamIds={serverForm.teamIds}
                    onTeamChange={(value: string[]) => setServerForm(prev => ({ ...prev, teamIds: value }))}
                    placeholder="Select teams"
                    disabled={serverForm.scope !== 'team'}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleTestServerConnectivityFromForm}
                            className={cn(
                        'px-3 py-1.5 text-xs rounded font-medium transition-colors border',
                        testStatus.state === 'loading'
                          ? 'opacity-50 cursor-not-allowed'
                          : isLight
                            ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                            : 'border-blue-800 text-blue-300 hover:bg-blue-900/20',
                      )}
                      disabled={testStatus.state === 'loading'}
                    >
                      {testStatus.state === 'loading' ? 'Testing…' : 'Test Connectivity'}
                    </button>
                        </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={!canSubmitServer || loadingServers}
                      className={cn(
                        'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                        isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                      )}
                    >
                      Create Server
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddServerForm(false);
                        setServerForm(INITIAL_SERVER_FORM);
                        setTestStatus({ state: 'idle' });
                      }}
                      className={cn(
                        'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                        isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                      )}
                    >
                      Cancel
                    </button>
                      </div>
                    </div>
                </div>

              {testStatus.state !== 'idle' && (
                <div
                  className={cn(
                    'p-3 rounded-lg text-xs flex items-start justify-between gap-3 transform transition-all duration-300 ease-out',
                    isLight
                      ? testStatus.state === 'success'
                        ? 'bg-green-50 text-green-700'
                        : testStatus.state === 'error'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-blue-50 text-blue-600'
                      : testStatus.state === 'success'
                        ? 'bg-green-900/20 text-green-400'
                        : testStatus.state === 'error'
                          ? 'bg-red-900/20 text-red-400'
                          : 'bg-blue-900/20 text-blue-300',
                    testStatusClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
                  )}
                >
                  <div className="flex-1 flex items-start gap-2">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      {testStatus.state === 'success' && (
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      )}
                      {testStatus.state === 'error' && (
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      )}
                      {testStatus.state === 'loading' && (
                        <>
                          <circle className="opacity-25" cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M2 10a8 8 0 018-8v2a6 6 0 00-6 6H2z" />
                        </>
                      )}
                    </svg>
                    <div>
                      <div className="font-medium">
                        {testStatus.state === 'success'
                          ? 'Connectivity test succeeded'
                          : testStatus.state === 'loading'
                            ? 'Testing server connectivity…'
                            : 'Connectivity test failed'}
            </div>
                      {testStatus.message && <div className="mt-0.5">{testStatus.message}</div>}
          </div>
        </div>
                  <button
                    onClick={() => setTestStatus({ state: 'idle' })}
                    className={cn(
                      'flex-shrink-0 p-0.5 rounded transition-colors',
                      isLight
                        ? testStatus.state === 'success'
                          ? 'text-green-500 hover:bg-green-100'
                          : testStatus.state === 'error'
                            ? 'text-red-500 hover:bg-red-100'
                            : 'text-blue-500 hover:bg-blue-100'
                        : testStatus.state === 'success'
                          ? 'text-green-400 hover:bg-green-900/40'
                          : testStatus.state === 'error'
                            ? 'text-red-400 hover:bg-red-900/40'
                            : 'text-blue-300 hover:bg-blue-900/40',
                    )}
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </form>
          )}

          <div className="mt-3 space-y-3">
            {loadingServers ? (
              Array.from({ length: 2 }).map((_, idx) => (
                <div
                  key={`server-skeleton-${idx}`}
                  className={cn(
                    'p-4 rounded-lg border animate-pulse',
                    isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('w-4 h-4 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
                    <div className="flex-1 space-y-2">
                      <div className={cn('h-3 w-2/5 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
                      <div className={cn('h-2.5 w-3/5 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
                    </div>
                  </div>
                </div>
              ))
            ) : servers.length === 0 ? (
              <div
                className={cn(
                  'p-8 rounded-lg border-2 border-dashed text-center',
                  isLight ? 'border-gray-300 bg-gray-50' : 'border-gray-700 bg-[#151C24]/50',
                )}
              >
                <svg
                  className={cn('w-12 h-12 mx-auto mb-3', isLight ? 'text-gray-400' : 'text-gray-600')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                  />
                </svg>
                <p className={cn('text-sm font-medium', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  No MCP servers configured
                </p>
                <p className={cn('text-xs mt-1', isLight ? 'text-gray-500' : 'text-gray-500')}>
                  {!showAddServerForm && 'Click "+ Add Server" to get started.'}
            </p>
          </div>
            ) : (
              servers.map(server => {
                const isEditing = editingServerId === server.id;
                const serverToolCount = tools.filter(t => t.mcpServerId === server.id).length;
                
                return (
                  <div
                    key={server.id}
                    className={cn(
                      'p-4 rounded-lg border transition-all',
                      isLight ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm' : 'bg-[#151C24] border-gray-700 hover:border-gray-600',
                    )}
                  >
                    {isEditing && editServerForm ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Server Key
                            </label>
              <input
                type="text"
                              value={editServerForm.serverKey}
                              onChange={e => setEditServerForm(prev => prev ? { ...prev, serverKey: e.target.value } : prev)}
                className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                )}
              />
            </div>
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Display Name
                            </label>
              <input
                type="text"
                              value={editServerForm.displayName}
                              onChange={e => setEditServerForm(prev => prev ? { ...prev, displayName: e.target.value } : prev)}
                className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                )}
              />
            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Transport
                            </label>
                            <TransportSelector
                              isLight={isLight}
                              value={editServerForm.transport}
                              onChange={value => setEditServerForm(prev => prev ? { ...prev, transport: value } : prev)}
                            />
                          </div>
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Command
                            </label>
                            <input
                              type="text"
                              value={editServerForm.command}
                              onChange={e => setEditServerForm(prev => prev ? { ...prev, command: e.target.value } : prev)}
                className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                              )}
                              placeholder="node /path/to/server.js"
                            />
            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Arguments (comma separated)
              </label>
              <input
                type="text"
                              value={editServerForm.args}
                              onChange={e => setEditServerForm(prev => prev ? { ...prev, args: e.target.value } : prev)}
                className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                )}
                              placeholder="--flagA,--flagB"
              />
            </div>
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              URL (SSE/WS)
                            </label>
                            <input
                              type="text"
                              value={editServerForm.url}
                              onChange={e => setEditServerForm(prev => prev ? { ...prev, url: e.target.value } : prev)}
                              className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                              )}
                              placeholder="https://server.example.com/mcp"
                            />
                          </div>
                        </div>

                        <div>
                          <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Environment Variables JSON
                          </label>
              <textarea
                            rows={3}
                            value={editServerForm.env}
                            onChange={e => setEditServerForm(prev => prev ? { ...prev, env: e.target.value } : prev)}
                className={cn(
                              'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                              isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-gray-100',
                )}
              />
            </div>

                        <div>
                          <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Metadata JSON
                          </label>
                          <textarea
                            rows={3}
                            value={editServerForm.metadata}
                            onChange={e => setEditServerForm(prev => prev ? { ...prev, metadata: e.target.value } : prev)}
                            className={cn(
                              'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                              isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-gray-100',
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Scope
                            </label>
                            <div className="flex items-center gap-4">
                              <Radio
                                name="edit-server-scope"
                                value="organization"
                                checked={editServerForm.scope === 'organization'}
                                onChange={() => setEditServerForm(prev => prev ? { ...prev, scope: 'organization', teamIds: [] } : prev)}
                                label="Organization"
                                isLight={isLight}
                              />
                              <Radio
                                name="edit-server-scope"
                                value="team"
                                checked={editServerForm.scope === 'team'}
                                onChange={() => setEditServerForm(prev => prev ? { ...prev, scope: 'team' } : prev)}
                                label="Team"
                                isLight={isLight}
                              />
                            </div>
                          </div>
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Teams (optional)
                            </label>
                            <TeamMultiSelector
                              isLight={isLight}
                              teams={teams}
                              selectedTeamIds={editServerForm.teamIds}
                              onTeamChange={(value: string[]) => setEditServerForm(prev => prev ? { ...prev, teamIds: value } : prev)}
                              placeholder="Select teams"
                              disabled={editServerForm.scope !== 'team'}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleTestServerConnectivity(server.id)}
                                className={cn(
                                  'px-3 py-1.5 text-xs rounded font-medium transition-colors border',
                                  testStatus.state === 'loading'
                                    ? 'opacity-50 cursor-not-allowed'
                                    : isLight
                                      ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                                      : 'border-blue-800 text-blue-300 hover:bg-blue-900/20',
                                )}
                                disabled={testStatus.state === 'loading'}
                              >
                                {testStatus.state === 'loading' ? 'Testing…' : 'Test Connectivity'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLoadToolsInEdit(server.id)}
                                className={cn(
                                  'px-3 py-1.5 text-xs rounded font-medium transition-colors border',
                                  loadingToolsForServer === server.id
                                    ? 'opacity-50 cursor-not-allowed'
                                    : isLight
                                      ? 'border-green-200 text-green-600 hover:bg-green-50'
                                      : 'border-green-800 text-green-300 hover:bg-green-900/20',
                                )}
                                disabled={loadingToolsForServer === server.id}
              >
                                {loadingToolsForServer === server.id ? 'Loading Tools…' : 'Load Tools'}
                              </button>
            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleUpdateServer(server.id)}
                                disabled={!canSubmitEditServer}
                                className={cn(
                                  'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                                  isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                                )}
                              >
                                Save Changes
                              </button>
                              <button
                                onClick={cancelEditServer}
                                className={cn(
                                  'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                                  isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                                )}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>

                        {testStatus.state !== 'idle' && (
                          <div
                            className={cn(
                              'p-3 rounded-lg text-xs flex items-start justify-between gap-3 transform transition-all duration-300 ease-out',
                              isLight
                                ? testStatus.state === 'success'
                                  ? 'bg-green-50 text-green-700'
                                  : testStatus.state === 'error'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-blue-50 text-blue-600'
                                : testStatus.state === 'success'
                                  ? 'bg-green-900/20 text-green-400'
                                  : testStatus.state === 'error'
                                    ? 'bg-red-900/20 text-red-400'
                                    : 'bg-blue-900/20 text-blue-300',
                              testStatusClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
                            )}
                          >
                            <div className="flex-1 flex items-start gap-2">
                              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                {testStatus.state === 'success' && (
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                )}
                                {testStatus.state === 'error' && (
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                    clipRule="evenodd"
                                  />
                                )}
                                {testStatus.state === 'loading' && (
                                  <>
                                    <circle className="opacity-25" cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M2 10a8 8 0 018-8v2a6 6 0 00-6 6H2z" />
                                  </>
                                )}
                              </svg>
                              <div>
                                <div className="font-medium">
                                  {testStatus.state === 'success'
                                    ? 'Connectivity test succeeded'
                                    : testStatus.state === 'loading'
                                      ? 'Testing server connectivity…'
                                      : 'Connectivity test failed'}
                                </div>
                                {testStatus.message && <div className="mt-0.5">{testStatus.message}</div>}
                              </div>
                            </div>
                            <button
                              onClick={() => setTestStatus({ state: 'idle' })}
                              className={cn(
                                'flex-shrink-0 p-0.5 rounded transition-colors',
                                isLight
                                  ? testStatus.state === 'success'
                                    ? 'text-green-500 hover:bg-green-100'
                                    : testStatus.state === 'error'
                                      ? 'text-red-500 hover:bg-red-100'
                                      : 'text-blue-500 hover:bg-blue-100'
                                  : testStatus.state === 'success'
                                    ? 'text-green-400 hover:bg-green-900/40'
                                    : testStatus.state === 'error'
                                      ? 'text-red-400 hover:bg-red-900/40'
                                      : 'text-blue-300 hover:bg-blue-900/40',
                              )}
                              title="Dismiss"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {loadToolsStatus.state !== 'idle' && (
                          <div
                            className={cn(
                              'p-3 rounded-lg text-xs flex items-start justify-between gap-3 transform transition-all duration-300 ease-out',
                              isLight
                                ? loadToolsStatus.state === 'success'
                                  ? 'bg-green-50 text-green-700'
                                  : loadToolsStatus.state === 'error'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-blue-50 text-blue-600'
                                : loadToolsStatus.state === 'success'
                                  ? 'bg-green-900/20 text-green-400'
                                  : loadToolsStatus.state === 'error'
                                    ? 'bg-red-900/20 text-red-400'
                                    : 'bg-blue-900/20 text-blue-300',
                              loadToolsStatusClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
                            )}
                          >
                            <div className="flex-1 flex items-start gap-2">
                              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                {loadToolsStatus.state === 'success' && (
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                )}
                                {loadToolsStatus.state === 'error' && (
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                    clipRule="evenodd"
                                  />
                                )}
                                {loadToolsStatus.state === 'loading' && (
                                  <>
                                    <circle className="opacity-25" cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M2 10a8 8 0 018-8v2a6 6 0 00-6 6H2z" />
                                  </>
                                )}
                              </svg>
                              <div>
                                <div className="font-medium">
                                  {loadToolsStatus.state === 'success'
                                    ? 'Tools loaded successfully'
                                    : loadToolsStatus.state === 'loading'
                                      ? 'Loading tools from MCP server…'
                                      : 'Failed to load tools'}
                                </div>
                                {loadToolsStatus.message && <div className="mt-0.5">{loadToolsStatus.message}</div>}
                              </div>
                            </div>
                            <button
                              onClick={() => setLoadToolsStatus({ state: 'idle' })}
                              className={cn(
                                'flex-shrink-0 p-0.5 rounded transition-colors',
                                isLight
                                  ? loadToolsStatus.state === 'success'
                                    ? 'text-green-500 hover:bg-green-100'
                                    : loadToolsStatus.state === 'error'
                                      ? 'text-red-500 hover:bg-red-100'
                                      : 'text-blue-500 hover:bg-blue-100'
                                  : loadToolsStatus.state === 'success'
                                    ? 'text-green-400 hover:bg-green-900/40'
                                    : loadToolsStatus.state === 'error'
                                      ? 'text-red-400 hover:bg-red-900/40'
                                      : 'text-blue-300 hover:bg-blue-900/40',
                              )}
                              title="Dismiss"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                              {server.displayName}
                            </div>
                            <div className={cn('text-xs mt-0.5', isLight ? 'text-gray-500' : 'text-gray-400')}>
                              {server.serverKey} · {server.transport}{server.command && ` · ${server.command}`}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {renderServerScopeBadge(server)}
                              {serverToolCount > 0 && (
                                <span className={cn(
                                  'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                                  isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
                                )}>
                                  {serverToolCount} tool{serverToolCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-1">
                            <button
                              onClick={() => startEditServer(server)}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight
                                  ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                              )}
                              title="Edit server"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteServer(server)}
                              disabled={loadingServers}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight
                                  ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                                  : 'text-red-400 hover:bg-red-900/20 hover:text-red-300',
                              )}
                              title="Remove server"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {server.args.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setExpandedServerArgs(prev => {
                                const next = new Set(prev);
                                if (next.has(server.id)) {
                                  next.delete(server.id);
                                } else {
                                  next.add(server.id);
                                }
                                return next;
                              })}
                              className={cn(
                                'flex items-center justify-between w-full text-xs font-medium mb-1 transition-colors',
                                isLight ? 'text-gray-700 hover:text-gray-900' : 'text-gray-300 hover:text-gray-100'
                              )}
                            >
                              <span>Arguments ({server.args.length})</span>
                              <svg
                                className={cn('w-4 h-4 transition-transform', expandedServerArgs.has(server.id) && 'rotate-180')}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {expandedServerArgs.has(server.id) && (
                              <div className={cn(
                                'text-xs font-mono p-2 rounded max-h-32 overflow-auto tools-tab-scrollbar',
                                isLight ? 'bg-gray-50 text-gray-800' : 'bg-gray-900/40 text-gray-200'
                              )}>
                                {server.args.map((arg, idx) => (
                                  <div key={idx} className="whitespace-pre-wrap break-all">
                                    {arg}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolsTab;

