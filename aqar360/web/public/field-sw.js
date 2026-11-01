// Field app offline support (scope /admin/field). The last loaded Field screen is kept so staff can still see today's
// list without signal; app files are cached as they load. Actions recorded offline wait in the page's own queue
// (IndexedDB) and are sent by the page, not here. Signed out = the saved copy is deleted.
const CACHE = "aqar-field-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Built app files never change under the same name: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/admin/app-icon/")) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  // The Field screen itself: network first, the saved copy when offline.
  if (req.mode === "navigate" && url.pathname === "/admin/field") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.redirected && new URL(res.url).pathname.startsWith("/admin/login")) await caches.delete(CACHE);
        else if (res.ok) await cache.put("/admin/field", res.clone());
        return res;
      } catch {
        return (await cache.match("/admin/field")) ||
          new Response("<meta charset=utf-8><p style='font:16px sans-serif;padding:24px'>📵 No signal and nothing saved yet. Open this page once with signal. · لا توجد تغطية ولم يُحفظ شيء بعد.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
  }
});
