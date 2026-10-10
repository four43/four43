# Generated Tracks — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive procedurally generated loops and stages (hills, mixed surfaces, jumps/whoops,
knock-over markers) in free drive, with the test pad kept as a world.

**Architecture:** Pure-data generators in `src/gen/` (no Rapier, no three.js) produce a `Track`;
`src/world/` turns a Track or the pad into a `World` that `Sim` builds colliders from;
`src/render/` draws a World. Spec: data shapes and requirements T-1 … T-12.

**Tech Stack:** plain ES modules, three.js 0.160, @dimforge/rapier3d-compat 0.14, esbuild,
Node test scripts (`check(name, val, lo, hi)` style, see `test/physics.mjs`).

**Spec:** `docs/spec/tracks-spec.md` (read its "Data shapes" section first — it is the contract
between tasks). Car/physics background: `docs/spec/rally-spec.md`.

## Global Constraints

- Units metres/radians; heading 0 = +z, `heading = atan2(dx, dz)`; + curvature = left; `d` + = left.
- Generators are deterministic: same seed + options ⇒ identical output. All randomness from
  `src/gen/rng.js` (`rng(seed)`, `.fork(label)`); never `Math.random()` in `src/gen/`.
- `src/gen/` imports nothing from three.js or Rapier.
- Match the surrounding code style: terse ES modules, short "why" comments, no classes where a
  function will do, no new dependencies.
- Tests are Node scripts in `test/` that print `PASS/FAIL name: value [lo..hi]` and exit non-zero
  on failure, runnable as `node test/<file>.mjs [filter]`.
- Do **not** git commit (the user commits). Do not edit files owned by another task.
- Existing tests must keep passing: `node test/physics.mjs && node test/snow.mjs`.

## File ownership

| Task | Owns (creates/edits) |
|------|----------------------|
| 0 (done) | `src/gen/rng.js`, `src/gen/noise.js` |
| 1 Layout | `src/gen/trackgen.js`, `src/gen/locate.js`, `test/gen-layout.mjs` |
| 2 Terrain+features | `src/gen/features.js`, `src/gen/terrain.js`, `test/gen-terrain.mjs` |
| 3 Surfaces+roadside | `src/gen/surfaces.js`, `src/gen/roadside.js`, `test/gen-surfaces.mjs` |
| 4 Worlds refactor | `src/world/padWorld.js`, `src/render/padView.js`, `src/sim.js`, `src/render.js`, `src/main.js` (world plumbing only) |
| 5 Track assembly (lead) | `src/gen/track.js` |
| 6 TrackWorld + autopilot | `src/world/trackWorld.js`, `test/track.mjs`, `test/autopilot.js` |
| 7 Track rendering | `src/render/trackView.js` (+ a `setWorld` hook in `src/render.js` agreed with Task 4's shape) |
| 8 UI integration (lead) | `src/main.js`, `index.template.html`, `src/ui.js`, `package.json` |

Waves: **A** = Tasks 1, 2, 3, 4 in parallel. **B** = Task 5 (lead), then 6 and 7 in parallel.
**C** = Task 8, browser verification, spec sync.

---

### Task 1: Layouts and locator (T-2, T-7)

**Files:** Create `src/gen/trackgen.js`, `src/gen/locate.js`, `test/gen-layout.mjs`.

**Interfaces:**
- Consumes: `rng` from `src/gen/rng.js`.
- Produces: `generateLayout(r, { kind: 'loop' | 'stage' }) -> Layout`;
  `makeLocator(layout) -> { locate(x, z) -> { s, d, i } }` (shapes exactly as in the spec).

- [ ] **Step 1: Write the failing tests** in `test/gen-layout.mjs` covering, for seeds
  `['a','b','c','d','e','f','g','h']` × kinds: determinism (two calls equal sample-for-sample);
  length band (loop 1500–3000, stage 3000–6000); `max |curvature| ≤ 1/15`; bounds within a 1400 m
  square; clearance (for every pair of samples i, j with along-road separation > 120 m — wrap for
  loops — distance ≥ 40 m; use a 16 m spatial hash, not O(n²)); loop closure (last→first gap
  ≈ ds and heading continuous within 0.1 rad); `heading`/`curvature` consistent with x/z (finite
  differences). Locator: for 2000 random points within 6 m of the road, `locate` returns `s`
  within ±0.5 m and `d` within ±0.05 m of the construction values (build points as
  `x[i] + d * cos(heading)`-style offsets to the left: left normal is `(cos h, -sin h)` in (x, z)
  for heading h = atan2(dx, dz)); loops wrap `s` into [0, length).
- [ ] **Step 2:** run `node test/gen-layout.mjs` → fails (module missing).
- [ ] **Step 3: Implement.**
  - *Loop:* 10–16 control points at angles `2πk/n + jitter`, radii `R·(0.55..1)` with R chosen
    for the target length; closed centripetal Catmull-Rom; resample uniformly at 1 m by arc
    length; then **relax curvature**: iteratively smooth points where |κ| > 1/15 (Laplacian
    smoothing of x/z with re-resampling) until it holds; recompute heading/curvature.
  - *Stage:* build a curvature program: alternate straights (40–250 m) and corners (radius
    15–300 m, sweep 20–170°, random side, bias against long same-side runs), with linear
    curvature ramps ≥ 15 m between pieces; integrate heading → x/z at 1 m; stop at a target length
    drawn from 3000–6000; use a coarse occupancy grid to reject a piece that would come within
    40 m of earlier road or leave the 1400 m box (try other pieces; dead end ⇒ fail attempt).
  - Both: validate (radius, clearance, box, length); on failure retry with `r.fork('try'+k)`;
    throw after 50 tries.
  - Locator: hash samples into 16 m cells; query the 3×3 cells around (x, z) (grow ring if
    empty); take the nearest sample, then refine by projecting onto the segment to the neighbour
    sample for sub-metre `s` and signed `d`.
- [ ] **Step 4:** `node test/gen-layout.mjs` → all PASS; print generation time per layout
  (target < 50 ms).

### Task 2: Obstacles and terrain (T-3, T-4)

**Files:** Create `src/gen/features.js`, `src/gen/terrain.js`, `test/gen-terrain.mjs`.

**Interfaces:**
- Consumes: `rng`, `noise2`, `fbm`; a `Layout` (spec shape). For tests, build synthetic layouts
  in the test file (a 2 km straight; a 400 m-radius circle loop; an S-bend) with fields
  `{kind, closed, ds:1, n, x, z, heading, curvature, length, bounds}`.
- Produces: `placeFeatures(layout, r, { density }) -> Feature[]`, `profileOffset(features, s)`,
  `bermBank(features, s)`; `generateTerrain(layout, features, r, opts) -> Terrain`,
  `heightAt(terrain, x, z)`.

- [ ] **Step 1: Write the failing tests**: determinism; features only where |κ| ≤ 1/120 across
  [s0 − 60, s1 + 40] (except berms, which need a hairpin radius < 40 m); spacing ≥ 300 m mild,
  wild has ≥ 1.4× as many on the 2 km straight; each type's dimensions within spec ranges; terrain
  covers bounds + 150 m; `heightAt` matches `heights` at grid points and is bilinear between;
  road grade (from `road[]` minus feature offsets) ≤ 12 % everywhere; across the road (|d| ≤ 3.5)
  ground = road height + bank·d within 2 cm; at |d| = 5.5 still flattened; by |d| = 20.5 back to
  natural hills (within 5 cm of the unflattened noise); bank ≤ 4° + berm extra ≤ 18°; a kicker's
  lip then a drop in `road[]`; whoops show the configured number of local maxima.
- [ ] **Step 2:** run → fails.
- [ ] **Step 3: Implement.**
  - Features: walk the road in 10 m steps finding stretches that satisfy the clearance rule;
    choose type by weighted pick (`kicker 3, whoops 3, crest 2, tabletop 2`), parameters from the
    spec ranges (`wild`: ×1.4 heights, ×1/1.6 spacing); berms on any corner with radius < 40 m
    (30 % chance). `profileOffset` evaluates the shapes analytically (kicker: smooth ramp to the
    lip then a 0 → −h landing slope back to 0 over `landS`; whoops: `h·sin²` bumps; crest:
    raised cosine; tabletop: ramp/flat/ramp with smoothstep edges).
  - Terrain: hills = `25·fbm(scale 400, 4 oct) + 1·fbm(scale 25, 2 oct)`; sample at the
    centreline → smooth along s (moving average, repeat) until |grade| ≤ 0.12 (wrap for loops);
    add `profileOffset`; bank = clamp(curvature·v²-style factor, ±4°) + bermBank, smoothed.
    Flatten: for each grid cell near the road (iterate samples, stamp a 42 m-wide box, keep the
    nearest sample per cell via a distance buffer), target = road + bank·d; weight 1 for
    |d| ≤ 5.5, smoothstep to 0 at |d| = 20.5; `h = mix(natural, target, w)`. Where two road
    parts' blend zones overlap, the nearer sample wins.
- [ ] **Step 4:** run → PASS; print time for a 3 km loop (target < 1.5 s).

### Task 3: Surfaces and roadside (T-5, T-6)

**Files:** Create `src/gen/surfaces.js`, `src/gen/roadside.js`, `test/gen-surfaces.mjs`.

**Interfaces:**
- Consumes: `rng`; a `Layout`; a `heightFn(x, z)`; `Feature[]` (spec shape; only `s0/s1/type`).
  Tests build synthetic layouts as in Task 2 and use `heightFn = () => 0`.
- Produces: `generateSurfaces(layout, r, { theme }) -> Surfaces`,
  `roadSurfaceAt(surfaces, s) -> { road, verge, next, t }` (t ∈ [0,1] blend into `next` over the
  last 10 m of a section); `placeRoadside(layout, heightFn, features, r) -> Roadside`.

- [ ] **Step 1: Write the failing tests**: determinism; sections tile [0, length) exactly, each
  200–700 m (last may be shorter, ≥ 100 m, merged otherwise); only theme surfaces and allowed
  transitions (summer: gravel–dirt, dirt–tarmac, gravel–gravel no; winter: packed–ice,
  packed–gravel (≤ 15 % of length), snow-key is `packed` in Phase 1, ice never longer than 400 m);
  verge `grass` / `snowbank`; blend t ramps 0→1 over the last 10 m; loops blend the last section
  into the first. Roadside: marker spacing 25 m both sides, 12 m on outsides where
  |κ| > 1/80, all markers 4.5 m (3.5 + 1) from the centreline on their side, none inside a
  feature's [s0, s1] on kickers/tabletops (keep run-ups clear), y from `heightFn`; start gate at
  s = 40 (stage: finish at length − 40; loop: start only); checkpoints every 250 m from the start.
- [ ] **Step 2:** run → fails.
- [ ] **Step 3: Implement** (transition tables as data; markers yaw = road heading).
- [ ] **Step 4:** run → PASS.

### Task 4: Worlds refactor (T-1)

**Files:** Create `src/world/padWorld.js`, `src/render/padView.js`; modify `src/sim.js`,
`src/render.js`, `src/main.js`.

**Interfaces:**
- Produces: the `World` shape in the spec. `PadWorld` (class or factory) with `kind: 'pad'`,
  `build(R, world)`, `ground: Set<handle>` (pad ground collider only), `props` (the cones, `kind:
  'cone'`), `surfaceAt(x, z, collider)` (returns the pad surface; `'snow'` ⇒ `SURFACES.packed`
  as today), `spawn`, `resetProps()`, `setSurface(key)`. `Sim(R, { world, car, surface, assist,
  pos, yaw, cones, pad })`: when `world` is omitted it makes `new PadWorld({ pad, cones,
  surface })` so every existing test call keeps working unchanged. `sim.world`, `sim.props`
  replace `sim.cones` (keep a `cones` getter alias for the pad). Snow field: created by Sim when
  the pad surface is `snow`, `groundHandle` = the pad ground collider (unchanged behaviour).
  `Renderer.setWorld(world)`: removes the previous world's visuals and builds `padView` for pads;
  for `kind: 'track'` it dynamically uses `render/trackView.js` (`new TrackView(scene, world)`
  with `sync()` and `dispose()`; Task 7 writes it — import it lazily or guard if missing).
  Renderer per frame: `view.sync(sim)` syncs props via the world view.
- [ ] **Step 1:** run `node test/physics.mjs && node test/snow.mjs` (baseline: all pass).
- [ ] **Step 2:** move `PAD`, `buildPad`, `coneLayout` into `padWorld.js`; pad visuals
  (ground, rings, ramps, humps, slope, cone instancing, surface textures) into `padView.js`;
  re-export `PAD`/`coneLayout` from `sim.js` if anything still imports them.
- [ ] **Step 3:** re-run both suites → all pass; `npm run build` succeeds; load the dev server
  (`npm run dev`, port 8740 — it may already be running) with Playwright: page loads, no console
  errors, `rally.sim.world.kind === 'pad'`, switching surface to Snow still deforms.

### Task 5: Track assembly (T-2…T-7) — lead

**Files:** Create `src/gen/track.js`.
- `generateTrack(seed, { kind, theme, density })`: `r = rng(seed)`; layout ← `r.fork('layout')`;
  features ← `fork('features')`; terrain ← `fork('terrain')`; surfaces ← `fork('surfaces')`;
  roadside ← `fork('roadside')` with `heightFn = (x,z) => heightAt(terrain, x, z)`;
  `locator = makeLocator(layout)`; spawn on the centreline at s = 10 facing along, y = road + 0.6.
  `roadWidth: 7`.

### Task 6: TrackWorld + autopilot (T-8, T-11, T-12)

**Files:** Create `src/world/trackWorld.js`, `test/autopilot.js`, `test/track.mjs`.

**Interfaces:**
- Consumes: `generateTrack`, `heightAt`, `roadSurfaceAt`, `SURFACES` (`src/tire.js`), the
  `World` shape, `Sim(R, { world, car, assist })` from Task 4.
- Produces: `new TrackWorld(track)` implementing World (`kind: 'track'`, `track`, `recover`),
  `autopilot(sim, track, opts) -> controls` (pure pursuit; target speed from upcoming curvature
  `v ≤ sqrt(0.55·μ·g/|κ|)` and slowing for features), used by tests (and later for the time
  attack run-up distance).
- [ ] Ground: one Rapier heightfield collider from `terrain.heights` — verify the orientation
  and scale with a test that raycasts down at 200 random (x, z) and compares hit y with
  `heightAt` (±2 cm). Friction 0.8, ground collision group as in `sim.js`.
- [ ] `surfaceAt(x, z)`: `locate` → road if |d| ≤ 3.5 else verge, from `roadSurfaceAt(s)`;
  blend `t` by linearly interpolating `mu, C, kp, ap, crr` (cache blended objects by key+t step
  of 0.1; recompute `B`).
- [ ] Props: markers as dynamic cylinders (h 1.2, r 0.06, 5 kg, friction 0.6, can sleep),
  gate posts static. `resetProps()` restores homes. `recover(x, z)`: locate, step back 5 m along
  the road, return centreline point at road height + 0.6 with the road heading.
- [ ] `test/track.mjs`: for seeds ['t1','t2','t3'] × (loop summer, loop winter, stage summer):
  heightfield raycast test; spawn settles on the road (|d| < 1); autopilot drives the whole layout
  (loops: one lap; stages: to the finish) with max |d| < 6 m, no rollover (body up·y > 0.3),
  finishing within a time limit (length / 8 m/s); print laps' sim time and real-time factor.
  Add the 3 suites to `npm test` only if total runtime stays reasonable (report the time).

### Task 7: Track rendering (T-9)

**Files:** Create `src/render/trackView.js`.

**Interfaces:**
- Consumes: a `TrackWorld` (`world.track` with `terrain`, `layout`, `surfaces`, `roadside`,
  `features`; `world.props` with Rapier bodies), three.js scene; `SURFACES` keys for colours.
- Produces: `class TrackView { constructor(scene, world); sync(sim); dispose() }`.
- [ ] Terrain: 64 m chunks; 3 LOD meshes per chunk (1, 2, 4 m vertex spacing) chosen by
  distance to the camera each frame (`update(camera)` called from `sync`), with 2 m skirts to
  hide cracks; vertex colours by verge surface (grass green-brown / snowbank white) with slope
  shading (darker/rockier where steep) — sample via `world.surfaceAt` at vertices.
- [ ] Road: one ribbon mesh along the centreline (left/right edges at ±3.5 m, y = terrain +
  0.03), vertex colours per section road surface with blends (tarmac grey, dirt brown, gravel
  tan, packed white-grey, ice blue); polygonOffset to avoid z-fighting.
- [ ] Markers: InstancedMesh (white post, red/orange reflector band), matrices from bodies each
  `sync`. Gates: two posts + a banner bar, start green / finish chequered (canvas texture).
- [ ] Render check (Playwright on the dev server): call `rally.loadTrack?.(...)` if Task 8 has
  landed, else construct directly in the page via `window.rally` modules if exposed; otherwise
  render-test with a tiny harness page in `build/` — report screenshots' paths.

### Task 8: UI integration (T-10, T-11) — lead

**Files:** `src/main.js`, `index.template.html`, `src/ui.js`, `package.json`.
- [ ] Settings sheet: World (Test pad / Loop / Stage), Seed (text + 🎲), Theme (Summer /
  Winter), Obstacles (Mild / Wild); surface/car rows as today (Surface only for the pad).
  Changing world settings regenerates (`generateTrack` → `new TrackWorld` → `sim.setWorld` /
  rebuild Sim, `view.setWorld`). Seed shown under the top bar. Settings v3 persisted.
- [ ] Reset: track ⇒ `recover`; `Shift+R` / long-press Reset ⇒ full reset. Pad unchanged.
- [ ] `window.rally.loadTrack(opts)` for tests. `npm test` runs all suites.
- [ ] Verify in the browser: loop and stage, summer and winter, drive over a kicker and whoops,
  knock markers, recover; screenshots.
