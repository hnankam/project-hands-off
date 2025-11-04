import { createStorage, StorageEnum } from '../base/index.js';

export interface PreferencesStateType {
  showAgentCursor: boolean;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
}

export type PreferencesStorageType = ReturnType<typeof createStorage<PreferencesStateType>> & {
  setShowAgentCursor: (show: boolean) => Promise<void>;
  toggleShowAgentCursor: () => Promise<void>;
  setShowSuggestions: (show: boolean) => Promise<void>;
  toggleShowSuggestions: () => Promise<void>;
  setShowThoughtBlocks: (show: boolean) => Promise<void>;
  toggleShowThoughtBlocks: () => Promise<void>;
};

const storage = createStorage<PreferencesStateType>(
  'preferences-storage-key',
  {
    showAgentCursor: true, // Default to showing agent cursor
    showSuggestions: true, // Default to showing suggestions
    showThoughtBlocks: true, // Default to showing thought blocks
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
};

