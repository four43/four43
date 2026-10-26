# Tractor Pickup Multiplayer Phase 1.5 (Replicated Objects) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phase 1 vehicle/herd messages and the claim/answer protocol with one generic replication layer: kinds of replicated objects (animal, tree, player, train), keyframes and diffs, the claim answer as replicated state, and repair after lost messages (spec 1.9, M-13, M-14, M-22..M-27, M-50, M-53, M-56..M-58).

**Architecture:** `src/net/replica.js` is generic: field packers, a kind registry, binary frames (keyframe or diff), a sender-side change tracker and a receiver-side store that keeps the newest record per object (M-26). `src/net/kinds.js` declares the four kinds and reads animal and tree records from the game; game objects stay plain objects. `host.js` and `guest.js` send their objects as frames and apply received records; JSON stays only for events (claim, release, delivered, tree, regrow, horn, help, paint, hello, welcome). A guest lands a flight when the replicated animal shows it as the owner with a newer ownership number; each host keyframe lets the guest repair (M-56), and the host frees animals a guest owns but does not have (M-57).

**Tech Stack:** Plain ES modules, `node:test`, DataView binary frames, the existing in-memory hub (`src/net/link.js`) and interpolation buffer (`src/net/interp.js`), vendored `handshake.js` (unchanged), Docker image `handshake:phase1` for the browser check, Playwright for the two-window check.

**Spec:** `games/tractor-pickup/docs/tractor-pickup-spec.md` — 1.2.9, 14.1 terms, section 14 (binding: M-13, M-14, M-22..M-27, M-50, M-53, M-56..M-58). Phase 2 items M-37 and M-38 are **out of scope**. Phase 1 plan for context: `games/tractor-pickup/docs/multiplayer-plan.md`; its ledger of races that this plan removes: `.superpowers/sdd/multiplayer-plan/progress.md` (repo root).

## Global Constraints

- Work in the worktree `/home/smiller/projects/four43/four43-tractor-multiplayer` on branch `feat/tractor-multiplayer`. All paths below are relative to `games/tractor-pickup/` unless they start with `/`.
- Tests: `npm test` (runs `node --test test/`). The baseline is **602 tests, all passing**. Every task ends with the full suite passing; each task states the expected count.
- Commits: conventional commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`). **No `Co-Authored-By` trailer and no Claude attribution of any kind** (user rule).
- Single-player behavior must not change: no file outside `src/net/`, `src/sim/trees.js` (one new function) and the tests changes behavior; `src/main.js`, `src/net/session.js`, the render code and `src/net/handshake.js` are not edited (handshake.js is vendored: never edit it).
- Sim and net modules (`src/sim/`, `src/net/`) import no three.js and touch no DOM (exceptions as in phase 1: vendored `handshake.js`, `session.js` reading `location`).
- Code style: dense lines, terse comments that cite spec IDs (`// M-14: ...`), `const` arrow helpers, **no classes** in game code, names as in the existing files.
- `NET_VERSION = 2` (M-27): the wire changes, so a 1.4.0 build cannot join a 1.5.0 room (Handshake refuses it).
- Rates (M-23, M-25, M-50): host world diffs every 66 ms (~15/s), train diffs every 50 ms (~20/s), a keyframe every 2000 ms; interpolation 100..300 ms (unchanged `interp.js`); at most 60 messages/s per channel per guest on the host; on a guest at most 60 reliable and 120 fast messages/s from the host; claim range 8 m, tree range 12 m; claim hold 1 s (M-14, `CLAIM_WAIT`).
- Size limits (M-50): a binary frame is at most 16384 bytes; a JSON message at most 2048 characters (`JSON.stringify` length) in both directions.
- Keep unchanged: `interp.js`, the link layer and the in-memory hub (one new `drop` hook only), all validation and rate limits, `session.js` and the panel, render code, the silence watchdog (`SILENT_MS`), guest go-alone (M-41), host close.

## Decisions this plan makes (the spec leaves them open)

1. **One cut-over, not kind by kind (Task 3).** The four kinds are coupled: a claim's answer is the animal's owner (animal kind), a carried animal is drawn from its owner's train riders (train kind), and M-57 needs both. Running old herd/vehicle messages and new frames side by side would give owner and ownership number two sources of truth — the race class this phase removes — through bridge code that a later task deletes. So Tasks 1–2 add the new pieces with their own tests while the old path runs, Task 3 switches host and guest in one well-tested step (the existing two-to-four-game tests are the acceptance), and Task 6 deletes the old codec.
2. **A diff repeats a change (REPEAT = 3).** "Changed since the last diff" is read as "changed or removed in one of the last 3 diffs", so one lost diff never hides a change until the next keyframe (M-23 "a lost diff is not a problem"). Diffs go out at their rate even when empty: they are the heartbeat of the silence watchdog (M-40) and keep the interpolation clock running.
3. **Ordering is per object (M-26).** The store keeps, per object, the sender time of its newest record; older records are ignored, and an animal record with a lower ownership number is ignored. Frames are not dropped whole, because a keyframe on the reliable channel can arrive after newer diffs.
4. **The welcome keeps `next`** (the host's herd size) besides seed, version and player number: the guest's id guard (`ID_ROOM`, M-44/M-50) needs it, because `herd.ensure()` fills every id up to the one asked for.
5. **The animal kind also has `home`** (route or yard). After going alone (M-41) the guest's respawn counts route and yard animals; without `home` every animal the guest learned from the host counts as a route animal. Task 8 adds "home" to M-22's field list.
6. **A carried animal's record holds no position**: its owner's train riders place it (M-22). An animal the host holds itself (`fly`, `ride`, `show`) is sent as `carried` with owner 1.
7. **Train riders include flights that still wait for the host.** The host must see them (M-57 would otherwise free an animal it has just granted); the other devices draw a rider only when the animal's replicated owner is that player.
8. **Tree break and regrow stay JSON events from the host too** (a one-time burst or regrow at once, M-17); the replicated tree state is the agreement (M-56). A tree this guest broke itself is not grown back by a host record for `TREE_GRACE` = 1000 ms, because that keyframe can be older than the host's handling of the break; the next keyframe settles it (within M-58's 3 s).
9. **"The claim stays open until a keyframe settles it" (M-14):** an open claim ends at the first host keyframe after its flight is over (landed, poofed or timed out). A keyframe never poofs a flight that is still in its hold. A poof for "other owner" needs a record with a newer ownership number than at the boop.
10. **M-57 counts only while the guest talks:** the 3 s count runs only while that guest's frames come in (within 500 ms), so an away guest (M-39, 30 s grace) keeps its animals.
11. **M-56 release is resent at every keyframe** while a record says "owned by me" and the guest does not hold the animal (the host's release handler ignores a repeat), in messages of at most 16 ids.
12. **Streams:** the host sends its world (animal, tree, player) diffs at 15/s and its own train diffs at 20/s, and one keyframe with all its kinds every 2 s; a guest sends its train the same way. A guest sends its keyframe at once when a new player appears in the roster, so a new guest sees a parked train at once (M-23 "at once to a new guest"); the host sends its keyframe at once after each welcome.
13. **Quantization:** positions in 1/64 m steps over ±400 m (x, z) and 1/256 m over ±50 m (y), yaws in 1/65536 turns, rotations as int16 quaternions. The encoder clamps numbers into range (never throws for a position, M-44); it throws only for a programming error (a value not in its list, too many records).
14. **JSON from the host is capped at 2048** (was 131072 for the welcome with the herd); the host's `players` and `claimed` messages are removed. Guest messages are unchanged.
15. **While a new farm's welcome waits for the guest's show (M-19)**, host animal and tree records and `tree`, `regrow`, `help` events are not applied to the old farm; the newest host keyframe is kept and applied right after the welcome (closes a phase 1 ledger residual).

---

## File Structure

New files:

| File | Responsibility |
|---|---|
| `src/net/replica.js` | Generic replication: field packers (`F`), `kind()`, `createRegistry()`, `encodeRecord`, `encodeFrame`, `decodeFrame`, `isFrame`, `createTracker` (sender: what changed), `createStore` (receiver: newest record per object, keyframe removal). Knows nothing about the game. |
| `src/net/kinds.js` | The four kinds (ANIMAL, TREE, PLAYER, TRAIN), `REGISTRY`, `KINDS`, `LIMIT`, `TYPE_LIST`/`ANIMS`/`MODES`, and the host-side record readers `animalRecord`, `animalRecords`, `treeRecords`, `playerRecords`. |
| `test/replica.test.mjs` | Round trips per kind, diff contents, keyframe, store ordering, bad data refused, size limits (M-53). |
| `test/mp.repair.test.mjs` | M-57 host repair and the loss tests: claims, answers, trees and everything dropped during a connection change; all devices agree within 3 s (M-53, M-56..M-58). |

Modified files:

| File | Change |
|---|---|
| `src/net/players.js` | `SEND` becomes `{ train, world, key }`; `push(n, time, rec, arrival)`; riders instead of carried in the record; `trainRecord(game)` replaces `vehicleOf`. |
| `src/net/protocol.js` | `NET_VERSION = 2`; host messages: `welcome` (v, seed, you, next), `tree`, `regrow`, `horn`, `help`. |
| `src/net/host.js` | Rewritten on frames (Task 3), M-57 repair (Task 4). |
| `src/net/guest.js` | Rewritten on frames and the store; claims settle from the replicated owner; M-56 repair. |
| `src/net/link.js` | `hub.drop` test hook (Task 2); a comment (Task 6). |
| `src/sim/trees.js` | `regrowById(id)` (Task 2). |
| `test/mp.harness.mjs` | Frame helpers (Task 3), `disagreements`/`settle` (Task 4), `blackout` (Task 5). |
| `test/mp.test.mjs`, `test/protocol.test.mjs` | Tests that asserted removed messages are rewritten to assert the same behavior through replicated state (Task 3; list in Task 3 Step 1). |
| `test/trees.test.mjs`, `test/link.test.mjs` | One test each (Task 2). |
| `docs/tractor-pickup-spec.md`, `package.json`, `package-lock.json` | Section 13 results, M-22 "home", version 1.5.0 (Task 8). |

Deleted: `src/net/codec.js`, `test/codec.test.mjs` (Task 6).

---

### Task 0: Baseline

**Files:** none.

**Interfaces:**
- Consumes: nothing.
- Produces: the recorded baseline count (602).

- [ ] **Step 1: Check the branch and the suite**

```bash
cd /home/smiller/projects/four43/four43-tractor-multiplayer && git status --short && git log --oneline -1
cd games/tractor-pickup && npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```
Expected: clean tree on `feat/tractor-multiplayer`; `ℹ tests 602`, `ℹ pass 602`, `ℹ fail 0`. If the count differs, record the real number and add the same deltas below to it.

---

### Task 1: The replication layer and the four kinds (M-22, M-23, M-26, M-50, M-53)

**Files:**
- Create: `src/net/replica.js`
- Create: `src/net/kinds.js`
- Test: `test/replica.test.mjs`

**Interfaces:**
- Consumes: `PAINT_NAMES`, `MAX_PLAYERS` from `src/net/protocol.js`; `TYPES` from `src/sim/herd.js` (both exist).
- Produces (used by Tasks 3–6):
  - `replica.js`: `FRAME = { KEY: 0x10, DIFF: 0x11 }`, `MAX_FRAME = 16384`, `NONE = 0xffff`, `REPEAT = 3`; `F.bool()`, `F.uint(bytes, max?)`, `F.id()`, `F.oneOf(list)`, `F.fixed(lo, hi, step)`, `F.angle()`, `F.quat()`, `F.obj(fields)`, `F.list(of, max, min = 0)`; `kind({ name, code, authority: 'host' | 'owner', max, idMin = 0, idMax, fields, newer? })`; `createRegistry(kinds) -> { list, byName, byCode }`; `encodeRecord(kind, id, rec) -> Uint8Array`; `encodeFrame({ key, sender, time, groups: [{ kind, records: [[id, rec]], removed?: [id] }] }) -> ArrayBuffer`; `isFrame(buf) -> boolean`; `decodeFrame(buf, registry) -> { key, sender, time, groups: Map(name -> { records: Map(id -> rec), removed: [id] }) } | null`; `createTracker(kinds) -> { diff(objs) -> groups, key(objs) -> groups, reset() }` where `objs = { [kindName]: [[id, rec], ...] }`; `createStore(kinds) -> { get(kindName, id) -> rec | null, all(kindName) -> Map(id -> rec), apply(frame) -> [{ kind, id, rec | null }], clear() }`.
  - `kinds.js`: `ANIMAL`, `TREE`, `PLAYER`, `TRAIN`, `KINDS` (in that order), `REGISTRY`, `LIMIT = { coord: 400, height: 50, animals: 256, trees: 1024, riders: 16 }`, `TYPE_LIST`, `ANIMS`, `MODES`; `animalRecord(a) -> rec | null`, `animalRecords(herd) -> [[id, rec]]`, `treeRecords(trees) -> [[id, { state }]]`, `playerRecords(roster) -> [[n, { body, trim, away }]]`.
  - Record shapes: animal `{ type, golden, hidden, home: 'route'|'yard', state: 'free'|'busy'|'carried', owner: 0..4, epoch, x, y, z, yaw, anim, leader: id|null, line }`; tree `{ state: 'standing'|'broken'|'growing' }`; player (id = player number) `{ body, trim, away }`; train (id = player number) `{ mode: 'drive'|'show'|'held', full, bodies: [{ p: {x,y,z}, q: {x,y,z,w} } x 3], riders: [{ id, slot: 0..11, flying, x, y, z, yaw }] }`.

- [ ] **Step 1: Write the failing tests**

Create `test/replica.test.mjs`:

```js
// test/replica.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { F, kind, createRegistry, encodeFrame, decodeFrame, encodeRecord, createTracker, createStore, isFrame, FRAME, MAX_FRAME, REPEAT } from '../src/net/replica.js';
import { ANIMAL, TREE, PLAYER, TRAIN, KINDS, REGISTRY, LIMIT, animalRecord } from '../src/net/kinds.js';

const near = (a, b, e, msg) => assert.ok(Math.abs(a - b) <= e, `${msg}: ${a} vs ${b}`);
const q = (a = 0.3) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const pig = (o = {}) => ({ type: 'pig', golden: false, hidden: false, home: 'route', state: 'free', owner: 0, epoch: 3, x: 10.5, y: 0.25, z: -7.25, yaw: 1.5, anim: 'walk', leader: null, line: 0, ...o });
const train = (n = 2) => ({ mode: 'drive', full: true, bodies: [{ p: { x: 10.5, y: 0.8, z: -3 }, q: q() }, { p: { x: 7, y: 0.5, z: -3 }, q: q(0.2) }, { p: { x: 4, y: 0.5, z: -3 }, q: q(0.1) }],
  riders: Array.from({ length: n }, (_, i) => ({ id: 30 + i, slot: i, flying: i === 1, x: 5 + i, y: 1.2, z: -2, yaw: 1.5 })) });
const frame = (groups, o = {}) => encodeFrame({ key: false, sender: 1, time: 1000, groups, ...o });
const one = (k, id, rec, o) => decodeFrame(frame([{ kind: k, records: [[id, rec]] }], o), REGISTRY);

test('an animal round-trips: every field, positions within a step, ownership number exact (M-22, M-53)', () => {
  const a = pig({ golden: true, hidden: true, home: 'yard', state: 'carried', owner: 3, epoch: 4000000000, leader: 7, line: 2, anim: 'dance' }), f = one(ANIMAL, 65000, a), r = f.groups.get('animal').records.get(65000);
  assert.deepEqual([f.key, f.sender, f.time], [false, 1, 1000]);
  for (const k of ['type', 'golden', 'hidden', 'home', 'state', 'owner', 'epoch', 'anim', 'leader', 'line']) assert.equal(r[k], a[k], k);
  near(r.x, a.x, 1 / 128, 'x'); near(r.y, a.y, 1 / 512, 'y'); near(r.z, a.z, 1 / 128, 'z'); near(r.yaw, a.yaw, 1e-4, 'yaw');
});
test('a tree, a player and a train round-trip (M-22, M-53)', () => {
  assert.deepEqual(one(TREE, 12, { state: 'broken' }).groups.get('tree').records.get(12), { state: 'broken' });
  assert.deepEqual(one(PLAYER, 3, { body: 'rainbow', trim: 'blue', away: true }).groups.get('player').records.get(3), { body: 'rainbow', trim: 'blue', away: true });
  const t = train(3), r = one(TRAIN, 2, t, { sender: 2 }).groups.get('train').records.get(2);
  assert.deepEqual([r.mode, r.full, r.riders.map(c => [c.id, c.slot, c.flying])], ['drive', true, [[30, 0, false], [31, 1, true], [32, 2, false]]]);
  t.bodies.forEach((b, i) => { for (const k of 'xyz') near(r.bodies[i].p[k], b.p[k], 1 / 128, 'p' + k); for (const k of 'xyzw') near(r.bodies[i].q[k], b.q[k], 1e-3, 'q' + k); });
  near(r.riders[2].yaw, 1.5, 1e-4, 'rider yaw');
});
test('yaws of any size and NaN positions still encode (the farm keeps playing), clamped to the farm (M-44)', () => {
  const r = one(ANIMAL, 1, pig({ yaw: 500, x: NaN, z: 9999 })).groups.get('animal').records.get(1);
  near(r.yaw, ((500 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), 1e-4, 'yaw'); assert.equal(r.x, 0); assert.equal(r.z, LIMIT.coord);
});
test('the host reads a held or carried animal as carried, without a position; a gone one is not sent (M-15, M-22)', () => {
  const a = { id: 4, type: 'cow', golden: false, hidden: false, home: 'route', state: 'ride', epoch: 2, x: 5, y: 1, z: 6, yaw: 1, anim: 'idle', leader: null, line: 0 };
  assert.deepEqual([animalRecord(a).state, animalRecord(a).owner, animalRecord(a).x], ['carried', 1, 0]);
  assert.deepEqual([animalRecord({ ...a, state: 'carried', owner: 3 }).owner, animalRecord({ ...a, state: 'toBarn' }).state, animalRecord({ ...a, state: 'flee' }).state], [3, 'busy', 'free']);
  assert.equal(animalRecord({ ...a, state: 'gone' }), null);
});
test('frames stay small: a big herd keyframe and a full train (M-53)', () => {
  const herd = Array.from({ length: 100 }, (_, i) => [i, pig()]), trees = Array.from({ length: 300 }, (_, i) => [i, { state: 'standing' }]);
  const key = encodeFrame({ key: true, sender: 1, time: 5, groups: [{ kind: ANIMAL, records: herd }, { kind: TREE, records: trees }] });
  assert.ok(key.byteLength <= 3500, `${key.byteLength} bytes`); assert.ok(key.byteLength <= MAX_FRAME);
  assert.ok(frame([{ kind: TRAIN, records: [[2, train(12)]] }], { sender: 2 }).byteLength <= 220, "about 12 bytes per rider");
  assert.throws(() => frame([{ kind: ANIMAL, records: Array.from({ length: LIMIT.animals + 1 }, (_, i) => [i, pig()]) }]), /too many/);
  assert.throws(() => frame([{ kind: TRAIN, records: [[2, train(LIMIT.riders + 1)]] }], { sender: 2 }), /bad list/);
  assert.throws(() => frame([{ kind: ANIMAL, records: [[1, pig({ type: 'dragon' })]] }]), /bad value/);
});
test('bad frames decode to null (M-50)', () => {
  const good = frame([{ kind: ANIMAL, records: [[1, pig()]] }]), bytes = () => new Uint8Array(good.slice(0));
  assert.ok(isFrame(good)); assert.equal(isFrame(new ArrayBuffer(0)), false); assert.equal(isFrame('text'), false);
  assert.equal(decodeFrame(good.slice(0, good.byteLength - 1), REGISTRY), null, 'truncated');
  const longer = new Uint8Array(good.byteLength + 1); longer.set(new Uint8Array(good)); assert.equal(decodeFrame(longer.buffer, REGISTRY), null, 'extra bytes');
  const big = new Uint8Array(MAX_FRAME + 1); big[0] = FRAME.DIFF; big[1] = 1; assert.equal(decodeFrame(big.buffer, REGISTRY), null, 'too big');
  let b = bytes(); b[1] = 5; assert.equal(decodeFrame(b.buffer, REGISTRY), null, 'player 5');
  b = bytes(); b[7] = 99; assert.equal(decodeFrame(b.buffer, REGISTRY), null, 'unknown kind');
  b = bytes(); b[12] = 200; assert.equal(decodeFrame(b.buffer, REGISTRY), null, 'type index'); // after head 7, kind 1, count 2, id 2, flags 1
  b = bytes(); b[13] = 0xf0; assert.equal(decodeFrame(b.buffer, REGISTRY), null, 'unused flag bits');
  assert.equal(decodeFrame(frame([{ kind: ANIMAL, records: [[1, pig()]] }], { sender: 2 }), REGISTRY), null, 'a guest sending animals');
  assert.equal(decodeFrame(frame([{ kind: TRAIN, records: [[3, train(1)]] }], { sender: 2 }), REGISTRY), null, 'a guest sending another train');
  b = new Uint8Array(frame([{ kind: PLAYER, records: [[1, { body: 'red', trim: 'red', away: false }]] }])); b[10] = 0; assert.equal(decodeFrame(b.buffer, REGISTRY), null, 'player 0');
  assert.equal(decodeFrame(encodeFrame({ key: true, sender: 1, time: 1, groups: [{ kind: TREE, records: [], removed: [3] }] }), REGISTRY), null, 'a keyframe that removes by name');
  const twice = encodeFrame({ key: false, sender: 1, time: 1, groups: [{ kind: TREE, records: [[1, { state: 'broken' }]] }, { kind: TREE, records: [] }] });
  assert.equal(decodeFrame(twice, REGISTRY), null, 'one kind twice');
  const quat = new Uint8Array(frame([{ kind: TRAIN, records: [[2, train(0)]] }], { sender: 2 })); quat.fill(0, 21, 29); // head 7, kind 1, count 2, id 2, flags 1, mode 1, list count 1, p 6: the first q is bytes 21..28
  assert.equal(decodeFrame(quat.buffer, REGISTRY), null, 'a zero quaternion');
});
test('a diff has only changed objects, each with all its fields, for REPEAT diffs; a removed object is named REPEAT times (M-23)', () => {
  const t = createTracker([ANIMAL, TREE]), ids = g => g.records.map(([id]) => id);
  let herd = [[1, pig()], [2, pig({ x: 3 })]];
  for (let i = 0; i < REPEAT; i++) assert.deepEqual(ids(t.diff({ animal: herd, tree: [] })[0]), [1, 2], 'new objects, ' + i);
  assert.deepEqual(ids(t.diff({ animal: herd, tree: [] })[0]), [], 'no change, no record');
  herd = [[1, pig({ x: 10.5 + 0.001 })], [2, pig({ x: 3, anim: 'eat' })]]; // 1 mm is below the position step: no change
  const d = t.diff({ animal: herd, tree: [] })[0]; assert.deepEqual(ids(d), [2]); assert.equal(d.records[0][1].type, 'pig', 'all fields');
  t.diff({ animal: herd }); t.diff({ animal: herd });
  for (let i = 0; i < REPEAT; i++) assert.deepEqual(t.diff({ animal: [herd[1]], tree: [] })[0].removed, [1]);
  assert.deepEqual(t.diff({ animal: [herd[1]], tree: [] })[0].removed, []);
  assert.deepEqual(ids(t.diff({ animal: herd, tree: [] })[0]), [1], 'back again: new');
  assert.deepEqual(t.key({ animal: herd, tree: [] }).map(g => g.records.length), [2, 0], 'a keyframe has everything');
});
test('the store keeps the newest data per object, refuses a lower ownership number, and a keyframe removes what it leaves out (M-26)', () => {
  const s = createStore(KINDS), at = (time, groups, key = false, sender = 1) => s.apply(decodeFrame(encodeFrame({ key, sender, time, groups }), REGISTRY));
  at(100, [{ kind: ANIMAL, records: [[1, pig({ epoch: 5 })], [2, pig()]] }]);
  assert.deepEqual(at(90, [{ kind: ANIMAL, records: [[1, pig({ epoch: 6, x: 1 })]] }]), [], 'older time');
  assert.deepEqual(at(110, [{ kind: ANIMAL, records: [[1, pig({ epoch: 4, x: 1 })]] }]), [], 'lower ownership number');
  assert.equal(at(120, [{ kind: ANIMAL, records: [[1, pig({ epoch: 6, x: 1 })]] }]).length, 1); assert.equal(s.get('animal', 1).epoch, 6);
  at(130, [{ kind: ANIMAL, records: [], removed: [2] }]); assert.equal(s.get('animal', 2), null);
  at(125, [{ kind: ANIMAL, records: [[2, pig()]] }]); assert.equal(s.get('animal', 2), null, 'an older record does not bring a removed object back');
  at(140, [{ kind: TRAIN, records: [[3, train(0)]] }], false, 3); at(140, [{ kind: TRAIN, records: [[2, train(0)]] }], false, 2);
  const ch = at(150, [{ kind: ANIMAL, records: [[3, pig()]] }, { kind: TRAIN, records: [] }], true);
  assert.deepEqual(ch.map(c => [c.kind, c.id, c.rec === null]), [['animal', 3, false], ['animal', 1, true]], 'the keyframe removed animal 1; trains 2 and 3 are not the host\'s');
  assert.ok(s.get('train', 2) && s.get('train', 3));
  at(200, [{ kind: TRAIN, records: [] }], true, 3); assert.equal(s.get('train', 3), null, 'player 3\'s keyframe ends its own train only'); assert.ok(s.get('train', 2));
  s.clear(); assert.equal(s.all('animal').size, 0);
});
test('a kind is plain data: a new kind needs no new message (M-22)', () => {
  const BALE = kind({ name: 'bale', code: 9, authority: 'owner', max: 4, idMin: 1, idMax: 4, fields: { x: F.fixed(-10, 10, 0.5), on: F.bool() } }), reg = createRegistry([BALE]);
  const f = decodeFrame(encodeFrame({ key: true, sender: 4, time: 7, groups: [{ kind: BALE, records: [[4, { x: 2.5, on: true }]] }] }), reg);
  assert.deepEqual(f.groups.get('bale').records.get(4), { on: true, x: 2.5 }); assert.equal(encodeRecord(BALE, 4, { x: 2.5, on: true }).length, 5, 'id 2, flags 1, x 2');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/replica.test.mjs 2>&1 | tail -5`
Expected: FAIL — `Cannot find module '.../src/net/replica.js'`.

- [ ] **Step 3: Write `src/net/replica.js`**

```js
// src/net/replica.js
// Replicated objects (14.4, M-22, M-23, M-26, M-50). A kind lists the fields of one sort of shared object, how each field is packed, and the
// authority: the host, or the owner (the player whose number is the object's id). Game objects stay plain objects: kinds.js reads records
// from them and the sync code writes records back. A frame is binary, little-endian: a keyframe (every object of one authority) or a diff
// (the objects that changed, each with all its fields), with the sender's time stamp. decodeFrame checks everything and returns null for
// anything odd (M-50): a bad frame is dropped, never thrown.
export const FRAME = { KEY: 0x10, DIFF: 0x11 }, MAX_FRAME = 16384, NONE = 0xffff;
export const REPEAT = 3; // M-23: a changed or removed object stays in this many diffs, so one lost diff never hides a change
const TAU = Math.PI * 2, HEAD = 7, BAD = new Error('bad frame');
const boolsOf = fields => Object.keys(fields).filter(k => fields[k].t === 'bool');
export const F = {
  bool: () => ({ t: 'bool' }), // the bools of one obj share a flags byte (at most 8)
  uint: (bytes, max = 2 ** (8 * bytes) - 1) => ({ t: 'uint', bytes, max }),
  id: () => ({ t: 'id' }), // u16; null travels as 0xffff
  oneOf: list => ({ t: 'enum', list }), // u8 index
  fixed: (lo, hi, step) => ({ t: 'fixed', lo, hi, step, n: Math.round((hi - lo) / step) }), // u16 steps from lo; values are clamped into lo..hi
  angle: () => ({ t: 'angle' }), // u16 over a full turn
  quat: () => ({ t: 'quat' }), // 4 x i16, normalized on decode
  obj: fields => ({ t: 'obj', fields, bools: boolsOf(fields) }),
  list: (of, max, min = 0) => ({ t: 'list', of, max, min }), // u8 count
};
export const kind = def => ({ idMin: 0, ...def, rec: F.obj(def.fields) }); // { name, code, authority: 'host' | 'owner', max, idMin, idMax, fields, newer? }
export const createRegistry = kinds => ({ list: kinds, byName: new Map(kinds.map(k => [k.name, k])), byCode: new Map(kinds.map(k => [k.code, k])) });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
function put(c, f, val) {
  const v = c.v;
  switch (f.t) {
    case 'uint': if (!Number.isInteger(val) || val < 0 || val > f.max) throw new Error('bad uint ' + val); if (f.bytes === 1) v.setUint8(c.o, val); else if (f.bytes === 2) v.setUint16(c.o, val, true); else v.setUint32(c.o, val, true); c.o += f.bytes; return;
    case 'id': if (val !== null && !(Number.isInteger(val) && val >= 0 && val < NONE)) throw new Error('bad id ' + val); v.setUint16(c.o, val ?? NONE, true); c.o += 2; return;
    case 'enum': { const i = f.list.indexOf(val); if (i < 0) throw new Error('bad value ' + val); v.setUint8(c.o++, i); return; }
    case 'fixed': v.setUint16(c.o, Math.round((clamp(val, f.lo, f.hi) - f.lo) / f.step), true); c.o += 2; return;
    case 'angle': { const a = Number.isFinite(val) ? ((val % TAU) + TAU) % TAU : 0; v.setUint16(c.o, Math.round(a / TAU * 65536) % 65536, true); c.o += 2; return; }
    case 'quat': for (const k of 'xyzw') { v.setInt16(c.o, Math.round(clamp(val[k], -1, 1) * 32767), true); c.o += 2; } return;
    case 'obj': {
      if (f.bools.length) { let m = 0; f.bools.forEach((k, i) => { if (val[k]) m |= 1 << i; }); v.setUint8(c.o++, m); }
      for (const k in f.fields) if (f.fields[k].t !== 'bool') put(c, f.fields[k], val[k]); return;
    }
    case 'list': if (!Array.isArray(val) || val.length > f.max || val.length < f.min) throw new Error('bad list'); v.setUint8(c.o++, val.length); for (const x of val) put(c, f.of, x); return;
  }
}
function get(c, f) {
  const v = c.v;
  switch (f.t) {
    case 'uint': { const x = f.bytes === 1 ? v.getUint8(c.o) : f.bytes === 2 ? v.getUint16(c.o, true) : v.getUint32(c.o, true); c.o += f.bytes; if (x > f.max) throw BAD; return x; }
    case 'id': { const x = v.getUint16(c.o, true); c.o += 2; return x === NONE ? null : x; }
    case 'enum': { const x = f.list[v.getUint8(c.o++)]; if (x === undefined) throw BAD; return x; }
    case 'fixed': { const x = v.getUint16(c.o, true); c.o += 2; if (x > f.n) throw BAD; return f.lo + x * f.step; }
    case 'angle': { const x = v.getUint16(c.o, true); c.o += 2; return x / 65536 * TAU; }
    case 'quat': {
      const q = {}; for (const k of 'xyzw') { q[k] = v.getInt16(c.o, true) / 32767; c.o += 2; }
      const n = Math.hypot(q.x, q.y, q.z, q.w); if (n < 0.9 || n > 1.1) throw BAD; q.x /= n; q.y /= n; q.z /= n; q.w /= n; return q;
    }
    case 'obj': {
      const o = {};
      if (f.bools.length) { const m = v.getUint8(c.o++); if (m >> f.bools.length) throw BAD; f.bools.forEach((k, i) => { o[k] = !!(m & (1 << i)); }); }
      for (const k in f.fields) if (f.fields[k].t !== 'bool') o[k] = get(c, f.fields[k]); return o;
    }
    case 'list': { const n = v.getUint8(c.o++); if (n > f.max || n < f.min) throw BAD; const a = []; for (let i = 0; i < n; i++) a.push(get(c, f.of)); return a; }
  }
}
const scratch = new DataView(new ArrayBuffer(MAX_FRAME));
const putRecord = (c, k, id, rec) => { if (!Number.isInteger(id) || id < k.idMin || id > k.idMax) throw new Error(`bad ${k.name} id ${id}`); c.v.setUint16(c.o, id, true); c.o += 2; put(c, k.rec, rec); };
// one record's bytes (the tracker compares these, so a change smaller than a field's step is no change)
export function encodeRecord(k, id, rec) { const c = { v: scratch, o: 0 }; putRecord(c, k, id, rec); return new Uint8Array(scratch.buffer.slice(0, c.o)); }
// groups: [{ kind, records: [[id, rec], ...], removed: [id, ...] }]. Throws on a bug (a value not in its list, too many records, too big).
export function encodeFrame({ key, sender, time, groups }) {
  const c = { v: scratch, o: 0 }, v = scratch;
  v.setUint8(c.o++, key ? FRAME.KEY : FRAME.DIFF); v.setUint8(c.o++, sender); v.setUint32(c.o, time >>> 0, true); c.o += 4; v.setUint8(c.o++, groups.length);
  for (const g of groups) {
    const k = g.kind, removed = g.removed || [];
    if (g.records.length > k.max || removed.length > k.max) throw new Error('too many ' + k.name);
    v.setUint8(c.o++, k.code); v.setUint16(c.o, g.records.length, true); c.o += 2;
    for (const [id, rec] of g.records) putRecord(c, k, id, rec);
    v.setUint16(c.o, removed.length, true); c.o += 2; for (const id of removed) { v.setUint16(c.o, id, true); c.o += 2; }
  }
  return scratch.buffer.slice(0, c.o);
}
export const isFrame = buf => buf instanceof ArrayBuffer && buf.byteLength >= HEAD && (new Uint8Array(buf)[0] === FRAME.KEY || new Uint8Array(buf)[0] === FRAME.DIFF);
// -> { key, sender, time, groups: Map(kindName -> { records: Map(id -> rec), removed: [id] }) } or null. Every record must be one the sender is the
// authority for (M-50: a device speaks only for itself); every id appears once; a keyframe removes nothing by name (what it leaves out is gone).
export function decodeFrame(buf, reg) {
  if (!isFrame(buf) || buf.byteLength > MAX_FRAME) return null;
  try {
    const v = new DataView(buf), c = { v, o: 0 }, key = v.getUint8(c.o++) === FRAME.KEY, sender = v.getUint8(c.o++), time = v.getUint32(c.o, true); c.o += 4;
    if (sender < 1 || sender > 4) return null;
    const n = v.getUint8(c.o++), groups = new Map();
    for (let i = 0; i < n; i++) {
      const k = reg.byCode.get(v.getUint8(c.o++)); if (!k || groups.has(k.name)) return null;
      const count = v.getUint16(c.o, true); c.o += 2; if (count > k.max) return null;
      const records = new Map();
      for (let j = 0; j < count; j++) {
        const id = v.getUint16(c.o, true); c.o += 2;
        if (id < k.idMin || id > k.idMax || records.has(id) || (k.authority === 'host' ? sender !== 1 : id !== sender)) return null;
        records.set(id, get(c, k.rec));
      }
      const rc = v.getUint16(c.o, true); c.o += 2; if (rc > k.max || (key && rc)) return null;
      const removed = [];
      for (let j = 0; j < rc; j++) { const id = v.getUint16(c.o, true); c.o += 2; if (id < k.idMin || id > k.idMax || (k.authority === 'owner' && id !== sender) || (k.authority === 'host' && sender !== 1)) return null; removed.push(id); }
      groups.set(k.name, { records, removed });
    }
    return c.o === buf.byteLength ? { key, sender, time, groups } : null;
  } catch { return null; } // a read past the end (RangeError) or a bad field
}
// The sending side (M-23): objs is { kindName: [[id, rec], ...] }, every object this device is the authority for, now.
export function createTracker(kinds) {
  const last = new Map(kinds.map(k => [k.name, new Map()])); // id -> { bytes, hot, gone }
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  return {
    diff(objs) {
      return kinds.map(k => {
        const seen = last.get(k.name), now = new Set(), records = [], removed = [];
        for (const [id, rec] of objs[k.name] || []) {
          now.add(id); const bytes = encodeRecord(k, id, rec), o = seen.get(id);
          if (!o || o.gone || !same(o.bytes, bytes)) seen.set(id, { bytes, hot: REPEAT, gone: false });
          const e = seen.get(id); if (e.hot > 0) { e.hot--; records.push([id, rec]); }
        }
        for (const [id, e] of seen) if (!now.has(id)) { if (!e.gone) { e.gone = true; e.hot = REPEAT; } if (e.hot > 0) { e.hot--; removed.push(id); } else seen.delete(id); }
        return { kind: k, records, removed };
      });
    },
    key: objs => kinds.map(k => ({ kind: k, records: objs[k.name] || [], removed: [] })),
    reset() { for (const m of last.values()) m.clear(); },
  };
}
// The receiving side (M-26): per object, the newest record and the sender time it came with. Older data is ignored, and a kind may refuse a
// record (kind.newer: an animal with a lower ownership number). A keyframe replaces every object of its sender's authority: what it leaves
// out is removed, unless newer data came for it. apply() returns the accepted changes: [{ kind, id, rec }] (rec null: removed).
export function createStore(kinds) {
  const maps = new Map(kinds.map(k => [k.name, new Map()])); // id -> { rec (null: removed), t }
  const authority = (k, id, sender) => k.authority === 'host' ? sender === 1 : id === sender;
  return {
    get: (kind, id) => maps.get(kind).get(id)?.rec ?? null,
    all(kind) { const out = new Map(); for (const [id, e] of maps.get(kind)) if (e.rec) out.set(id, e.rec); return out; },
    apply(f) {
      const changes = [];
      for (const k of kinds) {
        const g = f.groups.get(k.name); if (!g) continue; const m = maps.get(k.name);
        for (const [id, rec] of g.records) { const e = m.get(id); if (e && (f.time <= e.t || (e.rec && k.newer && !k.newer(e.rec, rec)))) continue; m.set(id, { rec, t: f.time }); changes.push({ kind: k.name, id, rec }); }
        for (const id of g.removed) { const e = m.get(id); if (e && f.time <= e.t) continue; m.set(id, { rec: null, t: f.time }); if (e?.rec) changes.push({ kind: k.name, id, rec: null }); }
        if (f.key) for (const [id, e] of m) if (!g.records.has(id) && authority(k, id, f.sender) && e.t < f.time) { m.delete(id); if (e.rec) changes.push({ kind: k.name, id, rec: null }); }
      }
      return changes;
    },
    clear() { for (const m of maps.values()) m.clear(); },
  };
}
```

- [ ] **Step 4: Write `src/net/kinds.js`**

```js
// src/net/kinds.js
// The kinds of replicated objects (M-22) and how the host reads animal and tree records from its game (trains: players.js trainRecord).
// A new kind of shared object in a later version is a new entry here, not a new message.
import { F, kind, createRegistry } from './replica.js';
import { TYPES } from '../sim/herd.js';
import { PAINT_NAMES, MAX_PLAYERS } from './protocol.js';

export const TYPE_LIST = Object.keys(TYPES), ANIMS = ['idle', 'walk', 'run', 'eat', 'dance'], MODES = ['drive', 'show', 'held'];
export const LIMIT = { coord: 400, height: 50, animals: 256, trees: 1024, riders: 16 };
const XZ = F.fixed(-LIMIT.coord, LIMIT.coord, 1 / 64), Y = F.fixed(-LIMIT.height, LIMIT.height, 1 / 256); // 1.6 cm and 4 mm steps
const POSE = F.obj({ p: F.obj({ x: XZ, y: Y, z: XZ }), q: F.quat() });
const HELD = new Set(['fly', 'ride', 'show']); // the host's own train has it (M-15)
export const ANIMAL = kind({ name: 'animal', code: 1, authority: 'host', max: LIMIT.animals, idMax: 0xfffe,
  fields: { type: F.oneOf(TYPE_LIST), golden: F.bool(), hidden: F.bool(), home: F.oneOf(['route', 'yard']), state: F.oneOf(['free', 'busy', 'carried']),
    owner: F.uint(1, MAX_PLAYERS), epoch: F.uint(4), x: XZ, y: Y, z: XZ, yaw: F.angle(), anim: F.oneOf(ANIMS), leader: F.id(), line: F.uint(1) },
  newer: (old, rec) => rec.epoch >= old.epoch }); // M-26: lower ownership number, older data
export const TREE = kind({ name: 'tree', code: 2, authority: 'host', max: LIMIT.trees, idMax: LIMIT.trees - 1, fields: { state: F.oneOf(['standing', 'broken', 'growing']) } });
export const PLAYER = kind({ name: 'player', code: 3, authority: 'host', max: MAX_PLAYERS, idMin: 1, idMax: MAX_PLAYERS, fields: { body: F.oneOf(PAINT_NAMES), trim: F.oneOf(PAINT_NAMES), away: F.bool() } });
export const TRAIN = kind({ name: 'train', code: 4, authority: 'owner', max: 1, idMin: 1, idMax: MAX_PLAYERS,
  fields: { mode: F.oneOf(MODES), full: F.bool(), bodies: F.list(POSE, 3, 3), // tractor, trailer, wagon
    riders: F.list(F.obj({ id: F.uint(2, 0xfffe), slot: F.uint(1, 11), flying: F.bool(), x: XZ, y: Y, z: XZ, yaw: F.angle() }), LIMIT.riders) } });
export const KINDS = [ANIMAL, TREE, PLAYER, TRAIN], REGISTRY = createRegistry(KINDS);
// M-22: a carried animal's position comes from its owner's train, so its record holds none (and does not change while it rides)
export function animalRecord(a) {
  if (a.state === 'gone') return null; // not replicated: a keyframe leaves it out
  const held = HELD.has(a.state), carried = held || a.state === 'carried';
  return { type: a.type, golden: !!a.golden, hidden: !!a.hidden, home: a.home === 'yard' ? 'yard' : 'route', state: carried ? 'carried' : a.state === 'toBarn' ? 'busy' : 'free',
    owner: held ? 1 : carried ? a.owner ?? 0 : 0, epoch: a.epoch, x: carried ? 0 : a.x, y: carried ? 0 : a.y || 0, z: carried ? 0 : a.z, yaw: carried ? 0 : a.yaw,
    anim: carried || !ANIMS.includes(a.anim) ? 'idle' : a.anim, leader: a.leader ?? null, line: a.line || 0 };
}
export const animalRecords = herd => { const out = []; for (const a of herd.animals) { const r = animalRecord(a); if (r) out.push([a.id, r]); } return out.slice(0, LIMIT.animals); };
export const treeRecords = trees => trees.list.slice(0, LIMIT.trees).map(t => [t.id, { state: t.state }]);
export const playerRecords = roster => roster.map(p => [p.n, { body: p.paint.body, trim: p.paint.trim, away: !!p.away }]);
```

- [ ] **Step 5: Run the new tests, then the suite**

Run: `node --test test/replica.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'` — Expected: `ℹ pass 9`, `ℹ fail 0`.
Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'` — Expected: 611 tests, all pass (nothing uses the new files yet).

- [ ] **Step 6: Commit**

```bash
git add src/net/replica.js src/net/kinds.js test/replica.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - replicated objects: kinds, keyframes, diffs and a store (M-22, M-23, M-26)"
```

---

### Task 2: Two small hooks — one tree grows back by id, a hub that drops chosen messages (M-53, M-56)

**Files:**
- Modify: `src/sim/trees.js` (add `regrowById` after `breakById`)
- Modify: `src/net/link.js` (`createMemoryHub`: a `drop` property)
- Test: `test/trees.test.mjs`, `test/link.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `trees.regrowById(id) -> boolean` (true when a broken tree started to grow back, with its trunk collider); `hub.drop = (from, to, data, reliable) => boolean | null` — true drops that message (either channel), checked after the fast-channel loss.

- [ ] **Step 1: Write the failing tests**

Append to `test/trees.test.mjs`:

```js
test('one broken tree grows back by id, with its trunk; the others stay broken (M-56)', () => {
  const { trees } = setup([...oneTree(0, 0), ...oneTree(10, 0)]);
  trees.breakById(0); trees.breakById(1);
  assert.equal(trees.regrowById(0), true); assert.equal(trees.list[0].state, 'growing'); assert.ok(trees.list[0].collider, 'solid again'); assert.equal(trees.list[1].state, 'broken');
  assert.equal(trees.regrowById(0), false, 'not broken'); assert.equal(trees.regrowById(99), false, 'no such tree');
});
```

Append to `test/link.test.mjs`:

```js
test('a test can drop chosen messages on both channels, as a connection change does (M-53)', () => {
  const hub = createMemoryHub(), h = hub.host(), g = hub.join(), got = []; h.on('message', (f, d) => got.push(d instanceof ArrayBuffer ? 'frame' : d.t)); hub.tick(0);
  hub.drop = (from, to, d) => d instanceof ArrayBuffer || d.t === 'claim';
  g.send(h.id, new ArrayBuffer(1)); g.send(h.id, { t: 'claim' }, true); g.send(h.id, { t: 'horn' }, true); hub.tick(1);
  hub.drop = null; g.send(h.id, { t: 'claim' }, true); g.send(h.id, new ArrayBuffer(1)); hub.tick(2);
  assert.deepEqual(got, ['horn', 'claim', 'frame']);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/trees.test.mjs test/link.test.mjs 2>&1 | grep -E '^(✖|ℹ (pass|fail))'`
Expected: 2 failures — `trees.regrowById is not a function`, and the link test's `deepEqual` (nothing is dropped yet, so `got` has five entries, not `['horn', 'claim', 'frame']`).

- [ ] **Step 3: Add `regrowById` to `src/sim/trees.js`**

In the object returned by `createTrees`, directly before the `brokenIds:` line, add:

```js
    // M-56: the host has this one standing (or growing) again: it grows back like reset() does, alone; false when it is not broken
    regrowById(id) { const t = list[id]; if (!t || t.state !== 'broken') return false; t.state = 'growing'; t.grow = 0; if (!t.collider) addCollider(t); t.wobble = 0; t.near = false; return true; },
```

- [ ] **Step 4: Add `hub.drop` to `src/net/link.js`**

In `createMemoryHub`, in `send`, replace

```js
        if (!reliable && rng() < loss) return;
        let at = now + delay + (jitter ? rng() * jitter : 0); const k = id + '>' + to;
```

with

```js
        if (!reliable && rng() < loss) return;
        if (hub.drop?.(id, to, data, reliable)) return; // M-53: a test drops chosen messages (both channels), as a connection change does
        let at = now + delay + (jitter ? rng() * jitter : 0); const k = id + '>' + to;
```

and replace

```js
  const hub = {
    get now() { return now; },
```

with

```js
  const hub = {
    drop: null, // (from, to, data, reliable) => true drops the message
    get now() { return now; },
```

(`hub` is a `const` declared after `endpoint`; `send` only runs later, so the reference is safe — the same pattern `leave` already uses.)

- [ ] **Step 5: Run the tests and the suite**

Run: `node --test test/trees.test.mjs test/link.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'` — Expected: all pass.
Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'` — Expected: 613 tests, all pass.

- [ ] **Step 6: Commit**

```bash
git add src/sim/trees.js src/net/link.js test/trees.test.mjs test/link.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - grow one tree back by id; the test hub can drop chosen messages (M-53, M-56)"
```

---

### Task 3: Cut over host and guest to replicated objects; the claim answer is the replicated owner (M-13, M-14, M-22..M-27, M-50, M-56)

**Files:**
- Modify: `src/net/players.js` (whole file below)
- Modify: `src/net/protocol.js` (whole file below)
- Modify: `src/net/host.js` (whole file below)
- Modify: `src/net/guest.js` (whole file below)
- Modify: `test/mp.harness.mjs` (imports and four helpers)
- Modify: `test/mp.test.mjs` (16 tests rewritten, listed in Step 1; imports; one junk line)
- Modify: `test/protocol.test.mjs` (one test rewritten)

**Interfaces:**
- Consumes: everything Task 1 produces; `regrowById` and `hub.drop` from Task 2; unchanged `createInterp`, `lerp`, `lerpAngle`, `lerpPose` (`interp.js`); `slotIndex` (`src/sim/slots.js`); `game.resolveClaim(id, ok)`, `game.flights`, `game.load`, `game.claims`, `game.boopsPaused`, `herd.ensure`, `herd.remote` (unchanged sim hooks).
- Produces:
  - `players.js`: `SEND = { train: 50, world: 66, key: 2000 }`; `createPlayers()` with `push(n, time, rec, arrival) -> boolean` (`p.latest` = `{ time, ...rec }`), `sample(now)` setting `p.pose`, `p.yaw`, `p.mode`, `p.full`, `p.speed`, `p.carried = [{ id, slot, flying, riding, x, y, z, yaw }]`; `trainRecord(game) -> train record`; `yawOfQuat`, `START_PAINT` unchanged. `vehicleOf` is removed.
  - `protocol.js`: `NET_VERSION = 2`; `checkFromHost` accepts only `welcome { v, seed, you, next }`, `tree { id }`, `regrow`, `horn { n }`, `help { id | null }`; `checkFromGuest` unchanged.
  - `host.js`: `createHostSync(...)` same signature and sync API as before (`players, handlers, out, owned, freeUp, game, you, before, after, setGame, setPaint, showStarted, delivered, requestHelp, close`); `CLAIM_RANGE`, `TREE_RANGE` unchanged. `herdRecords`, `herdMessage` are removed. `handlers.claimed` does not exist on either side any more.
  - `guest.js`: `createGuestSync(...)` same signature; the sync also exposes `store` (a `createStore(KINDS)`) and `pending` is now a `Map(id -> { e0, done })`; `SILENT_MS` unchanged; new `TREE_GRACE = 1000`.
  - `test/mp.harness.mjs`: `sendAnimals(w, toDev, records, { key = false, time = w.now + 1 })`, `trainFrame(sender, id, rec, time) -> ArrayBuffer`, `animalRec(overrides) -> animal record`, `parked(x, z) -> train record`.

- [ ] **Step 1: Rewrite the tests that assert the old messages**

These existing tests assert the removed `claimed` message, the herd/vehicle binary formats or the old welcome. Each is replaced by a test of the same behavior through replicated state (the other tests in `test/mp.test.mjs` stay as they are and are the acceptance for this task):

| Old test (title start) | Why it changes | Replacement asserts |
|---|---|---|
| `a host id far past the herd is dropped…` | sent herd in the welcome and `encodeHerd` | same guard and leader checks through `sendAnimals` frames |
| `no answer within 1 s: the guest poofs it and releases it…` | the guest released at timeout | timeout poof, the claim stays open, the next keyframe gives it back (M-56), the host frees it at a higher number |
| `a stale yes (an older claim) never lowers…` | called `handlers.claimed` | a record with a lower ownership number is refused by the store; nothing lands; timeout |
| `a yes that arrives after the guest gave up…` | spied `handlers.claimed` | the replicated owner reaches the guest after its timeout; nothing lands; the guest gives it back; the host frees it higher |
| `a stale no drops the newer flight…` | called `handlers.claimed` | another owner without a newer ownership number does not poof; the real answer lands |
| `a reliable message that is too big… 131072…` | the host's `players` message | 2048 cap both ways; the host side checked with a padded `horn` |
| `a repeated id in claim, release or delivered…` | recorded `claimed` answers | owner and exactly one ownership step; the guest hears nothing back (`hub.drop`) |
| `after a timeout the claim is still in flight…` | `claimed` cleared it | the claim stays open after the timeout; a keyframe settles it; then a re-boop |
| `a stale yes still clears the claim in flight` | called `handlers.claimed` | a keyframe ends a claim whose flight is over, not one still waiting |
| `the rate limits count in wall time…` | flooded the guest with `players` | floods the guest with `horn` |
| `a flight waiting for the host answer is not sent as carried…` | `vehicleOf` left it out | it is in `trainRecord` riders (M-57), but the host neither draws nor moves it there until it gives it |
| `a guest cannot speak for another player…` | `encodeVehicle` (passes vacuously after the cut-over) | a train record for another player number is dropped |
| `old messages are ignored…` | `encodeVehicle`/`encodeHerd` (vacuous after the cut-over) | `trainFrame` with time 1 and `sendAnimals` with a lower ownership number |
| `a herd message never pulls an animal out of the guest trailer…` | `encodeHerd` (vacuous) | the same through `sendAnimals` |
| `ignored herd data … never changes an animal type` | `encodeHerd` (vacuous) | the same through `sendAnimals` |
| `host messages are checked the same way` (protocol) | old welcome and `claimed` | new welcome; `claimed` and `players` refused; `NET_VERSION` is 2 |

In `test/mp.harness.mjs`, after the line `import { quatAxes } from '../src/sim/tractor.js';` add:

```js
import { encodeFrame } from '../src/net/replica.js';
import { ANIMAL, TRAIN } from '../src/net/kinds.js';
```

and at the end of the file add:

```js
// A hand-made frame from one device to another (M-22): animal records from the host, or a train record from a player
export const sendAnimals = (w, to, records, { key = false, time = w.now + 1 } = {}) => w.host.net.send(to.net.id, encodeFrame({ key, sender: 1, time, groups: [{ kind: ANIMAL, records }] }), key);
export const trainFrame = (sender, id, rec, time) => encodeFrame({ key: false, sender, time, groups: [{ kind: TRAIN, records: [[id, rec]] }] });
export const animalRec = o => ({ type: 'pig', golden: false, hidden: false, home: 'route', state: 'free', owner: 0, epoch: 0, x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', leader: null, line: 0, ...o });
export const parked = (x, z) => ({ mode: 'drive', full: false, bodies: [0, 1, 2].map(() => ({ p: { x, y: 1, z }, q: { x: 0, y: 0, z: 0, w: 1 } })), riders: [] });
```

In `test/mp.test.mjs`:
1. Replace the import line `import { mpWorld, inFront, free, STILL, PAINTS, moveTrain } from './mp.harness.mjs';` with
   ```js
   import { mpWorld, inFront, free, STILL, PAINTS, moveTrain, sendAnimals, trainFrame, animalRec, parked } from './mp.harness.mjs';
   ```
2. Delete the line `import { encodeVehicle } from '../src/net/codec.js';` (above the `garbage` test).
3. In the `garbage, wrong kinds, odd JSON and a flood…` test, replace `{ t: 'claim', ids: [1e9] }];` with
   ```js
   { t: 'claim', ids: [1e9] }, new Uint8Array([0x11, 1, 0, 0, 0, 0, 1, 99]).buffer, new Uint8Array([0x10, 9, 0, 0, 0, 0, 0]).buffer];
   ```
   (a diff with an unknown kind, a keyframe from player 9).
4. Replace each whole test (from its `test('` line to its closing `});`) named in the first column with the block below, in the same place in the file.

`a host id far past the herd is dropped…` →

```js
test('a host id far past the herd is dropped and a leader the guest lacks is no leader (M-44, M-50)', async () => {
  const w = await mpWorld({ seed: 27 }); w.seconds(0.5);
  const g = w.guests[0], n = g.game.herd.animals.length, rec = (leader, o) => animalRec({ home: 'yard', hidden: true, x: 1, z: 2, leader, line: 1, ...o });
  w.host.sync.after = () => {}; w.step(); // the host goes quiet: only the frames below reach the guest
  sendAnimals(w, g, [[0, rec(40000)], [1, rec(0)], [60000, rec(null)]]); w.seconds(0.5);
  assert.equal(g.game.herd.animals.length, n, 'no animals grown up to 60000');
  const [a0, a1] = g.game.herd.animals; assert.equal(a0.leader, null); assert.equal(a1.leader, 0); assert.equal(a0.home, 'yard'); assert.equal(a0.hidden, true);
  sendAnimals(w, g, [[0, rec(50000, { x: 33, z: 44, hidden: false })], [65000, rec(null)]]); w.seconds(1);
  const b0 = g.game.herd.animals[0]; assert.equal(g.game.herd.animals.length, n);
  assert.deepEqual([b0.x, b0.z, b0.hidden, b0.state, b0.leader], [33, 44, false, 'idle', null], 'the record was applied, without its unknown leader');
});
```

`no answer within 1 s…` →

```js
test('no answer within 1 s: the guest poofs it; the next keyframe gives it back and the host frees it (M-14, M-56)', async () => {
  const w = await mpWorld({ seed: 34, link: { delay: 100 } }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  w.hub.drop = (from, to, d) => to === g.net.id && d instanceof ArrayBuffer; // the answer (the animal's replicated owner) is lost
  w.seconds(0.15); assert.equal(ha.state, 'carried', 'the host granted it'); const grant = ha.epoch;
  k = 0; while (!g.events.some(e => e.type === 'unclaim') && k++ < 180) w.step(1);
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout')); assert.ok(g.sync.pending.has(ha.id), 'the claim stays open');
  g.game.boopsPaused = true; // it is still in front of the guest: no re-boop, to see the host free it
  w.hub.drop = null; w.seconds(2.5);
  assert.ok(!g.sync.pending.has(ha.id), 'a keyframe settled it');
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', `host freed it (${ha.state})`); assert.ok(ha.epoch > grant, `epoch ${ha.epoch} > ${grant}`);
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'nothing landed');
});
```

`a stale yes (an older claim)…` →

```js
test('a record with an older ownership number neither lowers it nor lands a newer flight (M-14, M-26)', async () => {
  const w = await mpWorld({ seed: 37 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  w.host.sync.handlers.claim = () => {}; // the host's answer to the newer claim never comes
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; ha.epoch = 2; } // freed after an older grant (epoch 1)
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  assert.ok(g.sync.pending.has(ha.id), 'the guest launched it'); assert.equal(g.sync.pending.get(ha.id).e0, 2);
  sendAnimals(w, g, [[ha.id, animalRec({ type: ha.type, golden: ha.golden, state: 'carried', owner: 2, epoch: 1 })]]); w.step(1); // the older grant
  assert.equal(g.sync.store.get('animal', ha.id).epoch, 2, 'the number does not drop'); assert.equal(ga.state, 'fly', 'the flight still waits');
  w.seconds(2.5);
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'nothing landed');
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'));
});
```

`a yes that arrives after the guest gave up…` →

```js
test('a yes that arrives after the guest gave up: nothing lands, the guest gives it back and the host frees it at a higher number (M-14, M-56)', async () => {
  const w = await mpWorld({ seed: 38, link: { delay: 1200 } }); w.seconds(4);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  assert.ok(g.sync.pending.has(ha.id), 'the guest launched it');
  let grant = null; k = 0; while (grant === null && k++ < 120) { w.step(1); if (ha.state === 'carried') grant = ha.epoch; }
  assert.ok(grant !== null, 'the host granted it');
  k = 0; while (g.sync.store.get('animal', ha.id)?.owner !== 2 && k++ < 180) w.step(1);
  assert.equal(g.sync.store.get('animal', ha.id).owner, 2, 'the yes reached the guest');
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'), 'after the guest timed out');
  k = 0; while (ha.state === 'carried' && k++ < 420) w.step(1); // a keyframe, then the release (1.2 s each way)
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'nothing landed');
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', `host freed it (${ha.state})`); assert.ok(ha.epoch > grant, `epoch ${ha.epoch} > ${grant}`);
});
```

`a stale no drops the newer flight…` →

```js
test('news from before the boop (no higher ownership number) does not poof the flight; the real answer lands it (M-14, M-26)', async () => {
  const w = await mpWorld({ seed: 39, link: { delay: 100 } }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  const e0 = g.sync.pending.get(ha.id).e0;
  sendAnimals(w, g, [[ha.id, animalRec({ type: ha.type, golden: ha.golden, state: 'carried', owner: 3, epoch: e0 })]]); w.step(1); // another owner, but not newer than the boop
  assert.equal(ga.state, 'fly', 'no poof');
  w.seconds(3);
  assert.ok(g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'landed'); assert.ok(!g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id));
  assert.equal(ha.owner, 2);
});
```

`a reliable message that is too big…` →

```js
test('a reliable message that is too big is dropped: over 2048 from a guest or from the host (M-50)', async () => {
  const w = await mpWorld({ seed: 57 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id, G = g.net.id, hp = () => w.host.sync.players.map.get(2).paint, horns = () => g.events.filter(e => e.type === 'remoteHorn').length;
  g.net.send(H, { t: 'paint', paint: { ...PAINTS[3], pad: 'x'.repeat(2048) } }, true); w.seconds(0.3); assert.deepEqual(hp(), PAINTS[1], 'dropped by the host');
  g.net.send(H, { t: 'paint', paint: { ...PAINTS[3], pad: 'x'.repeat(1900) } }, true); w.seconds(0.3); assert.equal(hp().body, PAINTS[3].body, 'under the cap: handled');
  w.host.net.send(G, { t: 'horn', n: 1, pad: 'x'.repeat(2048) }, true); w.seconds(0.3); assert.equal(horns(), 0, 'dropped by the guest');
  w.host.net.send(G, { t: 'horn', n: 1, pad: 'x'.repeat(1900) }, true); w.seconds(0.3); assert.equal(horns(), 1, 'under the cap: handled');
});
```

`a repeated id in claim, release or delivered…` →

```js
test('a repeated id in claim, release or delivered is handled once (M-50)', async () => {
  const w = await mpWorld({ seed: 59 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id; w.hub.drop = (from, to) => to === g.net.id; // the guest hears nothing back (so it gives nothing back either)
  const near = a => { const t = w.host.sync.players.map.get(2).latest.bodies[0].p; Object.assign(a, { x: t.x + 2, z: t.z, state: 'idle', timer: 99, hidden: false }); };
  const [a, b] = w.host.game.herd.free().filter(x => !x.hidden && x.type !== 'chick');
  const ea = a.epoch; near(a); g.net.send(H, { t: 'claim', ids: [a.id, a.id] }, true); w.seconds(0.2);
  assert.deepEqual([a.owner, a.epoch], [2, ea + 1], 'granted once');
  let barn = 0; const toBarn = w.host.game.herd.toBarn; w.host.game.herd.toBarn = list => { barn += list.length; return toBarn(list); };
  const e = a.epoch; g.net.send(H, { t: 'delivered', ids: [a.id, a.id] }, true); w.seconds(0.2);
  assert.deepEqual([barn, a.epoch], [1, e + 1]);
  near(b); g.net.send(H, { t: 'claim', ids: [b.id] }, true); w.seconds(0.2); assert.equal(b.owner, 2);
  const eb = b.epoch; g.net.send(H, { t: 'release', ids: [b.id, b.id] }, true); w.seconds(0.2); assert.equal(b.epoch, eb + 1);
});
```

`after a timeout the claim is still in flight…` →

```js
test('after a timeout the claim stays open: no re-boop until a keyframe settles it (M-14, M-56)', async () => {
  const w = await mpWorld({ seed: 71 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  const claims = []; w.host.sync.handlers.claim = (p, m) => { claims.push(m); }; // the host has the claim and never answers
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; } // free in front of the guest on both devices
  let k = 0; while (!g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id) && k++ < 180) w.step(1);
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'), 'timed out');
  assert.equal(claims.length, 1, 'one claim only: the host still shows it free, yet no re-boop'); assert.ok(g.sync.pending.has(ha.id), 'still open');
  assert.ok(!free(g.game, ga), 'host data does not free it');
  const t0 = w.now; k = 0; while (claims.length < 2 && k++ < 180) w.step(1); // a keyframe settles it (the animal is still in front: the guest boops it again)
  assert.equal(claims.length, 2, 'boopable again'); assert.ok(w.now - t0 <= 2200, 'within one keyframe period');
});
```

`a stale yes still clears the claim in flight…` →

```js
test('a keyframe ends a claim whose flight is over; a claim whose flight still waits stays open (M-14, M-56)', async () => {
  const w = await mpWorld({ seed: 72 }); w.seconds(1);
  const g = w.guests[0], [a, b] = w.host.game.herd.free().filter(x => !x.hidden);
  g.sync.pending.set(a.id, { e0: a.epoch, done: true }); g.sync.pending.set(b.id, { e0: b.epoch, done: false });
  w.seconds(2.2);
  assert.ok(!g.sync.pending.has(a.id), 'settled'); assert.ok(g.sync.pending.has(b.id), 'still waiting');
});
```

`the rate limits count in wall time…` →

```js
test('the rate limits count in wall time: with the game frozen (rAF paused), a new window still opens (M-50)', async () => {
  let wall = 0; const w = await mpWorld({ seed: 74, clock: () => wall }); w.seconds(1); wall = 5000;
  const g = w.guests[0], H = w.host.net.id, G = g.net.id; let handled = 0;
  const orig = w.host.sync.handlers.claim; w.host.sync.handlers.claim = (...a) => { handled++; return orig(...a); };
  const deliver = () => w.hub.tick(w.now); // messages arrive, but no frame runs: sim time stands still
  for (let i = 0; i < 70; i++) g.net.send(H, { t: 'claim', ids: [0] }, true); deliver(); assert.equal(handled, 60);
  wall += 1100; g.net.send(H, { t: 'claim', ids: [0] }, true); deliver(); assert.equal(handled, 61, 'the host: a new second, a new window');
  const horns = () => g.sync.out.filter(e => e.type === 'remoteHorn').length; // no frame runs, so the guest's events wait in out
  for (let i = 0; i < 70; i++) w.host.net.send(G, { t: 'horn', n: 1 }, true); deliver(); assert.equal(horns(), 60);
  wall += 1100; w.host.net.send(G, { t: 'horn', n: 1 }, true); deliver(); assert.equal(horns(), 61, 'the guest: a new window too');
});
```

`a flight waiting for the host answer is not sent as carried…` →

```js
test('a waiting flight is in the guest train record (the host sees it there), but nobody draws it in that train before the host gives it (M-22, M-57)', async () => {
  const { trainRecord } = await import('../src/net/players.js');
  const w = await mpWorld({ seed: 82, link: { delay: 400 } }); w.seconds(2);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id], ids = () => trainRecord(g.game).riders.map(c => c.id);
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.game.flights.some(f => f.animal === ga && f.u >= 0) && k++ < 200) w.step(1);
  const f = g.game.flights.find(x => x.animal === ga); assert.ok(f && f.claim === 'pending' && f.u >= 0, 'in the air, unanswered');
  assert.ok(ids().includes(ha.id), 'in its train record');
  const x0 = ha.x; w.seconds(0.3); assert.ok(free(w.host.game, ha) && Math.abs(ha.x - x0) < 0.5, 'the host still has it free where it was');
  k = 0; while (f.claim === 'pending' && k++ < 120) w.step(1); assert.equal(f.claim, null, 'granted');
  w.seconds(1); assert.equal(ha.owner, 2); assert.ok(dist(ha, ga) < 0.6, `the host draws it in the guest train (${dist(ha, ga).toFixed(2)} m)`);
});
```

`a guest cannot speak for another player…` →

```js
test('a guest cannot speak for another player: a train record for another number is dropped (M-50)', async () => {
  const w = await mpWorld({ seed: 52, guests: 2 }); w.seconds(1);
  const [g1] = w.guests; g1.net.send(w.host.net.id, trainFrame(2, 3, parked(40, 40), 1e9)); w.seconds(0.3); // the host writes 2 over the sender: id 3 is not its own
  const p3 = w.host.sync.players.map.get(3).pose.tractor.p; assert.ok(Math.hypot(p3.x - 40, p3.z - 40) > 1, 'player 3 did not move');
});
```

`old messages are ignored…` →

```js
test('old messages are ignored: an older train position, and animal data with a lower ownership number (M-26)', async () => {
  const w = await mpWorld({ seed: 55 }); w.seconds(1);
  const g = w.guests[0], G = g.net.id;
  w.host.net.send(G, trainFrame(1, 1, parked(40, 40), 1)); // time 1: older than all
  w.seconds(0.3); const hp = g.sync.players.map.get(1).pose.tractor.p; assert.ok(Math.hypot(hp.x - 40, hp.z - 40) > 5, 'the host tractor did not jump back');
  const ha = w.host.game.herd.free().find(a => !a.hidden), ga = g.game.herd.animals[ha.id]; ha.epoch = 5; w.seconds(0.5); assert.equal(ga.epoch, 5);
  sendAnimals(w, g, [[ha.id, animalRec({ type: ha.type, golden: ha.golden, epoch: 4, x: 40, z: 40 })]]); // newer time, older owner
  for (let i = 0; i < 30; i++) { w.step(1); assert.ok(Math.hypot(ga.x - 40, ga.z - 40) > 5, 'ignored'); }
  assert.equal(ga.epoch, 5);
});
```

`a herd message never pulls an animal out of the guest trailer…` →

```js
test('host data never pulls an animal out of the guest trailer, whatever its ownership number (R-4, M-26)', async () => {
  const w = await mpWorld({ seed: 73 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(ga.state, 'ride');
  w.host.sync.after = () => {}; w.step();
  sendAnimals(w, g, [[ha.id, animalRec({ type: ha.type, golden: ha.golden, epoch: ga.epoch + 5, x: 40, z: 40 })]]);
  w.seconds(0.5); assert.equal(ga.state, 'ride'); assert.equal(g.game.load.landed(), 1);
});
```

`ignored herd data (an older ownership number)…` →

```js
test('ignored animal data (an older ownership number) never changes an animal type (M-26)', async () => {
  const w = await mpWorld({ seed: 79 }); w.seconds(1);
  const g = w.guests[0], ha = w.host.game.herd.free().find(a => !a.hidden && a.type !== 'cow'), ga = g.game.herd.animals[ha.id]; ha.epoch = 5; w.seconds(0.5); assert.equal(ga.epoch, 5);
  w.host.sync.after = () => {}; w.step();
  sendAnimals(w, g, [[ha.id, animalRec({ type: 'cow', golden: !ha.golden, epoch: 4, x: 40, z: 40 })]]);
  w.seconds(0.5); assert.equal(ga.type, ha.type); assert.equal(ga.golden, ha.golden);
});
```

In `test/protocol.test.mjs`, replace the test `host messages are checked the same way` with:

```js
test('host messages are checked the same way; the herd, trees and players are not messages any more (M-24, M-50)', () => {
  const w = { t: 'welcome', v: NET_VERSION, seed: 42, you: 2, next: 30 };
  assert.deepEqual(checkFromHost(w), w);
  for (const m of [{ t: 'tree', id: 3 }, { t: 'regrow' }, { t: 'horn', n: 1 }, { t: 'help', id: null }, { t: 'help', id: 7 }]) assert.deepEqual(checkFromHost(m), m, m.t);
  for (const m of [{ ...w, you: 5 }, { ...w, you: 1 }, { ...w, seed: -1 }, { ...w, next: undefined }, { ...w, next: 70000 }, { ...w, next: 1.5 },
    { t: 'horn', n: 9 }, { t: 'hello', v: NET_VERSION, paint }, { t: 'claimed', ok: [1], no: [], epochs: [[1, 4]] }, { t: 'players', list: [] }]) assert.equal(checkFromHost(m), null, JSON.stringify(m).slice(0, 60));
  assert.equal(NET_VERSION, 2, 'M-27: the messages changed');
});
```

- [ ] **Step 2: Run the rewritten tests to see them fail**

Run: `node --test test/mp.test.mjs test/protocol.test.mjs 2>&1 | grep -E '^(✖|ℹ (pass|fail))'`
Expected: failures, among them `a host id far past the herd…` (the guest ignores the new frames), `a record with an older ownership number…` (`g.sync.pending.get is not a function`), `host messages are checked the same way…` (`NET_VERSION` is 1).

- [ ] **Step 3: Replace `src/net/protocol.js`**

```js
// src/net/protocol.js
// Reliable-channel JSON messages (M-24) and their checks (M-50): every field must be the right type and in range, or the whole
// message is dropped. NET_VERSION (M-27) goes to Handshake as the game version, so a different build cannot join at all.
import { START_PAINTS, NEW_PAINTS } from '../sim/progress.js';

export const NET_VERSION = 2, MAX_PLAYERS = 4;
export const PAINT_NAMES = [...START_PAINTS, ...NEW_PAINTS];
const obj = m => m && typeof m === 'object' && !Array.isArray(m);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const ids = (a, max = 16) => Array.isArray(a) && a.length <= max && a.every(v => int(v, 0, 0xffff));
const paintOk = p => obj(p) && PAINT_NAMES.includes(p.body) && PAINT_NAMES.includes(p.trim);
const GUEST = {
  hello: m => m.v === NET_VERSION && paintOk(m.paint), claim: m => ids(m.ids), release: m => ids(m.ids), delivered: m => ids(m.ids),
  tree: m => int(m.id, 0, 0xffff), regrow: () => true, horn: () => true, help: () => true, paint: m => paintOk(m.paint),
};
const HOST = { // M-24: the herd, the trees and the players come as replicated objects (kinds.js), not in these messages
  welcome: m => int(m.v, 0, 0xffff) && int(m.seed, 0, 0xffffffff) && int(m.you, 2, MAX_PLAYERS) && int(m.next, 0, 0xffff), // next: the host's herd size (the guest's id guard)
  tree: m => int(m.id, 0, 0xffff), regrow: () => true, horn: m => int(m.n, 1, MAX_PLAYERS), help: m => m.id === null || int(m.id, 0, 0xffff),
};
const check = table => m => obj(m) && Object.hasOwn(table, m.t) && table[m.t](m) ? m : null;
export const checkFromGuest = check(GUEST), checkFromHost = check(HOST);
// M-50: at most perSec messages in each 1 s window (per guest and per channel); the rest are dropped
export function createRate(perSec = 60) {
  let win = -Infinity, n = 0;
  return { allow(now) { if (now - win >= 1000) { win = now; n = 0; } return ++n <= perSec; } };
}
```

- [ ] **Step 4: Replace `src/net/players.js`**

```js
// src/net/players.js
// Other players as this device shows them (M-2, M-11, M-25): number, paints, away, and their train records through an interpolation buffer.
import { createInterp, lerpPose, lerp, lerpAngle } from './interp.js';
import { quatAxes } from '../sim/tractor.js';
import { slotIndex } from '../sim/slots.js';
import { LIMIT } from './kinds.js';

export const SEND = { train: 50, world: 66, key: 2000 }; // ms: train diffs about 20 and host diffs about 15 each second, a keyframe every 2 s (M-23)
export const START_PAINT = { body: 'red', trim: 'yellow' };
export const yawOfQuat = q => { const { f } = quatAxes(q); return Math.atan2(f.x, f.z); };
const pose = () => ({ p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });

export function createPlayers() {
  const map = new Map();
  const ensure = n => { if (!map.has(n)) map.set(n, { n, peer: null, paint: { ...START_PAINT }, away: false, interp: createInterp(), latest: null, pose: null, yaw: 0, speed: 0, mode: 'drive', full: false, carried: [] }); return map.get(n); };
  return {
    map, ensure,
    remove(n) { map.delete(n); },
    list: () => [...map.values()],
    push(n, time, rec, arrival) { const p = map.get(n), f = { time, ...rec }; if (!p || !p.interp.push(time, arrival, f)) return false; p.latest = f; return true; },
    sample(now) {
      for (const p of map.values()) {
        const s = p.interp.sample(now); if (!s) continue;
        p.pose ||= { tractor: pose(), cars: [pose(), pose()] };
        lerpPose(s.a.bodies[0], s.b.bodies[0], s.k, p.pose.tractor); lerpPose(s.a.bodies[1], s.b.bodies[1], s.k, p.pose.cars[0]); lerpPose(s.a.bodies[2], s.b.bodies[2], s.k, p.pose.cars[1]);
        p.yaw = yawOfQuat(p.pose.tractor.q); p.mode = s.b.mode; p.full = s.b.full;
        const dt = (s.b.time - s.a.time) / 1000, A = s.a.bodies[0].p, B = s.b.bodies[0].p; if (dt > 0) p.speed = Math.hypot(B.x - A.x, B.z - A.z) / dt;
        const before = new Map(s.a.riders.map(c => [c.id, c]));
        p.carried = s.b.riders.map(c => { const o = before.get(c.id), r = { ...c, riding: !c.flying }; if (o && !c.flying) { r.x = lerp(o.x, c.x, s.k); r.y = lerp(o.y, c.y, s.k); r.z = lerp(o.z, c.z, s.k); r.yaw = lerpAngle(o.yaw, c.yaw, s.k); } return r; });
      }
    },
    others: () => [...map.values()].filter(p => p.pose).map(p => ({ n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed })),
  };
}
// M-22: this device's train record: the three bodies, and every animal in flight to it or in a slot (also a flight that still waits for the host:
// the host must see it there, M-57; the others draw an animal in a train only when its replicated owner is that player)
export function trainRecord(game) {
  const bodies = [game.tractor.body, ...game.train.cars.map(c => c.body)].map(b => ({ p: b.translation(), q: b.rotation() })), riders = [];
  for (const f of game.flights) riders.push({ id: f.animal.id, slot: slotIndex(f.slot), flying: true, x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.animal.yaw });
  for (const s of game.load.slots) if (s.landed) { const a = s.animal; riders.push({ id: a.id, slot: slotIndex(s), flying: false, x: a.x, y: a.y, z: a.z, yaw: yawOfQuat(game.train.cars[s.car].body.rotation()) }); }
  const mode = game.mode === 'drive' ? 'drive' : game.mode === 'arrive' || game.mode === 'show' ? 'show' : 'held';
  return { mode, full: game.load.full(), bodies, riders: riders.filter(r => r.id < 0xffff).slice(0, LIMIT.riders) };
}
```

- [ ] **Step 5: Replace `src/net/host.js`**

```js
// src/net/host.js
// Host sync (M-11..M-19, M-22..M-24, M-39, M-50). The host is the authority for the animals, the trees and the players; each guest for its
// own train (M-22). The host sends keyframes and diffs (M-23) and passes each guest's train on. Requests from guests come as JSON events;
// their results go back as replicated state (M-24). Bad or too many messages are dropped (M-50); a handler error never reaches the game (M-44).
import { encodeFrame, decodeFrame, createTracker, isFrame } from './replica.js';
import { REGISTRY, ANIMAL, TREE, PLAYER, TRAIN, animalRecords, treeRecords, playerRecords } from './kinds.js';
import { checkFromGuest, createRate, NET_VERSION, MAX_PLAYERS } from './protocol.js';
import { createPlayers, trainRecord, SEND } from './players.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';
import { fullDodge } from '../sim/game.js';

export const CLAIM_RANGE = 8; // m: a claim is granted only near the guest's last real tractor position (M-50)
export const TREE_RANGE = 12; // m: a guest tree break counts only near its last real tractor position (M-17, M-50)
const MAX_JSON = 2048; // M-50: a longer reliable message from a guest is dropped (the biggest real one is a few hundred)
const REGROW_MS = 5000; // M-17, M-50: a guest regrow counts at most once in 5 s, so one guest cannot flood the others
export function createHostSync({ game, net, paint, clock = () => performance.now() }) { // clock: wall time for the rate limits (the sim clock stops while the page sleeps)
  const players = createPlayers(), byPeer = new Map(), rates = new Map(), out = [], bumper = createBumper();
  const world = createTracker([ANIMAL, TREE, PLAYER]), mine = createTracker([TRAIN]);
  let lastWorld = -Infinity, lastTrain = -Infinity, lastKey = -Infinity, closed = false, myPaint = { ...paint }, nowMs = 0;
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.list()) if (p.n !== except && p.peer && p.helloed) net.send(p.peer, m, rel); };
  const roster = () => [{ n: 1, paint: myPaint, away: false }, ...players.list().map(p => ({ n: p.n, paint: p.paint, away: p.away }))];
  const worldNow = () => ({ animal: animalRecords(game.herd), tree: treeRecords(game.trees), player: playerRecords(roster()) });
  const trainNow = () => ({ train: [[1, trainRecord(game)]] });
  const welcome = p => ({ t: 'welcome', v: NET_VERSION, seed: game.farm.seed, you: p.n, next: game.herd.animals.length }); // M-24: the first keyframe follows at once
  const freeNumber = () => { for (let n = 2; n <= MAX_PLAYERS; n++) if (![...players.map.keys()].includes(n)) return n; return 0; };
  const owned = n => game.herd.animals.filter(a => a.state === 'carried' && a.owner === n);
  const freeUp = a => { a.state = 'idle'; a.timer = 1; a.owner = null; a.epoch++; a.y = 0; };
  const guestAt = p => p.latest?.bodies[0].p; // the guest's last real tractor position (M-50)
  const tractorOf = p => ({ x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed });
  const handlers = {
    hello(p, m) { if (p.helloed) return; p.helloed = true; p.paint = m.paint; send(p.n, welcome(p)); lastKey = -Infinity; }, // M-23: a keyframe at once, after the welcome
    paint(p, m) { p.paint = m.paint; }, // M-2: the player object changes; the next diff has it
    // M-13: first claim wins; the guest's last real tractor position must be within 8 m of the animal (M-50). The answer is the animal's owner (M-22).
    claim(p, m) {
      const t = guestAt(p);
      for (const id of new Set(m.ids)) { const a = game.herd.animals[id]; // M-50: a repeated id counts once
        if (a && t && !NOT_FREE.has(a.state) && Math.hypot(a.x - t.x, a.z - t.z) <= CLAIM_RANGE) { a.state = 'carried'; a.owner = p.n; a.epoch++; a.hidden = false; } }
    },
    release(p, m) { for (const id of new Set(m.ids)) { const a = game.herd.animals[id]; if (a?.state === 'carried' && a.owner === p.n) freeUp(a); } }, // M-56: the guest does not have it
    // M-6, M-16, Decision 10: the host walks the delivered animals into the barn; every guest sees them walk (busy), then they are gone
    delivered(p, m) { const list = [...new Set(m.ids)].map(id => game.herd.animals[id]).filter(a => a?.state === 'carried' && a.owner === p.n); for (const a of list) { a.epoch++; a.owner = null; } if (list.length) { game.herd.toBarn(list); game.herd.respawn(); } },
    tree(p, m) { const t = game.trees.list[m.id], at = guestAt(p); if (!t || !at || Math.hypot(t.x - at.x, t.z - at.z) > TREE_RANGE) return; // M-17, M-50
      const e = game.trees.breakById(m.id, { x: Math.sin(p.yaw), z: Math.cos(p.yaw) }); if (!e) return; out.push(e); all({ t: 'tree', id: m.id }, true, p.n); },
    regrow(p) { if (nowMs - (p.regrowAt ?? -Infinity) < REGROW_MS) return; p.regrowAt = nowMs; game.trees.reset(); all({ t: 'regrow' }, true, p.n); }, // M-17: any show regrows everything
    horn(p) { if (!p.pose) return; game.herd.horn(tractorOf(p)); out.push({ type: 'remoteHorn', n: p.n }); all({ t: 'horn', n: p.n }, true, p.n); }, // M-8
    help(p) { const c = p.pose ? game.herd.callHelp(tractorOf(p)) : null; send(p.n, { t: 'help', id: c ? c.id : null }); }, // M-9
  };
  const gone = id => { const n = byPeer.get(id); byPeer.delete(id); rates.delete(id); if (!n) return; const p = players.map.get(n);
    for (const a of owned(n)) { a.state = 'gone'; a.epoch++; } game.herd.respawn(); // M-39
    if (p?.pose) out.push({ type: 'playerGone', n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(n); };
  net.on('peerAway', id => { const p = players.map.get(byPeer.get(id)); if (p) p.away = true; }); // M-39: the player object says so
  net.on('peerBack', id => { const p = players.map.get(byPeer.get(id)); if (p) p.away = false; });
  net.on('peerLeft', id => gone(id));
  net.on('peer', id => { if (closed) return; const n = freeNumber(); if (!n) return; const p = players.ensure(n); p.peer = id; byPeer.set(id, n); rates.set(id, { fast: createRate(), rel: createRate() }); });
  function onTrain(p, f, data, reliable) {
    if ([...f.groups.keys()].some(k => k !== 'train')) return; // M-50: a guest is the authority for its own train only (decodeFrame checked the id)
    const rec = f.groups.get('train').records.get(p.n);
    if (rec) { const first = !p.latest; if (players.push(p.n, f.time, rec, nowMs) && first) out.push({ type: 'playerJoined', n: p.n, x: rec.bodies[0].p.x, z: rec.bodies[0].p.z }); }
    for (const q of players.list()) if (q.n !== p.n && q.peer && q.helloed) net.send(q.peer, data, reliable); // M-23: the host sends each guest's train to the other guests
  }
  net.on('message', (from, data, reliable) => {
    try {
      const n = byPeer.get(from), p = n && players.map.get(n); if (!p || closed) return;
      const r = rates.get(from); if (!(reliable ? r.rel : r.fast).allow(clock())) return; // M-50: in wall time, so a frozen frame loop never closes the window for good
      if (data instanceof ArrayBuffer) {
        if (!p.helloed || !isFrame(data)) return;
        new DataView(data).setUint8(1, n); // M-50: a guest speaks only for itself
        const f = decodeFrame(data, REGISTRY); if (f) onTrain(p, f, data, reliable);
        return;
      }
      if (!(JSON.stringify(data)?.length <= MAX_JSON)) return; // M-50: checks the size first
      const m = checkFromGuest(data); if (!m || (!p.helloed && m.t !== 'hello')) return;
      handlers[m.t]?.(p, m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  const sync = {
    players, handlers, out, owned, freeUp,
    get game() { return game; }, you: 1,
    before(now) {
      nowMs = now; players.sample(now); game.others = players.others();
      for (const p of players.list()) if (!p.away) for (const c of p.carried) { const a = game.herd.animals[c.id]; if (a?.state === 'carried' && a.owner === p.n) Object.assign(a, { x: c.x, y: c.y, z: c.z, yaw: c.yaw, riding: c.riding, anim: c.flying ? 'run' : 'idle' }); }
      for (const p of players.list()) if (p.pose && p.full && p.mode === 'drive' && !p.away) fullDodge(game.herd, p.pose.tractor.p, p.pose.tractor.q, p.pose.cars, out); // M-12, B-14
      if (game.mode === 'drive') bumper.step(1 / 60, game.tractor, game.others, out); // M-7 while driving only: a tractor in its show stays in the barn (M-4)
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now;
      for (const e of events) { if (e.type === 'launch') e.animal.epoch++; // M-15, M-26: the host's own boop changes the owner
        if (e.type === 'treeBreak' && !e.remote) all({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') all({ t: 'horn', n: 1 }); } // M-17, M-8
      if (!players.list().some(p => p.helloed)) return; // nobody to send to yet: a joiner's first keyframe has everything
      if (now - lastKey >= SEND.key) { lastKey = now; all(encodeFrame({ key: true, sender: 1, time: now, groups: [...world.key(worldNow()), ...mine.key(trainNow())] }), true); } // M-23
      if (now - lastWorld >= SEND.world) { lastWorld = now; all(encodeFrame({ key: false, sender: 1, time: now, groups: world.diff(worldNow()) }), false); }
      if (now - lastTrain >= SEND.train) { lastTrain = now; all(encodeFrame({ key: false, sender: 1, time: now, groups: mine.diff(trainNow()) }), false); }
    },
    setGame(g) { game = g; world.reset(); mine.reset(); lastKey = -Infinity; for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; if (p.helloed) send(p.n, welcome(p)); } }, // M-19
    setPaint(pt) { myPaint = { ...pt }; },
    showStarted() { all({ t: 'regrow' }); }, // M-17: the host's own startShow already reset its trees
    delivered() {}, requestHelp() {}, // the host's own animals need no message; main.js calls callHelp directly on the host
    close() { closed = true; for (const p of players.list()) { for (const a of owned(p.n)) { a.state = 'gone'; a.epoch++; } if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(p.n); } game.others = []; game.herd.respawn(); }, // M-39: the host keeps playing alone and its herd refills
  };
  return sync;
}
```

- [ ] **Step 6: Replace `src/net/guest.js`**

```js
// src/net/guest.js
// Guest sync (M-1, M-11..M-19, M-22..M-26, M-40, M-41, M-56). The guest is the authority for its own train only. It shows the host's animals,
// trees and players, and the other trains, from the replicated objects in its store. A claim's answer is the animal's replicated owner (M-13, M-14);
// at each keyframe from the host the guest repairs what a lost message left wrong (M-56).
import { encodeFrame, decodeFrame, createTracker, createStore, isFrame } from './replica.js';
import { REGISTRY, KINDS, TRAIN } from './kinds.js';
import { checkFromHost, createRate, NET_VERSION } from './protocol.js';
import { createPlayers, trainRecord, SEND } from './players.js';
import { createInterp, lerp, lerpAngle } from './interp.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';

const OWN = new Set(['fly', 'ride', 'show', 'gone']); // host data never moves these: this guest's own, or unknown since the welcome (Decision 10: not toBarn)
const HELD = new Set(['fly', 'ride', 'show']); // in this guest's train or its show
export const SILENT_MS = 3000; // M-40: no binary message from the host for this long: it is away, whatever the server says (a sleeping page, a dead channel)
export const TREE_GRACE = 1000; // ms: a keyframe does not grow back a tree this guest broke this recently (the keyframe may be older than the host's break) (M-17, M-56)
const MAX_JSON = 2048; // M-50: a longer reliable message from the host is dropped (the welcome is the biggest: about 60 bytes)
const ID_ROOM = 512; // M-44, M-50: herd.ensure() fills every id up to the one asked for, so an id far past the host's herd is dropped, never grown into
const leaderOf = (herd, a, id) => id !== null && id !== a.id && herd.animals[id] ? id : null; // a leader the guest does not have is no leader
export function createGuestSync({ game, net, paint, onFarm, clock = () => performance.now() }) { // clock: wall time for the rate limits (the sim clock stops while the page sleeps)
  const players = createPlayers(), herdBuf = createInterp(), out = [], bumper = createBumper(), rate = { fast: createRate(120), rel: createRate(60) }; // M-50, Decision 9
  const store = createStore(KINDS), mine = createTracker([TRAIN]), pending = new Map(), myBreaks = new Map(); // pending: animal id -> { e0: its ownership number at the boop, done: the flight is over }
  let you = 0, hostNext = 0, hostPeer = null, lastTrain = -Infinity, lastKey = -Infinity, nowMs = 0, alone = false, myPaint = { ...paint }, deferred = null, deferredKey = null;
  let hostAway = false, silent = false, paused = false, lastFast = 0; // M-40: two sources (the server's hostAway, the silence watchdog); the host is away while either says so
  const setPaused = () => { const v = hostAway || silent; if (v === paused) return; paused = v; game.boopsPaused = v; const p = players.map.get(1); if (p) p.away = v; };
  const idLimit = herd => Math.max(herd.animals.length, hostNext) + ID_ROOM; // hostNext: the host's herd size from the welcome
  const toHost = (m, rel = true) => { if (hostPeer && !alone) net.send(hostPeer, m, rel); };
  const holds = id => game.flights.some(f => f.animal.id === id) || game.load.slots.some(s => s.animal.id === id);
  function applyRoster() { // M-22: the player objects. A new player gets this train's keyframe at once (M-23)
    const seen = new Set();
    for (const [n, r] of store.all('player')) { if (n === you) continue; seen.add(n); if (!players.map.has(n)) lastKey = -Infinity;
      const p = players.ensure(n); p.paint = { body: r.body, trim: r.trim }; p.away = r.away || (n === 1 && paused); }
    for (const p of players.list()) if (!seen.has(p.n)) { players.remove(p.n); if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); }
  }
  function applyTree(id, state) { // M-17, M-56: the host's state wins, except for a tree this guest just broke itself
    const t = game.trees.list[id]; if (!t) return; // M-50: the id must exist
    if (state === 'broken') { const e = game.trees.breakById(id); if (e) out.push(e); }
    else if (t.state === 'broken' && !(clock() - (myBreaks.get(id) ?? -Infinity) < TREE_GRACE)) game.trees.regrowById(id);
  }
  function repair() { // M-56, at each keyframe from the host
    for (const [id, c] of pending) if (c.done) pending.delete(id); // M-14: the keyframe settles a claim whose flight is over
    const lost = []; for (const [id, r] of store.all('animal')) if (r.owner === you && !holds(id)) lost.push(id); // given to us, but not here (a lost answer)
    for (let i = 0; i < lost.length; i += 16) toHost({ t: 'release', ids: lost.slice(i, i + 16) });
  }
  function applyFrame(f) {
    const changes = store.apply(f);
    if (changes.some(c => c.kind === 'player')) applyRoster();
    for (const c of changes) {
      if (c.kind === 'tree' && c.rec && !deferred) applyTree(c.id, c.rec.state);
      if (c.kind === 'train' && c.rec && players.map.has(c.id)) { const first = !players.map.get(c.id).latest;
        if (players.push(c.id, f.time, c.rec, nowMs) && first) out.push({ type: 'playerJoined', n: c.id, x: c.rec.bodies[0].p.x, z: c.rec.bodies[0].p.z }); }
    }
    if (f.groups.has('animal') && !deferred) herdBuf.push(f.time, nowMs, store.all('animal')); // M-25: a snapshot of every animal at the frame's time
    if (f.key && f.sender === 1 && !deferred) repair();
  }
  function applyWelcome(m) {
    if (!you) lastFast = clock(); // the watchdog starts with the first welcome
    you = m.you; hostNext = m.next; game = onFarm(m.seed, m.you); // M-1: always rebuild from the host's seed (no solo riders come along). checkFromHost holds you to 2..MAX_PLAYERS
    game.herd.remote = true; game.claims = true; game.boopsPaused = paused; // a host that is away stays away on the new farm (M-40)
    pending.clear(); myBreaks.clear(); herdBuf.reset(); store.clear(); mine.reset(); lastKey = -Infinity;
    for (const a of game.herd.animals) a.state = 'gone'; // M-24: nothing is free until the host's keyframe says so
    for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; }
  }
  const handlers = {
    welcome(m) { if (m.v !== NET_VERSION) return; if (['arrive', 'show', 'reward'].includes(game.mode) && you) { deferred = m; return; } applyWelcome(m); }, // M-19: after the show
    tree(m) { if (deferred) return; const e = game.trees.breakById(m.id); if (e) out.push(e); }, // M-17: gibs, no direction (not on the old farm while a new one waits)
    regrow() { if (!deferred) game.trees.reset(); },
    horn(m) { out.push({ type: 'remoteHorn', n: m.n }); }, // M-8
    help(m) { const a = m.id === null || deferred ? null : game.herd.animals[m.id]; if (a) out.push({ type: 'help', animal: a }); }, // M-9
  };
  function goAlone(reason) { // M-41: carry on alone on the same farm; nothing is made again
    if (alone) return; alone = true; deferred = deferredKey = null;
    try {
      for (const f of game.flights.filter(f => f.claim === 'pending')) game.resolveClaim(f.animal.id, true); // decision 3: nobody else can have it now
      pending.clear(); game.claims = false; game.boopsPaused = false; game.herd.remote = false;
      const herd = game.herd, isFree = a => a && !NOT_FREE.has(a.state);
      for (const a of herd.animals) if (a.state === 'carried' || a.state === 'elsewhere') a.state = 'gone';
      for (const a of herd.animals) if (a.state === 'idle' && a.leader !== null && isFree(herd.animals[a.leader])) a.state = 'follow'; // records carry no 'follow': chick lines walk again
      herd.toBarn(herd.animals.filter(a => a.state === 'toBarn')); // real waypoints: the ones from records have none
      herd.respawn();
      for (const p of players.list()) { if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(p.n); }
      game.others = []; out.push({ type: 'alone', reason });
    } catch (e) { console.warn('net alone', e); } // M-44
  }
  net.on('hostAway', () => { hostAway = true; setPaused(); }); // M-40
  net.on('hostBack', () => { hostAway = false; setPaused(); });
  net.on('closed', reason => goAlone(reason));
  net.on('peer', id => { hostPeer = id; toHost({ t: 'hello', v: NET_VERSION, paint: myPaint }); });
  net.on('message', (from, data, reliable) => {
    try {
      if (from !== hostPeer || alone || !(reliable ? rate.rel : rate.fast).allow(clock())) return; // M-50: the guest checks the host's messages too (in wall time)
      if (data instanceof ArrayBuffer) {
        if (!you) return; lastFast = clock();
        const f = isFrame(data) && decodeFrame(data, REGISTRY); if (!f || f.sender === you) return;
        if (deferred && f.key && f.sender === 1) deferredKey = f; // M-19: the new farm's state, for when its welcome is used
        applyFrame(f);
        return;
      }
      if (!(JSON.stringify(data)?.length <= MAX_JSON)) return; // M-50: checks the size first
      const m = checkFromHost(data); if (m) handlers[m.t]?.(m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  function settleClaims() { // M-14: a claim's answer is the animal's replicated owner, with a newer ownership number than at the boop
    for (const [id, c] of pending) { if (c.done) continue; const r = store.get('animal', id); if (!r || r.epoch <= c.e0) continue;
      if (r.owner === you) { game.resolveClaim(id, true); pending.delete(id); } // it lands (or, if its flight is gone, the next keyframe gives it back)
      else { out.push(...game.resolveClaim(id, false)); c.done = true; } } // somebody else has it: poof; the claim stays open until a keyframe
  }
  function applyHerd(now) { // M-23, M-25: the host's animals, smoothly; never our own (R-4) nor one with an open claim (M-14)
    const s = herdBuf.sample(now); if (!s) return;
    const A = s.a, B = s.b, herd = game.herd, lim = idLimit(herd);
    for (const [id, r] of B) {
      if (id > lim) continue;
      const old = herd.animals[id]; if (pending.has(id) || old && HELD.has(old.state)) continue;
      const a = herd.ensure(id, r.type, r.golden); // after the checks: ignored data never changes an animal
      a.epoch = r.epoch; a.home = r.home; a.hidden = r.hidden; a.leader = leaderOf(herd, a, r.leader); a.line = r.line;
      if (r.state === 'carried') { a.owner = r.owner; a.state = 'elsewhere'; continue; } // drawn from its owner's train (applyCarried)
      const o = A.get(id), k = o && o.state !== 'carried' ? s.k : 1, f = k === 1 ? r : o;
      a.owner = null; a.x = lerp(f.x, r.x, k); a.z = lerp(f.z, r.z, k); a.y = lerp(f.y, r.y, k); a.yaw = lerpAngle(f.yaw, r.yaw, k); a.anim = r.anim;
      a.state = r.state === 'busy' ? 'toBarn' : r.hidden ? 'hide' : a.state === 'dodge' ? 'dodge' : 'idle';
    }
    for (const a of herd.animals) if (!B.has(a.id) && !OWN.has(a.state) && !pending.has(a.id)) a.state = 'elsewhere';
  }
  function applyCarried() { // M-11, M-22: animals in other trains, where their owners put them; only an animal whose replicated owner is that player
    for (const p of players.list()) for (const c of p.carried) { const r = store.get('animal', c.id), a = game.herd.animals[c.id];
      if (!r || r.owner !== p.n || !a || pending.has(c.id) || HELD.has(a.state)) continue;
      Object.assign(a, { state: 'carried', x: c.x, y: c.y, z: c.z, yaw: c.yaw, riding: c.riding, anim: c.flying ? 'run' : 'idle' }); }
  }
  const trainNow = () => ({ train: [[you, trainRecord(game)]] });
  const sync = {
    players, handlers, out, pending, store,
    get game() { return game; }, get you() { return you; }, get alone() { return alone; },
    before(now) {
      nowMs = now; if (!you) return out.splice(0);
      if (!alone) { silent = clock() - lastFast > SILENT_MS; setPaused(); } // M-40: the silence watchdog
      if (deferred && game.mode === 'drive') { const m = deferred, k = deferredKey; deferred = deferredKey = null; applyWelcome(m); if (k) applyFrame(k); }
      if (!alone) { players.sample(now); if (!deferred) { settleClaims(); applyHerd(now); for (const a of game.herd.animals) if (a.state === 'carried') a.state = 'elsewhere'; applyCarried(); } } // M-19: a waiting welcome's herd is not put on the old farm
      game.others = players.others(); if (game.mode === 'drive') bumper.step(1 / 60, game.tractor, game.others, out); // M-7 while driving only (M-4)
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now; if (!you || alone) return;
      const ids = [];
      for (const e of events) {
        if (e.type === 'launch') { ids.push(e.animal.id); pending.set(e.animal.id, { e0: store.get('animal', e.animal.id)?.epoch ?? e.animal.epoch, done: false }); }
        if (e.type === 'unclaim') { const c = pending.get(e.animal.id); if (c) c.done = true; } // M-14: no re-boop until a keyframe settles it
        if (e.type === 'treeBreak' && !e.remote) { myBreaks.set(e.tree.id, clock()); toHost({ t: 'tree', id: e.tree.id }); } // M-17
        if (e.type === 'horn') toHost({ t: 'horn' }); // M-8
      }
      if (ids.length) toHost({ t: 'claim', ids: ids.slice(0, 16) }); // M-13: a chick line goes in one claim
      if (now - lastKey >= SEND.key) { lastKey = now; toHost(encodeFrame({ key: true, sender: you, time: now, groups: mine.key(trainNow()) }), true); } // M-23
      if (now - lastTrain >= SEND.train) { lastTrain = now; toHost(encodeFrame({ key: false, sender: you, time: now, groups: mine.diff(trainNow()) }), false); }
    },
    setGame(g) { game = g; },
    setPaint(pt) { myPaint = { ...pt }; toHost({ t: 'paint', paint: myPaint }); },
    showStarted() { toHost({ t: 'regrow' }); }, // M-17
    delivered(riders) { const ids = riders.map(r => r.animal.id).filter(id => id < 0x10000); if (ids.length) toHost({ t: 'delivered', ids: ids.slice(0, 16) }); }, // M-6, M-16
    requestHelp() { if (!you || alone) return false; toHost({ t: 'help' }); return true; }, // M-9
    close() { net.leave?.(); goAlone('left'); },
  };
  return sync;
}
```

How the guest decides (for the reviewer):
- Frames go through `store.apply` (per-object order, M-26). Player changes rebuild the roster; tree changes go to `applyTree`; train records go to `players.push`; every frame with an animal group pushes a snapshot of all animal records into `herdBuf`, which `applyHerd` samples ~100 ms behind (M-25).
- `settleClaims` runs each `before()`: a record with a newer ownership number than at the boop either names this guest (land) or another owner (poof, claim stays open). `repair` runs at each host keyframe: finished claims end, animals owned by this guest that it does not hold are released, trees already agree through `applyTree` (M-56).
- `pending` blocks host data for that animal, so a poofed animal is not boopable until a keyframe ends its claim (M-14).

- [ ] **Step 7: Run the suite**

Run: `npm test 2>&1 | grep -E '^(✖|ℹ (tests|pass|fail))'`
Expected: 613 tests, all pass. If an mp test fails, run it alone with `node --test --test-name-pattern="<title start>" test/mp.test.mjs` and compare the guest's `g.sync.store.get('animal', id)` with the host's animal before changing any assertion: the acceptance tests must keep their assertions (only the 16 listed tests change).

- [ ] **Step 8: Check the bundle still builds**

Run: `npx esbuild src/main.js --bundle --format=esm --outfile=/dev/null 2>&1 | tail -2`
Expected: `Done`, no error (`main.js` and `session.js` use only the unchanged sync API).

- [ ] **Step 9: Commit**

```bash
git add src/net/players.js src/net/protocol.js src/net/host.js src/net/guest.js test/mp.harness.mjs test/mp.test.mjs test/protocol.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - host and guest send replicated objects; a claim's answer is the animal's owner (M-13, M-14, M-22..M-27, M-56)"
```

---

### Task 4: Host repair — free a guest's animal that is not in its train for 3 s (M-57)

**Files:**
- Modify: `src/net/host.js`
- Modify: `test/mp.harness.mjs` (`disagreements`, `settle`)
- Create: `test/mp.repair.test.mjs`

**Interfaces:**
- Consumes: `createHostSync` from Task 3 (`owned`, `freeUp`, `players`, `p.latest.riders`); `hub.drop` (Task 2); `createLoad` (`src/sim/slots.js`), `CAPACITY` (`src/sim/game.js`).
- Produces: `REPAIR_MS = 3000` exported from `host.js`; `p.heardAt` (wall time of that guest's last decoded frame); harness `disagreements(w) -> string[]` (empty: every guest agrees with the host on animals, open claims, trees and the roster) and `settle(w, s) -> string[]` (steps until they agree, at most `s` seconds; returns what is left).

- [ ] **Step 1: Add the agreement helpers to `test/mp.harness.mjs`** (at the end)

```js
// M-58: what a guest shows that the host does not (empty: all devices agree). Animals carried by somebody else may be drawn or not (carried or elsewhere).
const HELD = ['fly', 'ride', 'show'];
export function disagreements(w) {
  const out = [], H = w.host.game;
  for (const g of w.guests) {
    if (g.sync.alone) continue; const G = g.game, you = g.sync.you, at = (b, what) => out.push(`${g.name} animal ${b}: ${what}`);
    for (const a of H.herd.animals) {
      if (a.state === 'gone') continue; const b = G.herd.animals[a.id], owner = HELD.includes(a.state) ? 1 : a.state === 'carried' ? a.owner : 0;
      if (!b) { at(a.id, 'missing'); continue; }
      if (owner === you) { if (!HELD.includes(b.state)) at(a.id, `the host says mine, here ${b.state}`); }
      else if (owner) { if (b.state !== 'carried' && b.state !== 'elsewhere') at(a.id, `player ${owner} has it, here ${b.state}`); }
      else if (a.state === 'toBarn') { if (b.state !== 'toBarn') at(a.id, `walking in on the host, here ${b.state}`); }
      else if (!free(G, b)) at(a.id, `free on the host, here ${b.state}`);
    }
    for (const b of G.herd.animals) if (HELD.includes(b.state) && !(H.herd.animals[b.id]?.state === 'carried' && H.herd.animals[b.id].owner === you)) at(b.id, `held here, ${H.herd.animals[b.id]?.state} on the host`);
    if (g.sync.pending.size) out.push(`${g.name}: ${g.sync.pending.size} open claims`);
    for (const t of H.trees.list) if ((t.state === 'broken') !== (G.trees.list[t.id].state === 'broken')) out.push(`${g.name} tree ${t.id}: ${t.state} on the host, ${G.trees.list[t.id].state} here`);
    for (const n of [1, ...w.host.sync.players.list().map(p => p.n)]) if (n !== you && !g.sync.players.map.has(n)) out.push(`${g.name}: no player ${n}`);
  }
  return out;
}
// step until every device agrees, at most s seconds; returns the disagreements left (empty: agreed in time)
export function settle(w, s) { let left = disagreements(w); for (let i = 0; i < Math.round(s * 60) && left.length; i++) { w.step(1); left = disagreements(w); } return left; }
```

- [ ] **Step 2: Write the failing tests**

Create `test/mp.repair.test.mjs`:

```js
// test/mp.repair.test.mjs — repair after lost messages (M-56..M-58, M-53 loss tests)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mpWorld, settle } from './mp.harness.mjs';
import { createLoad } from '../src/sim/slots.js';
import { CAPACITY } from '../src/sim/game.js';

const single = g => g.herd.free().find(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id) && x.home === 'route');
const inFrontOf = (g, ha) => { const ga = g.game.herd.animals[ha.id], p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; return ga; };
const isRelease = d => !(d instanceof ArrayBuffer) && d?.t === 'release';

test('the host frees a guest animal that is not in that guest train for 3 s (M-57)', async () => {
  const w = await mpWorld({ seed: 91 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = inFrontOf(g, ha);
  w.seconds(3); assert.equal(ga.state, 'ride'); assert.equal(ha.owner, 2); const e = ha.epoch;
  w.hub.drop = (from, to, d) => isRelease(d); // the guest's own give-back (M-56) is lost too
  g.game.load = createLoad(CAPACITY); ga.state = 'elsewhere'; g.game.boopsPaused = true; // the guest lost it, as a lost message would leave it
  const t0 = w.now; let k = 0; while (ha.state === 'carried' && k++ < 300) w.step(1);
  const took = w.now - t0; assert.ok(took >= 2900 && took <= 3300, `freed after ${took.toFixed(0)} ms`); assert.equal(ha.epoch, e + 1);
  assert.deepEqual(settle(w, 1), [], 'all agree');
});
test('an away guest keeps its animals: the 3 s count only while its frames come (M-39, M-57)', async () => {
  const w = await mpWorld({ seed: 92 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = inFrontOf(g, ha);
  w.seconds(3); assert.equal(ga.state, 'ride');
  w.hub.away(g.net.id); w.seconds(10); w.hub.back(g.net.id); w.seconds(1);
  assert.equal(ha.state, 'carried'); assert.equal(ha.owner, 2); assert.equal(ga.state, 'ride');
});
```

- [ ] **Step 3: Run them to see the first fail**

Run: `node --test test/mp.repair.test.mjs 2>&1 | grep -E '^(✖|ℹ (pass|fail))'`
Expected: `the host frees a guest animal…` fails (the loop runs out with the animal still `carried`); `an away guest keeps its animals…` passes (nothing frees anything yet).

- [ ] **Step 4: Add M-57 to `src/net/host.js`**

Make these edits (each `old` text appears once):

1. Header line 2: replace `M-39, M-50).` with `M-39, M-50, M-57).`
2. After the line `export const TREE_RANGE = 12; …` add:
   ```js
   export const REPAIR_MS = 3000; // M-57: a guest's animal missing from that guest's train records for this long is free again
   const TALK_MS = 500; // M-57 counts only while the guest's frames come in (they come every 50 ms): an away guest loses nothing
   ```
3. Replace
   ```js
     const world = createTracker([ANIMAL, TREE, PLAYER]), mine = createTracker([TRAIN]);
     let lastWorld = -Infinity, lastTrain = -Infinity, lastKey = -Infinity, closed = false, myPaint = { ...paint }, nowMs = 0;
   ```
   with
   ```js
     const world = createTracker([ANIMAL, TREE, PLAYER]), mine = createTracker([TRAIN]), missing = new Map(); // missing: animal id -> ms it has been owned by a guest but not in that guest's train (M-57)
     let lastWorld = -Infinity, lastTrain = -Infinity, lastKey = -Infinity, closed = false, myPaint = { ...paint }, nowMs = 0, lastBefore = null;
   ```
4. In `freeUp`, replace `a.epoch++; a.y = 0; };` with `a.epoch++; a.y = 0; missing.delete(a.id); };`
5. In `handlers.claim`, replace `a.epoch++; a.hidden = false; } }` with `a.epoch++; a.hidden = false; missing.delete(id); } }`
6. In `handlers.delivered`, replace `for (const a of list) { a.epoch++; a.owner = null; }` with `for (const a of list) { a.epoch++; a.owner = null; missing.delete(a.id); }`
7. In `gone`, replace `for (const a of owned(n)) { a.state = 'gone'; a.epoch++; } game.herd.respawn();` with `for (const a of owned(n)) { a.state = 'gone'; a.epoch++; missing.delete(a.id); } game.herd.respawn();`
8. In `onTrain`, after the line `if ([...f.groups.keys()].some(k => k !== 'train')) return; …` add the line
   ```js
       p.heardAt = clock();
   ```
9. Directly before `  const sync = {` add:
   ```js
     function repair(dt) { // M-57: an animal a guest owns but does not have (its flight poofed, a release was lost) is free again after 3 s
       for (const p of players.list()) { if (!p.latest || !(clock() - p.heardAt <= TALK_MS)) continue;
         const has = new Set(p.latest.riders.map(c => c.id));
         for (const a of owned(p.n)) { if (has.has(a.id)) { missing.delete(a.id); continue; } const m = (missing.get(a.id) || 0) + dt; if (m >= REPAIR_MS) freeUp(a); else missing.set(a.id, m); } }
     }
   ```
10. In `before(now)`, replace `nowMs = now; players.sample(now); game.others = players.others();` with
    ```js
    nowMs = now; players.sample(now); game.others = players.others(); repair(lastBefore === null ? 0 : now - lastBefore); lastBefore = now;
    ```
11. In `setGame`, replace `world.reset(); mine.reset(); lastKey` with `world.reset(); mine.reset(); missing.clear(); lastKey`.

The result is this `src/net/host.js`:

```js
// src/net/host.js
// Host sync (M-11..M-19, M-22..M-24, M-39, M-50, M-57). The host is the authority for the animals, the trees and the players; each guest for its
// own train (M-22). The host sends keyframes and diffs (M-23) and passes each guest's train on. Requests from guests come as JSON events;
// their results go back as replicated state (M-24). Bad or too many messages are dropped (M-50); a handler error never reaches the game (M-44).
import { encodeFrame, decodeFrame, createTracker, isFrame } from './replica.js';
import { REGISTRY, ANIMAL, TREE, PLAYER, TRAIN, animalRecords, treeRecords, playerRecords } from './kinds.js';
import { checkFromGuest, createRate, NET_VERSION, MAX_PLAYERS } from './protocol.js';
import { createPlayers, trainRecord, SEND } from './players.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';
import { fullDodge } from '../sim/game.js';

export const CLAIM_RANGE = 8; // m: a claim is granted only near the guest's last real tractor position (M-50)
export const TREE_RANGE = 12; // m: a guest tree break counts only near its last real tractor position (M-17, M-50)
export const REPAIR_MS = 3000; // M-57: a guest's animal missing from that guest's train records for this long is free again
const TALK_MS = 500; // M-57 counts only while the guest's frames come in (they come every 50 ms): an away guest loses nothing
const MAX_JSON = 2048; // M-50: a longer reliable message from a guest is dropped (the biggest real one is a few hundred)
const REGROW_MS = 5000; // M-17, M-50: a guest regrow counts at most once in 5 s, so one guest cannot flood the others
export function createHostSync({ game, net, paint, clock = () => performance.now() }) { // clock: wall time for the rate limits (the sim clock stops while the page sleeps)
  const players = createPlayers(), byPeer = new Map(), rates = new Map(), out = [], bumper = createBumper();
  const world = createTracker([ANIMAL, TREE, PLAYER]), mine = createTracker([TRAIN]), missing = new Map(); // missing: animal id -> ms it has been owned by a guest but not in that guest's train (M-57)
  let lastWorld = -Infinity, lastTrain = -Infinity, lastKey = -Infinity, closed = false, myPaint = { ...paint }, nowMs = 0, lastBefore = null;
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.list()) if (p.n !== except && p.peer && p.helloed) net.send(p.peer, m, rel); };
  const roster = () => [{ n: 1, paint: myPaint, away: false }, ...players.list().map(p => ({ n: p.n, paint: p.paint, away: p.away }))];
  const worldNow = () => ({ animal: animalRecords(game.herd), tree: treeRecords(game.trees), player: playerRecords(roster()) });
  const trainNow = () => ({ train: [[1, trainRecord(game)]] });
  const welcome = p => ({ t: 'welcome', v: NET_VERSION, seed: game.farm.seed, you: p.n, next: game.herd.animals.length }); // M-24: the first keyframe follows at once
  const freeNumber = () => { for (let n = 2; n <= MAX_PLAYERS; n++) if (![...players.map.keys()].includes(n)) return n; return 0; };
  const owned = n => game.herd.animals.filter(a => a.state === 'carried' && a.owner === n);
  const freeUp = a => { a.state = 'idle'; a.timer = 1; a.owner = null; a.epoch++; a.y = 0; missing.delete(a.id); };
  const guestAt = p => p.latest?.bodies[0].p; // the guest's last real tractor position (M-50)
  const tractorOf = p => ({ x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed });
  const handlers = {
    hello(p, m) { if (p.helloed) return; p.helloed = true; p.paint = m.paint; send(p.n, welcome(p)); lastKey = -Infinity; }, // M-23: a keyframe at once, after the welcome
    paint(p, m) { p.paint = m.paint; }, // M-2: the player object changes; the next diff has it
    // M-13: first claim wins; the guest's last real tractor position must be within 8 m of the animal (M-50). The answer is the animal's owner (M-22).
    claim(p, m) {
      const t = guestAt(p);
      for (const id of new Set(m.ids)) { const a = game.herd.animals[id]; // M-50: a repeated id counts once
        if (a && t && !NOT_FREE.has(a.state) && Math.hypot(a.x - t.x, a.z - t.z) <= CLAIM_RANGE) { a.state = 'carried'; a.owner = p.n; a.epoch++; a.hidden = false; missing.delete(id); } }
    },
    release(p, m) { for (const id of new Set(m.ids)) { const a = game.herd.animals[id]; if (a?.state === 'carried' && a.owner === p.n) freeUp(a); } }, // M-56: the guest does not have it
    // M-6, M-16, Decision 10: the host walks the delivered animals into the barn; every guest sees them walk (busy), then they are gone
    delivered(p, m) { const list = [...new Set(m.ids)].map(id => game.herd.animals[id]).filter(a => a?.state === 'carried' && a.owner === p.n); for (const a of list) { a.epoch++; a.owner = null; missing.delete(a.id); } if (list.length) { game.herd.toBarn(list); game.herd.respawn(); } },
    tree(p, m) { const t = game.trees.list[m.id], at = guestAt(p); if (!t || !at || Math.hypot(t.x - at.x, t.z - at.z) > TREE_RANGE) return; // M-17, M-50
      const e = game.trees.breakById(m.id, { x: Math.sin(p.yaw), z: Math.cos(p.yaw) }); if (!e) return; out.push(e); all({ t: 'tree', id: m.id }, true, p.n); },
    regrow(p) { if (nowMs - (p.regrowAt ?? -Infinity) < REGROW_MS) return; p.regrowAt = nowMs; game.trees.reset(); all({ t: 'regrow' }, true, p.n); }, // M-17: any show regrows everything
    horn(p) { if (!p.pose) return; game.herd.horn(tractorOf(p)); out.push({ type: 'remoteHorn', n: p.n }); all({ t: 'horn', n: p.n }, true, p.n); }, // M-8
    help(p) { const c = p.pose ? game.herd.callHelp(tractorOf(p)) : null; send(p.n, { t: 'help', id: c ? c.id : null }); }, // M-9
  };
  const gone = id => { const n = byPeer.get(id); byPeer.delete(id); rates.delete(id); if (!n) return; const p = players.map.get(n);
    for (const a of owned(n)) { a.state = 'gone'; a.epoch++; missing.delete(a.id); } game.herd.respawn(); // M-39
    if (p?.pose) out.push({ type: 'playerGone', n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(n); };
  net.on('peerAway', id => { const p = players.map.get(byPeer.get(id)); if (p) p.away = true; }); // M-39: the player object says so
  net.on('peerBack', id => { const p = players.map.get(byPeer.get(id)); if (p) p.away = false; });
  net.on('peerLeft', id => gone(id));
  net.on('peer', id => { if (closed) return; const n = freeNumber(); if (!n) return; const p = players.ensure(n); p.peer = id; byPeer.set(id, n); rates.set(id, { fast: createRate(), rel: createRate() }); });
  function onTrain(p, f, data, reliable) {
    if ([...f.groups.keys()].some(k => k !== 'train')) return; // M-50: a guest is the authority for its own train only (decodeFrame checked the id)
    p.heardAt = clock();
    const rec = f.groups.get('train').records.get(p.n);
    if (rec) { const first = !p.latest; if (players.push(p.n, f.time, rec, nowMs) && first) out.push({ type: 'playerJoined', n: p.n, x: rec.bodies[0].p.x, z: rec.bodies[0].p.z }); }
    for (const q of players.list()) if (q.n !== p.n && q.peer && q.helloed) net.send(q.peer, data, reliable); // M-23: the host sends each guest's train to the other guests
  }
  net.on('message', (from, data, reliable) => {
    try {
      const n = byPeer.get(from), p = n && players.map.get(n); if (!p || closed) return;
      const r = rates.get(from); if (!(reliable ? r.rel : r.fast).allow(clock())) return; // M-50: in wall time, so a frozen frame loop never closes the window for good
      if (data instanceof ArrayBuffer) {
        if (!p.helloed || !isFrame(data)) return;
        new DataView(data).setUint8(1, n); // M-50: a guest speaks only for itself
        const f = decodeFrame(data, REGISTRY); if (f) onTrain(p, f, data, reliable);
        return;
      }
      if (!(JSON.stringify(data)?.length <= MAX_JSON)) return; // M-50: checks the size first
      const m = checkFromGuest(data); if (!m || (!p.helloed && m.t !== 'hello')) return;
      handlers[m.t]?.(p, m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  function repair(dt) { // M-57: an animal a guest owns but does not have (its flight poofed, a release was lost) is free again after 3 s
    for (const p of players.list()) { if (!p.latest || !(clock() - p.heardAt <= TALK_MS)) continue;
      const has = new Set(p.latest.riders.map(c => c.id));
      for (const a of owned(p.n)) { if (has.has(a.id)) { missing.delete(a.id); continue; } const m = (missing.get(a.id) || 0) + dt; if (m >= REPAIR_MS) freeUp(a); else missing.set(a.id, m); } }
  }
  const sync = {
    players, handlers, out, owned, freeUp,
    get game() { return game; }, you: 1,
    before(now) {
      nowMs = now; players.sample(now); game.others = players.others(); repair(lastBefore === null ? 0 : now - lastBefore); lastBefore = now;
      for (const p of players.list()) if (!p.away) for (const c of p.carried) { const a = game.herd.animals[c.id]; if (a?.state === 'carried' && a.owner === p.n) Object.assign(a, { x: c.x, y: c.y, z: c.z, yaw: c.yaw, riding: c.riding, anim: c.flying ? 'run' : 'idle' }); }
      for (const p of players.list()) if (p.pose && p.full && p.mode === 'drive' && !p.away) fullDodge(game.herd, p.pose.tractor.p, p.pose.tractor.q, p.pose.cars, out); // M-12, B-14
      if (game.mode === 'drive') bumper.step(1 / 60, game.tractor, game.others, out); // M-7 while driving only: a tractor in its show stays in the barn (M-4)
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now;
      for (const e of events) { if (e.type === 'launch') e.animal.epoch++; // M-15, M-26: the host's own boop changes the owner
        if (e.type === 'treeBreak' && !e.remote) all({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') all({ t: 'horn', n: 1 }); } // M-17, M-8
      if (!players.list().some(p => p.helloed)) return; // nobody to send to yet: a joiner's first keyframe has everything
      if (now - lastKey >= SEND.key) { lastKey = now; all(encodeFrame({ key: true, sender: 1, time: now, groups: [...world.key(worldNow()), ...mine.key(trainNow())] }), true); } // M-23
      if (now - lastWorld >= SEND.world) { lastWorld = now; all(encodeFrame({ key: false, sender: 1, time: now, groups: world.diff(worldNow()) }), false); }
      if (now - lastTrain >= SEND.train) { lastTrain = now; all(encodeFrame({ key: false, sender: 1, time: now, groups: mine.diff(trainNow()) }), false); }
    },
    setGame(g) { game = g; world.reset(); mine.reset(); missing.clear(); lastKey = -Infinity; for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; if (p.helloed) send(p.n, welcome(p)); } }, // M-19
    setPaint(pt) { myPaint = { ...pt }; },
    showStarted() { all({ t: 'regrow' }); }, // M-17: the host's own startShow already reset its trees
    delivered() {}, requestHelp() {}, // the host's own animals need no message; main.js calls callHelp directly on the host
    close() { closed = true; for (const p of players.list()) { for (const a of owned(p.n)) { a.state = 'gone'; a.epoch++; } if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(p.n); } game.others = []; game.herd.respawn(); }, // M-39: the host keeps playing alone and its herd refills
  };
  return sync;
}
```

- [ ] **Step 5: Run the tests and the suite**

Run: `node --test test/mp.repair.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'` — Expected: `ℹ pass 2`.
Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'` — Expected: 615 tests, all pass.

- [ ] **Step 6: Commit**

```bash
git add src/net/host.js test/mp.harness.mjs test/mp.repair.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - the host frees a guest animal that is not in its train for 3 s (M-57)"
```

---

### Task 5: Loss tests — every device agrees within 3 s after a connection change (M-53, M-56, M-58)

**Files:**
- Modify: `test/mp.harness.mjs` (`blackout`)
- Modify: `test/mp.repair.test.mjs` (import line; four tests)

**Interfaces:**
- Consumes: `disagreements`, `settle` (Task 4); `hub.drop` (Task 2); host/guest syncs (Tasks 3–4).
- Produces: harness `blackout(w, s, inputs?)` — for `s` seconds every frame (both channels), `claim` and `release` is lost, both ways; then the hub delivers again.

- [ ] **Step 1: Add `blackout` to `test/mp.harness.mjs`** (at the end)

```js
// a connection change (M-42, M-53): every claim, release and frame, both ways, is lost for s seconds
export function blackout(w, s, inputs) { w.hub.drop = (from, to, d) => d instanceof ArrayBuffer || d?.t === 'claim' || d?.t === 'release'; w.seconds(s, inputs); w.hub.drop = null; }
```

- [ ] **Step 2: Add the loss tests**

In `test/mp.repair.test.mjs`, replace the line `import { mpWorld, settle } from './mp.harness.mjs';` with

```js
import { mpWorld, free, STILL, settle, blackout } from './mp.harness.mjs';
```

and append:

```js
test('a claim lost in a connection change: the guest poofs, nobody keeps the animal, all agree within 3 s (M-14, M-56, M-58)', async () => {
  const w = await mpWorld({ seed: 93 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = inFrontOf(g, ha);
  w.hub.drop = (from, to, d) => d?.t === 'claim'; let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 60) w.step(1); // the guest boops; its claim is lost
  blackout(w, 2.5); // then every claim, release and frame, both ways, until after the 1 s hold
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'), 'poofed'); assert.ok(free(w.host.game, ha), 'the host never had the claim');
  g.game.boopsPaused = true; assert.deepEqual(settle(w, 3), []);
  assert.ok(free(g.game, ga), 'free on the guest again');
});
test('a yes lost in a connection change: the guest poofs and gives it back at the next keyframe; all agree within 3 s (M-14, M-56, M-58)', async () => {
  const w = await mpWorld({ seed: 94 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = inFrontOf(g, ha);
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 60) w.step(1);
  w.hub.drop = (from, to, d) => to === g.net.id && d instanceof ArrayBuffer; w.seconds(0.1); assert.equal(ha.owner, 2, 'granted'); // the claim got through; its answer does not
  blackout(w, 2.5);
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id), 'poofed');
  g.game.boopsPaused = true; assert.deepEqual(settle(w, 3), []);
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', 'the host has it free');
});
test('a tree break and a regrow lost: the keyframe puts every tree right within 3 s (M-17, M-56, M-58)', async () => {
  const w = await mpWorld({ seed: 95, guests: 2 }); w.seconds(1);
  const [g1, g2] = w.guests, trees = w.host.game.trees.list.filter(t => t.kind === 'tree').slice(0, 2);
  w.hub.drop = (from, to) => to === g2.net.id; // g2 hears nothing for a while
  for (const t of trees) w.host.sync.after([{ type: 'treeBreak', tree: w.host.game.trees.breakById(t.id).tree }], w.now);
  w.seconds(0.5); w.host.game.trees.reset(); w.seconds(1); w.host.game.trees.breakById(trees[1].id); w.seconds(0.5); // one grows back, one stays broken
  g1.game.trees.breakById(trees[0].id); // a guest break the host refused (too far): only on g1's screen
  w.hub.drop = null;
  assert.deepEqual(settle(w, 3), []);
  for (const d of w.devs) assert.deepEqual(d.game.trees.list.filter(t => t.state === 'broken').map(t => t.id), [trees[1].id], d.name);
});
test('everything lost for a second while two guests boop under a far network: all agree within 3 s (M-53, M-58)', async () => {
  const { makeRng } = await import('../src/sim/rng.js');
  const w = await mpWorld({ seed: 96, guests: 2, link: { delay: 150, jitter: 60, loss: 0.05, rng: makeRng(96).next } }); w.seconds(2);
  for (const g of w.guests) for (let i = 0; i < 3; i++) { const ha = w.host.game.herd.free().filter(x => !x.hidden && x.type !== 'chick' && !w.host.game.herd.animals.some(c => c.leader === x.id))[i * 2 + (g === w.guests[0] ? 0 : 1)]; inFrontOf(g, ha); w.step(12); }
  blackout(w, 1);
  w.seconds(1, (d, i) => i > 0 ? { thr: 0.3, steer: 0.4, horn: false } : STILL);
  for (const g of w.guests) g.game.boopsPaused = true; w.host.game.boopsPaused = true;
  const t0 = w.now; assert.deepEqual(settle(w, 3), []); assert.ok(w.now - t0 <= 3000);
});
```

These tests check, not change, behavior: Tasks 3 and 4 already implement M-56 and M-57. Each one first makes the devices disagree (asserted inside the test: a poof, a broken tree on one device only, open claims), then requires `settle(w, 3)` to return `[]`. A failure here is a real repair bug: debug it with `disagreements(w)` printed after each second; do not lengthen the 3 s.

- [ ] **Step 3: Run them**

Run: `node --test test/mp.repair.test.mjs 2>&1 | grep -E '^(✖|ℹ (pass|fail))'` — Expected: `ℹ pass 6`, `ℹ fail 0`.
Run it three times more (`for i in 1 2 3; do node --test test/mp.repair.test.mjs 2>&1 | grep -E '^ℹ fail'; done`) — Expected: `ℹ fail 0` each time (the far-network test uses a seeded link, so it is the same run every time).

- [ ] **Step 4: Run the suite**

Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'` — Expected: 619 tests, all pass.

- [ ] **Step 5: Commit**

```bash
git add test/mp.harness.mjs test/mp.repair.test.mjs
git commit -m "test: Tractor Pickup multiplayer - claims, answers, trees and frames lost in a connection change: all devices agree within 3 s (M-53, M-58)"
```

---

### Task 6: Delete the phase 1 codec (M-22)

**Files:**
- Delete: `src/net/codec.js`, `test/codec.test.mjs`
- Modify: `src/net/link.js` (one comment)

**Interfaces:**
- Consumes: nothing (after Task 3 no source file imports `codec.js`).
- Produces: nothing new. `test/replica.test.mjs` covers what `codec.test.mjs` covered (round trips, sizes, bad data).

- [ ] **Step 1: Check that nothing imports the codec**

Run: `grep -rn "codec" src test | grep -v "^src/net/codec.js\|^test/codec.test.mjs"`
Expected: only `src/net/link.js` (the comment about `kindOf()`).

- [ ] **Step 2: Delete it and fix the comment**

```bash
git rm src/net/codec.js test/codec.test.mjs
sed -i 's|^// codec.js kindOf() accepts only an ArrayBuffer|// replica.js isFrame() accepts only an ArrayBuffer|' src/net/link.js
grep -n "isFrame() accepts" src/net/link.js
```
Expected: one line, `// replica.js isFrame() accepts only an ArrayBuffer, so a typed array (Uint8Array, Buffer) is delivered as a copy of its exact byte range`.

- [ ] **Step 3: Check that the old messages are gone everywhere**

Run: `grep -rn "vehicleOf\|herdMessage\|herdRecords\|encodeVehicle\|encodeHerd\|decodeHerd\|'claimed'\|t: 'players'" src test`
Expected: no output except the refused `claimed`/`players` cases in `test/protocol.test.mjs`.

- [ ] **Step 4: Suite and bundle**

Run: `npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'` — Expected: 615 tests (619 − 4 codec tests), all pass.
Run: `npx esbuild src/main.js --bundle --format=esm --outfile=/dev/null 2>&1 | tail -2` — Expected: `Done`.

- [ ] **Step 5: Commit**

```bash
git add -A src/net/link.js
git commit -m "refactor: Tractor Pickup multiplayer - remove the phase 1 vehicle and herd codec (M-22)"
```

---

### Task 7: Two-window browser check against a local Handshake (M-54)

**Files:** none in git. Screenshots and the config go to the scratchpad directory (`$SCRATCH` below: the session's scratchpad path), never into the repo.

**Interfaces:**
- Consumes: the build (`npm run build` writes `/home/smiller/projects/four43/four43-tractor-multiplayer/site/exp/tractor-pickup/`), Docker image `handshake:phase1`.
- Produces: written results for Task 8 (what was seen, what failed, what still needs an iPad).

- [ ] **Step 1: Build**

```bash
cd /home/smiller/projects/four43/four43-tractor-multiplayer/games/tractor-pickup && npm run build 2>&1 | tail -2
```
Expected: the build line with the size; no error.

- [ ] **Step 2: Start a local Handshake**

```bash
cat > "$SCRATCH/hs-local.toml" <<'TOML'
listen = "0.0.0.0:8080"
trust_proxy = false
allow_localhost = true
[limits]
session_ttl_secs = 900
grace_secs = 30
room_max_age_secs = 43200
idle_room_secs = 1800
sessions_per_min = 30
joins_per_min = 20
app_failed_joins_per_min = 200
[turn]
urls = []
ttl_secs = 3600
[apps.tractor-pickup]
origins = ["http://localhost:8766"]
max_players = 4
max_rooms = 20
public_rooms = true
list = "none"
turn = false
TOML
chmod 644 "$SCRATCH/hs-local.toml"
docker run --rm -d --name hs-local -p 8080:8080 -e SESSION_SECRET=$(openssl rand -hex 32) -e TURN_SECRET=x -v "$SCRATCH/hs-local.toml:/etc/handshake/config.toml:ro" handshake:phase1
curl -s localhost:8080/healthz
```
Expected: `ok`. (The container runs as `nonroot`, so the config must be mode 644. Keys follow `/home/smiller/projects/four43/handshake-phase-1/config.example.toml`.)

- [ ] **Step 3: Serve the build** (background)

```bash
cd /home/smiller/projects/four43/four43-tractor-multiplayer/site/exp/tractor-pickup && python3 -m http.server 8766
```

- [ ] **Step 4: Two windows (Playwright, two browser contexts)**

Open `http://localhost:8766/?signal=http://localhost:8080&seed=7` in window A and in window B. Take a screenshot into `$SCRATCH` at each numbered point and write down what you see:
1. A: hold the gear 2 s → Multiplayer → Host. B: Multiplayer → Join → type the code → Join. B is on A's farm, ahead of A's start, **and B shows A's animals within 1 s of joining** (they now come in the first keyframe, not the welcome).
2. Both drive; each sees the other train in its paints, moving smoothly.
3. B boops an animal: it lands in B's wagon; A sees it there. A and B boop one animal at the same time: one lands, the other poofs (stars), and the poofed animal is never in two trains.
4. B breaks a tree near itself: it bursts on both. B drives into the barn: B's show; the trees grow back on A; after B's show A has new animals.
5. B with `?lag=300,80,5` (reload B, join again): driving is normal; a boop lands after a short hold.
6. Hide A's tab for 10 s (open another tab in A's context), then show it again: B shows A's tractor half transparent and boops pause, then A is back; within 3 s of A coming back, a free animal near B stands in the same place in both windows, and B's riders are still in B's wagon on both.
7. A: Lock, then Remove player 2: B goes on alone on the same farm, keeps its riders, and its animals walk again.
8. The browser consoles: no errors from the game (Handshake warnings are allowed).
Record pass or fail for each, and anything that needs an iPad.

- [ ] **Step 5: Stop the servers**

```bash
docker stop hs-local
```
and stop the `http.server` process. Do not commit `site/exp/tractor-pickup/` (deploys go through gh-pages only with the user's OK).

---

### Task 8: Spec results, M-22 text, version 1.5.0 (section 13, M-22)

**Files:**
- Modify: `docs/tractor-pickup-spec.md`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: the test count from Task 6 (615) and the results from Task 7.
- Produces: the spec and package at 1.5.0.

- [ ] **Step 1: M-22 gets the `home` field (Decision 5)**

In section 14.4, row M-22, replace `animal (authority: host; fields: type, golden, state, owner, ownership number, position, rotation, animation, hidden, chick line)` with `animal (authority: host; fields: type, golden, home (route or yard), state, owner, ownership number, position, rotation, animation, hidden, chick line)`.

- [ ] **Step 2: Section 13**

1. In the first line of section 13, replace
```
State at version 1.8 (`npm test`: 588 tests, all pass). Version 1.7 had 490,
```
with
```
State at version 1.9 (`npm test`: 615 tests, all pass). Version 1.8 had 602, version 1.7 had 490,
```
(use the real count from `npm test` if it differs).
2. Replace the row that starts `| 1.8 M-22..M-26 Messages and smooth motion |` with:
```
| 1.9 M-22..M-27 Replicated objects, keyframes, diffs, smooth motion | `replica.test.mjs` (round trips per kind, diffs, keyframes, the store's order and ownership numbers, bad data, size limits), `interp.test.mjs`, `protocol.test.mjs`, `link.test.mjs` | Two windows with a local Handshake (`handshake:phase1`): <Task 7 points 1, 2 and 5, one sentence each> | — |
```
3. After the row that starts `| 1.8 M-39..M-44 Connection loss |`, add:
```
| 1.9 M-13, M-14, M-56..M-58 Claims and repair | `mp.test.mjs` (the answer is the replicated owner: yes, refusal, late yes, timeout, no re-boop until a keyframe), `mp.repair.test.mjs` (host frees an animal missing from a train for 3 s; an away guest keeps its animals; a lost claim, a lost answer, lost tree breaks and a 1 s loss of everything with two guests under 150 ms delay, jitter and 5 % loss: all devices agree within 3 s) | <Task 7 points 3, 4, 6 and 7, one sentence each> | A real network change (Wi-Fi to mobile data) on an iPad |
```
Replace each `<…>` with what Task 7 recorded (what was seen, plainly, in STE), or "Not checked: …" for a point that could not be done.

- [ ] **Step 3: Version**

Run: `npm version 1.5.0 --no-git-tag-version`
Expected: `v1.5.0`; `package.json` and `package-lock.json` changed.

- [ ] **Step 4: Full suite, build, commit**

```bash
npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)' && npm run build 2>&1 | tail -2
git add docs/tractor-pickup-spec.md package.json package-lock.json
git commit -m "docs: Tractor Pickup 1.5.0 - replicated objects test results (M-22, M-53, M-58)"
```
Do not commit `site/exp/tractor-pickup/`.

---

## Spec coverage (phase 1.5)

| Spec items | Tasks |
|---|---|
| 1.2.9, 14.1 terms (replicated object, kind, authority, keyframe, diff) | 1, 3 |
| M-13 claim, answer as replicated owner | 3 (host `claim` without an answer; guest `settleClaims`) |
| M-14 land after a yes, poof, 1 s hold, claim open until a keyframe | 3 (`settleClaims`, `pending` Map, `repair`), tests in 3 and 5 |
| M-22 kinds and fields; game code registers objects, no new messages | 1 (`kinds.js`, `kind()`; the `bale` test shows a new kind), 3, 8 (`home`) |
| M-23 keyframe every 2 s on reliable, at once to a new guest; diffs 15/s and 20/s on fast, binary with a time stamp; host passes trains on | 1 (frames, tracker with REPEAT), 3 (`SEND`, `lastKey = -Infinity` after hello, guest keyframe on a new roster member, `onTrain` relay) |
| M-24 events JSON, results as state; welcome = seed, version, player number | 3 (`protocol.js`, Decision 4 adds `next`) |
| M-25 smooth motion | 3 (snapshots into the unchanged `interp.js`) |
| M-26 old data and lower ownership numbers ignored; keyframe replaces | 1 (`createStore`, `ANIMAL.newer`), 3 (tests) |
| M-27 version | 3 (`NET_VERSION = 2`) |
| M-50 checks: size, ranges, ids, rate | 1 (`decodeFrame`: authority, ids, flags, quaternion, sizes), 3 (rates, 2048 JSON cap, id guard, tree id exists, train only from its owner) |
| M-53 messages and loss tests | 1, 2 (`hub.drop`), 5 |
| M-56 guest repair | 3 (`repair`, `applyTree` with `TREE_GRACE`), 5 |
| M-57 host repair | 4 |
| M-58 agree within 3 s | 5 |
| M-54 browser, section 13 | 7, 8 |
| M-37, M-38 | out of scope (phase 2) |

---

## Self-review

- **Spec coverage:** every binding item maps to a task (table above). M-41 go-alone, M-40 watchdog, M-39 away, M-19 deferred welcome and M-7 bump keep their phase 1 tests unchanged in `mp.test.mjs` and pass on the new code (checked in a scratch copy: 615 tests).
- **Placeholders:** none in code steps. The only `<…>` are Task 8's results sentences, which Task 7 produces by observation.
- **Names across tasks:** `encodeFrame`/`decodeFrame`/`isFrame`/`createTracker`/`createStore`/`REGISTRY`/`KINDS`/`ANIMAL`/`TREE`/`PLAYER`/`TRAIN`/`LIMIT` (Task 1) are the names Tasks 3–6 import; `trainRecord`, `SEND.train/world/key`, `players.push(n, time, rec, arrival)` (Task 3) are used by host and guest; `sync.store` and `pending.get(id).e0`/`.done` (Task 3) are used by the tests in Tasks 3–5; `regrowById` and `hub.drop` (Task 2) by Tasks 3–5; `REPAIR_MS`, `p.heardAt` (Task 4); `disagreements`/`settle` (Task 4) and `blackout` (Task 5) by `mp.repair.test.mjs`.
- **Counts:** 602 → 611 (Task 1) → 613 (Task 2) → 613 (Task 3: rewrites only) → 615 (Task 4) → 619 (Task 5) → 615 (Task 6: −4 codec tests).
