const CACHE_NAME = "portal-shell-v3";
const SHELL_ASSETS = ["/brand-icon-192.png", "/brand-icon.png", "/portal-manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

// Every /api/* request, and anything outside /portal, always goes
// straight to the network untouched. Employee data (payslips, leave,
// documents) is never cached by this worker.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (
    !url.pathname.startsWith("/portal") &&
    url.pathname !== "/brand-icon-192.png" &&
    url.pathname !== "/brand-icon.png" &&
    url.pathname !== "/portal-manifest.json"
  )
    return;
  // The page document itself is network-first, falling back to the
  // cache only when the network is unreachable (true offline). Its
  // built JS/CSS are content-hashed and the previous deploy's files
  // stop being served once a new one goes out, so serving a cached
  // copy of the document while online would reference assets that no
  // longer exist and leave the app stuck with nothing rendered.
  const isDocument = url.pathname === "/portal" || url.pathname.startsWith("/portal/");
  if (isDocument) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok)
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }
  // Static sub-resources (icon/manifest) are safe to serve stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok)
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
