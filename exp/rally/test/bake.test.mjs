// The bake (lion-hawk overview §5.3-1): every Kenney model is baked, each mesh part keeps today's triangle count (the
// counts the retired src/assets.json held at e03ed71; weld merges vertices once the palette step drops UVs, so vertex counts fall,
// e.g. hatchback-sports 3709 → about 2048), and phys.json was baked against today's registry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MATERIALS from '../src/defs/materials.js';

const COUNTS = { // node name → triangle count (index count / 3), from the retired src/assets.json at e03ed71
  'hatchback-sports': { 'wheel-front-right': 332, 'wheel-front-left': 332, 'wheel-back-right': 332, 'wheel-back-left': 332, body: 760 },
  'sedan-sports': { 'wheel-back-right': 332, body: 712, spoiler: 48, 'wheel-back-left': 332, 'wheel-front-left': 332, 'wheel-front-right': 332 },
  'wheel-racing': { 'wheel-racing': 332 },
  cone: { cone: 172 },
};
// The bake de-duplicates part names against every node and the scene with '-2' (spec §8.4 3d C3): the single-part models'
// root node shares the model's name, so their part is 'wheel-racing-2' / 'cone-2' (contract issue, see the 3j notes).
const BAKED_NAMES = { 'wheel-racing': { 'wheel-racing-2': 332 }, cone: { 'cone-2': 172 } };
const tris = p => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
// The engine's own gltf-transform and meshopt copies (one core across extensions): resolved from lion-hawk/bake.
const req = createRequire(fileURLToPath(import.meta.resolve('lion-hawk/bake')));
const load = name => import(pathToFileURL(req.resolve(name)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const { MeshoptDecoder } = await load('meshoptimizer');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const manifest = json('../baked/manifest.json'), phys = json('../baked/phys.json');

test('every Kenney model is baked, no animation tables', () => {
  assert.deepEqual(Object.keys(manifest.models).sort(), Object.keys(COUNTS).sort());
  for (const m of Object.values(manifest.models)) assert.equal(m.anim, null);
});
for (const [model, parts] of Object.entries(COUNTS)) {
  test(`${model}: baked part triangle counts equal today's`, async () => {
    const doc = await io.read(fileURLToPath(new URL(`../baked/${manifest.models[model].glb}`, import.meta.url)));
    const got = {};
    for (const n of doc.getRoot().listNodes()) {
      const mesh = n.getMesh();
      if (mesh) got[n.getName()] = mesh.listPrimitives().reduce((a, p) => a + tris(p), 0);
    }
    assert.deepEqual(got, BAKED_NAMES[model] ?? parts);
    for (const mat of doc.getRoot().listMaterials()) assert.ok(MATERIALS.has(mat.getName()), mat.getName());
  });
}
test('phys.json was baked against this registry', () => {
  assert.equal(phys.materials, MATERIALS.hash);
  assert.deepEqual(Object.keys(phys.models).sort(), Object.keys(COUNTS).sort());
});
