// Rally's material registry (lion-hawk M-1…M-3, overview §4.2): the old tire.js SURFACES table lives in the `tire` blocks,
// colliders keep today's friction and restitution, and every id the game uses resolves.
import test from 'node:test';
import assert from 'node:assert/strict';
import MATERIALS from '../src/defs/materials.js';

// The pre-phase-3 SURFACES table, copied verbatim (src/tire.js at e03ed71).
const OLD = {
  tarmac:   { name: 'Tarmac',        mu: 1.15, C: 1.50, kp: 0.10, ap: 0.12, crr: 0.015, drag: 0 },
  hardpack: { name: 'Dirt',          mu: 0.90, C: 1.40, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0 },
  gravel:   { name: 'Loose gravel',  mu: 0.80, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0 },
  grass:    { name: 'Grass',         mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.050, drag: 0.2 },
  sand:     { name: 'Sand',          mu: 0.50, C: 1.20, kp: 0.22, ap: 0.20, crr: 0.120, drag: 0.14 },
  mud:      { name: 'Mud',           mu: 0.40, C: 1.50, kp: 0.15, ap: 0.16, crr: 0.100, drag: 0.18 },
  packed:   { name: 'Packed snow',   mu: 0.75, C: 1.25, kp: 0.20, ap: 0.20, crr: 0.030, drag: 0 },
  snowbank: { name: 'Snowbank',      mu: 0.30, C: 1.20, kp: 0.25, ap: 0.22, crr: 0.150, drag: 0.1 },
  ice:      { name: 'Ice',           mu: 0.55, C: 1.40, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0 },
};
export { OLD };

test('every surface key has a rally-<key> material whose tire block is the old SURFACES entry', () => {
  for (const [k, s] of Object.entries(OLD)) {
    const m = MATERIALS.get(`rally-${k}`), { name, ...tire } = s;
    assert.deepEqual({ ...m.tire }, tire, k);
    assert.equal(m.game.name, name, k);
  }
});
test('collider materials keep today\'s friction and restitution', () => {
  const phys = id => ({ friction: MATERIALS.get(id).phys.friction, restitution: MATERIALS.get(id).phys.restitution });
  assert.deepEqual(phys('rally-ground'), { friction: 0.8, restitution: 0 });
  assert.deepEqual(phys('car-hull'), { friction: 0.3, restitution: 0.1 });
  assert.deepEqual(phys('car-cabin'), { friction: 0.45, restitution: 0.1 });
  assert.deepEqual(phys('marker'), { friction: 0.9, restitution: 0 });
  assert.deepEqual(phys('gate-post'), { friction: 0.6, restitution: 0 });
  assert.deepEqual(phys('cone'), { friction: 0.6, restitution: 0 });
  for (const id of ['marker', 'cone']) assert.ok(MATERIALS.density(id) > 0, `${id} needs a density (dynamic bodies)`);
});
test('the view ids resolve and no Rally id shadows a base material', () => {
  for (const id of ['rally-road', 'car-body', 'tyre', 'gate-banner', 'pad-prop', 'pad-stripe']) assert.ok(MATERIALS.has(id), id);
  const game = MATERIALS.ids.slice(MATERIALS.ids.indexOf('air') + 1);
  for (const id of ['gravel', 'grass', 'mud', 'ice']) assert.equal(game.includes(id), false, id);
  assert.match(MATERIALS.hash, /^[0-9a-f]{8}$/);
});
