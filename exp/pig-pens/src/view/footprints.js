// Muddy footprints: a muddy pig leaves a cloven hoof print every stride, alternating sides, darker the muddier it is; prints
// fade out after a while, and the hose washes them away (strength drops at `wash` per second inside the spray). The ring of ground quads is the engine's createMarks (lion-hawk/kits/fx); the material is the
// compiler's `mudPrint` (mud, transparent) with a game patch that cuts the hoof shape and fades each print by its age.
// aPrint per slot = (born, strength), born on the sim clock. View only: it reads the herd, never writes it.
import * as THREE from 'three';
import { createMarks } from 'lion-hawk/kits/fx/view';
import { ST, P } from '../sim.js';

export const PRINTS = { max: 1200, minMud: 0.12, fullMud: 0.5, stride: 0.34, side: 0.13, fadeFrom: 20, life: 32, width: 0.15, length: 0.17, opacity: 0.55, wash: 1.5 };

export function createFootprints({ root, mc, sim }) {
  const now = { value: 0 }, life = { value: new THREE.Vector2(PRINTS.fadeFrom, PRINTS.life) };
  const mat = mc.extend(mc.get('mudPrint', { instanced: true }), 'hoofprint', (sh, inject, o) => {
    if (o?.depth) return; // prints cast no shadow
    sh.uniforms.uPrintNow = now; sh.uniforms.uPrintLife = life;
    sh.vertexShader = inject(sh.vertexShader, 'common', 'attribute vec2 aPrint; varying vec2 vPrint; varying vec2 vPrintP;');
    sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', 'vPrint = aPrint; vPrintP = position.xz;');
    sh.fragmentShader = inject(sh.fragmentShader, 'common', 'uniform float uPrintNow; uniform vec2 uPrintLife; varying vec2 vPrint; varying vec2 vPrintP;');
    sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', `{
  vec2 q = vPrintP * 2.0;                                                // -1..1: x across, y along (toes at +y)
  vec2 t = vec2( abs( q.x ) - 0.46, q.y + 0.05 ) / vec2( 0.4 * ( 0.85 - 0.3 * q.y ), 0.88 ); // two toes, narrower at the tip
  float toe = 1.0 - smoothstep( 0.72, 1.0, length( t ) );
  float fade = vPrint.y * ( 1.0 - smoothstep( uPrintLife.x, uPrintLife.y, uPrintNow - vPrint.x ) );
  diffuseColor.a *= toe * fade * ${PRINTS.opacity.toFixed(2)};
  if ( diffuseColor.a < 0.01 ) discard;
}`);
  });
  const marks = createMarks({ max: PRINTS.max, width: PRINTS.width, length: PRINTS.length, material: mat, lift: 0.03 });
  marks.mesh.name = 'footprints'; marks.mesh.receiveShadow = true; marks.mesh.renderOrder = 1;
  const born = new THREE.InstancedBufferAttribute(new Float32Array(PRINTS.max * 2), 2); born.setUsage(THREE.DynamicDrawUsage);
  marks.mesh.geometry.setAttribute('aPrint', born);
  root.add(marks.mesh);

  const at = new Float32Array(PRINTS.max * 2); // each slot's (x, z), for the hose
  const N = sim.pigs.length, walked = new Float32Array(N), side = new Int8Array(N).fill(1), last = new Float32Array(N * 2);
  for (const p of sim.pigs) { last[p.i * 2] = p.px; last[p.i * 2 + 1] = p.pz; }
  const w = sim.lay.wallow;
  let wrote = false;

  function update(dt = 0) {
    now.value = sim.time;
    wash(dt);
    for (const p of sim.pigs) {
      const k = p.i * 2, dx = p.px - last[k], dz = p.pz - last[k + 1];
      last[k] = p.px; last[k + 1] = p.pz;
      const d = Math.hypot(dx, dz);
      if (d > 2) { walked[p.i] = 0; continue; } // a respawn or a drop: no trail across the farm
      const s = p.scale / 0.62, grounded = p.state !== ST.GRAB && p.state !== ST.AIR && p.py < p.r + 0.08;
      if (!grounded || p.mud < PRINTS.minMud) { walked[p.i] = 0; continue; }
      if ((walked[p.i] += d) < PRINTS.stride * s) continue;
      walked[p.i] = 0;
      const ex = (p.px - w.x) / w.rx, ez = (p.pz - w.z) / w.rz;
      if (ex * ex + ez * ez < 1) continue; // in the wallow: mud on mud
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), o = side[p.i] * PRINTS.side * s; side[p.i] = -side[p.i]; // toes along the body, even when shoved
      const i = marks.add(p.px + fz * o, p.pz - fx * o, fx, fz, s * 1.6 - 0.6); // a piglet's print is narrower
      if (i < 0) continue;
      born.setXY(i, sim.time, Math.min(1, (p.mud - PRINTS.minMud) / (PRINTS.fullMud - PRINTS.minMud))); at[i * 2] = p.px + fz * o; at[i * 2 + 1] = p.pz - fx * o;
      wrote = true;
    }
    if (wrote) { marks.update(); born.needsUpdate = true; wrote = false; }
  }
  // the hose's spray rinses the prints under it (the spray ring is hoseR across, as the pigs' wash)
  function wash(dt) {
    const h = sim.hose;
    if (!h.active || !(dt > 0)) return;
    const r2 = P.hoseR * P.hoseR, a = born.array, n = marks.mesh.count;
    for (let i = 0; i < n; i++) {
      const s = a[i * 2 + 1];
      if (s <= 0) continue;
      const dx = at[i * 2] - h.x, dz = at[i * 2 + 1] - h.z;
      if (dx * dx + dz * dz > r2) continue;
      a[i * 2 + 1] = Math.max(0, s - PRINTS.wash * dt); wrote = true;
    }
  }
  return { update, marks, dispose() { marks.dispose(); } }; // the material is the compiler's (shared, cached)
}
