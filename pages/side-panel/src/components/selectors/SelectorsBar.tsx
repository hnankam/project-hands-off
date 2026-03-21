import * as React from 'react';
import { useMemo } from 'react';
import { getAppVersion } from '@extension/platform';
import { cn } from '@extension/ui';
import { AgentSelector } from './AgentSelector';
import { ModelSelector } from './ModelSelector';
import { SettingsDropdown } from '../menus/SettingsDropdown';
import InfoMenu from '../menus/InfoMenu';
import { useAgentsConfigForModelSelector } from '../../hooks/useAgentsConfigForModelSelector';
import { RequiredWorkspaceCredentialsBanner } from '../chat/RequiredWorkspaceCredentialsBanner';
import { getMissingRequiredWorkspaceCredentials } from '../../utils/requiredWorkspaceCredentials';

interface SelectorsBarProps {
  isLight: boolean;
  selectedAgent: string;
  selectedModel: string;
  isLoadingSession?: boolean;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  onAgentChange: (agent: string) => void;
  onModelChange: (model: string) => void;
  onShowSuggestionsChange: (show: boolean) => void;
  onShowThoughtBlocksChange: (show: boolean) => void;
  onExpandSettingsClick: () => void;
  /** In popup/new tab/fullscreen, agent/model live in the chat input bar instead */
  showAgentAndModelSelectors?: boolean;
  /** Selected workspace credentials (metadata only) for required-credential warnings */
  selectedCredentials?: Array<{ type?: string | null }>;
}

export const SelectorsBar: React.FC<SelectorsBarProps> = ({
  isLight,
  selectedAgent,
  selectedModel,
  isLoadingSession = false,
  showSuggestions,
  showThoughtBlocks,
  onAgentChange,
  onModelChange,
  onShowSuggestionsChange,
  onShowThoughtBlocksChange,
  onExpandSettingsClick,
  showAgentAndModelSelectors = true,
  selectedCredentials = [],
}) => {
  const agents = useAgentsConfigForModelSelector(true);
  const extensionVersion = getAppVersion();

  const missingRequiredWorkspaceCredentials = useMemo(() => {
    const agentId = selectedAgent?.trim();
    if (!agentId) return [];
    const entry = agents.find(a => a.id === agentId);
    const req = entry?.requiredWorkspaceCredentials;
    if (!req?.length) return [];
    return getMissingRequiredWorkspaceCredentials(req, selectedCredentials);
  }, [selectedAgent, agents, selectedCredentials]);

  return (
    <div
      className={cn(
        'flex min-h-0 w-full flex-shrink-0 flex-col',
        isLight ? 'border-t border-gray-200' : 'border-t border-gray-700',
      )}>
      <RequiredWorkspaceCredentialsBanner isLight={isLight} missing={missingRequiredWorkspaceCredentials} />
      <div
        className={cn(
          'flex h-[37px] min-h-[37px] items-center justify-between gap-1 px-3 py-1',
          isLight ? 'bg-gray-50' : 'bg-[#151C24]',
        )}>
        {/* Left: agent/model (side panel) or extension version (popup / tab / fullscreen — matches HomePage footer) */}
        <div className="flex min-h-0 min-w-0 flex-1 items-center gap-1">
          {showAgentAndModelSelectors ? (
            <>
              <AgentSelector
                isLight={isLight}
                selectedAgent={selectedAgent}
                isLoadingSession={isLoadingSession}
                onAgentChange={onAgentChange}
              />
              <ModelSelector
                isLight={isLight}
                selectedModel={selectedModel}
                isLoadingSession={isLoadingSession}
                onModelChange={onModelChange}
                selectedAgent={selectedAgent}
                agents={agents}
              />
            </>
          ) : (
            <div
              className={cn('truncate text-xs font-medium', isLight ? 'text-gray-700' : 'text-gray-300')}
              title={`v ${extensionVersion}`}>
              v {extensionVersion}
            </div>
          )}
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
    </div>
  );
};
