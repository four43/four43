# Tractor Pickup Review 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the review-3 changes (spec 1.10): point-to-go steering, a faster and tidier barn show, quieter gravel, a real horn, full-screen PWA and phone portrait, no trail stutters, a new-sticker badge.

**Architecture:** A new pure module `src/sim/pilot.js` turns the stick vector (screen space) plus the camera and tractor headings into the existing `{ thr, steer }` drive input plus a `turn` help value, so physics, multiplayer and the sandbox keep their interfaces. Show, sound, HUD, layout and progress changes are local edits to their own modules.

**Tech Stack:** three.js, Rapier (`@dimforge/rapier3d-compat`), plain ES modules, `node --test`, esbuild via `build.py`, Playwright for screenshots.

**Spec:** `games/tractor-pickup/docs/tractor-pickup-spec.md` version 1.10 (sections 1.2.10, 3.4, 7.2, 7.3, 8.1, 8.2, 9, 11).

## Global Constraints

- Every value used for drive feel is in an exported, mutable object and in the `?tune` panel.
- No per-frame allocation in the step and frame loops (existing rule in `main.js`).
- R-1: no change may stall the show or the trip; R-2: no new text for the child.
- Commits: conventional style `feat: Tractor Pickup - ...` with spec IDs; no Claude attribution trailer (user CLAUDE.md).
- Game version 1.6.0 (`package.json`); tests: `npm test` in `games/tractor-pickup`.

---

### Task 1: Pilot (C-1, C-2, C-8, C-9, C-11)

**Files:**
- Create: `src/sim/pilot.js`
- Test: `test/pilot.test.mjs`

**Interfaces:**
- Produces: `PILOT` (tunable constants), `createPilot()` → `{ update(stick, camYaw, tractorYaw, speed) → { thr, steer, turn, onTarget }, reset() }`. `stick` is `{ x, y }`, x right, y up (screen), length 0..1. Yaw convention as `tractor.yaw` (atan2(f.x, f.z)); positive steer turns left (yaw grows); screen right is `camYaw - π/2`.

Behavior:
- `|stick| == 0` → unlock, `{0,0,0,true}`.
- stick angle `a = atan2(x, y)` (0 up, + right). Lock when unlocked or `|wrap(a - lockA)| > PILOT.relock` (25°): `lockA = a`, `frame = camYaw`.
- Reverse when `|a| > π - PILOT.revCone` (35°): rear heading `yaw + π` steers to `frame - a`: `err = wrap(frame - a - (yaw + π))`, `steer = clamp(-err * PILOT.gain)`, `thr = -|stick|`, `turn = 0`.
- Forward: `err = wrap(frame - a - yaw)`; `steer = clamp(err * PILOT.gain)`; `thr = |stick| * speedK(|err|)`; speedK = 1 below `PILOT.fullErr` (30°), linear to `PILOT.crawl` (0.2) at `PILOT.crawlErr` (90°), crawl beyond. `turn = |err| > fullErr && speed < PILOT.helpSpeed ? sign(err) : 0`. `onTarget = |err| < fullErr`.

- [ ] Step 1: failing tests: up → thr 1 steer ≈0; right with camYaw 0 → steer < 0 (right), thr = crawl; after tractor yaw reaches `-π/2` with camYaw now `-π/2` (camera followed) and stick still right → err ≈ 0 (lock holds, no circling); stick moves 30° → relock to new camYaw; straight down → thr < 0; down-left 20° off → steer sign moves the rear to the screen left; behind-left 60° off down → forward turn-around (thr > 0); release → reset.
- [ ] Step 2: run `node --test test/pilot.test.mjs` → fails (module missing).
- [ ] Step 3: implement `pilot.js`.
- [ ] Step 4: tests pass.
- [ ] Step 5: commit.

### Task 2: Tractor turn help (C-10) and drive wiring

**Files:**
- Modify: `src/sim/tractor.js` (`TP.turnHelp`, `setInput(thr, steer, turn = 0)`, yaw torque in `step`)
- Modify: `src/sim/game.js` (pass `drive.turn`; aim assist only when `drive.onTarget !== false`)
- Modify: `src/ui/input.js` (`read()` returns `{ x, y, horn }` stick vector; circular clamp; keys as directions; pad; no C-2 curve)
- Modify: `src/render/camera.js` (`get yaw()`)
- Modify: `src/main.js` (pilot per step: `stepIn` from `pilot.update(inp, chase.yaw, t.yaw, t.speed)`; tune rows for PILOT and `TP.turnHelp`)
- Modify: `src/sim/sandbox.js` if it reads `input.steer` (keeps working: it gets `stepIn`)
- Test: `test/tractor.test.mjs` (turn help turns a stopped tractor), `test/input.test.mjs` (read returns vector; keys), `test/pilot.test.mjs` (closed-loop with a real tractor: hold right → heading settles about 90° right and stays; stick down from a wall → backs off)

- [ ] Step 1: failing tests (turn help at standstill gives > 45° in 1.5 s; closed loop settles within 15° of target and stays for 4 s; input vector).
- [ ] Step 2: run, see failures.
- [ ] Step 3: implement.
- [ ] Step 4: `npm test` all pass.
- [ ] Step 5: commit.

### Task 3: Show (F-6, F-7, F-8, F-12, F-14, F-15)

**Files:**
- Modify: `src/ui/show.js` (hop 0.5 s, step wait 350 ms, `HOP_GAP` 150, tally hop 0.45 s; `onHop(rider)` option; label font scaled from px per metre)
- Modify: `src/ui/hud.js` (`markOut(n)` adds class `out`), `template.html` (`.slot.out` check mark; `.big .t:not(.lit){visibility:hidden}`)
- Modify: `src/main.js` (pass `onHop: r => hud.markOut(slotIndex(r.slot) + 1)`)
- Test: `test/show.test.mjs` (onHop called once per rider; hidden terms get no text until lit if testable via fake DOM)

- [ ] Step 1: failing test for `onHop` and timings constants.
- [ ] Step 2–4: implement, pass.
- [ ] Step 5: Playwright screenshots of a 7-animal, 3-group show at 1180×820, 1366×1024 and 390×844 (portrait): no overlapping labels.
- [ ] Step 6: commit.

### Task 4: Sound (S-2, S-7)

**Files:** Modify `src/audio/sound.js`: crunch gain `s * (grass ? 0.025 : 0.0625)`, spray 0.05; new `horn(v)` = two sawtooth+square notes through a lowpass and a bandpass formant (HONK 0.3 s at 370→340 Hz, honk 0.25 s at 330→300 Hz), peak gain 0.45·v, with a short attack.
- [ ] Step 1: by ear in the browser (no unit test possible for timbre); `npm test` still passes.
- [ ] Step 2: commit.

### Task 5: Screen fit and portrait (X-11, X-12, U-1)

**Files:**
- Modify: `template.html` (Pig Pens `fitHeight` script; portrait media query: smaller `#horn`, `#drivebtns`, slots `width: min(62px, (100vw - 60px) / 12.5)`)
- Modify: `pwa/manifest.webmanifest` (drop `orientation`)
- Modify: `src/render/scene.js` (size from `canvas.clientWidth/Height`; fov 64 when aspect < 0.9, else 60)
- Modify: `src/render/camera.js` (portrait: `CAM.D` × 1.25 via `camera.aspect`)
- Modify: `src/main.js`, `src/ui/show.js` (screen positions from canvas size instead of `innerWidth/innerHeight`)
- [ ] Step 1: screenshots at 390×844, 430×932, 1180×820; check slot bar fits, buttons do not overlap.
- [ ] Step 2: `npm test`; commit.

### Task 6: Stutters far from the farm (X-4)

- [ ] Step 1: drive out on a route with `?fps&tune`, record a Chrome performance trace (Playwright CDP `Tracing`), find the long frames' cause.
- [ ] Step 2: write a test that pins the cause where possible (for example: no work grows with distance from the yard).
- [ ] Step 3: fix the root cause; re-trace: no frame > 50 ms over 20 s on the trail.
- [ ] Step 4: commit.

### Task 7: New-sticker badge (F-3, W-2)

**Files:**
- Modify: `src/sim/progress.js` (`bookSeen` in progress: highest show number seen in the book; `newStickers(p)`; `clampProgress` keeps it, default = highest sticker show so an old save has no badge)
- Modify: `src/ui/menus.js` (`showBook` sets `progress.bookSeen` and calls `onStickers` + `onBookSeen`; badge `count` only when `newStickers > 0` on reward card and start screen; `fresh` bounce on all new ones)
- Modify: `src/main.js` (badge on drive `stickerbtn`, refreshed after reward and after the book)
- Test: `test/progress.test.mjs`
- [ ] Step 1: failing tests: newStickers after completeShow is 1, after markSeen 0; clamp keeps bookSeen; old save gets highest show.
- [ ] Step 2–4: implement, pass.
- [ ] Step 5: commit.

### Task 8: Release

- [ ] Version 1.6.0 in `package.json`; spec section 13 test counts; `npm run build`; commit the build output to `site/exp/tractor-pickup/`.
- [ ] Ask the user before pushing or deploying.
