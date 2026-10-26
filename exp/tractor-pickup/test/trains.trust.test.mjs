// A remote train record is another device's data (3l, security review of c2758bd): the spawn desc and the applied fields are built
// from explicit, checked fields; a NaN pose is rejected (counted, the last good record stands) and extra fields never reach the desc.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnTrainDesc, applyTrainRecord, safePose, TRAIN_STATS } from '../src/sim/trains.js';
const pose = (x, z) => ({ p: { x, y: 0.4, z }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 } });
const good = () => ({ body: pose(3, 4), trailer: pose(0, 4), wagon: pose(-3, 4), mode: 'drive', full: false, dirt: [0.1, 0.2, 0.3], riders: [] });

test('a NaN pose is rejected and counted; the last good fields stand', () => {
  const e = {}, n = TRAIN_STATS.rejected;
  assert.equal(applyTrainRecord(e, good()), true); assert.deepEqual(e.dirt, [0.1, 0.2, 0.3]);
  const bad = { ...good(), body: { ...pose(1, 1), p: { x: NaN, y: 0, z: 0 } }, mode: 'held', dirt: [1, 1, 1] };
  assert.equal(applyTrainRecord(e, bad), false); assert.equal(TRAIN_STATS.rejected, n + 1);
  assert.equal(e.mode, 'drive'); assert.deepEqual(e.dirt, [0.1, 0.2, 0.3], 'the last good record stands');
  assert.equal(safePose({ p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 0 } }), null, 'a zero quaternion');
  assert.equal(safePose({ p: { x: Infinity, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }), null);
});
test('the spawn desc takes only known fields: an injected extra field or body option never reaches it; poses are clamped and normalised', () => {
  const rec = { ...good(), body: { ...pose(9000, -2), q: { x: 0, y: 2, z: 0, w: 0 } }, model: 'barn', colliders: [], body2: 1, scale: 99, mass: 1e9 };
  const d = spawnTrainDesc(rec);
  assert.equal(d.model, 'tractor'); assert.notEqual(d.scale, 99); assert.equal(d.colliders.length, 2); assert.equal(d.body2, undefined); assert.equal(d.mass, undefined);
  assert.deepEqual(d.at, [400, 0.4, -2], 'clamped to the farm'); assert.deepEqual(d.q, [0, 1, 0, 0], 'normalised');
  for (const k of ['trailer', 'wagon']) { assert.equal(d[k].model, 'trailer'); assert.ok(d[k].at.every(Number.isFinite)); }
  const n = TRAIN_STATS.rejected, nan = spawnTrainDesc({ ...good(), wagon: { ...pose(0, 0), q: { x: NaN, y: 0, z: 0, w: 1 } } });
  assert.equal(TRAIN_STATS.rejected, n + 1); assert.ok([...nan.at, ...nan.q, ...nan.trailer.at, ...nan.wagon.q].every(Number.isFinite), 'a rejected record spawns parked, never NaN');
});
