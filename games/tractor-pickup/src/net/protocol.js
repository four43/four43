// src/net/protocol.js
// Reliable-channel JSON messages (M-24) and their checks (M-50): every field must be the right type and in range, or the whole
// message is dropped. NET_VERSION (M-27) goes to Handshake as the game version, so a different build cannot join at all.
import { START_PAINTS, NEW_PAINTS } from '../sim/progress.js';

export const NET_VERSION = 2, MAX_PLAYERS = 4;
export const SILENT_MS = 3000; // M-39, M-40: no frame from a device for this long: it is away, whatever the server says (a stopped page, a dead channel)
export const PAINT_NAMES = [...START_PAINTS, ...NEW_PAINTS];
const obj = m => m && typeof m === 'object' && !Array.isArray(m);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const ids = (a, max = 16) => Array.isArray(a) && a.length <= max && a.every(v => int(v, 0, 0xffff));
const paintOk = p => obj(p) && PAINT_NAMES.includes(p.body) && PAINT_NAMES.includes(p.trim);
const GUEST = {
  hello: m => m.v === NET_VERSION && paintOk(m.paint), claim: m => ids(m.ids), release: m => ids(m.ids), delivered: m => ids(m.ids),
  tree: m => int(m.id, 0, 0xffff), regrow: () => true, horn: () => true, help: () => true, paint: m => paintOk(m.paint),
};
const HOST = { // M-24: the herd, the trees and the players come as replicated objects (kinds.js), not in these messages
  welcome: m => int(m.v, 0, 0xffff) && int(m.seed, 0, 0xffffffff) && int(m.you, 2, MAX_PLAYERS) && int(m.next, 0, 0xffff), // next: the host's herd size (the guest's id guard)
  tree: m => int(m.id, 0, 0xffff), regrow: () => true, horn: m => int(m.n, 1, MAX_PLAYERS), help: m => m.id === null || int(m.id, 0, 0xffff),
};
const check = table => m => obj(m) && Object.hasOwn(table, m.t) && table[m.t](m) ? m : null;
export const checkFromGuest = check(GUEST), checkFromHost = check(HOST);
// M-50: at most perSec messages in each 1 s window (per guest and per channel); the rest are dropped
export function createRate(perSec = 60) {
  let win = -Infinity, n = 0;
  return { allow(now) { if (now - win >= 1000) { win = now; n = 0; } return ++n <= perSec; } };
}
