// Offline support: the page, its model files (assets/models, D1), the icons and the Google Font.
const CACHE = 'tractor-pickup-1.11.1+lh0.13.1-417fe67d9604';
const PRECACHE = ["./","assets/models/bale.glb","assets/models/barn.glb","assets/models/barrel.glb","assets/models/bunny.glb","assets/models/bunny.anim.json","assets/models/bush.glb","assets/models/bushS.glb","assets/models/chick.glb","assets/models/chick.anim.json","assets/models/chicken.glb","assets/models/chicken.anim.json","assets/models/cone.glb","assets/models/corn.glb","assets/models/cow.glb","assets/models/cow.anim.json","assets/models/dog.glb","assets/models/dog.anim.json","assets/models/duck.glb","assets/models/duck.anim.json","assets/models/fence.glb","assets/models/flowerR.glb","assets/models/flowerY.glb","assets/models/gate.glb","assets/models/grass.glb","assets/models/hat-cowboy.glb","assets/models/hat-party.glb","assets/models/hat-straw.glb","assets/models/hay.glb","assets/models/log.glb","assets/models/oak.glb","assets/models/pig.glb","assets/models/pig.anim.json","assets/models/pumpkin.glb","assets/models/rock.glb","assets/models/rockA.glb","assets/models/rockB.glb","assets/models/rockC.glb","assets/models/sheep.glb","assets/models/sheep.anim.json","assets/models/shrub.glb","assets/models/sprinkler.glb","assets/models/stump.glb","assets/models/stump-cut.glb","assets/models/tractor.glb","assets/models/trailer.glb","assets/models/tree.glb","assets/models/treeFat.glb","assets/models/wash.glb","apple-touch-icon.png","icon-192.png","icon-512.png","icon.svg","manifest.webmanifest","og-image.jpg"]; // lion-hawk build stamps the list: ./, the manifest, the icons and every assets/models file (D1)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('tractor-pickup-') && k !== CACHE).map(k => caches.delete(k))))
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
  // Everything else is cache-first; a new build changes CACHE (via 1.11.1+lh0.13.1-417fe67d9604), which re-fetches it.
  e.respondWith(caches.match(req, { ignoreSearch: !font }).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
