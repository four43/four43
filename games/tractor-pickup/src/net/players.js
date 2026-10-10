// src/net/players.js
// Other players as this device shows them (M-2, M-11, M-25): number, paints, away, and their train records through an interpolation buffer.
import { createInterp, lerpPose, lerp, lerpAngle } from './interp.js';
import { quatAxes } from '../sim/tractor.js';
import { slotIndex } from '../sim/slots.js';
import { LIMIT } from './kinds.js';
import { MAX_ID } from './protocol.js';

export const SEND = { train: 50, world: 66, key: 2000 }; // ms: train diffs about 20 and host diffs about 15 each second, a keyframe every 2 s (M-23)
export const START_PAINT = { body: 'red', trim: 'yellow' };
const yawOfQuat = q => { const { f } = quatAxes(q); return Math.atan2(f.x, f.z); };
const pose = () => ({ p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });

export function createPlayers() {
  const map = new Map(), others = []; // others: reused each frame (the herd and the bumper read it)
  const ensure = n => { if (!map.has(n)) map.set(n, { n, peer: null, paint: { ...START_PAINT }, away: false, interp: createInterp(), latest: null, pose: null, yaw: 0, speed: 0, mode: 'drive', full: false, carried: [] }); return map.get(n); };
  return {
    map, ensure,
    // a player leaves: its tractor poofs where it was drawn (M-39)
    drop(n, events) { const p = map.get(n); if (!p) return; if (p.pose) events.push({ type: 'playerGone', n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); map.delete(n); },
    list: () => [...map.values()],
    // a train record; the first one makes the tractor appear (M-11). arrival: in the frame clock that sample() uses
    push(n, time, rec, arrival, events) { const p = map.get(n), f = { time, ...rec }, first = !p?.latest; if (!p || !p.interp.push(time, arrival, f)) return false; p.latest = f;
      if (first) events.push({ type: 'playerJoined', n, x: rec.bodies[0].p.x, z: rec.bodies[0].p.z }); return true; },
    sample(now) {
      for (const p of map.values()) {
        const s = p.interp.sample(now); if (!s) continue;
        p.pose ||= { tractor: pose(), cars: [pose(), pose()] };
        lerpPose(s.a.bodies[0], s.b.bodies[0], s.k, p.pose.tractor); lerpPose(s.a.bodies[1], s.b.bodies[1], s.k, p.pose.cars[0]); lerpPose(s.a.bodies[2], s.b.bodies[2], s.k, p.pose.cars[1]);
        p.yaw = yawOfQuat(p.pose.tractor.q); p.mode = s.b.mode; p.full = s.b.full;
        const dt = (s.b.time - s.a.time) / 1000, A = s.a.bodies[0].p, B = s.b.bodies[0].p; if (dt > 0) p.speed = Math.hypot(B.x - A.x, B.z - A.z) / dt;
        const RA = s.a.riders, RB = s.b.riders, out = p.carried; out.length = RB.length; // the rider objects are reused frame to frame
        for (let i = 0; i < RB.length; i++) { const c = RB[i], r = out[i] ||= {}; r.id = c.id; r.slot = c.slot; r.flying = c.flying; r.riding = !c.flying; r.x = c.x; r.y = c.y; r.z = c.z; r.yaw = c.yaw; r.hat = c.hat;
          if (c.flying) continue; const o = RA.find(x => x.id === c.id); if (o) { r.x = lerp(o.x, c.x, s.k); r.y = lerp(o.y, c.y, s.k); r.z = lerp(o.z, c.z, s.k); r.yaw = lerpAngle(o.yaw, c.yaw, s.k); } }
      }
    },
    others() { let k = 0; for (const p of map.values()) if (p.pose) { const o = others[k++] ||= {}; o.n = p.n; o.x = p.pose.tractor.p.x; o.z = p.pose.tractor.p.z; o.yaw = p.yaw; o.speed = p.speed; } others.length = k; return others; },
  };
}
// M-22: this device's train record: the three bodies, and every animal in flight to it or in a slot (also a flight that still waits for the host:
// the host must see it there, M-57; the others draw an animal in a train only when its replicated owner is that player)
export function trainRecord(game) {
  const bodies = [game.tractor.body, ...game.train.cars.map(c => c.body)].map(b => ({ p: b.translation(), q: b.rotation() })), riders = [];
  for (const f of game.flights) riders.push({ id: f.animal.id, slot: slotIndex(f.slot), flying: true, x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.animal.yaw, hat: f.animal.hat || 'none' });
  for (const s of game.load.slots) if (s.landed) { const a = s.animal; riders.push({ id: a.id, slot: slotIndex(s), flying: false, x: a.x, y: a.y, z: a.z, yaw: yawOfQuat(game.train.cars[s.car].body.rotation()), hat: a.hat || 'none' }); }
  const mode = game.mode === 'drive' ? 'drive' : game.mode === 'arrive' || game.mode === 'show' ? 'show' : 'held';
  return { mode, full: game.load.full(), bodies, riders: riders.filter(r => r.id <= MAX_ID).slice(0, LIMIT.riders) };
}
// an animal in another player's train, where that player put it (M-11, M-22)
export function placeCarried(a, c) { a.x = c.x; a.y = c.y; a.z = c.z; a.yaw = c.yaw; a.riding = c.riding; a.anim = c.flying ? 'run' : 'idle'; a.hat = c.hat === 'none' ? null : c.hat; } // M-60: the hat its owner chose
