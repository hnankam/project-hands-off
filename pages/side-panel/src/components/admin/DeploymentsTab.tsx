import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@extension/ui';
import { authClient } from '../../lib/auth-client';
import { OrganizationSelector } from './OrganizationSelector';
import { TeamSelector } from './TeamSelector';

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

interface DeploymentEntitySummary {
  key: string;
  status?: string;
  enabled?: boolean;
  display_name?: string;
  provider?: string;
  name?: string;
  description?: string;
  type?: string;
}

interface DeploymentSummary {
  context: {
    organization_id: string | null;
    team_id: string | null;
  };
  status: string;
  last_refresh?: number | null;
  version?: string | null;
  error?: string | null;
  models?: DeploymentEntitySummary[];
  agents?: DeploymentEntitySummary[];
  providers?: DeploymentEntitySummary[];
}

interface EndpointInfo {
  context: {
    organization_id: string | null;
    team_id: string | null;
  };
  agent: {
    type: string;
    name: string;
    description?: string;
  };
  model: {
    key: string;
    provider?: string;
    display_name?: string;
  };
  status: string;
  endpoint: string;
}

type StatusFilter = 'all' | 'ready' | 'deploying' | 'error' | 'not_deployed' | 'offline';

interface DeploymentsTabProps {
  isLight: boolean;
  organizations: Organization[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
const AUTO_REFRESH_INTERVAL_MS = 30000;

const AgentIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const ModelIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const DeploymentSkeleton: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div className="space-y-4 animate-pulse">
    {/* Stats Cards Skeleton */}
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div
          key={`stats-skeleton-${idx}`}
          className={cn(
            'rounded-lg border p-4',
            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
          )}
        >
          <div className={cn('h-3 w-24 rounded mb-3', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
          <div className={cn('h-8 w-16 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        </div>
      ))}
    </div>

    {/* Endpoints List Skeleton */}
    <div
      className={cn(
        'rounded-lg border',
        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
      )}
    >
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div
            key={`endpoint-skeleton-${idx}`}
            className={cn(
              'rounded-lg border p-3',
              isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700',
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={cn('h-4 w-48 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
              <div className={cn('h-6 w-20 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
            </div>
            <div className="flex items-center gap-3">
              <div className={cn('h-3 w-32 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
              <div className={cn('h-3 w-24 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const STATUS_META: Record<string, { label: string; tone: 'default' | 'info' | 'success' | 'warn' | 'error' } | undefined> = {
  ready: { label: 'Ready', tone: 'success' },
  deploying: { label: 'Deploying', tone: 'info' },
  warming: { label: 'Warming', tone: 'info' },
  idle: { label: 'Idle', tone: 'info' },
  disabled: { label: 'Disabled', tone: 'warn' },
  offline: { label: 'Offline', tone: 'warn' },
  error: { label: 'Error', tone: 'error' },
  not_deployed: { label: 'Not Deployed', tone: 'warn' },
};

const toneClasses = (tone: 'default' | 'info' | 'success' | 'warn' | 'error', isLight: boolean) => {
  switch (tone) {
    case 'success':
      return isLight ? 'bg-green-100 text-green-700 border-green-200' : 'bg-green-900/20 text-green-300 border-green-800/60';
    case 'info':
      return isLight ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-blue-900/30 text-blue-300 border-blue-800/70';
    case 'warn':
      return isLight ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-amber-900/30 text-amber-200 border-amber-800/60';
    case 'error':
      return isLight ? 'bg-red-100 text-red-700 border-red-200' : 'bg-red-900/30 text-red-300 border-red-800/70';
    default:
      return isLight ? 'bg-gray-100 text-gray-700 border-gray-200' : 'bg-gray-800/60 text-gray-200 border-gray-700';
  }
};

const DeploymentSkeletonCard: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div className={cn('p-3 transition-colors', isLight ? 'hover:bg-gray-50/70' : 'hover:bg-gray-900/40')}>
    <div className="flex items-start gap-3 animate-pulse">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className={cn('h-3 w-24 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
          <div className={cn('h-3 w-16 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('h-2 w-2 rounded-full', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
          <div className={cn('h-2 w-32 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
        </div>
        <div className={cn('h-2 w-40 rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
      </div>
      <div className={cn('h-7 w-7 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
    </div>
  </div>
);

const normalizeContextValue = (value: string | null): string | null => {
  if (!value) return null;
  if (value === '__global__') return null;
  return value;
};

const formatTimestamp = (timestamp?: number | null) => {
  if (!timestamp) return '—';
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

const relativeTime = (timestamp?: number | null) => {
  if (!timestamp) return 'unknown';
  const now = Date.now();
  const diff = now - timestamp * 1000;
  if (diff < 0) return 'moments ago';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const DeploymentsTab: React.FC<DeploymentsTabProps> = ({ isLight, organizations, onError, onSuccess }) => {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedAgentTypes, setSelectedAgentTypes] = useState<string[]>([]);
  const [selectedModelKeys, setSelectedModelKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [restartContext, setRestartContext] = useState<string | null>(null);
  const [restartingEndpoint, setRestartingEndpoint] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'contexts' | 'endpoints'>('endpoints');
  const [authHeaders, setAuthHeaders] = useState<Record<string, string> | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilterIds, setTeamFilterIds] = useState<string[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const teamCacheRef = useRef<Record<string, Record<string, string>>>({});
  const isMountedRef = useRef<boolean>(false);
  
  // Load auth headers and set initial org on mount
  useEffect(() => {
    const loadAuthHeaders = async () => {
      try {
        console.log('[DeploymentsTab] Loading auth headers...');
        const sessionResult = await authClient.getSession();
        const activeOrgId = sessionResult.data?.session?.activeOrganizationId;
        const activeTeamId = sessionResult.data?.session?.activeTeamId;
        
        console.log('[DeploymentsTab] Session data:', { activeOrgId, activeTeamId });
        
        if (activeOrgId && activeTeamId) {
          const headers = {
            'x-copilot-organization-id': activeOrgId,
            'x-copilot-team-id': activeTeamId,
          };
          console.log('[DeploymentsTab] Setting auth headers:', headers);
          setAuthHeaders(headers);
          setSelectedOrgId(activeOrgId);
        } else {
          console.warn('[DeploymentsTab] Missing org or team ID');
          setAuthHeaders({}); // Empty headers to indicate loading is done
        }
      } catch (err) {
        console.warn('[DeploymentsTab] Failed to load auth headers', err);
        setAuthHeaders({}); // Empty headers to indicate loading is done
      }
    };
    
    loadAuthHeaders();
  }, []);

  // Load teams when organization changes
  useEffect(() => {
    if (!selectedOrgId) {
      setTeams([]);
      setTeamFilterIds([]);
      return;
    }

    const loadTeams = async () => {
      setTeamsLoading(true);
      try {
        const { data, error } = await (authClient.organization as any).listTeams({
          query: { organizationId: selectedOrgId },
        });

        if (error) throw new Error(error.message);
        
        const teamsList: Team[] = (data || []).map((team: any) => ({
          id: team.id,
          name: team.name,
          organizationId: selectedOrgId,
        }));
        
        setTeams(teamsList);
      } catch (err) {
        console.error('[DeploymentsTab] Failed to load teams:', err);
        setTeams([]);
      } finally {
        setTeamsLoading(false);
      }
    };

    loadTeams();
  }, [selectedOrgId]);

  const organizationNameById = useMemo(() => {
    const mapping: Record<string, string> = {};
    for (const org of organizations) {
      mapping[org.id] = org.name || org.slug || org.id;
    }
    return mapping;
  }, [organizations]);

  const ensureTeamsLoaded = useCallback(
    async (organizationId: string) => {
      if (!organizationId) return;
      if (teamCacheRef.current[organizationId]) return;

      try {
        const { data, error } = await (authClient.organization as any).listTeams({
          query: { organizationId },
        });
        if (error) throw new Error(error.message);
        const mapping: Record<string, string> = {};
        for (const team of data || []) {
          if (team && team.id) {
            mapping[team.id] = team.name || team.id;
          }
        }
        teamCacheRef.current[organizationId] = mapping;
      } catch (err) {
        console.warn('[DeploymentsTab] Failed to load teams for org', organizationId, err);
        teamCacheRef.current[organizationId] = {};
      }
    },
    [],
  );

  const fetchDeployments = useCallback(async () => {
    setLoading(prev => prev || deployments.length === 0);
    setRefreshing(true);
    try {
      // Fetch both deployments and endpoints in parallel
      const [deploymentsResponse, endpointsResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/deployments`, { 
          credentials: 'include',
          headers: authHeaders || undefined,
        }),
        fetch(`${BACKEND_URL}/deployments/endpoints`, { 
          credentials: 'include',
          headers: authHeaders || undefined,
        }),
      ]);

      if (!deploymentsResponse.ok) {
        const payload = await deploymentsResponse.json().catch(() => ({}));
        throw new Error(payload?.error || `Failed to load deployments (${deploymentsResponse.status})`);
      }
      
      if (!endpointsResponse.ok) {
        const payload = await endpointsResponse.json().catch(() => ({}));
        throw new Error(payload?.error || `Failed to load endpoints (${endpointsResponse.status})`);
      }

      const deploymentsData = await deploymentsResponse.json();
      const endpointsData = await endpointsResponse.json();
      
      const list: DeploymentSummary[] = deploymentsData?.deployments || [];
      const endpointsList: EndpointInfo[] = endpointsData?.endpoints || [];
      
      setDeployments(list);
      setEndpoints(endpointsList);

      const uniqueOrgIds = new Set<string>();
      for (const item of list) {
        const orgIdRaw = item?.context?.organization_id;
        const orgId = normalizeContextValue(orgIdRaw);
        if (orgId) {
          uniqueOrgIds.add(orgId);
        }
      }
      for (const endpoint of endpointsList) {
        const orgIdRaw = endpoint?.context?.organization_id;
        const orgId = normalizeContextValue(orgIdRaw);
        if (orgId) {
          uniqueOrgIds.add(orgId);
        }
      }

      for (const orgId of uniqueOrgIds) {
        await ensureTeamsLoaded(orgId);
      }
    } catch (error) {
      console.error('[DeploymentsTab] Failed to fetch deployments', error);
      onError(error instanceof Error ? error.message : 'Failed to load deployments');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [deployments.length, ensureTeamsLoaded, onError, authHeaders]);

  useEffect(() => {
    isMountedRef.current = true;
    // Only fetch deployments after auth headers are loaded
    if (authHeaders !== null) {
      console.log('[DeploymentsTab] Auth headers loaded, fetching deployments...');
      fetchDeployments();
    }
    return () => {
      isMountedRef.current = false;
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [fetchDeployments, authHeaders]);

  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
    }
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(() => {
        fetchDeployments();
      }, AUTO_REFRESH_INTERVAL_MS);
    }
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [autoRefresh, fetchDeployments]);

  // Get unique agents and models from endpoints
  const uniqueAgents = useMemo(() => {
    const agentMap = new Map<string, { type: string; name: string }>();
    endpoints.forEach(ep => {
      if (!agentMap.has(ep.agent.type)) {
        agentMap.set(ep.agent.type, { type: ep.agent.type, name: ep.agent.name });
      }
    });
    return Array.from(agentMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [endpoints]);

  const uniqueModels = useMemo(() => {
    const modelMap = new Map<string, { key: string; displayName: string }>();
    endpoints.forEach(ep => {
      if (!modelMap.has(ep.model.key)) {
        modelMap.set(ep.model.key, { 
          key: ep.model.key, 
          displayName: ep.model.display_name || ep.model.key 
        });
      }
    });
    return Array.from(modelMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [endpoints]);

  const filteredDeployments = useMemo(() => {
    let filtered = deployments;
    
    // Organization filter
    if (selectedOrgId) {
      filtered = filtered.filter(dep => dep.context?.organization_id === selectedOrgId);
    }
    
    // Team filter
    if (teamFilterIds.length > 0) {
      filtered = filtered.filter(dep => {
        if (!dep.context?.team_id) return true; // org-wide deployments pass through
        return teamFilterIds.includes(dep.context.team_id);
      });
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(dep => dep.status === statusFilter);
    }
    
    return filtered;
  }, [deployments, selectedOrgId, teamFilterIds, statusFilter]);

  const filteredEndpoints = useMemo(() => {
    let filtered = endpoints;
    
    // Organization filter
    if (selectedOrgId) {
      filtered = filtered.filter(ep => ep.context?.organization_id === selectedOrgId);
    }
    
    // Team filter
    if (teamFilterIds.length > 0) {
      filtered = filtered.filter(ep => {
        if (!ep.context?.team_id) return true; // org-wide endpoints pass through
        return teamFilterIds.includes(ep.context.team_id);
      });
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'offline') {
        // "offline" means any status that's not "ready"
        filtered = filtered.filter(ep => ep.status !== 'ready');
      } else {
        filtered = filtered.filter(ep => ep.status === statusFilter);
      }
    }
    
    // Agent filter
    if (selectedAgentTypes.length > 0) {
      filtered = filtered.filter(ep => selectedAgentTypes.includes(ep.agent.type));
    }
    
    // Model filter
    if (selectedModelKeys.length > 0) {
      filtered = filtered.filter(ep => selectedModelKeys.includes(ep.model.key));
    }
    
    return filtered;
  }, [endpoints, selectedOrgId, teamFilterIds, statusFilter, selectedAgentTypes, selectedModelKeys]);

  const stats = useMemo(() => {
    if (viewMode === 'endpoints') {
      const total = filteredEndpoints.length;
      const ready = filteredEndpoints.filter(ep => ep.status === 'ready').length;
      return { total, ready, deploying: 0, errors: 0, idle: 0, offline: total - ready };
    }
    
    const total = filteredDeployments.length;
    const ready = filteredDeployments.filter(dep => dep.status === 'ready').length;
    const deploying = filteredDeployments.filter(dep => dep.status === 'deploying' || dep.status === 'warming').length;
    const errors = filteredDeployments.filter(dep => dep.status === 'error').length;
    const idle = filteredDeployments.filter(dep => dep.status === 'idle').length;
    const offline = filteredDeployments.filter(dep => dep.status === 'not_deployed').length;
    return { total, ready, deploying, errors, idle, offline };
  }, [filteredDeployments, filteredEndpoints, viewMode]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleRestart = async (deployment: DeploymentSummary) => {
    const orgIdRaw = deployment.context?.organization_id;
    const teamIdRaw = deployment.context?.team_id;
    const orgId = normalizeContextValue(orgIdRaw);
    const teamId = normalizeContextValue(teamIdRaw);

    if (!orgId) {
      onError('Cannot restart global deployment from the UI');
      return;
    }

    try {
      setRestartContext(`${orgIdRaw || ''}:${teamIdRaw || ''}`);
      const response = await fetch(`${BACKEND_URL}/deployments/context/restart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          organization_id: orgIdRaw,
          team_id: teamIdRaw,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Failed to restart deployment (${response.status})`);
      }

      onSuccess('Deployment restart initiated');
      await fetchDeployments();
    } catch (error) {
      console.error('[DeploymentsTab] Failed to restart deployment', error);
      onError(error instanceof Error ? error.message : 'Failed to restart deployment');
    } finally {
      setRestartContext(null);
    }
  };

  const handleRestartEndpoint = async (endpoint: EndpointInfo) => {
    const orgIdRaw = endpoint.context?.organization_id;
    const teamIdRaw = endpoint.context?.team_id;
    const endpointKey = `${endpoint.agent.type}:${endpoint.model.key}:${orgIdRaw || 'global'}:${teamIdRaw || 'global'}`;

    try {
      setRestartingEndpoint(endpointKey);
      const response = await fetch(`${BACKEND_URL}/deployments/context/restart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          organization_id: orgIdRaw,
          team_id: teamIdRaw,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Failed to restart endpoint (${response.status})`);
      }

      onSuccess(`Endpoint ${endpoint.endpoint} restart initiated`);
      await fetchDeployments();
    } catch (error) {
      console.error('[DeploymentsTab] Failed to restart endpoint', error);
      onError(error instanceof Error ? error.message : 'Failed to restart endpoint');
    } finally {
      setRestartingEndpoint(null);
    }
  };

  const renderStatusBadge = (status: string) => {
    const meta = STATUS_META[status] || { label: status, tone: 'default' as const };
    const showPulse = status === 'deploying' || status === 'warming';
    
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize whitespace-nowrap',
          toneClasses(meta.tone, isLight),
        )}
      >
        {showPulse ? (
          <span className="relative flex h-2 w-2">
            <span className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              meta.tone === 'info' ? 'bg-blue-400' : 'bg-gray-400'
            )}></span>
            <span className={cn(
              'relative inline-flex rounded-full h-2 w-2',
              meta.tone === 'info' 
                ? isLight ? 'bg-blue-500' : 'bg-blue-400'
                : isLight ? 'bg-gray-500' : 'bg-gray-400'
            )}></span>
          </span>
        ) : (
          <span className={cn(
            'inline-flex rounded-full h-2 w-2',
            meta.tone === 'success'
              ? isLight ? 'bg-green-500' : 'bg-green-400'
              : meta.tone === 'error'
              ? isLight ? 'bg-red-500' : 'bg-red-400'
              : meta.tone === 'warn'
              ? isLight ? 'bg-amber-500' : 'bg-amber-400'
              : isLight ? 'bg-gray-400' : 'bg-gray-500'
          )}></span>
        )}
        {meta.label}
      </span>
    );
  };

  const renderStatusIcon = (status: string) => {
    const meta = STATUS_META[status] || { label: status, tone: 'default' as const };
    const showPulse = status === 'deploying' || status === 'warming';
    
    if (showPulse) {
      return (
        <span className="relative flex h-2 w-2" title={meta.label}>
          <span className={cn(
            'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
            meta.tone === 'info' ? 'bg-blue-400' : 'bg-gray-400'
          )}></span>
          <span className={cn(
            'relative inline-flex rounded-full h-2 w-2',
            meta.tone === 'info' 
              ? isLight ? 'bg-blue-500' : 'bg-blue-400'
              : isLight ? 'bg-gray-500' : 'bg-gray-400'
          )}></span>
        </span>
      );
    }
    
    return (
      <span 
        className={cn(
          'inline-flex rounded-full h-2 w-2',
          meta.tone === 'success'
            ? isLight ? 'bg-green-500' : 'bg-green-400'
            : meta.tone === 'error'
            ? isLight ? 'bg-red-500' : 'bg-red-400'
            : meta.tone === 'warn'
            ? isLight ? 'bg-amber-500' : 'bg-amber-400'
            : isLight ? 'bg-gray-400' : 'bg-gray-500'
        )}
        title={meta.label}
      ></span>
    );
  };

  const getOrgLabel = (orgIdRaw: string | null) => {
    const orgId = normalizeContextValue(orgIdRaw);
    if (!orgId) {
      return 'Global';
    }
    return organizationNameById[orgId] || orgId;
  };

  const getTeamLabel = (orgIdRaw: string | null, teamIdRaw: string | null) => {
    const orgId = normalizeContextValue(orgIdRaw);
    const teamId = normalizeContextValue(teamIdRaw);
    if (!teamId) {
      return orgId ? 'Organization-wide' : 'Global';
    }
    if (orgId && teamCacheRef.current[orgId]?.[teamId]) {
      return teamCacheRef.current[orgId][teamId];
    }
    return teamId;
  };

  const renderEntityList = (title: string, items?: DeploymentEntitySummary[]) => {
    if (!items || items.length === 0) {
      return null;
    }
    return (
      <div>
        <div className={cn('text-[11px] font-semibold uppercase tracking-wide mb-1', isLight ? 'text-gray-500' : 'text-gray-400')}>
          {title}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, 6).map(item => (
            <span
              key={`${title}-${item.key}`}
              className={cn(
                'px-2 py-0.5 rounded-full border text-[11px] flex items-center gap-1',
                isLight ? 'bg-white border-gray-200 text-gray-700' : 'bg-[#151C24] border-gray-700 text-gray-200',
              )}
              title={item.display_name || item.name || item.description || undefined}
            >
              <span className="font-medium">
                {item.display_name || item.name || item.key || item.type}
              </span>
              {item.provider && (
                <span className={cn('text-[10px]', isLight ? 'text-gray-400' : 'text-gray-500')}>
                  · {item.provider}
                </span>
              )}
              {item.status && (
                <span className={cn('text-[10px]', item.status === 'ready' ? 'text-green-500' : 'text-yellow-500')}>
                  {item.status}
                </span>
              )}
            </span>
          ))}
          {items.length > 6 && (
            <span className={cn('px-2 py-0.5 rounded-full border text-[11px]', isLight ? 'border-gray-200 text-gray-500' : 'border-gray-700 text-gray-400')}>
              +{items.length - 6} more
            </span>
          )}
        </div>
      </div>
    );
  };

  // Agent filter dropdown component
  const AgentFilterDropdown = ({ disabled = false }: { disabled?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (disabled) {
        setIsOpen(false);
      }
    }, [disabled]);

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

    const toggleAgent = (agentType: string) => {
      if (disabled) return;
      setSelectedAgentTypes(prev =>
        prev.includes(agentType) ? prev.filter(t => t !== agentType) : [...prev, agentType]
      );
    };

    const removeAgent = (agentType: string, e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();
      setSelectedAgentTypes(prev => prev.filter(t => t !== agentType));
    };

    const selectedAgents = uniqueAgents.filter(a => selectedAgentTypes.includes(a.type));

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] min-w-0 w-full border',
            disabled
              ? isLight
                ? 'text-gray-400 border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'text-gray-500 border-gray-700 bg-gray-800/50 cursor-not-allowed'
              : isLight
                ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
                : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
          )}
        >
          <AgentIcon />
          {selectedAgents.length > 0 ? (
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {selectedAgents.map(agent => (
                <span
                  key={agent.type}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                    isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400',
                  )}
                  onClick={e => e.stopPropagation()}
                >
                  {agent.name}
                  <button
                    type="button"
                    onClick={e => removeAgent(agent.type, e)}
                    className={cn('hover:opacity-70', isLight ? 'text-blue-600' : 'text-blue-300')}
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <span className="flex-1 truncate text-left">All agents</span>
          )}
          <svg className="flex-shrink-0 mt-0.5" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div
            className={cn(
              'absolute top-full left-0 mt-1 w-full min-w-[200px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
              isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
            )}
          >
            {uniqueAgents.length === 0 ? (
              <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                No agents available
              </div>
            ) : (
              uniqueAgents.map(agent => (
                <button
                  key={agent.type}
                  type="button"
                  onClick={() => toggleAgent(agent.type)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors',
                    selectedAgentTypes.includes(agent.type)
                      ? isLight
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'bg-blue-900/30 text-blue-300 font-medium'
                      : isLight
                      ? 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-200 hover:bg-gray-700',
                  )}
                >
                  <span className="flex-shrink-0">
                    {selectedAgentTypes.includes(agent.type) ? (
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-shrink-0">
                    <AgentIcon />
                  </span>
                  <span className="truncate flex-1 text-left">{agent.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  // Model filter dropdown component
  const ModelFilterDropdown = ({ disabled = false }: { disabled?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (disabled) {
        setIsOpen(false);
      }
    }, [disabled]);

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

    const toggleModel = (modelKey: string) => {
      if (disabled) return;
      setSelectedModelKeys(prev =>
        prev.includes(modelKey) ? prev.filter(k => k !== modelKey) : [...prev, modelKey]
      );
    };

    const removeModel = (modelKey: string, e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();
      setSelectedModelKeys(prev => prev.filter(k => k !== modelKey));
    };

    const selectedModels = uniqueModels.filter(m => selectedModelKeys.includes(m.key));

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            'flex items-start gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] min-w-0 w-full border',
            disabled
              ? isLight
                ? 'text-gray-400 border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'text-gray-500 border-gray-700 bg-gray-800/50 cursor-not-allowed'
              : isLight
                ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
                : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
          )}
        >
          <ModelIcon />
          {selectedModels.length > 0 ? (
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {selectedModels.map(model => (
                <span
                  key={model.key}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                    isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400',
                  )}
                  onClick={e => e.stopPropagation()}
                >
                  {model.displayName}
                  <button
                    type="button"
                    onClick={e => removeModel(model.key, e)}
                    className={cn('hover:opacity-70', isLight ? 'text-blue-600' : 'text-blue-300')}
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <span className="flex-1 truncate text-left">All models</span>
          )}
          <svg className="flex-shrink-0 mt-0.5" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div
            className={cn(
              'absolute top-full left-0 mt-1 w-full min-w-[200px] rounded-md border shadow-lg z-[9999] max-h-[240px] overflow-y-auto',
              isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
            )}
          >
            {uniqueModels.length === 0 ? (
              <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                No models available
              </div>
            ) : (
              uniqueModels.map(model => (
                <button
                  key={model.key}
                  type="button"
                  onClick={() => toggleModel(model.key)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors',
                    selectedModelKeys.includes(model.key)
                      ? isLight
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'bg-blue-900/30 text-blue-300 font-medium'
                      : isLight
                      ? 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-200 hover:bg-gray-700',
                  )}
                >
                  <span className="flex-shrink-0">
                    {selectedModelKeys.includes(model.key) ? (
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-shrink-0">
                    <ModelIcon />
                  </span>
                  <span className="truncate flex-1 text-left">{model.displayName}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading && deployments.length === 0) {
    return <DeploymentSkeleton isLight={isLight} />;
  }

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
            onOrgChange={(orgId) => {
              setSelectedOrgId(orgId);
              setTeamFilterIds([]);
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
              onTeamChange={setTeamFilterIds}
              placeholder="All teams"
              allowEmpty
            />
          )}
        </div>
          </div>

      {/* Model and Agent Filters */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Model
          </label>
          <ModelFilterDropdown disabled={viewMode === 'contexts'} />
        </div>
        <div>
          <label className={cn('block text-xs font-medium mb-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Agent
          </label>
          <AgentFilterDropdown disabled={viewMode === 'contexts'} />
        </div>
      </div>

      {/* Endpoint/Context Toggle, Auto-refresh, and Refresh Controls */}
      <div className="flex items-center justify-between gap-2">
          <div className={cn('flex items-center text-xs border rounded', isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-[#151C24]')}>
            <button
              type="button"
              onClick={() => setViewMode('endpoints')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium transition-colors rounded-l',
                viewMode === 'endpoints'
                  ? isLight
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-900/40 text-blue-200'
                  : isLight
                  ? 'text-gray-600 hover:bg-gray-50'
                  : 'text-gray-400 hover:bg-gray-800',
              )}
            >
              Endpoints
            </button>
            <button
              type="button"
              onClick={() => setViewMode('contexts')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium transition-colors rounded-r',
                viewMode === 'contexts'
                  ? isLight
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-900/40 text-blue-200'
                  : isLight
                  ? 'text-gray-600 hover:bg-gray-50'
                  : 'text-gray-400 hover:bg-gray-800',
              )}
            >
              Contexts
            </button>
          </div>

        <div className="flex items-center gap-2">
          <div className={cn('flex items-center gap-1 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                className="accent-blue-500"
                checked={autoRefresh}
                onChange={event => setAutoRefresh(event.target.checked)}
              />
              Auto-refresh
            </label>
          </div>

          <button
            type="button"
            onClick={() => fetchDeployments()}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded border transition-colors',
              isLight
                ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                : 'bg-[#151C24] border-gray-700 text-[#bcc1c7] hover:bg-gray-800',
            )}
            disabled={refreshing}
            title="Refresh deployments"
          >
            <svg className={cn('w-4 h-4', refreshing ? 'animate-spin' : '')} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4v4h4M16 16v-4h-4" />
              <path d="M5.636 5.636A7 7 0 0117 10M14.364 14.364A7 7 0 013 10" />
            </svg>
          </button>
        </div>
        </div>

      <div className="space-y-3">

        <div className="grid gap-2 grid-cols-2">
          <StatCard isLight={isLight} label={viewMode === 'endpoints' ? 'Total Endpoints' : 'Total Contexts'} value={stats.total} tone="default" />
          <StatCard isLight={isLight} label="Ready" value={stats.ready} tone="success" />
          <StatCard isLight={isLight} label="Deploying" value={stats.deploying + stats.idle} tone="info" />
          <StatCard 
            isLight={isLight} 
            label={viewMode === 'endpoints' ? 'Offline' : 'Errors'} 
            value={stats.errors + stats.offline} 
            tone={
              stats.errors + stats.offline > 0 
                ? viewMode === 'endpoints' ? 'warn' : 'error'
                : 'default'
            } 
          />
        </div>

        <div className={cn('flex items-center gap-2 text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
          <span className="flex-shrink-0">Status:</span>
          <div 
            className="flex items-center gap-2 overflow-x-auto status-filter-scroll" 
            style={{ 
              scrollbarWidth: 'thin',
              scrollbarColor: isLight ? '#d1d5db transparent' : '#374151 transparent'
            }}
          >
            <style dangerouslySetInnerHTML={{ __html: `
              .status-filter-scroll::-webkit-scrollbar {
                height: 1px;
              }
              .status-filter-scroll::-webkit-scrollbar-track {
                background: transparent;
              }
              .status-filter-scroll::-webkit-scrollbar-thumb {
                background: ${isLight ? '#d1d5db' : '#374151'};
                border-radius: 1px;
              }
              .status-filter-scroll::-webkit-scrollbar-thumb:hover {
                background: ${isLight ? '#9ca3af' : '#4b5563'};
              }
            ` }}></style>
            {(['all', 'ready', 'deploying', 'error', 'offline', 'not_deployed'] as StatusFilter[]).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setStatusFilter(option)}
                className={cn(
                  'px-2 py-1 rounded border transition-colors capitalize inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0',
                  statusFilter === option
                    ? isLight
                      ? 'bg-blue-100 border-blue-200 text-blue-700'
                      : 'bg-blue-900/40 border-blue-700 text-blue-200'
                    : isLight
                    ? 'bg-white border-gray-200 hover:bg-gray-50'
                    : 'bg-[#151C24] border-gray-700 hover:bg-gray-800',
                )}
              >
                {option !== 'all' && renderStatusIcon(option)}
                {option.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className={cn('rounded-lg border overflow-hidden', isLight ? 'border-gray-200 bg-white' : 'border-gray-800 bg-[#0D1117]')}>
          {loading ? (
            <div className={cn('divide-y', isLight ? 'divide-gray-200' : 'divide-gray-800')}>
              {Array.from({ length: 5 }).map((_, idx) => (
                <DeploymentSkeletonCard key={`deployment-skeleton-${idx}`} isLight={isLight} />
              ))}
            </div>
          ) : viewMode === 'endpoints' ? (
            filteredEndpoints.length === 0 ? (
              <div className={cn('p-6 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
                No endpoints match the current filter.
              </div>
            ) : (
              <div className={cn('divide-y', isLight ? 'divide-gray-200' : 'divide-gray-800')}>
                {filteredEndpoints.map((endpoint, idx) => {
                  const orgLabel = getOrgLabel(endpoint.context?.organization_id ?? null);
                  const teamLabel = getTeamLabel(endpoint.context?.organization_id ?? null, endpoint.context?.team_id ?? null);
                  const endpointKey = `${endpoint.agent.type}:${endpoint.model.key}:${endpoint.context?.organization_id || 'global'}:${endpoint.context?.team_id || 'global'}`;
                  const isRestarting = restartingEndpoint === endpointKey;

                  return (
                    <div key={`${endpoint.endpoint}-${idx}`} className={cn('p-3 transition-colors', isLight ? 'hover:bg-gray-50/70' : 'hover:bg-gray-900/40')}>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {renderStatusIcon(isRestarting ? 'deploying' : endpoint.status)}
                              <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded', isLight ? 'bg-gray-100 text-gray-700' : 'bg-gray-800 text-gray-300')}>
                                {endpoint.endpoint}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              <span className={cn('font-medium', mainTextColor)}>
                                {endpoint.agent.name}
                              </span>
                              <span className={cn(isLight ? 'text-gray-400' : 'text-gray-500')}>×</span>
                              <span className={cn(isLight ? 'text-gray-700' : 'text-gray-300')}>
                                {endpoint.model.display_name || endpoint.model.key}
                              </span>
                              {endpoint.model.provider && (
                                <span className={cn('text-[11px] px-1.5 py-0.5 rounded', isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-900/30 text-blue-400')}>
                                  {endpoint.model.provider}
                                </span>
                              )}
                            </div>
                            
                            <div className={cn('text-xs flex items-center gap-2', isLight ? 'text-gray-500' : 'text-gray-400')}>
                              <span>{orgLabel}</span>
                              <span>•</span>
                              <span>{teamLabel}</span>
                            </div>
                            
                            {endpoint.agent.description && (
                              <div className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                {endpoint.agent.description}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRestartEndpoint(endpoint)}
                            disabled={isRestarting}
                            className={cn(
                              'p-1 rounded transition-colors',
                              isRestarting
                                ? isLight
                                  ? 'text-blue-600 cursor-not-allowed'
                                  : 'text-blue-400 cursor-not-allowed'
                                : isLight
                                ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                            )}
                            title={isRestarting ? 'Restarting endpoint...' : 'Restart endpoint (reloads from database)'}
                          >
                            {isRestarting ? (
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredDeployments.length === 0 ? (
            <div className={cn('p-6 text-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
              No deployments match the current filter.
            </div>
          ) : (
            <div className={cn('divide-y', isLight ? 'divide-gray-200' : 'divide-gray-800')}>
              {filteredDeployments.map(deployment => {
                const key = `${deployment.context?.organization_id || 'global'}:${deployment.context?.team_id || 'all'}`;
                const isExpanded = expandedKeys.has(key);
                const orgLabel = getOrgLabel(deployment.context?.organization_id ?? null);
                const teamLabel = getTeamLabel(deployment.context?.organization_id ?? null, deployment.context?.team_id ?? null);

                return (
                  <div key={key} className={cn('p-3 transition-colors', isLight ? 'hover:bg-gray-50/70' : 'hover:bg-gray-900/40')}>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <span className={cn(mainTextColor)}>{orgLabel}</span>
                            <svg className={cn('w-3.5 h-3.5', isLight ? 'text-gray-400' : 'text-gray-500')} viewBox="0 0 20 20" fill="currentColor">
                              <path d="M3 10h14M3 10l4-4m-4 4l4 4" />
                            </svg>
                            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-300')}>
                              {teamLabel}
                            </span>
                          </div>
                          <div className={cn('flex flex-wrap items-center gap-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                            {renderStatusIcon(deployment.status)}
                            <span>
                              Updated {relativeTime(deployment.last_refresh)}
                            </span>
                            {deployment.version && (
                              <span>Version {deployment.version}</span>
                            )}
                            {deployment.error && (
                              <span className={cn('flex items-center gap-1 text-red-500')}>
                                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-5h2v2h-2v-2zm0-6h2v5h-2V7z" clipRule="evenodd" />
                                </svg>
                                {deployment.error}
                              </span>
                            )}
                          </div>
                          <div className={cn('text-[11px]', isLight ? 'text-gray-400' : 'text-gray-500')}>
                            Last refresh: {formatTimestamp(deployment.last_refresh)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRestart(deployment)}
                          disabled={restartContext === `${deployment.context?.organization_id || ''}:${deployment.context?.team_id || ''}`}
                          className={cn(
                            'p-1 rounded transition-colors',
                            restartContext === `${deployment.context?.organization_id || ''}:${deployment.context?.team_id || ''}`
                              ? isLight
                                ? 'text-blue-600 cursor-not-allowed'
                                : 'text-blue-400 cursor-not-allowed'
                              : isLight
                              ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                          )}
                          title={restartContext === `${deployment.context?.organization_id || ''}:${deployment.context?.team_id || ''}` ? 'Restarting context...' : 'Restart context (reloads from database)'}
                        >
                          {restartContext === `${deployment.context?.organization_id || ''}:${deployment.context?.team_id || ''}` ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleExpanded(key)}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium rounded border transition-colors self-start',
                          isLight
                            ? 'border-gray-200 text-gray-600 hover:bg-gray-100'
                            : 'border-gray-700 text-gray-300 hover:bg-gray-800',
                        )}
                      >
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className={cn('grid gap-3 text-xs rounded-md border p-3', isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-800 bg-[#101720]')}>
                        {renderEntityList('Agents', deployment.agents)}
                        {renderEntityList('Models', deployment.models)}
                        {renderEntityList('Providers', deployment.providers)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  isLight: boolean;
  label: string;
  value: number;
  tone: 'default' | 'info' | 'success' | 'warn' | 'error';
}

const StatCard: React.FC<StatCardProps> = ({ isLight, label, value, tone }) => {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';
  
  // Get tone-specific color for the value only
  const valueColor = 
    tone === 'success' ? (isLight ? 'text-green-600' : 'text-green-400') :
    tone === 'info' ? (isLight ? 'text-blue-600' : 'text-blue-400') :
    tone === 'warn' ? (isLight ? 'text-amber-600' : 'text-amber-400') :
    tone === 'error' ? (isLight ? 'text-red-600' : 'text-red-400') :
    mainTextColor;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 transition-colors',
        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
      )}
    >
      <div className={cn('text-xs font-medium', isLight ? 'text-gray-500' : 'text-gray-400')}>
        {label}
      </div>
      <div className={cn('mt-1 text-xl font-bold', valueColor)}>
        {value}
      </div>
    </div>
  );
};
