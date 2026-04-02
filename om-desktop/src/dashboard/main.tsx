import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';
import { initSentryRenderer } from '../lib/sentry-renderer';

// Initialize Sentry for error tracking in the UI
initSentryRenderer();

// Use HashRouter for Electron file:// URLs (BrowserRouter doesn't work with file://)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
