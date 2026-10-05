// High chase camera (V-1..V-3). It looks along the direction of travel in a slide,
// and along the nose when slow or reversing.
import * as THREE from 'three';
// ~40 degrees down from camera to look-at target: atan((H - 0.8) / (D + AHEAD)). Mutable so ?tune can adjust.
export const CAM = { D: 12, H: 16, AHEAD: 6 };
const LAG = 3;
export function createChaseCam(camera) {
  let yaw = null, shakeT = 0, shakeA = 0; const tgt = new THREE.Vector3(), pos = new THREE.Vector3();
  return {
    shake(a) { shakeA = Math.max(shakeA, a); shakeT = 0.25; },
    update(dt, s) {
      const want = s.fwd > 2 ? s.velYaw : s.yaw;
      if (yaw === null) yaw = want;
      let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * LAG);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      tgt.set(s.x + fx * CAM.AHEAD, s.y + 0.8, s.z + fz * CAM.AHEAD);
      pos.set(s.x - fx * CAM.D, s.y + CAM.H, s.z - fz * CAM.D);
      if (shakeT > 0) { shakeT -= dt; const k = shakeA * (shakeT / 0.25); pos.x += (Math.random() - 0.5) * k; pos.y += (Math.random() - 0.5) * k; } else shakeA = 0;
      camera.position.lerp(pos, Math.min(1, dt * 6)); camera.lookAt(tgt);
    },
  };
}
