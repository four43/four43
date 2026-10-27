// The analytic picks moved out of main.js/farm3d.js (lion-hawk 2e P1): ray maths against three.js, and today's priorities.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { farmSim } from './farmSim.mjs';
import { planeHit, rayDist, classify, grabTarget, pickGate, pickDoor, rayBox, rayGate, rayCoop } from '../src/game/pick.js';
import { buildLayout, L } from '../src/layout.js';
import { rayTo } from './rays.mjs';

test('rayDist matches three.js Ray.distanceToPoint, behind-the-origin included', () => {
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 40 - 20;
  for (let k = 0; k < 300; k++) {
    const o = new THREE.Vector3(rnd(), rnd(), rnd()), d = new THREE.Vector3(rnd(), rnd(), rnd()).normalize(), p = new THREE.Vector3(rnd(), rnd(), rnd());
    const want = new THREE.Ray(o, d).distanceToPoint(p), got = rayDist([o.x, o.y, o.z, d.x, d.y, d.z], p.x, p.y, p.z);
    assert.ok(Math.abs(got - want) < 1e-9, `${got} vs ${want}`);
  }
});
test('planeHit: a hit, a parallel ray and a plane behind the eye', () => {
  const h = planeHit(rayTo([3, 0, -2]), 0); assert.ok(Math.abs(h.x - 3) < 1e-12 && Math.abs(h.z + 2) < 1e-12 && h.y === 0);
  assert.equal(planeHit([0, 1, 0, 1, 0, 0], 0), null); assert.equal(planeHit([0, 1, 0, 0, 1, 0], 0), null);
});
test('classify: an egg wins over everything; a pig is a pig; empty ground is null; gates and the coop door', () => {
  const sim = farmSim({ pigs: 24, seed: 3 }); for (let i = 0; i < 30; i++) sim.step();
  const n = sim.lay.nests[1]; sim.flock.eggs.push({ id: 999, nest: 1, x: n.x, y: 0.06, z: n.z, age: 0, layer: 1, hatch: 0, brooder: -1 });
  assert.deepEqual(classify(sim, rayTo([n.x, 0.12, n.z], 20, 0.01)), { kind: 'egg', id: 999 });
  const p = sim.pigs.find(q => { const c = classify(sim, rayTo([q.px, q.py, q.pz])); return c?.kind === 'pig' && c.i === q.i; });
  assert.ok(p, 'some pig is pickable'); assert.equal(classify(sim, rayTo([p.px, p.py, p.pz])).kind, 'pig');
  assert.equal(grabTarget(sim, rayTo([p.px, p.py, p.pz])).kind, 'pig');
  assert.equal(pickGate(sim.lay, sim.lay.gates[1].x, sim.lay.gates[1].z), sim.lay.gates[1]);
  const c = sim.lay.coop; assert.equal(pickDoor(sim.lay, c.doorX, c.z + c.hz + 0.5), true);
  assert.equal(classify(sim, rayTo([sim.lay.field.x0 - 30, 0, sim.lay.field.z0 - 30])), null);
});

test('rayBox: enters and leaves a box; a miss, a parallel ray outside it and a box behind the eye are null', () => {
  const b = { x0: -1, x1: 1, y0: 0, y1: 1, z0: -1, z1: 1 }, h = rayBox([0, 0.5, 5, 0, 0, -1], b);
  assert.ok(Math.abs(h.t0 - 4) < 1e-12 && Math.abs(h.t1 - 6) < 1e-12);
  assert.equal(rayBox([3, 0.5, 5, 0, 0, -1], b), null); assert.equal(rayBox([0, 2, 5, 0, 0, -1], b), null);
  assert.equal(rayBox([0, 0.5, 5, 0, 0, 1], b), null);
});
test('gates: a camera ray at the gateway, above the panels, just in front of it, or at a leaf lying open picks that gate', () => {
  const lay = buildLayout(), toward = (g, a, n, y) => g.dir === 'x' ? [g.x + a, y, g.z + n] : [g.x + n, y, g.z - a];
  for (const g of lay.gates.filter(g => g.kind !== 'barn')) { // the barn's doors: test/buildings.test.mjs
    for (const [a, n, y] of [[0, 0, 0.5], [0, 0, 1.1], [0, 0.35, 0], [g.width / 2 - 0.2, -0.3, 0.6]]) assert.equal(rayGate(lay, rayTo(toward(g, a, n, y)))?.gate, g, `gate ${g.id} at ${a}, ${n}, ${y}`);
    for (const l of g.leaves) assert.equal(rayGate(lay, rayTo(toward(g, l.hingeX + l.side * L / 2, -0.35, 0.5), 20, 0.01))?.gate, g, `gate ${g.id}: the open leaf`);
  }
  assert.equal(rayGate(lay, rayTo([lay.gates[0].x + 6, 0, lay.gates[0].z + 6], 20, 0.01)), null, 'open ground far from a gate');
});
test('coop: the front wall, the door, the roof edge above it and the ramp all pick the coop front', () => {
  const lay = buildLayout(), c = lay.coop, front = c.z + c.hz;
  for (const p of [[c.doorX, 0.66, front], [c.x - c.hx + 0.2, 1.5, front], [c.x + c.hx - 0.1, 2.1, front + 0.1], [c.doorX, 0.05, c.rampZ]]) assert.ok(rayCoop(lay, rayTo(p)), `${p}`);
  assert.equal(rayCoop(lay, rayTo([c.x + c.hx + 3, 0, front + 2])), null, 'beside the coop');
});
test('classify: a gate or the coop front counts at its far side, so an animal standing in it wins; the coop front toggles the door', () => {
  const sim = farmSim({ pigs: 24, seed: 3 }); sim.step(30);
  const g = sim.lay.gates[1], p = sim.pigs[0];
  p.body.setTranslation({ x: g.x, y: p.r, z: g.z }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); sim.step(1);
  assert.deepEqual(classify(sim, rayTo([p.px, p.py, p.pz])), { kind: 'pig', i: p.i }, 'the pig in the gateway');
  const c = sim.lay.coop; assert.deepEqual(classify(sim, rayTo([c.x - c.hx + 0.3, 1.6, c.z + c.hz])), { kind: 'door' });
});
