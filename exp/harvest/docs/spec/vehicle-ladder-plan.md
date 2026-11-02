# Harvest: the vehicle ladder (plan)

Status: plan, 2026-11-01; the user's calls are in §9. Phases 1 and 2 are done (spec §14, §15); phase 3 (the meadow and the tractor) is next.

The goal is a longer game in chapters. Each chapter has its own vehicle, its own area of the farm, its own crops and its own way
of carrying the harvest. The loop stays the same as now: cut, fill, sell, upgrade. Buying the next vehicle opens the next area.
The last chapter leaves Earth: a hover harvester on an alien planet with weird crops.

Why this shape, from the research (`docs/reference/harvest-games-research.md`):
- **New areas that cost more and pay more** are the genre's main way to last (Harvest Village plots; Farm Land zones).
- **New machines feel bigger than upgrade levels** (Harvest Run harvester models; Lawn City mower → truck).
- **Each level looks different** keeps the same loop fresh (Mow it's new grass colours).
- **What to avoid:** hard gates you cannot earn your way through (Crush & Collect, Harvest.io "stuck at 49"), and fields that never
  come back (Idle Mow).

So every gate is a price, never a level. Every field keeps growing back.

## 1. The chapters

| # | Chapter | Vehicle | Crops (toughness 0 / 1 / 2) | Carries | Sells at | Opens with |
|---|---|---|---|---|---|---|
| 1 | **Backyard** | Ride-on mower | lawn / long grass / clover | bagger on the mower, then a little tip cart | compost bins by the house | start |
| 2 | **Meadow** | Compact tractor + mower-baler | hay / alfalfa / wildflowers | a bale trailer, the bales stacked high | the hay barn's loft | 1,500 |
| 3 | **Grain fields** | Combine (today's game) | wheat / corn / sunflowers | grain wagons | the silo | 8,000 |
| 4 | **Kepler Farm** (off-planet) | Hover harvester | glowbulbs / crystal reeds / jelly coral | floating pods on light tethers | the orbital lift | 150,000 (the rocket) |

Optional, between 3 and 4 if the run feels short: **Big Sky**, a tracked mega-combine (12 m header, 7 wagons) on huge
canola and rice fields. It is listed in phase 6 and is left out unless playtests ask for it.

Each chapter has three crops on the same blades-style gate as today. "Blades" becomes the chapter's own name for it: Blades for
the mower, Cutter bar for the tractor, Blades for the combine, Phase cutter for the hover.

### Chapter 1: Backyard (the new start)
- **Area:** a small lawn (about 30 × 40 m) behind a farmhouse at the yard's south edge. Flower beds, a washing line, a dog house
  and a sandpit act as obstacles. These are small, friendly first lessons in steering.
- **Mower:** a red ride-on mower, 1.1 m deck, slow (3 m/s). It has no trailer at first: a bagger on the back holds the clippings.
  - The "Wagons" upgrade adds one little tip cart, then two.
- **Grass is drawn, not instanced:** a mown cell is a pale stripe in the ground texture, so there are no grass meshes. The mown
  stripes are the reward.
  - Long grass and clover are short instanced tufts (cheap).
- **Sells at:** compost bins. You drive past them and the clippings tip in.
- **Pacing target:** about 10 minutes to the tractor.

### Chapter 2: Meadow
- **Area:** a hay meadow east of the yard (where the corn is now; the grain fields move north and west, §4). There is a pond
  in it to steer round, and a small stream with a wooden bridge.
- **Tractor:** a compact tractor towing a side mower-baler. It cuts hay into the baler, which drops a round bale onto the
  trailer every N cells. The bales stack (two, then three high) and the stack sways.
  - This is the "tower" the research found players love (Mow & Haul).
- **Sells at:** the hay barn. You drive through, and a loader arm lifts the bales off the trailer one by one (coins per bale).
- **Pacing target:** about 20 minutes to the combine.

### Chapter 3: Grain fields
This is today's game, unchanged except for re-based numbers (§5) and the bumper crops (§6).

### Chapter 4: Kepler Farm (off-planet)
- **Getting there:** a rocket on a launch pad at the farm's far end. Buying it plays a launch: the camera follows it up into the
  sky, cuts to black and lands on the planet. A second pad on the planet flies you home.
- **Look:** purple-teal soil, two moons, a ringed planet low in the sky, glass dome buildings, crystal rocks.
  - The colours stay bright and friendly; this is not dark sci-fi.
  - Grain floats down slowly (low gravity).
- **Hover harvester:**
  - **Body:** a flat saucer-ish machine with a glowing intake ring at the front where the header would be. No wheels.
  - **Drift:** it floats a metre up on four hover rays (springs), banks into turns and drifts a little more than the combine.
    It is still point-to-go on the same stick.
  - **Feel:** the glow trail and a soft hum make it feel different without being harder to drive.
- **Crops:**
  - **Glowbulbs:** lantern-like fruit on stalks that pulse.
  - **Crystal reeds:** tall clear blades that tinkle when cut.
  - **Jelly coral:** wobbly pink-blue blobs that jiggle as you pass.
  - All three are instanced like today's crops, with a shader wobble or glow.
- **Carries:** floating pods. Each pod follows the one in front on a glowing tether, like the wagons on spring joints but with
  hover rays instead of wheels. Kernels become little glowing orbs that arc slowly into the pod.
- **Sells at:** the orbital lift, a beam of light from a ring station. Pods hover into the beam and their orbs rise up it.
- **Pacing target:** 40+ minutes. Then bumper crops make it open-ended.

## 2. Vehicles in the sim

Today the farm has one rig kind, the combine with wagons. Instead, a vehicle becomes a definition:

```
VEHICLES = {
  mower:   { model, body, cutter: { width0, perLevel, strip }, drive: 'wheels', carrier: 'bagger',  speed, ... },
  tractor: { ..., carrier: 'bales' },
  combine: { ..., carrier: 'wagons' },
  hover:   { ..., drive: 'hover', carrier: 'pods' },
}
```

- **Drive:** `wheels` is today's arcade controller (yaw rate from the stick, side grip). `hover` keeps the same yaw rate and
  grip but holds the body up on four spring rays in place of the vehicle kit's wheels. Its grip is lower, so it slides wider.
- **Cutter:** the header strip as today (width per level, cut cells by toughness), on any vehicle.
- **Carrier:** a set of bins (the load stays as it is) plus how the view draws them:
  - **bagger:** one bin on the vehicle;
  - **wagons:** today's;
  - **bales:** a bin counted in whole bales, drawn as a stack;
  - **pods:** wagons on hover rays.
  - The towed ones reuse today's train (joints, straightening when backing).
- **Upgrades per vehicle:** speed, cutter width, bin size, carrier count and the toughness gate. Each vehicle's table lives in
  its definition, so each chapter has its own price curve.
- **Swapping:** owned vehicles park beside the workshop barn. Its card gets a vehicle row: tap one to swap. The rig respawns
  as that vehicle in the barn.
  - In multiplayer each player picks their own vehicle (§7 of the spec already gives every player their own rig).

## 3. Areas and gates

- **One areas list in the layout:** each area has its fields, its sell zone, and the gate that opens it (a fence section with a
  price sign, like the old field signs).
- **Buying a vehicle opens its gate.** The fence section drops away, and a banner and arrow lead you there (the blades-unlock
  banner already does this).
- **Old areas stay open** and keep paying. A late player can still mow the lawn for fun, though it pays little, unless it is a
  bumper crop (§6).

## 4. Map growth

| | Today | Planned (Earth) |
|---|---|---|
| Size | 160 × 160 m | about 280 × 280 m |
| Backyard | — | south of the yard, by the new farmhouse |
| Meadow | — | east of the yard (where the corn is now) |
| Grain fields | north, east, west of the yard | north and north-west, further out |
| Launch pad | — | far north-east corner |

- **One Earth map**, grown from today's, with the yard (barn, silo) staying in the middle.
  - The camera and the stick work the same at any size.
  - The crops are already instanced in 16 × 16 cell chunks with view culling. Lion Hawk 0.17's LOD/scatter (Rally uses it)
    handles the extra trees and fence.
- **Kepler Farm is its own scene**, with its own map, about 200 × 200 m, reached by the rocket. A scene change keeps load times
  and memory small on phones; Earth and the planet are never in memory together.
- **The sell points move with the areas:** compost bins by the lawn, the hay barn in the meadow, the silo in the middle.
  The workshop barn stays central (Earth). The planet gets its own workshop dome.

## 5. Economy (first numbers, to tune by playtest)

Each chapter's crops pay about 5× the one before, so new players see coins jump. Upgrade prices scale with them.

| Chapter | Crop prices (per cell) | Vehicle price | Upgrade bases | Target time |
|---|---|---|---|---|
| Backyard | 1 / 2 / 3 | free | 20–100 | 10 min |
| Meadow | 4 / 8 / 12 | 1,500 | 150–800 | 20 min |
| Grain | 20 / 40 / 80 (wheat / corn / sunflower) | 8,000 | 600–5,000 | 40 min |
| Kepler | 300 / 600 / 1,200 | 150,000 | 10k–80k | 40+ min |

- Today's grain prices (1 / 2 / 4) are re-based ×20, and their upgrades with them (done in phase 1).
- The next vehicle should cost about what the current one earns in 10–15 minutes once it is half-upgraded. Then buying it is a
  choice (finish upgrading, or move on), never a wall.

## 6. Bumper crops (the endless part)

- **Every third harvest** of a field, it grows back as a bumper crop: about 1.4× as tall, golden-tinted, worth 2× per cell, and
  cut at 0.8× crop speed.
  - The sign says "BUMPER!" and the banner says "Bumper wheat!".
- **It builds on the regrowth we already have:** a field is done at 97 %, grows back once, and is fresh until done again. A
  counter on the field picks which regrowth is a bumper.
- **It gives old areas a reason to be visited again** with a stronger machine, which is the late game.

## 7. Saves (version 4)

```
{ v: 4, coins,
  owned: { mower: true, tractor: false, combine: false, hover: false },
  active: 'mower',
  vehicles: { mower: { levels }, tractor: { levels }, combine: { levels }, hover: { levels } },
  fields: { <id>: { done, cut: runs } } }              // phase 1; `harvests` (bumper crops) and `world` come with their phases
```

Saves of other versions start a fresh farm (the user's call: old saves do not matter).

## 8. Build phases

Each phase is a playable build, tested and deployable on its own.

| Phase | What | New models (glb-author) |
|---|---|---|
| 1 | **Vehicle framework:** vehicle definitions with their own upgrade tables, the ×20 price rebase (§5), save v4. Only the combine exists still, so it plays like today with bigger numbers. | — |
| 2 | **Backyard + mower:** the new start, mown-stripe grass, bagger and tip cart, compost bins, farmhouse. The map grows. The vehicle row in the workshop card and the area gates come here, with the first second vehicle to swap to and gate to open. | mower, tip cart, farmhouse, compost bins, garden props |
| 3 | **Meadow + tractor:** hay crops, the baler, the bale stack and its sway, the hay barn with its loader arm. | tractor, mower-baler, bale trailer, round bale, hay barn, hay/alfalfa/wildflower crops |
| 4 | **Bumper crops.** | — (tint and scale on the crop instances) |
| 5 | **Kepler Farm:** the hover drive, the planet scene, the rocket launch and landing, the alien crops (glow/wobble shaders), pods and tethers, orbital lift, workshop dome, sky. | hover harvester, pod, rocket + pad, orbital lift, dome, 3 alien crops, crystal rocks |
| 6 | Optional: **Big Sky** mega-combine. | tracked combine, crops |

Multiplayer (spec §7) stays its own track, after the new chapters (the user's call). Phase 1 still gets it ready: every rig
carries its vehicle type.

Rough size: phase 1 is about a day of work, phases 2 and 3 a couple of days each (mostly models and feel), phase 5 is the biggest
(new drive, new scene, shaders, the most models).

## 9. The user's calls (2026-11-01)

1. **New players start on the mower** in the backyard (the full ladder).
2. **One Earth map** growing outward, for now; Kepler Farm is its own scene.
3. **One planet** first.
4. **Big Sky mega-combine: out** for now.
5. **Multiplayer after** the new chapters.
