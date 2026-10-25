// Offline support. The page plus every file `lion-hawk build` lists (manifest, icons, `assets/models/*`) is precached;
// the Google Font is cached as it is first fetched.
const CACHE = 'rally-0.8.0+lh0.13.0-8500097bdcf8';
const PRECACHE = ["./","assets/models/cone.glb","assets/models/hatchback-sports.glb","assets/models/sedan-sports.glb","assets/models/wheel-racing.glb","apple-touch-icon.png","ground-grass-color.jpg","ground-grass-normal.jpg","ground-snow-color.jpg","ground-snow-normal.jpg","icon-192.png","icon-512.png","icon.svg","manifest.webmanifest","og-image.jpg","road-gravel-color.jpg","road-gravel-normal.jpg","road-hardpack-color.jpg","road-hardpack-normal.jpg","road-packed-color.jpg","road-packed-normal.jpg","road-tarmac-color.jpg","road-tarmac-normal.jpg"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('rally-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !font) return;
  // The page itself is network-first so a reopened home-screen app picks up a new build
  // straight away; the cache is only the offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); }
      return res;
    }).catch(() => caches.match('./')));
    return;
  }
  // Everything else is cache-first; a new build changes CACHE (via 0.8.0+lh0.13.0-8500097bdcf8), which re-fetches it.
  e.respondWith(caches.match(req, { ignoreSearch: !font }).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
