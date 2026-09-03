import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Apache does this in production (same origin, /apps/restock-tracker/
      // proxies to the backend service) - this mirrors that for local dev
      // so `npm run dev`/`vite preview` can talk to the real API.
      '/api': { target: 'https://127.0.0.1:2013', changeOrigin: true, secure: false },
    },
  },
});
