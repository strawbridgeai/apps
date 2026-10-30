import './style.css';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, WorkspaceTabs } from './state/Workspace.jsx';
import App from './App.jsx';

createRoot(document.querySelector('#app')).render(
  <WorkspaceProvider>
    <WorkspaceTabs>
      <App />
    </WorkspaceTabs>
  </WorkspaceProvider>
);
