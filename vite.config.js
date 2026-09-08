import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Важно для относительных путей в Yandex Games
  server: {
    port: 3000,
    open: true
  },
  build: {
    assetsDir: 'assets',
    outDir: 'dist'
  }
});