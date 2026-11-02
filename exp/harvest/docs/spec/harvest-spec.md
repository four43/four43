# Harvest: game spec (first pass)

A friendly arcade harvesting game on Lion Hawk. You drive a combine with one thumb stick, cut ripe crops, the grain fills the
combine's tank and then the grain carts it tows, you drive to the silo to sell, and you spend the coins on upgrades and new
fields. No ads, no timers, no fail states. Research behind the choices: [`docs/reference/harvest-games-research.md`](../reference/harvest-games-research.md).

Status: third pass (2026-11-01): every field open, cut when the blades reach its crop; arcade steering; the chute blows grain into
the wagons and the wagons drop it through the silo pit. The numbers are starting points for a `?tune` playtest.

## 1. Decisions taken for the first pass

The research ended with open questions. These are the answers this pass uses. Each one is easy to change.

| Question | First-pass answer |
|---|---|
| Free roam or timed rounds | Free roam. One farm, always there. |
| Bales or grain | Grain. The combine's chute blows it into the wagons hitched behind (in order); they unload through their floors over the silo pit (playtest call). |
| Upgrade pads or menu | A pad in the world. Drive through the barn and the upgrade card opens; drive out and it closes. |
| Helpers / automation | None. |
| Offline earnings | None. |
| Saving | Per device in localStorage (coins, levels, fields). |
| Trailers a trade-off | No. More carts are pure upside. |
| Crops and fields | 3 fields, all there from the start: wheat, corn, sunflowers. A field is cut when the Blades reach its crop (playtest call: no field order, no buying fields). |
| Multiplayer money | One shared farm purse (co-op: everyone's sales go into it, anyone can spend it). Upgrade levels are per combine. |

## 2. Controls

- **H-C1** One control: point to go, as Tractor Pickup (its `stickToWorld` and pilot). The stick says where to drive on the screen;
  the combine turns toward it and drives. Stick straight down backs up.
- **H-C2** Floating stick on touch (anywhere on the canvas, not within 24 px of the left edge), W/A/S/D and arrows, pad left stick.
- **H-C3** No other buttons are needed to play. Menus have big buttons.
- **H-C4** Arcade steering (playtest call: realistic was not fun). The steer asks for a turn rate (`turnRate` 1.4 rad/s, half that
  backing up) that the combine's yaw rate is set to, standing or moving; a side grip keeps it going where it points; no wheel steers.
  Backing up, the stick turns the rear toward it, and each wagon is pulled in line behind the one in front (`straighten`).

## 3. The farm

- **H-F1** A flat farm, about 160 × 160 m, with a fence round the edge that you cannot drive through.
- **H-F2** The yard in the middle: the **silo** with a drive-through sell bay (13 m wide), and the **barn** (17 × 14 m, 10 m to the
  ridge), a drive-through upgrade bay open at both ends. Both are wide enough for the 8 m header.
- **H-F3** Three fields of 1 m cells. Wheat north of the yard, corn east, sunflowers west. A field the blades cannot cut shows its
  crop greyed.
- **H-F4** Gravel lanes join the yard to every field.
- **H-F5** A field is done when `DONE_AT` (97 %) of its cells are cut: a `fieldDone` event and a banner. Until then its cut cells
  stay stubble. Done, the whole field grows back; once it is all ripe it is a fresh field again, and cutting it leaves stubble until
  it is done again. The HUD shows the field last cut and its percent.
- **H-F6** Signs: a board beside each field's lane (crop, price a grain; too tough: the blades it needs), WORKSHOP on the barn's
  front gable, SELL GRAIN on the silo bay's, and UPGRADE / SELL painted on the pads.

## 4. Harvesting

- **H-H1** The header is the strip in front of the combine (width from the header level). Every ripe cell whose centre the
  header passes over is cut, while the tank and carts have room.
- **H-H2** A cut cell gives 1 grain of its crop. The cell becomes stubble and grows back: it sprouts, then grows to ripe in
  `GROW_S` seconds (45 s), but only once its field is done (H-F5). Only ripe cells cut.
- **H-H3** Full: when the wagons are full the header stops cutting, a FULL banner shows and an arrow points to the silo.
- **H-H4** Load order: wagon 1, wagon 2, … Each holds the bin size; the view draws each heap by its fill.
- **H-H5** Speed in crop: the combine's top speed is `cropSpeed` (0.75) × its speed on the lane while it is in crop (it cut in the
  last 20 steps, or ripe crop is just ahead of the header).
- **H-H6** Tough crops: wheat 0, corn 1, sunflowers 2. The header cuts a crop only when the combine's Blades level is at least its
  toughness. A crop too tough stays standing and the combine pushes through at `toughSlow` (0.4) of crop speed; the HUD says
  "Too tough! Corn needs blades 1". Buying Blades shows "Corn unlocked!" and the arrow points to that field until it is cut.
- **H-H7** The chute pivots behind the tank and stays folded back over the wagons, aimed at the wagon filling; a stream of kernels
  leaves its nozzle (Socket_SpoutTip) and lands where the wagon will be (led by the combine's velocity) while the load grows.
  The combine's own tank is empty (it carries nothing).

## 5. Selling

- **H-S1** The sell bay is a zone on the ground under the silo's roof. Each wagon whose centre is in it drops its grain through its
  floor into the pit at `unloadRate` (150) grain per second (the view drops kernels); the combine in the bay unloads nothing. Grain (carts last first, then the tank) and coins are paid per grain at that crop's price.
- **H-S2** Crop prices: wheat 1, corn 2, sunflower 4 coins per grain. Grain keeps its crop: each container holds counts per crop.
- **H-S3** Each sale emits `sold` events; the view flies coins to the counter.

## 6. Upgrades and fields

- **H-U1** Driving into the barn's bay opens the upgrade card; leaving (out of either end) closes it. The combine is not held.
- **H-U2** Five upgrades, each with levels. Cost = `base × growth^level` (rounded to 5). The start load is 350 (one wagon).

| Upgrade | Effect per level | Levels | base | growth |
|---|---|---|---|---|
| Speed | top speed 4.5 m/s + 0.6 per level | 8 | 60 | 1.5 |
| Header | width 3 m + 1 per level | 5 | 100 | 1.75 |
| Bin size | each wagon holds 350 grain + 80 per level | 6 | 80 | 1.55 |
| Wagons | 1 wagon + 1 per level | 4 | 250 | 2.1 |
| Blades | cuts crops this tough (wheat 0, corn 1, sunflowers 2) | 2 | 300 | 5 |

- **H-U4** Buying is a command (`buy`), checked in the sim against the purse. A purchase that cannot be afforded does nothing.

## 7. Multiplayer (planned; the first pass builds the sim to fit it)

The first pass is solo but the sim is laid out for Lion Hawk's host-authoritative net (`defineGame({ net })`, engine join):

- **H-M1** Each player has their own combine and carts (an owner kind, driven on the other devices, as Tractor's train).
- **H-M2** The host owns the field cells, the purse, the unlocked fields and every combine's levels and load (`lh.game` and
  `lh.player` fields). Cells replicate as host-kind chunk records (8 × 8 cells, 2 bits per cell).
- **H-M3** Harvesting, selling and buying run in the sim on the host for every combine (replicas included). A guest predicts
  its own cuts in its view only.
- **H-M4** Purchases from a guest go to the host as wire messages (`host.buy`).
- **H-M5** Lobby: the Handshake Host/Join panel from Tractor Pickup, in the parent menu. Not in the first pass.

## 8. Look

- **H-L1** Bright, low-poly, flat colours (Kenney style). Every model is a GLB in `assets/models/`, built by a
  `tools/models/<name>.model.mjs` script (glb-author). The crops are instanced.
- **H-L2** The ground under a field is drawn from a per-cell texture: ripe soil, stubble stripes, sprouts.
- **H-L3** Chase camera, low (as Tractor Pickup), looking ahead.
- **H-L4** HUD: coins (top), the load bar (tank + carts, n / max), the active field's progress, a FULL banner and the arrow to the
  silo, the tough-crop hint, the field-done banner.

Saves (version 3): coins, levels, which fields are done, and every field's cut cells as run lengths (saved after each pass over the
pit, each purchase and each field done). Older saves carry over (the tank level becomes the bin size level).

## 9. Debug

- `?tune`: the feel and economy numbers, through a sim `tune` command (never view writes).
- `?coins=N` starts with N coins (debug).
- `window.engine` (engine hook) and `engine.debug` (the game's extras).

## 10. First-pass build notes (2026-11-01)

What runs: free-roam farm, point-to-go combine (rear-wheel steer) with 1–5 towed grain carts, header cutting into tank then carts,
FULL banner and arrow, silo unloading with coins flying to the counter, the workshop card (4 upgrades), the corn and sunflower
price signs, regrowth, localStorage saves, `?tune` (growS, cropSpeed, unloadRate), `?coins=N`. The shed's and the silo bay's roofs
lift while the combine is under them.

Code map: `src/sim/` (layout, field cells, load, combine + carts, farm), `src/game/scene.js` (scene, cards, commands),
`src/view/` (world3d, vehicles, hud, cards, sound, rig), models in `tools/models/*.model.mjs` → `assets/models/custom/`.

Tests: `npm test` (headless farm loop, load/field units, engine checks: determinism, purity, materials) and `npm run test:e2e`
(Chromium: desktop, iPhone portrait, iPad landscape; screenshots in `test-results/shots/`).

Known gaps for the next pass:
- Multiplayer (§7) is not wired yet: the farm already keeps one rig per player and every purchase is a command, but there are no
  net kinds, no `net` config and no Host/Join panel.
- Buying a header or carts respawns the rig in place, the carts trailing straight behind. In the drive-through barn they trail out
  of a doorway; a rig parked at an angle could still put a cart into a wall.
- Only three fields. More areas (and tougher crops) would extend the run.
- No grain stream particles, no chaff, no per-crop grain colour on the heaps (always golden), no music, no settings/parent menu, no PWA files.
- The economy numbers are first guesses; play it with `?tune` and `?coins=`.

## 11. Second pass (2026-11-01, after the first playtest)

Playtest asks: a bigger first hopper, upgrades easier to reach (drive-through), z-fighting on the barn and a taller barn, signs
round the farm, fields done one after another, crops that slow you until upgraded. Done as H-F2, H-F5, H-F6, H-H5, H-H6, H-U2 above.
The barn's z-fighting was coplanar faces (corner boards and wall tops, gable and wall ends) that showed while its roof was hidden;
the new model keeps every outward face on its own plane. The bake drops UVs, so the view gives the sign boards theirs (`fitUV`).

## 12. Third pass (2026-11-01, second playtest)

Playtest asks: upgrades and field order contradicted each other (cut anything the upgrades allow); turning hard and backing worse
(more realistic than fun); the chute should blow into the wagons while harvesting, and the wagons drop the grain out of their
bottoms. Done as H-C4, H-F5, H-H6, H-H7, H-S1, H-U2 above. The tank upgrade became Bin size (the wagons' size). Also fixed: the
combine's header was cloned before its model loaded when the sim ran ahead of the view (it is attached on the first frame it is).

## 13. Fourth pass (2026-11-01, third playtest)

The grain stream now leaves the nozzle socket and leads the moving wagon; the chute's pivot moved behind the tank (it swung through
it). The silo bay and the barn are wider (13 m, 17 m). A field grown back is fresh: it stays cut until harvested again (H-F5).

## 14. Vehicles, phase 1 (2026-11-01)

The first step of the vehicle ladder (docs/spec/vehicle-ladder-plan.md):
- **H-V1** A vehicle is a definition in `src/defs/vehicles.js` with its own upgrade table. Every table has the same five ids:
  speed, width (the cutter; "Header" on the combine), bins, carts, blades. A rig belongs to a vehicle; buying upgrades the rig's
  vehicle. Only the combine exists so far.
- Prices are re-based ×20 for the chapters to come: wheat 20, corn 40, sunflowers 80 a grain; the combine's upgrades start at
  1,200 (speed), 2,000 (header), 1,600 (bin size), 5,000 (wagons), 6,000 (blades), with the same growth as before.
- Saves are version 4: `{ v, coins, owned, active, vehicles: { <id>: { levels } }, fields: { <id>: { done, cut } } }`. Saves of
  other versions start a fresh farm (the user's call: old saves do not matter).

The tables in §6 (H-U2) and the prices in §5 (H-S2) above give the pre-rebase numbers; the vehicle file is the source now.

## 15. Vehicles, phase 2: the backyard and the mower (2026-11-01)

- **H-V2** A new farm starts in the **mower**. The workshop card has a row of vehicle buttons above the upgrades: the one being
  driven ("driving"), owned ones ("drive"; swapping is free) and ones to buy (their price; the combine costs 8,000). Driving a
  vehicle respawns the rig in it where it stands. Each vehicle keeps its own levels and its own load (a swap loses nothing).
- **H-V3** Each crop belongs to a vehicle: the mower cuts the backyard's crops, the combine the grain. A vehicle in another vehicle's
  crop pushes through it slowly and the HUD says "Can't cut! Wheat needs the combine". A field whose vehicle is not owned, or whose
  blades are too low, is greyed and its sign says what it needs.
- **H-F7** The backyard, south of the yard: the farmhouse facing north over the **lawn** (30 × 24 m), **long grass** (24 × 20 m,
  blades 1) and **clover** (20 × 20 m, blades 2), with 0.5 m cells (fields have a cell `size` now). Compost bins are the mower's
  sell point: every bin (the catcher, the tip carts) in front of them unloads. A dog house and two flower beds by the porch. A
  gravel path runs from the yard to the lawn and the compost bins. The map does not grow yet (the backyard fits inside the fence).
- **The mower:** 1.1 m deck (up to 2.6 m), 3.2 m/s (up to 5.6), a catcher of 120 clippings (up to 360) on the back, up to 2 tip
  carts, blades 0..2. Prices: lawn 1, long grass 2, clover 3 a clipping; upgrades from 40. Its camera is closer (7 m back, 7.5 up).
- **Bins:** a vehicle's bins are its own catcher (the mower's) and then one per towed cart, all the bin size.
- **Sim:** `src/sim/combine.js` holds the vehicle kinds (`KINDS`: mass, colliders, wheels, cutter strip, the cart it tows); forces
  and brakes scale with the mass. The rig entity carries the tags `rig` and its kind.

### 15.1 Playtest fixes (2026-11-01)

- **H-H5 (replaces the crop-speed share):** off the crop a vehicle drives at its **road speed** (mower 6.5 m/s, combine 10 m/s,
  above every upgrade); in crop it slows to its **cutting speed**, which is what the speed upgrade buys ("Cut speed": mower 2.2 m/s
  + 0.4 a level, combine 3.2 + 0.6). The drive force pulls fully until two-thirds of the target speed.
- **H-F8** A fence runs across the farm at z = -34.5 between the backyard and the grain fields, with a farm gate (`gate.glb`, two
  leaves) on the path from the yard. The gate is shut (a collider) until the combine is owned; then its leaves swing open.
- **The garage** (the mower's workshop) is an open gravel pad beside the compost bins with a workbench (`workbench.glb`) on its
  east side: nothing to drive into. Driving onto it opens the workshop card, like the barn (zones `shop` and `garage`).
- A vehicle bought or swapped to appears at its home (the mower by the compost bins, the combine in the yard); the camera jumps.
- **Ground:** tiled grass and gravel textures sampled in world space (after Tractor Pickup), pads as their own decals with the
  word sized to fit, and the fields' cell colours multiplied by a fine detail texture.
- **Fixes:**
  - The suspensions now sit at the models' heights (stiffness per vehicle and cart), so the tyres no longer ride into the mower's
    fenders and the tip carts no longer pitch forward.
  - The farmhouse's porch steps rise toward the deck, and its windows read as set into the walls.
  - The backyard's signs are out of the way: the lawn's against the fence, the others at their fields' outer corners.
