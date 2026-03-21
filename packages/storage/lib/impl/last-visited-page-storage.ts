import { createStorage, StorageEnum } from '../base/index.js';

export type LastVisitedPage = 'home' | 'sessions' | 'admin';

/**
 * Persists last main app page (hash routing companion) for extension and web.
 */
export const lastVisitedPageStorage = createStorage<LastVisitedPage>('lastVisitedPage', 'sessions', {
  storageEnum: StorageEnum.Local,
  liveUpdate: false,
});
