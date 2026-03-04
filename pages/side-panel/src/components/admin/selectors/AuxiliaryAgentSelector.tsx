import * as React from 'react';
import { useState, useRef } from 'react';
import { cn } from '@extension/ui';
import { useClickOutside, useDropdownPosition } from '../hooks';
import { AgentIcon, ChevronDownIcon, CheckIcon, CloseIcon } from '../icons';
import { SelectorSkeleton } from '../skeletons';
import type { AgentOption, AuxiliaryAgentType } from '../types';
import { AUX_TYPE_LABELS } from '../types';

export interface AuxiliaryAgentSelectorProps {
  isLight: boolean;
  agents: AgentOption[];
  auxType: AuxiliaryAgentType;
  /** The selected agent's database ID (stable reference) */
  selectedAgentId: string | null;
  /** Returns the agent's database ID (stable reference) */
  onChange: (agentId: string | null) => void;
  disabled?: boolean;
  loading?: boolean;
  /** The current agent being edited (to exclude from options) */
  excludeAgentId?: string;
  /** Custom label to override the default auxType label */
  customLabel?: string;
  /** Hide the label entirely */
  hideLabel?: boolean;
}

export const AuxiliaryAgentSelector: React.FC<AuxiliaryAgentSelectorProps> = ({
  isLight,
  agents,
  auxType,
  selectedAgentId,
  onChange,
  disabled = false,
  loading = false,
  excludeAgentId,
  customLabel,
  hideLabel = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownPosition = useDropdownPosition(buttonRef as React.RefObject<HTMLElement>, isOpen, 200);

  const auxInfo = AUX_TYPE_LABELS[auxType];

  // Filter out only the agent being edited (disabled agents are still selectable)
  const availableAgents = agents.filter(agent => 
    agent.id !== excludeAgentId
  );

  useClickOutside(dropdownRef as React.RefObject<HTMLElement>, () => setIsOpen(false), isOpen);

  if (loading) {
    return <SelectorSkeleton isLight={isLight} />;
  }

  if (disabled) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 text-xs rounded min-h-[32px] border opacity-60',
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

  const selectedAgent = agents.find(agent => agent.id === selectedAgentId);

  const handleSelect = (agentId: string | null) => {
    onChange(agentId);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {!hideLabel && (
      <div className="mb-1">
        <span className={cn('text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}>
            {customLabel || auxInfo.label}
        </span>
      </div>
      )}
      
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 text-xs rounded min-h-[32px] min-w-0 w-full border',
          isLight
            ? 'text-gray-700 hover:bg-gray-100 border-gray-300 bg-white'
            : 'text-gray-200 hover:bg-gray-700 border-gray-600 bg-[#151C24]',
        )}
      >
        <span className="flex-shrink-0">
          <AgentIcon />
        </span>
        
        {selectedAgent ? (
          <span className="flex-1 min-w-0 text-left">
            <span className="font-medium truncate">{selectedAgent.agentName}</span>
          </span>
        ) : (
          <span className={cn('flex-1 min-w-0 text-left', isLight ? 'text-gray-500' : 'text-gray-400')}>
            Not configured
          </span>
        )}
        
        <ChevronDownIcon isOpen={isOpen} className="flex-shrink-0" />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 w-full min-w-[200px] rounded border shadow-lg z-[10000] max-h-[200px] overflow-y-auto',
            dropdownPosition === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
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
              'flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs transition-colors',
              !selectedAgentId
                ? isLight
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'bg-blue-900/30 text-blue-300 font-medium'
                : isLight
                  ? 'text-gray-700 hover:bg-gray-100'
                  : 'text-gray-200 hover:bg-gray-700'
            )}
          >
            <span className="flex-shrink-0">
              <CloseIcon size={12} strokeWidth={2} />
            </span>
            <span className="truncate flex-1 text-left">Not configured</span>
          </button>

          {availableAgents.length === 0 ? (
            <div className={cn('px-3 py-2 text-xs', isLight ? 'text-gray-500' : 'text-gray-400')}>
              No agents available
            </div>
          ) : (
            availableAgents.map(agent => {
              const isSelected = agent.id === selectedAgentId;
              return (
                <button
                  type="button"
                  key={agent.id}
                  onClick={() => handleSelect(agent.id)}
                  className={cn(
                    'flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs transition-colors',
                    isSelected
                      ? isLight
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'bg-blue-900/30 text-blue-300 font-medium'
                      : isLight
                        ? 'text-gray-700 hover:bg-gray-100'
                        : 'text-gray-200 hover:bg-gray-700'
                  )}
                >
                  <AgentIcon />
                  <span className="truncate flex-1 text-left">{agent.agentName}</span>
                  {isSelected && (
                    <CheckIcon className="ml-auto flex-shrink-0" />
                      )}
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

