// Offline support. The page, the baked models, the icons and the Google Font are
// cached, so the farm plays with no connection.
const CACHE = 'pig-pens-2.6.1+lh0.15.0-4e256efabe05';
const PRECACHE = ["./","assets/models/apple.glb","assets/models/barn.glb","assets/models/barrel.glb","assets/models/bush.glb","assets/models/bushS.glb","assets/models/cabbage.glb","assets/models/carrot.glb","assets/models/cat.glb","assets/models/chick.glb","assets/models/chick.anim.json","assets/models/clinic.glb","assets/models/cob.glb","assets/models/coop.glb","assets/models/corn.glb","assets/models/dog.glb","assets/models/dogHouse.glb","assets/models/egg.glb","assets/models/fence.glb","assets/models/flowerR.glb","assets/models/flowerY.glb","assets/models/fox.glb","assets/models/furn_bedSingle.glb","assets/models/furn_bookcaseOpenLow.glb","assets/models/furn_chairDesk.glb","assets/models/furn_coatRackStanding.glb","assets/models/furn_computerScreen.glb","assets/models/furn_desk.glb","assets/models/furn_kitchenCabinet.glb","assets/models/furn_kitchenCoffeeMachine.glb","assets/models/furn_kitchenFridgeSmall.glb","assets/models/furn_kitchenSink.glb","assets/models/furn_lampRoundFloor.glb","assets/models/furn_pillow.glb","assets/models/furn_pottedPlant.glb","assets/models/furn_rugRounded.glb","assets/models/furn_trashcan.glb","assets/models/gate.glb","assets/models/grass.glb","assets/models/grassS.glb","assets/models/hay.glb","assets/models/hayB.glb","assets/models/oak.glb","assets/models/pig.glb","assets/models/pig.anim.json","assets/models/planks.glb","assets/models/post.glb","assets/models/pumpkin.glb","assets/models/rock.glb","assets/models/sack.glb","assets/models/sign.glb","assets/models/tree.glb","assets/models/treeFall.glb","assets/models/treeFat.glb","assets/models/vet.glb","assets/models/wheat.glb","apple-touch-icon.png","icon-192.png","icon-512.png","icon.svg","manifest.webmanifest","og-image.jpg"]; // the build's list: the page, assets/models/*, the manifest and icons

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('pig-pens-') && k !== CACHE).map(k => caches.delete(k))))
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
  // Everything else is cache-first; a new build changes CACHE (via 2.6.1+lh0.15.0-4e256efabe05), which re-fetches it.
  e.respondWith(caches.match(req, { ignoreSearch: !font }).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
