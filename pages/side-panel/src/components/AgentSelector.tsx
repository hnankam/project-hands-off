import React from 'react';
import { cn } from '@extension/ui';
import { API_CONFIG } from '../constants';
import { useAuth } from '../context/AuthContext';

interface AgentSelectorProps {
  isLight: boolean;
  selectedAgent: string;
  isLoadingSession?: boolean;
  onAgentChange: (agent: string) => void;
}

interface Agent {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  enabled?: boolean;
  allowedModels?: string[] | null;
}

// Icon mapping for agents
const getAgentIcon = (agentId: string): React.ReactNode => {
  const iconMap: Record<string, React.ReactNode> = {
    databricks: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    wiki: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    jira: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    aep: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    general: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    sharepoint: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    excel: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    word: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  };
  
  // Default icon for unknown agents
  return iconMap[agentId] || (
    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
};

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  isLight,
  selectedAgent,
  isLoadingSession = false,
  onAgentChange,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [missingContext, setMissingContext] = React.useState(false);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const textRef = React.useRef<HTMLSpanElement>(null);
  const { organization, activeTeam, isLoading: authLoading } = useAuth();

  // Check if text is truncated
  React.useEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        const isOverflowing = textRef.current.scrollWidth > textRef.current.clientWidth;
        setIsTruncated(isOverflowing);
      }
    };

    checkTruncation();
    
    // Re-check on resize
    const resizeObserver = new ResizeObserver(checkTruncation);
    if (textRef.current) {
      resizeObserver.observe(textRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [selectedAgent, agents]);

  // Fetch agents from API
  React.useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!organization?.id || !activeTeam) {
      setMissingContext(true);
      setAgents([]);
      setLoading(false);
      if (selectedAgent !== '') {
        onAgentChange('');
      }
      return;
    }

    const controller = new AbortController();
    let isActive = true;

    setLoading(true);
    setMissingContext(false);

    const fetchAgents = async () => {
      try {
        // Add team ID as query parameter to ensure we're fetching the correct team's agents
        const url = new URL(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CONFIG_AGENTS}`);
        if (activeTeam) {
          url.searchParams.append('teamId', activeTeam);
        }
        
        console.log('[AgentSelector] Fetching agents for team:', activeTeam);
        const response = await fetch(url.toString(), {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to fetch agents');
        }
        const data = await response.json();
        if (!isActive) {
          return;
        }
        console.log('[AgentSelector] Fetched agents:', data.agents?.length || 0, 'agents');

        if (data.missingContext || !data.agents || data.agents.length === 0) {
          if (!isActive) {
            return;
          }
          setMissingContext(true);
          setAgents([]);
          onAgentChange(''); // Clear selected agent in parent state
          return;
        }
        
        if (!isActive) {
          return;
        }
        setMissingContext(false);

        // Add icons to the fetched agents
        const agentsWithIcons = data.agents.map((agent: { id: string; label: string; description?: string; enabled?: boolean; allowedModels?: string[] | null }) => ({
          ...agent,
          icon: getAgentIcon(agent.id),
        }));
        
        if (!isActive) {
          return;
        }
        setAgents(agentsWithIcons);
        
        // Removed: Auto-selection moved to separate effect to handle session loading state
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return;
        }
        console.error('Error fetching agents:', error);
        // Fallback to a default agent if API fails
        if (isActive) {
          setMissingContext(false);
          setAgents([{
            id: 'general',
            label: 'General Agent',
            icon: getAgentIcon('general'),
          }]);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchAgents();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [organization?.id, activeTeam, authLoading]);

  // Handle auto-selection when agents are loaded and session is not loading
  React.useEffect(() => {
    if (loading || isLoadingSession || agents.length === 0) {
      return;
    }

    // Auto-select first agent if none is selected or current selection is invalid
    const hasValidSelection = selectedAgent && agents.some((agent: Agent) => agent.id === selectedAgent);
    
    if (!hasValidSelection) {
      const firstEnabledAgent = agents.find((agent: Agent) => agent.enabled !== false) || agents[0];
      if (firstEnabledAgent) {
        console.log('[AgentSelector] Auto-selecting default agent:', firstEnabledAgent.id);
        onAgentChange(firstEnabledAgent.id);
      }
    }
  }, [agents, selectedAgent, loading, isLoadingSession, onAgentChange]);

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

  const selectedAgentData = agents.find(a => a.id === selectedAgent);

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md h-[26px] opacity-50">
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="font-medium">Loading...</span>
      </div>
    );
  }

  if (missingContext || agents.length === 0) {
    // Show different message based on whether we have a team or not
    const hasTeam = !!(organization?.id && activeTeam);
    const message = hasTeam ? 'Team has no agents configured' : 'Select a team to load agents';
    
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md h-[26px] opacity-50">
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-medium">{message}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 text-xs rounded-md h-[26px] min-w-0',
          isLight
            ? selectedAgentData ? 'text-gray-600' : 'text-gray-500'
            : selectedAgentData ? 'text-gray-500' : 'text-gray-400'
        )}
      >
        <span className="flex-shrink-0">
          {selectedAgentData ? selectedAgentData.icon : (
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          )}
        </span>
        <span className="font-medium truncate flex-1 min-w-0 relative overflow-hidden">
          <span ref={textRef} className="block truncate">
            {selectedAgentData ? selectedAgentData.label : 'Select Agent'}
          </span>
          {isTruncated && (
            <span 
              className={cn(
                'absolute right-0 top-0 bottom-0 w-8 pointer-events-none',
                isLight
                  ? 'bg-gradient-to-l from-gray-50 via-gray-50/80 to-transparent'
                  : 'bg-gradient-to-l from-[#151C24] via-[#151C24]/80 to-transparent'
              )}
            />
          )}
        </span>
        <svg
          className={cn(
            'transition-transform flex-shrink-0',
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

      {/* Dropdown - Always mounted, visibility controlled with CSS */}
      <div
        className={cn(
          'absolute bottom-full left-0 mb-1 w-full min-w-[180px] rounded-md border shadow-lg z-[9999]',
          isLight
            ? 'bg-gray-50 border-gray-200'
            : 'bg-[#151C24] border-gray-700',
          isOpen ? 'pointer-events-auto agent-selector-dropdown' : 'opacity-0 pointer-events-none'
        )}
      >
        {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => {
                if (agent.enabled !== false) {
                  onAgentChange(agent.id);
                  setIsOpen(false);
                }
              }}
              disabled={agent.enabled === false}
              className={cn(
                'flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs transition-colors',
                agent.enabled === false
                  ? 'opacity-50 cursor-not-allowed'
                  : selectedAgent === agent.id
                  ? isLight
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'bg-blue-900/30 text-blue-300 font-medium'
                  : isLight
                  ? 'text-gray-600 hover:bg-gray-100'
                  : 'text-gray-500 hover:bg-gray-700'
              )}
            >
              {agent.icon}
              <span>{agent.label}</span>
              {selectedAgent === agent.id && agent.enabled !== false && (
                <svg
                  className="ml-auto"
                  width="12"
                  height="12"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
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
    </div>
  );
};

