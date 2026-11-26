/* ==========================================================
   rose at six: offline support.

   Pages and scripts load from the network first (so updates show
   up straight away), falling back to the copy saved on this device
   when you're offline or the connection is very slow. The pinned
   Firebase SDK and fonts are served from the saved copy.
   Your data itself is never stored here; Firestore keeps its own
   encrypted offline cache.
   ========================================================== */

const VERSION = 'ras-2026-11-26';
const NETWORK_TIMEOUT = 4000;

const SHELL = [
  '/', '/index.html',
  '/assets/css/style.css', '/assets/favicon.svg', '/assets/manifest.webmanifest',
  '/assets/icons/apple-touch-icon.png', '/assets/icons/icon-192.png',
  '/assets/js/theme-boot.js', '/assets/js/config.js', '/assets/js/hub.js', '/assets/js/hub-today.js',
  '/assets/js/core/backup.js', '/assets/js/core/crypto.js', '/assets/js/core/firebase.js', '/assets/js/core/idb.js',
  '/assets/js/core/merge.js', '/assets/js/core/session.js', '/assets/js/core/store.js',
  '/assets/js/ui/appearance.js', '/assets/js/ui/backup.js', '/assets/js/ui/dom.js', '/assets/js/ui/header.js',
  '/assets/js/ui/theme-controls.js', '/assets/js/ui/vault-dialogs.js',
  '/tools/journal/', '/tools/journal/index.html', '/tools/journal/journal.css', '/tools/journal/journal.js',
  '/tools/journal/model.js', '/tools/journal/views.js', '/tools/journal/dialogs.js', '/tools/journal/fields.js',
  '/tools/journal/holidays.js',
  '/tools/inventory/', '/tools/inventory/index.html', '/tools/inventory/inventory.css', '/tools/inventory/inventory.js',
  '/tools/inventory/model.js', '/tools/inventory/views.js', '/tools/inventory/dialogs.js',
  'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // One missing file shouldn't stop the rest from being saved.
    await Promise.all(SHELL.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  const network = fetch(request).then(res => {
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  });
  network.catch(() => {});   // handled below; avoid unhandled-rejection noise
  const cached = () => cache.match(request, { ignoreSearch: true });
  try {
    // Wait for the network, but not forever if a cached copy exists.
    const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT));
    const first = await Promise.race([network, timeout.then(cached)]);
    if (first) return first;
    return await network;
  } catch (e) {
    const hit = await cached();
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const home = await cache.match('/');
      if (home) return home;
    }
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === '/sw.js') return;
    event.respondWith(networkFirst(request));
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(cacheFirst(request));          // pinned version, never changes
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
  }
  // Everything else (Firebase sign-in and database, holidays) goes straight to the network.
});
