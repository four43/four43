# Phase 3l Tractor Pickup: notes

Plan: lion-hawk-engine `docs/plans/2026-10-13-phase-3l-tractor.md`. Branch `feat/lion-hawk-3-tractor` (base e6b384e).

## Outcome

Tractor Pickup 1.9.0 runs on lion-hawk 0.10.1: the World with injected Rapier, the terrain, vehicle and coverage kits, the material
registry, `lion-hawk bake`/`build`, the engine renderer, light rig, assets, compiler paint, view sync, chase rig, audio service, the
fx kit, and multiplayer on the World net part (NET_VERSION 4, solid driven trains that honk on contact). One done-test item is open on
the engine: the hitch joint still names `JointData` (Integrator request 1). Not done (2g parked minors, plan Tasks 27 to 29): the #95,
#100, #105, #108 workaround removals, the bind/session/book minors and the tune-label minors; the R1/R3 perf browser suite (Task 20).

## What landed

- Task 2: `src/defs/materials.js` (`defineMaterials` accepted every field and value as written, including `fill` and `sg` beside `extends`), `test/materials.test.mjs`, `defs` added to the purity sim roots. The "every bake rename target" test waited for Task 3.
- Task 3: `game.config.js`, `baked/**` (40 GLBs, 8 `.anim.json`, `phys.json`, `manifest.json`, 1.1 MB), parity and bake tests, `test/fixtures/assets-counts.json` (40 models), `bake.mjs` deleted, `"bake": "lion-hawk bake"`, `meshoptimizer` `~1.2.0` devDependency. Bake decisions: `weld` stays on for every model (parity vertex counts matched, no per-model `weld:false`). Bake notes (not errors): `rock`, `rockA`, `rockB` report "flat, so it has no default hull" (the lone part is a flat grass-material mesh; they still bake with one collider each). Parity test keeps an explicit name table for five one-mesh props (bale, barrel, cone, hay-bale, shrub): the engine dedupes the part name against the same-named root node and bakes it as `<name>-2`; counts are compared unchanged. `meshoptimizer` is not resolvable from the game (only in the engine's node_modules and the lockfile is the integrator's): tests ran with an untracked, gitignored symlink `node_modules/meshoptimizer` to the engine's copy; the integrator's `npm install` makes it real.

## Decisions

- R1 Notes live here (ruling P7), not in the engine repo.
- R2 "R3 today" is measured from the read-only committed 1.8 page `site/exp/tractor-pickup/index.html`; `build.py` is never run in a four43 checkout (addendum).
- R4 `world.R.JointData.spherical` in `src/sim/hitch.js` stays until the engine offers a descriptor form (Integrator request 1).
- R6 `test:peers` script lands with `test/net.peers.browser.mjs` (Task 26, ruling P6).
- R7 3a-R6: the iPad gesture e2e is run once on engine 0.8.0 in Task 1 (result below).
  - Result (Task 1): e2e.browser.mjs on engine 0.8.0, unchanged game: 14 tests, 14 pass, 0 fail.

## Done-when evidence

- Unit (`npm test`): see the final commit's message for the counts; e2e 13/14: the iPad 1 s-hold gesture test fails at load
  average 13 to 22 (its own field note: at ~2 fps under SwiftShader a 150 ms tap spans a 1 s hold); it passed alone at load 13 after
  Task 4. Playtest/re-run item on a quiet machine; `test:peers` 1/1; `lion-hawk bake --check` exit 0; `lion-hawk build --out <scratch>`: html 5941.5 KB (gzip 2318.3
  KB), assets 875.5 KB (gzip 226.7 KB), total gzip 2720.0 KB (1.8 page gzip 2369.8 KB plus assets: within R3).
- `games/test/phase3-done.test.mjs` with tractor-pickup in MIGRATED: one violation left, `src/sim/hitch.js` `JointData` (request 1).

## Vehicle kit (Task 13)

No re-bless 2: the slide help, turn help, yaw clamp, self-righting and jackknife impulses run in one system after `VEHICLE_SYSTEM`
and before `lh.physics.step` (`src/sim/wheels.js`), as they ran after each `updateVehicle` before, and both goldens stayed bit-exact.

## Re-bless 1 (World)

Causes (Task 11): every body and collider through `world.spawn` in the old creation order (ground, ramps, walls, props, trees, tractor,
cars); friction `√f` with Multiply and restitution Max (D4, M-9) in place of Rapier's Average; the tractor's colliders carry no density
under `massProps` (the old 0.1 density added about 1 kg); collision groups by name (same bits); the heightfield through
`heightfieldDesc` (row-major, transposed from the x-major grid). Unchanged by Task 10 (registry surfaces): the same golden hashes at the end
of Task 9 and Task 10 (drive 205b516f, pickup 95c3dbd4). The first differing trail checksum is the first one (step 59): the change is
from the first contact on.

| metric | before (1.8 path) | after (World) |
|---|---|---|
| drive-seed14 hash | 36a5f1c2 | 205b516f |
| drive: tractor at step 900 (x, y, z) | 52.248, 0.0728, 6.519 | 52.228, 0.0728, 6.590 |
| drive: events | horn 2 | horn 2 |
| pickup-seed14 hash | 3b511221 | 95c3dbd4 |
| pickup: tractor at the end | 53.257, 0.0591, -6.727 | 53.261, 0.0594, -6.730 |
| pickup: boops / launches / lands, riders | 3 / 3 / 3, 3 | 3 / 3 / 3, 3 |
| feel: course seconds, boops | 45.283, 2 | 45.283, 2 |
| feel: bumps per peer, separation | 3, 3, 4.938 m | 3, 3, 4.933 m |

All feel samples are inside their tolerances (±3 %, ±1, ±1, ±0.5 m).

## R1 / R3 numbers

## lh-allow lines

- `src/sim/tractor.js:44` `massProps` (D3): the playtested 1400 kg and tuned inertia.

## Playtest list

- Solid trains in a real WebRTC room: bump feel, one honk per bump; no shared clock between real devices (unprojected snapshots).
- Solid tractors in the barn: a second train that comes to wait meets the first one's tractor head-on; the barn tests drive separate
  lanes. Check whether the waiting train should stop before the barn.

- Shading is the compiler's `standard` tier (roughness 1 looks for the vertex-coloured art) in place of 1.8's Lambert; gold keeps metalness.
- Fx and gibs on the fx kit: a landed cube rests at floor + size/2 (1.8: + 0.03); a gib shrinks over the last half of its ~5 s life
  (1.8: rests 3 s, then shrinks over 1 s); gibs land on the terrain height (1.8: y = 0).
- Other players' trains (until Part E): drawn from the baked models without turning wheels.
- Animal animation phases start from the animal id (1.8: Math.random in the view).

- Dirt per metre (Task 13b, coverage kit): `route` 0.006/9, `meadow` 0.004/9, `mudhole` 0.6/4.5 per metre, equal to 1.8 at Medium speeds and at mud
  top speed. Low power now dirties 1.5x faster and High 0.75x as fast on gravel and grass; a tractor standing in mud no longer gets dirtier;
  slow driving in mud dirties less. Check the look of a muddy run.

## Contract issues

## Integrator requests

5. **Net part (3i): a reused player number with a lower clock stays invisible (engine).** After `removed()` forgets an owner-kind id,
   the REPEAT removal frames that follow (stamped `old time + 1`) are applied to the now-empty store entry and leave a tombstone
   (`createStore.apply`'s removed branch sets `{ rec: null, t }` for an absent id), so a new player given the same number, whose wall
   clock is lower, has every record rejected as older (M-26). 1.8's guest forgot by the roster's `join` counter. Wanted: a removal for
   an id with no entry leaves none (or `world.net.forget(kind, netId)` for the game). Three mp tests are `todo` on this.

4. **View sync draws a model only once it is loaded (engine).** `createViewSync` clones an entity's `model` on the first frame it sees
   it and throws `assets: '<key>' is not loaded` while `assets.preload` is still running. Wanted: sync skips (defers) an entity whose
   `assets.has(model)` is false and draws it on the first frame after it loads. Done in engine 0.10.1; the game's interim gate is gone.

1. **`world.joint` without `JointData` (blocking at merge, not now).** `games/test/phase3-done.test.mjs` bans the `JointData` identifier in game code, but lion-hawk 0.8.0 `world.joint(a, b, data)` only takes raw Rapier joint data, so the trailer hitch writes `world.R.JointData.spherical(frontAnchor, TR.tongue)`. Wanted: `world.joint(a, b, { type: 'spherical', a: [x, y, z], b: [x, y, z] })` (the engine builds the JointData), or the done test waives `world.joint` lines.
2. **`games/package-lock.json`** after `games/tractor-pickup/package.json` changes (plan request 1).
3. **`games/test/**`** references to `build.py`, `src/assets.json`, `TP_MP` or the old mp world (plan request 2), if any.

## Removed or renamed tests

- `test/golden-farm.test.mjs` (Task 9: the direct createGame path is gone; its engine-path runs moved into `golden.test.mjs`).
- `test/matSplit.test.mjs`, `test/shadows.test.mjs`, `test/warm.test.mjs` (the engine's hygiene); `stepGib`'s test (gibs on the fx kit).
- `test/interp.test.mjs`, `test/forecast.test.mjs`, `test/replica.test.mjs` (engine code behind game re-export shims; the shims went).
- `test/mp.interop.test.mjs` (1.8-wire interop is impossible under NET_VERSION 4) and the custom-kinds "binding table" test (no bindings).
- The M-50 frozen-frame test is rewritten for the engine path (wall held while steps run); the soft-bump feel test retired (solid trains).

## Field note candidates
