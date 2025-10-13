import { createStorage, StorageEnum } from '../base/index.js';
import type { ThemeStateType, ThemeStorageType } from '../base/index.js';

// Helper to detect system theme preference
const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

// Helper to determine if theme should show as light
const getIsLight = (theme: 'light' | 'dark' | 'system'): boolean => {
  if (theme === 'system') {
    return getSystemTheme() === 'light';
  }
  return theme === 'light';
};

const storage = createStorage<ThemeStateType>(
  'theme-storage-key',
  {
    theme: 'system',
    isLight: getSystemTheme() === 'light',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const exampleThemeStorage: ThemeStorageType = {
  ...storage,
  toggle: async () => {
    await storage.set(currentState => {
      let newTheme: 'light' | 'dark' | 'system';
      
      // Cycle through: light → dark → system → light
      if (currentState.theme === 'light') {
        newTheme = 'dark';
      } else if (currentState.theme === 'dark') {
        newTheme = 'system';
      } else {
        newTheme = 'light';
      }

      return {
        theme: newTheme,
        isLight: getIsLight(newTheme),
      };
    });
  },
  setTheme: async (theme: 'light' | 'dark' | 'system') => {
    await storage.set(() => ({
      theme,
      isLight: getIsLight(theme),
    }));
  },
};
