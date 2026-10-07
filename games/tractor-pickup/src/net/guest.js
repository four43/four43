// src/net/guest.js
// Guest sync (M-1, M-11..M-19, M-24..M-26, M-40, M-41). The guest drives its own train; it shows the host's animals from herd messages and
// every other train from vehicle messages. Its claims wait for the host's answer (M-13, M-14).
import { encodeVehicle, decodeVehicle, decodeHerd, kindOf, KIND } from './codec.js';
import { checkFromHost, createRate, NET_VERSION } from './protocol.js';
import { createPlayers, vehicleOf, SEND } from './players.js';
import { createInterp, lerp, lerpAngle } from './interp.js';
import { createBumper } from '../sim/bump.js';

const OWN = new Set(['fly', 'ride', 'show', 'gone']); // this guest's own animals: herd messages never move them. Not toBarn: the host walks delivered animals in (Decision 10)
const HELD = new Set(['fly', 'ride', 'show']); // in this guest's train or its show
const MAX_JSON = 65536; // M-50: a longer reliable message from the host is dropped (the welcome, with the herd, is the biggest)
const ID_ROOM = 512; // M-44, M-50: herd.ensure() fills every id up to the one asked for, so an id far past the host's herd is dropped, never grown into
const leaderOf = (herd, a, id) => id !== null && id !== a.id && herd.animals[id] ? id : null; // a leader the guest does not have is no leader
export function createGuestSync({ game, net, paint, onFarm }) {
  const players = createPlayers(), herdBuf = createInterp(), out = [], bumper = createBumper(), pending = new Set(), rate = { fast: createRate(120), rel: createRate(60) }; // M-50, Decision 9
  let you = 0, hostNext = 0, hostPeer = null, lastVeh = -Infinity, nowMs = 0, alone = false, myPaint = { ...paint }, deferred = null;
  const idLimit = herd => Math.max(herd.animals.length, hostNext) + ID_ROOM; // hostNext: the host's herd size from the welcome
  const toHost = (m, rel = true) => { if (hostPeer && !alone) net.send(hostPeer, m, rel); };
  const applyRoster = list => {
    const seen = new Set();
    for (const r of list) { if (r.n === you) continue; seen.add(r.n); const p = players.ensure(r.n); p.paint = r.paint; p.away = r.away; }
    for (const p of players.list()) if (!seen.has(p.n)) { players.remove(p.n); if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); }
  };
  function applyWelcome(m) {
    you = m.you; hostNext = m.next; game = onFarm(m.seed, m.you); // M-1: always rebuild from the host's seed (no solo riders come along). checkFromHost holds you to 2..MAX_PLAYERS
    game.herd.remote = true; game.claims = true; pending.clear(); herdBuf.reset();
    const herd = game.herd, lim = idLimit(herd), got = [];
    for (const r of m.herd) { if (r.id > lim) continue; const a = herd.ensure(r.id, r.type, r.golden); got.push([a, r.leader]);
      Object.assign(a, { home: r.home, line: r.line, x: r.x, z: r.z, yaw: r.yaw, epoch: r.epoch, hidden: r.hidden });
      a.state = r.state === 'gone' ? 'gone' : r.state === 'carried' ? 'elsewhere' : r.state === 'busy' ? 'toBarn' : r.hidden ? 'hide' : 'idle'; }
    for (const [a, id] of got) a.leader = leaderOf(herd, a, id); // after every animal is in: a leader may come later in the list
    const sent = new Set(got.map(([a]) => a)); for (const a of herd.animals) if (!sent.has(a)) a.state = 'gone'; // the welcome leaves gone animals out
    for (const id of m.trees) game.trees.breakById(id); // already broken: no burst (M-17)
    for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; }
    applyRoster(m.players);
  }
  const handlers = {
    welcome(m) { if (m.v !== NET_VERSION) return; if (['arrive', 'show', 'reward'].includes(game.mode) && you) { deferred = m; return; } applyWelcome(m); }, // M-19: after the show
    players(m) { applyRoster(m.list); },
    claimed(m) { // M-14. M-26: ownership numbers only go up. Answers come in claim order, so a yes below the animal's number answers an older claim (it timed out): it never lands a newer flight
      const ep = new Map(m.epochs);
      const lost = []; // a current yes for a flight this guest no longer has (a stale no dropped it): give it back, or the host keeps it for us forever
      for (const id of m.ok) { const a = game.herd.animals[id], e = ep.get(id); if (!a || e === undefined || e < a.epoch) continue; pending.delete(id);
        if (!game.flights.some(f => f.animal.id === id && f.claim === 'pending') && !HELD.has(a.state)) lost.push(id); else game.resolveClaim(id, true); }
      if (lost.length) toHost({ t: 'release', ids: lost.slice(0, 16) });
      for (const [id, e] of m.epochs) { const a = game.herd.animals[id]; if (a && e > a.epoch) a.epoch = e; }
      for (const id of m.no) { pending.delete(id); out.push(...game.resolveClaim(id, false)); }
    },
    tree(m) { const e = game.trees.breakById(m.id); if (e) out.push(e); }, // M-17: gibs, no direction
    regrow() { game.trees.reset(); },
    horn(m) { out.push({ type: 'remoteHorn', n: m.n }); }, // M-8
    help(m) { const a = m.id === null ? null : game.herd.animals[m.id]; if (a) out.push({ type: 'help', animal: a }); }, // M-9
  };
  net.on('peer', id => { hostPeer = id; toHost({ t: 'hello', v: NET_VERSION, paint: myPaint }); });
  net.on('message', (from, data, reliable) => {
    try {
      if (from !== hostPeer || alone || !(reliable ? rate.rel : rate.fast).allow(nowMs)) return; // M-50: the guest checks the host's messages too
      if (data instanceof ArrayBuffer) {
        if (!you) return;
        if (kindOf(data) === KIND.VEHICLE) { const v = decodeVehicle(data); if (v && v.player !== you && players.map.has(v.player)) { const first = !players.map.get(v.player).latest;
          if (players.push(v, nowMs) && first) out.push({ type: 'playerJoined', n: v.player, x: v.bodies[0].p.x, z: v.bodies[0].p.z }); } }
        else if (kindOf(data) === KIND.HERD) { const h = decodeHerd(data); if (h) herdBuf.push(h.time, nowMs, h); }
        return;
      }
      if (!(JSON.stringify(data)?.length <= MAX_JSON)) return; // M-50: checks the size first
      const m = checkFromHost(data); if (m) handlers[m.t]?.(m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  function applyHerd(now) { // M-23, M-25, M-26: the host's animals, smoothly, ignoring old ownership numbers and our own animals
    const s = herdBuf.sample(now); if (!s) return;
    const prev = new Map(s.a.animals.map(a => [a.id, a])), seen = new Set(), herd = game.herd, lim = idLimit(herd);
    for (const r of s.b.animals) {
      if (r.id > lim) continue;
      const a = herd.ensure(r.id, r.type, r.golden); seen.add(r.id);
      if (pending.has(r.id) || r.epoch < a.epoch || OWN.has(a.state) && a.epoch >= r.epoch && a.state !== 'gone') continue;
      const o = prev.get(r.id), k = o ? s.k : 1, f = o || r;
      a.epoch = r.epoch; a.x = lerp(f.x, r.x, k); a.z = lerp(f.z, r.z, k); a.y = lerp(f.y, r.y, k); a.yaw = lerpAngle(f.yaw, r.yaw, k);
      a.anim = r.anim; a.hidden = r.hidden; a.leader = leaderOf(herd, a, r.leader); a.line = r.line;
      a.state = r.busy ? 'toBarn' : r.hidden ? 'hide' : a.state === 'dodge' ? 'dodge' : 'idle';
    }
    for (const a of herd.animals) if (!seen.has(a.id) && !OWN.has(a.state) && a.state !== 'carried' && !pending.has(a.id)) a.state = 'elsewhere';
  }
  function applyCarried() { // M-11: animals in other trains, at the positions their owners send
    const lim = idLimit(game.herd);
    for (const p of players.list()) for (const c of p.carried) { if (pending.has(c.id) || c.id > lim) continue; const a = game.herd.ensure(c.id, c.type, c.golden);
      if (a.state === 'fly' || a.state === 'ride' || a.state === 'show') continue; // ours
      Object.assign(a, { state: 'carried', x: c.x, y: c.y, z: c.z, yaw: c.yaw, riding: c.riding, anim: c.flying ? 'run' : 'idle' }); }
  }
  const sync = {
    players, handlers, out, pending,
    get game() { return game; }, get you() { return you; }, get alone() { return alone; },
    before(now) {
      nowMs = now; if (!you) return out.splice(0);
      if (deferred && game.mode === 'drive') { const m = deferred; deferred = null; applyWelcome(m); }
      if (!alone) { applyHerd(now); players.sample(now); for (const a of game.herd.animals) if (a.state === 'carried') a.state = 'elsewhere'; applyCarried(); }
      game.others = players.others(); if (game.mode === 'drive') bumper.step(1 / 60, game.tractor, game.others, out); // M-7 while driving only (M-4)
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now; if (!you || alone) return;
      const ids = [], gone = [];
      for (const e of events) { if (e.type === 'launch') { ids.push(e.animal.id); pending.add(e.animal.id); } if (e.type === 'unclaim') { pending.delete(e.animal.id); if (e.reason === 'timeout') gone.push(e.animal.id); }
        if (e.type === 'treeBreak' && !e.remote) toHost({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') toHost({ t: 'horn' }); } // M-17, M-8
      if (ids.length) toHost({ t: 'claim', ids: ids.slice(0, 16) }); // M-13: a chick line goes in one claim
      if (gone.length) toHost({ t: 'release', ids: gone });
      if (now - lastVeh >= SEND.vehicle) { lastVeh = now; toHost(encodeVehicle(vehicleOf(game, you, now)), false); }
    },
    setGame(g) { game = g; },
    setPaint(pt) { myPaint = { ...pt }; toHost({ t: 'paint', paint: myPaint }); },
    showStarted() { toHost({ t: 'regrow' }); }, // M-17
    delivered(riders) { const ids = riders.map(r => r.animal.id).filter(id => id < 0x10000); if (ids.length) toHost({ t: 'delivered', ids: ids.slice(0, 16) }); }, // M-6, M-16
    requestHelp() { if (!you || alone) return false; toHost({ t: 'help' }); return true; }, // M-9
    close() { alone = true; },
  };
  return sync;
}
