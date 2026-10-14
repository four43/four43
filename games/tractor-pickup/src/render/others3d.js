// The other players' trains (M-2, M-11) in their paints, from the forecast poses in sync.players (M-65); half transparent when away
// (M-39, M-40). Drawn from the baked models through engine.assets with the engine paint (3l); the wheels do not turn here.
import * as THREE from 'three';
import { TP } from '../sim/tractor.js';
import { paintValues } from '../view/vehicles.js';

const AXES = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const own = obj => obj.traverse(m => { if (!m.isMesh) return; m.material = [].concat(m.material).map(x => { const c = x.clone(); c.userData.lhShared = false; return c; }); if (m.material.length === 1) m.material = m.material[0]; });
function ghost(obj, on) { obj.traverse(m => { if (!m.isMesh) return; m.castShadow = !on; for (const x of [].concat(m.material)) { x.transparent = on; x.opacity = on ? 0.45 : 1; x.depthWrite = !on; x.needsUpdate = true; } }); }
export function createOthers3D(scene, { assets, compiler }) {
  const views = new Map(); let stamp = 0;
  const make = () => {
    const tractor = new THREE.Group(), inner = assets.clone('tractor'); inner.quaternion.copy(AXES); tractor.add(inner); tractor.scale.setScalar(TP.scale);
    const cars = [0, 1].map(() => assets.clone('trailer'));
    for (const o of [tractor, ...cars]) scene.add(o);
    return { tractor, cars, body: '', trim: '', ghost: false, stamp };
  };
  const put = (o, p) => { o.position.set(p.p.x, p.p.y, p.p.z); o.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w); };
  return {
    // players: the view's Map from players.poseAt (#102), or null outside a room: n, pose, paint, away
    update(dt, players) {
      stamp++;
      if (players) for (const p of players.values()) {
        if (!p.pose) continue;
        let v = views.get(p.n); if (!v) views.set(p.n, v = make());
        v.stamp = stamp;
        if (p.paint.body !== v.body || p.paint.trim !== v.trim) { v.body = p.paint.body; v.trim = p.paint.trim; compiler.repaint(v.tractor, paintValues(p.paint)); }
        if (p.away !== v.ghost) { if (!v.owned) { for (const o of [v.tractor, ...v.cars]) own(o); v.owned = true; } v.ghost = p.away; for (const o of [v.tractor, ...v.cars]) ghost(o, p.away); }
        put(v.tractor, p.pose.tractor); put(v.cars[0], p.pose.cars[0]); put(v.cars[1], p.pose.cars[1]);
      }
      for (const [n, v] of views) if (v.stamp !== stamp) { for (const o of [v.tractor, ...v.cars]) scene.remove(o); views.delete(n); }
    },
    dispose() { for (const v of views.values()) for (const o of [v.tractor, ...v.cars]) scene.remove(o); views.clear(); },
  };
}
