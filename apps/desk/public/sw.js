// The Desk's service worker: the app shell works offline (drafts are kept in the browser until
// they reach the server). API calls are never cached. The share target POST goes to the network.
const CACHE = 'desk-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/fonts/NewsreaderText-Regular.ttf', '/fonts/NewsreaderText-Italic.ttf', '/fonts/NewsreaderDisplay-Medium.ttf', '/fonts/Schibsted-Regular.ttf', '/fonts/Schibsted-SemiBold.ttf'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/') || url.pathname.startsWith('/cdn-cgi/')) return;
  // Hashed assets and fonts: cache first. Pages: network first, falling back to the cached shell.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/')),
    );
  }
});
