// Cube Pets with baked animations. Each animal = a Group of per-part meshes; the anim tables drive part matrices.
import * as THREE from 'three';
import { ASSETS, geoFrom, PET_ANIMS, sampleAnim } from './gfx.js';
import { FLIGHT, flourishAngle } from '../sim/launch.js';
import { slotPoint } from '../sim/slots.js';
import { TR } from '../sim/hitch.js';
import { dirtify } from './dirtMat.js';
import { SING } from '../sim/sing.js';
import { SCALE, HAT_SCALE } from './petScale.js';
export const MODEL = { pig: 'pig', cow: 'cow', chicken: 'chicken', sheep: 'sheep', duck: 'duck', bunny: 'bunny', dog: 'dog', chick: 'chick' }; // model files (spec 5.1, X-8)
const STRETCH = { duck: [1.15, 0.85, 1.15] };
const WING = new THREE.Matrix4();
// W-4: hats for riders, from the model files hat-<id>.glb (about 0.7 m wide, base at y = 0)
const hatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function buildHat(id) { const g = new THREE.Group(), m = new THREE.Mesh(geoFrom(Object.values(ASSETS['hat-' + id])), hatMat); m.castShadow = true; g.add(m); return g; }
// hats sit on the "hat" node of each animal's model file (W-4), at HAT_SCALE in the animal's own scale; the node moves with the head
const HIDE = { sink: -0.35, out: 0.55 }; // A-13: deep in the bush, nudged toward the road so the tail pokes out
const UP = new THREE.Vector3(0, 1, 0), FACE_CAR = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2); // model +z -> car +x

export function createAnimals3D(scene, herd) {
  const base = new THREE.MeshLambertMaterial({ vertexColors: true });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' });
  const geos = {}; for (const [type, m] of Object.entries(MODEL)) geos[type] = ASSETS[m].parts.map(p => geoFrom([p]));
  const tmpL = {}, protos = {}, flightOf = new Map(); let hatMake = null;
  const hatOf = id => (protos[id] ||= buildHat(id)).clone(); // clones share one set of geometries and materials
  const applyHat = v => { v.hat.clear(); const h = hatMake(v.a); if (h) { h.scale.setScalar(HAT_SCALE); v.hat.add(h); } };
  const makeView = a => {
    const g = new THREE.Group(), s = SCALE[a.type], st = STRETCH[a.type] || [1, 1, 1];
    const inner = new THREE.Group(); inner.scale.set(s * st[0], s * st[1], s * st[2]); g.add(inner);
    const mat = (a.golden ? gold : base).clone(), dirt = dirtify(mat).uniforms.uDirt; // one clone per animal, one shared program (T-16)
    const wings = ASSETS[MODEL[a.type]].parts.flatMap((p, i) => p.name.startsWith('wing') ? [i] : []);
    const parts = geos[a.type].map(geo => { const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.castShadow = true; inner.add(m); return m; });
    const hat = new THREE.Group(); hat.visible = false; hat.matrixAutoUpdate = false; inner.add(hat); scene.add(g);
    if (hatMake) applyHat({ a, hat });
    return { a, type: a.type, golden: a.golden, g, inner, parts, hat, hatRow: geos[a.type].length + ASSETS[MODEL[a.type]].mounts.indexOf('hat'), dirt, wings, t: Math.random() * 3 };
  };
  const views = herd.animals.map(makeView); // by animal id; null while that animal is gone
  // B-3 (X-4): a plain and a golden keeper far under the ground, never dropped: their programs stay compiled (warm.js) even when the
  // last golden animal is dropped and its material clone disposed, so the next golden animal draws without a compile
  for (const m of [base, gold]) { const k = new THREE.Mesh(geos.pig[0], m.clone()); dirtify(k.material); k.castShadow = true; k.position.y = -500; scene.add(k); }
  const drop = i => { const v = views[i]; if (!v) return; scene.remove(v.g); v.parts[0]?.material.dispose(); views[i] = null; }; // its own material clone; geometries are shared
  const sings = new Map(); // E-1: rider -> time since its hop began (negative while it waits its turn)
  return {
    views,
    sing(a, delay) { sings.set(a, -delay); },
    hat: hatOf,
    // make(animal) -> a hat from hat(id), or null. New animals (respawns) get the same rule. Hats show only on riders (W-4).
    setHats(make) { hatMake = make; for (const v of views) if (v) applyHat(v); },
    // view: the interpolated car poses ({ p, q } per car) and the step alpha, so riders and fliers move with the drawn train (X-1)
    update(dt, game, view) {
      flightOf.clear(); for (const f of game.flights) flightOf.set(f.animal, f);
      while (views.length < herd.animals.length) views.push(null); // respawned animals (G-3)
      for (let i = 0; i < views.length; i++) {
        const a = herd.animals[i]; if (!a || a.state === 'gone') { drop(i); continue; } // G-3: a gone animal keeps no view; its slot may get a new animal
        let v = views[i];
        if (v && (v.a !== a || v.type !== a.type || v.golden !== a.golden)) { drop(i); v = null; } // a new animal in the slot, or a placeholder from herd.ensure got its real type (M-11)
        v ||= views[i] = makeView(a);
        v.t += dt;
        v.g.visible = a.state !== 'elsewhere'; if (!v.g.visible) continue;
        v.hat.visible = a.state === 'ride' || (a.state === 'carried' && !!a.riding);
        const fl = flightOf.get(a);
        v.g.position.set(a.x, a.y || 0, a.z); v.g.rotation.set(0, a.yaw, 0);
        if (fl) v.g.position.set(fl.prev.x + (fl.pos.x - fl.prev.x) * view.alpha, fl.prev.y + (fl.pos.y - fl.prev.y) * view.alpha, fl.prev.z + (fl.pos.z - fl.prev.z) * view.alpha);
        else if (a.state === 'ride') { // in its slot on the drawn car, facing forward with it
          const c = view.cars[a.ride.slot.car]; slotPoint(a.ride.slot.k, a.ride.rider, TR.half.y, tmpL);
          v.g.position.set(tmpL.x, tmpL.y, tmpL.z).applyQuaternion(c.q).add(c.p); v.g.quaternion.copy(c.q).multiply(FACE_CAR);
          const st = sings.get(a); if (st !== undefined) { const t = st + dt; if (t >= SING.hop) sings.delete(a); else { sings.set(a, t); if (t > 0) { const u = t / SING.hop; v.g.position.y += SING.h * 4 * u * (1 - u); } } } // E-1: a hop as it sings
        } else if (a.hidden && a.state === 'hide') { // A-13: faces the bank inside the bush, its tail toward the road
          const n = game.road.nearest(a.x, a.z), dx = n.pt.x - a.x, dz = n.pt.z - a.z, d = Math.hypot(dx, dz) || 1;
          v.g.position.set(a.x + dx / d * HIDE.out, HIDE.sink, a.z + dz / d * HIDE.out); v.g.rotation.set(0, Math.atan2(-dx, -dz), 0);
        }
        const kind = FLIGHT[a.type].flourish, ang = fl ? flourishAngle(kind, Math.max(0, fl.u)) : 0;
        const wiggle = fl && kind === 'ears' ? 0.4 * Math.sin(Math.max(0, fl.u) * Math.PI * 6) * (1 - Math.min(1, Math.max(0, fl.u))) : 0; // A-6: the bunny model has no ear part, so it wiggles happily in flight instead
        v.inner.rotation.set(kind === 'flip' ? ang : 0, kind === 'spin' ? ang : 0, wiggle);
        const anim = fl ? 'run' : a.state === 'ride' ? (game.tractor.speed > game.tractor.P.vmax * 0.8 && PET_ANIMS[MODEL[a.type]].dance ? 'dance' : 'idle') : a.anim;
        const table = PET_ANIMS[MODEL[a.type]], name = table[anim] ? anim : 'idle';
        v.parts.forEach((m, i) => { sampleAnim(table, name, v.t, i, m.matrix); m.matrixWorldNeedsUpdate = true; });
        if (v.hat.visible) { sampleAnim(table, name, v.t, v.hatRow, v.hat.matrix); v.hat.matrixWorldNeedsUpdate = true; } // W-4: the hat node's frame, so the hat bobs with the head
        v.dirt.value = a.dirt || 0;
        if (fl && kind === 'flap') { WING.makeScale(1, 1 + 0.4 * Math.sin(v.t * 30), 1); for (const i of v.wings) v.parts[i].matrix.multiply(WING); } // A-6: wings flap in flight
      }
    },
  };
}
