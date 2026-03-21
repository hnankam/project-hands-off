import { isExtensionContext } from '@extension/platform';
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

/**
 * Extension: Adobe corp defaults (Options page can override).
 * Web / non-extension: empty → `CEB_API_URL` / `CEB_BACKEND_URL` from .env via constants (avoids CORS to corp from localhost).
 */
function getInitialApiConfig(): ApiConfigStateType {
  if (isExtensionContext()) {
    return {
      apiUrl: 'http://api.handsoff.corp.adobe.com:3001',
      backendUrl: 'http://api.handsoff.corp.adobe.com:8001',
    };
  }
  return { apiUrl: '', backendUrl: '' };
}

const storage = createStorage<ApiConfigStateType>('api-config-storage-key', getInitialApiConfig(), {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

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
