// Thrown snacks through the engine's view sync (phase 3k, E-6/E-11): sync clones the model, poses it from the transform pool
// (interpolated) and removes it on despawn; this hook gives each snack its centred pivot and its shrink as it is eaten.
import * as THREE from 'three';

const FOOD_SCALE = { apple: 1.7, carrot: 0.75, cabbage: 1.35, cob: 1.0 };
export function bindSnacks(sync) {
  return sync.on('#food', {
    create(e, obj) {
      const box = new THREE.Box3().setFromObject(obj), cy = (box.max.y + box.min.y) / 2;
      for (const c of obj.children) c.position.y -= cy; // pivot at the centre, for tumbling
      obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    },
    frame(e, obj) { obj.scale.setScalar(FOOD_SCALE[e.kind] * (1 - Math.min(1, e.bites / 2.5) * 0.7) * Math.max(0, e.life)); },
  });
}
