const CACHE_NAME = "cuartel-de-la-cava-pwa-v12";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=45",
  "./overrides.css?v=53",
  "./access-entry.css?v=5",
  "./app.js?v=108",
  "./manifest.webmanifest?v=1",
  "./icon.svg?v=3"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
