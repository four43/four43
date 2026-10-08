// src/net/protocol.js
// Reliable-channel JSON messages (M-24) and their checks (M-50): every field must be the right type and in range, or the whole
// message is dropped. NET_VERSION (M-27) goes to Handshake as the game version, so a different build cannot join at all.
import { START_PAINTS, NEW_PAINTS } from '../sim/progress.js';

export const NET_VERSION = 2, MAX_PLAYERS = 4;
export const MAX_ID = 0xfffe; // the highest animal or tree id on the wire (0xffff means none)
export const MAX_IDS = 16; // ids in one claim, release or delivered message (a full train has 12)
export const MAX_JSON = 2048; // M-50: a longer reliable message is dropped (the biggest real one is a few hundred bytes)
// M-50: messages a second per peer and channel. A guest's fast channel takes more because the host passes on the other guests' trains (at most 20 a
// second each, C-3); guestKeys: a guest's reliable frames (it sends a keyframe every 2 s), apart from its requests, so frames cannot crowd them out (C-3)
export const RATE = { perSec: 60, guestFast: 120, guestKeys: 4 };
export const SILENT_MS = 3000; // M-39, M-40: no frame from a device for this long: it is away, whatever the server says (a stopped page, a dead channel)
export const PAINT_NAMES = [...START_PAINTS, ...NEW_PAINTS];
const obj = m => m && typeof m === 'object' && !Array.isArray(m);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const ids = a => Array.isArray(a) && a.length <= MAX_IDS && a.every(v => int(v, 0, MAX_ID));
const paintOk = p => obj(p) && PAINT_NAMES.includes(p.body) && PAINT_NAMES.includes(p.trim);
const GUEST = {
  hello: m => m.v === NET_VERSION && paintOk(m.paint), claim: m => ids(m.ids), release: m => ids(m.ids), delivered: m => ids(m.ids),
  tree: m => int(m.id, 0, MAX_ID), regrow: () => true, horn: () => true, help: () => true, paint: m => paintOk(m.paint),
};
const HOST = { // M-24: the herd, the trees and the players come as replicated objects (kinds.js), not in these messages
  welcome: m => m.v === NET_VERSION && int(m.seed, 0, 0xffffffff) && int(m.farm, 0, 0xffffffff) && int(m.you, 2, MAX_PLAYERS) && int(m.next, 0, MAX_ID + 1), // M-27: the same game version, as a guest's hello; farm: which farm of this host (a new farm may have the same seed); next: the host's herd size (the guest's id guard)
  tree: m => int(m.id, 0, MAX_ID), regrow: () => true, horn: m => int(m.n, 1, MAX_PLAYERS), help: m => m.id === null || int(m.id, 0, MAX_ID),
};
const check = table => m => obj(m) && Object.hasOwn(table, m.t) && table[m.t](m) ? m : null;
export const checkFromGuest = check(GUEST), checkFromHost = check(HOST);
export const fitsJson = m => JSON.stringify(m)?.length <= MAX_JSON; // M-50: checked before anything else reads the message
export const chunks = ids => { const out = []; for (let i = 0; i < ids.length; i += MAX_IDS) out.push(ids.slice(i, i + MAX_IDS)); return out; };
// M-44: a net error is logged once per kind, never a flood at 20 messages a second
export function createWarnOnce(log = (...a) => console.warn(...a)) { const seen = new Set(); return (kind, e) => { if (seen.has(kind)) return; seen.add(kind); log(kind, e); }; }
// M-50: at most perSec messages in each 1 s window (per guest and per channel); the rest are dropped
export function createRate(perSec = RATE.perSec) {
  let win = -Infinity, n = 0;
  return { allow(now) { if (now - win >= 1000) { win = now; n = 0; } return ++n <= perSec; } };
}
