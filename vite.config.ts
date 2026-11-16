import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        id: '/',
        name: 'ShizuTv — Watch. Read. Track.',
        short_name: 'ShizuTv',
        description:
          'Smooth Anime & Manga streaming, reading, and tracking across AniList, MyAnimeList, and Kitsu.',
        theme_color: '#0b0c12',
        background_color: '#0b0c12',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: [
          '**/*.{js,css,html,ico,svg,woff,woff2}',
          'apple-touch-icon.png',
        ],
        globIgnores: [
          '**/assets/aistudio/Record_*',
          '**/assets/aistudio/Screenshot_*',
          '**/assets/aistudio/Home_page_*',
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'image' ||
              /^https:\/\/(s4\.anilist\.co|img\.anili\.st|cdn\.myanimelist\.net|media\.kitsu\.io|media\.kitsu\.app)\//i.test(
                url.href,
              ),
            handler: 'CacheFirst',
            options: {
              cacheName: 'shizutv-images-cache',
              expiration: {
                maxEntries: 350,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/(api\.jikan\.moe|kitsu\.io\/api|api\.aniskip\.com)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'shizutv-recent-content-api',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: false,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
});
