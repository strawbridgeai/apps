import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DashboardApp from './dashboard/DashboardApp.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DashboardApp />
  </StrictMode>
);
