# Phase 3l baselines (before the migration)

Engine: lion-hawk 0.8.0 (ENGINE_VERSION printed 0.8.0).

## R3 today
Source (read-only shipped 1.8 page, nothing built): `site/exp/tractor-pickup/index.html` in the worktree.
- size: 6583056 bytes
- gzip -9: 2369761 bytes

## Feel samples (pre-swap, `node test/helpers/feel.mjs`)
`{"course":{"seconds":45.28333333333333,"boops":2},"bump":{"bumps":[3,3],"separation":4.9384727480093575}}`
Stored in `test/feel-baseline.json`. Helper needed no API adaptation.

## Unit suite on engine 0.8.0 (`UNIT test/`)
tests 783, pass 783, fail 0, skipped 0, cancelled 0.

## iPad gesture e2e (`BROWSER test/e2e.browser.mjs`, unchanged game, engine 0.8.0)
tests 14, pass 14, fail 0, skipped 0.

## R3 after Task 4 (`lion-hawk build --out <scratch>`, still carrying src/assets.json)
- html 6569.6 KB (gzip 2370.5 KB), assets 875.5 KB (gzip 226.7 KB), total 7627.0 KB (gzip 2772.2 KB).
- e2e on the CLI build: 13/14 in the full run under load (load average 13; the iPad 1 s-hold gesture test saw a tap as a hurry), 2/2 on a re-run of the iPad tests alone. Recorded as a load-sensitive SwiftShader timing test, not a build difference.
