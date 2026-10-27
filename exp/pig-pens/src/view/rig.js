// The camera rig (lion-hawk 2e P6, #59; on the engine's createOrbitRig since phase 3k, 3g C9): Pig Pens' target, bounds and
// framing are options; the pose, clamps, ray and camera gestures are the engine's. One per page (module
// level), like the renderer. The gesture device only moves the camera: tools are `tool` commands from bindPointer on the
// same canvas (devices.js), and the two agree on the Hand's orbit through rig.orbit.orbiting (#52). Nothing here calls the sim.
import { createOrbitRig, makeProject } from 'lion-hawk/view';
import { ORBIT_PX } from '../game/farm.js';
import { BUILDINGS, CLINIC } from '../defs/buildings.js';

// 2.1.0's rig.js values; min 2.5, max 80, pitch 0.28..1.48 and ground 0 are the rig's defaults
export const ORBIT = {
  target: { x: 0, y: 0.5, z: 1 }, distance: 46, pitch: 0.92, bounds: { x: [-34, 34], z: [-30, 30] },
  fit: { portrait: { yaw: Math.PI / 2, dist: 60, tx: -3, tz: -9 }, landscape: { yaw: 0, dist: 46, tx: -1, tz: -4 } },
};
export const rig = { orbit: null, project: null, camera: null, canvas: null, downTool: 'hand', locked: false }; // locked: the exam room's fixed close-up

// the one-finger drag: a Hand drag orbits past ORBIT_PX, other tools leave the camera alone
export const cameraMode = downTool => downTool === 'hand' && !rig.locked ? 'orbit' : 'none';

// framed by the canvas aspect, as 2.1.0's fitCam (on phones the long axis of the pens runs up the screen)
export function createRig(camera, canvas) {
  const o = createOrbitRig(camera, { ...ORBIT, bounds: { ...ORBIT.bounds }, canvas });
  o.fit(canvas.clientWidth / canvas.clientHeight); return o;
}
// once per page: the first scene entry frames by aspect, later ones keep the pose (2.1.0's rig.ready)
export function attach(camera, canvas) {
  if (!rig.orbit) Object.assign(rig, { orbit: createRig(camera, canvas), project: makeProject(camera, canvas), camera, canvas });
  rig.orbit.update(); return rig.orbit;
}
// the camera gestures (#59); rig.orbit.update drives them, so they are not boot devices
export function bindCamera(engine, canvas) {
  const dev = rig.orbit.bindGesture(engine, canvas, { mode: () => cameraMode(rig.downTool), tapMove: ORBIT_PX });
  return () => dev.dispose();
}

// Going inside (v3 §5.3): with a building in focus the camera eases to look down into it from the front, sized so the whole
// building fits the screen, and stays clamped round it; leaving eases back to the pose the farm had. Reads the focus, never
// writes it. followFocus(focus, dt) runs every drawn frame before rig.orbit.update.
export const FOCUS = { pitch: 0.95, margin: 1.2, ease: 3.2, minK: 0.45, maxK: 1.6, give: 4 }; // give: s before an ease that can't land lets go
const focusRig = { id: null, saved: null, goal: null }; // saved: the farm's pose and limits, kept until the camera is back there
export function focusFrame(id, camera) {
  if (id === 'clinic.exam') { // the exam close-up (v3 §5.3): east of the table, looking west at it and the pegboard
    const V = CLINIC.examView, B = CLINIC, R = CLINIC.examRoom;
    return { tx: B.x + V.target[0], ty: V.target[1], tz: B.z + V.target[2], yaw: V.yaw, pitch: V.pitch, dist: V.dist * Math.max(1, 1.3 / camera.aspect),
      B: { x: B.x + (R.x0 + R.x1) / 2, z: B.z + (R.z0 + R.z1) / 2 }, w: R.x1 - R.x0, d: R.z1 - R.z0 };
  }
  const B = BUILDINGS[id], w = B.w ?? B.hx * 2, d = B.d ?? B.hz * 2, vf = camera.fov * Math.PI / 180;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const dist = Math.max((w / 2 + FOCUS.margin) / Math.tan(hf / 2), (d / 2 + FOCUS.margin) * Math.sin(FOCUS.pitch) / Math.tan(vf / 2) + d / 2);
  return { tx: B.x, ty: 0.5, tz: B.z + 0.4, yaw: 0, pitch: FOCUS.pitch, dist, B, w, d };
}
export function followFocus(focus, dt) {
  const o = rig.orbit; if (!o) return;
  const id = focus ?? null, st = o.state, L = o.limits;
  if (id !== focusRig.id) {
    // the farm's pose, saved on the way in, unless the camera is still on its way back to it (a roof tapped mid-way out)
    if (id && !focusRig.id && !focusRig.saved) focusRig.saved = { pose: { tx: st.tx, ty: st.ty, tz: st.tz, yaw: st.yaw, pitch: st.pitch, dist: st.dist }, limits: { ...L, bounds: L.bounds && { ...L.bounds } } };
    focusRig.id = id;
    if (id) {
      const f = focusFrame(id, rig.camera);
      focusRig.goal = f; focusRig.t = 0;
      Object.assign(L, { min: f.dist * FOCUS.minK, max: f.dist * FOCUS.maxK, pitchMin: 0.55,
        bounds: { x: [f.B.x - f.w / 2, f.B.x + f.w / 2], z: [f.B.z - f.d / 2, f.B.z + f.d / 2 + 1.5] } });
    } else if (focusRig.saved) {
      focusRig.goal = focusRig.saved.pose; focusRig.t = 0; Object.assign(L, focusRig.saved.limits, { bounds: focusRig.saved.limits.bounds && { ...focusRig.saved.limits.bounds } });
    }
  }
  const g = focusRig.goal; if (!g) return;
  const k = Math.min(1, dt * FOCUS.ease); focusRig.t += dt;
  let dy = g.yaw - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  st.tx += (g.tx - st.tx) * k; st.ty += (g.ty - st.ty) * k; st.tz += (g.tz - st.tz) * k;
  st.yaw += dy * k; st.pitch += (g.pitch - st.pitch) * k; st.dist += (g.dist - st.dist) * k;
  const there = Math.abs(dy) < 1e-3 && Math.abs(g.dist - st.dist) < 0.02 && Math.hypot(g.tx - st.tx, g.tz - st.tz) < 0.02;
  if (there || focusRig.t > FOCUS.give) { // arrived (or as near as the clamps allow): the gestures own it again
    focusRig.goal = null; if (!focusRig.id) focusRig.saved = null;
  }
}
