// src/net/host.js
// Host sync (M-11..M-19, M-22..M-24, M-39, M-50, M-57). The host is the authority for the animals, the trees and the players; each guest for its
// own train (M-22). The host sends keyframes and diffs (M-23) and passes each guest's train on. Requests from guests come as JSON events;
// their results go back as replicated state (M-24). Bad or too many messages are dropped (M-50); a handler error never reaches the game (M-44).
import { encodeFrame, decodeFrame, createTracker, isFrame } from './replica.js';
import { BINDINGS, ofAuthority, registryOf, readAll } from './bindings.js';
import { checkFromGuest, createRate, fitsJson, createWarnOnce, NET_VERSION, MAX_PLAYERS, SILENT_MS } from './protocol.js';
import { createPlayers, placeCarried, SEND } from './players.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';
import { fullDodge } from '../sim/game.js';

export const CLAIM_RANGE = 8; // m: a claim is granted only near the guest's last real tractor position (M-50)
export const TREE_RANGE = 12; // m: a guest tree break counts only near its last real tractor position (M-17, M-50)
export const REPAIR_MS = 3000; // M-57: a guest's animal missing from that guest's train records for this long is free again
const TALK_MS = 500; // M-57 counts only while the guest's frames come in (they come every 50 ms): an away guest loses nothing
const REGROW_MS = 5000; // M-17, M-50: a guest regrow counts at most once in 5 s, so one guest cannot flood the others
const HORN_MS = 300; // M-8, M-50, R-8: a guest horn counts at most once in 300 ms, so the others never hear a blare
// Two clocks: clock() is wall time, for every rate limit and the silence watchdog (the frame clock stops while the page sleeps); nowMs is the
// frame clock, for sending and for the interpolation buffers (sample(now) reads them in the same clock).
export function createHostSync({ game, net, paint, clock = () => performance.now(), bindings = BINDINGS }) { // bindings: the replicated kinds
  const players = createPlayers(), byPeer = new Map(), rates = new Map(), out = [], bumper = createBumper(), warn = createWarnOnce();
  const reg = registryOf(bindings), hostRows = ofAuthority(bindings, 'host'), ownRows = ofAuthority(bindings, 'owner');
  const world = createTracker(hostRows.map(b => b.kind)), mine = createTracker(ownRows.map(b => b.kind)), missing = new Map(); // missing: animal id -> ms it has been owned by a guest but not in that guest's train (M-57)
  let joins = 0, farm = 0, lastWorld = -Infinity, lastTrain = -Infinity, lastKey = -Infinity, closed = false, myPaint = { ...paint }, nowMs = 0, lastBefore = null;
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.map.values()) if (p.n !== except && p.peer && p.helloed) net.send(p.peer, m, rel); };
  const roster = () => [{ n: 1, paint: myPaint, away: false, join: 0 }, ...players.list().map(p => ({ n: p.n, paint: p.paint, away: p.away, join: p.join }))];
  const at = { get game() { return game; }, get roster() { return roster(); }, you: 1 };
  const worldNow = () => readAll(hostRows, at), mineNow = () => readAll(ownRows, at);
  const welcome = p => ({ t: 'welcome', v: NET_VERSION, seed: game.farm.seed, farm, you: p.n, next: game.herd.animals.length }); // M-24: the first keyframe follows at once
  const freeNumber = () => { for (let n = 2; n <= MAX_PLAYERS; n++) if (!players.map.has(n)) return n; return 0; };
  const owned = n => game.herd.animals.filter(a => a.state === 'carried' && a.owner === n); // only when a player leaves
  const helloed = () => { for (const p of players.map.values()) if (p.helloed) return true; return false; };
  const freeUp = a => { a.state = 'idle'; a.timer = 1; a.owner = null; a.epoch++; a.y = 0; missing.delete(a.id); };
  const guestAt = p => p.latest?.bodies[0].p; // the guest's last real tractor position (M-50)
  const tractorOf = p => ({ x: p.pose.tractor.p.x, z: p.pose.tractor.p.z, yaw: p.yaw, speed: p.speed });
  const handlers = {
    hello(p, m) { if (p.helloed) return; p.helloed = true; p.paint = m.paint; send(p.n, welcome(p)); lastKey = -Infinity; }, // M-23: a keyframe at once, after the welcome
    paint(p, m) { p.paint = m.paint; }, // M-2: the player object changes; the next diff has it
    // M-13: first claim wins; the guest's last real tractor position must be within 8 m of the animal (M-50). The answer is the animal's owner (M-22).
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
    horn(p) { const t = clock(); if (!p.pose || t - (p.hornAt ?? -Infinity) < HORN_MS) return; p.hornAt = t; game.herd.horn(tractorOf(p)); out.push({ type: 'remoteHorn', n: p.n }); all({ t: 'horn', n: p.n }, true, p.n); }, // M-8
    help(p) { const c = p.pose ? game.herd.callHelp(tractorOf(p)) : null; send(p.n, { t: 'help', id: c ? c.id : null }); }, // M-9
  };
  const dropPlayer = n => { for (const a of owned(n)) { a.state = 'gone'; a.epoch++; missing.delete(a.id); } players.drop(n, out); }; // M-39: its animals go with it
  const gone = id => { const n = byPeer.get(id); byPeer.delete(id); rates.delete(id); if (!n) return; dropPlayer(n); game.herd.respawn(); };
  net.on('peerAway', id => { const p = players.map.get(byPeer.get(id)); if (p) p.serverAway = p.away = true; }); // M-39: the player object says so
  net.on('peerBack', id => { const p = players.map.get(byPeer.get(id)); if (p) p.serverAway = false; });
  const silent = p => p.heardAt !== undefined && clock() - p.heardAt > SILENT_MS; // M-39: a stopped page whose socket the server still sees
  net.on('peerLeft', id => gone(id));
  net.on('peer', id => { if (closed) return; const n = freeNumber(); if (!n) return; const p = players.ensure(n); p.peer = id; p.join = joins = (joins + 1) % 256; byPeer.set(id, n); rates.set(id, { fast: createRate(), rel: createRate() }); });
  function onTrain(p, f, data, reliable) {
    p.heardAt = clock();
    const rec = f.groups.get('train')?.records.get(p.n); // a frame may hold no train group (decodeFrame let through only this guest's own objects, M-50)
    if (rec) players.push(p.n, f.time, rec, nowMs, out);
    all(data, reliable, p.n); // M-23: the host sends each guest's train to the other guests
  }
  net.on('message', (from, data, reliable) => {
    try {
      const n = byPeer.get(from), p = n && players.map.get(n); if (!p || closed) return;
      const r = rates.get(from); if (!(reliable ? r.rel : r.fast).allow(clock())) return; // M-50: in wall time, so a frozen frame loop never closes the window for good
      if (data instanceof ArrayBuffer) {
        if (!p.helloed || !isFrame(data)) return;
        new DataView(data).setUint8(1, n); // M-50: a guest speaks only for itself
        const f = decodeFrame(data, reg); if (f) onTrain(p, f, data, reliable);
        return;
      }
      if (!fitsJson(data)) return; // M-50
      const m = checkFromGuest(data); if (!m || (!p.helloed && m.t !== 'hello')) return;
      handlers[m.t]?.(p, m);
    } catch (e) { warn('net message', e); } // M-44
  });
  const rides = (riders, id) => { for (const c of riders) if (c.id === id) return true; return false; };
  function repair(dt) { // M-57: an animal a guest owns but does not have (its flight poofed, a release was lost) is free again after 3 s
    const t = clock();
    for (const a of game.herd.animals) { if (a.state !== 'carried') continue; const p = players.map.get(a.owner); if (!p?.latest || !(t - p.heardAt <= TALK_MS)) continue;
      if (rides(p.latest.riders, a.id)) { missing.delete(a.id); continue; } const m = (missing.get(a.id) || 0) + dt; if (m >= REPAIR_MS) freeUp(a); else missing.set(a.id, m); }
  }
  const sync = {
    players, handlers, out,
    get game() { return game; }, you: 1,
    before(now) {
      nowMs = now; for (const p of players.map.values()) p.away = !!p.serverAway || silent(p); // M-39: the roster, the drawing and the dodges use it
      players.sample(now); game.others = players.others(); repair(lastBefore === null ? 0 : now - lastBefore); lastBefore = now;
      for (const p of players.map.values()) { if (p.away) continue;
        for (const c of p.carried) { const a = game.herd.animals[c.id]; if (a?.state === 'carried' && a.owner === p.n) placeCarried(a, c); }
        if (p.pose && p.full && p.mode === 'drive') fullDodge(game.herd, p.pose.tractor.p, p.pose.tractor.q, p.pose.cars, out); } // M-12, B-14
      bumper.drive(game, out);
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now;
      for (const e of events) { if (e.type === 'launch') e.animal.epoch++; // M-15, M-26: the host's own boop changes the owner
        if (e.type === 'treeBreak' && !e.remote) all({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') all({ t: 'horn', n: 1 }); } // M-17, M-8
      if (!helloed()) return; // nobody to send to yet: a joiner's first keyframe has everything
      if (now - lastKey >= SEND.key) { lastKey = now; for (const p of players.map.values()) if (p.helloed) send(p.n, welcome(p)); // M-19: again with each keyframe, so a lost one heals (a guest ignores one it has)
        all(encodeFrame({ key: true, sender: 1, time: now, groups: [...world.key(worldNow()), ...mine.key(mineNow())] }), true); } // M-23
      if (now - lastWorld >= SEND.world) { lastWorld = now; all(encodeFrame({ key: false, sender: 1, time: now, groups: world.diff(worldNow()) }), false); }
      if (now - lastTrain >= SEND.train) { lastTrain = now; all(encodeFrame({ key: false, sender: 1, time: now, groups: mine.diff(mineNow()) }), false); }
    },
    setGame(g) { game = g; farm = (farm + 1) >>> 0; world.reset(); mine.reset(); missing.clear(); lastKey = -Infinity; for (const p of players.map.values()) { p.interp.reset(); p.latest = null; p.pose = null; if (p.helloed) send(p.n, welcome(p)); } }, // M-19
    setPaint(pt) { myPaint = { ...pt }; },
    showStarted() { all({ t: 'regrow' }); }, // M-17: the host's own startShow already reset its trees
    delivered() {}, requestHelp() {}, // the host's own animals need no message; main.js calls callHelp directly on the host
    close() { closed = true; for (const n of [...players.map.keys()]) dropPlayer(n); byPeer.clear(); rates.clear(); game.others = []; game.herd.respawn(); }, // M-39: the host keeps playing alone and its herd refills
  };
  return sync;
}
