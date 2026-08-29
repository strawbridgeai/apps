import './style.css';
import { createRoot } from 'react-dom/client';
import { DocumentProvider } from './state/DocumentContext.jsx';
import App from './App.jsx';

createRoot(document.querySelector('#app')).render(
  <DocumentProvider>
    <App />
  </DocumentProvider>
);
