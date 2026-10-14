// Overview §5.3-1: per model and part, the baked GLB has today's vertex and triangle counts (assets.json, frozen in
// test/fixtures/assets-counts.json). A part name that appears twice in a model (corn's four 'corn' nodes) is compared with the last
// one, as assets.json kept only the last (its keys were node names).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const OLD = JSON.parse(fs.readFileSync(new URL('./fixtures/assets-counts.json', import.meta.url)));
const MAN = JSON.parse(fs.readFileSync(new URL('../baked/manifest.json', import.meta.url)));

// Engine 0.8.0 dedupes a part name against non-part nodes: the one-mesh props' part shares its name with the model's root node, so the
// bake names it '<name>-2'. Today's name -> baked name, per model (names only; the geometry counts are compared unchanged).
const DEDUPED = { bale: { bale: 'bale-2' }, barrel: { barrel: 'barrel-2' }, cone: { cone: 'cone-2' }, hay: { 'hay-bale': 'hay-bale-2' }, shrub: { shrub: 'shrub-2' } };

async function counts(id) {
  const doc = await io.read(new URL(`../baked/${MAN.models[id].glb}`, import.meta.url).pathname), out = {};
  for (const n of doc.getRoot().listNodes()) { const m = n.getMesh(); if (!m) continue; let v = 0, i = 0;
    for (const p of m.listPrimitives()) { const c = p.getAttribute('POSITION').getCount(); v += c; i += p.getIndices()?.getCount() ?? c; }
    out[n.getName()] = { v, i }; }
  return out;
}
test('every model of today is baked', () => { assert.deepEqual(Object.keys(MAN.models).sort(), Object.keys(OLD).sort()); });
for (const id of Object.keys(OLD)) test(`${id}: parts keep their vertex and triangle counts`, async () => {
  const now = await counts(id);
  for (const [part, c] of Object.entries(OLD[id])) { const name = DEDUPED[id]?.[part] ?? part; assert.ok(now[name], `${id}.${part} missing`); assert.deepEqual(now[name], c, `${id}.${part}`); }
});
