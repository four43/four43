// Phase 3k T2 (M-1..M-3, M-9, D4): Pig Pens' registry. The physics numbers keep 2.1.0's animal-on-grass contacts
// under the engine's combine rules: friction √fa·√fb (Multiply), restitution max.
import test from 'node:test';
import assert from 'node:assert/strict';
import MATERIALS from '../src/defs/materials.js';

const pairF = (a, b) => MATERIALS.collider(a).friction * MATERIALS.collider(b).friction; // what Rapier's Multiply computes
const pairR = (a, b) => Math.max(MATERIALS.collider(a).restitution, MATERIALS.collider(b).restitution);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('the game ids are registered after the base library', () => {
  for (const id of ['pasture', 'fencing', 'pet', 'petGrip', 'bird', 'foxPelt', 'snack', 'paintwork', 'plumage', 'pigHide', 'leaf', 'petal', 'crop', 'hay', 'produce', 'stone', 'scenery'])
    assert.ok(MATERIALS.has(id), id);
  assert.equal(MATERIALS.ids.indexOf('steel'), 0); // base library first (§4.2)
  assert.match(MATERIALS.hash, /^[0-9a-f]{8}$/);
});
test('animal-on-grass contacts equal 2.1.0 (friction Min 0, restitution Average with 0)', () => {
  assert.equal(pairF('pet', 'pasture'), 0); assert.equal(pairF('bird', 'pasture'), 0); assert.equal(pairF('foxPelt', 'pasture'), 0);
  near(pairR('pet', 'pasture'), 0.075, 1e-12, 'pig bounce'); near(pairR('bird', 'pasture'), 0.05, 1e-12, 'hen bounce');
  assert.equal(pairR('foxPelt', 'pasture'), 0);
  near(pairF('petGrip', 'pasture'), 0.75, 0.003, 'a held pig drags on the grass (was Average 0.75)');
  near(pairF('snack', 'pasture'), 0.85, 0.002, 'snack friction (was Average 0.85)'); near(pairR('snack', 'pasture'), 0.175, 1e-12, 'snack bounce');
  near(pairF('paintwork', 'pasture'), Math.sqrt(0.4 * 0.8), 1e-12, 'tractor body on grass');
  assert.equal(pairF('pet', 'fencing'), 0); // pigs slide along fences, as with Min
});
test('densities: snacks 500 kg/m³; the grip swap keeps a pig\'s density so world.setMaterial never re-masses it', () => {
  assert.equal(MATERIALS.density('snack'), 500);
  assert.equal(MATERIALS.density('petGrip'), MATERIALS.density('pet'));
  assert.ok(MATERIALS.density('pet') > 0 && MATERIALS.density('bird') > 0 && MATERIALS.density('foxPelt') > 0); // dynamic bodies need it (spawn throws otherwise)
});
test('plumage is the fur material; pigHide takes mud; scenery and the model materials carry no physics overrides', () => {
  const p = MATERIALS.get('plumage');
  assert.deepEqual({ length: p.look.fur.length, shells: p.look.fur.shells, density: p.look.fur.density }, { length: 0.07, shells: 10, density: 34 });
  assert.equal(MATERIALS.get('pigHide').coverage.mud, 1); // the pig crowd's mud (3f COVERAGE_INSTANCED, Task 15)
  for (const id of ['scenery', 'pigHide', 'leaf', 'petal', 'crop', 'hay', 'produce', 'stone']) assert.equal(MATERIALS.get(id).phys?.friction, MATERIALS.get(MATERIALS.get(id).extends ?? id).phys?.friction, id);
});
