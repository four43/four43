# Tractor Pickup Review 5 Plan (multiplayer playtest)

**Goal:** Fix what the parent found playing multiplayer (2026-10-10). Spec 1.12, game 1.8.0, NET_VERSION 3.

**Branch:** `feat/tractor-mp-fixes` (worktree `four43-tractor-mp-fixes`, from gh-pages 7e33324). Each work group runs in its own branch/worktree off this one and is merged back.

## Global Constraints

- Test first for sim/net logic (`npm test` in `games/tractor-pickup`, 688 at start). `test/mp.harness.mjs` drives host + guests in one process.
- main.js has no unit tests: after main.js edits run a headless Playwright smoke check (playwright-core + ~/.cache/ms-playwright chromium).
- No per-frame allocation in the step and frame loops. R-1: nothing may stall the show or the trip. R-2: no new text for the child (sprites and icons only).
- Wire changes: new fields go in `src/net/kinds.js` replicated kinds, new reliable messages in `src/net/protocol.js` with M-50 checks. Do not bump NET_VERSION or the game version in work groups (done at merge).
- Spec: add rows to section 14 of `docs/tractor-pickup-spec.md` using the group's ID range. Commits: `fix:`/`feat: Tractor Pickup - ...` with spec IDs, no Claude attribution trailer.
- `src/net/handshake.js` is vendored; do not edit.

## Work groups

### A. Animals (M-60..M-64)
- [x] **A-1 Hats match over the network** — an animal is owned by the player who picked it up; the hat is chosen deterministically from replicated data so every device shows the same hat. (M-60, M-61: the owner picks at the boop; `hat` field on each TRAIN rider.)
- [x] **A-2 More animals for more players** — the host's herd grows with the number of players so they don't fight over the same animals. (M-62, M-63: 18 + 9 route animals per extra player; a leaver's surplus is not replaced.)

### B. Remote tractors (M-65..M-69)
- [ ] **B-1 Host tractor stutters on the guest** — show remote tractors through a client-side physics body / prediction (forecast position like other objects), not raw interpolation.
- [ ] **B-2 Dirtiness replicates** — each train's dirt matches between devices.

### C. Ceremonies (M-70..M-74)
- [ ] **C-1 Ceremony lock** — only one barn show at a time; a player who arrives while another's show runs waits and gets a (non-text) message.

### D. Players UI (M-75..M-79)
- [ ] **D-1 Horn sprite + arrows** — a honk puts a small sprite over the honking tractor and shows every player small arrows (tractor color) pointing to the other players.
- [ ] **D-2 Player circles** — in a running multiplayer game, a circle per player (body color fill, trim color outline) right of the menu button.

### Merge
- [ ] Merge A–D, NET_VERSION 3, game 1.8.0, spec 1.12, full tests, smoke check, build.
