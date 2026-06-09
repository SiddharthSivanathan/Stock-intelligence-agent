import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Polling is needed when the source is on a Windows bind-mount inside Docker.
    watch: { usePolling: true, interval: 300 },
    // Allow Cloudflare quick-tunnel hostnames so the dev server's host-header
    // check doesn't block them. `.trycloudflare.com` matches any subdomain so
    // a new tunnel URL after restart still works without editing this file.
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
  },
});
