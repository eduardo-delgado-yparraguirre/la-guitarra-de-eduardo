// Offline support: keeps the app and every song cached on the phone.
// Serves from cache immediately and refreshes it in the background.
// Bump VERSION when the app files change to drop old caches.

const VERSION = "v8";
const CACHE = `guitarra-${VERSION}`;
const SHELL = [
  "./", "index.html", "assets/style.css", "assets/app.js", "assets/chords.js",
  "assets/icon.svg", "assets/icon-192.png", "manifest.webmanifest", "songs/index.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const index = await (await fetch("songs/index.json")).json();
    await cache.addAll(index.map((s) => `songs/${s.slug}.cho`));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    const fresh = fetch(event.request)
      .then((res) => { if (res.ok) cache.put(event.request, res.clone()); return res; })
      .catch(() => cached);
    return cached ?? fresh;
  })());
});
