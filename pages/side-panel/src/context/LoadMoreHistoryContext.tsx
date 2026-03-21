import * as React from 'react';

/**
 * True while "Loading older messages…" is shown. Virtua sticky portal + probe use this to
 * reset layout and assistant lock when the banner appears or disappears (scroll viewport jumps).
 */
const LoadMoreHistoryActiveContext = React.createContext(false);

export const LoadMoreHistoryActiveProvider: React.FC<{
  active: boolean;
  children: React.ReactNode;
}> = ({ active, children }) => (
  <LoadMoreHistoryActiveContext.Provider value={active}>{children}</LoadMoreHistoryActiveContext.Provider>
);

export function useLoadMoreHistoryActive(): boolean {
  return React.useContext(LoadMoreHistoryActiveContext);
}
