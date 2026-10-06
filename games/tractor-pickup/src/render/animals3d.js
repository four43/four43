// Cube Pets with baked animations. Each animal = a Group of per-part meshes; the anim tables drive part matrices.
import * as THREE from 'three';
import { ASSETS, geoFrom, PET_ANIMS, sampleAnim } from './gfx.js';
import { FLIGHT, flourishAngle } from '../sim/launch.js';
import { slotPoint } from '../sim/slots.js';
import { TR } from '../sim/hitch.js';
import { dirtify } from './dirtMat.js';
export const MODEL = { pig: 'pig', cow: 'cow', chicken: 'chick', sheep: 'sheep', duck: 'duck', bunny: 'bunny', dog: 'dog', chick: 'chick' };
const SCALE = { pig: 1.0, cow: 1.3, chicken: 0.95, sheep: 1.0, duck: 0.9, bunny: 0.8, dog: 0.95, chick: 0.55 };
const STRETCH = { duck: [1.15, 0.85, 1.15] };
// chicken = copper-brown recolor of the chick (Pig Pens "whiten" recipe with a brown target)
export const copper = p => { const col = p.col.slice(); for (let i = 0; i < col.length; i += 3) if (col[i] >= 230 && col[i + 1] >= 140) { const s = col[i + 1] / 230; col[i] = 196 * s; col[i + 1] = 110 * s; col[i + 2] = 58 * s; } return { ...p, col }; };
const WING = new THREE.Matrix4();
const HIDE = { sink: -0.35, out: 0.55 }; // A-13: deep in the bush, nudged toward the road so the tail pokes out
const UP = new THREE.Vector3(0, 1, 0), FACE_CAR = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2); // model +z -> car +x

export function createAnimals3D(scene, herd) {
  const base = new THREE.MeshLambertMaterial({ vertexColors: true });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' });
  const geos = {}; for (const [type, m] of Object.entries(MODEL)) geos[type] = ASSETS[m].parts.map(p => geoFrom([type === 'chicken' ? copper(p) : p]));
  const tmpL = {};
  const makeView = a => {
    const g = new THREE.Group(), s = SCALE[a.type], st = STRETCH[a.type] || [1, 1, 1];
    const inner = new THREE.Group(); inner.scale.set(s * st[0], s * st[1], s * st[2]); g.add(inner);
    const mat = (a.golden ? gold : base).clone(), dirt = dirtify(mat).uniforms.uDirt; // one clone per animal, one shared program (T-16)
    const wings = ASSETS[MODEL[a.type]].parts.flatMap((p, i) => p.name.startsWith('wing') ? [i] : []);
    const parts = geos[a.type].map(geo => { const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.castShadow = true; inner.add(m); return m; });
    const hat = new THREE.Group(); inner.add(hat); scene.add(g);
    return { a, g, inner, parts, hat, dirt, wings, t: Math.random() * 3 };
  };
  const views = herd.animals.map(makeView);
  return {
    views,
    setHats(make) { for (const v of views) { v.hat.clear(); const h = make(v.a); if (h) { h.position.y = 0.95; v.hat.add(h); } } },
    // view: the interpolated car poses ({ p, q } per car) and the step alpha, so riders and fliers move with the drawn train (X-1)
    update(dt, game, view) {
      const flightOf = new Map(game.flights.map(f => [f.animal, f]));
      while (views.length < herd.animals.length) views.push(makeView(herd.animals[views.length])); // respawned animals (G-3)
      for (const v of views) {
        const a = v.a; v.t += dt;
        v.g.visible = a.state !== 'gone'; if (!v.g.visible) continue;
        const fl = flightOf.get(a);
        v.g.position.set(a.x, a.y || 0, a.z); v.g.rotation.set(0, a.yaw, 0);
        if (fl) v.g.position.set(fl.prev.x + (fl.pos.x - fl.prev.x) * view.alpha, fl.prev.y + (fl.pos.y - fl.prev.y) * view.alpha, fl.prev.z + (fl.pos.z - fl.prev.z) * view.alpha);
        else if (a.state === 'ride') { // in its slot on the drawn car, facing forward with it
          const c = view.cars[a.ride.slot.car]; slotPoint(a.ride.slot.k, a.ride.rider, TR.half.y, tmpL);
          v.g.position.set(tmpL.x, tmpL.y, tmpL.z).applyQuaternion(c.q).add(c.p); v.g.quaternion.copy(c.q).multiply(FACE_CAR);
        } else if (a.hidden && a.state === 'hide') { // A-13: faces the bank inside the bush, its tail toward the road
          const n = game.road.nearest(a.x, a.z), dx = n.pt.x - a.x, dz = n.pt.z - a.z, d = Math.hypot(dx, dz) || 1;
          v.g.position.set(a.x + dx / d * HIDE.out, HIDE.sink, a.z + dz / d * HIDE.out); v.g.rotation.set(0, Math.atan2(-dx, -dz), 0);
        }
        const kind = FLIGHT[a.type].flourish, ang = fl ? flourishAngle(kind, Math.max(0, fl.u)) : 0;
        v.inner.rotation.set(kind === 'flip' ? ang : 0, kind === 'spin' ? ang : 0, 0);
        const anim = fl ? 'run' : a.state === 'ride' ? (game.tractor.speed > game.tractor.P.vmax * 0.8 && PET_ANIMS[MODEL[a.type]].dance ? 'dance' : 'idle') : a.anim;
        const table = PET_ANIMS[MODEL[a.type]], name = table[anim] ? anim : 'idle';
        v.parts.forEach((m, i) => { sampleAnim(table, name, v.t, i, m.matrix); m.matrixWorldNeedsUpdate = true; });
        v.dirt.value = a.dirt || 0;
        if (fl && kind === 'flap') { WING.makeScale(1, 1 + 0.4 * Math.sin(v.t * 30), 1); for (const i of v.wings) v.parts[i].matrix.multiply(WING); } // A-6: wings flap in flight
      }
    },
  };
}
