import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CopilotKit, useCopilotChatHeadless_c } from '@copilotkit/react-core';
import { sessionStorageDBWrapper } from '@extension/shared';

type RuntimeConfig = {
  sessionId: string;
  agentType: string;
  modelType: string;
  organizationId?: string;
  teamId?: string;
  runtimeUrl: string;
  publicApiKey: string;
};

type RuntimeState = {
  isInProgress: boolean;
  messagesSignature: string;
  lastUpdated: number;
};

type PortalRenderer = () => ReactNode;

type RuntimeRecord = {
  config: RuntimeConfig;
  container: HTMLElement | null;
  renderContent: PortalRenderer | null;
  state: RuntimeState;
};

type SessionRuntimeContextValue = {
  ensureRuntime: (config: RuntimeConfig) => void;
  attachPortal: (sessionId: string, container: HTMLElement, renderer: PortalRenderer) => void;
  detachPortal: (sessionId: string, container: HTMLElement) => void;
  updateRuntimeState: (sessionId: string, updater: (previous: RuntimeState) => RuntimeState) => void;
  getRuntimeState: (sessionId: string) => RuntimeState | null;
};

const SessionRuntimeContext = createContext<SessionRuntimeContextValue | null>(null);

const defaultRuntimeState: RuntimeState = {
  isInProgress: false,
  messagesSignature: '',
  lastUpdated: 0,
};

type RuntimeMap = Record<string, RuntimeRecord>;

export const SessionRuntimeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [runtimes, setRuntimes] = useState<RuntimeMap>({});
  const runtimesRef = useRef<RuntimeMap>({});
  const renderCountRef = useRef(0);

  renderCountRef.current += 1;
  // console.log(`[SessionRuntimeProvider] Render #${renderCountRef.current}`, {
  //   runtimeCount: Object.keys(runtimes).length,
  //   runtimeSessions: Object.keys(runtimes).map(id => id.slice(0, 8)),
  // });

  useEffect(() => {
    runtimesRef.current = runtimes;
  }, [runtimes]);

  const ensureRuntime = useCallback((config: RuntimeConfig) => {
    console.log(`[SessionRuntimeProvider] ensureRuntime called for ${config.sessionId.slice(0, 8)}`);
    setRuntimes(prev => {
      const existing = prev[config.sessionId];
      if (existing && shallowEqualRuntimeConfig(existing.config, config)) {
        console.log(`[SessionRuntimeProvider] Runtime config unchanged for ${config.sessionId.slice(0, 8)}`);
        return prev;
      }

      console.log(`[SessionRuntimeProvider] Creating/updating runtime for ${config.sessionId.slice(0, 8)}`);
      return {
        ...prev,
        [config.sessionId]: {
          config,
          container: existing?.container ?? null,
          renderContent: existing?.renderContent ?? null,
          state: existing?.state ?? defaultRuntimeState,
        },
      };
    });
  }, []);

  const attachPortal = useCallback((sessionId: string, container: HTMLElement, renderer: PortalRenderer) => {
    setRuntimes(prev => {
      const record = prev[sessionId];
      if (!record) {
        return prev;
      }

      return {
        ...prev,
        [sessionId]: {
          ...record,
          container,
          renderContent: renderer,
        },
      };
    });
  }, []);

  const detachPortal = useCallback((sessionId: string, container: HTMLElement) => {
    setRuntimes(prev => {
      const record = prev[sessionId];
      if (!record || record.container !== container) {
        return prev;
      }

      return {
        ...prev,
        [sessionId]: {
          ...record,
          container: null,
          renderContent: null,
        },
      };
    });
  }, []);

  const updateRuntimeState = useCallback((sessionId: string, updater: (previous: RuntimeState) => RuntimeState) => {
    setRuntimes(prev => {
      const record = prev[sessionId];
      if (!record) {
        return prev;
      }

      const nextState = updater(record.state);
      if (record.state === nextState) {
        return prev;
      }
      if (shallowEqualRuntimeState(record.state, nextState)) {
        return prev;
      }

      return {
        ...prev,
        [sessionId]: {
          ...record,
          state: nextState,
        },
      };
    });
  }, []);

  const getRuntimeState = useCallback(
    (sessionId: string) => {
      const record = runtimesRef.current[sessionId];
      return record ? record.state : null;
    },
    [],
  );

  const contextValue = useMemo<SessionRuntimeContextValue>(
    () => ({
      ensureRuntime,
      attachPortal,
      detachPortal,
      updateRuntimeState,
      getRuntimeState,
    }),
    [ensureRuntime, attachPortal, detachPortal, updateRuntimeState, getRuntimeState],
  );

  return (
    <SessionRuntimeContext.Provider value={contextValue}>
      {children}
      {/* Runtime hosts */}
      {Object.values(runtimes).map(runtime => (
        <SessionRuntimeHost key={runtime.config.sessionId} runtime={runtime} updateRuntimeState={updateRuntimeState} />
      ))}
    </SessionRuntimeContext.Provider>
  );
};

type SessionRuntimeHostProps = {
  runtime: RuntimeRecord;
  updateRuntimeState: (sessionId: string, updater: (previous: RuntimeState) => RuntimeState) => void;
};

const SessionRuntimeHost: React.FC<SessionRuntimeHostProps> = ({ runtime, updateRuntimeState }) => {
  const { config, container, renderContent } = runtime;
  const renderCountRef = useRef(0);

  renderCountRef.current += 1;
  // console.log(`[SessionRuntimeHost:${config.sessionId.slice(0, 8)}] Render #${renderCountRef.current}`, {
  //   hasContainer: !!container,
  //   hasRenderContent: !!renderContent,
  //   agentType: config.agentType,
  //   modelType: config.modelType,
  // });

  if (!config.agentType || !config.modelType) {
    return null;
  }

  const copilotProps = {
    runtimeUrl: config.runtimeUrl,
    agent: 'dynamic_agent',
    headers: {
      'x-copilot-agent-type': config.agentType,
      'x-copilot-model-type': config.modelType,
      'x-copilot-thread-id': config.sessionId,
      ...(config.organizationId ? { 'x-copilot-organization-id': config.organizationId } : {}),
      ...(config.teamId ? { 'x-copilot-team-id': config.teamId } : {}),
    },
    publicLicenseKey: config.publicApiKey,
    showDevConsole: false,
    threadId: config.sessionId,
    transcribeAudioUrl: '/api/transcribe',
    textToSpeechUrl: '/api/tts',
    onError: (errorEvent: unknown) => {
      console.log('CopilotKit Event:', errorEvent);
    },
  } as const;

  return (
    <CopilotKit {...copilotProps}>
      <RuntimeStateBridge sessionId={config.sessionId} updateRuntimeState={updateRuntimeState} />
      {container && renderContent ? createPortal(renderContent(), container) : null}
    </CopilotKit>
  );
};

type RuntimeStateBridgeProps = {
  sessionId: string;
  updateRuntimeState: (sessionId: string, updater: (previous: RuntimeState) => RuntimeState) => void;
};

const RuntimeStateBridge: React.FC<RuntimeStateBridgeProps> = ({ sessionId, updateRuntimeState }) => {
  const { messages, isLoading } = useCopilotChatHeadless_c();
  const messagesSignatureRef = useRef('');
  const lastPersistedSignatureRef = useRef('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const renderCountRef = useRef(0);
  const previousMessagesCountRef = useRef<number>(0);
  const lastEmptyPersistAttemptRef = useRef<number>(0);
  const mountedAtRef = useRef<number>(Date.now());

  // Track renders
  renderCountRef.current += 1;
  // console.log(`[RuntimeStateBridge:${sessionId.slice(0, 8)}] Render #${renderCountRef.current}`, {
  //   messagesCount: messages.length,
  //   isLoading,
  // });

  const signature = useMemo(() => {
    try {
      const sig = JSON.stringify(
        messages.map(message => ({
          id: (message as any)?.id ?? null,
          role: (message as any)?.role ?? null,
          hash: typeof (message as any)?.content === 'string' ? (message as any).content.length : JSON.stringify((message as any)?.content ?? '').length,
        })),
      );
      // console.log(`[RuntimeStateBridge:${sessionId.slice(0, 8)}] Signature computed:`, sig.slice(0, 100));
      previousMessagesCountRef.current = messages.length;
      return sig;
    } catch {
      previousMessagesCountRef.current = messages.length;
      return `${messages.length}:${Date.now()}`;
    }
  }, [messages, sessionId]);

  useEffect(() => {
    // console.log(`[RuntimeStateBridge:${sessionId.slice(0, 8)}] State update effect`, {
    //   signatureChanged: messagesSignatureRef.current !== signature,
    //   isLoading,
    // });

    const signatureChanged = messagesSignatureRef.current !== signature;
    messagesSignatureRef.current = signature;

    if (signatureChanged || messagesSignatureRef.current !== signature || isLoading !== undefined) {
      updateRuntimeState(sessionId, previous => {
        if (previous.isInProgress === isLoading && previous.messagesSignature === signature) {
          return previous;
        }

        return {
          isInProgress: isLoading,
          messagesSignature: signature,
          lastUpdated: Date.now(),
        };
      });
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const delay = isLoading ? 120 : 0;

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (lastPersistedSignatureRef.current === signature) {
          return;
        }

        const sanitizedMessages = sanitizeMessages(messages);
        const hasMessages = sanitizedMessages.length > 0;
        const shouldPersistEmpty = !isLoading && sanitizedMessages.length === 0;
        const wasPreviouslyNonEmpty = previousMessagesCountRef.current > 0;

        // Avoid wiping storage due to transient empty buffers:
        // - Skip while streaming
        // - Skip immediate empty after previously non-empty unless it remains empty for a short grace window
        if (!hasMessages && !shouldPersistEmpty) {
          console.log(
            `[RuntimeStateBridge:${sessionId.slice(0, 8)}] Skipping persistence (streaming empty state)`,
          );
          return;
        }

        if (!hasMessages && shouldPersistEmpty && wasPreviouslyNonEmpty) {
          const now = Date.now();
          // 700ms grace period after detecting empty to avoid racing early mount/attach states
          if (now - lastEmptyPersistAttemptRef.current < 700) {
            console.log(
              `[RuntimeStateBridge:${sessionId.slice(0, 8)}] Deferring empty persistence during grace period`,
            );
            return;
          }
          lastEmptyPersistAttemptRef.current = now;
        }

        // If we're still within the first 1500ms of mount and messages are empty,
        // check storage; if storage already has messages, do not overwrite them with empty.
        if (!hasMessages && Date.now() - mountedAtRef.current < 1500) {
          try {
            const stored = await sessionStorageDBWrapper.getAllMessagesAsync(sessionId);
            if (Array.isArray(stored) && stored.length > 0) {
              console.log(
                `[RuntimeStateBridge:${sessionId.slice(0, 8)}] Preventing early empty overwrite; storage has ${stored.length} messages`,
              );
              return;
            }
          } catch (e) {
            console.warn('[RuntimeStateBridge] Failed to read stored messages during early-empty check', e);
          }
        }

        await sessionStorageDBWrapper.updateAllMessages(sessionId, sanitizedMessages);
        lastPersistedSignatureRef.current = signature;
      } catch (error) {
        console.error('[SessionRuntime] Failed to persist messages for session', sessionId, error);
      }
    }, delay);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [sessionId, signature, isLoading, messages, updateRuntimeState]);

  return null;
};

const sanitizeMessages = (messages: any[]) => {
  return messages
    .filter(message => message !== null && message !== undefined)
    .map(message => {
      try {
        return JSON.parse(JSON.stringify(message));
      } catch {
        return {
          id: (message as any)?.id,
          role: (message as any)?.role,
          content:
            typeof (message as any)?.content === 'string'
              ? (message as any).content
              : String((message as any)?.content ?? ''),
          createdAt: (message as any)?.createdAt,
          ...(message as any)?.toolCalls ? { toolCalls: (message as any).toolCalls } : {},
          ...(message as any)?.metadata ? { metadata: (message as any).metadata } : {},
        };
      }
    });
};

const shallowEqualRuntimeConfig = (a: RuntimeConfig, b: RuntimeConfig) => {
  return (
    a.sessionId === b.sessionId &&
    a.agentType === b.agentType &&
    a.modelType === b.modelType &&
    a.organizationId === b.organizationId &&
    a.teamId === b.teamId &&
    a.runtimeUrl === b.runtimeUrl &&
    a.publicApiKey === b.publicApiKey
  );
};

const shallowEqualRuntimeState = (a: RuntimeState, b: RuntimeState) => {
  return a.isInProgress === b.isInProgress && a.messagesSignature === b.messagesSignature && a.lastUpdated === b.lastUpdated;
};

export const useSessionRuntimeManager = () => {
  const context = useContext(SessionRuntimeContext);
  if (!context) {
    throw new Error('useSessionRuntimeManager must be used within a SessionRuntimeProvider');
  }
  return context;
};

export const useSessionRuntimeState = (sessionId: string): RuntimeState | null => {
  const manager = useSessionRuntimeManager();
  const [state, setState] = useState<RuntimeState | null>(() => manager.getRuntimeState(sessionId));
  const renderCountRef = useRef(0);

  renderCountRef.current += 1;
  // console.log(`[useSessionRuntimeState:${sessionId.slice(0, 8)}] Render #${renderCountRef.current}`, {
  //   hasState: !!state,
  //   isInProgress: state?.isInProgress,
  //   signatureLength: state?.messagesSignature?.length,
  // });

  useEffect(() => {
    console.log(`[useSessionRuntimeState:${sessionId.slice(0, 8)}] Initial state sync`);
    setState(manager.getRuntimeState(sessionId));
  }, [manager, sessionId]);

  useEffect(() => {
    console.log(`[useSessionRuntimeState:${sessionId.slice(0, 8)}] Starting polling interval`);
    const interval = setInterval(() => {
      const newState = manager.getRuntimeState(sessionId);
      setState(prevState => {
        if (!prevState && !newState) return prevState;
        if (
          prevState?.isInProgress === newState?.isInProgress &&
          prevState?.messagesSignature === newState?.messagesSignature
        ) {
          return prevState;
        }
        console.log(`[useSessionRuntimeState:${sessionId.slice(0, 8)}] Polling update`, {
          isInProgress: newState?.isInProgress,
          signatureChanged: prevState?.messagesSignature !== newState?.messagesSignature,
        });
        return newState;
      });
    }, 1000);

    return () => {
      console.log(`[useSessionRuntimeState:${sessionId.slice(0, 8)}] Clearing polling interval`);
      clearInterval(interval);
    };
  }, [manager, sessionId]);

  return state;
};

type SessionRuntimePortalProps = {
  sessionId: string;
  agentType: string;
  modelType: string;
  organizationId?: string;
  teamId?: string;
  runtimeUrl: string;
  publicApiKey: string;
  renderContent: PortalRenderer;
};

export const SessionRuntimePortal: React.FC<SessionRuntimePortalProps> = ({
  sessionId,
  agentType,
  modelType,
  organizationId,
  teamId,
  runtimeUrl,
  publicApiKey,
  renderContent,
}) => {
  const { ensureRuntime, attachPortal, detachPortal } = useSessionRuntimeManager();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const config = useMemo<RuntimeConfig>(
    () => ({
      sessionId,
      agentType,
      modelType,
      organizationId,
      teamId,
      runtimeUrl,
      publicApiKey,
    }),
    [agentType, modelType, organizationId, publicApiKey, runtimeUrl, sessionId, teamId],
  );

  useEffect(() => {
    ensureRuntime(config);
  }, [config, ensureRuntime]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    attachPortal(sessionId, container, renderContent);
    return () => detachPortal(sessionId, container);
  }, [attachPortal, detachPortal, renderContent, sessionId]);

  return <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden" />;
};

