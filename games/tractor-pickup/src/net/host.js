// src/net/host.js
// Host sync (M-11..M-19, M-24, M-39, M-50). The host owns the free animals, the trees and the respawns; every guest owns its own train.
// Guests are numbered 2..4 in join order (M-35). Bad or too many messages are dropped (M-50); a handler error never reaches the game (M-44).
import { encodeVehicle, decodeVehicle, encodeHerd, kindOf, KIND } from './codec.js';
import { checkFromGuest, createRate, NET_VERSION, MAX_PLAYERS } from './protocol.js';
import { createPlayers, vehicleOf, SEND } from './players.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';

const HERD_OUT = new Set(['gone', 'fly', 'ride', 'show', 'carried', 'elsewhere']); // not in the herd message: gone, or in a train (the owner's vehicle message has them)
const TAU = Math.PI * 2;
export function herdRecords(herd) { // M-24: every animal for a welcome. Yaw in 0..2 pi: herd yaws drift without bound, and checkFromHost allows |yaw| <= 100
  return herd.animals.map(a => ({ id: a.id, type: a.type, golden: a.golden, home: a.home, leader: a.leader, line: a.line, x: a.x, z: a.z, yaw: ((a.yaw % TAU) + TAU) % TAU, epoch: a.epoch, hidden: a.hidden,
    state: a.state === 'gone' ? 'gone' : HERD_OUT.has(a.state) ? 'carried' : NOT_FREE.has(a.state) ? 'busy' : 'free' }));
}
export function createHostSync({ game, net, paint }) {
  const players = createPlayers(), byPeer = new Map(), rates = new Map(), out = [], bumper = createBumper();
  let lastVeh = -Infinity, lastHerd = -Infinity, closed = false, myPaint = { ...paint }, nowMs = 0;
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.list()) if (p.n !== except && p.peer) net.send(p.peer, m, rel); };
  const roster = () => [{ n: 1, paint: myPaint, away: false }, ...players.list().map(p => ({ n: p.n, paint: p.paint, away: p.away }))];
  const welcome = p => ({ t: 'welcome', v: NET_VERSION, seed: game.farm.seed, you: p.n, players: roster(), herd: herdRecords(game.herd), trees: game.trees.brokenIds() });
  const freeNumber = () => { for (let n = 2; n <= MAX_PLAYERS; n++) if (![...players.map.keys()].includes(n)) return n; return 0; };
  const handlers = {
    hello(p, m) { if (p.helloed) return; p.helloed = true; p.paint = m.paint; send(p.n, welcome(p)); all({ t: 'players', list: roster() }, true, p.n); },
    paint(p, m) { p.paint = m.paint; all({ t: 'players', list: roster() }); },
  };
  net.on('peer', id => { if (closed) return; const n = freeNumber(); if (!n) return; const p = players.ensure(n); p.peer = id; byPeer.set(id, n); rates.set(id, { fast: createRate(), rel: createRate() }); });
  net.on('message', (from, data, reliable) => {
    try {
      const n = byPeer.get(from), p = n && players.map.get(n); if (!p || closed) return;
      const r = rates.get(from); if (!(reliable ? r.rel : r.fast).allow(nowMs)) return; // M-50 (the sim clock: tests and the game agree)
      if (data instanceof ArrayBuffer) {
        if (!p.helloed || kindOf(data) !== KIND.VEHICLE) return;
        new DataView(data).setUint8(1, n); // M-50: a guest speaks only for itself
        const m = decodeVehicle(data); if (!m) return;
        const first = !p.latest; if (players.push(m, nowMs) && first) out.push({ type: 'playerJoined', n, x: m.bodies[0].p.x, z: m.bodies[0].p.z });
        for (const q of players.list()) if (q.n !== n && q.peer) net.send(q.peer, data, false); // M-22: the host passes each train on
        return;
      }
      const m = checkFromGuest(data); if (!m || (!p.helloed && m.t !== 'hello')) return;
      handlers[m.t]?.(p, m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  const sync = {
    players, handlers, out, // handlers and out are extended by later tasks in this file
    get game() { return game; }, you: 1,
    before(now) {
      nowMs = now; players.sample(now); game.others = players.others();
      if (game.mode === 'drive') bumper.step(1 / 60, game.tractor, game.others, out); // M-7 while driving only: a tractor in its show stays in the barn (M-4)
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now;
      if (now - lastVeh >= SEND.vehicle) { lastVeh = now; all(encodeVehicle(vehicleOf(game, 1, now)), false); }
      if (now - lastHerd >= SEND.herd) { lastHerd = now; all(encodeHerd(herdMessage(game.herd, now)), false); }
    },
    setGame(g) { game = g; for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; if (p.helloed) send(p.n, welcome(p)); } }, // M-19
    setPaint(pt) { myPaint = { ...pt }; all({ t: 'players', list: roster() }); },
    showStarted() {}, delivered() {}, requestHelp() {}, // filled in by Tasks 9 and 10
    close() { closed = true; },
  };
  return sync;
}
// M-23: the free animals and the ones walking into the barn (busy), with their ownership numbers
export function herdMessage(herd, time) {
  const animals = [];
  for (const a of herd.animals) if (!HERD_OUT.has(a.state)) animals.push({ id: a.id, epoch: a.epoch, type: a.type, golden: a.golden, hidden: a.hidden, busy: NOT_FREE.has(a.state), x: a.x, y: a.y || 0, z: a.z, yaw: a.yaw, anim: a.anim, leader: a.leader, line: a.line });
  return { time, animals: animals.slice(0, 96) };
}
