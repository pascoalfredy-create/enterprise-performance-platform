const CACHE_NAME = "portal-shell-v1";
const SHELL_ASSETS = ["/portal", "/portal-icon.svg", "/portal-manifest.json"];

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

// Stale-while-revalidate for the portal's own shell (the page document
// and its manifest/icon) only — every /api/* request, and anything
// outside /portal, always goes straight to the network. Employee data
// (payslips, leave, documents) is never cached by this worker; the
// point is making the installed app shell load instantly offline, not
// serving stale financial or personal data.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (
    !url.pathname.startsWith("/portal") &&
    url.pathname !== "/portal-icon.svg" &&
    url.pathname !== "/portal-manifest.json"
  )
    return;
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
