# Rally Sim — Generated Tracks, Worlds and Game Loop

Status: **Phase 1 live (0.3.1); Phase 2 (game loop) built 2026-10-10, not yet released**: title menu, Free drive / Stage /
Time attack, countdown, timing, splits, laps, bests, pause and results, on the round-3 tracks (Twisty style, verge bumps,
surface drag, tall grass); Phase 3 (fresh snow on tracks) next. Companion to `rally-spec.md` (car,
physics, test pad, snow). Requirement IDs are `T-n`.

## Goals

Procedurally generated tracks to race on, in a world with hills, mixed surfaces and arcade-fun
obstacles (jumps, whoops, tabletops), plus a game loop with modes: free drive, a point-to-point
stage race with a countdown, and a lap time attack with a flying start. The test pad stays as a
world for debugging.

## Phases

1. **World + generators (this round):** split worlds out of `Sim`; generate layouts, terrain,
   obstacles, surfaces and roadside; drive generated tracks in free drive with a seed picker and
   reset-to-road. (T-1 … T-12)
2. **Game loop:** state machine, Stage and Time attack modes, countdown, timing, splits, bests,
   HUD. (T-20 … T-26)
3. **Fresh snow on tracks:** deformable snow following the terrain, masked to snow sections.

## Architecture

Pure-data generators feed a `World`; physics (`Sim`) and rendering (`WorldView`s) consume the
world; the game layer reads car state and track progress and never reaches into physics.

```text
seed ──► gen/track.js ──► Track (pure data) ──► world/trackWorld.js ──► Sim (Rapier) ──► Vehicle
              │  layout, terrain, features,            │ colliders, surfaceAt,      │
              │  surfaces, roadside, locate            │ props, spawn, progress     ▼
              ▼                                        ▼                         game/ (Phase 2)
         tests in Node                          render/trackView.js
```

| Path | Role |
|------|------|
| `src/gen/rng.js` | Seeded PRNG (mulberry32), string seeds, `fork(label)` sub-streams |
| `src/gen/noise.js` | 2D gradient noise + fBm |
| `src/gen/trackgen.js` | Road layouts: loop and stage (T-2) |
| `src/gen/features.js` | Obstacles placed along the road (T-4) |
| `src/gen/terrain.js` | Heightfield, road height profile, flattening, banking (T-3) |
| `src/gen/surfaces.js` | Surface sections and verges along the road (T-5) |
| `src/gen/roadside.js` | Marker posts, gates, checkpoints (T-6) |
| `src/gen/locate.js` | Nearest-centreline queries: position → distance along / across road |
| `src/gen/track.js` | `generateTrack(seed, opts)`: runs the generators in order |
| `src/world/padWorld.js` | Today's test pad as a World (moved out of `sim.js`) |
| `src/world/trackWorld.js` | A generated Track as a World |
| `src/render/padView.js` | Pad visuals (moved out of `render.js`) |
| `src/render/trackView.js` | Terrain chunks, road ribbon, markers, gates |
| `test/gen.mjs` | Generator tests (Node) |
| `test/track.mjs` | Driving generated tracks headless (autopilot) |

## Coordinates and units

Metres, radians. World x/z horizontal, y up. Heading 0 = +z, heading = `atan2(dx, dz)`; positive
curvature turns left (towards +x when heading +z). Distance along the road is `s` (m), measured
from the layout's start. Lateral offset `d` is positive to the left of travel.

## Data shapes (interfaces between components)

```js
// gen/rng.js
rng(seed: string | number) -> { next(): [0,1), range(a, b), int(a, b) /*inclusive*/, pick(arr),
                                fork(label: string) -> rng }   // deterministic per (seed, label)

// gen/noise.js
noise2(seed) -> (x, z) => [-1, 1]                // smooth gradient noise, period-free
fbm(n, x, z, { octaves, lacunarity = 2, gain = 0.5, scale }) -> number

// gen/trackgen.js
generateLayout(rng, { kind: 'loop' | 'stage', style: 'twisty' | 'flowing' = 'twisty' }) -> Layout
LENGTHS[style][kind] -> [lo, hi]  // length band (m)
Layout = {
  kind, style, closed: boolean, // loop: closed, last sample joins the first
  ds: 1,                        // sample spacing (m)
  n,                            // sample count
  x, z: Float32Array(n),        // centreline
  heading: Float32Array(n),     // rad
  curvature: Float32Array(n),   // 1/m, + = left
  length,                       // m (loop: n * ds)
  bounds: { minX, maxX, minZ, maxZ },
}

// gen/features.js
placeFeatures(layout, rng, { density: 'mild' | 'wild', style = layout.style ?? 'flowing' }) -> Feature[]
Feature = { type: 'kicker' | 'crest' | 'whoops' | 'tabletop' | 'berm', s0, s1, /* m along road */
            ...params }       // e.g. kicker {height, lipS, landS}, whoops {count, height, pitch}
profileOffset(features, s) -> metres added to the road height at s (pure; berm returns 0)
bermBank(features, s) -> extra bank (rad) at s

// gen/terrain.js
generateTerrain(layout, features, rng, opts) -> Terrain
Terrain = {
  cell: 1, nx, nz, x0, z0,      // heights[iz * nx + ix] is the ground at (x0 + ix, z0 + iz)
  heights: Float32Array(nx * nz),
  road: Float32Array(layout.n), // road centre height per sample (includes feature offsets)
  bank: Float32Array(layout.n), // rad, + = left side higher
}
heightAt(terrain, x, z) -> height on the heightfield's triangles (same split as Rapier, T-8)

// gen/surfaces.js
generateSurfaces(layout, rng, { theme: 'summer' | 'winter' }) -> Surfaces
Surfaces = { theme, sections: [{ s0, s1, road: surfaceKey, verge: surfaceKey }] } // covers [0, length)
roadSurfaceAt(surfaces, s) -> { road: surfaceKey, verge: surfaceKey, next?: {...}, t } // t = blend

// gen/roadside.js
placeRoadside(layout, heightFn /* (x, z) => y */, features, rng) -> Roadside
Roadside = {
  markers: [{ x, y, z, yaw, side: -1 | 1 }],
  gates: [{ kind: 'start' | 'finish', s, x, y, z, yaw }],   // loop: one 'start' (also finish)
  checkpoints: [{ s }],                                      // every 250 m
}

// gen/locate.js
makeLocator(layout) -> { locate(x, z) -> { s, d, i } }   // nearest centreline sample, d signed

// gen/track.js
generateTrack(seed, { kind, theme, density, style = 'twisty' }) -> Track
  // rng seed string: `${seed}|${kind}` for flowing (the pre-style tracks), `${seed}|${kind}|${style}` otherwise
Track = { seed, kind, style, theme, density, layout, features, terrain, surfaces, roadside, locator,
          spawn: { x, y, z, yaw },      // on the road behind the start gate
          roadWidth: 7 }
```

```js
// World (implemented by PadWorld and TrackWorld)
World = {
  kind: 'pad' | 'track',
  build(R, physicsWorld) -> void       // creates static colliders and dynamic props
  ground: Set<colliderHandle>,         // colliders that count as "the ground" (snow sits on these)
  props: [{ body, home: {x, y, z, yaw}, kind: 'cone' | 'marker' }],
  surfaceAt(x, z, collider) -> SURFACES entry
  spawn: { x, y, z, yaw },
  resetProps(),
  track?: Track,                       // TrackWorld only
  recover(x, z) -> { x, y, z, yaw }    // TrackWorld: back on the road at the nearest progress point
}
```

## Requirements — Phase 1

- **T-1 Worlds.** `Sim` takes a World (`new Sim(R, { world, car, assist })`) instead of building
  the pad itself; all existing pad behaviour, tests and the Snow surface keep working on
  `PadWorld`. The renderer builds visuals from the world (`padView` / `trackView`).
- **T-2 Layouts.** Same seed + options ⇒ identical layout. Two styles (`style`, default
  `twisty`; feedback: "very open and fast — give it more switchbacks like a rallycross track"):
  - *Flowing loop:* 10–16 control points around a centre at random radii/angles, closed centripetal
    Catmull-Rom, resampled at 1 m; length 1.5–3 km.
  - *Flowing stage:* chained straights (40–250 m) and constant-radius corners (15–300 m radius,
    20–170°), with smooth curvature transitions (≥ 15 m ramps); length 3–6 km.
  - *Twisty loop (rallycross):* a curvature program like a stage's, each piece after a straight:
    hairpins (radius 17–28 m, sweep 150° up to the most whose legs stay ≥ 44 m apart 30 m out),
    switchbacks (two opposite hairpins on a 50–75 m straight), tight S-bends (two opposite
    16–40 m corners of 40–90°, 0–12 m apart) and corners (18–60 m, a quarter 60–120 m, 30–110°).
    It is laid by pure pursuit of a guide circle through the start (half the 1150–1850 m target
    length): corners turn towards the point 120 m further round it, straights (25–110 m, three
    in ten 100–160 m: room for a jump) take the length that lands their piece nearest it, and a
    piece that comes within 40 m of earlier road is redrawn. The picker aims for 4 hairpins/km
    (an attempt with < 2.5 is dropped) and falls back to plain corners when the road runs long
    for its progress or is boxed in. A last corner makes the net turn exactly ±360°, and the
    straight lengths are solved (least change, 25–200 m) to close the ring exactly; the line is
    mid-way along the closing + first straight. Length 1–2 km.
  - *Twisty stage:* the flowing stage's builder with straights 25–120 m and corners mostly
    15–60 m radius up to 180° (one in five faster: 60–150 m, 30–120°); one corner in six is a
    switchback climb (2–4 alternating hairpins as above on 35–70 m straights). Length 2.5–5 km.
  - Measured over 8 seeds (`test/gen-layout`; a hairpin = a same-sign run of |κ| > 1/60 with
    radius < 30 m and sweep ≥ 120°): flowing loops 0 hairpins/km and 239°/km of heading change,
    twisty loops 3.5 /km (each ≥ 2) and 723°/km; flowing stages 0.03 /km and 247°/km, twisty
    stages 2.0 /km and 656°/km. Twisty loops generate in ~3 ms, stages ~7 ms (300 seeds, none
    failed).
  - All: minimum radius 15 m everywhere; no part of the road within 40 m of a part more than
    120 m away along it (no crossings or near-misses); fits in a 1400 m square. A failed attempt
    retries with the next fork of the rng (bounded; fail loudly after 50). The flowing generator's
    output is unchanged by the addition of styles.
- **T-3 Terrain.** 1 m heightfield covering the layout bounds + 150 m margin.
  - Hills: fBm, ±25 m over a few hundred metres plus ±1 m detail.
  - Road profile: terrain sampled along the centreline, smoothed along `s` until the grade is
    ≤ 12 %, then feature offsets added (features are not grade-limited).
  - Flatten: across the road (half-width 3.5 m) + 2 m shoulder the ground is the road height
    (with bank), blended back to the hills over the next 15 m (smoothstep).
  - Off-road bumps (`BUMPS`, R3 feedback "the open world is way too slippery"): one octave of
    gradient noise on a 1.2 m lattice, soft-clipped (`amp · tanh(n / 0.38)`) to ±amp, with amp
    wandering 0.10–0.16 m over ~35 m (measured: peak 0.15 m, rms 0.07 m, wavelength ~3.5 m —
    always ≥ 2 heightfield cells). Added to the natural ground and faded in by smoothstep from
    |d| 6 m to full at 10 m, so the road, shoulder and first 2.5 m of verge stay smooth. Own rng
    forks (`bumps`, `bump-amp`). The requested ±0.15–0.25 m dug the hull's nose in: 20–35 g
    stops in most off-road runs at 60 km/h; at ±0.10–0.16 m they are rare. `generateTerrain(...,
    { flatten: false })` returns hills + bumps everywhere, `{ bumps: false }` leaves them out.
  - Bank: up to 4° into corners from curvature, plus berm bank; + = left side up.
- **T-4 Obstacles** (arcade fun, after Toyota/Sega-style off-road racers): placed on low-curvature
  stretches with a clear 60 m run-up and 40 m run-out, at most one per 300–500 m (`wild` packs
  them ~1.6× tighter and ~1.4× taller).
  - *Flowing:* the whole stretch [s0 − 60, s1 + 40] at |κ| ≤ 1/120; one type drawn per spot,
    spots 10 m apart.
  - *Twisty* (few 160 m straights): 40 m run-up and 30 m run-out with the whole stretch at
    |κ| ≤ 1/60 (radius ≥ 60 m, so never in or right before a hairpin or tight corner); kickers and
    crests, which launch, also need |κ| ≤ 1/120 from the run-up to their end. At most one per
    120–250 m; up to 4 type draws per spot, spots 5 m apart. Mild over 8 seeds: twisty loops 2.3
    obstacles/km (mostly whoops and tabletops), stages 2.75 (flowing 2.2 / 2.1).
  - *Kicker:* rises 1–1.5 m over 8–10 m with a sharp lip, then a long downhill landing 20–40 m on.
  - *Crest:* a sharp hilltop (2–4 m over 30–50 m) that unloads or launches.
  - *Whoops:* 4–8 rounded ridges, 0.25–0.45 m high (× 1.4 on wild), 6.5–8 m apart, clamped so
    the ridge between two wheels in adjacent troughs (2.4 m apart) stands ≤ 0.15 m — under the
    hull's ~0.2 m clearance (`WHOOPS_RIDGE_MAX`) — and to ≤ 0.5 m outright (`WHOOPS_MAX_H`) so the
    faces stay climbable by the front overhang (~13°). The first cut (0.4–0.7 m, 5–7 m) beached
    the car at low speed and flipped it above ~16 m/s; uncapped wild whoops (0.61 m) slewed it off
    the road. `test/wild.mjs`: the autopilot gets round 6 seeds' wild twisty loops and stages.
  - *Tabletop:* up 1–1.5 m, flat top 10–20 m, down.
  - *Berm:* a hairpin (radius < 40 m) gets up to 18° of extra bank.
- **T-5 Surfaces.** Sections of 200–700 m; each picks a road surface from the theme with a
  transition table (summer: gravel ↔ dirt ↔ tarmac; winter: snow ↔ packed ↔ ice, occasional
  gravel). Snow sections use the `packed` physics entry in Phase 1. Verge: `grass` (summer),
  `snowbank` (winter). 10 m blend between sections (grip interpolated). `surfaceAt(x, z)` uses the
  locator: |d| ≤ 3.5 m road, else verge. Ramps etc. are road.
  - *Surface drag* (tall grass, deep snow, sand, mud): each wheel in contact pays a force at its
    contact point against the contact point's ground-plane velocity v,
    `F = drag · Fz · tanh(v / 2 m/s) · (1 + (v / 18 m/s)²)`, once per chassis step
    (`Vehicle.surfaceDrag`, constants `DRAG`). The tanh fade means no creep at rest; the v² term
    is what caps top speed — a constant drag big enough to stop an AWD car at 85 km/h (~0.55 g,
    its traction limit on grass) would leave it unable to pull away. `drag`: grass 0.20,
    snowbank 0.10 (its μ 0.30 and crr 0.15 already hold it back; 0.22 left a car stuck at
    4 km/h at half throttle), mud 0.18, sand 0.14, everything else 0 (so the road and the pad's
    road surfaces are unchanged). Blended between sections with the other keys.
  - Measured (AWD, assisted, flat pad, `test/verge.mjs`): grass top speed in 30 s 84 km/h
    (gravel 184); coasting from 80 km/h 0.55 g average over 2 s (gravel 0.13, tarmac 0.12 —
    engine braking); half throttle on flat grass settles ~55 km/h. Generated loop `v1`,
    leaving the road square at 60 km/h into the bumpy grass: lifting off it is under 35 km/h in
    0.9–1.9 s; at half throttle it is at 43–50 km/h after 4 s (the bumps cost ~5–10 km/h);
    min body up·y 0.93. The requested "half throttle under 35 km/h within 4 s" conflicts with
    an 80–90 km/h top speed: half throttle in 2nd pushes ~0.45 g, about what the cap needs at
    85 km/h, so any drag curve meeting both is nearly flat and bogs the car down from rest.
- **T-6 Roadside.** Marker posts (flat-sided 0.12 × 1.2 × 0.09 m, 5 kg dynamic boxes with angular
  damping 6, linear damping 1.0, friction 0.9 — round posts rolled down the verge for ever; see
  `rally-spec.md` R3-3) at 25 m spacing
  both sides, 12 m on corner outsides (|curvature| > 1/80), 1 m beyond the road edge; they slide
  and tip over and stay where they land until Reset. Markers start asleep and `resetProps`
  rebuilds their bodies asleep: an awake 1.2 m post on a sloped shoulder tips over by itself in
  Rapier, so renderers must read `prop.body` every frame (it is replaced on reset). Start and finish gates (visual arch, static
  posts outside the verge). Checkpoints every 250 m.
- **T-7 Locator.** `locate(x, z)` → nearest sample via a uniform spatial hash (cell 16 m); loops
  wrap `s`. Accurate to ±0.5 m along, ±0.05 m across, near the road.
- **T-8 Physics on tracks.** One Rapier heightfield collider for the ground (orientation verified
  by a raycast test). rapier3d-compat 0.14–0.21 (unchanged): `ColliderDesc.heightfield(nrows, ncols, heights,
  scale)` takes *cell* counts (rows along z, columns along x), column-major heights
  (`iz + ix·nz`), `scale` = full extent `(nx−1, 1, nz−1)`, centred on the collider translation;
  each cell splits along its (x+1, z)–(x, z+1) diagonal; `heightAt` interpolates on the same
  triangles (bilinear was up to 8.5 cm off on the verge bumps). Wheel rays work unchanged. Spawn on the road behind the start, facing along.
- **T-9 Track rendering.** Terrain as 64 m chunks with 3 distance LODs (1, 2, 4 m) and skirts;
  vertex colours from the verge surface plus hill shading. Road as a ribbon mesh 7 m wide just
  above the terrain, coloured per section with blends. Markers instanced, synced to bodies. Gates
  as simple arches (posts are flat 0.12 × 1.2 × 0.09 m boxes like their colliders). Fog/far
  plane suited to hills.
  - *Tall grass:* instanced tufts (11 thin tapered blades, double-sided, lit as facing up so
    the backs don't go black, dark root to light tip, tinted by the ground's colour noise) on
    grass verges: 140 candidates per 8 m world cell (~2.2/m²), 0.3–0.6 m tall, 0.8–1.3 m
    across, random yaw; none within |d| 5 m, thinning in up to 7.5 m. Each cell is scattered
    from `rng(seed|cover|cx|cz)` (verge kind from the cell centre's section) and cached, so
    tufts never move; only cells within 52 m of the camera are drawn, and tufts shrink into
    the ground between 36 and 50 m (vertex shader) so the patch edge never pops. Gentle sway:
    tip offset `sin(t + phase) · 0.12 · y²`. The instance buffer is rewritten only when the
    camera crosses a cell boundary (~1.2 ms per crossing for ~22 k instances; ~0.25 M
    triangles, no shadow casting). Snowbank verges get nothing: low drift meshes read as
    plates or rocks, and the bumps show through the snow anyway.
- **T-10 Free drive on tracks.** Settings sheet: World (Test pad / Loop / Stage), seed (text +
  dice), track style (Twisty — default / Flowing), theme (Summer / Winter), obstacles (Mild / Wild). Changing them regenerates. The seed is
  shown on screen. Settings persist.
- **T-11 Reset to road.** On a track, Reset puts the car on the road centre at the nearest point
  behind it, facing along the road, stopped, with props left as they are; a separate long-press /
  `Shift+R` resets the whole track (props home, car at spawn).
- **T-12 Validation.** `test/gen.mjs`: determinism, min radius, clearance, bounds, length bands,
  grade ≤ 12 % outside features, surface coverage of [0, length), obstacle run-up/out space,
  marker counts. `test/track.mjs`: an autopilot (pure pursuit on the centreline, speed from
  curvature and obstacles) drives seeded summer and winter loops and stages end to end without
  leaving the road (|d| < 6 m) or rolling over; reports sim time per real time. The autopilot is
  pure pursuit (look-ahead max(6, 0.6 v), stretched on low grip) plus yaw-rate feedback, capping
  speed at 12 m/s for kickers/whoops and 16 m/s for crests/tabletops.
- **Phase 1 results:** generation 0.07–0.23 s per track. At 0.3.1: `test/gen-layout` 657,
  `gen-terrain` 129, `gen-surfaces` 100, `track` 84 (9 autopilot drives on the default Twisty
  style: 3 seeds × summer/winter loops and summer stages, worst |d| 2.3 m, ~40 s), `wild` 12
  (6 seeds' Wild twisty loops and stages), `verge` 27, `markers` 7 — all passing. Rendering:
  ~0.7 M triangles drawn incl. the shadow pass and tall grass; LOD update ~0.04 ms/frame.
- **Known gaps:** a stage's road ribbon ends abruptly at both ends; winter loops alternate packed
  snow and ice so ice can be ~half the loop (less of a problem now studded ice grips 0.55); Flowing
  loops get fewer obstacles than stages (gentler corners leave fewer clear straights; Twisty uses
  shorter run-ups, ~2.3/km).

## Requirements — Phase 2 (game loop)

Design agreed 2026-10-10 (plan: `docs/plans/2026-10-10-game-loop.md`). The game layer lives in
`src/game/`: no DOM, no three.js, so it runs headless in Node with the autopilot. It reads car
state and the track; the only thing it does to the car is place it, hold it and steer its inputs.

| Path | Role |
|------|------|
| `src/game/progress.js` | Progress along the course: unwrapped position, checkpoints in order, line/finish crossings, missed checkpoints (T-24) |
| `src/game/pace.js` | Allowed speed along the road (curvature, grip, obstacles) and the time-attack run-up distance; shared with `test/autopilot.js` |
| `src/game/modes.js` | `freeDrive`, `stage`, `timeAttack` (T-21) |
| `src/game/game.js` | `Game`: the state machine, clock, splits, laps, events (T-20) |
| `src/game/bests.js` | Saved bests (T-25) |
| `src/menus.js` | Title menu, pause menu, results card, game HUD (T-26) |
| `test/game.mjs` | Headless validation (T-27) |

- **T-20 States.** `title → loading → ready → countdown → running → finished`, plus `paused` over
  `ready`/`countdown`/`running`. Main calls `game.step()` once per physics step (sim time, so
  headless runs are deterministic) and doesn't step physics while paused.
  - `title`: the menu over the live scene; the car sits held at the selected mode's start; the
    camera orbits it.
  - `loading`: a track is building (toast); the menu stays.
  - `ready` (0.8 s, lets the suspension settle) → `countdown` (3 s: lights 3, 2, 1, then Go).
    The car is **held** through both (`car.hold`): all brakes full, clutch open (gear shown as
    N), so the engine revs freely and the car can't move or select reverse; on Go it drops into
    1st and launches. No jump starts are possible, so there is no penalty.
  - `running`: the clock runs. `finished` (Stage only): the car is slowed to a stop on its own
    (throttle off, brake 0.5, held once under 1 m/s) and the results card shows.
  - Free drive skips `ready`/`countdown`: `loading → running`, no clock.
  - Events (`game.on(fn)`, `{ type, ... }`): `state`, `count {n: 3|2|1|0}`, `start`, `split`,
    `lap`, `missed`, `blocked`, `finish`.
- **T-21 Modes** are data the Game reads (`MODES` in `game/modes.js`): `{ id, label, kind (the
  track kind it always uses, or null = the player's Loop/Stage choice), countdown, clock (null |
  'go' | 'line'), laps, startOffset(track) (m from the start line, null = spawn) }`. The Game's
  event handling branches on `clock` and `laps` (hooks per mode were more machinery than three
  modes need). `freeDrive` (Loop or Stage, no clock), `stage` (always a stage track), `timeAttack`
  (always a loop). The test pad is free drive only and hidden: `?pad` in the URL or
  `rally.setWorld(...)`.
- **T-22 Stage.** The car starts held 4 m behind the start gate; the clock runs from Go to the
  finish gate. At each checkpoint the split (time since Go) shows with its delta to the best
  run's split there. Crossing the finish with a checkpoint missed shows "Missed checkpoint — go
  back" and the clock keeps running; going back through the missed checkpoint and on to the
  finish counts. Results card: time, splits with deltas, previous best, "New best", and Retry /
  New seed / Menu.
- **T-23 Time attack (endless hot laps).** The car starts held on the road a **run-up** before the
  line: the distance covered in 10 s from rest under the pace profile (accelerate at 0.45 μg,
  brake at 0.4 μg, corner speeds as the autopilot's), clamped 150–400 m. After Go the clock waits
  for the line (flying start); each crossing ends a lap and starts the next. A lap with a missed
  checkpoint is shown "invalid" and not saved, but the next lap still starts. Per checkpoint a
  split (time into the lap) with its delta to the best lap's split. Laps never end: the pause
  menu lists them (time, valid, best marked). Restart returns to the run-up.
- **T-24 Progress.** `makeProgress(track)` follows the car's course position `p` (m from the start
  line, continuous: loop wrap is unwrapped, so lap n spans `[n·L, (n+1)·L)`), updated from the
  locator each step. A checkpoint (every 250 m, from `roadside.checkpoints`) or the line counts
  only when crossed forwards in order, with |d| ≤ 15 m, and with `p` moving ≤ 50 m in that update
  (a bigger move is a shortcut across a hairpin or a teleport and credits nothing in between).
  Passing a checkpoint's position by 30 m without crediting it raises `missed` (once) until it's
  credited. The stage finish with a checkpoint missing raises `blocked`; a loop line crossing
  ends the lap either way (valid only with every checkpoint).
- **T-25 Bests** in `localStorage` (`rally-sim-bests`), keyed `mode|seed|kind|style|theme|density|
  car`: Stage `{ time, splits }`, Time attack `{ lap, splits }` (best lap). Saved only when better.
  Storage failures are ignored (private mode); the game works without it.
- **T-26 UI.**
  - *Title menu* over the live scene (top-left panel, the top bar hidden): Mode (Free drive /
    Stage / Time attack) with a one-line description; for free drive Loop / Stage; seed (text +
    🎲 + Go), Track style, Theme, Obstacles; Car; a footer with Settings, the best for this setup
    ("Best 2:47.33" / "Best lap …" / "No time set yet") and **Drive** (Enter, gamepad A).
    Changing the track rebuilds the preview behind the menu. Short wide screens (≤ 520 px tall,
    ≥ 540 px wide: phones in landscape) get a wider panel with the heading beside the mode picker,
    no description and the options in two columns; the options scroll, the footer always shows.
  - *Settings sheet* keeps the driving options only (surface on the pad, Assisted / Sim, units,
    gearbox, help); opens from the title footer or the pause menu.
  - *Pause menu* (Esc, P, gamepad Start, or the Pause chip): Resume, Restart, Settings, Quit to
    menu; Time attack adds the lap list. Restart is also Shift+R / hold Reset (a new countdown
    from the start or run-up, markers home). Reset (R / tap) stays "back onto the road", clock
    running. Leaving the page (hidden) pauses a timed run.
  - *Game HUD:* timer (top centre, m:ss.cc), lap line under it ("Lap 3 · Last 1:02.31 · Best
    1:01.88"; before the flying start "Run-up: the clock starts at the line"; Stage: "Best …"),
    split pill ("Split 3/12 −0.42", green faster / red slower, 3 s), countdown lights (three
    reds, then all green + GO for 1 s), banners (missed checkpoint, held until credited; best
    lap; invalid lap). Screens narrower than 900 px put the HUD under the top bar (the chips fill
    it); portrait phones hide the seed chip in timed runs and portrait touch screens move the dash
    under the HUD. Cards (pause, results) are a column whose list scrolls so the buttons stay on
    screen; on short wide screens they are two columns, buttons left and list right.
  - *Body classes:* `scr-title` / `scr-play`, `menuOpen` (pause or results: touch controls
    hidden), `timed`.
  - *Debug hooks* (`window.rally.debug`, for the console, Playwright and phones):
    `screen(name, { mode, n, time, best, splits })` jumps to `title`, `loading`, `ready`,
    `countdown` (light n), `running`, `paused`, `results` or `settings` (stepping the game and
    physics to get there); `finish(opts)`, `split(i, delta)`, `lap(valid)`, `missed(i)`,
    `blocked(i)`, `count(n)` fire events; `teleport(p)` puts the car at course position p;
    `nearFinish(d)` credits every checkpoint and puts the car d m before the finish/line;
    `state()`. URL: `?debug=<screen>&mode=<mode>&n=<light>` opens straight onto a screen (on a
    phone too); `?pad` drives the test pad.
  - Settings v4: adds `mode`; saved `world: 'pad'` becomes free drive on a loop.
- **T-27 Validation** (`test/game.mjs`): progress on synthetic paths (in-order checkpoints, loop
  wrap, a shortcut jump credits nothing, missed raised and cleared, backwards crossings ignored);
  the hold keeps the car within 5 cm at full throttle for 4 s and never selects reverse, and the
  car launches on Go; the autopilot drives a stage from Go to finished with the clock equal to sim
  time since Go and one split per checkpoint; a teleport past a checkpoint blocks the finish
  until driven back; time attack starts the clock at the line and counts valid laps on two
  seeds; run-up in 150–400 m; bests saved only when better. `test/mobile.mjs`: title menu, pause
  menu and results card fit each device's safe area (Drive and the menu buttons reachable, ≥ 44 px),
  the timer and HUD don't overlap the chips, pedals or dash in play.
- **Phase 2 results (2026-10-10):** `test/game.mjs` 67 checks: the hold keeps both cars within 1 mm at full
  throttle (7500–8000 rpm) and they launch to 9–14 m/s in 2 s; run-ups 150–171 m (rally pace
  reaches the line in 10 s from about 160 m, so the 150 m floor often applies); the autopilot's
  2.8 km stage 'g1' takes 167.4 s with 10 splits, clock = sim time since Go; time attack loops
  'ta1'/'ta2' lap in 110.4 / 126.3 s. `test/mobile.mjs` 727 checks on 7 devices (pad + stage
  each; title, HUD, pause and results added).
