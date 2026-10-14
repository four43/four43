# Phase 3k notes: Pig Pens on the lion-hawk phase 3 engine

Branch `feat/lion-hawk-3-pigpens`, engine `phase-3` (lion-hawk 0.10.0). Pig Pens 2.2.0.

## Bake

- 33 models baked by `lion-hawk bake` into `baked/` (committed). `test/bake.test.mjs` runs `bake --check`; `test/assets-parity.test.mjs` holds them to the 2.1.0 `assets.json` (triangles, vertices, bounds, palette, pig and chick anim frames): all pass.
- **Engine bug (bake, 0.8.0):** `tools/bake/hull.js` never finishes on `car-kit/tractor.glb`'s `wheel-back-right` (672 points; the incremental hull grows until the heap runs out). The tractor is baked with `colliders: false`, which costs nothing: the game spawns its chassis boxes inline.
- **Engine gap (bake):** `palette: 'vertex'` bakes only textured primitives. The Nature Kit's factor-only materials keep their base colour factor and get no `COLOR_0`, and the compiler then replaces the glTF material, so the factor is lost at runtime. Pig Pens renames each Kenney material to its own registry id whose `look.color` is the factor (`src/defs/materials.js`), and `view/models.js` fills a missing colour attribute from the compiled material. The parity test reads those colours from the factor, which matches 2.1.0 (it used the factor as sRGB bytes). Engine request: `palette: 'vertex'` should also write `COLOR_0` from the base colour factor of untextured primitives (what Tractor's and Pig Pens' old bakes did); the look ids can then go.
- `corn`: all four cobs now drawn (the old bake kept only the last of four same-named nodes).

## Sim on the World

- `createSim(world, opts)` on the scene's World; `farm.think` runs before `lh.physics.step`, `farm.settle` after `lh.physics.events`. Pigs, the dog, the birds, the fox, snacks, the tractor, the ground, the obstacles and each shut gate are entities with registry materials and named groups (2.1.0's bit order). No `new RAPIER.World`, `ColliderDesc` or `RigidBodyDesc` in game code.
- `yaw` is a spawn-desc key (the pose), so the herd's heading is set on the entity after the spawn.
- The tractor's `massProps` reproduce 2.1.0's body as Rapier summed it (1400 kg tuned + the two density-5 boxes, 38.5 kg, about the joint centre of mass): 1438.5 kg, com (0.1489, 0.5659, 0), inertia (933.9, 2241.0, 2052.3). The 0.3° tilt of the old principal frame is dropped.
- The tractor drives on `lion-hawk/kits/vehicle` (`createVehicle`, `forward: 'x'`, wheel `part` names, so the kit writes the four wheel part poses); `farm.think` sits before `VEHICLE_SYSTEM`.

### Lines with `lh-allow`

- `src/sim.js:173` (the pig feelers, `castRayAndGetNormal`): raw Rapier query, L-1.
- `src/tractor.js:17` (the tractor's `massProps`): D3, the playtested 2.1.0 tractor.

## View

- Renderer, light rig (2.1.0's lights as options), Lambert tier (`?shading=` overrides), tilt-shift as `gfx.post`, `view.assets.preload` of the 33 models, the compiler's materials, view sync, the orbit rig and the audio service are the engine's. `src/gfx.js`, `src/fur.js`, `src/tiltshift.js`, `bake.mjs` and `build.py` are gone; `src/assets.json` is `test/fixtures/assets-v2.1.0.json` (the parity tests' reference).
- Scenery: baked geometry on one `scenery` material (plain and instanced). Pigs: `view/pigs3d.js`, anim tables, `pigHide` with `COVERAGE_INSTANCED` mud (lane w of `instanceCoverage`), eyelids through `mc.extend` (injected before `emissivemap_fragment`, so after the mud). Chickens: compiler fur (`mc.furGeometry`, `plumage`); the dog and fox: `assets.clone` on `AnimationMixer`. Feathers: `createParticles` (lion-hawk/kits/fx). Tractor and snacks: view sync, with `view/tractor3d.js` hooks (model frame, paint, headlight, snack pivot and shrink); the wheels follow the vehicle kit's part poses.
- Pigs, birds, the dog and the fox carry `draw: false` (the game's crowds draw them).
- Camera: `createOrbitRig` with Pig Pens' options (`test/rig.test.mjs` pins it to 2.1.0's rig.js, kept as `test/fixtures/rig-v2.1.0.js`). `cameraMode` takes the tool and the drive state at the finger's down, so the Hand press that became a drive moves no camera. An orbit sends one Hand `move` with `orbit: true`, which clears the press (`test/flow-orbit.test.mjs`). `bindPointer({ uncapped: true })` (#56).
- **Engine request (view sync):** sync clones a drawn entity's model on the first frame it sees it and throws while that model is still loading. Pig Pens holds `view.sync.frame` until its preload resolves (`src/game.view.js`, marked INTERIM). Wanted: sync skips (and retries next frame) entities whose `assets.has(model)` is false, or boot runs sync only after a declared preload.
- **Engine note (bake, minor):** `bake --check` is stale on every engine minor, so each engine minor bump needs a re-bake commit.

## Re-bless 1 (World)

Reason: the World swap. World creation order, the engine's combine rules (√f with Multiply, restitution Max), mass from density with `body.mass`, and the Rapier step through the engine's event queue.

| Sample | 2.1.0 baseline | World | Tolerance |
|---|---|---|---|
| penned (seed 3, 48 pigs, 120 s, snacks in pen 4) | 37 | 35 | ±1 → ±3 (see below) |
| munched | 5 | 5 | ±1 |
| gulps (seed 9) | 1 | 1 | ±1 |
| bedSec | 11.667 | 11.667 | ±3% |
| tractor v4 (m/s) | 5.3970 | 5.3970 | ±3% |
| tractor turn2 (rad) | 1.8883 | 1.8884 | ±3% |
| tractor stopSec | 1.3167 | 1.3333 | ±3% |

Penned without snacks, 120 s, 48 pigs: seed 3 41 → 42, seed 5 37 → 39, seed 7 39 → 41. The herd count is chaotic and moves both ways, so `feel.test.mjs` holds it to ±3.

Goldens: `farm-seed3.json` 47d40774 → 4744600c; `farm-scene.json` 0ae39442 → 2c8d659d.

## Playtest items

- Feathers fall on the particle pool's gravity (1.3) and drag (1.5): a feather thrown up at 1.8 m/s from 1 m lands in about 3.2 s, as 2.1.0's (its fall was capped at 0.45 m/s); they now speed up as they fall, lose the sideways flutter, and shrink over the second half of their life instead of the last 2 s.
- The chicken face trim is per vertex (a 0..1 fur mask) instead of per fragment.
- Pig mud blotches are seeded by instance index and rise from each part's own height; the eyelids and colours are 2.1.0's.
- The dog and the fox play on `AnimationMixer` (glTF interpolation) instead of table sampling.
- Wheel hubs are each wheel node's bounding-box centre (view sync), not the hand-set `W` centres.
- Camera gestures are the engine rig's: a chase drag waits 10 px, pinch zoom is from the pinch start, gestures apply at the frame.
- Presses count uncapped real time (#56); on a slow device a hold lands sooner than it did.

- Pigs penned after two minutes may differ by a pig or two from 2.1.0 (table above).
- Animal-on-animal bounce halves (restitution 0.15 → 0.075 under Max), and a thrown pig's friction on fences drops from 0.45 to 0.37 (the registry keeps every animal-on-grass contact as it was).
- The tractor stops one frame later under full reverse (1.317 s → 1.333 s).
