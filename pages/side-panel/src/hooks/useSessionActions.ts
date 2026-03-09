/**
 * useSessionActions Hook
 * 
 * Manages session action handlers and confirmation modal states.
 */

import { useState, useCallback, useRef } from 'react';
import { sessionStorageDBWrapper, generateSessionName, persistenceLock, debug } from '@extension/shared';
import type { SessionMetadata } from '@extension/shared';
import { exportSessionAsMarkdown, exportSessionAsHTML } from '../utils/sessionExport';
import { API_CONFIG } from '../constants';

export interface UseSessionActionsReturn {
  // Session actions
  handleNewSession: () => void;
  handleCloseSession: () => void;
  handleSaveMessages: () => void;
  handleLoadMessages: () => void;
  handleCopySessionId: (e: React.MouseEvent) => Promise<void>;
  handleExportAsMarkdown: (messages?: any[]) => Promise<void>;
  handleExportAsHTML: (messages?: any[]) => Promise<void>;
  
  // Reset session
  handleResetSession: () => void;
  handleConfirmResetSession: () => void;
  resetSessionConfirmOpen: boolean;
  setResetSessionConfirmOpen: (open: boolean) => void;
  
  // Clear messages
  handleClearAllMessages: () => void;
  handleConfirmClearMessages: () => Promise<void>;
  clearMessagesConfirmOpen: boolean;
  setClearMessagesConfirmOpen: (open: boolean) => void;
  
  // Clear sessions
  openClearSessionsConfirm: () => void;
  handleConfirmClearSessions: () => Promise<void>;
  clearSessionsConfirmOpen: boolean;
  setClearSessionsConfirmOpen: (open: boolean) => void;
  
  // Message count for modals
  messageCount: number;
  
  // Copy state
  copiedSessionId: boolean;
  
  // Function registration handlers
  handleRegisterResetFunction: (sessionId: string, fn: () => void) => void;
  handleRegisterSaveFunction: (sessionId: string, fn: () => void) => void;
  handleRegisterLoadFunction: (sessionId: string, fn: () => void) => void;
  handleRegisterGetMessagesFunction: (sessionId: string, fn: () => any[]) => void;
  
  // Track initial session attempt
  hasAttemptedInitialSessionRef: React.MutableRefObject<boolean>;
}

export function useSessionActions(
  currentSessionId: string | null,
  sessions: SessionMetadata[],
  sessionMessageCounts: Record<string, number>
): UseSessionActionsReturn {
  // Confirmation modal states
  const [clearMessagesConfirmOpen, setClearMessagesConfirmOpen] = useState(false);
  const [resetSessionConfirmOpen, setResetSessionConfirmOpen] = useState(false);
  const [clearSessionsConfirmOpen, setClearSessionsConfirmOpen] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [copiedSessionId, setCopiedSessionId] = useState(false);

  // Function refs
  const resetFunctionsRef = useRef<Record<string, () => void>>({});
  const saveFunctionsRef = useRef<Record<string, () => void>>({});
  const loadFunctionsRef = useRef<Record<string, () => void>>({});
  const getMessagesFunctionsRef = useRef<Record<string, () => any[]>>({});
  const hasAttemptedInitialSessionRef = useRef(false);

  // Basic session actions
  const handleNewSession = useCallback(() => {
    sessionStorageDBWrapper.addSession(generateSessionName(), API_CONFIG.BASE_URL);
  }, []);

  const handleCloseSession = useCallback(() => {
    if (currentSessionId) {
      sessionStorageDBWrapper.closeSession(currentSessionId);
    }
  }, [currentSessionId]);

  const handleSaveMessages = useCallback(() => {
    if (currentSessionId && saveFunctionsRef.current[currentSessionId]) {
      saveFunctionsRef.current[currentSessionId]();
    }
  }, [currentSessionId]);

  const handleLoadMessages = useCallback(() => {
    if (currentSessionId && loadFunctionsRef.current[currentSessionId]) {
      loadFunctionsRef.current[currentSessionId]();
    }
  }, [currentSessionId]);

  const handleCopySessionId = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentSessionId) {
      try {
        await navigator.clipboard.writeText(currentSessionId);
        setCopiedSessionId(true);
        setTimeout(() => setCopiedSessionId(false), 1500);
      } catch (error) {
        console.error('[SessionActions] Failed to copy session ID:', error);
      }
    }
  }, [currentSessionId]);

  // Export handlers
  const handleExportAsMarkdown = useCallback(async (messages?: any[]) => {
    if (currentSessionId) {
      const msgs = messages || getMessagesFunctionsRef.current[currentSessionId]?.() || [];
      await exportSessionAsMarkdown(currentSessionId, sessions, msgs);
    }
  }, [currentSessionId, sessions]);

  const handleExportAsHTML = useCallback(async (messages?: any[]) => {
    if (currentSessionId) {
      const msgs = messages || getMessagesFunctionsRef.current[currentSessionId]?.();
      await exportSessionAsHTML(currentSessionId, sessions, msgs);
    }
  }, [currentSessionId, sessions]);

  // Reset session handlers
  const handleResetSession = useCallback(() => {
    const count = currentSessionId ? sessionMessageCounts[currentSessionId] || 0 : 0;
    setMessageCount(count);
    setTimeout(() => setResetSessionConfirmOpen(true), 60);
  }, [currentSessionId, sessionMessageCounts]);

  const handleConfirmResetSession = useCallback(async () => {
    if (!currentSessionId) {
      console.error('[SessionActions] No current session to reset');
      return;
    }

    try {
      // Call API to delete all messages in the thread
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/messages/${currentSessionId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to reset session' }));
        throw new Error(error.error || `Failed to reset session: ${response.status}`);
      }

      persistenceLock.setManualReset(currentSessionId, true);
      debug.log('[SessionActions] Marked manual reset for session:', currentSessionId);

      // Call registered reset function to update UI state
    const resetFn = resetFunctionsRef.current[currentSessionId];
    if (resetFn) {
      resetFn();
      setResetSessionConfirmOpen(false);
    } else {
      console.error('[SessionActions] No reset function found for session:', currentSessionId);
        setResetSessionConfirmOpen(false);
      }
    } catch (error) {
      console.error('[SessionActions] Failed to reset session:', error);
      setResetSessionConfirmOpen(false);
    }
  }, [currentSessionId]);

  // Clear messages handlers
  const handleClearAllMessages = useCallback(() => {
    const count = currentSessionId ? sessionMessageCounts[currentSessionId] || 0 : 0;
    setMessageCount(count);
    setTimeout(() => setClearMessagesConfirmOpen(true), 60);
  }, [currentSessionId, sessionMessageCounts]);

  const handleConfirmClearMessages = useCallback(async () => {
    try {
      if (!currentSessionId) {
        console.error('[SessionActions] No current session to clear messages from');
        return;
      }

      // Call API to delete all messages in the thread
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/messages/${currentSessionId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to clear messages' }));
        throw new Error(error.error || `Failed to clear messages: ${response.status}`);
      }

      // Reload to refresh UI with updated messages
      window.location.reload();
    } catch (error) {
      console.error('[SessionActions] Failed to clear messages:', error);
      setClearMessagesConfirmOpen(false);
    }
  }, [currentSessionId]);

  // Clear sessions handlers
  const openClearSessionsConfirm = useCallback(() => {
    setTimeout(() => setClearSessionsConfirmOpen(true), 60);
  }, []);

  const handleConfirmClearSessions = useCallback(async () => {
    try {
      const sessionIds = sessions.map(s => s.id);
      for (const id of sessionIds) {
        // Pass API base URL to delete backend thread (hard delete with cascade)
        await sessionStorageDBWrapper.deleteSession(id, API_CONFIG.BASE_URL);
      }

      try {
        await sessionStorageDBWrapper.addSession(generateSessionName(), API_CONFIG.BASE_URL);
        hasAttemptedInitialSessionRef.current = true;
      } catch (createError) {
        console.error('[SessionActions] Failed to create new session after clearing:', createError);
        hasAttemptedInitialSessionRef.current = false;
      }

      setClearSessionsConfirmOpen(false);
    } catch (err) {
      console.error('[SessionActions] Failed to clear all sessions:', err);
      setClearSessionsConfirmOpen(false);
    }
  }, [sessions]);

  // Function registration handlers
  const handleRegisterResetFunction = useCallback((sessionId: string, fn: () => void) => {
    resetFunctionsRef.current[sessionId] = fn;
  }, []);

  const handleRegisterSaveFunction = useCallback((sessionId: string, fn: () => void) => {
    saveFunctionsRef.current[sessionId] = fn;
  }, []);

  const handleRegisterLoadFunction = useCallback((sessionId: string, fn: () => void) => {
    loadFunctionsRef.current[sessionId] = fn;
  }, []);

  const handleRegisterGetMessagesFunction = useCallback((sessionId: string, fn: () => any[]) => {
    getMessagesFunctionsRef.current[sessionId] = fn;
  }, []);

  return {
    handleNewSession,
    handleCloseSession,
    handleSaveMessages,
    handleLoadMessages,
    handleCopySessionId,
    handleExportAsMarkdown,
    handleExportAsHTML,
    handleResetSession,
    handleConfirmResetSession,
    resetSessionConfirmOpen,
    setResetSessionConfirmOpen,
    handleClearAllMessages,
    handleConfirmClearMessages,
    clearMessagesConfirmOpen,
    setClearMessagesConfirmOpen,
    openClearSessionsConfirm,
    handleConfirmClearSessions,
    clearSessionsConfirmOpen,
    setClearSessionsConfirmOpen,
    messageCount,
    copiedSessionId,
    handleRegisterResetFunction,
    handleRegisterSaveFunction,
    handleRegisterLoadFunction,
    handleRegisterGetMessagesFunction,
    hasAttemptedInitialSessionRef,
  };
}

export default useSessionActions;

