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
