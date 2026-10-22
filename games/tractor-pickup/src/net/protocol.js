// src/net/protocol.js
// Reliable-channel JSON messages (M-24) and their checks (M-50): every field must be the right type and in range, or the whole
// message is dropped. NET_VERSION (M-27) goes to Handshake as the game version, so a different build cannot join at all.
import { F, checkSchema } from 'lion-hawk/sim';
import { START_PAINTS, NEW_PAINTS } from '../sim/progress.js';

export const NET_VERSION = 5, MAX_PLAYERS = 4; // 5 (lion-hawk 0.13): the train replicates the seat's stick; the engine join (plan 5)
export const MAX_ID = 0xfffe; // the highest animal or tree id on the wire (0xffff means none)
export const MAX_IDS = 16; // ids in one claim, release or delivered message (a full train has 12)
export const MAX_JSON = 2048; // M-50: a longer reliable message is dropped (the biggest real one is a few hundred bytes)
// M-50: messages a second per peer and channel. A guest's fast channel takes more because the host passes on the other guests' trains (at most 20 a
// second each, C-3); guestKeys: a guest's reliable frames (it sends a keyframe every 2 s), apart from its requests, so frames cannot crowd them out (C-3)
export const RATE = { perSec: 60, guestFast: 120, guestKeys: 4 };
export const SILENT_MS = 3000; // M-39, M-40: no frame from a device for this long: it is away, whatever the server says (a stopped page, a dead channel)
export const PAINT_NAMES = [...START_PAINTS, ...NEW_PAINTS];
// M-50: the tables are lion-hawk schemas (#91): the same checks as before, one declaration each, and the engine port can take them as they are (T6)
export const PAINT = F.obj({ body: F.oneOf(PAINT_NAMES), trim: F.oneOf(PAINT_NAMES) }), IDS = F.list(F.uint(2, MAX_ID), MAX_IDS);
export const TO_HOST = {
  hello: { v: F.uint(1, NET_VERSION, NET_VERSION), paint: PAINT }, claim: { ids: IDS }, release: { ids: IDS }, delivered: { ids: IDS },
  tree: { id: F.uint(2, MAX_ID) }, regrow: {}, horn: {}, help: {}, paint: { paint: PAINT },
};
export const TO_GUEST = { // M-24: the herd, the trees and the players come as replicated objects (kinds.js), not in these messages
  welcome: { v: F.uint(1, NET_VERSION, NET_VERSION), seed: F.uint(4), farm: F.uint(4), you: F.uint(1, MAX_PLAYERS, 2), next: F.uint(2, MAX_ID + 1) }, // M-27: the same game version, as a guest's hello; farm: which farm of this host (a new farm may have the same seed); next: the host's herd size (the guest's id guard)
  tree: { id: F.uint(2, MAX_ID) }, regrow: {}, horn: { n: F.uint(1, MAX_PLAYERS, 1) }, help: { id: F.id() },
};
// a checked message is a copy; extra keys are dropped
const check = table => m => {
  if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.hasOwn(table, m.t)) return null;
  const d = checkSchema(table[m.t], m); return d && { t: m.t, ...d };
};
export const checkFromGuest = check(TO_HOST), checkFromHost = check(TO_GUEST);
export const fitsJson = m => JSON.stringify(m)?.length <= MAX_JSON; // M-50: checked before anything else reads the message
export const chunks = ids => { const out = []; for (let i = 0; i < ids.length; i += MAX_IDS) out.push(ids.slice(i, i + MAX_IDS)); return out; };
export { createRate, createWarnOnce } from 'lion-hawk/sim'; // M-44, M-50: the engine's, for wall-time rate limits and once-per-kind warnings
