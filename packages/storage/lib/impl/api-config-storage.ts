import { createStorage, StorageEnum } from '../base/index.js';

export interface ApiConfigStateType {
  apiUrl: string;
  backendUrl: string;
}

export type ApiConfigStorageType = ReturnType<typeof createStorage<ApiConfigStateType>> & {
  setApiUrl: (url: string) => Promise<void>;
  setBackendUrl: (url: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
};

const storage = createStorage<ApiConfigStateType>(
  'api-config-storage-key',
  {
    apiUrl: '',
    backendUrl: '',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const apiConfigStorage: ApiConfigStorageType = {
  ...storage,
  setApiUrl: async (url: string) => {
    await storage.set(currentState => ({
      ...currentState,
      apiUrl: url.replace(/\/+$/, ''),
    }));
  },
  setBackendUrl: async (url: string) => {
    await storage.set(currentState => ({
      ...currentState,
      backendUrl: url.replace(/\/+$/, ''),
    }));
  },
  resetToDefaults: async () => {
    await storage.set(() => ({
      apiUrl: '',
      backendUrl: '',
    }));
  },
};
