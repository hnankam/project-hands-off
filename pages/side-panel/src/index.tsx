import '@src/index.css';
import '@src/styles/skeleton.css';
import SidePanel from '@src/SidePanel';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@src/context/AuthContext';
import { performStartupHealthCheck } from '@src/utils/backend-health-check';

const init = async () => {
  // Perform backend health check on startup (non-blocking)
  performStartupHealthCheck().catch(error => {
    console.error('Health check failed:', error);
  });

  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);
  root.render(
    <AuthProvider>
      <SidePanel />
    </AuthProvider>
  );
};

init();
