# Tractor Pickup Review 4 Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the review-4 findings (5-reviewer code review of 1.6.0, 2026-10-07) and add the parent's new features: singing riders, tap-to-hear slots, bedtime mode, golden-animal rainbow flight. Spec 1.11, game 1.7.0.

**Branch:** `feat/tractor-review-4` (worktree `four43-tractor-review-4`, from `feat/tractor-review-3` 77159f9 = origin/gh-pages).

## Global Constraints

- Test first for sim/logic changes (`npm test` in `games/tractor-pickup`); Playwright screenshot for UI changes.
- No per-frame allocation in the step and frame loops. Feel values stay in the `?tune` tables.
- R-1: nothing may stall the show or the trip. R-2: no new text for the child.
- Commits: `fix:`/`feat:`/`docs: Tractor Pickup - ...` with spec IDs, no Claude attribution trailer.
- `src/net/handshake.js` is vendored: change it in the `four43/handshake` repo, then copy it again.

---

## A. Bugs a child can hit

- [x] **A-1 Horn during a dodge hop leaves the animal floating** — `src/sim/herd.js:86` `horn()` and `:91` `callHelp()` skip `state === 'dodge'`. Test: dodge, honk mid-hop → hop completes, `y` returns to 0.
- [x] **A-2 Intro "drive" cue releases the tractor under paint/book** — `src/main.js:205`: only set `drive` from `reward`/`drive`, never from `menu`. Test or scripted check: open book at t<3 s → still held after the cue; closing resumes.
- [x] **A-3 Show: a child's tap no longer skips** — `src/ui/show.js:33-34`: a tap makes the counted animal hop and squeak; speed-up and the skip button need a 1 s hold with a filling ring (same look as the gear hold).
- [x] **A-4 Whole screen drives** — `src/ui/input.js:28`: remove the right-third dead zone (buttons already stop their own events). Update C-3 text.
- [x] **A-5 "Clear stickers" undone by an open screen** — `src/main.js:145`: clear in place (`progress.stickers.length = 0`) so open screens share the change. Test: clear, then a book drag save → stickers stay empty.
- [x] **A-6 Two gamepads fire the horn every frame** — `src/ui/input.js:52`: horn held state per `pad.index`.
- [x] **A-7 Gamepad before first touch never starts the trip** — `src/main.js:127-129, 201`: first non-zero gamepad input (or button) calls `play()`.
- [x] **A-8 Delayed chick launch jumps** — `src/sim/game.js:135`: take the launch `start` point when `u` first reaches 0, not at boop time.
- [x] **A-9 Animals that orbit a target forever** — `src/sim/herd.js:73,133,140`: arrive when `d < v / turnRate + 0.05`, plus a timeout for `help` and `toBarn`. Test: the 1 m side target case from the review sim.
- [x] **A-10 Stick stuck down after iOS backgrounding** — `src/ui/input.js:38-42`: release the stick on `blur` and `visibilitychange` hidden.

## B. iPad stutter

- [x] **B-1 `?fps` blames the right frame** — `src/main.js:172, 239, 382-389`: log the previous frame's sim ms, draw ms, step count and events with the gap. Add: `renderer.info.programs.length` change, speech started, steps per frame, `game.step` vs `world.step` ms, `PerformanceObserver('longtask')` where supported.
- [x] **B-2 Shader pre-compile** — after `build()`: `await renderer.compileAsync(scene, camera)` behind the load screen, with one hidden golden animal, a mud ribbon, a ramp, gibs and particles present so every program exists before play. Check: `renderer.info.programs.length` does not grow during a full trip (scripted Playwright run).
- [x] **B-3 Keep golden material** — `src/render/animals3d.js:37`: do not dispose the shared golden material on drop. One shared ramp material (`farm3d.js:142`).
- [x] **B-4 Instance uploads only when changed** — trees `farm3d.js:198-205` (dirty flag, no per-frame `computeBoundingSphere`), gibs `gibs.js:178` (only while alive), particles `fx.js:120` (`addUpdateRange` over live slots); `DynamicDrawUsage` on all three.
- [x] **B-5 Cap catch-up steps** — `src/main.js:172`: at most 3 steps per frame, drop the rest.
- [x] **B-6 Fewer allocations per step** (done: events array, separation list, trail points, wheel check; `herd.free()` left as is: it is called while iterating its own result) — cache `herd.free()` once per step (`game.js:75,84,93,140`), reuse the events array (`main.js:180`), plain loops in `herd.js:364-369`, `main.js:253`, `vehicles3d.js:321`, `animals3d.js:252`.
- [x] **B-7 HUD arrow without layout** — `src/ui/hud.js:152`: `transform` only, skip unchanged writes.
- [x] **B-8 Decode voice clips at unlock**, not on first `say` (`src/audio/voice.js:162`).

## C. Multiplayer (upstream in `four43/handshake`, then copy)

- [x] **C-1 Reconnect a dropped peer** — host rebuilds the Peer on `peer_back` or a `restart` signal with no Peer; guest asks for a restart when its Peer closes while the room is open; a channel closing before open counts as a failure (`handshake.js:393, 447-451, 505-510, 563`).
- [x] **C-2 No TURN, no silent wait** — `handshake.js:152-157, 469`: relay required + no ICE servers → retry `/turn`, then fail with an error code the panel shows.
- [x] **C-3 Host relay budget** — `host.js:67,72`: keep the newest train record per guest, forward on the host send timer, unreliable, plus a keyframe every 2 s; low separate rate limit for guest reliable binary; skip sends over a `bufferedAmount` cap in `Peer.send`.
- [x] **C-4 Guest position speed cap** — `host.js:36-50`: reject a guest position that moved faster than the tractor can; fix the "last real tractor position" comment.
- [x] **C-5 Server error matching** — `handshake.js:236`: match errors to requests by type or id, so a late `peer_unavailable` cannot fail a `resume`.
- [x] **C-6 (server) global failed-join limit** (handshake branch `fix/peer-reconnect`; needs a server redeploy, and `app_failed_joins_per_min` raised or removed in the production config) — `handshake/src/lib.rs:774`: per-IP instead of global, so a few IPs cannot lock out every join.

## D. Should fix / tidy

- [x] **D-1 Pause audio when hidden** — `src/main.js:61`: suspend the AudioContext and stop the music timer on hide; resume on the next gesture. Re-add unlock listeners on `statechange` to `interrupted` (Siri/alarm with no page hide).
- [x] **D-2 Swipe-back guard** — `history.pushState` + re-push on `popstate`; stick does not start within 24 px of the left edge.
- [x] **D-3 No silent catches** — `handshake.js:134,265,270,543,549`, `sound.js:20`, `main.js:105`: use `createWarnOnce` / `console.warn`.
- [x] **D-4 Real-timer tests** — `test/voice.test.mjs`, `test/session.test.mjs`: fake clock or awaited promises.
- [x] **D-5 Split `main.js`** — `?tune` panel and `?fps` meter → `src/ui/debug.js`; event-to-FX/sound switch → `src/ui/events.js`.
- [x] **D-6 Console noise** — `main.js:78,80` behind `?fps`/`?tune`.
- [x] **D-7 Burst magic numbers** — `main.js:184` → a `BURST` table next to `ROADSIDE` in `scenery.js`.
- [x] **D-8 build.py warns** when voice/animal clips exist and ffmpeg is missing.

## E. New features

- [x] **E-1 Riders sing on the horn** — after HONK-honk, each animal in the trailer and wagon plays its sound in slot order, ~0.12 s apart, with a small hop. Uses the recorded animal clip when present, else the synth (`sound.animal`). Files: `main.js` horn event, `sound.js`, `render/animals3d.js`.
- [x] **E-2 Recorded animal sounds** — `audio/animals/<type>.mp3` (pig cow chicken sheep duck bunny dog chick), trimmed/normalised and embedded by `build.py` like voice clips, synth fallback per missing file. Parent records them (with the voice words, see F-1).
- [x] **E-3 Tap a slot to hear it** — `src/ui/hud.js` slot bar: tap plays that animal's sound, says its name, the icon wiggles. Does not start the stick.
- [x] **E-4 Volume = device volume** — no in-game volume setting (R-8 answered by the device buttons). Spec note only.
- [x] **E-5 Bedtime mode** — parent menu: Bedtime buttons Now / 3 min / 5 min / 10 min (tap again to cancel). When time is up (Now = at once), the current trip goes on (R-1); the barn path shows as usual for one last drive. After that show the animals yawn, the sky turns to sunset then night, the music slows to a lullaby, the voice says "The animals are sleepy. Goodnight!" A full-screen "Wake Up!" button (a big sun icon plus the words, so it works for a pre-reader) must be held 5 s with a filling ring to play again; the timer then restarts. Survives reload (stored end time). Files: `main.js`, `ui/menus.js`, `render/scene.js` (light), `audio/sound.js` (tempo), `sim/progress.js` (`clampSettings`), voice words `sleepy`, `goodnight`.
- [x] **E-7 Parent menu cleanup** — restyle the parent menu (`ui/menus.js`, `template.html`) to the game's button style: big rounded buttons, the same red X, toggles as on/off buttons, bedtime as a button row. Playwright screenshots at iPad and phone sizes.
- [x] **E-6 Golden animal rainbows** — on the farm: a rainbow arc/trail around the golden animal (more than today's sparkle). In the show: after it is counted, it flies a loop around the screen trailing a rainbow ribbon, then lands on the counted pile. This step may take longer than a normal hop (R-1: still races `cut.p`). Golden landing on the farm also gets its own fanfare (A-8 "large celebration"). Files: `render/fx.js`, `render/animals3d.js`, `ui/show.js`, `audio/sound.js`.

## F. Recording and docs

- [x] **F-1 Recording kit** (script.md here; the slicer `tools/slice-voice.py` and the clips are from another session, not yet committed) — `audio/voice/script.md`: one reading script for all voice words (grouped so joined words are read together) plus the 8 animal sounds and the new `sleepy`/`goodnight` words. A slicer script cuts one take on silence and labels clips by transcription (faster-whisper in a scratch venv — needs the parent's OK to install), writes a report of missing or doubtful clips, and stitches preview sentences.
- [x] **F-2 Spec 1.11** — change section 1.2.11; items for A-3, A-4, D-1, D-2, E-1..E-6; section 12 adds `audio/animals/` and the new words; fix section 13 (`slowmo.test.mjs`, B-7 row), order of sections 1.2.6-1.2.9, duplicate W-2, U-6 before U-7.
- [ ] **F-3 Version 1.7.0**, build, full test run, Playwright pass (desktop, iPad and phone sizes), commit; deploy only with the parent's OK.
