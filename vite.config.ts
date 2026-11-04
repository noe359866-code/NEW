import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createAddonHandler } from './server/addon-proxy.js';

// El mismo backend se usa en desarrollo, preview y producción.
const addonApi = () => ({
  name: 'nebula-addon-api',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use('/api/addon', createAddonHandler());
  },
  configurePreviewServer(server: import('vite').PreviewServer) {
    server.middlewares.use('/api/addon', createAddonHandler());
  },
});

export default defineConfig({
  plugins: [react(), addonApi()],
  server: { host: '0.0.0.0', port: 3000, strictPort: true, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 3000, strictPort: true, allowedHosts: true },
});
