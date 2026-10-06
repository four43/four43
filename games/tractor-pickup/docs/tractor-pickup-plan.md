# Tractor Pickup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Tractor Pickup, a 3D browser game for a 4-year-old: drive a rally-feel tractor that tows a trailer and a wagon out of a farmyard on tile-generated gravel routes, boop farm animals into the trailers, come back through the barn, and watch a show that counts and names them.

**Architecture:** A pure simulation layer (`src/sim/`, no three.js, runs in Node) owns Rapier physics, farm generation, animals, trip logic and rewards, and is tested headless with `node --test`. A render layer (`src/render/`) draws the sim state with three.js using interpolated fixed-step snapshots. A UI layer (`src/ui/`, `src/audio/`) handles input, HUD, the barn show, parent menu, sounds and recorded voice. esbuild bundles everything into one self-contained HTML file plus PWA files, written to `site/exp/tractor-pickup/`.

**Tech Stack:** three.js ^0.186, `@dimforge/rapier3d-compat` ^0.21 (ray-cast vehicle controller, spherical impulse joints), esbuild, `@gltf-transform/core` + `pngjs` (asset bake), Node's built-in test runner, Python 3 build script, optional `ffmpeg` (voice clip trim and loudness).

**Spec:** `games/tractor-pickup/docs/tractor-pickup-spec.md` (version 1.1: farmyard and routes). Item IDs in this plan (T-1, B-5, …) refer to that spec.

## Global Constraints

- Source in `games/tractor-pickup/`; build output in `site/exp/tractor-pickup/` (X-6, X-7).
- Main device: iPad, landscape, 60 fps on a 2020-or-newer iPad (X-3, X-4). Single player.
- Physics: fixed step `DT = 1/60` with render interpolation (X-1). Units are meters.
- `src/sim/**` must never import `three`. It must run in Node.
- Text in the game: only animal names and the numbers and names in the show (R-2, U-4). Every word on screen is also spoken.
- The player cannot fail; animals never leave the trailer once in (R-1, R-4). No scary sounds or crash damage (R-8).
- Reading font: Andika (Google Fonts). UI font: Sniglet (same as Pig Pens).
- Slots: 12 (trailer 6 + wagon 6). No fixed goal: any barn pass with at least one animal starts the show (G-1, G-2, F-1).
- Power presets: Low 6 m/s, Medium 9 m/s (default), High 12 m/s (P-7).
- Seeded randomness only through `src/sim/rng.js` so a seed always rebuilds the same farm (T-4).
- Commits: conventional style matching the repo (`feat: Tractor Pickup - …`). **No `Co-Authored-By` trailer** (user's global CLAUDE.md). Stage only the files the task lists: the working tree has unrelated uncommitted changes. Do not push: a push to `gh-pages` deploys.
- Kenney source packs: `KENNEY="$HOME/Downloads/Kenney Game Assets All-in-1 3.7.0/3D assets"`. Nature Kit models are `.glb` files inside its `Models/GLTF format/` folder.

## Spec status

Spec version 1.1 already includes the farmyard and two routes, the drive-through barn and the show, the sheep and duck recolors, and the ramp kicker. The plan makes no further design changes. Task 15 records the test results in the spec (version 1.2).

## File Structure

```text
games/tractor-pickup/
├── package.json, package-lock.json, .gitignore
├── bake.mjs                 # Kenney GLB -> src/assets.json (vertex colors, pet anim tables)
├── build.py                 # esbuild bundle + voice clips -> site/exp/tractor-pickup/
├── template.html            # page shell, CSS, DOM for HUD/menus
├── pwa/                     # manifest, sw.js, icons
├── audio/voice/             # parent-recorded MP3s + README.md (word list)
├── docs/                    # spec + this plan
├── src/
│   ├── assets.json          # baked (committed, like Pig Pens)
│   ├── main.js              # boot, fixed-step loop, wiring
│   ├── sim/                 # PURE: no three.js
│   │   ├── rng.js           # seeded RNG
│   │   ├── physics.js       # Rapier world, collision groups, ground
│   │   ├── tractor.js       # rally vehicle (D-1..D-9)
│   │   ├── hitch.js         # trailer + wagon, spherical joints (D-4, D-10..D-12)
│   │   ├── track.js         # farm generator: farmyard, routes, features, yard layout (4.1-4.7)
│   │   ├── road.js          # route centerlines, nearest point, surfaces, barn pass
│   │   ├── scenery.js       # field scenery, fences, yard props, colliders (4.6, 4.7)
│   │   ├── edges.js         # rock edges along the routes (T-17)
│   │   ├── slots.js         # slot layout, load, rider springs (B-8..B-13)
│   │   ├── launch.js        # predefined launch path (B-5, B-6)
│   │   ├── herd.js          # animals, behaviors, delivery into the barn, respawn (section 5)
│   │   ├── dirt.js          # dirt levels (T-16)
│   │   ├── trip.js          # trip state machine (3.1, F-2, F-4)
│   │   ├── showSteps.js     # barn show timeline (3.4)
│   │   ├── words.js         # voice word list and sentences (section 12)
│   │   ├── progress.js      # stickers, colors, hats (section 9)
│   │   ├── sandbox.js       # flat test arena with ramp + mud (physics playtest)
│   │   └── game.js          # composes everything; step(input) -> events
│   ├── render/              # three.js only
│   │   ├── gfx.js           # geometry helpers, pet anim sampling (from Pig Pens)
│   │   ├── scene.js         # renderer, lights, sky, resize
│   │   ├── camera.js        # chase camera (V-1..V-3)
│   │   ├── vehicles3d.js    # tractor, trailer, wagon meshes, colors, dirt
│   │   ├── farm3d.js        # ground, yard, road ribbons, mud, ramp, sprinkler, barn, stage, props, scenery
│   │   ├── animals3d.js     # pets, golden, hats, flight flourishes
│   │   ├── dirtMat.js       # dirt-spot material patch
│   │   └── fx.js            # particles, tire marks, sparkles, confetti
│   ├── ui/
│   │   ├── input.js         # floating stick, keys, gamepad, horn
│   │   ├── hud.js           # slot bar, name word, edge arrow
│   │   ├── icons.js         # render animal portraits to data URLs
│   │   ├── show.js          # the barn show: camera, hops, labels
│   │   ├── menus.js         # start screen, sticker card, sticker book, colors, parent menu
│   │   └── store.js         # localStorage wrapper (try/catch)
│   └── audio/
│       ├── sound.js         # synthesized SFX + engine + music
│       └── voice.js         # recorded clips with speech fallback
└── test/                    # node --test, *.test.mjs
```

## Playtest checkpoints

| After task | What the user tests on the iPad |
|---|---|
| 5 | Tractor + trailer + wagon feel in a flat sandbox with a ramp and mud. Tune with `?tune`. |
| 7 | The farmyard (push bales, knock cones) and both routes. Try several seeds. |
| 7b | Wider routes with rock edges, bigger farmyard, new barn. |
| 10 | Core loop: boop animals, launches, slots, names. |
| 11 | Trips through the barn and the show. |
| 13 | Full trips with voice, mud and the sprinkler. |
| 15 | Final build, installed to the home screen. |

**How to playtest on the iPad:** run `docker compose up` in the repo root, then run `npm run build` in `games/tractor-pickup`. Open `http://<PC-LAN-IP>:4000/exp/tractor-pickup/` on the iPad (`ip -4 addr` shows the IP). Jekyll serves `site/` on port 4000 and binds all interfaces.

---

### Task 1: Project scaffold, seeded RNG, build pipeline

**Files:**
- Create: `games/tractor-pickup/package.json`, `.gitignore`, `build.py`, `template.html`, `src/main.js`, `src/sim/rng.js`, `test/rng.test.mjs`, `pwa/manifest.webmanifest`, `pwa/sw.js`, `pwa/icon.svg`

**Interfaces:**
- Produces: `makeRng(seed) -> { next(): number in [0,1), range(a,b), int(a,b) (inclusive), pick(arr), chance(p), shuffle(arr) }`, `randomSeed(): uint32`.
- Produces: `npm test`, `npm run build`, `npm run bake` scripts.

- [ ] **Step 1: Create package.json and install**

```json
{
  "name": "tractor-pickup",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "bake": "node bake.mjs",
    "build": "python3 build.py"
  },
  "dependencies": {
    "@dimforge/rapier3d-compat": "^0.21.0",
    "three": "^0.186.0"
  },
  "devDependencies": {
    "@gltf-transform/core": "^4.5.1",
    "@gltf-transform/extensions": "^4.5.1",
    "esbuild": "^0.28.2",
    "pngjs": "^7.0.0"
  }
}
```

`.gitignore`:

```text
node_modules/
build/
```

Run: `cd games/tractor-pickup && npm install`
Expected: installs without errors.

- [ ] **Step 2: Write the failing RNG test**

`test/rng.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, randomSeed } from '../src/sim/rng.js';

test('same seed gives the same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});
test('different seeds differ', () => {
  assert.notEqual(makeRng(1).next(), makeRng(2).next());
});
test('next is in [0,1)', () => {
  const r = makeRng(7);
  for (let i = 0; i < 10000; i++) { const v = r.next(); assert.ok(v >= 0 && v < 1); }
});
test('int is inclusive and covers the range', () => {
  const r = makeRng(3), seen = new Set();
  for (let i = 0; i < 2000; i++) { const v = r.int(1, 2); assert.ok(v === 1 || v === 2); seen.add(v); }
  assert.equal(seen.size, 2);
});
test('pick and shuffle are deterministic', () => {
  assert.equal(makeRng(9).pick(['a', 'b', 'c', 'd']), makeRng(9).pick(['a', 'b', 'c', 'd']));
  assert.deepEqual(makeRng(9).shuffle([1, 2, 3, 4, 5]), makeRng(9).shuffle([1, 2, 3, 4, 5]));
});
test('randomSeed is a uint32', () => {
  const s = randomSeed(); assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/sim/rng.js'`.

- [ ] **Step 4: Implement rng.js**

```js
// Seeded random numbers (mulberry32). All farm randomness goes through here so a seed rebuilds the same farm.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
    shuffle(arr) { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; },
  };
}
export const randomSeed = () => Math.floor(Math.random() * 2 ** 32) >>> 0;
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: 6 tests PASS.

- [ ] **Step 6: Build pipeline**

`build.py` (adapted from `games/pig-pens/build.py`; Task 12 adds voice clips):

```python
import subprocess, pathlib, shutil, hashlib, json
here = pathlib.Path(__file__).resolve().parent
out_dir = here.parents[1] / 'site/exp/tractor-pickup'
subprocess.run(['npx', 'esbuild', 'src/main.js', '--bundle', '--format=iife', '--minify', '--loader:.json=json',
                '--outfile=build/app.js', '--log-level=warning'], check=True, cwd=here)
app = (here / 'build/app.js').read_text().replace('</script', '<\\/script')
html = (here / 'template.html').read_text().replace('<!--APP-->', app)
out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / 'index.html').write_text(html)
for f in (here / 'pwa').iterdir():
    if f.name != 'sw.js': shutil.copy(f, out_dir / f.name)
version = json.loads((here / 'package.json').read_text())['version'] + '-' + hashlib.sha256(html.encode()).hexdigest()[:12]
(out_dir / 'sw.js').write_text((here / 'pwa/sw.js').read_text().replace('__VERSION__', version))
print('wrote', out_dir, round(len(html) / 1e6, 2), 'MB, sw version', version)
```

`pwa/sw.js`: copy `games/pig-pens/pwa/sw.js` and replace both `pig-pens-` strings with `tractor-pickup-`.

`pwa/manifest.webmanifest`:

```json
{
  "name": "Tractor Pickup",
  "short_name": "Tractor Pickup",
  "description": "Drive the tractor, pick up the farm animals, and count them in the barn.",
  "id": "/exp/tractor-pickup/",
  "start_url": "/exp/tractor-pickup/",
  "scope": "/exp/tractor-pickup/",
  "display": "fullscreen",
  "display_override": ["fullscreen", "standalone"],
  "orientation": "landscape",
  "background_color": "#bfe6f5",
  "theme_color": "#bfe6f5",
  "icons": [{ "src": "icon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

`pwa/icon.svg`: a simple red tractor silhouette on a sky circle (Task 15 adds the PNG icons):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#bfe6f5"/><rect x="14" y="28" width="30" height="12" rx="3" fill="#d8342c"/><rect x="30" y="16" width="14" height="14" rx="2" fill="#d8342c"/><rect x="33" y="19" width="8" height="7" fill="#e8f6ff"/><circle cx="38" cy="44" r="9" fill="#333"/><circle cx="38" cy="44" r="4" fill="#f5c84c"/><circle cx="18" cy="46" r="6" fill="#333"/><circle cx="18" cy="46" r="2.5" fill="#f5c84c"/></svg>
```

`template.html`: copy the `<head>` of `games/pig-pens/template.html`. Change the title, description, canonical, OG and Twitter URLs to `tractor-pickup` and "Tractor Pickup", and add Andika to the font link (`family=Andika:wght@400;700&family=Sniglet:wght@400;800`). Keep the `:root` tokens, the dark-mode block, the `html,body` rules and `#c`. Body:

```html
<body>
<canvas id="c"></canvas>
<div id="ui"></div>
<script><!--APP--></script>
<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('service worker', e)));</script>
</body>
```

`src/main.js` (smoke version; Task 5 replaces it):

```js
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
async function main() {
  await RAPIER.init();
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#bfe6f5');
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 500); camera.position.set(0, 8, 12); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#eef7ff', '#b9a27c', 2));
  const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#88cc72' }));
  scene.add(g);
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
}
main();
```

- [ ] **Step 7: Build and look at it**

Run: `npm run build` and then, with `docker compose up` running at the repo root, open `http://localhost:4000/exp/tractor-pickup/`.
Expected: the build prints `wrote …`. A sky-blue page shows a green square. The console has no errors.

- [ ] **Step 8: Commit**

```bash
git add games/tractor-pickup/package.json games/tractor-pickup/package-lock.json games/tractor-pickup/.gitignore games/tractor-pickup/build.py games/tractor-pickup/template.html games/tractor-pickup/src/main.js games/tractor-pickup/src/sim/rng.js games/tractor-pickup/test/rng.test.mjs games/tractor-pickup/pwa games/tractor-pickup/docs site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup - scaffold, seeded rng and build pipeline"
```

---

### Task 2: Asset bake (tractor, pets, scenery) and gfx helpers

**Files:**
- Create: `games/tractor-pickup/bake.mjs`, `src/assets.json` (generated), `src/render/gfx.js`, `test/assets.test.mjs`

**Interfaces:**
- Produces: `src/assets.json` with keys: statics `tractor, oak, tree, treeFat, bush, bushS, fence, rock, pumpkin, corn, grass, flowerY, flowerR, log, stump, hay` (each `{ partName: {pos,nrm,col,idx} }`), pets `pig, cow, chick, bunny, dog, sheep, duck` (each `{ parts: [{name,pos,nrm,col,idx}], anims: {idle,walk,run,eat,dance?: {dur, frames}} }`).
- Produces (render/gfx.js): `ASSETS, s2l, geoFrom(parts, xf?), modelGeo(name, xf?), colorGeo(g, hex), mergeGeos(list), boxGeo(w,h,d,x,y,z,hex), animM(pet), sampleAnim(anims, name, t, partIdx, out), PET_ANIMS` — the same signatures as `games/pig-pens/src/gfx.js`.

- [ ] **Step 1: Write the failing asset test**

`test/assets.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = JSON.parse(fs.readFileSync(new URL('../src/assets.json', import.meta.url)));

test('statics are present and non-empty', () => {
  for (const k of ['tractor', 'oak', 'tree', 'treeFat', 'bush', 'bushS', 'fence', 'rock', 'pumpkin', 'corn', 'grass', 'flowerY', 'flowerR', 'log', 'stump', 'hay']) {
    assert.ok(A[k], k); const parts = Object.values(A[k]); assert.ok(parts.length > 0, k);
    for (const p of parts) assert.ok(p.idx.length > 0 && p.pos.length === p.col.length, k);
  }
});
test('tractor has body and four named wheels', () => {
  for (const n of ['body', 'wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']) assert.ok(A.tractor[n], n);
});
test('every pet has parts and idle/walk/run anims with one matrix per part', () => {
  for (const pet of ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck']) {
    const P = A[pet]; assert.ok(P && P.parts.length >= 5, pet);
    for (const a of ['idle', 'walk', 'run']) {
      assert.ok(P.anims[a], `${pet}.${a}`);
      for (const f of P.anims[a].frames) assert.equal(f.length, P.parts.length);
    }
  }
});
test('sheep is not pink and duck is not yellow', () => {
  const avg = parts => { let r = 0, g = 0, b = 0, n = 0; for (const p of parts) for (let i = 0; i < p.col.length; i += 3) { r += p.col[i]; g += p.col[i + 1]; b += p.col[i + 2]; n++; } return [r / n, g / n, b / n]; };
  const [sr, sg] = avg(A.sheep.parts); assert.ok(sr - sg < 25, 'sheep still pink');
  const [dr, dg, db] = avg(A.duck.parts); assert.ok(db > 150, 'duck still yellow (blue channel low)');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `ENOENT … src/assets.json`.

- [ ] **Step 3: Write bake.mjs**

Copy `games/pig-pens/bake.mjs` verbatim up to and including `bakePet`. Then make these changes:

1. Replace `io.read('assets/' + file)` with `io.read(file)` (the callers below pass full paths).
2. Keep the anim filter as it is (`idle, walk, run, eat, dance, gesture-negative`).
3. Replace the `statics` block and pet calls with:

```js
const KENNEY = process.env.KENNEY || `${process.env.HOME}/Downloads/Kenney Game Assets All-in-1 3.7.0/3D assets`;
const NK = f => `${KENNEY}/Nature Kit/Models/GLTF format/${f}.glb`;
const PET = f => `${KENNEY}/Cube Pets/Models/GLB format/${f}.glb`;
const statics = {
  tractor: `${KENNEY}/Car Kit/Models/GLB format/tractor.glb`,
  oak: NK('tree_oak'), tree: NK('tree_default'), treeFat: NK('tree_fat'), bush: NK('plant_bushLarge'), bushS: NK('plant_bush'),
  fence: NK('fence_simple'), rock: NK('rock_smallC'), pumpkin: NK('crop_pumpkin'), corn: NK('crops_cornStageD'), grass: NK('grass_large'),
  flowerY: NK('flower_yellowB'), flowerR: NK('flower_redA'), log: NK('log'), stump: NK('stump_old'), hay: PET('hay-bale'),
};
const out = {};
for (const [k, f] of Object.entries(statics)) {
  const { root, geom } = await load(f);
  const parts = {};
  for (const n of root.listNodes()) if (n.getMesh()) parts[n.getName()] = geom(n, worldOf(n));
  out[k] = parts;
}
for (const p of ['pig', 'cow', 'chick', 'bunny', 'dog']) out[p] = await bakePet(PET('animal-' + p));

// Sheep and duck are recolors of the pig and the chick (the pack has neither). Same parts, same anims.
const mapCols = (pet, fn) => ({ ...pet, parts: pet.parts.map(p => { const col = p.col.slice(); for (let i = 0; i < col.length; i += 3) { const [r, g, b] = fn(col[i], col[i + 1], col[i + 2], p.name); col[i] = r; col[i + 1] = g; col[i + 2] = b; } return { ...p, col }; }) });
const isPink = (r, g, b) => r > 180 && r - g > 40 && b > g - 10;
out.sheep = mapCols(out.pig, (r, g, b) => isPink(r, g, b) ? (r - g > 90 ? [70, 62, 60] : [244, 238, 226]) : [r, g, b]); // snout/ears (deep pink) -> dark face, body -> wool
out.duck = mapCols(out.chick, (r, g, b) => (r > 220 && g > 150 && b < 120) ? [246, 246, 240] : [r, g, b]);           // yellow down -> white, beak/feet stay orange
fs.writeFileSync('src/assets.json', JSON.stringify(out));
console.log('bytes', fs.statSync('src/assets.json').size);
for (const pet of ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck']) console.log(pet, out[pet].parts.map(p => p.name).join(','), Object.keys(out[pet].anims).join(','));
```

- [ ] **Step 4: Check the palette, then bake**

Before you trust the recolor thresholds, print the unique pig and chick colors:

```bash
node --input-type=module -e "
import fs from 'fs'; const A = JSON.parse(fs.readFileSync('src/assets.json'));
for (const pet of ['pig','chick']) { const s = new Set(); for (const p of A[pet].parts) for (let i = 0; i < p.col.length; i += 3) s.add(p.col.slice(i, i + 3).join(',')); console.log(pet, [...s].join(' | ')); }"
```

Run `npm run bake` first, then the palette command. If the sheep or duck test fails, change only the thresholds in `isPink` and in the duck rule to match the printed colors. The rule: pink body → wool, deep pink snout/ears → dark face, yellow down → white.

Run: `npm run bake && npm test`
Expected: the bake prints part and anim lists for 7 pets. All asset tests PASS.

- [ ] **Step 5: Create src/render/gfx.js**

Copy `games/pig-pens/src/gfx.js` verbatim into `src/render/gfx.js` and change the import to `import ASSETS from '../assets.json';`. Add at the end:

```js
// One Matrix4 table per pet, built once.
export const PET_ANIMS = Object.fromEntries(['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck'].map(p => [p, animM(p)]));
```

- [ ] **Step 6: Commit**

```bash
git add games/tractor-pickup/bake.mjs games/tractor-pickup/src/assets.json games/tractor-pickup/src/render/gfx.js games/tractor-pickup/test/assets.test.mjs
git commit -m "feat: Tractor Pickup - bake Kenney tractor, pets and scenery"
```

---

### Task 3: Physics world and rally tractor

**Files:**
- Create: `src/sim/physics.js`, `src/sim/tractor.js`, `test/tractor.test.mjs`

**Interfaces:**
- Produces (physics.js): `DT = 1/60`, `G = { GROUND:1, STATIC:2, VEHICLE:4, TRAILER:8, PROP:16 }` (PROP = farmyard bales, cones, barrels), `groups(member, filter): number`, `createPhysics(RAPIER) -> { RAPIER, world }` (flat ground cuboid 200 × 200 m, top at y = 0).
- Produces (tractor.js): `POWER`, `SURFACE`, `TP`, `quatAxes(q) -> { f:{x,y,z}, u:{x,y,z}, r:{x,y,z} }`, `createTractor(phys, { x, z, yaw, power, surfaceAt(x,z) -> 'gravel'|'grass'|'mud' }) -> tractor` where `tractor` has `body, vc, W (wheel defs), setInput(thr, steer), setAssist(steerBias), step(DT), x, z, yaw, speed, fwd, slip (rad), engine (0..1), surface, power, setPower(name)`.
- Steering sign: `steer > 0` turns left (yaw increases, anticlockwise from above). Yaw convention: `yaw = atan2(f.x, f.z)` where `f` is the chassis forward in world.

- [ ] **Step 1: Write the failing tests**

`test/tractor.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { createTractor, POWER, quatAxes } from '../src/sim/tractor.js';
await RAPIER.init();

const make = (power = 'medium', surface = 'gravel') => {
  const phys = createPhysics(RAPIER);
  const t = createTractor(phys, { x: 0, z: 0, yaw: 0, power, surfaceAt: () => surface });
  const run = (sec, thr, steer, each) => { for (let i = 0; i < sec * 60; i++) { t.setInput(thr, steer); t.step(DT); phys.world.step(); each?.(); } };
  return { phys, t, run };
};

test('settles on four wheels', () => {
  const { t, run } = make(); run(2, 0, 0);
  for (let i = 0; i < 4; i++) assert.ok(t.vc.wheelIsInContact(i), 'wheel ' + i);
  assert.ok(quatAxes(t.body.rotation()).u.y > 0.99);
});
for (const p of ['low', 'medium', 'high']) test(`top speed matches the ${p} preset`, () => {
  const { t, run } = make(p); run(1, 0, 0); run(10, 1, 0);
  assert.ok(t.speed > POWER[p].vmax * 0.85 && t.speed < POWER[p].vmax * 1.08, `speed ${t.speed}`);
});
test('mud halves the top speed', () => {
  const { t, run } = make('medium', 'mud'); run(1, 0, 0); run(10, 1, 0);
  assert.ok(t.speed < POWER.medium.vmax * 0.55, `speed ${t.speed}`);
});
test('positive steer turns left (yaw increases)', () => {
  const { t, run } = make(); run(1, 0, 0); run(2, 0.6, 0); const y0 = t.yaw; run(1.5, 0.6, 1);
  let d = t.yaw - y0; d = Math.atan2(Math.sin(d), Math.cos(d)); assert.ok(d > 0.3, `yaw change ${d}`);
});
test('slides are bounded and it never spins out (high power, full lock)', () => {
  const { t, run } = make('high'); run(1, 0, 0); run(5, 1, 0);
  let maxSlip = 0, maxRate = 0;
  run(6, 1, 1, () => { if (t.speed > 3) maxSlip = Math.max(maxSlip, Math.abs(t.slip)); maxRate = Math.max(maxRate, Math.abs(t.body.angvel().y)); });
  assert.ok(maxSlip > 0.15, `no slide at all: ${maxSlip}`);           // it should feel like rally
  assert.ok(maxSlip < POWER.high.slideMax + 0.12, `slip ${maxSlip}`);   // D-7
  assert.ok(maxRate < 2.8, `yaw rate ${maxRate}`);
});
test('brakes then reverses slowly', () => {
  const { t, run } = make(); run(1, 0, 0); run(3, 1, 0); run(5, -1, 0);
  assert.ok(t.fwd < -1 && t.fwd > -3.3, `fwd ${t.fwd}`);
});
test('rights itself when tipped past 35 degrees', () => {
  const { t, run } = make(); run(1, 0, 0);
  const a = 1.2; t.body.setRotation({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) }, true); t.body.setTranslation({ x: 0, y: 1.5, z: 0 }, true);
  run(4, 0, 0); assert.ok(quatAxes(t.body.rotation()).u.y > 0.95);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/sim/physics.js'`.

- [ ] **Step 3: Implement physics.js**

```js
// Rapier world shared by every sim module. Ground top is y = 0.
export const DT = 1 / 60;
export const G = { GROUND: 1, STATIC: 2, VEHICLE: 4, TRAILER: 8, PROP: 16 };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export function createPhysics(RAPIER) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0).setFriction(0.9)
    .setCollisionGroups(groups(G.GROUND, 0xffff)));
  return { RAPIER, world };
}
```

- [ ] **Step 4: Implement tractor.js**

```js
// Rally-feel tractor on Rapier's ray-cast vehicle controller (spec D-1..D-9).
// Chassis frame: +x forward, +y up, +z right. Kenney model +z maps to chassis +x.
import { G, groups } from './physics.js';

export const POWER = {
  low:    { vmax: 6,  force: 5200,  rearSide: 0.85, slideMax: 0.35 },
  medium: { vmax: 9,  force: 7600,  rearSide: 0.62, slideMax: 0.6 },
  high:   { vmax: 12, force: 10000, rearSide: 0.48, slideMax: 0.78 },
};
export const SURFACE = { gravel: { grip: 1, vmul: 1 }, grass: { grip: 0.8, vmul: 0.7 }, mud: { grip: 0.55, vmul: 0.5 } };
export const TP = {
  scale: 1.6, mass: 1400, revForce: 3200, vrev: 3, brake: 30, handbrake: 60, roll: 1.5,
  steerMax: 0.62, steerRate: 2.8, inputRate: 4, suspRest: 0.32, stiffness: 18, compression: 2.0, relaxation: 2.6,
  slip: 2.4, travel: 0.45, yawRateMax: 2.6, slideK: 6, rightTilt: Math.cos(35 * Math.PI / 180), rightK: 9000,
};
export function quatAxes(q) {
  const { x, y, z, w } = q;
  return {
    f: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + w * z), z: 2 * (x * z - w * y) },
    u: { x: 2 * (x * y - w * z), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + w * x) },
    r: { x: 2 * (x * z + w * y), y: 2 * (y * z - w * x), z: 1 - 2 * (x * x + y * y) },
  };
}
const yawQuat = yaw => { const a = yaw - Math.PI / 2; return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }; };
const ease = (cur, tgt, rate, dt) => cur + Math.max(-rate * dt, Math.min(rate * dt, tgt - cur));

export function createTractor(phys, { x, z, yaw, power = 'medium', surfaceAt = () => 'gravel' }) {
  const { RAPIER, world } = phys, S = TP.scale;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0.3, z).setRotation(yawQuat(yaw))
    .setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.8)
    .setAdditionalMassProperties(TP.mass, { x: 0.15, y: 0.45, z: 0 }, { x: 900, y: 2200, z: 2000 }, { x: 0, y: 0, z: 0, w: 1 }));
  const cg = groups(G.VEHICLE, G.GROUND | G.STATIC | G.PROP);
  const cols = [
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.55, 0.5, 1.0).setTranslation(0.27, 0.95, 0).setDensity(0.1).setFriction(0.2).setRestitution(0).setCollisionGroups(cg), body),
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.55, 0.55, 0.62).setTranslation(-0.55, 1.95, 0).setDensity(0.1).setFriction(0.2).setCollisionGroups(cg), body),
  ];
  const vc = world.createVehicleController(body);
  const W = [
    { name: 'wheel-front-left', mx: 0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-front-right', mx: -0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-back-left', mx: 0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
    { name: 'wheel-back-right', mx: -0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
  ];
  W.forEach((w, i) => {
    w.cx = w.mz * S; w.cy = w.my * S; w.cz = -w.mx * S; w.radius = w.r * S;
    vc.addWheel({ x: w.cx, y: w.cy + 0.12, z: w.cz }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, TP.suspRest, w.radius);
    vc.setWheelSuspensionStiffness(i, TP.stiffness); vc.setWheelSuspensionCompression(i, TP.compression);
    vc.setWheelSuspensionRelaxation(i, TP.relaxation); vc.setWheelMaxSuspensionForce(i, 1e6); vc.setWheelMaxSuspensionTravel(i, TP.travel);
  });
  const rayGroups = groups(0xffff, G.GROUND | G.STATIC), own = new Set(cols.map(c => c.handle));

  const t = {
    body, vc, W, cols, power, P: POWER[power], thr: 0, steer: 0, inThr: 0, inSteer: 0, assist: 0,
    x, z, yaw, speed: 0, fwd: 0, slip: 0, engine: 0, surface: 'gravel', tilted: 0,
    setPower(name) { this.power = name; this.P = POWER[name]; },
    setInput(thr, steer) { this.inThr = Math.max(-1, Math.min(1, thr)); this.inSteer = Math.max(-1, Math.min(1, steer)); },
    setAssist(bias) { this.assist = bias; },
    step(dt) {
      const P = this.P, q = body.rotation(), { f, u, r } = quatAxes(q), lv = body.linvel(), p = body.translation();
      this.fwd = lv.x * f.x + lv.z * f.z; const side = lv.x * r.x + lv.z * r.z; this.speed = Math.hypot(lv.x, lv.z);
      this.slip = this.speed > 1 ? Math.atan2(side, Math.abs(this.fwd)) : 0;
      this.surface = surfaceAt(p.x, p.z); const SF = SURFACE[this.surface];
      this.thr = ease(this.thr, this.inThr, TP.inputRate, dt);
      const v = this.fwd, maxSteer = TP.steerMax / (1 + Math.abs(v) * 0.06);
      const want = Math.max(-1, Math.min(1, this.inSteer + this.assist));
      this.steer = ease(this.steer, want * maxSteer, TP.steerRate, dt);
      const vmax = P.vmax * SF.vmul;
      let force = 0, brake = 0;
      if (this.thr > 0.05) { if (v < -0.3) brake = TP.brake * this.thr; else force = P.force * this.thr * Math.max(0, 1 - v / vmax); }
      else if (this.thr < -0.05) { if (v > 0.3) brake = TP.brake * -this.thr; else force = -TP.revForce * -this.thr * Math.max(0, 1 + v / TP.vrev); }
      else brake = this.speed < 0.3 ? TP.handbrake : TP.roll;
      this.engine = Math.abs(force) / P.force;
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        vc.setWheelSteering(i, w.front ? this.steer : 0);
        vc.setWheelEngineForce(i, w.front ? 0 : force / 2);
        vc.setWheelBrake(i, brake);
        vc.setWheelFrictionSlip(i, TP.slip * SF.grip);
        vc.setWheelSideFrictionStiffness(i, (w.front ? 1 : P.rearSide) * SF.grip);
      }
      vc.updateVehicle(dt, undefined, rayGroups, c => !own.has(c.handle));
      // D-7 slide help: past slideMax, push the slide back toward the direction of travel
      const excess = Math.abs(this.slip) - P.slideMax;
      if (this.speed > 2 && excess > 0) {
        const k = -Math.sign(side) * excess * TP.slideK * TP.mass * dt;
        body.applyImpulse({ x: r.x * k, y: 0, z: r.z * k }, true);
      }
      const av = body.angvel();
      if (Math.abs(av.y) > TP.yawRateMax) body.setAngvel({ x: av.x, y: Math.sign(av.y) * TP.yawRateMax, z: av.z }, true);
      // D-2 soft self-righting past 35 degrees of tilt
      if (u.y < TP.rightTilt) {
        const k = TP.rightK * (TP.rightTilt - u.y + 0.2) * dt;
        body.applyTorqueImpulse({ x: -u.z * k, y: 0, z: u.x * k }, true);
        if (u.y < 0.2) body.applyImpulse({ x: 0, y: TP.mass * 4 * dt, z: 0 }, true);
      }
      this.x = p.x; this.z = p.z; this.yaw = Math.atan2(f.x, f.z);
    },
  };
  return t;
}
```

- [ ] **Step 5: Run the tests and tune**

Run: `npm test`
Expected: all tractor tests PASS. If the slide test fails, change only `POWER.*.rearSide`, `TP.slip` or `TP.slideK`. Lower `rearSide` gives more slide; higher `slideK` gives a tighter limit. Note the final values in the commit message.

- [ ] **Step 6: Commit**

```bash
git add games/tractor-pickup/src/sim/physics.js games/tractor-pickup/src/sim/tractor.js games/tractor-pickup/test/tractor.test.mjs
git commit -m "feat: Tractor Pickup - rally tractor on the Rapier vehicle controller"
```

---

### Task 4: Trailer and wagon on spherical joints

**Files:**
- Create: `src/sim/hitch.js`, `test/hitch.test.mjs`

**Interfaces:**
- Consumes: `createPhysics`, `G`, `groups`, `DT` (physics.js); `createTractor`, `quatAxes`, `TP` (tractor.js).
- Produces: `TR` (trailer dimensions), `TRACTOR_HITCH`, `createTrain(phys, tractor) -> train` with `cars: [car, car]` (`car = { body, vc, index, dirt }`), `step(dt, { parked })`, `angle(i) -> rad` (yaw of car i relative to the body in front), `hitchGap(i) -> m`.
- Joint anchors: tractor `TRACTOR_HITCH = { x: -1.75, y: 0.62, z: 0 }`; car tongue `TR.tongue = { x: 2.35, y: -0.2, z: 0 }`; car rear hitch `TR.rear = { x: -1.55, y: -0.2, z: 0 }`.

- [ ] **Step 1: Write the failing tests**

`test/hitch.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT, G, groups } from '../src/sim/physics.js';
import { createTractor, quatAxes } from '../src/sim/tractor.js';
import { createTrain } from '../src/sim/hitch.js';
await RAPIER.init();

const make = (power = 'medium', extra) => {
  const phys = createPhysics(RAPIER); extra?.(phys);
  const t = createTractor(phys, { x: 0, z: 0, yaw: 0, power });
  const train = createTrain(phys, t);
  const stats = { maxAngle: 0, maxGap: 0, nan: false, minUp: 1, airborne: false };
  const run = (sec, thr, steer) => { for (let i = 0; i < sec * 60; i++) {
    t.setInput(thr, steer); t.step(DT); train.step(DT, { parked: false }); phys.world.step();
    for (let k = 0; k < 2; k++) { stats.maxAngle = Math.max(stats.maxAngle, Math.abs(train.angle(k))); stats.maxGap = Math.max(stats.maxGap, train.hitchGap(k)); }
    for (const b of [t.body, ...train.cars.map(c => c.body)]) { const p = b.translation(); if (!Number.isFinite(p.x + p.y + p.z)) stats.nan = true; stats.minUp = Math.min(stats.minUp, quatAxes(b.rotation()).u.y); }
    if ([0, 1, 2, 3].every(i => !t.vc.wheelIsInContact(i))) stats.airborne = true;
  } };
  return { phys, t, train, run, stats };
};

test('the train settles in line behind the tractor', () => {
  const { train, run, stats } = make(); run(2, 0, 0);
  assert.ok(stats.maxGap < 0.05, `gap ${stats.maxGap}`);
  for (const k of [0, 1]) assert.ok(Math.abs(train.angle(k)) < 0.05);
  for (const c of train.cars) for (const i of [0, 1]) assert.ok(c.vc.wheelIsInContact(i));
});
test('straight-line drive keeps the train in line', () => {
  const { train, run } = make(); run(1, 0, 0); run(6, 1, 0);
  for (const k of [0, 1]) assert.ok(Math.abs(train.angle(k)) < 0.1);
});
test('hard turns at high power: no NaN, joints hold, no jackknife past 85 degrees', () => {
  const { run, stats } = make('high'); run(1, 0, 0); run(4, 1, 0); run(5, 1, 1); run(5, 1, -1);
  assert.equal(stats.nan, false); assert.ok(stats.maxGap < 0.15, `gap ${stats.maxGap}`);
  assert.ok(stats.maxAngle < 85 * Math.PI / 180, `angle ${stats.maxAngle}`);
});
test('reversing at full lock is limited by the jackknife torque', () => {
  const { run, stats } = make(); run(1, 0, 0); run(6, -1, 1);
  assert.ok(stats.maxAngle < 85 * Math.PI / 180, `angle ${stats.maxAngle}`);
});
test('ramp jump: airborne, lands upright, joints hold', () => {
  const ramp = phys => { // 5 m up to 0.6 m, 1 m table, 3 m down; crest at x = 30
    const { RAPIER, world } = phys; const pts = [];
    for (const [x, y] of [[25, 0], [30, 0.6], [31, 0.6], [34, 0]]) for (const z of [-3.5, 3.5]) pts.push(x, y, z, x, -0.2, z);
    world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setCollisionGroups(groups(G.STATIC, 0xffff)));
  };
  const { t, run, stats } = make('medium', ramp); run(1, 0, 0); run(7, 1, 0); run(3, 0, 0);
  assert.ok(stats.airborne, 'never left the ground'); assert.equal(stats.nan, false);
  assert.ok(stats.maxGap < 0.15); assert.ok(quatAxes(t.body.rotation()).u.y > 0.95);
});
```

The ramp test checks the takeoff, which is a convex hull. Real ramps are built the same way in Task 7.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/sim/hitch.js'`.

- [ ] **Step 3: Implement hitch.js**

```js
// Trailer and wagon: dynamic bodies on two-wheel ray-cast controllers, joined by spherical joints (D-4, D-10, D-11).
import { G, groups } from './physics.js';
import { quatAxes, TP } from './tractor.js';

export const TR = {
  half: { x: 1.4, y: 0.15, z: 1.0 }, mass: 260, wheelR: 0.45, axleX: -0.25, track: 0.95, suspRest: 0.35,
  tongue: { x: 2.35, y: -0.2, z: 0 }, rear: { x: -1.55, y: -0.2, z: 0 }, bedTop: 0.15,
  limit: 75 * Math.PI / 180, limitK: 2600, limitC: 500,
};
export const TRACTOR_HITCH = { x: -1.75, y: 0.62, z: 0 };

const local2world = (b, l) => { const p = b.translation(), { f, u, r } = quatAxes(b.rotation()); return { x: p.x + f.x * l.x + u.x * l.y + r.x * l.z, y: p.y + f.y * l.x + u.y * l.y + r.y * l.z, z: p.z + f.z * l.x + u.z * l.y + r.z * l.z }; };

function createCar(phys, front, frontAnchor, index) {
  const { RAPIER, world } = phys;
  const h = local2world(front, frontAnchor), q = front.rotation(), { f } = quatAxes(q);
  const cx = h.x - f.x * TR.tongue.x, cz = h.z - f.z * TR.tongue.x;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cx, h.y - TR.tongue.y, cz).setRotation(q)
    .setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.6));
  const cg = groups(G.TRAILER, G.GROUND | G.STATIC | G.PROP);
  world.createCollider(RAPIER.ColliderDesc.cuboid(TR.half.x, TR.half.y, TR.half.z).setMass(TR.mass).setFriction(0.2).setCollisionGroups(cg), body);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.06, 0.08).setTranslation(TR.half.x + 0.9, -0.15, 0).setMass(5).setCollisionGroups(cg), body); // tongue
  const vc = world.createVehicleController(body);
  for (const side of [-1, 1]) vc.addWheel({ x: TR.axleX, y: 0, z: side * TR.track }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, TR.suspRest, TR.wheelR);
  for (let i = 0; i < 2; i++) {
    vc.setWheelSuspensionStiffness(i, 22); vc.setWheelSuspensionCompression(i, 2.2); vc.setWheelSuspensionRelaxation(i, 2.8);
    vc.setWheelFrictionSlip(i, 2.5); vc.setWheelSideFrictionStiffness(i, 1.2); vc.setWheelMaxSuspensionForce(i, 1e5); vc.setWheelMaxSuspensionTravel(i, 0.4);
  }
  const joint = world.createImpulseJoint(RAPIER.JointData.spherical(frontAnchor, TR.tongue), front, body, true);
  joint.setContactsEnabled(false);
  return { body, vc, index, joint, front, frontAnchor, dirt: 0 };
}

export function createTrain(phys, tractor) {
  const c0 = createCar(phys, tractor.body, TRACTOR_HITCH, 0);
  const c1 = createCar(phys, c0.body, TR.rear, 1);
  const cars = [c0, c1], rayGroups = groups(0xffff, G.GROUND | G.STATIC);
  const angle = i => {
    const a = quatAxes(cars[i].front.rotation()).f, b = quatAxes(cars[i].body.rotation()).f;
    return Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);
  };
  return {
    cars, angle,
    hitchGap(i) { const c = cars[i], a = local2world(c.front, c.frontAnchor), b = local2world(c.body, TR.tongue); return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); },
    step(dt, { parked }) {
      for (const c of cars) {
        for (let i = 0; i < 2; i++) c.vc.setWheelBrake(i, parked ? 20 : 0.2);
        c.vc.updateVehicle(dt, undefined, rayGroups);
        // D-10 soft jackknife limit on each joint
        const a = angle(c.index), over = Math.abs(a) - TR.limit;
        if (over > 0) {
          const rel = c.body.angvel().y - c.front.angvel().y;
          const tau = (-Math.sign(a) * TR.limitK * over - TR.limitC * rel) * dt;
          c.body.applyTorqueImpulse({ x: 0, y: tau, z: 0 }, true);
        }
        // D-11 soft self-righting past 45 degrees
        const { u } = quatAxes(c.body.rotation());
        if (u.y < Math.cos(Math.PI / 4)) { const k = 1200 * (0.9 - u.y) * dt; c.body.applyTorqueImpulse({ x: -u.z * k, y: 0, z: u.x * k }, true); }
      }
    },
  };
}
export { local2world };
```

- [ ] **Step 4: Run the tests and tune**

Run: `npm test`
Expected: all hitch tests PASS. If the jackknife tests fail, raise `TR.limitK` (and `limitC` in proportion). If the ramp test fails for lack of air, check the hull points; do not raise the ramp height. If a test shows NaN or `gap` growing, lower `TR.mass` or raise the joint solver iterations with `world.numSolverIterations = 8` in `createPhysics`.

- [ ] **Step 5: Commit**

```bash
git add games/tractor-pickup/src/sim/hitch.js games/tractor-pickup/test/hitch.test.mjs
git commit -m "feat: Tractor Pickup - trailer and wagon on spherical joints"
```

---

### Task 5: Sandbox render, input and chase camera (Playtest 1)

**Files:**
- Create: `src/sim/sandbox.js`, `src/render/scene.js`, `src/render/camera.js`, `src/render/vehicles3d.js`, `src/ui/input.js`, `test/sandbox.test.mjs`
- Modify: `src/main.js` (replace), `template.html` (stick, horn, tune panel DOM and CSS)

**Interfaces:**
- Consumes: Task 3 and Task 4 modules; `ASSETS, geoFrom, boxGeo` from `render/gfx.js`.
- Produces (sandbox.js): `createSandbox(RAPIER, { power }) -> { phys, tractor, train, surfaceAt(x,z), ramps: [{x,z,yaw}], mud: [{x,z,r}], step(input) }` where `input = { thr, steer, horn }`.
- Produces (scene.js): `createScene(canvas) -> { renderer, scene, camera, sun, resize() }`.
- Produces (camera.js): `createChaseCam(camera) -> { update(dt, { x, y, z, yaw, fwd, speed, velYaw }), shake(amount) }`.
- Produces (vehicles3d.js): `createVehicles3D(scene, tractor, train) -> { update(snap), setColor(name) }` where `snap` holds the interpolated poses (see main.js).
- Produces (input.js): `createInput(root) -> { read(): { thr, steer, horn }, onHorn(fn) }`.

- [ ] **Step 1: Write the failing sandbox test**

`test/sandbox.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSandbox } from '../src/sim/sandbox.js';
await RAPIER.init();

test('sandbox surfaces: mud patch is mud, elsewhere gravel', () => {
  const sb = createSandbox(RAPIER, { power: 'medium' });
  const m = sb.mud[0]; assert.equal(sb.surfaceAt(m.x, m.z), 'mud'); assert.equal(sb.surfaceAt(0, 0), 'gravel');
});
test('sandbox steps and drives forward', () => {
  const sb = createSandbox(RAPIER, { power: 'medium' });
  for (let i = 0; i < 180; i++) sb.step({ thr: 1, steer: 0, horn: false });
  assert.ok(sb.tractor.speed > 4);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/sim/sandbox.js'`.

- [ ] **Step 3: Implement sandbox.js**

```js
// Flat test arena for the physics playtest: one ramp straight ahead, a mud patch to the side.
import { createPhysics, DT, G, groups } from './physics.js';
import { createTractor } from './tractor.js';
import { createTrain } from './hitch.js';

export function addRamp(phys, { x, z, yaw }) { // kicker along +heading: 5 m up to 0.6 m, 1 m table, 3 m down (spec T-14)
  const { RAPIER, world } = phys, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx, pts = [];
  for (const [a, y] of [[-5, 0], [0, 0.6], [1, 0.6], [4, 0]]) for (const s of [-3.5, 3.5]) {
    const px = x + fx * a + rx * s, pz = z + fz * a + rz * s; pts.push(px, y, pz, px, -0.2, pz);
  }
  world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setFriction(0.9).setCollisionGroups(groups(G.STATIC, 0xffff)));
}

export function createSandbox(RAPIER, { power = 'medium' } = {}) {
  const phys = createPhysics(RAPIER);
  const ramps = [{ x: 0, z: 40, yaw: 0 }], mud = [{ x: 25, z: 20, r: 8 }];
  ramps.forEach(r => addRamp(phys, r));
  const surfaceAt = (x, z) => mud.some(m => Math.hypot(x - m.x, z - m.z) < m.r) ? 'mud' : 'gravel';
  const tractor = createTractor(phys, { x: 0, z: 0, yaw: 0, power, surfaceAt });
  const train = createTrain(phys, tractor);
  return {
    phys, tractor, train, surfaceAt, ramps, mud,
    step(input) {
      tractor.setInput(input.thr, input.steer); tractor.step(DT);
      train.step(DT, { parked: Math.abs(input.thr) < 0.05 && tractor.speed < 0.3 });
      phys.world.step();
    },
  };
}
```

Run: `npm test` → sandbox tests PASS.

- [ ] **Step 4: scene.js and camera.js**

```js
// src/render/scene.js
import * as THREE from 'three';
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(), SKY = new THREE.Color('#bfe6f5');
  scene.background = SKY; scene.fog = new THREE.Fog(SKY, 90, 220);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 500);
  scene.add(new THREE.HemisphereLight('#eef7ff', '#b9a27c', 1.3));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 120 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target);
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();
  // the sun's shadow box follows the tractor
  const follow = (x, z) => { sun.position.set(x - 26, 46, z + 22); sun.target.position.set(x, 0, z); };
  return { renderer, scene, camera, sun, resize, follow };
}
```

```js
// src/render/camera.js: high chase camera (V-1..V-3). It looks along the direction of travel in a slide,
// and along the nose when slow or reversing.
import * as THREE from 'three';
const D = 11, H = 9, AHEAD = 5, LAG = 3;
export function createChaseCam(camera) {
  let yaw = null, shakeT = 0, shakeA = 0; const tgt = new THREE.Vector3(), pos = new THREE.Vector3();
  return {
    shake(a) { shakeA = Math.max(shakeA, a); shakeT = 0.25; },
    update(dt, s) {
      const want = s.fwd > 2 ? s.velYaw : s.yaw;
      if (yaw === null) yaw = want;
      let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * LAG);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      tgt.set(s.x + fx * AHEAD, s.y + 0.8, s.z + fz * AHEAD);
      pos.set(s.x - fx * D, s.y + H, s.z - fz * D);
      if (shakeT > 0) { shakeT -= dt; const k = shakeA * (shakeT / 0.25); pos.x += (Math.random() - 0.5) * k; pos.y += (Math.random() - 0.5) * k; } else shakeA = 0;
      camera.position.lerp(pos, Math.min(1, dt * 6)); camera.lookAt(tgt);
    },
  };
}
```

- [ ] **Step 5: vehicles3d.js**

```js
// Tractor, trailer and wagon meshes. Poses come from interpolated snapshots, not straight from Rapier.
import * as THREE from 'three';
import { ASSETS, geoFrom, boxGeo, mergeGeos } from './gfx.js';
import { TP } from '../sim/tractor.js';
import { TR } from '../sim/hitch.js';

export const TRACTOR_COLORS = { red: '#d8342c', green: '#3f9b3a', blue: '#2f6fd6', yellow: '#f2c230', pink: '#f07aa8', rainbow: null };
const S = TP.scale;
export function createVehicles3D(scene, tractor, train) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const modelRot = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(S, S, S));
  const baseBody = geoFrom([ASSETS.tractor.body]);
  const isPaint = (r, g, b) => b > r * 1.1 && r > 0.08; // Kenney's grey-blue bodywork
  const body = new THREE.Mesh(baseBody.clone(), mat); body.castShadow = true; body.matrixAutoUpdate = false; scene.add(body);
  function setColor(name) {
    const src = baseBody.attributes.color, dst = body.geometry.attributes.color, pos = body.geometry.attributes.position, c = new THREE.Color();
    for (let i = 0; i < src.count; i++) {
      const r = src.getX(i), g = src.getY(i), b = src.getZ(i);
      if (!isPaint(r, g, b)) { dst.setXYZ(i, r, g, b); continue; }
      const l = 0.3 * r + 0.6 * g + 0.1 * b;
      if (name === 'rainbow') c.setHSL(((pos.getZ(i) + 1) * 0.5) % 1, 0.75, 0.5); else c.set(TRACTOR_COLORS[name]).convertSRGBToLinear();
      dst.setXYZ(i, c.r * l * 2.6, c.g * l * 2.6, c.b * l * 2.6);
    }
    dst.needsUpdate = true;
  }
  setColor('red');
  const wheels = tractor.W.map(w => { const g = geoFrom([ASSETS.tractor[w.name]]); g.translate(-w.mx, -w.my, -w.mz); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.matrixAutoUpdate = false; scene.add(m); return m; });
  // trailer bed: wooden box with rails, tongue and two wheels
  const carGeo = mergeGeos([
    boxGeo(TR.half.x * 2, TR.half.y * 2, TR.half.z * 2, 0, 0, 0, '#9a6a3f'),
    boxGeo(TR.half.x * 2, 0.45, 0.08, 0, 0.37, TR.half.z, '#c08a55'), boxGeo(TR.half.x * 2, 0.45, 0.08, 0, 0.37, -TR.half.z, '#c08a55'),
    boxGeo(0.08, 0.45, TR.half.z * 2, TR.half.x, 0.37, 0, '#c08a55'), boxGeo(0.08, 0.45, TR.half.z * 2, -TR.half.x, 0.37, 0, '#c08a55'),
    boxGeo(1.9, 0.1, 0.12, TR.half.x + 0.95, -0.15, 0, '#555555'),
  ]);
  const wheelGeo = new THREE.CylinderGeometry(TR.wheelR, TR.wheelR, 0.3, 16).rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#333333' });
  const cars = train.cars.map(() => {
    const m = new THREE.Mesh(carGeo, mat); m.castShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    const ws = [0, 1].map(() => { const w = new THREE.Mesh(wheelGeo, wheelMat); w.castShadow = true; w.matrixAutoUpdate = false; scene.add(w); return w; });
    return { m, ws };
  });
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  return {
    setColor, bodyMesh: body, carMeshes: cars.map(c => c.m),
    update(snap) { // snap.tractor / snap.cars[i]: { p: Vector3, q: Quaternion }
      M.compose(snap.tractor.p, snap.tractor.q, one);
      body.matrix.multiplyMatrices(M, modelRot); body.matrixWorldNeedsUpdate = true;
      tractor.W.forEach((w, i) => {
        const susp = tractor.vc.wheelSuspensionLength(i) ?? TP.suspRest, rot = tractor.vc.wheelRotation(i) ?? 0, st = tractor.vc.wheelSteering(i) ?? 0;
        wheels[i].matrix.copy(M).multiply(T.makeTranslation(w.cx, w.cy + 0.12 - susp, w.cz)).multiply(T.makeRotationY(st)).multiply(T.makeRotationZ(-rot)).multiply(modelRot);
        wheels[i].matrixWorldNeedsUpdate = true;
      });
      train.cars.forEach((c, k) => {
        M.compose(snap.cars[k].p, snap.cars[k].q, one); cars[k].m.matrix.copy(M); cars[k].m.matrixWorldNeedsUpdate = true;
        [-1, 1].forEach((side, i) => {
          const susp = c.vc.wheelSuspensionLength(i) ?? TR.suspRest, rot = c.vc.wheelRotation(i) ?? 0;
          cars[k].ws[i].matrix.copy(M).multiply(T.makeTranslation(TR.axleX, -susp, side * TR.track)).multiply(T.makeRotationZ(-rot));
          cars[k].ws[i].matrixWorldNeedsUpdate = true;
        });
      });
    },
  };
}
```

- [ ] **Step 6: input.js**

```js
// One control (R-7): a floating thumb stick on the left two-thirds, W/A/S/D + arrows, gamepad left stick. Horn: button, H, pad A.
export function createInput(root) {
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, keys = new Set(); let hornFns = [], hornHeld = false;
  const R = 70;
  const base = document.createElement('div'); base.id = 'stickBase'; base.hidden = true;
  const knob = document.createElement('div'); knob.id = 'stickKnob'; base.appendChild(knob); root.appendChild(base);
  const horn = document.createElement('button'); horn.id = 'horn'; horn.setAttribute('aria-label', 'Horn'); horn.textContent = '📯'; root.appendChild(horn);
  const fireHorn = () => hornFns.forEach(f => f());
  horn.addEventListener('pointerdown', e => { e.stopPropagation(); fireHorn(); });
  const surface = document.getElementById('c');
  surface.addEventListener('pointerdown', e => {
    if (stick.id !== null || e.clientX > innerWidth * 2 / 3) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; surface.setPointerCapture(e.pointerId);
    base.hidden = false; base.style.left = (e.clientX - R) + 'px'; base.style.top = (e.clientY - R) + 'px'; knob.style.transform = '';
  });
  surface.addEventListener('pointermove', e => {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    stick.x = dx / R; stick.y = dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; base.hidden = true; };
  surface.addEventListener('pointerup', end); surface.addEventListener('pointercancel', end);
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k === 'h' && !e.repeat) fireHorn(); keys.add(k); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  const dz = v => Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
  return {
    onHorn(fn) { hornFns.push(fn); },
    read() {
      let thr = -stick.y, steer = -stick.x;
      const k = n => keys.has(n);
      if (k('w') || k('arrowup')) thr = 1; if (k('s') || k('arrowdown')) thr = -1;
      if (k('a') || k('arrowleft')) steer = 1; if (k('d') || k('arrowright')) steer = -1;
      for (const pad of navigator.getGamepads?.() || []) {
        if (!pad) continue; const px = dz(pad.axes[0] || 0), py = dz(pad.axes[1] || 0);
        if (px || py) { steer = -px; thr = -py; }
        const a = pad.buttons[0]?.pressed; if (a && !hornHeld) fireHorn(); hornHeld = !!a;
      }
      steer = Math.sign(steer) * Math.pow(Math.abs(steer), 1.4); // C-2 curve
      return { thr, steer };
    },
  };
}
```

Add CSS to `template.html` inside `<style>`:

```css
#stickBase{position:absolute;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.28);border:3px solid rgba(90,56,32,.5);z-index:6;pointer-events:none;display:grid;place-items:center}
#stickKnob{width:64px;height:64px;border-radius:50%;background:#f6a9bd;box-shadow:inset 0 0 0 3px #d9667f}
#horn{all:unset;position:absolute;right:calc(env(safe-area-inset-right,0px) + 24px);bottom:calc(env(safe-area-inset-bottom,0px) + 24px);width:110px;height:110px;border-radius:50%;background:#f5c84c;border:4px solid #6b4428;box-shadow:0 5px 0 #6b4428;font-size:56px;display:grid;place-items:center;z-index:6;cursor:pointer}
#horn:active{transform:translateY(3px);box-shadow:0 2px 0 #6b4428}
#tune{position:absolute;top:8px;left:8px;z-index:9;background:rgba(255,255,255,.9);padding:8px;border-radius:10px;font:12px system-ui;max-height:90vh;overflow:auto}
#tune label{display:grid;grid-template-columns:110px 1fr 44px;gap:6px;align-items:center}
```

- [ ] **Step 7: main.js with the fixed-step loop, interpolation and `?tune`**

```js
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { DT } from './sim/physics.js';
import { POWER, TP, quatAxes } from './sim/tractor.js';
import { TR } from './sim/hitch.js';
import { createSandbox } from './sim/sandbox.js';
import { createScene } from './render/scene.js';
import { createChaseCam } from './render/camera.js';
import { createVehicles3D } from './render/vehicles3d.js';
import { createInput } from './ui/input.js';

const snapOf = b => ({ p: new THREE.Vector3().copy(b.translation()), q: new THREE.Quaternion().copy(b.rotation()) });
function lerpSnap(a, b, t, out) { out.p.lerpVectors(a.p, b.p, t); out.q.slerpQuaternions(a.q, b.q, t); return out; }

async function main() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search);
  const game = createSandbox(RAPIER, { power: params.get('power') || 'medium' });
  const { renderer, scene, camera, follow } = createScene(document.getElementById('c'));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#cdb38a' }));
  ground.receiveShadow = true; scene.add(ground);
  for (const m of game.mud) { const g = new THREE.Mesh(new THREE.CircleGeometry(m.r, 32).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#7a5233', shininess: 60 })); g.position.set(m.x, 0.02, m.z); scene.add(g); }
  for (const r of game.ramps) { // simple visual for the sandbox kicker
    const s = new THREE.Shape([[-5, 0], [0, 0.6], [1, 0.6], [4, 0]].map(([a, y]) => new THREE.Vector2(a, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 7, bevelEnabled: false }); g.translate(0, 0, -3.5); g.rotateY(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#b89a70' })); m.position.set(r.x, 0, r.z); m.rotation.y = r.yaw; m.receiveShadow = m.castShadow = true; scene.add(m);
  }
  const vehicles = createVehicles3D(scene, game.tractor, game.train);
  const chase = createChaseCam(camera), input = createInput(document.getElementById('ui'));
  const bodies = () => [game.tractor.body, ...game.train.cars.map(c => c.body)];
  let prev = bodies().map(snapOf), curr = prev, view = prev.map(s => ({ p: s.p.clone(), q: s.q.clone() }));
  if (params.has('tune')) buildTunePanel(game);
  let acc = 0, last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    const inp = input.read();
    while (acc >= DT) { prev = curr; game.step({ ...inp, horn: false }); curr = bodies().map(snapOf); acc -= DT; }
    const a = acc / DT; view.forEach((v, i) => lerpSnap(prev[i], curr[i], a, v));
    vehicles.update({ tractor: view[0], cars: view.slice(1) });
    const t = game.tractor, lv = t.body.linvel();
    chase.update(dt, { x: view[0].p.x, y: view[0].p.y, z: view[0].p.z, yaw: t.yaw, fwd: t.fwd, speed: t.speed, velYaw: Math.atan2(lv.x, lv.z) });
    follow(view[0].p.x, view[0].p.z);
    renderer.render(scene, camera);
  });
}

// ?tune: sliders for live feel tuning during the playtest. Values print to the console to copy into tractor.js.
function buildTunePanel(game) {
  const el = document.createElement('div'); el.id = 'tune'; document.body.appendChild(el);
  const t = game.tractor, rows = [
    ['vmax', () => t.P.vmax, v => t.P.vmax = v, 3, 15, 0.5], ['force', () => t.P.force, v => t.P.force = v, 2000, 15000, 100],
    ['rearSide', () => t.P.rearSide, v => t.P.rearSide = v, 0.2, 1.2, 0.01], ['slideMax', () => t.P.slideMax, v => t.P.slideMax = v, 0.2, 1.2, 0.01],
    ['slip', () => TP.slip, v => TP.slip = v, 0.5, 6, 0.1], ['steerMax', () => TP.steerMax, v => TP.steerMax = v, 0.3, 0.9, 0.01],
    ['stiffness', () => TP.stiffness, v => TP.stiffness = v, 8, 40, 1], ['trailer limitK', () => TR.limitK, v => TR.limitK = v, 500, 8000, 100],
  ];
  for (const [name, get, set, min, max, step] of rows) {
    const l = document.createElement('label'); l.innerHTML = `<span>${name}</span><input type=range min=${min} max=${max} step=${step} value=${get()}><output>${get()}</output>`;
    const i = l.querySelector('input'), o = l.querySelector('output');
    i.oninput = () => { set(+i.value); o.textContent = i.value; console.log('tune', JSON.stringify({ P: t.P, TP: { slip: TP.slip, steerMax: TP.steerMax, stiffness: TP.stiffness }, limitK: TR.limitK })); };
    el.appendChild(l);
  }
  const sel = document.createElement('select'); sel.innerHTML = Object.keys(POWER).map(k => `<option ${k === t.power ? 'selected' : ''}>${k}</option>`).join('');
  sel.onchange = () => t.setPower(sel.value); el.appendChild(sel);
}
main();
```

`TP.stiffness` only takes effect at creation. That is acceptable: it is a slider for the next reload. Note this next to the slider label (`stiffness (reload)`).

- [ ] **Step 8: Verify in the browser**

Run: `npm test && npm run build`. Open `http://localhost:4000/exp/tractor-pickup/?tune` and drive with W/A/S/D: hit the ramp at full speed, slide in the mud, reverse at full lock. Use the Playwright MCP tools (`browser_navigate`, `browser_press_key`, `browser_take_screenshot`) to take one screenshot of the tractor and train mid-turn.
Expected: the tractor, trailer and wagon render together. The wheels turn and steer. The camera stays behind. The console has no errors.

- [ ] **Step 9: Commit, then PLAYTEST 1**

```bash
git add games/tractor-pickup/src games/tractor-pickup/test/sandbox.test.mjs games/tractor-pickup/template.html site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup - physics sandbox with chase camera and stick input"
```

Stop here. Ask the user to playtest on the iPad (`/exp/tractor-pickup/?tune`). Copy any tuned values they like into `POWER`/`TP`/`TR`, re-run `npm test`, and commit as `fix: Tractor Pickup - tune drive feel from playtest`.

---

### Task 6: Farm generator: farmyard, two routes, features, yard layout

**Files:**
- Create: `src/sim/track.js`, `test/track.test.mjs`

**Interfaces:**
- Consumes: `makeRng` (rng.js).
- Produces: `TILE = 20`, `SIZE = 11`, `YARD_HALF = 30`, `DIRS = [[1,0],[0,1],[-1,0],[0,-1]]` (E, S, W, N as `[di, dj]`; `i` maps to +x and `j` maps to +z), `GATES = { E, S, W, N }` (each `{ i, j, out }`: the road tile just outside the farmyard, and the direction pointing away from it), `tileCenter(i, j) -> { x, z }`, `dirYaw(d)`, `findRoute(rng, from, to) -> [[i,j], ...] | null`, `checkRules(routes) -> string[]` (broken rule IDs; empty if valid), `layoutYard(rng) -> yard`, `barnLocal(barn, x, z) -> { a, s }` (along the barn axis, across it), `yardFree(yard, x, z, r) -> boolean`, `segDist(x, z, lane)`, `generateFarm(seed) -> farm`.
- `farm = { seed, size, tile, routes: [{ from, to, tiles: [{ i, j, inDir, outDir, type: 'gate'|'straight'|'curve'|'mud'|'ramp'|'sprinkler' }] }] (2 routes), grid: string[SIZE][SIZE] ('field'|'road'|'yard'), yard, start: { x, z, yaw }, pond: { x, z, r }, hideSpots: [{ x, z }] (2) }`.
- `yard = { half: 30, barn: { x: 0, z: 0, yaw, half: 6, width: 5 }, end: ±1, side: ±1, stage: { x0, x1, z0, z1, y: 0.3 }, paddock: { x0, x1, z0, z1, gate: { x, z } }, lanes: [{ gate, ax, az, bx, bz }] (4), obstacles: [{ kind: 'bale'|'cone'|'barrel'|'post'|'tree', x, z, yaw, r }], start }`. The barn axis is `f = (sin yaw, cos yaw)`; across is `r = (cos yaw, -sin yaw)`. `end` is the barn end the stage is on; `side` is the side of the drive line the stage and paddock are on.

- [ ] **Step 1: Write the failing tests**

`test/track.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFarm, findRoute, checkRules, GATES, DIRS, SIZE, YARD_HALF, segDist, barnLocal } from '../src/sim/track.js';
import { makeRng } from '../src/sim/rng.js';
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const FEATURES = ['mud', 'ramp', 'sprinkler'];
const inYard = (i, j) => i >= 4 && i <= 6 && j >= 4 && j <= 6;

test('findRoute links two gates with straight gate tiles at both ends', () => {
  const p = findRoute(makeRng(5), 'N', 'E');
  assert.ok(p); assert.deepEqual(p[0], [GATES.N.i, GATES.N.j]); assert.deepEqual(p.at(-1), [GATES.E.i, GATES.E.j]);
  assert.deepEqual(p[1], [GATES.N.i + DIRS[GATES.N.out][0], GATES.N.j + DIRS[GATES.N.out][1]]);
});
test('same seed, same farm', () => {
  assert.deepEqual(generateFarm(1234), generateFarm(1234));
});
for (const seed of SEEDS) test(`farm ${seed} obeys the spec`, () => {
  const f = generateFarm(seed), seen = new Set();
  assert.equal(f.routes.length, 2);                                                        // T-24
  const gates = f.routes.flatMap(r => [r.from, r.to]).sort().join(); assert.equal(gates, 'E,N,S,W');
  for (const r of f.routes) {
    const T = r.tiles, n = T.length;
    assert.ok(n >= 8 && n <= 14, `length ${n}`);                                            // T-24
    assert.deepEqual([T[0].i, T[0].j], [GATES[r.from].i, GATES[r.from].j]);
    assert.deepEqual([T[n - 1].i, T[n - 1].j], [GATES[r.to].i, GATES[r.to].j]);
    assert.equal(T[0].inDir, GATES[r.from].out); assert.equal(T[n - 1].outDir, (GATES[r.to].out + 2) % 4);
    assert.equal(T[0].type, 'gate'); assert.equal(T[n - 1].type, 'gate');
    let curves = 0, run = 0;
    T.forEach((t, k) => {
      const key = `${t.i},${t.j}`; assert.ok(!seen.has(key), 'routes overlap or cross'); seen.add(key);
      assert.ok(!inYard(t.i, t.j) && t.i >= 1 && t.j >= 1 && t.i <= SIZE - 2 && t.j <= SIZE - 2, 'outside the allowed area');
      if (k + 1 < n) { const [di, dj] = DIRS[t.outDir]; assert.deepEqual([t.i + di, t.j + dj], [T[k + 1].i, T[k + 1].j]); assert.equal(t.outDir, T[k + 1].inDir); }
      const curve = t.inDir !== t.outDir; assert.equal(t.type === 'curve', curve);
      if (curve) { curves++; run++; assert.ok(run <= 2, 'three curves in a row'); } else run = 0;   // T-25
      assert.equal(f.grid[t.j][t.i], 'road');
    });
    assert.ok(curves >= 4, `curves ${curves}`);                                              // T-25
  }
  assert.deepEqual(checkRules(f.routes), []);
  assert.ok(f.pond && f.hideSpots.length === 2);
  // farmyard (4.7)
  const y = f.yard, count = k => y.obstacles.filter(o => o.kind === k).length;
  assert.deepEqual([count('bale'), count('cone'), count('barrel'), count('post'), count('tree')], [4, 8, 4, 4, 2]);   // T-31
  for (const o of y.obstacles) {
    assert.ok(Math.abs(o.x) < YARD_HALF && Math.abs(o.z) < YARD_HALF);
    for (const l of y.lanes) assert.ok(segDist(o.x, o.z, l) > 3 + o.r - 1e-9, `${o.kind} in a lane`);                 // T-30
    const b = barnLocal(y.barn, o.x, o.z); assert.ok(Math.abs(b.a) > 8 || Math.abs(b.s) > 7, 'obstacle in the barn');
  }
  assert.ok(Math.abs(f.start.x) < YARD_HALF && Math.abs(f.start.z) < YARD_HALF);
});
test('checkRules flags adjacent features and a ramp next to a curve', () => {
  const f = generateFarm(99), clone = () => f.routes.map(r => ({ ...r, tiles: r.tiles.map(t => ({ ...t })) }));
  const a = clone(), T = a[0].tiles, k = T.findIndex((t, i) => i > 0 && t.type === 'curve');
  T[k + 1 < T.length - 1 ? k + 1 : k - 1].type = 'ramp'; assert.ok(checkRules(a).some(c => c === 'T-19' || c === 'T-18'));
  const b = clone().map(r => ({ ...r, tiles: r.tiles.map(t => FEATURES.includes(t.type) ? { ...t, type: 'straight' } : t) }));
  const U = b[0].tiles, s = U.findIndex((t, i) => t.type === 'straight' && U[i + 1]?.type === 'straight');
  if (s >= 0) { U[s].type = 'mud'; U[s + 1].type = 'mud'; assert.ok(checkRules(b).includes('T-21')); }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/sim/track.js'`.

- [ ] **Step 3: Implement track.js**

```js
// Farm generator (spec 4.1-4.7): a 3x3-tile farmyard at the center, two routes that leave by one gate and come back
// by the next gate around, features on route straights, and the farmyard layout (barn, stage, paddock, lanes, obstacles).
import { makeRng } from './rng.js';
export const TILE = 20, SIZE = 11, YARD_HALF = 30;
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const C = (SIZE - 1) / 2;
export const GATES = { E: { i: C + 2, j: C, out: 0 }, S: { i: C, j: C + 2, out: 1 }, W: { i: C - 2, j: C, out: 2 }, N: { i: C, j: C - 2, out: 3 } };
const GATE_POINT = { E: [YARD_HALF, 0], S: [0, YARD_HALF], W: [-YARD_HALF, 0], N: [0, -YARD_HALF] };
export const tileCenter = (i, j) => ({ x: (i - C) * TILE, z: (j - C) * TILE });
export const dirYaw = d => Math.atan2(DIRS[d][0], DIRS[d][1]);
const inYard = (i, j) => Math.abs(i - C) <= 1 && Math.abs(j - C) <= 1;
const FEATURES = ['mud', 'ramp', 'sprinkler'];
const dirOf = (a, b) => DIRS.findIndex(([di, dj]) => di === b[0] - a[0] && dj === b[1] - a[1]);

// The corner of the farm between two gates (for N and E: i >= C and j <= C), outside the yard and the outer ring.
function regionOf(a, b) {
  const si = Math.sign(GATES[a].i + GATES[b].i - 2 * C), sj = Math.sign(GATES[a].j + GATES[b].j - 2 * C);
  return (i, j) => i >= 1 && j >= 1 && i <= SIZE - 2 && j <= SIZE - 2 && !inYard(i, j) && (i - C) * si >= 0 && (j - C) * sj >= 0;
}

// Random depth-first search for a twisty route (T-24, T-25). Gate tiles are straight: the route leaves the
// first tile in the gate's outward direction and enters the last tile heading into the yard.
export function findRoute(rng, a, b, { min = 8, max = 14, curves = 4 } = {}) {
  const ok = regionOf(a, b), A = GATES[a], B = GATES[b], startIn = A.out, endOut = (B.out + 2) % 4, end = [B.i, B.j];
  const path = [[A.i, A.j]], used = new Set([`${A.i},${A.j}`]); let budget = 20000;
  const valid = () => {
    const dirs = path.map((t, k) => k + 1 < path.length ? dirOf(t, path[k + 1]) : endOut);
    const cv = path.map((t, k) => (k === 0 ? startIn : dirs[k - 1]) !== dirs[k]);
    if (cv.filter(Boolean).length < curves) return false;
    for (let k = 2; k < cv.length; k++) if (cv[k] && cv[k - 1] && cv[k - 2]) return false;
    return true;
  };
  function dfs() {
    if (--budget < 0) return false;
    const cur = path[path.length - 1];
    if (cur[0] === end[0] && cur[1] === end[1]) return path.length >= min && valid();
    if (path.length >= max) return false;
    for (const d of rng.shuffle([0, 1, 2, 3])) {
      if (path.length === 1 && d !== startIn) continue;
      const n = [cur[0] + DIRS[d][0], cur[1] + DIRS[d][1]], key = `${n[0]},${n[1]}`;
      if (used.has(key) || !ok(n[0], n[1])) continue;
      if (n[0] === end[0] && n[1] === end[1] && d !== endOut) continue;
      if (Math.abs(n[0] - end[0]) + Math.abs(n[1] - end[1]) > max - path.length - 1) continue;
      path.push(n); used.add(key);
      if (dfs()) return true;
      path.pop(); used.delete(key);
    }
    return false;
  }
  return dfs() ? path : null;
}

function annotate(path, startIn, endOut) {
  return path.map((t, k) => {
    const inDir = k === 0 ? startIn : dirOf(path[k - 1], t), outDir = k + 1 < path.length ? dirOf(t, path[k + 1]) : endOut;
    return { i: t[0], j: t[1], inDir, outDir, type: k === 0 || k === path.length - 1 ? 'gate' : inDir === outDir ? 'straight' : 'curve' };
  });
}

export function checkRules(routes) {
  const bad = new Set(), all = routes.flatMap(r => r.tiles), count = ty => all.filter(t => t.type === ty).length;
  const isF = t => !!t && FEATURES.includes(t.type), plain = t => !!t && (t.type === 'straight' || t.type === 'gate');
  if (count('mud') < 1 || count('mud') > 2 || count('ramp') < 1 || count('ramp') > 2 || count('sprinkler') !== 1) bad.add('T-18');
  for (const r of routes) {
    const T = r.tiles; if (!T.some(isF)) bad.add('T-18');
    T.forEach((t, k) => {
      if (isF(t) && t.inDir !== t.outDir) bad.add('T-18');
      if (t.type === 'ramp' && !(plain(T[k - 1]) && plain(T[k + 1]))) bad.add('T-19');
      if (isF(t) && (isF(T[k - 1]) || isF(T[k + 1]))) bad.add('T-21');
      if ((k === 0 || k === T.length - 1) && t.type !== 'gate') bad.add('T-22');
      if (t.type === 'sprinkler' && ![2, 3, 4, 5].some(d => T[k - d]?.type === 'mud' || T[k + d]?.type === 'mud')) bad.add('T-20');
    });
  }
  return [...bad];
}

function placeFeatures(routes, rng) {
  const slots = routes.flatMap((r, n) => r.tiles.flatMap((t, k) => t.type === 'straight' ? [[n, k]] : []));
  for (let attempt = 0; attempt < 300; attempt++) {
    const want = [...Array(rng.int(1, 2)).fill('mud'), ...Array(rng.int(1, 2)).fill('ramp'), 'sprinkler'];
    if (slots.length < want.length) return false;
    const trial = routes.map(r => ({ ...r, tiles: r.tiles.map(t => ({ ...t })) }));
    rng.shuffle(slots).slice(0, want.length).forEach(([n, k], idx) => { trial[n].tiles[k].type = want[idx]; });
    if (checkRules(trial).length === 0) { trial.forEach((r, n) => { routes[n].tiles = r.tiles; }); return true; }
  }
  return false;
}

export const segDist = (x, z, l) => {
  const dx = l.bx - l.ax, dz = l.bz - l.az, t = Math.max(0, Math.min(1, ((x - l.ax) * dx + (z - l.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - l.ax - dx * t, z - l.az - dz * t);
};
export const barnLocal = (barn, x, z) => {
  const fx = Math.sin(barn.yaw), fz = Math.cos(barn.yaw), dx = x - barn.x, dz = z - barn.z;
  return { a: dx * fx + dz * fz, s: dx * fz - dz * fx };
};
const inRect = (x, z, R, m) => x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m;
export function yardFree(yard, x, z, r) {
  const b = barnLocal(yard.barn, x, z);
  return Math.abs(x) < YARD_HALF - 2 - r && Math.abs(z) < YARD_HALF - 2 - r && !(Math.abs(b.a) < 8 + r && Math.abs(b.s) < 7 + r)
    && !inRect(x, z, yard.stage, 2 + r) && !inRect(x, z, yard.paddock, 2 + r) && yard.lanes.every(l => segDist(x, z, l) > 3 + r);
}

// Farmyard (4.7): drive-through barn at the center, stage and paddock beside one exit, clear lanes from each gate
// to a barn end, then obstacles placed at random outside all of those.
export function layoutYard(rng) {
  const yaw = rng.chance(0.5) ? 0 : Math.PI / 2, f = [Math.sin(yaw), Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)];
  const end = rng.chance(0.5) ? 1 : -1, side = rng.chance(0.5) ? 1 : -1;
  const W = (a, s) => ({ x: f[0] * a + r[0] * s, z: f[1] * a + r[1] * s });
  const rect = (a0, a1, s0, s1) => { const p = W(a0, s0), q = W(a1, s1); return { x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x), z0: Math.min(p.z, q.z), z1: Math.max(p.z, q.z) }; };
  const barn = { x: 0, z: 0, yaw, half: 6, width: 5 };
  const stage = { ...rect(end * 8.5, end * 21.5, side * 8.5, side * 11.5), y: 0.3 };
  const paddock = { ...rect(end * 6, end * 26, side * 14, side * 27), gate: W(end * 16, side * 14) };
  const lanes = Object.entries(GATE_POINT).map(([gate, [gx, gz]]) => {
    const along = gx * f[0] + gz * f[1], e = W(Math.abs(along) > 1 ? Math.sign(along) * 6 : -end * 6, 0); // side gates use the far end, away from the paddock
    return { gate, ax: gx, az: gz, bx: e.x, bz: e.z };
  });
  const yard = { half: YARD_HALF, barn, end, side, stage, paddock, lanes, obstacles: [] };
  for (const [kind, n, rad] of [['bale', 4, 0.9], ['cone', 8, 0.3], ['barrel', 4, 0.45], ['post', 4, 0.2], ['tree', 2, 1.2]]) {
    for (let m = 0, placed = 0; placed < n && m < 2000; m++) {
      const x = rng.range(-YARD_HALF, YARD_HALF), z = rng.range(-YARD_HALF, YARD_HALF);
      if (!yardFree(yard, x, z, rad) || yard.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + rad + 2)) continue;
      yard.obstacles.push({ kind, x, z, yaw: rng.range(0, Math.PI * 2), r: rad }); placed++;
    }
  }
  const s0 = W(-end * 12, 0);
  yard.start = { x: s0.x, z: s0.z, yaw: Math.atan2(-end * f[0], -end * f[1]) }; // facing out of the far exit; the train sits in the barn
  return yard;
}

export function generateFarm(seed) {
  const rng = makeRng(seed);
  for (let tries = 0; tries < 200; tries++) {
    const pairs = rng.chance(0.5) ? [['N', 'E'], ['S', 'W']] : [['N', 'W'], ['S', 'E']];
    const paths = pairs.map(([a, b]) => findRoute(rng, a, b));
    if (paths.some(p => !p)) continue;
    const routes = pairs.map(([a, b], n) => ({ from: a, to: b, tiles: annotate(paths[n], GATES[a].out, (GATES[b].out + 2) % 4) }));
    if (!placeFeatures(routes, rng)) continue;
    const grid = Array.from({ length: SIZE }, (_, j) => Array.from({ length: SIZE }, (_, i) => inYard(i, j) ? 'yard' : 'field'));
    for (const r of routes) for (const t of r.tiles) grid[t.j][t.i] = 'road';
    const yard = layoutYard(rng);
    const near = (i, j, ty) => DIRS.some(([di, dj]) => grid[j + dj]?.[i + di] === ty);
    const ponds = []; for (let j = 1; j < SIZE - 1; j++) for (let i = 1; i < SIZE - 1; i++) if (grid[j][i] === 'field' && near(i, j, 'road') && !near(i, j, 'yard')) ponds.push([i, j]);
    if (!ponds.length) continue;
    const [pi, pj] = rng.pick(ponds), pc = tileCenter(pi, pj);
    // A-13: two hiding bushes beside plain straight or gate tiles, 7 m from the centerline
    const plain = routes.flatMap(r => r.tiles.filter(t => t.type === 'straight' || t.type === 'gate'));
    const hideSpots = rng.shuffle(plain).slice(0, 2).map(t => { const c = tileCenter(t.i, t.j), [dx, dz] = DIRS[t.outDir], sd = rng.chance(0.5) ? 1 : -1; return { x: c.x - dz * sd * 7, z: c.z + dx * sd * 7 }; });
    return { seed, size: SIZE, tile: TILE, routes, grid, yard, start: yard.start, pond: { x: pc.x, z: pc.z, r: 5 }, hideSpots };
  }
  throw new Error('generateFarm: no valid farm for seed ' + seed);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all 300 farm tests and the unit tests PASS. If a seed throws, log which step fails. If `findRoute` runs out of budget often, raise the budget to 50000. If `placeFeatures` fails often, raise `max` route length to 14 only (it already is), then raise the attempt count. Do not relax the rules.

- [ ] **Step 5: Commit**

```bash
git add games/tractor-pickup/src/sim/track.js games/tractor-pickup/test/track.test.mjs
git commit -m "feat: Tractor Pickup - farm generator with farmyard and two routes"
```

---

### Task 7: Roads, farmyard props, colliders and farm render (Playtest 2)

**Files:**
- Create: `src/sim/road.js`, `src/sim/scenery.js`, `src/render/farm3d.js`, `test/road.test.mjs`, `test/yard.test.mjs`
- Modify: `src/main.js` (farm mode by default; `?sandbox` keeps the arena)

**Interfaces:**
- Consumes: `generateFarm, TILE, SIZE, DIRS, tileCenter, YARD_HALF, barnLocal` (track.js); `addRamp` (sandbox.js); `G, groups, DT` (physics.js).
- Produces (road.js): `ROAD_HALF = 3.5`, `FARM_HALF = 110`, `buildRoad(farm) -> road` with:
  - `road.routes: [{ pts, length }]` and `road.pts` (all points). Each point is `{ x, z, r, n, k, u, s, tx, tz }`: route, index in the route, tile index, 0..1 along the tile, arc length, unit tangent.
  - `nearest(x, z) -> { d, pt }`, `inYard(x, z)`, `surfaceAt(x, z) -> 'gravel'|'grass'|'mud'`, `inSprinkler(x, z)`, `featureCenter(r, k) -> { x, z, yaw }`, `ahead(pt, dist) -> pt` (clamped to the route ends), `edgePush(x, z) -> { x, z }`.
- Produces (road.js): `makeBarnPass(barn) -> (x, z) => boolean` (true once, when the tractor comes out of the barn at the end it did not enter by).
- Produces (scenery.js): `wallsOfRect(R, gaps) -> [[ax, az, bx, bz], ...]`, `yardWalls(farm)`, `paddockWalls(farm)`, `scatterScenery(farm, road, rng) -> [{ kind, x, z, yaw, scale, r, hide? }]`, `addSceneryColliders(phys, items)`, `addFarmColliders(phys, farm, road)` (ramps, barn walls, farmyard fence, stage, paddock fence), `addYardProps(phys, farm) -> { props: [{ kind, x, z, r, body|null, start }], reset() }`.
- Produces (farm3d.js): `buildFarm3D(scene, farm, road, items, props) -> { sprinklers, update() }` (`update` copies the prop bodies' poses to their meshes).
- Physics groups: hay bales, cones and barrels are `G.PROP` dynamic bodies. Tractor and trailers already collide with `G.PROP` (Task 3/4 filters). The wheel rays ignore props.

- [ ] **Step 1: Write the failing tests**

`test/road.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFarm, YARD_HALF } from '../src/sim/track.js';
import { buildRoad, ROAD_HALF, makeBarnPass } from '../src/sim/road.js';
import { scatterScenery, yardWalls } from '../src/sim/scenery.js';
import { makeRng } from '../src/sim/rng.js';

for (const seed of [1, 2, 3, 4, 5, 77, 1234]) test(`roads ${seed}: continuous, start and end at a yard gate`, () => {
  const farm = generateFarm(seed), road = buildRoad(farm);
  for (const r of road.routes) {
    const P = r.pts; for (let i = 0; i + 1 < P.length; i++) assert.ok(Math.hypot(P[i].x - P[i + 1].x, P[i].z - P[i + 1].z) < 1.3, `gap at ${i}`);
    for (const p of [P[0], P.at(-1)]) { // gate points: middle of a yard side
      assert.ok(Math.abs(Math.max(Math.abs(p.x), Math.abs(p.z)) - YARD_HALF) < 0.01 && Math.min(Math.abs(p.x), Math.abs(p.z)) < 0.01, `${p.x},${p.z}`);
    }
  }
});
test('surfaces: yard gravel, road gravel, off-road grass, mud tile mud', () => {
  const farm = generateFarm(5), road = buildRoad(farm);
  assert.equal(road.surfaceAt(10, 10), 'gravel');
  const p = road.routes[0].pts[30]; assert.equal(road.surfaceAt(p.x, p.z), 'gravel');
  assert.equal(road.surfaceAt(p.x + p.tz * (ROAD_HALF + 2), p.z - p.tx * (ROAD_HALF + 2)), 'grass');
  for (const [r, R] of farm.routes.entries()) R.tiles.forEach((t, k) => { if (t.type === 'mud') { const c = road.featureCenter(r, k); assert.equal(road.surfaceAt(c.x, c.z), 'mud'); } });
});
test('sprinkler zone is at the sprinkler tile center', () => {
  const farm = generateFarm(5), road = buildRoad(farm);
  for (const [r, R] of farm.routes.entries()) R.tiles.forEach((t, k) => { if (t.type === 'sprinkler') { const c = road.featureCenter(r, k); assert.ok(road.inSprinkler(c.x, c.z)); } });
  assert.ok(!road.inSprinkler(0, 0));
});
test('ahead stays on the route and stops at its ends', () => {
  const farm = generateFarm(5), road = buildRoad(farm), P = road.routes[1].pts;
  assert.equal(road.ahead(P[5], 1000), P.at(-1)); assert.equal(road.ahead(P[5], -1000), P[0]); assert.equal(road.ahead(P[5], 3).n, 8);
});
test('barn pass: through counts, backing out and passing beside do not (F-1)', () => {
  const barn = { x: 0, z: 0, yaw: 0, half: 6, width: 5 }, drive = (pts) => { const pass = makeBarnPass(barn); return pts.map(([x, z]) => pass(x, z)).filter(Boolean).length; };
  const line = (x, z0, z1) => Array.from({ length: 41 }, (_, i) => [x, z0 + (z1 - z0) * i / 40]);
  assert.equal(drive(line(0, -12, 12)), 1); assert.equal(drive(line(0, 12, -12)), 1);
  assert.equal(drive([...line(0, -12, 0), ...line(0, 0, -12)]), 0);
  assert.equal(drive(line(9, -12, 12)), 0);
});
test('scenery stays on field tiles: not on roads, not in the yard', () => {
  for (const seed of [1, 2, 3]) {
    const farm = generateFarm(seed), road = buildRoad(farm), items = scatterScenery(farm, road, makeRng(seed));
    assert.ok(items.length > 60);
    for (const it of items) { assert.ok(road.nearest(it.x, it.z).d > ROAD_HALF + 1.5 + (it.r || 0), `${it.kind} on road`); assert.ok(!road.inYard(it.x, it.z), `${it.kind} in yard`); }
  }
});
test('yard fence has an opening at each gate', () => {
  const farm = generateFarm(5), segs = yardWalls(farm);
  assert.equal(segs.length, 8);
  for (const [gx, gz] of [[YARD_HALF, 0], [0, YARD_HALF], [-YARD_HALF, 0], [0, -YARD_HALF]]) for (const [ax, az, bx, bz] of segs) {
    const t = Math.max(0, Math.min(1, ((gx - ax) * (bx - ax) + (gz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    assert.ok(Math.hypot(gx - ax - (bx - ax) * t, gz - az - (bz - az) * t) > 3.5, 'gate blocked');
  }
});
```

`test/yard.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { generateFarm } from '../src/sim/track.js';
import { addYardProps } from '../src/sim/scenery.js';
await RAPIER.init();

test('props: dynamic bales/cones/barrels, fixed posts/trees, and reset puts them back (T-31, T-32)', () => {
  const phys = createPhysics(RAPIER), farm = generateFarm(5), { props, reset } = addYardProps(phys, farm);
  assert.equal(props.filter(p => p.body).length, 16); assert.equal(props.filter(p => !p.body).length, 6);
  for (let i = 0; i < 60; i++) phys.world.step();
  const bale = props.find(p => p.kind === 'bale'), p0 = { ...bale.body.translation() };
  bale.body.applyImpulse({ x: 900, y: 0, z: 0 }, true);
  for (let i = 0; i < 120; i++) phys.world.step();
  assert.ok(Math.hypot(bale.body.translation().x - p0.x, bale.body.translation().z - p0.z) > 2, 'bale did not roll');
  reset(); const p1 = bale.body.translation();
  assert.ok(Math.hypot(p1.x - bale.start.x, p1.z - bale.start.z) < 1e-3);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/sim/road.js'`.

- [ ] **Step 3: Implement road.js**

```js
// Route centerlines and surface queries. Straights run edge-midpoint to edge-midpoint; curves are quarter circles
// (radius TILE/2) about the tile corner shared by the entry and exit edges. Each route starts and ends on the yard edge.
import { TILE, SIZE, DIRS, tileCenter, YARD_HALF, barnLocal } from './track.js';
export const ROAD_HALF = 3.5, FARM_HALF = SIZE * TILE / 2;

function tilePts(t, N) {
  const c = tileCenter(t.i, t.j), [ix, iz] = DIRS[t.inDir], [ox, oz] = DIRS[t.outDir], ex = c.x - ix * TILE / 2, ez = c.z - iz * TILE / 2, out = [];
  for (let m = 0; m < N; m++) {
    const u = m / N;
    if (t.inDir === t.outDir) { out.push({ x: ex + ix * TILE * u, z: ez + iz * TILE * u, u }); continue; }
    const cx = ex + ox * TILE / 2, cz = ez + oz * TILE / 2, a0 = Math.atan2(ez - cz, ex - cx), a1 = Math.atan2(c.z + oz * TILE / 2 - cz, c.x + ox * TILE / 2 - cx);
    let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); const a = a0 + da * u;
    out.push({ x: cx + (TILE / 2) * Math.cos(a), z: cz + (TILE / 2) * Math.sin(a), u });
  }
  return out;
}

export function buildRoad(farm, step = 1) {
  const N = Math.round(TILE / step), pts = [];
  const routes = farm.routes.map((R, r) => {
    const P = [];
    R.tiles.forEach((t, k) => { for (const p of tilePts(t, N)) P.push({ ...p, r, k }); });
    const last = R.tiles.at(-1), c = tileCenter(last.i, last.j), [ox, oz] = DIRS[last.outDir];
    P.push({ x: c.x + ox * TILE / 2, z: c.z + oz * TILE / 2, u: 1, r, k: R.tiles.length - 1 });
    let s = 0;
    P.forEach((p, n) => {
      const a = P[Math.max(0, n - 1)], b = P[Math.min(P.length - 1, n + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      if (n > 0) s += Math.hypot(p.x - P[n - 1].x, p.z - P[n - 1].z);
      Object.assign(p, { n, s, tx: dx / l, tz: dz / l });
    });
    pts.push(...P); return { pts: P, length: s };
  });
  const tileOf = p => farm.routes[p.r].tiles[p.k];
  const nearest = (x, z) => {
    let best = Infinity, pt = pts[0];
    for (const p of pts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; pt = p; } }
    return { d: Math.sqrt(best), pt };
  };
  const inYard = (x, z) => Math.abs(x) <= YARD_HALF && Math.abs(z) <= YARD_HALF;
  return {
    routes, pts, nearest, inYard,
    surfaceAt(x, z) {
      if (inYard(x, z)) return 'gravel';
      const n = nearest(x, z); if (n.d > ROAD_HALF) return 'grass';
      return tileOf(n.pt).type === 'mud' && Math.abs(n.pt.u - 0.5) * TILE < 7 ? 'mud' : 'gravel';
    },
    inSprinkler(x, z) { if (inYard(x, z)) return false; const n = nearest(x, z); return tileOf(n.pt).type === 'sprinkler' && n.d < ROAD_HALF + 1 && Math.abs(n.pt.u - 0.5) * TILE < 2.5; },
    featureCenter(r, k) { const t = farm.routes[r].tiles[k], c = tileCenter(t.i, t.j); return { x: c.x, z: c.z, yaw: Math.atan2(DIRS[t.outDir][0], DIRS[t.outDir][1]) }; },
    ahead(pt, dist) { const P = routes[pt.r].pts; return P[Math.max(0, Math.min(P.length - 1, pt.n + Math.round(dist / step)))]; },
    edgePush(x, z) { // soft farm-edge fence (T-17): spring back inside within 5 m of the edge, in m/s^2
      const lim = FARM_HALF - 5, f = v => Math.abs(v) > lim ? -Math.sign(v) * (Math.abs(v) - lim) * 3 : 0;
      return { x: f(x), z: f(z) };
    },
  };
}

// F-1: remembers which end the tractor came in by; true once when it leaves by the other end.
export function makeBarnPass(barn) {
  let entered = 0;
  return (x, z) => {
    const { a, s } = barnLocal(barn, x, z), inside = Math.abs(a) < barn.half && Math.abs(s) < barn.width;
    if (inside) { if (!entered) entered = Math.sign(a) || 1; return false; }
    if (!entered) return false;
    const passed = Math.sign(a) === -entered; entered = 0; return passed;
  };
}
```

- [ ] **Step 4: Implement scenery.js**

```js
// Field scenery (4.6), the farmyard walls and props (4.7), and the static colliders for the farm.
import { TILE, SIZE, tileCenter, YARD_HALF, barnLocal } from './track.js';
import { ROAD_HALF } from './road.js';
import { G, groups } from './physics.js';
import { addRamp } from './sandbox.js';
const TALL = ['oak', 'tree', 'treeFat'], SMALL = ['bush', 'bushS', 'rock', 'pumpkin', 'grass', 'flowerY', 'flowerR', 'log', 'stump', 'hay'];
const R = { oak: 1.4, tree: 1.0, treeFat: 1.3, bush: 0.9, bushS: 0.5, rock: 0.5, pumpkin: 0.4, corn: 0.4, grass: 0.2, flowerY: 0.15, flowerR: 0.15, log: 0.6, stump: 0.5, hay: 0.8 };
const yawQ = y => ({ x: 0, y: Math.sin(y / 2), z: 0, w: Math.cos(y / 2) });

// Four sides of an axis-aligned rect as wall segments, with openings { x, z, w } cut where they sit on a side.
export function wallsOfRect(Rc, gaps = []) {
  const sides = [[Rc.x0, Rc.z0, Rc.x1, Rc.z0], [Rc.x1, Rc.z0, Rc.x1, Rc.z1], [Rc.x1, Rc.z1, Rc.x0, Rc.z1], [Rc.x0, Rc.z1, Rc.x0, Rc.z0]], out = [];
  for (const [ax, az, bx, bz] of sides) {
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const cuts = gaps.filter(g => Math.abs((g.x - ax) * -uz + (g.z - az) * ux) < 0.5).map(g => [(g.x - ax) * ux + (g.z - az) * uz, g.w]).sort((p, q) => p[0] - q[0]);
    let t = 0;
    for (const [c, w] of cuts) { if (c - w / 2 > t) out.push([ax + ux * t, az + uz * t, ax + ux * (c - w / 2), az + uz * (c - w / 2)]); t = c + w / 2; }
    if (t < L) out.push([ax + ux * t, az + uz * t, bx, bz]);
  }
  return out;
}
const H = YARD_HALF;
export const yardWalls = () => wallsOfRect({ x0: -H, x1: H, z0: -H, z1: H }, [[H, 0], [0, H], [-H, 0], [0, -H]].map(([x, z]) => ({ x, z, w: 8 })));
export const paddockWalls = farm => wallsOfRect(farm.yard.paddock, [{ ...farm.yard.paddock.gate, w: 1.6 }]);

function addWall(phys, [ax, az, bx, bz], h, group) {
  const { RAPIER, world } = phys, L = Math.hypot(bx - ax, bz - az), th = Math.atan2(-(bz - az), bx - ax);
  world.createCollider(RAPIER.ColliderDesc.cuboid(L / 2, h / 2, 0.15).setTranslation((ax + bx) / 2, h / 2, (az + bz) / 2).setRotation(yawQ(th)).setFriction(0.1).setRestitution(0).setCollisionGroups(group));
}

export function scatterScenery(farm, road, rng) {
  const items = [], ok = (x, z, r, gap) => road.nearest(x, z).d > ROAD_HALF + gap + r && !road.inYard(x, z) && Math.hypot(x - farm.pond.x, z - farm.pond.z) > farm.pond.r + r + 1
    && items.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r + 0.5) && farm.hideSpots.every(h => Math.hypot(h.x - x, h.z - z) > 3);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    if (farm.grid[j][i] !== 'field') continue;
    const c = tileCenter(i, j), cornField = rng.chance(0.15), n = cornField ? 40 : rng.int(4, 9);
    let placed = 0;
    for (let m = 0; m < n * 3 && placed < n; m++) {
      const kind = cornField ? 'corn' : rng.chance(0.3) ? rng.pick(TALL) : rng.pick(SMALL), r = R[kind];
      const x = c.x + rng.range(-TILE / 2 + 1, TILE / 2 - 1), z = c.z + rng.range(-TILE / 2 + 1, TILE / 2 - 1);
      if (!ok(x, z, r, TALL.includes(kind) ? 6 : 1.5)) continue;
      items.push({ kind, x, z, yaw: rng.range(0, Math.PI * 2), scale: rng.range(0.85, 1.25) * (TALL.includes(kind) ? 1.6 : 1.2), r }); placed++;
    }
  }
  for (const h of farm.hideSpots) items.push({ kind: 'bush', x: h.x, z: h.z, yaw: 0, scale: 1.8, r: 1.2, hide: true });
  return items;
}

export function addSceneryColliders(phys, items) {
  const { RAPIER, world } = phys, cg = groups(G.STATIC, 0xffff);
  for (const it of items) if (TALL.includes(it.kind) || it.kind === 'rock' || it.kind === 'hay' || it.kind === 'stump')
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.5, it.r * 0.6).setTranslation(it.x, 1.5, it.z).setFriction(0.1).setRestitution(0.1).setCollisionGroups(cg));
}

export function addFarmColliders(phys, farm, road) {
  const { RAPIER, world } = phys, cg = groups(G.STATIC, 0xffff), y = farm.yard, b = y.barn;
  farm.routes.forEach((R2, r) => R2.tiles.forEach((t, k) => { if (t.type === 'ramp') addRamp(phys, road.featureCenter(r, k)); }));
  for (const sd of [-1, 1]) { // drive-through barn: two side walls along the axis (T-28)
    const ox = Math.cos(b.yaw) * sd * b.width, oz = -Math.sin(b.yaw) * sd * b.width;
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 2.5, b.half).setTranslation(b.x + ox, 2.5, b.z + oz).setRotation(yawQ(b.yaw)).setFriction(0.1).setCollisionGroups(cg));
  }
  for (const seg of yardWalls(farm)) addWall(phys, seg, 1.0, cg);
  for (const seg of paddockWalls(farm)) addWall(phys, seg, 1.0, cg);
  const st = y.stage; // low platform: the tractor can bump up onto it
  world.createCollider(RAPIER.ColliderDesc.cuboid((st.x1 - st.x0) / 2, st.y / 2, (st.z1 - st.z0) / 2).setTranslation((st.x0 + st.x1) / 2, st.y / 2, (st.z0 + st.z1) / 2).setCollisionGroups(cg));
}

// T-31: bales roll (cylinder on its side), cones and barrels tip; posts and trees are fixed. T-32: reset() on each show.
export function addYardProps(phys, farm) {
  const { RAPIER, world } = phys, cg = groups(G.PROP, 0xffff), fixed = groups(G.STATIC, 0xffff), props = [], S = Math.SQRT1_2;
  for (const o of farm.yard.obstacles) {
    if (o.kind === 'post' || o.kind === 'tree') {
      world.createCollider(RAPIER.ColliderDesc.cylinder(1.2, o.kind === 'tree' ? 0.7 : 0.18).setTranslation(o.x, 1.2, o.z).setFriction(0.1).setCollisionGroups(fixed));
      props.push({ ...o, body: null }); continue;
    }
    const cy = Math.cos(o.yaw / 2), sy = Math.sin(o.yaw / 2);
    const q = o.kind === 'bale' ? { x: cy * S, y: sy * S, z: -sy * S, w: cy * S } : yawQ(o.yaw); // bale: yaw then 90 degrees about x
    const y = { bale: 0.75, cone: 0.35, barrel: 0.5 }[o.kind];
    const shape = { bale: () => RAPIER.ColliderDesc.cylinder(0.6, 0.75).setMass(150), cone: () => RAPIER.ColliderDesc.cone(0.35, 0.25).setMass(2), barrel: () => RAPIER.ColliderDesc.cylinder(0.5, 0.4).setMass(25) }[o.kind]();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(o.x, y, o.z).setRotation(q).setLinearDamping(0.3).setAngularDamping(0.5));
    world.createCollider(shape.setFriction(0.6).setRestitution(0.1).setCollisionGroups(cg), body);
    props.push({ ...o, body, start: { x: o.x, y, z: o.z, q } });
  }
  return {
    props,
    reset() { for (const p of props) if (p.body) { p.body.setTranslation(p.start, true); p.body.setRotation(p.start.q, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); p.body.setAngvel({ x: 0, y: 0, z: 0 }, true); } },
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: road, yard and scenery tests PASS.

- [ ] **Step 6: farm3d.js**

```js
import * as THREE from 'three';
import { ASSETS, geoFrom, boxGeo, mergeGeos } from './gfx.js';
import { ROAD_HALF, FARM_HALF } from '../sim/road.js';
import { YARD_HALF } from '../sim/track.js';
import { yardWalls, paddockWalls } from '../sim/scenery.js';

export function buildFarm3D(scene, farm, road, items, props) {
  const matV = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const speckle = (g, a, b) => { const n = g.attributes.position.count, col = new Float32Array(n * 3), A = new THREE.Color(a), B = new THREE.Color(b), c = new THREE.Color(); for (let i = 0; i < n; i++) { c.copy(A).lerp(B, Math.random()); col.set([c.r, c.g, c.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; };
  // grass ground with soft color variation (Pig Pens recipe)
  {
    const g = new THREE.PlaneGeometry(FARM_HALF * 2 + 120, FARM_HALF * 2 + 120, 140, 140).rotateX(-Math.PI / 2);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), A = new THREE.Color('#88cc72'), B = new THREE.Color('#9fd680'), Cc = new THREE.Color('#73bb66'), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const x = g.attributes.position.getX(i), z = g.attributes.position.getZ(i); const v = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * 0.5 + Math.sin(z * 0.13 + x * 0.05) * 0.5; c.copy(A).lerp(v > 0 ? B : Cc, Math.abs(v) * 0.6); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); const m = new THREE.Mesh(g, matV); m.receiveShadow = true; scene.add(m);
  }
  // farmyard: packed gravel square
  { const g = speckle(new THREE.PlaneGeometry(YARD_HALF * 2, YARD_HALF * 2, 60, 60).rotateX(-Math.PI / 2), '#d9c49d', '#c4ab80'); g.translate(0, 0.015, 0); const m = new THREE.Mesh(g, matV); m.receiveShadow = true; scene.add(m); }
  // road ribbons (one per route; open ends meet the yard edge)
  const ribbon = (P, keep, colA, colB, y, mat) => {
    const pos = [], col = [], idx = [], A = new THREE.Color(colA), B = new THREE.Color(colB), c = new THREE.Color(); let open = false;
    for (const p of P) {
      if (!keep(p)) { open = false; continue; }
      for (const sd of [-1, 1]) { pos.push(p.x + p.tz * sd * ROAD_HALF, y, p.z - p.tx * sd * ROAD_HALF); c.copy(A).lerp(B, Math.random()); col.push(c.r, c.g, c.b); }
      const b = pos.length / 3 - 2; if (open) idx.push(b - 2, b - 1, b, b - 1, b + 1, b); open = true;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat || matV); m.receiveShadow = true; scene.add(m);
  };
  const mudMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: '#4a3622' });
  for (const R of road.routes) {
    ribbon(R.pts, () => true, '#d6bf96', '#bfa57a', 0.02);
    ribbon(R.pts, p => farm.routes[p.r].tiles[p.k].type === 'mud' && Math.abs(p.u - 0.5) * 20 < 7, '#7a5233', '#5f3e25', 0.04, mudMat);
  }
  // ramps and sprinkler arches on route tiles
  const sprinklers = [];
  farm.routes.forEach((R, r) => R.tiles.forEach((t, k) => {
    const c = road.featureCenter(r, k);
    if (t.type === 'ramp') {
      const s = new THREE.Shape([[-5, 0], [0, 0.6], [1, 0.6], [4, 0]].map(([a, y]) => new THREE.Vector2(a, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth: 7, bevelEnabled: false }); g.translate(0, 0, -3.5); g.rotateY(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#c9ad7f' })); m.position.set(c.x, 0, c.z); m.rotation.y = c.yaw; m.castShadow = m.receiveShadow = true; scene.add(m);
    }
    if (t.type === 'sprinkler') {
      const g = mergeGeos([boxGeo(0.3, 4.2, 0.3, ROAD_HALF + 0.6, 2.1, 0, '#3d7fd1'), boxGeo(0.3, 4.2, 0.3, -ROAD_HALF - 0.6, 2.1, 0, '#3d7fd1'), boxGeo(ROAD_HALF * 2 + 1.5, 0.25, 0.25, 0, 4.2, 0, '#3d7fd1')]);
      const m = new THREE.Mesh(g, matV); m.position.set(c.x, 0, c.z); m.rotation.y = c.yaw; m.castShadow = true; scene.add(m); sprinklers.push({ mesh: m, ...c });
    }
  }));
  // pond
  { const p = farm.pond, m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#5fb4e0', shininess: 90 })); m.position.set(p.x, 0.03, p.z); scene.add(m); }
  // field scenery: one InstancedMesh per kind
  const byKind = new Map(); for (const it of items) { if (!byKind.has(it.kind)) byKind.set(it.kind, []); byKind.get(it.kind).push(it); }
  for (const [kind, list] of byKind) {
    const m = new THREE.InstancedMesh(geoFrom(Object.values(ASSETS[kind])), matV, list.length);
    list.forEach((it, i) => m.setMatrixAt(i, mtx.compose(p3.set(it.x, 0, it.z), q.setFromAxisAngle(UP, it.yaw), s3.setScalar(it.scale))));
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  // fences: farm edge, yard (with gate gaps) and paddock, all from the Kenney fence piece every 1 m
  const fenceGeo = geoFrom(Object.values(ASSETS.fence), new THREE.Matrix4().makeTranslation(0, 0.05, 0.465)), segs = [...yardWalls(farm), ...paddockWalls(farm)];
  const E = FARM_HALF; segs.push([-E, -E, E, -E], [E, -E, E, E], [E, E, -E, E], [-E, E, -E, -E]);
  const pieces = []; for (const [ax, az, bx, bz] of segs) { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L)), yaw = Math.atan2(bx - ax, bz - az) - Math.PI / 2; for (let i = 0; i < n; i++) pieces.push([ax + (bx - ax) * (i + 0.5) / n, az + (bz - az) * (i + 0.5) / n, yaw]); }
  { const m = new THREE.InstancedMesh(fenceGeo, matV, pieces.length); pieces.forEach(([x, z, yaw], i) => m.setMatrixAt(i, mtx.compose(p3.set(x, 0, z), q.setFromAxisAngle(UP, yaw), s3.setScalar(1)))); m.castShadow = true; scene.add(m); }
  // gate posts (T-8): two tall wood posts with a cross bar at each farmyard gate
  for (const [gx, gz] of [[YARD_HALF, 0], [0, YARD_HALF], [-YARD_HALF, 0], [0, -YARD_HALF]]) {
    const across = gx === 0 ? [1, 0] : [0, 1], parts = [];
    for (const sd of [-1, 1]) parts.push(boxGeo(0.4, 3.2, 0.4, gx + across[0] * sd * 4.2, 1.6, gz + across[1] * sd * 4.2, '#8a6240'));
    parts.push(boxGeo(across[0] ? 8.8 : 0.3, 0.3, across[1] ? 8.8 : 0.3, gx, 3.1, gz, '#8a6240'));
    const m = new THREE.Mesh(mergeGeos(parts), matV); m.castShadow = true; scene.add(m);
  }
  // drive-through barn (T-28): red walls along the axis, a roof, open at both ends
  const b = farm.yard.barn, barn = new THREE.Group(); barn.position.set(b.x, 0, b.z); barn.rotation.y = b.yaw; scene.add(barn);
  const Wd = b.width, L = b.half;
  barn.add(new THREE.Mesh(mergeGeos([
    boxGeo(0.4, 5, L * 2, Wd, 2.5, 0, '#b8322a'), boxGeo(0.4, 5, L * 2, -Wd, 2.5, 0, '#b8322a'),
    boxGeo(Wd * 2 + 0.8, 0.4, L * 2 + 0.4, 0, 5.2, 0, '#7b2a22'), boxGeo(Wd * 2 + 0.8, 2.2, 0.4, 0, 6.4, L, '#b8322a'), boxGeo(Wd * 2 + 0.8, 2.2, 0.4, 0, 6.4, -L, '#b8322a'),
    boxGeo(1.2, 1.2, 0.1, 0, 6.4, L + 0.25, '#ffffff'), boxGeo(1.2, 1.2, 0.1, 0, 6.4, -L - 0.25, '#ffffff'),
  ]), matV));
  // stage: low wood platform (T-29)
  { const s = farm.yard.stage, m = new THREE.Mesh(boxGeo(s.x1 - s.x0, s.y, s.z1 - s.z0, (s.x0 + s.x1) / 2, s.y / 2, (s.z0 + s.z1) / 2, '#b9874f'), matV); m.receiveShadow = m.castShadow = true; scene.add(m); }
  // props (T-31)
  const PROP_GEO = {
    bale: () => new THREE.CylinderGeometry(0.75, 0.75, 1.2, 20).rotateX(Math.PI / 2).rotateY(0),
    cone: () => mergeGeos([boxGeo(0.5, 0.06, 0.5, 0, -0.32, 0, '#ffffff'), new THREE.ConeGeometry(0.25, 0.7, 16)]),
    barrel: () => new THREE.CylinderGeometry(0.4, 0.4, 1.0, 16),
    post: () => boxGeo(0.3, 2.4, 0.3, 0, 1.2, 0, '#8a6240'),
  };
  const COLORS = { bale: '#e7c45a', cone: '#ff7a1a', barrel: '#a5462f', post: '#8a6240' };
  const propMeshes = props.map(p => {
    if (p.kind === 'tree') { const m = new THREE.Mesh(geoFrom(Object.values(ASSETS.oak)), matV); m.position.set(p.x, 0, p.z); m.scale.setScalar(1.8); m.castShadow = true; scene.add(m); return null; }
    const m = new THREE.Mesh(PROP_GEO[p.kind](), p.kind === 'post' ? matV : new THREE.MeshLambertMaterial({ color: COLORS[p.kind] }));
    m.castShadow = true; m.position.set(p.x, 0, p.z); scene.add(m); return m;
  });
  return {
    sprinklers,
    update() { props.forEach((p, i) => { const m = propMeshes[i]; if (!m || !p.body) return; m.position.copy(p.body.translation()); m.quaternion.copy(p.body.rotation()); }); },
  };
}
```

The fence piece uses Pig Pens' recentre offset. Check its orientation in the first screenshot: if the pieces stand across the line instead of along it, drop the `- Math.PI / 2`.

The bale geometry is built along local z after `rotateX`. The physics cylinder is along local y, then rotated 90° about x, so it also lies along z. Both use the same quaternion. If the visual and the collider do not line up in the browser, drop the `rotateX` and let the body quaternion do the turn.

- [ ] **Step 7: main.js farm mode**

Change `main.js` so it builds the farm unless `?sandbox` is set:

```js
import { generateFarm } from './sim/track.js';
import { buildRoad } from './sim/road.js';
import { scatterScenery, addSceneryColliders, addFarmColliders, addYardProps } from './sim/scenery.js';
import { buildFarm3D } from './render/farm3d.js';
import { makeRng, randomSeed } from './sim/rng.js';
import { createPhysics, DT } from './sim/physics.js';
import { createTractor } from './sim/tractor.js';
import { createTrain } from './sim/hitch.js';
// …
const seed = params.has('seed') ? +params.get('seed') : randomSeed();
const game = params.has('sandbox') ? createSandbox(RAPIER, { power }) : createFarmDrive(RAPIER, seed, power);
console.log('seed', seed);

function createFarmDrive(RAPIER, seed, power) {
  const farm = generateFarm(seed), road = buildRoad(farm), items = scatterScenery(farm, road, makeRng(seed ^ 0x9e3779b9));
  const phys = createPhysics(RAPIER); addFarmColliders(phys, farm, road); // includes the route edges (Task 7b)
  const yardProps = addYardProps(phys, farm), s = farm.start;
  const tractor = createTractor(phys, { x: s.x, z: s.z, yaw: s.yaw, power, surfaceAt: road.surfaceAt });
  const train = createTrain(phys, tractor);
  return { phys, farm, road, items, yardProps, tractor, train, step(input) {
    tractor.setInput(input.thr, input.steer); tractor.step(DT);
    const e = road.edgePush(tractor.x, tractor.z); if (e.x || e.z) tractor.body.applyImpulse({ x: e.x * 1400 * DT, y: 0, z: e.z * 1400 * DT }, true);
    train.step(DT, { parked: Math.abs(input.thr) < 0.05 && tractor.speed < 0.3 }); phys.world.step();
  } };
}
```

Then call `const farm3d = buildFarm3D(scene, game.farm, game.road, game.items, game.yardProps.props)` when `game.farm` exists, and call `farm3d.update()` each frame. Otherwise keep the sandbox visuals from Task 5 (move them into a `buildSandbox3D(scene, game)` function in `main.js`).

- [ ] **Step 8: Verify and commit, then PLAYTEST 2**

Run: `npm test && npm run build`. Open `/exp/tractor-pickup/?seed=1`, `?seed=2` and `?seed=3`. Drive both routes, drive through the barn, and push a hay bale and some cones. Take one Playwright screenshot of the farmyard and one of a route per seed.
Expected:
- A fenced gravel farmyard with a red drive-through barn, a stage, a paddock, bales, cones, barrels, posts and two trees.
- Two twisty gravel routes that leave by one gate and come back by another, with mud, a ramp and a sprinkler arch.
- Bales roll, cones and barrels tip over, and posts and trees stay put.

```bash
git add games/tractor-pickup/src games/tractor-pickup/test/road.test.mjs games/tractor-pickup/test/yard.test.mjs site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup - routes, farmyard props and generated farm"
```

Stop and ask the user to playtest the farm and the farmyard on the iPad.

---

### Task 7b: Bigger farm, route edges, new barn, no paddock (Playtest 2 changes)

This task changes code that Tasks 6 and 7 built. Read the current `src/sim/track.js`, `src/sim/road.js`, `src/sim/scenery.js`, `src/sim/sandbox.js`, `src/render/farm3d.js`, `bake.mjs` and their tests before you edit. The binding design is spec v1.2: T-1, T-2, T-3, T-5, T-14, T-17, T-28 to T-31, 4.6, A-5, A-13 and A-16.

**Files:**
- Modify: `src/sim/track.js`, `src/sim/road.js`, `src/sim/scenery.js`, `src/sim/sandbox.js` (`addRamp` width), `src/render/farm3d.js`, `bake.mjs` and `src/assets.json` (rock models), `test/track.test.mjs`, `test/road.test.mjs`, `test/yard.test.mjs`
- Create: `src/sim/edges.js`, `test/edges.test.mjs`

**Interfaces (changes):**
- track.js: `TILE = 36`, `YARD_HALF = 54` (3 tiles). `yard.paddock` is removed. `yard.pond = { x, z, r: 7 }` sits in a farmyard corner, and `yardFree` keeps clear of it (r + 2). `farm.pond` is `yard.pond`. Obstacle counts are 8 bales, 16 cones, 8 barrels, 8 posts and 4 trees. Lane clearance is `segDist > 5 + r`, for 10 m wide lanes. `hideSpots` sit on the shoulder, 8.5 m from the centerline of a plain straight or gate tile.
- road.js: `ROAD_HALF = 7`, `SHOULDER = 1.5`, `CORRIDOR = ROAD_HALF + SHOULDER` (8.5). `surfaceAt` returns `'gravel'` or `'mud'` within `ROAD_HALF`, `'grass'` on the shoulder and beyond, and `'gravel'` in the yard. The mud area is `|u − 0.5| × TILE < 0.35 × TILE`. `inSprinkler` has width `ROAD_HALF + 1`. The farm-edge `edgePush` is removed, because the edges and the yard fence now enclose the drivable area.
- edges.js (new): `EDGE = { foot: 8.5, crest: 11, crestOut: 13, outFoot: 16, height: 3 }` (distances from the centerline, in m). `edgeStrips(route) -> { vertices: Float32Array, indices: Uint32Array }` builds both banks of one route from `route.pts`. `addEdgeColliders(phys, road)` adds one fixed trimesh collider per route (`G.STATIC`). `edgeRocks(road, rng) -> [{ x, z, yaw, scale, kind }]` places rocks about every 3 m along both crests.
- scenery.js: paddock walls are removed. Gate gaps are 17 m wide. Field scenery sits only outside the edges (`road.nearest(x, z).d > EDGE.outFoot + r`) and is denser: 10–20 items per field tile, with more tall trees (forest, A-4.6). Scenery colliders are no longer needed and are removed, because the tractor cannot reach the fields. The yard props and the yard fence stay.
- sandbox.js: `addRamp(phys, { x, z, yaw, width = 7 })`. The farm uses `width: 14`.
- farm3d.js:
  - Draw the road ribbons at `ROAD_HALF` 7, with a grass shoulder strip.
  - Draw the edge banks from `edgeStrips`. Use the gravel texture tinted grey-brown on the inner slope and the grass texture on the crest and the outer slope.
  - Draw the rocks instanced from the Nature Kit rock models.
  - Remove the paddock.
  - Draw the pond in the yard.
  - Build the new barn (below).

- [ ] **Step 1: Write the failing tests**

- `test/edges.test.mjs`:
  1. `edgeStrips` gives a closed, valid mesh. Every index is below the vertex count. Every vertex is at 0 ≤ y ≤ 3. For seeds 1–3, the crest vertices lie 11–13 m from the route's centerline, checked with `road.nearest` at 0.5 m tolerance.
  2. The tractor can't leave the route. Build a farm (seed 1): physics, `addFarmColliders`, `addEdgeColliders`, and a tractor on a straight route tile facing across the road toward one edge. Drive full throttle (High power) for 6 s.
     - It never reaches the crest: max `road.nearest(...).d` < `EDGE.crest`.
     - Afterwards the tractor is upright: `u.y` > 0.9 after 3 s of rest.
     - Repeat toward the other edge.
  3. Driving straight along a route tile at full speed for 4 s keeps `d` < `ROAD_HALF`, so the edges don't interfere with normal driving.
- `test/track.test.mjs`:
  - Update the constants and counts: 8, 16, 8, 8 and 4 obstacles; lanes `> 5 + r`.
  - The pond is inside the yard and clear of lanes, barn and stage.
  - Hide spots are 7.5–9.5 m from the route centerline. Measure this in the road tests; in track.js, check the 8.5 m offset from the tile line.
- `test/road.test.mjs`:
  - Scenery `d > EDGE.outFoot + r`.
  - Yard gate gaps are clear by more than 8 m.
  - `surfaceAt` on the shoulder (d = 8) is `'grass'`.
  - The mud test still passes at the new size.
- `test/yard.test.mjs`:
  - Props are 32 dynamic and 12 fixed.
  - Remove the paddock wall test.

- [ ] **Step 2: Run the tests and confirm they fail for the expected reasons**

- [ ] **Step 3: Implement**

Edge strips. For each route, build both sides from its points. Each side is a profile of 4 points at distances `[foot, crest, crestOut, outFoot]` with heights `[0, height, height, 0]`, offset along the left normal `(-tz, tx)` × side. Join consecutive points with quads. Wind the triangles so the normals face up and inward. Take the winding care that Task 7's road ribbon needed.

```js
// src/sim/edges.js: the rock edges that keep the tractor on a route (spec T-17).
import { G, groups } from './physics.js';
export const EDGE = { foot: 8.5, crest: 11, crestOut: 13, outFoot: 16, height: 3 };
const PROFILE = [[EDGE.foot, 0], [EDGE.crest, EDGE.height], [EDGE.crestOut, EDGE.height], [EDGE.outFoot, 0]];
export function edgeStrips(route) {
  const P = route.pts, pos = [], idx = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (const p of P) for (const [d, h] of PROFILE) pos.push(p.x - p.tz * side * d, h, p.z + p.tx * side * d);
    for (let i = 0; i + 1 < P.length; i++) for (let k = 0; k < 3; k++) {
      const a = base + i * 4 + k, b = a + 1, c = a + 4, e = a + 5;
      if (side > 0) idx.push(a, c, b, b, c, e); else idx.push(a, b, c, b, e, c);
    }
  }
  return { vertices: new Float32Array(pos), indices: new Uint32Array(idx) };
}
export function addEdgeColliders(phys, road) {
  const { RAPIER, world } = phys;
  for (const r of road.routes) { const { vertices, indices } = edgeStrips(r);
    world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.6).setRestitution(0).setCollisionGroups(groups(G.STATIC, 0xffff))); }
}
export function edgeRocks(road, rng) {
  const out = [];
  for (const r of road.routes) for (let i = 0; i < r.pts.length; i += 3) for (const side of [-1, 1]) {
    const p = r.pts[i], d = rng.range(EDGE.crest - 0.5, EDGE.crestOut + 0.5);
    out.push({ x: p.x - p.tz * side * d, z: p.z + p.tx * side * d, yaw: rng.range(0, 6.28), scale: rng.range(1.2, 2.4), kind: rng.pick(['rockA', 'rockB', 'rockC']) });
  }
  return out;
}
```

- Verify the winding in the browser: the banks must be visible from the road. Use one strip winding for the mesh; trimesh colliders are double-sided.
- Bake: add `rockA: NK('rock_largeA')`, `rockB: NK('rock_largeB')`, `rockC: NK('rock_tallA')` to the statics. Check these files exist in "Nature Kit/Models/GLTF format/"; if one is missing, use the nearest existing `rock_large*` or `rock_tall*` model. Then re-run `npm run bake`.
- `addFarmColliders` calls `addEdgeColliders`. `game`/`main` farm mode no longer apply `edgePush`; remove those calls.

The new barn (T-28), the same size (inside 12 m long × 10 m wide, walls 5 m), built in code in `farm3d.js`:
- Red board walls with vertical plank lines. Use a small canvas texture: red with darker plank seams and slight weathering, or vertex-color stripes.
- White corner trim and a white trim band under the roof.
- A gambrel roof: extrude a 5-point profile along the barn axis. The steep lower pitch is about 60° and the shallow upper pitch about 30°. Use dark red-brown or grey shingles, and keep a small overhang.
- Both gable ends: a white-framed hay-loft door with an X brace, above the open drive-through door.
- At each end, two big door leaves standing open against the walls (swung 90° out), red with a white X brace and frame.
- A small white cupola with a little roof on the ridge.
- The roof, gables and cupola stay in the separate fading roof group (the existing fade logic). The walls and open doors stay solid. The open door leaves must not block the 10 m opening; check them against the barn collider walls.

- [ ] **Step 4: Run the tests, build, and check in the browser**

Run `npm test` and `npm run build`. With a local server on a free port, drive seed 1 and seed 2: down a route, into an edge (it must stop you and roll you back), through the yard and through the barn.

Take screenshots:
- `shots/task7b-route.png`: a route with both edges and rocks.
- `shots/task7b-barn.png`: the new barn from the yard, roof visible.
- `shots/task7b-yard.png`.

Check 60 fps feel: no obvious stutter, and report draw-call count from `renderer.info.render.calls`.

- [ ] **Step 5: Commit**

```bash
git add games/tractor-pickup/src games/tractor-pickup/test games/tractor-pickup/bake.mjs site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup - wider routes with rock edges, bigger farmyard, new barn"
```

---

### Task 8: Slots, riders and the launch path

**Files:**
- Create: `src/sim/slots.js`, `src/sim/launch.js`, `test/slots.test.mjs`, `test/launch.test.mjs`

**Interfaces:**
- Produces (slots.js): `CAR_SLOTS = 6`, `slotLocal(k) -> { x, y, z }` (trailer body frame, on the bed), `createLoad(capacity) -> { capacity, slots, reserve(animal) -> slot|null, land(slot), landed(): number, full(): boolean }` where `slot = { car: 0|1, k: 0..5, animal, landed }`. Also `RIDER`, `newRider() -> { ox, oy, oz, vx, vy, vz }`, `stepRider(r, accLocal, dt)`.
- Produces (launch.js): `FLIGHT = { pig: { dur: 1.2, flourish: 'flip' }, cow: { dur: 1.4, flourish: 'none' }, chicken: { dur: 1.3, flourish: 'flap' }, sheep: { dur: 1.2, flourish: 'spin' }, duck: { dur: 1.2, flourish: 'drip' }, bunny: { dur: 1.0, flourish: 'ears' }, dog: { dur: 1.1, flourish: 'none' }, chick: { dur: 1.0, flourish: 'flap' } }`, `launchLocal(u, start, slot, out) -> out` (all in tractor frame: `x` forward, `y` up, `z` right), `flourishAngle(kind, u) -> rad`.

- [ ] **Step 1: Write the failing tests**

`test/slots.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoad, slotLocal, newRider, stepRider, RIDER, CAR_SLOTS } from '../src/sim/slots.js';

test('fills the trailer first, then the wagon, up to the capacity', () => {
  const L = createLoad(12), s = [];
  for (let i = 0; i < 14; i++) s.push(L.reserve({ id: i }));
  assert.deepEqual(s.slice(0, 6).map(x => x.car), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.slice(6, 12).map(x => x.car), [1, 1, 1, 1, 1, 1]);
  assert.equal(s[12], null); assert.equal(s[13], null);
  assert.ok(L.full());
});
test('a capacity of 4 uses only the trailer', () => {
  const L = createLoad(4); for (let i = 0; i < 4; i++) assert.equal(L.reserve({}).car, 0); assert.equal(L.reserve({}), null);
});
test('landed counts only landed slots', () => {
  const L = createLoad(5), a = L.reserve({}), b = L.reserve({}); L.land(a); assert.equal(L.landed(), 1); L.land(b); assert.equal(L.landed(), 2);
});
test('slot positions are inside the bed and distinct', () => {
  const keys = new Set();
  for (let k = 0; k < CAR_SLOTS; k++) { const p = slotLocal(k); assert.ok(Math.abs(p.x) < 1.4 && Math.abs(p.z) < 1.0); keys.add(`${p.x},${p.z}`); }
  assert.equal(keys.size, CAR_SLOTS);
});
test('riders bounce but never leave the slot (R-4)', () => {
  const r = newRider(); let max = 0;
  for (let i = 0; i < 600; i++) { const a = i < 30 ? { x: 0, y: -9.81, z: 0 } : i < 33 ? { x: 0, y: 80, z: 0 } : { x: Math.sin(i * 0.3) * 15, y: 0, z: Math.cos(i * 0.2) * 15 }; stepRider(r, a, 1 / 60); max = Math.max(max, Math.hypot(r.ox, r.oy, r.oz)); assert.ok(r.oy >= 0); }
  assert.ok(max <= RIDER.max + 1e-9); assert.ok(max > 0.1, 'no bounce at all');
});
```

`test/launch.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchLocal, flourishAngle, FLIGHT } from '../src/sim/launch.js';
const start = { x: 3, y: 0.3, z: 0.5 }, slot = { x: -5, y: 0.9, z: -0.45 }, p = { x: 0, y: 0, z: 0 };

test('starts at the boop point and ends exactly in the slot', () => {
  launchLocal(0, start, slot, p); assert.deepEqual([p.x, p.y, p.z].map(v => +v.toFixed(6)), [3, 0.3, 0.5]);
  launchLocal(1, start, slot, p); assert.deepEqual([p.x, p.y, p.z].map(v => +v.toFixed(6)), [-5, 0.9, -0.45]);
});
test('goes up and over the cab', () => {
  let peak = 0, overCab = Infinity;
  for (let u = 0; u <= 1; u += 0.01) { launchLocal(u, start, slot, p); peak = Math.max(peak, p.y); if (p.x < 0.6 && p.x > -1.6) overCab = Math.min(overCab, p.y); }
  assert.ok(peak > 5, `peak ${peak}`); assert.ok(overCab > 3.2, `over cab ${overCab}`);
});
test('moves backward overall', () => {
  const xs = [0.2, 0.5, 0.8].map(u => launchLocal(u, start, slot, p).x); assert.ok(xs[0] > xs[1] && xs[1] > xs[2]);
});
test('every animal type has a flight and flourishes end at rest', () => {
  for (const t of ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick']) {
    assert.ok(FLIGHT[t].dur >= 1 && FLIGHT[t].dur <= 1.4);
    const a = flourishAngle(FLIGHT[t].flourish, 1); assert.ok(Math.abs(Math.sin(a)) < 1e-9);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL on the missing modules.

- [ ] **Step 3: Implement slots.js**

```js
// Trailer and wagon slots (2 rows x 3 per car, B-13) and the spring that holds a riding animal in its slot (D-12).
export const CAR_SLOTS = 6;
export const slotLocal = k => ({ x: 0.9 - Math.floor(k / 2) * 0.9, y: 0.15, z: k % 2 ? -0.48 : 0.48 });
export function createLoad(capacity) {
  const slots = [];
  return {
    capacity, slots,
    reserve(animal) { if (slots.length >= capacity) return null; const n = slots.length, s = { car: Math.floor(n / CAR_SLOTS), k: n % CAR_SLOTS, animal, landed: false }; slots.push(s); return s; },
    land(s) { s.landed = true; },
    landed: () => slots.filter(s => s.landed).length,
    full: () => slots.length >= capacity,
  };
}
export const RIDER = { k: 70, c: 7, max: 0.45 };
export const newRider = () => ({ ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0 });
// accLocal: the trailer's acceleration in its own frame (gravity excluded), m/s^2. Riders lag behind it.
export function stepRider(r, a, dt) {
  r.vx += (-RIDER.k * r.ox - RIDER.c * r.vx - a.x) * dt; r.vy += (-RIDER.k * r.oy - RIDER.c * r.vy - a.y - 9.81 * (r.oy > 0 ? 1 : 0)) * dt; r.vz += (-RIDER.k * r.oz - RIDER.c * r.vz - a.z) * dt;
  r.ox += r.vx * dt; r.oy += r.vy * dt; r.oz += r.vz * dt;
  if (r.oy < 0) { r.oy = 0; if (r.vy < 0) r.vy *= -0.3; }
  const m = Math.hypot(r.ox, r.oy, r.oz);
  if (m > RIDER.max) { const s = RIDER.max / m; r.ox *= s; r.oy *= s; r.oz *= s; const dot = (r.vx * r.ox + r.vy * r.oy + r.vz * r.oz) / (RIDER.max * RIDER.max); if (dot > 0) { r.vx -= dot * r.ox; r.vy -= dot * r.oy; r.vz -= dot * r.oz; } }
}
```

The `a.y` term: when the trailer is in free fall (`a.y = -9.81`), riders float up. A hard landing (`a.y` large and positive) pushes them down, then they bounce.

- [ ] **Step 4: Implement launch.js**

```js
// Predefined launch path (B-5): a cubic Bezier up and over the cab to a point above the slot,
// then an eased drop into the slot. All points are in the tractor frame, so the path rides with the tractor;
// the slot point is re-read every frame, so the end bends to follow a swinging trailer.
export const FLIGHT = {
  pig: { dur: 1.2, flourish: 'flip' }, cow: { dur: 1.4, flourish: 'none' }, chicken: { dur: 1.3, flourish: 'flap' }, sheep: { dur: 1.2, flourish: 'spin' },
  duck: { dur: 1.2, flourish: 'drip' }, bunny: { dur: 1.0, flourish: 'ears' }, dog: { dur: 1.1, flourish: 'none' }, chick: { dur: 1.0, flourish: 'flap' },
};
const SPLIT = 0.75, PEAK = { x: -0.6, y: 7.2 };
const bez = (a, b, c, d, t) => { const s = 1 - t; return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d; };
export function launchLocal(u, start, slot, out) {
  const ax = slot.x, ay = slot.y + 3.2, az = slot.z;
  if (u < SPLIT) {
    const t = u / SPLIT;
    out.x = bez(start.x, start.x + 0.8, PEAK.x, ax, t);
    out.y = bez(start.y, start.y + 5.5, PEAK.y, ay, t);
    out.z = bez(start.z, start.z * 0.5, 0, az, t);
  } else {
    const w = (u - SPLIT) / (1 - SPLIT);
    out.x = ax; out.z = az; out.y = ay - (ay - slot.y) * w * w;
  }
  return out;
}
const smooth = u => u * u * (3 - 2 * u);
// flip and spin make one full turn during the arc and end upright; other flourishes are drawn in animals3d.js
export const flourishAngle = (kind, u) => (kind === 'flip' || kind === 'spin') ? Math.PI * 2 * smooth(Math.min(1, u / SPLIT)) : 0;
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: slots and launch tests PASS.

- [ ] **Step 6: Commit**

```bash
git add games/tractor-pickup/src/sim/slots.js games/tractor-pickup/src/sim/launch.js games/tractor-pickup/test/slots.test.mjs games/tractor-pickup/test/launch.test.mjs
git commit -m "feat: Tractor Pickup - trailer slots, rider springs and launch path"
```

---

### Task 9: Animals and behaviors

**Files:**
- Create: `src/sim/herd.js`, `test/herd.test.mjs`

**Interfaces:**
- Consumes: `makeRng` (rng.js).
- Spec v1.2: animals live on the routes between the edges (A-9), ducks at the farmyard pond (A-5), delivered animals walk into the barn and are gone (A-16, F-10). There is no paddock.
- Produces: `TYPES` (per type: `word, speed, r, flee, come`), `MAIN_TYPES = ['pig','cow','chicken','sheep','duck','bunny','dog']`, `ROUTE_ANIMALS = 18`, `YARD_ANIMALS = 3`, `WALK_HALF = 6.5` (route animals stay within 6.5 m of the centerline), `createHerd({ rng, env, count = 18, yardCount = 3 }) -> herd`.
- `env = { bounds, roadNearest(x,z) -> { d, pt: { x, z, tx, tz } }, roadAhead(x, z, yaw, dist) -> { x, z }, routePoint(rng) -> { x, z } (a random point on a route, outside the yard), mudSpots: [{ x, z }], pond: { x, z, r } (in the yard), hideSpots: [{ x, z }], yard: { half, randomPoint(rng) -> { x, z } }, barn: { x, z } }`.
- `herd = { animals, step(dt, { tractor }), horn(tractor), callHelp(tractor) -> animal|null, free(): animal[], toBarn(list), respawn() }`.
- `animal = { id, type, golden, home: 'route'|'yard', x, y, z, yaw, state, anim, leader, line, hidden, dirt, lookT, helpT, penOrder }`. States: `idle, walk, flee, come, follow, hide, wallow, help, wave` (free), `fly, ride, show` (set by `game.js` and the show; the herd skips them), `toBarn, gone` (delivered).

- [ ] **Step 1: Write the failing tests**

`test/herd.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHerd, MAIN_TYPES } from '../src/sim/herd.js';
import { makeRng } from '../src/sim/rng.js';

// A straight east-west route along z = 0 (walkable |z| <= 6.5), a 60 m farmyard at the center with a pond and the barn.
const env = {
  bounds: 190,
  roadNearest: (x, z) => ({ d: Math.abs(z), pt: { x, z: 0, tx: 1, tz: 0 } }),
  roadAhead: (x, z, yaw, dist) => ({ x: x + Math.sin(yaw) * dist, z: 0 }),
  routePoint: r => ({ x: (r.chance(0.5) ? 1 : -1) * r.range(40, 180), z: r.range(-5, 5) }),
  mudSpots: [{ x: -150, z: 0 }, { x: -90, z: 0 }, { x: 60, z: 0 }, { x: 120, z: 0 }], pond: { x: -20, z: -20, r: 5 }, hideSpots: [{ x: 50, z: 8.5 }, { x: -50, z: -8.5 }],
  yard: { half: 30, randomPoint: r => ({ x: r.range(-25, 25), z: r.range(-25, -8) }) },
  barn: { x: 0, z: 0 },
};
const far = { x: 500, z: 500, yaw: 0, speed: 0 };
const run = (h, sec, tractor = far) => { for (let i = 0; i < sec * 60; i++) h.step(1 / 60, { tractor }); };

test('spawns route and yard animals, every main type, a hen with two chicks, at most one golden', () => {
  const h = createHerd({ rng: makeRng(1), env, count: 18, yardCount: 3 });
  assert.equal(h.animals.length, 21);
  assert.equal(h.animals.filter(a => a.home === 'yard').length, 3);
  for (const t of MAIN_TYPES) assert.ok(h.animals.some(a => a.type === t), t);
  assert.ok(h.animals.some(a => a.type === 'duck' && Math.hypot(a.x - env.pond.x, a.z - env.pond.z) < env.pond.r + 3), 'duck at the pond');
  assert.equal(h.animals.filter(a => a.type === 'chick').length, 2);
  assert.ok(h.animals.filter(a => a.golden).length <= 1);
  assert.equal(h.animals.filter(a => a.hidden).length, 2);
  for (const a of h.animals.filter(a => a.home === 'route')) { assert.ok(Math.abs(a.x) > 30 || Math.abs(a.z) > 30, 'route animal spawned in the yard'); if (!a.hidden) assert.ok(Math.abs(a.z) <= 6.5, 'route animal off the road'); }
});
test('animals stay inside the farm and mosey; yard animals stay in the yard (A-9, A-15)', () => {
  const h = createHerd({ rng: makeRng(2), env }), x0 = h.animals.map(a => [a.x, a.z]);
  run(h, 300);
  for (const a of h.animals.filter(a => a.home === 'route' && !a.hidden)) assert.ok(Math.abs(a.z) <= 6.5 + 1e-6 || (Math.abs(a.x) < 30 && Math.abs(a.z) < 30), `route animal left the road: ${a.x},${a.z}`);
  for (const a of h.animals.filter(a => a.home === 'yard')) assert.ok(Math.abs(a.x) < 30 && Math.abs(a.z) < 30, 'yard animal left the yard');
  const moved = h.animals.filter((a, i) => !a.hidden && Math.hypot(a.x - x0[i][0], a.z - x0[i][1]) > 3).length;
  assert.ok(moved >= 14, `moved ${moved}`);
});
test('flee types run off slowly from the tractor (A-10)', () => {
  const h = createHerd({ rng: makeRng(3), env }), s = h.animals.find(a => a.type === 'sheep' && !a.hidden && a.home === 'route');
  s.z = 0; let maxV = 0; const t = { x: s.x - 4, z: s.z, yaw: Math.PI / 2, speed: 5 };
  for (let i = 0; i < 120; i++) { const px = s.x, pz = s.z; h.step(1 / 60, { tractor: t }); maxV = Math.max(maxV, Math.hypot(s.x - px, s.z - pz) * 60); }
  assert.ok(s.x > t.x + 4, 'did not move away'); assert.ok(maxV < 3, `too fast ${maxV}`); // the tractor is always faster (6+ m/s)
  assert.ok(Math.abs(s.z) <= 6.5 + 1e-6, 'fled off the road');
});
test('horn: everyone looks; come types walk toward the tractor (A-11)', () => {
  const h = createHerd({ rng: makeRng(4), env }), t = { x: 40, z: 0, yaw: 0, speed: 0 };
  const cows = h.animals.filter(a => !a.hidden && (a.type === 'cow' || a.type === 'dog' || a.type === 'pig'));
  const d0 = cows.map(a => Math.hypot(a.x - t.x, a.z - t.z));
  h.horn(t); assert.ok(h.free().filter(a => !a.hidden).every(a => a.lookT > 0));
  run(h, 5, t);
  cows.forEach((a, i) => { if (d0[i] < 25 && d0[i] > 8) assert.ok(Math.hypot(a.x - t.x, a.z - t.z) < d0[i], `${a.type} did not come`); });
});
test('chicks follow their hen in a line (A-12)', () => {
  const h = createHerd({ rng: makeRng(5), env }); run(h, 60);
  const hen = h.animals.find(a => h.animals.some(c => c.leader === a.id));
  for (const c of h.animals.filter(c => c.leader === hen.id)) assert.ok(Math.hypot(c.x - hen.x, c.z - hen.z) < 3.5);
});
test('pigs find the mud and get dirty (A-14)', () => {
  const h = createHerd({ rng: makeRng(6), env }); run(h, 180);
  assert.ok(h.animals.some(a => a.type === 'pig' && a.dirt > 0.9));
});
test('help call brings the nearest free animal onto the road ahead (F-4)', () => {
  const h = createHerd({ rng: makeRng(7), env }), t = { x: 50, z: 0, yaw: Math.PI / 2, speed: 0 };
  const a = h.callHelp(t); assert.ok(a);
  for (let i = 0; i < 20 * 60 && a.state !== 'wave'; i++) h.step(1 / 60, { tractor: t });
  assert.equal(a.state, 'wave'); assert.ok(Math.hypot(a.x - 65, a.z) < 3, `at ${a.x},${a.z}`);
});
test('delivered animals walk into the barn and are gone; they are never free again (A-16, F-10)', () => {
  const h = createHerd({ rng: makeRng(8), env }), list = h.free().slice(0, 5);
  list.forEach(a => { a.state = 'show'; a.x = 14; a.z = 9; });
  h.toBarn(list); assert.ok(list.every(a => a.state === 'toBarn' && !h.free().includes(a)));
  run(h, 30);
  for (const a of list) assert.equal(a.state, 'gone');
});
test('respawn refills the route and yard counts along the routes (G-3)', () => {
  const h = createHerd({ rng: makeRng(9), env }), list = h.free().filter(a => a.home === 'route').slice(0, 6).concat(h.free().filter(a => a.home === 'yard').slice(0, 1));
  h.toBarn(list); h.respawn();
  assert.equal(h.free().filter(a => a.home === 'route').length, 18); assert.equal(h.free().filter(a => a.home === 'yard').length, 3);
  assert.ok(h.free().filter(a => a.golden).length <= 1);
  for (const a of h.free().filter(a => a.home === 'route' && !a.hidden).slice(-6)) assert.ok(Math.abs(a.x) > 30, 'respawned on a route, not in the yard');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL on the missing module.

- [ ] **Step 3: Implement herd.js**

```js
// Farm animals (spec 5): spawn, mosey, gentle run, come to the horn, chick lines, hiding, mud baths, help (F-4),
// farmyard animals (A-15), delivery into the barn (A-16) and respawning along the routes (G-3).
// Route animals stay on the road between the edges: within WALK_HALF of the centerline.
export const TYPES = {
  pig:     { word: 'Pig',     speed: 0.9, r: 0.5,  flee: false, come: true },
  cow:     { word: 'Cow',     speed: 0.6, r: 0.75, flee: false, come: true },
  chicken: { word: 'Chicken', speed: 1.1, r: 0.35, flee: true,  come: false },
  sheep:   { word: 'Sheep',   speed: 0.8, r: 0.5,  flee: true,  come: false },
  duck:    { word: 'Duck',    speed: 0.8, r: 0.35, flee: false, come: true },
  bunny:   { word: 'Bunny',   speed: 1.4, r: 0.3,  flee: true,  come: false },
  dog:     { word: 'Dog',     speed: 1.6, r: 0.45, flee: false, come: true },
  chick:   { word: 'Chick',   speed: 1.2, r: 0.2,  flee: false, come: false },
};
export const MAIN_TYPES = ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog'];
export const ROUTE_ANIMALS = 18, YARD_ANIMALS = 3, WALK_HALF = 6.5;
const FILL = ['pig', 'cow', 'sheep', 'chicken', 'duck', 'bunny', 'pig', 'cow'];
const FLEE_R = 7, FLEE_V = 2.2, HORN_R = 25, WALK = { walk: 'walk', flee: 'run', come: 'walk', follow: 'walk', help: 'run', toBarn: 'walk' };
const SKIP = new Set(['fly', 'ride', 'show', 'gone']), NOT_FREE = new Set(['fly', 'ride', 'show', 'toBarn', 'gone']);
const turn = (a, b, max) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + Math.max(-max, Math.min(max, d)); };

export function createHerd({ rng, env, count = ROUTE_ANIMALS, yardCount = YARD_ANIMALS }) {
  const animals = [], Y = env.yard.half;
  const inYard = (x, z, m = 0) => Math.abs(x) < Y + m && Math.abs(z) < Y + m;
  const spawnNearRoad = () => { // on a route, outside the yard (the edges keep everything else unreachable)
    for (let tries = 0; tries < 80; tries++) { const p = env.routePoint(rng); if (!inYard(p.x, p.z, 3)) return p; }
    return env.routePoint(rng);
  };
  const keepOnRoad = (x, z) => { // pull a point back to within WALK_HALF of the centerline
    const n = env.roadNearest(x, z); if (n.d <= WALK_HALF) return { x, z };
    const k = WALK_HALF / n.d; return { x: n.pt.x + (x - n.pt.x) * k, z: n.pt.z + (z - n.pt.z) * k };
  };
  const add = (type, at, home = 'route') => { const a = { id: animals.length, type, golden: false, home, x: at.x, y: 0, z: at.z, yaw: rng.range(0, 6.28), state: 'idle', timer: rng.range(0, 3), anim: 'idle', leader: null, line: 0, hidden: false, dirt: 0, lookT: 0, helpT: 0, tx: at.x, tz: at.z, trail: [], penOrder: 0 }; animals.push(a); return a; };
  for (const t of MAIN_TYPES) add(t, t === 'duck' ? { x: env.pond.x + rng.range(-3, 3), z: env.pond.z + env.pond.r + 1 } : spawnNearRoad(), t === 'duck' ? 'yard' : 'route');
  const hen = add('chicken', spawnNearRoad());
  for (let i = 1; i <= 2; i++) { const c = add('chick', { x: hen.x - i * 0.8, z: hen.z }); c.leader = hen.id; c.line = i; c.state = 'follow'; }
  while (animals.length < count) add(rng.pick(FILL), spawnNearRoad());
  animals.length = Math.min(animals.length, count);
  // two hide in the bushes (A-13), taken from the random fill so the first animal of each type stays in view
  rng.shuffle(animals.slice(MAIN_TYPES.length + 3).filter(a => a.type !== 'cow')).slice(0, env.hideSpots.length)
    .forEach((a, i) => { a.hidden = true; a.state = 'hide'; a.x = env.hideSpots[i].x; a.z = env.hideSpots[i].z; });
  for (let i = 0; i < yardCount; i++) add(rng.pick(['pig', 'sheep', 'duck', 'cow', 'bunny']), env.yard.randomPoint(rng), 'yard');
  if (rng.chance(0.5)) rng.pick(animals.filter(a => a.type !== 'chick' && !a.hidden)).golden = true; // A-8

  const free = () => animals.filter(a => !NOT_FREE.has(a.state));
  const pickTarget = a => {
    if (a.type === 'duck' && a.home === 'yard' && rng.chance(0.7)) { const ang = rng.range(0, 6.28); a.tx = env.pond.x + Math.cos(ang) * (env.pond.r + 1); a.tz = env.pond.z + Math.sin(ang) * (env.pond.r + 1); a.state = 'walk'; return; }
    if (a.home === 'yard') { const p = env.yard.randomPoint(rng); a.tx = p.x; a.tz = p.z; a.state = 'walk'; return; }
    if (a.type === 'pig' && rng.chance(0.35)) { const m = env.mudSpots.map(s => [s, Math.hypot(s.x - a.x, s.z - a.z)]).filter(([, d]) => d < 40).sort((p, q) => p[1] - q[1])[0];
      if (m) { a.state = 'walk'; a.wallow = true; a.tx = m[0].x + rng.range(-2, 2); a.tz = m[0].z + rng.range(-2, 2); return; } }
    const n = env.roadNearest(a.x, a.z);
    if (rng.chance(0.35)) { a.tx = 2 * n.pt.x - a.x + rng.range(-1, 1); a.tz = 2 * n.pt.z - a.z + rng.range(-1, 1); } // cross the road
    else { a.tx = a.x + n.pt.tx * rng.range(-10, 10) + rng.range(-2, 2); a.tz = a.z + n.pt.tz * rng.range(-10, 10) + rng.range(-2, 2); } // wander along it
    const q = keepOnRoad(a.tx, a.tz); a.tx = q.x; a.tz = q.z;
    if (inYard(a.tx, a.tz, 2)) { a.tx = a.x; a.tz = a.z; } // route animals keep out of the yard
    a.state = 'walk';
  };
  const moveToward = (a, tx, tz, v, dt) => {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz); if (d < 0.05) return true;
    a.yaw = turn(a.yaw, Math.atan2(dx, dz), 5 * dt); const s = Math.min(d, v * dt); a.x += Math.sin(a.yaw) * s; a.z += Math.cos(a.yaw) * s; return d < 0.4;
  };
  const clampHome = a => {
    if (a.home === 'yard') { const lim = Y - 2; a.x = Math.max(-lim, Math.min(lim, a.x)); a.z = Math.max(-lim, Math.min(lim, a.z)); return; }
    if (a.hidden || inYard(a.x, a.z)) return;
    const q = keepOnRoad(a.x, a.z); a.x = q.x; a.z = q.z;
  };

  return {
    animals, free,
    horn(t) {
      for (const a of free()) { if (a.hidden) continue; a.lookT = 1.5;
        if (TYPES[a.type].come && Math.hypot(a.x - t.x, a.z - t.z) < HORN_R && a.state !== 'help' && a.state !== 'wave') { a.state = 'come'; a.timer = 6; a.tx = t.x + Math.sin(t.yaw) * 6; a.tz = t.z + Math.cos(t.yaw) * 6; } }
    },
    callHelp(t) {
      const c = free().filter(a => !a.hidden && a.type !== 'chick' && a.home === 'route').sort((p, q) => Math.hypot(p.x - t.x, p.z - t.z) - Math.hypot(q.x - t.x, q.z - t.z))[0];
      if (!c) return null; const p = env.roadAhead(t.x, t.z, t.yaw, 15); c.state = 'help'; c.tx = p.x; c.tz = p.z; c.helpT = 30; return c;
    },
    toBarn(list) { // after the show: walk into the barn, one after the other, and are gone (A-16, F-10)
      list.forEach((a, i) => Object.assign(a, { state: 'toBarn', leader: null, hidden: false, y: 0, timer: i * 0.4, tx: env.barn.x, tz: env.barn.z }));
    },
    respawn() { // G-3: new animals appear on the routes, away from the yard, to replace delivered ones
      const nRoute = count - free().filter(a => a.home === 'route').length, nYard = yardCount - free().filter(a => a.home === 'yard').length;
      const goldenFree = () => free().some(a => a.golden);
      for (let i = 0; i < nRoute; i++) { const a = add(rng.pick(FILL), spawnNearRoad()); if (!goldenFree() && rng.chance(0.3)) a.golden = true; }
      for (let i = 0; i < nYard; i++) add(rng.pick(['pig', 'sheep', 'duck', 'cow', 'bunny']), env.yard.randomPoint(rng), 'yard');
      // refill empty hiding bushes with the newest route animals
      env.hideSpots.forEach(h => { if (free().some(a => a.hidden && Math.hypot(a.x - h.x, a.z - h.z) < 1)) return;
        const a = animals.filter(b => b.home === 'route' && !NOT_FREE.has(b.state) && !b.hidden && b.type !== 'cow' && b.type !== 'chick').at(-1); if (a) { a.hidden = true; a.state = 'hide'; a.x = h.x; a.z = h.z; } });
    },
    step(dt, { tractor: t }) {
      for (const a of animals) {
        if (SKIP.has(a.state)) continue;
        const def = TYPES[a.type], dT = Math.hypot(a.x - t.x, a.z - t.z);
        if (a.lookT > 0) { a.lookT -= dt; a.yaw = turn(a.yaw, Math.atan2(t.x - a.x, t.z - a.z), 6 * dt); }
        if (!NOT_FREE.has(a.state) && def.flee && !a.hidden && a.state !== 'flee' && a.state !== 'help' && a.state !== 'wave' && dT < FLEE_R && t.speed > 0.5) { a.state = 'flee'; a.timer = 2; }
        switch (a.state) {
          case 'idle': a.anim = a.anim === 'eat' || rng.chance(0.002) ? 'eat' : 'idle'; if ((a.timer -= dt) <= 0) pickTarget(a); break;
          case 'walk': if (moveToward(a, a.tx, a.tz, def.speed, dt)) { if (a.wallow) { a.state = 'wallow'; a.timer = rng.range(6, 10); a.wallow = false; } else { a.state = 'idle'; a.timer = rng.range(2, 5); } } break;
          case 'wallow': a.dirt = Math.min(1, a.dirt + dt * 0.5); a.anim = 'eat'; if ((a.timer -= dt) <= 0) { a.state = 'idle'; a.timer = 1; } break;
          case 'flee': { const n = env.roadNearest(a.x, a.z), away = Math.atan2(a.x - t.x, a.z - t.z), along = Math.atan2(n.pt.tx, n.pt.tz);
            // run away along the road (not into the edge): pick the road direction that points away from the tractor
            const ang = a.home === 'route' && !inYard(a.x, a.z) ? (Math.cos(away - along) >= 0 ? along : along + Math.PI) : away; a.yaw = turn(a.yaw, ang, 8 * dt);
            a.x += Math.sin(a.yaw) * FLEE_V * dt; a.z += Math.cos(a.yaw) * FLEE_V * dt;
            if ((a.timer -= dt) <= 0) { a.state = 'idle'; a.timer = 1.5; a.lookT = 1.5; } break; }
          case 'come': if (moveToward(a, a.tx, a.tz, def.speed * 1.6, dt) || (a.timer -= dt) <= 0) { a.state = 'idle'; a.timer = 3; } break;
          case 'follow': { const L = animals[a.leader]; if (!L || NOT_FREE.has(L.state)) { a.state = 'idle'; a.leader = null; break; }
            const p = L.trail[Math.min(L.trail.length - 1, a.line * 3)] || L; moveToward(a, p.x, p.z, def.speed * 1.8, dt); break; }
          case 'help': if (moveToward(a, a.tx, a.tz, Math.max(def.speed * 2, 2.5), dt)) { a.state = 'wave'; a.timer = 10; } break;
          case 'wave': a.anim = 'dance'; a.yaw = turn(a.yaw, Math.atan2(t.x - a.x, t.z - a.z), 4 * dt); if ((a.timer -= dt) <= 0) { a.state = 'idle'; a.timer = 2; } break;
          case 'hide': a.anim = 'idle'; break;
          case 'toBarn': if ((a.timer -= dt) > 0) { a.anim = 'idle'; break; } if (moveToward(a, a.tx, a.tz, 2.2, dt)) a.state = 'gone'; break;
        }
        if (['walk', 'flee', 'come', 'follow', 'help'].includes(a.state) || (a.state === 'toBarn' && a.timer <= 0)) a.anim = WALK[a.state] || 'walk';
        if (!NOT_FREE.has(a.state)) clampHome(a);
        const last = a.trail[0]; if (!last || Math.hypot(last.x - a.x, last.z - a.z) > 0.25) { a.trail.unshift({ x: a.x, z: a.z }); if (a.trail.length > 12) a.trail.pop(); }
      }
      // separation (free animals only; not the ones in flight, riding, on stage, walking into the barn or gone)
      const live = animals.filter(a => !NOT_FREE.has(a.state) && !a.hidden);
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const p = live[i], q = live[j], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), m = TYPES[p.type].r + TYPES[q.type].r;
        if (d > 0 && d < m) { const k = (m - d) / d / 2; p.x -= dx * k; p.z -= dz * k; q.x += dx * k; q.z += dz * k; }
      }
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: herd tests PASS. Every point of the test route has a mud spot within 40 m, so every route pig can find one.

- [ ] **Step 5: Commit**

```bash
git add games/tractor-pickup/src/sim/herd.js games/tractor-pickup/test/herd.test.mjs
git commit -m "feat: Tractor Pickup - farm animals, farmyard animals and delivery into the barn"
```

---

### Task 10: Game composition, boop, launch, animals render, HUD and names (Playtest 3)

**Files:**
- Create: `src/sim/game.js`, `src/render/animals3d.js`, `src/ui/hud.js`, `src/ui/icons.js`, `test/game.test.mjs`
- Modify: `src/main.js` (use `createGame`), `template.html` (HUD CSS)

**Interfaces:**
- Consumes: every sim module so far.
- Produces (game.js): `CAPACITY = 12`, `CATCH = { x0: 1.6, x1: 4.0, half: 1.6 }`, `createGame(RAPIER, { seed, power }) -> game` with `farm, road, items, phys, yardProps, tractor, train, herd, load, flights, mode ('drive'|'show'), step(input) -> events[]`, `startShow() -> riders [{ animal, slot }]`, `finishShow(riders)`, `slotWorld(slot, out)`, `tractorLocal(x,y,z,out)`, `tractorWorld(l,out)`.
- Events: `{ type: 'boop', animal }`, `{ type: 'launch', animal }`, `{ type: 'land', animal, slot, n }` (`n` = landed count), `{ type: 'horn' }`, `{ type: 'barnPass' }` (only with at least one rider, after any flight has landed).
- `flight = { animal, slot, u, dur, start: {x,y,z} (tractor local), pos: {x,y,z} (world) }`.
- `animal.ride = { slot, rider }` while riding.
- Produces (animals3d.js): `createAnimals3D(scene, herd) -> { update(dt, game), setHats(make) }`. It adds views for animals the herd spawns later and hides `gone` ones.
- Produces (hud.js): `createHud(root, { icons, onWordTap }) -> { fill(n, type, golden), showWord(text), arrowTo(screenXY|null), reset() }` (12 slots: 6 + a gap + 6).
- Produces (icons.js): `renderIcons(renderer) -> { [type]: dataURL, golden: { [type]: dataURL } }`.

- [ ] **Step 1: Write the failing game test**

`test/game.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createGame, CAPACITY } from '../src/sim/game.js';
await RAPIER.init();

const STILL = { thr: 0, steer: 0, horn: false };
// Farmyard animals wander near the start; send them away so only the animals a test places get booped.
const quiet = g => g.herd.animals.filter(a => a.home === 'yard').forEach(a => { a.state = 'gone'; });
// Single animals only: no chicks and no hen leading a chick line (a boop on those launches the whole line).
const pickable = g => g.herd.free().filter(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id));
const unhide = g => g.herd.animals.forEach(a => { if (a.hidden) { a.hidden = false; a.state = 'idle'; } });
const place = (g, a) => { const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; for (let i = 0; i < 90; i++) g.step(STILL); };

test('an animal in the catch zone is booped, flies, and lands in slot 0', () => {
  const g = createGame(RAPIER, { seed: 11, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const ev = []; for (let i = 0; i < 120; i++) ev.push(...g.step(STILL));
  assert.ok(ev.some(e => e.type === 'boop' && e.animal === a));
  const land = ev.find(e => e.type === 'land'); assert.ok(land); assert.equal(land.slot.car, 0); assert.equal(land.n, 1);
  assert.equal(a.state, 'ride');
});
test('riders stay in their slot through a full-speed drive (R-4)', () => {
  const g = createGame(RAPIER, { seed: 12, power: 'high' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  for (const a of pickable(g).slice(0, 8)) place(g, a);
  assert.equal(g.load.landed(), 8);
  const w = {}; for (let i = 0; i < 60 * 15; i++) { g.step({ thr: 1, steer: Math.sin(i / 50), horn: false });
    for (const s of g.load.slots) { g.slotWorld(s, w); const pa = s.animal; assert.equal(pa.state, 'ride'); assert.ok(Math.hypot(pa.x - w.x, pa.z - w.z) < 0.6, 'animal left its slot'); } }
});
test('the trailer and wagon never over-fill (G-1)', () => {
  const g = createGame(RAPIER, { seed: 13, power: 'medium' }); quiet(g); unhide(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const list = pickable(g); assert.ok(list.length >= 14, `only ${list.length} single animals`);
  for (const a of list.slice(0, 14)) place(g, a);
  assert.equal(g.load.landed(), CAPACITY); assert.equal(g.load.slots.length, CAPACITY);
  assert.deepEqual([0, 1].map(c => g.load.slots.filter(s => s.car === c).length), [6, 6]);
});
test('show hooks: riders in order, props reset, delivery into the barn, respawn and an empty trailer (F-5, F-10, G-3)', () => {
  const g = createGame(RAPIER, { seed: 14, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const placed = pickable(g).slice(0, 3); for (const a of placed) place(g, a);
  const prop = g.yardProps.props.find(p => p.body); prop.body.setTranslation({ x: prop.start.x + 5, y: prop.start.y, z: prop.start.z }, true);
  const riders = g.startShow();
  assert.equal(g.mode, 'show'); assert.deepEqual(riders.map(r => r.animal), placed);
  assert.ok(Math.abs(prop.body.translation().x - prop.start.x) < 1e-3);
  riders.forEach(r => { r.animal.state = 'show'; });
  g.finishShow(riders);
  assert.equal(g.mode, 'drive'); assert.equal(g.load.landed(), 0);
  for (const a of placed) assert.equal(a.state, 'toBarn');
  assert.equal(g.herd.free().filter(a => a.home === 'route').length, 18);
});
test('no boops and no driving during the show', () => {
  const g = createGame(RAPIER, { seed: 15, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  g.startShow(); const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  let booped = false; for (let i = 0; i < 120; i++) booped ||= g.step({ thr: 1, steer: 0, horn: false }).some(e => e.type === 'boop');
  assert.equal(booped, false); assert.ok(g.tractor.speed < 0.5);
});
```

The barn-pass detection itself is tested in `test/road.test.mjs` (Task 7). Driving the full train through the barn is checked in the browser playtest.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL on the missing module.

- [ ] **Step 3: Implement game.js**

```js
// The whole simulation: farm + physics + tractor + train + herd + boops + flights + riders + barn pass + show hooks.
import { createPhysics, DT } from './physics.js';
import { createTractor, quatAxes } from './tractor.js';
import { createTrain, local2world, TR } from './hitch.js';
import { generateFarm, YARD_HALF, yardFree } from './track.js';
import { buildRoad, FARM_HALF, makeBarnPass } from './road.js';
import { scatterScenery, addFarmColliders, addYardProps } from './scenery.js';
import { createHerd, TYPES } from './herd.js';
import { createLoad, slotLocal, newRider, stepRider } from './slots.js';
import { launchLocal, FLIGHT } from './launch.js';
import { makeRng } from './rng.js';

export const CAPACITY = 12;                            // G-1: 6 in the trailer + 6 in the wagon
export const CATCH = { x0: 1.6, x1: 4.0, half: 1.6 }; // B-1: box in front of the nose, 1.5 x tractor width
const AIM = { range: 6, cone: 30 * Math.PI / 180, gain: 1.2, max: 0.35 }; // B-3
const STILL = { thr: 0, steer: 0, horn: false };

export function createGame(RAPIER, { seed, power = 'medium' }) {
  const farm = generateFarm(seed), road = buildRoad(farm), rng = makeRng(seed ^ 0x51ed);
  const items = scatterScenery(farm, road, makeRng(seed ^ 0x9e3779b9));
  const phys = createPhysics(RAPIER); addFarmColliders(phys, farm, road); // includes the route edges (Task 7b)
  const yardProps = addYardProps(phys, farm), s = farm.start;
  const tractor = createTractor(phys, { x: s.x, z: s.z, yaw: s.yaw, power, surfaceAt: road.surfaceAt });
  const train = createTrain(phys, tractor), flights = [], barnPass = makeBarnPass(farm.yard.barn);
  const mudSpots = farm.routes.flatMap((R, r) => R.tiles.flatMap((t, k) => t.type === 'mud' ? [road.featureCenter(r, k)] : []));
  const env = {
    bounds: FARM_HALF - 3, mudSpots, pond: farm.pond, hideSpots: farm.hideSpots, barn: farm.yard.barn,
    roadNearest: (x, z) => road.nearest(x, z),
    roadAhead: (x, z, yaw, dist) => { const n = road.nearest(x, z), f = n.pt.tx * Math.sin(yaw) + n.pt.tz * Math.cos(yaw); return road.ahead(n.pt, f >= 0 ? dist : -dist); },
    yard: { half: YARD_HALF, randomPoint: r => { for (let i = 0; i < 60; i++) { const x = r.range(-YARD_HALF, YARD_HALF), z = r.range(-YARD_HALF, YARD_HALF); if (yardFree(farm.yard, x, z, 0.6)) return { x, z }; } return { x: YARD_HALF - 4, z: YARD_HALF - 4 }; } },
    routePoint: r => { const R = r.pick(road.routes), p = r.pick(R.pts.slice(10, -10)), off = r.range(-5, 5); return { x: p.x - p.tz * off, z: p.z + p.tx * off }; }, // on the road, away from the yard ends
  };
  const herd = createHerd({ rng, env });
  const tractorWorld = (l, out) => Object.assign(out, local2world(tractor.body, l));
  const tractorLocal = (x, y, z, out) => { const p = tractor.body.translation(), { f, u, r } = quatAxes(tractor.body.rotation()), dx = x - p.x, dy = y - p.y, dz = z - p.z;
    out.x = dx * f.x + dy * f.y + dz * f.z; out.y = dx * u.x + dy * u.y + dz * u.z; out.z = dx * r.x + dy * r.y + dz * r.z; return out; };
  const slotWorld = (sl, out) => { const c = train.cars[sl.car], l = slotLocal(sl.k), rd = sl.animal.ride?.rider; return Object.assign(out, local2world(c.body, { x: l.x + (rd?.ox || 0), y: l.y + TR.half.y + (rd?.oy || 0), z: l.z + (rd?.oz || 0) })); };
  const prevVel = train.cars.map(c => ({ ...c.body.linvel() }));
  const tmp = {}, tmp2 = {};
  let pendingPass = false;

  const game = {
    farm, road, items, phys, yardProps, tractor, train, herd, flights, rng, tractorWorld, tractorLocal, slotWorld,
    load: createLoad(CAPACITY), mode: 'drive',
    // F-5: the show takes over. Riders in landing order; obstacles go back to their places (T-32).
    startShow() { game.mode = 'show'; yardProps.reset(); return game.load.slots.filter(sl => sl.landed).map(sl => ({ animal: sl.animal, slot: sl })); },
    // F-10, A-16, G-3: delivered animals walk into the barn and are gone, new ones appear on the routes, the trailer and wagon are empty again.
    finishShow(riders) {
      for (const r of riders) r.animal.ride = null;
      herd.toBarn(riders.map(r => r.animal)); herd.respawn();
      game.load = createLoad(CAPACITY); game.mode = 'drive';
    },
    step(input) {
      const events = [], drive = game.mode === 'drive' ? input : STILL, load = game.load;
      if (drive.horn) { herd.horn(tractor); events.push({ type: 'horn' }); }
      // B-3 aim help: nudge steering toward a close animal ahead
      let assist = 0, best = AIM.range;
      if (game.mode === 'drive') for (const a of herd.free()) { const l = tractorLocal(a.x, 0, a.z, tmp), d = Math.hypot(l.x, l.z);
        if (l.x > 0 && d < best && Math.abs(Math.atan2(l.z, l.x)) < AIM.cone) { best = d; assist = Math.max(-AIM.max, Math.min(AIM.max, -Math.atan2(l.z, l.x) * AIM.gain)); } }
      tractor.setAssist(tractor.fwd > 0.5 ? assist : 0);
      tractor.setInput(drive.thr, drive.steer); tractor.step(DT);
      train.step(DT, { parked: Math.abs(drive.thr) < 0.05 && tractor.speed < 0.3 });
      phys.world.step();
      herd.step(DT, { tractor });
      // boops (B-1, B-2: any speed) and the dog that jumps in by itself (A-7)
      if (game.mode === 'drive' && !load.full()) for (const a of herd.free()) {
        const l = tractorLocal(a.x, 0, a.z, tmp), r = TYPES[a.type].r;
        const inZone = l.x > CATCH.x0 - r && l.x < CATCH.x1 + r && Math.abs(l.z) < CATCH.half + r;
        const dogJump = a.type === 'dog' && !a.hidden && Math.hypot(l.x, l.z) < 4;
        if (inZone || dogJump) boop(a, events);
        if (load.full()) break;
      }
      // flights
      for (let i = flights.length - 1; i >= 0; i--) {
        const fl = flights[i]; fl.u += DT / fl.dur; if (fl.u < 0) continue;
        const sw = slotWorld(fl.slot, tmp2), sl = tractorLocal(sw.x, sw.y, sw.z, {});
        const lp = launchLocal(Math.min(1, fl.u), fl.start, sl, {}); tractorWorld(lp, fl.pos);
        fl.animal.x = fl.pos.x; fl.animal.z = fl.pos.z; fl.animal.y = fl.pos.y;
        if (fl.u >= 1) { flights.splice(i, 1); const a = fl.animal; a.state = 'ride'; a.ride = { slot: fl.slot, rider: newRider() }; fl.load.land(fl.slot); events.push({ type: 'land', animal: a, slot: fl.slot, n: fl.load.landed() }); }
      }
      // riders: spring against the car's acceleration in its own frame (D-12)
      train.cars.forEach((c, k) => {
        const v = c.body.linvel(), aw = { x: (v.x - prevVel[k].x) / DT, y: (v.y - prevVel[k].y) / DT, z: (v.z - prevVel[k].z) / DT }; prevVel[k] = { ...v };
        const { f, u, r } = quatAxes(c.body.rotation()), al = { x: aw.x * f.x + aw.y * f.y + aw.z * f.z, y: aw.x * u.x + aw.y * u.y + aw.z * u.z, z: aw.x * r.x + aw.y * r.y + aw.z * r.z };
        for (const s2 of game.load.slots) if (s2.car === k && s2.landed && s2.animal.state === 'ride') { stepRider(s2.animal.ride.rider, al, DT); const w = slotWorld(s2, tmp2); s2.animal.x = w.x; s2.animal.y = w.y; s2.animal.z = w.z; }
      });
      // F-1: a pass through the barn with at least one rider starts the show (after any flight has landed)
      if (game.mode === 'drive' && barnPass(tractor.x, tractor.z)) pendingPass = true;
      if (pendingPass && flights.length === 0) { pendingPass = false; if (game.load.landed() > 0) events.push({ type: 'barnPass' }); }
      return events;
    },
  };
  function launch(a, events, delay = 0) {
    const sl = game.load.reserve(a); if (!sl) return false;
    a.state = 'fly'; a.hidden = false;
    flights.push({ animal: a, slot: sl, load: game.load, u: -delay, dur: FLIGHT[a.type].dur, start: tractorLocal(a.x, 0, a.z, {}), pos: { x: a.x, y: 0, z: a.z } });
    events.push({ type: 'launch', animal: a }); return true;
  }
  function boop(a, events) {
    events.push({ type: 'boop', animal: a });
    // A-12: booping any member of a hen-and-chicks line launches the whole line, one after the other
    const leaderId = a.leader ?? a.id, line = herd.animals.filter(x => (x.id === leaderId || x.leader === leaderId) && herd.free().includes(x)).sort((p, q) => p.line - q.line);
    line.forEach((x, i) => launch(x, events, i * 0.25));
  }
  return game;
}
```

Hidden animals: the bush sits at the hide spot and the hider's `x,z` equals the bush position, so the normal catch zone finds it when the tractor drives into the bush (A-13). Keep `a.hidden` until it launches.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: game tests PASS. If the "left its slot" test fails, check that `slotWorld` adds the rider offset in car-local axes. `RIDER.max` (0.45) is below the 0.6 tolerance.

- [ ] **Step 5: animals3d.js**

```js
// Cube Pets with baked animations. Each animal = a Group of per-part meshes; the anim tables drive part matrices.
import * as THREE from 'three';
import { ASSETS, geoFrom, PET_ANIMS, sampleAnim } from './gfx.js';
import { FLIGHT, flourishAngle } from '../sim/launch.js';
import { TYPES } from '../sim/herd.js';
const MODEL = { pig: 'pig', cow: 'cow', chicken: 'chick', sheep: 'sheep', duck: 'duck', bunny: 'bunny', dog: 'dog', chick: 'chick' };
const SCALE = { pig: 1.0, cow: 1.3, chicken: 0.95, sheep: 1.0, duck: 0.9, bunny: 0.8, dog: 0.95, chick: 0.55 };
const STRETCH = { duck: [1.15, 0.85, 1.15] };
// chicken = copper-brown recolor of the chick (Pig Pens "whiten" recipe with a brown target)
const copper = p => { const col = p.col.slice(); for (let i = 0; i < col.length; i += 3) if (col[i] >= 230 && col[i + 1] >= 140) { const s = col[i + 1] / 230; col[i] = 196 * s; col[i + 1] = 110 * s; col[i + 2] = 58 * s; } return { ...p, col }; };

export function createAnimals3D(scene, herd) {
  const base = new THREE.MeshLambertMaterial({ vertexColors: true });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' });
  const geos = {}; for (const [type, m] of Object.entries(MODEL)) geos[type] = ASSETS[m].parts.map(p => geoFrom([type === 'chicken' ? copper(p) : p]));
  const tmpM = new THREE.Matrix4();
  const makeView = a => {
    const g = new THREE.Group(), s = SCALE[a.type], st = STRETCH[a.type] || [1, 1, 1];
    const inner = new THREE.Group(); inner.scale.set(s * st[0], s * st[1], s * st[2]); g.add(inner);
    const parts = geos[a.type].map(geo => { const m = new THREE.Mesh(geo, a.golden ? gold : base); m.matrixAutoUpdate = false; m.castShadow = true; inner.add(m); return m; });
    const hat = new THREE.Group(); inner.add(hat); scene.add(g);
    return { a, g, inner, parts, hat, t: Math.random() * 3 };
  };
  const views = herd.animals.map(makeView);
  return {
    views,
    setHats(make) { for (const v of views) { v.hat.clear(); const h = make(v.a); if (h) { h.position.y = 0.95; v.hat.add(h); } } },
    update(dt, game) {
      const flightOf = new Map(game.flights.map(f => [f.animal, f]));
      while (views.length < herd.animals.length) views.push(makeView(herd.animals[views.length])); // respawned animals (G-3)
      for (const v of views) {
        const a = v.a; v.t += dt;
        v.g.visible = a.state !== 'gone'; if (!v.g.visible) continue;
        v.g.position.set(a.x, a.y || 0, a.z); v.g.rotation.set(0, a.yaw, 0);
        if (a.state === 'ride') { // face forward with the car
          const c = game.train.cars[a.ride.slot.car].body.rotation(); v.g.quaternion.set(c.x, c.y, c.z, c.w).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
        }
        const fl = flightOf.get(a), kind = FLIGHT[a.type].flourish, ang = fl ? flourishAngle(kind, Math.max(0, fl.u)) : 0;
        v.inner.rotation.set(kind === 'flip' ? ang : 0, kind === 'spin' ? ang : 0, 0);
        if (a.hidden && a.state === 'hide') v.g.position.y = -0.25; // sits inside the bush; the tail pokes out (A-13)
        const anim = fl ? 'run' : a.state === 'ride' ? (game.tractor.speed > game.tractor.P.vmax * 0.8 && PET_ANIMS[MODEL[a.type]].dance ? 'dance' : 'idle') : a.anim;
        const table = PET_ANIMS[MODEL[a.type]], name = table[anim] ? anim : 'idle';
        v.parts.forEach((m, i) => { sampleAnim(table, name, v.t, i, m.matrix); m.matrixWorldNeedsUpdate = true; });
      }
    },
  };
}
```

- [ ] **Step 6: icons.js and hud.js**

```js
// src/ui/icons.js: render one portrait per animal type to a data URL for the slot bar and the sticker card.
import * as THREE from 'three';
import { ASSETS, geoFrom } from '../render/gfx.js';
export function renderIcons(renderer) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(1.6, 1.4, 2.6); cam.lookAt(0, 0.45, 0);
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9a27c', 2.2)); const d = new THREE.DirectionalLight('#ffffff', 1.5); d.position.set(2, 4, 3); scene.add(d);
  const rt = new THREE.WebGLRenderTarget(128, 128), px = new Uint8Array(128 * 128 * 4), cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const out = { golden: {} }, mat = new THREE.MeshLambertMaterial({ vertexColors: true }), gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' });
  const MODEL = { pig: 'pig', cow: 'cow', chicken: 'chick', sheep: 'sheep', duck: 'duck', bunny: 'bunny', dog: 'dog', chick: 'chick' };
  for (const [type, model] of Object.entries(MODEL)) for (const golden of [false, true]) {
    const g = new THREE.Group(); ASSETS[model].parts.forEach(p => g.add(new THREE.Mesh(geoFrom([p]), golden ? gold : mat))); g.rotation.y = -0.5; scene.add(g);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, 128, 128, px); renderer.setRenderTarget(null);
    const img = cv.getContext('2d').createImageData(128, 128); for (let y = 0; y < 128; y++) img.data.set(px.subarray((127 - y) * 512, (128 - y) * 512), y * 512);
    cv.getContext('2d').putImageData(img, 0, 0); (golden ? out.golden : out)[type] = cv.toDataURL(); scene.remove(g);
  }
  return out;
}
```

(The chicken icon uses the plain chick colors; this is acceptable for a 128 px portrait. To match exactly, export `copper` from `animals3d.js` and apply it here.)

```js
// src/ui/hud.js: slot bar (U-1), the big animal name (W-5, W-6), the edge arrow (F-1, F-4).
import { TYPES } from '../sim/herd.js';
export function createHud(root, { icons, onWordTap }) {
  const bar = document.createElement('div'); bar.id = 'slots'; root.appendChild(bar);
  const word = document.createElement('div'); word.id = 'word'; root.appendChild(word);
  const arrow = document.createElement('div'); arrow.id = 'arrow'; arrow.textContent = '➜'; arrow.hidden = true; root.appendChild(arrow);
  let slots = [], wordTimer = 0;
  const reset = () => { bar.innerHTML = ''; slots = Array.from({ length: 12 }, (_, i) => { const s = document.createElement('div'); s.className = i === 6 ? 'slot wagon' : 'slot'; bar.appendChild(s); return s; }); };
  reset();
  const showWord = text => {
    word.innerHTML = ''; [...text].forEach((ch, i) => { const sp = document.createElement('span'); sp.textContent = ch === ' ' ? ' ' : ch; sp.style.animationDelay = `${i * 0.09}s`; word.appendChild(sp); });
    word.classList.remove('on'); void word.offsetWidth; word.classList.add('on'); clearTimeout(wordTimer);
    wordTimer = setTimeout(() => word.classList.remove('on'), 2500);
  };
  word.addEventListener('pointerdown', e => { e.stopPropagation(); onWordTap?.(word.textContent); }); // W-6
  return {
    reset, showWord,
    fill(n, type, golden) {
      const s = slots[n - 1]; if (!s) return;
      s.innerHTML = `<img alt="" src="${golden ? icons.golden[type] : icons[type]}"><span>${TYPES[type].word}</span>`;
      s.classList.add('full');
    },
    arrowTo(p) { if (!p) { arrow.hidden = true; return; } arrow.hidden = false; arrow.style.left = p.x + 'px'; arrow.style.top = p.y + 'px'; arrow.style.transform = `translate(-50%,-50%) rotate(${p.angle}rad)`; },
  };
}
```

Add to `template.html`:

```css
#slots{position:absolute;top:calc(env(safe-area-inset-top,0px) + 10px);left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:5;pointer-events:none}
.slot{width:54px;height:70px;border-radius:14px;background:rgba(255,255,255,.45);border:3px dashed rgba(107,68,40,.55);display:flex;flex-direction:column;align-items:center;justify-content:center}
.slot.full{background:rgba(255,252,248,.92);border:3px solid #6b4428;animation:pop .35s ease-out}
.slot.wagon{margin-left:18px}
.slot img{width:50px;height:50px}.slot span{font:700 13px Andika,system-ui;color:#5a3820;line-height:1}
#word{position:absolute;top:110px;left:50%;transform:translateX(-50%);font:700 96px/1 Andika,system-ui;color:#fff;-webkit-text-stroke:4px #6b4428;paint-order:stroke;z-index:6;opacity:0;pointer-events:none}
#word.on{opacity:1;pointer-events:auto}
#word span{display:inline-block;transform:scale(0);animation:pop .3s ease-out forwards}
#arrow{position:absolute;z-index:6;font-size:64px;color:#f5c84c;-webkit-text-stroke:3px #6b4428;pointer-events:none}
@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.25)}100%{transform:scale(1)}}
```

Because `#word span` animates, `#word.on` restarts each span via the reflow in `showWord`.

- [ ] **Step 7: Wire main.js**

Replace `createFarmDrive` with `createGame(RAPIER, { seed, power })`. Add the animals view, icons, HUD, the horn and the camera shake:

```js
const game = createGame(RAPIER, { seed, power });
const animals3d = createAnimals3D(scene, game.herd);
const icons = renderIcons(renderer), hud = createHud(document.getElementById('ui'), { icons });
let hornQueued = false; input.onHorn(() => { hornQueued = true; });
let slowT = 0; // B-7: 50% speed for 0.3 s at the top of the first arc
// in the fixed-step loop:
const scale = slowT > 0 ? 0.5 : 1; acc += dt * scale; slowT -= dt;
while (acc >= DT) {
  prev = curr; const ev = game.step({ ...inp, horn: hornQueued }); hornQueued = false; curr = bodies().map(snapOf); acc -= DT;
  for (const e of ev) {
    if (e.type === 'boop') { chase.shake(0.35); fx?.stars(e.animal.x, 1, e.animal.z); }
    if (e.type === 'launch' && game.flights.length === 1) setTimeout(() => { slowT = 0.3; }, 450);
    if (e.type === 'land') { hud.fill(e.n, e.animal.type, e.animal.golden); hud.showWord((e.animal.golden ? 'Golden ' : '') + TYPES[e.animal.type].word); }
  }
}
animals3d.update(dt, game);
```

`fx` arrives in Task 13; keep the optional call. Sounds and voice arrive in Task 12.

- [ ] **Step 8: Verify and commit, then PLAYTEST 3**

Run: `npm test && npm run build`. Drive into animals on `?seed=1`. Take Playwright screenshots of a pig in mid-flight and of the HUD with the word "Pig" showing.
Expected: route animals wander and cross the road, and three animals wander the farmyard. Sheep, chickens and bunnies trot away. A boop sends the animal over the cab into the next slot. The slot fills with its picture and name, and the big word pops in letter by letter. The horn makes everyone look and brings cows, pigs, ducks and the dog over.

```bash
git add games/tractor-pickup/src games/tractor-pickup/test/game.test.mjs games/tractor-pickup/template.html site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup - boop, launch, riding animals and slot bar"
```

Stop and ask the user to playtest the core loop.

---

### Task 11: Trip flow, barn show, sparkle path and help arrow

**Files:**
- Create: `src/sim/trip.js`, `src/sim/showSteps.js`, `src/sim/words.js`, `src/ui/show.js`, `test/trip.test.mjs`, `test/showSteps.test.mjs`
- Modify: `src/main.js`, `template.html` (show overlay CSS)

**Interfaces:**
- Produces (trip.js): `createTrip() -> trip` (`state: 'intro'|'drive'|'show'|'reward'`), `stepTrip(trip, input) -> cues[]` with `input = { dt, landed, booped, barnPass, showDone, rewardDone }` and cues from `'say-intro'`, `'drive'`, `'full'`, `'help'`, `'show'`, `'reward'`.
- Produces (showSteps.js): `buildShowSteps(animals) -> steps` (`animals = [{ type, golden }]` in landing order). Step kinds: `{ kind: 'intro', say }`, `{ kind: 'hop', index, n, word, say }`, `{ kind: 'all', n, groups: [{ type, n, word }], say }`.
- Produces (words.js): `NUMBER_WORDS` (`'zero'`..`'twelve'`), `ANIMAL_WORDS`, `PHRASES`, `WORDS`, `textOf(id)`.
- Produces (show.js): `createShow({ root, camera, game, voice, sound, fx }) -> { active, update(dt), play(riders, steps) -> Promise<void>, end() }`. While `active`, main.js skips the chase camera.
- Consumes: `game.startShow()`, `game.finishShow(riders)`, the `barnPass` event (Task 10); `farm.yard.stage/barn/side` (Task 6).

- [ ] **Step 1: Write the failing tests**

`test/trip.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrip, stepTrip } from '../src/sim/trip.js';
const tick = (r, o = {}) => stepTrip(r, { dt: 1 / 60, landed: 0, booped: false, barnPass: false, showDone: false, rewardDone: false, ...o });
const toDrive = r => { for (let i = 0; i < 180; i++) tick(r); };

test('intro says "Let\'s find animals!", then driving starts after 3 s', () => {
  const r = createTrip(); assert.deepEqual(tick(r), ['say-intro']);
  for (let i = 0; i < 178; i++) tick(r); assert.equal(r.state, 'intro'); assert.deepEqual(tick(r), ['drive']); assert.equal(r.state, 'drive');
});
test('"full" fires once when all 12 slots are full (F-2)', () => {
  const r = createTrip(); toDrive(r);
  assert.deepEqual(tick(r, { landed: 11 }), []); assert.deepEqual(tick(r, { landed: 12 }), ['full']); assert.deepEqual(tick(r, { landed: 12 }), []);
});
test('a barn pass starts the show; show -> reward -> drive (F-1, F-3, F-9)', () => {
  const r = createTrip(); toDrive(r);
  assert.deepEqual(tick(r, { landed: 3, barnPass: true }), ['show']); assert.equal(r.state, 'show');
  assert.deepEqual(tick(r, { showDone: true }), ['reward']); assert.equal(r.state, 'reward');
  assert.deepEqual(tick(r, { rewardDone: true }), ['drive']); assert.equal(r.state, 'drive');
  assert.deepEqual(tick(r, { landed: 12 }), ['full'], '"full" can fire again on the next trip');
});
test('help fires after 20 s without a boop, then every 20 s; a boop resets it; none while full (F-4)', () => {
  const r = createTrip(); toDrive(r);
  let helps = 0; for (let i = 0; i < 60 * 41; i++) helps += tick(r).filter(c => c === 'help').length; assert.equal(helps, 2);
  for (let i = 0; i < 60 * 15; i++) tick(r); tick(r, { booped: true }); helps = 0;
  for (let i = 0; i < 60 * 19; i++) helps += tick(r).filter(c => c === 'help').length; assert.equal(helps, 0);
  helps = 0; for (let i = 0; i < 60 * 30; i++) helps += tick(r, { landed: 12 }).filter(c => c === 'help').length; assert.equal(helps, 0);
});
```

`test/showSteps.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShowSteps } from '../src/sim/showSteps.js';

test('show steps: intro, one hop per animal with number + name, then all together with groups', () => {
  const s = buildShowSteps([{ type: 'pig' }, { type: 'cow' }, { type: 'pig', golden: true }, { type: 'chick' }]);
  assert.equal(s[0].kind, 'intro'); assert.deepEqual(s[0].say, ['lets-count']);
  const hops = s.filter(x => x.kind === 'hop');
  assert.deepEqual(hops.map(x => [x.n, x.word]), [[1, 'Pig'], [2, 'Cow'], [3, 'Golden Pig'], [4, 'Chick']]);
  assert.deepEqual(hops.map(x => x.say), [['one', 'pig'], ['two', 'cow'], ['three', 'golden', 'pig'], ['four', 'chick']]);
  const all = s.at(-1); assert.equal(all.kind, 'all'); assert.equal(all.n, 4);
  assert.deepEqual(all.groups.map(g => [g.type, g.n, g.word]), [['pig', 2, 'Pig'], ['cow', 1, 'Cow'], ['chick', 1, 'Chick']]);
  assert.deepEqual(all.say, ['four', 'animals', 'hooray']);
});
test('a full load of 12 counts to twelve', () => {
  const s = buildShowSteps(Array.from({ length: 12 }, () => ({ type: 'sheep' })));
  assert.deepEqual(s.filter(x => x.kind === 'hop').at(-1).say, ['twelve', 'sheep']); assert.deepEqual(s.at(-1).say, ['twelve', 'animals', 'hooray']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL on the missing modules.

- [ ] **Step 3: Implement words.js, showSteps.js and trip.js**

```js
// src/sim/words.js: voice clip ids (spec section 12). File = audio/voice/<id>.mp3
export const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const ANIMAL_WORDS = ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick', 'golden'];
export const PHRASES = { 'lets-find': "Let's find", animals: 'animals!', 'great-job': 'Great job!', 'go-to-barn': 'Go to the barn!', 'lets-count': "Let's count!", hooray: 'Hooray!', 'you-did-it': 'You did it!' };
export const WORDS = [...NUMBER_WORDS.slice(1), ...ANIMAL_WORDS, ...Object.keys(PHRASES)];
export const textOf = id => PHRASES[id] ?? (id[0].toUpperCase() + id.slice(1));
```

```js
// src/sim/showSteps.js: the barn show timeline (spec 3.4)
import { NUMBER_WORDS } from './words.js';
import { TYPES } from './herd.js';
export function buildShowSteps(animals) {
  const steps = [{ kind: 'intro', say: ['lets-count'] }];
  animals.forEach((a, i) => steps.push({ kind: 'hop', index: i, n: i + 1, word: (a.golden ? 'Golden ' : '') + TYPES[a.type].word, say: [NUMBER_WORDS[i + 1], ...(a.golden ? ['golden'] : []), a.type] }));
  const order = [], n = {}; for (const a of animals) { if (!(a.type in n)) { order.push(a.type); n[a.type] = 0; } n[a.type]++; }
  steps.push({ kind: 'all', n: animals.length, groups: order.map(t => ({ type: t, n: n[t], word: TYPES[t].word })), say: [NUMBER_WORDS[animals.length], 'animals', 'hooray'] });
  return steps;
}
```

```js
// src/sim/trip.js: trip state machine (spec 3.1, F-2, F-4). The game only reports a barn pass when animals ride.
const INTRO = 3, HELP_AFTER = 20, CAPACITY = 12;
export const createTrip = () => ({ state: 'intro', t: 0, idle: 0, said: false, fullSaid: false });
export function stepTrip(r, { dt, landed, booped, barnPass, showDone, rewardDone }) {
  const cues = []; r.t += dt;
  switch (r.state) {
    case 'intro': if (!r.said) { r.said = true; cues.push('say-intro'); } if (r.t >= INTRO - 1e-9) { r.state = 'drive'; r.t = 0; cues.push('drive'); } break;
    case 'drive':
      r.idle = booped ? 0 : r.idle + dt;
      if (landed >= CAPACITY) { r.idle = 0; if (!r.fullSaid) { r.fullSaid = true; cues.push('full'); } }
      else if (r.idle >= HELP_AFTER) { r.idle = 0; cues.push('help'); }
      if (barnPass) { r.state = 'show'; r.t = 0; cues.push('show'); }
      break;
    case 'show': if (showDone) { r.state = 'reward'; cues.push('reward'); } break;
    case 'reward': if (rewardDone) { r.state = 'drive'; r.idle = 0; r.fullSaid = false; cues.push('drive'); } break;
  }
  return cues;
}
```

The intro test expects `['drive']` on the 180th tick (3 s). The `1e-9` margin absorbs floating-point drift from summing `1/60`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: trip and show-step tests PASS.

- [ ] **Step 5: show.js (the barn show in 3D)**

```js
// The barn show (F-5..F-8, F-10, W-7). The camera moves beside the stage; animals hop from the trailer onto the stage
// one at a time with a number above and a name below; then all jump, regroup by type, and the total shows.
import * as THREE from 'three';
const GAP = 0.95, GROUP_GAP = 0.45;
export function createShow({ root, camera, game, voice, sound, fx }) {
  const el = document.createElement('div'); el.id = 'show'; el.hidden = true; root.appendChild(el);
  const big = document.createElement('div'); big.className = 'big'; el.appendChild(big);
  let tweens = [], labels = [], skip = null, active = false, camT = 1;
  const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3(), look = new THREE.Vector3(), v = new THREE.Vector3();
  el.addEventListener('pointerdown', () => skip?.()); // F-8: a tap goes to the next step
  const wait = ms => new Promise(res => { const t = setTimeout(res, ms); skip = () => { clearTimeout(t); res(); }; });
  const say = ids => Promise.race([voice.say(ids), new Promise(r => { skip = r; })]);
  const tween = (a, to, dur, h) => new Promise(res => tweens.push({ a, from: { x: a.x, y: a.y || 0, z: a.z }, to, t: 0, dur, h, res }));
  const letters = w => [...w].map((c, i) => `<b style="animation-delay:${i * 0.12}s">${c === ' ' ? '&nbsp;' : c}</b>`).join('');
  const label = (anchor, cls, html, dy, word) => {
    const d = document.createElement('div'); d.className = cls; d.innerHTML = html; el.appendChild(d);
    if (word) d.addEventListener('pointerdown', e => { e.stopPropagation(); voice.say(word); }); // W-6
    labels.push({ anchor, d, dy });
  };
  const frame = () => { // stage center, axis along the stage, and the side the camera stands on
    const y = game.farm.yard, b = y.barn, st = y.stage, f = [Math.sin(b.yaw), Math.cos(b.yaw)], side = [Math.cos(b.yaw) * y.side, -Math.sin(b.yaw) * y.side];
    return { c: { x: (st.x0 + st.x1) / 2, z: (st.z0 + st.z1) / 2 }, f, side, y: st.y };
  };
  return {
    get active() { return active; },
    update(dt) {
      if (!active) return;
      if (camT < 1) { camT = Math.min(1, camT + dt); const k = camT * camT * (3 - 2 * camT); camera.position.lerpVectors(camFrom, camTo, k); }
      camera.lookAt(look);
      tweens = tweens.filter(tw => {
        tw.t += dt; const u = Math.min(1, tw.t / tw.dur), a = tw.a;
        a.x = tw.from.x + (tw.to.x - tw.from.x) * u; a.z = tw.from.z + (tw.to.z - tw.from.z) * u;
        a.y = tw.from.y + (tw.to.y - tw.from.y) * u + tw.h * 4 * u * (1 - u);
        if (u >= 1) { tw.res(); return false; } return true;
      });
      for (const L of labels) { v.set(L.anchor.x, (L.anchor.y || 0) + L.dy, L.anchor.z).project(camera); L.d.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; L.d.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; }
    },
    async play(riders, steps) {
      active = true; el.hidden = false; big.textContent = ''; big.classList.remove('on');
      const F = frame(), n = riders.length, groups = steps.at(-1).groups.length, width = (n - 1) * GAP + (groups - 1) * GROUP_GAP;
      const spot = (x) => ({ x: F.c.x + F.f[0] * (x - width / 2), y: F.y, z: F.c.z + F.f[1] * (x - width / 2) }); // x = metres along the stage row
      camFrom.copy(camera.position); camTo.set(F.c.x + F.side[0] * 13, F.y + 6, F.c.z + F.side[1] * 13); look.set(F.c.x, F.y + 1, F.c.z); camT = 0;
      const faceCam = Math.atan2(F.side[0], F.side[1]);
      const rowX = i => i * GAP + (width - (n - 1) * GAP) / 2; // hop row: centered, no group gaps yet
      for (const s of steps) {
        if (s.kind === 'hop') { // F-6
          const a = riders[s.index].animal; a.state = 'show'; a.yaw = faceCam; sound.boing(0.3);
          await tween(a, spot(rowX(s.index)), 0.7, 3); sound.plop();
          label(a, 'num', s.n, 1.6); label(a, 'name', letters(s.word), -0.35, s.say.slice(1));
        }
        if (s.kind === 'all') { // F-7
          labels.forEach(L => L.d.remove()); labels = [];
          await Promise.all(riders.map(r => tween(r.animal, { x: r.animal.x, y: F.y, z: r.animal.z }, 0.6, 1.5)));
          big.textContent = s.n; big.classList.add('on');
          let x = 0; const moves = [];
          for (const g of s.groups) {
            const start = x;
            for (const r of riders.filter(r => r.animal.type === g.type)) { moves.push(tween(r.animal, spot(x), 0.6, 1)); x += GAP; }
            label(spot((start + x - GAP) / 2), 'group', `<span class="gn">${g.n}</span><span class="gw">${letters(g.word)}</span>`, -0.4, [g.type]);
            x += GROUP_GAP; // x already sits one GAP past the last member
          }
          await Promise.all(moves); fx?.confetti(F.c.x, F.y + 2, F.c.z); sound.cheer();
        }
        await say(s.say); await wait(800);
      }
      skip = null;
    },
    end() { active = false; el.hidden = true; labels.forEach(L => L.d.remove()); labels = []; big.classList.remove('on'); },
  };
}
```

CSS (add to `template.html`):

```css
#show{position:absolute;inset:0;z-index:8;pointer-events:auto}
#show .num,#show .name,#show .group{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:700 44px Andika,system-ui;color:#fff;-webkit-text-stroke:3px #6b4428;paint-order:stroke;animation:pop .35s ease-out}
#show .name{font-size:34px}
#show .group{display:flex;flex-direction:column;align-items:center;font-size:40px}
#show .gn{font-size:48px}
#show .big{position:absolute;top:8%;left:50%;transform:translateX(-50%);font:700 150px Andika,system-ui;color:#fff;-webkit-text-stroke:5px #6b4428;paint-order:stroke;opacity:0}
#show .big.on{opacity:1;animation:pop .4s ease-out}
#show b{display:inline-block;animation:glow .5s ease-out both}
@keyframes glow{0%{color:#fff}40%{color:#f5c84c;transform:scale(1.2)}100%{color:#fff;transform:scale(1)}}
```

- [ ] **Step 6: Wire the trip in main.js**

Each fixed step, after `game.step`:

```js
const passed = ev.some(e => e.type === 'barnPass');
const cues = stepTrip(trip, { dt: DT, landed: game.load.landed(), booped: ev.some(e => e.type === 'boop'), barnPass: passed, showDone, rewardDone });
showDone = rewardDone = false;
for (const c of cues) {
  if (c === 'say-intro') voice.say(['lets-find', 'animals']);
  if (c === 'full') { voice.say(['great-job', 'go-to-barn']); guideToBarn = true; }
  if (c === 'help') { const a = game.herd.callHelp(game.tractor); if (a) helpTarget = { a, t: 10 }; }
  if (c === 'show') { guideToBarn = false; riders = game.startShow();
    show.play(riders, buildShowSteps(riders.map(r => ({ type: r.animal.type, golden: r.animal.golden })))).then(() => { showDone = true; }); }
  if (c === 'reward') { show.end(); game.finishShow(riders); hud.reset(); showReward(riders); } // Task 14 fills in showReward; until then call rewardDone = true
}
```

- During `show.active`, skip `chase.update` and call `show.update(dt)` instead.
- After the show, the chase camera eases back from wherever the show camera stood (it lerps toward its target every frame).
- Before Task 12, `voice` is a stub: `{ say: async ids => console.log('say', ids) }`.
- Before Task 14, `showReward` is `() => { rewardDone = true; }`.

- [ ] **Step 7: Sparkle path and edge arrow**

While `guideToBarn` is true, every 0.5 s build a list of points to the barn:
- On a route (`!road.inYard(x, z)`): take the tractor's nearest route point `n.pt`. Walk along that route toward its nearer end (compare `n.pt.s` with `route.length - n.pt.s`) every 3 m. Then go straight from that gate point to the nearer barn end (`barn ± f × 6`).
- In the farmyard: a straight line from the tractor to the nearer barn end.

Pass the first 40 points to `fx.sparkleTrail(points)` (Task 13; until then use small yellow `THREE.Sprite`s).

For the arrow, project the barn center with `camera`. If it is off-screen or behind the camera, clamp it to a screen ellipse inset by 70 px and call `hud.arrowTo({ x, y, angle })`; otherwise call `hud.arrowTo(null)`. Use the same arrow during `help` (F-4) to point at the helper animal for 10 s.

- [ ] **Step 8: Verify and commit**

Run: `npm test && npm run build`. Play `?seed=1`: pick up 3 animals on a route, come back, and drive through the barn. Then fill all 12 and follow the sparkles. Take Playwright screenshots of a hop step (number above, name below) and of the "all together" step with groups and the total.
Expected:
- A barn pass with riders starts the show; a pass with an empty trailer does nothing.
- The animals hop out one by one onto the stage, each named and numbered by the voice, then all jump, regroup, and the total shows with confetti.
- A tap speeds it up.
- After the show the animals walk off the stage into the barn one after the other and are gone, and the slot bar is empty.

```bash
git add games/tractor-pickup/src games/tractor-pickup/test/trip.test.mjs games/tractor-pickup/test/showSteps.test.mjs games/tractor-pickup/template.html site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup - trip flow and the barn show"
```

---

### Task 12: Sounds and recorded voice

**Files:**
- Create: `src/audio/sound.js`, `src/audio/voice.js`, `audio/voice/README.md`, `test/voice.test.mjs`
- Modify: `build.py` (trim, normalize and embed clips), `template.html` (`<script>window.__VOICE__=…</script>` placeholder), `src/main.js`

**Interfaces:**
- Consumes: `WORDS, textOf` (words.js).
- Produces (voice.js): `planUtterances(ids, available: Set) -> [{ clip: id } | { tts: string }]` (consecutive missing ids join into one `tts` text), `createVoice(sound) -> { say(ids) -> Promise, enabled }`.
- Produces (sound.js): `class Sound` with `unlock()`, `engine(level, speed, surface)`, `skid(amount)`, `animal(type)`, `boing()`, `plop()`, `whee()`, `horn()`, `bells()`, `squelch()`, `spray(on)`, `squeaky()`, `clunk()`, `cheer()`, `music(on)`, `ctx`, `master`.
- Build: `build.py` writes `window.__VOICE__ = { id: 'data:audio/mpeg;base64,…' }` for each file in `audio/voice/*.mp3`.

- [ ] **Step 1: Write the failing voice test**

`test/voice.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { planUtterances } from '../src/audio/voice.js';
import { WORDS } from '../src/sim/words.js';

test('word list matches spec section 12.1', () => {
  for (const w of ['one', 'twelve', 'pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick', 'golden', 'lets-find', 'animals', 'great-job', 'go-to-barn', 'lets-count', 'hooray', 'you-did-it']) assert.ok(WORDS.includes(w), w);
});
test('recorded clips play; missing words fall back to speech, merged', () => {
  const plan = planUtterances(['three', 'pig', 'golden'], new Set(['pig']));
  assert.deepEqual(plan, [{ tts: 'Three' }, { clip: 'pig' }, { tts: 'Golden' }]);
  assert.deepEqual(planUtterances(['great-job', 'go-to-barn'], new Set()), [{ tts: 'Great job! Go to the barn!' }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/audio/voice.js'`.

- [ ] **Step 3: Implement voice.js**

```js
// Recorded words (spec S-4, section 12) played back to back; any word not yet recorded uses the browser's speech.
import { textOf } from '../sim/words.js';
export function planUtterances(ids, available) {
  const out = [];
  for (const id of ids) {
    if (available.has(id)) out.push({ clip: id });
    else if (out.at(-1)?.tts) out.at(-1).tts += ' ' + textOf(id);
    else out.push({ tts: textOf(id) });
  }
  return out;
}
export function createVoice(sound) {
  const src = (typeof window !== 'undefined' && window.__VOICE__) || {}, buffers = new Map(); let chain = Promise.resolve();
  const decode = async id => { if (!buffers.has(id)) { const b64 = src[id].split(',')[1], bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); buffers.set(id, await sound.ctx.decodeAudioData(bin.buffer)); } return buffers.get(id); };
  const playClip = async id => { const buf = await decode(id); return new Promise(res => { const s = sound.ctx.createBufferSource(); s.buffer = buf; const g = sound.ctx.createGain(); g.gain.value = 1.4; s.connect(g); g.connect(sound.master); s.onended = res; s.start(); }); };
  const speak = text => new Promise(res => { if (!('speechSynthesis' in window)) return res(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.9; u.pitch = 1.1; u.onend = res; u.onerror = res; speechSynthesis.speak(u); });
  const v = {
    enabled: true,
    say(ids) {
      if (!v.enabled || !sound.ctx) return Promise.resolve();
      const plan = planUtterances(ids, new Set(Object.keys(src)));
      chain = chain.then(async () => { for (const p of plan) { if (p.clip) await playClip(p.clip); else await speak(p.tts); await new Promise(r => setTimeout(r, 80)); } });
      return chain;
    },
  };
  return v;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: voice tests PASS.

- [ ] **Step 5: sound.js**

Copy `games/pig-pens/src/sound.js` (it has `unlock, voice, noise, oink, squeal, bark, whoosh, munch, sparkle, engineLevel` and more). Rename the class export to `Sound` and add these methods, all built from the existing `voice()`/`noise()` helpers and plain oscillators:

```js
  animal(type) { if (!this.ok) return; ({
    pig: () => this.oink(0.6), cow: () => { this.voice(150, 110, 0.9, 0.5, [400, 900]); }, sheep: () => { for (let i = 0; i < 4; i++) this.voice(420, 400, 0.12, 0.35, [700, 1500], i * 0.1); },
    chicken: () => { this.voice(600, 900, 0.08, 0.35, [1200, 2400]); this.voice(900, 500, 0.25, 0.35, [1200, 2400], 0.1); }, chick: () => this.voice(2200, 2600, 0.08, 0.25, [2500, 3500]),
    duck: () => { this.voice(500, 380, 0.15, 0.45, [900, 1800]); this.voice(480, 360, 0.15, 0.4, [900, 1800], 0.2); }, bunny: () => this.boing(0.3), dog: () => this.bark(),
  }[type] || (() => {}))(); }
  tone(f0, f1, dur, vol, type = 'sine', when = 0) { const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05); }
  boing(v = 0.5) { if (this.ok) this.tone(180, 720, 0.35, v, 'triangle'); }
  plop() { if (this.ok) { this.tone(500, 160, 0.12, 0.5); this.noise(0.05, 0.2, 400); } }
  whee() { if (this.ok) this.tone(400, 1400, 0.6, 0.3, 'triangle'); }
  horn() { if (!this.ok) return; for (const w of [0, 0.32]) { this.tone(392, 392, 0.24, 0.35, 'square', w); this.tone(494, 494, 0.24, 0.25, 'square', w); } }
  bells() { if (this.ok) [1319, 1568, 1976, 2637].forEach((f, i) => this.tone(f, f, 0.8, 0.25, 'sine', i * 0.12)); }
  squelch() { if (this.ok) { this.noise(0.2, 0.35, 300, 0, 2); this.tone(220, 90, 0.2, 0.25, 'sine', 0.05); } }
  squeaky() { if (this.ok) { this.tone(1800, 3200, 0.15, 0.25, 'sine'); this.sparkle(0.6); } }
  clunk() { if (this.ok) { this.tone(140, 60, 0.15, 0.6, 'square'); this.noise(0.08, 0.3, 800); } }
  cheer() { if (this.ok) for (let i = 0; i < 10; i++) this.voice(500 + Math.random() * 500, 700 + Math.random() * 600, 0.4, 0.12, [900, 2400], Math.random() * 0.5); }
```

Engine and gravel: keep one looping engine node as in Pig Pens' `engineLevel` (pulse rate = 18 + 40 × speed fraction for the "putt-putt"). Add a looping filtered-noise "crunch" whose gain is `speed / vmax × 0.25` on gravel, `× 0.1` with a lower band (900 Hz) on grass, and 0 in mud. Add `skid(amount)`: a second noise loop at 1800 Hz with gain `amount × 0.3`. Add `spray(on)`: a noise loop at 4000 Hz with gain 0.2 while true.

Music (S-5): a 16-step pentatonic loop scheduled ahead with `ctx.currentTime` (C major pentatonic, triangle notes at 0.06 gain, tempo 110). `music(on)` starts or stops the scheduler.

- [ ] **Step 6: Build script: process and embed clips**

Add to `build.py` before writing `index.html`:

```python
import base64, shutil as sh
voice = {}
vdir, proc = here / 'audio/voice', here / 'build/voice'
proc.mkdir(parents=True, exist_ok=True)
for mp3 in sorted(vdir.glob('*.mp3')):
    out = proc / mp3.name
    if sh.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(mp3), '-af',
            'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5',
            '-ac', '1', '-b:a', '64k', str(out)], check=True)
    else:
        sh.copy(mp3, out)
    voice[mp3.stem] = 'data:audio/mpeg;base64,' + base64.b64encode(out.read_bytes()).decode()
html = html.replace('<!--VOICE-->', 'window.__VOICE__=' + json.dumps(voice) + ';')
print('voice clips', len(voice), sorted(voice))
```

Move the `html = ...` line above this block so the replace works, and add `<script><!--VOICE--></script>` before the app script in `template.html`.

- [ ] **Step 7: Recording guide**

`audio/voice/README.md`:

```markdown
# Voice clips for Tractor Pickup

Record one word or phrase per file. Save it here as `<id>.mp3`. Any missing file uses the browser's voice.

Numbers: one two three four five six seven eight nine ten eleven twelve
Animals: pig cow chicken sheep duck bunny dog chick golden
Phrases:
- lets-find: "Let's find…"
- animals: "…animals!"
- great-job: "Great job!"
- go-to-barn: "Go to the barn!"
- lets-count: "Let's count!"
- hooray: "Hooray!"
- you-did-it: "You did it!"

Tips: a quiet room, phone or headset mic about 15 cm away, a happy voice, a short pause before and after.
Any format your recorder makes can be converted: `ffmpeg -i pig.m4a pig.mp3`. The build trims silence and evens out the volume.
Run `npm run build` after you add files.
```

- [ ] **Step 8: Wire sounds into main.js**

- Start screen tap → `sound.unlock()` (iOS needs a gesture before audio plays).
- `boop` → `sound.boing()` + `sound.animal(type)`; golden → `sound.bells()`.
- `land` → `sound.plop()` + `voice.say(golden ? ['golden', type] : [type])` (B-9).
- `horn` → `sound.horn()`.
- Each frame → `sound.engine(t.engine, t.speed / t.P.vmax, t.surface)` and `sound.skid(clamp((|t.slip| - 0.2) * 2, 0, 1))`.
- When the surface enters mud → `sound.squelch()`. Ramp airborne (all 4 wheels out of contact for over 0.15 s) → `sound.whee()` + `sound.cheer()` if riders > 0. Sprinkler → `sound.spray(true/false)`, and `sound.squeaky()` when dirt reaches 0 (Task 13).
- The show and trip cues use `voice`.

- [ ] **Step 9: Verify and commit**

Run: `npm test && npm run build`.
Expected: the build prints `voice clips 0 []` until the user records. Every voice line falls back to the speech voice. Do a trip with sound and check: engine pitch rises with speed; the horn honks twice; each animal makes its sound; the show counts and names the animals.

```bash
git add games/tractor-pickup/src/audio games/tractor-pickup/src/sim/words.js games/tractor-pickup/audio/voice/README.md games/tractor-pickup/test/voice.test.mjs games/tractor-pickup/build.py games/tractor-pickup/template.html games/tractor-pickup/src/main.js site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup - sounds, music and recorded voice with speech fallback"
```

---

### Task 13: Dirt, sprinkler and effects (Playtest 4)

**Files:**
- Create: `src/sim/dirt.js`, `src/render/dirtMat.js`, `src/render/fx.js`, `test/dirt.test.mjs`
- Modify: `src/sim/game.js` (dirt levels each step), `src/render/vehicles3d.js` and `src/render/animals3d.js` (dirt materials), `src/main.js`

**Interfaces:**
- Produces (dirt.js): `DIRT = { gravel: 0.006, grass: 0.004, mud: 0.6, splash: 0.4, washTime: 1.5 }`, `stepDirt(level, { surface, speedFrac, washing }, dt) -> level`, `stepRiderDirt(level, { carInMud, speed, washing }, dt) -> level`.
- game.js additions: `game.dirt = { tractor: number }`, `car.dirt` for each car, `animal.dirt` (herd already has it); events `{ type: 'washed' }` when everything reaches 0 inside the sprinkler, `{ type: 'mud-enter' }`, `{ type: 'air', on: boolean }`.
- Produces (dirtMat.js): `dirtify(material) -> { uniforms: { uDirt } }` (patches `onBeforeCompile`; spots from a world-position value noise; brown mix where `noise < uDirt * 0.75`).
- Produces (fx.js): `createFx(scene) -> { update(dt), stars(x,y,z), gravel(x,z,dirX,dirZ,n), dust(x,z), mudSplash(x,z), water(x,z,yaw), sparkles(x,y,z), confetti(x,y,z), rainbowTrail(x,y,z), tireMark(x,z,yaw,alpha), sparkleTrail(points) }`.

- [ ] **Step 1: Write the failing dirt test**

`test/dirt.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepDirt, stepRiderDirt, DIRT } from '../src/sim/dirt.js';
const run = (fn, sec, l = 0) => { for (let i = 0; i < sec * 60; i++) l = fn(l); return l; };

test('gravel dirties slowly, a few trips to full', () => {
  const l = run(l => stepDirt(l, { surface: 'gravel', speedFrac: 1, washing: false }, 1 / 60), 60);
  assert.ok(l > 0.25 && l < 0.5, `${l}`);
});
test('mud dirties fast', () => {
  assert.ok(run(l => stepDirt(l, { surface: 'mud', speedFrac: 0.3, washing: false }, 1 / 60), 2) > 0.95);
});
test('parked tractor does not get dirtier on gravel', () => {
  assert.equal(run(l => stepDirt(l, { surface: 'gravel', speedFrac: 0, washing: false }, 1 / 60), 10, 0.2), 0.2);
});
test('the sprinkler cleans from full to zero in 1.5 s', () => {
  const l = run(l => stepDirt(l, { surface: 'gravel', speedFrac: 1, washing: true }, 1 / 60), DIRT.washTime + 0.02, 1);
  assert.equal(l, 0);
});
test('riders get splashed in mud only while moving, and washed too', () => {
  assert.equal(run(l => stepRiderDirt(l, { carInMud: true, speed: 0.2, washing: false }, 1 / 60), 3), 0);
  assert.ok(run(l => stepRiderDirt(l, { carInMud: true, speed: 4, washing: false }, 1 / 60), 3) > 0.9);
  assert.equal(run(l => stepRiderDirt(l, { carInMud: false, speed: 4, washing: true }, 1 / 60), 2, 1), 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL on the missing module.

- [ ] **Step 3: Implement dirt.js**

```js
// Dirt levels 0 (clean) .. 1 (very dirty) for the tractor, the cars and every animal (T-16). Only the sprinkler cleans (T-15).
export const DIRT = { gravel: 0.006, grass: 0.004, mud: 0.6, splash: 0.4, washTime: 1.5 };
const clamp = v => Math.max(0, Math.min(1, v));
export function stepDirt(level, { surface, speedFrac, washing }, dt) {
  if (washing) return clamp(level - dt / DIRT.washTime);
  const rate = surface === 'mud' ? DIRT.mud : (DIRT[surface] ?? 0) * Math.min(1, speedFrac);
  return clamp(level + rate * dt);
}
export function stepRiderDirt(level, { carInMud, speed, washing }, dt) {
  if (washing) return clamp(level - dt / DIRT.washTime);
  return carInMud && speed > 1 ? clamp(level + DIRT.splash * dt) : level;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: dirt tests PASS.

- [ ] **Step 5: Dirt in game.js**

At the end of `step()`:

```js
const sf = tractor.speed / tractor.P.vmax, washing = road.inSprinkler(tractor.x, tractor.z);
game.dirt.tractor = stepDirt(game.dirt.tractor, { surface: tractor.surface, speedFrac: sf, washing }, DT);
for (const c of train.cars) { const p = c.body.translation(), w = road.inSprinkler(p.x, p.z), mud = road.surfaceAt(p.x, p.z) === 'mud';
  c.dirt = stepDirt(c.dirt, { surface: road.surfaceAt(p.x, p.z), speedFrac: sf, washing: w }, DT);
  for (const s of load.slots) if (s.car === c.index && s.landed) s.animal.dirt = stepRiderDirt(s.animal.dirt, { carInMud: mud, speed: tractor.speed, washing: w }, DT); }
if (tractor.surface === 'mud' && lastSurface !== 'mud') events.push({ type: 'mud-enter' }); lastSurface = tractor.surface;
const air = [0, 1, 2, 3].every(i => !tractor.vc.wheelIsInContact(i)); if (air !== lastAir) events.push({ type: 'air', on: air }); lastAir = air;
if (washing && !wasClean && game.dirt.tractor === 0 && train.cars.every(c => c.dirt === 0)) { events.push({ type: 'washed' }); wasClean = true; }
if (game.dirt.tractor > 0.05) wasClean = false;
```

Declare `let lastSurface = 'gravel', lastAir = false, wasClean = true;` next to `pendingPass`, and add `dirt: { tractor: 0 }` to the `game` object.

- [ ] **Step 6: dirtMat.js**

```js
// Patch a Lambert/Standard material so brown spots appear where world-space value noise < uDirt.
export function dirtify(material) {
  const uniforms = { uDirt: { value: 0 } };
  material.onBeforeCompile = sh => {
    sh.uniforms.uDirt = uniforms.uDirt;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDirtPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDirtPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uDirt; varying vec3 vDirtPos;
float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float dn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float dirtN = dn(vDirtPos * 2.7) * 0.65 + dn(vDirtPos * 9.0) * 0.35;
float lowBias = clamp(1.2 - vDirtPos.y * 0.45, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.19, 0.10), step(dirtN, uDirt * 0.8 * lowBias) * 0.9);`);
  };
  material.customProgramCacheKey = () => 'dirt';
  return { uniforms };
}
```

Spots gather low on the vehicles (`lowBias`), like real mud. In `vehicles3d.js`, give the tractor body, its wheels and each car its own `dirtify`'d material clone, and set `uDirt` each frame from `game.dirt.tractor` and `car.dirt`. In `animals3d.js`, give each animal one material clone (Lambert, or Standard for golden). `dirtify` it and set `uDirt = animal.dirt`. About 20 animals means 20 materials sharing one program, which is fine.

- [ ] **Step 7: fx.js**

```js
// Particle pool on one InstancedMesh of small cubes + a tire-mark ribbon. Cheap enough for the iPad.
import * as THREE from 'three';
const MAX = 900;
export function createFx(scene) {
  const geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshLambertMaterial({ vertexColors: false });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; scene.add(mesh);
  const P = Array.from({ length: MAX }, () => ({ life: 0 })), col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let next = 0;
  const emit = (x, y, z, vx, vy, vz, size, life, hex, g = 9.8, drag = 0.5) => { const i = next; next = (next + 1) % MAX; Object.assign(P[i], { x, y, z, vx, vy, vz, size, life, max: life, g, drag, spin: Math.random() * 6 }); mesh.setColorAt(i, col.set(hex)); };
  const R = (a) => (Math.random() - 0.5) * a;
  // tire marks: 400 quads in a ring buffer
  const TM = 400, tmGeo = new THREE.PlaneGeometry(0.45, 1).rotateX(-Math.PI / 2), tmMat = new THREE.MeshBasicMaterial({ color: '#6b5236', transparent: true, opacity: 0.35, depthWrite: false });
  const marks = new THREE.InstancedMesh(tmGeo, tmMat, TM); marks.count = 0; scene.add(marks); let tmNext = 0;
  return {
    stars(x, y, z) { for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; emit(x, y, z, Math.cos(a) * 5, 3, Math.sin(a) * 5, 0.22, 0.6, '#ffd84a', 2); } },
    gravel(x, z, dx, dz, n = 3) { for (let i = 0; i < n; i++) emit(x + R(0.4), 0.2, z + R(0.4), -dx * 4 + R(3), 2 + Math.random() * 2.5, -dz * 4 + R(3), 0.09, 0.7, Math.random() < 0.5 ? '#bfa57a' : '#8d7656'); },
    dust(x, z) { emit(x + R(0.6), 0.3, z + R(0.6), R(0.6), 0.6, R(0.6), 0.5, 1.2, '#e3d2b0', -0.2, 1.5); },
    mudSplash(x, z) { for (let i = 0; i < 10; i++) emit(x + R(1), 0.2, z + R(1), R(5), 2 + Math.random() * 3, R(5), 0.16, 0.8, '#5f3e25'); },
    water(x, z, yaw) { for (let i = 0; i < 8; i++) emit(x + R(7) * Math.cos(yaw), 4.1, z + R(7) * Math.sin(yaw), R(1), -1, R(1), 0.08, 0.7, '#9fdcff', 6, 0.2); },
    sparkles(x, y, z) { for (let i = 0; i < 12; i++) emit(x + R(2), y + R(1.5), z + R(2), R(1), 1.5, R(1), 0.12, 0.9, '#ffffff', -0.5); },
    confetti(x, y, z) { for (let i = 0; i < 120; i++) emit(x + R(2), y, z + R(2), R(8), 6 + Math.random() * 6, R(8), 0.14, 2.5, `hsl(${Math.random() * 360},80%,60%)`, 6, 1.2); },
    rainbowTrail(x, y, z) { emit(x, y, z, 0, 0, 0, 0.25, 0.6, `hsl(${(performance.now() / 3) % 360},90%,60%)`, 0, 0); },
    sparkleTrail(points) { for (const p of points) if (Math.random() < 0.15) emit(p.x + R(1), 0.4 + Math.random() * 0.6, p.z + R(1), 0, 0.5, 0, 0.18, 0.8, '#ffe066', -0.3); },
    tireMark(x, z, yaw) { m4.compose(v.set(x, 0.03, z), q.setFromAxisAngle(v.set(0, 1, 0), yaw), s.set(1, 1, 1)); marks.setMatrixAt(tmNext, m4); tmNext = (tmNext + 1) % TM; marks.count = Math.min(TM, marks.count + 1); marks.instanceMatrix.needsUpdate = true; },
    update(dt) {
      P.forEach((p, i) => {
        if (p.life <= 0) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); return; }
        p.life -= dt; p.vy -= p.g * dt; const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vz *= k;
        p.x += p.vx * dt; p.y = Math.max(0.03, p.y + p.vy * dt); p.z += p.vz * dt; p.spin += dt * 4;
        const sc = p.size * Math.min(1, p.life / p.max * 2);
        m4.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(s.set(0.3, 1, 0.2).normalize(), p.spin), s.set(sc, sc, sc)); mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
```

In `main.js`, each frame:
- Rear-wheel world positions from `tractor.W[2..3]`: if `|slip| > 0.25` or (`engine > 0.8` and `speed < 3`), emit `fx.gravel(…)` and `fx.tireMark(…)`.
- `fx.dust` every 0.1 s when `speed > 4` on gravel.
- `mud-enter` → `fx.mudSplash` + `sound.squelch()`. In mud with `speed > 2` → `fx.mudSplash` every 0.15 s.
- Sprinkler: when the tractor is within 15 m of a sprinkler → `fx.water(…)` and `sound.spray(true)`; `washed` → `fx.sparkles` over the tractor + `sound.squeaky()`.
- Flights of golden animals → `fx.rainbowTrail(pos)` each frame.
- Duck flights starting near the pond → `fx.water` drips (A-5). Chicken and chick flights: flap the wing parts (scale wing parts' y by `1 + 0.4 sin(t × 30)` in `animals3d.js`). Bunny: rotate the ear part about y by `t × 20` during flight (A-6).
- The show's "all together" step already calls `fx.confetti` (Task 11).

- [ ] **Step 8: Verify and commit, then PLAYTEST 4**

Run: `npm test && npm run build`. Do a full trip on `?seed=1`: drive through mud, check the spots on the tractor, trailers and riders, then drive through the sprinkler. Take Playwright screenshots of a dirty tractor, the sprinkler spray, and a gravel slide with tire marks.
Expected: the dirt grows, the sprinkler washes everything in about 1.5 s with sparkles, and effects show without frame drops.

```bash
git add games/tractor-pickup/src games/tractor-pickup/test/dirt.test.mjs site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup - mud, dirt, sprinkler and particle effects"
```

Stop and ask the user to playtest full trips on the iPad.

---

### Task 14: Rewards, sticker card, start screen and parent menu

**Files:**
- Create: `src/sim/progress.js`, `src/ui/store.js`, `src/ui/menus.js`, `test/progress.test.mjs`
- Modify: `src/main.js` (new farm without a page reload), `src/render/animals3d.js` (hats), `template.html` (menu CSS)

**Interfaces:**
- Produces (progress.js): `COLORS = ['red','green','blue','yellow','pink','rainbow']`, `HATS = [{ id: 'straw', shows: 4 }, { id: 'cowboy', shows: 8 }, { id: 'party', shows: 12 }]`, `emptyProgress()`, `unlockedColors(p)`, `unlockedHats(p)`, `pickSticker(animals)`, `completeShow(p, animals) -> { progress, sticker, newColor, newHat }`, `DEFAULT_SETTINGS = { power: 'medium', voice: true, music: true, seed: null }`, `clampSettings(s)`.
- Produces (store.js): `load(key, fallback)`, `save(key, value)` (both wrapped in try/catch; keys `tp-progress`, `tp-settings`).
- Produces (menus.js): `createMenus(root, { icons, onPlay, onKeepDriving, onNewFarm, onSettings, onClearStickers }) -> { showStart(progress), showReward({ sticker, newColor, newHat, progress }), showBook(progress), openParent(settings, seed) }`.
- main.js: `startFarm({ seed, power })` disposes the old game (free the Rapier world, remove its meshes and dispose geometries/materials) and builds a new one. Trips on the same farm do not rebuild anything.

- [ ] **Step 1: Write the failing tests**

`test/progress.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, completeShow, unlockedColors, unlockedHats, pickSticker, clampSettings, COLORS } from '../src/sim/progress.js';

test('golden animal wins the sticker; else the most-booped type; ties go to the first landed', () => {
  assert.deepEqual(pickSticker([{ type: 'pig' }, { type: 'cow', golden: true }, { type: 'pig' }]), { type: 'cow', golden: true });
  assert.deepEqual(pickSticker([{ type: 'cow' }, { type: 'pig' }, { type: 'pig' }]), { type: 'pig', golden: false });
  assert.deepEqual(pickSticker([{ type: 'cow' }, { type: 'pig' }]), { type: 'cow', golden: false });
});
test('a new tractor color every 3 shows, in order, ending at rainbow (W-3)', () => {
  let p = emptyProgress(), got = [];
  for (let i = 0; i < 18; i++) { const r = completeShow(p, [{ type: 'pig' }]); p = r.progress; if (r.newColor) got.push(r.newColor); }
  assert.deepEqual(got, COLORS.slice(1)); assert.deepEqual(unlockedColors(p), COLORS);
});
test('hats unlock after shows 4, 8 and 12 (W-4)', () => {
  let p = emptyProgress(), got = [];
  for (let i = 0; i < 12; i++) { const r = completeShow(p, [{ type: 'pig' }]); p = r.progress; if (r.newHat) got.push([p.shows, r.newHat]); }
  assert.deepEqual(got, [[4, 'straw'], [8, 'cowboy'], [12, 'party']]); assert.deepEqual(unlockedHats(p), ['straw', 'cowboy', 'party']);
});
test('stickers accumulate with the show number (W-1, W-2)', () => {
  let p = emptyProgress(); p = completeShow(p, [{ type: 'duck' }]).progress; p = completeShow(p, [{ type: 'cow' }]).progress;
  assert.deepEqual(p.stickers.map(s => [s.show, s.type]), [[1, 'duck'], [2, 'cow']]);
});
test('settings are clamped to the spec values (P-3..P-7)', () => {
  assert.deepEqual(clampSettings({ goal: 40, power: 'turbo', voice: 'yes', music: false, seed: -3 }), { power: 'medium', voice: true, music: false, seed: null });
  assert.deepEqual(clampSettings({ power: 'high', seed: 42 }), { power: 'high', voice: true, music: true, seed: 42 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL on the missing module.

- [ ] **Step 3: Implement progress.js and store.js**

```js
// src/sim/progress.js: rewards after each show (spec section 9) and parent settings (section 10)
export const COLORS = ['red', 'green', 'blue', 'yellow', 'pink', 'rainbow'];
export const HATS = [{ id: 'straw', shows: 4 }, { id: 'cowboy', shows: 8 }, { id: 'party', shows: 12 }];
export const emptyProgress = () => ({ shows: 0, stickers: [], color: 'red' });
export const unlockedColors = p => COLORS.slice(0, Math.min(COLORS.length, 1 + Math.floor(p.shows / 3)));
export const unlockedHats = p => HATS.filter(h => p.shows >= h.shows).map(h => h.id);
export function pickSticker(animals) {
  const g = animals.find(a => a.golden); if (g) return { type: g.type, golden: true };
  const n = new Map(); for (const a of animals) n.set(a.type, (n.get(a.type) || 0) + 1);
  let best = null; for (const [t, c] of n) if (!best || c > n.get(best)) best = t;
  return { type: best, golden: false };
}
export function completeShow(p, animals) {
  const shows = p.shows + 1, next = { ...p, shows }, sticker = { ...pickSticker(animals), show: shows };
  next.stickers = [...p.stickers, sticker];
  const before = unlockedColors(p), after = unlockedColors(next), hatsBefore = unlockedHats(p), hatsAfter = unlockedHats(next);
  return { progress: next, sticker, newColor: after.length > before.length ? after.at(-1) : null, newHat: hatsAfter.length > hatsBefore.length ? hatsAfter.at(-1) : null };
}
export const DEFAULT_SETTINGS = { power: 'medium', voice: true, music: true, seed: null };
export function clampSettings(s) {
  return {
    power: ['low', 'medium', 'high'].includes(s.power) ? s.power : 'medium',
    voice: s.voice === undefined ? true : !!s.voice, music: s.music === undefined ? true : !!s.music,
    seed: Number.isInteger(s.seed) && s.seed >= 0 ? s.seed : null,
  };
}
```

```js
// src/ui/store.js: browser storage can throw or be empty (private mode); the game must work without it.
export function load(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
export function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: progress lasts for this visit only */ } }
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: progress tests PASS.

- [ ] **Step 5: menus.js**

Build the DOM screens. All game-facing parts are pictures; only the parent menu uses text (R-2, U-4).

- **Start screen:**
  - A big tractor picture button in the current color. It unlocks audio and calls `onPlay`.
  - A row of tractor-color swatches, one per unlocked color (W-3). Tapping one sets `progress.color` and calls `vehicles.setColor`.
  - A sticker-book button (book icon).
- **Sticker card**, after each show (F-3, F-9):
  - The new sticker grows in the center, with the sticker portrait in a round frame with a gold rim if golden.
  - If `newColor`: a tractor picture in that color bounces in with `sound.bells()`.
  - If `newHat`: an animal portrait wearing the hat bounces in.
  - Two big picture buttons: a tractor ("keep driving", calls `onKeepDriving`, which sets `rewardDone`) and a map ("new farm", calls `onNewFarm`).
- **Sticker book:** a grid of every sticker from `progress.stickers` (portraits from `icons`), plus a close button (big ✕).
- **Parent gear (U-3):** a 46 px gear at the top right. `pointerdown` starts a 2 s timer with a filling conic ring. `pointerup` cancels it. When the timer completes, it opens the parent panel with text controls:
  - Power: Low / Medium / High.
  - Voice: on/off.
  - Music: on/off.
  - Farm seed: shows the current seed, with a number input and a "Use this seed" checkbox.
  - New farm: a button (P-8).
  - "Clear stickers": a button that asks "Clear all stickers? This cannot be undone." via `confirm()`.
  - Apply calls `onSettings(clampSettings(values))`, which saves. Power, voice and music apply at once (`tractor.setPower`, `voice.enabled`, `sound.music`); a new seed applies with the next new farm.

Hats (W-4): in `animals3d.js`, `setHats(a => hatFor(a))`. When at least one hat is unlocked, riders (only animals in `state === 'ride'`) get a hat picked by `a.id % unlocked.length`:
- Straw: a flat yellow cylinder brim and a crown.
- Cowboy: a brown brim and a tall crown.
- Party: a striped cone.

Build each from `CylinderGeometry` and `ConeGeometry` with Lambert colors. Show the hat only when riding, by toggling `v.hat.visible` in `update`.

- [ ] **Step 6: New farm in main.js**

`startFarm(settings, progress)`:
1. Set `renderer.setAnimationLoop(null)`.
2. Remove and dispose all game meshes: keep a `disposables` array per round; for every mesh call `geometry.dispose()` and `material.dispose()`.
3. Call `game.phys.world.free()`.
4. Create a new game with `seed = settings.seed ?? randomSeed()`, rebuild the farm, vehicles and animals views, then call `hud.reset()`, `vehicles.setColor(progress.color)` and reset the trip with `createTrip()`.
5. Restart the loop.

`showReward(riders)` (from Task 11): `completeShow(progress, animals)` → `save('tp-progress', …)` → `menus.showReward(…)`.

- [ ] **Step 7: Verify and commit**

Run: `npm test && npm run build`. Do three short trips (one or two animals each) through the barn.
Expected: a sticker after each show; a green tractor unlocks after show 3; the sticker book lists all three. "Keep driving" continues on the same farm with new animals on the routes; "new farm" builds a new one. The parent menu opens only after a 2 s hold. Reload: the stickers are kept.

```bash
git add games/tractor-pickup/src games/tractor-pickup/test/progress.test.mjs games/tractor-pickup/template.html site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup - stickers, tractor colors, hats and parent menu"
```

---

### Task 15: PWA icons, share preview, performance pass and final build (Playtest 5)

**Files:**
- Create: `pwa/icon-192.png`, `pwa/icon-512.png`, `pwa/apple-touch-icon.png`, `pwa/og-image.jpg`
- Modify: `pwa/manifest.webmanifest` (PNG icons), `template.html` (OG image tags), `src/render/scene.js` (quality tier), `package.json` (version 1.0.0), `docs/tractor-pickup-spec.md` (section 13 → test results)

- [ ] **Step 1: Icons**

Render the PNGs from `pwa/icon.svg`: `rsvg-convert -w 192 pwa/icon.svg -o pwa/icon-192.png`, then the same with `-w 512` and `-w 180` (apple-touch-icon). If `rsvg-convert` is missing, use the Playwright MCP tools to open the SVG and screenshot it at each size. Add the two PNG entries to the manifest `icons` array with `"purpose": "any maskable"`.

- [ ] **Step 2: Share preview image**

With the game running at `?seed=1`, pause during a launch (add `?still=1` support only if needed; otherwise screenshot during normal play). Take a 1200 × 630 Playwright screenshot and save it as `pwa/og-image.jpg`. Add the `og:image` and `twitter:image` meta tags in `template.html` (same pattern as Pig Pens) with alt text: "A red tractor towing a trailer full of cube-style farm animals on a gravel farm road, under the title Tractor Pickup".

- [ ] **Step 3: Performance pass**

Add an fps meter behind `?fps`. On the iPad, do a full trip with `?fps` and note the minimum fps. If it drops below 55:
1. Lower the pixel ratio to 1.5 when `navigator.maxTouchPoints > 1`.
2. Lower the shadow map to 1024 and tighten the shadow box to ±22 m.
3. Merge the per-animal part meshes: one `InstancedMesh` per part per type, as Pig Pens does for chickens.

Apply them in that order and re-measure after each. Record the final numbers in the commit message.

- [ ] **Step 4: Final checks**

Run: `npm test`
Expected: all test files PASS.

Run: `npm run build`
Expected: `index.html` under 8 MB; the voice clip count is printed.

Run the spec coverage check: open the spec and, for each item ID in sections 3–12, confirm the game does it in a browser session. Put the results table in spec section 13 ("Test results"), replacing "Open questions", and bump the spec version to 1.2.

- [ ] **Step 5: Commit, then PLAYTEST 5**

```bash
git add games/tractor-pickup site/exp/tractor-pickup
git commit -m "feat: Tractor Pickup 1.0.0 - icons, share preview and performance pass"
```

Ask the user to install the game to the iPad home screen (Share → Add to Home Screen), play offline (airplane mode), and record the voice clips. Do not push: the user decides when to publish, because a push to `gh-pages` deploys.

---

## Self-review notes

- **Spec coverage:** every spec item maps to a task:
  - R-1..R-8 → Global Constraints and tests in Tasks 8, 10 and 13.
  - 3.1–3.3 (trip flow, slots, help) → Tasks 10 and 11.
  - 3.4 (the show) → Task 11.
  - 4.1–4.5 (layout, routes, features, rules) → Task 6.
  - 4.6–4.7 (scenery, farmyard, props, reset) → Tasks 6, 7 and 10 (`startShow` resets the props).
  - 5.1 → Task 2. 5.2 (including A-15 farmyard animals and A-16 delivery into the barn) → Task 9.
  - Spec v1.2 changes (T-1..T-5 sizes, T-17 edges, T-28 barn look, T-29..T-31) → Task 7b.
  - 6.1–6.3 → Tasks 8 and 10.
  - 7.1 → Tasks 3–4. 7.2–7.4 → Task 5.
  - 8.1–8.3 → Tasks 10–12.
  - Sections 9 and 10 → Task 14.
  - Section 11 → Tasks 1 and 15. Section 12 → Tasks 11 and 12.
  - T-13..T-16 → Task 13.
  - B-7 slow motion and B-12 cheer → Task 10. W-7 → Task 11 (the `glow` letter animation).
- **Known judgment calls the executor must not skip:**
  - Task 2 Step 4: palette thresholds for the recolors.
  - Tasks 3 and 4: physics tuning loops.
  - Task 7 Step 6: the fence-piece and bale orientation checks in the first screenshot.
- **Hiding bushes** sit beside plain straight or gate tiles, 7 m from the centerline (just off the road edge). This keeps them clear of the scenery rule (more than 3.5 + 1.5 + r) while the tail stays visible from the road.
- **Routes never meet:** each route uses only its own corner of the farm (`regionOf`), and the two corners only touch at the farmyard.
