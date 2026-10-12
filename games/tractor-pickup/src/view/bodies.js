// Body interpolation (lion-hawk 2g G1, [R-3], [E-11] until the phase 4 World): main.js's two snapshot sets of the tractor and
// car bodies, refreshed after every step by an engine.onStep listener and drawn lerp(prev, curr, alpha). Allocation-free per
// step and frame (B-6): the sets swap places and are written in place; only rebind (a new farm) allocates.
import * as THREE from 'three';

const snapOf = b => ({ p: new THREE.Vector3().copy(b.translation()), q: new THREE.Quaternion().copy(b.rotation()) });
const snapInto = (b, s) => { const t = b.translation(), q = b.rotation(); s.p.set(t.x, t.y, t.z); s.q.set(q.x, q.y, q.z, q.w); };
function lerpSnap(a, b, t, out) { out.p.lerpVectors(a.p, b.p, t); out.q.slerpQuaternions(a.q, b.q, t); return out; }

export function createBodies() {
  let game = null, list = [], prev = [], curr = [];
  const bodies = {
    view: [], // [tractor, ...cars]: { p, q } at the last alpha
    cars: [], // view without the tractor (vehicles3d, animals3d)
    // the bodies of this game; prev = curr = now, so the first frame draws them where they stand
    rebind(g) {
      game = g; list = [g.tractor.body, ...g.train.cars.map(c => c.body)];
      prev = list.map(snapOf); curr = list.map(snapOf); bodies.view = prev.map(s => ({ p: s.p.clone(), q: s.q.clone() })); bodies.cars = bodies.view.slice(1);
      return bodies;
    },
    // after every step: the main scene's game is still the bound one (a load's build freed the old bodies; built rebinds first)
    watch(engine) {
      return engine.onStep(e => {
        if (!game || e.scene.state?.game !== game) return;
        const old = prev; prev = curr; curr = old; // the two sets swap places: nothing is allocated per step
        for (let i = 0; i < list.length; i++) snapInto(list[i], curr[i]);
      });
    },
    alpha(a) { const v = bodies.view; for (let i = 0; i < v.length; i++) lerpSnap(prev[i], curr[i], a, v[i]); },
  };
  return bodies;
}
