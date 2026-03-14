import * as React from 'react';
import { createContext, useContext } from 'react';

/**
 * Context providing a ref to the chat scroll container (the element with overflow-y-auto).
 * Used by load-more-history and other scroll-dependent logic.
 */
const ScrollContainerRefContext = createContext<React.RefObject<HTMLDivElement | null> | null>(null);

export const ScrollContainerRefProvider: React.FC<{
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}> = ({ scrollContainerRef, children }) => {
  return (
    <ScrollContainerRefContext.Provider value={scrollContainerRef}>
      {children}
    </ScrollContainerRefContext.Provider>
  );
};

export const useScrollContainerRef = (): React.RefObject<HTMLDivElement | null> | null => {
  return useContext(ScrollContainerRefContext);
};
