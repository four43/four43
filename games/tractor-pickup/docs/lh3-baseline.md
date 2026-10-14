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
