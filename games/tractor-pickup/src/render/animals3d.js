// Cube Pets with baked animations. Each animal = a Group of per-part meshes; the anim tables drive part matrices.
import * as THREE from 'three';
import { ASSETS, geoFrom, PET_ANIMS, sampleAnim } from './gfx.js';
import { FLIGHT, flourishAngle } from '../sim/launch.js';
export const MODEL = { pig: 'pig', cow: 'cow', chicken: 'chick', sheep: 'sheep', duck: 'duck', bunny: 'bunny', dog: 'dog', chick: 'chick' };
const SCALE = { pig: 1.0, cow: 1.3, chicken: 0.95, sheep: 1.0, duck: 0.9, bunny: 0.8, dog: 0.95, chick: 0.55 };
const STRETCH = { duck: [1.15, 0.85, 1.15] };
// chicken = copper-brown recolor of the chick (Pig Pens "whiten" recipe with a brown target)
export const copper = p => { const col = p.col.slice(); for (let i = 0; i < col.length; i += 3) if (col[i] >= 230 && col[i + 1] >= 140) { const s = col[i + 1] / 230; col[i] = 196 * s; col[i + 1] = 110 * s; col[i + 2] = 58 * s; } return { ...p, col }; };
const UP = new THREE.Vector3(0, 1, 0), FACE_CAR = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2); // model +z -> car +x

export function createAnimals3D(scene, herd) {
  const base = new THREE.MeshLambertMaterial({ vertexColors: true });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' });
  const geos = {}; for (const [type, m] of Object.entries(MODEL)) geos[type] = ASSETS[m].parts.map(p => geoFrom([type === 'chicken' ? copper(p) : p]));
  const makeView = a => {
    const g = new THREE.Group(), s = SCALE[a.type], st = STRETCH[a.type] || [1, 1, 1];
    const inner = new THREE.Group(); inner.scale.set(s * st[0], s * st[1], s * st[2]); g.add(inner);
    const parts = geos[a.type].map(geo => { const m = new THREE.Mesh(geo, a.golden ? gold : base); m.matrixAutoUpdate = false; m.castShadow = true; inner.add(m); return m; });
    const hat = new THREE.Group(); inner.add(hat); scene.add(g);
    return { a, g, inner, parts, hat, t: Math.random() * 3 };
  };
  const views = herd.animals.map(makeView);
  return {
    views,
    setHats(make) { for (const v of views) { v.hat.clear(); const h = make(v.a); if (h) { h.position.y = 0.95; v.hat.add(h); } } },
    update(dt, game) {
      const flightOf = new Map(game.flights.map(f => [f.animal, f]));
      while (views.length < herd.animals.length) views.push(makeView(herd.animals[views.length])); // respawned animals (G-3)
      for (const v of views) {
        const a = v.a; v.t += dt;
        v.g.visible = a.state !== 'gone'; if (!v.g.visible) continue;
        v.g.position.set(a.x, a.y || 0, a.z); v.g.rotation.set(0, a.yaw, 0);
        if (a.state === 'ride') { // face forward with the car
          const c = game.train.cars[a.ride.slot.car].body.rotation(); v.g.quaternion.set(c.x, c.y, c.z, c.w).multiply(FACE_CAR);
        }
        const fl = flightOf.get(a), kind = FLIGHT[a.type].flourish, ang = fl ? flourishAngle(kind, Math.max(0, fl.u)) : 0;
        v.inner.rotation.set(kind === 'flip' ? ang : 0, kind === 'spin' ? ang : 0, 0);
        if (a.hidden && a.state === 'hide') v.g.position.y = -0.25; // sits inside the bush; the tail pokes out (A-13)
        const anim = fl ? 'run' : a.state === 'ride' ? (game.tractor.speed > game.tractor.P.vmax * 0.8 && PET_ANIMS[MODEL[a.type]].dance ? 'dance' : 'idle') : a.anim;
        const table = PET_ANIMS[MODEL[a.type]], name = table[anim] ? anim : 'idle';
        v.parts.forEach((m, i) => { sampleAnim(table, name, v.t, i, m.matrix); m.matrixWorldNeedsUpdate = true; });
      }
    },
  };
}
