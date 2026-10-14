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
| 4–9 | none: both goldens stayed bit-exact through the build switch, the registry surfaces, the World's Rapier world, and ground/props/car as World entities (with the car materials below) | stage t1/t2/t3 261.171/231.971/215.929 s → identical; grassTop 83.874, gravelTop 183.959 km/h, grassCoast 0.552, gravelCoast 0.133 g → identical; offRoad 31.05/30.65/49.65/50.72 → 43.90/33.16/33.64/50.71 km/h (see Playtest items) | the Task 7–9 commit |

## Decisions
- Task 6: the load test checks the clock on every step that is still loading. The step that ends a load runs physics after the build, as any step does, so the plan's single check after the loop was one step too strict.
- Task 6: the raw-body test gives its body a ball collider. A collider-less body has no mass and never falls in Rapier 0.21.
- Tasks 7–9: the car's materials keep today's car–ground contact. The old raw colliders used Rapier's Average rule (hull 0.3 with ground 0.8 gave 0.55, cabin 0.45 gave 0.625, restitution (0.1 + 0) / 2 = 0.05). Under the engine's √f Multiply and Max rules the registry now holds car-hull friction 0.55² / 0.8 = 0.378125 and car-cabin 0.625² / 0.8 = 0.48828125, both with restitution 0.05. With the plan's 0.3 / 0.45 / 0.1, stage t2 went 231.97 → 251.34 s (+8 %), and track.mjs t2 stage left the road (|d| 6.014 m > 6). With the compensated values, both goldens and every stage time are bit-exact. phys.json was re-baked for the new registry hash.
- Task 8: cones are a 33-point convex hull (apex and a 32-point ring), because the phase 3 collider shapes have no `cone`. They appear only on the pad, which is in neither golden.
- Task 8: the "posts asleep" test allows 1e-3 m, not 1e-6. A post falls for one step of gravity (about 1e-4 m) before the World puts it back to sleep, as the old afterStep did.
- Task 9: the inertia test compares sorted principal values. Rapier sorts the principal axes when a collider sits off the centre of mass, before and after the port alike (the tensor is the same).
- `// lh-allow:` lines (the done-when test requires the waiver on the same line as the code): src/vehicle.js:90 (massProps, D3: the cars.js mass and inertia) and src/vehicle.js:197 (the wheel raycast, L-1).

## Done-when evidence

## Contract issues
- Task 3: the bake de-duplicates part names against every node and the scene (spec 3d C3), and the single-part GLBs have a root node named like the model. Baked part names are `wheel-racing-2` and `cone-2` (phys.json `parts` and colliders' `part`, GLB node names), not `wheel-racing` and `cone`. The brief's parity test expected the old names, so test/bake.test.mjs carries a `BAKED_NAMES` map for those two models (triangle counts unchanged: 332 and 172). The view (Task 13) must look up `wheel-racing-2` / `cone-2`, or a source rename must be asked of the engine.

## Integrator requests

## Removed or renamed tests

## Playtest items
- Off-road feel sample (feel.mjs offRoad, half throttle into rough grass for 4 s): 31.05/30.65/49.65/50.72 → 43.90/33.16/33.64/50.71 km/h, outside the ±3 % / ±1 km/h tolerance. The sample is chaotic: the car hops on rough terrain and its body strikes the ground. On the pre-port code, raising the heightfield friction from 0.8 to 0.8001 moves the same spots to 31.51/10.85/19.25/49.88. The remaining difference is f32 rounding in √f·√f against the old average, on hull–terrain strikes. Stage times and top speeds and coast decelerations on the flat are unchanged. Playtest: drive off the road into rough grass and confirm the car still bogs down and bounces as before.

## Field note candidates
- Light rig `follow(x, z)` ignores height.
- The compiler cache keyed by `map.uuid` leaks with per-instance textures.
- A `cone` collider shape.
