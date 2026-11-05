// Offline support: the page, its model files (assets/models, D1), the icons and the Google Font.
const CACHE = 'harvest-0.3.1+lh0.17.0-9766363d100f';
const PRECACHE = ["./","assets/models/alfalfa.glb","assets/models/bale.glb","assets/models/baletrailer.glb","assets/models/bush.glb","assets/models/bushL.glb","assets/models/cart.glb","assets/models/clover.glb","assets/models/combine.glb","assets/models/compost.glb","assets/models/corn.glb","assets/models/doghouse.glb","assets/models/farmhouse.glb","assets/models/fence.glb","assets/models/flowerbed.glb","assets/models/gate.glb","assets/models/hay.glb","assets/models/haybarn.glb","assets/models/header.glb","assets/models/lawn.glb","assets/models/longgrass.glb","assets/models/mower.glb","assets/models/oak.glb","assets/models/rock.glb","assets/models/shed.glb","assets/models/sign.glb","assets/models/silo.glb","assets/models/sunflower.glb","assets/models/tipcart.glb","assets/models/tractor.glb","assets/models/tree.glb","assets/models/treeFat.glb","assets/models/wheat.glb","assets/models/wildflowers.glb","assets/models/workbench.glb","apple-touch-icon.png","icon.svg","manifest.webmanifest"]; // lion-hawk build stamps the list: ./, the manifest, the icons and every assets/models file (D1)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('harvest-') && k !== CACHE).map(k => caches.delete(k))))
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
  // Everything else is cache-first; a new build changes CACHE (via 0.3.1+lh0.17.0-9766363d100f), which re-fetches it.
  e.respondWith(caches.match(req, { ignoreSearch: !font }).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
