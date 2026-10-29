// Offline support. The page plus every file `lion-hawk build` lists (manifest, icons, `assets/models/*`) is precached;
// the Google Font is cached as it is first fetched.
const CACHE = 'rally-0.13.0+lh0.14.1-4ea7bfcbe86e';
const PRECACHE = ["./","assets/models/cone.glb","assets/models/escort-rs1800.glb","assets/models/impreza-555.glb","assets/models/lancer-evo6.glb","assets/models/peugeot-205-t16.glb","assets/models/peugeot-206-wrc.glb","assets/models/polo-r-wrc.glb","assets/models/sport-quattro-s1.glb","assets/models/stratos-hf.glb","assets/models/wheel-racing.glb","assets/models/xsara-wrc.glb","assets/models/yaris-wrc.glb","apple-touch-icon.png","icon-192.png","icon-512.png","icon.svg","manifest.webmanifest","og-image.jpg"];

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
  // Everything else is cache-first; a new build changes CACHE (via 0.13.0+lh0.14.1-4ea7bfcbe86e), which re-fetches it.
  e.respondWith(caches.match(req, { ignoreSearch: !font }).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
