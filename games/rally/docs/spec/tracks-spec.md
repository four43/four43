# Rally Sim — Generated Tracks, Worlds and Game Loop

Status: **Phase 1 built 2026-10-10** (free drive on generated loops/stages); Phase 2 next. Companion to `rally-spec.md` (car,
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
- **T-6 Roadside.** Marker posts (≈1.2 m tall, Ø 0.12 m, 5 kg dynamic cylinders) at 25 m spacing
  both sides, 12 m on corner outsides (|curvature| > 1/80), 1 m beyond the road edge; they slide
  and tip over and stay where they land until Reset. Markers start asleep and `resetProps`
  rebuilds their bodies asleep: an awake 1.2 m post on a sloped shoulder tips over by itself in
  Rapier, so renderers must read `prop.body` every frame (it is replaced on reset). Start and finish gates (visual arch, static
  posts outside the verge). Checkpoints every 250 m.
- **T-7 Locator.** `locate(x, z)` → nearest sample via a uniform spatial hash (cell 16 m); loops
  wrap `s`. Accurate to ±0.5 m along, ±0.05 m across, near the road.
- **T-8 Physics on tracks.** One Rapier heightfield collider for the ground (orientation verified
  by a raycast test). rapier3d-compat 0.14: `ColliderDesc.heightfield(nrows, ncols, heights,
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
- **Phase 1 results:** generation 0.07–0.23 s per track; `test/gen-layout` 305, `gen-terrain`
  122, `gen-surfaces` 100, `track` 84 checks (9 autopilot drives: 3 seeds × summer/winter loops and
  summer stages, worst |d| 3.8 m, ×14–28 real time, ~85 s). Rendering: ≤ ~0.6 M triangles drawn
  incl. the shadow pass; LOD update ~0.04 ms/frame.
- **Known gaps:** a stage's road ribbon ends abruptly at both ends; winter loops alternate packed
  snow and ice so ice can be ~half the loop; loops get fewer obstacles than stages (gentler
  corners leave fewer clear straights).

## Requirements — Phase 2 (game loop)

- **T-20 States:** `menu → loading → ready → countdown → running → finished`, plus `paused`
  overlay. `ready`: car held (brakes on, gearbox in gear, engine free to rev). `countdown`: 3-2-1-Go
  over 3 s; moving > 0.5 m before Go is a jump start (+5 s penalty, shown). `finished`: results
  with retry / new seed / menu.
- **T-21 Modes** are objects hooking the states: `freeDrive`, `stage`, `timeAttack`.
- **T-22 Stage:** point-to-point; clock from Go to the finish gate; splits at checkpoints
  (compared with best).
- **T-23 Time attack:** loops; the car starts stopped on the road a run-up before the line (the
  distance covered in ~10 s by the autopilot's speed profile, clamped 150–400 m); each crossing
  of the line ends a lap and starts the next; Restart returns to the run-up.
- **T-24 Progress:** the game tracks `s` via the locator, requires checkpoints in order (cutting
  doesn't count), and handles loop wrap.
- **T-25 Bests:** saved in `localStorage` per (seed, kind, theme, density, car, mode).
- **T-26 HUD:** timer, split delta, lap count, countdown lights, results card.
