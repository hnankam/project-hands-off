import { createStorage, StorageEnum } from '../base/index.js';

export interface PreferencesStateType {
  showAgentCursor: boolean;
  showSuggestions: boolean;
}

export type PreferencesStorageType = ReturnType<typeof createStorage<PreferencesStateType>> & {
  setShowAgentCursor: (show: boolean) => Promise<void>;
  toggleShowAgentCursor: () => Promise<void>;
  setShowSuggestions: (show: boolean) => Promise<void>;
  toggleShowSuggestions: () => Promise<void>;
};

const storage = createStorage<PreferencesStateType>(
  'preferences-storage-key',
  {
    showAgentCursor: true, // Default to showing agent cursor
    showSuggestions: true, // Default to showing suggestions
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
};

