// Muddy footprints (view/footprints.js): muddy pigs on the move leave prints, a stride apart, stamped with the sim time and
// their mud; clean pigs and pigs in the air leave none; the patch compiles on the compiler's mudPrint material.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialCompiler } from 'lion-hawk/view';
import MATERIALS from '../src/defs/materials.js';
import { createFootprints, PRINTS } from '../src/view/footprints.js';
import { farmSim } from './farmSim.mjs';

const mc = createMaterialCompiler(MATERIALS, { shading: 'lambert' });
function rig(mud) {
  const sim = farmSim({ pigs: 24, seed: 5 }), root = new THREE.Group();
  for (const p of sim.pigs) p.mud = mud;
  const fp = createFootprints({ root, mc, sim });
  const run = n => { for (let k = 0; k < n; k++) { for (const p of sim.pigs) p.mud = mud; sim.step(); fp.update(); } };
  return { sim, fp, run, root };
}

test('muddy pigs leave prints stamped (born, strength); clean pigs leave none', () => {
  const muddy = rig(1); muddy.run(600);
  const n = muddy.fp.marks.mesh.count, aPrint = muddy.fp.marks.mesh.geometry.attributes.aPrint;
  assert.ok(n > 20, `prints after 10 s: ${n}`);
  assert.equal(muddy.root.getObjectByName('footprints'), muddy.fp.marks.mesh);
  for (let i = 0; i < n; i++) { assert.ok(aPrint.getX(i) > 0 && aPrint.getX(i) <= muddy.sim.time, 'born on the sim clock'); assert.equal(aPrint.getY(i), 1, 'full mud, full strength'); }
  const clean = rig(0); clean.run(600);
  assert.equal(clean.fp.marks.mesh.count, 0);
  const light = rig(PRINTS.minMud - 0.01); light.run(300);
  assert.equal(light.fp.marks.mesh.count, 0, 'below minMud: no prints');
});

test('the hose washes the prints under its spray away; prints outside it stay', () => {
  const { sim, fp, run } = rig(1); run(600);
  const a = fp.marks.mesh.geometry.attributes.aPrint, n = fp.marks.mesh.count, M = new THREE.Matrix4(), p = new THREE.Vector3();
  const xz = i => { fp.marks.mesh.getMatrixAt(i, M); p.setFromMatrixPosition(M); return [p.x, p.z]; };
  const [hx, hz] = xz(0);
  sim.hose.active = true; sim.hose.x = hx; sim.hose.z = hz;
  for (let k = 0; k < 60; k++) fp.update(1 / 60); // a second of spray, the sim held still
  let under = 0, outside = 0;
  for (let i = 0; i < n; i++) { const [x, z] = xz(i), d = Math.hypot(x - hx, z - hz); if (d < 1.3) { under++; assert.equal(a.getY(i), 0, `print ${i} under the spray`); } else if (d > 1.5) { outside++; assert.equal(a.getY(i), 1); } }
  assert.ok(under >= 1 && outside > 10, `${under} under, ${outside} outside`);
});

test('the hoofprint patch compiles on mudPrint (transparent mud) with the fade uniforms', () => {
  const { fp } = rig(1), m = fp.marks.mesh.material;
  assert.equal(m.name, 'mudPrint'); assert.equal(m.transparent, true); assert.match(m.customProgramCacheKey(), /x:hoofprint/);
  const sh = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} };
  m.onBeforeCompile(sh, null);
  assert.match(sh.vertexShader, /attribute vec2 aPrint;/); assert.match(sh.fragmentShader, /smoothstep\( uPrintLife\.x, uPrintLife\.y/);
  assert.deepEqual(sh.uniforms.uPrintLife.value.toArray(), [PRINTS.fadeFrom, PRINTS.life]);
});
