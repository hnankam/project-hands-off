import * as React from 'react';

/**
 * False when this chat session is mounted but hidden (e.g. another session tab is selected).
 * Virtua’s sticky user header is portaled to `document.body`, so it must be suppressed when inactive.
 */
const VirtuaChatSessionVisibleContext = React.createContext(true);

export const VirtuaChatSessionVisibleProvider: React.FC<{
  visible: boolean;
  children: React.ReactNode;
}> = ({ visible, children }) => (
  <VirtuaChatSessionVisibleContext.Provider value={visible}>{children}</VirtuaChatSessionVisibleContext.Provider>
);

export function useVirtuaChatSessionVisible(): boolean {
  return React.useContext(VirtuaChatSessionVisibleContext);
}
