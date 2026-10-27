// The real cars (rally-spec R16-1, R16-2): each config's geometry matches its baked model (wheel nodes on their hubs, the
// overall bounds and their centre within 1 cm), the model carries the camera sockets, and its materials are
// registry ids or paint slots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MATERIALS from '../src/defs/materials.js';
import { CARS, CAR_IDS, DEFAULT_CAR } from '../src/cars.js';
import { WHEEL_PARTS } from '../src/vehicle.js';
import { normalizeSettings } from '../src/game/settings.js';

const req = createRequire(fileURLToPath(import.meta.resolve('lion-hawk/bake')));
const load = name => import(pathToFileURL(req.resolve(name)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const { MeshoptDecoder } = await load('meshoptimizer');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const manifest = JSON.parse(readFileSync(new URL('../baked/manifest.json', import.meta.url), 'utf8'));
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(4)} vs ${want} (±${tol})`);


test('ten cars in era order, the default among them', () => {
  assert.equal(CAR_IDS.length, 10);
  assert.ok(CARS[DEFAULT_CAR]);
  const eras = CAR_IDS.map(id => CARS[id].era);
  assert.deepEqual(eras, [...eras].sort());
});

test('a stored awd / rwd car loads as the default (settings v7)', () => {
  assert.equal(normalizeSettings({ car: 'awd', v: 6 }).car, DEFAULT_CAR);
  assert.equal(normalizeSettings({ car: 'rwd', v: 6 }).car, DEFAULT_CAR);
  assert.equal(normalizeSettings({ car: 'stratos-hf', v: 7 }).car, 'stratos-hf');
});

for (const id of CAR_IDS) {
  test(`${id}: config geometry matches the baked model`, async () => {
    const c = CARS[id], doc = await io.read(fileURLToPath(new URL(`../baked/${manifest.models[id].glb}`, import.meta.url)));
    const nodes = Object.fromEntries(doc.getRoot().listNodes().map(n => [n.getName(), n]));
    // getParentNode isn't on every gltf-transform build: walk parents from the scene instead
    const parent = new Map(); for (const n of doc.getRoot().listNodes()) for (const ch of n.listChildren()) parent.set(ch, n);
    const pos = n => { let p = [0, 0, 0]; for (let k = n; k; k = parent.get(k)) { const t = k.getTranslation(); p = [p[0] + t[0], p[1] + t[1], p[2] + t[2]]; } return p; };
    const [fl, fr, bl, br] = WHEEL_PARTS.map(name => { assert.ok(nodes[name], `${id} has ${name}`); return pos(nodes[name]); });
    near(fl[2] - bl[2], c.wheelbase, 0.005, 'wheelbase');
    near(((fl[0] - fr[0]) + (bl[0] - br[0])) / 2, c.track, 0.005, 'track');
    near(fl[1], c.radius, 0.005, 'front hub height'); near(bl[1], c.radius, 0.005, 'rear hub height');
    near((fl[2] + bl[2]) / 2, 0, 0.005, 'origin under the wheelbase midpoint');
    for (const s of ['sock-cam-bumper', 'sock-cam-bonnet']) assert.ok(nodes[s], `${id} has ${s}`);
    // overall size from the meshes' bounds (positions are in each node's frame: translations only)
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const n of doc.getRoot().listNodes()) {
      const m = n.getMesh(); if (!m) continue;
      const o = pos(n);
      for (const p of m.listPrimitives()) {
        const a = p.getAttribute('POSITION'), v = [0, 0, 0];
        for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k] + o[k]); hi[k] = Math.max(hi[k], v[k] + o[k]); } }
      }
    }
    const [W, H, L] = c.size;
    near(hi[0] - lo[0], W, 0.01, 'width'); near(hi[1], H, 0.01, 'height'); near(hi[2] - lo[2], L, 0.01, 'length');
    near((hi[2] + lo[2]) / 2, c.bodyZ, 0.01, 'body centre z');
    for (const mat of doc.getRoot().listMaterials()) assert.ok(MATERIALS.has(mat.getName()) || mat.getName().startsWith('paint-'), mat.getName());
  });
}
