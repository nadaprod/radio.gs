/**
 * RADIO.GS service worker.
 *
 * Strategy:
 *   - Precache the app shell on install.
 *   - Navigation requests: network-first (3s timeout) -> cached shell -> /404.html.
 *   - Same-origin static assets: stale-while-revalidate.
 *   - Google Fonts: stale-while-revalidate in a dedicated cache.
 *   - Cross-origin CDNs (SoundCloud, three.js, QR API, artwork): network-only
 *     (caching them is either pointless or breaks auth/streaming).
 *
 * Update flow:
 *   - `skipWaiting()` on install so a new SW never lingers.
 *   - `clients.claim()` on activate + broadcast UPDATE_READY so the page can toast.
 *   - Accepts a SKIP_WAITING message from the client for manual update prompts.
 */

const VERSION = 'v1.0.0';
const SHELL_CACHE = `radio-gs-shell-${VERSION}`;
const FONTS_CACHE = `radio-gs-fonts-${VERSION}`;
const RUNTIME_CACHE = `radio-gs-runtime-${VERSION}`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/404.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

// --- lifecycle ---

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, FONTS_CACHE, RUNTIME_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.map((n) => keep.has(n) ? null : caches.delete(n)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.postMessage({ type: 'UPDATE_READY', version: VERSION }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// --- fetch strategies ---

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navigation: network-first -> shell -> 404.
  if (req.mode === 'navigate') {
    event.respondWith(navigationStrategy(req));
    return;
  }

  // Google Fonts: stale-while-revalidate in fonts cache.
  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, FONTS_CACHE));
    return;
  }

  // Same-origin: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }

  // Everything else: passthrough.
});

async function navigationStrategy(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const network = await withTimeout(fetch(req), 3000);
    // Cache latest shell copy for offline use.
    if (network && network.ok) cache.put('/index.html', network.clone());
    return network;
  } catch (_) {
    const cached = await cache.match('/index.html') || await cache.match('/');
    if (cached) return cached;
    const offline = await cache.match('/404.html');
    return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); },
                 (e) => { clearTimeout(timer); reject(e); });
  });
}
