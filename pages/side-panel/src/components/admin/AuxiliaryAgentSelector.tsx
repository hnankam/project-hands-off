import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@extension/ui';

interface AgentOption {
  id: string;
  agentType: string;
  agentName: string;
  enabled?: boolean;
}

export type AuxiliaryAgentType = 
  | 'image_generation'
  | 'web_search'
  | 'code_execution'
  | 'url_context'
  | 'memory';

interface AuxiliaryAgentSelectorProps {
  isLight: boolean;
  agents: AgentOption[];
  auxType: AuxiliaryAgentType;
  selectedAgentType: string | null;
  onChange: (agentType: string | null) => void;
  disabled?: boolean;
  loading?: boolean;
  /** The current agent being edited (to exclude from options) */
  excludeAgentType?: string;
}

const AUX_TYPE_LABELS: Record<AuxiliaryAgentType, { label: string; description: string }> = {
  image_generation: {
    label: 'Image Generation',
    description: 'Generate images from text prompts',
  },
  web_search: {
    label: 'Web Search',
    description: 'Search the web for information',
  },
  code_execution: {
    label: 'Code Execution',
    description: 'Execute code snippets',
  },
  url_context: {
    label: 'URL Context',
    description: 'Load content from URLs',
  },
  memory: {
    label: 'Memory',
    description: 'Store and retrieve information',
  },
};

const AgentIcon = () => (
  <svg
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

export const AuxiliaryAgentSelector: React.FC<AuxiliaryAgentSelectorProps> = ({
  isLight,
  agents,
  auxType,
  selectedAgentType,
  onChange,
  disabled = false,
  loading = false,
  excludeAgentType,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const auxInfo = AUX_TYPE_LABELS[auxType];

  // Filter out only the agent being edited (disabled agents are still selectable)
  const availableAgents = agents.filter(agent => 
    agent.agentType !== excludeAgentType
  );

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

  // Detect if dropdown should open upward
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - buttonRect.bottom;
      const dropdownHeight = 200;
      setOpenUpward(spaceBelow < dropdownHeight && buttonRect.top > dropdownHeight);
    }
  }, [isOpen]);

  if (loading) {
    return (
      <div
        className={cn(
          'h-[34px] w-full rounded-md border animate-pulse',
          isLight ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800',
        )}
      />
    );
  }

  if (disabled) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] border opacity-60',
          isLight ? 'bg-white border-gray-300 text-gray-500' : 'bg-[#151C24] border-gray-600 text-gray-400',
        )}
      >
        <span className="flex-shrink-0 mt-0.5">
          <AgentIcon />
        </span>
        <span className="truncate flex-1 text-left">Not configured</span>
      </div>
    );
  }

  const selectedAgent = agents.find(agent => agent.agentType === selectedAgentType);

  const handleSelect = (agentType: string | null) => {
    onChange(agentType);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="mb-1">
        <span className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
          {auxInfo.label}
        </span>
        <span className={cn('ml-1.5 text-[10px]', isLight ? 'text-gray-500' : 'text-gray-500')}>
          {auxInfo.description}
        </span>
      </div>
      
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md min-h-[32px] min-w-0 w-full border',
          isLight
            ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <span className="flex-shrink-0">
          <AgentIcon />
        </span>
        
        {selectedAgent ? (
          <span className="flex-1 min-w-0 text-left flex items-center gap-1.5">
            <span className="font-medium truncate">{selectedAgent.agentName}</span>
            {selectedAgent.enabled === false && (
              <span
                className={cn(
                  'text-[9px] px-1 py-0.5 rounded font-medium flex-shrink-0',
                  isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/30 text-amber-400',
                )}
              >
                Disabled
              </span>
            )}
            <span className={cn('truncate', isLight ? 'text-gray-500' : 'text-gray-400')}>
              ({selectedAgent.agentType})
            </span>
          </span>
        ) : (
          <span className={cn('flex-1 min-w-0 text-left', isLight ? 'text-gray-500' : 'text-gray-400')}>
            Not configured
          </span>
        )}
        
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

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 w-full min-w-[200px] rounded-md border shadow-lg z-[9999] max-h-[200px] overflow-y-auto',
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1',
            isLight
              ? 'bg-white border-gray-200'
              : 'bg-[#151C24] border-gray-700'
          )}
        >
          {/* Clear option */}
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={cn(
              'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors text-left border-b',
              isLight
                ? 'text-gray-500 hover:bg-gray-100 border-gray-200'
                : 'text-gray-400 hover:bg-gray-700 border-gray-700'
            )}
          >
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <span className="italic">Not configured</span>
          </button>

          {availableAgents.length === 0 ? (
            <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
              No agents available
            </div>
          ) : (
            availableAgents.map(agent => {
              const isSelected = agent.agentType === selectedAgentType;
              const isDisabled = agent.enabled === false;
              return (
                <button
                  type="button"
                  key={agent.id}
                  onClick={() => handleSelect(agent.agentType)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 text-xs transition-colors text-left',
                    isSelected
                      ? isLight
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-blue-900/30 text-blue-400'
                      : isLight
                        ? 'text-gray-700 hover:bg-gray-100'
                        : 'text-gray-200 hover:bg-gray-700'
                  )}
                >
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0',
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : isLight
                        ? 'border-gray-300'
                        : 'border-gray-600'
                  )}>
                    {isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <AgentIcon />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">{agent.agentName}</span>
                      {isDisabled && (
                        <span
                          className={cn(
                            'text-[9px] px-1 py-0.5 rounded font-medium flex-shrink-0',
                            isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/30 text-amber-400',
                          )}
                        >
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className={cn('text-[10px] truncate', isLight ? 'text-gray-500' : 'text-gray-400')}>
                      {agent.agentType}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default AuxiliaryAgentSelector;

