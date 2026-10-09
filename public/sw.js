const cacheName = 'egbe-shell-v1';

async function cacheShell() {
  const cache = await caches.open(cacheName);
  const response = await fetch('/', { cache: 'reload' });
  if (!response.ok) throw new Error('The learning shell could not be loaded.');
  const html = await response.clone().text();
  const assets = [
    ...new Set(html.match(/\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css)/g) ?? []),
  ];
  if (assets.length < 2) throw new Error('The learning assets were not found.');
  await cache.addAll(assets);
  await cache.put('/', response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('egbe-shell-') && name !== cacheName) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

async function navigation(request) {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok) {
      await cache.put('/', response.clone());
      return response;
    }
    return (await cache.match('/')) ?? response;
  } catch (error) {
    const saved = await cache.match('/');
    if (saved) return saved;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(navigation(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(cacheName);
        // Hashed public assets do not vary by identity or request Origin.
        // Module-script and install-time fetches can send different headers.
        const saved = await cache.match(request, { ignoreVary: true });
        if (saved) return saved;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data !== 'offline-status') return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      const shell = await cache.match('/');
      event.ports[0]?.postMessage({ ready: Boolean(shell) });
    })(),
  );
});
