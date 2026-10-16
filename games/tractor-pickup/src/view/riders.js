// Other players' carried riders in this view (lion-hawk 3l; #102 kept: read-only). A remote train entity carries its owner's riders
// (e.riders, from the record). A slot rider sits where its owner placed it in that car, re-expressed in the car as this view draws it;
// a rider in flight is interpolated between its last two records by record time (a visual that never collides: D8's job here).
import * as THREE from 'three';
const local = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
export function createRiderPoses() {
  const pool = new Map(), last = new Map(); // id → pose copy; id → { t0, a: {x,y,z,yaw}, t1, b }
  return {
    update(world, sync, nowMs, out) {
      out.clear();
      for (const e of world.with('net')) {
        if (e.net !== 'train' || !e.remote || e.netId === world.net.self || !e.riders) continue;
        const rec = e.rec;
        for (const c of e.riders) {
          let p = pool.get(c.id); if (!p) pool.set(c.id, p = { id: c.id });
          if (c.flying) { let L = last.get(c.id); if (!L) last.set(c.id, L = { seq: -1, t0: nowMs, t1: nowMs, a: { ...c }, b: { ...c } });
            if (L.seq !== e.recSeq) { L.seq = e.recSeq; Object.assign(L.a, L.b); Object.assign(L.b, c); L.t0 = L.t1; L.t1 = nowMs; }
            const k = Math.min(1, (nowMs - L.t1) / Math.max(1, L.t1 - L.t0)); p.x = L.a.x + (L.b.x - L.a.x) * k; p.y = L.a.y + (L.b.y - L.a.y) * k; p.z = L.a.z + (L.b.z - L.a.z) * k; p.yaw = c.yaw; p.riding = false; }
          else { const k = c.slot >= 6 ? 1 : 0, at = k ? rec.wagon : rec.trailer, car = sync.objectOf(k ? e.wagon : e.trailer); if (!car) continue;
            local.set(c.x - at.p.x, c.y - at.p.y, c.z - at.p.z).applyQuaternion(qa.set(at.q.x, at.q.y, at.q.z, at.q.w).invert()).applyQuaternion(qb.copy(car.quaternion)).add(car.position);
            p.x = local.x; p.y = local.y; p.z = local.z; p.yaw = Math.atan2(1 - 2 * (car.quaternion.y ** 2 + car.quaternion.z ** 2), 2 * (car.quaternion.x * car.quaternion.z - car.quaternion.w * car.quaternion.y)); p.riding = true; }
          p.hat = c.hat === 'none' ? null : c.hat; p.anim = c.flying ? 'run' : 'idle'; p.state = 'carried'; p.ride = null; p.hidden = false;
          out.set(c.id, p);
        }
      }
      return out;
    },
  };
}
