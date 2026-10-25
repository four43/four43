# Rally Sim — Spec

Status: **0.5.0, live at https://four43.com/exp/rally/** (2026-10-19). Reverse-documented from the
first-round source (`rally-sim-src.zip`), then playtest rounds 2–5 (sections at the end, newest
last). Generated tracks, worlds and the game loop are specified in `tracks-spec.md`; plans live in
`docs/plans/`. The sections below describe the current game; the round sections record what each
round changed and why.

## Goal

A browser rally driving sim that feels physically honest: real-car dimensions, a per-wheel tire
model, a real drivetrain, and surfaces that change how the car behaves. Plays on desktop
(keyboard / gamepad) and on phones and tablets (touch). Ships as a single self-contained HTML file
at `four43.com/exp/rally/`.

Two kinds of world: the **test pad** (flat, with features for exercising the car; kept for
debugging) and **generated tracks** (loops and stages from a seed: hills, mixed surfaces, jumps;
`tracks-spec.md`). The game loop (title menu, Free drive / Stage / Time attack, countdown,
timing, bests) is specified there too (Phase 2).

## Stack and layout

- three.js 0.186 (render), Rapier 3D compat 0.21 (rigid body + raycasts), esbuild bundle.
- Physics modules (`tire.js`, `drivetrain.js`, `vehicle.js`, `sim.js`, `cars.js`) have **no
  three.js imports** so they run headless in Node for tests.

| File | Role |
|------|------|
| `src/cars.js` | Car configs (`CARS.awd`, `CARS.rwd`) |
| `src/tire.js` | Surface table + brush/Magic Formula tire step |
| `src/drivetrain.js` | Engine, clutch, gearbox, diffs |
| `src/vehicle.js` | Raycast vehicle on one Rapier body; driver aids; auto-shift; snow contact; surface drag |
| `src/sim.js` | Fixed-step `Sim` over a World (`setWorld`, `setSurface`, `resetCar`); Rapier world is `sim.phys` |
| `src/world/padWorld.js` | The test pad as a World (`PAD`, colliders, cones, collision groups) |
| `src/world/trackWorld.js` | A generated track as a World (heightfield, markers, gates, `recover`) — `tracks-spec.md` |
| `src/gen/*.js` | Pure track generators (layout, terrain, obstacles, surfaces, roadside, locator) — `tracks-spec.md` |
| `src/snow.js` | Deformable fresh snow field (R2-6): height + wear grid, press, berms |
| `src/snowView.js` | Snow rendering: window texture, displaced mesh, self-shadow, fresh-snow detail |
| `src/render.js` | three.js renderer: lights/looks, car meshes, cameras; `setWorld` picks the world view |
| `src/render/padView.js` | Pad visuals (ground, skidpad, ramps, humps, slope, cones) |
| `src/render/trackView.js` | Track visuals (terrain LOD chunks, road ribbon, tall grass, markers, gates) |
| `src/render/roadSurface.js` | Road and ground shading (R10): photo texture arrays, edges, wear marks, cracks, dashes, puddles, ice, spill; `extend()` patches on `rally-road` / `rally-ground` |
| `src/render/pebbles.js` | Loose stones on dirt and gravel (R10-6): ten pebble shapes, instanced, per 4 m road chunk near the camera |
| `src/gen/edges.js`, `src/gen/wear.js` | The road's edges (physics + shader) and its driven lines (shader marks + pebbles), per layout sample |
| `src/gen/bumps.js` | Road bumps (R11): scattered humps and short ridges, and the whoops' ridge sets, in road space; stamped into the heightfield |
| `pwa/road-*.jpg`, `pwa/ground-*.jpg` | Surface photos (ambientCG, CC0): colour 1024², normal xy + roughness 512² |
| `src/ui.js` | `Hud`: the dash (speed, gear, rev arc) and the wheel-debug panel |
| `src/rumble/` | Rumble channels (R9): engine, suspension, body, aid, and the mix → `{ strong, weak, left, right }`; pure |
| `src/rumbleOut.js` | Sends the levels to the seat's pads: `trigger-rumble` where listed, else `dual-rumble`; a no-op where unsupported |
| `src/rumbleTune.js` | The `?rumble` tuning panel over the game: sliders, mutes and meters per channel |
| `src/defs/rumble.js` | Rumble channel parameters (physical units), the setting's `STRENGTH` |
| `src/devices.js` | Input devices on the engine: keyboard ramps, pad curves, the touch steering slider and pedals; the engine merges the sources |
| `src/game.sim.js` | `defineGame`: `ACTIONS`, the `stage` main scene and the `title` / `pause` / `results` / `settings` overlays, presets, `game.state` and `game.debug` (no DOM, no three.js) |
| `src/game.view.js` | `defineView`: the view halves of those scenes (renderer, camera, HUD, cards) over `engine.scene.state` |
| `src/game/stage.js` | The run logic (ready, countdown, clock, progress, splits, laps, finish, roll-to-stop) on engine time, and the stage API (`drive`, `restart`, `toTitle`, `choose`, …) |
| `src/game/overlays.js` | The four overlays and their registry controls |
| `src/game/*.js` | The rest of the game layer: progress, pace, modes, bests, settings, autopilot — `tracks-spec.md` Phase 2 |
| `src/menus.js` | The timing HUD (`GameHud`, on engine time) and time formatting |
| `src/main.js` | Browser entry: awaits `RAPIER.init()`, loads/saves settings, calls `boot(game, view, { devices })`; `window.engine` is the debug hook |
| `baked/` | `lion-hawk bake` output: the Kenney car-kit GLBs (vertex coloured), `manifest.json`, `phys.json` |
| `game.config.js` | `lion-hawk bake` / `build` config: models, renames, entry, template, PWA |
| `assets/models/` | Source models: Kenney Car Kit 3.1 (CC0) — the 4 GLBs in use + `Textures/colormap.png` |
| `index.template.html` | Page shell, CSS, HUD/touch markup, meta/PWA tags; bundle injected at `/*BUNDLE*/` |
| `pwa/` | Icon (svg + 192/512/apple-touch PNGs), manifest, service worker, 1200×630 `og-image.jpg` |
| `npm run build` | `lion-hawk build --out <dir>` (or `$RALLY_OUT`): the page, `assets/models/`, `pwa/`, the stamped service worker |
| `npm run dev` | `lion-hawk dev`: serves, rebuilds and re-bakes on save |
| `test/physics.mjs` | Car physics validation |
| `test/snow.mjs` | Fresh-snow validation |
| `test/markers.mjs` | Marker posts tip and settle |
| `test/verge.mjs` | Grass verge drag and bumps |
| `test/gen-*.mjs`, `test/track.mjs`, `test/wild.mjs`, `test/autopilot.js` | Generators and autopilot drives — `tracks-spec.md` |
| `test/game.mjs` | Game loop on the engine's `headless()`: hold, pace, progress, bests, Stage / Time attack runs — `tracks-spec.md` T-27 |
| `test/flow.test.mjs` | Headless flow tests on the engine: title → stage → countdown → finish → results → retry, pause, settings, presets |
| `test/devices.test.mjs`, `test/purity.test.mjs` | Device ramps/curves; the sim modules stay pure |
| `test/e2e.browser.mjs` | Browser flow tests through `lion-hawk/playwright` (`npm run test:e2e`, builds and serves itself) |
| `test/mobile.mjs` | Touch layout + multi-touch, and the game screens, on emulated iPhones/iPads (`npm run test:mobile`, builds and serves itself) |
| `test/dbg.mjs` | Launch trace |

Commands: `npm run dev`, `npm test` (all headless suites, ~4 min), `npm run test:e2e`, `npm run test:mobile`, `npm run build`,
`npm run bake`. Release: bump `version` in `package.json`, `python3 build.py`, commit `games/rally` +
`site/exp/rally`, push `gh-pages` (GitHub Actions deploys).

New Kenney models come from the All-in-1 pack zip (`3D assets/<Kit>/Models/GLB format/`); copy only
the GLBs actually used into `assets/models/` (plus `Textures/colormap.png`) and add them to `game.config.js`, then `npm run bake`.

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
- **Steering:** `maxLock` with partial Ackermann (`ackermann` 0..1 blend), plus **self-aligning
  countersteer** (R5-2, `ALIGN` in `vehicle.js`): when the front axle's velocity points against
  the yaw (an oversteer slide), the fronts turn toward it — the angle that gives zero front slip,
  capped at `maxLock` — weighted by `1 − |steer input|`, faded in over 3–8 m/s forward speed and
  0–0.15 rad/s yaw rate. Hands off, the car catches its own slide; at full input the driver gets
  exactly the lock asked for.
- **Brakes:** total torque with front bias; handbrake on rears only. Brake applied as an
  impulse-limited torque that can stop but not reverse the wheel.
- **Rolling resistance** per surface (`crr`); **aero drag** `0.5 ρ CdA v²` at the CoM.

### Tire model (`tire.js`)
- Brush-style contact-patch deflection state (`dx`, `dy`) with relaxation lengths
  (σx 0.12 m, σy 0.30 m), integrated with exact exponential decay.
- Slip ratio and slip angle derived from the deflection; normalised by the surface's peak slip
  (`kp`, `ap`) into a combined slip `ρ`, clamped at 4 (full slide).
- **Load-sensitive cornering stiffness** (R5-3): the peak slip angle grows as
  `(Fz / 3500 N)^0.5` (load ratio clamped 0.6–1.6), so cornering stiffness is sublinear in load,
  and each car's rear tires use `rearAp` (0.85) × the surface's `ap` — a stiffer rear axle (toe-in,
  wider tires). Together they give both cars a stable understeer gradient; with stiffness ∝ load
  every car was neutral-steer by statics.
- Force = `μ Fz · MF(ρ)` with a normalised Magic Formula (shape `C`, `B` chosen so the peak is at
  ρ = 1), split along the slip direction (friction circle).
- Load sensitivity: peak μ falls 12 % per +100 % load over 3500 N (floor 50 %).
- **Plowing** (R5-4): on loose surfaces a tire sliding sideways bulldozes a wedge of material,
  adding a side force `plow · Fz · tanh(v_lat / 3 m/s)` on top of friction, ramped in from 2× to
  3× the peak slip angle (so it's a slide effect, not extra cornering grip). `plow` per surface:
  gravel 0.25, sand 0.35, snowbank 0.30, mud 0.20, packed snow 0.12, dirt 0.10; tarmac, ice and
  grass (which has its own tall-grass drag) 0.
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
- Gearbox: 5 forward + reverse, final drive, 0.12 s throttle-cut shift. While the clutch is open
  the throttle **auto-blips** the engine toward the new gear's road-speed rpm (R5-1), so a
  downshift re-engages without dragging the driven wheels.
- Diffs: plate LSDs (preload + power/coast ramp) per driven axle; AWD adds a viscous centre diff
  around a 50:50 split.

### Driver logic (`Vehicle.control`)
- **Auto-shift:** up at 94 % redline (engine rpm) with throttle; down when the road-speed rpm
  (driven wheels × ratio, `roadRpm`) is < 48 % redline in the current gear and < 80 % in the lower
  one. Road speed, not engine rpm, because the engine sags during a shift (R5-1).
- **Reverse:** reverse is a negative ratio (R2-3). Auto: hold brake at < 0.5 m/s for 0.35 s to
  engage reverse; in reverse, throttle and brake swap; throttle while near-stopped returns to 1st.
  Manual: shift down from 1st.
- **Assisted mode** (`assist`, off by default — R2-1): per-wheel ABS and driven-wheel traction
  control as low-passed proportional limiters on slip ratio, plus **slide control** (R2-2): above
  3 m/s, throttle is trimmed once the rear axle's slip angle passes 1.2 × the surface's peak slip
  angle, down to a 15 % floor at 2.5 × (`SLIDE` in `vehicle.js`). Steering is never capped: the
  driver always gets the lock they ask for. **Sim mode** turns all of these off.
- Manual gearbox: shift up/down events. Pressing a shift button while in Auto switches to Manual.
- **Hold** (`car.hold`, set by the game on the title, Ready and Countdown): all brakes full, the
  clutch open (gear 0, shown N) so the engine revs freely, no auto-reverse; released, the car drops
  into 1st.

### Cars (`cars.js`)

| | R5 4WD (`awd`) | Classic RWD (`rwd`) |
|---|---|---|
| Model | Kenney `hatchback-sports` | Kenney `sedan-sports` |
| Mass / front weight | 1250 kg / 58 % | 1050 kg / 50 % |
| Peak torque / redline | 362 Nm @ 4000 / 7500 | 230 Nm @ 6000 / 8000 |
| Layout | AWD, viscous centre, front + rear LSD | RWD, rear LSD |
| Livery | blue `#2f6fd6` | yellow `#e8b323` |

## Test pad (`PAD` in `world/padWorld.js`)

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

Inputs are engine actions (`ACTIONS` in `game.sim.js`): axes `steer` (+left / −right), `throttle`, `brake`,
`handbrake`; buttons `shiftUp`, `shiftDown`, `reset`, `resetAll`, `resetHold`, `camera`, `debug`, `pause`,
`confirm`. The engine devices in `src/devices.js` feed them and the engine merges the sources (largest
value wins; every connected pad); physics never sees the source. A button pressed and released between
two steps still counts for one step (the engine's press latch). Enter and Space on a focused button belong to
the button.

- **Keyboard:** W/S or ↑/↓ throttle/brake (ramped), A/D or ←/→ steer (ease-in, faster
  return-to-centre, snaps through centre), Space handbrake, Q/E shift, R reset (on a track: back
  onto the road), Shift+R restart (a timed run: a new countdown), Esc or P pause, C camera, F3 or
  `` ` `` wheel debug. Keys typed into the seed field don't drive. In menus: arrows move, Enter
  selects, Esc goes back (R6).
- **Gamepad:** left stick steer (8 % deadzone, slight expo), RT/LT throttle/brake, A handbrake,
  RB/LB shift, Y reset, X camera, Start pause. In menus: D-pad or stick move one step per push, A
  selects, B or Start go back, LB/RB change the highlighted option (R6).
- Driving input reaches the car from Ready on (the engine revs on the line while held); menus
  give it none. Resets and shifts only act while running or after the finish.
- **Touch** (shown on `pointer: coarse`): a floating steering slider in the left half that zeroes
  where the thumb lands, and Gas / Brake / Handbrake press buttons for the right thumb (+ / − in
  Manual) — see [Round 4](#round-4-touch-controls-2026-10-10).
- Every source merges by the largest value, steering included (an idle touch thumb no longer overrides the
  keyboard or pad).

## UI

- The game opens on the **title** overlay (mode, track, car, Drive) and has `pause`, `results` and
  `settings` overlays and a timing HUD: see `tracks-spec.md` T-26. The cards are the page's own markup in
  `[data-lh-slot]` elements that the engine adopts as registry controls, so every control has a test id:
  `stage.pause`; `title.mode.{freeDrive,stage,timeAttack}`, `title.world.{loop,stage}`, `title.seed` (field),
  `title.dice`, `title.style.{twisty,flowing}`, `title.theme.{summer,winter}`, `title.density.{mild,wild}`,
  `title.car.{awd,rwd}`, `title.settings`, `title.drive`; `pause.{resume,restart,settings,quit}`;
  `results.{retry,newSeed,menu}`; `settings.surface.*`, `settings.assist.{true,false}`,
  `settings.units.{mph,kmh}`, `settings.gearbox.{auto,manual}`, `settings.close`.
- The **settings sheet** (Settings in the title footer, or Settings in the pause menu): Surface
  (pad only), Driving (Assisted / Sim), Units (mph / km/h), Gearbox (Auto / Manual), control help.
  Settings persist in `localStorage` (`rally-sim-settings`, `v` 4: adds `mode`; a saved
  `world: 'pad'` becomes a loop — the pad is reached with `?pad`).
- In play, top left: **Pause** chip and the seed chip ("Loop · seed · 1.2 mi"). A toast shows
  while a track builds; a seed that fails to build says so and the current world stays.
- Top-right chips: Camera, Wheels (debug), Reset (tap: back onto the road; hold: restart).
- Dash: speed (mph or km/h), gear badge, 15-segment rev arc (green/amber/red; all red on limiter).
  Desktop: bottom centre (top, scaled, on short screens); touch: see Round 4.
- Wheels debug panel: per wheel load (kN + bar), slip %, slip angle, surface or "airborne"; bar
  turns amber when sliding (ρ > 1).

## Debug hook

`window.rally` is gone; `window.engine` (the Lion Hawk hook) covers it:

- `engine.state()` (`game.state`: phase, mode, seed, kind, time, laps, p, speed, gear, rpm, pose, …),
  `engine.stepN(n)`, `engine.render(0)`, `engine.settled()`, `engine.errors`.
- `engine.jump('stage', preset, opts, { settings, pad })` goes to a screen. Presets: `title`, `loading`,
  `ready`, `countdown { n }`, `running`, `paused`, `results { time, best, splits }`, `settings`,
  `nearFinish { d }`, `teleport { p }`. Each jump rebuilds the world (field note #33).
- `engine.debug` (`game.debug`): `sim`, `settings`, `screen(name, opts)`, `nearFinish(d)`, `teleport(p)`,
  `finish(opts)`, `split(i, delta)`, `lap(valid)`, `missed(i)`, `blocked(i)`, `count(n)`. The HUD fakes show
  after the next step's flush.
- URL: `?debug=<screen>&mode=<mode>&n=<light>` opens straight onto a screen (on a phone too); `?pad` drives
  the test pad; `?seed=` and `?lh-test` fix the engine seed.

## Validation targets

At 0.3.1: physics 50, snow 21, markers 7, verge 27 (plus the track suites in `tracks-spec.md`:
gen-layout 657, gen-terrain 129, gen-surfaces 100, track 84, wild 12) and mobile 797 — all passing.
The physics targets, with grip as raised in Round 3:

Per car, headless with assists off unless noted:
- Static settle: ΣFz = mg ± 0.5 %, front share ± 1 %, static sag ± 5 %, CoM height ± 1 cm, no creep.
- Drop test: damped heave 1.2–1.7 Hz; < 8 % residual after 1.5 cycles.
- Skidpad steady lateral g (40 m circle): tarmac 0.95–1.05; AWD dirt 0.75–0.90; gravel 0.68–0.87
  (RWD 0.66–0.87); AWD packed snow 0.64–0.84, ice 0.44–0.56. Loose-surface bands were 0.80 / 0.76
  before R5-4: the best steady state there is now a drift.
- 0–100 km/h (assists on): AWD tarmac 4.2–5.0 s, gravel 4.3–5.5 s; RWD gravel 6.5–8.5 s.
- 100–0 km/h (ABS on): tarmac 35–42 m, gravel 44–56 m; front load share rises under braking.
- Hold on a 10 % grade with brake + handbrake: < 1 cm drift in 10 s.
- Handbrake turn on gravel from 50 km/h: rear slip angle peak 30–90°, yaw change 90–270°.
- Reverse (R2-3): holding brake from rest in Auto, or throttle in Manual R, drives backwards.
- Assisted steering (R2-2): full lock at 72 km/h.
- Slide control (R2-2), RWD on dirt and gravel, full throttle with 0.8 steer for 1.2 s from
  54 km/h: Sim slides ≥ 35° body slip (it spun ≥ 90° before self-aligning steering), Assisted holds
  it to 10–60° and under 0.75 × Sim.
- Slides (R5), both cars on gravel in a matched gear: light braking from 90 km/h in Auto makes 2–4
  downshifts ≥ 0.4 s apart with no driven wheel past 0.8 × peak slip ratio; steady 0.06 steer at
  72 km/h runs front / rear slip angle ≥ 1.7 (AWD) / ≥ 1.35 (RWD); a 60 °/s yaw kick at 72 km/h,
  hands off, peaks under 7.5° body slip with yaw rate under 3 °/s within 1 s; a 30° slide at
  72 km/h, coasting with no steering, is under 5° within 0.95 s.

## Site and PWA

Published at **https://four43.com/exp/rally/** like the other games: a self-contained page under
`site/exp/rally/` (not linked from the site's pages), with meta description, canonical, Open Graph /
Twitter card (`og-image.jpg`, 1200×630, an in-game shot with the title), an installable manifest
(fullscreen, landscape, theme `#22333a`), icons, and a service worker: the page network-first so a
new build shows at once, everything else cache-first, cache name stamped per build
(`<version>-<hash>`) by `build.py`. Dev dependency `playwright-core` (no browser download; the
mobile test uses the Chromium in `~/.cache/ms-playwright`).

## Known issues

- **No pad text entry:** the menu navigator skips the seed field, so a controller can only change the
  seed with the dice button (lion-hawk spec §10 "Pad text entry").
- **Livery not applied:** `repaint()` in `render.js` is defined but never called, so cars show
  Kenney's stock paint (the AWD car is green, not its configured blue).
- Fresh-snow rendering is unchecked on a phone/iPad: a 148k-vertex displaced mesh (drawn twice
  with the shadow pass, 1 texture read per pixel plus procedural noise) plus a 16 MB texture, and a refill (a 16 MB clear plus every driven tile) each time the car moves 64 m from the window centre.
- Touch controls are tested in Chromium emulating iPhones/iPads, not real Safari; iOS-only
  behaviour (back swipe, page hiding) needs a device check.
- The site doesn't link to `/exp/rally/` (same as the other games).
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

## Round 4: touch controls (2026-10-10)

- **R4-1 Floating steering.** Touch anywhere in the steering zone (left half, below the top bar):
  that point is straight ahead and a slider appears centred under the thumb; sideways travel of
  `steerRange()` = clamp(12 % of screen width, 60–110 px) is full lock; vertical movement is
  ignored. A new touch re-zeroes wherever it lands (as the other games' floating stick). The zone
  starts ≥ 20 px from the left edge (Safari's back swipe) and inside the notch.
- **R4-2 Pedal buttons.** Gas (bottom-right corner, 1.3× tall), Brake (left of it), Handbrake (above
  Brake) and, in Manual, + / − above Gas: plain buttons, full on while pressed. Size
  clamp(64 px, 21 vmin, 104 px). A thumb sliding off a pedal keeps it pressed until it lifts
  (pointer capture); long-press menus are suppressed.
- **R4-3 Let go when hidden.** If iOS hides the page mid-touch (no pointercancel), everything is
  released on `visibilitychange`/`pagehide`, so the car doesn't drive itself on return.
- **R4-4 Layout.** Safe-area insets go through `--sa-t/r/b/l` CSS variables. Touch landscape: the
  dash sits small at the bottom centre (it takes no touches); portrait: under the top bar. Narrow
  screens (≤ 520 px) stack the seed chip under Settings.
- **Validation (`npm run test:mobile`, needs `npm run dev`):** Chromium with touch emulating iPhone
  SE, 15 Pro and 15 Pro Max (landscape), 15 Pro portrait, iPad Mini and Pro 11 (landscape) and
  Pro 11 portrait, each on the test pad and on a track, with each device's real safe areas set
  (notched iPhones 59 px sides + 21 px bottom in landscape). Checks: pedals visible, ≥ 56 px,
  inside the safe area, own their touches, within right-thumb reach; chips inside the safe area;
  steering zone clear of the swipe edge, covering the left; no overlaps among pedals, chips, dash
  and the zone; then real multi-touch via CDP: first touch steers 0 with the slider under it, half
  the range ≈ half lock, full lock past it, gas while steering, release order, brake held when the
  thumb slides off, all released, re-zero on a new touch, release on page hide. 797/797.

## Round 5: slides (2026-10-18)

Playtest feedback: "the cars slide around a ton … like they're on ice, even when it's gravel …
we seem to not recover from slides". Steady grip was right (skidpads in band) — the problem was
transient. Headless probes found one bug and three missing pieces of physics.

- **R5-1 Downshifts don't lock the wheels (bug).** Auto downshifts decided on engine rpm, which
  sags while the clutch is open, so braking cascaded 3-2-1 in 0.12 s (1st at 57 km/h), and the
  clutch re-engaged onto a slow engine: driven wheels hit slip ratio −0.5 (≈ 3× peak), killing side
  grip right at turn-in (RWD: a snap spin). Now downshifts use road-speed rpm and the gearbox
  auto-blips during the shift. Measured: worst driven-wheel lock 2.8–2.9 × peak → 0.24–0.26.
- **R5-2 Self-aligning steering.** Real fronts self-align (caster) into a slide when the driver's
  grip is light; with keyboard/touch and no force feedback the player couldn't find the
  countersteer. See Steering above. A hands-off 60 °/s yaw kick at 72 km/h settles in 0.3–0.6 s
  (was 1.5 s AWD; RWD never settled).
- **R5-3 Understeer gradient.** Cornering stiffness ∝ load made both cars exactly neutral; see
  the tire model. Front / rear slip angle in a gentle steady corner: AWD 1.43 → 1.91,
  RWD 1.21 → 1.43.
- **R5-4 Plowing on loose surfaces.** Sliding sideways on gravel now scrubs speed like digging
  in: a 30° slide at 72 km/h straightens in 0.77 s AWD / 0.88 s RWD (was 1.06 / 1.27 s). Grip
  driving is unchanged (~0.71 g on the gravel skidpad, slip 8° front / 3° rear), but the skidpad
  driver now finds more in a drift — AWD 0.84 g (front 19°, rear 10°), RWD 0.80 g (rear 20°);
  packed snow 0.68 → 0.80 g — as on real loose surfaces, where sliding builds a wedge to lean on.
  Bands widened to match.
- **Validation:** `test/physics.mjs` 66 (was 50: 14 new R5 checks, each failing on the pre-R5
  physics; the slide-control and loose skidpad targets revised as above); `npm test` all passing.
  Plow values live in the `rally-*` materials' `game` block
  (`game.plow`, `src/defs/materials.js`; the engine's `tire` schema has no such field). Goldens
  re-blessed (same checkpoints, the 20 s drive ends 0.6–1.7 m further on). `test/feel.mjs --check`:
  stage times within ±3 %; grass coast from 80 km/h 0.55 → 0.47 g (no more downshift lock-ups adding
  braking; `verge.mjs` band 0.3–0.75 g); its off-road samples were already outside tolerance before R5.

## Round 6: controller menus (2026-10-18)

Request: every menu navigable with a controller. Built as an engine feature (lion-hawk menu navigation,
U-7–U-10; research and decisions in lion-hawk `docs/research-menu-navigation.md`).

- **R6-1 Menus.** Title, settings, pause and results are modal menus that own the input while on top
  (`nav` in `src/game/overlays.js`): the D-pad, stick or arrow keys move focus one step per push with no
  wrap, A/Enter select, LB/RB step the highlighted option row. Focus opens on Drive, Resume and Retry,
  and returns to where it was when a menu on top closes.
- **R6-2 Back.** B, Esc and Start go back: settings closes, pause resumes, results goes to the main menu
  (same as its Menu button); the title has no back.
- **R6-3 Pause.** Start or Esc open pause while driving (ready, countdown, running) through the menu's
  `nav.open`; P still presses the `pause` action, and the touch chip still taps it.
- **R6-4 A is no longer `confirm`** on the pad (and Enter no longer presses it): inside a menu the
  navigator owns them, which fixes A on a focused title option also starting the run (#16). The
  `confirm` action stays for tests and bots.
- **R6-5 Prompts.** Drive shows the A glyph, Resume and Menu the B glyph, in the art of the pad in use
  (Xbox, PlayStation, Steam Deck, generic) or the keyboard; hidden on touch and mouse.
- **Validation:** `flow.test.mjs` back/open/modal checks headless; `e2e.browser.mjs` walks the title,
  settings, drive, pause and resume with the harness's fake pad (the test machine's controllers never
  reach a test); mobile 797/797. `lh-alloc` warms 2000 steps (JIT tier-up under parallel load reached
  the measured half at 600; 40000 steps showed no growth); `looks.test.mjs` follows the engine's
  texel-snapped shadow box.

## Round 7: controller rumble (2026-10-19)

Request: rumble that differs per surface, with a distinct feel when the car starts to slide and when
wheels lose traction, plus a small page for choosing between options per scenario. Tested target: an
Xbox pad in Brave/Chrome on Linux, so two body motors (`strong` left/low, `weak` right/high) and no
trigger rumble.

- **R7-1 Mixer** (`src/rumble.js`, pure, once per rendered frame). Layers summed per motor, clamped:
  - *Surface*: each touching wheel is a quarter of its surface's pattern (blends split by their `ids`/`w`,
    which `blendSurface` and the snow wear blends now carry). Speed s = (|v| − 1) / 24, clamped 0..1 (full at
    90 km/h): hum and wave follow s^1.6 and grain taps come s² as often; below s = 0.5 the taps lengthen (up
    to 3×) and move onto the strong motor. Slow is a dull, occasional thud (gravel ≈ 1 tap/s at 20 km/h),
    and the picked texture comes in with speed (playtest 2026-10-19: the first √s ramp was much too bumpy
    when slow). From 50 km/h the car planes over the small bumps (playtest 2026-10-19: more speed must not
    mean more rumble): the surface's level and its tap rate both fade linearly to 0.35 by 120 km/h, so the texture
    peaks around 70 km/h; the slow end is unchanged; impacts and landings don't fade.
    Airborne or stopped is silent.
  - *Slide onset*: rear |α| / ap ≥ 1.15 above 4 m/s; ends below 0.85 (hysteresis: a held drift doesn't
    re-fire). The onset plays the pattern's `hit` once, then a sustain growing with depth to 2.5.
  - *Wheelspin*: driven wheels' κ / kp ≥ 1.3 with throttle on, on the weak motor.
  - *Braking* (foot brake on, above 1 m/s; with the handbrake on only the fronts count, so a handbrake turn
    is not a lock-up). Warn before the lock, as Forza's and F1's trigger rumble do (research 2026-10-19:
    those games rumble at the limit, before the tyre breaks loose; pedal rumble that only fires after a
    lock is called a gimmick). *Brake limit*: the worst wheel's −κ / kp from 0.75 up to 1 (its peak) plays
    light ticks that quicken towards the peak. *Lock-up*: from 1.1 it hands over to heavy ABS-style pulses
    on the strong motor (10 Hz; real ABS is ~5–20 Hz, and the pad's motors blur above ~10) and goes back to
    the warning the frame the wheel rolls under the peak (1.0), so release and re-squeeze can be felt.
- **R7-2 Patterns** (`src/defs/rumble.js`): layers `hum`, `wave`, `grain`, `hit`; three options per
  scenario (8 surfaces: tarmac, dirt, gravel, grass, sand, mud, snow (packed and snowbank), ice; 4 events:
  slide, wheelspin, brake limit, lock-up, suspension impact, jump landing).
  `road` in PICKS is a master gain over every surface (0.4; playtest 2026-10-19: road noise was annoying and
  hid the brake pulses), a slider in the lab.
  Shipped picks (chosen in the lab on an Xbox pad, 2026-10-19, second round): road ×0.4 over tarmac A ×0.4,
  dirt A ×1.15, gravel C ×0.5, grass A ×0.3, sand A, mud C ×0.55, snow B ×0.65, ice C; slide A ×0.35,
  wheelspin C ×0.1, brake limit B (rising buzz), lock-up B (ABS pulses, 7 Hz, both motors); then impact C
  (slam) ×1.5 and landing A.
- **R7-3 Output** (`src/rumbleOut.js`): `playEffect('dual-rumble', 120 ms)` re-sent every frame to
  every pad with an actuator. Rumble only in the driving phases (ready, countdown, running; not after the
  finish line) with no overlay open and the tab visible. Chromium runs `reset()` at once but queues effects,
  so a reset can cancel the effect sent a frame earlier; hence two kinds of quiet:
  - *Gap* (driving, both levels ~0, e.g. between ABS pulses): one zero-magnitude effect, queued behind the
    pulse, never a reset (playtest 2026-10-19: resets in the gaps ate the lock-up pulses whenever the road
    was silent; the lab always had gravel underneath, so it worked there). Over ~¼ s it becomes a stop.
  - *Stop* (menus, pause, finish; `kill()` on hidden tab, `pagehide`/`beforeunload`, stage exit): zero effect
    plus `reset()`, repeated for 20 frames (playtest 2026-10-19: still rumbling in menus and after a
    refresh). A pad's first sight on a page gets one too, clearing anything the previous page left playing.
- **R7-6 Suspension impacts** (playtest 2026-10-19: big hits, like a jump landing or lumpy grass, should be felt,
  not only small chatter). Each wheel keeps `jolt`, a decaying peak (half-life 50 ms) of its compression speed in
  m/s, plus 1.5 on the bump stop (`JOLT` in `vehicle.js`; nothing in the physics reads it). Without the peak, a
  landing's compression is over in ~33 ms, and a frame could miss it. The mixer fires a hit when the worst wheel's
  jolt rises (by 0.2 since the last frame) past 1.3 m/s, at most every 0.15 s, sized (1.3 → 5 m/s) and growing if
  still rising in its first frames. A respawn settling peaks ~1.1 (no hit); a 1.5 m drop ~4.4, 3 m ~7.1; grass
  verge bumps at 36 km/h gave ~4 hits/s up to 4.7. A big landing stays over the threshold longer than the
  cooldown as it decays; the rising rule keeps it one hit (a 2 m drop: one 0.2 s hit, then the real bounce). Its
  own pick and gain (`impact`), not under `road`. Patterns' `hit` gained `scale`/`lenK` (sized by the level),
  `delay`, and lists of hits.
- **R7-7 Jump landings** (playtest 2026-10-19: landings were "very weak"; a jump landing should basically max out
  the controller). Size alone can't tell a landing from a grass lump (verge bumps reach 4.7 m/s; a 2 m drop ~6.5),
  but time in the air can. The first touchdown after ≥ 0.2 s with every wheel off the ground is a *landing*,
  replacing that touchdown's impact, sized by the flight (0.2 → 0.7 s) or the jolt (1.3 → 3.5 m/s), whichever is
  bigger, never under 0.75 (`floor`). Default (A): both motors at 1.0 for 0.3–0.5 s, then a heavy tail on the
  strong motor. Browser, dropping the car: 1 m and 2 m both gave ~0.48 s with both motors flat out; 0.3 m (a short
  flight) stays an impact. Its own pick and gain (`landing`).
- **R7-4 Setting**: Rumble Off / Light (×0.5) / Full (default) in the settings sheet (`settings.rumble.*`).
- **R7-5 Lab** (`?rumble` on the game page, dev server or site): a card per scenario with options A–C,
  gain, and Hold; global speed, event depth and the surface under events; a 16 s sequence (launch spin,
  gravel, slide, tarmac, threshold braking (to the limit, hold, lock, release, back to the limit), lumpy
  grass, a jump landing, snow, ice); live motor meters and event chips. Pad: D-pad
  up/down picks a card, left/right its option, hold A plays. Picks save to `localStorage`
  (`rally-rumble-picks`), and the game reads them on load, so the lab's choices can be tried on a stage;
  Export gives the JSON for `PICKS`.
- **Known gap**: with Assist on, ABS scales brake torque only down to 10 %, which still locks on low-grip
  surfaces (grass: wheels cycling 2.4–4× peak slip), so assisted braking there feels like lock-up pulses, not
  the limit warning.
- **Validation**: `test/rumble.test.mjs` (coverage of materials, silence, surface contrast, picks and
  gain, blends, slide hysteresis (fails with hysteresis removed), crawl, spin vs lock motors and pedals,
  the output against a fake actuator). In a browser with a fake pad: rumble streams while driving and
  pause sends one reset. The feel itself is yours to judge on a real pad.

## Round 8: local players (0.6.0, lion-hawk 0.13, 2026-10-21)

- **R8-1 Devices are a mapping context.** `src/devices.js` declares the `drive` context (the keyboard with its ramps, every pad
  with the expo stick, the touch slider and buttons); `useSeats(view, doc)` turns on one seat that every pad joins, so two pads
  still drive one car (#30). `boot({ devices })` keeps only the glyph prompts.
- **R8-2 Rumble on the seat's pads.** `rumbleOut` sends to `view.localPlayers[0].pads` and stops through `view.haptics.stop()`:
  `'menu'` (title, settings, results, pause), `'finish'` and `'exit'` (the stage exits), once per transition. Nothing is sent
  while `view.haptics.paused`. The engine stops the pads on page hide, blur and `pagehide` and resets a pad the first time it
  sees it (lion-hawk C-14), so Rally no longer does. A quarter second of quiet while driving still ends with one zero effect
  plus reset (R7's gap rule). The `?rumble` lab runs no engine: it sends to every connected pad and zeroes them on `pagehide`
  (`rumbleOut`'s `kill()`).
- **R8-3 State homes** (lion-hawk §2.2, [T-25]): the last lap, this session's best lap and the stage finish time (ms) are
  player 1's player state (`engine.players[0]`: `lastLap`, `bestLap`, `finish`); the run's phase is game state
  (`engine.gameState.phase`). The stage writes them where it changes them; `s.phase` stays the HUD's copy.
  Deferred (lion-hawk §2.2's worked example for Rally, partly built): the splits, the countdown and the track seed stay in the
  stage state for now; they move to player or game state when Rally has a second player or a net part.
- Follow-up after this round: the "almost slip" brake warning in the left trigger (`trigger-rumble`).

## Round 9: physical rumble (0.7.0, 2026-10-25)

Request: rework the rumble around physical events, not canned patterns. Four sources mixed into one output: the engine,
suspension impacts (by surface and speed), body impacts (sized by the force), and a driving aid in the triggers (a kick
nearing the braking or traction limit, ABS-like pulses past it). Stop on pause and when the window goes. Replaces all of
R7-1, R7-2, R7-5, R7-6 and R7-7; R7-3's send rules, R7-4's setting and R8-2's stops stay.

- **R9-1 Channels** (`src/rumble/`, pure, once per rendered frame; each `create(params)` → `update(input, dt) → levels`,
  with its own state). Inputs are the Vehicle (`rpm`, `out.throttle`, `input.brake/handbrake`, `speed`, `wheels[]`) and this
  frame's car contacts (R9-3). Levels are 0..1.
  - *Engine* (`engine.js`) → weak motor only. A steady level `idle` at idle rpm rising to `redline` at the cut-off,
    × (`load` + (1 − `load`) · throttle), so a revving engine under throttle is felt and a coasting one barely. On the
    limiter it pulses at `limiterHz`. It hums on the start line too (the engine runs while the car is held).
  - *Suspension* (`suspension.js`) → both motors. Per wheel in contact, a synthetic road under the tyre: half-cosine
    bumps `rough` m high (random 0.5–1.5×) and `width` m long, a random (exponential) ~`spacing` m apart, so they
    arrive at |v| / spacing per second. The road height goes through a spring-damper (`hz` 18, `zeta`: the tyre and
    wheel), stepped at 1 kHz, and the felt motion is the wheel's vertical speed. A bump much longer than the spring's
    period is followed (slow: a soft lift that grows with speed); around it, it hits hardest; much shorter is soaked
    up, as its area shrinks with speed (fast: the car planes over it), so planing comes out of the filter with no fade
    curve. The wheel's acceleration would not do: the spring passes a bump's height on at once, however short the bump
    (the first build used it and nothing planed). Below `splitHz` the motion goes to strong, above it to weak; each
    motor follows the peak and falls back over `release`; `full` m at its loudest speed is level 1, × `gain`. With the
    first defaults, gravel peaks around 55 km/h and fades by 160 km/h, grass peaks higher, sand keeps rising (long
    soft dunes), ice is near silent. Blends interpolate their two surfaces' numbers by `w`.
    Real hits are added on top: the wheels' largest `jolt` (R7-6's decaying peak, kept) from `joltOn` to `joltFull`,
    on strong and `joltWeak` of it on weak. Jump landings are no longer a special case: a landing is a big jolt (and a
    body contact if it bottoms out).
  - *Body* (`body.js`) → both motors. The frame's car contact impulses, summed, as a velocity change Δv = impulse / car
    mass (m/s), start a hit of size `clamp01((Δv − dvOn) / (dvFull − dvOn))`, decaying with half-life `decay` ×
    (1 + 0.5 · size) s; the level is the largest live hit (up to 8 kept), on strong and `weakShare` of it on weak.
    Markers, walls, a roll onto the roof and the floor bottoming out all come through here.
  - *Aid* (`aid.js`) → left trigger (brakes) only. Foot brake above `pedal` and |v| above 1 m/s; the worst wheel's
    −κ / kp (with the handbrake on, fronts only). From `near` to 1 (its peak) a *kick*: a short tap (`kickLen` s at
    `kickAmp`) on crossing `near` (re-armed under `rearm`), then a level rising `nearAmp` × depth. Past `lock` (back
    under `unlock`) *pulses*: square wave at `pulseHz` (≤ 10 Hz), `amp`. The right trigger is unused: a wheelspin aid
    there (the same machine on the driven wheels' κ / kp) fired all the time and didn't help (playtest 2026-10-25), and
    was removed. A rear-axle slide is not an aid event.
  - *Mix* (`index.js`): per motor, the sum of the channels through `tanh(x · drive) / tanh(drive)` (soft clip: a big
    hit dominates without hard-clipping the rest away), × the setting's gain (R7-4: Off 0 / Light 0.5 / Full 1), with a
    per-channel mute from the panel (R9-5). Output `{ strong, weak, left, right }`.
- **R9-2 Parameters** (`src/defs/rumble.js`; tuned on a Bluetooth Xbox pad 2026-10-25: a faint engine with a strong
  limiter buzz, gentle road texture (`gain` 0.2), big hits on the strong motor only, a soft brake warning from 0.7 of the
  peak and light 5.5 Hz ABS pulses): one plain object per channel, physical units (m, Hz, m/s, s), a comment
  on each. Surfaces: `rough`, `spacing` and `width` per rumble surface (tarmac, dirt, gravel, grass, sand, mud, snow, ice): ice
  near zero, gravel short and sharp, sand and mud long and soft. `RANGES` gives each parameter's slider range;
  `tuneParams(saved)` lays a save over a copy of the defaults (unknown keys and non-numbers dropped). Defaults are a first guess to be tuned on a real pad.
  `SCENARIOS`, `PICKS`, the pattern player and the `rally-rumble-picks` key are gone (an old key is ignored).
- **R9-3 Car contacts.** The car entity spawns with `contacts: { min }` (lion-hawk M-5), `min` = 0.1 m/s × mass per step
  (`BODY_CONTACT` in `vehicle.js`; resting on the roof is ~0.04), so a tuned `dvOn` never needs a respawn (the wheels are
  raycasts: normal driving never touches the body). The view takes the
  engine's `contact` events whose `a` or `b` is the car's entity id and passes them to the body channel that frame.
- **R9-4 Output** (`src/rumbleOut.js`). Every pad is tried with `trigger-rumble`, whatever its actuator's `effects` lists;
  a rejection moves that `Gamepad.id` to `dual-rumble` for the page's life (playtest 2026-10-25: Brave played
  `trigger-rumble` from the `?debug=pads` bench, which never checks, while Rally, believing the list, folded the aid onto
  the weak motor; the panel shows what the pad lists and which kind is sent). A pad that takes it gets one
  `trigger-rumble` effect per frame: `strongMagnitude`, `weakMagnitude`, `leftTrigger`, `rightTrigger`. Any other pad gets
  `dual-rumble`, with the aid folded in: weak += max(left, right) × `aid.fold`.
  **Write budget** (playtest 2026-10-25, Bluetooth pad: an effect per frame queued up below the page, and the pad kept
  rumbling through a pause and after the window closed; the queue is the writes, not the durations). `PARAMS.send`: a
  change of `delta` in any motor goes out at most every `minMs` (50), a steady level is re-sent every `keepMs` (150) as an
  effect `durMs` (250) long, and a quiet is one zero effect; no reset (it is a write, and cancels a queued pulse). Steady
  ~7 writes/s, at most 20 (ABS at 8 Hz: 16). Replaces R7-3's every-frame send and gap rule. Tuned 2026-10-25 to
  `minMs` 120 / `keepMs` 120 / `durMs` 220 (~8 writes/s): ABS pulses at 8 Hz need 16 writes/s, so they blur at that budget.
  The tests check the mechanism with their own budget and engine values, not the shipped tuning. Stops are the engine's (R8-2: pause, blur, hide, `pagehide`, first
  sight; Rally's `menu`, `finish`, `exit`). **lion-hawk change (C-14):** a stop also sends a zero `trigger-rumble` to pads
  that list it, so a trigger effect queued a frame earlier cannot outlive the `reset()`.
- **R9-5 Tuning panel** (`?rumble` on the game page; desktop only, `src/rumbleTune.js`). The game runs as usual with a
  side panel: a section per channel (Engine, Road, Impacts, Driving aid) with a few plain-language sliders and a help line
  each (`LAYOUT`; values in their units, mm, m/s, Hz, s; some inverted so right is always "more"; hover shows the
  parameter), Surfaces as one bump-height slider each, every other parameter under Advanced (named as in the code), the
  mix and the write budget under one Advanced fold (playtest 2026-10-25: the raw knobs were confusing), a mute per channel, live meters
  per channel and for the four outputs, and the pad's `effects` (does it have triggers). A write line: writes per second, and how
  they ended (completed, replaced by the next, rejected, the last error), from `rumbleOut`'s stats (playtest 2026-10-25: a
  Bluetooth pad at 22 % battery took every write and played none; over USB the game rumbled). Values save to `localStorage`
  (`rally-rumble-tune`) on change and the game reads them on load, also without `?rumble`; Reset per channel; Export gives
  the JSON for `src/defs/rumble.js`. View-only: it never writes the sim. The standalone lab (`rumbleLab.js`) is gone.
- **Validation**: `test/rumble.test.mjs` rewritten per channel: engine rises with rpm and throttle, weak only; suspension
  silent stopped and airborne, ice ≪ gravel, the filter's level at 120 km/h below its peak (planing), a jolt adds to
  strong; body ignores Δv under `dvOn` and other entities' contacts, sizes and decays; aid kicks once on crossing
  `near` (not again while held), pulses past `lock` at `pulseHz`, back to the warning under 1.0, handbrake rears ignored,
  wheelspin drives nothing; mix soft-clips and mutes. The mechanism tests use their own values, not the shipped tuning. `rumbleOut` against fake actuators with and
  without `trigger-rumble`. `test/contacts.test.mjs`: driving on the flat pad gives the body no contact; a roll onto the roof
  from 1.5 m does (a few m/s). lion-hawk: a stop zeroes `trigger-rumble` where listed. On the Bluetooth pad: pause
  mid-ABS-pulse and alt-tab mid-slide stop all four motors; the feel is tuned in the panel.

## Round 10: road and ground surfaces (0.8.0, 2026-10-25)

Request: a better-looking road and pavement, after `procedural-road-surfaces.md` (techniques for world-space procedural
road layers), using lion-hawk's material system where possible. Playtest calls during the round: no wheel ruts (too
neat, dead centre), no drawn stones (circles); real pebbles, bigger; photo textures (ambientCG); no blotchy patches;
short, varied wear marks instead of lines; puddles only on the flat; a better grass.

- **R10-1 Edges** (`gen/edges.js`, pure, `track.edges`). Per layout sample a half-width per side: 3.5 m + a shared wobble
  (~25 m) + a per-side wander (~5 m), scaled per road surface (tarmac 0.15 / 0.04 m, loose up to 0.45 / 0.25 m),
  clamped to 2.9–4.0 m (markers stand at 4.5 m). `TrackWorld.materialAt` / `blendTo` call `onRoad(edges, layout, s, d)`
  in place of |d| ≤ 3.5, so the wheels and the shader share the edge. The shader adds up to ~±0.1 m of fine fray.
- **R10-2 Ribbon** (`trackView.buildRoad`). Out to ±5.5 m (the flat shoulder), 11 vertices across per 1 m sample.
  Vertex colours are the terrain's `colorAt`, and its ground part is drawn by the terrain's own function, so it meets
  the terrain without a seam. Attributes: `aRoad` (offset, distance), `aEdge`, surface weights `aSurfA` / `aSurfB`
  (so section blends mix presets in one shader), `aWear`. Coarse terrain LODs sink from 5.5 m to 8 m.
- **R10-3 Road shader** (`render/roadSurface.js`, `mc.extend(rally-road, 'rally-road-surface')`). Standard PBR kept.
  Layers: edge, photo (R10-7), broad tone drift, fine aggregate where there is no photo, tarmac cracks (thin, in some
  stretches), centre dashes (tarmac), dirt puddles (rare, only where the ribbon is within ~2–4.5 % of level), spill onto
  the shoulder in tongues. A height (m) bends the normal by screen-space derivatives after the photo's normal. Presets
  live in the registry, `game.road` per road surface (`defs/materials.js`).
- **R10-4 Ice**: procedural (no photo): crack network as normals (shallow; cracks scatter white), frost off the wear
  marks and near the edge, Fresnel sky reflection as emissive (sky = fog colour + muted zenith; no environment map),
  fake refraction to a dark bed 0.12 m down with red-first absorption, white fracture sheet and clustered bubbles.
  Packed snow sparkles faintly.
- **R10-5 Shoulder**: road material spills 0.3–1.5 m past the edge (not on ice); loose stones there are pebbles.
- **R10-6 Pebbles** (`render/pebbles.js`): ten random low-poly stones (a jittered ring and one apex or a ridge, 5–9
  flat-shaded triangles, seeded once for all tracks), one engine instanced mesh each, material `rally-pebble`.
  Placed per 4 m road chunk in road space (no locator), deterministic per chunk and cached; per surface
  `game.road.pebbles` (gravel 40 /m² road, 24 shoulder, radius 2.5–9 cm; dirt 10 / 14, 2–7 cm), noise clusters, thinned
  in the wear band, piled beside it. Shrunk to nothing 20–31 m from the camera (the compiler's WIND feature, no sway);
  buffers rewritten after 1.5 m of camera travel; no shadows; polygon offset in front of the road. ~11k stones in view
  on gravel (~75k triangles).
- **R10-7 Photos** (`pwa/road-<surface>-color.jpg` 1024², `-normal.jpg` 512² with normal x, y in red/green and roughness
  in blue; ambientCG CC0: Asphalt025C tarmac, Ground079S dirt, Gravel040 gravel, Snow010A packed snow; Grass004 and
  Snow005 for the verges). Loaded once per page into two `DataArrayTexture`s (a layer per surface); until then (or on
  failure, a console warning) the procedural colours and vertex colours stand in. Anti-tiling: a random offset and
  quarter turn per noise cell, two neighbours blended across the cell's fraction biased by colour (Quilez technique 3;
  normal slopes turned back), plus a broad brightness drift from the same photo at 1/9 scale. Sampled with
  `textureGrad`, so per-surface branches are safe. Each road slot's mean colour replaces its stand-in colour.
  Shipped from `pwa/` because `lion-hawk build` copies only baked models and top-level PWA files (precached offline).
- **R10-8 Wear** (`gen/wear.js`, `track.wear`): per sample a driven line (centre cuts to the inside of bends from
  smoothed curvature, wanders, fades 0.35–1) and a second line in places. The shader never draws lines: it scatters short
  tyre marks around them (four layers of 5–17 m cells; per mark its own start, length, offset, slant, width, one wheel or
  a pair, contrast and mottling). Per surface `game.road.wear`: tint, groove depth, how much relief it flattens,
  roughness, berm (loose ridge beside a mark). Ice marks are polished clear of frost.
- **R10-9 Ground** (`mc.extend(rally-ground, 'rally-ground-surface')`): the verge's photo (registry `game.ground`) as
  detail (photo / its mean) over the terrain's vertex colours, the slope surface's photo (dirt in summer, gravel in
  winter) on steep ground; roughness kept near 1 (the photos' maps glared).
- **Cost**: RTX 5070 Ti at 1080p, uncapped: 0.55 → 1.1 ms a frame. SwiftShader: ~1.4 s a frame (the rumble e2e's
  frame-bound wait is 30 s). Needs an iPad check.
- **Validation**: `test/edges.test.mjs` (edges bounded, varied, calmer on tarmac, continuous; surface lookup flips at the
  edge on both sides; wear inside the edges, inside of bends, a second line in places, groove/berm profile). Headless
  track, wild, verge, markers and game suites pass with the moving edge. Render tests: all worlds draw, no errors.

## Round 11: road bumps (0.8.0, 2026-10-25)

Request (playtest): the whoops were too big and tossed the car; instead many smaller bumps and ridges of varied size,
angle and width across the track; ridges are fine as long as they can be ridden.

- **R11-1 Bumps** (`gen/bumps.js`, pure, `track.bumps`; sorted arrays: centre s, d, long-axis rotation, half-lengths,
  height). Raised-cosine domes over ellipses in road space; where they overlap, the tallest plus a third of the rest
  (a sum stacked them into walls). Faded out from |d| 4.5 m to 5.5 m (the flat shoulder's end). Nothing narrower than
  0.9 m half-length, so the 1 m heightfield can carry it.
- **R11-2 Scatter**: per 10 m of road, area × per-surface density × a roughness from noise (~70 m rough and smooth
  stretches, 0.25–1.75×): /m² tarmac 0.012, dirt 0.06, gravel 0.07, packed 0.045, ice 0.03. Half-length 0.9–3 m
  (mostly small), elongation 1–4 (round hump to short ridge), any angle, height 1.5–3.5 cm per m of half-length ×
  the surface scale (tarmac 0.4, ice 0.5, packed 0.8), cap 9 cm. Centres to 1 m past the edge. None within 10 m before /
  15 m after a kicker, crest or tabletop (jump faces and landings stay graded: a bumpy landing threw the autopilot off a
  wild tabletop).
- **R11-3 Ridge sets**: a `whoops` feature is now only a stretch (count 4–10 × 5–6 m; no profile, `profileOffset`
  ignores it). In it, ridges 3.5–7 m apart, each across the road at a set angle (±30°) ± 10°, 0.9–1.6 m thick, 1.5–4.5 m
  half-width, offset ±1.5 m, 6–16 cm tall (cap 17 cm).
- **R11-4 Wild**: ×1.5 bumps, ×1.15 heights (×1.4 put the car in the air 0.3–0.7 s over a ridge set).
- **R11-5 Stamping**: `generateTerrain(…, { roadBumps })` adds `bumpsAt(s, d)` to the road target in the flattened
  band; the road profile `road[]` (spawn, recovery, autopilot) stays without them. The ribbon now samples the
  heightfield (`heightAt`) every 0.5 m across, and pebbles sit on it, so the wheels ride what is drawn.
- **Validation**: `test/bumps.test.mjs` (sorted, capped, representable, varied sizes / elongations / angles, steepest
  face < 20°, tarmac far smoother, ridge sets inside whoops stretches, the heightfield carries the bumps). Ride probe
  (autopilot forced through 15/23 ridge sets on 4 stages): mild at 54, 79, 101 km/h no airtime, up.y ≥ 0.994; wild at most
  a 0.07 s hop, up.y ≥ 0.965. Track, wild, game, verge, markers suites pass; goldens re-blessed (the stage surface
  changed); `test/game.mjs` run 2 now idles 0.5 s after Go to differ from run 1 (a held car is at rest at Go).

## Round 12: road width (2026-10-25)

Request (playtest): vary the width of the track; it was too much the same (3.5 m ± ~0.45 m everywhere). Then: as wide as
20 m and as narrow as 1.5 car widths (~2.6 m; the car is ~1.75 m across).

- **R12-1 Width** (`gen/edges.js`): a base half-width drifting between 1.4 m (a single-car lane) and 9.5 m (a 19 m
  road) over ~220 m, log-interpolated (so ~3.7 m, a 7 m road, is typical) through a smoothstep (so stretches sit near
  both ends); the inside of bends widened by |κ̄| × 30 m (curvature averaged over ±15 m), up to 1.2 m; then R10-1's
  wobble and fray. Within 35 m of a gate it is the standard 3.5 m, eased over 70 m (on loops that spans the seam, so the
  loop closes without a step). Clamp 1.3–10 m. Where a lane is too narrow for a wear pair (R10-8), the pair sits centred.
  Tight bends are at least two car widths (3.5 m of road): the minimum ramps from 2.6 m to 3.5 m as |κ̄| goes from a
  radius of 80 m to 40 m, and a narrower road is widened on both sides in proportion (centre kept). Playtest: "much more
  fun"; the minimum in tight corners was the follow-up.
- **R12-2 What follows the edge**: markers stand 1 m past the edge on their side (`placeRoadside(…, { edges })`); the
  terrain's flat shoulder is that side's edge + 2 m (`generateTerrain(…, { edges })`), the verge bumps fade in 0.5–4.5 m
  past it; road bumps fade 1–2 m past the edge; the ribbon spans the two shoulders' ends (49 vertices, ≤ 0.5 m apart);
  the shader's spill fades out 1.4–1.9 m past the edge. The terrain's road-distance grid (shoulder tint, coarse-LOD sink,
  verge cover) is measured as if the road were 3.5 m wide (less that side's edge's excess), so they follow the real edge.
- **Cost**: wide gravel carries more pebbles: RTX 5070 Ti 1080p, 1.63 ms a frame there (1.1 ms before R12).
- **Validation**: `test/edges.test.mjs`: half-widths span < 1.8 m to > 7.5 m, bends of |κ̄| ≥ 1/40 at least 3.5 m wide, tight bends wider on the inside, standard
  at the start gate, no step at a loop's seam; tarmac's local wander (against a ±12 m average) under half of loose.
  Generator, track (its verge probe now 1 m past the edge), wild, game, verge and markers suites pass; goldens re-blessed.

