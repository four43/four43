# Harvest models

All models are glTF binaries. Frame (glb-author's): metres, +Y up, the front faces +Z, +X is the model's LEFT, the origin is
bottom-centre on the ground. Every custom model takes its dimensions from `src/defs/models.js`, so art and physics agree.

## Custom models (`custom/`)

Built by `tools/models/<name>.model.mjs` with the glb-author kit; `tools/models/<name>.spec.json` is each model's spec.
Colours are flat materials stored as Kenney-style sRGB `baseColorFactor` numbers (see `kenney()` in `tools/models/lib.mjs`),
for the bake's palette `'vertex'`.

| File | Nodes the code uses | Sockets | Materials | Tris |
|---|---|---|---|---|
| `combine.glb` | `body`; `grain` (origin on the tank floor centre, scale Y 0.05..1, top reaches `COMBINE.tank.top` at 1); `spout` (origin `COMBINE.spout.root`, folded along -Z, swing about Y); `wheel_FL` `wheel_FR` `wheel_BL` `wheel_BR` (origin on the hub, spin about X) | `Socket_Header`, `Socket_Hitch`, `Socket_SpoutTip` (child of `spout`, the nozzle's open end) | `paint` (repaint per player), `trim`, `glass`, `tyre`, `metal`, `grain`, `light` | 2504 |
| `header.glb` | `bar` and `reel` (exactly 1 m wide, x -0.5..0.5: scale X to the header width; `reel` origin on its axle at `HEADER.reel`, spin about X); `end_L` / `end_R` (origin at x +0.5 / -0.5: move to +/- width/2). Model origin = back edge centre, hangs on `Socket_Header` | - | `paint`, `trim`, `metal` | 668 |
| `cart.glb` | `bed`; `grain` (origin on the hopper floor centre, scale Y 0.05..1, top reaches `CART.hopper.top`); `wheel_L` `wheel_R` (hub origin, spin about X) | `Socket_Hitch` (tongue tip), `Socket_Tow` | `paint` (repaint per player), `trim`, `tyre`, `metal`, `grain` | 984 |
| `wheat.glb` | `crop` (one mesh node, instanced) | - | `crop`, `head` | 112 |
| `corn.glb` | `crop` (one mesh node, instanced) | - | `crop`, `cob`, `tassel` | 109 |
| `sunflower.glb` | `crop` (one mesh node, instanced; faces look +Z) | - | `crop`, `petal`, `seed` | 116 |
| `silo.glb` | `bay`, `silos`, `grate` | `Socket_Pit` (bay centre, on the ground) | `galv`, `red`, `white`, `concrete`, `metal`, `trim` | 1704 |
| `shed.glb` | `walls`, `roof`, `signboard` (front face UVs 0..1 for the game's picture; material `sign`) | - | `red`, `white`, `roof`, `concrete`, `glass`, `wood`, `sign` | 416 |
| `sign.glb` | `board` (own material `board`; front face UVs 0..1: u left to right, v bottom to top, so a `CanvasTexture` with the default `flipY` reads upright), `posts` | - | `board`, `wood` | 64 |
| `mower.glb` | `body`; `driver` (origin on the seat top centre); `deck` (exactly 1 m wide, x -0.5..0.5, origin on its underside centre at `MOWER.deck` z/y: scale X to the cutting width; chute out of its back centre); `grain` (green clippings, origin on the catcher floor centre, scale Y 0.05..1, top reaches `MOWER.bag.top` at 1); `wheel_FL` `wheel_FR` `wheel_BL` `wheel_BR` (origin on the hub, spin about X) | `Socket_SpoutTip` (`MOWER.spout`, the chute's mouth over the catcher's low front wall), `Socket_Bag` (catcher opening, top centre), `Socket_Hitch` | `paint` (repaint per player), `trim`, `metal`, `tyre`, `light`, `grain`, `seat`, `skin`, `shirt`, `jeans`, `hat`, `red` | 2708 |
| `tipcart.glb` | `bed`; `grain` (green clippings, origin on the hopper floor centre, scale Y 0.05..1, top reaches `TIPCART.hopper.top`); `wheel_L` `wheel_R` (hub origin, spin about X) | `Socket_Hitch` (tongue tip), `Socket_Tow` | `paint` (repaint per player), `trim`, `tyre`, `metal`, `grain` | 888 |
| `lawn.glb` | `crop` (one mesh node, instanced; 0.5 m cell) | - | `crop` | 21 |
| `longgrass.glb` | `crop` (one mesh node, instanced; 0.5 m cell) | - | `crop`, `head` | 68 |
| `clover.glb` | `crop` (one mesh node, instanced; 0.5 m cell) | - | `crop`, `petal`, `head` | 72 |
| `farmhouse.glb` | `house`, `roof`, `porch` (static; porch and door face +Z) | - | `wall`, `white`, `red`, `roof`, `glass`, `wood`, `concrete`, `brick`, `light` | 1972 |
| `compost.glb` | static, three bays open to +Z | - | `board`, `wood`, `soil`, `seed`, `crop`, `sign`, `white` | 648 |
| `doghouse.glb` | static, door faces +Z, bowl in front | - | `red`, `white`, `roof`, `board`, `dark`, `sign`, `metal`, `seed` | 292 |
| `flowerbed.glb` | static | - | `wood`, `board`, `soil`, `crop`, `petal`, `red`, `white`, `flower`, `seed` | 1060 |
| `tractor.glb` | `body` (with the deck's two arms); `driver` (origin on the seat top centre); `deck` (exactly 1 m wide, x -0.5..0.5, origin on its underside centre at `TRACTOR.deck` z/y: scale X to the cutting width, 2.5..6 m; nothing round in x); `wheel_FL` `wheel_FR` `wheel_BL` `wheel_BR` (origin on the hub, spin about X) | `Socket_Hitch` (`TRACTOR.hitch`) | `paint` (repaint per player), `trim`, `rim`, `tyre`, `metal`, `light`, `red`, `seat`, `skin`, `shirt`, `jeans`, `hat` | 3066 |
| `baletrailer.glb` | `bed` (plank deck, low side rails, headboard, A-frame tongue, mudguards); `wheel_L` `wheel_R` (hub origin, spin about X); no grain node (the game draws the bales) | `Socket_Hitch` (tongue tip), `Socket_Tow`, `Socket_Bed` (the deck's top centre) | `paint` (repaint per player), `rim`, `tyre`, `metal`, `wood`, `red` | 1460 |
| `bale.glb` | `bale` (one mesh node, instanced; lying on its side, axis along X, centre at y = `BALE.r`) | - | `grain`, `seed` | 128 |
| `haybarn.glb` | `walls` (side walls, trim, windows and the bale stacks inside; 11.4 m clear lane), `gables` (with the hayloft door and hoist beam), `roof` (gambrel), `signboard` (front face UVs 0..1, material `sign`); static | - | `red`, `board`, `white`, `roof`, `glass`, `wood`, `dark`, `sign`, `grain`, `seed` | 3484 |
| `hay.glb` | `crop` (one mesh node, instanced) | - | `crop`, `head` | 102 |
| `alfalfa.glb` | `crop` (one mesh node, instanced) | - | `crop`, `petal` | 108 |
| `wildflowers.glb` | `crop` (one mesh node, instanced) | - | `crop`, `petal` (red), `head` (yellow), `flower` (blue), `seed` (white) | 101 |

Crops fill one 1 m cell (footprint inside x, z +/-0.5) at the full-growth height in `CROPS` (the meadow's `hay`, `alfalfa`,
`wildflowers`: `MEADOW_CROPS`); the backyard crops (`lawn`, `longgrass`,
`clover`) fill one 0.5 m cell (inside x, z +/-0.25) at the heights in `YARD_CROPS`.

### Rebuild

From `exp/harvest`, under the usual memory cap (needs the glb-author skill, whose kit the scripts import by absolute path):

```bash
systemd-run --user --wait -P -p WorkingDirectory=$PWD -p MemoryMax=3G -p MemorySwapMax=0 -p RuntimeMaxSec=300 \
  node --max-old-space-size=1024 tools/models/<name>.model.mjs
```

Then check it against its spec (`node ~/.claude/skills/glb-author/scripts/validate.mjs assets/models/custom/<name>.glb
--spec tools/models/<name>.spec.json`) and look at the renders (`look.mjs`, PNGs land in `custom/look/`).
`tools/models/lib.mjs` holds the shared helpers (`kenney()` colours, lugged wheels, open bins, grain-heap lofts, crop parts).

## Kenney Nature Kit (`nature-kit/`, CC0)

Copied unedited from Kenney Game Assets All-in-1 3.7.0; `SOURCES.json` lists each file's source path and sha256 prefix.

| File | Use |
|---|---|
| `tree_oak.glb`, `tree_default.glb`, `tree_fat.glb` | trees round the fields |
| `plant_bush.glb`, `plant_bushLarge.glb` | hedges and bushes |
| `fence_simple.glb` | field fences |
| `rock_smallC.glb`, `grass_large.glb`, `flower_yellowB.glb` | ground scatter |
