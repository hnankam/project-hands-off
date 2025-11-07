import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@extension/ui';
import { authClient } from '../../lib/auth-client';
import { OrganizationSelector } from './OrganizationSelector';
import { TeamSelector, SingleTeamSelector } from './TeamSelector';
import { Radio, Checkbox } from './FormControls';
import { ModelMultiSelector } from './ModelMultiSelector';

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

interface ModelSummary {
  id: string;
  modelKey: string;
  name: string;
  teamId: string | null;
  enabled: boolean;
}

interface BaseInstruction {
  id: string;
  instructionKey: string;
  instructionValue: string;
  description: string | null;
  organizationId: string;
  teamId: string | null;
  teamName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentRecord {
  id: string;
  agentType: string;
  agentName: string;
  description: string | null;
  promptTemplate: string;
  organizationId: string;
  teamId: string | null;
  teamName: string | null;
  enabled: boolean;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  modelIds: string[];
}

type AgentScope = 'organization' | 'team';

interface AgentFormState {
  agentType: string;
  agentName: string;
  description: string;
  promptTemplate: string;
  scope: AgentScope;
  teamId: string;
  metadata: string;
  enabled: boolean;
  modelMode: 'all' | 'custom';
  modelIds: string[];
}

interface AgentsTabProps {
  isLight: boolean;
  organizations: Organization[];
  preselectedOrgId?: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const INITIAL_FORM: AgentFormState = {
  agentType: '',
  agentName: '',
  description: '',
  promptTemplate: '',
  scope: 'organization',
  teamId: '',
  metadata: '{}',
  enabled: true,
  modelMode: 'all',
  modelIds: [],
};

const MAX_FETCH_RETRIES = 3;

const waitFor = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort);
  });

const AgentSkeletonCard: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div
    className={cn(
      'p-3 rounded-lg border transition-all',
      isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
    )}
  >
    <div className="flex items-start gap-3 animate-pulse">
      <div className={cn('w-10 h-10 rounded-full', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
      <div className="flex-1 space-y-3">
        <div className={cn('h-3 w-2/5 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className="grid grid-cols-2 gap-2">
          <div className={cn('h-2.5 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
          <div className={cn('h-2.5 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
        </div>
        <div className={cn('h-12 rounded', isLight ? 'bg-gray-50' : 'bg-gray-900/40')} />
      </div>
      <div className="flex flex-col gap-2">
        <div className={cn('h-6 w-6 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-6 w-6 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
      </div>
    </div>
  </div>
);

const sanitizeJsonText = (value: string, fieldName: string) => {
  if (!value || value.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`${fieldName} must be valid JSON`);
  }
};

const stringifyJson = (value: Record<string, any> | null | undefined, fallback = '{}') => {
  if (!value || Object.keys(value).length === 0) {
    return fallback;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
};

interface InstructionTemplateSelectorProps {
  isLight: boolean;
  instructions: BaseInstruction[];
  onSelect: (instruction: BaseInstruction) => void;
  onSave: () => void;
}

const InstructionTemplateSelector: React.FC<InstructionTemplateSelectorProps> = ({ isLight, instructions, onSelect, onSave }) => {
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

  return (
    <div className="flex items-center gap-1">
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'p-1 rounded transition-colors',
            isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-700',
          )}
          title="Load template"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
        </button>

        {isOpen && instructions.length > 0 && (
          <div
            className={cn(
              'absolute top-full right-0 mt-1 w-64 rounded-md border shadow-lg z-[9999] max-h-[280px] overflow-y-auto',
              isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
            )}
          >
            {instructions.map(instruction => (
              <button
                type="button"
                key={instruction.id}
                onClick={() => {
                  onSelect(instruction);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-2 text-left transition-colors',
                  isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-200 hover:bg-gray-700',
                )}
              >
                <div className="text-xs font-medium">{instruction.instructionKey}</div>
                {instruction.description && (
                  <div className={cn('text-[11px] mt-0.5', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    {instruction.description}
                  </div>
                )}
                <div className={cn('text-[10px] mt-1', isLight ? 'text-gray-400' : 'text-gray-500')}>
                  {instruction.teamName ? `Team: ${instruction.teamName}` : 'Organization'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onSave}
        className={cn(
          'p-1 rounded transition-colors',
          isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-700',
        )}
        title="Save as template"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
      </button>
    </div>
  );
};

const ModelIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 4-7 4-7-4 7-4z" />
    <path d="M5 12l7 4 7-4" />
    <path d="M5 19l7 4 7-4" />
  </svg>
);

export function AgentsTab({ isLight, organizations, preselectedOrgId, onError, onSuccess }: AgentsTabProps) {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .agents-tab-scrollbar::-webkit-scrollbar {
        width: 3px;
        height: 3px;
      }
      .agents-tab-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .agents-tab-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(156, 163, 175, 0.3);
        border-radius: 2px;
      }
      .agents-tab-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(156, 163, 175, 0.5);
      }
      .dark .agents-tab-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(75, 85, 99, 0.3);
      }
      .dark .agents-tab-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(75, 85, 99, 0.5);
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [baseInstructions, setBaseInstructions] = useState<BaseInstruction[]>([]);
  const [instructionsLoading, setInstructionsLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState(preselectedOrgId || '');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilterIds, setTeamFilterIds] = useState<string[]>([]);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const teamFilterIdsRef = useRef(teamFilterIds);
  useEffect(() => {
    teamFilterIdsRef.current = teamFilterIds;
  }, [teamFilterIds]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<AgentFormState>(INITIAL_FORM);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AgentFormState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; agentType: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [saveTemplateFor, setSaveTemplateFor] = useState<'create' | 'edit' | null>(null);
  const [templateForm, setTemplateForm] = useState({ key: '', description: '', scope: 'organization' as 'organization' | 'team', teamId: '' });
  const [expandedInstructions, setExpandedInstructions] = useState<Set<string>>(new Set());

  const initialLoadCompleteRef = useRef(false);

  const resolveModelsForScope = useCallback(
    (scope: AgentScope, teamId: string) => {
      const effectiveTeamId = (teamId || '').trim();

      return models.filter(model => {
        if (scope === 'organization') {
          return model.teamId === null;
        }

        if (!effectiveTeamId) {
          return model.teamId === null;
        }

        return model.teamId === null || model.teamId === effectiveTeamId;
      });
    },
    [models],
  );

  useEffect(() => {
    if (!selectedOrgId && organizations.length === 1) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [organizations, selectedOrgId]);

  useEffect(() => {
    if (preselectedOrgId && preselectedOrgId !== selectedOrgId) {
      setSelectedOrgId(preselectedOrgId);
    }
  }, [preselectedOrgId, selectedOrgId]);

  useEffect(() => {
    setCreateForm(prev => {
      if (prev.modelIds.length === 0) {
        return prev;
      }

      const allowedIds = new Set(resolveModelsForScope(prev.scope, prev.teamId).map(model => model.id));
      const filtered = prev.modelIds.filter(id => allowedIds.has(id));
      if (filtered.length === prev.modelIds.length) {
        return prev;
      }
      return { ...prev, modelIds: filtered };
    });

    setEditForm(prev => {
      if (!prev || prev.modelIds.length === 0) {
        return prev;
      }

      const allowedIds = new Set(resolveModelsForScope(prev.scope, prev.teamId).map(model => model.id));
      const filtered = prev.modelIds.filter(id => allowedIds.has(id));
      if (filtered.length === prev.modelIds.length) {
        return prev;
      }
      return { ...prev, modelIds: filtered };
    });
  }, [models, resolveModelsForScope, createForm.scope, createForm.teamId, editForm?.scope, editForm?.teamId]);

  const availableCreateModels = useMemo(
    () => resolveModelsForScope(createForm.scope, createForm.teamId),
    [resolveModelsForScope, createForm.scope, createForm.teamId],
  );

  const availableEditModels = useMemo(
    () => (editForm ? resolveModelsForScope(editForm.scope, editForm.teamId) : []),
    [resolveModelsForScope, editForm?.scope, editForm?.teamId],
  );

  const createModelsDisabled = !modelsLoading && availableCreateModels.length === 0;
  const createModelsPlaceholder = createModelsDisabled
    ? createForm.scope === 'team' && !createForm.teamId
      ? 'Select a team to choose team-scoped models'
      : 'No models available for this scope'
    : 'Select models';

  const editModelsDisabled = !modelsLoading && availableEditModels.length === 0;
  const editModelsPlaceholder = editModelsDisabled
    ? editForm && editForm.scope === 'team' && !editForm.teamId
      ? 'Select a team to choose team-scoped models'
      : 'No models available for this scope'
    : 'Select models';

  const loadTeams = useCallback(async (orgId: string): Promise<Team[]> => {
    setTeamsLoading(true);
    try {
      try {
        await (authClient.organization as any).setActive({ organizationId: orgId });
      } catch (err) {
        console.warn('[AgentsTab] Failed to set active organization', err);
      }

      const { data, error } = await (authClient.organization as any).listTeams({
        query: { organizationId: orgId },
      });

      if (error) throw new Error(error.message);

      const teamsForOrg = (data || []).filter((team: Team) => team.organizationId === orgId);
      setTeams(teamsForOrg);
      return teamsForOrg;
    } catch (err: any) {
      console.warn('[AgentsTab] Failed to load teams:', err);
      setTeams([]);
      return [];
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  const fetchAgents = useCallback(
    async (
      orgId: string,
      teamId: string | null,
      signal?: AbortSignal,
      attempt = 1,
    ): Promise<AgentRecord[]> => {
      const params = new URLSearchParams({ organizationId: orgId });
      if (teamId) {
        params.append('teamId', teamId);
      }

      const response = await fetch(`${baseURL}/api/admin/agents?${params.toString()}`, {
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        if (response.status === 429 && attempt < MAX_FETCH_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          await waitFor(delay, signal);
          return fetchAgents(orgId, teamId, signal, attempt + 1);
        }
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || `Failed to fetch agents (${response.status})`);
      }

      const data = await response.json();
      const agentList: AgentRecord[] = (data.agents || []).map((agent: any) => ({
        ...agent,
        modelIds: Array.isArray(agent?.modelIds) ? agent.modelIds : [],
      }));
      return agentList;
    },
    [baseURL],
  );

  const refreshAgents = useCallback(
    async (orgId: string, teamId: string | null, options: { suppressLoading?: boolean } = {}) => {
      if (!options.suppressLoading) {
        setListLoading(true);
      }

      const controller = new AbortController();

      try {
        const fetchedAgents = await fetchAgents(orgId, teamId, controller.signal);
        if (!controller.signal.aborted) {
          setAgents(fetchedAgents);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          console.error('[AgentsTab] Failed to fetch agents:', err);
          onError(err.message || 'Failed to load agents');
        }
      } finally {
        if (!controller.signal.aborted && !options.suppressLoading) {
          setListLoading(false);
        }
      }

      return controller;
    },
    [fetchAgents, onError],
  );

  const fetchModels = useCallback(
    async (orgId: string, signal?: AbortSignal): Promise<ModelSummary[]> => {
      const params = new URLSearchParams({ organizationId: orgId });

      const response = await fetch(`${baseURL}/api/admin/models?${params.toString()}`, {
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || `Failed to fetch models (${response.status})`);
      }

      const data = await response.json();
      const modelsList: ModelSummary[] = (data.models || []).map((model: any) => ({
        id: model.id,
        modelKey: model.modelKey,
        name: model.displayName || model.modelName || model.modelKey,
        teamId: model.teamId || null,
        enabled: Boolean(model.enabled),
      }));
      return modelsList;
    },
    [baseURL],
  );

  const refreshModels = useCallback(
    async (orgId: string) => {
      setModelsLoading(true);
      const controller = new AbortController();

      try {
        const fetched = await fetchModels(orgId, controller.signal);
        if (!controller.signal.aborted) {
          setModels(fetched);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          console.error('[AgentsTab] Failed to fetch models:', err);
          setModels([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setModelsLoading(false);
        }
      }

      return controller;
    },
    [fetchModels],
  );

  const fetchBaseInstructions = useCallback(
    async (orgId: string, teamId: string | null, signal?: AbortSignal): Promise<BaseInstruction[]> => {
      const params = new URLSearchParams({ organizationId: orgId });
      if (teamId) {
        params.append('teamId', teamId);
      }

      const response = await fetch(`${baseURL}/api/admin/base-instructions?${params.toString()}`, {
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || `Failed to fetch base instructions (${response.status})`);
      }

      const data = await response.json();
      return data.instructions || [];
    },
    [baseURL],
  );

  const refreshBaseInstructions = useCallback(
    async (orgId: string, teamId: string | null) => {
      setInstructionsLoading(true);
      const controller = new AbortController();

      try {
        const fetched = await fetchBaseInstructions(orgId, teamId, controller.signal);
        if (!controller.signal.aborted) {
          setBaseInstructions(fetched);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          console.error('[AgentsTab] Failed to fetch base instructions:', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setInstructionsLoading(false);
        }
      }

      return controller;
    },
    [fetchBaseInstructions],
  );

  useEffect(() => {
    if (!selectedOrgId) {
      setAgents([]);
      setTeams([]);
      setModels([]);
      setModelsLoading(false);
      initialLoadCompleteRef.current = false;
      return;
    }

    let aborted = false;
    const controllers: AbortController[] = [];

    const loadInitialData = async () => {
      setListLoading(true);
      setTeamsLoading(true);

      try {
        const fetchedTeams = await loadTeams(selectedOrgId);

        if (aborted) return;

        const modelsController = await refreshModels(selectedOrgId);
        const activeTeamId = teamFilterIdsRef.current[0] || null;
        const agentsController = await refreshAgents(selectedOrgId, activeTeamId, { suppressLoading: true });
        const instructionsController = await refreshBaseInstructions(selectedOrgId, activeTeamId);
        controllers.push(modelsController, agentsController, instructionsController);

        if (!aborted) {
          initialLoadCompleteRef.current = true;
        }
      } catch (err: any) {
        if (!aborted) {
          console.error('[AgentsTab] Initial load failed:', err);
        }
      } finally {
        if (!aborted) {
          setListLoading(false);
          setTeamsLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      aborted = true;
      controllers.forEach(ctrl => ctrl.abort());
    };
  }, [selectedOrgId, loadTeams, refreshAgents]);

  useEffect(() => {
    if (!selectedOrgId || !initialLoadCompleteRef.current) {
      return;
    }

    const controller = new AbortController();

    (async () => {
      const activeTeamId = teamFilterIds[0] || null;
      await refreshAgents(selectedOrgId, activeTeamId);
    })();

    return () => {
      controller.abort();
    };
  }, [teamFilterIds, refreshAgents, selectedOrgId]);

  const handleTeamFilterChange = (newTeamIds: string[]) => {
    setTeamFilterIds(newTeamIds);
  };

  const resetCreateForm = () => {
    setCreateForm(INITIAL_FORM);
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedOrgId) return;

    if (!createForm.agentType.trim()) {
      onError('Agent type is required');
      return;
    }

    if (!createForm.agentName.trim()) {
      onError('Agent name is required');
      return;
    }

    if (!createForm.promptTemplate.trim()) {
      onError('Base instructions are required');
      return;
    }

    if (createForm.scope === 'team' && !createForm.teamId) {
      onError('Select a team for team-scoped agents');
      return;
    }

    if (createForm.modelMode === 'custom' && createForm.modelIds.length === 0) {
      onError('Select at least one model when restricting model availability');
      return;
    }

    try {
      const payload = {
        organizationId: selectedOrgId,
        teamId: createForm.scope === 'team' ? createForm.teamId || null : null,
        agentType: createForm.agentType.trim(),
        agentName: createForm.agentName.trim(),
        description: createForm.description.trim() || null,
        promptTemplate: createForm.promptTemplate.trim(),
        enabled: createForm.enabled,
        metadata: sanitizeJsonText(createForm.metadata, 'Metadata'),
        modelIds: createForm.modelMode === 'custom' ? createForm.modelIds : [],
      };

      const response = await fetch(`${baseURL}/api/admin/agents`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to create agent');
      }

      const data = await response.json();
      onSuccess(`Agent "${data.agent?.agentType || createForm.agentType}" created successfully`);
      setShowCreateForm(false);
      resetCreateForm();
      const activeTeamId = teamFilterIds[0] || null;
      await refreshAgents(selectedOrgId, activeTeamId);
    } catch (err: any) {
      console.error('[AgentsTab] Failed to create agent:', err);
      onError(err.message || 'Failed to create agent');
    }
  };

  const startEditAgent = (agent: AgentRecord) => {
    setEditingAgentId(agent.id);
    setEditForm({
      agentType: agent.agentType,
      agentName: agent.agentName,
      description: agent.description || '',
      promptTemplate: agent.promptTemplate,
      scope: agent.teamId ? 'team' : 'organization',
      teamId: agent.teamId || '',
      metadata: stringifyJson(agent.metadata),
      enabled: agent.enabled,
      modelMode: agent.modelIds && agent.modelIds.length > 0 ? 'custom' : 'all',
      modelIds: Array.isArray(agent.modelIds) ? agent.modelIds : [],
    });
  };

  const cancelEditAgent = () => {
    setEditingAgentId(null);
    setEditForm(null);
  };

  const handleUpdateAgent = async (agentId: string) => {
    if (!selectedOrgId || !editForm) return;

    if (!editForm.agentType.trim()) {
      onError('Agent type is required');
      return;
    }

    if (!editForm.agentName.trim()) {
      onError('Agent name is required');
      return;
    }

    if (!editForm.promptTemplate.trim()) {
      onError('Base instructions are required');
      return;
    }

    if (editForm.scope === 'team' && !editForm.teamId) {
      onError('Select a team for team-scoped agents');
      return;
    }

    if (editForm.modelMode === 'custom' && editForm.modelIds.length === 0) {
      onError('Select at least one model when restricting model availability');
      return;
    }

    try {
      const payload = {
        organizationId: selectedOrgId,
        teamId: editForm.scope === 'team' ? editForm.teamId || null : null,
        agentType: editForm.agentType.trim(),
        agentName: editForm.agentName.trim(),
        description: editForm.description.trim() || null,
        promptTemplate: editForm.promptTemplate.trim(),
        enabled: editForm.enabled,
        metadata: sanitizeJsonText(editForm.metadata, 'Metadata'),
        modelIds: editForm.modelMode === 'custom' ? editForm.modelIds : [],
      };

      const response = await fetch(`${baseURL}/api/admin/agents/${agentId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to update agent');
      }

      const data = await response.json();
      onSuccess(`Agent "${data.agent?.agentType || editForm.agentType}" updated successfully`);
      setEditingAgentId(null);
      setEditForm(null);
      const activeTeamId = teamFilterIds[0] || null;
      await refreshAgents(selectedOrgId, activeTeamId);
    } catch (err: any) {
      console.error('[AgentsTab] Failed to update agent:', err);
      onError(err.message || 'Failed to update agent');
    }
  };

  const handleToggleEnabled = async (agent: AgentRecord) => {
    if (!selectedOrgId) return;

    try {
      const payload = {
        organizationId: selectedOrgId,
        teamId: agent.teamId,
        agentType: agent.agentType,
        agentName: agent.agentName,
        description: agent.description,
        promptTemplate: agent.promptTemplate,
        enabled: !agent.enabled,
        metadata: agent.metadata || {},
        modelIds: Array.isArray(agent.modelIds) ? agent.modelIds : [],
      };

      const response = await fetch(`${baseURL}/api/admin/agents/${agent.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to update agent');
      }

      setAgents(prev => prev.map(item => (item.id === agent.id ? { ...item, enabled: !agent.enabled } : item)));
      onSuccess(`Agent "${agent.agentType}" ${agent.enabled ? 'disabled' : 'enabled'}`);
    } catch (err: any) {
      console.error('[AgentsTab] Failed to toggle agent:', err);
      onError(err.message || 'Failed to update agent status');
    }
  };

  const handleDeleteAgent = async () => {
    if (!deleteConfirm || !selectedOrgId) return;

    try {
      const params = new URLSearchParams({ organizationId: selectedOrgId });
      const response = await fetch(`${baseURL}/api/admin/agents/${deleteConfirm.id}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to delete agent');
      }

      onSuccess(`Agent "${deleteConfirm.agentType}" deleted successfully`);
      setDeleteDialogOpen(false);
      setDeleteConfirm(null);
      const activeTeamId = teamFilterIds[0] || null;
      await refreshAgents(selectedOrgId, activeTeamId);
    } catch (err: any) {
      console.error('[AgentsTab] Failed to delete agent:', err);
      onError(err.message || 'Failed to delete agent');
      setDeleteDialogOpen(false);
      setDeleteConfirm(null);
    }
  };

  const openSaveTemplateDialog = (source: 'create' | 'edit') => {
    setSaveTemplateFor(source);
    setTemplateForm({ key: '', description: '', scope: 'organization', teamId: '' });
    setSaveTemplateDialogOpen(true);
  };

  const toggleInstructions = (agentId: string) => {
    setExpandedInstructions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  const handleSaveTemplate = async () => {
    if (!selectedOrgId) return;

    if (!templateForm.key.trim()) {
      onError('Template key is required');
      return;
    }

    const instructionValue = saveTemplateFor === 'create' ? createForm.promptTemplate : editForm?.promptTemplate || '';

    if (!instructionValue.trim()) {
      onError('Cannot save empty instructions as template');
      return;
    }

    if (templateForm.scope === 'team' && !templateForm.teamId) {
      onError('Select a team for team-scoped templates');
      return;
    }

    try {
      const payload = {
        organizationId: selectedOrgId,
        teamId: templateForm.scope === 'team' ? templateForm.teamId || null : null,
        instructionKey: templateForm.key.trim(),
        instructionValue: instructionValue.trim(),
        description: templateForm.description.trim() || null,
      };

      const response = await fetch(`${baseURL}/api/admin/base-instructions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to save template');
      }

      onSuccess(`Template "${templateForm.key}" saved successfully`);
      setSaveTemplateDialogOpen(false);
      const activeTeamId = teamFilterIds[0] || null;
      await refreshBaseInstructions(selectedOrgId, activeTeamId);
    } catch (err: any) {
      console.error('[AgentsTab] Failed to save template:', err);
      onError(err.message || 'Failed to save template');
    }
  };

  const renderScopeBadge = (agent: AgentRecord) => {
    if (agent.teamId) {
      return (
        <span
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
            isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400',
          )}
        >
          Team{agent.teamName ? `: ${agent.teamName}` : ''}
        </span>
      );
    }
    return (
      <span
        className={cn(
          'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
          isLight ? 'bg-gray-100 text-gray-700' : 'bg-gray-800 text-gray-300',
        )}
      >
        Organization
      </span>
    );
  };

  const modelLookup = useMemo(() => {
    const mapping: Record<string, ModelSummary> = {};
    for (const model of models) {
      mapping[model.id] = model;
    }
    return mapping;
  }, [models]);

  const filteredAgents = useMemo(() => {
    if (teamFilterIds.length === 0) {
      return agents;
    }
    return agents.filter(agent => {
      if (!agent.teamId) return true;
      return teamFilterIds.includes(agent.teamId);
    });
  }, [agents, teamFilterIds]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Select Organization
          </label>
          <OrganizationSelector
            isLight={isLight}
            organizations={organizations}
            selectedOrgId={selectedOrgId}
            onOrgChange={orgId => {
              setSelectedOrgId(orgId);
              setTeamFilterIds([]);
              cancelEditAgent();
              setShowCreateForm(false);
            }}
            placeholder="Select an organization..."
          />
        </div>

        <div>
          <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Team
          </label>
          {teamsLoading && teams.length === 0 ? (
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
              onTeamChange={handleTeamFilterChange}
              placeholder="All teams"
              allowEmpty
            />
          )}
        </div>
      </div>

      {selectedOrgId && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className={cn('w-5 h-5', isLight ? 'text-blue-500' : 'text-blue-400')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                Agents{' '}
                <span className={cn('text-xs font-normal', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  ({filteredAgents.length})
                </span>
              </h3>
            </div>
            {!showCreateForm && (
              <button
                onClick={() => {
                  setShowCreateForm(true);
                  setEditingAgentId(null);
                  setEditForm(null);
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
                Add Agent
              </button>
            )}
          </div>

          {showCreateForm && (
            <form
              onSubmit={handleCreateAgent}
              className={cn(
                'space-y-3 rounded-lg border p-4',
                isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
              )}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Agent Type
                  </label>
                  <input
                    type="text"
                    value={createForm.agentType}
                    onChange={e => setCreateForm(prev => ({ ...prev, agentType: e.target.value }))}
                    placeholder="general"
                    required
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                    )}
                  />
                </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={createForm.agentName}
                    onChange={e => setCreateForm(prev => ({ ...prev, agentName: e.target.value }))}
                    placeholder="General Agent"
                    required
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                    )}
                  />
                </div>
              </div>

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  value={createForm.description}
                  onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                    isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-gray-100',
                  )}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Base Instructions
                  </label>
                  <InstructionTemplateSelector
                    isLight={isLight}
                    instructions={baseInstructions}
                    onSelect={instruction => setCreateForm(prev => ({ ...prev, promptTemplate: instruction.instructionValue }))}
                    onSave={() => openSaveTemplateDialog('create')}
                  />
                </div>
                <textarea
                  rows={6}
                  value={createForm.promptTemplate}
                  onChange={e => setCreateForm(prev => ({ ...prev, promptTemplate: e.target.value }))}
                  placeholder="You are a helpful AI assistant..."
                  required
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 agents-tab-scrollbar',
                    isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-gray-100',
                  )}
                />
              </div>

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Metadata JSON (optional)
                </label>
                <textarea
                  rows={3}
                  value={createForm.metadata}
                  onChange={e => setCreateForm(prev => ({ ...prev, metadata: e.target.value }))}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500',
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
                      name="create-agent-scope"
                      value="organization"
                      checked={createForm.scope === 'organization'}
                      onChange={() => setCreateForm(prev => ({ ...prev, scope: 'organization', teamId: '' }))}
                      label="Organization"
                      isLight={isLight}
                    />
                    <Radio
                      name="create-agent-scope"
                      value="team"
                      checked={createForm.scope === 'team'}
                      onChange={() => setCreateForm(prev => ({ ...prev, scope: 'team' }))}
                      label="Team"
                      isLight={isLight}
                    />
                  </div>
                </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Team (optional)
                  </label>
                  <SingleTeamSelector
                    isLight={isLight}
                    teams={teams}
                    selectedTeamId={createForm.teamId}
                    onTeamChange={value => setCreateForm(prev => ({ ...prev, teamId: value }))}
                    placeholder="Select team"
                    disabled={createForm.scope !== 'team'}
                    allowEmpty={false}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Model Availability
                  </label>
                  <span className={cn('text-[11px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                    {createForm.modelMode === 'all' ? 'All models allowed' : `${createForm.modelIds.length} selected`}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <Radio
                    name="create-agent-model-mode"
                    value="all"
                    checked={createForm.modelMode === 'all'}
                    onChange={() => setCreateForm(prev => ({ ...prev, modelMode: 'all' }))}
                    label="All models"
                    isLight={isLight}
                  />
                  <Radio
                    name="create-agent-model-mode"
                    value="custom"
                    checked={createForm.modelMode === 'custom'}
                    onChange={() => setCreateForm(prev => ({ ...prev, modelMode: 'custom' }))}
                    label="Specific models"
                    isLight={isLight}
                  />
                </div>
                {createForm.modelMode === 'custom' && (
                  <>
                    <ModelMultiSelector
                      isLight={isLight}
                      models={availableCreateModels}
                      selectedModelIds={createForm.modelIds}
                      onChange={ids => setCreateForm(prev => ({ ...prev, modelIds: ids }))}
                      loading={modelsLoading}
                      disabled={createModelsDisabled}
                      placeholder={createModelsPlaceholder}
                    />
                    {createModelsDisabled && (
                      <p className={cn('text-[11px]', isLight ? 'text-red-500' : 'text-red-400')}>
                        {createForm.scope === 'team' && !createForm.teamId
                          ? 'Select a team to see team-scoped models.'
                          : 'No models available for this scope.'}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Checkbox
                  checked={createForm.enabled}
                  onChange={checked => setCreateForm(prev => ({ ...prev, enabled: checked }))}
                  label="Agent is active"
                  isLight={isLight}
                />

                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="submit"
                    className={cn(
                      'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                      isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                    )}
                  >
                    Create Agent
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      resetCreateForm();
                    }}
                    className={cn(
                      'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                      isLight ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-900/30 text-red-400 hover:bg-red-900/50',
                    )}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {listLoading ? (
              Array.from({ length: 4 }).map((_, idx) => <AgentSkeletonCard key={`agent-skeleton-${idx}`} isLight={isLight} />)
            ) : filteredAgents.length === 0 ? (
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
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <p className={cn('text-sm font-medium', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  No agents configured
                </p>
                <p className={cn('text-xs mt-1', isLight ? 'text-gray-500' : 'text-gray-500')}>
                  Add an agent to control AI behavior for this organization or team.
                </p>
              </div>
            ) : (
              filteredAgents.map(agent => {
                const isEditing = editingAgentId === agent.id;

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      'p-4 rounded-lg border transition-all',
                      isLight ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm' : 'bg-[#151C24] border-gray-700 hover:border-gray-600',
                    )}
                  >
                    {isEditing && editForm ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Agent Type
                            </label>
                            <input
                              type="text"
                              value={editForm.agentType}
                              onChange={e => setEditForm(prev => (prev ? { ...prev, agentType: e.target.value } : prev))}
                              className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                              )}
                            />
                          </div>
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Agent Name
                            </label>
                            <input
                              type="text"
                              value={editForm.agentName}
                              onChange={e => setEditForm(prev => (prev ? { ...prev, agentName: e.target.value } : prev))}
                              className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                              )}
                            />
                          </div>
                        </div>

                        <div>
                          <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Description (optional)
                          </label>
                          <textarea
                            rows={2}
                            value={editForm.description}
                            onChange={e => setEditForm(prev => (prev ? { ...prev, description: e.target.value } : prev))}
                            className={cn(
                              'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                              isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-gray-100',
                            )}
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Base Instructions
                            </label>
                            <InstructionTemplateSelector
                              isLight={isLight}
                              instructions={baseInstructions}
                              onSelect={instruction => setEditForm(prev => (prev ? { ...prev, promptTemplate: instruction.instructionValue } : prev))}
                              onSave={() => openSaveTemplateDialog('edit')}
                            />
                          </div>
                          <textarea
                            rows={6}
                            value={editForm.promptTemplate}
                            onChange={e => setEditForm(prev => (prev ? { ...prev, promptTemplate: e.target.value } : prev))}
                            className={cn(
                              'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 agents-tab-scrollbar',
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
                            value={editForm.metadata}
                            onChange={e => setEditForm(prev => (prev ? { ...prev, metadata: e.target.value } : prev))}
                            className={cn(
                              'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500',
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
                                name={`agent-scope-${agent.id}`}
                                value="organization"
                                checked={editForm.scope === 'organization'}
                                onChange={() => setEditForm(prev => (prev ? { ...prev, scope: 'organization', teamId: '' } : prev))}
                                label="Organization"
                                isLight={isLight}
                              />
                              <Radio
                                name={`agent-scope-${agent.id}`}
                                value="team"
                                checked={editForm.scope === 'team'}
                                onChange={() => setEditForm(prev => (prev ? { ...prev, scope: 'team' } : prev))}
                                label="Team"
                                isLight={isLight}
                              />
                            </div>
                          </div>
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Team (optional)
                            </label>
                            <SingleTeamSelector
                              isLight={isLight}
                              teams={teams}
                              selectedTeamId={editForm.teamId}
                              onTeamChange={value => setEditForm(prev => (prev ? { ...prev, teamId: value } : prev))}
                              placeholder="Select team"
                              disabled={editForm.scope !== 'team'}
                              allowEmpty={false}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Model Availability
                            </label>
                            <span className={cn('text-[11px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                              {editForm.modelMode === 'all' ? 'All models allowed' : `${editForm.modelIds.length} selected`}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <Radio
                              name={`edit-agent-model-mode-${agent.id}`}
                              value="all"
                              checked={editForm.modelMode === 'all'}
                              onChange={() => setEditForm(prev => (prev ? { ...prev, modelMode: 'all' } : prev))}
                              label="All models"
                              isLight={isLight}
                            />
                            <Radio
                              name={`edit-agent-model-mode-${agent.id}`}
                              value="custom"
                              checked={editForm.modelMode === 'custom'}
                              onChange={() => setEditForm(prev => (prev ? { ...prev, modelMode: 'custom' } : prev))}
                              label="Specific models"
                              isLight={isLight}
                            />
                          </div>
                          {editForm.modelMode === 'custom' && (
                            <>
                              <ModelMultiSelector
                                isLight={isLight}
                                models={availableEditModels}
                                selectedModelIds={editForm.modelIds}
                                onChange={ids => setEditForm(prev => (prev ? { ...prev, modelIds: ids } : prev))}
                                loading={modelsLoading}
                                disabled={editModelsDisabled}
                                placeholder={editModelsPlaceholder}
                              />
                              {editModelsDisabled && (
                                <p className={cn('text-[11px]', isLight ? 'text-red-500' : 'text-red-400')}>
                                  {editForm.scope === 'team' && !editForm.teamId
                                    ? 'Select a team to see team-scoped models.'
                                    : 'No models available for this scope.'}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <Checkbox
                            checked={editForm.enabled}
                            onChange={checked => setEditForm(prev => (prev ? { ...prev, enabled: checked } : prev))}
                            label="Agent is active"
                            isLight={isLight}
                          />

                          <div className="flex flex-wrap gap-2 justify-end">
                            <button
                              onClick={() => handleUpdateAgent(agent.id)}
                              className={cn(
                                'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                                isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                              )}
                            >
                              Save Changes
                            </button>
                            <button
                              onClick={cancelEditAgent}
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
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                              {agent.agentName}
                            </div>
                            <div className={cn('text-xs mt-0.5', isLight ? 'text-gray-500' : 'text-gray-400')}>
                              {agent.agentType}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {renderScopeBadge(agent)}
                            </div>
                          </div>

                          <div className="flex gap-1">
                            <button
                              onClick={() => startEditAgent(agent)}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight
                                  ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                              )}
                              title="Edit agent"
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
                              onClick={() => {
                                setDeleteConfirm({ id: agent.id, agentType: agent.agentType });
                                setDeleteDialogOpen(true);
                              }}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight
                                  ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                                  : 'text-red-400 hover:bg-red-900/20 hover:text-red-300',
                              )}
                              title="Remove agent"
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

                        {agent.description && (
                          <div className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                            {agent.description}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={cn('font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Models:
                          </span>
                          {(agent.modelIds && agent.modelIds.length > 0) ? (
                            agent.modelIds.map(modelId => {
                              const model = modelLookup[modelId];
                              const displayName = model?.name || modelId;
                              return (
                                <span
                                  key={`${agent.id}-${modelId}`}
                                  className={cn(
                                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium',
                                    isLight ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/30 text-purple-300'
                                  )}
                                >
                                  {displayName}
                                </span>
                              );
                            })
                          ) : (
                            <span className={cn(isLight ? 'text-gray-500' : 'text-gray-400')}>All models</span>
                          )}
                        </div>

                        <div>
                          <button
                            type="button"
                            onClick={() => toggleInstructions(agent.id)}
                            className={cn(
                              'flex items-center justify-between w-full text-xs font-medium mb-1 transition-colors',
                              isLight ? 'text-gray-700 hover:text-gray-900' : 'text-gray-300 hover:text-gray-100'
                            )}>
                            <span>Base Instructions</span>
                            <svg
                              className={cn('w-4 h-4 transition-transform', expandedInstructions.has(agent.id) && 'rotate-180')}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {expandedInstructions.has(agent.id) && (
                            <pre className={cn('text-xs whitespace-pre-wrap font-mono p-2 rounded max-h-32 overflow-auto agents-tab-scrollbar', isLight ? 'bg-gray-50 text-gray-800' : 'bg-gray-900/40 text-gray-200')}>
                              {agent.promptTemplate}
                            </pre>
                          )}
                        </div>

                        <div
                          className={cn(
                            'flex items-center justify-between pt-3 border-t',
                            isLight ? 'border-gray-200' : 'border-gray-700',
                          )}
                        >
                          <div className="flex-1 pr-3">
                            <label
                              htmlFor={`agent-enabled-${agent.id}`}
                              className={cn('text-xs font-medium cursor-pointer block', isLight ? 'text-gray-900' : 'text-gray-100')}
                            >
                              Agent Enabled
                            </label>
                            <p className={cn('text-xs mt-0.5', isLight ? 'text-gray-500' : 'text-gray-400')}>
                              {agent.enabled ? 'Agent is active and selectable' : 'Agent is disabled'}
                            </p>
                          </div>
                          <button
                            id={`agent-enabled-${agent.id}`}
                            role="switch"
                            aria-checked={agent.enabled}
                            onClick={() => handleToggleEnabled(agent)}
                            className={cn(
                              'relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-offset-1',
                              agent.enabled
                                ? 'bg-blue-600 focus:ring-blue-500'
                                : isLight
                                  ? 'bg-gray-200 focus:ring-gray-300'
                                  : 'bg-gray-600 focus:ring-gray-500',
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                'pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                agent.enabled ? 'translate-x-3' : 'translate-x-0',
                              )}
                            />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {deleteDialogOpen && deleteConfirm && (
        <>
          <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm" onClick={() => setDeleteDialogOpen(false)} />
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}
            >
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}
              >
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Delete Agent
                </h2>
                <button
                  onClick={() => setDeleteDialogOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3 px-3 py-4">
                <div className="flex items-start gap-3">
                  <div
                    className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', isLight ? 'bg-red-100' : 'bg-red-900/30')}
                  >
                    <svg className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M12 9V3H8v6H5l5 6 5-6h-3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                      Delete agent "{deleteConfirm.agentType}"?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      This agent will be removed and will no longer be available for selection.
                    </p>
                  </div>
                </div>
              </div>

              <div className={cn('flex items-center justify-end gap-2 border-t px-3 py-2', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <button
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setDeleteConfirm(null);
                  }}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAgent}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {saveTemplateDialogOpen && (
        <>
          <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm" onClick={() => setSaveTemplateDialogOpen(false)} />
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'border border-gray-200 bg-gray-50' : 'border border-gray-700 bg-[#151C24]',
              )}
              onClick={e => e.stopPropagation()}
            >
              <div
                className={cn(
                  'flex items-center justify-between border-b px-4 py-3',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}
              >
                <h2 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
                  Save as Template
                </h2>
                <button
                  onClick={() => setSaveTemplateDialogOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3 px-4 py-4">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Template Key
                  </label>
                  <input
                    type="text"
                    value={templateForm.key}
                    onChange={e => setTemplateForm(prev => ({ ...prev, key: e.target.value }))}
                    placeholder="e.g., helpful-assistant"
                    required
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#151C24] border-gray-600 text-white',
                    )}
                  />
                </div>

                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Description (optional)
                  </label>
                  <textarea
                    rows={2}
                    value={templateForm.description}
                    onChange={e => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                    className={cn(
                      'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
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
                        name="template-scope"
                        value="organization"
                        checked={templateForm.scope === 'organization'}
                        onChange={() => setTemplateForm(prev => ({ ...prev, scope: 'organization', teamId: '' }))}
                        label="Organization"
                        isLight={isLight}
                      />
                      <Radio
                        name="template-scope"
                        value="team"
                        checked={templateForm.scope === 'team'}
                        onChange={() => setTemplateForm(prev => ({ ...prev, scope: 'team' }))}
                        label="Team"
                        isLight={isLight}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      Team (optional)
                    </label>
                    <SingleTeamSelector
                      isLight={isLight}
                      teams={teams}
                      selectedTeamId={templateForm.teamId}
                      onTeamChange={value => setTemplateForm(prev => ({ ...prev, teamId: value }))}
                      placeholder="Select team"
                      disabled={templateForm.scope !== 'team'}
                      allowEmpty={false}
                    />
                  </div>
                </div>
              </div>

              <div className={cn('flex items-center justify-end gap-2 border-t px-4 py-3', isLight ? 'border-gray-200' : 'border-gray-700')}>
                <button
                  onClick={() => setSaveTemplateDialogOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    isLight ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-100 hover:bg-gray-600',
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplate}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
                >
                  Save Template
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AgentsTab;

