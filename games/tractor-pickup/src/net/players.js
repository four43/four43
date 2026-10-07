// src/net/players.js
// Other players as this device shows them (M-2, M-11, M-25): number, paints, away, and their vehicle messages through an interpolation buffer.
import { createInterp, lerpPose, lerp, lerpAngle } from './interp.js';
import { quatAxes } from '../sim/tractor.js';

export const SEND = { vehicle: 50, herd: 66 }; // ms: about 20 and 15 messages each second (M-22, M-23)
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
    push(msg, arrival) { const p = map.get(msg.player); if (!p || !p.interp.push(msg.time, arrival, msg)) return false; p.latest = msg; return true; },
    sample(now) {
      for (const p of map.values()) {
        const s = p.interp.sample(now); if (!s) continue;
        p.pose ||= { tractor: pose(), cars: [pose(), pose()] };
        lerpPose(s.a.bodies[0], s.b.bodies[0], s.k, p.pose.tractor); lerpPose(s.a.bodies[1], s.b.bodies[1], s.k, p.pose.cars[0]); lerpPose(s.a.bodies[2], s.b.bodies[2], s.k, p.pose.cars[1]);
        p.yaw = yawOfQuat(p.pose.tractor.q); p.mode = s.b.mode; p.full = s.b.full;
        const dt = (s.b.time - s.a.time) / 1000, A = s.a.bodies[0].p, B = s.b.bodies[0].p; if (dt > 0) p.speed = Math.hypot(B.x - A.x, B.z - A.z) / dt;
        const before = new Map(s.a.carried.map(c => [c.id, c]));
        p.carried = s.b.carried.map(c => { const o = before.get(c.id); return o && !c.flying ? { ...c, x: lerp(o.x, c.x, s.k), y: lerp(o.y, c.y, s.k), z: lerp(o.z, c.z, s.k), yaw: lerpAngle(o.yaw, c.yaw, s.k) } : c; });
      }
    },
    others: () => [...map.values()].filter(p => p.pose).map(p => ({ n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed })),
  };
}
// M-22: this device's own train and the animals it owns (in flight to it or in a slot)
export function vehicleOf(game, player, time) {
  const bodies = [game.tractor.body, ...game.train.cars.map(c => c.body)].map(b => ({ p: b.translation(), q: b.rotation() }));
  const carried = [];
  for (const f of game.flights) if (f.u >= 0) carried.push({ id: f.animal.id, type: f.animal.type, golden: f.animal.golden, flying: true, riding: false, x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.animal.yaw });
  for (const s of game.load.slots) if (s.landed && s.animal.state === 'ride') { const a = s.animal, c = game.train.cars[s.car].body;
    carried.push({ id: a.id, type: a.type, golden: a.golden, flying: false, riding: true, x: a.x, y: a.y, z: a.z, yaw: yawOfQuat(c.rotation()) }); }
  const mode = game.mode === 'drive' ? 'drive' : game.mode === 'arrive' || game.mode === 'show' ? 'show' : 'held';
  return { player, time, mode, full: game.load.full(), bodies, carried: carried.slice(0, 16) };
}
