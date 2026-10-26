// src/net/players.js
// Other players as this device knows them (M-2, M-11, M-39, M-65; lion-hawk 3l): number, paints, away, and their trains. A train is a
// replicated World entity (the net part's 'train' kind, driven: solid jointed bodies stepped here from the owner's input, src/sim/trains.js);
// refresh(world) ties each roster row to its train entity each step, keeps p.pose (the tractor where this World has it, for the HUD and
// the roster arrows) and p.latest (the newest train record), and emits playerJoined when a train first appears. Carried riders are
// placed in this World's copy of the owner's car (placeCarried).
import { CAR_SLOTS } from '../sim/slots.js';

export const START_PAINT = { body: 'red', trim: 'yellow' };
const yawQ = q => Math.atan2(1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.z - q.w * q.y)); // the chassis heading (+x forward)
const local = { x: 0, y: 0, z: 0 }, place = { x: 0, y: 0, z: 0, yaw: 0, riding: true, flying: false, hat: 'none' };
// q rotates v (or its inverse with inv); out may be v
function rotate(q, v, out, inv = false) {
  const x = inv ? -q.x : q.x, y = inv ? -q.y : q.y, z = inv ? -q.z : q.z, w = q.w, vx = v.x, vy = v.y, vz = v.z;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  out.x = ix * w + iw * -x + iy * -z - iz * -y; out.y = iy * w + iw * -y + iz * -x - ix * -z; out.z = iz * w + iw * -z + ix * -y - iy * -x; return out;
}
// M-11, M-67: a rider c of the remote train e, where its owner put it: in flight as sent; in a slot, re-expressed from the owner's car
// pose (the record) in this World's copy of that car. Returns one reused object { x, y, z, yaw, riding, flying, hat }
export function riderAt(e, c) {
  place.flying = c.flying; place.riding = !c.flying; place.hat = c.hat;
  if (c.flying || !e.rec) { place.x = c.x; place.y = c.y; place.z = c.z; place.yaw = c.yaw; return place; }
  const k = c.slot >= CAR_SLOTS, at = k ? e.rec.wagon : e.rec.trailer, car = (k ? e.wagon : e.trailer)?.body;
  if (!car || !at) { place.x = c.x; place.y = c.y; place.z = c.z; place.yaw = c.yaw; return place; }
  const p = car.translation(), q = car.rotation();
  local.x = c.x - at.p.x; local.y = c.y - at.p.y; local.z = c.z - at.p.z; rotate(q, rotate(at.q, local, local, true), local);
  place.x = p.x + local.x; place.y = p.y + local.y; place.z = p.z + local.z; place.yaw = yawQ(q); return place;
}
// an animal in another player's train, where that player put it (M-11, M-22); c: a riderAt result
export function placeCarried(a, c) { a.x = c.x; a.y = c.y; a.z = c.z; a.yaw = c.yaw; a.riding = c.riding; a.anim = c.flying ? 'run' : 'idle'; a.hat = c.hat === 'none' ? null : c.hat; } // M-60: the hat its owner chose

export function createPlayers() {
  const map = new Map(), others = []; // others: reused each step (the herd reads it)
  const ensure = n => { if (!map.has(n)) map.set(n, { n, peer: null, paint: { ...START_PAINT }, away: false, train: null, latest: null, pose: null, yaw: 0, speed: 0, mode: 'drive', full: false }); return map.get(n); };
  return {
    map, ensure,
    // a player leaves: its tractor poofs where it was (M-39)
    drop(n, events) { const p = map.get(n); if (!p) return; if (p.pose) events.push({ type: 'playerGone', n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); map.delete(n); },
    list: () => [...map.values()],
    // each step: every row's train entity (world.net.find: never kept across a world.clear(), CI-15); the first one makes the tractor appear (M-11)
    refresh(world, events) {
      for (const p of map.values()) {
        const e = world?.net?.find('train', p.n);
        if (!e?.body) { p.train = null; continue; }
        const first = !p.pose, t = e.body.translation(), q = e.body.rotation(), v = e.body.linvel();
        p.train = e; p.latest = e.rec ?? null; p.pose ??= { tractor: { p: { x: 0, y: 0, z: 0 } } };
        const P = p.pose.tractor.p; P.x = t.x; P.y = t.y; P.z = t.z;
        p.yaw = yawQ(q); p.speed = Math.hypot(v.x, v.z); p.mode = e.mode ?? 'drive'; p.full = !!e.full;
        if (first) events.push({ type: 'playerJoined', n: p.n, x: t.x, z: t.z });
      }
    },
    // the other tractors for the herd (M-12) and the bumper's held check (M-72): one reused row each
    others() { let k = 0; for (const p of map.values()) if (p.train) { const o = others[k++] ||= {}; o.n = p.n; o.x = p.pose.tractor.p.x; o.z = p.pose.tractor.p.z; o.yaw = p.yaw; o.speed = p.speed; o.held = p.mode !== 'drive'; } others.length = k; return others; },
    // a new farm: the trains are found again (the World was cleared, CI-15); no poof, no join event
    reset() { for (const p of map.values()) { p.train = null; p.latest = null; } },
  };
}
