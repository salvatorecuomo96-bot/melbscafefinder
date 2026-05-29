import React from 'react';
import ReactDOM from 'react-dom/client';
import { inject } from '@vercel/analytics';
import App from './App.jsx';
import './index.css';

inject();

// Reload once when a new service worker takes over. Guard prevents cascade
// if multiple SW versions are queued (would otherwise loop).
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
