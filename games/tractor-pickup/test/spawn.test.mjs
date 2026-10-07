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
