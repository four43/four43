// M-10: where player n's train starts. Player 1 (the host, or anyone alone) at the farm start; the others ahead of it along its heading,
// SPAWN_GAP apart (a train is about 10 m long), stepping 8 m sideways when that spot is blocked. Pure: farm data only.
import { YARD_HALF, inWash } from './track.js';
export const SPAWN_GAP = 12;
const BACK = [0, 3.6, 6.7]; // the tractor and the two cars behind it
function clear(farm, x, z, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), y = farm.yard;
  return BACK.every(b => { const px = x - fx * b, pz = z - fz * b;
    return Math.abs(px) < YARD_HALF - 4 && Math.abs(pz) < YARD_HALF - 4 && !inWash(y, px, pz) && Math.hypot(px - y.pond.x, pz - y.pond.z) > y.pond.r + 2
      && y.obstacles.every(o => Math.hypot(px - o.x, pz - o.z) > o.r + 2); });
}
export function spawnPoint(farm, n) {
  const s = farm.start; if (n <= 1) return { x: s.x, z: s.z, yaw: s.yaw };
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), d = SPAWN_GAP * (n - 1);
  for (const side of [0, 8, -8, 16, -16, 24, -24]) { const x = s.x + fx * d + fz * side, z = s.z + fz * d - fx * side; if (clear(farm, x, z, s.yaw)) return { x, z, yaw: s.yaw }; }
  return { x: s.x + fx * d, z: s.z + fz * d, yaw: s.yaw }; // never seen in 300 seeds (test/spawn.test.mjs); the soft bump (M-7) sorts out any overlap
}
