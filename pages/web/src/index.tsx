/**
 * Web entry: same bootstrap as the extension side panel, without chrome.*.
 *
 * Load SidePanel.css eagerly so layout/reset (#app-container, html/body) apply before
 * first paint — dynamic import of SidePanel alone deferred these styles and caused a
 * broken narrow / unstyled layout on the standalone web app.
 */
import './web-url-sync';
import '@src/index.css';
import '@src/styles/skeleton.css';
import '@src/SidePanel.css';
import { createRoot } from 'react-dom/client';
import { apiConfigStorage } from '@extension/storage';
import { initApiConfig } from '@src/constants';

const init = async () => {
  // Match side-panel bootstrap: init API config before any module imports auth-client (it snapshots base URL).
  const { apiUrl = '', backendUrl = '' } = await apiConfigStorage.get();
  initApiConfig(apiUrl, backendUrl);

  const { performStartupHealthCheck } = await import('@src/utils/backend-health-check');
  performStartupHealthCheck().catch((error: unknown) => {
    console.error('Health check failed:', error);
  });

  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }

  const { default: SidePanel } = await import('@src/SidePanel');
  const { AuthProvider } = await import('@src/context/AuthContext');

  const root = createRoot(appContainer);
  root.render(
    <AuthProvider>
      <SidePanel />
    </AuthProvider>,
  );
};

void init();
