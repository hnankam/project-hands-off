import React from 'react';
import { cn } from '@extension/ui';
import { AgentSelector } from './AgentSelector';
import { ModelSelector } from './ModelSelector';
import { SettingsDropdown } from './SettingsDropdown';
import InfoMenu from './InfoMenu';

interface SelectorsBarProps {
  isLight: boolean;
  selectedAgent: string;
  selectedModel: string;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  onAgentChange: (agent: string) => void;
  onModelChange: (model: string) => void;
  onShowSuggestionsChange: (show: boolean) => void;
  onShowThoughtBlocksChange: (show: boolean) => void;
  onExpandSettingsClick: () => void;
}

export const SelectorsBar: React.FC<SelectorsBarProps> = ({
  isLight,
  selectedAgent,
  selectedModel,
  showSuggestions,
  showThoughtBlocks,
  onAgentChange,
  onModelChange,
  onShowSuggestionsChange,
  onShowThoughtBlocksChange,
  onExpandSettingsClick,
}) => {
  const [agents, setAgents] = React.useState<Array<{ id: string; allowedModels?: string[] | null }>>([]);
  
  // Fetch agents to get their allowed models
  React.useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/config/agents`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setAgents(data.agents || []);
        }
      } catch (error) {
        console.error('[SelectorsBar] Failed to fetch agents:', error);
      }
    };
    fetchAgents();
  }, []);
  
  return (
    <div 
      className={cn(
        'px-2 py-1.5 flex gap-1 items-center justify-between',
        isLight 
          ? 'bg-gray-50 border-t border-gray-200' 
          : 'bg-[#151C24] border-t border-gray-700'
      )}
    >
      {/* Left side: Agent and Model Selectors */}
      <div className="flex gap-1 items-center flex-1 min-w-0">
        <AgentSelector
          isLight={isLight}
          selectedAgent={selectedAgent}
          onAgentChange={onAgentChange}
        />
        <ModelSelector
          isLight={isLight}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          selectedAgent={selectedAgent}
          agents={agents}
        />
      </div>

      {/* Right side: Settings Dropdown and Info Menu */}
      <div className="flex items-center gap-1">
        <SettingsDropdown
          isLight={isLight}
          showSuggestions={showSuggestions}
          showThoughtBlocks={showThoughtBlocks}
          onShowSuggestionsChange={onShowSuggestionsChange}
          onShowThoughtBlocksChange={onShowThoughtBlocksChange}
          onExpandClick={onExpandSettingsClick}
        />
        <InfoMenu isLight={isLight} />
      </div>
    </div>
  );
};

