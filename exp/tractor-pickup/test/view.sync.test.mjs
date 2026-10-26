// The train's view hooks (3l Task 16): create only shapes the model (view sync draws the wheels from the kit's part poses); the away ghost
// stays on its own train; the engine paint (3f PAINT, repaint) draws 1.8's paintable colours at every paint vertex of the baked tractor.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialCompiler } from 'lion-hawk/view';
import MATERIALS from '../src/defs/materials.js';
import { fakeAssets } from './helpers/assets.mjs';
import { coverageView } from 'lion-hawk/kits/coverage/view';
import { trainViews, paintValues, PAINTS, RAINBOW, PAINT_LOOK } from '../src/view/vehicles.js';
import { TRACTOR_WHEELS } from '../src/sim/tractor.js';
import { CAR_WHEELS } from '../src/sim/hitch.js';

// view sync's hook order (3g): each entity's create hooks, then its frame hooks; a match is '#tag' or a predicate
function fakeSync() {
  const hooks = [], is = (m, e) => typeof m === 'function' ? m(e) : e.tags.has(m.slice(1));
  return { on(m, h) { hooks.push([m, h]); return () => {}; },
    create(e, o) { for (const [m, h] of hooks) if (is(m, e)) h.create?.(e, o); }, frame(e, o) { for (const [m, h] of hooks) if (is(m, e)) h.frame?.(e, o, 1); } };
}
// two tractors and two cars from the baked models, as sync clones them (shared compiled materials), through the hooks as wired in game.view.js
async function trains({ cover = true } = {}) {
  const A = await fakeAssets(['tractor', 'trailer']), mc = createMaterialCompiler(MATERIALS, { paint: PAINT_LOOK }), sync = fakeSync(), away = new Set();
  trainViews(sync, { materials: mc, paintOf: () => ({ body: 'red', trim: 'yellow' }), awayOf: e => away.has(e.id) }); if (cover) coverageView(sync, mc);
  const ents = [['tractor', 'tractor'], ['tractor', 'tractor'], ['car', 'trailer'], ['car', 'trailer']].map(([tag, model], i) => ({ id: i + 1, tags: new Set([tag]), model, coverage: { dirt: 0 } }));
  const objs = ents.map(e => { const o = A.get(e.model).scene.clone(true); mc.apply(o); sync.create(e, o); return o; });
  return { objs, away, frame: () => ents.forEach((e, i) => sync.frame(e, objs[i])) };
}
const mats = o => { const out = []; o.traverse(m => { if (m.isMesh) out.push(...[].concat(m.material)); }); return out; };
test('create only shapes the model: the axis fix, one node per kit wheel part; no wheel code in the hooks (view sync draws the wheels)', async () => {
  const { objs } = await trains();
  assert.equal(objs[0].children.length, 1, 'the model sits under the axis-fix group');
  for (const w of TRACTOR_WHEELS) assert.ok(objs[0].getObjectByName(w.name)?.isMesh, w.name);
  for (const n of CAR_WHEELS) assert.ok(objs[2].getObjectByName(n)?.isMesh, n);
  assert.doesNotMatch(trainViews.toString(), /wheelRotation|wheelSteering|wheelSuspensionLength|matrixAutoUpdate|e\.car\b/, 'no per-frame wheel code');
});
test('ghosting one train leaves the other trains\' materials opaque (per-entity clones from coverageView)', async () => {
  const { objs, away, frame } = await trains();
  away.add(2); away.add(4); frame();
  objs.forEach((o, i) => { const on = i === 1 || i === 3;
    for (const m of mats(o)) { assert.equal(m.userData.lhShared, false, `train ${i + 1}: ${m.name} is its own`); assert.equal(m.transparent, on, `train ${i + 1} ${m.name}`); assert.equal(m.opacity, on ? 0.45 : 1); } });
  away.clear(); frame();
  for (const o of objs) for (const m of mats(o)) assert.ok(!m.transparent && m.opacity === 1, 'un-ghosted');
});
test('ghosting a train on shared compiled materials throws instead of ghosting every train', async () => {
  const { objs, away, frame } = await trains({ cover: false });
  away.add(2); assert.throws(frame, /tractor: ghost needs per-entity materials/);
  for (const m of mats(objs[0])) assert.equal(m.opacity, 1, 'the other tractor stays opaque');
});
test('paintValues: colours by name (red for an unknown name), rainbow as the hue ramp along the model z; the compiler look', () => {
  assert.deepEqual(paintValues({ body: 'blue', trim: 'rainbow' }), { body: PAINTS.blue, trim: RAINBOW });
  assert.deepEqual(RAINBOW, { hue: { axis: [0, 0, 1], from: -1, to: 1, s: 0.75, l: 0.5 } });
  assert.equal(paintValues({ body: 'mauve', trim: 'red' }).body, PAINTS.red);
  assert.deepEqual(PAINT_LOOK, { base: 'chassis', shade: [0.25, 0.85, 1.1] });
  assert.equal(PAINTS.rainbow, null, 'the UI keeps drawing its own rainbow gradient');
});
// Tractor 1.8's paintable (render/vehicles3d.js at 1.8.0), the oracle. rows: [{ area 1 body | 2 trim, pos (model space), col (linear) }].
// Each paint vertex gets the paint, or the rainbow hue at its model z, times 0.25 + 0.85 × its brightness over its area's brightest, at most 1.1.
function paintable18(rows, { body, trim }) {
  const top = [0, 0, 0], c = new THREE.Color();
  const lum = rows.map(r => Array.from({ length: r.col.length / 3 }, (_, i) => 0.3 * r.col[i * 3] + 0.6 * r.col[i * 3 + 1] + 0.1 * r.col[i * 3 + 2]));
  rows.forEach((r, j) => lum[j].forEach(l => { top[r.area] = Math.max(top[r.area], l); }));
  return rows.map((r, j) => lum[j].flatMap((l, i) => {
    const name = r.area === 1 ? body : trim, k = Math.min(1.1, 0.25 + 0.85 * l / top[r.area]);
    if (name === 'rainbow') c.setHSL(((r.pos[i * 3 + 2] + 1) * 0.5) % 1, 0.75, 0.5); else c.set(PAINTS[name] ?? PAINTS.red);
    return [c.r * k, c.g * k, c.b * k];
  }));
}
// 3f's PAINT for a plain mesh in JS (chunks.js paint(): the vertex stage's vLhPaint), from lhPaint and the material's own uniforms
const fract = x => x - Math.floor(x);
function drawn(m, a, i, out) {
  const sh = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} };
  m.onBeforeCompile(sh, null);
  const md = sh.uniforms.uPaintMode.value, ax = sh.uniforms.uPaintAxis.value, s = sh.uniforms.uPaintShade.value, k = Math.min(s.z, s.x + s.y * a.getW(i));
  if (md.x > 1.5) return out.setHSL(fract(ax.x * a.getX(i) + ax.y * a.getY(i) + ax.z * a.getZ(i) + ax.w), md.y, md.z).multiplyScalar(k);
  assert.ok(md.x > 0.5, 'every paint vertex is painted');
  return out.copy(m.color).multiplyScalar(k);
}
test('the engine paint draws 1.8\'s paintable colours at every paint vertex of the baked tractor (the fenders and the roof share one top)', async () => {
  const A = await fakeAssets(['tractor']), mc = createMaterialCompiler(MATERIALS, { paint: PAINT_LOOK }), obj = A.get('tractor').scene.clone(true);
  mc.apply(obj); obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert(), rows = [];
  obj.traverse(m => {
    const area = m.isMesh && { 'paint-body': 1, 'paint-trim': 2 }[m.userData.lhMat?.[0]];
    if (!area) return;
    const g = m.geometry, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), v = new THREE.Vector3(), pos = [], col = [];
    for (let i = 0; i < g.attributes.position.count; i++) {
      v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(M); pos.push(v.x, v.y, v.z);
      col.push(g.attributes.color.getX(i), g.attributes.color.getY(i), g.attributes.color.getZ(i));
    }
    rows.push({ m, area, pos, col });
  });
  assert.deepEqual(rows.map(r => r.area).sort(), [1, 2, 2], 'paint-body on the body; paint-trim on the fenders and the roof');
  const out = new THREE.Color();
  for (const p of [{ body: 'red', trim: 'yellow' }, { body: 'blue', trim: 'rainbow' }, { body: 'rainbow', trim: 'white' }]) {
    mc.repaint(obj, paintValues(p));
    const want = paintable18(rows, p);
    rows.forEach((r, j) => { const a = r.m.geometry.attributes.lhPaint; assert.ok(a, `${r.m.name}: apply wrote lhPaint`);
      for (let i = 0; i < a.count; i++) { drawn(r.m.material, a, i, out);
        ['r', 'g', 'b'].forEach((ch, k) => assert.ok(Math.abs(out[ch] - want[j][i * 3 + k]) < 1e-5, `${p.body}/${p.trim} ${r.m.name} vertex ${i} ${ch}: ${out[ch]} vs ${want[j][i * 3 + k]}`)); } });
  }
});
