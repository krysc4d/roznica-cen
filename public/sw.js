// Service worker: aplikacja działa offline po pierwszym otwarciu.
// Pliki silnika odczytu zdjęć (vendor/) trafiają do pamięci przy pierwszym użyciu, więc potem działają offline.
// Przy zmianie plików podbij numer wersji, żeby telefon pobrał nowe.
const CACHE = "roznica-cen-v3";
const FILES = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/calc.js",
  "js/ocr.js",
  "js/receipt.js",
  "js/scan.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
    )
  );
});
