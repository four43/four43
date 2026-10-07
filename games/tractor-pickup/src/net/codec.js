// src/net/codec.js
// Binary messages on the fast channel (M-21): the vehicle message (M-22) and the herd message (M-23). Little-endian.
// Positions are float32, body rotations int16 quaternions (x 32767), yaws uint16 over a full turn. decode* checks everything
// (M-50) and returns null for anything odd: a bad message is dropped, never thrown.
import { TYPES } from '../sim/herd.js';

export const KIND = { VEHICLE: 1, HERD: 2 };
export const TYPE_LIST = Object.keys(TYPES), ANIMS = ['idle', 'walk', 'run', 'eat', 'dance'], MODES = ['drive', 'show', 'held'];
export const LIMIT = { carried: 16, herd: 96, coord: 400, height: 50 };
const TAU = Math.PI * 2, BODY = 20, CARRIED = 18, ANIMAL = 26, VHEAD = 8, HHEAD = 7, NONE = 0xffff;
export const kindOf = buf => buf instanceof ArrayBuffer && buf.byteLength > 0 ? new Uint8Array(buf)[0] : 0;
const yawOut = y => Math.round((((y % TAU) + TAU) % TAU) / TAU * 65535);
const yawIn = v => v / 65535 * TAU;
const okXZ = v => Number.isFinite(v) && Math.abs(v) <= LIMIT.coord, okY = v => Number.isFinite(v) && Math.abs(v) <= LIMIT.height;

// vehicle: kind u8, player u8, time u32, mode u8, flags u8 (1 full), 3 x body (p f32 x3, q i16 x4), count u8, carried x count
// carried: id u16, type u8, flags u8 (1 golden, 2 flying, 4 riding), x y z f32, yaw u16
export function encodeVehicle(m) {
  if (m.carried.length > LIMIT.carried) throw new Error('too many carried animals');
  const buf = new ArrayBuffer(VHEAD + 3 * BODY + 1 + m.carried.length * CARRIED), v = new DataView(buf); let o = 0;
  v.setUint8(o++, KIND.VEHICLE); v.setUint8(o++, m.player); v.setUint32(o, m.time >>> 0, true); o += 4; v.setUint8(o++, MODES.indexOf(m.mode)); v.setUint8(o++, m.full ? 1 : 0);
  for (const b of m.bodies) { for (const k of 'xyz') { v.setFloat32(o, b.p[k], true); o += 4; } for (const k of 'xyzw') { v.setInt16(o, Math.round(Math.max(-1, Math.min(1, b.q[k])) * 32767), true); o += 2; } }
  v.setUint8(o++, m.carried.length);
  for (const c of m.carried) {
    v.setUint16(o, c.id, true); o += 2; v.setUint8(o++, TYPE_LIST.indexOf(c.type)); v.setUint8(o++, (c.golden ? 1 : 0) | (c.flying ? 2 : 0) | (c.riding ? 4 : 0));
    for (const k of 'xyz') { v.setFloat32(o, c[k], true); o += 4; } v.setUint16(o, yawOut(c.yaw), true); o += 2;
  }
  return buf;
}
export function decodeVehicle(buf) {
  if (kindOf(buf) !== KIND.VEHICLE || buf.byteLength < VHEAD + 3 * BODY + 1) return null;
  const v = new DataView(buf); let o = 1;
  const player = v.getUint8(o++), time = v.getUint32(o, true); o += 4; const mode = MODES[v.getUint8(o++)], full = (v.getUint8(o++) & 1) === 1;
  if (player < 1 || player > 4 || !mode) return null;
  const bodies = [];
  for (let i = 0; i < 3; i++) {
    const p = {}, q = {}; for (const k of 'xyz') { p[k] = v.getFloat32(o, true); o += 4; } for (const k of 'xyzw') { q[k] = v.getInt16(o, true) / 32767; o += 2; }
    const n = Math.hypot(q.x, q.y, q.z, q.w); if (!okXZ(p.x) || !okXZ(p.z) || !okY(p.y) || n < 0.9 || n > 1.1) return null;
    q.x /= n; q.y /= n; q.z /= n; q.w /= n; bodies.push({ p, q });
  }
  const count = v.getUint8(o++); if (count > LIMIT.carried || buf.byteLength !== o + count * CARRIED) return null;
  const carried = [];
  for (let i = 0; i < count; i++) {
    const id = v.getUint16(o, true); o += 2; const type = TYPE_LIST[v.getUint8(o++)], f = v.getUint8(o++), c = { id, type, golden: !!(f & 1), flying: !!(f & 2), riding: !!(f & 4) };
    for (const k of 'xyz') { c[k] = v.getFloat32(o, true); o += 4; } c.yaw = yawIn(v.getUint16(o, true)); o += 2;
    if (!type || !okXZ(c.x) || !okXZ(c.z) || !okY(c.y)) return null;
    carried.push(c);
  }
  return { player, time, mode, full, bodies, carried };
}
// herd: kind u8, time u32, count u16, animals x count
// animal: id u16, epoch u32, type u8, flags u8 (1 golden, 2 hidden, 4 busy), x y z f32, yaw u16, anim u8, leader u16 (0xffff none), line u8
export function encodeHerd(m) {
  if (m.animals.length > LIMIT.herd) throw new Error('too many animals');
  const buf = new ArrayBuffer(HHEAD + m.animals.length * ANIMAL), v = new DataView(buf); let o = 0;
  v.setUint8(o++, KIND.HERD); v.setUint32(o, m.time >>> 0, true); o += 4; v.setUint16(o, m.animals.length, true); o += 2;
  for (const a of m.animals) {
    v.setUint16(o, a.id, true); o += 2; v.setUint32(o, a.epoch >>> 0, true); o += 4; v.setUint8(o++, TYPE_LIST.indexOf(a.type));
    v.setUint8(o++, (a.golden ? 1 : 0) | (a.hidden ? 2 : 0) | (a.busy ? 4 : 0));
    for (const k of 'xyz') { v.setFloat32(o, a[k] || 0, true); o += 4; } v.setUint16(o, yawOut(a.yaw), true); o += 2;
    v.setUint8(o++, Math.max(0, ANIMS.indexOf(a.anim))); v.setUint16(o, a.leader ?? NONE, true); o += 2; v.setUint8(o++, a.line || 0);
  }
  return buf;
}
export function decodeHerd(buf) {
  if (kindOf(buf) !== KIND.HERD || buf.byteLength < HHEAD) return null;
  const v = new DataView(buf); let o = 1; const time = v.getUint32(o, true); o += 4; const count = v.getUint16(o, true); o += 2;
  if (count > LIMIT.herd || buf.byteLength !== HHEAD + count * ANIMAL) return null;
  const animals = [];
  for (let i = 0; i < count; i++) {
    const id = v.getUint16(o, true); o += 2; const epoch = v.getUint32(o, true); o += 4; const type = TYPE_LIST[v.getUint8(o++)], f = v.getUint8(o++);
    const a = { id, epoch, type, golden: !!(f & 1), hidden: !!(f & 2), busy: !!(f & 4) };
    for (const k of 'xyz') { a[k] = v.getFloat32(o, true); o += 4; } a.yaw = yawIn(v.getUint16(o, true)); o += 2;
    a.anim = ANIMS[v.getUint8(o++)]; const leader = v.getUint16(o, true); o += 2; a.leader = leader === NONE ? null : leader; a.line = v.getUint8(o++);
    if (!type || !a.anim || !okXZ(a.x) || !okXZ(a.z) || !okY(a.y)) return null;
    animals.push(a);
  }
  return { time, animals };
}
