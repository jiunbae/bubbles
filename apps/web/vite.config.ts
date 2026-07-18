import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import glsl from 'vite-plugin-glsl';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss(), glsl()],
  resolve: {
    alias: [
      {
        find: /^three$/,
        replacement: path.resolve(__dirname, './src/lib/three-runtime.ts'),
      },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    // The lazy visual payload has a stricter gzip budget enforced after every
    // production build. Keep Vite's raw warning above the optimized Three.js
    // chunk so it remains useful for genuinely unexpected chunks.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) {
            return 'vendor';
          }
          if (id.includes('/node_modules/three/')) {
            return 'three-core';
          }
          if (
            id.includes('/node_modules/@react-three/') ||
            id.includes('/node_modules/postprocessing/')
          ) {
            return 'r3f';
          }
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router/') ||
            id.includes('/node_modules/react-router-dom/') ||
            id.includes('/node_modules/i18next/') ||
            id.includes('/node_modules/i18next-browser-languagedetector/') ||
            id.includes('/node_modules/react-i18next/') ||
            id.includes('/node_modules/zustand/') ||
            id.includes('/node_modules/scheduler/') ||
            id.includes('/node_modules/use-sync-external-store/') ||
            id.includes('/node_modules/@remix-run/')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
});
