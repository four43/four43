// The other players' trains (M-2, M-11) in their paints, from the interpolated poses in sync.players; half transparent when away (M-39, M-40).
// Wheels have no physics here: they turn with the distance driven and sit at the rest length.
import * as THREE from 'three';
import { createVehicles3D } from './vehicles3d.js';
import { TP, TRACTOR_WHEELS } from '../sim/tractor.js';
import { TR } from '../sim/hitch.js';

function stub() { // looks like a sim tractor and train to vehicles3d
  const wheel = { rot: 0 }, car = () => ({ dirt: 0, vc: { wheelSuspensionLength: () => TR.suspRest, wheelRotation: () => wheel.rot / TR.wheelR * 0.8 } });
  return { wheel, tractor: { W: TRACTOR_WHEELS.map(w => ({ ...w })), vc: { wheelSuspensionLength: () => TP.suspRest, wheelRotation: i => wheel.rot / TRACTOR_WHEELS[i].radius, wheelSteering: () => 0 } }, train: { cars: [car(), car()] } };
}
const toSnap = (src, dst) => { dst.p.set(src.p.x, src.p.y, src.p.z); dst.q.set(src.q.x, src.q.y, src.q.z, src.q.w); return dst; };
const snapObj = () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() });
export function createOthers3D(scene) {
  const views = new Map();
  return {
    update(dt, players) {
      const live = new Set(players ? players.list().filter(p => p.pose).map(p => p.n) : []);
      for (const [n, v] of views) if (!live.has(n)) { v.veh.dispose(); views.delete(n); }
      if (!players) return;
      for (const p of players.list()) {
        if (!p.pose) continue;
        let v = views.get(p.n);
        if (!v) { const s = stub(); v = { s, veh: createVehicles3D(scene, s.tractor, s.train), paint: '', ghost: false, snap: { tractor: snapObj(), cars: [snapObj(), snapObj()], dirt: 0 } }; views.set(p.n, v); }
        const key = p.paint.body + '/' + p.paint.trim; if (key !== v.paint) { v.paint = key; v.veh.setPaint(p.paint); }
        if (p.away !== v.ghost) { v.ghost = p.away; v.veh.setGhost(p.away); }
        if (!p.away) v.s.wheel.rot += p.speed * dt;
        toSnap(p.pose.tractor, v.snap.tractor); toSnap(p.pose.cars[0], v.snap.cars[0]); toSnap(p.pose.cars[1], v.snap.cars[1]);
        v.veh.update(v.snap);
      }
    },
    dispose() { for (const v of views.values()) v.veh.dispose(); views.clear(); },
  };
}
