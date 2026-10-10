// src/net/players.js
// Other players as this device shows them (M-2, M-11, M-25, M-65): number, paints, away, and their trains: forecast from the newest record
// (forecast.js), with the interpolation buffer for the clock offset and for animals in flight.
import { createInterp, lerp, lerpAngle } from './interp.js';
import { createForecast, rotate } from './forecast.js';
import { quatAxes } from '../sim/tractor.js';
import { slotIndex, CAR_SLOTS } from '../sim/slots.js';
import { LIMIT } from './kinds.js';
import { MAX_ID } from './protocol.js';
import { DT } from '../sim/physics.js';

export const SEND = { train: 45, world: 66, key: 2000 }; // ms: train diffs about 20 (every third 60 Hz step, M-65) and host diffs about 15 each second, a keyframe every 2 s (M-23)
// M-69: the time stamp of the state a fixed step makes, in the frame clock: the frame's time less the time still owed to later steps. Steps then
// sit exactly DT apart, as the sim moves, though two may run in one frame and none in the next (a step's own wall time would stamp both alike).
export const stepStamp = (frameNow, acc) => frameNow - (acc - DT) * 1000;
export const START_PAINT = { body: 'red', trim: 'yellow' };
const yawOfQuat = q => { const { f } = quatAxes(q); return Math.atan2(f.x, f.z); };
const yawQ = q => Math.atan2(1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.z - q.w * q.y)); // yawOfQuat with no allocation
const local = { x: 0, y: 0, z: 0 };
const flier = (list, id) => { for (const r of list) if (r.id === id) return r.flying ? r : null; return null; };

export function createPlayers() {
  const map = new Map(), others = []; // others: reused each frame (the herd and the bumper read it)
  const ensure = n => { if (!map.has(n)) map.set(n, { n, peer: null, paint: { ...START_PAINT }, away: false, interp: createInterp(), fc: createForecast(), latest: null, pose: null, yaw: 0, speed: 0, ahead: 0, dirt: [0, 0, 0], mode: 'drive', full: false, carried: [] }); return map.get(n); };
  return {
    map, ensure,
    // a player leaves: its tractor poofs where it was drawn (M-39)
    drop(n, events) { const p = map.get(n); if (!p) return; if (p.pose) events.push({ type: 'playerGone', n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); map.delete(n); },
    list: () => [...map.values()],
    // a train record; the first one makes the tractor appear (M-11). arrival: in the frame clock that sample() uses
    push(n, time, rec, arrival, events) { const p = map.get(n), f = { time, ...rec }, first = !p?.latest; if (!p || !p.interp.push(time, arrival, f)) return false; p.latest = f; p.fc.push(time, f.bodies);
      if (first) events.push({ type: 'playerJoined', n, x: rec.bodies[0].p.x, z: rec.bodies[0].p.z }); return true; },
    // M-65: the bodies where the forecast has them now; M-66: speed and wheels from the sent velocity; M-67: riders sit in their drawn car
    sample(now) {
      for (const p of map.values()) {
        const N = p.latest; if (!N) continue; let s = null; // s: the played-back pair, only for animals in flight (no allocation otherwise)
        if (!p.pose) { p.fc.restart(); p.pose = { tractor: p.fc.poses[0], cars: [p.fc.poses[1], p.fc.poses[2]] }; } // new farm or first record: no fade from the old place
        p.fc.sample(now - p.interp.offset, now);
        const q = p.pose.tractor.q, v = N.bodies[0].v; p.yaw = yawQ(q); p.mode = N.mode; p.full = N.full;
        if (v) { p.speed = Math.hypot(v.x, v.z); p.ahead = v.x * (1 - 2 * (q.y * q.y + q.z * q.z)) + v.y * 2 * (q.x * q.y + q.w * q.z) + v.z * 2 * (q.x * q.z - q.w * q.y); } // ahead: speed along the tractor's nose (reversing: below 0)
        for (let i = 0; i < 3; i++) p.dirt[i] = N.bodies[i].dirt ?? 0; // M-68
        const RN = N.riders, out = p.carried; out.length = RN.length; // the rider objects are reused frame to frame
        for (let i = 0; i < RN.length; i++) { const c = RN[i], r = out[i] ||= {}; r.id = c.id; r.slot = c.slot; r.flying = c.flying; r.riding = !c.flying; r.x = c.x; r.y = c.y; r.z = c.z; r.yaw = c.yaw; r.hat = c.hat;
          if (c.flying) { s ||= p.interp.sample(now); const o = flier(s.a.riders, c.id), b = flier(s.b.riders, c.id); if (o && b) { r.x = lerp(o.x, b.x, s.k); r.y = lerp(o.y, b.y, s.k); r.z = lerp(o.z, b.z, s.k); r.yaw = lerpAngle(o.yaw, b.yaw, s.k); } continue; } // in flight: played back
          const k = c.slot >= CAR_SLOTS ? 2 : 1, at = N.bodies[k], car = p.fc.poses[k]; // in its slot: where it sat in the sender's car, in the drawn car
          local.x = c.x - at.p.x; local.y = c.y - at.p.y; local.z = c.z - at.p.z; rotate(car.q, rotate(at.q, local, local, true), local);
          r.x = car.p.x + local.x; r.y = car.p.y + local.y; r.z = car.p.z + local.z; r.yaw = yawQ(car.q); }
      }
    },
    // each drawn frame (M-65): sample again at the frame's time and put the animals in other trains on their drawn cars
    drawAt(now, herd) {
      this.sample(now); if (!herd) return;
      for (const p of map.values()) if (p.pose && !p.away) for (const c of p.carried) { const a = herd.animals[c.id]; if (a?.state === 'carried' && a.owner === p.n) placeCarried(a, c); }
    },
    others() { let k = 0; for (const p of map.values()) if (p.pose) { const o = others[k++] ||= {}; o.n = p.n; o.x = p.pose.tractor.p.x; o.z = p.pose.tractor.p.z; o.yaw = p.yaw; o.speed = p.speed; o.held = p.mode !== 'drive'; } others.length = k; return others; },
  };
}
// M-22: this device's train record: the three bodies, and every animal in flight to it or in a slot (also a flight that still waits for the host:
// the host must see it there, M-57; the others draw an animal in a train only when its replicated owner is that player)
export function trainRecord(game) {
  const dirt = [game.dirt?.tractor ?? 0, ...game.train.cars.map(c => c.dirt ?? 0)]; // M-68
  const bodies = [game.tractor.body, ...game.train.cars.map(c => c.body)].map((b, i) => ({ p: b.translation(), q: b.rotation(), v: b.linvel(), w: b.angvel(), dirt: dirt[i] })), riders = []; // M-66: velocities for the forecast
  for (const f of game.flights) riders.push({ id: f.animal.id, slot: slotIndex(f.slot), flying: true, x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.animal.yaw, hat: f.animal.hat || 'none' });
  for (const s of game.load.slots) if (s.landed) { const a = s.animal; riders.push({ id: a.id, slot: slotIndex(s), flying: false, x: a.x, y: a.y, z: a.z, yaw: yawOfQuat(game.train.cars[s.car].body.rotation()), hat: a.hat || 'none' }); }
  const mode = game.mode === 'drive' ? 'drive' : game.barnWait ? 'wait' : game.mode === 'arrive' || game.mode === 'show' ? 'show' : 'held'; // wait: held at the barn, asking for it (M-71)
  return { mode, full: game.load.full(), bodies, riders: riders.filter(r => r.id <= MAX_ID).slice(0, LIMIT.riders) };
}
// an animal in another player's train, where that player put it (M-11, M-22)
export function placeCarried(a, c) { a.x = c.x; a.y = c.y; a.z = c.z; a.yaw = c.yaw; a.riding = c.riding; a.anim = c.flying ? 'run' : 'idle'; a.hat = c.hat === 'none' ? null : c.hat; } // M-60: the hat its owner chose
