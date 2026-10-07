// src/net/protocol.js
// Reliable-channel JSON messages (M-24) and their checks (M-50): every field must be the right type and in range, or the whole
// message is dropped. NET_VERSION (M-27) goes to Handshake as the game version, so a different build cannot join at all.
import { TYPES } from '../sim/herd.js';
import { START_PAINTS, NEW_PAINTS } from '../sim/progress.js';

export const NET_VERSION = 1, MAX_PLAYERS = 4;
export const PAINT_NAMES = [...START_PAINTS, ...NEW_PAINTS];
const obj = m => m && typeof m === 'object' && !Array.isArray(m);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = (v, lim = 400) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const ids = (a, max = 16) => Array.isArray(a) && a.length <= max && a.every(v => int(v, 0, 0xffff));
const paintOk = p => obj(p) && PAINT_NAMES.includes(p.body) && PAINT_NAMES.includes(p.trim);
const playerOk = p => obj(p) && int(p.n, 1, MAX_PLAYERS) && paintOk(p.paint) && typeof p.away === 'boolean';
const STATES = ['free', 'busy', 'carried', 'gone'];
const animalOk = a => obj(a) && int(a.id, 0, 0xffff) && Object.hasOwn(TYPES, a.type) && typeof a.golden === 'boolean' && (a.home === 'route' || a.home === 'yard')
  && (a.leader === null || int(a.leader, 0, 0xffff)) && int(a.line, 0, 255) && num(a.x) && num(a.z) && num(a.yaw, 100) && int(a.epoch, 0, 0xffffffff)
  && STATES.includes(a.state) && typeof a.hidden === 'boolean';
const GUEST = {
  hello: m => m.v === NET_VERSION && paintOk(m.paint), claim: m => ids(m.ids), release: m => ids(m.ids), delivered: m => ids(m.ids),
  tree: m => int(m.id, 0, 0xffff), regrow: () => true, horn: () => true, help: () => true, paint: m => paintOk(m.paint),
};
const HOST = {
  welcome: m => int(m.v, 0, 0xffff) && int(m.seed, 0, 0xffffffff) && int(m.you, 2, MAX_PLAYERS) && Array.isArray(m.players) && m.players.length <= MAX_PLAYERS && m.players.every(playerOk)
    && Array.isArray(m.herd) && m.herd.length <= 512 && m.herd.every(animalOk) && ids(m.trees, 256),
  players: m => Array.isArray(m.list) && m.list.length <= MAX_PLAYERS && m.list.every(playerOk),
  claimed: m => ids(m.ok) && ids(m.no) && Array.isArray(m.epochs) && m.epochs.length <= 16 && m.epochs.every(e => Array.isArray(e) && e.length === 2 && int(e[0], 0, 0xffff) && int(e[1], 0, 0xffffffff)),
  tree: m => int(m.id, 0, 0xffff), regrow: () => true, horn: m => int(m.n, 1, MAX_PLAYERS), help: m => m.id === null || int(m.id, 0, 0xffff),
};
const check = table => m => obj(m) && Object.hasOwn(table, m.t) && table[m.t](m) ? m : null;
export const checkFromGuest = check(GUEST), checkFromHost = check(HOST);
// M-50: at most perSec messages in each 1 s window (per guest and per channel); the rest are dropped
export function createRate(perSec = 60) {
  let win = -Infinity, n = 0;
  return { allow(now) { if (now - win >= 1000) { win = now; n = 0; } return ++n <= perSec; } };
}
