import '@src/Popup.css';
import '@extension/ui/global.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, Button } from '@extension/ui';
import { useState, useEffect } from 'react';

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Check if side panel is open on component mount and listen for messages
  useEffect(() => {
    const checkPanelState = async () => {
      try {
        const windowId = (await chrome.windows.getCurrent()).id;
        // Note: There's no direct API to check if side panel is open
        // We'll track the state based on our own actions
        setIsPanelOpen(false);
      } catch (error) {
        console.error('Failed to check panel state:', error);
      }
    };
    checkPanelState();

    // Listen for messages from side panel
    const handleMessage = (message: any) => {
      if (message.action === 'sidePanelClosed') {
        setIsPanelOpen(false);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const toggleSidePanel = async () => {
    try {
      const windowId = (await chrome.windows.getCurrent()).id;
      
      if (isPanelOpen) {
        // Send a message to the side panel to close itself
        chrome.runtime.sendMessage({ action: 'closeSidePanel' });
        setIsPanelOpen(false);
      } else {
        // Open the side panel
        if (windowId) {
          await chrome.sidePanel.open({ windowId });
        }
        setIsPanelOpen(true);
      }
    } catch (error) {
      console.error('Failed to toggle side panel:', error);
    }
  };

  return (
    <div className={cn('App', isLight ? 'bg-slate-50' : 'bg-gray-800')}>
      <div className={cn('App-header', isLight ? 'text-gray-900' : 'text-gray-100')}>
        <Button
          variant={isPanelOpen ? "destructive" : "default"}
          size="lg"
          className="hover:scale-105 transition-transform"
          onClick={toggleSidePanel}>
          {isPanelOpen ? 'Close Side Panel' : 'Open Side Panel'}
        </Button>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
