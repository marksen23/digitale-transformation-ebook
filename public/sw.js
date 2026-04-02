const CACHE_VERSION = 'resonance-offline-v5.9';
const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/bands_pages.json',
  '/offline.html',
  '/illustrations/cover-v4-1.jpg',
  '/illustrations/band1-ueberfuehrung-v4-1.jpg',
  '/illustrations/band2-ausgang-v4-1.jpg',
  '/illustrations/band3-resonanz-v4-1.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== PRECACHE && k !== RUNTIME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (PRECACHE_URLS.includes(url.pathname) || url.pathname.startsWith('/illustrations/')) {
    event.respondWith(caches.match(event.request).then(c => c || fetch(event.request)));
    return;
  }

  if (url.pathname === '/bands_pages.json') {
    event.respondWith(
      caches.open(RUNTIME).then(cache => 
        fetch(event.request)
          .then(res => { cache.put(event.request, res.clone()); return res; })
          .catch(() => caches.match(event.request))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(RUNTIME).then(cache => cache.put(event.request, clone));
        }
        return networkRes;
      }).catch(() => caches.match('/offline.html'));
    })
  );
});