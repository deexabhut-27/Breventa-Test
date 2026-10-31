import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin proxy keeps sendBeacon and auth headers simple in development.
    proxy: { '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:5050', changeOrigin: true } },
  },
  build: {
    // Build into <repo>/public: Vercel serves that folder by default.
    outDir: '../public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
