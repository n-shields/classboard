import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LZString from 'lz-string'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import DEFAULT_BOARD from './data/defaultBoard.json'

// On a fresh browser with no saved classboard data, seed localStorage with
// the bundled default board (schedules, layout, themes — no per-class content)
;(function seedDefaultBoard() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith('classboard_')) return;
    }
    Object.entries(DEFAULT_BOARD).forEach(([key, value]) => {
      if (!key.startsWith('classboard_') || value == null) return;
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  } catch (e) {
    console.warn('classboard: failed to seed default board', e);
  }
}());

// Apply settings encoded in ?s= URL parameter before React initialises
;(function applyUrlSettings() {
  try {
    const param = new URLSearchParams(window.location.search).get('s');
    if (!param) return;
    const json = LZString.decompressFromEncodedURIComponent(param);
    if (!json) return;
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
