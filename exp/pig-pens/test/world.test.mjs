// Phase 3k (E-1..E-8, M-4..M-9, S-3): the farm's bodies are World entities. Gate barriers come and go as entities,
// eaten snacks leave the World and every claim on them, and contact numbers come from the registry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { farmSim } from './farmSim.mjs';

test('entities: 48 pigs, a dog, 11 birds, a fox, the ground and one obstacles entity; nothing else at start', () => {
  const sim = farmSim({ pigs: 48, seed: 3 }), h = sim.h;
  assert.equal(h.find('pig').length, 48); assert.equal(h.find('dog').length, 1); assert.equal(h.find('bird').length, 11);
  assert.equal(h.find('fox').length, 1); assert.equal(h.find('obstacles').length, 1);
  assert.equal(h.find('ground').length, 1); assert.equal(h.find('gate').length, 0); assert.equal(h.find('food').length, 0);
  assert.ok(sim.pigs[0] === h.find('pig')[0], "the pig record is the entity"); // the pig record is the entity (E-4)
  assert.equal(h.world.materialOf(sim.pigs[0].colliders[0].collider.handle), 'pet');
  assert.deepEqual(h.world.audit(), []); // every collider on the engine's combine rules
});
test('animal masses come from body.mass (D3): a 60 kg sow, a 25 kg dog, a 7 kg fox', () => {
  const sim = farmSim({ pigs: 24, seed: 3 });
  assert.ok(Math.abs(sim.pigs[0].body.mass() - 60) < 1e-3); assert.ok(Math.abs(sim.dog.body.mass() - 25) < 1e-3);
  assert.ok(Math.abs(sim.flock.fox.body.mass() - 7) < 1e-3);
});
test('a shut gate is one gate entity; opening it despawns it; no pig crosses a shut gate in 120 s', () => {
  const sim = farmSim({ pigs: 48, seed: 3 }), h = sim.h; sim.step(120);
  for (const g of sim.lay.gates) sim.setGate(g.id, false);
  assert.equal(h.find('gate').length, sim.lay.gates.length);
  const start = sim.pigs.map(p => p.region); sim.step(60 * 120);
  assert.equal(sim.pigs.filter((p, i) => p.region !== start[i]).length, 0);
  sim.setGate(sim.lay.gates[0].id, true); assert.equal(h.find('gate').length, sim.lay.gates.length - 1);
});
test('a snack is an entity until eaten; then no pig holds its id', () => {
  const sim = farmSim({ pigs: 48, seed: 6 }), h = sim.h; sim.step(300);
  const pen = sim.lay.pens[5], f = sim.tossFood(pen.cx, 4, pen.cz + 6, pen.cx, pen.cz);
  assert.equal(h.find('food').length, 1); assert.ok(h.get(f.id) === f, "get returns the food entity");
  h.until(() => !h.get(f.id), { maxSteps: 60 * 60, message: 'the snack is eaten or trampled' });
  assert.equal(sim.pigs.filter(p => p.snack === f.id).length, 0); assert.equal(h.find('food').length, 0);
});
test('grabbing swaps a pig onto the grip material and settling swaps it back (world.setMaterial)', () => {
  const sim = farmSim({ pigs: 24, seed: 3 }), h = sim.h, p = sim.pigs[0]; sim.step(30);
  sim.grab(p.i); assert.equal(h.world.materialOf(p.colliders[0].collider.handle), 'petGrip');
  assert.ok(Math.abs(p.body.mass() - 60) < 1e-3, 'the grip swap keeps the mass');
  sim.release(); h.until(() => p.state !== 8, { maxSteps: 60 * 10, message: 'the pig lands' });
  assert.equal(h.world.materialOf(p.colliders[0].collider.handle), 'pet');
});
