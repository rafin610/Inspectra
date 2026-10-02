import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Multi-entry MV3 build:
//  - sidepanel.html / popup.html (React UIs)
//  - background service worker (IIFE, single file)
//  - content script (IIFE, single file)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel.html',
        popup: 'popup.html',
        'background/service-worker': 'src/background/service-worker.ts',
        'content/scanner': 'src/content/scanner.ts',
        'content/overlay': 'src/content/overlay.ts',
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background/service-worker') return 'background/service-worker.js';
          if (chunk.name === 'content/scanner') return 'content/scanner.js';
          if (chunk.name === 'content/overlay') return 'content/overlay.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
