// The bake's output (3l Task 3, A-1…A-6, D2): fresh against its sources, valid, keyed to this registry, with hat sockets and anim tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePhys } from 'lion-hawk/sim';
import MATERIALS from '../src/defs/materials.js';
const root = fileURLToPath(new URL('..', import.meta.url)), read = f => JSON.parse(fs.readFileSync(path.join(root, f)));
const PHYS = read('baked/phys.json'), MAN = read('baked/manifest.json');
const PETS = ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken'];
const CLIPS = ['static', 'idle', 'walk', 'run', 'eat', 'dance', 'gesture-positive', 'gesture-negative'];
const cli = path.join(path.dirname(fileURLToPath(import.meta.resolve('lion-hawk/package.json'))), 'bin/lion-hawk.js');

test('lion-hawk bake --check: the committed bake matches its sources, the registry and the engine', () => {
  const r = spawnSync(process.execPath, [cli, 'bake', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test('phys.json is valid and keyed to this registry (T-14)', () => {
  validatePhys(PHYS); assert.equal(PHYS.materials, MATERIALS.hash);
});
test('every pet has a hat socket and an anim table with the eight clips at 30 fps', () => {
  for (const pet of PETS) {
    assert.ok(PHYS.models[pet].sockets.hat, `${pet} hat`);
    const a = read(`baked/${MAN.models[pet].anim}`); assert.equal(a.fps, 30); assert.deepEqual(Object.keys(a.clips).sort(), [...CLIPS].sort());
  }
});
test('the tractor keeps its paint slots and the barn its UVs', async () => {
  const { NodeIO } = await import('@gltf-transform/core'), { ALL_EXTENSIONS } = await import('@gltf-transform/extensions'), { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready; const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const mats = d => new Set(d.getRoot().listMaterials().map(m => m.getName()));
  const t = await io.read(path.join(root, 'baked', MAN.models.tractor.glb)); for (const n of ['paint-body', 'paint-trim', 'chassis']) assert.ok(mats(t).has(n), n);
  const b = await io.read(path.join(root, 'baked', MAN.models.barn.glb));
  const walls = b.getRoot().listNodes().find(n => n.getName() === 'walls'); assert.ok(walls.getMesh().listPrimitives()[0].getAttribute('TEXCOORD_0'), 'barn walls keep UVs');
});
