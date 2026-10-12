// The analytic picks moved out of main.js/farm3d.js (lion-hawk 2e P1): ray maths against three.js, and today's priorities.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
import { planeHit, rayDist, classify, grabTarget, pickGate, pickDoor } from '../src/game/pick.js';
import { rayTo } from './rays.mjs';
await RAPIER.init();

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
  const sim = createSim(RAPIER, { pigs: 24, seed: 3 }); for (let i = 0; i < 30; i++) sim.step();
  const n = sim.lay.nests[1]; sim.flock.eggs.push({ id: 999, nest: 1, x: n.x, y: 0.06, z: n.z, age: 0, layer: 1, hatch: 0, brooder: -1 });
  assert.deepEqual(classify(sim, rayTo([n.x, 0.12, n.z], 20, 0.01)), { kind: 'egg', id: 999 });
  const p = sim.pigs.find(q => { const c = classify(sim, rayTo([q.px, q.py, q.pz])); return c?.kind === 'pig' && c.i === q.i; });
  assert.ok(p, 'some pig is pickable'); assert.equal(classify(sim, rayTo([p.px, p.py, p.pz])).kind, 'pig');
  assert.equal(grabTarget(sim, rayTo([p.px, p.py, p.pz])).kind, 'pig');
  assert.equal(pickGate(sim.lay, sim.lay.gates[1].x, sim.lay.gates[1].z), sim.lay.gates[1]);
  const c = sim.lay.coop; assert.equal(pickDoor(sim.lay, c.doorX, c.z + c.hz + 0.5), true);
  assert.equal(classify(sim, rayTo([sim.lay.field.x0 - 30, 0, sim.lay.field.z0 - 30])), null);
});
