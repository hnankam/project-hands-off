import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@extension/ui';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { OrganizationSelector, TeamSelector, ModelMultiSelector } from './selectors';

const API_BASE_URL = process.env.CEB_API_URL || 'http://localhost:3001';

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

type AdminRole = 'owner' | 'admin' | 'member';

interface RangeOption {
  value: string;
  label: string;
}

interface TeamOption {
  id: string;
  name: string;
}

interface AgentOption {
  id: string;
  name: string;
  code?: string;
  team_ids?: string[];
}

interface ModelOption {
  id: string;
  name: string;
  code?: string;
  provider?: string;
  team_ids?: string[];
}

interface UserOption {
  id: string;
  label: string;
}

interface UsageSummary {
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  callCount: number;
  sessionCount: number;
  totalCost: number;
  avgTokens: number;
}

interface TimeseriesPoint {
  bucket: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  callCount: number;
  sessionCount: number;
}

interface BreakdownItem {
  id: string;
  label: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  count: number;
  sessionCount: number;
}

interface ModelTimeseriesPoint {
  bucket: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  callCount: number;
  sessionCount: number;
}

interface ModelTimeseriesSeries {
  id: string;
  label: string;
  points: ModelTimeseriesPoint[];
}

interface RecentUsageRow {
  id: string;
  sessionId: string;
  createdAt: string;
  agent: string;
  model: string;
  team: string;
  user: string;
  requestTokens?: number;
  responseTokens?: number;
  requestCount?: number; // For aggregated session data
  totalTokens: number;
  cost: number | null;
  status?: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UsageResponse {
  scope: {
    role: AdminRole;
    organizationId: string;
    enforcedTeamId: string | null;
    enforcedUserId: string | null;
  };
  filters: {
    range: {
      options: RangeOption[];
      selected: string;
    };
    teams: {
      options: TeamOption[];
      selected: string | null;
    };
    users: {
      options: UserOption[];
      selected: string | null;
    };
    agents: {
      options: AgentOption[];
      selected: string | null;
    };
    models: {
      options: ModelOption[];
      selected: string | null;
    };
  };
  summary: UsageSummary;
  timeseries: TimeseriesPoint[];
  breakdowns: {
    models: BreakdownItem[];
    agents: BreakdownItem[];
    teams: BreakdownItem[];
    users: BreakdownItem[];
  };
  modelsTimeseries: ModelTimeseriesSeries[];
  agentsTimeseries: ModelTimeseriesSeries[];
  teamsTimeseries: ModelTimeseriesSeries[];
  usersTimeseries: ModelTimeseriesSeries[];
  recent: {
    data: RecentUsageRow[];
    pagination: PaginationInfo;
  };
}

interface UsageTabProps {
  isLight: boolean;
  organizations: Organization[];
  preselectedOrgId?: string;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}

type UsageFilters = {
  range: string;
  teamIds: string[];
  userIds: string[];
  agentIds: string[];
  modelIds: string[];
};

const DEFAULT_FILTERS: UsageFilters = {
  range: '24h',
  teamIds: [],
  userIds: [],
  agentIds: [],
  modelIds: [],
};

const UsageSkeleton: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div className="space-y-4 animate-pulse">
    {/* Organization and Team Selectors */}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className={cn('h-3 w-32 rounded mb-2', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-9 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
        </div>
      <div>
        <div className={cn('h-3 w-24 rounded mb-2', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-9 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
      </div>
    </div>

    {/* Agent and Model Selectors */}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className={cn('h-3 w-28 rounded mb-2', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-9 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
      </div>
      <div>
        <div className={cn('h-3 w-28 rounded mb-2', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-9 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
      </div>
    </div>

    {/* User and Metric Selectors */}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className={cn('h-3 w-24 rounded mb-2', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-9 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
      </div>
      <div>
        <div className={cn('h-3 w-28 rounded mb-2', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        <div className={cn('h-9 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
      </div>
    </div>

    {/* Range Selector */}
    <div className={cn('h-10 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />

    {/* Summary Cards */}
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div
          key={`summary-skeleton-${idx}`}
          className={cn(
            'rounded-lg border p-3',
            isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
          )}
        >
          <div className={cn('h-2.5 w-20 rounded mb-2', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
          <div className={cn('h-6 w-24 rounded', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
        </div>
      ))}
    </div>

    {/* Main Chart */}
    <div
      className={cn(
        'rounded-lg border p-4',
        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
      )}
    >
      <div className={cn('h-3 w-32 rounded mb-4', isLight ? 'bg-gray-200' : 'bg-gray-700')} />
      <div className={cn('h-48 w-full rounded', isLight ? 'bg-gray-100' : 'bg-gray-800')} />
    </div>
  </div>
);

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

// Compact number formatter for Y-axis
const compactNumberFormatter = (value: number): string => {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
};

const tooltipFormatter = (value: number) => `${numberFormatter.format(Math.max(value, 0))} tokens`;

const formatBucketLabel = (bucket: string, rangeKey: string) => {
  const date = new Date(bucket);

  if (Number.isNaN(date.getTime())) {
    return bucket;
  }

  if (rangeKey === '1h' || rangeKey === '24h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (rangeKey === '7d' || rangeKey === '30d') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const chartColors = {
  total: { light: '#9CA3AF', dark: '#6B7280' }, // Gray
  request: { light: '#3B82F6', dark: '#60A5FA' }, // Blue
  response: { light: '#10B981', dark: '#34D399' }, // Green
  requests: { light: '#F59E0B', dark: '#FBBF24' }, // Amber
  sessions: { light: '#8B5CF6', dark: '#C4B5FD' }, // Purple
};

const MODEL_COLOR_PALETTE = ['#3B82F6', '#10B981', '#6366F1', '#F59E0B', '#EC4899', '#A855F7', '#22D3EE'];

const scopeDescriptions: Record<AdminRole, string> = {
  owner: 'organization-wide usage',
  admin: 'team usage',
  member: 'personal usage',
};

const getRangeLabel = (options: RangeOption[], selected: string) =>
  options.find(option => option.value === selected)?.label || 'Selected range';

// User Multi-Selector Component (matching TeamSelector design exactly)
interface UserMultiSelectorProps {
  isLight: boolean;
  users: UserOption[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}

const UserIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
  </svg>
);

const AgentIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const UserMultiSelector: React.FC<UserMultiSelectorProps> = ({
  isLight,
  users,
  selectedUserIds,
  onChange,
  placeholder = 'All users',
  allowEmpty = true,
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

  const toggleUser = (userId: string) => {
    const newSelection = selectedUserIds.includes(userId)
      ? selectedUserIds.filter(id => id !== userId)
      : [...selectedUserIds, userId];
    onChange(newSelection);
  };

  const removeUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedUserIds.filter(id => id !== userId);
    onChange(newSelection);
  };

  const selectedUsers = users.filter(user => selectedUserIds.includes(user.id));

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
        <span className="flex-shrink-0 mt-0.5">
          <UserIcon />
        </span>
        
        {selectedUsers.length > 0 ? (
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedUsers.map(user => (
              <span
                key={user.id}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                  isLight
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-900/30 text-blue-400'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {user.label}
                <button
                  type="button"
                  onClick={(e) => removeUser(user.id, e)}
                  className={cn(
                    'hover:bg-black/10 rounded-full p-0.5 transition-colors',
                    isLight ? 'text-blue-600' : 'text-blue-300'
                  )}
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className={cn('flex-1 min-w-0 text-left', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {placeholder}
          </span>
        )}
        
        <svg
          className={cn(
            'transition-transform flex-shrink-0 mt-0.5',
            isOpen ? 'rotate-180' : ''
          )}
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
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          {users.length === 0 ? (
            <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
              No users available
            </div>
          ) : (
            users.map(user => {
              const isSelected = selectedUserIds.includes(user.id);
              return (
                <button
                  type="button"
                  key={user.id}
                  onClick={() => toggleUser(user.id)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors',
                    isLight
                      ? 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-200 hover:bg-gray-700'
                  )}
                >
                  <div className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : isLight
                      ? 'border-gray-300'
                      : 'border-gray-600'
                  )}>
                    {isSelected && (
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
                  <UserIcon />
                  <span className="truncate flex-1 text-left">{user.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

// Agent Multi-Selector Component
interface AgentMultiSelectorProps {
  isLight: boolean;
  agents: AgentOption[];
  selectedAgentIds: string[];
  onChange: (agentIds: string[]) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}

const AgentMultiSelector: React.FC<AgentMultiSelectorProps> = ({
  isLight,
  agents,
  selectedAgentIds,
  onChange,
  placeholder = 'All agents',
  allowEmpty = true,
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

  const toggleAgent = (agentId: string) => {
    const newSelection = selectedAgentIds.includes(agentId)
      ? selectedAgentIds.filter(id => id !== agentId)
      : [...selectedAgentIds, agentId];
    onChange(newSelection);
  };

  const removeAgent = (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedAgentIds.filter(id => id !== agentId);
    onChange(newSelection);
  };

  const selectedAgents = agents.filter(agent => selectedAgentIds.includes(agent.id));

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
        <span className="flex-shrink-0 mt-0.5">
          <AgentIcon />
        </span>
        
        {selectedAgents.length > 0 ? (
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedAgents.map(agent => (
              <span
                key={agent.id}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                  isLight
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-900/30 text-blue-400'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {agent.name}
                <button
                  type="button"
                  onClick={(e) => removeAgent(agent.id, e)}
                  className={cn(
                    'hover:bg-black/10 rounded-full p-0.5 transition-colors',
                    isLight ? 'text-blue-600' : 'text-blue-300'
                  )}
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className={cn('flex-1 min-w-0 text-left', isLight ? 'text-gray-500' : 'text-gray-400')}>
            {placeholder}
          </span>
        )}
        
        <svg
          className={cn(
            'transition-transform flex-shrink-0 mt-0.5',
            isOpen ? 'rotate-180' : ''
          )}
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
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          {agents.length === 0 ? (
            <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
              No agents available
            </div>
          ) : (
            agents.map(agent => {
              const isSelected = selectedAgentIds.includes(agent.id);
              return (
                <button
                  type="button"
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors',
                    isLight
                      ? 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-200 hover:bg-gray-700'
                  )}
                >
                  <div className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : isLight
                      ? 'border-gray-300'
                      : 'border-gray-600'
                  )}>
                    {isSelected && (
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
                  <AgentIcon />
                  <span className="truncate flex-1 text-left">{agent.name}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{
  isLight: boolean;
  label: string;
  value: string;
  description: string;
}> = ({ isLight, label, value, description }) => {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';
  
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
      <div className={cn('mt-1 text-xl font-bold', mainTextColor)}>
      {value}
    </div>
    <div className={cn('mt-0.5 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
      {description}
    </div>
  </div>
);
};

type ModelChartType = 'area-step' | 'stacked-area' | 'line' | 'line-dots' | 'bar';
type TokenMetricType = 'total' | 'request' | 'response';
type UsageMetricType = 'tokens' | 'requests' | 'sessions';

const METRIC_OPTIONS: { value: UsageMetricType; label: string }[] = [
  { value: 'tokens', label: 'Tokens' },
  { value: 'requests', label: 'Requests' },
  { value: 'sessions', label: 'Sessions' },
];

const MODEL_CHART_OPTIONS: { value: ModelChartType; label: string; icon: string }[] = [
  { value: 'area-step', label: 'Step Area', icon: '▭' },
  { value: 'stacked-area', label: 'Stacked Area', icon: '◰' },
  { value: 'line', label: 'Line Chart', icon: '📈' },
  { value: 'line-dots', label: 'Line with Dots', icon: '🔵' },
  { value: 'bar', label: 'Bar Chart', icon: '📊' },
];

const TOKEN_METRIC_OPTIONS: { value: TokenMetricType; label: string }[] = [
  { value: 'total', label: 'Total Tokens' },
  { value: 'request', label: 'Request Tokens' },
  { value: 'response', label: 'Response Tokens' },
];

type SimpleTooltipEntry = {
  dataKey?: string | number;
  color?: string;
  value?: number | string | Array<number | string>;
};

type SimpleTooltipProps = {
  active?: boolean;
  payload?: SimpleTooltipEntry[];
  label?: string | number;
};

const TimeseriesCard: React.FC<{
  isLight: boolean;
  title: string;
  rangeKey: string;
  series: ModelTimeseriesSeries[];
  metric: UsageMetricType;
}> = ({ isLight, title, rangeKey, series, metric }) => {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  const [chartType, setChartType] = useState<ModelChartType>('area-step');
  const [tokenMetric, setTokenMetric] = useState<TokenMetricType>('total');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [metricDropdownOpen, setMetricDropdownOpen] = useState(false);
  const [visibleIds, setVisibleIds] = useState<string[]>(series.map(s => s.id));

  useEffect(() => {
    setVisibleIds(series.map(s => s.id));
  }, [series]);

  useEffect(() => {
    if (metric !== 'tokens') {
      setMetricDropdownOpen(false);
      setTokenMetric('total');
    }
  }, [metric]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    series.forEach((item, index) => {
      map[item.id] = MODEL_COLOR_PALETTE[index % MODEL_COLOR_PALETTE.length];
    });
    return map;
  }, [series]);

  const labelMap = useMemo(() => {
    const map: Record<string, string> = {};
    series.forEach(item => {
      map[item.id] = item.label;
    });
    return map;
  }, [series]);

  const buckets = useMemo(() => {
    const bucketSet = new Set<string>();
    series.forEach(item => {
      item.points.forEach(point => bucketSet.add(point.bucket));
    });
    return Array.from(bucketSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [series]);

  const chartData = useMemo(() => {
    return buckets.map(bucket => {
      const entry: Record<string, number | string> = {
        bucket,
        label: formatBucketLabel(bucket, rangeKey),
      };
      series.forEach(item => {
        const point = item.points.find(p => p.bucket === bucket);
        if (!point) {
          entry[item.id] = 0;
          return;
        }

        if (metric === 'tokens') {
          entry[item.id] =
            tokenMetric === 'total'
              ? point.totalTokens
              : tokenMetric === 'request'
              ? point.requestTokens
              : point.responseTokens;
        } else if (metric === 'requests') {
          entry[item.id] = point.callCount;
        } else {
          entry[item.id] = point.sessionCount;
        }
      });
      return entry;
    });
  }, [buckets, metric, rangeKey, series, tokenMetric]);

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const visibleSeries = series.filter(item => visibleSet.has(item.id));

  const toggleSeries = (id: string) => {
    setVisibleIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const tooltipContent = useCallback(
    (props: SimpleTooltipProps) => {
      const { active, payload, label } = props;

      if (!active || !payload || payload.length === 0) {
        return null;
      }

      const normalizedPayload = (payload as SimpleTooltipEntry[]).filter(Boolean);
      const filteredPayload = normalizedPayload.filter(entry => entry.dataKey != null && visibleSet.has(String(entry.dataKey)));

      if (filteredPayload.length === 0) {
        return null;
      }

      const valueSuffix =
        metric === 'tokens' ? 'tokens' : metric === 'requests' ? 'requests' : 'sessions';

      return (
        <div
          className={cn(
            'rounded-lg border shadow-lg overflow-hidden',
            isLight ? 'bg-white border-gray-200' : 'bg-[#1F2937] border-gray-700',
          )}
        >
          <p className={cn('text-xs font-medium px-3 pt-2 pb-2 border-b', isLight ? 'text-gray-900 border-gray-200' : 'text-gray-100 border-gray-700')}>
            {label ?? ''}
          </p>
          <div className="px-3 py-2">
            {filteredPayload.map(entry => (
              <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2" style={{ backgroundColor: entry.color }} />
                  <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                    {labelMap[String(entry.dataKey)] || ''}
                  </span>
                </div>
                <span className={cn('text-xs font-medium', mainTextColor)}>
                  {`${numberFormatter.format(Number(entry.value) || 0)} ${valueSuffix}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    },
    [isLight, labelMap, metric, visibleSet],
  );

  const renderChart = () => {
    const commonAxes = (
      <>
        <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#E5E7EB' : '#1F2937'} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={value => compactNumberFormatter(value as number)}
          tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <Tooltip cursor={{ strokeDasharray: '3 3', stroke: isLight ? '#CBD5E1' : '#4B5563' }} content={tooltipContent} />
      </>
    );

    const margin = { top: 5, right: 30, left: 0, bottom: 5 };

    if (chartType === 'line') {
      return (
        <LineChart data={chartData} margin={margin}>
          {commonAxes}
          {visibleSeries.map(seriesItem => (
            <Line
              key={seriesItem.id}
              type="monotone"
              dataKey={seriesItem.id}
              stroke={colorMap[seriesItem.id]}
              strokeWidth={1.8}
              dot={false}
            />
          ))}
        </LineChart>
      );
    }

    if (chartType === 'line-dots') {
      return (
        <LineChart data={chartData} margin={margin}>
          {commonAxes}
          {visibleSeries.map(seriesItem => (
            <Line
              key={seriesItem.id}
              type="monotone"
              dataKey={seriesItem.id}
              stroke={colorMap[seriesItem.id]}
              strokeWidth={1.8}
              dot={{ r: 3, strokeWidth: 1.5, fill: colorMap[seriesItem.id], stroke: colorMap[seriesItem.id] }}
            />
          ))}
        </LineChart>
      );
    }

    if (chartType === 'bar') {
      return (
        <BarChart data={chartData} margin={margin}>
          {commonAxes}
          {visibleSeries.map(seriesItem => (
            <Bar
              key={seriesItem.id}
              dataKey={seriesItem.id}
              stackId="models"
              fill={colorMap[seriesItem.id]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      );
    }

    const gradientDefs = (
      <defs>
        {visibleSeries.map(seriesItem => (
          <linearGradient key={seriesItem.id} id={`modelGradient-${seriesItem.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colorMap[seriesItem.id]} stopOpacity={0.35} />
            <stop offset="95%" stopColor={colorMap[seriesItem.id]} stopOpacity={0.05} />
          </linearGradient>
        ))}
      </defs>
    );

    if (chartType === 'stacked-area') {
      return (
        <AreaChart data={chartData} margin={margin}>
          {gradientDefs}
          {commonAxes}
          {visibleSeries.map(seriesItem => (
            <Area
              key={seriesItem.id}
              type="monotone"
              dataKey={seriesItem.id}
              stackId="models"
              stroke={colorMap[seriesItem.id]}
              strokeWidth={1.6}
              fill={`url(#modelGradient-${seriesItem.id})`}
              dot={false}
            />
          ))}
        </AreaChart>
      );
    }

    // Default: area-step
    return (
      <AreaChart data={chartData} margin={margin}>
        {gradientDefs}
        {commonAxes}
        {visibleSeries.map(seriesItem => (
          <Area
            key={seriesItem.id}
            type="step"
            dataKey={seriesItem.id}
            stroke={colorMap[seriesItem.id]}
            strokeWidth={1.6}
            fill={`url(#modelGradient-${seriesItem.id})`}
            dot={false}
          />
        ))}
      </AreaChart>
    );
  };

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
      )}
    >
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
        <h3 className={cn('text-sm font-semibold', mainTextColor)}>{title}</h3>
        <div className="flex items-center gap-2">
          {/* Token Metric Selector */}
          {metric === 'tokens' && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMetricDropdownOpen(prev => !prev)}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded border transition-colors text-xs',
                isLight
                  ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  : 'bg-[#151C24] border-gray-700 text-gray-300 hover:bg-gray-800',
              )}
            >
              <span>{TOKEN_METRIC_OPTIONS.find(opt => opt.value === tokenMetric)?.label}</span>
              <svg
                className={cn('h-2.5 w-2.5 transition-transform', metricDropdownOpen && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {metricDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMetricDropdownOpen(false)} />
                <div
                  className={cn(
                    'absolute right-0 mt-1 w-40 rounded-md border shadow-lg z-20 text-xs',
                    isLight ? 'bg-white border-gray-200' : 'bg-[#1F2937] border-gray-700',
                  )}
                >
                  {TOKEN_METRIC_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setTokenMetric(option.value);
                        setMetricDropdownOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 transition-colors first:rounded-t-md last:rounded-b-md',
                        tokenMetric === option.value
                          ? isLight
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-blue-900/30 text-blue-300'
                          : isLight
                          ? 'text-gray-700 hover:bg-gray-50'
                          : 'text-gray-300 hover:bg-gray-800',
                      )}
                    >
                      <span>{option.label}</span>
                      {tokenMetric === option.value && (
                        <svg className="ml-auto h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
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
              </>
            )}
          </div>
          )}

          {/* Chart Type Selector - Hidden for now */}
          {false && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen(prev => !prev)}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors',
                isLight
                  ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  : 'bg-[#151C24] border-gray-700 text-gray-300 hover:bg-gray-800',
              )}
              title={MODEL_CHART_OPTIONS.find(option => option.value === chartType)?.label}
            >
              <span className="text-sm">
                {MODEL_CHART_OPTIONS.find(option => option.value === chartType)?.icon || '▭'}
              </span>
              <svg
                className={cn('h-2.5 w-2.5 transition-transform', dropdownOpen && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div
                  className={cn(
                    'absolute right-0 mt-1 w-44 rounded-md border shadow-lg z-20 text-xs',
                    isLight ? 'bg-white border-gray-200' : 'bg-[#1F2937] border-gray-700',
                  )}
                >
                  {MODEL_CHART_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setChartType(option.value);
                        setDropdownOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 transition-colors first:rounded-t-md last:rounded-b-md',
                        chartType === option.value
                          ? isLight
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-blue-900/30 text-blue-300'
                          : isLight
                          ? 'text-gray-700 hover:bg-gray-50'
                          : 'text-gray-300 hover:bg-gray-800',
                      )}
                    >
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                      {chartType === option.value && (
                        <svg className="ml-auto h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
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
              </>
            )}
          </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-4 py-2">
        {series.map(seriesItem => {
          const isActive = visibleSet.has(seriesItem.id);
          return (
            <button
              key={seriesItem.id}
              type="button"
              onClick={() => toggleSeries(seriesItem.id)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2 py-1 text-[10px] uppercase transition-colors',
                isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800',
                !isActive && 'opacity-40',
              )}
            >
              <span className="h-2 w-2" style={{ backgroundColor: colorMap[seriesItem.id] }} />
              <span className={cn(isLight ? 'text-gray-700' : 'text-gray-200')}>{seriesItem.label}</span>
            </button>
          );
        })}
      </div>

      <div className="h-64 w-full py-3">
        {chartData.length === 0 || visibleSeries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-gray-500">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

const BreakdownCard: React.FC<{
  isLight: boolean;
  title: string;
  data: BreakdownItem[];
  metric: UsageMetricType;
}> = ({ isLight, title, data, metric }) => {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';
  const valueKey =
    metric === 'tokens' ? 'totalTokens' : metric === 'requests' ? 'count' : 'sessionCount';
  const valueLabel =
    metric === 'tokens' ? 'Total tokens' : metric === 'requests' ? 'Total requests' : 'Active sessions';
  const barFill =
    metric === 'tokens'
      ? isLight
        ? chartColors.total.light
        : chartColors.total.dark
      : metric === 'requests'
      ? isLight
        ? chartColors.requests.light
        : chartColors.requests.dark
      : isLight
      ? chartColors.sessions.light
      : chartColors.sessions.dark;

  return (
  <div
    className={cn(
      'rounded-lg border transition-colors',
      isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
    )}
  >
    <div className={cn('px-4 py-2 border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
        <h3 className={cn('text-sm font-semibold', mainTextColor)}>
        {title}
      </h3>
    </div>
    <div className="h-64 w-full py-3">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-gray-500">
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="horizontal" margin={{ left: 0, right: 30, top: 5, bottom: 5 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isLight ? '#E5E7EB' : '#1F2937'}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
              tickFormatter={value => compactNumberFormatter(value as number)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
              width={100}
            />
            <Tooltip
              cursor={{ fill: isLight ? '#F3F4F6' : '#1F2937' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const entry = payload[0];
                  const valueSuffix =
                    metric === 'tokens' ? 'tokens' : metric === 'requests' ? 'requests' : 'sessions';
                  return (
                    <div
                      className={cn(
                        'rounded-lg border shadow-lg overflow-hidden',
                        isLight ? 'bg-white border-gray-200' : 'bg-[#1F2937] border-gray-700',
                      )}
                    >
                      <p className={cn('text-xs font-medium px-3 pt-2 pb-2 border-b', isLight ? 'text-gray-900 border-gray-200' : 'text-gray-100 border-gray-700')}>
                        {entry.payload.label}
                      </p>
                      <div className="px-3 py-2">
                        <div className="flex items-center justify-between gap-4 py-0.5">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="h-2 w-2"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                              {valueLabel}
                            </span>
                          </div>
                          <span className={cn('text-xs font-medium', mainTextColor)}>
                            {`${numberFormatter.format(entry.value as number)} ${valueSuffix}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey={valueKey}
              fill={barFill}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);
};

export const UsageTab: React.FC<UsageTabProps> = ({ isLight, organizations, preselectedOrgId, onError, onSuccess }) => {
  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  const [usageData, setUsageData] = useState<UsageResponse | null>(null);
  const [filters, setFilters] = useState<UsageFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState(preselectedOrgId || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState<{
    totalTokens: boolean;
    requestTokens: boolean;
    responseTokens: boolean;
  }>({
    totalTokens: true,
    requestTokens: true,
    responseTokens: true,
  });
  const [metric, setMetric] = useState<UsageMetricType>('tokens');

  type ChartType = 'area' | 'line' | 'bar' | 'stacked-bar' | 'stacked-area' | 'area-spline' | 'step-line' | 'line-dots' | 'area-step';
  const [chartType, setChartType] = useState<ChartType>('area-step');
  const [chartDropdownOpen, setChartDropdownOpen] = useState(false);

  const chartTypeOptions: { value: ChartType; label: string; icon: string }[] = [
    { value: 'area', label: 'Area Chart', icon: '📊' },
    { value: 'line', label: 'Line Chart', icon: '📈' },
    { value: 'line-dots', label: 'Line with Dots', icon: '🔵' },
    { value: 'bar', label: 'Bar Chart', icon: '📊' },
    { value: 'stacked-bar', label: 'Stacked Bar', icon: '▤' },
    { value: 'stacked-area', label: 'Stacked Area', icon: '◰' },
    { value: 'area-spline', label: 'Smooth Area', icon: '〰️' },
    { value: 'area-step', label: 'Step Area', icon: '▭' },
    { value: 'step-line', label: 'Step Line', icon: '▬' },
  ];

  const toggleSeries = (seriesKey: 'totalTokens' | 'requestTokens' | 'responseTokens') => {
    setVisibleSeries(prev => ({
      ...prev,
      [seriesKey]: !prev[seriesKey],
    }));
  };

  // Auto-select organization if there's only one
  useEffect(() => {
    if (!selectedOrgId && !preselectedOrgId && organizations.length === 1) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [organizations, selectedOrgId, preselectedOrgId]);

  useEffect(() => {
    if (preselectedOrgId && preselectedOrgId !== selectedOrgId) {
      setSelectedOrgId(preselectedOrgId);
    }
  }, [preselectedOrgId]);

  // Load teams and fetch usage when organization changes
  useEffect(() => {
    if (selectedOrgId) {
      // Reset filters when org changes
      setFilters(DEFAULT_FILTERS);
      setCurrentPage(1);
      // Fetch usage with default filters after resetting
      // This will also populate teams, agents, models, and users options
      fetchUsage(DEFAULT_FILTERS);
    }
  }, [selectedOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTeams = async (organizationId: string) => {
    setTeamsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/config/teams?organizationId=${organizationId}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams || []);
      } else {
        setTeams([]);
      }
    } catch (err) {
      console.error('Failed to load teams:', err);
      setTeams([]);
    } finally {
      setTeamsLoading(false);
    }
  };

  const fetchUsage = useCallback(
    async (overrideFilters?: UsageFilters, page?: number) => {
      const effectiveFilters = overrideFilters ?? filters;
      const effectivePage = page ?? currentPage;
      const params = new URLSearchParams();
      
      // Send the selected organization ID
      if (selectedOrgId) {
        params.set('organizationId', selectedOrgId);
      }
      
      params.set('range', effectiveFilters.range || '24h');
      params.set('page', effectivePage.toString());
      params.set('limit', '25');
      params.set('metric', metric);
      // Send multiple IDs as comma-separated values
      if (effectiveFilters.teamIds.length > 0) {
        params.set('teamIds', effectiveFilters.teamIds.join(','));
      }
      if (effectiveFilters.userIds.length > 0) {
        params.set('userIds', effectiveFilters.userIds.join(','));
      }
      if (effectiveFilters.agentIds.length > 0) {
        params.set('agentIds', effectiveFilters.agentIds.join(','));
      }
      if (effectiveFilters.modelIds.length > 0) {
        params.set('modelIds', effectiveFilters.modelIds.join(','));
      }

      const queryString = params.toString();

      if (overrideFilters) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/usage${queryString ? `?${queryString}` : ''}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody?.error || 'Failed to load usage metrics');
        }

        const data: UsageResponse = await response.json();

        setUsageData(data);

        // Don't reset filters from backend response when we already have overrideFilters
        // This prevents multi-select state from being overwritten by single-value backend response
        if (!overrideFilters) {
          // Only sync filters from backend on initial load
          const normalizedFilters: UsageFilters = {
            range: data.filters.range.selected,
            teamIds: data.filters.teams.selected ? [data.filters.teams.selected] : [],
            userIds: data.filters.users.selected ? [data.filters.users.selected] : [],
            agentIds: data.filters.agents.selected ? [data.filters.agents.selected] : [],
            modelIds: data.filters.models.selected ? [data.filters.models.selected] : [],
          };
          setFilters(prev => {
            const hasChanged =
              prev.range !== normalizedFilters.range ||
              JSON.stringify(prev.teamIds) !== JSON.stringify(normalizedFilters.teamIds) ||
              JSON.stringify(prev.userIds) !== JSON.stringify(normalizedFilters.userIds) ||
              JSON.stringify(prev.agentIds) !== JSON.stringify(normalizedFilters.agentIds) ||
              JSON.stringify(prev.modelIds) !== JSON.stringify(normalizedFilters.modelIds);
            return hasChanged ? normalizedFilters : prev;
          });
        }

        setLastUpdated(new Date());
      } catch (err: any) {
        onError(err.message || 'Failed to load usage metrics');
        console.error('Usage fetch error:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, currentPage, selectedOrgId, metric, onError],
  );

  // Reset to page 1 when filters or metric change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters.range, filters.teamIds, filters.userIds, filters.agentIds, filters.modelIds, metric]);

  // Refresh data when metric changes
  useEffect(() => {
    if (selectedOrgId) {
      fetchUsage(filters);
    }
  }, [metric]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (filterKey: string, value: any) => {
    const newFilters = { ...filters, [filterKey]: value };
    setFilters(newFilters);
    fetchUsage(newFilters);
  };

  const handleTeamIdsChange = (teamIds: string[]) => {
    const newFilters = { ...filters, teamIds };
    setFilters(newFilters);
    fetchUsage(newFilters);
  };

  const handleUserIdsChange = (userIds: string[]) => {
    const newFilters = { ...filters, userIds };
    setFilters(newFilters);
    fetchUsage(newFilters);
  };

  const handleAgentIdsChange = (agentIds: string[]) => {
    const newFilters = { ...filters, agentIds };
    setFilters(newFilters);
    fetchUsage(newFilters);
  };

  const handleModelIdsChange = (modelIds: string[]) => {
    const newFilters = { ...filters, modelIds };
    setFilters(newFilters);
    fetchUsage(newFilters);
  };

  const handleRefresh = () => {
    fetchUsage(filters);
  };

  const rangeDescriptor = useMemo(() => {
    if (!usageData) return '';
    return getRangeLabel(usageData.filters.range.options, usageData.filters.range.selected);
  }, [usageData]);

  const chartData = useMemo(() => {
    if (!usageData) return [];

    return usageData.timeseries.map(point => {
      return {
        ...point,
        label: formatBucketLabel(point.bucket, usageData.filters.range.selected),
      };
    });
  }, [usageData]);

  const mainChartTitle =
    metric === 'tokens'
      ? 'Overall Token Usage'
      : metric === 'requests'
      ? 'Overall Requests'
      : 'Active Sessions';
  const mainMetricKey = metric === 'requests' ? 'callCount' : 'sessionCount';
  const mainMetricLabel = metric === 'requests' ? 'Requests' : 'Active sessions';
  const mainMetricColor =
    metric === 'requests'
      ? isLight
        ? chartColors.requests.light
        : chartColors.requests.dark
      : isLight
      ? chartColors.sessions.light
      : chartColors.sessions.dark;
  const mainMetricGradientId = metric === 'requests' ? 'requestsMainGradient' : 'sessionsMainGradient';

  const modelsBreakdown = usageData?.breakdowns.models ?? [];
  const modelsTimeseries = usageData?.modelsTimeseries ?? [];
  const agentsBreakdown = usageData?.breakdowns.agents ?? [];
  const agentsTimeseries = usageData?.agentsTimeseries ?? [];
  const teamsBreakdown = usageData?.breakdowns.teams ?? [];
  const teamsTimeseries = usageData?.teamsTimeseries ?? [];
  const usersBreakdown = usageData?.breakdowns.users ?? [];
  const usersTimeseries = usageData?.usersTimeseries ?? [];

  const summary = usageData?.summary;

  const summaryCards = useMemo(() => {
    const hasSummary = Boolean(summary);
    const safeSummary: UsageSummary = summary ?? {
      totalTokens: 0,
      requestTokens: 0,
      responseTokens: 0,
      callCount: 0,
      sessionCount: 0,
      totalCost: 0,
      avgTokens: 0,
    };

    const formatCount = (value: number, decimals = false) =>
      hasSummary ? (decimals ? decimalFormatter.format(value) : numberFormatter.format(Math.max(value, 0))) : '—';

    if (metric === 'tokens') {
      return [
        {
          label: 'Total tokens',
          value: formatCount(safeSummary.totalTokens),
          description: 'Request + response',
        },
        {
          label: 'Request tokens',
          value: formatCount(safeSummary.requestTokens),
          description: 'Prompt usage',
        },
        {
          label: 'Response tokens',
          value: formatCount(safeSummary.responseTokens),
          description: 'Completion usage',
        },
        {
          label: 'Avg tokens / call',
          value: hasSummary ? numberFormatter.format(Math.round(safeSummary.avgTokens || 0)) : '—',
          description: hasSummary
            ? `${numberFormatter.format(safeSummary.callCount)} total calls`
            : 'Call volume',
        },
      ];
    }

    if (metric === 'requests') {
      const requestsPerSession =
        safeSummary.sessionCount > 0 ? safeSummary.callCount / safeSummary.sessionCount : 0;
      return [
        {
          label: 'Total requests',
          value: formatCount(safeSummary.callCount),
          description: 'Usage events',
        },
        {
          label: 'Avg tokens / request',
          value: formatCount(Math.round(safeSummary.avgTokens || 0)),
          description: 'Tokens per call',
        },
        {
          label: 'Active sessions',
          value: formatCount(safeSummary.sessionCount),
          description: 'Distinct sessions',
        },
        {
          label: 'Requests / session',
          value: formatCount(Math.round(requestsPerSession)),
          description: 'Call distribution',
        },
      ];
    }

    // Sessions metric
    const tokensPerSession =
      safeSummary.sessionCount > 0 ? safeSummary.totalTokens / safeSummary.sessionCount : 0;
    const requestsPerSession =
      safeSummary.sessionCount > 0 ? safeSummary.callCount / safeSummary.sessionCount : 0;

    return [
      {
        label: 'Active sessions',
        value: formatCount(safeSummary.sessionCount),
        description: 'Distinct session IDs',
      },
      {
        label: 'Total requests',
        value: formatCount(safeSummary.callCount),
        description: 'Usage events',
      },
      {
        label: 'Requests / session',
        value: formatCount(Math.round(requestsPerSession)),
        description: 'Average call load',
      },
      {
        label: 'Tokens / session',
        value: formatCount(tokensPerSession),
        description: 'Average token usage',
      },
    ];
  }, [metric, summary]);

  // For sessions and requests metrics, the backend provides aggregated data
  // For tokens metric, we pass through individual request data
  const activityData = useMemo(() => {
    if (!usageData?.recent?.data) {
      return [];
    }
    return usageData.recent.data;
  }, [usageData]);

  const scopeLabel = usageData
    ? (() => {
        const base = scopeDescriptions[usageData.scope.role];
        if (usageData.scope.role === 'admin' && usageData.filters.teams.selected) {
          const selectedTeam = usageData.filters.teams.options.find(
            team => team.id === usageData.filters.teams.selected,
          );
          return `${base} (${selectedTeam?.name || 'team'})`;
        }
        if (usageData.scope.role === 'member') {
          return `${base} only`;
        }
        return base;
      })()
    : '';

  if (loading && !usageData) {
    return <UsageSkeleton isLight={isLight} />;
  }

  return (
    <div className="space-y-4">
      {/* Organization and Team Selectors */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className={cn('mb-2 block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Select Organization
          </label>
          <OrganizationSelector
            isLight={isLight}
            organizations={organizations}
            selectedOrgId={selectedOrgId}
            onOrgChange={setSelectedOrgId}
          />
        </div>

        <div>
          <label className={cn('mb-2 block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Team
          </label>
          <TeamSelector
            isLight={isLight}
            teams={usageData?.filters.teams.options?.map(t => ({ id: t.id, name: t.name, organizationId: selectedOrgId || '' })) ?? []}
            selectedTeamIds={filters.teamIds}
            onTeamChange={handleTeamIdsChange}
            placeholder="All teams"
            allowEmpty={true}
          />
        </div>
      </div>

      {/* Agent and Model Selectors */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className={cn('mb-2 block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Agent
          </label>
          <AgentMultiSelector
            isLight={isLight}
            agents={usageData?.filters.agents.options ?? []}
            selectedAgentIds={filters.agentIds}
            onChange={handleAgentIdsChange}
            placeholder="All agents"
            allowEmpty={true}
          />
        </div>

        <div>
          <label className={cn('mb-2 block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Model
          </label>
          <ModelMultiSelector
            isLight={isLight}
            models={usageData?.filters.models.options ?? []}
            selectedModelIds={filters.modelIds}
            onChange={handleModelIdsChange}
            placeholder="All models"
            allowEmpty={true}
          />
        </div>
      </div>

      {/* User and Metric Selectors */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className={cn('mb-2 block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by User
          </label>
          <UserMultiSelector
            isLight={isLight}
            users={usageData?.filters.users.options ?? []}
            selectedUserIds={filters.userIds}
            onChange={handleUserIdsChange}
            placeholder="All users"
            allowEmpty={true}
          />
        </div>

        <div>
          <label className={cn('mb-2 block text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Filter by Metric
          </label>
          <div
            className={cn(
              'flex items-center gap-1 rounded-lg p-1',
              isLight ? 'bg-gray-100' : 'bg-[#151C24]',
            )}
          >
            {METRIC_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMetric(option.value)}
                className={cn(
                  'flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                  metric === option.value
                    ? isLight
                      ? 'bg-white text-gray-900'
                      : 'bg-gray-700 text-white'
                    : isLight
                    ? 'text-gray-600 hover:text-gray-900'
                    : 'text-gray-400 hover:text-gray-200',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Range Selector and Refresh */}
      <div className="mb-4 flex items-center gap-3">
        <div
          className={cn(
            'flex flex-1 items-center gap-1 rounded-lg p-1 min-w-0',
            isLight ? 'bg-gray-100' : 'bg-[#151C24]',
          )}
        >
          {(usageData?.filters.range.options || []).map(option => {
            // Keep "Last hour" always, remove "Last " prefix from others for compact display
            const isLastHour = option.label.toLowerCase() === 'last hour';
            const compactLabel = isLastHour ? option.label : option.label.replace(/^Last\s+/i, '');
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleFilterChange('range', option.value)}
                title={option.label}
                className={cn(
                  'flex-1 min-w-0 px-2 py-1 text-xs font-medium rounded-md transition-colors',
                  filters.range === option.value
                    ? isLight
                      ? 'bg-white text-gray-900'
                      : 'bg-gray-700 text-white'
                    : isLight
                    ? 'text-gray-600 hover:text-gray-900'
                    : 'text-gray-400 hover:text-gray-200',
                )}
              >
                <span className="hidden sm:inline whitespace-nowrap overflow-hidden text-ellipsis">
                  {option.label}
                </span>
                <span className="inline sm:hidden whitespace-nowrap overflow-hidden text-ellipsis">
                  {compactLabel}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className={cn(
            'flex items-center justify-center rounded-lg border p-2 transition-colors flex-shrink-0',
            isLight
              ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              : 'border-gray-700 bg-[#151C24] text-[#bcc1c7] hover:bg-gray-800',
          )}
          disabled={loading || refreshing}
          title="Refresh"
        >
          <svg className={cn('h-4 w-4', refreshing && 'animate-spin')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {summaryCards.map(card => (
          <SummaryCard
            key={card.label}
            isLight={isLight}
            label={card.label}
            value={card.value}
            description={card.description}
          />
        ))}
      </div>

      {/* Time Series Chart */}
      <div
        className={cn(
          'rounded-lg border transition-colors',
          isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
        )}
      >
        <div className="space-y-3">
          <div className={cn('flex items-center justify-between px-4 py-2 border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
            <h3 className={cn('text-sm font-semibold', mainTextColor)}>
              {mainChartTitle}
            </h3>
            
            {/* Chart Type Selector - Hidden for now */}
            {false && chartData.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setChartDropdownOpen(!chartDropdownOpen)}
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors',
                    isLight
                      ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      : 'bg-[#151C24] border-gray-700 text-gray-300 hover:bg-gray-800'
                  )}
                  title={chartTypeOptions.find(opt => opt.value === chartType)?.label}
                >
                  <span className="text-sm">{chartTypeOptions.find(opt => opt.value === chartType)?.icon}</span>
                  <svg
                    className={cn('h-2.5 w-2.5 transition-transform', chartDropdownOpen && 'rotate-180')}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {chartDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setChartDropdownOpen(false)}
                    />
                    <div
                      className={cn(
                        'absolute right-0 mt-1 w-48 rounded-md border shadow-lg z-20',
                        isLight
                          ? 'bg-white border-gray-200'
                          : 'bg-[#1F2937] border-gray-700'
                      )}
                    >
                      {chartTypeOptions.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setChartType(option.value);
                            setChartDropdownOpen(false);
                          }}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors first:rounded-t-md last:rounded-b-md',
                            chartType === option.value
                              ? isLight
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-blue-900/30 text-blue-300'
                              : isLight
                              ? 'text-gray-700 hover:bg-gray-50'
                              : 'text-gray-300 hover:bg-gray-800'
                          )}
                        >
                          <span>{option.icon}</span>
                          <span>{option.label}</span>
                          {chartType === option.value && (
                            <svg className="ml-auto h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {chartData.length > 0 && metric === 'tokens' && (
            <div className="flex items-center gap-4 px-4">
              <button
                type="button"
                onClick={() => toggleSeries('totalTokens')}
                className={cn(
                  'flex items-center gap-1.5 cursor-pointer transition-all rounded px-2 py-1 -mx-2 -my-1',
                  isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
                )}
              >
                <div
                  className={cn(
                    'h-2 w-2 transition-opacity',
                    isLight ? 'bg-gray-400' : 'bg-gray-500',
                    !visibleSeries.totalTokens && 'opacity-30'
                  )}
                />
                <span
                  className={cn(
                    'text-[10px] uppercase transition-opacity',
                    isLight ? 'text-gray-600' : 'text-gray-200',
                    !visibleSeries.totalTokens && 'opacity-30'
                  )}
                >
                  Total tokens
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleSeries('requestTokens')}
                className={cn(
                  'flex items-center gap-1.5 cursor-pointer transition-all rounded px-2 py-1 -mx-2 -my-1',
                  isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
                )}
              >
                <div
                  className={cn(
                    'h-2 w-2 transition-opacity',
                    isLight ? 'bg-blue-500' : 'bg-blue-400',
                    !visibleSeries.requestTokens && 'opacity-30'
                  )}
                />
                <span
                  className={cn(
                    'text-[10px] uppercase transition-opacity',
                    isLight ? 'text-gray-600' : 'text-gray-200',
                    !visibleSeries.requestTokens && 'opacity-30'
                  )}
                >
                  Request tokens
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleSeries('responseTokens')}
                className={cn(
                  'flex items-center gap-1.5 cursor-pointer transition-all rounded px-2 py-1 -mx-2 -my-1',
                  isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-800'
                )}
              >
                <div
                  className={cn(
                    'h-2 w-2 transition-opacity',
                    isLight ? 'bg-green-500' : 'bg-green-400',
                    !visibleSeries.responseTokens && 'opacity-30'
                  )}
                />
                <span
                  className={cn(
                    'text-[10px] uppercase transition-opacity',
                    isLight ? 'text-gray-600' : 'text-gray-200',
                    !visibleSeries.responseTokens && 'opacity-30'
                  )}
                >
                  Response tokens
                </span>
              </button>
            </div>
          )}
          {chartData.length > 0 && metric !== 'tokens' && (
            <div className="flex items-center gap-4 px-4">
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded px-2 py-1 text-[10px] uppercase',
                  isLight ? 'text-gray-600' : 'text-gray-200',
                )}
              >
                <div
                  className="h-2 w-2"
                  style={{ backgroundColor: mainMetricColor }}
                />
                <span>{mainMetricLabel}</span>
              </div>
            </div>
          )}
        </div>
        <div className="h-64 w-full py-3">
          {loading && !usageData ? (
            <div className="flex h-full items-center justify-center">
              <div className="animate-pulse text-xs text-gray-500">Loading chart...</div>
            </div>
          ) : chartData.length === 0 ? (
            <div className={cn('flex h-full items-center justify-center text-sm', isLight ? 'text-gray-500' : 'text-gray-400')}>
              No data available
            </div>
          ) : metric !== 'tokens' ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id={mainMetricGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={mainMetricColor} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={mainMetricColor} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isLight ? '#E5E7EB' : '#1F2937'}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                  height={30}
                />
                <YAxis
                  tickFormatter={value => compactNumberFormatter(value as number)}
                  tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: isLight ? '#CBD5E1' : '#4B5563' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const value = Number(payload[0].value) || 0;
                      const suffix = metric === 'requests' ? 'requests' : 'sessions';
                      return (
                        <div
                          className={cn(
                            'rounded-lg border shadow-lg overflow-hidden',
                            isLight ? 'bg-white border-gray-200' : 'bg-[#1F2937] border-gray-700',
                          )}
                        >
                          <p className={cn('text-xs font-medium px-3 pt-2 pb-2 border-b', isLight ? 'text-gray-900 border-gray-200' : 'text-gray-100 border-gray-700')}>
                            {label}
                          </p>
                          <div className="px-3 py-2">
                            <div className="flex items-center justify-between gap-4 py-0.5">
                              <div className="flex items-center gap-1.5">
                                <div className="h-2 w-2" style={{ backgroundColor: mainMetricColor }} />
                                <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                  {metric === 'requests' ? 'Requests' : 'Active sessions'}
                                </span>
                              </div>
                              <span className={cn('text-xs font-medium', mainTextColor)}>
                                {`${numberFormatter.format(value)} ${suffix}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="step"
                  dataKey={mainMetricKey}
                  stroke={mainMetricColor}
                  strokeWidth={2}
                  fill={`url(#${mainMetricGradientId})`}
                  dot={false}
                  name={mainMetricLabel}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {(() => {
                const commonProps = {
                  data: chartData,
                  margin: { top: 5, right: 30, left: 0, bottom: 5 },
                };

                const commonChildren = (
                  <>
                    <defs>
                      <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isLight ? chartColors.total.light : chartColors.total.dark} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={isLight ? chartColors.total.light : chartColors.total.dark} stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="requestGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isLight ? chartColors.request.light : chartColors.request.dark} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={isLight ? chartColors.request.light : chartColors.request.dark} stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="responseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isLight ? chartColors.response.light : chartColors.response.dark} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={isLight ? chartColors.response.light : chartColors.response.dark} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={isLight ? '#E5E7EB' : '#1F2937'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
                      tickLine={false}
                      axisLine={false}
                      height={30}
                    />
                    <YAxis
                      tickFormatter={value => compactNumberFormatter(value as number)}
                      tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3', stroke: isLight ? '#CBD5E1' : '#4B5563' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div
                              className={cn(
                                'rounded-lg border shadow-lg overflow-hidden',
                                isLight ? 'bg-white border-gray-200' : 'bg-[#1F2937] border-gray-700',
                              )}
                            >
                              <p className={cn('text-xs font-medium px-3 pt-2 pb-2 border-b', isLight ? 'text-gray-900 border-gray-200' : 'text-gray-100 border-gray-700')}>
                                {label}
                              </p>
                              <div className="px-3 py-2">
                                {payload.map((entry: any, index: number) => (
                                  <div key={index} className="flex items-center justify-between gap-4 py-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <div
                                      className="h-2 w-2"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    <span className={cn('text-xs', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                      {entry.name === 'totalTokens' ? 'Total tokens' :
                                       entry.name === 'requestTokens' ? 'Request tokens' :
                                       entry.name === 'responseTokens' ? 'Response tokens' : entry.name}
                                    </span>
                                  </div>
                                  <span className={cn('text-xs font-medium', mainTextColor)}>
                                    {numberFormatter.format(entry.value as number)}
                                  </span>
                                </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </>
                );

                // Render different chart types
                if (chartType === 'line') {
                  return (
                    <LineChart {...commonProps}>
                      {commonChildren}
                      {visibleSeries.totalTokens && (
                        <Line
                          type="monotone"
                          dataKey="totalTokens"
                          stroke={isLight ? chartColors.total.light : chartColors.total.dark}
                          strokeWidth={2}
                          dot={false}
                          name="totalTokens"
                        />
                      )}
                      {visibleSeries.requestTokens && (
                        <Line
                          type="monotone"
                          dataKey="requestTokens"
                          stroke={isLight ? chartColors.request.light : chartColors.request.dark}
                          strokeWidth={1.4}
                          dot={false}
                          name="requestTokens"
                        />
                      )}
                      {visibleSeries.responseTokens && (
                        <Line
                          type="monotone"
                          dataKey="responseTokens"
                          stroke={isLight ? chartColors.response.light : chartColors.response.dark}
                          strokeWidth={1.4}
                          dot={false}
                          name="responseTokens"
                        />
                      )}
                    </LineChart>
                  );
                }

                if (chartType === 'bar' || chartType === 'stacked-bar') {
                  return (
                    <BarChart {...commonProps}>
                      {commonChildren}
                      {visibleSeries.totalTokens && (
                        <Bar
                          dataKey="totalTokens"
                          fill={isLight ? chartColors.total.light : chartColors.total.dark}
                          name="totalTokens"
                          stackId={chartType === 'stacked-bar' ? 'stack' : undefined}
                        />
                      )}
                      {visibleSeries.requestTokens && (
                        <Bar
                          dataKey="requestTokens"
                          fill={isLight ? chartColors.request.light : chartColors.request.dark}
                          name="requestTokens"
                          stackId={chartType === 'stacked-bar' ? 'stack' : undefined}
                        />
                      )}
                      {visibleSeries.responseTokens && (
                        <Bar
                          dataKey="responseTokens"
                          fill={isLight ? chartColors.response.light : chartColors.response.dark}
                          name="responseTokens"
                          stackId={chartType === 'stacked-bar' ? 'stack' : undefined}
                        />
                      )}
                    </BarChart>
                  );
                }

                if (chartType === 'step-line') {
                  return (
                    <LineChart {...commonProps}>
                      {commonChildren}
                      {visibleSeries.totalTokens && (
                        <Line
                          type="step"
                          dataKey="totalTokens"
                          stroke={isLight ? chartColors.total.light : chartColors.total.dark}
                          strokeWidth={2}
                          dot={false}
                          name="totalTokens"
                        />
                      )}
                      {visibleSeries.requestTokens && (
                        <Line
                          type="step"
                          dataKey="requestTokens"
                          stroke={isLight ? chartColors.request.light : chartColors.request.dark}
                          strokeWidth={1.4}
                          dot={false}
                          name="requestTokens"
                        />
                      )}
                      {visibleSeries.responseTokens && (
                        <Line
                          type="step"
                          dataKey="responseTokens"
                          stroke={isLight ? chartColors.response.light : chartColors.response.dark}
                          strokeWidth={1.4}
                          dot={false}
                          name="responseTokens"
                        />
                      )}
                    </LineChart>
                  );
                }

                if (chartType === 'area-spline') {
                  return (
                    <AreaChart {...commonProps}>
                      {commonChildren}
                      {visibleSeries.totalTokens && (
                        <Area
                          type="natural"
                          dataKey="totalTokens"
                          stroke={isLight ? chartColors.total.light : chartColors.total.dark}
                          strokeWidth={2}
                          fill="url(#totalGradient)"
                          dot={false}
                          name="totalTokens"
                        />
                      )}
                      {visibleSeries.requestTokens && (
                        <Area
                          type="natural"
                          dataKey="requestTokens"
                          stroke={isLight ? chartColors.request.light : chartColors.request.dark}
                          strokeWidth={1.4}
                          fill="url(#requestGradient)"
                          dot={false}
                          name="requestTokens"
                        />
                      )}
                      {visibleSeries.responseTokens && (
                        <Area
                          type="natural"
                          dataKey="responseTokens"
                          stroke={isLight ? chartColors.response.light : chartColors.response.dark}
                          strokeWidth={1.4}
                          fill="url(#responseGradient)"
                          dot={false}
                          name="responseTokens"
                        />
                      )}
                    </AreaChart>
                  );
                }

                if (chartType === 'line-dots') {
                  return (
                    <LineChart {...commonProps}>
                      {commonChildren}
                      {visibleSeries.totalTokens && (
                        <Line
                          type="monotone"
                          dataKey="totalTokens"
                          stroke={isLight ? chartColors.total.light : chartColors.total.dark}
                          strokeWidth={2}
                          dot={{ fill: isLight ? chartColors.total.light : chartColors.total.dark, r: 3 }}
                          name="totalTokens"
                        />
                      )}
                      {visibleSeries.requestTokens && (
                        <Line
                          type="monotone"
                          dataKey="requestTokens"
                          stroke={isLight ? chartColors.request.light : chartColors.request.dark}
                          strokeWidth={1.4}
                          dot={{ fill: isLight ? chartColors.request.light : chartColors.request.dark, r: 3 }}
                          name="requestTokens"
                        />
                      )}
                      {visibleSeries.responseTokens && (
                        <Line
                          type="monotone"
                          dataKey="responseTokens"
                          stroke={isLight ? chartColors.response.light : chartColors.response.dark}
                          strokeWidth={1.4}
                          dot={{ fill: isLight ? chartColors.response.light : chartColors.response.dark, r: 3 }}
                          name="responseTokens"
                        />
                      )}
                    </LineChart>
                  );
                }

                if (chartType === 'area-step') {
                  return (
                    <AreaChart {...commonProps}>
                      {commonChildren}
                      {visibleSeries.totalTokens && (
                        <Area
                          type="step"
                          dataKey="totalTokens"
                          stroke={isLight ? chartColors.total.light : chartColors.total.dark}
                          strokeWidth={2}
                          fill="url(#totalGradient)"
                          dot={false}
                          name="totalTokens"
                        />
                      )}
                      {visibleSeries.requestTokens && (
                        <Area
                          type="step"
                          dataKey="requestTokens"
                          stroke={isLight ? chartColors.request.light : chartColors.request.dark}
                          strokeWidth={1.4}
                          fill="url(#requestGradient)"
                          dot={false}
                          name="requestTokens"
                        />
                      )}
                      {visibleSeries.responseTokens && (
                        <Area
                          type="step"
                          dataKey="responseTokens"
                          stroke={isLight ? chartColors.response.light : chartColors.response.dark}
                          strokeWidth={1.4}
                          fill="url(#responseGradient)"
                          dot={false}
                          name="responseTokens"
                        />
                      )}
                    </AreaChart>
                  );
                }

                if (chartType === 'stacked-area') {
                  return (
                    <AreaChart {...commonProps}>
                      {commonChildren}
                      {visibleSeries.responseTokens && (
                        <Area
                          type="monotone"
                          dataKey="responseTokens"
                          stackId="1"
                          stroke={isLight ? chartColors.response.light : chartColors.response.dark}
                          strokeWidth={1.4}
                          fill="url(#responseGradient)"
                          dot={false}
                          name="responseTokens"
                        />
                      )}
                      {visibleSeries.requestTokens && (
                        <Area
                          type="monotone"
                          dataKey="requestTokens"
                          stackId="1"
                          stroke={isLight ? chartColors.request.light : chartColors.request.dark}
                          strokeWidth={1.4}
                          fill="url(#requestGradient)"
                          dot={false}
                          name="requestTokens"
                        />
                      )}
                      {visibleSeries.totalTokens && (
                        <Area
                          type="monotone"
                          dataKey="totalTokens"
                          stackId="1"
                          stroke={isLight ? chartColors.total.light : chartColors.total.dark}
                          strokeWidth={2}
                          fill="url(#totalGradient)"
                          dot={false}
                          name="totalTokens"
                        />
                      )}
                    </AreaChart>
                  );
                }

                // Default: regular area chart
                return (
                  <AreaChart {...commonProps}>
                    {commonChildren}
                    {visibleSeries.totalTokens && (
                      <Area
                        type="monotone"
                        dataKey="totalTokens"
                        stroke={isLight ? chartColors.total.light : chartColors.total.dark}
                        strokeWidth={2}
                        fill="url(#totalGradient)"
                        dot={false}
                        name="totalTokens"
                      />
                    )}
                    {visibleSeries.requestTokens && (
                      <Area
                        type="monotone"
                        dataKey="requestTokens"
                        stroke={isLight ? chartColors.request.light : chartColors.request.dark}
                        strokeWidth={1.4}
                        fill="url(#requestGradient)"
                        dot={false}
                        name="requestTokens"
                      />
                    )}
                    {visibleSeries.responseTokens && (
                      <Area
                        type="monotone"
                        dataKey="responseTokens"
                        stroke={isLight ? chartColors.response.light : chartColors.response.dark}
                        strokeWidth={1.4}
                        fill="url(#responseGradient)"
                        dot={false}
                        name="responseTokens"
                      />
                    )}
                  </AreaChart>
                );
              })()}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Breakdown Cards */}
      <div className="grid gap-3 lg:grid-cols-2">
        {modelsTimeseries.length > 0 ? (
          <TimeseriesCard
            isLight={isLight}
            title="Top Models"
            rangeKey={usageData?.filters.range.selected ?? DEFAULT_FILTERS.range}
            series={modelsTimeseries}
            metric={metric}
          />
        ) : (
          <BreakdownCard isLight={isLight} title="Top Models" data={modelsBreakdown} metric={metric} />
        )}

        {agentsTimeseries.length > 0 ? (
          <TimeseriesCard
            isLight={isLight}
            title="Top Agents"
            rangeKey={usageData?.filters.range.selected ?? DEFAULT_FILTERS.range}
            series={agentsTimeseries}
            metric={metric}
          />
        ) : (
          <BreakdownCard isLight={isLight} title="Top Agents" data={agentsBreakdown} metric={metric} />
        )}

        {teamsTimeseries.length > 0 ? (
          <TimeseriesCard
            isLight={isLight}
            title="Teams"
            rangeKey={usageData?.filters.range.selected ?? DEFAULT_FILTERS.range}
            series={teamsTimeseries}
            metric={metric}
          />
        ) : (
          <BreakdownCard isLight={isLight} title="Teams" data={teamsBreakdown} metric={metric} />
        )}

        {usersTimeseries.length > 0 ? (
          <TimeseriesCard
            isLight={isLight}
            title="Users"
            rangeKey={usageData?.filters.range.selected ?? DEFAULT_FILTERS.range}
            series={usersTimeseries}
            metric={metric}
          />
        ) : (
          <BreakdownCard isLight={isLight} title="Users" data={usersBreakdown} metric={metric} />
        )}
      </div>

      {/* Recent Usage Activity */}
      <div
        className={cn(
          'overflow-hidden rounded-lg border transition-colors',
          isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
        )}
      >
        <div className={cn('flex items-center justify-between border-b px-4 py-2', isLight ? 'border-gray-200' : 'border-gray-700')}>
          <h3 className={cn('text-sm font-semibold', mainTextColor)}>
            Usage Activity
          </h3>
          {usageData?.recent.pagination && (
            <div className="flex items-center gap-3">
              <span className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                {usageData.recent.pagination.total === 0
                  ? 'No activities'
                  : `${((usageData.recent.pagination.page - 1) * usageData.recent.pagination.limit) + 1}-${Math.min(
                      usageData.recent.pagination.page * usageData.recent.pagination.limit,
                      usageData.recent.pagination.total,
                    )} of ${numberFormatter.format(usageData.recent.pagination.total)}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const newPage = currentPage - 1;
                    setCurrentPage(newPage);
                    fetchUsage(filters, newPage);
                  }}
                  disabled={currentPage === 1}
                  className={cn(
                    'rounded p-1 transition-colors',
                    currentPage === 1
                      ? 'cursor-not-allowed opacity-40'
                      : isLight
                      ? 'hover:bg-gray-100 text-gray-600'
                      : 'hover:bg-gray-700 text-gray-200',
                  )}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className={cn('text-xs px-2', isLight ? 'text-gray-700' : 'text-gray-300')}>
                  {currentPage} / {usageData.recent.pagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const newPage = currentPage + 1;
                    setCurrentPage(newPage);
                    fetchUsage(filters, newPage);
                  }}
                  disabled={currentPage >= usageData.recent.pagination.totalPages}
                  className={cn(
                    'rounded p-1 transition-colors',
                    currentPage >= usageData.recent.pagination.totalPages
                      ? 'cursor-not-allowed opacity-40'
                      : isLight
                      ? 'hover:bg-gray-100 text-gray-600'
                      : 'hover:bg-gray-700 text-gray-200',
                  )}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
        <div
          className="max-h-80 w-full overflow-auto recent-sessions-scroll"
          style={{ '--table-scroll-bg': isLight ? '#FFFFFF' : '#151C24' } as React.CSSProperties}
        >
          <table
            className={cn(
              'min-w-full w-full border-collapse divide-y text-xs',
              isLight ? 'divide-gray-200' : 'divide-gray-700',
            )}
          >
            <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}>
              <tr>
                <th
                  className={cn(
                    'px-3 py-2 text-left text-xs font-semibold',
                    isLight ? 'text-gray-600' : 'text-gray-300',
                  )}
                >
                  Date & Time
                </th>
                <th
                  className={cn(
                    'px-3 py-2 text-left text-xs font-semibold',
                    isLight ? 'text-gray-600' : 'text-gray-300',
                  )}
                >
                  Agent
                </th>
                <th
                  className={cn(
                    'px-3 py-2 text-left text-xs font-semibold',
                    isLight ? 'text-gray-600' : 'text-gray-300',
                  )}
                >
                  Model
                </th>
                <th
                  className={cn(
                    'px-3 py-2 text-left text-xs font-semibold',
                    isLight ? 'text-gray-600' : 'text-gray-300',
                  )}
                >
                  User
                </th>
                {(metric === 'requests' || metric === 'sessions') && (
                  <th
                    className={cn(
                      'px-3 py-2 text-left text-xs font-semibold',
                      isLight ? 'text-gray-600' : 'text-gray-300',
                    )}
                  >
                    Session
                  </th>
                )}
                {metric === 'tokens' ? (
                  <>
                    <th
                      className={cn(
                        'px-3 py-2 text-right text-xs font-semibold',
                        isLight ? 'text-gray-600' : 'text-gray-300',
                      )}
                    >
                      Request
                    </th>
                    <th
                      className={cn(
                        'px-3 py-2 text-right text-xs font-semibold',
                        isLight ? 'text-gray-600' : 'text-gray-300',
                      )}
                    >
                      Response
                    </th>
                    <th
                      className={cn(
                        'px-3 py-2 text-right text-xs font-semibold',
                        isLight ? 'text-gray-600' : 'text-gray-300',
                      )}
                    >
                      Total
                    </th>
                  </>
                ) : (
                  <>
                    <th
                      className={cn(
                        'px-3 py-2 text-right text-xs font-semibold',
                        isLight ? 'text-gray-600' : 'text-gray-300',
                      )}
                    >
                      {metric === 'requests' ? 'Requests' : 'Requests'}
                    </th>
                    <th
                      className={cn(
                        'px-3 py-2 text-right text-xs font-semibold',
                        isLight ? 'text-gray-600' : 'text-gray-300',
                      )}
                    >
                      Tokens
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className={cn('divide-y', isLight ? 'divide-gray-100' : 'divide-gray-700')}>
              {metric === 'tokens' &&
                usageData?.recent.data.map(row => (
                  <tr
                    key={row.id}
                    className={cn(
                      'transition-colors',
                      isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-900/40',
                    )}
                  >
                    <td className={cn('px-3 py-2 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {new Date(row.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[150px]', mainTextColor)}>
                      {row.agent}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[150px]', mainTextColor)}>
                      {row.model}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[150px]', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {row.user}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {numberFormatter.format(row.requestTokens || 0)}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {numberFormatter.format(row.responseTokens || 0)}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-medium', mainTextColor)}>
                      {numberFormatter.format(row.totalTokens)}
                    </td>
                  </tr>
                ))}

              {metric === 'requests' &&
                activityData.map(row => (
                  <tr
                    key={row.id}
                    className={cn(
                      'transition-colors',
                      isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-900/40',
                    )}
                  >
                    <td className={cn('px-3 py-2 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {new Date(row.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[150px]', mainTextColor)}>
                      {row.agent || '—'}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[150px]', mainTextColor)}>
                      {row.model || '—'}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[150px]', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {row.user || '—'}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[160px]', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {row.sessionId || '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-medium', mainTextColor)}>
                      {numberFormatter.format(row.requestCount || 1)}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {numberFormatter.format(row.totalTokens)}
                    </td>
                  </tr>
                ))}

              {metric === 'sessions' &&
                activityData.map(row => (
                  <tr
                    key={row.id}
                    className={cn(
                      'transition-colors',
                      isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-900/40',
                    )}
                  >
                    <td className={cn('px-3 py-2 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {new Date(row.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[150px]', mainTextColor)}>
                      {row.agent || '—'}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[150px]', mainTextColor)}>
                      {row.model || '—'}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[150px]', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {row.user || '—'}
                    </td>
                    <td className={cn('px-3 py-2 truncate max-w-[160px]', isLight ? 'text-gray-600' : 'text-gray-400')}>
                      {row.sessionId || '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-medium', mainTextColor)}>
                      {numberFormatter.format(row.requestCount || 1)}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', isLight ? 'text-gray-700' : 'text-gray-300')}>
                      {numberFormatter.format(row.totalTokens)}
                    </td>
                  </tr>
                ))}

              {(!usageData?.recent || usageData.recent.data.length === 0) && (
                <tr>
                  <td
                    colSpan={7}
                    className={cn(
                      'px-3 py-8 text-center text-xs',
                      isLight ? 'text-gray-500' : 'text-gray-400',
                    )}
                  >
                    No recent activity
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
