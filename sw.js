const CACHE = "speak-beat-v1.0.6";
const CORE = [
  "./", "./index.html", "./css/app.css", "./manifest.webmanifest",
  "./js/app.js", "./js/game.js", "./js/judge.js", "./js/scoring.js", "./js/speech.js", "./js/audio.js", "./js/storage.js", "./js/backup.js",
  "./data/phrases-core.json", "./data/tracks.json", "./data/game-config.json",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png"
];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match(event.request).then(hit => hit || (event.request.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
});
