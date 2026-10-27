// Chickens, the fox and the dog (phase 3k). Chickens: two instanced crowds (white adults, yellow chicks) on the baked chick
// anim table; body and wings carry shell fur from the material compiler (look.fur on `plumage`), the face kept bare by the
// 0..1 mask (3f C10). The fox and the dog: cloned models on AnimationMixer (A-11), as single animals need no table.
import * as THREE from 'three';
import { sampleAnimTable } from 'lion-hawk/view';
import { partGeometry, lerpM } from './models.js';
import { CST, FST } from '../chickens.js';
import MATERIALS from '../defs/materials.js';

const l2s = c => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));
const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const UP = new THREE.Vector3(0, 1, 0), NB = 26;

export function createFlock3d({ root, assets, mc, sim, spawnFeathers }) {
  const flock = sim.flock, coop = sim.lay.coop, table = assets.get('chick').anim, names = table.parts;
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), PM = new THREE.Matrix4(), PB = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), tint = new THREE.Color();
  const base = mc.get('pet', { instanced: true, vertexColors: true }), fur = mc.get('plumage', { instanced: true, vertexColors: true });
  // plumage test on sRGB 0..255 colours: white-ish/yellow body and wing feathers
  const plume = (wing, r, g) => r >= 250 && g >= (wing ? 140 : 170);
  // 2.1.0's face trim: full length from FADE metres outside the bare box, none inside it; now a 0..1 mask per vertex (3f C10)
  const BARE = [[-0.47, 0.4, 0.5], [0.47, 0.96, 1]], FADE = 0.14, SHELLS = MATERIALS.get('plumage').look.fur.shells;
  const out = (x, k) => Math.max(BARE[0][k] - x, x - BARE[1][k], 0);
  const trim = (pos, i) => Math.min(1, Math.hypot(out(pos.getX(i), 0), out(pos.getY(i), 1), out(pos.getZ(i), 2)) / FADE);
  const geos = [];
  function partSet(adult) {
    return names.map(name => {
      const g = partGeometry(assets, 'chick', name), col = g.attributes.color, wing = name.startsWith('wing'), pos = g.attributes.position;
      const src = Array.from({ length: col.count }, (_, i) => [l2s(col.getX(i)), l2s(col.getY(i)), l2s(col.getZ(i))]);
      if (adult) src.forEach(([r, gg], i) => { // white laying hens (Kenney's chick is yellow); beak, feet and eyes keep their colours
        if (!plume(wing, r, gg)) return;
        const sh = wing ? 0.8 + 0.2 * Math.min(1, (gg - 150) / 57) : 0.9 + 0.1 * Math.min(1, (gg - 170) / 40);
        col.setXYZ(i, s2l(248 * sh), s2l(246 * sh), s2l(240 * sh));
      });
      const furry = name === 'body' || wing;
      const geo = furry ? mc.furGeometry(g, i => (plume(wing, src[i][0], src[i][1]) ? trim(pos, i) : 0), { shells: SHELLS }) : g;
      geos.push(geo);
      const m = new THREE.InstancedMesh(geo, furry ? [base, fur] : base, NB); m.name = `${adult ? 'hen' : 'chick'}-${name}`;
      m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < NB; i++) { m.setColorAt(i, tint.setRGB(1, 1, 1)); m.setMatrixAt(i, ZERO); }
      root.add(m); return m;
    });
  }
  const adultMeshes = partSet(true), babyMeshes = partSet(false), all = [...adultMeshes, ...babyMeshes], birdAnim = [];
  function birdClip(b) {
    switch (b.state) {
      case CST.GRAB: case CST.AIR: case CST.CARRIED: return ['dance', 2.6];
      case CST.LAY: case CST.BROOD: return ['idle', 0.5];
      case CST.DUST: return b.dusting ? ['dance', 0.8] : null;
      case CST.PECK: if (b.speed < 0.1) return ['eat', 1.2]; break;
      case CST.GRAIN: if (b.speed < 0.12) return ['eat', 2]; break;
      case CST.ROOST: if (b.speed < 0.1 && !coop.open) return ['gesture-negative', 0.6]; break;
    }
    return null;
  }
  function updateBirds(dt) {
    for (const b of flock.birds) {
      let a = birdAnim[b.i]; if (!a) a = birdAnim[b.i] = { name: 'idle', t: Math.random(), prev: 'idle', pt: 0, blend: 1, painted: false };
      const set = b.kind === 'chick' ? babyMeshes : adultMeshes, other = b.kind === 'chick' ? adultMeshes : babyMeshes;
      if (!a.painted) {
        if (b.kind === 'chick') tint.setRGB(1, 1, 1); else tint.setRGB(b.tint[0], b.tint[1], b.tint[2]);
        for (const m of set) { m.setColorAt(b.i, tint); m.instanceColor.needsUpdate = true; }
        for (const m of other) m.setMatrixAt(b.i, ZERO);
        a.painted = true;
      }
      if (b.hidden || b.state === CST.INSIDE || b.state === CST.LOST) { for (const m of set) m.setMatrixAt(b.i, ZERO); continue; }
      const [name, rate] = birdClip(b) || (b.speed < 0.08 ? ['idle', 1] : b.speed < 1.0 ? ['walk', b.speed / (0.5 * b.scale / 0.3)] : ['run', b.speed / (1.6 * b.scale / 0.3)]);
      if (name !== a.name) { a.prev = a.name; a.pt = a.t; a.name = name; a.blend = 0; }
      a.t += dt * rate; a.pt += dt * rate; a.blend = Math.min(1, a.blend + dt * 8);
      const sit = b.state === CST.LAY || b.state === CST.BROOD || (b.state === CST.DUST && b.dusting) ? 0.28 * b.scale : 0;
      M.compose(v.set(b.px, b.py - b.r - sit, b.pz), q.setFromAxisAngle(UP, b.yaw), s.setScalar(b.scale));
      for (let k = 0; k < set.length; k++) {
        sampleAnimTable(table, a.name, a.t, k, PM); if (a.blend < 1) { sampleAnimTable(table, a.prev, a.pt, k, PB); lerpM(PB, PM, a.blend, PM); }
        set[k].setMatrixAt(b.i, T.multiplyMatrices(M, PM));
      }
    }
    for (const m of all) m.instanceMatrix.needsUpdate = true;
  }
  // a single animal on its mixer: the clip by speed, rate as 2.1.0's table rates (no blend, as 2.1.0)
  function mixed(key) {
    const obj = assets.clone(key), mixer = new THREE.AnimationMixer(obj), acts = {};
    for (const c of assets.get(key).clips) acts[c.name] = mixer.clipAction(c);
    obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    obj.matrixAutoUpdate = false; root.add(obj);
    let cur = null;
    return { obj, play(name, rate, dt) { if (cur !== name) { if (cur) acts[cur].stop(); acts[name].reset().play(); cur = name; } mixer.update(dt * rate); } };
  }
  const dog = mixed('dog'), fox = mixed('fox');
  const cheekMat = new THREE.MeshLambertMaterial({ color: '#f0eadf' }), tuftMat = new THREE.MeshLambertMaterial({ color: '#ffd84a' }); // the fox's puffed cheeks
  const cheekGeo = new THREE.SphereGeometry(0.3, 14, 10), tuftGeo = new THREE.ConeGeometry(0.13, 0.4, 6).rotateX(Math.PI / 2);
  const cheeks = [-1, 1].map(sd => { const m = new THREE.Mesh(cheekGeo, cheekMat); m.position.set(sd * 0.36, 0.56, 0.7); m.castShadow = true; fox.obj.add(m); return m; });
  const tuft = new THREE.Mesh(tuftGeo, tuftMat); tuft.position.set(0.05, 0.62, 0.98); fox.obj.add(tuft);
  const foxA = { t: 0, puff: 0 };
  function updateDog(dt) {
    const d = sim.dog, name = d.speed < 0.2 ? 'idle' : d.speed < 2.5 ? 'walk' : 'run', rate = name === 'idle' ? 1 - 0.7 * d.lie : name === 'walk' ? d.speed / 0.7 : d.speed / 2.4;
    // lying down: the body (0.18 up on its legs in the model) sinks onto its belly, legs tucked under the ground; slow idle breathing
    dog.obj.matrix.compose(v.set(d.x, Math.sin(Math.min(1, d.hop) * Math.PI / 2) * 1.05 - d.lie * 0.2 * 0.62, d.z), q.setFromAxisAngle(UP, d.yaw), s.setScalar(0.62)); dog.obj.matrixWorldNeedsUpdate = true;
    dog.play(name, rate, dt);
  }
  function updateFox(dt) {
    const f = flock.fox; fox.obj.visible = f.state !== FST.AWAY; if (!fox.obj.visible) return;
    const name = f.speed < 0.2 ? 'idle' : f.speed < 2.2 ? 'walk' : 'run', rate = name === 'idle' ? 1 : name === 'walk' ? f.speed / 0.8 : f.speed / 3;
    foxA.t += dt * rate;
    fox.obj.matrix.compose(v.set(f.x, Math.sin(Math.min(1, f.hop) * Math.PI / 2) * 1.0, f.z), q.setFromAxisAngle(UP, f.yaw), s.setScalar(0.5)); fox.obj.matrixWorldNeedsUpdate = true;
    fox.play(name, rate, dt);
    foxA.puff += ((f.carrying ? 1 : 0) - foxA.puff) * Math.min(1, dt * 6);
    const wob = 1 + Math.sin(foxA.t * 9) * 0.08 * foxA.puff;
    cheeks.forEach((c, k) => { c.visible = foxA.puff > 0.02; c.scale.setScalar(Math.max(0.01, foxA.puff * wob * (k ? 1.05 : 0.95))); });
    tuft.visible = foxA.puff > 0.5; tuft.rotation.y = Math.sin(foxA.t * 6) * 0.4;
    if (f.carrying && Math.random() < dt * 4) { v.set(0, 0.62, 1.0).applyMatrix4(fox.obj.matrix); spawnFeathers(v.x, v.y, v.z, 1, f.carrying.tint, 0.6); } // feathers keep escaping
  }
  return {
    update(dt) { updateBirds(dt); updateFox(dt); updateDog(dt); },
    dog: dog.obj, fox: fox.obj,
    dispose() { for (const g of geos) g.dispose(); cheekGeo.dispose(); tuftGeo.dispose(); cheekMat.dispose(); tuftMat.dispose(); },
  };
}
