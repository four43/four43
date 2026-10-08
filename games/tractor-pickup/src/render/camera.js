// High chase camera (V-1..V-3). It looks along the direction of travel in a slide,
// and along the nose when slow or reversing.
import * as THREE from 'three';
// Low chase cam, ~22 degrees down to a look-at point far ahead: atan((H - 0.8) / (D + AHEAD)). Mutable so ?tune can adjust.
export const CAM = { D: 12, H: 10.2, AHEAD: 11, portrait: 1.25 }; // X-12: in portrait the camera is this much farther back and higher
const LAG = 3;
export function createChaseCam(camera) {
  let yaw = null, shakeT = 0, shakeA = 0; const tgt = new THREE.Vector3(), pos = new THREE.Vector3();
  return {
    get yaw() { return yaw; }, // the view heading the stick is read against (C-2); null before the first update
    shake(a) { shakeA = Math.max(shakeA, a); shakeT = 0.25; },
    update(dt, s) {
      const want = s.fwd > 2 ? s.velYaw : s.yaw;
      if (yaw === null) yaw = want;
      let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * LAG);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      tgt.set(s.x + fx * CAM.AHEAD, s.y + 0.8, s.z + fz * CAM.AHEAD);
      const k = camera.aspect < 0.9 ? CAM.portrait : 1;
      pos.set(s.x - fx * CAM.D * k, s.y + CAM.H * k, s.z - fz * CAM.D * k);
      if (shakeT > 0) { shakeT -= dt; const k = shakeA * (shakeT / 0.25); pos.x += (Math.random() - 0.5) * k; pos.y += (Math.random() - 0.5) * k; } else shakeA = 0;
      camera.position.lerp(pos, Math.min(1, dt * 6)); camera.lookAt(tgt);
    },
  };
}
