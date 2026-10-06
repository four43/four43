# Tractor Pickup model files

Every 3D model in the game is a GLB file in this folder (spec X-8). Edit them by hand (for example in Blender), then:

```bash
npm run bake    # assets/models/*.glb -> src/assets.json
npm run build   # -> site/exp/tractor-pickup/
```

To look at the files without the game, serve `games/tractor-pickup/` (for example `python3 -m http.server 8766`) and open
`/tools/models.html` (`?m=sheep,duck` shows only those; `?anim=walk` plays an animation on the animals).

## Rules the code depends on

- **Colors are vertex colors** (`COLOR_0`). In Blender: Vertex Paint mode, or the Color Attribute in a material. A base color
  texture also works (the bake samples it per vertex), but the game draws flat vertex colors only.
- **Model space:** +Y up. Animals face +Z. The game scales and places each model; keep the size and the ground point (y = 0)
  roughly where they are, or the animals float or sink and the colliders no longer match.
- **Node names are part names.** The code uses these:

| File | Nodes the code needs | Notes |
|---|---|---|
| `pig`, `cow`, `chick`, `bunny`, `dog`, `sheep`, `duck`, `chicken` | `body`, `leg-front-left`, `leg-front-right`, `leg-back-left`, `leg-back-right` (birds: `wing-left`, `wing-right` instead of back legs), and `hat` | Cube Pets. Keep the animations (`idle`, `walk`, `run`, `eat`, `dance`). Wings flap in flight by name. `hat` is an empty node (an Empty in Blender) under `body`: the base of a hat sits on it and moves with it. It sits on the top of the head cube (body y 1.26); keep the head under it or the head pokes through the hats (`npm test` checks, `tools/hats.html` shows them). `node models.mjs --hat-mounts` puts it back. |
| `tractor` | `body`, `fenders`, `roof`, `glass`, `details`, `wheel-front-left`, `wheel-front-right`, `wheel-back-left`, `wheel-back-right` | Material names mark the paint areas (W-3): `paint-body` (on `body`: cab, hood, frame) and `paint-trim` (on `fenders` and `roof`). Paint-area vertex colors are greys: the paint goes on top and keeps their shading. Faces with another material (`glass`, `details`, the wheels) keep their own colors. Any non-wheel node is drawn as part of the body, so new parts can be added. |
| `trailer` | `bed`, `wheel` | Car space: +X forward, the tongue at +X. The wheel's axle runs along Z. |
| `barn` | `walls`, `trim`, `roof-shingles`, `roof-gables`, `roof-trim` | Barn space: +Z along the drive-through axis. Material `planks` (walls, gables) and `shingles` get the game's wood and roof textures, by their UVs. The `roof-*` parts fade when the tractor is near. |
| `hat-straw`, `hat-cowboy`, `hat-party` | any | About 0.7 m wide, base at y = 0. |
| `bale`, `cone`, `barrel` | any | Centered on the physics body (the bale is a cylinder along Y; the game lays it down). |
| `wash` | `frame`, `canopy`, `brush` | Wash space: +Z along the drive-through axis, X across. The `canopy` fades while the tractor is under it. `brush` is drawn at each side of the opening and spins about Y. |
| `sprinkler`, `gate` | `arch` | Across X, centered on the road or the gate opening. |
| `stump-cut` | any | What a broken tree leaves. |
| `oak` | any | Breakable farmyard and roadside trees (drawn 2.6 times this size). |
| `shrub` | any | Breakable bushes. |
| `rockA`, `rockB`, `rockC` | any | Rocks along the top of the cuttings. |
| `tree`, `treeFat`, `bush`, `bushS`, `fence`, `rock`, `pumpkin`, `corn`, `grass`, `flowerY`, `flowerR`, `log`, `stump`, `hay` | any | Forest, fields and fences. |

## Where they came from

`models.mjs` made the first version: the Kenney models (Nature Kit, Cube Pets, Car Kit, Graveyard Kit; CC0) with their palette
colors moved into vertex colors, the sheep, duck and chicken reshaped from the pig and the chick, and the models that used to be
built in code. It never overwrites a file that exists (except that it adds a `hat` node to an animal file that has none). `node models.mjs --force sheep` remakes one (your edits to it are lost).
