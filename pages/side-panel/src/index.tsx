import '@src/index.css';
import '@src/skeleton.css';
import SidePanel from '@src/SidePanel';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@src/context/AuthContext';

const init = () => {
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
