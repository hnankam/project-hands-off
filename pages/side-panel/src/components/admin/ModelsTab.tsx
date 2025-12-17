import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@extension/ui';
import { authClient } from '../../lib/auth-client';
import { OrganizationSelector, TeamMultiSelector } from './selectors';
import { Radio, Checkbox } from './form-controls';
import { CodeMirrorJsonEditor } from './editors';
import { AdminConfirmDialog } from './modals';

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

interface ProviderSummary {
  id: string;
  providerKey: string;
  providerType: string;
  teams: Array<{ id: string; name: string }>;
  enabled: boolean;
}

interface ModelRecord {
  id: string;
  modelKey: string;
  modelName: string;
  displayName: string | null;
  description: string | null;
  providerId: string;
  providerKey: string;
  providerType: string;
  organizationId: string;
  teams: Array<{ id: string; name: string }>; // Multi-team support
  enabled: boolean;
  modelSettingsOverride: Record<string, any> | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

type ModelScope = 'organization' | 'team';

interface ModelFormState {
  modelKey: string;
  modelName: string;
  displayName: string;
  description: string;
  providerId: string;
  scope: ModelScope;
  teamIds: string[]; // Multi-team support
  modelSettings: string;
  metadata: string;
  enabled: boolean;
}

interface ModelsTabProps {
  isLight: boolean;
  organizations: Organization[];
  preselectedOrgId?: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const INITIAL_FORM: ModelFormState = {
  modelKey: '',
  modelName: '',
  displayName: '',
  description: '',
  providerId: '',
  scope: 'organization',
  teamIds: [], // Multi-team support
  modelSettings: '{}',
  metadata: '{}',
  enabled: true,
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

const ModelSkeletonCard: React.FC<{ isLight: boolean }> = ({ isLight }) => (
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

interface ProviderDropdownProps {
  isLight: boolean;
  providers: ProviderSummary[];
  selectedProviderId: string;
  onChange: (providerId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const ProviderDropdown: React.FC<ProviderDropdownProps> = ({
  isLight,
  providers,
  selectedProviderId,
  onChange,
  placeholder = 'Select provider',
  disabled = false,
}) => {
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

  const selectedProvider = providers.find(provider => provider.id === selectedProviderId);

  if (disabled) {
    return (
      <div
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] border opacity-60',
          isLight ? 'bg-white border-gray-300 text-gray-500' : 'bg-[#151C24] border-gray-600 text-gray-400',
        )}
      >
        <span className="flex-1 truncate text-left">{selectedProvider ? `${selectedProvider.providerKey} · ${selectedProvider.providerType}` : placeholder}</span>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] border opacity-50',
          isLight ? 'bg-white border-gray-300 text-gray-500' : 'bg-[#151C24] border-gray-600 text-gray-400',
        )}
      >
        <span className="flex-1 truncate text-left">No providers available</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] min-w-0 w-full border',
          isLight
            ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <span className="font-medium truncate flex-1 min-w-0 text-left">
          {selectedProvider ? `${selectedProvider.providerKey} · ${selectedProvider.providerType}` : placeholder}
        </span>
        <svg
          className={cn('transition-transform flex-shrink-0 mt-0.5', isOpen ? 'rotate-180' : '')}
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
            'absolute top-full left-0 mt-1 w-full min-w-[200px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
          )}
        >
          {providers.map(provider => (
            <button
              type="button"
              key={provider.id}
              onClick={() => {
                onChange(provider.id);
                setIsOpen(false);
              }}
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors text-left',
                selectedProviderId === provider.id
                  ? isLight
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'bg-blue-900/30 text-blue-300 font-medium'
                  : isLight
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-200 hover:bg-gray-700',
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{provider.providerKey}</div>
                <div className={cn('truncate text-[11px]', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  {provider.providerType}
                  {provider.teams.length > 0 ? ` · ${provider.teams.map(t => t.name).join(', ')}` : ''}
                </div>
              </div>
              {selectedProviderId === provider.id && (
                <svg className="ml-auto flex-shrink-0" width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export function ModelsTab({ isLight, organizations, preselectedOrgId, onError, onSuccess }: ModelsTabProps) {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .models-tab-scrollbar::-webkit-scrollbar {
        width: 3px;
        height: 3px;
      }
      .models-tab-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .models-tab-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(156, 163, 175, 0.3);
        border-radius: 2px;
      }
      .models-tab-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(156, 163, 175, 0.5);
      }
      .dark .models-tab-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(75, 85, 99, 0.3);
      }
      .dark .models-tab-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(75, 85, 99, 0.5);
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [models, setModels] = useState<ModelRecord[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState(preselectedOrgId || '');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilterIds, setTeamFilterIds] = useState<string[]>([]);
  const teamFilterIdsRef = useRef(teamFilterIds);
  useEffect(() => {
    teamFilterIdsRef.current = teamFilterIds;
  }, [teamFilterIds]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<ModelFormState>(INITIAL_FORM);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ModelFormState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; modelKey: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<{ state: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ state: 'idle' });
  const [testStatusClosing, setTestStatusClosing] = useState(false);

  const initialLoadCompleteRef = useRef(false);

  useEffect(() => {
    if (!selectedOrgId && organizations.length === 1) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [organizations, selectedOrgId]);

  useEffect(() => {
    if (preselectedOrgId && preselectedOrgId !== selectedOrgId) {
      setSelectedOrgId(preselectedOrgId);
    }
  }, [preselectedOrgId]); // Only react to parent changes, not user selections

  const loadTeams = useCallback(async (orgId: string): Promise<Team[]> => {
    setTeamsLoading(true);
    try {
      try {
        await (authClient.organization as any).setActive({ organizationId: orgId });
      } catch (err) {
        console.warn('[ModelsTab] Failed to set active organization', err);
      }

      const { data, error } = await (authClient.organization as any).listTeams({
        query: { organizationId: orgId },
      });

      if (error) throw new Error(error.message);

      const teamsForOrg = (data || []).filter((team: Team) => team.organizationId === orgId);
      setTeams(teamsForOrg);
      return teamsForOrg;
    } catch (err: any) {
      console.warn('[ModelsTab] Failed to load teams:', err);
      setTeams([]);
      return [];
    } finally {
      setTeamsLoading(false);
    }
  }, []);

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

  const fetchProvidersForOrg = useCallback(
    async (orgId: string, signal?: AbortSignal, attempt = 1): Promise<ProviderSummary[]> => {
      const params = new URLSearchParams({ organizationId: orgId });
      const response = await fetch(`${baseURL}/api/admin/providers?${params.toString()}`, {
        credentials: 'include',
        signal,
      });

      if (response.status === 429 && attempt < MAX_FETCH_RETRIES) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryDelaySeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const retryDelayMs = Number.isFinite(retryDelaySeconds)
          ? Math.max(retryDelaySeconds * 1000, 300)
          : 500 * attempt;

        await waitFor(retryDelayMs, signal);
        return fetchProvidersForOrg(orgId, signal, attempt + 1);
      }

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to load providers');
      }

      const data = await response.json();
      const items: ProviderSummary[] = (data.providers || []).map((provider: any) => ({
        id: provider.id,
        providerKey: provider.providerKey,
        providerType: provider.providerType,
        teams: provider.teams || [],
        enabled: provider.enabled,
      }));
      return items;
    },
    [baseURL],
  );

  const refreshProviders = useCallback(
    async (orgId: string, { signal }: { signal?: AbortSignal } = {}) => {
      setProvidersLoading(true);
      try {
        const items = await fetchProvidersForOrg(orgId, signal);
        if (!signal || !signal.aborted) {
          setProviders(items);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        console.error('[ModelsTab] Error loading providers:', err);
        onError(err?.message || 'Failed to load providers');
        setProviders([]);
      } finally {
        if (!signal || !signal.aborted) {
          setProvidersLoading(false);
        }
      }
    },
    [fetchProvidersForOrg, onError],
  );

  const fetchModels = useCallback(
    async (orgId: string, teamIds: string[], signal?: AbortSignal, attempt = 1): Promise<ModelRecord[]> => {
      const params = new URLSearchParams({ organizationId: orgId });
      // Add all selected teams for filtering
      teamIds.forEach(teamId => {
        if (teamId) params.append('teamIds', teamId);
      });

      const response = await fetch(`${baseURL}/api/admin/models?${params.toString()}`, {
        credentials: 'include',
        signal,
      });

      if (response.status === 429 && attempt < MAX_FETCH_RETRIES) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryDelaySeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const retryDelayMs = Number.isFinite(retryDelaySeconds)
          ? Math.max(retryDelaySeconds * 1000, 300)
          : 500 * attempt;

        await waitFor(retryDelayMs, signal);
        return fetchModels(orgId, teamIds, signal, attempt + 1);
      }

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to load models');
      }

      const data = await response.json();
      return (data.models || []) as ModelRecord[];
    },
    [baseURL],
  );

  const refreshModels = useCallback(
    async (orgId: string, teamIds: string[], { signal, suppressLoading = false }: { signal?: AbortSignal; suppressLoading?: boolean } = {}) => {
      if (!suppressLoading) {
        setListLoading(true);
      }

      try {
        const items = await fetchModels(orgId, teamIds, signal);
        if (!signal || !signal.aborted) {
          setModels(items);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        console.error('[ModelsTab] Error loading models:', err);
        onError(err?.message || 'Failed to load models');
        setModels([]);
      } finally {
        if (!suppressLoading && (!signal || !signal.aborted)) {
          setListLoading(false);
        }
      }
    },
    [fetchModels, onError],
  );

  const teamMap = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach(team => map.set(team.id, team.name));
    return map;
  }, [teams]);

  useEffect(() => {
    if (!selectedOrgId) {
      initialLoadCompleteRef.current = false;
      setTeams([]);
      setProviders([]);
      setModels([]);
      setTeamFilterIds([]);
      setListLoading(false);
      setProvidersLoading(false);
      setTeamsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    initialLoadCompleteRef.current = false;

    const loadInitialData = async () => {
      setListLoading(true);
      const teamsForOrg = await loadTeams(selectedOrgId);
      if (cancelled) return;

      await refreshProviders(selectedOrgId, { signal: controller.signal });
      if (cancelled) return;

      const currentFilterIds = teamFilterIdsRef.current;
      const activeTeamIds = currentFilterIds.filter(id => teamsForOrg.some(team => team.id === id));

      await refreshModels(selectedOrgId, activeTeamIds, { signal: controller.signal, suppressLoading: true });
      if (!cancelled) {
        setListLoading(false);
        initialLoadCompleteRef.current = true;
      }
    };

    loadInitialData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedOrgId, loadTeams, refreshModels, refreshProviders]);

  useEffect(() => {
    if (!selectedOrgId || !initialLoadCompleteRef.current) {
      return;
    }

    const controller = new AbortController();
    const activeTeamIds = teamFilterIds.filter(id => teamMap.has(id));
    refreshModels(selectedOrgId, activeTeamIds, { signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [selectedOrgId, teamFilterIds, teamMap, refreshModels]);

  useEffect(() => {
    if (teamFilterIds.length === 0) return;
    const validIds = teamFilterIds.filter(id => teamMap.has(id));
    if (validIds.length === 0) {
      setTeamFilterIds([]);
    } else if (validIds.length !== teamFilterIds.length) {
      setTeamFilterIds(validIds);
    }
  }, [teamFilterIds, teamMap]);

  const filteredModels = useMemo(() => {
    if (teamFilterIds.length === 0) {
      return models;
    }
    const activeTeamIds = teamFilterIds.filter(id => teamMap.has(id));
    if (activeTeamIds.length === 0) {
      return models.filter(model => model.teams.length === 0);
    }
    return models.filter(
      model =>
        model.teams.length === 0 || model.teams.some(t => activeTeamIds.includes(t.id))
    );
  }, [models, teamFilterIds, teamMap]);

  const providerOptionsForForm = (scope: ModelScope, teamIds: string[]) => {
    if (scope === 'organization') {
      return providers.filter(provider => provider.teams.length === 0);
    }
    const effectiveTeamIds = teamIds.filter(id => id && id.trim() !== '');
    if (effectiveTeamIds.length === 0) {
      return providers.filter(provider => provider.teams.length === 0);
    }
    return providers.filter(provider => {
      const providerTeamIds = provider.teams.map(t => t.id);
      return providerTeamIds.length === 0 || providerTeamIds.some(ptId => effectiveTeamIds.includes(ptId));
    });
  };

  useEffect(() => {
    if (!createForm.providerId) return;
    const options = providerOptionsForForm(createForm.scope, createForm.teamIds);
    if (!options.some(provider => provider.id === createForm.providerId)) {
      setCreateForm(prev => ({ ...prev, providerId: '' }));
    }
  }, [createForm.scope, createForm.teamIds, providers, createForm.providerId]);

  useEffect(() => {
    if (!editForm?.providerId) return;
    const options = providerOptionsForForm(editForm.scope, editForm.teamIds);
    if (!options.some(provider => provider.id === editForm.providerId)) {
      setEditForm(prev => (prev ? { ...prev, providerId: '' } : prev));
    }
  }, [editForm?.scope, editForm?.teamIds, providers, editForm?.providerId]);

  const handleTeamFilterChange = (teamIds: string[]) => {
    setTeamFilterIds(teamIds);
  };

  const resetCreateForm = () => {
    setCreateForm(INITIAL_FORM);
  };

  const handleCreateModel = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedOrgId) {
      onError('Select an organization before creating a model');
      return;
    }

    if (!createForm.modelKey.trim()) {
      onError('Model key is required');
      return;
    }

    if (!createForm.modelName.trim()) {
      onError('Model name is required');
      return;
    }

    if (!createForm.providerId) {
      onError('Select a provider for this model');
      return;
    }

    if (createForm.scope === 'team' && createForm.teamIds.length === 0) {
      onError('Select at least one team for team-scoped models');
      return;
    }

    const allowedProviders = providerOptionsForForm(createForm.scope, createForm.teamIds);
    if (!allowedProviders.some(provider => provider.id === createForm.providerId)) {
      onError('Selected provider is not valid for the chosen scope');
      return;
    }

    try {
      const payload = {
        organizationId: selectedOrgId,
        teamIds: createForm.scope === 'team' ? createForm.teamIds : [],
        providerId: createForm.providerId,
        modelKey: createForm.modelKey.trim(),
        modelName: createForm.modelName.trim(),
        displayName: createForm.displayName.trim() || null,
        description: createForm.description.trim() || null,
        enabled: createForm.enabled,
        modelSettings: sanitizeJsonText(createForm.modelSettings, 'Model settings'),
        metadata: sanitizeJsonText(createForm.metadata, 'Metadata'),
      };

      const response = await fetch(`${baseURL}/api/admin/models`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to create model');
      }

      const data = await response.json();
      onSuccess(`Model "${data.model?.modelKey || createForm.modelKey}" created successfully`);
      setShowCreateForm(false);
      resetCreateForm();
      await refreshModels(selectedOrgId, teamFilterIds);
    } catch (err: any) {
      console.error('[ModelsTab] Failed to create model:', err);
      onError(err.message || 'Failed to create model');
    }
  };

  const startEditModel = (model: ModelRecord) => {
    setEditingModelId(model.id);
    setEditForm({
      modelKey: model.modelKey,
      modelName: model.modelName,
      displayName: model.displayName || '',
      description: model.description || '',
      providerId: model.providerId,
      scope: model.teams.length > 0 ? 'team' : 'organization',
      teamIds: model.teams.map(t => t.id),
      modelSettings: stringifyJson(model.modelSettingsOverride),
      metadata: stringifyJson(model.metadata),
      enabled: model.enabled,
    });
    setTestStatus({ state: 'idle' });
  };

  const cancelEditModel = () => {
    setEditingModelId(null);
    setEditForm(null);
    setTestStatus({ state: 'idle' });
  };

  useEffect(() => {
    setTestStatus(prev => (prev.state === 'idle' ? prev : { state: 'idle' }));
  }, [editForm?.providerId, editForm?.modelName, editForm?.modelKey]);

  const handleUpdateModel = async (modelId: string) => {
    if (!selectedOrgId || !editForm) return;

    if (!editForm.modelKey.trim()) {
      onError('Model key is required');
      return;
    }

    if (!editForm.modelName.trim()) {
      onError('Model name is required');
      return;
    }

    if (!editForm.providerId) {
      onError('Select a provider for this model');
      return;
    }

    if (editForm.scope === 'team' && editForm.teamIds.length === 0) {
      onError('Select at least one team for team-scoped models');
      return;
    }

    const allowedProviders = providerOptionsForForm(editForm.scope, editForm.teamIds);
    if (!allowedProviders.some(provider => provider.id === editForm.providerId)) {
      onError('Selected provider is not valid for the chosen scope');
      return;
    }

    try {
      const payload = {
        organizationId: selectedOrgId,
        teamIds: editForm.scope === 'team' ? editForm.teamIds : [],
        providerId: editForm.providerId,
        modelKey: editForm.modelKey.trim(),
        modelName: editForm.modelName.trim(),
        displayName: editForm.displayName.trim() || null,
        description: editForm.description.trim() || null,
        enabled: editForm.enabled,
        modelSettings: sanitizeJsonText(editForm.modelSettings, 'Model settings'),
        metadata: sanitizeJsonText(editForm.metadata, 'Metadata'),
      };

      const response = await fetch(`${baseURL}/api/admin/models/${modelId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to update model');
      }

      const data = await response.json();
      onSuccess(`Model "${data.model?.modelKey || editForm.modelKey}" updated successfully`);
      setEditingModelId(null);
      setEditForm(null);
      setTestStatus({ state: 'idle' });
      await refreshModels(selectedOrgId, teamFilterIds);
    } catch (err: any) {
      console.error('[ModelsTab] Failed to update model:', err);
      onError(err.message || 'Failed to update model');
    }
  };

  const handleTestModel = async (modelId: string) => {
    if (!selectedOrgId || !editForm) {
      return;
    }

    if (!editForm.modelName.trim()) {
      setTestStatus({ state: 'error', message: 'Model name is required to test connectivity' });
      return;
    }

    if (!editForm.providerId) {
      setTestStatus({ state: 'error', message: 'Select a provider before testing connectivity' });
      return;
    }

    let modelSettingsJSON: Record<string, any> = {};
    let metadataJSON: Record<string, any> = {};

    try {
      modelSettingsJSON = sanitizeJsonText(editForm.modelSettings, 'Model settings');
      metadataJSON = sanitizeJsonText(editForm.metadata, 'Metadata');
    } catch (err: any) {
      setTestStatus({ state: 'error', message: err.message || 'Invalid JSON payload' });
      return;
    }

    setTestStatus({ state: 'loading' });

    try {
      const response = await fetch(`${baseURL}/api/admin/models/${modelId}/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrgId,
          providerId: editForm.providerId,
          modelKey: editForm.modelKey.trim(),
          modelName: editForm.modelName.trim(),
          displayName: editForm.displayName?.trim() || null,
          modelSettings: modelSettingsJSON,
          metadata: metadataJSON,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Model connectivity test failed');
      }

      setTestStatus({
        state: 'success',
        message: payload?.result?.message || 'Model connectivity test succeeded',
      });
    } catch (err: any) {
      console.error('[ModelsTab] Model connectivity test failed:', err);
      setTestStatus({ state: 'error', message: err.message || 'Model connectivity test failed' });
    }
  };

  const handleTestNewModel = async () => {
    if (!selectedOrgId) {
      return;
    }

    if (!createForm.modelName.trim()) {
      setTestStatus({ state: 'error', message: 'Model name is required to test connectivity' });
      return;
    }

    if (!createForm.providerId) {
      setTestStatus({ state: 'error', message: 'Select a provider before testing connectivity' });
      return;
    }

    let modelSettingsJSON: Record<string, any> = {};
    let metadataJSON: Record<string, any> = {};

    try {
      modelSettingsJSON = sanitizeJsonText(createForm.modelSettings, 'Model settings');
      metadataJSON = sanitizeJsonText(createForm.metadata, 'Metadata');
    } catch (err: any) {
      setTestStatus({ state: 'error', message: err.message || 'Invalid JSON payload' });
      return;
    }

    setTestStatus({ state: 'loading' });

    try {
      // Use a temporary endpoint or the same endpoint with a placeholder ID
      const response = await fetch(`${baseURL}/api/admin/models/test-new`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrgId,
          providerId: createForm.providerId,
          modelKey: createForm.modelKey.trim(),
          modelName: createForm.modelName.trim(),
          displayName: createForm.displayName?.trim() || null,
          modelSettings: modelSettingsJSON,
          metadata: metadataJSON,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Model connectivity test failed');
      }

      setTestStatus({
        state: 'success',
        message: payload?.result?.message || 'Model connectivity test succeeded',
      });
    } catch (err: any) {
      console.error('[ModelsTab] Model connectivity test failed:', err);
      setTestStatus({ state: 'error', message: err.message || 'Model connectivity test failed' });
    }
  };

  const handleToggleEnabled = async (model: ModelRecord) => {
    if (!selectedOrgId) return;

    try {
      const payload = {
        organizationId: selectedOrgId,
        teamIds: model.teams.map(t => t.id),
        providerId: model.providerId,
        modelKey: model.modelKey,
        modelName: model.modelName,
        displayName: model.displayName,
        description: model.description,
        enabled: !model.enabled,
        modelSettings: model.modelSettingsOverride || {},
        metadata: model.metadata || {},
      };

      const response = await fetch(`${baseURL}/api/admin/models/${model.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to update model');
      }

      setModels(prev => prev.map(item => (item.id === model.id ? { ...item, enabled: !model.enabled } : item)));
      onSuccess(`Model "${model.modelKey}" ${model.enabled ? 'disabled' : 'enabled'}`);
    } catch (err: any) {
      console.error('[ModelsTab] Failed to toggle model:', err);
      onError(err.message || 'Failed to update model status');
    }
  };

  const handleDeleteModel = async () => {
    if (!deleteConfirm || !selectedOrgId) return;

    try {
      const params = new URLSearchParams({ organizationId: selectedOrgId });
      const response = await fetch(`${baseURL}/api/admin/models/${deleteConfirm.id}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to delete model');
      }

      onSuccess(`Model "${deleteConfirm.modelKey}" deleted successfully`);
      setDeleteDialogOpen(false);
      setDeleteConfirm(null);
      await refreshModels(selectedOrgId, teamFilterIds);
    } catch (err: any) {
      console.error('[ModelsTab] Failed to delete model:', err);
      onError(err.message || 'Failed to delete model');
      setDeleteDialogOpen(false);
      setDeleteConfirm(null);
    }
  };

  const renderScopeBadge = (model: ModelRecord) => {
    if (model.teams.length > 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {model.teams.map(team => (
            <span
              key={team.id}
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                isLight ? 'bg-gray-100 text-gray-700' : 'bg-gray-800 text-gray-300',
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
          isLight ? 'bg-gray-100 text-gray-700' : 'bg-gray-800 text-gray-300',
        )}
      >
        Organization
      </span>
    );
  };

  const renderProviderBadge = (model: ModelRecord) => (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
        isLight ? 'bg-gray-100 text-gray-700' : 'bg-gray-800 text-gray-300',
      )}
    >
      {model.providerKey}
    </span>
  );

  const providerOptionsForEdit = (currentProviderId: string, scope: ModelScope, teamIds: string[]) => {
    const baseOptions = providerOptionsForForm(scope, teamIds);
    if (baseOptions.some(provider => provider.id === currentProviderId)) {
      return baseOptions;
    }
    const currentProvider = providers.find(provider => provider.id === currentProviderId);
    if (currentProvider) {
      return [...baseOptions, currentProvider];
    }
    return baseOptions;
  };

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
              cancelEditModel();
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
            <TeamMultiSelector
              isLight={isLight}
              teams={teams}
              selectedTeamIds={teamFilterIds}
              onTeamChange={handleTeamFilterChange}
              placeholder="All teams"
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
                  strokeLinecap="round"
                  strokeLinejoin="round"
              >
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <h3 className={cn('text-sm font-semibold', mainTextColor)}>
                Models{' '}
                <span className={cn('text-xs font-normal', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  ({filteredModels.length})
                </span>
              </h3>
            </div>
            {!showCreateForm && (
              <button
                onClick={() => {
                  setShowCreateForm(true);
                  setEditingModelId(null);
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
                Add Model
              </button>
            )}
          </div>

          {showCreateForm && (
            <form
              onSubmit={handleCreateModel}
              className={cn(
                'space-y-3 rounded-lg border p-4',
                isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
              )}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Model Key
                  </label>
                  <input
                    type="text"
                    value={createForm.modelKey}
                    onChange={e => setCreateForm(prev => ({ ...prev, modelKey: e.target.value }))}
                    placeholder="gemini-2.5-flash-lite"
                    required
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                    )}
                  />
                </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Provider
                  </label>
                  {providersLoading ? (
                    <div
                      className={cn(
                        'h-[34px] w-full rounded-md border animate-pulse',
                        isLight ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800',
                      )}
                    />
                  ) : (
                    <ProviderDropdown
                      isLight={isLight}
                      providers={providerOptionsForForm(createForm.scope, createForm.teamIds)}
                      selectedProviderId={createForm.providerId}
                      onChange={value => setCreateForm(prev => ({ ...prev, providerId: value }))}
                      placeholder="Select provider"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Model Name
                  </label>
                  <input
                    type="text"
                    value={createForm.modelName}
                    onChange={e => setCreateForm(prev => ({ ...prev, modelName: e.target.value }))}
                    placeholder="gemini-2.5-flash-lite"
                    required
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                    )}
                  />
                </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Display Name (optional)
                  </label>
                  <input
                    type="text"
                    value={createForm.displayName}
                    onChange={e => setCreateForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Gemini 2.5 Flash Lite"
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
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
                    'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                    isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                  )}
                />
              </div>

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Model Settings JSON
                </label>
                <CodeMirrorJsonEditor
                  value={createForm.modelSettings}
                  onChange={value => setCreateForm(prev => ({ ...prev, modelSettings: value }))}
                  placeholder="{}"
                  isLight={isLight}
                  minHeight="20px"
                  maxHeight="150px"
                />
              </div>

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Metadata JSON
                </label>
                <CodeMirrorJsonEditor
                  value={createForm.metadata}
                  onChange={value => setCreateForm(prev => ({ ...prev, metadata: value }))}
                  placeholder="{}"
                  isLight={isLight}
                  minHeight="20px"
                  maxHeight="150px"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Scope
                  </label>
                  <div className="flex items-center gap-4">
                    <Radio
                      name="model-scope"
                      value="organization"
                      checked={createForm.scope === 'organization'}
                      onChange={() => setCreateForm(prev => ({ ...prev, scope: 'organization', teamId: '' }))}
                      label="Organization"
                      isLight={isLight}
                    />
                    <Radio
                      name="model-scope"
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
                    Teams (optional)
                  </label>
                  <TeamMultiSelector
                    isLight={isLight}
                    teams={teams}
                    selectedTeamIds={createForm.teamIds}
                    onTeamChange={(value: string[]) => setCreateForm(prev => ({ ...prev, teamIds: value }))}
                    placeholder="Select teams"
                    disabled={createForm.scope !== 'team'}
                  />
                </div>
              </div>

              <Checkbox
                checked={createForm.enabled}
                onChange={checked => setCreateForm(prev => ({ ...prev, enabled: checked }))}
                label="Model is active"
                isLight={isLight}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleTestNewModel()}
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

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className={cn(
                      'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                      isLight ? 'bg-blue-500/90 text-white hover:bg-blue-500' : 'bg-blue-600/90 text-white hover:bg-blue-600',
                    )}
                  >
                    Create Model
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
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {testStatus.state === 'success' ? (
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : testStatus.state === 'error' ? (
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    )}
                    <p className="break-words flex-1">{testStatus.message}</p>
                  </div>
                  <button
                    onClick={() => {
                      setTestStatusClosing(true);
                      setTimeout(() => {
                        setTestStatus({ state: 'idle' });
                        setTestStatusClosing(false);
                      }, 300);
                    }}
                    className={cn(
                      'flex-shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors',
                      isLight ? 'hover:bg-black/5' : 'hover:bg-white/10',
                    )}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </form>
          )}

          <div className="space-y-3">
            {listLoading ? (
              Array.from({ length: 4 }).map((_, idx) => <ModelSkeletonCard key={`model-skeleton-${idx}`} isLight={isLight} />)
            ) : filteredModels.length === 0 ? (
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
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                <p className={cn('text-sm font-medium', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  No models configured
                </p>
                <p className={cn('text-xs mt-1', isLight ? 'text-gray-500' : 'text-gray-500')}>
                  Add a model to control availability for this organization or team.
                </p>
              </div>
            ) : (
              filteredModels.map(model => {
                const isEditing = editingModelId === model.id;
                const providerOptions = providerOptionsForEdit(model.providerId, isEditing && editForm ? editForm.scope : model.teams.length > 0 ? 'team' : 'organization', isEditing && editForm ? editForm.teamIds : model.teams.map(t => t.id));

                return (
                  <div
                    key={model.id}
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
                              Model Key
                            </label>
                            <input
                              type="text"
                              value={editForm.modelKey}
                              onChange={e => setEditForm(prev => (prev ? { ...prev, modelKey: e.target.value } : prev))}
                              className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                              )}
                            />
                          </div>
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Provider
                            </label>
                            <ProviderDropdown
                              isLight={isLight}
                              providers={providerOptions}
                              selectedProviderId={editForm.providerId}
                              onChange={value => setEditForm(prev => (prev ? { ...prev, providerId: value } : prev))}
                              placeholder="Select provider"
                              disabled={providersLoading}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Model Name
                            </label>
                            <input
                              type="text"
                              value={editForm.modelName}
                              onChange={e => setEditForm(prev => (prev ? { ...prev, modelName: e.target.value } : prev))}
                              className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                              )}
                            />
                          </div>
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Display Name (optional)
                            </label>
                            <input
                              type="text"
                              value={editForm.displayName}
                              onChange={e => setEditForm(prev => (prev ? { ...prev, displayName: e.target.value } : prev))}
                              className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
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
                              'w-full px-3 py-2 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                              isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                            )}
                          />
                        </div>

                        <div>
                          <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Model Settings JSON
                          </label>
                          <CodeMirrorJsonEditor
                            value={editForm.modelSettings}
                            onChange={value => setEditForm(prev => (prev ? { ...prev, modelSettings: value } : prev))}
                            placeholder="{}"
                            isLight={isLight}
                            minHeight="20px"
                            maxHeight="150px"
                          />
                        </div>

                        <div>
                          <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Metadata JSON
                          </label>
                          <CodeMirrorJsonEditor
                            value={editForm.metadata}
                            onChange={value => setEditForm(prev => (prev ? { ...prev, metadata: value } : prev))}
                            placeholder="{}"
                            isLight={isLight}
                            minHeight="20px"
                            maxHeight="150px"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Scope
                            </label>
                            <div className="flex items-center gap-4">
                              <Radio
                                name={`model-scope-${model.id}`}
                                value="organization"
                                checked={editForm.scope === 'organization'}
                                onChange={() => setEditForm(prev => (prev ? { ...prev, scope: 'organization', teamId: '' } : prev))}
                                label="Organization"
                                isLight={isLight}
                              />
                              <Radio
                                name={`model-scope-${model.id}`}
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
                              Teams (optional)
                            </label>
                            <TeamMultiSelector
                              isLight={isLight}
                              teams={teams}
                              selectedTeamIds={editForm.teamIds}
                              onTeamChange={(value: string[]) => setEditForm(prev => (prev ? { ...prev, teamIds: value } : prev))}
                              placeholder="Select teams"
                              disabled={editForm.scope !== 'team'}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Checkbox
                            checked={editForm.enabled}
                            onChange={checked => setEditForm(prev => (prev ? { ...prev, enabled: checked } : prev))}
                            label="Model is active"
                            isLight={isLight}
                          />

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handleTestModel(model.id)}
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

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleUpdateModel(model.id)}
                                className={cn(
                                  'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                                  isLight ? 'bg-blue-500/90 text-white hover:bg-blue-500' : 'bg-blue-600/90 text-white hover:bg-blue-600',
                                )}
                              >
                                Save Changes
                              </button>
                              <button
                                onClick={cancelEditModel}
                                className={cn(
                                  'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                                  isLight ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                                )}
                              >
                                Cancel
                              </button>
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
                                        ? 'Testing model connectivity…'
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
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={cn('text-sm font-semibold', mainTextColor)}>
                              {model.displayName || model.modelKey}
                            </div>
                            <div className={cn('flex items-center gap-2 text-xs mt-0.5 flex-wrap', isLight ? 'text-gray-500' : 'text-gray-400')}>
                              <span>{model.modelKey} · {model.modelName}</span>
                              <span>|</span>
                              {renderProviderBadge(model)}
                              {renderScopeBadge(model)}
                            </div>
                          </div>

                          <div className="flex gap-1">
                            <button
                              onClick={() => startEditModel(model)}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight
                                  ? 'text-gray-400 hover:text-blue-600'
                                  : 'text-gray-500 hover:text-blue-400',
                              )}
                              title="Edit model"
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
                                setDeleteConfirm({ id: model.id, modelKey: model.modelKey });
                                setDeleteDialogOpen(true);
                              }}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight
                                  ? 'text-gray-400 hover:text-red-600'
                                  : 'text-gray-500 hover:text-red-400',
                              )}
                              title="Remove model"
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

                        {model.description && (
                          <div className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                            {model.description}
                          </div>
                        )}

                        <div
                          className={cn(
                            'flex items-center justify-between pt-3 border-t',
                            isLight ? 'border-gray-200' : 'border-gray-700',
                          )}
                        >
                          <div className="flex-1 pr-3">
                            <label
                              htmlFor={`model-enabled-${model.id}`}
                              className={cn('text-xs font-medium cursor-pointer block', mainTextColor)}
                            >
                              {model.enabled ? 'Model Enabled' : 'Model Disabled'}
                            </label>
                          </div>
                          <button
                            id={`model-enabled-${model.id}`}
                            role="switch"
                            aria-checked={model.enabled}
                            onClick={() => handleToggleEnabled(model)}
                            className={cn(
                              'relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-offset-1',
                              model.enabled
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
                                model.enabled ? 'translate-x-3' : 'translate-x-0',
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

      {/* Delete Confirmation Modal */}
      <AdminConfirmDialog
        isOpen={deleteDialogOpen && !!deleteConfirm}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeleteConfirm(null);
        }}
        onConfirm={handleDeleteModel}
        title="Delete Model"
        message={
          <div className="flex items-start gap-3">
            <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', isLight ? 'bg-red-100' : 'bg-red-900/30')}>
              <svg className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')} fill="currentColor" viewBox="0 0 20 20">
                <path d="M12 9V3H8v6H5l5 6 5-6h-3z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-medium', mainTextColor)}>
                Delete model "{deleteConfirm?.modelKey}"?
              </p>
              <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                This model will be removed and will no longer be available for selection.
              </p>
            </div>
          </div>
        }
        confirmText="Delete"
        variant="danger"
        isLight={isLight}
      />
    </div>
  );
}

export default ModelsTab;

