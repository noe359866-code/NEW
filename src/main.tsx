import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Evita el zoom accidental por doble toque en iOS.
let lastTouch = 0;
document.addEventListener(
  'touchend',
  (event) => {
    const now = Date.now();
    if (now - lastTouch <= 300) event.preventDefault();
    lastTouch = now;
  },
  { passive: false },
);

// PWA: el service worker es nuestro (mismo origen, sin CDN) y permite abrir la app sin red.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* si el navegador no lo permite, la app sigue funcionando igual */
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
