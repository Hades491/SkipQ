// Minimal service worker — required for "Add to Home Screen" installability.
// Caches nothing aggressively yet; safe no-op passthrough.
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => self.clients.claim());
self.addEventListener('fetch', (e) => {
  // Pass-through network fetch (no offline caching in this MVP).
  e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
});
