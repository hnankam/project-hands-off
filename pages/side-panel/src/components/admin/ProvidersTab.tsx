import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@extension/ui';
import { authClient } from '../../lib/auth-client';
import { OrganizationSelector } from './OrganizationSelector';
import { TeamMultiSelector } from './TeamMultiSelector';
import { Radio, Checkbox } from './FormControls';

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

interface ProviderRecord {
  id: string;
  providerKey: string;
  providerType: string;
  organizationId: string | null;
  teams: Array<{ id: string; name: string }>; // Multi-team support
  credentials: Record<string, any>;
  modelSettings: Record<string, any>;
  bedrockModelSettings: Record<string, any> | null;
  metadata: Record<string, any>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProvidersTabProps {
  isLight: boolean;
  organizations: Organization[];
  preselectedOrgId?: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

type ProviderScope = 'organization' | 'team';

interface ProviderFormState {
  providerKey: string;
  providerType: string;
  enabled: boolean;
  scope: ProviderScope;
  teamIds: string[]; // Multi-team support
  credentials: string;
  modelSettings: string;
  bedrockModelSettings: string;
  metadata: string;
}

const PROVIDER_TYPES: Array<{ value: string; label: string }> = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'anthropic_bedrock', label: 'Anthropic (Bedrock)' },
  { value: 'google', label: 'Google' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'azure_openai', label: 'Azure OpenAI' },
];

const INITIAL_FORM: ProviderFormState = {
  providerKey: '',
  providerType: 'anthropic',
  enabled: true,
  scope: 'organization',
  teamIds: [], // Multi-team support
  credentials: '{"apiKey": ""}',
  modelSettings: '{}',
  bedrockModelSettings: '',
  metadata: '{}',
};

const MAX_PROVIDER_FETCH_RETRIES = 3;

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

const maskCredentialValue = (value: unknown): string | Record<string, unknown> | Array<unknown> | null => {
  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(item => maskCredentialValue(item));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, maskCredentialValue(val)]);
    return Object.fromEntries(entries);
  }

  const raw = String(value ?? '');
  const maskLength = Math.max(6, Math.min(raw.length || 0, 12));
  return '*'.repeat(maskLength);
};

const maskCredentialsForDisplay = (credentials: Record<string, unknown> | null | undefined): unknown => {
  return maskCredentialValue(credentials ?? {});
};

const ProviderSkeletonCard: React.FC<{ isLight: boolean }> = ({ isLight }) => (
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

interface ProviderTypeSelectorProps {
  isLight: boolean;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const ProviderTypeSelector: React.FC<ProviderTypeSelectorProps> = ({ isLight, value, onChange, disabled = false }) => {
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

  const selectedType = PROVIDER_TYPES.find(type => type.value === value);

  if (disabled) {
    return (
      <div
        className={cn(
          'flex items-center px-2 py-1.5 text-xs rounded-md min-h-[32px] border opacity-60',
          isLight ? 'bg-white border-gray-300 text-gray-500' : 'bg-[#151C24] border-gray-600 text-gray-400',
        )}
      >
        <span className="flex-1 truncate text-left">{selectedType ? selectedType.label : 'Select provider type'}</span>
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
          {selectedType ? selectedType.label : 'Select provider type'}
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
            'absolute top-full left-0 mt-1 w-full min-w-[180px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
          )}
        >
          {PROVIDER_TYPES.map(type => (
            <button
              type="button"
              key={type.value}
              onClick={() => {
                onChange(type.value);
                setIsOpen(false);
              }}
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors text-left',
                value === type.value
                  ? isLight
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'bg-blue-900/30 text-blue-300 font-medium'
                  : isLight
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-200 hover:bg-gray-700',
              )}
            >
              <span className="truncate flex-1">{type.label}</span>
              {value === type.value && (
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

export function ProvidersTab({ isLight, organizations, preselectedOrgId, onError, onSuccess }: ProvidersTabProps) {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  // Add custom scrollbar styles for this component
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .providers-tab-scrollbar::-webkit-scrollbar {
        width: 3px;
        height: 3px;
      }
      .providers-tab-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .providers-tab-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(156, 163, 175, 0.3);
        border-radius: 2px;
      }
      .providers-tab-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(156, 163, 175, 0.5);
      }
      .dark .providers-tab-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(75, 85, 99, 0.3);
      }
      .dark .providers-tab-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(75, 85, 99, 0.5);
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState(preselectedOrgId || '');
  const [teamFilterIds, setTeamFilterIds] = useState<string[]>([]);
  const teamFilterIdsRef = useRef(teamFilterIds);
  useEffect(() => {
    teamFilterIdsRef.current = teamFilterIds;
  }, [teamFilterIds]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<ProviderFormState>(INITIAL_FORM);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProviderFormState | null>(null);
  const [showEditCredentials, setShowEditCredentials] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; providerKey: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<{ state: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ state: 'idle' });
  const [testStatusClosing, setTestStatusClosing] = useState(false);
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<string>>(new Set());
  const initialLoadCompleteRef = useRef(false);

  // Auto-select organization if only one available
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

  useEffect(() => {
    setShowEditCredentials(false);
    setTestStatus({ state: 'idle' });
  }, [editingProviderId]);

  const loadTeams = useCallback(async (orgId: string): Promise<Team[]> => {
    setTeamsLoading(true);
    try {
      try {
        await (authClient.organization as any).setActive({ organizationId: orgId });
      } catch (err) {
        console.warn('[ProvidersTab] Failed to set active organization', err);
      }

      const { data, error } = await (authClient.organization as any).listTeams({
        query: { organizationId: orgId },
      });

      if (error) throw new Error(error.message);

      const teamsForOrg = (data || []).filter((team: Team) => team.organizationId === orgId);
      setTeams(teamsForOrg);
      return teamsForOrg;
    } catch (err: any) {
      console.warn('[ProvidersTab] Failed to load teams:', err);
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

  const fetchProviders = useCallback(
    async (
      orgId: string,
      teamIds: string[],
      signal?: AbortSignal,
      attempt = 1,
    ): Promise<ProviderRecord[]> => {
      const params = new URLSearchParams({ organizationId: orgId });
      // Add all selected teams for filtering
      teamIds.forEach(teamId => {
        if (teamId) params.append('teamIds', teamId);
      });

      const response = await fetch(`${baseURL}/api/admin/providers?${params.toString()}`, {
        credentials: 'include',
        signal,
      });

      if (response.status === 429 && attempt < MAX_PROVIDER_FETCH_RETRIES) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryDelaySeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const retryDelayMs = Number.isFinite(retryDelaySeconds)
          ? Math.max(retryDelaySeconds * 1000, 300)
          : 500 * attempt;

        await waitFor(retryDelayMs, signal);
        return fetchProviders(orgId, teamIds, signal, attempt + 1);
      }

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to load providers');
      }

      const data = await response.json();
      return data.providers || [];
    },
    [baseURL],
  );

  const refreshProviders = useCallback(
    async (
      orgId: string,
      teamIds: string[],
      { signal, suppressLoading = false }: { signal?: AbortSignal; suppressLoading?: boolean } = {},
    ) => {
      if (!suppressLoading) {
        setListLoading(true);
      }

      try {
        const providerList = await fetchProviders(orgId, teamIds, signal);
        if (!signal || !signal.aborted) {
          setProviders(providerList);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        console.error('[ProvidersTab] Error loading providers:', err);
        onError(err?.message || 'Failed to load providers');
        setProviders([]);
      } finally {
        if (!suppressLoading && (!signal || !signal.aborted)) {
          setListLoading(false);
        }
      }
    },
    [fetchProviders, onError],
  );

  const teamMap = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach(team => map.set(team.id, team.name));
    return map;
  }, [teams]);

  // Load teams and providers when organization changes or on initial mount
  useEffect(() => {
    if (!selectedOrgId) {
      initialLoadCompleteRef.current = false;
      setTeams([]);
      setProviders([]);
      setTeamFilterIds([]);
      setListLoading(false);
      setTeamsLoading(false);
      return;
    }

    initialLoadCompleteRef.current = false;
    let cancelled = false;
    const controller = new AbortController();

    const loadInitialData = async () => {
      setListLoading(true);

      const teamsForOrg = await loadTeams(selectedOrgId);
      if (cancelled) {
        return;
      }

      const currentFilterIds = teamFilterIdsRef.current;
      const activeTeamIds = currentFilterIds.filter(id => teamsForOrg.some(team => team.id === id));

      await refreshProviders(selectedOrgId, activeTeamIds, {
        signal: controller.signal,
        suppressLoading: true,
      });

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
  }, [selectedOrgId, loadTeams, refreshProviders]);

  // Reload providers when team filter changes after initial load
  useEffect(() => {
    if (!selectedOrgId || !initialLoadCompleteRef.current) {
      return;
    }

    const controller = new AbortController();
    const activeTeamIds = teamFilterIds.filter(id => teamMap.has(id));

    refreshProviders(selectedOrgId, activeTeamIds, { signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [selectedOrgId, teamFilterIds, teamMap, refreshProviders]);

  useEffect(() => {
    if (teamFilterIds.length === 0) return;

    const validIds = teamFilterIds.filter(id => teamMap.has(id));
    if (validIds.length === 0) {
      setTeamFilterIds([]);
    } else if (validIds.length !== teamFilterIds.length) {
      setTeamFilterIds(validIds);
    }
  }, [teamFilterIds, teamMap]);

  const filteredProviders = useMemo(() => {
    if (teamFilterIds.length === 0) {
      return providers;
    }
    const activeTeamIds = teamFilterIds.filter(id => teamMap.has(id));
    if (activeTeamIds.length === 0) {
      return providers.filter(provider => provider.teams.length === 0);
    }
    return providers.filter(
      provider =>
        provider.teams.length === 0 || provider.teams.some(t => activeTeamIds.includes(t.id))
    );
  }, [providers, teamFilterIds, teamMap]);

  const maskedEditCredentials = useMemo(() => {
    if (!editForm) {
      return '';
    }

    const raw = editForm.credentials ?? '';
    if (!raw.trim()) {
      return '';
    }

    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(maskCredentialValue(parsed), null, 2);
    } catch (err) {
      return '/* Invalid JSON - toggle visibility to edit */';
    }
  }, [editForm?.credentials]);

  const editCredentialsDisplayValue = showEditCredentials
    ? editForm?.credentials ?? ''
    : maskedEditCredentials;

  const handleTeamFilterChange = (teamIds: string[]) => {
    setTeamFilterIds(teamIds);
  };

  const toggleProviderDetails = (providerId: string) => {
    setExpandedProviderIds(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const resetCreateForm = () => {
    setCreateForm(INITIAL_FORM);
  };

  const parseJsonField = (value: string, fieldName: string) => {
    if (!value || value.trim() === '') {
      return {};
    }

    try {
      return JSON.parse(value);
    } catch (err) {
      throw new Error(`${fieldName} must be valid JSON`);
    }
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedOrgId) {
      onError('Select an organization before creating a provider');
      return;
    }

    if (!createForm.providerKey.trim()) {
      onError('Provider key is required');
      return;
    }

    if (createForm.scope === 'team' && createForm.teamIds.length === 0) {
      onError('Select at least one team for team-scoped providers');
      return;
    }

    try {
      const payload = {
        organizationId: selectedOrgId,
        teamIds: createForm.scope === 'team' ? createForm.teamIds : [],
        providerKey: createForm.providerKey.trim(),
        providerType: createForm.providerType,
        enabled: createForm.enabled,
        credentials: parseJsonField(createForm.credentials, 'Credentials'),
        modelSettings: parseJsonField(createForm.modelSettings, 'Model settings'),
        metadata: parseJsonField(createForm.metadata, 'Metadata'),
        bedrockModelSettings: createForm.bedrockModelSettings
          ? parseJsonField(createForm.bedrockModelSettings, 'Bedrock model settings')
          : null,
      };

      const response = await fetch(`${baseURL}/api/admin/providers`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to create provider');
      }

      const data = await response.json();
      onSuccess(`Provider "${data.provider?.providerKey || createForm.providerKey}" created successfully`);
      setShowCreateForm(false);
      resetCreateForm();
      await refreshProviders(selectedOrgId, teamFilterIds);
    } catch (err: any) {
      console.error('[ProvidersTab] Failed to create provider:', err);
      onError(err.message || 'Failed to create provider');
    }
  };

  const startEditProvider = (provider: ProviderRecord) => {
    setEditingProviderId(provider.id);
    setEditForm({
      providerKey: provider.providerKey,
      providerType: provider.providerType,
      enabled: provider.enabled,
      scope: provider.teams.length > 0 ? 'team' : 'organization',
      teamIds: provider.teams.map(t => t.id),
      credentials: JSON.stringify(provider.credentials ?? {}, null, 2),
      modelSettings: JSON.stringify(provider.modelSettings ?? {}, null, 2),
      bedrockModelSettings: provider.bedrockModelSettings
        ? JSON.stringify(provider.bedrockModelSettings ?? {}, null, 2)
        : '',
      metadata: JSON.stringify(provider.metadata ?? {}, null, 2),
    });
  };

  const cancelEditProvider = () => {
    setEditingProviderId(null);
    setEditForm(null);
  setTestStatus({ state: 'idle' });
  };

  const handleUpdateProvider = async (providerId: string) => {
    if (!selectedOrgId || !editForm) return;

    if (!editForm.providerKey.trim()) {
      onError('Provider key is required');
      return;
    }

    if (editForm.scope === 'team' && editForm.teamIds.length === 0) {
      onError('Select at least one team for team-scoped providers');
      return;
    }

    try {
      const payload = {
        organizationId: selectedOrgId,
        teamIds: editForm.scope === 'team' ? editForm.teamIds : [],
        providerKey: editForm.providerKey.trim(),
        providerType: editForm.providerType,
        enabled: editForm.enabled,
        credentials: parseJsonField(editForm.credentials, 'Credentials'),
        modelSettings: parseJsonField(editForm.modelSettings, 'Model settings'),
        metadata: parseJsonField(editForm.metadata, 'Metadata'),
        bedrockModelSettings: editForm.bedrockModelSettings
          ? parseJsonField(editForm.bedrockModelSettings, 'Bedrock model settings')
          : null,
      };

      const response = await fetch(`${baseURL}/api/admin/providers/${providerId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to update provider');
      }

      const data = await response.json();
      onSuccess(`Provider "${data.provider?.providerKey || editForm.providerKey}" updated successfully`);
      setEditingProviderId(null);
      setEditForm(null);
      await refreshProviders(selectedOrgId, teamFilterIds);
    } catch (err: any) {
      console.error('[ProvidersTab] Failed to update provider:', err);
      onError(err.message || 'Failed to update provider');
    }
  };

  const handleTestProvider = async (providerId: string) => {
    if (!selectedOrgId || !editForm) return;

    let credentialsJSON: Record<string, any> = {};
    let modelSettingsJSON: Record<string, any> = {};
    let metadataJSON: Record<string, any> = {};
    let bedrockSettingsJSON: Record<string, any> | null = null;

    try {
      credentialsJSON = parseJsonField(editForm.credentials, 'Credentials');
      modelSettingsJSON = parseJsonField(editForm.modelSettings, 'Model settings');
      metadataJSON = parseJsonField(editForm.metadata, 'Metadata');
      bedrockSettingsJSON = editForm.bedrockModelSettings
        ? parseJsonField(editForm.bedrockModelSettings, 'Bedrock settings')
        : null;
    } catch (err: any) {
      setTestStatus({ state: 'error', message: err.message || 'Invalid JSON payload' });
      return;
    }

    setTestStatus({ state: 'loading' });

    try {
      const response = await fetch(`${baseURL}/api/admin/providers/${providerId}/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrgId,
          providerType: editForm.providerType,
          credentials: credentialsJSON,
          modelSettings: modelSettingsJSON,
          metadata: metadataJSON,
          bedrockModelSettings: bedrockSettingsJSON,
          testModel: undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Provider connectivity test failed');
      }

      const message = payload?.result?.message || payload?.result?.details?.message || 'Provider connectivity test succeeded';
      setTestStatus({ state: 'success', message });
    } catch (err: any) {
      console.error('[ProvidersTab] Provider test failed:', err);
      setTestStatus({ state: 'error', message: err.message || 'Provider connectivity test failed' });
    }
  };

  const handleTestNewProvider = async () => {
    if (!selectedOrgId) return;

    if (!createForm.providerType) {
      setTestStatus({ state: 'error', message: 'Provider type is required to test connectivity' });
      return;
    }

    let credentialsJSON: Record<string, any> = {};
    let modelSettingsJSON: Record<string, any> = {};
    let metadataJSON: Record<string, any> = {};
    let bedrockSettingsJSON: Record<string, any> | null = null;

    try {
      credentialsJSON = parseJsonField(createForm.credentials, 'Credentials');
      modelSettingsJSON = parseJsonField(createForm.modelSettings, 'Model settings');
      metadataJSON = parseJsonField(createForm.metadata, 'Metadata');
      bedrockSettingsJSON = createForm.bedrockModelSettings
        ? parseJsonField(createForm.bedrockModelSettings, 'Bedrock settings')
        : null;
    } catch (err: any) {
      setTestStatus({ state: 'error', message: err.message || 'Invalid JSON payload' });
      return;
    }

    setTestStatus({ state: 'loading' });

    try {
      const response = await fetch(`${baseURL}/api/admin/providers/test-new`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrgId,
          providerType: createForm.providerType,
          credentials: credentialsJSON,
          modelSettings: modelSettingsJSON,
          metadata: metadataJSON,
          bedrockModelSettings: bedrockSettingsJSON,
          testModel: undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Provider connectivity test failed');
      }

      const message = payload?.result?.message || payload?.result?.details?.message || 'Provider connectivity test succeeded';
      setTestStatus({ state: 'success', message });
    } catch (err: any) {
      console.error('[ProvidersTab] New provider test failed:', err);
      setTestStatus({ state: 'error', message: err.message || 'Provider connectivity test failed' });
    }
  };

  const handleToggleEnabled = async (provider: ProviderRecord) => {
    if (!selectedOrgId) return;
    try {
      const response = await fetch(`${baseURL}/api/admin/providers/${provider.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrgId,
          teamIds: provider.teams.map(t => t.id),
          providerKey: provider.providerKey,
          providerType: provider.providerType,
          enabled: !provider.enabled,
          credentials: provider.credentials,
          modelSettings: provider.modelSettings,
          metadata: provider.metadata,
          bedrockModelSettings: provider.bedrockModelSettings,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to update provider');
      }

      const updated = await response.json();
      setProviders(prev => prev.map(item => (item.id === provider.id ? updated.provider : item)));
      onSuccess(`Provider "${provider.providerKey}" ${provider.enabled ? 'disabled' : 'enabled'}`);
    } catch (err: any) {
      console.error('[ProvidersTab] Failed to toggle provider:', err);
      onError(err.message || 'Failed to update provider status');
    }
  };

  const handleDeleteProvider = async () => {
    if (!deleteConfirm || !selectedOrgId) return;

    try {
      const params = new URLSearchParams({ organizationId: selectedOrgId });
      const response = await fetch(`${baseURL}/api/admin/providers/${deleteConfirm.id}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to delete provider');
      }

      onSuccess(`Provider "${deleteConfirm.providerKey}" deleted successfully`);
      setDeleteDialogOpen(false);
      setDeleteConfirm(null);
      await refreshProviders(selectedOrgId, teamFilterIds);
    } catch (err: any) {
      console.error('[ProvidersTab] Failed to delete provider:', err);
      onError(err.message || 'Failed to delete provider');
      setDeleteDialogOpen(false);
      setDeleteConfirm(null);
    }
  };

  const renderScopeBadge = (provider: ProviderRecord) => {
    if (provider.teams.length > 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {provider.teams.map(team => (
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

  const renderTypeBadge = (providerType: string) => {
    const label = PROVIDER_TYPES.find(type => type.value === providerType)?.label || providerType;
    return (
      <span
        className={cn(
          'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
          isLight ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-gray-100',
        )}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Organization and Team Filters */}
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
              cancelEditProvider();
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
          {/* Header */}
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
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                />
              </svg>
              <h3 className={cn('text-sm font-semibold', mainTextColor)}>
                Providers{' '}
                <span className={cn('text-xs font-normal', isLight ? 'text-gray-500' : 'text-gray-400')}>
                  ({filteredProviders.length})
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {!showCreateForm && (
                <button
                  onClick={() => {
                    setShowCreateForm(true);
                    setEditingProviderId(null);
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
                  Add Provider
                </button>
              )}
            </div>
          </div>

          {/* Create Provider Form */}
          {showCreateForm && (
            <form
              onSubmit={handleCreateProvider}
              className={cn(
                'space-y-3 rounded-lg border p-4',
                isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
              )}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Provider Key
                  </label>
                  <input
                    type="text"
                    value={createForm.providerKey}
                    onChange={e => setCreateForm(prev => ({ ...prev, providerKey: e.target.value }))}
                    placeholder="anthropic-staging"
                    required
                    className={cn(
                      'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                      isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                    )}
                  />
                </div>
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Provider Type
                  </label>
                  <ProviderTypeSelector
                    isLight={isLight}
                    value={createForm.providerType}
                    onChange={value => setCreateForm(prev => ({ ...prev, providerType: value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    Scope
                  </label>
                  <div className="flex items-center gap-4">
                    <Radio
                      name="provider-scope"
                      value="organization"
                      checked={createForm.scope === 'organization'}
                      onChange={() => setCreateForm(prev => ({ ...prev, scope: 'organization', teamIds: [] }))}
                      label="Organization"
                      isLight={isLight}
                    />
                    <Radio
                      name="provider-scope"
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

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Credentials JSON
                </label>
                <textarea
                  rows={4}
                  value={createForm.credentials}
                  onChange={e => setCreateForm(prev => ({ ...prev, credentials: e.target.value }))}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                    isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                  )}
                />
              </div>

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Enabled
                </label>
                <Checkbox
                  checked={createForm.enabled}
                  onChange={checked => setCreateForm(prev => ({ ...prev, enabled: checked }))}
                  label="Provider is active"
                  isLight={isLight}
                />
              </div>

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Model Settings JSON
                </label>
                <textarea
                  rows={3}
                  value={createForm.modelSettings}
                  onChange={e => setCreateForm(prev => ({ ...prev, modelSettings: e.target.value }))}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                    isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                  )}
                />
              </div>

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Metadata JSON
                </label>
                <textarea
                  rows={3}
                  value={createForm.metadata}
                  onChange={e => setCreateForm(prev => ({ ...prev, metadata: e.target.value }))}
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                    isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                  )}
                />
              </div>

              <div>
                <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  Bedrock Settings JSON
                </label>
                <textarea
                  rows={3}
                  value={createForm.bedrockModelSettings}
                  onChange={e => setCreateForm(prev => ({ ...prev, bedrockModelSettings: e.target.value }))}
                  placeholder="{}"
                  className={cn(
                    'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                    isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                  )}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleTestNewProvider()}
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
                      isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                    )}
                  >
                    Create Provider
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
                        <circle className="opacity-25" cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
                      )}
                    </svg>
                    <p className="break-words">{testStatus.message}</p>
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

          {/* Provider List */}
          <div className="space-y-3">
            {listLoading ? (
              Array.from({ length: 4 }).map((_, idx) => <ProviderSkeletonCard key={`provider-skeleton-${idx}`} isLight={isLight} />)
            ) : filteredProviders.length === 0 ? (
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
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M9 8h.01M15 8h.01M12 8h.01M9 12h6m-6 4h6"
                  />
                </svg>
                <p className={cn('text-sm font-medium', isLight ? 'text-gray-600' : 'text-gray-400')}>
                  No providers configured
                </p>
                <p className={cn('text-xs mt-1', isLight ? 'text-gray-500' : 'text-gray-500')}>
                  Add a provider to enable model access for this organization or team.
                </p>
              </div>
            ) : (
            filteredProviders.map(provider => {
              const isEditing = editingProviderId === provider.id;
              const maskedCredentials = maskCredentialsForDisplay(provider.credentials ?? {});
                return (
                  <div
                    key={provider.id}
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
                              Provider Key
                            </label>
                            <input
                              type="text"
                              value={editForm.providerKey}
                              onChange={e => setEditForm(prev => prev ? ({ ...prev, providerKey: e.target.value }) : prev)}
                              className={cn(
                                'w-full px-3 py-1.5 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500',
                                isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                              )}
                            />
                          </div>
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Provider Type
                            </label>
                            <ProviderTypeSelector
                              isLight={isLight}
                              value={editForm.providerType}
                              onChange={value => setEditForm(prev => (prev ? { ...prev, providerType: value } : prev))}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Scope
                            </label>
                            <div className="flex items-center gap-4">
                              <Radio
                                name={`provider-scope-${provider.id}`}
                                value="organization"
                                checked={editForm.scope === 'organization'}
                                onChange={() => setEditForm(prev => prev ? ({ ...prev, scope: 'organization', teamIds: [] }) : prev)}
                                label="Organization"
                                isLight={isLight}
                              />
                              <Radio
                                name={`provider-scope-${provider.id}`}
                                value="team"
                                checked={editForm.scope === 'team'}
                                onChange={() => setEditForm(prev => prev ? ({ ...prev, scope: 'team' }) : prev)}
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
                              onTeamChange={(value: string[]) => setEditForm(prev => prev ? ({ ...prev, teamIds: value }) : prev)}
                              placeholder="Select teams"
                              disabled={editForm.scope !== 'team'}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <label className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
                              Credentials JSON
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowEditCredentials(prev => !prev)}
                              className={cn(
                                'inline-flex h-5 w-5 items-center justify-center rounded transition-colors',
                                isLight
                                  ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                              )}
                              title={showEditCredentials ? 'Hide credential values' : 'Show credential values'}
                              aria-label={showEditCredentials ? 'Hide credential values' : 'Show credential values'}
                              aria-pressed={showEditCredentials}
                            >
                              {showEditCredentials ? (
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19.5c-5 0-9-4.5-9-7.5a7.88 7.88 0 012.243-3.992m2.598-1.96A9.956 9.956 0 0112 4.5c5 0 9 4.5 9 7.5a7.86 7.86 0 01-2.318 4.042M3 3l18 18" />
                                </svg>
                              ) : (
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 12s4.5-7.5 10.5-7.5 10.5 7.5 10.5 7.5-4.5 7.5-10.5 7.5S1.5 12 1.5 12z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                                </svg>
                              )}
                            </button>
                          </div>
                          <textarea
                            rows={4}
                            value={editCredentialsDisplayValue}
                            onChange={e => {
                              if (!showEditCredentials) return;
                              setEditForm(prev => (prev ? { ...prev, credentials: e.target.value } : prev));
                            }}
                            readOnly={!showEditCredentials}
                            className={cn(
                              'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                              isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                              !showEditCredentials && 'opacity-90'
                            )}
                          />
                        </div>

                        <div>
                          <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Model Settings JSON
                          </label>
                          <textarea
                            rows={3}
                            value={editForm.modelSettings}
                            onChange={e => setEditForm(prev => prev ? ({ ...prev, modelSettings: e.target.value }) : prev)}
                            className={cn(
                              'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                              isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
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
                            onChange={e => setEditForm(prev => prev ? ({ ...prev, metadata: e.target.value }) : prev)}
                            className={cn(
                              'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                              isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                            )}
                          />
                        </div>

                        <div>
                          <label className={cn('block text-xs font-medium mb-1', isLight ? 'text-gray-700' : 'text-gray-300')}>
                            Bedrock Settings JSON
                          </label>
                          <textarea
                            rows={3}
                            value={editForm.bedrockModelSettings}
                            onChange={e => setEditForm(prev => prev ? ({ ...prev, bedrockModelSettings: e.target.value }) : prev)}
                            className={cn(
                              'w-full px-3 py-2 text-xs border rounded outline-none font-mono focus:ring-1 focus:ring-blue-500 resize-y json-textarea',
                              isLight ? 'bg-white border-gray-300 text-gray-700' : 'bg-[#151C24] border-gray-600 text-[#bcc1c7]',
                            )}
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <Checkbox
                            checked={editForm.enabled}
                            onChange={checked => setEditForm(prev => prev ? ({ ...prev, enabled: checked }) : prev)}
                            label="Provider is active"
                            isLight={isLight}
                          />

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handleTestProvider(provider.id)}
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
                                onClick={() => handleUpdateProvider(provider.id)}
                                className={cn(
                                  'px-4 py-1.5 text-xs rounded font-medium transition-colors',
                                  isLight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600',
                                )}
                              >
                                Save Changes
                              </button>
                              <button
                                onClick={cancelEditProvider}
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
                                        ? 'Testing provider connectivity…'
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
                              {provider.providerKey}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {renderTypeBadge(provider.providerType)}
                              {renderScopeBadge(provider)}
                            </div>
                          </div>

                          <div className="flex gap-1">
                            <button
                              onClick={() => toggleProviderDetails(provider.id)}
                              className={cn(
                                'p-1 rounded border transition-colors',
                                isLight
                                  ? 'text-gray-600 border-gray-200 hover:bg-gray-100'
                                  : 'text-gray-300 border-gray-700 hover:bg-gray-800',
                              )}
                              title={expandedProviderIds.has(provider.id) ? 'Show less details' : 'Show more details'}
                            >
                              {expandedProviderIds.has(provider.id) ? (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => startEditProvider(provider)}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight
                                  ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                              )}
                              title="Edit provider">
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
                                setDeleteConfirm({ id: provider.id, providerKey: provider.providerKey });
                                setDeleteDialogOpen(true);
                              }}
                              className={cn(
                                'p-1 rounded transition-colors',
                                isLight
                                  ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                                  : 'text-red-400 hover:bg-red-900/20 hover:text-red-300',
                              )}
                              title="Remove provider">
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

                        <div
                          className={cn(
                            'overflow-hidden transition-all ease-in-out',
                            expandedProviderIds.has(provider.id)
                              ? 'max-h-[600px] opacity-100 mt-3 duration-500'
                              : 'max-h-0 opacity-0 mt-0 duration-400',
                          )}
                        >
                          <div
                            className={cn(
                              'transition-all ease-in-out',
                              expandedProviderIds.has(provider.id) ? 'translate-y-0 duration-300 delay-100' : '-translate-y-4 duration-200',
                            )}
                          >
                            <div
                              className={cn(
                                'text-xs transition-opacity ease-in-out',
                                isLight ? 'text-gray-600' : 'text-gray-400',
                                expandedProviderIds.has(provider.id) ? 'opacity-100 duration-400 delay-200' : 'opacity-0 duration-150',
                              )}
                            >
                              <div>
                                <div className="flex items-center justify-between font-medium">
                                  <span>Credentials</span>
                                  <span
                                    className={cn(
                                      'text-[10px] font-normal uppercase tracking-wide',
                                      isLight ? 'text-gray-400' : 'text-gray-500',
                                    )}
                                  >
                                    Masked
                                  </span>
                                </div>
                                <pre className="mt-1 h-28 overflow-auto rounded bg-black/5 p-2 font-mono text-[11px] providers-tab-scrollbar">
                                  {JSON.stringify(maskedCredentials, null, 2)}
                                </pre>
                                <p
                                  className={cn(
                                    'mt-1 text-[10px]',
                                    isLight ? 'text-gray-400' : 'text-gray-500',
                                  )}
                                >
                                  Edit this provider to view or update credential values.
                                </p>
                              </div>
                              <div className="mt-3">
                                <div className="font-medium">Model Settings</div>
                                <pre className="mt-1 h-28 overflow-auto rounded bg-black/5 p-2 font-mono text-[11px] providers-tab-scrollbar">
                                  {JSON.stringify(provider.modelSettings ?? {}, null, 2)}
                                </pre>
                              </div>
                              {provider.bedrockModelSettings && (
                                <div className="mt-3">
                                  <div className="font-medium">Bedrock Model Settings</div>
                                  <pre className="mt-1 max-h-28 overflow-auto rounded bg-black/5 p-2 font-mono text-[11px] providers-tab-scrollbar">
                                    {JSON.stringify(provider.bedrockModelSettings ?? {}, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {provider.metadata && Object.keys(provider.metadata).length > 0 && (
                                <div className="mt-3">
                                  <div className="font-medium">Metadata</div>
                                  <pre className="mt-1 max-h-28 overflow-auto rounded bg-black/5 p-2 font-mono text-[11px] providers-tab-scrollbar">
                                    {JSON.stringify(provider.metadata ?? {}, null, 2)}
                                  </pre>
                                </div>
                              )}
                              <div className="mt-3 text-[11px] flex gap-3">
                                <span>Created: {new Date(provider.createdAt).toLocaleString()}</span>
                                <span>Updated: {new Date(provider.updatedAt).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Enabled Toggle at Bottom Right */}
                        <div
                          className={cn(
                            'flex items-center justify-between pt-3 border-t',
                            isLight ? 'border-gray-200' : 'border-gray-700'
                          )}
                        >
                          <div className="flex-1 pr-3">
                            <label
                              htmlFor={`provider-enabled-${provider.id}`}
                              className={cn(
                                'text-xs font-medium cursor-pointer block',
                                mainTextColor
                              )}
                            >
                              Provider Enabled
                            </label>
                            <p
                              className={cn(
                                'text-xs mt-0.5',
                                isLight ? 'text-gray-500' : 'text-gray-400'
                              )}
                            >
                              {provider.enabled ? 'Provider is active and available' : 'Provider is disabled'}
                            </p>
                          </div>
                          <button
                            id={`provider-enabled-${provider.id}`}
                            role="switch"
                            aria-checked={provider.enabled}
                            onClick={() => handleToggleEnabled(provider)}
                            className={cn(
                              'relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-offset-1',
                              provider.enabled
                                ? 'bg-blue-600 focus:ring-blue-500'
                                : isLight
                                ? 'bg-gray-200 focus:ring-gray-300'
                                : 'bg-gray-600 focus:ring-gray-500'
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                'pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                provider.enabled ? 'translate-x-3' : 'translate-x-0'
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
                <h2 className={cn('text-sm font-semibold', mainTextColor)}>
                  Delete Provider
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
                    <svg className={cn('h-3.5 w-3.5', isLight ? 'text-red-600' : 'text-red-400')} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-sm font-medium', mainTextColor)}>
                      Delete provider "{deleteConfirm.providerKey}"?
                    </p>
                    <p className={cn('mt-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      This provider will be removed and any dependent models may stop working.
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={cn('flex items-center justify-end gap-2 border-t px-3 py-2', isLight ? 'border-gray-200' : 'border-gray-700')}
              >
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
                  onClick={handleDeleteProvider}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ProvidersTab;

