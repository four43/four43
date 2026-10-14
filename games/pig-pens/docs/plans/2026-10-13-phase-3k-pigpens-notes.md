# Phase 3k notes: Pig Pens on the lion-hawk phase 3 engine

Branch `feat/lion-hawk-3-pigpens`, engine `phase-3` (lion-hawk 0.8.0 at the time of these notes).

## Bake

- 33 models baked by `lion-hawk bake` into `baked/` (committed). `test/bake.test.mjs` runs `bake --check`; `test/assets-parity.test.mjs` holds them to the 2.1.0 `assets.json` (triangles, vertices, bounds, palette, pig and chick anim frames): all pass.
- **Engine bug (bake, 0.8.0):** `tools/bake/hull.js` never finishes on `car-kit/tractor.glb`'s `wheel-back-right` (672 points; the incremental hull grows until the heap runs out). The tractor is baked with `colliders: false`, which costs nothing: the game spawns its chassis boxes inline.
- **Engine gap (bake):** `palette: 'vertex'` bakes only textured primitives. The Nature Kit's factor-only materials keep their base colour factor and get no `COLOR_0`. The parity test reads those colours from the factor, which matches 2.1.0 (it used the factor as sRGB bytes).
- `corn`: all four cobs now drawn (the old bake kept only the last of four same-named nodes).

## Sim on the World

- `createSim(world, opts)` on the scene's World; `farm.think` runs before `lh.physics.step`, `farm.settle` after `lh.physics.events`. Pigs, the dog, the birds, the fox, snacks, the tractor, the ground, the obstacles and each shut gate are entities with registry materials and named groups (2.1.0's bit order). No `new RAPIER.World`, `ColliderDesc` or `RigidBodyDesc` in game code.
- `yaw` is a spawn-desc key (the pose), so the herd's heading is set on the entity after the spawn.
- The tractor's `massProps` reproduce 2.1.0's body as Rapier summed it (1400 kg tuned + the two density-5 boxes, 38.5 kg, about the joint centre of mass): 1438.5 kg, com (0.1489, 0.5659, 0), inertia (933.9, 2241.0, 2052.3). The 0.3° tilt of the old principal frame is dropped.
- The tractor drives on `lion-hawk/kits/vehicle` (`createVehicle`, `forward: 'x'`, wheel `part` names, so the kit writes the four wheel part poses); `farm.think` sits before `VEHICLE_SYSTEM`.

### Lines with `lh-allow`

- `src/sim.js` (the pig feelers, `castRayAndGetNormal`): raw Rapier query, L-1.
- `src/tractor.js` (the tractor's `massProps`): D3, the playtested 2.1.0 tractor.

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

- Pigs penned after two minutes may differ by a pig or two from 2.1.0 (table above).
- Animal-on-animal bounce halves (restitution 0.15 → 0.075 under Max), and a thrown pig's friction on fences drops from 0.45 to 0.37 (the registry keeps every animal-on-grass contact as it was).
- The tractor stops one frame later under full reverse (1.317 s → 1.333 s).
