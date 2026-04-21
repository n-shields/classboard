import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Apply settings encoded in ?s= URL parameter before React initialises
;(function applyUrlSettings() {
  try {
    const param = new URLSearchParams(window.location.search).get('s');
    if (!param) return;
    const json = decodeURIComponent(escape(atob(param.replace(/-/g, '+').replace(/_/g, '/'))));
    const data = JSON.parse(json);
    Object.entries(data).forEach(([key, value]) => {
      if (typeof key === 'string' && key.startsWith('classboard_')) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    });
    // Clean the URL so a manual refresh doesn't re-import
    const clean = new URL(window.location.href);
    clean.searchParams.delete('s');
    history.replaceState(null, '', clean.toString());
  } catch (e) {
    console.warn('classboard: failed to apply URL settings', e);
  }
}());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
