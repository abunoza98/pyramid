/* Football Pyramids: service worker. Makes the site installable as an app and keeps working offline.

   - Pages and data files: network first, so tables are always fresh. The last copy is kept and shown when offline.
   - Assets (CSS, JS, fonts, icons): cache first. Their URLs carry a fingerprint (?v=…), so a change is a new URL.
   - Anything on another site (live scores worker, ads) is left alone.

   To force every visitor onto a fresh cache, bump VERSION. To switch the service worker off, see the note in assets/app.js. */

const VERSION = "v1";
const PAGES = "fp-pages-" + VERSION;
const ASSETS = "fp-assets-" + VERSION;
const MAX_PAGES = 60;   // pages and data files kept for offline use

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(["/"])).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fp-") && k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate" || url.pathname.startsWith("/data/")) {
    event.respondWith(networkFirst(req, url));
  }
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    caches.open(ASSETS).then((c) => c.put(req, copy));
  }
  return res;
}

async function networkFirst(req, url) {
  // Data files are fetched with ?t=<time> to dodge caches, so they are stored without the query.
  const key = url.origin + url.pathname;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      caches.open(PAGES).then((c) => c.put(key, copy).then(() => trim(c)));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(key);
    if (hit) return hit;
    if (req.mode === "navigate") {
      const home = await caches.match("/");
      return home || new Response("<!doctype html><meta name=viewport content='width=device-width'><title>Offline</title>" +
        "<p style='font-family:system-ui;padding:24px'>You're offline. Reconnect to see the latest tables.</p>",
        { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    throw err;
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_PAGES;
  for (let i = 0; i < extra; i++) if (new URL(keys[i].url).pathname !== "/") await cache.delete(keys[i]);
}
