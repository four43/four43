// src/net/host.js
// Host sync (M-11..M-19, M-24, M-39, M-50). The host owns the free animals, the trees and the respawns; every guest owns its own train.
// Guests are numbered 2..4 in join order (M-35). Bad or too many messages are dropped (M-50); a handler error never reaches the game (M-44).
import { encodeVehicle, decodeVehicle, encodeHerd, kindOf, KIND } from './codec.js';
import { checkFromGuest, createRate, NET_VERSION, MAX_PLAYERS } from './protocol.js';
import { createPlayers, vehicleOf, SEND } from './players.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';
import { fullDodge } from '../sim/game.js';

const HERD_OUT = new Set(['gone', 'fly', 'ride', 'show', 'carried', 'elsewhere']); // not in the herd message: gone, or in a train (the owner's vehicle message has them)
const TAU = Math.PI * 2;
export const CLAIM_RANGE = 8; // m: a claim is granted only near the guest's last real tractor position (M-50)
export const TREE_RANGE = 12; // m: a guest tree break counts only near its last real tractor position (M-17, M-50)
const MAX_JSON = 2048; // M-50: a longer reliable message from a guest is dropped (the biggest real one is a few hundred)
const REGROW_MS = 5000; // M-17, M-50: a guest regrow counts at most once in 5 s, so one guest cannot flood the others
export function herdRecords(herd) { // M-24: every animal not gone, for a welcome (ids grow with every respawn; the welcome holds 512). Yaw in 0..2 pi: herd yaws drift without bound, and checkFromHost allows |yaw| <= 100
  return herd.animals.filter(a => a.state !== 'gone').map(a => ({ id: a.id, type: a.type, golden: a.golden, home: a.home, leader: a.leader, line: a.line, x: a.x, z: a.z, yaw: ((a.yaw % TAU) + TAU) % TAU, epoch: a.epoch, hidden: a.hidden,
    state: HERD_OUT.has(a.state) ? 'carried' : NOT_FREE.has(a.state) ? 'busy' : 'free' }));
}
export function createHostSync({ game, net, paint, clock = () => performance.now() }) { // clock: wall time for the rate limits (the sim clock stops while the page sleeps)
  const players = createPlayers(), byPeer = new Map(), rates = new Map(), out = [], bumper = createBumper();
  let lastVeh = -Infinity, lastHerd = -Infinity, closed = false, myPaint = { ...paint }, nowMs = 0;
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.list()) if (p.n !== except && p.peer) net.send(p.peer, m, rel); };
  const roster = () => [{ n: 1, paint: myPaint, away: false }, ...players.list().map(p => ({ n: p.n, paint: p.paint, away: p.away }))];
  const welcome = p => ({ t: 'welcome', v: NET_VERSION, seed: game.farm.seed, you: p.n, players: roster(), herd: herdRecords(game.herd), next: game.herd.animals.length, trees: game.trees.brokenIds() });
  const freeNumber = () => { for (let n = 2; n <= MAX_PLAYERS; n++) if (![...players.map.keys()].includes(n)) return n; return 0; };
  const handlers = {
    hello(p, m) { if (p.helloed) return; p.helloed = true; p.paint = m.paint; send(p.n, welcome(p)); all({ t: 'players', list: roster() }, true, p.n); },
    paint(p, m) { p.paint = m.paint; all({ t: 'players', list: roster() }); },
  };
  const owned = n => game.herd.animals.filter(a => a.state === 'carried' && a.owner === n);
  const freeUp = a => { a.state = 'idle'; a.timer = 1; a.owner = null; a.epoch++; a.y = 0; };
  Object.assign(handlers, {
    // M-13: first claim wins; the guest's last real tractor position must be within 8 m of the animal (M-50)
    claim(p, m) {
      const ok = [], no = [], epochs = [], t = p.latest?.bodies[0].p;
      for (const id of new Set(m.ids)) { const a = game.herd.animals[id]; // M-50: a repeated id counts once
        if (a && t && !NOT_FREE.has(a.state) && Math.hypot(a.x - t.x, a.z - t.z) <= CLAIM_RANGE) { a.state = 'carried'; a.owner = p.n; a.epoch++; a.hidden = false; ok.push(id); epochs.push([id, a.epoch]); }
        else no.push(id); }
      send(p.n, { t: 'claimed', ok, no, epochs });
    },
    release(p, m) { for (const id of new Set(m.ids)) { const a = game.herd.animals[id]; if (a?.state === 'carried' && a.owner === p.n) freeUp(a); } }, // M-14 timeout
  });
  const guestAt = p => p.latest?.bodies[0].p; // the guest's last real tractor position (M-50)
  const tractorOf = p => ({ x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed });
  Object.assign(handlers, {
    // M-6, M-16, Decision 10: the host walks the delivered animals into the barn; every guest sees it in the herd message (busy), then they are gone
    delivered(p, m) { const list = [...new Set(m.ids)].map(id => game.herd.animals[id]).filter(a => a?.state === 'carried' && a.owner === p.n); for (const a of list) { a.epoch++; a.owner = null; } if (list.length) { game.herd.toBarn(list); game.herd.respawn(); } },
    tree(p, m) { const t = game.trees.list[m.id], at = guestAt(p); if (!t || !at || Math.hypot(t.x - at.x, t.z - at.z) > TREE_RANGE) return; // M-17, M-50
      const e = game.trees.breakById(m.id, { x: Math.sin(p.yaw), z: Math.cos(p.yaw) }); if (!e) return; out.push(e); all({ t: 'tree', id: m.id }, true, p.n); },
    regrow(p) { if (nowMs - (p.regrowAt ?? -Infinity) < REGROW_MS) return; p.regrowAt = nowMs; game.trees.reset(); all({ t: 'regrow' }, true, p.n); }, // M-17: any show regrows everything
    horn(p) { if (!p.pose) return; game.herd.horn(tractorOf(p)); out.push({ type: 'remoteHorn', n: p.n }); all({ t: 'horn', n: p.n }, true, p.n); }, // M-8
    help(p) { const c = p.pose ? game.herd.callHelp(tractorOf(p)) : null; send(p.n, { t: 'help', id: c ? c.id : null }); }, // M-9
  });
  const gone = id => { const n = byPeer.get(id); byPeer.delete(id); rates.delete(id); if (!n) return; const p = players.map.get(n);
    for (const a of owned(n)) { a.state = 'gone'; a.epoch++; } game.herd.respawn(); // M-39
    if (p?.pose) out.push({ type: 'playerGone', n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(n); all({ t: 'players', list: roster() }); };
  net.on('peerAway', id => { const p = players.map.get(byPeer.get(id)); if (p) { p.away = true; all({ t: 'players', list: roster() }); } });
  net.on('peerBack', id => { const p = players.map.get(byPeer.get(id)); if (p) { p.away = false; all({ t: 'players', list: roster() }); } });
  net.on('peerLeft', id => gone(id));
  net.on('peer', id => { if (closed) return; const n = freeNumber(); if (!n) return; const p = players.ensure(n); p.peer = id; byPeer.set(id, n); rates.set(id, { fast: createRate(), rel: createRate() }); });
  net.on('message', (from, data, reliable) => {
    try {
      const n = byPeer.get(from), p = n && players.map.get(n); if (!p || closed) return;
      const r = rates.get(from); if (!(reliable ? r.rel : r.fast).allow(clock())) return; // M-50: in wall time, so a frozen frame loop never closes the window for good
      if (data instanceof ArrayBuffer) {
        if (!p.helloed || kindOf(data) !== KIND.VEHICLE) return;
        new DataView(data).setUint8(1, n); // M-50: a guest speaks only for itself
        const m = decodeVehicle(data); if (!m) return;
        const first = !p.latest; if (players.push(m, nowMs) && first) out.push({ type: 'playerJoined', n, x: m.bodies[0].p.x, z: m.bodies[0].p.z });
        for (const q of players.list()) if (q.n !== n && q.peer) net.send(q.peer, data, false); // M-22: the host passes each train on
        return;
      }
      if (!(JSON.stringify(data)?.length <= MAX_JSON)) return; // M-50: checks the size first
      const m = checkFromGuest(data); if (!m || (!p.helloed && m.t !== 'hello')) return;
      handlers[m.t]?.(p, m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  const sync = {
    players, handlers, out, // handlers and out are extended by later tasks in this file
    get game() { return game; }, you: 1,
    before(now) {
      nowMs = now; players.sample(now); game.others = players.others();
      for (const p of players.list()) if (!p.away) for (const c of p.carried) { const a = game.herd.animals[c.id]; if (a?.state === 'carried' && a.owner === p.n) Object.assign(a, { x: c.x, y: c.y, z: c.z, yaw: c.yaw, riding: c.riding, anim: c.flying ? 'run' : 'idle' }); }
      for (const p of players.list()) if (p.pose && p.full && p.mode === 'drive' && !p.away) fullDodge(game.herd, p.pose.tractor.p, p.pose.tractor.q, p.pose.cars, out); // M-12, B-14
      if (game.mode === 'drive') bumper.step(1 / 60, game.tractor, game.others, out); // M-7 while driving only: a tractor in its show stays in the barn (M-4)
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now;
      for (const e of events) { if (e.type === 'launch') e.animal.epoch++; // M-15, M-26: the host's own boop changes the owner
        if (e.type === 'treeBreak' && !e.remote) all({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') all({ t: 'horn', n: 1 }); } // M-17, M-8
      if (now - lastVeh >= SEND.vehicle) { lastVeh = now; all(encodeVehicle(vehicleOf(game, 1, now)), false); }
      if (now - lastHerd >= SEND.herd) { lastHerd = now; all(encodeHerd(herdMessage(game.herd, now)), false); }
    },
    setGame(g) { game = g; for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; if (p.helloed) send(p.n, welcome(p)); } }, // M-19
    setPaint(pt) { myPaint = { ...pt }; all({ t: 'players', list: roster() }); },
    showStarted() { all({ t: 'regrow' }); }, // M-17: the host's own startShow already reset its trees
    delivered() {}, requestHelp() {}, // the host's own animals need no message; main.js calls callHelp directly on the host (Task 15)
    close() { closed = true; for (const p of players.list()) { for (const a of owned(p.n)) { a.state = 'gone'; a.epoch++; } if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(p.n); } game.others = []; game.herd.respawn(); }, // M-39: the host keeps playing alone and its herd refills (no guest tractor left for it to flee)
  };
  sync.owned = owned; sync.freeUp = freeUp; // for Tasks 10 and 12
  return sync;
}
// M-23: the free animals and the ones walking into the barn (busy), with their ownership numbers
export function herdMessage(herd, time) {
  const animals = [];
  for (const a of herd.animals) if (!HERD_OUT.has(a.state)) animals.push({ id: a.id, epoch: a.epoch, type: a.type, golden: a.golden, hidden: a.hidden, busy: NOT_FREE.has(a.state), x: a.x, y: a.y || 0, z: a.z, yaw: a.yaw, anim: a.anim, leader: a.leader, line: a.line });
  return { time, animals: animals.slice(0, 96) };
}
