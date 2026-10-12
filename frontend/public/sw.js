// Comprehensive Offline Service Worker for Assembly PWA
// Manages App Shell precaching, SPA navigation fallback, and PDF manual offline storage

const APP_SHELL_CACHE = 'assembly_app_shell_v3';
const PDF_CACHE = 'assembly_pdf_cache';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/pdfium.wasm',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Pre-cache warning during service worker install:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== APP_SHELL_CACHE && key !== PDF_CACHE) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle HTTP/HTTPS GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // 1. Navigation requests (e.g. visiting /, /slot/1, /admin, or refreshing the page)
  // Network-first with automatic fallback to cached /index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => {
              cache.put('/index.html', clone.clone());
              cache.put('/', clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Host server is unreachable / offline: return the cached SPA shell index.html!
          return caches.match('/index.html').then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // 2. Manual PDF requests: Network first with background cache update, falling back to cache
  if (url.pathname.startsWith('/manuals/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(PDF_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request, { ignoreSearch: true }).then((cached) => {
            if (cached) return cached;
            return caches.match(url.pathname);
          });
        })
    );
    return;
  }

  // 3. API endpoints (/api/*): Pass through to network so React can catch errors and read IndexedDB
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 4. Static App Shell Assets (/assets/*, .js, .css, .wasm, .woff2, icons, manifest):
  // Cache-first with background network refresh
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        // Fetch in background to update cache if online
        fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(APP_SHELL_CACHE).then((cache) => {
                cache.put(event.request, clone);
              });
            }
          })
          .catch(() => {});
        return cached;
      }

      // Not in cache: fetch from network and store in APP_SHELL_CACHE
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        });
    })
  );
});
