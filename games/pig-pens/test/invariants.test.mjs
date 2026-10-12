// nan.mjs on the engine path (lion-hawk 2e P5, #64): no bird value is ever non-finite through a dog chase, grabs and a night.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, invariants } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { grabTarget } from '../src/game/pick.js';
import { tool, rayTo } from './rays.mjs';
await R.init();

const birds = h => h.engine.scene.state.sim.flock.birds.map(b => ({ px: b.px, py: b.py, pz: b.pz, yaw: b.yaw, speed: b.speed, scale: b.scale }));
test('birds stay finite through a dog chase, three grabs and a night', () => {
  const h = headless(pigPensGame(), { seed: 4, args: { pigs: 30 }, invariants: [invariants.finite(birds, 'birds')] });
  const sim = h.engine.scene.state.sim, r = sim.lay.run, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  h.tap('farm.tool.shoo'); tool(h, 'down', [cx, 0, cz]);
  for (let s = 0; s < 3600; s++) { const a = s / 60; tool(h, 'move', [cx + Math.sin(a) * 5, 0, cz + Math.cos(a * 1.3) * 2]); h.step(1); }
  tool(h, 'up', [cx, 0, cz]); h.step(60);
  h.tap('farm.tool.grab'); let grabbed = 0;
  for (let k = 0; k < 3; k++) {
    const b = sim.flock.birds.find(q => { const g = grabTarget(sim, rayTo([q.px, q.py, q.pz])); return g?.kind === 'bird' && g.i === q.i; });
    if (!b) break;
    tool(h, 'down', [b.px, b.py, b.pz]); h.step(1); if (sim.flock.grabbed >= 0) grabbed++; for (let s = 0; s < 30; s++) { tool(h, 'move', [b.px + 0.2, 1.4, b.pz]); h.step(1); }
    tool(h, 'up', [b.px, 1.4, b.pz]); h.step(60);
  }
  assert.equal(grabbed, 3, 'three chickens were grabbed');
  h.tap('farm.night'); h.seconds(60);
});
