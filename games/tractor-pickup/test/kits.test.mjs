// The farm on the engine kits (3l Tasks 12, 13): the terrain kit ground and the vehicle kit train.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testGame } from './helpers/world.mjs';

test('the kit ground: heightAt equals terrain.height on grid points, materialAt equals road.materialAt everywhere', () => {
  const g = testGame({ seed: 5 }), T = g.terrain, { n, step, heights } = T.grid, F = T.grid.size / 2;
  assert.ok(g.ground && typeof g.ground.materialAt === 'function', 'game.ground is the terrain kit');
  let k = 0;
  for (let i = 0; i < n; i += 9) for (let j = 0; j < n; j += 13) if (Math.abs(heights[i * n + j] - heights[j * n + i]) > 1) {
    const x = -F + i * step, z = -F + j * step; k++;
    assert.ok(Math.abs(g.ground.heightAt(x, z) - T.height(x, z)) < 1e-4, `(${x}, ${z})`);
  }
  assert.ok(k >= 6);
  for (let i = 0; i < 400; i++) { const x = (i * 37 % 760) - 380, z = (i * 53 % 760) - 380; assert.equal(g.ground.materialAt(x, z), g.road.materialAt(x, z)); }
});
