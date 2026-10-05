import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
await RAPIER.init();
const sim = createSim(RAPIER, { pigs: 48, seed: 2 });
const T = sim.tractor;
for (let s = 0; s < 120; s++) sim.step();
const p0 = [T.x, T.z, T.yaw];
console.log('settled y', T.body.translation().y.toFixed(2), 'contacts', [0,1,2,3].map(i => T.vc.wheelIsInContact(i)).join(','), 'susp', [0,1,2,3].map(i => T.vc.wheelSuspensionLength(i).toFixed(2)).join(','));
T.driven = true; T.setInput(1, 0);
for (let s = 0; s < 60 * 4; s++) sim.step();
const dx = T.x - p0[0], dz = T.z - p0[1];
console.log('full throttle 4s: speed', T.speed.toFixed(2), 'fwd', T.fwd.toFixed(2), 'moved', Math.hypot(dx, dz).toFixed(1), 'along heading', ((dx * Math.sin(p0[2]) + dz * Math.cos(p0[2]))).toFixed(1));
T.setInput(1, 1); const y0 = T.yaw;
for (let s = 0; s < 60 * 2; s++) sim.step();
let dy = T.yaw - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
console.log('steer +1 for 2s: yaw change', dy.toFixed(2), '(positive = left/anticlockwise from above)');
T.setInput(-1, 0); let stopT = 0;
for (let s = 0; s < 60 * 4; s++) { sim.step(); if (!stopT && T.fwd < 0.1) stopT = s / 60; }
console.log('brake from', '->', 'stopped after', stopT.toFixed(2), 's; then reversing fwd', T.fwd.toFixed(2));
T.setInput(0, 0); for (let s = 0; s < 120; s++) sim.step();
T.driven = false; for (let s = 0; s < 120; s++) sim.step();
console.log('parked speed', T.speed.toFixed(3), 'upright', (1 - 2 * (T.body.rotation().x ** 2 + T.body.rotation().z ** 2)).toFixed(3));
// line up 10 m outside the east double gate, facing west, and drive straight through
const g = sim.lay.gates.find(g => g.width > 4 && g.x > 0);
const yawC = -Math.PI / 2 - Math.PI / 2; // world yaw -pi/2 (facing -x); chassis frame is rotated by -pi/2
T.body.setTranslation({ x: g.x + 10, y: 0.3, z: g.z + 0.3 }, true); T.body.setRotation({ x: 0, y: Math.sin(yawC / 2), z: 0, w: Math.cos(yawC / 2) }, true);
T.body.setLinvel({ x: 0, y: 0, z: 0 }, true); T.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
for (let s = 0; s < 60; s++) sim.step();
T.driven = true; let inLane = false, maxTilt = 0;
for (let s = 0; s < 60 * 8; s++) {
  let e = -Math.PI / 2 - T.yaw; e = Math.atan2(Math.sin(e), Math.cos(e)); T.setInput(0.5, Math.max(-1, Math.min(1, e * 3 + (g.z - T.z) * 0.3 * 0)));
  sim.step(); if (T.x < g.x - 3) inLane = true;
  const q = T.body.rotation(); maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z))));
}
console.log('straight through east gate: in lane', inLane, 'x', T.x.toFixed(1), 'z', T.z.toFixed(1), 'max tilt deg', (maxTilt * 57.3).toFixed(1));
// close the gate and try again: it must block
T.setInput(0, 0); T.driven = false; for (let s = 0; s < 60; s++) sim.step();
T.body.setTranslation({ x: g.x + 10, y: 0.3, z: g.z }, true); T.body.setRotation({ x: 0, y: Math.sin(yawC / 2), z: 0, w: Math.cos(yawC / 2) }, true);
T.body.setLinvel({ x: 0, y: 0, z: 0 }, true); T.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
sim.setGate(g.id, false); for (let s = 0; s < 60; s++) sim.step();
T.driven = true; let minX = 99;
for (let s = 0; s < 60 * 8; s++) { T.setInput(0.6, 0); sim.step(); minX = Math.min(minX, T.x); }
console.log('closed gate: tractor min x', minX.toFixed(2), '(gate line at', g.x, ') blocked', minX > g.x);
