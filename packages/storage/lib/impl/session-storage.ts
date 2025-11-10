import { createStorage, StorageEnum } from '../base/index.js';

// Generate random but intelligible session names
const generateSessionName = (): string => {
  const adjectives = [
    'Quick', 'Bright', 'Smart', 'Swift', 'Creative', 'Clever', 'Agile', 'Bold',
    'Wise', 'Sharp', 'Active', 'Dynamic', 'Keen', 'Lively', 'Vivid', 'Calm',
    'Fresh', 'Elegant', 'Nimble', 'Stellar', 'Epic', 'Prime', 'Noble', 'Pure'
  ];
  
  const nouns = [
    'Task', 'Project', 'Query', 'Session', 'Work', 'Flow', 'Quest', 'Mission',
    'Plan', 'Goal', 'Idea', 'Topic', 'Thread', 'Path', 'Journey', 'Sprint',
    'Focus', 'Draft', 'Sketch', 'Study', 'Research', 'Review', 'Build', 'Design'
  ];
  
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  
  return `${randomAdjective} ${randomNoun}`;
};

// CopilotKit Message type (re-exported from @copilotkit/shared)
// This supports the full Message type from ag-ui/core
export type CopilotMessage = any; // Will be properly typed when used with @copilotkit types

export interface UsageStats {
  request: number;      // Total input tokens
  response: number;     // Total output tokens
  total: number;        // Total tokens
  requestCount: number; // Number of requests
}

export interface AgentStepState {
  sessionId?: string;
  steps: {
    description: string;
    status: "pending" | "running" | "completed" | "failed" | "deleted";
  }[];
}

export interface SessionType {
  id: string;
  title: string;
  timestamp: number;
  isActive: boolean;
  isOpen: boolean; // Tracks if the session is open in the tab bar
  allMessages?: CopilotMessage[]; // Stores ALL messages from CopilotKit (including thinking messages)
  selectedAgent?: string; // Agent type (general, wiki, sharepoint, etc.)
  selectedModel?: string; // Model name (gemini-2.5-flash-lite, claude-4.1-opus, etc.)
  usageStats?: UsageStats; // Token usage statistics
  agentStepState?: AgentStepState; // Agent step state for progress tracking
}

export interface SessionStateType {
  sessions: SessionType[];
  currentSessionId: string | null;
}

export type SessionStorageType = ReturnType<typeof createStorage<SessionStateType>> & {
  addSession: (title: string) => Promise<void>;
  setActiveSession: (sessionId: string) => Promise<void>;
  closeSession: (sessionId: string) => Promise<void>;
  openAllSessions: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  updateSessionAgentAndModel: (sessionId: string, agent: string, model: string) => Promise<void>;
  updateUsageStats: (sessionId: string, usage: UsageStats) => Promise<void>;
  getUsageStats: (sessionId: string) => UsageStats | null;
  updateAgentStepState: (sessionId: string, agentStepState: AgentStepState) => Promise<void>;
  getAgentStepState: (sessionId: string) => AgentStepState | null;
  // Message storage methods
  updateAllMessages: (sessionId: string, messages: CopilotMessage[]) => Promise<void>;
  getAllMessages: (sessionId: string) => CopilotMessage[];
};

const storage = createStorage<SessionStateType>(
  'session-storage-key',
  {
    sessions: [],
    currentSessionId: null,
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const sessionStorage: SessionStorageType = {
  ...storage,
  addSession: async (title: string) => {
    await storage.set(currentState => {
      // Find the last selected agent and model from existing sessions
      // Look for the most recent session with a selected model
      let lastSelectedAgent = 'general'; // Default agent
      let lastSelectedModel = 'claude-4.5-haiku'; // Default model
      
      if (currentState.sessions.length > 0) {
        // Sort sessions by timestamp (most recent first)
        const sortedSessions = [...currentState.sessions].sort((a, b) => b.timestamp - a.timestamp);
        
        // Find the first session with a selected model
        const sessionWithModel = sortedSessions.find(s => s.selectedModel);
        
        if (sessionWithModel) {
          lastSelectedAgent = sessionWithModel.selectedAgent || lastSelectedAgent;
          lastSelectedModel = sessionWithModel.selectedModel || lastSelectedModel;
        }
      }
      
      const newSession: SessionType = {
        id: `session-${Date.now()}`,
        title,
        timestamp: Date.now(),
        isActive: true,
        isOpen: true, // New sessions are open by default
        allMessages: [],
        selectedAgent: lastSelectedAgent,
        selectedModel: lastSelectedModel,
      };

      // Deactivate all other sessions
      const updatedSessions = currentState.sessions.map(session => ({
        ...session,
        isActive: false,
      }));

      return {
        sessions: [...updatedSessions, newSession],
        currentSessionId: newSession.id,
      };
    });
  },
  setActiveSession: async (sessionId: string) => {
    await storage.set(currentState => {
      const updatedSessions = currentState.sessions.map(session => ({
        ...session,
        isActive: session.id === sessionId,
        isOpen: session.isOpen || session.id === sessionId, // Re-open if it was closed
      }));

      return {
        sessions: updatedSessions,
        currentSessionId: sessionId,
      };
    });
  },
  closeSession: async (sessionId: string) => {
    await storage.set(currentState => {
      let newCurrentSessionId = currentState.currentSessionId;
      const sessions = currentState.sessions;

      const updatedSessions = sessions.map(session => {
        if (session.id === sessionId) {
          return { ...session, isOpen: false, isActive: false };
        }
        return session;
      });

      // If the closed session was the active one, find a new active session
      if (currentState.currentSessionId === sessionId) {
        // Find the last open session to make it active
        const lastOpenSession = updatedSessions.filter(s => s.isOpen).pop();
        
        if (lastOpenSession) {
          newCurrentSessionId = lastOpenSession.id;
          // Update the isActive status for the new active session
          for (let i = 0; i < updatedSessions.length; i++) {
            if (updatedSessions[i].id === newCurrentSessionId) {
              updatedSessions[i].isActive = true;
            }
          }
        } else {
          // No open sessions remain - create a new session automatically
          // Find the last selected agent and model from existing sessions
          let lastSelectedAgent = 'general'; // Default agent
          let lastSelectedModel = 'claude-4.5-haiku'; // Default model
          
          if (updatedSessions.length > 0) {
            // Sort sessions by timestamp (most recent first)
            const sortedSessions = [...updatedSessions].sort((a, b) => b.timestamp - a.timestamp);
            
            // Find the first session with a selected model
            const sessionWithModel = sortedSessions.find(s => s.selectedModel);
            
            if (sessionWithModel) {
              lastSelectedAgent = sessionWithModel.selectedAgent || lastSelectedAgent;
              lastSelectedModel = sessionWithModel.selectedModel || lastSelectedModel;
            }
          }
          
          const newSession: SessionType = {
            id: `session-${Date.now()}`,
            title: generateSessionName(),
            timestamp: Date.now(),
            isActive: true,
            isOpen: true,
            allMessages: [],
            selectedAgent: lastSelectedAgent,
            selectedModel: lastSelectedModel,
          };
          
          newCurrentSessionId = newSession.id;
          updatedSessions.push(newSession);
        }
      }
      
      return {
        sessions: updatedSessions,
        currentSessionId: newCurrentSessionId,
      };
    });
  },
  openAllSessions: async () => {
    await storage.set(currentState => {
      const updatedSessions = currentState.sessions.map(session => ({
        ...session,
        isOpen: true,
      }));

      return {
        sessions: updatedSessions,
        currentSessionId: currentState.currentSessionId,
      };
    });
  },
  deleteSession: async (sessionId: string) => {
    // Clean up chat messages for this session
    const CHAT_STORAGE_KEY = 'copilot-chat-messages';
    try {
      const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
      const storedData = result[CHAT_STORAGE_KEY] || {};
      delete storedData[sessionId];
      await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: storedData });
    } catch (error) {
      console.error('[SessionStorage] Failed to clean up chat data:', error);
    }

    await storage.set(currentState => {
      const updatedSessions = currentState.sessions.filter(session => session.id !== sessionId);
      let newCurrentSessionId = currentState.currentSessionId;

      // If we're deleting the current session, set the first remaining session as active
      if (currentState.currentSessionId === sessionId) {
        newCurrentSessionId = updatedSessions.length > 0 ? updatedSessions[0].id : null;
        if (newCurrentSessionId) {
          updatedSessions[0].isActive = true;
        }
      }

      return {
        sessions: updatedSessions,
        currentSessionId: newCurrentSessionId,
      };
    });
  },
  updateSessionTitle: async (sessionId: string, title: string) => {
    await storage.set(currentState => {
      const updatedSessions = currentState.sessions.map(session =>
        session.id === sessionId ? { ...session, title } : session
      );

      return {
        ...currentState,
        sessions: updatedSessions,
      };
    });
  },
  updateSessionAgentAndModel: async (sessionId: string, agent: string, model: string) => {
    await storage.set(currentState => {
      const updatedSessions = currentState.sessions.map(session =>
        session.id === sessionId ? { ...session, selectedAgent: agent, selectedModel: model } : session
      );

      return {
        ...currentState,
        sessions: updatedSessions,
      };
    });
  },
  updateUsageStats: async (sessionId: string, usage: UsageStats) => {
    await storage.set(currentState => {
      const updatedSessions = currentState.sessions.map(session =>
        session.id === sessionId ? { ...session, usageStats: usage } : session
      );

      return {
        ...currentState,
        sessions: updatedSessions,
      };
    });
  },
  getUsageStats: (sessionId: string) => {
    const currentState = storage.getSnapshot();
    if (!currentState) return null;
    
    const session = currentState.sessions.find(s => s.id === sessionId);
    return session?.usageStats || null;
  },
  updateAgentStepState: async (sessionId: string, agentStepState: AgentStepState) => {
    await storage.set(currentState => {
      const updatedSessions = currentState.sessions.map(session =>
        session.id === sessionId ? { ...session, agentStepState } : session
      );

      return {
        ...currentState,
        sessions: updatedSessions,
      };
    });
  },
  getAgentStepState: (sessionId: string) => {
    const currentState = storage.getSnapshot();
    if (!currentState) return null;
    
    const session = currentState.sessions.find(s => s.id === sessionId);
    return session?.agentStepState || null;
  },
  updateAllMessages: async (sessionId: string, messages: CopilotMessage[]) => {
    await storage.set(currentState => {
      const updatedSessions = currentState.sessions.map(session =>
        session.id === sessionId ? { ...session, allMessages: messages } : session
      );

      return {
        ...currentState,
        sessions: updatedSessions,
      };
    });
  },
  getAllMessages: (sessionId: string) => {
    const currentState = storage.getSnapshot();
    if (!currentState) return [];
    
    const session = currentState.sessions.find(s => s.id === sessionId);
    return session?.allMessages || [];
  },
};
