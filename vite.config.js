import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-180.png'],
      manifest: {
        name: 'Kookabrew',
        short_name: 'Kookabrew',
        description: 'Find your perfect Melbourne cafe. Filter by vibe, Wi-Fi, specialty coffee, and more.',
        theme_color: '#1a1a1a',
        background_color: '#f5f0eb',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        skipWaiting: true,            // activate new SW immediately
        clientsClaim: true,           // take control of open pages at once
        cleanupOutdatedCaches: true,  // purge stale precaches (old build)
        runtimeCaching: [
          {
            urlPattern: /\/cafes\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cafes-data',
              expiration: { maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cafe-images',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          mapbox: ['mapbox-gl'],
        },
      },
    },
  },
});
