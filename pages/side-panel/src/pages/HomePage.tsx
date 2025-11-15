import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@extension/ui';
import { useStorage, useSessionStorageDB, sessionStorageDBWrapper } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import UserMenu from '../components/UserMenu';
import InfoMenu from '../components/InfoMenu';
import FeedbackModal from '../components/FeedbackModal';
import SupportRequestModal, { type SupportRequestData } from '../components/SupportRequestModal';
import { useAuth } from '../context/AuthContext';
import { UsageDisplay } from '../components/UsageDisplay';
import type { CumulativeUsage } from '../hooks/useUsageStream';
import { API_CONFIG } from '../constants';
import { teamsCache } from '../components/TeamSelectorDropdown';

interface HomePageProps {
  isLight: boolean;
  onGoToSessions: () => void;
  onGoAdmin?: (tab?: 'organizations' | 'teams' | 'users' | 'providers' | 'models' | 'agents' | 'usage') => void;
}

interface UsageSnapshot {
  request: number;
  response: number;
  total: number;
  requestCount: number;
}

type ActionMessage = {
  type: 'success' | 'error';
  text: string;
};

const createEmptyUsage = (): UsageSnapshot => ({
  request: 0,
  response: 0,
  total: 0,
  requestCount: 0,
});

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) {
    return '0';
  }
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
};

const formatRelativeTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) {
    return 'just now';
  }

  const diff = Date.now() - timestamp;
  if (diff < 0) {
    return 'just now';
  }

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }
  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

const getSessionCreatedTimestamp = (sessionId: string): number => {
  // Session IDs follow the pattern "session_<timestamp>" or similar
  // Extract the timestamp from the ID
  const match = sessionId.match(/(\d{13})/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // Fallback to current time if we can't extract timestamp
  return Date.now();
};

const formatTimestamp = (timestamp: number): string => {
  if (!timestamp) {
    return '—';
  }
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const prettifyLabel = (value?: string | null): string => {
  if (!value) {
    return '—';
  }
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
};

const PRODUCTIVITY_TIPS: Array<{ title: string; description: string }> = [
  {
    title: 'Pin important workstreams',
    description: 'Use the Sessions tab to keep your priority conversations open and ready when you return.',
  },
  {
    title: 'Capture quick wins',
    description: 'Drop highlights into the Notes view after each session so your team always has the latest context.',
  },
  {
    title: 'Bring teammates in early',
    description: 'Share session transcripts or invite collaborators directly from the Admin area to avoid rework later.',
  },
];

// Simple settings button component with upward-opening dropdown
const SettingsButton: React.FC<{ isLight: boolean; theme: string; onOpenSettings: () => void }> = ({ isLight, theme, onOpenSettings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'p-1 rounded transition-colors',
          isLight
            ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
        )}
        title="Settings">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute bottom-full right-0 mb-1 w-64 rounded-md border shadow-lg z-[9999]',
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          {/* Theme Selection */}
          <div
            className={cn(
              'px-3 py-2.5 border-b',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          >
            <label
              className={cn(
                'text-xs font-medium block mb-2',
                isLight ? 'text-gray-700' : 'text-[#bcc1c7]'
              )}
            >
              Theme
            </label>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  exampleThemeStorage.setTheme('light');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                  theme === 'light'
                    ? 'bg-blue-500 text-white'
                    : isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
                title="Light theme"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Light</span>
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  exampleThemeStorage.setTheme('dark');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                  theme === 'dark'
                    ? 'bg-blue-500 text-white'
                    : isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
                title="Dark theme"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span>Dark</span>
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  exampleThemeStorage.setTheme('system');
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                  theme === 'system'
                    ? 'bg-blue-500 text-white'
                    : isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
                title="System theme"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>System</span>
              </button>
            </div>
          </div>

          {/* Divider */}
          <div
            className={cn(
              'border-t',
              isLight ? 'border-gray-200' : 'border-gray-700'
            )}
          />

          {/* More Settings Button */}
          <button
            onClick={() => {
              setIsOpen(false);
              onOpenSettings();
            }}
            className={cn(
              'w-full px-3 py-2 text-xs font-medium text-left transition-colors flex items-center gap-2',
              isLight
                ? 'text-gray-700 hover:bg-gray-100'
                : 'text-gray-200 hover:bg-gray-700/50'
            )}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span>More Settings</span>
          </button>
        </div>
      )}
    </div>
  );
};

export const HomePage: React.FC<HomePageProps> = ({ isLight, onGoToSessions, onGoAdmin }) => {
  const { theme } = useStorage(exampleThemeStorage);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const version = chrome.runtime?.getManifest?.()?.version || '1.0.0';
  const { organization, activeTeam, user } = useAuth();
  const { sessions, currentSessionId, isLoading: sessionsLoading } = useSessionStorageDB();
  const canAccessSessions = !!(organization && activeTeam);

  // Main text colors - gray-700 for light mode, gray-350 (#bcc1c7) for dark mode
  const mainTextColor = isLight ? 'text-gray-700' : 'text-[#bcc1c7]';

  const [creatingSession, setCreatingSession] = useState(false);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);
  const [usageBySession, setUsageBySession] = useState<Record<string, UsageSnapshot>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [lastMetricsRefresh, setLastMetricsRefresh] = useState<number | null>(null);
  const [activeTeamName, setActiveTeamName] = useState<string | null>(null);
  const [teamsRefreshKey, setTeamsRefreshKey] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [sessionsPage, setSessionsPage] = useState(1);
  const sessionsPerPage = 10;
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [supportRequestModalOpen, setSupportRequestModalOpen] = useState(false);
  
  // Initialize activeHomeTab from localStorage
  const [activeHomeTab, setActiveHomeTab] = useState<'sessions' | 'usage' | 'insights'>(() => {
    try {
      const stored = localStorage.getItem('homePageActiveTab');
      if (stored === 'sessions' || stored === 'usage' || stored === 'insights') {
        return stored;
      }
    } catch (error) {
      console.error('[HomePage] Failed to read tab from localStorage:', error);
    }
    return 'sessions';
  });

  // Persist activeHomeTab to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('homePageActiveTab', activeHomeTab);
    } catch (error) {
      console.error('[HomePage] Failed to save tab to localStorage:', error);
    }
  }, [activeHomeTab]);

  // Get team name - check cache and fetch if needed
  useEffect(() => {
    if (!activeTeam) {
      setActiveTeamName(null);
      return;
    }

    // Check the shared teams cache first (used by TeamSelectorDropdown)
    const currentTeam = teamsCache.teams.find((t: any) => t.id === activeTeam);
    if (currentTeam) {
      setActiveTeamName(currentTeam.name);
      return;
    }

    // If not in cache, fetch teams
    const fetchTeamName = async () => {
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/api/config/teams`, {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          const teams = data.teams || [];
          const team = teams.find((t: any) => t.id === activeTeam);
          if (team) {
            setActiveTeamName(team.name);
          } else {
            setActiveTeamName(prettifyLabel(activeTeam));
          }
        } else {
          setActiveTeamName(prettifyLabel(activeTeam));
        }
      } catch (error) {
        console.error('[HomePage] Failed to fetch team name:', error);
        setActiveTeamName(prettifyLabel(activeTeam));
      }
    };

    // Set fallback immediately, then fetch
    setActiveTeamName(prettifyLabel(activeTeam));
    fetchTeamName();
  }, [activeTeam, organization?.id, teamsRefreshKey]);

  // Listen for team data updates from TeamSelectorDropdown
  useEffect(() => {
    const handleTeamUpdate = () => {
      setTeamsRefreshKey(prev => prev + 1);
    };

    // Check cache periodically for updates (lightweight)
    const intervalId = setInterval(() => {
      if (activeTeam && teamsCache.teams.length > 0) {
        const currentTeam = teamsCache.teams.find((t: any) => t.id === activeTeam);
        if (currentTeam && currentTeam.name !== activeTeamName) {
          setActiveTeamName(currentTeam.name);
        }
      }
    }, 500); // Check every 500ms

    return () => {
      clearInterval(intervalId);
    };
  }, [activeTeam, activeTeamName]);

  // Calculate 7-day window
  const sevenDaysAgo = useMemo(() => Date.now() - (7 * 24 * 60 * 60 * 1000), []);

  // Filter sessions from last 7 days
  const recentSessionsForUsage = useMemo(() => {
    return sessions.filter(session => (session.timestamp || 0) >= sevenDaysAgo);
  }, [sessions, sevenDaysAgo]);

  useEffect(() => {
    let cancelled = false;

    if (!recentSessionsForUsage || recentSessionsForUsage.length === 0) {
      setUsageBySession({});
      setLastMetricsRefresh(Date.now());
      setUsageLoading(false);
      return;
    }

    setUsageLoading(true);

    (async () => {
      try {
        const usageEntries = await Promise.all(
          recentSessionsForUsage.map(async session => {
            try {
              const stats = await sessionStorageDBWrapper.getUsageStatsAsync(session.id);
              return { sessionId: session.id, stats };
            } catch (error) {
              console.error('[HomePage] Failed to load usage stats for session', session.id, error);
              return { sessionId: session.id, stats: null };
            }
          }),
        );

        if (cancelled) {
          return;
        }

        const usageMap: Record<string, UsageSnapshot> = {};
        usageEntries.forEach(({ sessionId, stats }) => {
          if (!stats) return;
          usageMap[sessionId] = {
            request: stats.request ?? 0,
            response: stats.response ?? 0,
            total: stats.total ?? 0,
            requestCount: stats.requestCount ?? 0,
          };
        });

        setUsageBySession(usageMap);
        setLastMetricsRefresh(Date.now());
      } finally {
        if (!cancelled) {
          setUsageLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recentSessionsForUsage, metricsRefreshKey]);

  const aggregatedUsage = useMemo(() => {
    return Object.values(usageBySession).reduce<UsageSnapshot>((acc, stats) => ({
      request: acc.request + stats.request,
      response: acc.response + stats.response,
      total: acc.total + stats.total,
      requestCount: acc.requestCount + stats.requestCount,
    }), createEmptyUsage());
  }, [usageBySession]);

  const sessionsWithUsageCount = useMemo(() => Object.keys(usageBySession).length, [usageBySession]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [sessions]);

  const totalSessionPages = useMemo(() => Math.ceil(sortedSessions.length / sessionsPerPage), [sortedSessions.length, sessionsPerPage]);

  const paginatedSessions = useMemo(() => {
    const startIndex = (sessionsPage - 1) * sessionsPerPage;
    return sortedSessions.slice(startIndex, startIndex + sessionsPerPage);
  }, [sortedSessions, sessionsPage, sessionsPerPage]);

  const totalSessions = sessions.length;
  const activeSessionsCount = useMemo(() => sessions.filter(session => session.isActive).length, [sessions]);
  const openSessionsCount = useMemo(() => sessions.filter(session => session.isOpen).length, [sessions]);
  const archivedSessionsCount = Math.max(totalSessions - openSessionsCount, 0);

  const uniqueAgents = useMemo(() => {
    const counts = new Map<string, number>();
    sessions.forEach(session => {
      if (session.selectedAgent) {
        counts.set(session.selectedAgent, (counts.get(session.selectedAgent) || 0) + 1);
      }
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  const uniqueModels = useMemo(() => {
    const counts = new Map<string, number>();
    sessions.forEach(session => {
      if (session.selectedModel) {
        counts.set(session.selectedModel, (counts.get(session.selectedModel) || 0) + 1);
      }
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  const heroName = user?.name || user?.email || '';
  const orgLabel = organization?.name || organization?.slug || 'No organization selected';
  const teamLabel = activeTeamName || 'No team selected';
  const currentSession = useMemo(
    () => sessions.find(session => session.id === currentSessionId) || null,
    [sessions, currentSessionId],
  );
  const latestSession = sortedSessions[0] || null;

  const averageTokensPerTrackedSession = sessionsWithUsageCount > 0 ? aggregatedUsage.total / sessionsWithUsageCount : 0;
  const averageTokensPerRequest = aggregatedUsage.requestCount > 0 ? aggregatedUsage.total / aggregatedUsage.requestCount : 0;

  const promptShare = aggregatedUsage.total > 0
    ? Math.min(100, Math.max(0, Math.round((aggregatedUsage.request / aggregatedUsage.total) * 100)))
    : 0;
  const completionShare = aggregatedUsage.total > 0
    ? Math.min(100, Math.max(0, 100 - promptShare))
    : 0;

  const cumulativeForDisplay = useMemo<CumulativeUsage>(() => ({
    request: aggregatedUsage.request,
    response: aggregatedUsage.response,
    total: aggregatedUsage.total,
    requestCount: aggregatedUsage.requestCount,
  }), [aggregatedUsage]);

  const openFeedbackModal = useCallback(() => {
    setFeedbackModalOpen(true);
  }, []);

  const handleSendFeedback = useCallback(() => {
    if (!feedbackText.trim()) return;
    
    console.log('[HomePage] Sending feedback:', feedbackText);
    // TODO: Implement actual feedback submission
    
    setFeedbackModalOpen(false);
    setFeedbackText('');
  }, [feedbackText]);

  const openSupportRequestModal = useCallback(() => {
    setSupportRequestModalOpen(true);
  }, []);

  const handleSupportRequestSubmit = useCallback((data: SupportRequestData) => {
    console.log('[HomePage] Submitting support request:', data);
    // TODO: Implement actual support request submission
    
    setSupportRequestModalOpen(false);
  }, []);

  const handleCreateSession = useCallback(async () => {
    if (creatingSession) return;

    setActionMessage(null);
    setCreatingSession(true);

    try {
      const fallbackTitle = `Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      await sessionStorageDBWrapper.addSession(fallbackTitle);
      setActionMessage({
        type: 'success',
        text: 'New session ready—taking you to the workspace.',
      });
      onGoToSessions();
    } catch (error) {
      console.error('[HomePage] Failed to create session:', error);
      setActionMessage({
        type: 'error',
        text: 'Something went wrong creating a session. Please try again.',
      });
    } finally {
      setCreatingSession(false);
    }
  }, [creatingSession, onGoToSessions]);

  const handleGoToSession = useCallback(async (sessionId: string) => {
    if (!canAccessSessions) {
      return;
    }

    try {
      await sessionStorageDBWrapper.setActiveSession(sessionId);
      onGoToSessions();
    } catch (error) {
      console.error('[HomePage] Failed to switch to session:', error);
      setActionMessage({ type: 'error', text: 'Failed to open session. Please try again.' });
    }
  }, [canAccessSessions, onGoToSessions]);

  const handleRefreshMetrics = useCallback(() => {
    setMetricsRefreshKey(previous => previous + 1);
  }, []);

  const renderIcon = useCallback((icon: 'activity' | 'sparkles' | 'stack' | 'team') => {
    const baseClasses = cn(
      'w-5 h-5 flex-shrink-0',
      icon === 'sparkles'
        ? isLight ? 'text-blue-500' : 'text-blue-300'
        : icon === 'activity'
        ? isLight ? 'text-emerald-500' : 'text-emerald-300'
        : icon === 'stack'
        ? isLight ? 'text-violet-500' : 'text-violet-300'
        : isLight
        ? 'text-amber-500'
        : 'text-amber-300',
    );

    switch (icon) {
      case 'activity':
        return (
          <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 12h4l3 8 4-16 3 8h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'sparkles':
        return (
          <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364l-2.121-2.121M6.757 6.757 4.636 4.636m0 14.728 2.121-2.121m12.728-12.728-2.121 2.121" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'stack':
        return (
          <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 12l-9 4.5L3 12" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 16.5l-9 4.5-9-4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'team':
      default:
        return (
          <svg className={baseClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
    }
  }, [isLight]);

  const statCards = useMemo(() => [
    {
      key: 'totalSessions',
      label: 'Total Sessions',
      value: formatNumber(totalSessions),
      description: `${openSessionsCount} open • ${archivedSessionsCount} archived`,
      icon: 'sparkles' as const,
    },
    {
      key: 'activeSessions',
      label: 'Active Sessions',
      value: formatNumber(activeSessionsCount),
      description: currentSession
        ? `Now focused on ${currentSession.title || 'Active Session'}`
        : 'Activate a session to jump back in.',
      icon: 'activity' as const,
    },
    {
      key: 'tokensUsed',
      label: 'Tokens Tracked',
      value: formatNumber(aggregatedUsage.total),
      description: sessionsWithUsageCount > 0
        ? `${formatNumber(averageTokensPerTrackedSession)} avg • ${sessionsWithUsageCount} sessions`
        : 'Usage updates once you start chatting.',
      icon: 'stack' as const,
    },
    {
      key: 'agents',
      label: 'Agents in Play',
      value: formatNumber(uniqueAgents.length),
      description: uniqueAgents.length > 0
        ? `${prettifyLabel(uniqueAgents[0][0])} leads with ${uniqueAgents[0][1]} sessions`
        : 'Select an agent to tailor your workspace.',
      icon: 'team' as const,
    },
  ], [
    totalSessions,
    openSessionsCount,
    archivedSessionsCount,
    activeSessionsCount,
    currentSession,
    aggregatedUsage.total,
    sessionsWithUsageCount,
    averageTokensPerTrackedSession,
    uniqueAgents,
  ]);

  const getStatusMeta = useCallback((session: (typeof sessions)[number]) => {
    if (session.isActive) {
      return { label: 'Active', tone: 'success' as const };
    }
    if (session.isOpen) {
      return { label: 'Open', tone: 'info' as const };
    }
    return { label: 'Closed', tone: 'muted' as const };
  }, []);

  const statusToneClasses = useCallback((tone: 'success' | 'info' | 'muted') => {
    switch (tone) {
      case 'success':
        return isLight
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-emerald-900/20 text-emerald-300';
      case 'info':
        return isLight
          ? 'bg-blue-100 text-blue-700'
          : 'bg-blue-900/20 text-blue-300';
      default:
        return isLight
          ? 'bg-gray-100 text-gray-600'
          : 'bg-gray-800/50 text-gray-400';
    }
  }, [isLight]);

  return (
    <>
      {/* Home Page Header */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-between border-b px-2 py-[0.4em]',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="mr-2 flex min-w-0 flex-1 items-center overflow-hidden">
          <div className={cn('flex-1 truncate px-1 text-sm font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            Home
          </div>
        </div>
        <div className="flex items-center gap-1">
          <InfoMenu isLight={isLight} onSendFeedback={openFeedbackModal} onRequestSupport={openSupportRequestModal} />
          <UserMenu
            isLight={isLight}
            onGoAdmin={(tab) => onGoAdmin?.(tab)}
            onGoToSessions={onGoToSessions}
          />
        </div>
      </div>

      {/* Home Page Content */}
      <div className={cn('flex-1 min-h-0 overflow-hidden', isLight ? 'bg-white' : 'bg-[#0D1117]')}>
        <div className="h-full min-h-0 overflow-y-auto home-page-scroll">
          <div className="px-3 py-4 space-y-4">
            {/* Hero */}
            <div
              className={cn(
                'relative overflow-hidden rounded-xl border px-4 py-5 max-w-4xl mx-auto',
                isLight
                  ? 'bg-white border-gray-200'
                  : 'bg-[#151C24] border-gray-700'
              )}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                        isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-300'
                      )}
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      {orgLabel}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                        isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800/80 text-gray-300'
                      )}
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      {teamLabel}
                    </span>
                  </div>
                  <h1 className={cn('text-xl font-semibold', mainTextColor)}>
                    {heroName ? `Welcome back, ${heroName.split(' ')[0]}!` : 'Welcome back!'}
                  </h1>
                  <p className={cn('text-sm', isLight ? 'text-gray-600' : 'text-gray-400')}>
                    {openSessionsCount > 0
                      ? `You have ${openSessionsCount} open session${openSessionsCount === 1 ? '' : 's'} and ${formatNumber(aggregatedUsage.total)} tokens tracked over the last 7 days.`
                      : 'Create a session to start collaborating with your agents and models.'}
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1', isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800/40 text-gray-300')}>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Active session: {currentSession?.title || 'None selected'}
                    </span>
                    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1', isLight ? 'bg-gray-100 text-gray-500' : 'bg-gray-800/40 text-gray-400')}>
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Last activity: {latestSession ? formatRelativeTime(latestSession.timestamp) : '—'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
            <button
                    onClick={() => canAccessSessions && onGoToSessions()}
              disabled={!canAccessSessions}
              className={cn(
                      'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                canAccessSessions
                        ? isLight ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-blue-600 text-white hover:bg-blue-500'
                        : isLight ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    )}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Go to Sessions
                  </button>
                  <button
                    onClick={handleCreateSession}
                    disabled={creatingSession}
                    className={cn(
                      'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors border',
                      creatingSession
                        ? isLight ? 'bg-gray-200 text-gray-400 cursor-wait border-gray-300' : 'bg-gray-700 text-gray-400 cursor-wait border-gray-600'
                        : isLight ? 'bg-white text-gray-600 hover:bg-gray-50 border-blue-300' : 'bg-[#151C24] text-gray-300 hover:bg-[#1a2330] border-blue-700'
                    )}
                  >
                    {creatingSession ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    New Session
            </button>
            {onGoAdmin && (
              <button
                onClick={() => onGoAdmin('organizations')}
                className={cn(
                          'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors border',
                          isLight ? 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300' : 'bg-[#151C24] text-gray-300 hover:bg-[#1a2330] border-gray-700'
                        )}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Admin Console
                      </button>
                    )}
                </div>
              </div>
              {actionMessage && (
                <div
                  className={cn(
                    'mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold',
                    actionMessage.type === 'success'
                      ? isLight ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-emerald-900/20 text-emerald-300 border border-emerald-800/60'
                      : isLight ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-red-900/20 text-red-300 border border-red-800/60'
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {actionMessage.text}
                </div>
              )}
            </div>

            {/* Tab Bar - Sticky */}
            <div
              className={cn(
                'sticky top-0 z-10 flex items-center justify-center gap-2 px-2 py-1 h-[34px] rounded-lg max-w-4xl mx-auto',
                isLight ? 'bg-gray-50' : 'bg-[#151C24]',
                )}>
              <div className="flex items-center gap-1">
                {(['sessions', 'usage', 'insights'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveHomeTab(tab)}
                    className={cn(
                      'flex-shrink-0 px-3 py-1 text-xs font-medium rounded transition-colors capitalize',
                      activeHomeTab === tab
                        ? isLight
                          ? 'bg-gray-200 text-gray-700'
                          : 'bg-gray-700 text-[#bcc1c7]'
                        : isLight
                        ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-700'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-[#bcc1c7]',
                    )}>
                    {tab === 'insights' ? 'Insights & Highlights' : tab}
              </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            {activeHomeTab === 'sessions' && (
              <div className="space-y-4 animate-fadeIn max-w-4xl mx-auto">
                {/* Stat Grid */}
                <div className="grid gap-3 grid-cols-2">
                  {statCards.map(card => (
                    <div
                      key={card.key}
                      className={cn(
                        'rounded-lg border p-3 transition-colors',
                        isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          {card.label}
          </div>
                        {renderIcon(card.icon)}
                      </div>
                      <div className={cn('text-2xl font-semibold', mainTextColor)}>
                        {card.value}
                      </div>
                      <div className={cn('mt-1 text-xs leading-snug', isLight ? 'text-gray-600' : 'text-gray-400')}>
                        {card.description}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Recent Sessions */}
                <div
                  className={cn(
                    'rounded-lg border overflow-hidden',
                    isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                  )}
                >
                  <div
                    className={cn(
                      'border-b',
                      isLight ? 'border-gray-200' : 'border-gray-700'
                    )}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between px-4 py-2">
                      <h3 className={cn('text-sm font-semibold', mainTextColor)}>
                        Recent Sessions
                      </h3>
                      <button
                        onClick={() => onGoToSessions()}
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide',
                          isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-300 hover:text-blue-200'
                        )}
                      >
                        View all sessions
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Pagination Row */}
                    {sortedSessions.length > 0 && (
                      <div className={cn('flex items-center justify-end gap-3 px-4 pb-2', isLight ? 'border-gray-200' : 'border-gray-700')}>
                        <span className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          {sortedSessions.length === 0
                            ? 'No sessions'
                            : `${((sessionsPage - 1) * sessionsPerPage) + 1}-${Math.min(
                                sessionsPage * sessionsPerPage,
                                sortedSessions.length,
                              )} of ${sortedSessions.length}`}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSessionsPage(p => Math.max(1, p - 1))}
                            disabled={sessionsPage === 1}
                            className={cn(
                              'rounded p-1 transition-colors',
                              sessionsPage === 1
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
                            {sessionsPage} / {totalSessionPages || 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSessionsPage(p => Math.min(totalSessionPages, p + 1))}
                            disabled={sessionsPage >= totalSessionPages}
                            className={cn(
                              'rounded p-1 transition-colors',
                              sessionsPage >= totalSessionPages
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
                  {sessionsLoading ? (
                    <div className={cn('space-y-3 px-4 py-4', isLight ? 'text-gray-500' : 'text-gray-500')}>
                      <div className="animate-pulse space-y-2">
                        {Array.from({ length: 4 }).map((_, idx) => (
                          <div key={`session-skeleton-${idx}`} className="h-10 rounded-md bg-gray-200/70 dark:bg-gray-800/70" />
                        ))}
                      </div>
                    </div>
                  ) : sortedSessions.length === 0 ? (
                    <div className={cn('px-4 py-8 text-center text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
                      No sessions yet. Create a new session to see activity appear here.
                    </div>
                  ) : (
                    <div
                      className="max-h-80 w-full overflow-auto recent-sessions-scroll"
                      style={{ '--table-scroll-bg': isLight ? '#FFFFFF' : '#151C24' } as React.CSSProperties}
                    >
                      <table className={cn('min-w-full w-full border-collapse divide-y text-xs', isLight ? 'divide-gray-200' : 'divide-gray-700')}>
                        <thead className={cn('sticky top-0 z-10', isLight ? 'bg-gray-50' : 'bg-[#151C24]')}>
                          <tr>
                            <th className={cn('px-3 py-2 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Session</th>
                            <th className={cn('px-3 py-2 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Agent</th>
                            <th className={cn('px-3 py-2 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Model</th>
                            <th className={cn('px-3 py-2 text-right text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Request</th>
                            <th className={cn('px-3 py-2 text-right text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Response</th>
                            <th className={cn('px-3 py-2 text-right text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Status</th>
                            <th className={cn('px-3 py-2 text-left text-xs font-semibold', isLight ? 'text-gray-600' : 'text-gray-300')}>Updated</th>
                          </tr>
                        </thead>
                        <tbody className={cn('divide-y', isLight ? 'divide-gray-100' : 'divide-gray-700')}>
                          {paginatedSessions.map(session => {
                            const usage = usageBySession[session.id];
                            const meta = getStatusMeta(session);
                            const createdTimestamp = getSessionCreatedTimestamp(session.id);
                            return (
                              <tr
                                key={session.id}
                                className={cn(
                                  'transition-colors',
                                  isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-900/40'
                                )}
                              >
                                <td className={cn('px-3 py-2 truncate max-w-[200px]')}>
                                    <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleGoToSession(session.id)}
                                      className={cn(
                                        'truncate text-left hover:underline cursor-pointer',
                                        isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'
                                      )}
                                    >
                                        {session.title || 'Untitled session'}
                                      </button>
                                      {session.id === currentSessionId && (
                                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0', isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-300')}>
                                          Current
                                        </span>
                                      )}
                                  </div>
                                </td>
                                <td className={cn('px-3 py-2 truncate max-w-[150px]', mainTextColor)}>
                                      {prettifyLabel(session.selectedAgent)}
                                </td>
                                <td className={cn('px-3 py-2 truncate max-w-[150px]', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                      {prettifyLabel(session.selectedModel)}
                                </td>
                                <td className={cn('px-3 py-2 text-right tabular-nums', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                    {usage ? formatNumber(usage.request) : '—'}
                                </td>
                                <td className={cn('px-3 py-2 text-right tabular-nums', isLight ? 'text-gray-700' : 'text-gray-300')}>
                                    {usage ? formatNumber(usage.response) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                                      statusToneClasses(meta.tone)
                                    )}
                                  >
                                    <span className={cn('h-1.5 w-1.5 rounded-full', meta.tone === 'success' ? 'bg-emerald-500' : meta.tone === 'info' ? 'bg-blue-500' : isLight ? 'bg-gray-400' : 'bg-gray-600')} />
                                    {meta.label}
                                  </span>
                                </td>
                                <td className={cn('px-3 py-2 whitespace-nowrap', isLight ? 'text-gray-600' : 'text-gray-400')}>
                                  {formatRelativeTime(session.timestamp)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeHomeTab === 'usage' && (
              <div className="space-y-4 animate-fadeIn max-w-4xl mx-auto">
                {/* Usage Overview */}
                <div
                  className={cn(
                    'rounded-xl border',
                    isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                  )}
                >
                  <div
                    className={cn(
                      'relative border-b px-4 py-3',
                      isLight ? 'border-gray-200' : 'border-gray-700'
                    )}
                  >
                    <div className="pr-32">
                        <h3 className={cn('text-sm font-semibold', mainTextColor)}>
                          Usage Overview
                        </h3>
                        <p className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-500')}>
                          Workspace-wide token consumption at a glance.
                        </p>
                      </div>
                    <div className="absolute right-4 top-3 flex items-center gap-2">
                      <button
                        onClick={() => onGoAdmin?.('usage')}
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide',
                          isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-300 hover:text-blue-200'
                        )}
                      >
                        View all usage
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    <button
                        type="button"
                        onClick={handleRefreshMetrics}
                        disabled={usageLoading}
                      className={cn(
                          'flex items-center justify-center w-8 h-8 rounded border transition-colors flex-shrink-0',
                          isLight
                            ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            : 'bg-[#151C24] border-gray-700 text-[#bcc1c7] hover:bg-gray-800',
                      )}
                        title="Refresh usage metrics"
                      >
                        <svg className={cn('w-4 h-4', usageLoading ? 'animate-spin' : '')} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M4 4v4h4M16 16v-4h-4" />
                          <path d="M5.636 5.636A7 7 0 0117 10M14.364 14.364A7 7 0 013 10" />
                      </svg>
                    </button>
                    </div>
                  </div>
                  <div className="space-y-4 px-4 py-4">
                    <UsageDisplay
                      lastUsage={null}
                      cumulativeUsage={cumulativeForDisplay}
                      isConnected={sessionsWithUsageCount > 0}
                      isLight={isLight}
                      compact={false}
                    />
                    <div className="grid gap-3 text-xs grid-cols-2">
                      <div
                        className={cn('rounded-lg border px-3 py-2', isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700')}>
                        <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          Prompt Tokens
                        </div>
                        <div className={cn('mt-1 text-lg font-semibold', mainTextColor)}>
                          {formatNumber(aggregatedUsage.request)}
                        </div>
                        <div className={cn('mt-2 h-2 rounded-full', isLight ? 'bg-gray-200' : 'bg-gray-700')}>
                          <div
                            className={cn('h-2 rounded-full transition-all', isLight ? 'bg-blue-500' : 'bg-blue-400')}
                            style={{ width: `${promptShare}%` }}
                          />
                        </div>
                      </div>
                      <div className={cn('rounded-lg border px-3 py-2', isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700')}>
                        <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          Completion Tokens
                        </div>
                        <div className={cn('mt-1 text-lg font-semibold', mainTextColor)}>
                          {formatNumber(aggregatedUsage.response)}
                        </div>
                        <div className={cn('mt-2 h-2 rounded-full', isLight ? 'bg-gray-200' : 'bg-gray-700')}>
                          <div
                            className={cn('h-2 rounded-full transition-all', isLight ? 'bg-emerald-500' : 'bg-emerald-400')}
                            style={{ width: `${completionShare}%` }}
                          />
                        </div>
                      </div>
                      <div className={cn('rounded-lg border px-3 py-2', isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700')}>
                        <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          Requests Logged
                        </div>
                        <div className={cn('mt-1 text-lg font-semibold', mainTextColor)}>
                          {formatNumber(aggregatedUsage.requestCount)}
                        </div>
                        <div className={cn('text-[11px]', isLight ? 'text-gray-600' : 'text-gray-400')}>
                          {aggregatedUsage.requestCount > 0
                            ? `${formatNumber(averageTokensPerRequest)} tokens on average`
                            : 'Usage updates when requests begin.'}
                        </div>
                      </div>
                      <div className={cn('rounded-lg border px-3 py-2', isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700')}>
                        <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-400')}>
                          Sessions Tracked
                        </div>
                        <div className={cn('mt-1 text-lg font-semibold', mainTextColor)}>
                          {formatNumber(sessionsWithUsageCount)}
                        </div>
                        <div className={cn('text-[11px]', isLight ? 'text-gray-600' : 'text-gray-400')}>
                          Last synced {lastMetricsRefresh ? formatRelativeTime(lastMetricsRefresh) : 'just now'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeHomeTab === 'insights' && (
              <div className="space-y-4 animate-fadeIn max-w-4xl mx-auto">
                {/* Insights */}
                <div
                  className={cn(
                    'rounded-xl border',
                    isLight ? 'bg-white border-gray-200' : 'bg-[#151C24] border-gray-700'
                  )}
                >
                  <div
                    className={cn(
                      'border-b px-4 py-3',
                      isLight ? 'border-gray-200' : 'border-gray-700'
                    )}
                  >
                    <h3 className={cn('text-sm font-semibold', mainTextColor)}>
                      Insights & Highlights
                    </h3>
                    <p className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-500')}>
                      Where your team is spending the most time.
                    </p>
          </div>
                  <div className="space-y-3 px-4 py-3 text-xs">
                    <div className="max-w-lg mx-auto">
                      <div className={cn('mb-1 text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-500')}>
                        Top Agents
        </div>
                      {uniqueAgents.length > 0 ? (
                        <ul className="space-y-1.5">
                          {uniqueAgents.slice(0, 3).map(([agent, count]) => (
                            <li key={agent} className="flex items-center justify-between">
                              <span className={mainTextColor}>
                                {prettifyLabel(agent)}
                              </span>
                              <span className={cn('font-mono', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                {count} session{count === 1 ? '' : 's'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className={cn('text-[11px]', isLight ? 'text-gray-500' : 'text-gray-500')}>
                          Run a session to see which agents get the most traction.
                        </div>
                      )}
                    </div>
                    <div className="max-w-lg mx-auto">
                      <div className={cn('mb-1 text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-500')}>
                        Frequently Used Models
                      </div>
                      {uniqueModels.length > 0 ? (
                        <ul className="space-y-1.5">
                          {uniqueModels.slice(0, 3).map(([model, count]) => (
                            <li key={model} className="flex items-center justify-between">
                              <span className={mainTextColor}>
                                {prettifyLabel(model)}
                              </span>
                              <span className={cn('font-mono', isLight ? 'text-gray-500' : 'text-gray-400')}>
                                {count} run{count === 1 ? '' : 's'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className={cn('text-[11px]', isLight ? 'text-gray-500' : 'text-gray-500')}>
                          Switch models from a session to start collecting insights.
                        </div>
                      )}
                    </div>
                    <div className="max-w-lg mx-auto">
                      <div className={cn('mb-2 text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-500' : 'text-gray-500')}>
                        Productivity Tips
                      </div>
                      <div className="relative">
                        <div className="flex items-center gap-3">
                          {/* Left Arrow */}
                          <button
                            type="button"
                            onClick={() => setCurrentTipIndex((prev) => (prev === 0 ? PRODUCTIVITY_TIPS.length - 1 : prev - 1))}
                            className={cn(
                              'flex items-center justify-center w-10 h-10 rounded transition-colors flex-shrink-0',
                              isLight
                                ? 'text-gray-700 hover:bg-gray-100'
                                : 'text-gray-300 hover:bg-gray-800'
                            )}
                            title="Previous tip"
                          >
                            <svg className="w-6 h-6" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <path d="M12 6l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>

                          {/* Tip Content */}
                          <div
                            className={cn(
                              'flex-1 rounded-lg px-3 py-2',
                              isLight ? 'bg-gray-50' : 'bg-[#0B121C]'
                            )}
                          >
                            <div className={cn('text-[11px] font-semibold uppercase tracking-wide', isLight ? 'text-gray-600' : 'text-gray-400')}>
                              {PRODUCTIVITY_TIPS[currentTipIndex].title}
                            </div>
                            <div className={cn('mt-1 text-xs leading-snug', isLight ? 'text-gray-500' : 'text-gray-500')}>
                              {PRODUCTIVITY_TIPS[currentTipIndex].description}
                            </div>
                          </div>

                          {/* Right Arrow */}
                          <button
                            type="button"
                            onClick={() => setCurrentTipIndex((prev) => (prev === PRODUCTIVITY_TIPS.length - 1 ? 0 : prev + 1))}
                            className={cn(
                              'flex items-center justify-center w-10 h-10 rounded transition-colors flex-shrink-0',
                              isLight
                                ? 'text-gray-700 hover:bg-gray-100'
                                : 'text-gray-300 hover:bg-gray-800'
                            )}
                            title="Next tip"
                          >
                            <svg className="w-6 h-6" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <path d="M8 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                        
                        {/* Dot Indicators */}
                        <div className="flex items-center justify-center gap-1 mt-2">
                          {PRODUCTIVITY_TIPS.map((_, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => setCurrentTipIndex(index)}
                              className={cn(
                                'w-1.5 h-1.5 rounded-full transition-all',
                                index === currentTipIndex
                                  ? isLight ? 'bg-blue-500 w-4' : 'bg-blue-400 w-4'
                                  : isLight ? 'bg-gray-300' : 'bg-gray-600'
                              )}
                              title={`Tip ${index + 1}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Bar with Settings */}
      <div
        className={cn(
          'flex-shrink-0 border-t',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
        )}>
        <div className="flex items-center justify-between px-4 py-1.5">
          <div className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            v {version}
          </div>
          <SettingsButton isLight={isLight} theme={theme} onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div
              className={cn(
                'w-full max-w-sm rounded-lg shadow-xl',
                isLight ? 'bg-white border-gray-200 border' : 'bg-[#151C24] border-gray-700 border',
              )}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div
                className={cn(
                  'flex items-center justify-between border-b px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <h2 className={cn('text-sm font-semibold', mainTextColor)}>
                  Preferences
                </h2>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className={cn(
                    'rounded-md p-0.5 transition-colors',
                    isLight
                      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}>
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

            {/* Content */}
            <div className="px-3 py-2.5">
              <label
                className={cn(
                  'text-xs font-medium block mb-2',
                  mainTextColor
                )}
              >
                Theme
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => exampleThemeStorage.setTheme('light')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'light'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  )}
                  title="Light theme"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>Light</span>
                </button>
                
                <button
                  onClick={() => exampleThemeStorage.setTheme('dark')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'dark'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  )}
                  title="Dark theme"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span>Dark</span>
                </button>
                
                <button
                  onClick={() => exampleThemeStorage.setTheme('system')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors',
                    theme === 'system'
                      ? 'bg-blue-500 text-white'
                      : isLight
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  )}
                  title="System theme"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>System</span>
                </button>
              </div>
            </div>

              {/* Footer */}
              <div
                className={cn(
                  'flex items-center justify-end gap-2 border-t px-3 py-2',
                  isLight ? 'border-gray-200' : 'border-gray-700',
                )}>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    isLight
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-500 text-white hover:bg-blue-600',
                  )}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Feedback Modal */}
      <FeedbackModal
        isLight={isLight}
        isOpen={feedbackModalOpen}
        feedbackText={feedbackText}
        onClose={() => {
          setFeedbackModalOpen(false);
          setFeedbackText('');
        }}
        onFeedbackChange={setFeedbackText}
        onSubmit={handleSendFeedback}
      />

      {/* Support Request Modal */}
      <SupportRequestModal
        isLight={isLight}
        isOpen={supportRequestModalOpen}
        onClose={() => setSupportRequestModalOpen(false)}
        onSubmit={handleSupportRequestSubmit}
        userEmail={user?.email || ''}
        userOrganization={organization?.name || ''}
        userTeam={activeTeam || ''}
        availableTeams={[]}
      />
    </>
  );
};

