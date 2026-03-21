import * as React from 'react';
import { createContext, useContext } from 'react';

/** File opened in the config panel Preview tab */
export interface ChatPreviewDocument {
  filePath: string;
  fileName: string;
  content: string;
  language: string;
  isMarkdown: boolean;
}

interface ChatPreviewContextValue {
  openChatPreview: (doc: ChatPreviewDocument) => void;
}

const ChatPreviewContext = createContext<ChatPreviewContextValue | null>(null);

export const ChatPreviewProvider: React.FC<{
  value: ChatPreviewContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => <ChatPreviewContext.Provider value={value}>{children}</ChatPreviewContext.Provider>;

/** Returns null when not under ChatPreviewProvider (e.g. storybook). */
export const useChatPreviewOptional = (): ChatPreviewContextValue | null => {
  return useContext(ChatPreviewContext);
};
