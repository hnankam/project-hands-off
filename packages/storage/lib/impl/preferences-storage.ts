import { createStorage, StorageEnum } from '../base/index.js';

export type ChatFontSize = 'small' | 'medium' | 'large';

/**
 * User-specific org/team preferences
 * Stored per-user to persist across sign-outs and support user switching
 */
export interface UserOrgTeamPrefs {
  lastSelectedOrgId: string | null;
  lastSelectedTeamId: string | null;
  updatedAt: number;
}

export interface PreferencesStateType {
  showAgentCursor: boolean;
  showSuggestions: boolean;
  showThoughtBlocks: boolean;
  agentModeChat: boolean;
  chatFontSize: ChatFontSize;
  // User-specific org/team preferences, keyed by userId
  userOrgTeamPrefs: Record<string, UserOrgTeamPrefs>;
  // Track last logged in user for detecting user switches
  lastUserId: string | null;
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
  // User-specific org/team preferences
  getUserOrgTeamPrefs: (userId: string) => Promise<UserOrgTeamPrefs | null>;
  setUserOrgTeamPrefs: (userId: string, prefs: Partial<UserOrgTeamPrefs>) => Promise<void>;
  setLastSelectedOrg: (userId: string, orgId: string | null) => Promise<void>;
  setLastSelectedTeam: (userId: string, teamId: string | null) => Promise<void>;
  clearUserOrgTeamPrefs: (userId: string) => Promise<void>;
  // Last user tracking
  getLastUserId: () => Promise<string | null>;
  setLastUserId: (userId: string | null) => Promise<void>;
  hasUserChanged: (currentUserId: string | null) => Promise<boolean>;
};

const storage = createStorage<PreferencesStateType>(
  'preferences-storage-key',
  {
    showAgentCursor: true, // Default to showing agent cursor
    showSuggestions: true, // Default to showing suggestions
    showThoughtBlocks: true, // Default to showing thought blocks
    agentModeChat: false, // Default to disabled (normal chat mode)
    chatFontSize: 'medium', // Default to medium font size
    userOrgTeamPrefs: {}, // User-specific org/team preferences
    lastUserId: null, // Track last logged in user
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
  
  // ============================================================================
  // User-specific org/team preferences
  // These persist across sign-outs and support user switching
  // ============================================================================
  
  getUserOrgTeamPrefs: async (userId: string): Promise<UserOrgTeamPrefs | null> => {
    const state = await storage.get();
    // Handle case where userOrgTeamPrefs doesn't exist (older storage versions)
    return state.userOrgTeamPrefs?.[userId] || null;
  },
  
  setUserOrgTeamPrefs: async (userId: string, prefs: Partial<UserOrgTeamPrefs>) => {
    await storage.set(currentState => {
      const userPrefs = currentState.userOrgTeamPrefs || {};
      const existing = userPrefs[userId] || {
        lastSelectedOrgId: null,
        lastSelectedTeamId: null,
        updatedAt: 0,
      };
      return {
        ...currentState,
        userOrgTeamPrefs: {
          ...userPrefs,
          [userId]: {
            ...existing,
            ...prefs,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },
  
  setLastSelectedOrg: async (userId: string, orgId: string | null) => {
    await storage.set(currentState => {
      const userPrefs = currentState.userOrgTeamPrefs || {};
      const existing = userPrefs[userId] || {
        lastSelectedOrgId: null,
        lastSelectedTeamId: null,
        updatedAt: 0,
      };
      return {
        ...currentState,
        userOrgTeamPrefs: {
          ...userPrefs,
          [userId]: {
            ...existing,
            lastSelectedOrgId: orgId,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },
  
  setLastSelectedTeam: async (userId: string, teamId: string | null) => {
    await storage.set(currentState => {
      const userPrefs = currentState.userOrgTeamPrefs || {};
      const existing = userPrefs[userId] || {
        lastSelectedOrgId: null,
        lastSelectedTeamId: null,
        updatedAt: 0,
      };
      return {
        ...currentState,
        userOrgTeamPrefs: {
          ...userPrefs,
          [userId]: {
            ...existing,
            lastSelectedTeamId: teamId,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },
  
  clearUserOrgTeamPrefs: async (userId: string) => {
    await storage.set(currentState => {
      const userPrefs = currentState.userOrgTeamPrefs || {};
      const { [userId]: _, ...rest } = userPrefs;
      return {
        ...currentState,
        userOrgTeamPrefs: rest,
      };
    });
  },
  
  // ============================================================================
  // Last user tracking for detecting user switches
  // ============================================================================
  
  getLastUserId: async (): Promise<string | null> => {
    const state = await storage.get();
    return state.lastUserId;
  },
  
  setLastUserId: async (userId: string | null) => {
    await storage.set(currentState => ({
      ...currentState,
      lastUserId: userId,
    }));
  },
  
  hasUserChanged: async (currentUserId: string | null): Promise<boolean> => {
    const state = await storage.get();
    const lastUserId = state.lastUserId;
    // If no last user, it's a new session (not a user change)
    if (!lastUserId) return false;
    // If current user is different from last user
    return currentUserId !== lastUserId;
  },
};

