// Rally's terrain through lion-hawk's createTerrainMesh with Rally's numbers (3j #9): the chunks cover the track, the
// spawn's chunks are there after the first (unbudgeted) update at full detail, the coarse LODs sink under the road, and
// the colours come from Rally's callbacks (the ground's photo is world-space, R10-9: no uv).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createTerrainMesh } from 'lion-hawk/kits/terrain/view';
import { benchSim } from './helpers/bench.mjs';
import { generateTrack } from '../src/gen/track.js';
import { noise2 } from '../src/gen/noise.js';
import { TrackWorld } from '../src/world/trackWorld.js';
import { roadDistance, terrainMeshOptions } from '../src/render/trackView.js';
await R.init();

const material = new THREE.MeshStandardMaterial({ vertexColors: true });
for (const theme of ['summer', 'winter']) {
  test(`${theme}: Rally's terrain mesh options drive the kit`, () => {
    const track = generateTrack(`tm-${theme}`, { kind: 'loop', theme }), sim = benchSim({ world: new TrackWorld(track), car: 'impreza-555' });
    const opts = terrainMeshOptions(track, theme, roadDistance(track), noise2(`${track.seed}|look`));
    const mesh = createTerrainMesh(sim.world.terrain, { ...opts, material, now: () => 0 });
    const L = track.layout, cam = { position: { x: L.x[0], y: 0, z: L.z[0] } };
    mesh.update(cam);
    const shown = mesh.group.children.filter(m => m.visible);
    assert.ok(shown.length > 4, `chunks shown: ${shown.length}`);
    for (const m of shown) {
      assert.equal(m.receiveShadow, true);
      for (const a of ['position', 'normal', 'color']) assert.ok(m.geometry.attributes[a], a);
      const c = m.geometry.attributes.color.array; assert.ok(c.every(Number.isFinite) && Math.max(...c.subarray(0, 300)) > 0.01, 'coloured');
    }
    const T = track.terrain, near = shown.find(m => { const p = m.geometry.attributes.position; return Math.abs(p.getX(0) + 32 - L.x[0]) <= 40 && Math.abs(p.getZ(0) + 32 - L.z[0]) <= 40; });
    assert.ok(near, 'the chunk under the spawn');
    assert.equal(near.geometry.attributes.position.getX(1) - near.geometry.attributes.position.getX(0), T.cell, 'full detail at the spawn');
    assert.ok(opts.drop(L.x[10], L.z[10], 2) > 0.8 && opts.drop(L.x[10], L.z[10], 0) === 0, 'coarse LODs sink under the road');
    mesh.dispose();
  });
}
