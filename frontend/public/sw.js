// Service Worker with dedicated PDF manual offline caching
const PDF_CACHE = 'assembly_pdf_cache';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Manual PDF requests: Network first with background cache update, falling back to cache
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

  // Default handler: try network, fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request, { ignoreSearch: true });
    })
  );
});
