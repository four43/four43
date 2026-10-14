// The tractor and thrown snacks through the engine's view sync (phase 3k, E-6/E-11): sync clones the model, poses it from
// the transform pool (interpolated) and removes it on despawn; these hooks add the model frame (Kenney's tractor faces +z,
// the chassis +x, scale 1.6), the red paint and the night headlight, and give each snack its centred pivot and its shrink as
// it is eaten. The wheels are view sync's: the vehicle kit writes their part poses (e.partXf) every step, and sync turns each
// wheel node about its bounding-box centre, measured after this create hook.
import * as THREE from 'three';
import { TP } from '../tractor.js';

const FOOD_SCALE = { apple: 1.7, carrot: 0.75, cabbage: 1.35, cob: 1.0 };
export function bindTractorAndSnacks(sync, { sim, night }) {
  const S = TP.scale, tr = sim.tractor, offs = [];
  offs.push(sync.on('model:tractor', {
    create(e, obj) {
      const inner = new THREE.Group(); inner.name = 'tractor-frame'; inner.rotation.y = Math.PI / 2; inner.scale.setScalar(S);
      while (obj.children.length) inner.add(obj.children[0]);
      obj.add(inner); inner.updateMatrixWorld(true);
      // Kenney's grey-blue bodywork painted farm red, trim kept, on the clone's own copy of the colours
      const body = inner.getObjectByName('body'); body.geometry = body.geometry.clone(); obj.userData.bodyGeo = body.geometry;
      const c = body.geometry.attributes.color;
      for (let i = 0; i < c.count; i++) { const r = c.getX(i), g = c.getY(i), b = c.getZ(i); if (b > r * 1.1 && r > 0.08) { const l = 0.3 * r + 0.6 * g + 0.1 * b; c.setXYZ(i, Math.min(1, l * 3.4), l * 0.42, l * 0.32); } }
      c.needsUpdate = true;
      obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const head = new THREE.SpotLight('#fff2cc', 0, 26, 0.55, 0.5, 1.2); head.position.set(1.7, 1.25, 0); head.target.position.set(9, 0, 0);
      obj.add(head, head.target); obj.userData.head = head;
    },
    frame(e, obj) { obj.userData.head.intensity = (tr.driven ? 60 : 0) * night(); },
    remove(e, obj) { obj.userData.bodyGeo?.dispose(); },
  }));
  offs.push(sync.on('#food', {
    create(e, obj) {
      const box = new THREE.Box3().setFromObject(obj), cy = (box.max.y + box.min.y) / 2;
      for (const c of obj.children) c.position.y -= cy; // pivot at the centre, for tumbling
      obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    },
    frame(e, obj) { obj.scale.setScalar(FOOD_SCALE[e.kind] * (1 - Math.min(1, e.bites / 2.5) * 0.7) * Math.max(0, e.life)); },
  }));
  return () => { for (const f of offs) f(); };
}
