import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5277, host: true },
  build: { chunkSizeWarningLimit: 2000 },
});
