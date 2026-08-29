import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // Only affects `vite dev`/`vite preview` locally - production is served
  // statically with Apache doing the real /apps/restock-tracker/api/ ->
  // 127.0.0.1:2013 proxy (see the vhost conf), this has no effect there.
  server: {
    proxy: {
      '/apps/restock-tracker/api': {
        target: 'https://127.0.0.1:2013',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/apps\/restock-tracker/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/apps/restock-tracker/api': {
        target: 'https://127.0.0.1:2013',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/apps\/restock-tracker/, ''),
      },
    },
  },
});
