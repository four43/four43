// src/net/host.js
// Host sync (M-11..M-19, M-22..M-24, M-39, M-50, M-57; lion-hawk 3l, local players plan 5). The host is the authority for the animals,
// the trees and the players; each guest for its own train (M-22). The engine runs the join (N-19: numbers 2..4, the roster, away, the
// inactive list and rejoin) and replicates player state (lh.player: coat, trim, barn, quiet) and game state (lh.game: the farm's seed,
// number and herd size); this sync writes those fields and keeps one row per active guest player for the game rules. The World net
// part replicates the herd and trees (mirrorHost) and the trains (driven replicas) and relays each guest's train to the others (C-3).
// Requests from guests come as JSON events; their results go back as replicated state (M-24). Bad or too many messages are dropped
// (M-50); a handler error never reaches the game (M-44).
import { checkFromGuest, createRate, fitsJson, createWarnOnce, SILENT_MS, RATE, MAX_ID } from './protocol.js';
import { createPlayers, placeCarried, riderAt } from './players.js';
import { mirrorHost, unmirrorHost, localTrain } from './entities.js';
import { spawnPoint } from '../sim/spawn.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';
import { fullDodge } from '../sim/game.js';
import { POWER } from '../sim/tractor.js';

// A guest reports its own tractor position, so the host does not take it as it is: it follows it at no more than a tractor's top speed (C-4).
export const CLAIM_RANGE = 8; // m: a claim is granted only this near the guest's tractor as the host follows it (M-50, C-4)
export const TREE_RANGE = 12; // m: a guest tree break counts only this near the guest's tractor as the host follows it (M-17, M-50, C-4)
export const GUEST_SPEED = Math.max(...Object.values(POWER).map(p => p.vmax)) * 1.5; // m/s: the host follows a guest's reported tractor no faster than this (C-4, M-50)
export const REPAIR_MS = 3000; // M-57: a guest's animal missing from that guest's train records for this long is free again
const TALK_MS = 500; // M-57 counts only while the guest's frames come in (they come every 50 ms): an away guest loses nothing
const REGROW_MS = 5000; // M-17, M-50: a guest regrow counts at most once in 5 s, so one guest cannot flood the others
const BANK_S = 1; // C-4: seconds of top speed a guest can save up (frames that stall, then come at once)
const NEAR_SPAWN = 10; // m, C-4: after a welcome the host follows a guest only from its spawn place on the new farm
const HORN_MS = 300; // M-8, M-50, R-8: a guest horn counts at most once in 300 ms, so the others never hear a blare
const BUSY = new Set(['wait', 'show']); // M-73: a train in these modes still has the barn it was given
export const BARN_HOLD_MS = 90000; // M-73: the barn goes to the next player after this long, also when the show that has it has not ended (R-1)
// player n's roster entry (engine.players: number order, at most MAX_PLAYERS entries)
export const entryOf = (list, n) => { for (let i = 0; i < list.length; i++) if (list[i].number === n) return list[i]; return null; };

// Two clocks: clock() is wall time, for every rate limit and the silence watchdog (the frame clock stops while the page sleeps); nowMs is the
// frame clock, for sending and for the interpolation buffers (sample(now) reads them in the same clock).
export function createHostSync({ engine, game, world, net, paint, clock }) {
  if (!clock) throw new Error('host sync: clock required'); if (!engine) throw new Error('host sync: engine required');
  const players = createPlayers(), rates = new Map(), out = [], bumper = createBumper(world), warn = createWarnOnce();
  const missing = new Map(); // missing: animal id -> ms it has been owned by a guest but not in that guest's train (M-57)
  const G = engine.gameState; // [N-22] lh.game { seed, farm, next }
  let farm = 1, closed = false, myPaint = { ...paint }, lastBefore = null; // farm: this host's farm number, from 1 (0 in lh.game = no farm yet)
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.map.values()) if (p.n !== except && p.peer) net.send(p.peer, m, rel); };
  const barn = { holder: 0, since: 0, holdMs: BARN_HOLD_MS, hostWait: null }; // M-70
  const owned = n => game.herd.animals.filter(a => a.state === 'carried' && a.owner === n); // only when a player leaves
  const herdSize = () => { game.herd.setPlayers(1 + players.map.size); game.herd.respawn(); }; // M-62: a joiner brings more animals; one who leaves takes none
  const freeUp = a => { a.state = 'idle'; a.timer = 1; a.owner = null; a.epoch++; a.y = 0; missing.delete(a.id); };
  const guestAt = p => p.trust; // C-4: the guest's tractor as far as the host believes it, or null before its first frame on this farm
  const startTrust = p => { const s = spawnPoint(game.farm, p.n); p.trust = { x: s.x, z: s.z }; p.trustAt = clock(); p.bank = 0; p.frozen = true; }; // at each welcome: the guest starts again at its spawn place
  function follow(p, at) { // C-4: move toward the reported position, at most GUEST_SPEED (with up to BANK_S saved up), in wall time
    if (!p.trust) return;
    const t = clock(), dx = at.x - p.trust.x, dz = at.z - p.trust.z, d = Math.hypot(dx, dz);
    if (p.frozen) { if (d <= NEAR_SPAWN) { p.frozen = false; p.trustAt = t; p.trust = { x: at.x, z: at.z }; } return; } // frames from the old farm do not count
    p.bank = Math.min(GUEST_SPEED * BANK_S, p.bank + GUEST_SPEED * (t - p.trustAt) / 1000); p.trustAt = t;
    const m = Math.min(d, p.bank); if (d > 0) { p.trust.x += dx * m / d; p.trust.z += dz * m / d; } p.bank -= m;
  }
  const tractorOf = p => ({ x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed }); // from its train entity (players.refresh)
  // M-70..M-73: the barn lock. A train asks by waiting at the barn (its mode 'wait'; the host's own train through its barnGate); the first to ask gets it.
  // It is free again when that show ends (the train's mode is no longer 'wait' or 'show'), when that player is away or gone, or after holdMs.
  function grantBarn() {
    if (barn.holder) return; let n = 0, at = Infinity;
    if (barn.hostWait !== null) { n = 1; at = barn.hostWait; }
    for (const p of players.map.values()) if (p.barnAsk !== undefined && p.barnAsk < at) { n = p.n; at = p.barnAsk; }
    if (n) { barn.holder = n; barn.since = clock(); }
  }
  function stepBarn() {
    const t = clock(); if (game.mode !== 'arrive') barn.hostWait = null;
    for (const p of players.map.values()) { if (p.away || p.latest?.mode !== 'wait') p.barnAsk = undefined; else p.barnAsk ??= t; }
    const h = barn.holder, p = players.map.get(h), over = h === 1 ? game.mode !== 'arrive' && game.mode !== 'show' : !p || p.away || !BUSY.has(p.latest?.mode);
    if (h && (over || t - barn.since > barn.holdMs)) { barn.holder = 0; if (h === 1 && barn.hostWait !== null) barn.hostWait = t; else if (p?.barnAsk !== undefined) p.barnAsk = t; } // one that still waits asks again, behind the others
    grantBarn();
  }
  const hostGate = () => { barn.hostWait ??= clock(); grantBarn(); return barn.holder === 1 ? 0 : barn.holder || -1; }; // M-71: the host asks itself, in its own step
  const silent = p => p.heardAt !== undefined && clock() - p.heardAt > SILENT_MS; // M-39: a stopped page whose socket the server still sees
  const dropPlayer = n => { for (const a of owned(n)) { a.state = 'gone'; a.epoch++; missing.delete(a.id); } players.drop(n, out); }; // M-39: its train poofs, its animals go with it
  // [N-21] the engine's roster decides who is in the room. Each step: one row per active guest player (a new row for a number given
  // again: its join changed, M-39), following its transport peer (a takeover moves it, N-23), its away and its paint; the row of a
  // player who left (inactive or expired, N-23) goes. A rejoin within rejoinSeconds is a new row with the same number and record.
  function reconcile() {
    if (closed) return; // a closed sync keeps no rows (the session drops it)
    const list = engine.players;
    for (let i = 0; i < list.length; i++) {
      const r = list[i]; if (r.local) continue;
      let p = players.map.get(r.number);
      if (p && (!r.active || p.join !== r.join)) { dropPlayer(r.number); herdSize(); p = undefined; }
      if (!r.active) continue;
      if (!p) { p = players.ensure(r.number); p.join = r.join; startTrust(p); herdSize(); }
      p.peer = world.net.bindings.get(r.number)?.peer ?? null; p.serverAway = r.away;
      if (p.paint.body !== r.coat || p.paint.trim !== r.trim) p.paint = { body: r.coat, trim: r.trim }; // M-2: what handlers.paint wrote
    }
    for (const n of players.map.keys()) if (!entryOf(list, n)?.active) { dropPlayer(n); herdSize(); }
  }
  // [N-22] what the host writes for everyone, after its step: its own paint, each player's barn and quiet, and the farm
  function writeState() {
    const list = engine.players;
    for (let i = 0; i < list.length; i++) {
      const r = list[i], p = players.map.get(r.number);
      if (r.local) { r.coat = myPaint.body; r.trim = myPaint.trim; r.quiet = false; } else r.quiet = !!p && silent(p);
      r.barn = barn.holder === r.number;
    }
    G.seed = game.farm.seed; G.farm = farm; G.next = Math.min(game.herd.animals.length, MAX_ID + 1);
  }
  const handlers = {
    paint(p, m) { const r = entryOf(engine.players, p.n); if (r) { r.coat = m.paint.body; r.trim = m.paint.trim; } }, // M-2, [N-22]: the guest asks, the host writes its player fields (schema-checked names, M-50)
    // M-13: first claim wins; the guest's tractor (as the host follows it, C-4) must be within 8 m of the animal (M-50). The answer is the animal's owner (M-22).
    claim(p, m) {
      const t = guestAt(p);
      for (const id of new Set(m.ids)) { const a = game.herd.animals[id]; // M-50: a repeated id counts once
        if (a && t && !NOT_FREE.has(a.state) && Math.hypot(a.x - t.x, a.z - t.z) <= CLAIM_RANGE) { a.state = 'carried'; a.owner = p.n; a.epoch++; a.hidden = false; missing.delete(id); } }
    },
    release(p, m) { for (const id of new Set(m.ids)) { const a = game.herd.animals[id]; if (a?.state === 'carried' && a.owner === p.n) freeUp(a); } }, // M-56: the guest does not have it
    // M-6, M-16, Decision 10: the host walks the delivered animals into the barn; every guest sees them walk (busy), then they are gone
    delivered(p, m) { const list = [...new Set(m.ids)].map(id => game.herd.animals[id]).filter(a => a?.state === 'carried' && a.owner === p.n); for (const a of list) { a.epoch++; a.owner = null; missing.delete(a.id); } if (list.length) { game.herd.toBarn(list); game.herd.respawn(); } },
    tree(p, m) { const t = game.trees.list[m.id], at = guestAt(p); if (!t || !at || Math.hypot(t.x - at.x, t.z - at.z) > TREE_RANGE) return; // M-17, M-50
      const e = game.trees.breakById(m.id, { x: Math.sin(p.yaw), z: Math.cos(p.yaw) }); if (!e) return; out.push(e); all({ t: 'tree', id: m.id }, true, p.n); },
    regrow(p) { const t = clock(); if (t - (p.regrowAt ?? -Infinity) < REGROW_MS) return; p.regrowAt = t; game.trees.reset(); all({ t: 'regrow' }, true, p.n); }, // M-17: any show regrows everything
    horn(p) { const t = clock(); if (!p.train || t - (p.hornAt ?? -Infinity) < HORN_MS) return; p.hornAt = t; game.herd.horn(tractorOf(p)); out.push({ type: 'remoteHorn', n: p.n }); all({ t: 'horn', n: p.n }, true, p.n); }, // M-8
    help(p) { const c = p.train ? game.herd.callHelp(tractorOf(p)) : null; send(p.n, { t: 'help', id: c ? c.id : null }); }, // M-9
  };
  net.on('peer', id => { if (!closed) rates.set(id, { fast: createRate(), rel: createRate(), key: createRate(RATE.guestKeys) }); }); // C-3, M-50: per transport peer
  net.on('peerLeft', id => { rates.delete(id); }); // the engine moves its players to the inactive list (N-23); reconcile drops their rows
  const playerOf = from => { if (closed) return null; const n = world.net.numbersOf(from)[0]; return (n && players.map.get(n)) || null; }; // [N-20] one seat per page (maxSeats 1)
  function message(from, data) {
    try {
      const p = playerOf(from); if (!p) return;
      if (!rates.get(from)?.rel.allow(clock())) return; // M-50: in wall time
      if (!fitsJson(data)) return; // M-50
      const m = checkFromGuest(data); if (!m) return;
      handlers[m.t]?.(p, m);
    } catch (e) { warn('net message', e); } // M-44
  }
  function frame(from, f) { // a frame the engine has applied (its port and built-in checked the sender, N-24): C-4 follows what the guest reports
    try {
      const p = playerOf(from); if (!p || f.sender !== p.n) return; p.heardAt = clock();
      const g = f.groups.get('train'), rec = g?.records.get(p.n); if (rec) follow(p, rec.body.p);
    } catch (e) { warn('net message', e); } // M-44
  }
  net.on('message', (from, data, reliable) => message(from, data, reliable));
  const rides = (riders, id) => { for (const c of riders) if (c.id === id) return true; return false; };
  function repair(dt) { // M-57: an animal a guest owns but does not have (its flight poofed, a release was lost) is free again after 3 s
    const t = clock();
    for (const a of game.herd.animals) { if (a.state !== 'carried') continue; const p = players.map.get(a.owner); if (!p?.latest || !(t - p.heardAt <= TALK_MS)) continue;
      if (rides(p.latest.riders, a.id)) { missing.delete(a.id); continue; } const m = (missing.get(a.id) || 0) + dt; if (m >= REPAIR_MS) freeUp(a); else missing.set(a.id, m); }
  }
  const sync = {
    players, handlers, out, barn, message, frame,
    get game() { return game; }, you: 1, get barnHolder() { return barn.holder; },
    before(now) {
      reconcile();
      for (const p of players.map.values()) p.away = !!p.serverAway || silent(p); // M-39: the roster, the drawing and the dodges use it
      players.refresh(world, out); game.others = players.others(); repair(lastBefore === null ? 0 : now - lastBefore); lastBefore = now; stepBarn();
      for (const p of players.map.values()) { const e = p.train; if (p.away || !e) continue;
        for (const c of e.riders ?? []) { const a = game.herd.animals[c.id]; if (a?.state === 'carried' && a.owner === p.n) placeCarried(a, riderAt(e, c)); }
        if (p.full && p.mode === 'drive' && e.trailer?.body && e.wagon?.body) fullDodge(game.herd, e.body.translation(), e.body.rotation(), [e.trailer, e.wagon].map(c => ({ p: c.body.translation(), q: c.body.rotation() })), out); } // M-12, B-14
      bumper.drive(game, out);
      return out.splice(0);
    },
    after(events, now) {
      for (const e of events) { if (e.type === 'launch') e.animal.epoch++;
        if (e.type === 'treeBreak' && !e.remote) all({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') all({ t: 'horn', n: 1 }); } // M-15, M-26, M-17, M-8
      writeState();
      if (!players.map.size) return; // nobody to send to yet: a joiner's first keyframe has everything
      mirrorHost(world, game); // the herd and trees as net entities; the engine sends their records and lh.player, lh.game
    },
    // a new farm (its World was cleared: the old farm's entities are gone, the guests' trains come back as replicas, CI-15)
    setGame(g) { game = g; game.barnGate = hostGate; farm = ((farm + 1) >>> 0) || 1; missing.clear(); herdSize(); localTrain(world, game, 1); players.reset();
      for (const p of players.map.values()) startTrust(p); }, // M-19 (the guests get the farm from lh.game), C-4
    setPaint(pt) { myPaint = { ...pt }; },
    showStarted() { all({ t: 'regrow' }); }, // M-17
    delivered() {}, requestHelp() {},
    close() { closed = true; try { if (!world.disposed) unmirrorHost(world, game); } catch (e) { warn('net close', e); } game.barnGate = null; game.barnWait = 0; barn.holder = 0;
      for (const n of [...players.map.keys()]) dropPlayer(n); rates.clear(); game.others = []; herdSize(); }, // M-39: the host keeps playing alone and its herd refills
  };
  game.barnGate = hostGate;
  return sync;
}
