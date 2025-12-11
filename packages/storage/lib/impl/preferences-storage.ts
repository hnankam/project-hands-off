import { createStorage, StorageEnum } from '../base/index.js';

export type ChatFontSize = 'small' | 'medium' | 'large';

export interface PreferencesStateType {
  showAgentCursor: boolean;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  agentModeChat: boolean;
  chatFontSize: ChatFontSize;
}

export type PreferencesStorageType = ReturnType<typeof createStorage<PreferencesStateType>> & {
  setShowAgentCursor: (show: boolean) => Promise<void>;
  toggleShowAgentCursor: () => Promise<void>;
  setShowSuggestions: (show: boolean) => Promise<void>;
  toggleShowSuggestions: () => Promise<void>;
  setShowThoughtBlocks: (show: boolean) => Promise<void>;
  toggleShowThoughtBlocks: () => Promise<void>;
  setAgentModeChat: (enabled: boolean) => Promise<void>;
  toggleAgentModeChat: () => Promise<void>;
  setChatFontSize: (size: ChatFontSize) => Promise<void>;
};

const storage = createStorage<PreferencesStateType>(
  'preferences-storage-key',
  {
    showAgentCursor: true, // Default to showing agent cursor
    showSuggestions: true, // Default to showing suggestions
    showThoughtBlocks: true, // Default to showing thought blocks
    agentModeChat: false, // Default to disabled (normal chat mode)
    chatFontSize: 'medium', // Default to medium font size
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const preferencesStorage: PreferencesStorageType = {
  ...storage,
  setShowAgentCursor: async (show: boolean) => {
    await storage.set(currentState => ({
      ...currentState,
      showAgentCursor: show,
    }));
  },
  toggleShowAgentCursor: async () => {
    await storage.set(currentState => ({
      ...currentState,
      showAgentCursor: !currentState.showAgentCursor,
    }));
  },
  setShowSuggestions: async (show: boolean) => {
    await storage.set(currentState => ({
      ...currentState,
      showSuggestions: show,
    }));
  },
  toggleShowSuggestions: async () => {
    await storage.set(currentState => ({
      ...currentState,
      showSuggestions: !currentState.showSuggestions,
    }));
  },
  setShowThoughtBlocks: async (show: boolean) => {
    await storage.set(currentState => ({
      ...currentState,
      showThoughtBlocks: show,
    }));
  },
  toggleShowThoughtBlocks: async () => {
    await storage.set(currentState => ({
      ...currentState,
      showThoughtBlocks: !currentState.showThoughtBlocks,
    }));
  },
  setAgentModeChat: async (enabled: boolean) => {
    await storage.set(currentState => ({
      ...currentState,
      agentModeChat: enabled,
    }));
  },
  toggleAgentModeChat: async () => {
    await storage.set(currentState => ({
      ...currentState,
      agentModeChat: !currentState.agentModeChat,
    }));
  },
  setChatFontSize: async (size: ChatFontSize) => {
    await storage.set(currentState => ({
      ...currentState,
      chatFontSize: size,
    }));
  },
};

