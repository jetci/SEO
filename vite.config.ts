import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// EEAT Studio V2 — Vite 6 + React 18 + Tailwind 4
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Route tRPC + API to backend server (PORT=3002 .env)
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Force unique filename EVERY build (no-cache for F5 soft-refresh)
        entryFileNames: `assets/[name].[hash]__${Date.now()}.js`,
        chunkFileNames: `assets/[name].[hash]__${Date.now()}.js`,
        assetFileNames: `assets/[name].[hash]__${Date.now()}.[ext]`,
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'trpc-vendor': ['@trpc/client', '@trpc/react-query', '@tanstack/react-query'],
        },
      },
    },
  },
});
