# Rally Sim — Spec

Status: **Milestone 1 (test pad) + round-2 feedback**, reverse-documented from the first-round source
(`rally-sim-src.zip`, 2026-10-10), then round-2 playtest changes. Version 0.2.0.
Round-2 changes: see [Round 2](#round-2-2026-10-10).

## Goal

A browser rally driving sim that feels physically honest: real-car dimensions, a per-wheel tire
model, a real drivetrain, and surfaces that change how the car behaves. Plays on desktop
(keyboard / gamepad) and on phones and tablets (touch). Ships as a single self-contained HTML file
at `four43.com/exp/rally/`.

Milestone 1 is a **flat test pad** with features for exercising the car — no stages, timing, or
progression yet.

## Stack and layout

- three.js 0.160 (render), Rapier 3D compat 0.14 (rigid body + raycasts), esbuild bundle.
- Physics modules (`tire.js`, `drivetrain.js`, `vehicle.js`, `sim.js`, `cars.js`) have **no
  three.js imports** so they run headless in Node for tests.

| File | Role |
|------|------|
| `src/cars.js` | Car configs (`CARS.awd`, `CARS.rwd`) |
| `src/tire.js` | Surface table + brush/Magic Formula tire step |
| `src/drivetrain.js` | Engine, clutch, gearbox, diffs |
| `src/vehicle.js` | Raycast vehicle on one Rapier body; driver aids; auto-shift |
| `src/sim.js` | World, test pad colliders, cones, fixed-step `Sim` |
| `src/snow.js` | Deformable fresh snow field (R2-6): height + wear grid, press, plow inputs |
| `src/snowView.js` | Snow rendering: window texture, displaced near mesh, shaded far plane |
| `src/render.js` | three.js scene, pad visuals, car meshes, cameras |
| `src/ui.js` | `Controls` (keyboard/gamepad/touch merge) and `Hud` |
| `src/main.js` | Boot, settings sheet, frame loop, `window.rally` debug hook |
| `src/assets.json` | Baked Kenney car-kit meshes (vertex coloured) |
| `bake.mjs` | Bakes the GLBs in `assets/models/` → `src/assets.json` |
| `assets/models/` | Source models: Kenney Car Kit 3.1 (CC0) — the 4 GLBs in use + `Textures/colormap.png` |
| `index.template.html` | Page shell, CSS, HUD/touch markup; bundle injected at `/*BUNDLE*/` |
| `build.py` | Bundles and writes `site/exp/rally/index.html` |
| `dev.mjs` | Dev server (`npm run dev`, port 8740, LAN-visible): rebuilds on save, live-reloads |
| `test/physics.mjs` | Headless physics validation (`npm test`) |
| `test/snow.mjs` | Headless fresh-snow validation (`npm test`) |
| `test/browser.py` | Playwright smoke test (desktop + mobile hit-tests, screenshots) |
| `test/dbg.mjs` | Ad-hoc launch trace: `node test/dbg.mjs [car] [surface]` |

Commands: `npm run dev`, `npm test`, `npm run build`, `npm run bake`.

New Kenney models come from the All-in-1 pack zip (`3D assets/<Kit>/Models/GLB format/`); copy only
the GLBs actually used into `assets/models/` (plus `Textures/colormap.png`) and add them to `bake.mjs`.

## Simulation

### Timing
- Chassis step `DT = 1/240 s`; wheel/tire/drivetrain run `SUB = 8` substeps per chassis step
  (1920 Hz).
- Frame loop accumulates real time, runs at most 12 chassis steps per frame, and drops time
  beyond that rather than spiralling on slow devices. Frame dt is capped at 0.1 s.

### Vehicle (raycast, single rigid body)
- One dynamic Rapier body with configured mass and inertia; colliders are two zero-density boxes
  (hull + cabin) for contacts only. CCD on, never sleeps.
- Each wheel casts its own ray down the body's up axis (length = travel + radius) against ground
  only.
- **Suspension:** spring rate from target natural frequency `fn` per corner mass; separate bump /
  rebound damping ratios; progressive bump stop over the last 4 cm; hard stop beyond travel;
  anti-roll bar force from left/right compression difference. Force applied along body up.
- **Tire forces** applied at the contact point raised by the axle's roll-centre height (gives
  geometric weight transfer).
- **Steering:** `maxLock` with partial Ackermann (`ackermann` 0..1 blend).
- **Brakes:** total torque with front bias; handbrake on rears only. Brake applied as an
  impulse-limited torque that can stop but not reverse the wheel.
- **Rolling resistance** per surface (`crr`); **aero drag** `0.5 ρ CdA v²` at the CoM.

### Tire model (`tire.js`)
- Brush-style contact-patch deflection state (`dx`, `dy`) with relaxation lengths
  (σx 0.12 m, σy 0.30 m), integrated with exact exponential decay.
- Slip ratio and slip angle derived from the deflection; normalised by the surface's peak slip
  (`kp`, `ap`) into a combined slip `ρ`, clamped at 4 (full slide).
- Force = `μ Fz · MF(ρ)` with a normalised Magic Formula (shape `C`, `B` chosen so the peak is at
  ρ = 1), split along the slip direction (friction circle).
- Load sensitivity: peak μ falls 12 % per +100 % load over 3500 N (floor 50 %).
- Low-speed patch damper fades in below 3 m/s to stop rocking at rest; gains are kept under the
  explicit stability limit.

### Surfaces
Defined in `SURFACES`: tarmac, hardpack, gravel, grass, sand, mud, snow, snowbank, ice (μ from
1.15 down to 0.17). The whole pad is one surface at a time. The UI exposes Tarmac, Dirt
(`hardpack`), Gravel, Snow and Ice; the renderer has looks for those five.

### Drivetrain (`drivetrain.js`)
- Piecewise-linear full-throttle torque curve; engine braking scales with rpm; rev limiter cuts
  throttle above redline; idle governor holds idle. Engine never stalls (floor ~50 rpm).
- Implicit (backward-Euler) slipping clutch with torque capacity; auto-clutch slips from idle
  bite and opens during shifts.
- Gearbox: 5 forward + reverse, final drive, 0.12 s throttle-cut shift.
- Diffs: plate LSDs (preload + power/coast ramp) per driven axle; AWD adds a viscous centre diff
  around a 50:50 split.

### Driver logic (`Vehicle.control`)
- **Auto-shift:** up at 94 % redline with throttle; down when the lower gear lands under 80 %
  redline and current rpm < 48 % redline.
- **Reverse:** reverse is a negative ratio (R2-3). Auto: hold brake at < 0.5 m/s for 0.35 s to
  engage reverse; in reverse, throttle and brake swap; throttle while near-stopped returns to 1st.
  Manual: shift down from 1st.
- **Assisted mode** (`assist`, off by default — R2-1): per-wheel ABS and driven-wheel traction
  control as low-passed proportional limiters on slip ratio, plus **slide control** (R2-2): above
  3 m/s, throttle is trimmed once the rear axle's slip angle passes 1.2 × the surface's peak slip
  angle, down to a 15 % floor at 2.5 × (`SLIDE` in `vehicle.js`). Steering is never capped: the
  driver always gets the lock they ask for. **Sim mode** turns all of these off.
- Manual gearbox: shift up/down events. Pressing a shift button while in Auto switches to Manual.

### Cars (`cars.js`)

| | R5 4WD (`awd`) | Classic RWD (`rwd`) |
|---|---|---|
| Model | Kenney `hatchback-sports` | Kenney `sedan-sports` |
| Mass / front weight | 1250 kg / 58 % | 1050 kg / 50 % |
| Peak torque / redline | 362 Nm @ 4000 / 7500 | 230 Nm @ 6000 / 8000 |
| Layout | AWD, viscous centre, front + rear LSD | RWD, rear LSD |
| Livery | blue `#2f6fd6` | yellow `#e8b323` |

## Test pad (`PAD` in `sim.js`)

640 m square, flat. Start at (0, 40) facing +z.
- Skidpad: painted 40 m-radius circle at (0, −90), coned ring at r ± 5 m.
- Slalom: 9 cones down x ≈ −20.
- Kicker ramp (1.2 m over 10 m) and a landing ramp at x = −60.
- 8 speed humps across the lane at x = 60.
- 10 % slope at x = 120.
- Cones are dynamic 3 kg bodies; Reset returns car and cones home.

## Rendering

- Car and cone meshes are baked Kenney car-kit geometry with per-vertex colours (sRGB sampled once,
  converted to linear once). Body panels are meant to be recoloured to the livery (see Known
  issues). Wheels are separate meshes positioned at each wheel centre, steered and
  spun.
- Procedural speckle ground texture per surface; sky colour and fog per surface.
- ACES tone mapping, hemisphere + shadowed sun that follows the car.
- Cameras (C / Camera chip cycles): **chase** (heading blended toward travel direction so slides
  read, FOV widens with speed), **bumper**, **bonnet**.

## Controls

Inputs merge into one `{steer, throttle, brake, handbrake}`; physics never sees the source.
Steer is +left / −right.

- **Keyboard:** W/S or ↑/↓ throttle/brake (ramped), A/D or ←/→ steer (ease-in, faster
  return-to-centre, snaps through centre), Space handbrake, Q/E shift, R reset, C camera, F3 or
  `` ` `` wheel debug.
- **Gamepad:** left stick steer (8 % deadzone, slight expo), RT/LT throttle/brake, A handbrake,
  RB/LB shift, Y reset, X camera.
- **Touch** (shown on `pointer: coarse`): left-side horizontal steer slider (drag from touch
  point, ±110 px full lock), right-side Gas and Brake pads (pressure by vertical position: lower
  70 % ramps 45 % → 100 %), Handbrake button, +/− shift buttons in Manual.
- Strongest of the keyboard and gamepad steer wins; active touch steer overrides both. Throttle,
  brake and handbrake take the max across sources.

## UI

- Top-left **Car & surface** chip opens a settings sheet: Car, Surface, Driving (Assisted / Sim),
  Gearbox (Auto / Manual), plus control help. Settings persist in `localStorage`
  (`rally-sim-settings`, versioned with `v`; currently 2).
- Top-right chips: Camera, Wheels (debug), Reset.
- Bottom-centre dash: speed (km/h), gear badge, 15-segment rev arc (green/amber/red; all red on
  limiter). Moves to the top and scales down on short (landscape phone) screens.
- Wheels debug panel: per wheel load (kN + bar), slip %, slip angle, surface or "airborne"; bar
  turns amber when sliding (ρ > 1).

## Debug hook

`window.rally` exposes `sim`, `view`, `controls`, `CARS`, `pause()`, `resume()`, `stepN(n)`,
`render()`, `state()` (telemetry) for Playwright.

## Validation targets (`test/physics.mjs` 50/50, `test/snow.mjs` 21/21 at 0.2.0)

Per car, headless with assists off unless noted:
- Static settle: ΣFz = mg ± 0.5 %, front share ± 1 %, static sag ± 5 %, CoM height ± 1 cm, no creep.
- Drop test: damped heave 1.2–1.7 Hz; < 8 % residual after 1.5 cycles.
- Skidpad steady lateral g (40 m circle): tarmac 0.95–1.05; AWD dirt 0.72–0.82; gravel ~0.6–0.7;
  AWD packed snow 0.43–0.52, ice 0.12–0.17.
- 0–100 km/h (assists on): AWD tarmac 4.2–5.0 s, gravel 4.8–6.0 s; RWD gravel 8.0–9.5 s.
- 100–0 km/h (ABS on): tarmac 35–42 m, gravel 52–65 m; front load share rises under braking.
- Hold on a 10 % grade with brake + handbrake: < 1 cm drift in 10 s.
- Handbrake turn on gravel from 50 km/h: rear slip angle peak 30–90°, yaw change 90–270°.
- Reverse (R2-3): holding brake from rest in Auto, or throttle in Manual R, drives backwards.
- Assisted steering (R2-2): full lock at 72 km/h.
- Slide control (R2-2), RWD on dirt and gravel, full throttle with 0.8 steer for 1.2 s from
  54 km/h: Sim spins (≥ 90° body slip), Assisted holds it to 10–60°.

## Known issues (observed during extraction)

- **Livery not applied:** `repaint()` in `render.js` is defined but never called, so cars show
  Kenney's stock paint (the AWD car is green, not its configured blue).
- No favicon (404 in console).
- `test/browser.py` needs Python Playwright, which isn't installed locally.
- Fresh-snow rendering is unchecked on a phone/iPad: a 148k-vertex displaced mesh (drawn twice
  with the shadow pass, 1 texture read per pixel plus procedural noise) plus a 16 MB texture, and a refill (a 16 MB clear plus every driven tile) each time the car moves 64 m from the window centre.
- Not yet linked from the site or a PWA (unlike the other games).
- **RWD spins in a straight line at full throttle on loose surfaces** (round 1 too): ~147 km/h on
  gravel, ~97 km/h on packed snow, assists on or off. Its short gearing puts ~3.9 kN at the rear
  tires in 4th against ~3.5 kN of grip, the spinning rears lose their side grip, and a tiny yaw
  diverges. Plausible in Sim; in Assisted, TCS allows slip a little past the tire's peak (1.2 ×
  `kp`), which is where side grip goes — a candidate fix is targeting just under peak.

## Round 2 (2026-10-10)

Playtest feedback from round 1, as requirements.

- **R2-1 Sim driving by default.** `assist` defaults to off. Saved settings from before round 2
  (no `v` field) have `assist` reset to off once; after that the saved choice sticks.
- **R2-2 Assisted gets the angle in.** Assisted mode no longer caps the steering angle: the driver
  gets the full lock they ask for. Slides are controlled on the throttle instead: **slide control**
  scales throttle down when the rear axle's slip angle exceeds a threshold, low-passed like TCS,
  so the car can be turned in hard and the exit is held by trimming power. ABS and TCS stay.
- **R2-3 Reverse reverses.** Bug: the reverse gear ratio was positive, so R drove forwards (in both
  auto and manual). Reverse now drives the car backwards: hold brake at a standstill in Auto, or
  shift down from 1st in Manual.
- **R2-4 Dirt surface.** Add **Dirt** (the existing `hardpack` entry, μ 0.80) to the Surface
  picker between Tarmac and Gravel, with its own ground look. Gravel itself is unchanged.
- **R2-5 Packed snow grips more than ice.** The packed-snow surface (renamed `packed`) goes from
  μ 0.40 to 0.50 (studded tires on packed snow), well clear of ice at 0.17.
- **R2-6 Fresh snow with real ruts.** The Snow option becomes deformable fresh snow over the whole
  pad (`src/snow.js`, `SNOW` constants):
  - **State:** a 0.125 m grid of snow height (0–12 cm above the hard ground) and wear (0–1), stored
    in sparse 8 m tiles allocated on first touch; untouched snow is fresh and full depth.
  - **Compaction:** each loaded tire footprint (0.2 × 0.2 m) presses the snow under it down towards
    a 3 cm packed layer, fully under the tire and fading out over one cell beyond its edge (a
    flat-bottomed rut with sloped walls; a hard edge aliased against the grid into blotchy ruts); the full drop needs ≥ 1.5 kN of load, lighter loads press less. Snow never
    springs back.
  - **Polish:** on compacted snow, tire slip distance wears the snow towards ice (ice after
    ~6 m of slip at 3 kN). Grip blends from packed snow to ice with wear.
  - **Contact:** on the flat ground, wheel contact height comes from the snow grid (bilinear), and
    the normal from the snow's slope *across* the tire only (measured over a tire width). The
    suspension force acts along that normal, so rut walls push the tire back into the rut. Snow
    ahead of the tire is not a ramp: the tire squashes it as it rolls, and that cost is the plow
    force (a rigid front wall trapped the car in its own footprint). Footprints are stretched forward
    by 1.5 × one step's travel so the contact never lands on unpressed snow at speed. Ramps, humps
    and the slope are not covered.
  - **Plow:** a tire moving into snow higher than its own track gets a force opposing its
    horizontal motion, sampled two cells beyond the tire's edge (past the rut wall), `0.2 m · cut depth · (P · tanh(v / 0.5) + ρ v²)` with P = 20 kPa (40 kPa
    left the RWD car dug in at a standstill) and ρ = 120 kg/m³ for the snow thrown aside, so
    deep snow caps top speed. Measured against the snow ahead before this step's footprint lands. That is
    the drag going forward into fresh snow and the side grip when sliding across ruts; driving in
    existing ruts costs nothing.
  - **Berms:** a press that takes the snow down also pushes up a 3 cm ridge in the cell just
    beyond each rut wall (if that cell is still untouched). Heights are stored over
    0..(depth + berm). Berms are real to the physics: more plow drag climbing out, stronger tug in.
  - **Rendering (`snowView.js`)**, after "Real-time Snow Deformation" (Hanák 2021,
    `docs/reference/`): a 256 m RGBA8 window texture re-centred around the car holding, per cell,
    the height smoothed with a 3×3 binomial filter, wear, and the smoothed surface's normal (x, z).
    It is rebuilt on the CPU only for cells tire marks change (plus the 2-cell reach of the filter)
    and uploaded as a sub-rectangle, so each snow pixel reads one texel. One mesh displaced in the
    vertex shader covers the window: 0.125 m spacing within ±16 m of a point 8 m ahead of the car,
    spacing growing smoothly to ±128 m, so ruts and berms are real geometry at any distance. A
    matching depth material lets the snow cast shadows onto itself. Outside the window the snow is
    fresh. (The thesis's compute-shader blur and tessellation aren't available in WebGL2; the berm
    comes from the field rather than its cubic remap, so the physics feels it too.)
  - **Fresh-snow detail** (visual only, fading out as snow is packed): wind-blown undulation of up
    to ±2.7 cm in the geometry (three sine waves, 3–10 m wavelengths), fine grain as two octaves of
    normal noise, and glints — 1.5 % of 2.5 cm crystals are mirror-smooth facets at random angles,
    so only those facing the sun sparkle, twinkling with the view and dark in shadow (within ~25 m).
  - **Colour:** fresh snow white, packed snow greyer, polished ice blue and glossy.
  - **Lighting:** on snow the sun drops to ~20° elevation with less sky fill, so ruts throw
    shadows (with the default ~55° sun and strong fill they read as a bump map).
  - Choosing Snow or pressing Reset starts from fresh snow.
  - Validation (`test/snow.mjs`): cars sink to the packed layer at rest; fresh snow adds ≥ 0.03 g
    coasting drag over packed; a second pass in the car's own ruts keeps more speed; a sideways
    slide covers < 80 % of the packed-snow distance; ruts pull an 8 cm offset car to centre;
    wheelspin polishes the start spot towards ice; AWD top speed in fresh snow 100–145 km/h.
    Measured (assisted, full throttle): AWD 0–100 9.5 s, top 123 km/h in fresh snow (6.4 s / 183
    on packed, 4.3 s / 184 on tarmac); RWD tops out at 70 km/h in fresh snow (153 packed, 218
    tarmac) — it runs out of rear grip against the plow drag.

## Round 3 (2026-10-10)

Playtest feedback: "too slippery or overpowered", grassy verges, flying markers, twistier tracks,
units. Track-generator changes (twisty style, verge bumps, tall-grass drag, grass rendering) are
specified in `tracks-spec.md`.

- **R3-1 Grip, checked against real rally cars.** Acceleration was already realistic: AWD 0–60 mph
  4.0 s tarmac / 4.8 s gravel against 3.9–4.1 s quoted 0–100 km/h for WRC and R5 cars; RWD 5.0 s
  tarmac (a stock Escort RS1800 is quoted 8.2–8.6 s, the Group 4 car had ~265 bhp). Grip was the
  problem, and backwards on winter surfaces: studded rally tyres grip snow *better* than gravel
  tyres grip gravel (Pirelli: a WRC car needs ~107 m to reach 100 km/h on snow vs ~125 m on
  gravel), but packed snow (0.50) and ice (0.17, a road-tyre value) sat far below gravel. New μ:
  dirt 0.90, gravel 0.80, packed snow 0.75, ice 0.55 (studded), grass 0.55. Measured after: AWD
  0–100 km/h on gravel 4.6 s; skidpad and braking bands re-derived (skidpad g ≈ 0.9 μ).
- **R3-3 Markers settle.** Posts are flat-sided boxes (0.12 × 1.2 × 0.09 m) instead of
  cylinders — a round post rolled down the verge like a pencil for ever, which no damping can stop
  because gravity keeps feeding the roll — with angular damping 6, linear damping 1.0 and friction
  0.9. Validation (`test/markers.mjs`): a post flung at 20 m/s and 30 rad/s stops within 3 s and
  15 m (measured 1.5 s, 13.7 m); hit by the car at 72 km/h it tips over and stops within 3.5 s
  (1.2 s, 6.8 m from home); untouched posts stay up.
- **R3-4 Rounded hull.** The hull collider is a round cuboid (0.2 m edge radius, friction 0.3) so a
  nose meeting an upslope or verge bump rides up instead of digging in like a box corner. Off-road
  at 60 km/h square into bumpy grass (24 runs, 3 seeds): peak deceleration over 50 ms median
  2.0 g, worst 7.6 g (hull collisions off: worst 4.6 g); the box hull saw 20–35 g stops.
- **R3-5 Units.** Settings → Units: mph (default) or km/h; drives the speedometer and the track
  length in the seed chip. Settings v3 (missing `units` ⇒ mph).
- **Robustness:** if a track fails to generate, the game says so and falls back to the test pad
  instead of hanging on the loading screen.
