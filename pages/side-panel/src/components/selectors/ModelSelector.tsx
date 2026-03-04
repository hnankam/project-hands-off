import * as React from 'react';
import { cn } from '@extension/ui';
import { API_CONFIG } from '../../constants';
import { useAuth } from '../../context/AuthContext';

interface ModelSelectorProps {
  isLight: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  selectedAgent?: string;
  isLoadingSession?: boolean;
  agents?: Array<{ id: string; allowedModels?: string[] | null }>;
}

interface Model {
  id: string;
  label: string;
  provider: string;
  enabled?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ isLight, selectedModel, onModelChange, selectedAgent, isLoadingSession = false, agents }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [models, setModels] = React.useState<Model[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [missingContext, setMissingContext] = React.useState(false);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const textRef = React.useRef<HTMLSpanElement>(null);
  const { organization, activeTeam, isLoading: authLoading } = useAuth();
  
  // Track last fetch to prevent duplicate requests
  const lastFetchRef = React.useRef<{ orgId: string | null; teamId: string | null }>({
    orgId: null,
    teamId: null,
  });
  
  // Get allowed models for the selected agent
  const allowedModels = React.useMemo(() => {
    if (!selectedAgent || !agents) return null;
    const agent = agents.find(a => a.id === selectedAgent);
    return agent?.allowedModels || null;
  }, [selectedAgent, agents]);

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
  }, [selectedModel, models]);

  // Fetch models from API
  React.useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!organization?.id || !activeTeam) {
      setMissingContext(true);
      setModels([]);
      setLoading(false);
      if (selectedModel !== '') {
        onModelChange('');
      }
      return;
    }

    // Prevent duplicate fetches for the same org/team combination
    // This prevents React StrictMode double-renders and rapid dependency changes
    const orgId = organization.id;
    const teamId = activeTeam;
    const currentFetchKey = `${orgId}:${teamId}`;
    const lastFetchKey = lastFetchRef.current.orgId && lastFetchRef.current.teamId
      ? `${lastFetchRef.current.orgId}:${lastFetchRef.current.teamId}`
      : null;
    
    if (currentFetchKey === lastFetchKey) {
      // Already fetched for this combination, skip duplicate request
      console.log('[ModelSelector] Skipping duplicate fetch for same org/team');
      return;
    }

    // Update last fetch ref before making request
    lastFetchRef.current = { orgId, teamId };

    const controller = new AbortController();
    let isActive = true;

    setLoading(true);
    setMissingContext(false);

    const fetchModels = async () => {
      try {
        // Add team ID as query parameter to ensure we're fetching the correct team's models
        const url = new URL(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CONFIG_MODELS}`);
        if (activeTeam) {
          url.searchParams.append('teamId', activeTeam);
        }
        
        console.log('[ModelSelector] Fetching models for team:', activeTeam);
        const response = await fetch(url.toString(), {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }
        const data = await response.json();
        if (!isActive) {
          return;
        }
        console.log('[ModelSelector] Fetched models:', data.models?.length || 0, 'models');

        if (data.missingContext || !data.models || data.models.length === 0) {
          if (!isActive) {
            return;
          }
          setMissingContext(true);
          setModels([]);
          onModelChange(''); // Clear selected model in parent state
          return;
        }

        if (!isActive) {
          return;
        }
        setMissingContext(false);
        
        // Sort models: Provider priority, then by version (descending), then by tier
        const sortedModels = data.models.sort((a: Model, b: Model) => {
          // Provider priority: Anthropic (Claude) > Google (Gemini) > OpenAI (GPT)
          const providerOrder: Record<string, number> = {
            'Anthropic': 0,
            'Google': 1,
            'OpenAI': 2,
          };
          
          const aProviderPriority = providerOrder[a.provider] ?? 999;
          const bProviderPriority = providerOrder[b.provider] ?? 999;
          
          if (aProviderPriority !== bProviderPriority) {
            return aProviderPriority - bProviderPriority;
          }
          
          // Extract version numbers from model IDs (e.g., "4.5" from "claude-4.5-haiku")
          const versionRegex = /(\d+)\.(\d+)/;
          const aVersionMatch = a.id.match(versionRegex);
          const bVersionMatch = b.id.match(versionRegex);
          
          if (aVersionMatch && bVersionMatch) {
            const aVersion = parseFloat(`${aVersionMatch[1]}.${aVersionMatch[2]}`);
            const bVersion = parseFloat(`${bVersionMatch[1]}.${bVersionMatch[2]}`);
            
            if (aVersion !== bVersion) {
              return bVersion - aVersion; // Descending order (higher version first)
            }
          }
          
          // Within same version, sort by tier (based on common naming patterns)
          const tierPatterns = ['opus', 'sonnet', 'haiku', 'pro', 'flash', 'mini', 'lite'];
          const getTierPriority = (id: string): number => {
            const lowerID = id.toLowerCase();
            if (lowerID.includes('opus')) return 0;
            if (lowerID.includes('sonnet')) return 1;
            if (lowerID.includes('pro')) return 2;
            if (lowerID.includes('haiku')) return 3;
            if (lowerID.includes('flash') && !lowerID.includes('lite')) return 4;
            if (lowerID.includes('mini')) return 5;
            if (lowerID.includes('lite')) return 6;
            return 999;
          };
          
          const aTierPriority = getTierPriority(a.id);
          const bTierPriority = getTierPriority(b.id);
          
          if (aTierPriority !== bTierPriority) {
            return aTierPriority - bTierPriority;
          }
          
          // Fallback to alphabetical by label
          return a.label.localeCompare(b.label);
        });
        
        if (!isActive) {
          return;
        }
        setModels(sortedModels);
        
        // Removed: Auto-selection moved to separate effect to handle session loading state
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          return;
        }
        console.error('Error fetching models:', error);
        // Fallback to a default model if API fails
        if (isActive) {
          setModels([{
            id: 'claude-4.5-haiku',
            label: 'Claude 4.5 Haiku',
            provider: 'Anthropic',
          }]);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchModels();
    return () => {
      isActive = false;
      controller.abort();
      // Reset last fetch ref on cleanup to allow re-fetch if org/team actually changes
      // This handles the case where component unmounts and remounts with same org/team
      lastFetchRef.current = { orgId: null, teamId: null };
    };
    // Note: allowedModels is intentionally NOT in dependencies - it's only used for filtering,
    // not for determining which models to fetch. Fetching depends only on org/team context.
  }, [organization?.id, activeTeam, authLoading]);

  // Handle auto-selection when models are loaded and session is not loading
  React.useEffect(() => {
    if (loading || isLoadingSession || models.length === 0) {
      return;
    }

    const allowedModelIds = allowedModels === null ? null : new Set(allowedModels);
    const hasValidSelection = selectedModel && models.some((model: Model) => {
      const isAllowed = allowedModelIds === null || allowedModelIds.has(model.id);
      return model.id === selectedModel && model.enabled !== false && isAllowed;
    });

    if (!hasValidSelection) {
      const firstEnabledModel = models.find((model: Model) => {
        const isAllowed = allowedModelIds === null || allowedModelIds.has(model.id);
        return model.enabled !== false && isAllowed;
      }) || models.find((model: Model) => model.enabled !== false) || models[0];
      
      if (firstEnabledModel) {
        console.log('[ModelSelector] Auto-selecting default model:', firstEnabledModel.id);
        onModelChange(firstEnabledModel.id);
      }
    }
  }, [models, selectedModel, loading, isLoadingSession, allowedModels, onModelChange]);

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

  const selectedModelData = models.find(m => m.id === selectedModel);

  // Show loading state
  if (loading) {
    return (
      <div className="flex h-[26px] min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs opacity-50">
        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        <span className="font-medium truncate">Loading...</span>
      </div>
    );
  }

  if (missingContext || models.length === 0) {
    // Show different message based on whether we have a team or not
    const hasTeam = !!(organization?.id && activeTeam);
    const message = hasTeam ? 'Team has no models configured' : 'Select a team to load models';
    
    return (
      <div className="flex h-[26px] min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs opacity-50">
        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-medium truncate">{message}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-[26px] min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs',
          isLight 
            ? selectedModelData ? 'text-gray-600' : 'text-gray-500'
            : selectedModelData ? 'text-gray-500' : 'text-gray-400',
        )}>
        <svg
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}>
          <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        <span className="relative min-w-0 flex-1 overflow-hidden truncate font-medium">
          <span ref={textRef} className="block truncate">
            {selectedModelData ? selectedModelData.label : 'Select Model'}
          </span>
          {isTruncated && (
            <span
              className={cn(
                'pointer-events-none absolute bottom-0 right-0 top-0 w-8',
                isLight
                  ? 'bg-gradient-to-l from-gray-50 via-gray-50/80 to-transparent'
                  : 'bg-gradient-to-l from-[#151C24] via-[#151C24]/80 to-transparent',
              )}
            />
          )}
        </span>
        <svg
          className={cn('flex-shrink-0 transition-transform', isOpen ? 'rotate-180' : '')}
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown - Always mounted, visibility controlled with CSS */}
      <div
        className={cn(
          'absolute bottom-full left-0 z-[9999] mb-1 max-h-64 w-full min-w-[200px] overflow-y-auto rounded-md border shadow-lg',
          isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-[#151C24]',
          isOpen ? 'pointer-events-auto model-selector-dropdown' : 'opacity-0 pointer-events-none'
        )}>
        {models.map(model => {
          // Check if model is allowed for the selected agent
          const isAllowedForAgent = allowedModels === null || allowedModels.includes(model.id);
          const isDisabled = model.enabled === false || !isAllowedForAgent;
          
          return (
            <button
              key={model.id}
              onClick={() => {
                if (!isDisabled) {
                  onModelChange(model.id);
                  setIsOpen(false);
                }
              }}
              disabled={isDisabled}
              className={cn(
                'flex w-full flex-col items-start px-2.5 py-1.5 text-xs transition-colors',
                isDisabled
                  ? 'opacity-50 cursor-not-allowed'
                  : selectedModel === model.id
                  ? isLight
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-blue-900/30 text-blue-300'
                  : isLight
                    ? 'text-gray-600 hover:bg-gray-100'
                    : 'text-gray-500 hover:bg-gray-700',
              )}>
              <div className="flex w-full items-center justify-between">
                <span className={cn(selectedModel === model.id && 'font-medium')}>{model.label}</span>
                {selectedModel === model.id && !isDisabled && (
                  <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                {!isAllowedForAgent && (
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )}
              </div>
              <span className={cn('text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>{model.provider}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
