import * as React from 'react';
import { createContext, useContext, useState, useCallback } from 'react';

export type ScrollToBottomFn = (smooth?: boolean) => void;

const ScrollToBottomContext = createContext<{
  scrollToBottom: ScrollToBottomFn | null;
  register: (fn: ScrollToBottomFn) => () => void;
} | null>(null);

export const ScrollToBottomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scrollToBottom, setScrollToBottom] = useState<ScrollToBottomFn | null>(null);

  const register = useCallback((fn: ScrollToBottomFn) => {
    setScrollToBottom(() => fn);
    return () => setScrollToBottom(null);
  }, []);

  const value = React.useMemo(
    () => ({ scrollToBottom, register }),
    [scrollToBottom, register]
  );

  return (
    <ScrollToBottomContext.Provider value={value}>
      {children}
    </ScrollToBottomContext.Provider>
  );
};

export function useScrollToBottom(): ScrollToBottomFn | null {
  const ctx = useContext(ScrollToBottomContext);
  return ctx?.scrollToBottom ?? null;
}

export function useRegisterScrollToBottom(): (fn: ScrollToBottomFn) => () => void {
  const ctx = useContext(ScrollToBottomContext);
  return ctx?.register ?? (() => () => {});
}
