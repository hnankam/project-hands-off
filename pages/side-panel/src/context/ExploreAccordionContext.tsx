/**
 * Context for toggling the Explore accordion (grouped vs original tool view).
 * Temporary feature - allows switching between grouped and flat tool display.
 */
import * as React from 'react';

export interface ExploreAccordionContextValue {
  enabled: boolean;
  toggle: () => void;
}

const ExploreAccordionContext = React.createContext<ExploreAccordionContextValue | null>(null);

export function useExploreAccordion(): ExploreAccordionContextValue | null {
  return React.useContext(ExploreAccordionContext);
}

export function useExploreAccordionEnabled(): boolean {
  const ctx = useExploreAccordion();
  return ctx?.enabled ?? true;
}

export const ExploreAccordionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enabled, setEnabled] = React.useState(true);
  const value = React.useMemo(
    () => ({
      enabled,
      toggle: () => setEnabled((prev) => !prev),
    }),
    [enabled]
  );
  return (
    <ExploreAccordionContext.Provider value={value}>
      {children}
    </ExploreAccordionContext.Provider>
  );
};
