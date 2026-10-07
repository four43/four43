# Tractor Pickup Multiplayer (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two to four players drive their own tractors on one shared farm over WebRTC, joining with a 5-character room code (spec 1.8, section 14, phase 1).

**Architecture:** Each device simulates its own tractor, trailer, wagon and the animals it carries, and sends their poses; the host owns the free animals, trees and respawns, and grants boop claims first come (ownership numbers, M-26). All sync code talks to a small game-level link (`src/net/link.js`), so a host game and guest games run in one Node process over an in-memory hub with delay, jitter and loss; in the browser the same link wraps a `handshake.js` room. Binary messages carry positions on the fast channel, JSON carries events on the reliable channel.

**Tech Stack:** Plain ES modules, three.js 0.186, `@dimforge/rapier3d-compat` 0.21, esbuild (bundle via `build.py`), `node:test`, `qrcode-generator` (new, QR display), `handshake.js` (vendored client library from `/home/smiller/projects/four43/handshake/client/handshake.js`).

**Spec:** `games/tractor-pickup/docs/tractor-pickup-spec.md`, section 14 (M-1 to M-55). Phase 2 items M-37 (nearby list with knock) and M-38 (scan in the game) are **out of scope**.

## Global Constraints

- Work in the worktree `/home/smiller/projects/four43/four43-tractor-multiplayer` on branch `feat/tractor-multiplayer`. All paths below are relative to `games/tractor-pickup/` unless they start with `/`.
- Tests: `npm test` (runs `node --test test/`). Every task ends with the full suite passing. The baseline is 490 tests (spec 13); record the real count in Task 0.
- Commits: conventional commits (`feat:`, `fix:`, `test:`, `docs:`). **No `Co-Authored-By` trailer and no Claude attribution of any kind** (user rule).
- Single-player behavior must not change: with no room, every existing test passes unchanged and the game plays exactly as 1.3.0.
- Sim modules (`src/sim/`, `src/net/`) import no three.js and touch no DOM.
- Code style: dense lines, terse comments that cite spec IDs (`// M-14: ...`), `const` arrow helpers, no classes in game code, names as in the existing files.
- Handshake server: `https://handshake.four43.com`, app `tractor-pickup`, `NET_VERSION = 1` (sent as the Handshake `version`), rooms `public: true`, `maxPlayers: 4`, `relayUnlessNearby: true` (M-48). Room name = `'tractor-pickup-' + code`.
- Join code alphabet (from the server): `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 5 characters.
- Players have no names (M-35): player number 1 (host) to 4 and their paints.
- No network failure may stop the game or show anything to the child (M-44, R-1); errors show only in the Multiplayer panel.
- Rates: vehicle message ~20/s (every 50 ms), herd message ~15/s (every 66 ms); interpolation delay 100 ms rising to at most 300 ms (M-25); max 60 messages/s per channel per guest (M-50); claim range 8 m, tree range 12 m (M-50); claim wait 1 s at the top of the arc (M-14); away grace is the server's 30 s.
- `handshake.js` is written by a separate plan in the handshake repo. Until Task 15 no game file imports it; Task 15 copies it in. If it does not exist yet when Task 15 starts, stop and report.

## Decisions this plan makes (the spec leaves them open)

1. **Spawn places (M-10):** the spec says "8 m apart, beside the farm start". The farm start is 12 m out of the barn with the train inside the barn, so beside it is barn wall. Player `n` starts **ahead** of the start along its heading, `12 × (n − 1)` m (a train is about 10 m long), shifted sideways by 8 m steps only when that spot is blocked. Task 16 updates M-10's text.
2. **Claim timeout (M-14):** if no answer comes in the 1 s hold, the guest treats it as a refusal (poof) and sends `release`, so the host frees the animal if it had granted it late.
3. **Going alone with a claim pending (M-41):** pending claims count as granted (the host is gone, so nobody else has the animal).
4. **Soft bump (M-7):** done in sim code, not Rapier: each tractor is a capsule along its heading; on overlap the own tractor's velocity gets at least 2 m/s away from the other, with a 0.6 s cooldown. No colliders for other tractors.
5. **Rebuild on every welcome:** a guest always rebuilds the farm from the welcome (also for the same seed), so no solo riders carry into a room. The host re-sends a welcome to every guest after its own new farm (M-19).
6. **Who renders whom:** every device keeps every animal id in its herd. Animals another player carries get state `'carried'` (drawn from that player's vehicle messages); animals this device knows nothing current about get `'elsewhere'` (not drawn, not free). Both are added to the herd's not-free states.
7. **Host relays guests' vehicle messages** byte for byte, after overwriting byte 1 (player number) with the sender's real number.
8. **QR library:** `qrcode-generator` (MIT, ~20 KB minified, no dependencies).

---

## File Structure

New files:

| File | Responsibility |
|---|---|
| `src/net/codec.js` | Binary vehicle (M-22) and herd (M-23) messages: encode, decode, validate, size limits |
| `src/net/protocol.js` | `NET_VERSION`, JSON message checks for both directions (M-24, M-50), per-channel rate limiter |
| `src/net/link.js` | Link shape and emitter, in-memory hub (delay/jitter/loss), `withLag`, `parseLag` (M-28), `roomLink` adapter for a handshake room |
| `src/net/interp.js` | Interpolation buffer: clock offset, adaptive delay (M-25), old-message drop (M-26), pose and angle lerp |
| `src/net/players.js` | Other players as this device sees them: number, paints, away, interpolated poses, carried animals |
| `src/net/host.js` | Host sync: welcome, roster, claims, deliveries, trees, horn, help, relay, validation, away/left |
| `src/net/guest.js` | Guest sync: hello, apply welcome and snapshots, claims, events, host away, alone on the same farm |
| `src/net/session.js` | Browser-side controller: Handshake room ↔ link ↔ sync, panel view state, room-name parsing, errors |
| `src/sim/bump.js` | M-7 soft bump (pure) |
| `src/sim/spawn.js` | M-10 spawn places (pure) |
| `src/render/others3d.js` | Draws the other tractors and trains in their paints, ghosted when away |
| `src/ui/qr.js` | `qrSvg(text)` from `qrcode-generator` |
| `src/net/handshake.js` | Vendored copy of the handshake client (Task 15) |
| `test/codec.test.mjs`, `test/link.test.mjs`, `test/interp.test.mjs`, `test/protocol.test.mjs`, `test/bump.test.mjs`, `test/spawn.test.mjs`, `test/session.test.mjs`, `test/mp.test.mjs` | Tests |
| `test/mp.harness.mjs` | Two-games-in-one-process harness (M-52). It sits in `test/`, so `node --test` loads it; it defines no tests and has no side effects. |

Modified files:

| File | Change |
|---|---|
| `src/sim/herd.js` | nearest of several tractors, `remote` flag, `ensure()`, `epoch`, states `carried` / `elsewhere` |
| `src/sim/slots.js` | `load.release(slot)` with repack |
| `src/sim/launch.js` | export `SPLIT` |
| `src/sim/trees.js` | `breakById()`, `brokenIds()` |
| `src/sim/tractor.js` | export `TRACTOR_WHEELS` (wheel layout as data) |
| `src/sim/game.js` | `player` option and spawn, `others`, `claims`, `boopsPaused`, flight hold, `resolveClaim`, exported `fullDodge`, no respawn/dodge when the herd is remote |
| `src/render/vehicles3d.js` | `setGhost(on)`, `dispose()` |
| `src/render/animals3d.js` | draw `carried`, hide `elsewhere`, rebuild a view when type/golden changes |
| `src/audio/sound.js` | `horn(v = 1)` volume |
| `src/ui/menus.js` | Multiplayer button (P-10) and panel (M-29 to M-34), New farm disabled for a guest |
| `template.html` | panel CSS |
| `src/main.js` | wire session, sync, render, events, `?r=`, `?signal=`, `?lag=` |
| `package.json` | `qrcode-generator` dependency; version 1.4.0 |
| `docs/tractor-pickup-spec.md` | M-10 text, section 13 test results |

---

## Milestone A: Network building blocks (pure, no game changes)

### Task 0: Worktree setup and baseline

**Files:** none

- [ ] **Step 1: Install dependencies** (the new worktree has no `node_modules`)

Run: `cd /home/smiller/projects/four43/four43-tractor-multiplayer/games/tractor-pickup && npm ci`
Expected: installs without errors.

- [ ] **Step 2: Baseline test run**

Run: `npm test 2>&1 | tail -8`
Expected: all pass. Write the `# pass` count into your task notes; every later task must end with that count plus the new tests.

### Task 1: Binary codec (M-22, M-23, M-50, M-53)

**Files:**
- Create: `src/net/codec.js`
- Test: `test/codec.test.mjs`

**Interfaces:**
- Produces:
  - `KIND = { VEHICLE: 1, HERD: 2 }`, `TYPE_LIST` (wire order of `Object.keys(TYPES)`), `ANIMS = ['idle','walk','run','eat','dance']`, `MODES = ['drive','show','held']`, `LIMIT = { carried: 16, herd: 96, coord: 400, height: 50 }`
  - `kindOf(buf) -> 1|2|0`
  - `encodeVehicle(m) -> ArrayBuffer`, `decodeVehicle(buf) -> m | null` where `m = { player: 1..4, time: ms (uint32), mode: 'drive'|'show'|'held', full: bool, bodies: [{ p: {x,y,z}, q: {x,y,z,w} }] × 3 (tractor, trailer, wagon), carried: [{ id, type, golden, flying, riding, x, y, z, yaw }] }`
  - `encodeHerd(m) -> ArrayBuffer`, `decodeHerd(buf) -> m | null` where `m = { time, animals: [{ id, epoch, type, golden, hidden, busy, x, y, z, yaw, anim, leader (null|id), line }] }`

- [ ] **Step 1: Write the failing test**

```js
// test/codec.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeVehicle, decodeVehicle, encodeHerd, decodeHerd, kindOf, KIND, LIMIT, TYPE_LIST } from '../src/net/codec.js';

const q = (a = 0.3) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const veh = (n = 2) => ({ player: 2, time: 123456, mode: 'drive', full: true,
  bodies: [{ p: { x: 10.5, y: 0.8, z: -3 }, q: q() }, { p: { x: 7, y: 0.5, z: -3 }, q: q(0.2) }, { p: { x: 4, y: 0.5, z: -3 }, q: q(0.1) }],
  carried: Array.from({ length: n }, (_, i) => ({ id: 30 + i, type: TYPE_LIST[i % TYPE_LIST.length], golden: i === 0, flying: i === 1, riding: i !== 1, x: 5 + i, y: 1.2, z: -2, yaw: 1.5 })) });
const herd = n => ({ time: 99, animals: Array.from({ length: n }, (_, i) => ({ id: i, epoch: 3 + i, type: 'pig', golden: false, hidden: i === 2, busy: i === 3, x: i * 2, y: 0, z: -i, yaw: 6, anim: 'walk', leader: i === 4 ? 1 : null, line: i === 4 ? 1 : 0 })) });
const near = (a, b, e, msg) => assert.ok(Math.abs(a - b) <= e, `${msg}: ${a} vs ${b}`);

test('a vehicle message round-trips with quantized rotations (M-22, M-53)', () => {
  const m = veh(3), d = decodeVehicle(encodeVehicle(m));
  assert.equal(kindOf(encodeVehicle(m)), KIND.VEHICLE);
  assert.equal(d.player, 2); assert.equal(d.time, 123456); assert.equal(d.mode, 'drive'); assert.equal(d.full, true);
  m.bodies.forEach((b, i) => { for (const k of 'xyz') near(d.bodies[i].p[k], b.p[k], 1e-4, 'p' + k); for (const k of 'xyzw') near(d.bodies[i].q[k], b.q[k], 1e-3, 'q' + k); });
  assert.equal(d.carried.length, 3);
  assert.deepEqual(d.carried.map(c => [c.id, c.type, c.golden, c.flying, c.riding]), m.carried.map(c => [c.id, c.type, c.golden, c.flying, c.riding]));
  near(d.carried[2].yaw, 1.5, 1e-3, 'yaw');
});
test('a herd message round-trips with ownership numbers and leaders (M-23, M-26)', () => {
  const m = herd(5), d = decodeHerd(encodeHerd(m));
  assert.equal(kindOf(encodeHerd(m)), KIND.HERD); assert.equal(d.time, 99); assert.equal(d.animals.length, 5);
  assert.deepEqual(d.animals.map(a => [a.id, a.epoch, a.hidden, a.busy, a.leader, a.line, a.anim]), m.animals.map(a => [a.id, a.epoch, a.hidden, a.busy, a.leader, a.line, a.anim]));
  near(d.animals[4].x, 8, 1e-5, 'x'); near(d.animals[1].yaw, 6, 1e-3, 'yaw');
});
test('messages stay small: a full train and a large herd', () => {
  assert.ok(encodeVehicle(veh(12)).byteLength <= 300);
  assert.ok(encodeHerd(herd(40)).byteLength <= 1100);
});
test('bad messages decode to null (M-50)', () => {
  const good = encodeVehicle(veh(2));
  assert.equal(decodeVehicle(good.slice(0, good.byteLength - 1)), null, 'truncated');
  const longer = new Uint8Array(good.byteLength + 1); longer.set(new Uint8Array(good)); assert.equal(decodeVehicle(longer.buffer), null, 'extra bytes');
  assert.equal(decodeVehicle(encodeHerd(herd(1))), null, 'wrong kind');
  assert.equal(decodeHerd(new ArrayBuffer(0)), null, 'empty');
  assert.equal(decodeVehicle('hello'), null, 'not binary');
  const nan = veh(1); nan.bodies[0].p.x = NaN; assert.equal(decodeVehicle(encodeVehicle(nan)), null, 'NaN');
  const far = veh(1); far.carried[0].x = LIMIT.coord + 1; assert.equal(decodeVehicle(encodeVehicle(far)), null, 'out of the farm');
  const p5 = veh(1); p5.player = 5; assert.equal(decodeVehicle(encodeVehicle(p5)), null, 'player 5');
  const badType = new Uint8Array(encodeVehicle(veh(1))); badType[8 + 60 + 1 + 2] = 200; assert.equal(decodeVehicle(badType.buffer), null, 'type index');
  assert.throws(() => encodeHerd(herd(LIMIT.herd + 1)), /too many/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/codec.test.mjs`
Expected: FAIL with `Cannot find module '.../src/net/codec.js'`.

- [ ] **Step 3: Write the implementation**

```js
// src/net/codec.js
// Binary messages on the fast channel (M-21): the vehicle message (M-22) and the herd message (M-23). Little-endian.
// Positions are float32, body rotations int16 quaternions (x 32767), yaws uint16 over a full turn. decode* checks everything
// (M-50) and returns null for anything odd: a bad message is dropped, never thrown.
import { TYPES } from '../sim/herd.js';

export const KIND = { VEHICLE: 1, HERD: 2 };
export const TYPE_LIST = Object.keys(TYPES), ANIMS = ['idle', 'walk', 'run', 'eat', 'dance'], MODES = ['drive', 'show', 'held'];
export const LIMIT = { carried: 16, herd: 96, coord: 400, height: 50 };
const TAU = Math.PI * 2, BODY = 20, CARRIED = 18, ANIMAL = 26, VHEAD = 8, HHEAD = 7, NONE = 0xffff;
export const kindOf = buf => buf instanceof ArrayBuffer && buf.byteLength > 0 ? new Uint8Array(buf)[0] : 0;
const yawOut = y => Math.round((((y % TAU) + TAU) % TAU) / TAU * 65535);
const yawIn = v => v / 65535 * TAU;
const okXZ = v => Number.isFinite(v) && Math.abs(v) <= LIMIT.coord, okY = v => Number.isFinite(v) && Math.abs(v) <= LIMIT.height;

// vehicle: kind u8, player u8, time u32, mode u8, flags u8 (1 full), 3 x body (p f32 x3, q i16 x4), count u8, carried x count
// carried: id u16, type u8, flags u8 (1 golden, 2 flying, 4 riding), x y z f32, yaw u16
export function encodeVehicle(m) {
  if (m.carried.length > LIMIT.carried) throw new Error('too many carried animals');
  const buf = new ArrayBuffer(VHEAD + 3 * BODY + 1 + m.carried.length * CARRIED), v = new DataView(buf); let o = 0;
  v.setUint8(o++, KIND.VEHICLE); v.setUint8(o++, m.player); v.setUint32(o, m.time >>> 0, true); o += 4; v.setUint8(o++, MODES.indexOf(m.mode)); v.setUint8(o++, m.full ? 1 : 0);
  for (const b of m.bodies) { for (const k of 'xyz') { v.setFloat32(o, b.p[k], true); o += 4; } for (const k of 'xyzw') { v.setInt16(o, Math.round(Math.max(-1, Math.min(1, b.q[k])) * 32767), true); o += 2; } }
  v.setUint8(o++, m.carried.length);
  for (const c of m.carried) {
    v.setUint16(o, c.id, true); o += 2; v.setUint8(o++, TYPE_LIST.indexOf(c.type)); v.setUint8(o++, (c.golden ? 1 : 0) | (c.flying ? 2 : 0) | (c.riding ? 4 : 0));
    for (const k of 'xyz') { v.setFloat32(o, c[k], true); o += 4; } v.setUint16(o, yawOut(c.yaw), true); o += 2;
  }
  return buf;
}
export function decodeVehicle(buf) {
  if (kindOf(buf) !== KIND.VEHICLE || buf.byteLength < VHEAD + 3 * BODY + 1) return null;
  const v = new DataView(buf); let o = 1;
  const player = v.getUint8(o++), time = v.getUint32(o, true); o += 4; const mode = MODES[v.getUint8(o++)], full = (v.getUint8(o++) & 1) === 1;
  if (player < 1 || player > 4 || !mode) return null;
  const bodies = [];
  for (let i = 0; i < 3; i++) {
    const p = {}, q = {}; for (const k of 'xyz') { p[k] = v.getFloat32(o, true); o += 4; } for (const k of 'xyzw') { q[k] = v.getInt16(o, true) / 32767; o += 2; }
    const n = Math.hypot(q.x, q.y, q.z, q.w); if (!okXZ(p.x) || !okXZ(p.z) || !okY(p.y) || n < 0.9 || n > 1.1) return null;
    q.x /= n; q.y /= n; q.z /= n; q.w /= n; bodies.push({ p, q });
  }
  const count = v.getUint8(o++); if (count > LIMIT.carried || buf.byteLength !== o + count * CARRIED) return null;
  const carried = [];
  for (let i = 0; i < count; i++) {
    const id = v.getUint16(o, true); o += 2; const type = TYPE_LIST[v.getUint8(o++)], f = v.getUint8(o++), c = { id, type, golden: !!(f & 1), flying: !!(f & 2), riding: !!(f & 4) };
    for (const k of 'xyz') { c[k] = v.getFloat32(o, true); o += 4; } c.yaw = yawIn(v.getUint16(o, true)); o += 2;
    if (!type || !okXZ(c.x) || !okXZ(c.z) || !okY(c.y)) return null;
    carried.push(c);
  }
  return { player, time, mode, full, bodies, carried };
}
// herd: kind u8, time u32, count u16, animals x count
// animal: id u16, epoch u32, type u8, flags u8 (1 golden, 2 hidden, 4 busy), x y z f32, yaw u16, anim u8, leader u16 (0xffff none), line u8
export function encodeHerd(m) {
  if (m.animals.length > LIMIT.herd) throw new Error('too many animals');
  const buf = new ArrayBuffer(HHEAD + m.animals.length * ANIMAL), v = new DataView(buf); let o = 0;
  v.setUint8(o++, KIND.HERD); v.setUint32(o, m.time >>> 0, true); o += 4; v.setUint16(o, m.animals.length, true); o += 2;
  for (const a of m.animals) {
    v.setUint16(o, a.id, true); o += 2; v.setUint32(o, a.epoch >>> 0, true); o += 4; v.setUint8(o++, TYPE_LIST.indexOf(a.type));
    v.setUint8(o++, (a.golden ? 1 : 0) | (a.hidden ? 2 : 0) | (a.busy ? 4 : 0));
    for (const k of 'xyz') { v.setFloat32(o, a[k] || 0, true); o += 4; } v.setUint16(o, yawOut(a.yaw), true); o += 2;
    v.setUint8(o++, Math.max(0, ANIMS.indexOf(a.anim))); v.setUint16(o, a.leader ?? NONE, true); o += 2; v.setUint8(o++, a.line || 0);
  }
  return buf;
}
export function decodeHerd(buf) {
  if (kindOf(buf) !== KIND.HERD || buf.byteLength < HHEAD) return null;
  const v = new DataView(buf); let o = 1; const time = v.getUint32(o, true); o += 4; const count = v.getUint16(o, true); o += 2;
  if (count > LIMIT.herd || buf.byteLength !== HHEAD + count * ANIMAL) return null;
  const animals = [];
  for (let i = 0; i < count; i++) {
    const id = v.getUint16(o, true); o += 2; const epoch = v.getUint32(o, true); o += 4; const type = TYPE_LIST[v.getUint8(o++)], f = v.getUint8(o++);
    const a = { id, epoch, type, golden: !!(f & 1), hidden: !!(f & 2), busy: !!(f & 4) };
    for (const k of 'xyz') { a[k] = v.getFloat32(o, true); o += 4; } a.yaw = yawIn(v.getUint16(o, true)); o += 2;
    a.anim = ANIMS[v.getUint8(o++)]; const leader = v.getUint16(o, true); o += 2; a.leader = leader === NONE ? null : leader; a.line = v.getUint8(o++);
    if (!type || !a.anim || !okXZ(a.x) || !okXZ(a.z) || !okY(a.y)) return null;
    animals.push(a);
  }
  return { time, animals };
}
```

The type-index test writes byte 71: `VHEAD` (8: kind, player, time ×4, mode, flags) + 3 bodies (60) + count (1) + id (2).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/codec.test.mjs`
Expected: 4 tests pass.

- [ ] **Step 5: Full suite and commit**

Run: `npm test 2>&1 | tail -4` — expected: all pass.

```bash
git add src/net/codec.js test/codec.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - binary vehicle and herd messages (M-22, M-23)"
```

### Task 2: Link, in-memory hub, lag and room adapter (M-20, M-21, M-28)

**Files:**
- Create: `src/net/link.js`
- Test: `test/link.test.mjs`

**Interfaces:**
- Produces:
  - `emitter() -> { on(e, f), off(e, f), emit(e, ...args) }`
  - A **net** (the only thing sync code sees): `{ isHost: bool, id: string, hostId: string, send(to, data, reliable = false), on(event, fn), off(event, fn), leave() }`. Events: `'peer'(id)` (a connection opened: on a guest, `id` is the host), `'message'(from, data, reliable)`, `'peerAway'(id)`, `'peerBack'(id)`, `'peerLeft'(id, reason)`, `'hostAway'()`, `'hostBack'()`, `'closed'(reason)`.
  - `createMemoryHub({ delay = 0, jitter = 0, loss = 0, rng = Math.random }) -> hub` with `host() -> net`, `join() -> net`, `tick(nowMs)`, `away(id)`, `back(id)`, `leave(id, reason)`, `get now`.
  - `parseLag(str) -> { delay, jitter, loss } | null`, `withLag(net, lag, { rng = Math.random, timer = setTimeout } = {}) -> net`
  - `roomLink(room) -> net` (room = a handshake `Room`, see the contract below)
- Handshake `Room` contract used by `roomLink` (from the handshake plan): `code, key, isHost, you, hostId, locked, closed, members, peers: Map<id, Peer>`, `on(event, fn)` with `'peer'(Peer)`, `'peerLeft'(id, reason)`, `'peerAway'(id)`, `'peerBack'(id)`, `'hostAway'(graceSecs)`, `'hostBack'()`, `'members'(members)`, `'meta'({meta, locked})`, `'closed'(reason)` — reasons include `'kicked'`, `'left'`, `'replaced'` and `'lost'` (a resume found the room gone); every reason means the room is over (a guest goes on alone, M-41); `lock(bool)`, `kick(peerId)`, `leave()`. `Peer`: `id, nearby, connectionType, open, send(data, { reliable }) -> bool` (false when the channel is not open; **throws TypeError for a plain object on the unreliable channel**, so the adapter sends only ArrayBuffers on the fast channel), `on('message', (data, { reliable }) => ...)`, `on('type', t => ...)`, `on('close', ...)`.

- [ ] **Step 1: Write the failing test**

```js
// test/link.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryHub, parseLag, withLag, roomLink, emitter } from '../src/net/link.js';
import { makeRng } from '../src/sim/rng.js';

const record = net => { const log = []; for (const e of ['peer', 'message', 'peerAway', 'peerBack', 'peerLeft', 'hostAway', 'hostBack', 'closed']) net.on(e, (...a) => log.push([e, ...a])); return log; };

test('the hub connects a host and guests in a star; messages arrive after the delay (M-20)', () => {
  const hub = createMemoryHub({ delay: 100 }), h = hub.host(), hl = record(h), g = hub.join(), gl = record(g), g2 = hub.join();
  hub.tick(0);
  assert.deepEqual(hl.filter(e => e[0] === 'peer').map(e => e[1]), [g.id, g2.id]);
  assert.deepEqual(gl.filter(e => e[0] === 'peer').map(e => e[1]), [h.id]);
  g.send(h.id, { t: 'hello' }, true); g.send(g2.id, { t: 'nope' }, true); // guests reach only the host
  hub.tick(99); assert.equal(hl.filter(e => e[0] === 'message').length, 0);
  hub.tick(100); assert.deepEqual(hl.filter(e => e[0] === 'message').map(e => e.slice(1)), [[g.id, { t: 'hello' }, true]]);
});
test('binary data is copied, and the reliable channel keeps the order under jitter (M-21)', () => {
  const hub = createMemoryHub({ delay: 50, jitter: 200, rng: makeRng(4) }), h = hub.host(), g = hub.join(), got = [];
  h.on('message', (from, d, rel) => got.push(rel ? d.n : new Uint8Array(d)[0]));
  hub.tick(0);
  const b = new Uint8Array([7]).buffer; g.send(h.id, b); new Uint8Array(b)[0] = 9; // the sender changes its buffer afterwards
  for (let n = 0; n < 20; n++) g.send(h.id, { n }, true);
  hub.tick(1000);
  assert.ok(got.includes(7)); assert.deepEqual(got.filter(x => x !== 7), Array.from({ length: 20 }, (_, n) => n));
});
test('loss drops only fast-channel messages', () => {
  const hub = createMemoryHub({ loss: 1 }), h = hub.host(), g = hub.join(); let fast = 0, rel = 0;
  h.on('message', (f, d, r) => r ? rel++ : fast++); hub.tick(0);
  for (let i = 0; i < 10; i++) { g.send(h.id, new ArrayBuffer(1)); g.send(h.id, { i }, true); }
  hub.tick(10); assert.equal(fast, 0); assert.equal(rel, 10);
});
test('away, back, leave and the host leaving (M-39, M-40)', () => {
  const hub = createMemoryHub(), h = hub.host(), hl = record(h), g = hub.join(), gl = record(g); hub.tick(0);
  hub.away(g.id); hub.tick(1); assert.ok(hl.some(e => e[0] === 'peerAway' && e[1] === g.id));
  g.send(h.id, { t: 'lost' }, true); hub.tick(2); assert.ok(!hl.some(e => e[0] === 'message'), 'an away device sends nothing');
  hub.back(g.id); hub.tick(3); assert.ok(hl.some(e => e[0] === 'peerBack'));
  hub.away(h.id); hub.tick(4); assert.ok(gl.some(e => e[0] === 'hostAway'));
  hub.back(h.id); hub.tick(5); assert.ok(gl.some(e => e[0] === 'hostBack'));
  g.leave(); hub.tick(6); assert.ok(hl.some(e => e[0] === 'peerLeft' && e[1] === g.id && e[2] === 'left')); assert.ok(gl.some(e => e[0] === 'closed' && e[1] === 'left'));
  const g2 = hub.join(), g2l = record(g2); hub.tick(7); hub.leave(h.id, 'left'); hub.tick(8); assert.ok(g2l.some(e => e[0] === 'closed' && e[1] === 'host_left'));
});
test('parseLag reads ?lag=ms[,jitter[,loss%]] and clamps it (M-28)', () => {
  assert.deepEqual(parseLag('300'), { delay: 300, jitter: 0, loss: 0 });
  assert.deepEqual(parseLag('300,80,5'), { delay: 300, jitter: 80, loss: 0.05 });
  assert.deepEqual(parseLag('99999,99999,99'), { delay: 5000, jitter: 2000, loss: 0.5 });
  for (const bad of [null, '', 'abc', '-5', '1,x']) assert.equal(parseLag(bad), null, String(bad));
});
test('withLag delays sends and received messages on this device (M-28)', () => {
  const hub = createMemoryHub(), h = hub.host(), g = hub.join(), timers = [];
  const timer = (fn, ms) => timers.push({ fn, ms }), lg = withLag(g, { delay: 300, jitter: 0, loss: 0 }, { timer });
  let got = 0; h.on('message', () => got++); hub.tick(0);
  lg.send(h.id, { a: 1 }, true); hub.tick(1); assert.equal(got, 0); assert.equal(timers[0].ms, 300);
  timers.shift().fn(); hub.tick(2); assert.equal(got, 1);
  let back = 0; lg.on('message', () => back++); h.send(g.id, { b: 1 }, true); hub.tick(3); assert.equal(back, 0); timers.shift().fn(); assert.equal(back, 1);
});
test('roomLink turns a handshake room into a net', () => {
  const room = Object.assign(emitter(), { isHost: false, you: 'g1', hostId: 'h1', peers: new Map(), leave() { this.left = true; } });
  const peer = Object.assign(emitter(), { id: 'h1', open: true, sent: [], send(d, o) { this.sent.push([d, o.reliable]); } });
  const net = roomLink(room), log = record(net);
  room.peers.set('h1', peer); room.emit('peer', peer);
  peer.emit('message', { t: 'welcome' }, { reliable: true });
  net.send('h1', { t: 'claim' }, true); net.send('nobody', { t: 'x' }, true); net.send('h1', { t: 'json on the fast channel' }, false);
  room.emit('hostAway', 30); room.emit('closed', 'kicked'); net.leave();
  assert.deepEqual(log.map(e => e[0]), ['peer', 'message', 'hostAway', 'closed']);
  assert.deepEqual(log[1], ['message', 'h1', { t: 'welcome' }, true]);
  assert.deepEqual(peer.sent, [[{ t: 'claim' }, true]]); assert.ok(room.left);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/link.test.mjs` — Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```js
// src/net/link.js
// The game-level link (M-20, M-21). Sync code (host.js, guest.js) talks only to a "net", never to handshake.js, so a host and guests
// run in one Node process over the in-memory hub (M-52). A net: { isHost, id, hostId, send(to, data, reliable), on, off, leave }.
// Events: peer(id), message(from, data, reliable), peerAway(id), peerBack(id), peerLeft(id, reason), hostAway(), hostBack(), closed(reason).
export function emitter() {
  const m = new Map();
  return { on(e, f) { if (!m.has(e)) m.set(e, new Set()); m.get(e).add(f); }, off(e, f) { m.get(e)?.delete(f); }, emit(e, ...a) { for (const f of [...(m.get(e) || [])]) f(...a); } };
}
const copy = d => d instanceof ArrayBuffer ? d.slice(0) : JSON.parse(JSON.stringify(d)); // what the wire does: the receiver never shares the sender's object

// In-memory star with delay, jitter and loss (fast channel only). Reliable messages keep their order per sender and receiver.
export function createMemoryHub({ delay = 0, jitter = 0, loss = 0, rng = Math.random } = {}) {
  const ends = new Map(), queue = [], lastRel = new Map(); let now = 0, seq = 0, n = 0, hostId = null;
  const later = (at, fn) => queue.push({ at, seq: seq++, fn });
  const event = (id, e, ...a) => later(now, () => ends.get(id)?.ev.emit(e, ...a));
  const guests = () => [...ends.values()].filter(e => !e.isHost);
  function endpoint(isHost) {
    const id = (isHost ? 'h' : 'g') + ++n, ev = emitter(), e = { id, isHost, up: true, ev };
    e.net = { isHost, id, get hostId() { return hostId; }, on: ev.on, off: ev.off, leave: () => hub.leave(id, 'left'),
      send(to, data, reliable = false) {
        const dst = ends.get(to); if (!dst || !e.up || to === id || (!isHost && to !== hostId)) return; // star: guests reach only the host
        if (!reliable && rng() < loss) return;
        let at = now + delay + (jitter ? rng() * jitter : 0); const k = id + '>' + to;
        if (reliable) { at = Math.max(at, lastRel.get(k) ?? 0); lastRel.set(k, at); }
        const d = copy(data); later(at, () => { const r = ends.get(to); if (r?.up) r.ev.emit('message', id, d, reliable); });
      } };
    ends.set(id, e); return e;
  }
  const hub = {
    get now() { return now; },
    host() { const e = endpoint(true); hostId = e.id; return e.net; },
    join() { const e = endpoint(false); event(hostId, 'peer', e.id); event(e.id, 'peer', hostId); return e.net; },
    tick(t) { now = t; queue.sort((a, b) => a.at - b.at || a.seq - b.seq); while (queue.length && queue[0].at <= now) queue.shift().fn(); },
    away(id) { const e = ends.get(id); if (!e) return; e.up = false; if (e.isHost) for (const g of guests()) event(g.id, 'hostAway'); else event(hostId, 'peerAway', id); },
    back(id) { const e = ends.get(id); if (!e) return; e.up = true; if (e.isHost) for (const g of guests()) event(g.id, 'hostBack'); else event(hostId, 'peerBack', id); },
    leave(id, reason = 'left') { // a leaving host closes the room for everyone (as Handshake does); a guest's closed event is queued before its endpoint goes
      const e = ends.get(id); if (!e) return;
      if (e.isHost) { for (const g of guests()) later(now, () => { g.ev.emit('closed', 'host_left'); ends.delete(g.id); }); ends.delete(id); }
      else { ends.delete(id); later(now, () => e.ev.emit('closed', reason)); event(hostId, 'peerLeft', id, reason); }
    },
  };
  return hub;
}
```

Then the rest of the file:

```js
// M-28: ?lag=ms[,jitter[,loss%]] — test the feel of a far network at home
export function parseLag(s) {
  if (typeof s !== 'string' || !/^\d+(,\d+(,\d+)?)?$/.test(s.trim())) return null;
  const [d, j = 0, l = 0] = s.trim().split(',').map(Number);
  return { delay: Math.min(5000, d), jitter: Math.min(2000, j), loss: Math.min(50, l) / 100 };
}
// Delays this device's sends and received messages; drops a fraction of fast-channel sends. Reliable sends keep their order.
export function withLag(net, { delay, jitter, loss }, { rng = Math.random, timer = setTimeout } = {}) {
  const wait = () => delay + (jitter ? rng() * jitter : 0); let lastOut = 0, lastIn = 0;
  const ordered = (last, set) => { const now = Date.now(), at = Math.max(now + wait(), last); set(at); return at - now; };
  const wrapped = new Map();
  return { ...net, get hostId() { return net.hostId; },
    send(to, data, reliable = false) { if (!reliable && rng() < loss) return; const ms = reliable ? ordered(lastOut, v => { lastOut = v; }) : wait(); timer(() => net.send(to, data, reliable), ms); },
    on(e, f) { if (e !== 'message') return net.on(e, f); const g = (from, d, rel) => timer(() => f(from, d, rel), rel ? ordered(lastIn, v => { lastIn = v; }) : wait()); wrapped.set(f, g); net.on(e, g); },
    off(e, f) { net.off(e, wrapped.get(f) || f); wrapped.delete(f); } };
}
// A handshake Room (vendored src/net/handshake.js, Task 15) as a net
export function roomLink(room) {
  const ev = emitter(), seen = new Set();
  const attach = p => { if (seen.has(p.id)) return; seen.add(p.id); p.on('message', (d, o) => ev.emit('message', p.id, d, !!o?.reliable)); ev.emit('peer', p.id); };
  room.on('peer', attach); for (const p of room.peers.values()) if (p.open) attach(p);
  room.on('peerLeft', (id, why) => { seen.delete(id); ev.emit('peerLeft', id, why); });
  for (const e of ['peerAway', 'peerBack', 'hostBack', 'closed']) room.on(e, (...a) => ev.emit(e, ...a));
  room.on('hostAway', () => ev.emit('hostAway'));
  return { isHost: room.isHost, id: room.you, get hostId() { return room.hostId; }, on: ev.on, off: ev.off, leave: () => room.leave(),
    send(to, data, reliable = false) { // binary on the fast channel, JSON only on the reliable one (the library throws otherwise); send() is false when the channel is closed
      if (!reliable && !(data instanceof ArrayBuffer)) return; const p = room.peers.get(to); if (!p?.open) return; try { p.send(data, { reliable }); } catch (e) { console.warn('send', e); } } };
}
```

The `withLag` test uses a fake `timer`; `ordered()` reads `Date.now()` and returns `max(now + wait, last) - now`, which is 300 for the first send. Good.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/link.test.mjs` — Expected: 7 pass.

- [ ] **Step 5: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/net/link.js test/link.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - game link, in-memory hub, lag test (M-20, M-28)"
```

### Task 3: Interpolation buffer (M-25, M-26)

**Files:**
- Create: `src/net/interp.js`
- Test: `test/interp.test.mjs`

**Interfaces:**
- Produces:
  - `DELAY = { min: 100, max: 300 }`
  - `createInterp({ size = 32 }) -> { push(senderT, arrival, frame) -> bool, sample(now) -> { a, b, k, at } | null, reset(), get delay, get jitter, get latest }` — `push` returns false for a message not newer than the last one (M-26). `sample` returns the two frames around `now - offset - delay` and the fraction `k` (0..1), holding the newest frame when it runs out (no extrapolation); `at` is the playback time in the sender's clock.
  - `lerp(a, b, k)`, `lerpAngle(a, b, k)`, `lerpPose(pa, pb, k, out)` for `{ p: {x,y,z}, q: {x,y,z,w} }` (normalized lerp of the shorter quaternion arc).

- [ ] **Step 1: Write the failing test**

```js
// test/interp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterp, DELAY, lerpAngle, lerpPose } from '../src/net/interp.js';
import { makeRng } from '../src/sim/rng.js';

test('plays back 100 ms behind the sender, between the two frames around that time (M-25)', () => {
  const it = createInterp(), lat = 40; // one-way delay; the receiver's clock is 5000 ms ahead of the sender's
  for (let t = 0; t <= 1000; t += 50) it.push(t, t + 5000 + lat, { x: t / 100 });
  const s = it.sample(1000 + 5000 + lat); // sender time 1000 has just arrived
  assert.equal(it.delay, DELAY.min);
  assert.ok(Math.abs(s.at - 900) < 1e-6, `at ${s.at}`);
  assert.equal(s.a.x, 9); assert.equal(s.b.x, 9.5); assert.ok(Math.abs(s.k) < 1e-6);
});
test('old and repeated messages are ignored (M-26)', () => {
  const it = createInterp();
  assert.equal(it.push(100, 100, {}), true); assert.equal(it.push(100, 120, {}), false); assert.equal(it.push(50, 130, {}), false);
});
test('holds the newest frame when messages stop', () => {
  const it = createInterp(); it.push(0, 0, { x: 0 }); it.push(50, 50, { x: 1 });
  const s = it.sample(10000); assert.equal(s.a.x, 1); assert.equal(s.b.x, 1);
});
test('the delay grows with jitter, up to 300 ms (M-25)', () => {
  const r = makeRng(3), calm = createInterp(), rough = createInterp(), wild = createInterp();
  for (let t = 0; t < 5000; t += 50) { calm.push(t, t + 30, {}); rough.push(t, t + 30 + r.next() * 60, {}); wild.push(t, t + 30 + r.next() * 600, {}); }
  assert.equal(calm.delay, 100); assert.ok(rough.delay > 100 && rough.delay < 300, `rough ${rough.delay}`); assert.equal(wild.delay, 300);
});
test('angles and poses lerp the short way', () => {
  assert.ok(Math.abs(lerpAngle(6.2, 0.1, 0.5) - 6.2 - (0.1 + 2 * Math.PI - 6.2) / 2) < 1e-9);
  const qa = { x: 0, y: 0, z: 0, w: 1 }, qb = { x: 0, y: 0, z: 0, w: -1 }; // the same rotation
  const out = { p: {}, q: {} }; lerpPose({ p: { x: 0, y: 0, z: 0 }, q: qa }, { p: { x: 2, y: 0, z: 0 }, q: qb }, 0.5, out);
  assert.equal(out.p.x, 1); assert.ok(Math.abs(Math.abs(out.q.w) - 1) < 1e-9);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/interp.test.mjs` — Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```js
// src/net/interp.js
// M-25: remote things show about 100 ms behind their sender's time stamps and move smoothly between two messages; when messages
// arrive unevenly the delay grows, up to 300 ms. M-26: a message not newer than the last one is ignored.
// The clock offset (receiver minus sender) follows the least-delayed message, and creeps up slowly so clock drift cannot freeze it.
export const DELAY = { min: 100, max: 300 };
export const lerp = (a, b, k) => a + (b - a) * k;
export const lerpAngle = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
export function lerpPose(pa, pb, k, out) {
  out.p.x = lerp(pa.p.x, pb.p.x, k); out.p.y = lerp(pa.p.y, pb.p.y, k); out.p.z = lerp(pa.p.z, pb.p.z, k);
  const a = pa.q, b = pb.q, s = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const x = lerp(a.x, s * b.x, k), y = lerp(a.y, s * b.y, k), z = lerp(a.z, s * b.z, k), w = lerp(a.w, s * b.w, k), n = Math.hypot(x, y, z, w) || 1;
  out.q.x = x / n; out.q.y = y / n; out.q.z = z / n; out.q.w = w / n; return out;
}
export function createInterp({ size = 32 } = {}) {
  let buf = [], offset = null, jitter = 0, lastT = -Infinity;
  return {
    get delay() { return Math.min(DELAY.max, Math.max(DELAY.min, 40 + 3 * jitter)); },
    get jitter() { return jitter; },
    get latest() { return buf.at(-1)?.frame ?? null; },
    push(senderT, arrival, frame) {
      if (!(senderT > lastT)) return false; lastT = senderT;
      const o = arrival - senderT;
      offset = offset === null || o < offset ? o : offset + (o - offset) * 0.002;
      jitter += ((o - offset) - jitter) * 0.1;
      buf.push({ t: senderT, frame }); if (buf.length > size) buf.shift();
      return true;
    },
    sample(now) {
      if (!buf.length) return null;
      const at = now - offset - this.delay;
      if (at <= buf[0].t) return { a: buf[0].frame, b: buf[0].frame, k: 0, at };
      for (let i = buf.length - 1; i > 0; i--) if (buf[i - 1].t <= at) { const A = buf[i - 1], B = buf[i]; if (at >= B.t) return { a: B.frame, b: B.frame, k: 0, at }; return { a: A.frame, b: B.frame, k: (at - A.t) / (B.t - A.t), at }; }
      return { a: buf.at(-1).frame, b: buf.at(-1).frame, k: 0, at };
    },
    reset() { buf = []; offset = null; jitter = 0; lastT = -Infinity; },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/interp.test.mjs` — Expected: 5 pass. If `rough.delay` falls outside (100, 300) for seed 3, change only the jitter amplitude in the test (60 ms) until it sits clearly between, and note it.

- [ ] **Step 5: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/net/interp.js test/interp.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - interpolation buffer with adaptive delay (M-25, M-26)"
```

### Task 4: JSON protocol checks and rate limiter (M-24, M-27, M-50)

**Files:**
- Create: `src/net/protocol.js`
- Test: `test/protocol.test.mjs`

**Interfaces:**
- Produces:
  - `NET_VERSION = 1`, `MAX_PLAYERS = 4`, `PAINT_NAMES` (all paints from `progress.js`)
  - `checkFromGuest(msg) -> msg | null` for `hello {v, paint}`, `claim {ids}`, `release {ids}`, `delivered {ids}`, `tree {id}`, `regrow {}`, `horn {}`, `help {}`, `paint {paint}`
  - `checkFromHost(msg) -> msg | null` for `welcome {v, seed, you, players, herd, trees}`, `players {list}`, `claimed {ok, no, epochs}`, `tree {id}`, `regrow {}`, `horn {n}`, `help {id}`, `bye {reason}`
  - `createRate(perSec = 60) -> { allow(nowMs) -> bool }`
- Shapes: `players` entries `{ n: 1..4, paint: { body, trim }, away: bool }`; `herd` entries (welcome) `{ id, type, golden, home: 'route'|'yard', leader: id|null, line, x, z, yaw, epoch, state: 'free'|'busy'|'carried'|'gone', hidden }`; `epochs` is `[[id, epoch], ...]`. Id lists hold at most 16 integers 0..65535; `welcome.herd` at most 512 entries; `welcome.trees` at most 256 ids.

- [ ] **Step 1: Write the failing test**

```js
// test/protocol.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFromGuest, checkFromHost, createRate, NET_VERSION } from '../src/net/protocol.js';

const paint = { body: 'red', trim: 'yellow' };
test('good guest messages pass (M-24)', () => {
  for (const m of [{ t: 'hello', v: NET_VERSION, paint }, { t: 'claim', ids: [3, 4, 5] }, { t: 'release', ids: [3] }, { t: 'delivered', ids: [1, 2] },
    { t: 'tree', id: 12 }, { t: 'regrow' }, { t: 'horn' }, { t: 'help' }, { t: 'paint', paint: { body: 'rainbow', trim: 'blue' } }]) assert.deepEqual(checkFromGuest(m), m, m.t);
});
test('bad guest messages are refused (M-50)', () => {
  for (const m of [null, 'x', [], {}, { t: 'nope' }, { t: 'claim' }, { t: 'claim', ids: 'a' }, { t: 'claim', ids: [1.5] }, { t: 'claim', ids: [-1] },
    { t: 'claim', ids: Array.from({ length: 17 }, (_, i) => i) }, { t: 'tree', id: 70000 }, { t: 'paint', paint: { body: 'chartreuse', trim: 'red' } },
    { t: 'hello', v: NET_VERSION }, { t: 'welcome', v: 1 }]) assert.equal(checkFromGuest(m), null, JSON.stringify(m));
});
test('host messages are checked the same way', () => {
  const herd = [{ id: 0, type: 'pig', golden: false, home: 'route', leader: null, line: 0, x: 1, z: 2, yaw: 0, epoch: 0, state: 'free', hidden: false }];
  const w = { t: 'welcome', v: 1, seed: 42, you: 2, players: [{ n: 1, paint, away: false }, { n: 2, paint, away: false }], herd, trees: [3] };
  assert.deepEqual(checkFromHost(w), w);
  assert.deepEqual(checkFromHost({ t: 'claimed', ok: [1], no: [2], epochs: [[1, 4]] }), { t: 'claimed', ok: [1], no: [2], epochs: [[1, 4]] });
  assert.deepEqual(checkFromHost({ t: 'help', id: null }), { t: 'help', id: null });
  for (const m of [{ ...w, you: 5 }, { ...w, seed: -1 }, { ...w, herd: [{ ...herd[0], type: 'dragon' }] }, { ...w, herd: [{ ...herd[0], x: NaN }] },
    { t: 'horn', n: 9 }, { t: 'claimed', ok: [1], no: [], epochs: [[1]] }, { t: 'hello', v: 1, paint }]) assert.equal(checkFromHost(m), null, JSON.stringify(m).slice(0, 60));
});
test('the rate limiter allows 60 messages in each second (M-50)', () => {
  const r = createRate(60); let ok = 0;
  for (let i = 0; i < 200; i++) if (r.allow(500)) ok++;
  assert.equal(ok, 60); assert.equal(r.allow(1600), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/protocol.test.mjs` — Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```js
// src/net/protocol.js
// Reliable-channel JSON messages (M-24) and their checks (M-50): every field must be the right type and in range, or the whole
// message is dropped. NET_VERSION (M-27) goes to Handshake as the game version, so a different build cannot join at all.
import { TYPES } from '../sim/herd.js';
import { START_PAINTS, NEW_PAINTS } from '../sim/progress.js';

export const NET_VERSION = 1, MAX_PLAYERS = 4;
export const PAINT_NAMES = [...START_PAINTS, ...NEW_PAINTS];
const obj = m => m && typeof m === 'object' && !Array.isArray(m);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = (v, lim = 400) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const ids = (a, max = 16) => Array.isArray(a) && a.length <= max && a.every(v => int(v, 0, 0xffff));
const paintOk = p => obj(p) && PAINT_NAMES.includes(p.body) && PAINT_NAMES.includes(p.trim);
const playerOk = p => obj(p) && int(p.n, 1, MAX_PLAYERS) && paintOk(p.paint) && typeof p.away === 'boolean';
const STATES = ['free', 'busy', 'carried', 'gone'];
const animalOk = a => obj(a) && int(a.id, 0, 0xffff) && a.type in TYPES && typeof a.golden === 'boolean' && (a.home === 'route' || a.home === 'yard')
  && (a.leader === null || int(a.leader, 0, 0xffff)) && int(a.line, 0, 255) && num(a.x) && num(a.z) && num(a.yaw, 100) && int(a.epoch, 0, 0xffffffff)
  && STATES.includes(a.state) && typeof a.hidden === 'boolean';
const GUEST = {
  hello: m => m.v === NET_VERSION && paintOk(m.paint), claim: m => ids(m.ids), release: m => ids(m.ids), delivered: m => ids(m.ids),
  tree: m => int(m.id, 0, 0xffff), regrow: () => true, horn: () => true, help: () => true, paint: m => paintOk(m.paint),
};
const HOST = {
  welcome: m => int(m.v, 0, 0xffff) && int(m.seed, 0, 0xffffffff) && int(m.you, 2, MAX_PLAYERS) && Array.isArray(m.players) && m.players.length <= MAX_PLAYERS && m.players.every(playerOk)
    && Array.isArray(m.herd) && m.herd.length <= 512 && m.herd.every(animalOk) && ids(m.trees, 256),
  players: m => Array.isArray(m.list) && m.list.length <= MAX_PLAYERS && m.list.every(playerOk),
  claimed: m => ids(m.ok) && ids(m.no) && Array.isArray(m.epochs) && m.epochs.length <= 16 && m.epochs.every(e => Array.isArray(e) && e.length === 2 && int(e[0], 0, 0xffff) && int(e[1], 0, 0xffffffff)),
  tree: m => int(m.id, 0, 0xffff), regrow: () => true, horn: m => int(m.n, 1, MAX_PLAYERS), help: m => m.id === null || int(m.id, 0, 0xffff),
  bye: m => typeof m.reason === 'string' && m.reason.length <= 32,
};
const check = table => m => obj(m) && Object.hasOwn(table, m.t) && table[m.t](m) ? m : null;
export const checkFromGuest = check(GUEST), checkFromHost = check(HOST);
// M-50: at most perSec messages in each 1 s window (per guest and per channel); the rest are dropped
export function createRate(perSec = 60) {
  let win = -Infinity, n = 0;
  return { allow(now) { if (now - win >= 1000) { win = now; n = 0; } return ++n <= perSec; } };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/protocol.test.mjs` — Expected: 4 pass.

- [ ] **Step 5: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/net/protocol.js test/protocol.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - message checks and rate limit (M-24, M-50)"
```

---

## Milestone B: Sim hooks (single-player unchanged)

### Task 5: Herd hooks — several tractors, remote mode, ids from the host (M-12)

**Files:**
- Modify: `src/sim/herd.js`
- Test: `test/herd.test.mjs` (append)

**Interfaces:**
- Produces (on the object `createHerd` returns, now named `h` internally):
  - `h.remote` (bool, default false): when true, `step()` does nothing (the host runs the behavior, M-12).
  - `h.step(dt, { tractor, others = [] })`: each animal reacts to the **nearest** of `[tractor, ...others]`; each is `{ x, z, yaw, speed }`.
  - `h.ensure(id, type, golden) -> animal`: makes the herd hold an animal with that id (placeholders with state `'elsewhere'` fill any gap), sets its type and golden.
  - Every animal has `epoch` (ownership number, starts at 0, M-26).
  - New states `'carried'` and `'elsewhere'` are in `NOT_FREE` and `SKIP` (exported as `NOT_FREE`).

- [ ] **Step 1: Write the failing tests** (append to `test/herd.test.mjs`)

```js
test('animals react to the nearest of several tractors (M-12)', () => {
  const h = createHerd({ rng: makeRng(31), env }), s = h.animals.find(a => a.type === 'sheep' && !a.hidden && a.home === 'route');
  s.state = 'idle'; s.timer = 99; s.z = 0;
  const other = { x: s.x - 4, z: s.z, yaw: Math.PI / 2, speed: 5 };
  h.step(1 / 60, { tractor: far, others: [other] });
  assert.equal(s.state, 'flee', 'the other tractor scares it');
});
test('a remote herd does not move: the host runs it (M-12)', () => {
  const h = createHerd({ rng: makeRng(32), env }), x0 = h.animals.map(a => [a.x, a.z]);
  h.remote = true; run(h, 5);
  assert.deepEqual(h.animals.map(a => [a.x, a.z]), x0);
});
test('ensure fills the herd up to an id from the host, and every animal has an ownership number (M-26)', () => {
  const h = createHerd({ rng: makeRng(33), env }), n = h.animals.length;
  assert.ok(h.animals.every(a => a.epoch === 0));
  const a = h.ensure(n + 2, 'cow', true);
  assert.equal(h.animals.length, n + 3); assert.equal(a.id, n + 2); assert.equal(a.type, 'cow'); assert.equal(a.golden, true);
  assert.equal(h.animals[n].state, 'elsewhere'); assert.ok(!h.free().includes(h.animals[n]));
  assert.equal(h.ensure(0, h.animals[0].type, false), h.animals[0]);
});
test('carried and elsewhere animals are not free and do not move', () => {
  const h = createHerd({ rng: makeRng(34), env }), a = h.animals.find(x => !x.hidden && x.home === 'route');
  a.state = 'carried'; const p = [a.x, a.z]; run(h, 2);
  assert.ok(!h.free().includes(a)); assert.deepEqual([a.x, a.z], p);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/herd.test.mjs` — Expected: the 4 new tests FAIL (`others` ignored, `remote` ignored, `ensure is not a function`, `carried` animal moves/is free).

- [ ] **Step 3: Implement**

In `src/sim/herd.js`:

1. States:
```js
const SKIP = new Set(['fly', 'ride', 'show', 'gone', 'carried', 'elsewhere']);
export const NOT_FREE = new Set(['fly', 'ride', 'show', 'toBarn', 'gone', 'carried', 'elsewhere']); // carried: another player has it; elsewhere: no news from the host (M-11)
```
(replace the existing `SKIP` and `NOT_FREE` line; keep every other use of `NOT_FREE` as is.)

2. In `add`, add `epoch: 0` to the new animal object (after `dirt: 0`).

3. Change `return {` (the herd object) to `const h = {` and add `return h;` at the end of `createHerd`. Add as the first property: `remote: false, // M-12: on a guest the host runs the behavior; the guest only shows the host's snapshots`.

4. Add after `toBarn`:
```js
    // M-11: hold an animal with this id (the host's ids are its array indexes); placeholders fill any gap until the host tells about them
    ensure(id, type, golden) { while (animals.length <= id) add(type, { x: 0, z: 0 }).state = 'elsewhere'; const a = animals[id]; a.type = type; a.golden = golden; return a; },
```

5. In `step`: change the signature to `step(dt, { tractor: t, others = [] })`, start with `if (h.remote) return;`, and inside the per-animal loop replace the single tractor with the nearest one. Replace the line
```js
        const def = TYPES[a.type], dT = Math.hypot(a.x - t.x, a.z - t.z);
```
with
```js
        let tt = t, dT = Math.hypot(a.x - t.x, a.z - t.z); // M-12: the nearest tractor
        for (const o of others) { const d = Math.hypot(a.x - o.x, a.z - o.z); if (d < dT) { dT = d; tt = o; } }
        const def = TYPES[a.type];
```
and in the rest of that loop body replace every `t.` with `tt.` (`t.x`, `t.z`, `t.speed`, in the look, flee test, flee direction and wave lines). Do not change `t` outside the loop.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/herd.test.mjs` — Expected: all pass (old and new).

- [ ] **Step 5: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/sim/herd.js test/herd.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - herd reacts to the nearest tractor, remote mode, host ids (M-12)"
```

### Task 6: Game hooks — spawn, claims, flight hold, release, tree by id, full dodge (M-10, M-13, M-14, M-17, M-12)

**Files:**
- Create: `src/sim/spawn.js`
- Modify: `src/sim/slots.js`, `src/sim/launch.js`, `src/sim/trees.js`, `src/sim/game.js`
- Test: `test/spawn.test.mjs` (new), `test/slots.test.mjs`, `test/trees.test.mjs`, `test/game.test.mjs` (append)

**Interfaces:**
- Consumes: `herd.remote`, `herd.step(dt, { tractor, others })`, `NOT_FREE` (Task 5).
- Produces:
  - `spawnPoint(farm, n) -> { x, z, yaw }`, `SPAWN_GAP = 12`
  - `load.release(slot)`: removes the slot and packs the later slots forward (their `car`/`k` change in place).
  - `SPLIT` exported from `launch.js`.
  - `trees.breakById(id, dir = { x: 0, z: 1 }) -> event | null` (event `{ type: 'treeBreak', tree, dir, speed: 0, remote: true }`), `trees.brokenIds() -> number[]`
  - `createGame(RAPIER, { seed, power, player = 1 })`: the train starts at `spawnPoint(farm, player)`.
  - game fields: `game.others = []` (`{ x, z, yaw, speed }`, given to the herd), `game.claims = false` (guest: launches wait for the host, M-14), `game.boopsPaused = false` (M-40).
  - `CLAIM_WAIT = 1` (s), flights get `claim: 'pending' | null` and `hold` (s).
  - `game.resolveClaim(id, ok) -> events[]`: `ok` clears the pending claim (it lands normally); not ok drops the flight, releases its slot and returns `[{ type: 'unclaim', animal, reason: 'refused', pos: {x,y,z} }]`.
  - A pending flight that waits longer than `CLAIM_WAIT` at `u = SPLIT` is dropped by `step` with an `unclaim` event, `reason: 'timeout'`.
  - The animal of a dropped flight gets state `'elsewhere'`.
  - `export function fullDodge(herd, tp, tq, cars, events)` — B-14 for any full train: `tp` tractor translation `{x,y,z}`, `tq` rotation `{x,y,z,w}`, `cars` `[{ p, q }]`.
  - When `herd.remote` is true, `step` skips B-14 (the host does it) and `finishShow` does not respawn (the host does, M-16).

- [ ] **Step 1: Write the failing tests**

`test/spawn.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFarm, YARD_HALF, inWash } from '../src/sim/track.js';
import { spawnPoint, SPAWN_GAP } from '../src/sim/spawn.js';

test('player 1 starts at the farm start; players 2 to 4 start ahead of it, clear of obstacles, in the yard (M-10)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const farm = generateFarm(seed), s = farm.start;
    assert.deepEqual(spawnPoint(farm, 1), { x: s.x, z: s.z, yaw: s.yaw });
    const pts = [1, 2, 3, 4].map(n => spawnPoint(farm, n));
    for (let n = 2; n <= 4; n++) {
      const p = pts[n - 1], fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      for (const back of [0, 3.6, 6.7]) { // the tractor and the two cars behind it
        const x = p.x - fx * back, z = p.z - fz * back;
        assert.ok(Math.abs(x) < YARD_HALF - 4 && Math.abs(z) < YARD_HALF - 4, `seed ${seed} player ${n} out of the yard`);
        assert.ok(!inWash(farm.yard, x, z), `seed ${seed} in the wash`);
        assert.ok(Math.hypot(x - farm.yard.pond.x, z - farm.yard.pond.z) > farm.yard.pond.r + 2, `seed ${seed} in the pond`);
        for (const o of farm.yard.obstacles) assert.ok(Math.hypot(x - o.x, z - o.z) > o.r + 2, `seed ${seed} player ${n} on a ${o.kind}`);
      }
      for (let m = 1; m < n; m++) assert.ok(Math.hypot(p.x - pts[m - 1].x, p.z - pts[m - 1].z) >= SPAWN_GAP - 1e-6 || m === 1 && Math.hypot(p.x - s.x, p.z - s.z) >= 8, `seed ${seed} players ${m} and ${n} too close`);
    }
  }
});
```

Append to `test/slots.test.mjs` (check its imports; it already imports `createLoad`):
```js
test('release removes a slot and packs the later ones forward (M-14)', () => {
  const L = createLoad(12), s = [0, 1, 2, 3, 4, 5, 6].map(i => L.reserve({ id: i }));
  L.land(s[0]); L.land(s[6]);
  L.release(s[2]);
  assert.equal(L.slots.length, 6); assert.deepEqual(L.slots.map(x => x.animal.id), [0, 1, 3, 4, 5, 6]);
  assert.deepEqual(L.slots.map(x => [x.car, x.k]), [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]);
  assert.equal(s[6].car, 0, 'the wagon rider moved up into the trailer'); assert.equal(L.landed(), 2);
  L.release({}); assert.equal(L.slots.length, 6, 'an unknown slot changes nothing');
});
```

Append to `test/trees.test.mjs`:
```js
test('a tree or bush can be broken by id (M-17); brokenIds lists them', () => {
  const { trees, phys } = setup([...oneTree(0, 0), ...oneBush(20, 0)]);
  const ev = trees.breakById(0, { x: 1, z: 0 });
  assert.equal(ev.type, 'treeBreak'); assert.equal(ev.tree.id, 0); assert.equal(ev.remote, true); assert.equal(trees.list[0].collider, null);
  assert.equal(trees.breakById(0), null, 'already broken'); assert.equal(trees.breakById(99), null, 'no such tree');
  assert.ok(trees.breakById(1)); assert.deepEqual(trees.brokenIds(), [0, 1]);
  trees.reset(); assert.deepEqual(trees.brokenIds(), []); void phys;
});
```

Append to `test/game.test.mjs`:
```js
test('createGame puts player n at its spawn point (M-10)', async () => {
  const { spawnPoint } = await import('../src/sim/spawn.js');
  const g = createGame(RAPIER, { seed: 41, power: 'medium', player: 3 }), p = spawnPoint(g.farm, 3);
  assert.ok(Math.hypot(g.tractor.x - p.x, g.tractor.z - p.z) < 0.01);
});
test('with claims on, a booped animal waits at the top of its arc for the answer, then lands (M-14)', () => {
  const g = createGame(RAPIER, { seed: 42, power: 'medium' }); quiet(g); g.claims = true;
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  let ev = []; for (let i = 0; i < 150; i++) ev.push(...g.step(STILL)); // longer than any flight: it waits
  assert.ok(ev.some(e => e.type === 'launch')); assert.ok(!ev.some(e => e.type === 'land'), 'no landing without a yes');
  assert.equal(g.flights.length, 1); assert.equal(g.flights[0].claim, 'pending');
  assert.deepEqual(g.resolveClaim(a.id, true), []);
  ev = []; for (let i = 0; i < 60; i++) ev.push(...g.step(STILL));
  assert.ok(ev.some(e => e.type === 'land' && e.animal === a)); assert.equal(a.state, 'ride');
});
test('a refused claim drops the flight with a poof, and frees its slot (M-14)', () => {
  const g = createGame(RAPIER, { seed: 43, power: 'medium' }); quiet(g); g.claims = true;
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  for (let i = 0; i < 20; i++) g.step(STILL);
  const ev = g.resolveClaim(a.id, false);
  assert.equal(ev.length, 1); assert.equal(ev[0].type, 'unclaim'); assert.equal(ev[0].reason, 'refused'); assert.ok(Number.isFinite(ev[0].pos.y));
  assert.equal(g.flights.length, 0); assert.equal(g.load.slots.length, 0); assert.equal(a.state, 'elsewhere');
});
test('a claim with no answer for 1 s at the top of the arc times out (M-14)', () => {
  const g = createGame(RAPIER, { seed: 44, power: 'medium' }); quiet(g); g.claims = true;
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const ev = []; for (let i = 0; i < 60 * 4; i++) ev.push(...g.step(STILL));
  const u = ev.find(e => e.type === 'unclaim'); assert.ok(u); assert.equal(u.reason, 'timeout'); assert.equal(g.load.slots.length, 0);
});
test('paused boops: nothing is booped (M-40)', () => {
  const g = createGame(RAPIER, { seed: 45, power: 'medium' }); quiet(g); g.boopsPaused = true;
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const ev = []; for (let i = 0; i < 60; i++) ev.push(...g.step(STILL)); assert.ok(!ev.some(e => e.type === 'boop'));
});
test('with a remote herd there is no B-14 dodge and no respawn after the show (M-12, M-16)', () => {
  const g = createGame(RAPIER, { seed: 46, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  for (const a of pickable(g).slice(0, 12)) place(g, a);
  g.herd.remote = true;
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  for (let i = 0; i < 30; i++) g.step(STILL); assert.notEqual(a.state, 'dodge');
  const n = g.herd.animals.length, riders = g.startShow(); riders.forEach(r => { r.animal.state = 'show'; }); g.finishShow(riders);
  assert.equal(g.herd.animals.length, n, 'no new animals: the host makes them');
});
test('fullDodge makes animals hop out of the way of any full train given as poses (M-12, B-14)', async () => {
  const { fullDodge } = await import('../src/sim/game.js');
  const g = createGame(RAPIER, { seed: 47, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 3, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const ev = []; fullDodge(g.herd, g.tractor.body.translation(), g.tractor.body.rotation(), g.train.cars.map(c => ({ p: c.body.translation(), q: c.body.rotation() })), ev);
  assert.equal(a.state, 'dodge'); assert.ok(ev.some(e => e.type === 'dodge' && e.animal === a));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/spawn.test.mjs test/slots.test.mjs test/trees.test.mjs test/game.test.mjs` — Expected: the new tests FAIL (missing module/functions; `claims` ignored).

- [ ] **Step 3: Implement**

`src/sim/spawn.js`:
```js
// M-10: where player n's train starts. Player 1 (the host, or anyone alone) at the farm start; the others ahead of it along its heading,
// SPAWN_GAP apart (a train is about 10 m long), stepping 8 m sideways when that spot is blocked. Pure: farm data only.
import { YARD_HALF, inWash } from './track.js';
export const SPAWN_GAP = 12;
const BACK = [0, 3.6, 6.7]; // the tractor and the two cars behind it
function clear(farm, x, z, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), y = farm.yard;
  return BACK.every(b => { const px = x - fx * b, pz = z - fz * b;
    return Math.abs(px) < YARD_HALF - 4 && Math.abs(pz) < YARD_HALF - 4 && !inWash(y, px, pz) && Math.hypot(px - y.pond.x, pz - y.pond.z) > y.pond.r + 2
      && y.obstacles.every(o => Math.hypot(px - o.x, pz - o.z) > o.r + 2); });
}
export function spawnPoint(farm, n) {
  const s = farm.start; if (n <= 1) return { x: s.x, z: s.z, yaw: s.yaw };
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), d = SPAWN_GAP * (n - 1);
  for (const side of [0, 8, -8, 16, -16, 24, -24]) { const x = s.x + fx * d + fz * side, z = s.z + fz * d - fx * side; if (clear(farm, x, z, s.yaw)) return { x, z, yaw: s.yaw }; }
  return { x: s.x + fx * d, z: s.z + fz * d, yaw: s.yaw }; // never seen in 300 seeds (test/spawn.test.mjs); the soft bump (M-7) sorts out any overlap
}
```
If the spawn test fails for some seeds on the "players too close" check because two players both took sideways steps, keep the candidate list but also skip candidates within `SPAWN_GAP` of the earlier players' points (compute earlier points by calling `spawnPoint(farm, m)` for `m < n`). Do not loosen the test's obstacle or yard checks.

`src/sim/slots.js`, in the object returned by `createLoad`, add:
```js
    release(s) { const i = slots.indexOf(s); if (i < 0) return; slots.splice(i, 1); slots.forEach((t, n) => { t.car = Math.floor(n / CAR_SLOTS); t.k = n % CAR_SLOTS; }); }, // M-14: a refused flight frees its slot; later ones move up
```

`src/sim/launch.js`: change `const SPLIT = 0.75, PEAK = ...` to `export const SPLIT = 0.75; const PEAK = { x: -0.6, y: 7.2 };`.

`src/sim/trees.js`, add to the returned object:
```js
    // M-17: the host broke this one (or a guest asked it to): no speed check, no slowdown; null when it is not standing
    breakById(id, dir = { x: 0, z: 1 }) { const t = list[id]; if (!t || t.state !== 'standing') return null; dropCollider(t); t.state = 'broken'; t.wobble = 0; t.near = false; t.grow = 0; return { type: 'treeBreak', tree: t, dir, speed: 0, remote: true }; },
    brokenIds: () => list.filter(t => t.state === 'broken').map(t => t.id),
```

`src/sim/game.js`:
1. Imports: add `import { spawnPoint } from './spawn.js';`, change `import { launchLocal, FLIGHT } from './launch.js';` to `import { launchLocal, FLIGHT, SPLIT } from './launch.js';`.
2. Add `export const CLAIM_WAIT = 1; // M-14: s a guest's animal waits at the top of its arc for the host's answer`.
3. Signature `createGame(RAPIER, { seed, power = 'medium', player = 1 })`; replace `const yardProps = addYardProps(phys, farm), s = farm.start;` with `const yardProps = addYardProps(phys, farm), s = spawnPoint(farm, player); // M-10`.
4. Game object fields: after `dirt: { tractor: 0 },` add `others: [], claims: false, boopsPaused: false, // multiplayer: other tractors for the herd (M-12), boops wait for the host (M-14), host away (M-40)`.
5. `finishShow`: replace `herd.toBarn(riders.map(r => r.animal)); herd.respawn();` with `herd.toBarn(riders.map(r => r.animal)); if (!herd.remote) herd.respawn(); // M-16: on a guest the host makes the new animals`.
6. Add method after `finishShow`:
```js
    // M-14: the host's answer to a guest's claim. ok: it lands as usual. Not ok: it disappears with a poof and its slot is free again.
    resolveClaim(id, ok) {
      const i = flights.findIndex(f => f.animal.id === id && f.claim === 'pending'); if (i < 0) return [];
      if (ok) { flights[i].claim = null; return []; }
      const ev = []; dropFlight(i, ev, 'refused'); return ev;
    },
```
7. In `step`: `herd.step(DT, { tractor });` becomes `herd.step(DT, { tractor, others: game.others });`. The boop condition `if (game.mode === 'drive' && !load.full()) for (...)` becomes `if (game.mode === 'drive' && !load.full() && !game.boopsPaused) for (...)`.
8. Replace the whole B-14 block (`if (game.mode === 'drive' && load.full()) for (const a of herd.free()) { ... }`) with:
```js
      if (game.mode === 'drive' && load.full() && !herd.remote) fullDodge(herd, tractor.body.translation(), tractor.body.rotation(), train.cars.map(c => ({ p: c.body.translation(), q: c.body.rotation() })), events); // B-14 (the host does it for guests, M-12)
```
9. In the flights loop, after `fl.u += DT / fl.dur; fl.prev.x = ...; fl.prev.z = fl.pos.z;` and before `if (fl.u < 0) continue;` insert:
```js
        if (fl.claim === 'pending' && fl.u > SPLIT) { fl.u = SPLIT; if ((fl.hold += DT) > CLAIM_WAIT) { dropFlight(i, events, 'timeout'); continue; } } // M-14: no landing before the host's yes
```
10. In `launch`, add `claim: game.claims ? 'pending' : null, hold: 0,` to the pushed flight object.
11. Replace the inner `dodgeFrom` function and add `dropFlight` (inside `createGame`, next to `launch`):
```js
  function dropFlight(i, events, reason) { const fl = flights.splice(i, 1)[0], a = fl.animal; fl.load.release(fl.slot); a.state = 'elsewhere'; events.push({ type: 'unclaim', animal: a, reason, pos: { ...fl.pos } }); }
```
12. Move B-14 to module level (below `createGame`), keeping the existing geometry (the tractor test uses its 3D local frame with `y = 0`, the cars a flat one, exactly as before):
```js
// B-14 for any full train (the host runs it for full guests too, M-12): tp, tq the tractor's position and rotation; cars [{ p, q }]
export function fullDodge(herd, tp, tq, cars, events) {
  const ax = quatAxes(tq);
  for (const a of herd.free()) {
    if (a.hidden || a.state === 'dodge') continue;
    const r = TYPES[a.type].r, dx = a.x - tp.x, dy = -tp.y, dz = a.z - tp.z;
    const lx = dx * ax.f.x + dy * ax.f.y + dz * ax.f.z, lz = dx * ax.r.x + dy * ax.r.y + dz * ax.r.z;
    if (lx > -2.2 && lx < CATCH.x1 + 1.5 && Math.abs(lz) < CATCH.half + r + 0.3) { dodgeFrom(herd, a, ax, lz, CATCH.half + r + 2.5, events); continue; }
    for (const c of cars) {
      const cx = quatAxes(c.q), ex = a.x - c.p.x, ez = a.z - c.p.z, mx = ex * cx.f.x + ez * cx.f.z, mz = ex * cx.r.x + ez * cx.r.z;
      if (Math.abs(mx) < TR.half.x + 1 && Math.abs(mz) < TR.half.z + r + 0.4) { dodgeFrom(herd, a, cx, mz, TR.half.z + r + 2.2, events); break; }
    }
  }
}
// hop sideways (along the body's right axis, on the side the animal already is) to `clear` metres from the body's center line
function dodgeFrom(herd, a, ax, side, clear, events) {
  const sd = Math.abs(side) > 0.05 ? Math.sign(side) : (a.id % 2 ? 1 : -1), hl = Math.hypot(ax.r.x, ax.r.z) || 1, move = clear - Math.abs(side);
  if (herd.dodge(a, a.x + ax.r.x / hl * sd * move, a.z + ax.r.z / hl * sd * move)) events.push({ type: 'dodge', animal: a });
}
```
and delete the old inner `dodgeFrom`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/spawn.test.mjs test/slots.test.mjs test/trees.test.mjs test/game.test.mjs` — Expected: all pass, including the existing B-14 test.

- [ ] **Step 5: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/sim/spawn.js src/sim/slots.js src/sim/launch.js src/sim/trees.js src/sim/game.js test/spawn.test.mjs test/slots.test.mjs test/trees.test.mjs test/game.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - sim hooks: spawn places, claims and the hold, tree by id, full dodge (M-10, M-14, M-17)"
```

### Task 7: Soft bump (M-7)

**Files:**
- Create: `src/sim/bump.js`
- Test: `test/bump.test.mjs`

**Interfaces:**
- Produces: `BUMP = { push: 2, front: 1.8, back: 1.3, r: 1.1, cool: 0.6 }`, `bumpNormal(own, other) -> { x, z } | null` (own/other `{ x, z, yaw }`; the unit vector from the other toward own when the two capsules touch), `createBumper() -> { step(dt, tractor, others, events) }` (tractor = the sim tractor with `body`, `x`, `z`, `yaw`; others `[{ n, x, z, yaw }]`; pushes `{ type: 'bump', other: n }`).

- [ ] **Step 1: Write the failing test**

```js
// test/bump.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { createTractor } from '../src/sim/tractor.js';
import { bumpNormal, createBumper, BUMP } from '../src/sim/bump.js';
await RAPIER.init();

test('two tractors touch when their capsules overlap; the normal points from the other to us (M-7)', () => {
  const n = bumpNormal({ x: 0, z: 0, yaw: 0 }, { x: 2, z: 0, yaw: 0 }); // side by side, 2 m apart
  assert.ok(n && n.x < -0.99, JSON.stringify(n));
  assert.equal(bumpNormal({ x: 0, z: 0, yaw: 0 }, { x: 3, z: 0, yaw: 0 }), null, '3 m apart side by side: no touch');
  assert.ok(bumpNormal({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 4.5, yaw: Math.PI }), 'nose to nose');
  assert.equal(bumpNormal({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 6, yaw: Math.PI }), null);
});
test('a bump pushes only our own tractor away at 2 m/s, with a boing event and a cooldown (M-7)', () => {
  const phys = createPhysics(RAPIER), t = createTractor(phys, { x: 0, z: 0, yaw: 0 }), b = createBumper(), ev = [];
  for (let i = 0; i < 30; i++) { t.setInput(0, 0); t.step(DT); phys.world.step(); }
  b.step(DT, t, [{ n: 2, x: 2, z: 0, yaw: 0 }], ev);
  const v = t.body.linvel(); assert.ok(v.x <= -BUMP.push + 1e-6, `vx ${v.x}`);
  assert.deepEqual(ev, [{ type: 'bump', other: 2 }]);
  b.step(DT, t, [{ n: 2, x: 2, z: 0, yaw: 0 }], ev); assert.equal(ev.length, 1, 'cooldown');
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test test/bump.test.mjs`: module not found.

- [ ] **Step 3: Implement**

```js
// src/sim/bump.js
// M-7 soft bump: each device pushes only its own tractor gently away from an other tractor (about 2 m/s, away from the other's center
// line), with a "boing" and a short horn, then waits 0.6 s. Tractors are capsules along their heading: no colliders for other players.
export const BUMP = { push: 2, front: 1.8, back: 1.3, r: 1.1, cool: 0.6 };
const seg = t => { const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw); return [t.x - fx * BUMP.back, t.z - fz * BUMP.back, t.x + fx * BUMP.front, t.z + fz * BUMP.front]; };
const clamp01 = v => Math.max(0, Math.min(1, v));
function closest([ax, az, bx, bz], [cx, cz, dx, dz]) { // closest points of two 2D segments (sampled refinement: exact enough for 2 short segments)
  let best = [Infinity, 0, 0, 0, 0];
  for (let i = 0; i <= 8; i++) { const s = i / 8, px = ax + (bx - ax) * s, pz = az + (bz - az) * s, ex = dx - cx, ez = dz - cz;
    const u = clamp01(((px - cx) * ex + (pz - cz) * ez) / (ex * ex + ez * ez)), qx = cx + ex * u, qz = cz + ez * u, d = Math.hypot(px - qx, pz - qz);
    if (d < best[0]) best = [d, px, pz, qx, qz]; }
  return best;
}
export function bumpNormal(own, other) {
  const [d, px, pz, qx, qz] = closest(seg(own), seg(other)); if (d >= BUMP.r * 2) return null;
  if (d > 1e-6) return { x: (px - qx) / d, z: (pz - qz) / d };
  const k = Math.hypot(own.x - other.x, own.z - other.z) || 1; return { x: (own.x - other.x) / k || 1, z: (own.z - other.z) / k };
}
export function createBumper() {
  let cool = 0;
  return { step(dt, tractor, others, events) {
    if ((cool -= dt) > 0) return;
    for (const o of others) {
      const n = bumpNormal(tractor, o); if (!n) continue;
      const v = tractor.body.linvel(), along = v.x * n.x + v.z * n.z;
      if (along < BUMP.push) tractor.body.setLinvel({ x: v.x + n.x * (BUMP.push - along), y: v.y, z: v.z + n.z * (BUMP.push - along) }, true);
      events.push({ type: 'bump', other: o.n }); cool = BUMP.cool; return;
    }
  } };
}
```

- [ ] **Step 4: Run** — `node --test test/bump.test.mjs`: 2 pass.

- [ ] **Step 5: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/sim/bump.js test/bump.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - soft bump between tractors (M-7)"
```

---

## Milestone C: Sync — two games in one process (M-52)

From here every feature is tested with a host game and one or more guest games in one Node process, over the in-memory hub.

### Task 8: Harness, players store, join (hello/welcome/roster), vehicles and herd snapshots

**Files:**
- Create: `src/net/players.js`, `src/net/host.js`, `src/net/guest.js`, `test/mp.harness.mjs`, `test/mp.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces:
  - `createPlayers() -> { map: Map<n, P>, ensure(n) -> P, remove(n), list() -> P[], push(msg, arrival) -> bool, sample(now), others() -> [{ n, x, z, yaw, speed }] }` with `P = { n, peer: string|null, paint, away, interp, latest, pose: { tractor: {p,q}, cars: [{p,q},{p,q}] } | null, yaw, speed, mode, full, carried: [...] }`. `sample(now)` fills `pose`, `yaw` (from the tractor quaternion), `speed` (from the two frames), `mode`, `full`, `carried` (lerped per id; flying ones not lerped).
  - `vehicleOf(game, player, time) -> vehicle message object` (in `players.js`): the own train's bodies, mode (`drive` / `show` for `arrive|show` / `held` otherwise), `full`, carried = own flights (`flying`) and landed riders (`riding`) with their world positions and yaws.
  - `yawOfQuat(q)`: heading from a body quaternion (`atan2(f.x, f.z)` using `quatAxes`).
  - Sync object (host and guest share this surface): `{ players, get game, get you, before(now) -> events[], after(events, now), setGame(game), setPaint(paint), showStarted(), delivered(riders), requestHelp(), close() }`.
  - `createHostSync({ game, net, paint })`, `createGuestSync({ game, net, paint, onFarm })` where `onFarm(seed, player) -> newGame` (the guest rebuilds the farm, M-1).
  - Rates: `SEND = { vehicle: 50, herd: 66 }` ms (in `players.js`).
  - Events returned by `before()` (for main.js, Task 15): `{ type: 'playerJoined', n, x, z }`, `{ type: 'playerGone', n, x, z }`, `{ type: 'bump', other }`, plus game-shaped events (`treeBreak`, `unclaim`, `remoteHorn`, `help`) added in later tasks.

- [ ] **Step 1: Write the harness**

```js
// test/mp.harness.mjs — two (or more) games in one process over the in-memory hub (M-52). No tests here.
import RAPIER from '@dimforge/rapier3d-compat';
import { createGame } from '../src/sim/game.js';
import { DT } from '../src/sim/physics.js';
import { createMemoryHub } from '../src/net/link.js';
import { createHostSync } from '../src/net/host.js';
import { createGuestSync } from '../src/net/guest.js';

export const STILL = { thr: 0, steer: 0, horn: false };
export const PAINTS = [{ body: 'red', trim: 'yellow' }, { body: 'blue', trim: 'white' }, { body: 'green', trim: 'pink' }, { body: 'orange', trim: 'purple' }];
export async function mpWorld({ seed = 21, guests = 1, link = {}, join = true } = {}) {
  await RAPIER.init();
  const hub = createMemoryHub(link); let now = 0;
  const host = { name: 'host', events: [], game: createGame(RAPIER, { seed, power: 'medium' }) };
  host.net = hub.host(); host.sync = createHostSync({ game: host.game, net: host.net, paint: PAINTS[0] });
  const devs = [host];
  const addGuest = () => {
    const i = devs.length, g = { name: 'guest' + i, events: [], game: createGame(RAPIER, { seed: 1000 + i, power: 'medium' }) }; // its own solo farm until the welcome
    g.net = hub.join();
    g.sync = createGuestSync({ game: g.game, net: g.net, paint: PAINTS[i], onFarm: (s, n) => (g.game = createGame(RAPIER, { seed: s, power: 'medium', player: n })) });
    devs.push(g); return g;
  };
  if (join) for (let i = 0; i < guests; i++) addGuest();
  // inputs: [hostInput, guest1Input, ...] (missing = STILL), or a function (dev, index) -> input
  const step = (n = 1, inputs = []) => {
    for (let k = 0; k < n; k++) {
      now += DT * 1000; hub.tick(now);
      devs.forEach((d, i) => {
        d.events.push(...d.sync.before(now));
        const inp = typeof inputs === 'function' ? inputs(d, i) : inputs[i]; const ev = d.game.step(inp || STILL);
        d.events.push(...ev); d.sync.after(ev, now);
      });
    }
  };
  const seconds = (s, inputs) => step(Math.round(s * 60), inputs);
  return { hub, host, get guests() { return devs.slice(1); }, devs, step, seconds, addGuest, get now() { return now; } };
}
// Put an animal (by id) in front of a device's tractor, standing still
export function inFront(dev, a, ahead = 2.5) { const p = dev.game.tractorWorld({ x: ahead, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; a.hidden = false; }
export const free = (game, a) => game.herd.free().includes(a);
```

- [ ] **Step 2: Write the failing tests**

```js
// test/mp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mpWorld, inFront, free, STILL, PAINTS } from './mp.harness.mjs';
import { spawnPoint } from '../src/sim/spawn.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const drive = (d, i) => i === 1 ? { thr: 0.6, steer: 0.2, horn: false } : STILL;

test('a guest gets the welcome, makes the host farm and starts at its spawn place (M-1, M-10, M-24)', async () => {
  const w = await mpWorld({ seed: 21 }); w.seconds(0.5);
  const g = w.guests[0];
  assert.equal(g.game.farm.seed, 21); assert.equal(g.sync.you, 2);
  const p = spawnPoint(g.game.farm, 2); assert.ok(Math.hypot(g.game.tractor.x - p.x, g.game.tractor.z - p.z) < 0.5);
  assert.equal(g.game.herd.remote, true); assert.equal(g.game.claims, true);
  assert.deepEqual(w.host.sync.players.list().map(x => [x.n, x.paint]), [[2, PAINTS[1]]]);
  assert.deepEqual(g.sync.players.list().map(x => [x.n, x.paint]), [[1, PAINTS[0]]]);
  assert.ok(g.events.some(e => e.type === 'playerJoined' && e.n === 1) && w.host.events.some(e => e.type === 'playerJoined' && e.n === 2));
});
test('both devices see the other tractor where it really is, about 100 ms behind (M-11, M-22, M-25)', async () => {
  const w = await mpWorld({ seed: 22 }); w.seconds(4, drive);
  const g = w.guests[0], seen = w.host.sync.players.map.get(2).pose.tractor.p, real = g.game.tractor;
  assert.ok(dist(seen, real) < 0.2 + real.speed * 0.15, `host sees the guest ${dist(seen, real).toFixed(2)} m off`);
  const hs = g.sync.players.map.get(1).pose.tractor.p; assert.ok(dist(hs, w.host.game.tractor) < 0.2);
  assert.ok(w.host.game.others.length === 1 && Math.abs(w.host.game.others[0].speed - real.speed) < 1.5, 'the herd knows the guest tractor and its speed');
});
test('the guest shows the host animals where the host has them (M-3, M-12, M-23)', async () => {
  const w = await mpWorld({ seed: 23 }); w.seconds(6);
  const h = w.host.game.herd, g = w.guests[0].game.herd;
  for (const a of h.free()) { const b = g.animals[a.id]; assert.ok(b, `guest has ${a.id}`); assert.equal(b.type, a.type);
    assert.ok(dist(a, b) < 0.5, `animal ${a.id} ${dist(a, b).toFixed(2)} m off`); assert.ok(free(w.guests[0].game, b) || a.hidden === b.hidden); }
});
test('it still works over a far network: 300 ms, jitter 80 ms, 5% loss (M-25, M-28)', async () => {
  const w = await mpWorld({ seed: 24, link: { delay: 300, jitter: 80, loss: 0.05 } }); w.seconds(8, drive);
  const g = w.guests[0]; assert.equal(g.game.farm.seed, 24);
  const seen = w.host.sync.players.map.get(2).pose.tractor.p; assert.ok(dist(seen, g.game.tractor) < 3, `${dist(seen, g.game.tractor)}`);
  const h = w.host.game.herd; let near = 0, all = 0;
  for (const a of h.free()) { all++; if (dist(a, g.game.herd.animals[a.id]) < 1.5) near++; }
  assert.ok(near >= all * 0.9, `${near}/${all} animals close`);
});
test('three guests: players 2, 3 and 4 each see all the others (M-2, M-22 relay)', async () => {
  const w = await mpWorld({ seed: 25, guests: 3 }); w.seconds(2);
  assert.deepEqual(w.guests.map(g => g.sync.you), [2, 3, 4]);
  for (const g of w.guests) assert.deepEqual(g.sync.players.list().map(p => p.n).sort(), [1, 2, 3, 4].filter(n => n !== g.sync.you));
  const g4 = w.guests[2], seen = g4.sync.players.map.get(2).pose.tractor.p; assert.ok(dist(seen, w.guests[0].game.tractor) < 0.3);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `node --test test/mp.test.mjs` — Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `src/net/players.js`**

```js
// src/net/players.js
// Other players as this device shows them (M-2, M-11, M-25): number, paints, away, and their vehicle messages through an interpolation buffer.
import { createInterp, lerpPose, lerp, lerpAngle } from './interp.js';
import { quatAxes } from '../sim/tractor.js';

export const SEND = { vehicle: 50, herd: 66 }; // ms: about 20 and 15 messages each second (M-22, M-23)
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
    push(msg, arrival) { const p = map.get(msg.player); if (!p || !p.interp.push(msg.time, arrival, msg)) return false; p.latest = msg; return true; },
    sample(now) {
      for (const p of map.values()) {
        const s = p.interp.sample(now); if (!s) continue;
        p.pose ||= { tractor: pose(), cars: [pose(), pose()] };
        lerpPose(s.a.bodies[0], s.b.bodies[0], s.k, p.pose.tractor); lerpPose(s.a.bodies[1], s.b.bodies[1], s.k, p.pose.cars[0]); lerpPose(s.a.bodies[2], s.b.bodies[2], s.k, p.pose.cars[1]);
        p.yaw = yawOfQuat(p.pose.tractor.q); p.mode = s.b.mode; p.full = s.b.full;
        const dt = (s.b.time - s.a.time) / 1000, A = s.a.bodies[0].p, B = s.b.bodies[0].p; if (dt > 0) p.speed = Math.hypot(B.x - A.x, B.z - A.z) / dt;
        const before = new Map(s.a.carried.map(c => [c.id, c]));
        p.carried = s.b.carried.map(c => { const o = before.get(c.id); return o && !c.flying ? { ...c, x: lerp(o.x, c.x, s.k), y: lerp(o.y, c.y, s.k), z: lerp(o.z, c.z, s.k), yaw: lerpAngle(o.yaw, c.yaw, s.k) } : c; });
      }
    },
    others: () => [...map.values()].filter(p => p.pose).map(p => ({ n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed })),
  };
}
// M-22: this device's own train and the animals it owns (in flight to it or in a slot)
export function vehicleOf(game, player, time) {
  const bodies = [game.tractor.body, ...game.train.cars.map(c => c.body)].map(b => ({ p: b.translation(), q: b.rotation() }));
  const carried = [];
  for (const f of game.flights) if (f.u >= 0) carried.push({ id: f.animal.id, type: f.animal.type, golden: f.animal.golden, flying: true, riding: false, x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.animal.yaw });
  for (const s of game.load.slots) if (s.landed && s.animal.state === 'ride') { const a = s.animal, c = game.train.cars[s.car].body;
    carried.push({ id: a.id, type: a.type, golden: a.golden, flying: false, riding: true, x: a.x, y: a.y, z: a.z, yaw: yawOfQuat(c.rotation()) }); }
  const mode = game.mode === 'drive' ? 'drive' : game.mode === 'arrive' || game.mode === 'show' ? 'show' : 'held';
  return { player, time, mode, full: game.load.full(), bodies, carried: carried.slice(0, 16) };
}
```

Riders' `x/y/z` are world positions kept up to date by `game.step` (the D-12 loop), so the message uses them as they are.

- [ ] **Step 5: Implement `src/net/host.js`** (join, roster, vehicles, herd; claims and the rest come in later tasks — leave the handler table open for them)

```js
// src/net/host.js
// Host sync (M-11..M-19, M-24, M-39, M-50). The host owns the free animals, the trees and the respawns; every guest owns its own train.
// Guests are numbered 2..4 in join order (M-35). Bad or too many messages are dropped (M-50); a handler error never reaches the game (M-44).
import { encodeVehicle, decodeVehicle, encodeHerd, kindOf, KIND } from './codec.js';
import { checkFromGuest, createRate, NET_VERSION, MAX_PLAYERS } from './protocol.js';
import { createPlayers, vehicleOf, SEND } from './players.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';

const HERD_OUT = new Set(['gone', 'fly', 'ride', 'show', 'carried', 'elsewhere']); // not in the herd message: gone, or in a train (the owner's vehicle message has them)
export function herdRecords(herd) { // M-24: every animal for a welcome
  return herd.animals.map(a => ({ id: a.id, type: a.type, golden: a.golden, home: a.home, leader: a.leader, line: a.line, x: a.x, z: a.z, yaw: a.yaw, epoch: a.epoch, hidden: a.hidden,
    state: a.state === 'gone' ? 'gone' : HERD_OUT.has(a.state) ? 'carried' : NOT_FREE.has(a.state) ? 'busy' : 'free' }));
}
export function createHostSync({ game, net, paint }) {
  const players = createPlayers(), byPeer = new Map(), rates = new Map(), out = [], bumper = createBumper();
  let lastVeh = -Infinity, lastHerd = -Infinity, closed = false, myPaint = { ...paint }, nowMs = 0;
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.list()) if (p.n !== except && p.peer) net.send(p.peer, m, rel); };
  const roster = () => [{ n: 1, paint: myPaint, away: false }, ...players.list().map(p => ({ n: p.n, paint: p.paint, away: p.away }))];
  const welcome = p => ({ t: 'welcome', v: NET_VERSION, seed: game.farm.seed, you: p.n, players: roster(), herd: herdRecords(game.herd), trees: game.trees.brokenIds() });
  const freeNumber = () => { for (let n = 2; n <= MAX_PLAYERS; n++) if (![...players.map.keys()].includes(n)) return n; return 0; };
  const handlers = {
    hello(p, m) { if (p.helloed) return; p.helloed = true; p.paint = m.paint; send(p.n, welcome(p)); all({ t: 'players', list: roster() }, true, p.n); },
    paint(p, m) { p.paint = m.paint; all({ t: 'players', list: roster() }); },
  };
  net.on('peer', id => { if (closed) return; const n = freeNumber(); if (!n) return; const p = players.ensure(n); p.peer = id; byPeer.set(id, n); rates.set(id, { fast: createRate(), rel: createRate() }); });
  net.on('message', (from, data, reliable) => {
    try {
      const n = byPeer.get(from), p = n && players.map.get(n); if (!p || closed) return;
      const r = rates.get(from); if (!(reliable ? r.rel : r.fast).allow(nowMs)) return; // M-50 (the sim clock: tests and the game agree)
      if (data instanceof ArrayBuffer) {
        if (!p.helloed || kindOf(data) !== KIND.VEHICLE) return;
        new DataView(data).setUint8(1, n); // M-50: a guest speaks only for itself
        const m = decodeVehicle(data); if (!m) return;
        const first = !p.latest; if (players.push(m, nowMs) && first) out.push({ type: 'playerJoined', n, x: m.bodies[0].p.x, z: m.bodies[0].p.z });
        for (const q of players.list()) if (q.n !== n && q.peer) net.send(q.peer, data, false); // M-22: the host passes each train on
        return;
      }
      const m = checkFromGuest(data); if (!m || (!p.helloed && m.t !== 'hello')) return;
      handlers[m.t]?.(p, m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  const sync = {
    players, handlers, out, // handlers and out are extended by later tasks in this file
    get game() { return game; }, you: 1,
    before(now) {
      nowMs = now; players.sample(now); game.others = players.others();
      bumper.step(1 / 60, game.tractor, game.others, out);
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now;
      if (now - lastVeh >= SEND.vehicle) { lastVeh = now; all(encodeVehicle(vehicleOf(game, 1, now)), false); }
      if (now - lastHerd >= SEND.herd) { lastHerd = now; all(encodeHerd(herdMessage(game.herd, now)), false); }
    },
    setGame(g) { game = g; for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; if (p.helloed) send(p.n, welcome(p)); } }, // M-19
    setPaint(pt) { myPaint = { ...pt }; all({ t: 'players', list: roster() }); },
    showStarted() {}, delivered() {}, requestHelp() {}, // filled in by Tasks 9 and 10
    close() { closed = true; },
  };
  return sync;
}
// M-23: the free animals and the ones walking into the barn (busy), with their ownership numbers
export function herdMessage(herd, time) {
  const animals = [];
  for (const a of herd.animals) if (!HERD_OUT.has(a.state)) animals.push({ id: a.id, epoch: a.epoch, type: a.type, golden: a.golden, hidden: a.hidden, busy: NOT_FREE.has(a.state), x: a.x, y: a.y || 0, z: a.z, yaw: a.yaw, anim: a.anim, leader: a.leader, line: a.line });
  return { time, animals: animals.slice(0, 96) };
}
```

- [ ] **Step 6: Implement `src/net/guest.js`** (join, apply welcome, snapshots, vehicles)

```js
// src/net/guest.js
// Guest sync (M-1, M-11..M-19, M-24..M-26, M-40, M-41). The guest drives its own train; it shows the host's animals from herd messages and
// every other train from vehicle messages. Its claims wait for the host's answer (M-13, M-14).
import { encodeVehicle, decodeVehicle, decodeHerd, kindOf, KIND } from './codec.js';
import { checkFromHost, NET_VERSION } from './protocol.js';
import { createPlayers, vehicleOf, SEND } from './players.js';
import { createInterp, lerp, lerpAngle } from './interp.js';
import { createBumper } from '../sim/bump.js';

const OWN = new Set(['fly', 'ride', 'show', 'toBarn', 'gone']); // states this guest's own animals can have: herd messages never move them
export function createGuestSync({ game, net, paint, onFarm }) {
  const players = createPlayers(), herdBuf = createInterp(), out = [], bumper = createBumper(), pending = new Set();
  let you = 0, hostPeer = null, lastVeh = -Infinity, nowMs = 0, alone = false, myPaint = { ...paint }, deferred = null;
  const toHost = (m, rel = true) => { if (hostPeer && !alone) net.send(hostPeer, m, rel); };
  const applyRoster = list => {
    const seen = new Set();
    for (const r of list) { if (r.n === you) continue; seen.add(r.n); const p = players.ensure(r.n); p.paint = r.paint; p.away = r.away; }
    for (const p of players.list()) if (!seen.has(p.n)) { players.remove(p.n); if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); }
  };
  function applyWelcome(m) {
    you = m.you; game = onFarm(m.seed, m.you); // M-1: always rebuild from the host's seed (no solo riders come along)
    game.herd.remote = true; game.claims = true; pending.clear(); herdBuf.reset();
    for (const r of m.herd) { const a = game.herd.ensure(r.id, r.type, r.golden); Object.assign(a, { home: r.home, leader: r.leader, line: r.line, x: r.x, z: r.z, yaw: r.yaw, epoch: r.epoch, hidden: r.hidden });
      a.state = r.state === 'gone' ? 'gone' : r.state === 'carried' ? 'elsewhere' : r.state === 'busy' ? 'toBarn' : r.hidden ? 'hide' : 'idle'; }
    for (const id of m.trees) game.trees.breakById(id); // already broken: no burst (M-17)
    for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; }
    applyRoster(m.players);
  }
  const handlers = {
    welcome(m) { if (m.v !== NET_VERSION) return; if (['arrive', 'show', 'reward'].includes(game.mode) && you) { deferred = m; return; } applyWelcome(m); }, // M-19: after the show
    players(m) { applyRoster(m.list); },
  };
  net.on('peer', id => { hostPeer = id; toHost({ t: 'hello', v: NET_VERSION, paint: myPaint }); });
  net.on('message', (from, data) => {
    try {
      if (from !== hostPeer || alone) return;
      if (data instanceof ArrayBuffer) {
        if (!you) return;
        if (kindOf(data) === KIND.VEHICLE) { const v = decodeVehicle(data); if (v && v.player !== you && players.map.has(v.player)) { const first = !players.map.get(v.player).latest;
          if (players.push(v, nowMs) && first) out.push({ type: 'playerJoined', n: v.player, x: v.bodies[0].p.x, z: v.bodies[0].p.z }); } }
        else if (kindOf(data) === KIND.HERD) { const h = decodeHerd(data); if (h) herdBuf.push(h.time, nowMs, h); }
        return;
      }
      const m = checkFromHost(data); if (m) handlers[m.t]?.(m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  function applyHerd(now) { // M-23, M-25, M-26: the host's animals, smoothly, ignoring old ownership numbers and our own animals
    const s = herdBuf.sample(now); if (!s) return;
    const prev = new Map(s.a.animals.map(a => [a.id, a])), seen = new Set(), herd = game.herd;
    for (const r of s.b.animals) {
      const a = herd.ensure(r.id, r.type, r.golden); seen.add(r.id);
      if (pending.has(r.id) || r.epoch < a.epoch || OWN.has(a.state) && a.epoch >= r.epoch && a.state !== 'gone') continue;
      const o = prev.get(r.id), k = o ? s.k : 1, f = o || r;
      a.epoch = r.epoch; a.x = lerp(f.x, r.x, k); a.z = lerp(f.z, r.z, k); a.y = lerp(f.y, r.y, k); a.yaw = lerpAngle(f.yaw, r.yaw, k);
      a.anim = r.anim; a.hidden = r.hidden; a.leader = r.leader; a.line = r.line;
      a.state = r.busy ? 'toBarn' : r.hidden ? 'hide' : a.state === 'dodge' ? 'dodge' : 'idle';
    }
    for (const a of herd.animals) if (!seen.has(a.id) && !OWN.has(a.state) && a.state !== 'carried' && !pending.has(a.id)) a.state = 'elsewhere';
  }
  function applyCarried() { // M-11: animals in other trains, at the positions their owners send
    for (const p of players.list()) for (const c of p.carried) { if (pending.has(c.id)) continue; const a = game.herd.ensure(c.id, c.type, c.golden);
      if (a.state === 'fly' || a.state === 'ride' || a.state === 'show') continue; // ours
      Object.assign(a, { state: 'carried', x: c.x, y: c.y, z: c.z, yaw: c.yaw, riding: c.riding, anim: c.flying ? 'run' : 'idle' }); }
  }
  const sync = {
    players, handlers, out, pending,
    get game() { return game; }, get you() { return you; }, get alone() { return alone; },
    before(now) {
      nowMs = now; if (!you) return out.splice(0);
      if (deferred && game.mode === 'drive') { const m = deferred; deferred = null; applyWelcome(m); }
      if (!alone) { applyHerd(now); players.sample(now); for (const a of game.herd.animals) if (a.state === 'carried') a.state = 'elsewhere'; applyCarried(); }
      game.others = players.others(); bumper.step(1 / 60, game.tractor, game.others, out);
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now; if (!you || alone) return;
      if (now - lastVeh >= SEND.vehicle) { lastVeh = now; toHost(encodeVehicle(vehicleOf(game, you, now)), false); }
    },
    setGame(g) { game = g; },
    setPaint(pt) { myPaint = { ...pt }; toHost({ t: 'paint', paint: myPaint }); },
    showStarted() {}, delivered() {}, requestHelp() { return false; }, // filled in by Tasks 9 and 10
    close() { alone = true; },
  };
  return sync;
}
```

`applyCarried` runs after resetting every `carried` animal to `elsewhere`, so an animal that left a train (delivered, or a released claim) does not stay drawn there.

- [ ] **Step 7: Run to verify they pass**

Run: `node --test test/mp.test.mjs` — Expected: 5 pass. If the "far network" test fails only on the animal check, print the worst distance; the threshold may move to 2 m only if the cause is the 300 ms delay with running animals (≤ 2.2 m/s × 0.3 s + jitter). Do not loosen the other tests.

- [ ] **Step 8: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/net/players.js src/net/host.js src/net/guest.js test/mp.harness.mjs test/mp.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - join, roster, vehicle and herd sync with a two-game test harness (M-1, M-11, M-22..M-25, M-52)"
```

### Task 9: Boops and claims, first come (M-3, M-13, M-14, M-15, M-26, M-50 claim range)

**Files:**
- Modify: `src/net/host.js`, `src/net/guest.js`
- Test: `test/mp.test.mjs` (append)

**Interfaces:**
- Consumes: `game.resolveClaim`, `unclaim` events, `CLAIM_WAIT` (Task 6); `players.map.get(n).latest.bodies[0].p` (latest real position of a guest tractor).
- Produces:
  - Guest → host `claim {ids}` (all animals launched in one step, a chick line in one claim) and `release {ids}` (after a timeout).
  - Host → guest `claimed { ok, no, epochs: [[id, epoch]] }`.
  - Host: a granted animal gets `state = 'carried'`, `owner = n`, `epoch + 1`; the host's own launches raise `epoch` by 1 (M-15, M-26). `CLAIM_RANGE = 8`.
  - Guest: a claimed id is in `sync.pending` until the answer; refused ids return `unclaim` events through `before()`.

- [ ] **Step 1: Write the failing tests** (append to `test/mp.test.mjs`)

```js
const boopAt = (w, dev, pick) => { const a = pick(dev.game); inFront(dev, a); return a; };
const single = g => g.herd.free().find(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id) && x.home === 'route');

test('a guest boop is claimed and granted: the animal lands in the guest wagon, and the host shows it there (M-13, M-14)', async () => {
  const w = await mpWorld({ seed: 31 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game);
  const ga = g.game.herd.animals[ha.id]; inFront(g, ga); inFront(w.host, ha, 999); // move it in front of the guest on both devices
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = p.x; ha.z = p.z; ha.state = 'idle'; ha.timer = 99; }
  w.seconds(3);
  assert.ok(g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'it landed on the guest');
  assert.equal(ha.state, 'carried'); assert.equal(ha.owner, 2); assert.equal(ha.epoch, 1);
  w.seconds(0.5);
  assert.ok(dist(ha, ga) < 0.6, `host draws it in the guest wagon (${dist(ha, ga).toFixed(2)} m)`);
});
test('when host and guest boop the same animal at once, the host is first; the guest copy poofs (M-14, M-15)', async () => {
  const w = await mpWorld({ seed: 32, link: { delay: 80 } }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  inFront(w.host, ha); { const p = w.host.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ga.x = p.x; ga.z = p.z; } // the guest sees it at the host's nose
  // put the guest's tractor right behind the animal too: teleport the guest train next to the host's
  ga.x = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}).x; ga.z = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}).z; ga.state = 'idle'; ga.timer = 99;
  w.seconds(3);
  assert.ok(w.host.events.some(e => e.type === 'land' && e.animal === ha), 'host got it');
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'refused'), 'guest poofed');
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'never landed on the guest (R-4)');
  assert.equal(g.game.load.slots.length, 0);
});
test('a late yes: the animal waits at the top of its arc, then lands (M-14)', async () => {
  const w = await mpWorld({ seed: 33, link: { delay: 400 } }); w.seconds(2);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3);
  const fl = g.events.find(e => e.type === 'launch' && e.animal.id === ha.id), land = g.events.find(e => e.type === 'land' && e.animal.id === ha.id);
  assert.ok(fl && land, 'launched and landed'); assert.ok(!g.events.some(e => e.type === 'unclaim'));
});
test('no answer within 1 s: the guest poofs it and releases it; the host frees it (M-14)', async () => {
  const w = await mpWorld({ seed: 34 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.hub.away(w.host.net.id); w.seconds(0.05); w.hub.back(w.host.net.id); // (messages sent while away are lost)
  w.hub.away(g.net.id); w.seconds(2.5); w.hub.back(g.net.id); w.seconds(1);
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.reason === 'timeout'));
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', `host freed it (${ha.state})`);
});
test('the host refuses a claim from a tractor more than 8 m away (M-50)', async () => {
  const w = await mpWorld({ seed: 35 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game);
  g.net.send(w.host.net.id, { t: 'claim', ids: [ha.id] }, true); w.seconds(0.3);
  assert.ok(free(w.host.game, ha), 'still free');
});
test('the host boop raises the ownership number and the animal leaves the guest free list (M-15, M-26)', async () => {
  const w = await mpWorld({ seed: 36 }); w.seconds(1);
  const ha = single(w.host.game), e0 = ha.epoch; inFront(w.host, ha); w.seconds(2);
  assert.equal(ha.epoch, e0 + 1); const ga = w.guests[0].game.herd.animals[ha.id];
  assert.ok(!free(w.guests[0].game, ga)); assert.ok(['carried', 'elsewhere'].includes(ga.state));
});
```

The second test teleports positions only through animal placement; if the two tractors cannot both reach the same animal in time with the default spawn places, change the test to place the guest's train with a helper that sets the guest tractor's body next to the host's (copy `moveTrain` from `test/game.test.mjs` into `mp.harness.mjs` as `moveTrain(game, x, z, yaw)` and export it), then put the animal 2.5 m in front of both noses. Keep the assertions.

- [ ] **Step 2: Run to verify they fail** — `node --test test/mp.test.mjs`: the 6 new tests fail (no claims are sent or answered).

- [ ] **Step 3: Implement in `src/net/host.js`**

Add `export const CLAIM_RANGE = 8;` and in `createHostSync`:
```js
  const owned = n => game.herd.animals.filter(a => a.state === 'carried' && a.owner === n);
  const freeUp = a => { a.state = 'idle'; a.timer = 1; a.owner = null; a.epoch++; a.y = 0; };
  Object.assign(handlers, {
    // M-13: first claim wins; the guest's last real tractor position must be within 8 m of the animal (M-50)
    claim(p, m) {
      const ok = [], no = [], epochs = [], t = p.latest?.bodies[0].p;
      for (const id of m.ids) { const a = game.herd.animals[id];
        if (a && t && !NOT_FREE.has(a.state) && Math.hypot(a.x - t.x, a.z - t.z) <= CLAIM_RANGE) { a.state = 'carried'; a.owner = p.n; a.epoch++; a.hidden = false; ok.push(id); epochs.push([id, a.epoch]); }
        else no.push(id); }
      send(p.n, { t: 'claimed', ok, no, epochs });
    },
    release(p, m) { for (const id of m.ids) { const a = game.herd.animals[id]; if (a?.state === 'carried' && a.owner === p.n) freeUp(a); } }, // M-14 timeout
  });
```
In `before(now)`, after `players.sample(now)`, set the guests' carried animals' positions:
```js
      for (const p of players.list()) for (const c of p.carried) { const a = game.herd.animals[c.id]; if (a?.state === 'carried' && a.owner === p.n) Object.assign(a, { x: c.x, y: c.y, z: c.z, yaw: c.yaw, riding: c.riding, anim: c.flying ? 'run' : 'idle' }); }
```
In `after(events, now)`, first:
```js
      for (const e of events) if (e.type === 'launch') e.animal.epoch++; // M-15, M-26: the host's own boop changes the owner
```
Expose `owned` and `freeUp` on the sync object (`sync.owned = owned; sync.freeUp = freeUp;`) for Task 10/12.

- [ ] **Step 4: Implement in `src/net/guest.js`**

In `handlers`:
```js
    claimed(m) { // M-14
      for (const [id, e] of m.epochs) { const a = game.herd.animals[id]; if (a) a.epoch = e; }
      for (const id of m.ok) { pending.delete(id); game.resolveClaim(id, true); }
      for (const id of m.no) { pending.delete(id); out.push(...game.resolveClaim(id, false)); }
    },
```
In `after(events, now)`, before the vehicle send:
```js
      const ids = [], gone = [];
      for (const e of events) { if (e.type === 'launch') { ids.push(e.animal.id); pending.add(e.animal.id); } if (e.type === 'unclaim') { pending.delete(e.animal.id); if (e.reason === 'timeout') gone.push(e.animal.id); } }
      if (ids.length) toHost({ t: 'claim', ids: ids.slice(0, 16) }); // M-13: a chick line goes in one claim
      if (gone.length) toHost({ t: 'release', ids: gone });
```

- [ ] **Step 5: Run to verify they pass** — `node --test test/mp.test.mjs`: all pass.

- [ ] **Step 6: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/net/host.js src/net/guest.js test/mp.test.mjs test/mp.harness.mjs
git commit -m "feat: Tractor Pickup multiplayer - boop claims, first come, land after a yes (M-13..M-15, M-26)"
```

### Task 10: Delivery, respawn, B-14 for guests, trees, regrow, horn, help, paint, new farm (M-6, M-8, M-9, M-12, M-16, M-17, M-19)

**Files:**
- Modify: `src/net/host.js`, `src/net/guest.js`
- Test: `test/mp.test.mjs` (append)

**Interfaces:**
- Consumes: `fullDodge` (Task 6), `trees.breakById` (Task 6), `herd.callHelp`, `herd.horn`, `herd.respawn`.
- Produces:
  - Guest → host: `delivered {ids}` (from `sync.delivered(riders)`), `tree {id}` (own breaks), `regrow {}` (from `sync.showStarted()`), `horn {}`, `help {}` (from `sync.requestHelp()`, returns true when sent).
  - Host → guests: `tree {id}`, `regrow {}`, `horn {n}`, `help {id|null}`, a new `welcome` after `setGame` (already in Task 8).
  - Events from `before()`: `{ type: 'treeBreak', tree, dir, speed: 0, remote: true }` (gibs), `{ type: 'remoteHorn', n }`, `{ type: 'help', animal }` (guest only).
  - `TREE_RANGE = 12`.

- [ ] **Step 1: Write the failing tests** (append)

```js
test('after a guest show, the host removes the delivered animals and makes new ones (M-6, M-16)', async () => {
  const w = await mpWorld({ seed: 41 }); w.seconds(1);
  const g = w.guests[0], h = w.host.game.herd, ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(ha.state, 'carried');
  const before = h.animals.length, riders = g.game.startShow(); g.sync.showStarted(); riders.forEach(r => { r.animal.state = 'show'; }); g.game.finishShow(riders); g.sync.delivered(riders);
  w.seconds(0.5);
  assert.equal(ha.state, 'gone'); assert.ok(h.animals.length > before, 'new animals'); assert.equal(h.free().filter(a => a.home === 'route').length, 18);
  w.seconds(1); assert.ok(g.game.herd.animals.length >= h.animals.length, 'the guest knows the new ones');
});
test('a guest trailer that is full makes animals hop out of its way on the host (M-12, B-14)', async () => {
  const w = await mpWorld({ seed: 42 }); w.seconds(1);
  const g = w.guests[0]; for (let i = 0; i < 12; i++) g.game.load.land(g.game.load.reserve({ id: 500 + i, state: 'ride', type: 'pig', golden: false, x: 0, y: 0, z: 0 }));
  w.seconds(0.5);
  const ha = single(w.host.game), p = g.game.tractorWorld({ x: 3, y: 0, z: 0 }, {}); ha.x = p.x; ha.z = p.z; ha.state = 'idle'; ha.timer = 99;
  w.seconds(0.3); assert.ok(w.host.events.some(e => e.type === 'dodge' && e.animal === ha));
});
test('trees: a guest break shows on the host and the other guests; the host break shows on guests; a show regrows them (M-17)', async () => {
  const w = await mpWorld({ seed: 43, guests: 2 }); w.seconds(1);
  const [g1, g2] = w.guests, t = g1.game.trees.list.find(x => x.kind === 'tree');
  // move guest 1's tractor next to the tree on the host's view: use a broken-by-id break on the guest (as trees.step would) and let after() report it
  g1.game.trees.breakById(t.id); g1.sync.after([{ type: 'treeBreak', tree: t, dir: { x: 1, z: 0 }, speed: 5 }], w.now);
  w.seconds(0.3);
  assert.notEqual(w.host.game.trees.list[t.id].state, 'broken', 'too far from guest 1 (12 m): refused');
  const near = g1.game.trees.list.find(x => x.kind === 'tree' && Math.hypot(x.x - g1.game.tractor.x, x.z - g1.game.tractor.z) < 60);
  assert.ok(near, 'a tree within reach of a moved tractor exists');
  // put guest 1's tractor next to that tree (latest vehicle message is what the host checks)
  const { moveTrain } = await import('./mp.harness.mjs'); moveTrain(g1.game, near.x - 3, near.z, Math.PI / 2); w.seconds(0.3);
  g1.game.trees.breakById(near.id); g1.sync.after([{ type: 'treeBreak', tree: near, dir: { x: 1, z: 0 }, speed: 5 }], w.now); w.seconds(0.3);
  assert.equal(w.host.game.trees.list[near.id].state, 'broken'); assert.equal(g2.game.trees.list[near.id].state, 'broken');
  assert.ok(w.host.events.some(e => e.type === 'treeBreak' && e.tree.id === near.id), 'host bursts it');
  const ht = w.host.game.trees.list.find(x => x.state === 'standing'); w.host.sync.after([{ type: 'treeBreak', tree: w.host.game.trees.breakById(ht.id).tree }], w.now); w.seconds(0.3);
  assert.equal(g1.game.trees.list[ht.id].state, 'broken');
  g2.game.startShow(); g2.sync.showStarted(); w.seconds(0.3);
  for (const d of w.devs) assert.ok(!d.game.trees.list.some(x => x.state === 'broken'), `${d.name} regrew`);
});
test('the guest horn calls host animals to the guest tractor; the other devices hear it (M-8)', async () => {
  const w = await mpWorld({ seed: 44 }); w.seconds(1);
  const g = w.guests[0], gt = g.game.tractor, pig = w.host.game.herd.free().find(a => a.type === 'pig' && !a.hidden);
  pig.x = gt.x + 10; pig.z = gt.z; pig.state = 'idle'; pig.timer = 99;
  w.step(1, [STILL, { thr: 0, steer: 0, horn: true }]); w.seconds(0.3);
  assert.equal(pig.state, 'come'); assert.ok(Math.hypot(pig.tx - gt.x, pig.tz - gt.z) < 8);
  assert.ok(w.host.events.some(e => e.type === 'remoteHorn' && e.n === 2));
});
test('help: the host sends a helper animal to the guest that asked (M-9)', async () => {
  const w = await mpWorld({ seed: 45 }); w.seconds(1);
  const g = w.guests[0]; assert.equal(g.sync.requestHelp(), true); w.seconds(0.3);
  const h = g.events.find(e => e.type === 'help'); assert.ok(h && h.animal); assert.equal(w.host.game.herd.animals[h.animal.id].state, 'help');
});
test('paint changes reach the other devices (M-2)', async () => {
  const w = await mpWorld({ seed: 46 }); w.seconds(1);
  w.guests[0].sync.setPaint({ body: 'pink', trim: 'green' }); w.host.sync.setPaint({ body: 'white', trim: 'blue' }); w.seconds(0.3);
  assert.deepEqual(w.host.sync.players.map.get(2).paint, { body: 'pink', trim: 'green' });
  assert.deepEqual(w.guests[0].sync.players.map.get(1).paint, { body: 'white', trim: 'blue' });
});
test('a new farm on the host: the guest makes it too, after its own show (M-19)', async () => {
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default, { createGame } = await import('../src/sim/game.js');
  const w = await mpWorld({ seed: 47 }); w.seconds(1);
  const g = w.guests[0]; g.game.mode = 'show';
  w.host.game = createGame(RAPIER, { seed: 48, power: 'medium' }); w.host.sync.setGame(w.host.game); w.seconds(0.5);
  assert.equal(g.game.farm.seed, 47, 'not during the show');
  g.game.mode = 'drive'; w.seconds(0.5); assert.equal(g.game.farm.seed, 48);
});
```

Add `moveTrain` to `test/mp.harness.mjs` (copied from `test/game.test.mjs`, unchanged, plus `import { quatAxes } from '../src/sim/tractor.js';`) and export it.

- [ ] **Step 2: Run to verify they fail** — the 7 new tests fail.

- [ ] **Step 3: Implement in `src/net/host.js`**

Add `import { fullDodge } from '../sim/game.js';` and `export const TREE_RANGE = 12;`. Add handlers:
```js
  const guestAt = p => p.latest?.bodies[0].p; // the guest's last real tractor position (M-50)
  const tractorOf = p => ({ x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed });
  Object.assign(handlers, {
    delivered(p, m) { let any = false; for (const id of m.ids) { const a = game.herd.animals[id]; if (a?.state === 'carried' && a.owner === p.n) { a.state = 'gone'; a.epoch++; any = true; } } if (any) game.herd.respawn(); }, // M-6, M-16
    tree(p, m) { const t = game.trees.list[m.id], at = guestAt(p); if (!t || !at || Math.hypot(t.x - at.x, t.z - at.z) > TREE_RANGE) return; // M-17, M-50
      const e = game.trees.breakById(m.id, { x: Math.sin(p.yaw), z: Math.cos(p.yaw) }); if (!e) return; out.push(e); all({ t: 'tree', id: m.id }, true, p.n); },
    regrow(p) { game.trees.reset(); all({ t: 'regrow' }, true, p.n); }, // M-17: any show regrows everything
    horn(p) { if (!p.pose) return; game.herd.horn(tractorOf(p)); out.push({ type: 'remoteHorn', n: p.n }); all({ t: 'horn', n: p.n }, true, p.n); }, // M-8
    help(p) { const c = p.pose ? game.herd.callHelp(tractorOf(p)) : null; send(p.n, { t: 'help', id: c ? c.id : null }); }, // M-9
  });
```
In `before(now)`, after the carried positions:
```js
      for (const p of players.list()) if (p.pose && p.full && p.mode === 'drive' && !p.away) fullDodge(game.herd, p.pose.tractor.p, p.pose.tractor.q, p.pose.cars, out); // M-12, B-14
```
In `after(events, now)` loop add: `if (e.type === 'treeBreak' && !e.remote) all({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') all({ t: 'horn', n: 1 });`.
Replace the stubs: `showStarted() { all({ t: 'regrow' }); }` (the host's own `startShow` already reset its trees). `delivered()` and `requestHelp()` stay no-ops for the host (main.js calls `callHelp` directly on the host, Task 15).

- [ ] **Step 4: Implement in `src/net/guest.js`**

Handlers:
```js
    tree(m) { const e = game.trees.breakById(m.id); if (e) out.push(e); },
    regrow() { game.trees.reset(); },
    horn(m) { out.push({ type: 'remoteHorn', n: m.n }); },
    help(m) { const a = m.id === null ? null : game.herd.animals[m.id]; if (a) out.push({ type: 'help', animal: a }); },
```
In `after()` events loop add: `if (e.type === 'treeBreak' && !e.remote) toHost({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') toHost({ t: 'horn' });`.
Replace the stubs:
```js
    showStarted() { toHost({ t: 'regrow' }); },
    delivered(riders) { const ids = riders.map(r => r.animal.id).filter(id => id < 0x10000); if (ids.length) toHost({ t: 'delivered', ids: ids.slice(0, 16) }); },
    requestHelp() { if (!you || alone) return false; toHost({ t: 'help' }); return true; },
```

- [ ] **Step 5: Run to verify they pass** — `node --test test/mp.test.mjs`: all pass.

- [ ] **Step 6: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/net/host.js src/net/guest.js test/mp.test.mjs test/mp.harness.mjs
git commit -m "feat: Tractor Pickup multiplayer - delivery and respawn, trees, horn, help, paints, new farm (M-6, M-8, M-9, M-12, M-16, M-17, M-19)"
```

### Task 11: Bad and excessive messages (M-44, M-50)

**Files:**
- Modify: `src/net/host.js`, `src/net/guest.js` (only if a test finds a gap)
- Test: `test/mp.test.mjs` (append)

**Interfaces:** none new.

- [ ] **Step 1: Write the tests** (append)

```js
import { encodeVehicle } from '../src/net/codec.js';
test('garbage, wrong kinds, odd JSON and a flood never break the host or the guest (M-44, M-50)', async () => {
  const w = await mpWorld({ seed: 51 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id, G = g.net.id;
  const junk = [new ArrayBuffer(0), new Uint8Array([2, 0, 0]).buffer, new Uint8Array(500).fill(255).buffer, { t: 'welcome', v: 1 }, { t: 'claim', ids: [99999] }, { t: 'tree', id: -1 }, null, 'text', 42, { t: 'claim', ids: [1e9] }];
  for (const j of junk) { g.net.send(H, j, typeof j === 'object' && !(j instanceof ArrayBuffer)); w.host.net.send(G, j, typeof j === 'object' && !(j instanceof ArrayBuffer)); }
  w.seconds(0.5);
  assert.equal(g.game.farm.seed, 51); assert.equal(g.sync.you, 2); assert.equal(w.host.sync.players.list().length, 1);
});
test('a guest cannot speak for another player: the host rewrites the player number (M-50)', async () => {
  const w = await mpWorld({ seed: 52, guests: 2 }); w.seconds(1);
  const [g1] = w.guests, fake = encodeVehicle({ player: 3, time: 1e9, mode: 'drive', full: false, bodies: [0, 1, 2].map(() => ({ p: { x: 40, y: 1, z: 40 }, q: { x: 0, y: 0, z: 0, w: 1 } })), carried: [] });
  g1.net.send(w.host.net.id, fake); w.seconds(0.3);
  const p3 = w.host.sync.players.map.get(3).pose.tractor.p; assert.ok(Math.hypot(p3.x - 40, p3.z - 40) > 1, 'player 3 did not move');
});
test('a flood of claims: at most 60 each second are handled (M-50)', async () => {
  const w = await mpWorld({ seed: 53 }); w.seconds(1);
  let handled = 0; const orig = w.host.sync.handlers.claim; w.host.sync.handlers.claim = (...a) => { handled++; return orig(...a); };
  for (let i = 0; i < 300; i++) w.guests[0].net.send(w.host.net.id, { t: 'claim', ids: [0] }, true);
  w.seconds(0.2); assert.ok(handled <= 60, `${handled}`);
});
test('a handler that throws is contained (M-44)', async () => {
  const w = await mpWorld({ seed: 54 }); w.seconds(1);
  w.host.sync.handlers.horn = () => { throw new Error('boom'); };
  w.step(1, [STILL, { thr: 0, steer: 0, horn: true }]); w.seconds(0.3);
  assert.equal(w.guests[0].sync.you, 2);
});
```

The host's rate limiter uses the clock passed to `before/after` (`nowMs`); the whole flood arrives in one 1 s window, so 60 is the cap.

- [ ] **Step 2: Run** — `node --test test/mp.test.mjs`. Expected: pass if Tasks 8–10 were followed; fix any gap the run shows (with the smallest change in the handler or check that let it through) before going on.

- [ ] **Step 3: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add test/mp.test.mjs src/net/host.js src/net/guest.js
git commit -m "test: Tractor Pickup multiplayer - bad messages, player spoofing, floods (M-44, M-50)"
```

### Task 12: Connection loss — away, back, left, alone on the same farm (M-39, M-40, M-41)

**Files:**
- Modify: `src/net/host.js`, `src/net/guest.js`
- Test: `test/mp.test.mjs` (append)

**Interfaces:**
- Consumes: link events `peerAway/peerBack/peerLeft/hostAway/hostBack/closed`.
- Produces:
  - Host: `peerAway` → that player `away = true` (roster broadcast); `peerBack` → `false`; `peerLeft` → the player is removed with a `playerGone` event, its carried animals become `gone` (epoch + 1) and the herd respawns (M-39).
  - Guest: `hostAway` → `game.boopsPaused = true`, player 1 `away = true`; `hostBack` → reversed; `closed(reason)` → **alone**: `herd.remote = false`, `claims = false`, pending flights granted, `boopsPaused = false`, animals in other trains and `elsewhere` ones → `gone`, free ones keep their place, `herd.respawn()`, every other player removed with `playerGone`, `game.others = []`, an event `{ type: 'alone', reason }` (M-41). `sync.alone` becomes true; `before()` keeps returning events (bump off), `after()` sends nothing.

- [ ] **Step 1: Write the failing tests** (append)

```js
test('a guest that drops is shown away; back in time it carries on (M-39)', async () => {
  const w = await mpWorld({ seed: 61 }); w.seconds(1);
  w.hub.away(w.guests[0].net.id); w.seconds(0.2); assert.equal(w.host.sync.players.map.get(2).away, true);
  w.hub.back(w.guests[0].net.id); w.seconds(0.2); assert.equal(w.host.sync.players.map.get(2).away, false);
});
test('a guest that leaves: its tractor poofs and its animals are replaced (M-39)', async () => {
  const w = await mpWorld({ seed: 62 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(ha.state, 'carried');
  g.net.leave(); w.seconds(0.3);
  assert.equal(ha.state, 'gone'); assert.equal(w.host.sync.players.list().length, 0);
  assert.ok(w.host.events.some(e => e.type === 'playerGone' && e.n === 2)); assert.equal(w.host.game.herd.free().filter(a => a.home === 'route').length, 18);
});
test('the host drops: boops pause; back in time they go on (M-40)', async () => {
  const w = await mpWorld({ seed: 63 }); w.seconds(1);
  const g = w.guests[0]; w.hub.away(w.host.net.id); w.seconds(0.2);
  assert.equal(g.game.boopsPaused, true); assert.equal(g.sync.players.map.get(1).away, true);
  w.hub.back(w.host.net.id); w.seconds(0.2); assert.equal(g.game.boopsPaused, false);
});
test('the room closes: the guest goes on alone on the same farm, keeps its riders, and the animals live again (M-41)', async () => {
  const w = await mpWorld({ seed: 64 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(g.game.load.landed(), 1);
  const game = g.game; w.hub.leave(w.host.net.id, 'left'); w.seconds(0.2);
  assert.equal(g.sync.alone, true); assert.equal(g.game, game, 'nothing made again');
  assert.equal(game.herd.remote, false); assert.equal(game.claims, false); assert.equal(game.load.landed(), 1, 'the rider stays (R-4)');
  assert.ok(g.events.some(e => e.type === 'alone')); assert.ok(g.events.some(e => e.type === 'playerGone' && e.n === 1));
  const x0 = game.herd.free().map(a => [a.x, a.z]); w.seconds(5);
  assert.ok(game.herd.free().some((a, i) => x0[i] && Math.hypot(a.x - x0[i][0], a.z - x0[i][1]) > 1), 'the guest runs the animals now');
  assert.equal(game.herd.free().filter(a => a.home === 'route').length, 18);
});
test('a kicked guest also goes on alone (M-41)', async () => {
  const w = await mpWorld({ seed: 65 }); w.seconds(1);
  w.hub.leave(w.guests[0].net.id, 'kicked'); w.seconds(0.2);
  assert.ok(w.guests[0].events.some(e => e.type === 'alone' && e.reason === 'kicked'));
});
test('going alone with a claim still waiting keeps the animal (decision 3)', async () => {
  const w = await mpWorld({ seed: 66, link: { delay: 500 } }); w.seconds(2);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(0.4); assert.ok(g.sync.pending.size > 0);
  w.hub.leave(w.host.net.id, 'left'); w.seconds(2);
  assert.ok(g.events.some(e => e.type === 'land' && e.animal === ga));
});
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement in `src/net/host.js`**

```js
  const gone = (id, why) => { const n = byPeer.get(id); byPeer.delete(id); rates.delete(id); if (!n) return; const p = players.map.get(n);
    for (const a of owned(n)) { a.state = 'gone'; a.epoch++; } game.herd.respawn(); // M-39
    if (p?.pose) out.push({ type: 'playerGone', n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(n); all({ t: 'players', list: roster() }); void why; };
  net.on('peerAway', id => { const p = players.map.get(byPeer.get(id)); if (p) { p.away = true; all({ t: 'players', list: roster() }); } });
  net.on('peerBack', id => { const p = players.map.get(byPeer.get(id)); if (p) { p.away = false; all({ t: 'players', list: roster() }); } });
  net.on('peerLeft', id => gone(id));
```
(`owned` is defined in Task 9; place these after it.) In `before()`, skip `fullDodge` and carried positions for players with `away` (already guarded for dodge). Set `sync.close = () => { closed = true; for (const p of players.list()) { for (const a of owned(p.n)) { a.state = 'gone'; a.epoch++; } players.remove(p.n); } game.herd.respawn(); }` — when the host stops hosting it keeps playing alone and its herd refills.

- [ ] **Step 4: Implement in `src/net/guest.js`**

```js
  function goAlone(reason) { // M-41: carry on alone on the same farm; nothing is made again
    if (alone) return; alone = true; deferred = null;
    for (const f of game.flights) if (f.claim === 'pending') f.claim = null; // decision 3: nobody else can have it now
    pending.clear(); game.claims = false; game.boopsPaused = false; game.herd.remote = false;
    for (const a of game.herd.animals) if (a.state === 'carried' || a.state === 'elsewhere') a.state = 'gone';
    game.herd.respawn();
    for (const p of players.list()) { if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(p.n); }
    game.others = []; out.push({ type: 'alone', reason });
  }
  net.on('hostAway', () => { game.boopsPaused = true; const p = players.map.get(1); if (p) p.away = true; }); // M-40
  net.on('hostBack', () => { game.boopsPaused = false; const p = players.map.get(1); if (p) p.away = false; });
  net.on('closed', reason => goAlone(reason));
```
`sync.close()` becomes `close() { net.leave?.(); goAlone('left'); }`. Animals that a guest sees as `toBarn` (busy) when going alone are left as they are; the guest's own herd step walks them into the barn.

In `before()`, while `alone`, skip `applyHerd` and `applyCarried` (already guarded), and do not run the bumper (no others): leave `game.others = []`.

- [ ] **Step 5: Run to verify they pass.**

- [ ] **Step 6: Full suite and commit**

```bash
npm test 2>&1 | tail -4
git add src/net/host.js src/net/guest.js test/mp.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - away, back, left and alone on the same farm (M-39..M-41)"
```

---

## Milestone D: Browser

### Task 13: Draw the other players (M-2, M-11, M-39, M-40)

**Files:**
- Modify: `src/sim/tractor.js`, `src/render/vehicles3d.js`, `src/render/animals3d.js`
- Create: `src/render/others3d.js`
- Test: `test/tractor.test.mjs` (append one test)

**Interfaces:**
- Produces:
  - `TRACTOR_WHEELS` (tractor.js): the four wheel records with `name, mx, my, mz, r, front, cx, cy, cz, radius` computed at module level; `createTractor` uses `const W = TRACTOR_WHEELS.map(w => ({ ...w }))`.
  - `vehicles3d`: `setGhost(on)` (all its materials `transparent`, `opacity 0.45` when on), `dispose()` (removes its meshes from the scene and disposes per-instance geometries).
  - `animals3d`: draws state `'carried'` at `a.x/a.y/a.z/a.yaw` with `a.anim`, hat when `a.riding`; hides `'elsewhere'`; rebuilds a view whose animal changed type or golden.
  - `createOthers3D(scene) -> { update(dt, players), dispose() }` where `players` is `sync.players` (or null).

- [ ] **Step 1: Write the failing test** (append to `test/tractor.test.mjs`)

```js
test('the wheel layout is data, the same for every tractor (for drawing other players)', async () => {
  const { TRACTOR_WHEELS, createTractor } = await import('../src/sim/tractor.js');
  const { createPhysics } = await import('../src/sim/physics.js');
  const t = createTractor(createPhysics(RAPIER), { x: 0, z: 0, yaw: 0 });
  assert.equal(TRACTOR_WHEELS.length, 4); assert.deepEqual(t.W.map(w => [w.name, w.cx, w.cz, w.radius]), TRACTOR_WHEELS.map(w => [w.name, w.cx, w.cz, w.radius]));
  assert.notEqual(t.W[0], TRACTOR_WHEELS[0], 'each tractor has its own copy');
});
```
(Check that `test/tractor.test.mjs` imports `RAPIER` and calls `RAPIER.init()`; it does in the existing file.)

- [ ] **Step 2: Run** — fails (`TRACTOR_WHEELS` undefined).

- [ ] **Step 3: Implement**

`src/sim/tractor.js`: move the `W` array literal out of `createTractor` to module level:
```js
export const TRACTOR_WHEELS = [
  { name: 'wheel-front-left', mx: 0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
  { name: 'wheel-front-right', mx: -0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
  { name: 'wheel-back-left', mx: 0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
  { name: 'wheel-back-right', mx: -0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
].map(w => ({ ...w, cx: w.mz * TP.scale, cy: w.my * TP.scale, cz: -w.mx * TP.scale, radius: w.r * TP.scale }));
```
(place it after `TP`), and in `createTractor` replace the `W` literal and the `w.cx = ...; w.radius = ...;` assignments with `const W = TRACTOR_WHEELS.map(w => ({ ...w }));` keeping the `vc.addWheel(...)` loop as is.

`src/render/vehicles3d.js`: collect every mesh in an array `all` as they are created (`body`, `wheels`, each car's `m` and `ws`), and add to the returned object:
```js
    // M-39, M-40: an away player's train is half transparent
    setGhost(on) { for (const m of all) { m.material.transparent = on; m.material.opacity = on ? 0.45 : 1; m.material.depthWrite = !on; m.material.needsUpdate = true; } },
    dispose() { for (const m of all) scene.remove(m); body.geometry.dispose(); for (const w of wheels) w.geometry.dispose(); },
```
Note: the wheels of one tractor share `wheelsMat` and each car shares `carMat`/`wheelMat`, so setting a material twice is harmless.

`src/render/animals3d.js`:
1. `makeView` stores `type: a.type, golden: a.golden` on the view object.
2. At the top of the views loop in `update`: `if (v.type !== a.type || v.golden !== a.golden) { scene.remove(v.g); const i = views.indexOf(v); views[i] = makeView(a); continue; }` — the next frame draws the new view (a placeholder from `herd.ensure` got its real type).
3. `v.g.visible = a.state !== 'gone';` becomes `v.g.visible = a.state !== 'gone' && a.state !== 'elsewhere';`
4. `v.hat.visible = a.state === 'ride';` becomes `v.hat.visible = a.state === 'ride' || (a.state === 'carried' && !!a.riding);`
5. The anim line: `const anim = fl ? 'run' : a.state === 'ride' ? (...) : a.anim;` stays; `carried` animals use `a.anim` set by the sync.

`src/render/others3d.js`:
```js
// The other players' trains (M-2, M-11) in their paints, from the interpolated poses in sync.players; half transparent when away (M-39, M-40).
// Wheels have no physics here: they turn with the distance driven and sit at the rest length.
import * as THREE from 'three';
import { createVehicles3D } from './vehicles3d.js';
import { TP, TRACTOR_WHEELS } from '../sim/tractor.js';
import { TR } from '../sim/hitch.js';

function stub() { // looks like a sim tractor and train to vehicles3d
  const wheel = { rot: 0 }, car = () => ({ dirt: 0, vc: { wheelSuspensionLength: () => TR.suspRest, wheelRotation: () => wheel.rot / TR.wheelR * 0.8 } });
  return { wheel, tractor: { W: TRACTOR_WHEELS.map(w => ({ ...w })), vc: { wheelSuspensionLength: () => TP.suspRest, wheelRotation: i => wheel.rot / TRACTOR_WHEELS[i].radius, wheelSteering: () => 0 } }, train: { cars: [car(), car()] } };
}
const toSnap = (src, dst) => { dst.p.set(src.p.x, src.p.y, src.p.z); dst.q.set(src.q.x, src.q.y, src.q.z, src.q.w); return dst; };
const snapObj = () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() });
export function createOthers3D(scene) {
  const views = new Map();
  return {
    update(dt, players) {
      const live = new Set(players ? players.list().filter(p => p.pose).map(p => p.n) : []);
      for (const [n, v] of views) if (!live.has(n)) { v.veh.dispose(); views.delete(n); }
      if (!players) return;
      for (const p of players.list()) {
        if (!p.pose) continue;
        let v = views.get(p.n);
        if (!v) { const s = stub(); v = { s, veh: createVehicles3D(scene, s.tractor, s.train), paint: '', ghost: false, snap: { tractor: snapObj(), cars: [snapObj(), snapObj()], dirt: 0 } }; views.set(p.n, v); }
        const key = p.paint.body + '/' + p.paint.trim; if (key !== v.paint) { v.paint = key; v.veh.setPaint(p.paint); }
        if (p.away !== v.ghost) { v.ghost = p.away; v.veh.setGhost(p.away); }
        if (!p.away) v.s.wheel.rot += p.speed * dt;
        toSnap(p.pose.tractor, v.snap.tractor); toSnap(p.pose.cars[0], v.snap.cars[0]); toSnap(p.pose.cars[1], v.snap.cars[1]);
        v.veh.update(v.snap);
      }
    },
    dispose() { for (const v of views.values()) v.veh.dispose(); views.clear(); },
  };
}
```

- [ ] **Step 4: Run** — `npm test 2>&1 | tail -4`: all pass (rendering has no unit tests; it is checked in Task 16).

- [ ] **Step 5: Build check and commit**

Run: `npm run build 2>&1 | tail -3` — Expected: `wrote .../site/exp/tractor-pickup ...` with no esbuild errors (the new module is not imported yet, so this checks only the changed files).

```bash
git add src/sim/tractor.js src/render/vehicles3d.js src/render/animals3d.js src/render/others3d.js test/tractor.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - draw the other trains and carried animals, ghost when away (M-2, M-11, M-39)"
```

### Task 14: Session controller and the Multiplayer panel (M-27, M-29 to M-36, M-31 retry, M-48)

**Files:**
- Create: `src/net/session.js`, `src/ui/qr.js`
- Modify: `src/ui/menus.js`, `template.html`, `package.json`, `package-lock.json`
- Test: `test/session.test.mjs`

**Interfaces:**
- Consumes: `roomLink`, `withLag`, `parseLag` (Task 2), `createHostSync`, `createGuestSync` (Tasks 8–12), `NET_VERSION` (Task 4). A `Handshake` class with the contract in the Global Constraints (injected, so tests use a fake).
- Produces:
  - `SERVER = 'https://handshake.four43.com'`, `APP = 'tractor-pickup'`, `roomName(code)`, `parseRoomInput(text) -> code | null`, `ERRORS` (code → panel text), `joinUrl(code, loc = location)`.
  - `createSession({ Handshake, server = SERVER, lag = null, getGame, onFarm, getPaint, onChange, retryMs = 10000 })` returning:
    `view()` → `{ state: 'idle'|'starting'|'hosting'|'join'|'checking'|'prompt'|'joining'|'joined', name, code, url, locked, players: [{ n, paint, you, host, status }], info: { players } | null, error: string | null }`;
    actions `host()`, `stopHosting()`, `openJoin()`, `submitCode(text)`, `confirmJoin()`, `cancel()`, `leave()`, `lock(on)`, `remove(n)`;
    passthrough for main.js: `get sync`, `get isGuest`, `get inRoom`, `before(now)`, `after(events, now)`, `showStarted()`, `delivered(riders)`, `requestHelp()`, `setGame(game)`, `setPaint(paint)`.
  - `qrSvg(text) -> string` (an `<svg>`).
  - `menus.openMultiplayer(session)` and `menus.refreshMultiplayer()`; `openParent(settings, seed, { inRoom })` disables "New farm" while `inRoom` is a guest; new menu callback `onMultiplayer`.
- Panel status strings: `connecting`, `direct`, `relayed`, `away` (from `Peer.connectionType` / roster `away`).

- [ ] **Step 1: Add the QR dependency**

Run: `npm install qrcode-generator@^1.4.4`
Expected: `package.json` gains `"qrcode-generator": "^1.4.4"` under `dependencies`.

- [ ] **Step 2: Write the failing tests**

```js
// test/session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSession, parseRoomInput, roomName, joinUrl, ERRORS } from '../src/net/session.js';
import { qrSvg } from '../src/ui/qr.js';
import { emitter } from '../src/net/link.js';
import { createGame } from '../src/sim/game.js';
import { NET_VERSION } from '../src/net/protocol.js';
await RAPIER.init();

test('room names and codes (M-31, M-32)', () => {
  assert.equal(roomName('K7MX2'), 'tractor-pickup-K7MX2');
  for (const s of ['K7MX2', 'k7mx2', ' tractor-pickup-k7mx2 ', 'TRACTOR-PICKUP-K7MX2']) assert.equal(parseRoomInput(s), 'K7MX2', s);
  for (const s of ['', 'K7MX', 'K7MX22', 'K0MX2', 'tractor-pickup-', 'pig-pens-K7MX2', null]) assert.equal(parseRoomInput(s), null, String(s));
  assert.equal(joinUrl('K7MX2', { origin: 'https://four43.com', pathname: '/exp/tractor-pickup/' }), 'https://four43.com/exp/tractor-pickup/?r=K7MX2');
});
test('qrSvg makes an svg', () => { const s = qrSvg('https://four43.com/exp/tractor-pickup/?r=K7MX2'); assert.match(s, /^<svg/); assert.match(s, /<\/svg>$/); });

// A fake Handshake with the same contract (the real one is vendored in Task 15)
function fakeHandshake({ peekResult, failCreate = 0 } = {}) {
  const made = [];
  class HandshakeError extends Error { constructor(code) { super(code); this.code = code; } }
  class Handshake {
    constructor(opts) { this.opts = opts; made.push(this); }
    async peek(code) { if (peekResult instanceof Error) throw peekResult; return { code, name: '', players: 1, maxPlayers: 4, locked: false, full: false, ...peekResult }; }
    async createRoom(o) { if (failCreate-- > 0) throw new HandshakeError('network'); this.created = o; return (this.room = room(true)); }
    async joinRoom(code) { this.joined = code; return (this.room = room(false)); }
    close() { this.closed = true; }
  }
  const room = isHost => Object.assign(emitter(), { code: 'K7MX2', key: 'k', isHost, you: isHost ? 'h' : 'g', hostId: 'h', locked: false, members: [], peers: new Map(),
    closed: false, lock(on) { this.locked = on; this.emit('meta', { meta: {}, locked: on }); }, kick(id) { this.kicked = id; }, leave() { if (this.closed) return; this.left = true; this.closed = true; this.emit('closed', 'left'); } });
  return { Handshake, HandshakeError, made };
}
const setup = (fh, extra = {}) => { let game = createGame(RAPIER, { seed: 5, power: 'medium' }), changes = 0;
  const s = createSession({ Handshake: fh.Handshake, getGame: () => game, onFarm: (seed, n) => (game = createGame(RAPIER, { seed, power: 'medium', player: n })), getPaint: () => ({ body: 'red', trim: 'yellow' }), onChange: () => changes++, retryMs: 5, ...extra });
  return { s, get game() { return game; }, get changes() { return changes; } };
};

test('host: makes a public room for 4 with the game version and relay for far players; shows name, link and players (M-31, M-27, M-48)', async () => {
  const fh = fakeHandshake(), t = setup(fh);
  await t.s.host();
  const o = fh.made[0].opts; assert.equal(o.app, 'tractor-pickup'); assert.equal(o.version, NET_VERSION); assert.equal(o.relayUnlessNearby, true); assert.equal(o.server, 'https://handshake.four43.com');
  assert.deepEqual(fh.made[0].created, { public: true, maxPlayers: 4, meta: {} });
  const v = t.s.view(); assert.equal(v.state, 'hosting'); assert.equal(v.name, 'tractor-pickup-K7MX2'); assert.match(v.url, /\?r=K7MX2$/);
  assert.equal(v.players[0].n, 1); assert.equal(v.players[0].you, true);
  t.s.lock(true); assert.equal(t.s.view().locked, true);
  t.s.stopHosting(); assert.equal(t.s.view().state, 'idle'); assert.ok(t.changes > 0);
});
test('host: when the server cannot be reached, the panel says so and it tries again (M-31)', async () => {
  const fh = fakeHandshake({ failCreate: 1 }), t = setup(fh);
  await t.s.host(); assert.equal(t.s.view().state, 'starting'); assert.equal(t.s.view().error, ERRORS.network);
  await new Promise(r => setTimeout(r, 30)); assert.equal(t.s.view().state, 'hosting');
});
test('join: a code is checked first, then a prompt, then the room (M-32, M-33)', async () => {
  const fh = fakeHandshake({ peekResult: { players: 1 } }), t = setup(fh);
  t.s.openJoin(); assert.equal(t.s.view().state, 'join');
  await t.s.submitCode('nope'); assert.equal(t.s.view().error, ERRORS.badCode);
  await t.s.submitCode('tractor-pickup-k7mx2'); const v = t.s.view(); assert.equal(v.state, 'prompt'); assert.equal(v.name, 'tractor-pickup-K7MX2'); assert.equal(v.info.players, 1);
  await t.s.confirmJoin(); assert.equal(fh.made.at(-1).joined, 'K7MX2'); assert.equal(t.s.view().state, 'joined'); assert.equal(t.s.isGuest, true);
  t.s.leave(); assert.equal(t.s.view().state, 'idle'); assert.equal(t.s.isGuest, false); assert.ok(fh.made.at(-1).closed, 'the client socket is closed when not in a room');
});
test('a room lost by the server ends joining and hosting (closed reason lost, M-41)', async () => {
  const fh = fakeHandshake({ peekResult: { players: 1 } }), t = setup(fh);
  t.s.openJoin(); await t.s.submitCode('K7MX2'); await t.s.confirmJoin(); assert.equal(t.s.view().state, 'joined');
  const r = fh.made.at(-1).room; r.closed = true; r.emit('closed', 'lost');
  assert.equal(t.s.view().state, 'idle'); assert.equal(t.s.sync, null); assert.ok(fh.made.at(-1).closed);
  const fh2 = fakeHandshake(), t2 = setup(fh2); await t2.s.host(); assert.equal(t2.s.view().state, 'hosting');
  fh2.made[0].room.closed = true; fh2.made[0].room.emit('closed', 'lost'); assert.equal(t2.s.view().state, 'idle'); assert.equal(t2.s.sync, null);
});
test('join errors become panel text (M-32, M-27)', async () => {
  for (const code of ['not_found', 'bad_key', 'full', 'locked', 'version_mismatch', 'rate_limited', 'closed']) {
    const e = Object.assign(new Error(code), { code }), fh = fakeHandshake({ peekResult: e }), t = setup(fh);
    t.s.openJoin(); await t.s.submitCode('K7MX2'); assert.equal(t.s.view().state, 'join'); assert.equal(t.s.view().error, ERRORS[code], code);
  }
  const fh = fakeHandshake({ peekResult: { locked: true } }), t = setup(fh); t.s.openJoin(); await t.s.submitCode('K7MX2'); assert.equal(t.s.view().error, ERRORS.locked);
});
test('?lag wraps the link (M-28)', async () => {
  const fh = fakeHandshake(), t = setup(fh, { lag: { delay: 300, jitter: 0, loss: 0 } }); await t.s.host();
  assert.equal(t.s.view().state, 'hosting');
});
```

- [ ] **Step 3: Run to verify they fail** — modules not found.

- [ ] **Step 4: Implement `src/ui/qr.js`**

```js
// M-31: the QR code of the game link with the room code, drawn as an svg (qrcode-generator, error level M)
import qrcode from 'qrcode-generator';
export function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }).trim(); }
```

- [ ] **Step 5: Implement `src/net/session.js`**

```js
// The Multiplayer panel's controller (M-29..M-36): a Handshake room, the link around it, and the host or guest sync. All errors end
// here as panel text (M-44). Rooms are public (joinable with the code), never listed (server: list = "none", M-46), for 4 players,
// with relayed connections to players who are not nearby (M-48). A room does not survive a reload (M-36).
import { roomLink, withLag } from './link.js';
import { createHostSync } from './host.js';
import { createGuestSync } from './guest.js';
import { NET_VERSION, MAX_PLAYERS } from './protocol.js';

export const SERVER = 'https://handshake.four43.com', APP = 'tractor-pickup';
export const roomName = code => 'tractor-pickup-' + code;
export const joinUrl = (code, loc = location) => loc.origin + loc.pathname + '?r=' + code;
export const parseRoomInput = s => { const m = typeof s === 'string' && s.trim().toUpperCase().match(/^(?:TRACTOR-PICKUP-)?([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5})$/); return m ? m[1] : null; };
export const ERRORS = {
  badCode: 'Room names look like tractor-pickup-K7MX2.', not_found: 'No farm with that name.', full: 'That farm is full.', locked: 'That farm is locked.',
  version_mismatch: 'Update the game on both devices.', rate_limited: 'Too many tries. Wait a minute.', network: "Can't reach the server. Trying again…",
  timeout: "Can't reach the server.", closed: "Can't reach the server.", other: 'Something went wrong. Try again.',
};
ERRORS.bad_key = ERRORS.not_found; // a private room without its key looks like no room (tractor rooms are public; peek(code) sends no key)
const errText = e => ERRORS[e?.code] || ERRORS.other;
export function createSession({ Handshake, server = SERVER, lag = null, getGame, onFarm, getPaint, onChange = () => {}, retryMs = 10000 }) {
  let hs = null, room = null, sync = null, state = 'idle', error = null, code = null, info = null, retry = 0;
  const changed = () => { try { onChange(); } catch (e) { console.warn(e); } };
  const client = () => (hs ||= new Handshake({ server, app: APP, version: NET_VERSION, relayUnlessNearby: true }));
  const link = r => { const n = roomLink(r); return lag ? withLag(n, lag) : n; };
  const drop = () => { sync?.close(); sync = null; room = null; code = null; info = null; };
  const idleClient = () => { if (!room) { hs?.close(); hs = null; } }; // a Handshake that has peeked keeps its socket open until close()
  // any closed reason ('kicked', 'left', 'replaced', 'lost', host gone) ends the room; the guest sync has already gone alone (M-41)
  const watch = r => r.on('closed', () => { if (room !== r) return; if (state === 'joined') { room = null; sync = null; code = null; state = 'idle'; } else if (state === 'hosting') { drop(); state = 'idle'; } idleClient(); changed(); });
  const statusOf = p => { if (p.away) return 'away'; const peer = p.peer && room?.peers.get(p.peer); return peer?.connectionType || 'connecting'; };
  const s = {
    get sync() { return sync; }, get isGuest() { return state === 'joined'; }, get inRoom() { return !!sync; },
    view() {
      const players = [];
      if (sync) { const me = sync.you || 1;
        players.push({ n: me, paint: getPaint(), you: true, host: me === 1, status: '' });
        for (const p of sync.players.list()) players.push({ n: p.n, paint: p.paint, you: false, host: p.n === 1, status: state === 'joined' && p.n !== 1 ? (p.away ? 'away' : '') : statusOf(p) });
        players.sort((a, b) => a.n - b.n); }
      return { state, code, name: code && roomName(code), url: code && (typeof location === 'undefined' ? '?r=' + code : joinUrl(code)), locked: !!room?.locked, players, info, error };
    },
    async host() {
      if (sync) return; state = 'starting'; error = null; changed();
      try {
        const r = await client().createRoom({ public: true, maxPlayers: MAX_PLAYERS, meta: {} });
        if (state !== 'starting') { r.leave(); return; }
        room = r; code = r.code; sync = createHostSync({ game: getGame(), net: link(r), paint: getPaint() }); watch(r); state = 'hosting';
        r.on('members', changed); r.on('meta', changed); r.on('peerAway', changed); r.on('peerBack', changed); r.on('peerLeft', changed); r.on('peer', p => { p.on?.('type', changed); changed(); });
      } catch (e) { error = errText(e); if (e?.code === 'network' || e?.code === 'timeout') { clearTimeout(retry); retry = setTimeout(() => { if (state === 'starting') { state = 'idle'; s.host(); } }, retryMs); } else state = 'idle'; } // M-31
      changed();
    },
    stopHosting() { clearTimeout(retry); const r = room; drop(); if (r && !r.closed) r.leave(); idleClient(); state = 'idle'; error = null; changed(); },
    openJoin() { state = 'join'; error = null; info = null; changed(); },
    async submitCode(text) {
      const c = parseRoomInput(text); if (!c) { error = ERRORS.badCode; changed(); return; }
      state = 'checking'; error = null; changed();
      try { const i = await client().peek(c); if (i.locked) throw { code: 'locked' }; if (i.full) throw { code: 'full' }; code = c; info = { players: i.players }; state = 'prompt'; }
      catch (e) { state = 'join'; error = errText(e); }
      changed();
    },
    async confirmJoin() {
      if (state !== 'prompt') return; state = 'joining'; changed();
      try { const r = await client().joinRoom(code); room = r; sync = createGuestSync({ game: getGame(), net: link(r), paint: getPaint(), onFarm }); watch(r); state = 'joined';
        r.on('members', changed); r.on('hostAway', changed); r.on('hostBack', changed); }
      catch (e) { state = 'join'; error = errText(e); code = null; }
      changed();
    },
    cancel() { if (state === 'prompt' || state === 'join' || state === 'checking') { state = 'idle'; code = null; info = null; error = null; idleClient(); changed(); } },
    leave() { const r = room; room = null; state = 'idle'; sync?.close(); sync = null; code = null; if (!r?.closed) r?.leave(); idleClient(); changed(); }, // M-41: the guest goes on alone
    lock(on) { room?.lock(on); changed(); },
    remove(n) { const p = sync?.players.map.get(n); if (p?.peer) room?.kick(p.peer); },
    before: now => sync ? sync.before(now) : [],
    after(events, now) { sync?.after(events, now); },
    showStarted() { sync?.showStarted(); }, delivered(r) { sync?.delivered(r); }, requestHelp: () => !!(sync && state === 'joined' && sync.requestHelp()),
    setGame(g) { sync?.setGame(g); }, setPaint(p) { sync?.setPaint(p); },
  };
  return s;
}
```

`leave()` for a guest: `sync.close()` calls `net.leave()` (Task 12), which calls `room.leave()`; the second call is skipped by the `r.closed` check.

When the room closes on its own (host left, kicked, `lost`), the guest sync's own `closed` handler has already made the guest go alone; `watch` then drops the sync and returns the panel to `idle`.

- [ ] **Step 6: Implement the panel in `src/ui/menus.js`**

1. `createMenus(root, { ..., onMultiplayer })` — add the callback.
2. `openParent(settings, seed, { inRoom = false } = {})`: insert the Multiplayer button as the first element after the title (M-29, P-10), and disable New farm for a guest (M-19):
```js
    box.innerHTML = `<button data-a="close" class="x" aria-label="Close">${xSvg()}</button><h2>Parent menu</h2>
<div class="row"><button data-a="mp" class="primary">Multiplayer</button></div>
...the existing fieldsets unchanged...
<div class="row"><button data-a="new"${inRoom ? ' disabled title="Leave the room first"' : ''}>New farm</button><button data-a="clear">Clear stickers</button></div>
...`;
```
and in the click handler: `else if (a === 'mp') { done(); onMultiplayer(); }`.
3. Add the panel:
```js
  // M-29..M-34: the Multiplayer panel (text, like the parent menu). It redraws on every session change while it is open.
  let mpSession = null;
  function openMultiplayer(session) { mpSession = session; root.querySelector('.parent.mp')?.remove(); const p = el('parent mp', 'div', root), box = el('box', 'div', p); p.addEventListener('pointerdown', e => e.stopPropagation()); drawMp(box); }
  function refreshMultiplayer() { const box = root.querySelector('.parent.mp .box'); if (box && mpSession) drawMp(box); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const STATUS = { connecting: 'connecting…', direct: 'direct', relayed: 'relayed', away: 'away', '': '' };
  function playerRows(v, removable) {
    return `<ul class="players">${v.players.map(p => `<li><img alt="" src="${tractorPic(p.paint)}"><span>Player ${p.n}${p.you ? ' (this device)' : p.host ? ' (host)' : ''}</span><em>${STATUS[p.status] ?? ''}</em>${removable && !p.you ? `<button data-a="remove" data-n="${p.n}">Remove</button>` : ''}</li>`).join('')}</ul>`;
  }
  function drawMp(box) {
    const v = mpSession.view(), err = v.error ? `<p class="err">${esc(v.error)}</p>` : '';
    let body = '';
    if (v.state === 'idle') body = `<div class="row big"><button data-a="host" class="primary">Host</button><button data-a="join" class="primary">Join</button></div>${err}`;
    else if (v.state === 'starting') body = `<p>Making a room…</p>${err}<div class="row"><button data-a="stop">Cancel</button></div>`;
    else if (v.state === 'hosting') body = `<p class="room">${esc(v.name)}</p><div class="qr">${qrSvg(v.url)}</div>${playerRows(v, true)}
<label><input type="checkbox" data-a="lock"${v.locked ? ' checked' : ''}> Lock: no new players</label><div class="row"><button data-a="stop">Stop hosting</button></div>${err}`;
    else if (v.state === 'join' || v.state === 'checking') body = `<label>Room name <input name="room" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="tractor-pickup-K7MX2"></label>
<div class="row"><button data-a="submit" class="primary"${v.state === 'checking' ? ' disabled' : ''}>Join</button><button data-a="cancel">Back</button></div>${err}`;
    else if (v.state === 'prompt' || v.state === 'joining') body = `<p>Join <b>${esc(v.name)}</b>? ${v.info.players} ${v.info.players === 1 ? 'player' : 'players'}.</p>
<div class="row"><button data-a="confirm" class="primary"${v.state === 'joining' ? ' disabled' : ''}>Join</button><button data-a="cancel">Cancel</button></div>${err}`;
    else if (v.state === 'joined') body = `<p class="room">${esc(v.name)}</p>${playerRows(v, false)}<div class="row"><button data-a="leave">Leave</button></div>${err}`;
    const keep = box.querySelector('[name=room]')?.value ?? '';
    box.innerHTML = `<button data-a="close" class="x" aria-label="Close">${xSvg()}</button><h2>Multiplayer</h2>${body}`;
    const input = box.querySelector('[name=room]'); if (input) { input.value = keep; input.addEventListener('keydown', e => { if (e.key === 'Enter') mpSession.submitCode(input.value); }); }
    box.onclick = e => {
      const t = e.target.closest?.('[data-a]'), a = t?.dataset.a; if (!a) return;
      if (a === 'close') { box.parentElement.remove(); mpSession = mpSession; return; }
      ({ host: () => mpSession.host(), join: () => mpSession.openJoin(), stop: () => mpSession.stopHosting(), submit: () => mpSession.submitCode(input.value), cancel: () => mpSession.cancel(),
        confirm: () => { mpSession.confirmJoin().then(() => { if (mpSession.view().state === 'joined') box.parentElement?.remove(); }); }, leave: () => mpSession.leave(),
        remove: () => mpSession.remove(Number(t.dataset.n)), lock: () => mpSession.lock(t.checked) })[a]?.();
    };
  }
```
Import `qrSvg` from `./qr.js` at the top of `menus.js`, and return `openMultiplayer, refreshMultiplayer` from `createMenus`. The X closes the panel (U-7, M-29); the confirm button closes it once joined (M-33).

4. `template.html` CSS, after the `.parent button.x` rule:
```css
.parent.mp .room{font:700 26px/1.2 Andika,system-ui,sans-serif;letter-spacing:.02em;margin:6px 0 10px;word-break:break-all}
.parent.mp .qr{width:min(260px,70vw);margin:0 auto 10px;background:#fff;padding:6px;border-radius:10px}.parent.mp .qr svg{width:100%;height:auto;display:block}
.parent.mp .players{list-style:none;padding:0;margin:8px 0}.parent.mp .players li{display:flex;align-items:center;gap:10px;min-height:52px;border-bottom:1px solid #eadcc6}
.parent.mp .players img{width:64px;height:48px;object-fit:contain}.parent.mp .players em{margin-left:auto;font-style:normal;color:#7a5a3a}.parent.mp .players button{min-height:40px;padding:4px 12px}
.parent.mp .row.big button{flex:1;min-height:72px;font-size:22px}.parent.mp input[name=room]{font:inherit;width:14em;padding:8px;border:2px solid #a98a63;border-radius:8px;text-transform:uppercase}
.parent.mp .err{color:#b3261e;font-weight:700}.parent button:disabled{opacity:.45;cursor:default}
```

- [ ] **Step 7: Run to verify the tests pass** — `node --test test/session.test.mjs`: all pass. Then `npm test 2>&1 | tail -4`.

- [ ] **Step 8: Commit**

```bash
git add src/net/session.js src/ui/qr.js src/ui/menus.js template.html package.json package-lock.json test/session.test.mjs
git commit -m "feat: Tractor Pickup multiplayer - session controller and the Multiplayer panel (M-29..M-36)"
```

### Task 15: Vendor handshake.js and wire main.js (M-2 to M-10, M-28, M-34, M-43, M-44)

**Files:**
- Create: `src/net/handshake.js` (copy), `test/handshake-contract.test.mjs`
- Modify: `src/main.js`, `src/audio/sound.js`

**Interfaces:**
- Consumes: everything above; `/home/smiller/projects/four43/handshake/client/handshake.js`.
- Produces: the playable build.

- [ ] **Step 1: Copy the client library**

Run:
```bash
test -f /home/smiller/projects/four43/handshake/client/handshake.js || { echo "handshake.js not written yet: stop and report"; exit 1; }
cp /home/smiller/projects/four43/handshake/client/handshake.js src/net/handshake.js
git -C /home/smiller/projects/four43/handshake log -1 --format=%h -- client/handshake.js
```
Add a first line comment to the copy: `// Vendored from the handshake repo, client/handshake.js at <hash>. Do not edit here: change it there and copy again.`

- [ ] **Step 2: Contract test**

```js
// test/handshake-contract.test.mjs: the vendored library has what session.js uses, and importing it touches no browser global
import test from 'node:test';
import assert from 'node:assert/strict';
test('handshake.js exports Handshake and HandshakeError with the methods the game uses', async () => {
  const m = await import('../src/net/handshake.js');
  assert.equal(typeof m.Handshake, 'function'); assert.equal(typeof m.HandshakeError, 'function');
  for (const k of ['peek', 'createRoom', 'joinRoom', 'close']) assert.equal(typeof m.Handshake.prototype[k], 'function', k);
  assert.ok(new m.HandshakeError('x') instanceof Error);
});
```
Run: `node --test test/handshake-contract.test.mjs` — Expected: pass. If it fails on a name, report the difference; do not edit the vendored file.

- [ ] **Step 3: Horn volume** — in `src/audio/sound.js` change `horn()` to `horn(v = 1)` and multiply each `this.tone(...)` volume argument in it by `v` (M-8: an other tractor's horn at `0.4`).

- [ ] **Step 4: Wire `src/main.js`**

1. Imports:
```js
import { Handshake } from './net/handshake.js';
import { createSession, parseRoomInput } from './net/session.js';
import { parseLag } from './net/link.js';
import { createOthers3D } from './render/others3d.js';
```
2. After `const params = ...`: `const lag = parseLag(params.get('lag')), signal = params.get('signal') || undefined; // M-28`.
3. Add `others3d` to the per-farm `let` list; in `build()`, after `animals3d = ...`: `others3d = createOthers3D(world);`. `build(newSeed, power, player = 1)` passes `player` to `createGame(RAPIER, { seed, power, player })`. `startFarm({ seed, power, player })` passes `player` to `build`, and **returns `game`**.
4. After `menus` is created, the session:
```js
  const session = sandbox ? null : createSession({ Handshake, server: signal, lag, getGame: () => game, getPaint: () => progress.paint,
    onFarm: (s, n) => { startFarm({ seed: s, power: powerNow, player: n }); if (!started) play(); return game; }, // M-1: the guest makes the host's farm
    onChange: () => menus.refreshMultiplayer() });
```
(`createSession`'s `server` default applies when `signal` is undefined.)
5. Menus callbacks: `onMultiplayer() { menus.openMultiplayer(session); }`; `onParent() { menus.openParent(settings, seed, { inRoom: !!session?.isGuest }); }`; in `onNewFarm` after `startFarm(...)`: `session?.setGame(game);` (M-19); in `onPaint`: `session?.setPaint(p);`.
6. In the step loop, replace
```js
      const ev = game.step(stepIn) || []; hornQueued = false; ...
```
with
```js
      const nowMs = performance.now(), netEv = session ? session.before(nowMs) : [];
      const ev = [...netEv, ...(game.step(stepIn) || [])]; hornQueued = false; for (let i = 0; i < bodyList.length; i++) snapInto(bodyList[i], curr[i]); acc -= DT;
      session?.after(ev, nowMs);
```
(`session.before` must run before `game.step` because it may rebuild the farm on a welcome; re-read `bodyList` after it: move `const old = prev; prev = curr; curr = old;` below the `before` call and guard: if `game` changed during `before` (`gen` changed), `continue` the while loop after `acc -= DT`.)
7. New event cases in the `for (const e of ev)` loop:
```js
        if (e.type === 'bump') { sound.boing(0.6); sound.horn(0.5); chase.shake(0.25); } // M-7
        if (e.type === 'remoteHorn') sound.horn(0.4); // M-8
        if (e.type === 'unclaim') { fx.stars(e.pos.x, e.pos.y, e.pos.z); sound.plop(); hud.reset(); for (const s of game.load.slots) if (s.landed) hud.fill(slotIndex(s) + 1, s.animal.type, s.animal.golden); } // M-14: poof; the slot bar packs up
        if (e.type === 'help') { helpTarget = { a: e.animal, t: 10 }; sound.animal(e.animal.type); } // M-9
        if (e.type === 'playerJoined') { for (let k = 0; k < 3; k++) fx.sparkles(e.x, 1.6, e.z); sound.horn(0.6); } // M-10
        if (e.type === 'playerGone') { fx.stars(e.x, 1.2, e.z); sound.plop(); } // M-39
```
(`treeBreak` events from the network already match the existing handler.)
8. Trip cues: `if (c === 'help') { if (session?.requestHelp()) {} else { const h = game.herd.callHelp(game.tractor); ... } }` — only a guest asks the host. `if (c === 'show') { ...; riders = game.startShow(); session?.showStarted(); ... }`. `if (c === 'reward') { ...; game.finishShow(riders); session?.delivered(riders); ... }`.
9. Render: after `animals3d?.update(...)`: `others3d?.update(dt, session?.sync?.players ?? null);`.
10. `?r=` link (M-34), after `enterStart();`:
```js
  const linkCode = parseRoomInput(params.get('r'));
  if (session && params.has('r')) { const u = new URL(location.href); u.searchParams.delete('r'); history.replaceState(null, '', u); } // a reload does not ask again
  if (session && linkCode) { menus.openMultiplayer(session); session.openJoin(); session.submitCode(linkCode); }
```
11. The `helpTarget` expiry line uses `game.herd.free().includes(helpTarget.a)`; on a guest the help animal is free in the snapshot too, so it works unchanged.

- [ ] **Step 5: Run the suite and build**

Run: `npm test 2>&1 | tail -4` — all pass. Run: `npm run build 2>&1 | tail -3` — no esbuild errors; note the new size (it was 5.87 MB).

- [ ] **Step 6: Commit**

```bash
git add src/net/handshake.js test/handshake-contract.test.mjs src/main.js src/audio/sound.js
git commit -m "feat: Tractor Pickup multiplayer - vendor handshake.js and wire the game (M-2..M-10, M-28, M-34)"
```

### Task 16: Two-window check, spec results, version 1.4.0 (M-54, M-10 text, section 13)

**Files:**
- Modify: `docs/tractor-pickup-spec.md`, `package.json`, `package-lock.json`

- [ ] **Step 1: Start a local Handshake server**

```bash
cd /home/smiller/projects/four43/handshake
cat > /tmp/claude-1000/hs-local.toml <<'EOF'
listen = "0.0.0.0:8080"
trust_proxy = false
allow_localhost = true
[limits]
grace_secs = 30
[turn]
urls = []
[apps.tractor-pickup]
origins = ["http://localhost:8766"]
max_players = 4
max_rooms = 20
public_rooms = true
list = "none"
turn = false
EOF
chmod 644 /tmp/claude-1000/hs-local.toml
docker build -t handshake:local . && docker run --rm -d --name hs-local -p 8080:8080 -e SESSION_SECRET=$(head -c 32 /dev/urandom | base64) -e TURN_SECRET=x -v /tmp/claude-1000/hs-local.toml:/etc/handshake/config.toml:ro handshake:local
curl -s localhost:8080/healthz
```
Expected: `ok`. (If the server plan named the config keys differently, follow `config.example.toml` in the handshake repo.)

- [ ] **Step 2: Serve the build and run the two-window check (M-54)**

```bash
cd /home/smiller/projects/four43/four43-tractor-multiplayer/site/exp/tractor-pickup && python3 -m http.server 8766
```
With Playwright (two browser contexts) open `http://localhost:8766/?signal=http://localhost:8080&seed=7` in both. Check, with screenshots into the scratchpad:
1. Window A: hold the gear 2 s → parent menu → **Multiplayer** at the top → Host: the room name `tractor-pickup-XXXXX`, a QR code, player 1.
2. Window B: Multiplayer → Join → type the code in lower case → the prompt says 1 player → Join: the panel closes, B is on A's farm, ahead of A's start.
3. A's panel lists player 2 with `direct`. Drive both (keyboard): each sees the other train in its paints.
4. Boop an animal with B: it lands in B's wagon; A sees it there. Boop with both at once if possible.
5. Drive the tractors into each other: boing, horn, both pushed apart.
6. B drives into the barn: B's show; A keeps driving; A sees B's tractor stopped in the barn; after B's show, new animals appear on A.
7. A: Lock, then Remove player 2: B goes on alone on the same farm; B cannot rejoin while locked.
8. `?lag=300,80,5` on B: still playable; boops land after a short hold.
9. Open `http://localhost:8766/?r=XXXXX&signal=...`: the join prompt shows at once; after it, the address has no `?r`.
Record what passed, what failed and anything that needs an iPad.

- [ ] **Step 3: Stop the server**

Run: `docker stop hs-local`

- [ ] **Step 4: Update the spec**

In `docs/tractor-pickup-spec.md`:
1. M-10: replace "its tractor appears beside the farm start with a sparkle and a short horn. Each player number has its own place, 8 m apart, clear of obstacles." with "its tractor appears ahead of the farm start with a sparkle and a short horn. Each player number has its own place, 12 m apart along the farm start's heading (8 m to the side when that place is blocked), clear of obstacles."
2. Section 13: change the first line to "State at version 1.8 (`npm test`: N tests, all pass)..." with the real count, and add rows:
```
| 1.8 M-22..M-26 Messages and smooth motion | `codec.test.mjs`, `interp.test.mjs`, `protocol.test.mjs`, `link.test.mjs` | — | — |
| 1.8 M-1..M-19 Play together | `mp.test.mjs` (two to four games in one process over the in-memory link, with 300 ms delay, jitter and loss), `spawn.test.mjs`, `bump.test.mjs`, `game.test.mjs`, `herd.test.mjs` | Two browser windows with a local Handshake: <results from Step 2> | Two iPads on one home network; one iPad over mobile data (TURN) |
| 1.8 M-29..M-36 Multiplayer panel | `session.test.mjs` | <results> | QR code from the iPad camera; text size |
| 1.8 M-39..M-44 Connection loss | `mp.test.mjs` | <results> | Screen lock and Wi-Fi to mobile data on an iPad |
| 1.8 M-45..M-51 Safety | `mp.test.mjs` (bad messages, spoofing, floods, claim and tree range), `protocol.test.mjs`, Handshake's own tests | — | — |
```

- [ ] **Step 5: Version**

Run: `npm version 1.4.0 --no-git-tag-version`

- [ ] **Step 6: Full suite, build, commit**

```bash
npm test 2>&1 | tail -4 && npm run build 2>&1 | tail -2
git add docs/tractor-pickup-spec.md package.json package-lock.json
git commit -m "docs: Tractor Pickup 1.4.0 - multiplayer test results, spawn places (M-10)"
```
Do not commit `site/exp/tractor-pickup/` build output unless the user asks for a deploy (deploys go through gh-pages with the user's OK).

---

## Spec coverage (phase 1)

| Spec items | Tasks |
|---|---|
| M-1 shared farm, M-19 new farm | 8, 10, 15 |
| M-2 own vehicles in paint | 8, 10 (paint), 13, 15 |
| M-3 shared animals, M-13..M-15 claims, M-26 ownership numbers | 5, 6, 9 |
| M-4 own show, M-5 own rewards | 8 (mode in vehicle message), 15 (main keeps progress local) |
| M-6, M-16 delivery and respawn | 6, 10 |
| M-7 soft bump | 7, 8, 15 |
| M-8 horn, M-9 help | 10, 15 |
| M-10 spawn places | 6, 15, 16 (text) |
| M-11 own vehicle, M-12 host animals and B-14 | 5, 6, 8, 10 |
| M-17 trees, M-18 props stay local | 6, 10 (props: nothing to sync — `startShow` keeps resetting local props) |
| M-20, M-21 connections and channels | 2, 15 (handshake.js) |
| M-22..M-25 messages and smoothing | 1, 3, 8 |
| M-27 game version | 4, 8, 14 |
| M-28 lag and signal | 2, 14, 15 |
| M-29..M-36 panel | 14, 15 |
| M-39..M-41 connection loss | 12, 13 |
| M-42 network change, M-43 screen on | handshake.js (library) |
| M-44 failure | 8 (try/catch), 11, 14 |
| M-45 no talk, M-35 no names | 14 (panel shows only numbers and the room name) |
| M-46, M-47 code only, guessing | server config (`list = "none"`) and Handshake limits; 14 (public room, never listed) |
| M-48 relay | 14 (`relayUnlessNearby: true`) |
| M-49 lock and remove | 14 |
| M-50 checks | 1, 4, 8–11 |
| M-51 no personal data | 14 (nothing but paints and numbers is sent) |
| M-52..M-55 tests | 1–14, 16 |
