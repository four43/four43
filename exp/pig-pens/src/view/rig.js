// The camera rig (lion-hawk 2e P6, #59; on the engine's createOrbitRig since phase 3k, 3g C9): Pig Pens' target, bounds and
// framing are options; the pose, clamps, drive chase, release, ray and camera gestures are the engine's. One per page (module
// level), like the renderer. The gesture device only moves the camera: tools are `tool` commands from bindPointer on the
// same canvas (devices.js), and the two agree on the Hand's orbit through rig.orbit.orbiting (#52). Nothing here calls the sim.
import { createOrbitRig, makeProject } from 'lion-hawk/view';
import { ORBIT_PX } from '../game/farm.js';

// 2.1.0's rig.js values; min 2.5, max 80, pitch 0.28..1.48, ground 0 and the chase tuning are the rig's defaults
export const ORBIT = {
  target: { x: 0, y: 0.5, z: 1 }, distance: 46, pitch: 0.92, bounds: { x: [-34, 34], z: [-30, 30] },
  fit: { portrait: { yaw: Math.PI / 2, dist: 60, tx: -3, tz: -9 }, landscape: { yaw: 0, dist: 46, tx: -1, tz: -4 } },
};
export const rig = { orbit: null, project: null, camera: null, canvas: null, downTool: 'hand', downDriving: false, pressAt: null };

// the one-finger drag: driving turns the chase, a Hand drag orbits past ORBIT_PX, other tools leave the camera alone; a finger
// that went down before a drive began (the Hand press that became the drive) moves nothing, as 2.1.0's bindGestures
export const cameraMode = (s, downTool, downDriving = s.driving) => s.driving ? (downDriving ? 'chase' : 'none') : downTool === 'hand' ? 'orbit' : 'none';

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
  const dev = rig.orbit.bindGesture(engine, canvas, { mode: () => cameraMode(engine.scene.state, rig.downTool, rig.downDriving), tapMove: ORBIT_PX });
  return () => dev.dispose();
}
