# Phase 3j (Rally): notes

## Outcome
(stub: filled at the end of the plan)

## Baselines (Task 1, four43 e6b384e, engine 0.8.0)
- Single-file page: 5916590 B, 2055491 B gzip.
- perf (SwiftShader, 1280x720; frameMs is rAF-quantised under software GL, so read it coarsely):

| scene | programs | calls | frameMs | settleMs |
|---|---|---|---|---|
| pad-gravel | 9 | 17 | 33.3 | 768 |
| pad-snow | 11 | 20 | 333.3 | 1575 |
| track-summer | 9 | 56 | 266.6 | 981 |
| track-winter | 9 | 55 | 133.3 | 923 |

  Load settle median 1342.9 ms (3 loads).
- Feel baseline: test/feel-baseline.json.
  - Stage times (s): t1 261.17, t2 231.97, t3 215.93 (t1 is a little over the brief's rough 100-250 s guess; recorded as measured).
  - Verge: grassTop 83.87 km/h, gravelTop 183.96 km/h, grassCoast 0.552 g, gravelCoast 0.133 g, offRoad (km/h after 4 s) 31.05, 30.65, 49.65, 50.72.
- Bake (Task 3, `lion-hawk bake`, registry hash 9f901504 in phys.json): GLB bytes cone 4304, hatchback-sports 23096, sedan-sports 24260, wheel-racing 5780. Vertex counts baked vs today's assets.json (weld lowers them; triangles are identical): hatchback-sports 2048 vs 3709 (wheel 288 vs 528 each, body 896 vs 1597), sedan-sports wheels 288 vs 528 each (body and spoiler welded too), wheel-racing 336 vs 528, cone 176 vs 288.

## Golden re-blessings
| Task | Cause | Feel table | Commit |
|---|---|---|---|

## Decisions

## Done-when evidence

## Contract issues
- Task 3: the bake de-duplicates part names against every node and the scene (spec 3d C3), and the single-part GLBs have a root node named like the model. Baked part names are `wheel-racing-2` and `cone-2` (phys.json `parts` and colliders' `part`, GLB node names), not `wheel-racing` and `cone`. The brief's parity test expected the old names, so test/bake.test.mjs carries a `BAKED_NAMES` map for those two models (triangle counts unchanged: 332 and 172). The view (Task 13) must look up `wheel-racing-2` / `cone-2`, or a source rename must be asked of the engine.

## Integrator requests

## Removed or renamed tests

## Field note candidates
- Light rig `follow(x, z)` ignores height.
- The compiler cache keyed by `map.uuid` leaks with per-instance textures.
- A `cone` collider shape.
