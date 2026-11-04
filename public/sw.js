/* Nébula · service worker propio (sin CDN ni servicios de terceros)
   - App shell: cachea los archivos estáticos para abrir sin red.
   - Navegación: red primero, caché como respaldo.
   - Respuestas de addons/imágenes: caché primero + revalidación en segundo plano. */

const VERSION = 'nebula-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
const RUNTIME_LIMIT = 220;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((request) => cache.delete(request)));
}

function cacheable(response) {
  return Boolean(response) && (response.ok || response.type === 'opaque');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Nunca interceptamos el propio servidor de desarrollo.
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/src/')) return;
  if (url.pathname.startsWith('/node_modules/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL);
          return (await cache.match(request)) || (await cache.match('/index.html')) || Response.error();
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then(async (response) => {
          if (cacheable(response)) {
            const cache = await caches.open(RUNTIME);
            await cache.put(request, response.clone());
            void trim(RUNTIME, RUNTIME_LIMIT);
          }
          return response;
        })
        .catch(() => hit || Response.error());

      return hit || network;
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'nebula:clear-cache') {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => self.clients.matchAll())
        .then((clients) => clients.forEach((client) => client.postMessage('nebula:cache-cleared'))),
    );
  }
});
