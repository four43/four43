// The pig crowd (phase 3k, A-11): one InstancedMesh per pig part, posed from the baked anim table with a blend on clip
// changes, interpolated between steps from the World's transform pool (E-11), on the compiler's pig skin (pigSkin.js): the
// skin, then a coat of fur shells on the pink (eyes and hooves bare, a shorter fuzz on the snout). The crowd owns
// instanceCoverage (lane w = the herd sim's mud), instanceWet (the herd sim's wet) and aSleep (the eyelids); mud and wet mat
// the coat and make it shine. pickAnim and the tumble and rest poses are 2.1.0's.
import * as THREE from 'three';
import { sampleAnimTable } from 'lion-hawk/view';
import MATERIALS from '../defs/materials.js';
import { partGeometry, lerpM } from './models.js';
import { pigSkin } from './pigSkin.js';
import { ST } from '../sim.js';

export function createPigs({ root, assets, mc, sim, world }) {
  const table = assets.get('pig').anim, names = table.parts, N = sim.pigs.length, UP = new THREE.Vector3(0, 1, 0);
  const geos = names.map(n => partGeometry(assets, 'pig', n));
  // eyelids: tag the eye vertices (flat white and grey patches on the face) with (flag, u, v)
  { const g = geos[names.indexOf('body')], pos = g.attributes.position, col = g.attributes.color, eye = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
      const white = r > 0.75 && gg > 0.75 && b > 0.75, grey = Math.abs(r - gg) < 0.03 && b > r && r < 0.12;
      if (Math.abs(z - 0.64) < 0.02 && y > 0.6 && y < 0.93 && Math.abs(x) > 0.05 && Math.abs(x) < 0.48 && (white || grey)) eye.set([1, (Math.abs(x) - 0.06) / 0.41, (y - 0.62) / 0.31], i * 3);
    }
    g.setAttribute('aEye', new THREE.BufferAttribute(eye, 3)); }
  for (const g of geos) if (!g.attributes.aEye) g.setAttribute('aEye', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  // the head (v3 §8.2: it goes green when poorly): the front of the body block and the snout
  names.forEach((n, k) => { const pos = geos[k].attributes.position, h = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) h[i] = n === 'Group' || (n === 'body' && pos.getZ(i) > 0.12) ? 1 : 0;
    geos[k].setAttribute('aHead', new THREE.BufferAttribute(h, 1)); });
  // the coat: full on the pink skin (r high, b above g), none on the eyes (white and grey) or the hooves (b below g); the snout
  // part ('Group') is short fuzz. The face (the head's and snout's forward faces) is bare: it is one quad with the eyes a
  // centimetre in front of it, so its shells would grow over them. Shells before the instance attributes, which furGeometry
  // must not repeat.
  const SHELLS = MATERIALS.get('pigHide').look.fur.shells;
  for (let k = 0; k < geos.length; k++) {
    const g = geos[k], col = g.attributes.color, nrm = g.attributes.normal, snout = names[k] === 'Group' ? 0.4 : 1;
    const head = names[k] === 'body' || names[k] === 'Group', face = i => head && nrm.getZ(i) > 0.9;
    geos[k] = mc.furGeometry(g, i => (col.getX(i) > 0.6 && col.getZ(i) > col.getY(i) && !face(i) ? snout : 0), { shells: SHELLS });
  }
  const mud = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); mud.setUsage(THREE.DynamicDrawUsage);
  const wet = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); wet.setUsage(THREE.DynamicDrawUsage);
  const sleep = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); sleep.setUsage(THREE.DynamicDrawUsage);
  const sick = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); sick.setUsage(THREE.DynamicDrawUsage);
  for (const g of geos) { g.setAttribute('instanceCoverage', mud); g.setAttribute('instanceWet', wet); g.setAttribute('aSleep', sleep); g.setAttribute('aSick', sick); }
  const mat = [pigSkin(mc), pigSkin(mc, { fur: true })]; // furGeometry's groups: the skin, then the shells
  const meshes = geos.map((g, k) => { const m = new THREE.InstancedMesh(g, mat, N); m.name = `pig-${names[k]}`; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(m); return m; });
  const anim = sim.pigs.map(() => ({ name: 'idle', t: Math.random(), prev: 'idle', prevT: 0, blend: 1, rest: 0, phase: Math.random() * 10 }));
  function pickAnim(p, s) {
    switch (p.state) {
      case ST.GRAB: return ['dance', 2.2];
      case ST.AIR: return ['gesture-negative', 1.5];
      case ST.EAT: return ['eat', 1];
      case ST.REST: return ['idle', 0.4];
      case ST.SHOWER: if (p.speed < 0.25 && Math.hypot(p.px - sim.hose.x, p.pz - sim.hose.z) < 2.2 && sim.hose.active) return ['dance', 1.4]; break;
      case ST.SNACK: if (p.speed < 0.2) return ['eat', 1.3]; break;
      case ST.GRAZE: if (p.speed < 0.15) return [Math.sin(s.phase * 0.3 + sim.time * 0.25) > -0.2 ? 'eat' : 'idle', 0.7]; break;
    }
    if (p.speed < 0.12) return ['idle', 1];
    const sc = p.scale / 0.62;
    if (p.speed < 1.7) return ['walk', Math.max(0.5, p.speed / (0.85 * sc))];
    return ['run', p.speed / (2.6 * sc)];
  }
  const W = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qid = new THREE.Quaternion(), Qt = new THREE.Quaternion(), Qy = new THREE.Quaternion(), Qr = new THREE.Quaternion();
  const PM = new THREE.Matrix4(), PB = new THREE.Matrix4(), TMP = new THREE.Matrix4(), ZX = new THREE.Vector3(0, 0, 1), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const prev = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
  function update(dt, alpha) {
    for (const p of sim.pigs) {
      const s = anim[p.i], [name, rate] = pickAnim(p, s);
      if (name !== s.name) { s.prev = s.name; s.prevT = s.t; s.name = name; s.blend = 0; }
      s.t += dt * rate; s.prevT += dt * rate; s.blend = Math.min(1, s.blend + dt * 6);
      s.rest += ((p.state === ST.REST ? 1 : 0) - s.rest) * Math.min(1, dt * 3);
      // tumbling uses the physics body rotation, then eases back upright
      Qy.setFromAxisAngle(UP, p.yaw);
      if (p.state === ST.GRAB || p.state === ST.AIR) Q.set(p.rot[0], p.rot[1], p.rot[2], p.rot[3]).multiply(Qy);
      else if (p.getUp > 0) { Qt.set(p.tumbleQ[0], p.tumbleQ[1], p.tumbleQ[2], p.tumbleQ[3]); Q.copy(Qid).slerp(Qt, p.getUp * p.getUp * (3 - 2 * p.getUp)).multiply(Qy); }
      else Q.copy(Qy);
      if (s.rest > 0.01) Q.multiply(Qr.setFromAxisAngle(ZX, s.rest * 1.45 * (p.i % 2 ? 1 : -1)));
      // E-11: the body between the last two steps (2.1.0 drew the current step only); feet sit r below the body centre
      world.xfPrev(p, prev); const c = p.xf.p;
      v3.set(prev.p.x + (c.x - prev.p.x) * alpha, prev.p.y + (c.y - prev.p.y) * alpha, prev.p.z + (c.z - prev.p.z) * alpha);
      W.compose(v3, Q, s3.setScalar(p.scale)).multiply(TMP.makeTranslation(0, -p.r / p.scale, 0));
      if (s.rest > 0.01) W.multiply(TMP.makeTranslation((p.i % 2 ? -1 : 1) * 0.35 * s.rest, -0.18 * s.rest, 0));
      for (let k = 0; k < meshes.length; k++) {
        sampleAnimTable(table, s.name, s.t, k, PM);
        if (s.blend < 1) { sampleAnimTable(table, s.prev, s.prevT, k, PB); lerpM(PB, PM, s.blend, PM); }
        meshes[k].setMatrixAt(p.i, TMP.multiplyMatrices(W, PM));
      }
      mud.setXYZW(p.i, 0, 0, 0, p.mud); wet.setX(p.i, p.wet); sleep.setX(p.i, s.rest > 0.6 ? 1 : 0); sick.setX(p.i, p.green ?? 0);
    }
    mud.needsUpdate = true; wet.needsUpdate = true; sleep.needsUpdate = true; sick.needsUpdate = true; for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }
  return { update, meshes, anim, dispose() { for (const g of geos) g.dispose(); } }; // the material is the compiler's (shared, cached)
}
