import '@src/index.css';
import '@src/styles/skeleton.css';
import { createRoot } from 'react-dom/client';
import { apiConfigStorage } from '@extension/storage';
import { initApiConfig } from '@src/constants';

const init = async () => {
  // Bootstrap API config from Options page BEFORE loading auth/client or any API-using code.
  // auth-client captures baseURL at module load time, so we must init before it is imported.
  const { apiUrl = '', backendUrl = '' } = await apiConfigStorage.get();
  initApiConfig(apiUrl, backendUrl);

  // Perform backend health check on startup (non-blocking)
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
    </AuthProvider>
  );
};

init();
