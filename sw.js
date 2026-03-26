/* ============================================================
   FluxoCerto Pro — Service Worker v3
   Cache-First para assets locais.
   Network-First com fallback offline para o resto.
============================================================ */
const CACHE = 'fluxocerto-pro-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (!resp || resp.status !== 200) return resp;
        caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
        return resp;
      }).catch(() =>
        e.request.destination === 'document'
          ? caches.match('./index.html')
          : new Response('Offline', { status: 503 })
      );
    })
  );
});
