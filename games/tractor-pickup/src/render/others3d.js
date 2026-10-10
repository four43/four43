// The other players' trains (M-2, M-11) in their paints and dirt (M-68), from the forecast poses in sync.players (M-65); half transparent when away (M-39, M-40).
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
  const views = new Map(); let stamp = 0; // allocation free per frame: a view not stamped this update belongs to a player who is gone
  return {
    update(dt, players) {
      stamp++;
      if (players) for (const p of players.map.values()) {
        if (!p.pose) continue;
        let v = views.get(p.n);
        if (!v) { const s = stub(); v = { s, veh: createVehicles3D(scene, s.tractor, s.train, { wheelShadows: false }), body: '', trim: '', ghost: false, stamp, snap: { tractor: snapObj(), cars: [snapObj(), snapObj()], dirt: 0 } }; views.set(p.n, v); }
        v.stamp = stamp;
        if (p.paint.body !== v.body || p.paint.trim !== v.trim) { v.body = p.paint.body; v.trim = p.paint.trim; v.veh.setPaint(p.paint); }
        if (p.away !== v.ghost) { v.ghost = p.away; v.veh.setGhost(p.away); }
        if (!p.away) v.s.wheel.rot += p.ahead * dt; // backward when it reverses (M-66)
        toSnap(p.pose.tractor, v.snap.tractor); toSnap(p.pose.cars[0], v.snap.cars[0]); toSnap(p.pose.cars[1], v.snap.cars[1]);
        v.snap.dirt = p.dirt[0]; v.s.train.cars[0].dirt = p.dirt[1]; v.s.train.cars[1].dirt = p.dirt[2]; // M-68: as dirty as on its own device
        v.veh.update(v.snap);
      }
      for (const [n, v] of views) if (v.stamp !== stamp) { v.veh.dispose(); views.delete(n); }
    },
    dispose() { for (const v of views.values()) v.veh.dispose(); views.clear(); },
  };
}
