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

/** Auto-set URLs for Adobe corp deployment. Reset restores to localhost (empty = DEFAULT in constants). */
const INITIAL_API_URL = 'http://api.handsoff.corp.adobe.com:3001';
const INITIAL_BACKEND_URL = 'http://api.handsoff.corp.adobe.com:8001';

const storage = createStorage<ApiConfigStateType>(
  'api-config-storage-key',
  {
    apiUrl: INITIAL_API_URL,
    backendUrl: INITIAL_BACKEND_URL,
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
