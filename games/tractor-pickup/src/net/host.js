// src/net/host.js
// Host sync (M-11..M-19, M-22..M-24, M-39, M-50, M-57; lion-hawk 3l). The host is the authority for the animals, the trees and the players;
// each guest for its own train (M-22). The engine's World net part replicates them (net entities: mirrorHost keeps the herd, trees and
// roster as entities; the trains are driven replicas) and relays each guest's train to the others (C-3). Requests from guests come as JSON
// events; their results go back as replicated state (M-24). Bad or too many messages are dropped (M-50); a handler error never reaches the game (M-44).
import { checkFromGuest, createRate, fitsJson, createWarnOnce, NET_VERSION, MAX_PLAYERS, SILENT_MS, RATE } from './protocol.js';
import { createPlayers, placeCarried, riderAt, SEND } from './players.js';
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
// Two clocks: clock() is wall time, for every rate limit and the silence watchdog (the frame clock stops while the page sleeps); nowMs is the
// frame clock, for sending and for the interpolation buffers (sample(now) reads them in the same clock).
export function createHostSync({ game, world, net, paint, clock }) { if (!clock) throw new Error('host sync: clock required');
  const players = createPlayers(), byPeer = new Map(), rates = new Map(), out = [], bumper = createBumper(world), warn = createWarnOnce();
  const missing = new Map(); // missing: animal id -> ms it has been owned by a guest but not in that guest's train (M-57)
  let joins = 0, farm = 0, lastKey = -Infinity, closed = false, myPaint = { ...paint }, lastBefore = null;
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.map.values()) if (p.n !== except && p.peer && p.helloed) net.send(p.peer, m, rel); };
  const barn = { holder: 0, since: 0, holdMs: BARN_HOLD_MS, hostWait: null }; // M-70: the player whose show has the barn (0: nobody); hostWait: when the host's own train began to wait
  // the roster: one stable row object per player number (their player entities hold them, mirrorHost)
  const rows = new Map(), row = (n, pt, away, join, barnOn) => { const r = rows.get(n) ?? {}; r.n = n; r.paint = pt; r.away = away; r.join = join; r.barn = barnOn; rows.set(n, r); return r; };
  const roster = () => { const list = [row(1, myPaint, false, 0, barn.holder === 1)]; for (const p of players.map.values()) list.push(row(p.n, p.paint, p.away, p.join, barn.holder === p.n)); return list; };
  const welcome = p => ({ t: 'welcome', v: NET_VERSION, seed: game.farm.seed, farm, you: p.n, next: game.herd.animals.length }); // M-24: the first keyframe follows at once
  const freeNumber = () => { for (let n = 2; n <= MAX_PLAYERS; n++) if (!players.map.has(n)) return n; return 0; };
  const owned = n => game.herd.animals.filter(a => a.state === 'carried' && a.owner === n); // only when a player leaves
  const helloed = () => { for (const p of players.map.values()) if (p.helloed) return true; return false; };
  const herdSize = () => { let n = 1; for (const p of players.map.values()) if (p.helloed) n++; game.herd.setPlayers(n); game.herd.respawn(); }; // M-62: a joiner brings more animals; one who leaves takes none (the surplus is not replaced)
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
  const handlers = {
    hello(p, m) { if (p.helloed) return; p.helloed = true; p.paint = m.paint; startTrust(p); herdSize(); send(p.n, welcome(p)); try { world.net.player(p.peer, p.n); } catch (err) { warn('net player', err); } }, // M-23: the engine sends this player every keyframe at once (#77)
    paint(p, m) { p.paint = m.paint; }, // M-2: the player object changes; the next diff has it
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
  const dropPlayer = n => { for (const a of owned(n)) { a.state = 'gone'; a.epoch++; missing.delete(a.id); } players.drop(n, out); rows.delete(n); }; // M-39: its animals go with it
  const gone = id => { const n = byPeer.get(id); byPeer.delete(id); rates.delete(id); if (!n) return; dropPlayer(n); herdSize(); };
  net.on('peerAway', id => { const p = players.map.get(byPeer.get(id)); if (p) p.serverAway = p.away = true; }); // M-39: the player object says so
  net.on('peerBack', id => { const p = players.map.get(byPeer.get(id)); if (p) p.serverAway = false; });
  const silent = p => p.heardAt !== undefined && clock() - p.heardAt > SILENT_MS; // M-39: a stopped page whose socket the server still sees
  net.on('peerLeft', id => gone(id));
  net.on('peer', id => { if (closed) return; const n = freeNumber(); if (!n) return; const p = players.ensure(n); p.peer = id; p.join = joins = (joins + 1) % 256; byPeer.set(id, n);
    rates.set(id, { fast: createRate(), rel: createRate(), key: createRate(RATE.guestKeys) }); }); // C-3: a guest's reliable frames (a keyframe every 2 s) have their own small budget
  const playerOf = from => { const n = byPeer.get(from), p = n && players.map.get(n); return p && !closed ? p : null; };
  // lion-hawk 2f T6: a JSON message (today's rate, size and schema checks) and a decoded frame are two entries, so the engine's port
  // (net.frame and host.* commands) and this transport listener feed the same code
  function message(from, data) {
    try {
      const p = playerOf(from); if (!p) return;
      if (!rates.get(from).rel.allow(clock())) return; // M-50: in wall time, so a frozen frame loop never closes the window for good
      if (!fitsJson(data)) return; // M-50
      const m = checkFromGuest(data); if (!m || (!p.helloed && m.t !== 'hello')) return;
      handlers[m.t]?.(p, m);
    } catch (e) { warn('net message', e); } // M-44
  }
  // a frame the engine has applied (its port and built-in checked the sender, M-50, #77): C-4 follows what the guest reports
  function frame(from, f) {
    try {
      const p = playerOf(from); if (!p?.helloed || f.sender !== p.n) return; p.heardAt = clock();
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
      for (const p of players.map.values()) p.away = !!p.serverAway || silent(p); // M-39: the roster, the drawing and the dodges use it
      players.refresh(world, out); game.others = players.others(); repair(lastBefore === null ? 0 : now - lastBefore); lastBefore = now; stepBarn();
      for (const p of players.map.values()) { const e = p.train; if (p.away || !e) continue;
        for (const c of e.riders ?? []) { const a = game.herd.animals[c.id]; if (a?.state === 'carried' && a.owner === p.n) placeCarried(a, riderAt(e, c)); }
        if (p.full && p.mode === 'drive' && e.trailer?.body && e.wagon?.body) fullDodge(game.herd, e.body.translation(), e.body.rotation(), [e.trailer, e.wagon].map(c => ({ p: c.body.translation(), q: c.body.rotation() })), out); } // M-12, B-14
      bumper.drive(game, out);
      return out.splice(0);
    },
    after(events, now) {
      for (const e of events) { if (e.type === 'launch') e.animal.epoch++; // M-15, M-26: the host's own boop changes the owner
        if (e.type === 'treeBreak' && !e.remote) all({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') all({ t: 'horn', n: 1 }); } // M-17, M-8
      if (!helloed()) return; // nobody to send to yet: a joiner's first keyframe has everything
      mirrorHost(world, game, roster()); // the herd, trees and roster as net entities; the engine sends their records
      if (now - lastKey >= SEND.key) { lastKey = now; for (const p of players.map.values()) if (p.helloed) send(p.n, welcome(p)); } // M-19: again with each keyframe, so a lost one heals (a guest ignores one it has)
    },
    // a new farm (its World was cleared: the old farm's entities are gone, the guests' trains come back as replicas, CI-15)
    setGame(g) { game = g; game.barnGate = hostGate; farm = (farm + 1) >>> 0; missing.clear(); lastKey = -Infinity; herdSize(); localTrain(world, game, 1); players.reset();
      for (const p of players.map.values()) if (p.helloed) { startTrust(p); send(p.n, welcome(p)); } }, // M-19, C-4
    setPaint(pt) { myPaint = { ...pt }; },
    showStarted() { all({ t: 'regrow' }); }, // M-17: the host's own startShow already reset its trees
    delivered() {}, requestHelp() {}, // the host's own animals need no message; game/flow.js calls callHelp directly on the host
    close() { closed = true; try { if (!world.disposed) unmirrorHost(world, game); } catch (e) { warn('net close', e); } game.barnGate = null; game.barnWait = 0; barn.holder = 0; for (const n of [...players.map.keys()]) dropPlayer(n); byPeer.clear(); rates.clear(); game.others = []; herdSize(); }, // M-39: the host keeps playing alone and its herd refills
  };
  game.barnGate = hostGate;
  return sync;
}
