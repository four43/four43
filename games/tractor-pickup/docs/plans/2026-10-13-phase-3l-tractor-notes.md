# Phase 3l Tractor Pickup: notes

Plan: lion-hawk-engine `docs/plans/2026-10-13-phase-3l-tractor.md`. Branch `feat/lion-hawk-3-tractor` (base e6b384e).

## Outcome

(in progress)

## What landed

## Decisions

- R1 Notes live here (ruling P7), not in the engine repo.
- R2 "R3 today" is measured from the read-only committed 1.8 page `site/exp/tractor-pickup/index.html`; `build.py` is never run in a four43 checkout (addendum).
- R4 `world.R.JointData.spherical` in `src/sim/hitch.js` stays until the engine offers a descriptor form (Integrator request 1).
- R6 `test:peers` script lands with `test/net.peers.browser.mjs` (Task 26, ruling P6).
- R7 3a-R6: the iPad gesture e2e is run once on engine 0.8.0 in Task 1 (result below).

## Done-when evidence

## Re-bless 1 (World)

## R1 / R3 numbers

## lh-allow lines

## Playtest list

## Contract issues

## Integrator requests

1. **`world.joint` without `JointData` (blocking at merge, not now).** `games/test/phase3-done.test.mjs` bans the `JointData` identifier in game code, but lion-hawk 0.8.0 `world.joint(a, b, data)` only takes raw Rapier joint data, so the trailer hitch writes `world.R.JointData.spherical(frontAnchor, TR.tongue)`. Wanted: `world.joint(a, b, { type: 'spherical', a: [x, y, z], b: [x, y, z] })` (the engine builds the JointData), or the done test waives `world.joint` lines.
2. **`games/package-lock.json`** after `games/tractor-pickup/package.json` changes (plan request 1).
3. **`games/test/**`** references to `build.py`, `src/assets.json`, `TP_MP` or the old mp world (plan request 2), if any.

## Removed or renamed tests

## Field note candidates
