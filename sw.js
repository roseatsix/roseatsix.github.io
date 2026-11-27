/* ==========================================================
   rose at six: offline support.

   Pages and scripts load from the network first (so updates show
   up straight away), falling back to the copy saved on this device
   when you're offline or the connection is very slow. The pinned
   Firebase SDK and fonts are served from the saved copy.
   Your data itself is never stored here; Firestore keeps its own
   encrypted offline cache.
   ========================================================== */

const VERSION = 'ras-2026-11-27m';
const NETWORK_TIMEOUT = 4000;

const SHELL = [
  '/', '/index.html',
  '/assets/css/style.css', '/assets/css/components.css', '/assets/favicon.svg', '/assets/favicon-slate.svg', '/assets/favicon-beacon.svg', '/assets/manifest.webmanifest', '/assets/manifest-slate.webmanifest', '/assets/manifest-beacon.webmanifest',
  '/assets/icons/apple-touch-icon.png', '/assets/icons/icon-192.png',
  '/assets/js/theme-boot.js', '/assets/js/config.js', '/assets/js/hub.js', '/assets/js/hub-today.js', '/assets/js/hub-search.js',
  '/assets/js/core/backup.js', '/assets/js/core/crypto.js', '/assets/js/core/firebase.js', '/assets/js/core/idb.js',
  '/assets/js/core/merge.js', '/assets/js/core/session.js', '/assets/js/core/store.js',
  '/assets/js/ui/appearance.js', '/assets/js/ui/backup.js', '/assets/js/ui/dom.js', '/assets/js/ui/header.js', '/assets/js/ui/name-list.js',
  '/assets/js/ui/theme-controls.js', '/assets/js/receipt/parse.js', '/assets/js/receipt/scan.js', '/assets/js/receipt/review.js', '/assets/js/ui/vault-dialogs.js',
  '/tools/inbox/', '/tools/inbox/index.html', '/tools/inbox/inbox.css', '/tools/inbox/app.js',
  '/tools/learn/', '/tools/learn/index.html', '/tools/learn/learn.css', '/tools/learn/app.js', '/tools/learn/cases.js',
  '/tools/learn/demos.js', '/tools/learn/code.js', '/tools/learn/runner.js',
  '/tools/journal/', '/tools/journal/index.html', '/tools/journal/journal.css', '/tools/journal/journal.js',
  '/tools/journal/model.js', '/tools/journal/views.js', '/tools/journal/dialogs.js', '/tools/journal/fields.js',
  '/tools/journal/holidays.js',
  '/tools/inventory/', '/tools/inventory/index.html', '/tools/inventory/inventory.css', '/tools/inventory/inventory.js',
  '/tools/inventory/model.js', '/tools/inventory/views.js', '/tools/inventory/dialogs.js',
  '/tools/subscriptions/', '/tools/subscriptions/index.html', '/tools/subscriptions/app.js', '/tools/subscriptions/model.js', '/tools/subscriptions/subs.css',
  '/tools/documents/', '/tools/documents/index.html', '/tools/documents/app.js', '/tools/documents/lib.js', '/tools/documents/more.js', '/tools/documents/documents.css',
  '/assets/vendor/pdf-lib.min.js', '/assets/vendor/jszip.min.js', '/assets/vendor/pdfjs/pdf.min.mjs', '/assets/vendor/pdfjs/pdf.worker.min.mjs',
  '/tools/generate/', '/tools/generate/index.html', '/tools/generate/app.js', '/tools/generate/engine.js', '/tools/generate/generate.css',
  '/tools/split/', '/tools/split/index.html', '/tools/split/app.js', '/tools/split/model.js', '/tools/split/share.js', '/tools/split/split.css',
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
  // 'no-cache' asks the server whether each file changed, instead of using
  // the browser's short-lived copy, so all files of an update arrive together.
  const network = fetch(request, { cache: 'no-cache' }).then(res => {
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  });
  network.catch(() => {});   // handled below; avoid unhandled-rejection noise
  const cached = () => cache.match(request, { ignoreSearch: true });
  try {
    // Wait for the network, but not forever if a cached copy exists.
    const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT));
    let usedCache = false;
    const first = await Promise.race([network, timeout.then(async () => {
      const hit = await cached();
      if (hit) usedCache = true;
      return hit;
    })]);
    if (first) {
      // A slow network got the saved copy. If the real one turns out to be
      // newer, tell the page, so it can reload with matching files instead
      // of mixing old and new (e.g. new code with an old stylesheet).
      if (usedCache) {
        network.then(res => {
          if (res && res.ok && changed(first, res)) notifyStale();
        }).catch(() => {});
      }
      return first;
    }
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

const tagOf = res => res.headers.get('etag') || res.headers.get('last-modified') || '';
const changed = (a, b) => { const x = tagOf(a), y = tagOf(b); return !x || !y || x !== y; };

let staleTimer = null;
function notifyStale() {
  clearTimeout(staleTimer);    // one message for a burst of files
  staleTimer = setTimeout(async () => {
    for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'ras:stale' });
  }, 300);
}

/* Something was shared to the app. The service worker has no keys, so it
   parks the share in a cache on this device; the inbox page picks it up,
   encrypts and saves it, then deletes it from here. */
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open('ras-share');
    const base = `/__share/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const files = [];
    let i = 0;
    for (const f of form.getAll('photos')) {
      if (!f || typeof f === 'string' || !f.size) continue;
      const key = `${base}/file${i++}`;
      await cache.put(key, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }));
      files.push({ key, name: f.name, type: f.type });
    }
    const meta = { title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '', files };
    await cache.put(`${base}/meta`, new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
  } catch (e) { /* fall through to the inbox anyway */ }
  return Response.redirect('/tools/inbox/?shared=1', 303);
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
  const url = new URL(request.url);
  // Android "Share → rose at six" (see share_target in the manifest)
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/tools/inbox/share') {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;

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
