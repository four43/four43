// The camera rig (lion-hawk 2g G1): render/camera.js's chase cam, main.js's toNdc and the F-10 blend back from the show camera,
// one per page (module level, like the renderer). rig.yaw is the heading the stick is read against (C-2, #81): the chase
// cam's, or before its first update the tractor's (main.js `chase.yaw ?? t.yaw`). Nothing here writes the sim.
import * as THREE from 'three';
import { createChaseCam } from '../render/camera.js';

const _v = new THREE.Vector3(), _ndc = { nx: 0, ny: 0, nz: 0, behind: false }, showQuat = new THREE.Quaternion(), chaseQuat = new THREE.Quaternion();
let blend = 1; // F-10: 0..1 from the show camera's turn back to the chase cam

export const rig = {
  camera: null, canvas: null, chase: null, tractor: null,
  get yaw() { return rig.chase?.yaw ?? rig.tractor?.yaw ?? 0; },
  // a fresh chase cam per farm (main.js build); tractor: the sim tractor whose yaw stands in before the first follow
  attach(camera, { canvas, tractor }) { rig.camera = camera; rig.canvas = canvas; rig.tractor = tractor; rig.chase = createChaseCam(camera); blend = 1; },
  // s: { x, y, z, yaw, fwd, speed, velYaw } (reused by the caller); dt 1 puts the camera straight behind (a new farm)
  follow(dt, s) {
    rig.chase.update(dt, s);
    if (blend < 1) { blend = Math.min(1, blend + dt); const k = blend * blend * (3 - 2 * blend); chaseQuat.copy(rig.camera.quaternion); rig.camera.quaternion.slerpQuaternions(showQuat, chaseQuat, k); } // F-10: turn back smoothly
  },
  shake(a) { rig.chase?.shake(a); },
  blendFrom(q) { showQuat.copy(q); blend = 0; }, // F-10: the show's last camera turn, eased out over 1 s
  // M-77: the point on the screen, -1..1 each way, its NDC depth, and whether it is behind the camera (one reused object)
  toNdc(x, y, z) {
    const c = rig.camera; c.updateMatrixWorld();
    _ndc.behind = _v.set(x, y, z).applyMatrix4(c.matrixWorldInverse).z > 0;
    _v.set(x, y, z).project(c); _ndc.nx = _v.x; _ndc.ny = _v.y; _ndc.nz = _v.z; return _ndc;
  },
  // World → client px (the canvas' offset added): engine.view.project for game.point/touch { world } targets [T-17], with
  // z the NDC depth and onScreen false behind the camera or outside the viewport (#73). A fresh object per call.
  project([x, y, z]) {
    const r = rig.canvas.getBoundingClientRect(), s = rig.toNdc(x, y, z);
    return { x: r.left + (s.nx + 1) / 2 * r.width, y: r.top + (1 - s.ny) / 2 * r.height, z: s.nz, onScreen: !s.behind && Math.abs(s.nx) <= 1 && Math.abs(s.ny) <= 1 };
  },
};
