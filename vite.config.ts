import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the built game works from any folder / static host
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
