# Phase 3j (Rally): notes

## Outcome
Rally 0.4.0 runs fully on lion-hawk 0.10 (phase-3):
- Sim: `defineGame` with the World and injected Rapier (the entry calls `defineGame({ ...rallySpec(), physics: rallyPhysics(R) })`). Ground, pad features, gate posts, marker posts, cones and the car are World entities with registry materials; the car hull is the round box. The track terrain goes through `createTerrain`. The wheels write part poses (`e.partXf`). Rally's ray-cast vehicle stays game code.
- Assets and build: `baked/` from `lion-hawk bake`; `lion-hawk build` / `lion-hawk dev`. `build.py`, `bake.mjs`, `dev.mjs` and `src/assets.json` are retired.
- View: the engine renderer, light-rig presets, asset loader, material compiler (WIND for the verge grass, `extend` for the snow surface and the banner glow, `depth` for the snow's shadow pass), view sync (the car's model and its wheel part poses), `createInstances` (cones, markers, cover), `createTerrainMesh`, and the travel chase rig plus mount rig.
- Goldens: bit-exact from start to finish; no re-bless was needed (see Decisions for the car materials).

## Baselines (Task 1, four43 e6b384e, engine 0.8.0)
- Single-file page: 5916590 B, 2055491 B gzip.
- perf (SwiftShader, 1280x720; frameMs is rAF-quantised under software GL, so read it coarsely):

| scene | programs | calls | frameMs | settleMs |
|---|---|---|---|---|
| pad-gravel | 9 | 17 | 33.3 | 768 |
| pad-snow | 11 | 20 | 333.3 | 1575 |
| track-summer | 9 | 56 | 266.6 | 981 |
| track-winter | 9 | 55 | 133.3 | 923 |

  Load settle median 1342.9 ms (3 loads).
- Feel baseline: test/feel-baseline.json.
  - Stage times (s): t1 261.17, t2 231.97, t3 215.93 (t1 is a little over the brief's rough 100-250 s guess; recorded as measured).
  - Verge: grassTop 83.87 km/h, gravelTop 183.96 km/h, grassCoast 0.552 g, gravelCoast 0.133 g, offRoad (km/h after 4 s) 31.05, 30.65, 49.65, 50.72.
- Bake (Task 3, `lion-hawk bake`, registry hash 9f901504 in phys.json): GLB bytes cone 4304, hatchback-sports 23096, sedan-sports 24260, wheel-racing 5780. Vertex counts baked vs today's assets.json (weld lowers them; triangles are identical): hatchback-sports 2048 vs 3709 (wheel 288 vs 528 each, body 896 vs 1597), sedan-sports wheels 288 vs 528 each (body and spoiler welded too), wheel-racing 336 vs 528, cone 176 vs 288.

## Golden re-blessings
| Task | Cause | Feel table | Commit |
|---|---|---|---|
| 4–9 | none: both goldens stayed bit-exact through the build switch, the registry surfaces, the World's Rapier world, and ground/props/car as World entities (with the car materials below) | stage t1/t2/t3 261.171/231.971/215.929 s → identical; grassTop 83.874, gravelTop 183.959 km/h, grassCoast 0.552, gravelCoast 0.133 g → identical; offRoad 31.05/30.65/49.65/50.72 → 43.90/33.16/33.64/50.71 km/h (see Playtest items) | the Task 7–9 commit |

## Decisions
- Task 6: the load test checks the clock on every step that is still loading. The step that ends a load runs physics after the build, as any step does, so the plan's single check after the loop was one step too strict.
- Task 6: the raw-body test gives its body a ball collider. A collider-less body has no mass and never falls in Rapier 0.21.
- Tasks 7–9: the car's materials keep today's car–ground contact. The old raw colliders used Rapier's Average rule (hull 0.3 with ground 0.8 gave 0.55, cabin 0.45 gave 0.625, restitution (0.1 + 0) / 2 = 0.05). Under the engine's √f Multiply and Max rules the registry now holds car-hull friction 0.55² / 0.8 = 0.378125 and car-cabin 0.625² / 0.8 = 0.48828125, both with restitution 0.05. With the plan's 0.3 / 0.45 / 0.1, stage t2 went 231.97 → 251.34 s (+8 %), and track.mjs t2 stage left the road (|d| 6.014 m > 6). With the compensated values, both goldens and every stage time are bit-exact. phys.json was re-baked for the new registry hash.
- Task 8: cones are a 33-point convex hull (apex and a 32-point ring), because the phase 3 collider shapes have no `cone`. They appear only on the pad, which is in neither golden.
- Task 8: the "posts asleep" test allows 1e-3 m, not 1e-6. A post falls for one step of gravity (about 1e-4 m) before the World puts it back to sleep, as the old afterStep did.
- Task 9: the inertia test compares sorted principal values. Rapier sorts the principal axes when a collider sits off the centre of mass, before and after the port alike (the tensor is the same).
- `// lh-allow:` lines (the done-when test requires the waiver on the same line as the code): src/vehicle.js:95 (massProps, D3: the cars.js mass and inertia) and src/vehicle.js:214 (the wheel raycast, L-1).

- Task 10: the done-when rules ban `density:` / `density =` anywhere outside the registry, so the track setting `density` (mild/wild) is now `obstacles` (its UI label). Settings v5 migrates a saved `density`; bests keys are unchanged (they join values). The pad texture's speck `density` is `specks`.
- Task 10: the Rapier import is allowed only in a file that calls `defineGame`, and the sim tree may not import Rapier. So `game.sim.js` exports `rallySpec({ bests })` (the spec without physics), and `src/main.js` calls `defineGame({ ...rallySpec(), physics: rallyPhysics(R) })`. Tests use `rallyGame({ rapier })`, which does the same.
- Task 10: `checks.zeroAlloc` runs alone in `test/lh-alloc.test.mjs`. Sharing a process with the determinism runs gave noisy readings (10 kB to 140 kB over 10 000 steps, not growing with steps).
- Task 15 (as first landed): the car entity was `{ model, draw: false, partXf }`, drawn by the `carView` sync hook through a placeholder (a shell and four empty wheel nodes) filled once its GLB loaded; the stage view held all 3D (`ready`) until the preload resolved; and `Vehicle` wrote the part poses at creation so prev was not identity. **Removed on lion-hawk 0.10.2** (see Integrator requests): the car is a drawn `{ model, partXf }` entity. View sync clones the model once it is loaded (0.10.1) and `carView` is a plain create hook that shapes that clone in place (body into the scaled shell; wheel nodes reset, scaled to the radius, tyre material), registered once per page. Sync binds the wheel nodes on whatever object the hooks leave (0.10.2) and puts each node's centre on its hub. The spawn desc seeds `partXf` at the static compression (curr and prev), so a render before the first step has the wheels on their hubs; the `writeParts(xs)` call at creation is gone. The `ready` gate is gone: the stage view still starts `assets.preload(MODELS)` (nothing loads models otherwise) and `view.wait`s it, and `Renderer.setWorld` waits for it only to build the pad's cones.
- Task 14: one material per surface texture, detail texture and banner, cached at module level, so rebuilds never grow `mc.made()`. The pad paint (an unlit MeshBasicMaterial before) is `pad-paint`: lit, emissive 0.45 and 0.8 opacity. The banner face's emissive map is a compiler `extend` (`rally-banner-glow`: emissive = diffuse × 0.35). The snow surface is `extend('rally-packed', 'rally-snow')`. Its shadow-pass `customDepthMaterial` was a raw `MeshDepthMaterial`; **removed on 0.10.2**: it is now `mc.depth(material)`, and the `rally-snow` patch returns after the vertex displacement when called with `{ depth: true }`. The car body no longer receives shadows, as before (the GLB clone defaulted to on and showed acne).
- Task 13: `look.color` is white on the `rally-<surface>` materials, so the pad's surface texture carries the colour as before (the base library's colours darkened it).
- Task 16: cameras through `createRallyCamera` (travel chase plus title orbit; mount rig for bumper and bonnet). They match the old updateCamera frame by frame in landscape (test/camera.test.mjs). Portrait is 4° wider (playtest).
- Final-pass Tasks 18 to 20, done on 0.10.2:
  - Task 18: the stage view's `built` hook is back: it hands a load's new world to `Renderer.setWorld` under `view.wait`; `frame` calls `setWorld` only for a world `built` did not see (first enter, jumps). `setWorld` marks `<html data-rally-track="<seed>|pad">` once the view is in the scene; `test/built.browser.mjs` (in `test:e2e`) checks a seed change ends with the new track. Mutation: the test stays green with the `view.wait` dropped from `built` and from `frame`, because the track view module is already imported, so `setWorld` resolves within the build's slot. It pins the outcome, not the wait.
  - Task 19: the screens follow `<html data-lh-overlays>` (title; pause or results hide the touch controls). The body keeps only the game-state classes `onTrack`, `manual` and `timed`; `scr-title`, `scr-play` and `menuOpen` are gone (template CSS, e2e, tracks-spec).
  - Task 20: the stage keeps its scene `ctx` in a `WeakMap` keyed by the state, not in `s.ctx`; a flow test checks `'ctx' in state` is false and a rebuild still works.

## Done-when evidence
- `games/test/phase3-done.test.mjs` with `rally` in MIGRATED (local only): pass.
- Unit: `npm test` green (node tests plus the script suites). Browser: e2e 4/4, render 4/4, offline 1/1, mobile 797/797.
- After the 0.10.2 clean-up: unit 72/72 plus the script suites, both goldens bit-exact (no re-bless); e2e 9/9 (e2e 4, render 4, built 1); mobile 797/797; phase3-done with `rally` in MIGRATED (local only): pass.

## Frame rate (R1)
SwiftShader, 1280×720. frameMs is rAF-quantised under software GL; read it coarsely.

| scene | programs before → after | calls before → after | frameMs before → after |
|---|---|---|---|
| pad-gravel | 9 → 7 | 17 → 17 | 33.3 → 50 |
| pad-snow | 11 → 9 | 20 → 20 | 333.3 → 433.4 |
| track-summer | 9 → 8 | 56 → 56 | 266.6 → 383.4 |
| track-winter | 9 → 8 | 55 → 55 | 133.3 → 216.6 |

Page 5 188 KB (1 899 KB gzip) plus 56 KB of models; load settles in a median of 935 ms (was 1 343). Software-GL frame times rose: record them as a field-note candidate. User item: compare iPad frame rates on these scenes (Safari's frame meter; Rally has no `?fps`). If the median frame time regresses by more than 10 %, set `shading: 'lambert'` in `RENDER` (D5).

## Contract issues
- Task 3: the bake de-duplicates part names against every node and the scene (spec 3d C3), and the single-part GLBs have a root node named like the model. Baked part names are `wheel-racing-2` and `cone-2` (phys.json `parts` and colliders' `part`, GLB node names), not `wheel-racing` and `cone`. The brief's parity test expected the old names, so test/bake.test.mjs carries a `BAKED_NAMES` map for those two models (triangle counts unchanged: 332 and 172). The view (Task 13) must look up `wheel-racing-2` / `cone-2`, or a source rename must be asked of the engine.

## Integrator requests
- View sync and unloaded models: `add()` clones `e.model` on the first frame it sees the entity, which throws until `assets.preload` resolves. Request: skip, and retry each frame, an entity whose model `!assets.has(key)`. Also rebind part nodes when a later hook's `create` supplies the object (`r.pv` is set on the first bind even with no object). Status: done in 0.10.1 / 0.10.2; Rally's `draw: false`, placeholder and `ready` gate are removed (Decisions, Task 15).
- Part poses' prev half starts at identity, so a render before the entity's first step (manual `?lh-test`) interpolates the parts from the origin. Request: initialise prev from curr on the first swap, or at spawn after the game writes them. Status: done in 0.10.2 (rest pose before the first step; spawn-desc seeds); Rally seeds the wheels in the spawn desc.
- Compiler depth material for displaced surfaces. Status: done in 0.10.2 (`mc.depth`); the snow uses it.

## Removed or renamed tests

## Playtest items
- Pad paint lines are now lit (a little self-lit) rather than unlit, and the start/finish banner glow comes from a shader patch: check that they read the same.
- Portrait FOV is 4° wider (3e's base 64 versus 60).
- Off-road feel sample (feel.mjs offRoad, half throttle into rough grass for 4 s): 31.05/30.65/49.65/50.72 → 43.90/33.16/33.64/50.71 km/h, outside the ±3 % / ±1 km/h tolerance. The sample is chaotic: the car hops on rough terrain and its body strikes the ground. On the pre-port code, raising the heightfield friction from 0.8 to 0.8001 moves the same spots to 31.51/10.85/19.25/49.88. The remaining difference is f32 rounding in √f·√f against the old average, on hull–terrain strikes. Stage times and top speeds and coast decelerations on the flat are unchanged. Playtest: drive off the road into rough grass and confirm the car still bogs down and bounces as before.

## Field note candidates
- Light rig `follow(x, z)` ignores height.
- The compiler cache keyed by `map.uuid` leaks with per-instance textures.
- A `cone` collider shape.
