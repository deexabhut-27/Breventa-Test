/* Service worker: makes the app installable and quick to open. It caches only the app's own
 * files (HTML, scripts, styles, icons). API calls (/api/...) always go to the network, so exam
 * questions, answers, timers and results are never served from a cache. */
const VERSION = 'v1';
const SHELL = `breventa-shell-${VERSION}`;
const ASSETS = `breventa-assets-${VERSION}`;
const PRECACHE = ['/', '/manifest.webmanifest', '/breventa-logo.png', '/breventa-mark.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('breventa-') && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: always try the network first so a new deployment shows up immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || new Response('You are offline. Connect to the internet to continue.', { status: 503, headers: { 'Content-Type': 'text/plain' } }))),
    );
    return;
  }

  // Built files have a content hash in their name, so a cached copy is always correct.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Icons and logos: serve the cached copy and refresh it in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
