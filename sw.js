/* AyuLite C2 - High Performance PWA Service Worker v14.4 */
const CACHE_NAME = 'ayulite-pwa-v14.4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Do NOT intercept or cache API or WebSocket requests
  if (url.pathname.includes('/api/') || url.pathname.includes('/ws/') || event.request.method !== 'GET') {
    return;
  }

  // Network-First with Cache-Fallback for app.js, style.css, index.html, tunnel.json
  if (url.pathname.endsWith('app.js') || url.pathname.endsWith('style.css') || url.pathname.endsWith('index.html') || url.pathname.endsWith('tunnel.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const respClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-While-Revalidate for static assets (css, fonts, images)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const respClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);
      return cachedResponse || fetchPromise;
    })
  );
});
