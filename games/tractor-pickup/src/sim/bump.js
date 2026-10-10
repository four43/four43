// M-7 soft bump: each device pushes only its own tractor gently away from an other tractor (about 2 m/s, away from the other's center
// line), with a "boing" and a short horn, then waits 0.6 s. Tractors are capsules along their heading: no colliders for other players.
import { DT } from './physics.js';
export const BUMP = { push: 2, front: 1.8, back: 1.3, r: 1.1, cool: 0.6 }; // m/s, m, m, m, s (sim time)
const seg = t => { const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw); return [t.x - fx * BUMP.back, t.z - fz * BUMP.back, t.x + fx * BUMP.front, t.z + fz * BUMP.front]; };
const clamp01 = v => Math.max(0, Math.min(1, v));
function closest([ax, az, bx, bz], [cx, cz, dx, dz]) { // closest points of two 2D segments (sampled refinement: exact enough for 2 short segments)
  let best = [Infinity, 0, 0, 0, 0];
  for (let i = 0; i <= 8; i++) { const s = i / 8, px = ax + (bx - ax) * s, pz = az + (bz - az) * s, ex = dx - cx, ez = dz - cz;
    const u = clamp01(((px - cx) * ex + (pz - cz) * ez) / (ex * ex + ez * ez)), qx = cx + ex * u, qz = cz + ez * u, d = Math.hypot(px - qx, pz - qz);
    if (d < best[0]) best = [d, px, pz, qx, qz]; }
  return best;
}
export function bumpNormal(own, other) {
  const [d, px, pz, qx, qz] = closest(seg(own), seg(other)); if (d >= BUMP.r * 2) return null;
  if (d > 1e-6) return { x: (px - qx) / d, z: (pz - qz) / d };
  const k = Math.hypot(own.x - other.x, own.z - other.z) || 1; return { x: (own.x - other.x) / k || 1, z: (own.z - other.z) / k };
}
export function createBumper() {
  let cool = 0;
  return {
  drive(game, events) { if (game.mode === 'drive') this.step(DT, game.tractor, game.others, events); }, // M-7 while driving only: a tractor in its show stays in the barn (M-4)
  step(dt, tractor, others, events) {
    if ((cool -= dt) > 0) return;
    for (const o of others) {
      if (o.held) continue; // M-72: a tractor that is not driving (its show, waiting for the barn, its sticker card) lets the next one drive into the barn
      const n = bumpNormal(tractor, o); if (!n) continue;
      const v = tractor.body.linvel(), along = v.x * n.x + v.z * n.z;
      if (along < BUMP.push) tractor.body.setLinvel({ x: v.x + n.x * (BUMP.push - along), y: v.y, z: v.z + n.z * (BUMP.push - along) }, true);
      events.push({ type: 'bump', other: o.n }); cool = BUMP.cool; return;
    }
  } };
}
