import React, { createContext, useContext } from 'react';

interface StreamingContextValue {
  isStreaming: boolean;
}

const defaultValue: StreamingContextValue = { isStreaming: false };

export const StreamingContext = createContext<StreamingContextValue>(defaultValue);

export function useStreaming(): StreamingContextValue {
  return useContext(StreamingContext);
}


