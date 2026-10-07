// src/net/players.js
// Other players as this device shows them (M-2, M-11, M-25): number, paints, away, and their train records through an interpolation buffer.
import { createInterp, lerpPose, lerp, lerpAngle } from './interp.js';
import { quatAxes } from '../sim/tractor.js';
import { slotIndex } from '../sim/slots.js';
import { LIMIT } from './kinds.js';

export const SEND = { train: 50, world: 66, key: 2000 }; // ms: train diffs about 20 and host diffs about 15 each second, a keyframe every 2 s (M-23)
export const START_PAINT = { body: 'red', trim: 'yellow' };
export const yawOfQuat = q => { const { f } = quatAxes(q); return Math.atan2(f.x, f.z); };
const pose = () => ({ p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });

export function createPlayers() {
  const map = new Map();
  const ensure = n => { if (!map.has(n)) map.set(n, { n, peer: null, paint: { ...START_PAINT }, away: false, interp: createInterp(), latest: null, pose: null, yaw: 0, speed: 0, mode: 'drive', full: false, carried: [] }); return map.get(n); };
  return {
    map, ensure,
    remove(n) { map.delete(n); },
    list: () => [...map.values()],
    push(n, time, rec, arrival) { const p = map.get(n), f = { time, ...rec }; if (!p || !p.interp.push(time, arrival, f)) return false; p.latest = f; return true; },
    sample(now) {
      for (const p of map.values()) {
        const s = p.interp.sample(now); if (!s) continue;
        p.pose ||= { tractor: pose(), cars: [pose(), pose()] };
        lerpPose(s.a.bodies[0], s.b.bodies[0], s.k, p.pose.tractor); lerpPose(s.a.bodies[1], s.b.bodies[1], s.k, p.pose.cars[0]); lerpPose(s.a.bodies[2], s.b.bodies[2], s.k, p.pose.cars[1]);
        p.yaw = yawOfQuat(p.pose.tractor.q); p.mode = s.b.mode; p.full = s.b.full;
        const dt = (s.b.time - s.a.time) / 1000, A = s.a.bodies[0].p, B = s.b.bodies[0].p; if (dt > 0) p.speed = Math.hypot(B.x - A.x, B.z - A.z) / dt;
        const before = new Map(s.a.riders.map(c => [c.id, c]));
        p.carried = s.b.riders.map(c => { const o = before.get(c.id), r = { ...c, riding: !c.flying }; if (o && !c.flying) { r.x = lerp(o.x, c.x, s.k); r.y = lerp(o.y, c.y, s.k); r.z = lerp(o.z, c.z, s.k); r.yaw = lerpAngle(o.yaw, c.yaw, s.k); } return r; });
      }
    },
    others: () => [...map.values()].filter(p => p.pose).map(p => ({ n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed })),
  };
}
// M-22: this device's train record: the three bodies, and every animal in flight to it or in a slot (also a flight that still waits for the host:
// the host must see it there, M-57; the others draw an animal in a train only when its replicated owner is that player)
export function trainRecord(game) {
  const bodies = [game.tractor.body, ...game.train.cars.map(c => c.body)].map(b => ({ p: b.translation(), q: b.rotation() })), riders = [];
  for (const f of game.flights) riders.push({ id: f.animal.id, slot: slotIndex(f.slot), flying: true, x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.animal.yaw });
  for (const s of game.load.slots) if (s.landed) { const a = s.animal; riders.push({ id: a.id, slot: slotIndex(s), flying: false, x: a.x, y: a.y, z: a.z, yaw: yawOfQuat(game.train.cars[s.car].body.rotation()) }); }
  const mode = game.mode === 'drive' ? 'drive' : game.mode === 'arrive' || game.mode === 'show' ? 'show' : 'held';
  return { mode, full: game.load.full(), bodies, riders: riders.filter(r => r.id < 0xffff).slice(0, LIMIT.riders) };
}
