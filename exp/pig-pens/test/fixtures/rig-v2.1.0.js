// The camera rig (lion-hawk 2e P6, #59): main.js's orbit camera, its framing by aspect, the drive chase and the
// view-only camera gestures, moved out of its closure. One per page (module level), like the renderer. The gesture
// listener only ever moves the camera: tools are `tool` commands from bindPointer on the same canvas (devices.js), and
// the two agree on the Hand's orbit through rig.orbiting (#52). Nothing here calls the sim.
import * as THREE from 'three';
import { ORBIT_PX } from '../../src/game/farm.js';

export const rig = {
  ready: false, camera: null, canvas: null,
  cam: { tx: 0, tz: 1, yaw: 0, pitch: 0.92, dist: 46 },
  chaseOff: 0, gesture: null,
  orbiting: false, // this pointer's Hand drag became a camera orbit (reset on every first-pointer down)
  pressAt: null,   // { x, y }: the client point of that down (the hold ring sits there)
};

const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), pv = new THREE.Vector3();

export function attach(camera, canvas) { rig.camera = camera; rig.canvas = canvas; applyCam(); rig.ready = true; }

// Start framing by aspect: on phones the long axis of the pens runs up the screen.
export function fitCam() {
  const c = rig.cam, a = rig.canvas.clientWidth / rig.canvas.clientHeight;
  c.yaw = a < 0.9 ? Math.PI / 2 : 0;
  c.dist = a < 0.9 ? 60 : 46; c.tx = a < 0.9 ? -3 : -1; c.tz = a < 0.9 ? -9 : -4;
}

export function applyCam() {
  const cam = rig.cam, camera = rig.camera;
  cam.pitch = Math.max(0.28, Math.min(1.48, cam.pitch)); cam.dist = Math.max(2.5, Math.min(80, cam.dist));
  cam.tx = Math.max(-34, Math.min(34, cam.tx)); cam.tz = Math.max(-30, Math.min(30, cam.tz));
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
  camera.lookAt(cam.tx, 0.5, cam.tz);
  camera.updateMatrixWorld(); // ray() and project() use the camera as drawn
}

export function panBy(dx, dy) {
  const cam = rig.cam, k = cam.dist * 0.0016;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  cam.tx -= (dx * rx - dy * fx / Math.max(0.5, Math.sin(cam.pitch))) * k; cam.tz -= (dx * rz - dy * fz / Math.max(0.5, Math.sin(cam.pitch))) * k;
}

// The camera ray through a client point: a fresh [ox, oy, oz, dx, dy, dz] per call (#72: the sim may keep it).
export function ray(cx, cy) {
  const r = rig.canvas.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, rig.camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  return [o.x, o.y, o.z, d.x, d.y, d.z];
}
// World → client px (the canvas' offset added): engine.view.project, for game.point/touch { world } targets [T-17].
export function project([x, y, z]) {
  const r = rig.canvas.getBoundingClientRect();
  pv.set(x, y, z).project(rig.camera);
  return { x: r.left + (pv.x + 1) / 2 * r.width, y: r.top + (1 - pv.y) / 2 * r.height };
}

// Chase camera while driving (main.js driveInput): sits behind the tractor, eases round as it turns; a drag offsets it
// and it recentres once let go; pitch 0.42, distance 9–22 m. dt 0 (hook renders) leaves it where it is.
export function chase(t, dt) {
  const cam = rig.cam;
  const want = t.yaw + Math.PI + rig.chaseOff; let d = want - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  cam.yaw += d * Math.min(1, dt * 2.5); if (!rig.gesture) rig.chaseOff *= Math.max(0, 1 - dt * 0.8);
  const lead = Math.max(-1, Math.min(3, t.fwd * 0.5));
  cam.tx += (t.x + Math.sin(t.yaw) * lead - cam.tx) * Math.min(1, dt * 5); cam.tz += (t.z + Math.cos(t.yaw) * lead - cam.tz) * Math.min(1, dt * 5);
  cam.pitch += (0.42 - cam.pitch) * Math.min(1, dt * 2); cam.dist += (Math.min(Math.max(cam.dist, 9), 22) - cam.dist) * Math.min(1, dt * 2);
}
// Getting out lifts the camera back over the farm.
export function afterDrive() { const cam = rig.cam; cam.pitch = Math.max(cam.pitch, 0.7); cam.dist = Math.max(cam.dist, 18); rig.chaseOff = 0; }

// main.js's pointer map and camera gestures, minus the tools: driving single pointer → chase; mouse right → orbit,
// middle → pan; a Hand pointer → orbit once it moves more than ORBIT_PX from its down point; two pointers → pinch,
// rotate and pan (driving: turn the chase offset); a lift back to one pointer → idle; wheel zoom; no context menu.
export function bindGestures(engine, canvas) {
  const pointers = new Map(), cam = rig.cam;
  const twoInfo = () => { const [a, b] = [...pointers.values()]; return { kind: 'two', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; };
  const onDown = e => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const x = e.clientX, y = e.clientY, btn = e.pointerType === 'mouse' ? e.button : 0, s = engine.scene.state;
      rig.orbiting = false; rig.pressAt = { x, y };
      if (s.driving) rig.gesture = { kind: 'chase', x, y };
      else if (btn === 2) rig.gesture = { kind: 'orbit', x, y };
      else if (btn === 1) rig.gesture = { kind: 'pan', x, y };
      else rig.gesture = s.tool === 'hand' ? { kind: 'hand', sx: x, sy: y } : { kind: 'tool' };
    } else if (pointers.size === 2) rig.gesture = twoInfo(); // bindPointer cancels the tool gesture itself
  };
  const onMove = e => {
    if (!pointers.has(e.pointerId)) return;
    const x = e.clientX, y = e.clientY, g = rig.gesture; pointers.set(e.pointerId, { x, y });
    if (pointers.size === 2 && g?.kind === 'two') {
      const n = twoInfo();
      cam.dist *= g.d / Math.max(10, n.d);
      let da = n.ang - g.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (engine.scene.state.driving) rig.chaseOff += da; else { cam.yaw += da; panBy(n.cx - g.cx, n.cy - g.cy); }
      rig.gesture = n;
    } else if (pointers.size === 1 && g) {
      if (g.kind === 'hand' && engine.scene.state.driving) { rig.gesture = null; return; } // a Hand gesture begun before the drive must not orbit it
      if (g.kind === 'chase') { rig.chaseOff -= (x - g.x) * 0.006; cam.pitch += (y - g.y) * 0.004; g.x = x; g.y = y; }
      else if (g.kind === 'orbit') { cam.yaw -= (x - g.x) * 0.006; cam.pitch += (y - g.y) * 0.005; g.x = x; g.y = y; }
      else if (g.kind === 'pan') { panBy(x - g.x, y - g.y); g.x = x; g.y = y; }
      else if (g.kind === 'hand' && Math.hypot(x - g.sx, y - g.sy) > ORBIT_PX) { rig.orbiting = true; rig.gesture = { kind: 'orbit', x, y }; } // the Hand drags the view
    }
  };
  const onEnd = e => {
    if (!pointers.delete(e.pointerId)) return;
    rig.gesture = pointers.size === 0 ? null : { kind: 'idle' };
  };
  const onWheel = e => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); };
  const onMenu = e => e.preventDefault();
  canvas.addEventListener('contextmenu', onMenu); canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onEnd); canvas.addEventListener('pointercancel', onEnd); canvas.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    canvas.removeEventListener('contextmenu', onMenu); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onEnd); canvas.removeEventListener('pointercancel', onEnd); canvas.removeEventListener('wheel', onWheel);
    pointers.clear(); rig.gesture = null;
  };
}
