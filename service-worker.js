const CACHE_NAME = "cuartel-de-la-cava-pwa-v34";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=45",
  "./overrides.css?v=toast-position-20261020",
  "./access-entry.css?v=5",
  "./navigation-fix.css?v=1",
  "./notification-overrides.js?v=1",
  "./app.js?v=incident-dialog-final-20261020",
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
  event.respondWith(fetch(new Request(event.request, { cache: "no-store" })).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "Hay novedades en la comunidad." }; }
  const title = payload.title || "Comunidad Cuartel de la Cava";
  const options = { body: payload.body || "Tienes una nueva actualización.", icon: "./icon.svg?v=3", badge: "./icon.svg?v=3", tag: payload.tag || "cuartel-de-la-cava", renotify: true, data: { url: payload.url || "./" } };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const existing = list.find(client => client.url.startsWith(self.location.origin));
    return existing ? existing.focus().then(() => existing.navigate(target)) : clients.openWindow(target);
  }));
});
