# Pig Pens v3: Buildings, Stalls and the Vet — Design Specification

Version: 1.0 (design)
Date: 26 October 2026
Baseline: Pig Pens 2.5.1 (`pig-pens-v2-spec.md`, amended for 2.5.0)
Language standard: ASD-STE100 Simplified Technical English (STE). Section 2 gives the new technical names (TN) and technical verbs (TV).

Amended 26 October 2026 (R1 built, Pig Pens 2.6.0):
- The sim reads building positions from `src/defs/buildings.js`. The model scripts import the same file, and `test/models.test.mjs` checks the node names. There is no baked sidecar and there are no socket empties (§3.5, §4.1).
- The vet's name is Dr. Emmy. A Cube Pets cat sleeps on a cushion in her studio. She walks round the north end of the reception desk.
- The coop's door volume is its front wall up to the eave. Its roof volume starts above the eave and stops at the front wall (§5.1).
- A pinch-out does not leave a building (§5.4). Back, Escape and a ground tap outside do.
- The view merges each moving part (roof, each wall face, each door) and the rest of each building into one mesh. The clinic furniture is one mesh.
- The doors drop with the front wall when it is cut.
- The barn is the centre of the north row (playtest 1). The chicken run moves 5 tiles (12 m) west, and the coop, the barn and the clinic move with it (§3.1).
- A clipping plane cuts the walls that face the camera down to stubs. The walls are not scaled. A cut wall casts no shadow (§5.2).
- Inside the coop, only the pop door itself toggles the door. A tap on the grass round it goes back out (§5.5).
- The waiting room has two low animal benches in the clinic model. It has no Furniture Kit chairs.
- Measured changes from the layout move: the chickens go to bed in 10.1 s (it was 11.7 s), the night fox gulps at 20.0 s (it was 22 s), and 45 pigs are penned at 120 s (it was 37). The goldens and the feel baseline are blessed again.

---

## 1. Introduction

### 1.1 Purpose

This document is the design for three releases. The releases add buildings that the user can go into, a named sleep place for each animal, and a vet clinic where the user makes sick animals better. Use it together with the v1 and v2 specifications. If this document and an earlier specification do not agree, this document is correct.

### 1.2 Releases

Each release is a full spec → plan → build → playtest → deploy cycle. Do not start a release before the user has played the previous release.

| Release | Version | Contents |
|---|---|---|
| R1 | 2.6.0 | Coop moves and gets a new model. Barn and vet clinic (outside and inside). Tap a roof to go in. Cutaway. Barn doors. The vet walks about. No patients. |
| R2 | 2.7.0 | Herd of 22 pigs. Stalls and perches with name plaques. Bedtime in the barn. Day naps. |
| R3 | 2.8.0 | Sickness. Emotes and green heads. Drop-off, queue, waiting room, exam room, pegboard tools, cure and discharge. |

### 1.3 Goals

- The farm feels alive inside the buildings. The user sees the animals walk in and settle.
- Each animal has a place that belongs to it, with its name on it.
- A sick animal is easy to see from far away. A visit to the vet is a small, kind game with no fail state.
- All new behaviour goes through sim commands, so headless tests and `?tune` can drive it.

### 1.4 Non-goals

- No animal dies or gets worse over time.
- No save between page loads.
- No new scenes. The farm stays one live world.

---

## 2. Terms

| Term | Type | Definition |
|---|---|---|
| Barn | TN | The red building east of the chicken run. The pigs sleep in it. |
| Clinic | TN | The vet building east of the barn. It has a waiting room, an exam room and a studio. |
| Studio | TN | The vet's small home at the back right of the clinic. |
| Vet | TN | The clinic's doctor. Model: Mini Characters `character-female-f`. |
| Stall | TN | One of 16 sleep places in the barn. Each adult pig has one. |
| Perch | TN | One sleep place on the roost bar in the coop. Each adult chicken has one. |
| Plaque | TN | A small wood board on a stall or perch. It shows the owner's name and the names of the owner's young. |
| Focus | TN | The building (or room) that the camera looks into. `null` is the farm view. |
| Cutaway | TN | The view of a focused building: the roof lifts away and the near walls become short. |
| Wall stub | TN | A near wall at its short height (approximately 0.5 m). |
| Ailment | TN | One of four illnesses: cold, tummy ache, splinter, ear ache. |
| Emote | TN | A 2D picture from the Kenney Emote Pack above an animal's head. |
| Queue | TN | The ordered list of animals that wait for the vet. |
| Pegboard | TN | The wall board in the exam room that holds the tools. |
| Check-up tool | TN | A tool that shows a clue: stethoscope, otoscope, thermometer, magnifier. |
| Treatment | TN | A tool that cures an ailment: shot, ear drops, medicine spoon, tweezers, bandage. |
| Clue | TN | The animation and speech bubble that a check-up tool shows. |
| Check in | TV | Add an animal to the queue. |
| Discharge | TV | Send a cured animal out of the clinic. |
| Sicken | TV | Give an animal an ailment. |

---

## 3. Layout (R1)

### 3.1 North row

The buildings stand in one row against the north boundary (z = −26.4). From west to east:

| Item | Position (x) | Size | Note |
|---|---|---|---|
| Chicken run | −25.2 … −8.4 | 5 tiles west of 2.5.1 | The nest boxes are at its west end. |
| Coop | east end of the run, against the run's east fence (x −10.1) | 3.0 × 2.3 m (no change) | The ramp and pop door move with it. |
| Barn | −8.2 … 7.4 | 15.6 × 8 m, ridge 6.2 m | Front (doors) faces south, over the middle of the pens. |
| Clinic | 7.4 … 16.4 | 9 × 8 m, one storey | Front door faces south. |

Values are approximate. The plan sets the final values. The plan must keep all three fronts reachable from the open field.

### 3.2 Moved items

- Move the hay stack (`hayB`, now at x = 10.8, z = −21.6) out of the barn footprint.
- Move the fat tree (`treeFat`, now at x = 24.0, z = −20.4) out of the clinic footprint.
- The dog house does not move.
- Recalculate the dust bath and grain sack positions if the coop move puts them in the coop footprint.

### 3.3 Barn inside

- An aisle runs east to west, behind the double doors.
- Back row: 8 stalls against the north wall.
- Front row: 4 stalls, then the doors, then 4 stalls.
- Stall size: approximately 1.5 m wide and 2.5 m deep (adult pig radius is 0.4 m). Each stall has straw, a low divider and a plaque on the post toward the aisle.

### 3.4 Clinic inside

| Area | Position | Contents |
|---|---|---|
| Reception and waiting room | front half | desk, 6 waiting places (benches for pigs, straw mats for chickens), plant |
| Exam room | back left | exam table, pegboard on the wall, sink |
| Studio | back right, behind a half wall | bed, kitchenette, rug, cat bed |

### 3.5 Physics

- Each building's walls are static box colliders in the `static` group. The flow field rasterises them.
- Each door (barn leaves, clinic door) has an inactive or active barrier, like a gate (v2 §8).
- Stall dividers are low static boxes. Pigs pass the aisle, not over the dividers.
- The sim reads stall, perch, bench, table and door positions from a baked sidecar that comes from the GLB sockets. The sim does not import three.js.

---

## 4. Models and assets (R1, R3)

### 4.1 Buildings (glb-author)

Make the barn, the clinic and the new coop with the `glb-author` skill, in a chunky Kenney style.

| Model | Look |
|---|---|
| `barn` | Red walls, white trim, gambrel roof, two large swing doors, hay loft window |
| `clinic` | White and teal walls, flat or low roof, paw-print sign over the door, windows |
| `coop` | Replaces the code-made coop. Same footprint. Pop door, ramp, nest boxes, roost bar inside |

Each building GLB must have these nodes. Tests check them (§12).

| Node | Function |
|---|---|
| `roof` | Lifts and fades in the cutaway |
| `wall_front_*`, `wall_back_*`, `wall_side_*` | Walls. The cutaway sets each wall to full height or to a wall stub |
| `door_*` | Door leaves. The origin is at the hinge |
| `stall_00` … `stall_15` (barn) | Sleep point and facing of each stall |
| `plaque_00` … `plaque_15` (barn), `plaque_perch_*` (coop) | Plaque position and facing |
| `perch_*` (coop) | Perch points on the roost bar |
| `aisle_*`, `door_in`, `door_out` | Walk-in path points |
| `bench_0` … `bench_5`, `exam_table`, `pegboard`, `vet_bed`, `vet_*` (clinic) | Clinic places and vet routine points |

### 4.2 Kenney assets

| Asset | Pack | Use |
|---|---|---|
| `character-female-f` | Mini Characters | The vet. If the model has no clips, use a procedural walk and idle bob like the pets. |
| Desk, benches, bed, kitchen units, plant, shelves, rug | Furniture Kit | Clinic and studio |
| Emotes | Emote Pack (2D) | Sick and happy markers |

Look in the Kenney packs for tools before you make them. Make the tools that are not available with `glb-author`: stethoscope, otoscope, thermometer, magnifier, syringe, ear-drops bottle, medicine spoon, tweezers, bandage roll, lollipop. Make the pegboard and the plaque board with `glb-author`.

### 4.3 Plaques

The plaque text is a canvas texture that the view draws at run time from the sim names. The owner's name is large. The names of the owner's piglets or chicks are small, below it.

### 4.4 Bake

Add all new models to `game.config.js` the same way as `dogHouse`. Vendor the Kenney sources into `assets/models/` and record them in `SOURCES.json`.

---

## 5. Focus and cutaway (R1)

### 5.1 Enter

- With the Hand tool, a tap on a building's roof enters the building. Each roof has a large 3D tap volume (like `gate.pick` and `coop.pick`).
- An animal in front of the roof wins the tap (same rule as 2.5.1).
- The tap sends the farm command `enter(building)`. The farm scene state keeps `focus: null | 'coop' | 'barn' | 'clinic' | 'clinic.exam'`.
- The view only animates the focus. The view never writes the focus.

### 5.2 Cutaway (view)

| Item | Action | Time |
|---|---|---|
| Roof | Moves up approximately 2 m and fades to invisible | approximately 0.5 s |
| Near walls | Scale down to a wall stub | approximately 0.5 s |
| Far walls | Stay at full height | — |
| Other buildings and the farm | No change. The sim continues | — |
| Night | A warm lamp light shows the inside | — |

A wall is near when its outward normal points toward the camera. Calculate this again when the camera orbits, so the stubs change as the user turns the camera.

### 5.3 Camera

- On enter, the camera eases to the building's framing: above and in front, approximately 50° down.
- Orbit and zoom stay available. Clamp them to the building: no view below the floor, no pan off the building.
- `clinic.exam` is a closer framing of the exam table and the pegboard (R3).

### 5.4 Leave

- The `back` action (button or Escape) goes up one level: `clinic.exam` → `clinic` → `null`.
- A tap on the ground outside the focused building leaves it.
- A pinch-out past the zoom limit leaves it. (Not in 2.6.0.)
- On leave, the roof comes back and the walls grow to full height.

### 5.5 Tools in focus

| Tool | In barn or coop | In clinic |
|---|---|---|
| Hand | Cards, doors, plaques | Cards, exam room, vet card |
| Grab | Yes | Yes (R3) |
| Feed, Hose, Shoo | Off. A hint tells why | Off. A hint tells why |

A tap on a plaque shows the owner's card.

---

## 6. Barn doors (R1)

- The two leaves are one gate object in `lay.gates` (v2 §8) with its own tap volumes.
- A tap toggles open and shut. The barrier collider and the partial flow-field refresh work as for gates.
- The barn is region 8 in `counts`. The farm's `gameState.pens` list grows to 9.
- Hints: "Barn doors open." and "Barn doors shut. The pigs stay put."

---

## 7. Stalls and bedtime (R2)

### 7.1 Herd

- Default herd: 22 pigs (`opts.pigs` = 22). With the 0.72 adult ratio this gives 16 adults and 6 piglets.
- Each adult has `stall` 0–15. The sim sets it at spawn from the seed. The result is deterministic.
- Each piglet uses its mother's stall.
- The rooster and each hen have `perch`. Each chick uses its mother's perch. A hatched chick gets its mother's perch.

### 7.2 Night: pigs

1. At nightfall, each pig tests if its cell can reach the barn door on the `barn` flow-field destination.
2. If yes, the pig walks to the door. Then it follows the scripted path: `door_in` → nearest `aisle_*` → front of its stall → `stall_NN`. It turns to the stall's facing, lies down and goes to REST with "z" letters.
3. If no (for example, its pen gate is shut), the pig sleeps where it is (v2 behaviour).
4. If the barn doors are shut when the pig arrives, the pig sleeps outside the doors. When the user opens the doors, the waiting pigs go in.
5. At nightfall, if some pigs cannot reach the barn, a hint tells the number and the reason, for example "3 pigs are shut in their pens."

### 7.3 Morning: pigs

- Doors open: the pigs wake at staggered times and go back to their home pen. If the home pen gate is shut, they stay in the field.
- Doors shut: the pigs stay in. Hint: "Open the barn doors to let the pigs out."

### 7.4 Day naps

- With the doors open, an idle and calm pig sometimes goes to its stall and rests. Then it walks out.
- Tunable: chance, maximum 3 nappers at a time, nap time 30–60 s.

### 7.5 Grab

A pig that the user drops in the barn walks to its own stall. At night it sleeps there. In the day it naps, then goes out.

### 7.6 Chickens

- Bedtime rules (v2 §5.8) do not change.
- In the coop, each adult bird goes to its perch. The chicks stay next to their mother's perch.

### 7.7 Tuning

Put all R2 values (nap chance, nap count, nap time, wake stagger) in one table in the sim. Expose them through `?tune`.

---

## 8. Sickness (R3)

### 8.1 Ailments

| Ailment | Cause: pigs | Cause: chickens | Symptom | Check-up tool → clue | Treatment |
|---|---|---|---|---|---|
| Cold | Wet (hose or mud) at nightfall and asleep outside the barn | Asleep outside the coop | Sneeze with a small puff; sniffly emote | Stethoscope → wheezy chest; thermometer → hot | Shot |
| Tummy ache | Too many snacks in a short time | Too much grain in a short time | Groans; does not eat; sad emote | Stethoscope on tummy → gurgle | Medicine spoon |
| Splinter | Hard impact (thrown or banged into a fence) | Same | Limp; bandage emote | Magnifier → splinter | Tweezers, then bandage |
| Ear ache | Random, rare | Not available | Head shake and tilt | Otoscope → red ear | Ear drops |

### 8.2 Sick animal

- The head colour changes to green over a few seconds. Only the head changes. The plan selects the method (a head tint in the pig skin and flock shaders).
- An emote billboard bobs above the head. The animal's tap volume includes the emote.
- Speed: approximately 60%. The animal does not go to troughs, snacks or grain. It is not curious and does not play. It shows its symptom from time to time.
- At night it goes to its stall or perch as usual.
- It does not get worse. It does not get better without the vet.
- Card text: "Feeling poorly: sniffly" (or the ailment's phrase) and "Take <name> to the vet."

### 8.3 Limits

- Maximum 3 sick animals on the farm at one time.
- Each cause is a chance, not a certainty.
- After a cure, the animal has a cooldown before it can sicken again.
- The random ear ache occurs not more than once in the set interval, and only when no other animal is sick.

### 8.4 Tuning

Put all sickness values in one table, `SICK`, next to `P` and `CP`:

| Key (example) | Meaning |
|---|---|
| `coldChance`, `tummyChance`, `splinterChance` | Chance for each cause |
| `splinterImpact` | Impact speed (m/s) that can cause a splinter |
| `tummySnacks`, `tummyGrain`, `tummyWindow` | Food count and time window for a tummy ache |
| `earInterval` | Minimum seconds between random ear aches |
| `maxSick` | Farm-wide limit (3) |
| `cooldown` | Seconds after a cure |
| `sickSpeed` | Speed factor (0.6) |
| `greenEase` | Seconds for the green colour change |

Expose every `SICK` value through `?tune` as a sim command.

### 8.5 Debug

`debug.sicken(i, ailment)` and `debug.cure(i)` (and bird versions) go through sim commands.

---

## 9. Clinic (R3)

### 9.1 Drop-off

- With Grab, the user releases an animal over the clinic (roof or front tap volume). The sim checks the animal in.
- The animal goes to the next free waiting place. The queue (`clinic.queue: [{ kind, i, ailment }]`) keeps the order of drop-off.
- A queued animal is kinematic. The outside sim does not move it. It sits, dozes, sneezes and fidgets.
- A healthy animal: hint "<name>'s fit as a fiddle!" It hops out and goes home.
- Waiting room full (6): hint "Waiting room's full." The sim puts the animal down at the door, outside.

### 9.2 The vet

| Time | Routine |
|---|---|
| Day | Walks between the desk, the waiting room (pats patients), the kitchenette and the exam room |
| Night | Sleeps in her bed in the studio. The clinic is closed |

A Hand tap on the vet shows her card.

### 9.3 Clinic focus

- The user sees the waiting room, the patients and their emotes, the reception, the exam room through its doorway, and the studio.
- A tap on a patient shows its card with its place in the queue.
- A tap on the exam room sends `enter('clinic.exam')`.
- At night, a tap on the exam room gives the hint "The vet's asleep. Come back in the morning!" Drop-offs at night still check in and wait until morning.

### 9.4 Exam

1. The vet says "Next please!" The first animal in the queue goes onto the exam table.
2. The pegboard shows the check-up tools at the top and the treatments at the bottom. The user drags a tool from the board onto the animal. Each drag is a farm command.
3. A check-up tool shows its clue: a short animation and a speech bubble (for example "Hmm, a bit wheezy…"). The user can use more than one check-up tool.
4. The correct treatment plays its animation. The green goes away, the emote changes to a happy emote, and the vet gives a lollipop.
5. An incorrect treatment gives a harmless funny reaction (giggle, a sneeze on the vet, a wiggle) and a hint from the vet ("Hmm, I don't think that's it…"). There is no fail state.
6. A check-up is not necessary. A correct treatment always cures. The check-up only shows which treatment is correct.
7. Splinter: tweezers, then bandage. If the user uses the bandage first, the vet says "Let's get that splinter out first."
8. The next patient comes when the user taps "Next please" or drags a tool to the empty table.
9. If the user leaves the exam room, the patient stays on the table.

### 9.5 Discharge

The cured animal appears at the clinic's front door, outside. It does a happy hop. Then it goes to where it must be: its home pen in the day, its stall or perch at night.

### 9.6 Exam state machine (sim)

| State | Event | Next state |
|---|---|---|
| empty | queue not empty and (vet calls or tool drag) | patient |
| patient | check-up tool | patient (clue shown) |
| patient | correct treatment (last step) | cured |
| patient | correct first step (splinter: tweezers) | patient (step 2) |
| patient | incorrect treatment | patient (funny reaction) |
| cured | lollipop animation ends | empty (discharge) |

---

## 10. Architecture

### 10.1 Files

| File | Status | Function |
|---|---|---|
| `src/layout.js` | Changed | Coop move. Barn and clinic footprints, walls, doors. Sleep and clinic points from the baked sidecar. Moved decor |
| `src/buildings.js` | New (sim) | Barn doors, stall and perch assignment, walk-in path, day naps, focus helpers |
| `src/sickness.js` | New (sim) | `SICK` table, causes, ailment state, symptoms, limits |
| `src/clinic.js` | New (sim) | Queue, check-in, discharge, vet routine, exam state machine |
| `src/sim.js`, `src/chickens.js` | Changed | Herd of 22, `stall` and `perch`, bedtime hooks, sick speed and appetite, impact events |
| `src/game/farm.js`, `src/game/pick.js` | Changed | `enter`, `leave`, `back` commands. Roof, plaque and clinic-drop tap volumes. Pegboard drag commands |
| `src/view/buildings3d.js` | New | Building models, cutaway, plaques, lamp light |
| `src/view/clinic3d.js` | New | Vet, waiting places, exam table, pegboard, tool animations, speech bubbles |
| `src/view/emotes.js` | New | Emote billboards |
| `src/view/rig.js` | Changed | Focus framings, clamps, exam zoom |
| `src/view/pigSkin.js`, flock shaders | Changed | Green head tint |
| `tools/models/*.model.mjs` | New | glb-author sources |
| `game.config.js` | Changed | New bakes |

### 10.2 Rules

- Sim files do not import three.js or the DOM (purity test).
- Focus, queue, exam state, doors, stalls and sickness are sim state. The view only reads them.
- `?tune` and debug tools use sim commands (no view writes to the sim).

---

## 11. Releases

| Release | Done when |
|---|---|
| 2.6.0 | The coop, barn and clinic stand in the north row. Roof tap enters each one. Cutaway and camera work. Barn doors work. The vet walks her day and night routine. All tests pass. The user has played it. |
| 2.7.0 | 22 pigs. Each pig and chicken sleeps in its own named place. Doors and gates have the effects in §7. Goldens are blessed again on purpose, and the commit gives the reason. |
| 2.8.0 | The four ailments, the clinic flow and the exam work as in §8 and §9. |

Deploy each release the usual way: bump the version, build, `git rebase --autostash`, push with the user's approval.

---

## 12. Tests

### 12.1 Headless

- Stall assignment is deterministic. Piglets share their mother's stall. Chicks share their mother's perch.
- At night, every pig that can reach the barn is in its own stall within the set time.
- A pig in a shut pen sleeps in the pen. Pigs wait outside shut barn doors and go in when the doors open.
- Morning exit with doors open. No exit with doors shut.
- Each cause sickens at its chance (tests set the chance to 1.0 through tune). `maxSick` and `cooldown` hold.
- Queue order, full waiting room, healthy drop-off, night closure.
- Exam state machine: correct, incorrect, splinter order, check-up without cure.
- Discharge goes home (day) and to bed (night).
- Focus commands: enter, back up each level, leave by ground tap.

### 12.2 Picks

Roof, plaque, barn door and clinic-drop tap volumes. An animal in front wins.

### 12.3 Models

Each building GLB has the nodes and sockets in §4.1.

### 12.4 Existing suites

Invariants, purity and state-homes stay green. New sim files pass the purity test.

### 12.5 Browser

- Enter and leave each building.
- One full vet visit, from drop-off to discharge.

### 12.6 Test runs

Run tests with the memory limits: `systemd-run` with `MemoryMax`, `node --max-old-space-size`, `--test-concurrency=4`, one browser suite at a time.

---

## 13. Open items for the plans

- Final positions and sizes in §3, after the models exist.
- The animation clips in `character-female-f`, if any.
- The head-tint method for the pig and flock shaders.
- Which tools are in the Kenney packs and which tools to make.
- The emote picture for each ailment and for "happy".
