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
  fit: { portrait: { yaw: 0, dist: 80, tx: 1, tz: -6 }, landscape: { yaw: 0, dist: 46, tx: -1, tz: -4 } },
};
export const rig = { orbit: null, project: null, camera: null, canvas: null, downTool: 'hand', locked: false }; // locked: the exam room's fixed close-up

// the one-finger drag: a Hand drag orbits past ORBIT_PX, other tools leave the camera alone
export const cameraMode = downTool => downTool === 'hand' && !rig.locked ? 'orbit' : 'none';

// framed by the canvas aspect, as 2.1.0's fitCam
// 2.12.0: everywhere but the exam close-up the camera looks north at the buildings at ORBIT.pitch, so a small child can't
// tip it or turn it round and get lost. The engine's orbit drag (one finger with the Hand, a mouse right-drag) pans the
// ground under the finger instead (its turn and tilt read back as the screen move they came from); a pinch's turn is
// dropped. A flight eases its own way between the poses (the exam close-up looks west).
export const FACE = { yaw: 0, orbit: { yaw: 0.006, pitch: 0.005 } }; // orbit: the engine's radians per px of an orbit drag
export function createRig(camera, canvas) {
  const o = createOrbitRig(camera, { ...ORBIT, bounds: { ...ORBIT.bounds }, canvas }), apply = o.apply;
  o.apply = () => {
    const st = o.state;
    if (!rig.locked && !flight.goal) {
      const dyaw = st.yaw - FACE.yaw, dpitch = st.pitch - ORBIT.pitch;
      st.yaw = FACE.yaw; st.pitch = ORBIT.pitch;
      if (o.gesture === 'orbit') o.panBy(-dyaw / FACE.orbit.yaw, dpitch / FACE.orbit.pitch);
    }
    apply();
  };
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
  const onWheel = () => { if (!flight.exam) flight.goal = null; }; // the wheel stops a flight, as a drag or pinch does (followFocus)
  canvas.addEventListener('wheel', onWheel, { passive: true });
  return () => { canvas.removeEventListener('wheel', onWheel); dev.dispose(); };
}

// Going inside (v3 §5.3; 2.10.0: by the camera). A roof tap or Outside only starts a flight (rig.fly): the camera eases to
// look down into the building from the front, sized so it fits the screen, or back to the farm's pose; any drag, pinch or
// wheel stops it there. The building is in focus while the camera is near it (nearFocus, which the view sends as the
// sim's `focus` command), so its roof lifts on the way in and comes back on the way out, flown or zoomed by hand. The exam
// room is the one place the sim puts the camera: its close-up holds while it is in focus. Reads the focus, never writes it.
// ROOF: in when the camera's target is over the building and nearer than `in` × its framing distance; out past `out` ×
// (or once the target is `off` m past its walls), so the roof never flickers at the edge
export const FOCUS = { pitch: ORBIT.pitch, margin: 1.2, ease: 3.2, minK: 0.45, maxK: 1.6, give: 4 }; // give: s before an ease that can't land lets go
export const ROOF = { in: 1.3, out: 1.8, off: 1.5 };
const flight = { goal: null, t: 0, saved: null, exam: null }; // saved: the farm's pose from before the first flight in; exam: the limits it replaced
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
const pose = st => ({ tx: st.tx, ty: st.ty, tz: st.tz, yaw: st.yaw, pitch: st.pitch, dist: st.dist });
// Start the camera toward a building (an id) or back out (null): to the pose it had before it first flew in, else the
// farm's framing for the screen's shape
export function fly(id, focus = null) {
  const o = rig.orbit; if (!o) return;
  if (id) { if (!focus && !flight.saved) flight.saved = pose(o.state); flight.goal = focusFrame(id, rig.camera); }
  else { const F = rig.camera.aspect < 0.9 ? ORBIT.fit.portrait : ORBIT.fit.landscape; flight.goal = flight.saved ?? { ty: ORBIT.target.y, pitch: ORBIT.pitch, ...F }; flight.saved = null; }
  flight.t = 0;
}
export const flying = () => !!flight.goal;
// The building the camera is near, given the one in focus (null: outside); the exam room keeps its focus
export function nearFocus(focus) {
  const o = rig.orbit; if (!o || focus === 'clinic.exam') return focus;
  const st = o.state, over = (B, m) => { const hw = (B.w ?? B.hx * 2) / 2 + m, hd = (B.d ?? B.hz * 2) / 2 + m; return Math.abs(st.tx - B.x) < hw && Math.abs(st.tz - B.z) < hd; };
  if (focus && BUILDINGS[focus]) {
    if (over(BUILDINGS[focus], ROOF.off) && st.dist < focusFrame(focus, rig.camera).dist * ROOF.out) return focus;
    focus = null;
  }
  for (const id in BUILDINGS) if (over(BUILDINGS[id], 0) && st.dist < focusFrame(id, rig.camera).dist * ROOF.in) return id;
  return null;
}
// every drawn frame before rig.orbit.update: the exam room's close-up while it is in focus, else the flight, if any
export function followFocus(focus, dt) {
  const o = rig.orbit; if (!o) return;
  const st = o.state, L = o.limits, exam = focus === 'clinic.exam';
  if (exam && !flight.exam) { // the close-up, clamped round the exam room
    const f = focusFrame(focus, rig.camera);
    flight.exam = { ...L, bounds: L.bounds && { ...L.bounds } }; flight.goal = f; flight.t = 0;
    Object.assign(L, { min: f.dist * FOCUS.minK, max: f.dist * FOCUS.maxK, pitchMin: 0.55, bounds: { x: [f.B.x - f.w / 2, f.B.x + f.w / 2], z: [f.B.z - f.d / 2, f.B.z + f.d / 2 + 1.5] } });
  } else if (!exam && flight.exam) { // out of the close-up: back over the clinic
    Object.assign(L, flight.exam); flight.exam = null; flight.goal = focusFrame('clinic', rig.camera); flight.t = 0;
  }
  const g = flight.goal; if (!g) return;
  if (o.gesture && !exam) { flight.goal = null; return; } // a drag or pinch takes the camera back (the wheel: bindCamera)
  const k = Math.min(1, dt * FOCUS.ease); flight.t += dt;
  let dy = g.yaw - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  st.tx += (g.tx - st.tx) * k; st.ty += (g.ty - st.ty) * k; st.tz += (g.tz - st.tz) * k;
  st.yaw += dy * k; st.pitch += (g.pitch - st.pitch) * k; st.dist += (g.dist - st.dist) * k;
  const there = Math.abs(dy) < 1e-3 && Math.abs(g.dist - st.dist) < 0.02 && Math.hypot(g.tx - st.tx, g.tz - st.tz) < 0.02;
  if (there || flight.t > FOCUS.give) flight.goal = null; // arrived (or as near as the clamps allow): the gestures own it again
}
// ?debug=roofs: the in and out distances on sliders (lion-hawk 0.16.0 D-9)
export const roofPanel = {
  id: 'roofs', title: 'Roofs', width: 260, height: 200,
  mount(el, ui) {
    ui.slider('in (× framing)', ROOF, 'in', { min: 1, max: 3, step: 0.05 });
    ui.slider('out (× framing)', ROOF, 'out', { min: 1, max: 4, step: 0.05 });
    ui.slider('off the walls (m)', ROOF, 'off', { min: 0, max: 6, step: 0.25 });
    ui.value('flying', () => (flight.goal ? 'yes' : 'no'));
  },
};
