import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@extension/ui';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { OrganizationSelector } from './OrganizationSelector';
import { TeamSelector } from './TeamSelector';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  team_id?: string | null;
}

interface ModelOption {
  id: string;
  name: string;
  code?: string;
  provider?: string;
  team_id?: string | null;
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
  totalCost: number;
  avgTokens: number;
}

interface TimeseriesPoint {
  bucket: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  callCount: number;
}

interface BreakdownItem {
  id: string;
  label: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  count: number;
}

interface RecentUsageRow {
  id: string;
  sessionId: string;
  createdAt: string;
  agent: string;
  model: string;
  team: string;
  user: string;
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
  cost: number | null;
  status: string;
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
  recent: RecentUsageRow[];
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

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const tooltipFormatter = (value: number) => `${numberFormatter.format(Math.max(value, 0))} tokens`;

const chartColors = {
  total: { light: '#6366F1', dark: '#818CF8' },
  request: { light: '#22C55E', dark: '#34D399' },
  response: { light: '#F97316', dark: '#FB923C' },
  bar: { light: '#0EA5E9', dark: '#38BDF8' },
};

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
    <path d="M20 8v6M23 11h-6" />
  </svg>
);

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
          {users.map(user => {
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
          })}
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
          {agents.map(agent => {
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
          })}
        </div>
      )}
    </div>
  );
};

// Model Multi-Selector Component
interface ModelMultiSelectorProps {
  isLight: boolean;
  models: ModelOption[];
  selectedModelIds: string[];
  onChange: (modelIds: string[]) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}

const ModelMultiSelector: React.FC<ModelMultiSelectorProps> = ({
  isLight,
  models,
  selectedModelIds,
  onChange,
  placeholder = 'All models',
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

  const toggleModel = (modelId: string) => {
    const newSelection = selectedModelIds.includes(modelId)
      ? selectedModelIds.filter(id => id !== modelId)
      : [...selectedModelIds, modelId];
    onChange(newSelection);
  };

  const removeModel = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedModelIds.filter(id => id !== modelId);
    onChange(newSelection);
  };

  const selectedModels = models.filter(model => selectedModelIds.includes(model.id));

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
          <ModelIcon />
        </span>
        
        {selectedModels.length > 0 ? (
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedModels.map(model => (
              <span
                key={model.id}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                  isLight
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-900/30 text-blue-400'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {model.name}
                <button
                  type="button"
                  onClick={(e) => removeModel(model.id, e)}
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
          {models.map(model => {
            const isSelected = selectedModelIds.includes(model.id);
            return (
              <button
                type="button"
                key={model.id}
                onClick={() => toggleModel(model.id)}
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
                <ModelIcon />
                <span className="truncate flex-1 text-left">{model.name}</span>
              </button>
            );
          })}
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
}> = ({ isLight, label, value, description }) => (
  <div
    className={cn(
      'rounded-lg border px-3 py-2.5 shadow-sm transition-colors',
      isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
    )}
  >
    <div className={cn('text-xs font-medium', isLight ? 'text-gray-500' : 'text-gray-400')}>
      {label}
    </div>
    <div className={cn('mt-1 text-xl font-bold', isLight ? 'text-gray-900' : 'text-gray-100')}>
      {value}
    </div>
    <div className={cn('mt-0.5 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
      {description}
    </div>
  </div>
);

const BreakdownCard: React.FC<{
  isLight: boolean;
  title: string;
  data: BreakdownItem[];
}> = ({ isLight, title, data }) => (
  <div
    className={cn(
      'rounded-lg border shadow-sm transition-colors overflow-hidden',
      isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
    )}
  >
    <div className={cn('px-4 py-2 border-b', isLight ? 'border-gray-200' : 'border-gray-700')}>
      <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
        {title}
      </h3>
    </div>
    <div className="h-64 w-full px-2 py-3">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-gray-500">
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="horizontal" margin={{ left: 8, right: 8 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isLight ? '#E5E7EB' : '#1F2937'}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
              tickFormatter={value => numberFormatter.format(value as number)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 10, fill: isLight ? '#6B7280' : '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <Tooltip
              cursor={{ fill: isLight ? '#F3F4F6' : '#1F2937' }}
              contentStyle={{
                backgroundColor: isLight ? '#FFFFFF' : '#0B1320',
                borderRadius: '0.5rem',
                border: `1px solid ${isLight ? '#E5E7EB' : '#1F2937'}`,
                fontSize: '11px',
              }}
              formatter={(value: number) => [`${numberFormatter.format(value)} tokens`, 'Total']}
            />
            <Bar
              dataKey="totalTokens"
              fill={isLight ? chartColors.bar.light : chartColors.bar.dark}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

export const UsageTab: React.FC<UsageTabProps> = ({ isLight, organizations, preselectedOrgId, onError, onSuccess }) => {
  const [usageData, setUsageData] = useState<UsageResponse | null>(null);
  const [filters, setFilters] = useState<UsageFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState(preselectedOrgId || '');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

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

  // Load teams when organization changes
  useEffect(() => {
    if (selectedOrgId) {
      loadTeams(selectedOrgId);
    } else {
      setTeams([]);
    }
  }, [selectedOrgId]);

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
    async (overrideFilters?: UsageFilters) => {
      const effectiveFilters = overrideFilters ?? filters;
      const params = new URLSearchParams();
      params.set('range', effectiveFilters.range || '24h');
      // For now, we'll just use the first item if multiple are selected
      // Backend currently supports single item filters
      if (effectiveFilters.teamIds.length > 0) {
        params.set('teamId', effectiveFilters.teamIds[0]);
      }
      if (effectiveFilters.userIds.length > 0) {
        params.set('userId', effectiveFilters.userIds[0]);
      }
      if (effectiveFilters.agentIds.length > 0) {
        params.set('agentId', effectiveFilters.agentIds[0]);
      }
      if (effectiveFilters.modelIds.length > 0) {
        params.set('modelId', effectiveFilters.modelIds[0]);
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
    [filters, onError],
  );

  useEffect(() => {
    if (selectedOrgId) {
      fetchUsage();
    }
  }, [selectedOrgId]);

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
      const date = new Date(point.bucket);
      const rangeKey = usageData.filters.range.selected;
      let label: string;

      if (Number.isNaN(date.getTime())) {
        label = point.bucket;
      } else if (rangeKey === '1h') {
        label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (rangeKey === '24h') {
        label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (rangeKey === '7d' || rangeKey === '30d') {
        label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else {
        label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }

      return {
        ...point,
        label,
      };
    });
  }, [usageData]);

  const breakdownCards = useMemo(() => {
    if (!usageData) return [];
    return [
      { key: 'models', title: 'Top Models', data: usageData.breakdowns.models },
      { key: 'agents', title: 'Top Agents', data: usageData.breakdowns.agents },
      { key: 'teams', title: 'Teams', data: usageData.breakdowns.teams },
      { key: 'users', title: 'Users', data: usageData.breakdowns.users },
    ];
  }, [usageData]);

  const summary = usageData?.summary;

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
            teams={teams}
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

      {/* User Selector */}
      <div className="mb-4">
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

      {/* Usage Monitoring Header */}
      <div
        className={cn(
          'rounded-lg border px-3 py-2 shadow-sm transition-colors',
          isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#151C24] border-gray-700',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className={cn('text-xs uppercase tracking-wide font-semibold', isLight ? 'text-gray-500' : 'text-gray-400')}>
              Usage Monitoring
            </div>
            <div className={cn('text-sm font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
              {usageData ? `${rangeDescriptor} · ${scopeLabel}` : 'Loading usage scope...'}
            </div>
            <div className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
              {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Awaiting data'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className={cn(
                'flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                isLight
                  ? 'border-gray-200 text-gray-600 hover:bg-white hover:text-gray-900'
                  : 'border-gray-700 text-gray-300 hover:bg-gray-700/70 hover:text-white',
              )}
              disabled={loading || refreshing}
            >
              <svg className={cn('h-4 w-4', refreshing && 'animate-spin')} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v4h4M16 16v-4h-4M5.636 5.636a7 7 0 019.9 0l.707.707M14.364 14.364a7 7 0 01-9.9 0l-.707-.707" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-medium">
            <span className={cn(isLight ? 'text-gray-600' : 'text-gray-300')}>Range</span>
            <select
              value={filters.range}
              onChange={event => handleFilterChange('range', event.target.value)}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-xs transition-colors focus:outline-none font-medium',
                isLight
                  ? 'border-gray-300 bg-white text-gray-800 focus:border-blue-500'
                  : 'border-gray-700 bg-[#0D1117] text-gray-200 focus:border-blue-400',
              )}
            >
              {(usageData?.filters.range.options || []).map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          isLight={isLight}
          label="Total tokens"
          value={summary ? numberFormatter.format(summary.totalTokens) : '—'}
          description="Request + response"
        />
        <SummaryCard
          isLight={isLight}
          label="Request tokens"
          value={summary ? numberFormatter.format(summary.requestTokens) : '—'}
          description="Prompt usage"
        />
        <SummaryCard
          isLight={isLight}
          label="Response tokens"
          value={summary ? numberFormatter.format(summary.responseTokens) : '—'}
          description="Completion usage"
        />
        <SummaryCard
          isLight={isLight}
          label="Avg tokens / call"
          value={summary ? decimalFormatter.format(summary.avgTokens || 0) : '—'}
          description={
            summary
              ? `${numberFormatter.format(summary.callCount)} total calls`
              : 'Call volume'
          }
        />
      </div>

      {/* Time Series Chart */}
      <div
        className={cn(
          'rounded-lg border shadow-sm transition-colors',
          isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
            Token usage over time
          </h3>
          <span className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            Stack shows request vs response tokens
          </span>
        </div>
        <div className="h-64 w-full px-2 py-3">
          {loading && !usageData ? (
            <div className="flex h-full items-center justify-center">
              <div className="animate-pulse text-xs text-gray-500">Loading chart...</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
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
                  tick={{ fontSize: 11, fill: isLight ? '#4B5563' : '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={value => numberFormatter.format(value as number)}
                  tick={{ fontSize: 11, fill: isLight ? '#4B5563' : '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: isLight ? '#CBD5F5' : '#4B5563' }}
                  contentStyle={{
                    backgroundColor: isLight ? '#FFFFFF' : '#0B1320',
                    borderRadius: '0.5rem',
                    border: `1px solid ${isLight ? '#E5E7EB' : '#1F2937'}`,
                    boxShadow: isLight
                      ? '0 4px 16px rgba(15, 23, 42, 0.08)'
                      : '0 6px 18px rgba(15, 23, 42, 0.4)',
                  }}
                  formatter={(value, name) => {
                    if (typeof value !== 'number') return ['0 tokens', name];
                    if (name === 'totalTokens') return [tooltipFormatter(value), 'Total'];
                    if (name === 'requestTokens') return [tooltipFormatter(value), 'Request'];
                    if (name === 'responseTokens') return [tooltipFormatter(value), 'Response'];
                    if (name === 'callCount') {
                      return [`${numberFormatter.format(value)} calls`, 'Calls'];
                    }
                    return [tooltipFormatter(value), name];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="totalTokens"
                  stroke={isLight ? chartColors.total.light : chartColors.total.dark}
                  strokeWidth={2}
                  fill="url(#totalGradient)"
                  dot={false}
                  name="total"
                />
                <Area
                  type="monotone"
                  dataKey="requestTokens"
                  stroke={isLight ? chartColors.request.light : chartColors.request.dark}
                  strokeWidth={1.4}
                  fill="url(#requestGradient)"
                  dot={false}
                  name="request"
                />
                <Area
                  type="monotone"
                  dataKey="responseTokens"
                  stroke={isLight ? chartColors.response.light : chartColors.response.dark}
                  strokeWidth={1.4}
                  fill="url(#responseGradient)"
                  dot={false}
                  name="response"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Breakdown Cards */}
      <div className="grid gap-3 lg:grid-cols-2">
        {breakdownCards.map(card => (
          <BreakdownCard
            key={card.key}
            isLight={isLight}
            title={card.title}
            data={card.data}
          />
        ))}
      </div>

      {/* Recent Usage Activity */}
      <div
        className={cn(
          'overflow-hidden rounded-lg border shadow-sm transition-colors',
          isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700',
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h3 className={cn('text-sm font-semibold', isLight ? 'text-gray-900' : 'text-gray-100')}>
            Recent usage activity
          </h3>
          <span className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
            Showing last 25 runs
          </span>
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#1A2332]')}>
              <tr>
                <th
                  className={cn(
                    'px-3 py-2 text-left text-xs font-semibold',
                    isLight ? 'text-gray-600' : 'text-gray-300',
                  )}
                >
                  Time
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
              </tr>
            </thead>
            <tbody className={cn('divide-y', isLight ? 'divide-gray-100' : 'divide-gray-800')}>
              {usageData?.recent.map(row => (
                <tr
                  key={row.id}
                  className={cn(
                    'transition-colors',
                    isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-900/40',
                  )}
                >
                  <td className={cn('px-3 py-2 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                    {new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className={cn('px-3 py-2 truncate max-w-[150px]', isLight ? 'text-gray-900' : 'text-gray-100')}>
                    {row.agent}
                  </td>
                  <td className={cn('px-3 py-2 truncate max-w-[150px]', isLight ? 'text-gray-900' : 'text-gray-100')}>
                    {row.model}
                  </td>
                  <td className={cn('px-3 py-2 truncate max-w-[150px]', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    {row.user}
                  </td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    {numberFormatter.format(row.requestTokens)}
                  </td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', isLight ? 'text-gray-700' : 'text-gray-300')}>
                    {numberFormatter.format(row.responseTokens)}
                  </td>
                  <td className={cn('px-3 py-2 text-right tabular-nums font-medium', isLight ? 'text-gray-900' : 'text-gray-100')}>
                    {numberFormatter.format(row.totalTokens)}
                  </td>
                </tr>
              ))}
              {(!usageData?.recent || usageData.recent.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-gray-500">
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
