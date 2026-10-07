// test/train.mjs — shared test helpers for a game's train. No tests here.
import { quatAxes } from '../src/sim/tractor.js';

// Move the whole (straight, parked) train so the tractor stands at (x, z) facing yaw; the cars keep their offsets in the tractor's frame.
// ground: also lift or lower it by the terrain height between the old and the new place (0.3 m above, so it settles onto its wheels).
export const moveTrain = (g, x, z, yaw, { ground = false } = {}) => {
  const tb = g.tractor.body, p0 = tb.translation(), a = yaw - Math.PI / 2, q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, { f, u, r } = quatAxes(q);
  const dy = ground ? g.terrain.height(x, z) - g.terrain.height(p0.x, p0.z) + 0.3 : 0;
  const list = [tb, ...g.train.cars.map(c => c.body)].map(b => { const t = b.translation(); return [b, g.tractorLocal(t.x, t.y, t.z, {})]; });
  for (const [b, l] of list) {
    b.setTranslation({ x: x + f.x * l.x + u.x * l.y + r.x * l.z, y: p0.y + dy + f.y * l.x + u.y * l.y + r.y * l.z, z: z + f.z * l.x + u.z * l.y + r.z * l.z }, true);
    b.setRotation(q, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
};
