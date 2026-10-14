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

## Golden re-blessings
| Task | Cause | Feel table | Commit |
|---|---|---|---|

## Decisions

## Done-when evidence

## Contract issues

## Integrator requests

## Removed or renamed tests

## Field note candidates
- Light rig `follow(x, z)` ignores height.
- The compiler cache keyed by `map.uuid` leaks with per-instance textures.
- A `cone` collider shape.
