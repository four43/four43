# Pig Pens v2: Summary Specification

Version: 2.0
Date: 5 October 2026
Published page: https://claude.ai/artifact/LJhHWc3FBwULhavmjkyG75
Baseline: Pig Pens v1 (`pig-pens-spec.md`, version 1.3, the mud and hose release)
Language standard: ASD-STE100 Simplified Technical English (STE). Section 2 gives the new technical names (TN) and technical verbs (TV).

---

## 1. Introduction

### 1.1 Purpose

This document gives a summary of all changes from v1 to v2. Use it together with the v1 specification. If this document and the v1 specification do not agree, this document is correct.

### 1.2 Summary of changes

v2 adds these items:

- A chicken flock with a pecking order, grain, eggs, chicks, a coop and a bedtime.
- A fox that swallows a chicken and then spits it out. The fox never removes a chicken from the farm.
- Feathers that fall from frightened chickens and stay on the ground.
- Gates that open and close.
- A tractor that the user can drive.
- A Hand tool with information cards and a press-and-hold action.
- A day/night switch.
- Sleep for pigs at night: closed eyes and "z" letters that float up.
- White hens, a copper rooster and yellow chicks.

v2 removes these items:

- The minimap.
- The Look tool. The Hand tool now turns the camera.
- The day clock. The day/night switch replaces it.

### 1.3 Deliverables

| Item | File |
|---|---|
| Application | `pig-pens.html` (one self-contained file, approximately 6.0 MB) |
| Source code | `pig-pens-v2-source.zip` |
| v1 specification | `pig-pens-spec.md` |
| v2 summary specification | `pig-pens-v2-spec.md` (this document) |

### 1.4 New assets

| Asset | Kenney pack | Use |
|---|---|---|
| `animal-chick` | Cube Pets | Hens, rooster, chicks |
| `animal-fox` | Cube Pets | Fox |
| `egg` | Food Kit | Eggs in the nest boxes |
| `bag` | Food Kit | Grain sacks |
| `crops-wheatStageA` | Nature Kit | Wheat near the chicken run |
| `sign` | Nature Kit | Baked for later use |

The coop, nest boxes, ramp, fox cheeks and grain are simple shapes made in code. No Kenney model is available for these items.

---

## 2. Terms

| Term | Type | Definition |
|---|---|---|
| Run | TN | The fenced chicken area north of the pens. |
| Coop | TN | The chicken house in the run. The chickens sleep in it. |
| Pop door | TN | The coop door. It moves up to open and down to close. |
| Nest box | TN | One of four boxes where hens lay eggs. |
| Dust bath | TN | A sand area in the run. Hens clean their feathers there. |
| Pecking order | TN | The rank of each adult chicken. Rank 0 is the highest. |
| Grain | TN | Small food particles. The user scatters them in the run. |
| Handful | TN | One group of 30 grains from one tap. |
| Brood | TV | Sit on an egg until it hatches. |
| Gulp | TV | Swallow a chicken whole. Only the fox does this. |
| Spit | TV | Push a swallowed chicken out of the mouth. |
| Hiccup | TN | A spit that occurs when the fox holds a chicken for too long. |
| Card | TN | The information panel that the Hand tool shows. |
| Chase camera | TN | The camera mode that follows the tractor. |
| Vehicle controller | TN | The Rapier ray-cast vehicle model for the tractor. |

---

## 3. Architecture changes

### 3.1 Files

| File | Status | Function |
|---|---|---|
| `src/chickens.js` | New | Chicken flock, grain, eggs, chicks, coop bedtime, fox |
| `src/tractor.js` | New | Tractor body, wheels and drive input |
| `src/farm3d.js` | New | Render code for gates, coop, nest boxes, eggs, grain, chickens, fox, feathers, tractor and the sky |
| `src/gfx.js` | New | Shared geometry and animation helpers (moved from `main.js`) |
| `src/layout.js` | Changed | Chicken run, coop, nest boxes, dust bath, gate objects, tractor start position |
| `src/flow.js` | Changed | Partial grid refresh after a gate change; inactive obstacles |
| `src/sim.js` | Changed | Day/night switch, gates, threats, tractor, flock, pig names, pig sleep |
| `src/main.js` | Changed | Hand tool, cards, drive mode, eyelids, "z" letters, day/night switch |
| `src/sound.js` | Changed | New sounds |
| `bake.mjs` | Changed | Bakes the new models; supports wing and tail parts |

### 3.2 Collision groups

| Group | Value | Collides with |
|---|---|---|
| Ground | 1 | All |
| Static | 2 | All except the dog and the fox |
| Pig | 4 | All |
| Food | 8 | All |
| Dog | 16 | Ground, pigs, food, chickens, tractor, fox |
| Chicken | 32 | All except the fox |
| Fox | 64 | Ground, pigs, dog, tractor |
| Tractor | 128 | Ground, static, pigs, chickens, food, dog, fox |

The fox does not touch chickens physically. The fox code catches a chicken when the distance is small (Section 6.3).

### 3.3 Threats

At the start of each step, the simulation makes a list of threats. Pigs and chickens use this list to calculate panic.

| Threat | Radius |
|---|---|
| Dog | 6.5 m when active, 2.6 m when idle (chickens: maximum 5 m) |
| Tractor | 3.5 m + 0.6 × speed, when the speed is more than 0.8 m/s |
| Horn | 14 m, for 1.6 s |
| Fox | 6 m (chickens only; the rooster does not run from the fox) |

### 3.4 Step sequence

v2 adds two operations to the v1 step sequence:

1. Before the Rapier step, the tractor updates its vehicle controller.
2. Before the Rapier step, the flock and the fox update.

---

## 4. Day/night switch

### 4.1 Function

A switch at the top of the screen sets day or night. The switch shows a sun and a moon. The current mode has a colored background.

The simulation keeps a fixed hour: 11:00 for day and 22:00 for night. The hour does not change between switch actions.

### 4.2 Effects

| Item | Day | Night |
|---|---|---|
| Chickens | Come out of the coop if the pop door is open | Go to the coop |
| Pigs | v1 behavior | Approximately 85 % of idle pigs sleep for 20 to 45 s |
| Pig hunger rate | × 1 | × 0.35 |
| Pig curiosity trips | On | Off |
| Fox | Leaves; spits out a chicken if it has one | Arrives 7 to 13 s after the switch |
| Eggs | Each hen lays one egg | None |
| Coop window | Dark | Warm glow and a point light |
| Tractor headlights | Off | On when a person drives |

When the switch changes to day, the rooster crows. Each hen gets a new egg time from 20 to 120 s after the change.

### 4.3 Sky

The renderer moves the sky between the two modes at a rate of 1.6 per second. Thus the change is smooth and takes approximately 2 s. The sky, fog, sun color, sun height, hemisphere light and coop light change together. At night, a blue moon light replaces the sun.

---

## 5. Chickens

### 5.1 Flock

| Item | Hen | Rooster | Chick |
|---|---|---|---|
| Start number | 10 | 1 | 0 |
| Collider radius | 0.17 m | 0.20 m | 0.09 m |
| Mass | 2.2 kg | 3.4 kg | 0.15 kg |
| Model scale | 0.30 | 0.36 | 0.14 |
| Color | White (four light shades) | Copper | Yellow (Kenney color) |
| Walk speed | 0.5 m/s | 0.5 m/s | 0.5 m/s |
| Run speed | 2.8 m/s | 2.8 m/s | 2.2 m/s |

The maximum number of birds is 24.

### 5.2 Colors

The Kenney chick model is yellow. For adults, the renderer makes a second copy of the geometry with white feathers. The rule changes yellow and orange body and wing colors to white. The beak, feet and eyes keep their colors. Each adult then gets an instance color: white tones for hens and copper (1.0, 0.52, 0.32) for the rooster. Chicks use the original yellow geometry.

### 5.3 Pecking order

The rooster has rank 0. The hens get ranks 1 to 10 in a random sequence.

A lower bird gives way to a higher bird. The separation radius increases by 0.35 m when the neighbor has a higher rank. A higher bird can take a grain from a lower bird. A lower bird cannot take a grain from a higher bird. If a higher bird pushes a lower bird for 0.6 s, the lower bird leaves that grain.

### 5.4 States

| State | Behavior |
|---|---|
| PECK | Stand and peck at the ground (1 to 3.5 s) |
| ROAM | Walk with small random turns (1 to 4 s) |
| GRAIN | Go to one grain and eat it (0.35 s for each grain) |
| NEST | Go to a nest box |
| LAY | Sit in the nest box for 6 s, then lay an egg |
| BROOD | Sit on an egg for 25 s, then a chick hatches |
| DUST | Take a dust bath for 6 to 10 s |
| FLEE | Run from a threat with a zig-zag path |
| AIR | Flap through the air; the wings make the fall slower |
| ROOST | Go to the bottom of the coop ramp |
| ENTER | Walk up the ramp (0.7 s) |
| INSIDE | Sleep in the coop (not visible) |
| EXIT | Walk down the ramp (0.7 s) |
| CARRIED | In the mouth of the fox (not visible) |
| GRAB | Held by the user |
| DEFEND | The rooster runs at the fox (3 m/s) |

### 5.5 Flapping over fences

A hen or rooster in FLEE flaps over a fence when these conditions are true:

- Panic is more than 0.45.
- A feeler ray finds an obstacle.
- The bird is on the ground.
- The last flap was more than 2.5 s ago.

The flap sets a velocity of 4.6 m/s up and 2.6 m/s forward. While the bird falls, an upward force of 0.55 × its weight makes the fall slower. The jump clears the 0.84 m fences. Chicks do not flap.

### 5.6 Eggs and chicks

- Each hen lays a maximum of one egg each day.
- Each nest box holds a maximum of three eggs.
- The user collects an egg with a tap of the Hand tool. The egg counter at the top of the screen increases.
- If nobody collects an egg for 80 s, a hen broods it. The hen that laid the egg goes first.
- After the hen sits on the egg for 25 s, the egg hatches. The chick follows the hen.
- The chicks of one hen walk in a line. The first chick follows the hen at 0.45 m. Each other chick follows the chick in front of it at 0.3 m.

### 5.7 Grain

| Item | Value |
|---|---|
| Grains in one handful | 30 |
| Maximum handfuls on the ground | 3 |
| Target area | Disc, radius 1.3 m |
| Flight time | 0.55 to 0.70 s |
| Time limit on the ground | 240 s |

A tap with the Feed tool inside the run scatters grain. A tap outside the run tosses a snack, as in v1. Pigs eat any grain in a radius of 0.6 m.

### 5.8 Bedtime

At night, each chicken goes to the bottom of the coop ramp with its own flow field. If the pop door is open, the chicken walks up the ramp and goes inside. If the pop door is closed, the chicken waits at the door and clucks.

In the day, if the pop door is open, the chickens come out one at a time, highest rank first.

### 5.9 Flow fields for chickens

Chickens use a second flow-field grid. The grid has 0.4 m cells and an obstacle margin of 0.24 m, because chickens are small. The grid has fields for the coop ramp, each nest box, the dust bath, the run and each handful of grain.

---

## 6. Fox

### 6.1 Design goal

The fox must be funny and not sad. The fox never removes a chicken from the farm. Each swallowed chicken comes back out.

### 6.2 Visits

The fox comes only at night. It enters from the north-west part of the field boundary. The fox ignores fences, as the dog does. The renderer shows a jump when the fox is near a fence. The fox goes around the coop and does not go through it.

### 6.3 Behavior

| Phase | Speed | Behavior |
|---|---|---|
| Prowl | 1.7 m/s | Go to the nearest chicken that is outside the coop |
| Chase | 4.7 m/s | Used when the target is nearer than 5 m |
| Gulp | — | When the distance is less than the bird radius + 0.42 m, the fox swallows the bird |
| Strut | 0.9 m/s | Walk slowly with a full mouth; stay at least 4 m from the boundary |
| Flee | 6.2 m/s | Run to the nearest exit point, then go away |

If all chickens are inside the coop and the pop door is open, the fox goes to the door. Then it swallows one chicken from inside. If the pop door is closed, the fox walks near the door. After 45 s, it goes away.

### 6.4 Spit

The fox spits out the chicken in these conditions:

- The user taps the fox with the Hand tool or the Grab tool.
- The fox becomes afraid (fear more than 0.6). Fear comes from the dog, the rooster (nearer than 1.1 m), a tractor in motion, the horn and the hose (nearer than 1.9 m).
- The user changes the mode to day.
- The fox holds the chicken for 22 to 30 s (hiccup).

At a spit, the chicken leaves the mouth with a velocity of 2.6 m/s forward and 3.6 m/s up. It is in AIR, then in FLEE. A burst of 16 feathers comes out. Then the fox runs away.

### 6.5 Appearance with a full mouth

Two pale cheek spheres (radius 0.3 model units) grow on the sides of the snout. A yellow feather tuft comes out of the mouth. The cheeks pulse. Feathers come out of the mouth at approximately 4 each second.

### 6.6 Result of a night

| Test | Fox visits | Gulps |
|---|---|---|
| 150 s night, pop door open | 2 | 2 |
| 150 s night, pop door closed when all birds are inside | 2 | 0 |

---

## 7. Feathers

Frightened chickens drop feathers. Feathers fall slowly, turn and move from side to side. Then they lie flat on the ground.

| Event | Feathers |
|---|---|
| Chicken goes into FLEE | 2 to 4 |
| Chicken flaps over a fence | 4 |
| User grabs a chicken | 5, then approximately 2.5 each second while held |
| Fox gulps a chicken | 12 |
| Fox spits out a chicken | 16 |
| Fox with a full mouth | Approximately 4 each second |

| Item | Value |
|---|---|
| Maximum feathers | 360 (the oldest feather is used again) |
| Maximum fall speed | 0.45 m/s |
| Time on the ground | 35 to 60 s, then a 2 s shrink |
| Color | The color of the bird that dropped it |

---

## 8. Gates

### 8.1 Layout

The farm has 15 gates. Adjacent gate tiles join into one gate. The two lane-end gates are double gates (4.8 m), so the tractor can go through them. The other gates are 2.4 m wide. The chicken run has one gate on its south side.

### 8.2 Open and close

The user opens or closes a gate with a tap of the Hand tool. The tap must be less than 1.5 m from the gate line.

When a gate closes:

1. The simulation adds a box collider across the gate gap.
2. The pig grid and the chicken grid update the cells near the gate.
3. The simulation calculates all flow fields again.

One gate change takes approximately 0.1 s on a desktop computer.

### 8.3 Leaf movement

Each gate tile has one leaf. A single gate has one leaf. A double gate has two leaves that meet in the center.

All leaves open to the same side of the fence. An open leaf stops at 0.2 rad from the adjacent fence and 0.07 m to the side. Thus the leaf never goes through a fence. The leaf moves at 1.8 per second with a smooth curve.

---

## 9. Tractor

### 9.1 Body and wheels

| Item | Value |
|---|---|
| Model scale | 1.6 (width approximately 2.1 m, length approximately 3.5 m) |
| Mass | 1400 kg |
| Center of mass | 0.55 m above the chassis origin |
| Colliders | Two boxes (body and cabin) |
| Wheels | 4; front radius 0.52 m, rear radius 0.84 m |
| Suspension rest length | 0.22 m; static compression approximately 0.12 m |
| Suspension stiffness | 24 |
| Damping | Compression 2.6, relaxation 3.2 |
| Friction slip | 6 |

The wheel rays find only the ground and static obstacles. The tractor body is red. The renderer changes the grey-blue Kenney body colors to red and keeps the trim colors.

### 9.2 Drive

| Item | Value |
|---|---|
| Maximum drive force | 5200 N (rear wheels) |
| Maximum speed | 6.5 m/s forward, 3.0 m/s in reverse |
| Brake | 28 (with an opposite input) |
| Parking brake | 60 (when nobody drives) |
| Maximum steering angle | 0.6 rad ÷ (1 + 0.09 × speed) |
| Input ease | Throttle 4 per second; steering 2.4 rad/s |

The drive force decreases linearly to zero at the maximum speed. If the tractor turns over and stops, the simulation puts it upright again.

### 9.3 Controls

To drive, press and hold the tractor with the Hand tool for 0.75 s. A ring fills around the finger. A timer starts the drive, so a slow frame rate cannot stop it.

| Control | Touch | Keyboard |
|---|---|---|
| Throttle and steering | Thumb stick (bottom left) | W/S/A/D or arrow keys |
| Horn | Horn button | H |
| Stop the drive | Get out button | E or Escape |

The steering input has a curve (power 1.4) for fine control near the center. While the user drives, the toolbar and the card are not visible.

### 9.4 Chase camera

The camera stays behind the tractor and turns with it. A one-finger drag turns the camera around the tractor. The camera then moves back slowly. A pinch changes the distance from 9 m to 22 m.

---

## 10. Hand tool and cards

### 10.1 Toolbar

The toolbar has five tools: Hand, Shoo, Feed, Hose and Grab. Hand is the default tool.

### 10.2 Tap targets

A tap with the Hand tool selects the first match in this sequence:

1. An egg (less than 0.45 m from the touch ray).
2. The nearest animal: pig, chicken, fox or dog.
3. A gate.
4. The pop door.
5. The tractor.

| Target | Result of a tap |
|---|---|
| Egg | Collect the egg |
| Pig, chicken or dog | Show its card |
| Fox with a full mouth | The fox spits out the chicken |
| Fox with an empty mouth | Show its card |
| Gate | Open or close the gate |
| Pop door | Open or close the pop door |
| Tractor | Show its card; press and hold to drive |
| Empty ground | Close the card |

A drag with the Hand tool turns the camera.

### 10.3 Cards

A card shows a name, a type line, the current activity and some bars. A yellow ring on the ground shows the selected animal. The card updates 10 times each second.

| Animal | Type line | Bars and facts |
|---|---|---|
| Pig | "Pig", or "Piglet" and the mother's name | Hunger, mud |
| Hen | Rank in the pecking order | Eggs today, eggs in total, fright |
| Rooster | Top of the pecking order | Fright |
| Chick | Mother's name | Fright |
| Fox | "Up to no good" | Nerve |
| Dog | Sheepdog | — |
| Tractor | Press and hold to drive | Speed |

Each pig has a name from a list of 60 names. Each chicken has a name from a list of hen names or chick names. The rooster is "Sir Reginald".

---

## 11. Sleeping pigs

### 11.1 Closed eyes

The Kenney pig eyes are flat white and grey areas on the front of the head. At start, the renderer marks these vertices with an eye attribute (flag, u, v). The u value is the horizontal position in the eye. The v value is the vertical position in the eye.

Each pig instance has a sleep value. The value is 1 when the pig is in REST for more than a short time. This includes sleep at night and rest in the mud wallow.

When the sleep value is 1, the shader changes the eye color to pink (the eyelid). It also draws a dark curved line across the eye: v = 0.38 + 0.9 × (u − 0.5)².

### 11.2 "z" letters

At night, a white "z" floats up from each sleeping pig every 2.2 to 3.6 s. The letter rises 1.1 m in 2.6 s, moves from side to side, grows and fades. The renderer uses a pool of 36 sprites.

---

## 12. Other changes

| Item | Change |
|---|---|
| Minimap | Removed |
| Look tool | Removed; the Hand tool turns the camera |
| Clock | Removed; the day/night switch replaces it |
| Minimum camera distance | 2.5 m (v1: 6 m) |
| Start view on a phone | Shows the pens and the chicken run |
| Shoo tool | Chickens also run from the dog |
| Hose | Also frightens the fox |
| Grab tool | Can also lift chickens; a tap on a fox with a full mouth makes it spit |
| Frustum test | Off for all instanced meshes that move (Section 14, defect 7) |
| New sounds | Cluck, peep, crow, squawk, flap, fox yip, gate, egg, horn, tractor engine, grain |

---

## 13. Test results

### 13.1 Headless tests

| Check | Result |
|---|---|
| Eggs in 140 s of day (10 hens) | 10 |
| Time until all 11 birds are in the coop after the switch to night | 11.7 s |
| Fox gulp, then hiccup | Gulp at 21.9 s, spit at 47.1 s |
| Fox gulp, then a tap | Spit 2.1 s after the gulp |
| Switch to day while the fox has a chicken | Spit; no chicken lost |
| Grain: one handful | 30 of 30 grains eaten in 40 s; maximum 8 of 11 birds ate at the same time |
| Pecking order (6 handfuls) | Top 5 hens ate 80 grains; bottom 5 hens ate 46 grains |
| All 15 gates closed for 120 s | 0 pigs changed area |
| Time to close 15 gates | 1.55 s in total |
| Tractor acceleration | 0 to 5.4 m/s in 4 s |
| Tractor stop from 5.4 m/s | 1.3 s |
| Tractor turn at full steering | 1.89 rad in 2 s |
| Tractor through a double gate | Pass; maximum tilt 0.5° |
| Tractor at a closed gate | Stopped before the gate line |
| Chicken positions during chase, night and grab tests | No invalid (NaN) values |
| Pigs in a fence collider (300 s) | 0 |
| Pig respawns | 0 |
| Simulation time for one step | 0.6 to 0.8 ms |

### 13.2 Browser tests

The tests use Playwright with Chromium and SwiftShader at a phone size of 390 × 844 px.

| Check | Result |
|---|---|
| Toolbar width | Fits in 390 px |
| Tap a pig | Card shows its name and activity |
| Tap a hen | Card shows her rank |
| Tap a gate | Gate closes |
| Tap the pop door | Door closes |
| Tap an egg | Egg counter increases |
| Press and hold the tractor | Drive mode starts; toolbar not visible |
| Thumb stick forward | Tractor moves |
| Get out | Drive mode stops; toolbar visible |
| Feed tap in the run | One handful of grain |
| Grab a chicken | Chicken lifted |
| Day/night switch | Mode and label change |
| Tap the fox with a full mouth | Fox spits out the chicken |
| Chicken far from the run, camera turned away from the run | Chicken visible |

---

## 14. Defects found and corrections

| No. | Defect | Cause | Correction |
|---|---|---|---|
| 1 | In the first fox design, the fox stayed at the coop with a chicken. | The nearest exit point was in the coop area. | Exit points near the coop were removed. Later, the gulp and spit design replaced this behavior. |
| 2 | The rooster crowed more than 150 times in one night. | DEFEND and ROOST changed every step, and each change made a crow. | A crow interval of 8 s. After DEFEND, the rooster goes to ROOST. |
| 3 | The tractor body was 0.1 m too low. | The wheel connection used the rest length, not the static compression. | The connection point is now 0.12 m above the wheel center. |
| 4 | Some top-bar buttons had no panel. | A reset rule with an ID selector removed the panel style. | A panel rule with a stronger selector. |
| 5 | Gate leaves went through the adjacent fence. | The open angle was on the opposite side of the fence. | All leaves open to one side and stop at 0.2 rad. |
| 6 | The coop ramp went up away from the door. | The slope angle used the wrong sign. | The ramp angle now uses the distance from the door to the ramp end. |
| 7 | A chicken became invisible but its shadow stayed. | three.js calculated the bounds of each instanced mesh one time only. The main camera then removed chickens that were outside those old bounds. The shadow camera did not remove them. | The frustum test is off for all instanced meshes that move. |
| 8 | Press and hold did not start the drive at a low frame rate. | The frame loop did the time check. | A timer does the time check. |
| 9 | The fox could have an invalid position when its state changed directly. | The wander angle had no start value. | The wander angle starts at 0. |

### 14.1 Design changes on request

| Item | v1 or early v2 | v2 |
|---|---|---|
| Fox | Took a chicken off the farm until the next day | Swallows a chicken, then spits it out |
| Time | 5-minute day clock | Day/night switch |
| Minimap | Present | Removed |
| Hens | Yellow | White |

---

## 15. Known limits

- A gate change causes a pause of approximately 0.1 s.
- The tractor is too wide for the 2.4 m gates. It can use only the field, the lane and the double gates.
- The dog and the fox do not collide with fences. They jump over them in the render only.
- One fox at a time. The fox comes again approximately 35 s after it goes away, if it is still night.
- The maximum number of birds is 24. After that, eggs do not hatch.
- The "z" letters show only at night. Pigs in the mud wallow in the day close their eyes but show no letters.
- The day/night mode does not change by itself.
- We did not measure the frame rate on a real phone.

---

## 16. four43.com build

The game is published at https://four43.com/exp/piggie-game/ with the name "Piggie Game". The four43.com build adds these items to v1 before v2 was merged. The v2 merge keeps all of them.

### 16.1 Build

| Item | Value |
|---|---|
| Build command | `python build.py` in `games/pig-pens/` |
| Output | `site/exp/piggie-game/index.html`, plus the files in `pwa/` |
| Version | `package.json` version (2.0.0 for this release) |
| Service worker cache name | `pig-pens-<version>-<hash of the page and the manifest>` |

The page is an installable PWA. The service worker gets the page from the network first, so a new build shows at the next start. The cache is used only when there is no connection.

### 16.2 Additions

| Item | Behavior |
|---|---|
| Touch aim | With a finger, the Grab tool lifts the held animal to 80 px above the finger in 0.18 s. The Hose tool aims 55 px above the finger. A mouse aims at the pointer. Grab applies to pigs and chickens. |
| Sparkle sound | A pig that the hose makes clean plays a rising chime (`clean` event). |
| iOS height | An installed iOS app can report a viewport that is one status bar too short. The page sets `--app-h` to the full screen height. Elements that attach to the bottom of the screen (`#tools`, `#hint`, `#card`, `#stick`, `#driveBtns`, `#loading`) use `position:absolute` in the body, not `position:fixed`. |
| Page zoom | Pinch and double-tap page zoom are blocked. The game camera zoom is not changed. |
| Share preview | Open Graph and Twitter card tags. The image is `pwa/og-image.jpg` (1200 × 630 px). |
| Troughs | Carrots lie along the trough and do not go through the end boards. |
| Hose pipe | The pipe on the ground is 0.16 m high, so the grass does not cover it. The pipe continues to the edge of the field. |
| Canvas size | The renderer uses the canvas size, not the window size. |
| Egg count | When the user collects an egg, the new basket total floats up from 1.15 m to 1.75 m above the egg in 1.4 s, then fades. It is an HTML overlay above the nest-box roof, thus the nest box does not cover it. A new number near an old number makes the old number fade immediately. The egg counter in the top bar has the same height as the round buttons and grows for a short time at each change. |
| Coop attic | One solid attic fills the space from the top of the walls to the bottom of the roof. Its gable edges use the same pitch (0.55 rad) as the roof. It replaces the two rectangular gable boards, which went through the roof. |
| Top bar | The top bar has the egg counter, the day/night switch and the dinner bell. All three are 50 px high. The mute button is removed. |

### 16.3 Test notes

- The browser tests (`interact*.mjs`, `shot.mjs`) use fixed paths from the original build machine (`/opt/pw-browsers`, `/mnt/user-data/outputs/pig-pens.html`). Change these paths before you run them.
- `test/gates_fox.mjs` uses the v1 clock (`hour: 17.5`). The day/night switch replaced the clock, thus the fox part of this test does not start a visit. Use `test/night.mjs` for the fox.
- The grain test gives 92 grains for the top 5 hens and 43 grains for the bottom 5 hens. Section 13.1 gives 80 and 46. The unchanged v2 source gives the same 92 and 43, thus the difference is not from the merge.
