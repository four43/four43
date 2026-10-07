// src/net/host.js
// Host sync (M-11..M-19, M-22..M-24, M-39, M-50, M-57). The host is the authority for the animals, the trees and the players; each guest for its
// own train (M-22). The host sends keyframes and diffs (M-23) and passes each guest's train on. Requests from guests come as JSON events;
// their results go back as replicated state (M-24). Bad or too many messages are dropped (M-50); a handler error never reaches the game (M-44).
import { encodeFrame, decodeFrame, createTracker, isFrame } from './replica.js';
import { REGISTRY, ANIMAL, TREE, PLAYER, TRAIN, animalRecords, treeRecords, playerRecords } from './kinds.js';
import { checkFromGuest, createRate, NET_VERSION, MAX_PLAYERS, SILENT_MS } from './protocol.js';
import { createPlayers, trainRecord, SEND } from './players.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';
import { fullDodge } from '../sim/game.js';

export const CLAIM_RANGE = 8; // m: a claim is granted only near the guest's last real tractor position (M-50)
export const TREE_RANGE = 12; // m: a guest tree break counts only near its last real tractor position (M-17, M-50)
export const REPAIR_MS = 3000; // M-57: a guest's animal missing from that guest's train records for this long is free again
const TALK_MS = 500; // M-57 counts only while the guest's frames come in (they come every 50 ms): an away guest loses nothing
const MAX_JSON = 2048; // M-50: a longer reliable message from a guest is dropped (the biggest real one is a few hundred)
const REGROW_MS = 5000; // M-17, M-50: a guest regrow counts at most once in 5 s, so one guest cannot flood the others
export function createHostSync({ game, net, paint, clock = () => performance.now() }) { // clock: wall time for the rate limits (the sim clock stops while the page sleeps)
  const players = createPlayers(), byPeer = new Map(), rates = new Map(), out = [], bumper = createBumper();
  const world = createTracker([ANIMAL, TREE, PLAYER]), mine = createTracker([TRAIN]), missing = new Map(); // missing: animal id -> ms it has been owned by a guest but not in that guest's train (M-57)
  let lastWorld = -Infinity, lastTrain = -Infinity, lastKey = -Infinity, closed = false, myPaint = { ...paint }, nowMs = 0, lastBefore = null;
  const send = (n, m, rel = true) => { const p = players.map.get(n); if (p?.peer) net.send(p.peer, m, rel); };
  const all = (m, rel = true, except = 0) => { for (const p of players.list()) if (p.n !== except && p.peer && p.helloed) net.send(p.peer, m, rel); };
  const roster = () => [{ n: 1, paint: myPaint, away: false }, ...players.list().map(p => ({ n: p.n, paint: p.paint, away: p.away }))];
  const worldNow = () => ({ animal: animalRecords(game.herd), tree: treeRecords(game.trees), player: playerRecords(roster()) });
  const trainNow = () => ({ train: [[1, trainRecord(game)]] });
  const welcome = p => ({ t: 'welcome', v: NET_VERSION, seed: game.farm.seed, you: p.n, next: game.herd.animals.length }); // M-24: the first keyframe follows at once
  const freeNumber = () => { for (let n = 2; n <= MAX_PLAYERS; n++) if (![...players.map.keys()].includes(n)) return n; return 0; };
  const owned = n => game.herd.animals.filter(a => a.state === 'carried' && a.owner === n);
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
    regrow(p) { if (nowMs - (p.regrowAt ?? -Infinity) < REGROW_MS) return; p.regrowAt = nowMs; game.trees.reset(); all({ t: 'regrow' }, true, p.n); }, // M-17: any show regrows everything
    horn(p) { if (!p.pose) return; game.herd.horn(tractorOf(p)); out.push({ type: 'remoteHorn', n: p.n }); all({ t: 'horn', n: p.n }, true, p.n); }, // M-8
    help(p) { const c = p.pose ? game.herd.callHelp(tractorOf(p)) : null; send(p.n, { t: 'help', id: c ? c.id : null }); }, // M-9
  };
  const gone = id => { const n = byPeer.get(id); byPeer.delete(id); rates.delete(id); if (!n) return; const p = players.map.get(n);
    for (const a of owned(n)) { a.state = 'gone'; a.epoch++; missing.delete(a.id); } game.herd.respawn(); // M-39
    if (p?.pose) out.push({ type: 'playerGone', n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(n); };
  net.on('peerAway', id => { const p = players.map.get(byPeer.get(id)); if (p) p.serverAway = p.away = true; }); // M-39: the player object says so
  net.on('peerBack', id => { const p = players.map.get(byPeer.get(id)); if (p) p.serverAway = false; });
  const silent = p => p.heardAt !== undefined && clock() - p.heardAt > SILENT_MS; // M-39: a stopped page whose socket the server still sees
  net.on('peerLeft', id => gone(id));
  net.on('peer', id => { if (closed) return; const n = freeNumber(); if (!n) return; const p = players.ensure(n); p.peer = id; byPeer.set(id, n); rates.set(id, { fast: createRate(), rel: createRate() }); });
  function onTrain(p, f, data, reliable) {
    if ([...f.groups.keys()].some(k => k !== 'train')) return; // M-50: a guest is the authority for its own train only (decodeFrame checked the id)
    p.heardAt = clock();
    const rec = f.groups.get('train')?.records.get(p.n); // a frame may hold no train group
    if (rec) { const first = !p.latest; if (players.push(p.n, f.time, rec, nowMs) && first) out.push({ type: 'playerJoined', n: p.n, x: rec.bodies[0].p.x, z: rec.bodies[0].p.z }); }
    for (const q of players.list()) if (q.n !== p.n && q.peer && q.helloed) net.send(q.peer, data, reliable); // M-23: the host sends each guest's train to the other guests
  }
  net.on('message', (from, data, reliable) => {
    try {
      const n = byPeer.get(from), p = n && players.map.get(n); if (!p || closed) return;
      const r = rates.get(from); if (!(reliable ? r.rel : r.fast).allow(clock())) return; // M-50: in wall time, so a frozen frame loop never closes the window for good
      if (data instanceof ArrayBuffer) {
        if (!p.helloed || !isFrame(data)) return;
        new DataView(data).setUint8(1, n); // M-50: a guest speaks only for itself
        const f = decodeFrame(data, REGISTRY); if (f) onTrain(p, f, data, reliable);
        return;
      }
      if (!(JSON.stringify(data)?.length <= MAX_JSON)) return; // M-50: checks the size first
      const m = checkFromGuest(data); if (!m || (!p.helloed && m.t !== 'hello')) return;
      handlers[m.t]?.(p, m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  function repair(dt) { // M-57: an animal a guest owns but does not have (its flight poofed, a release was lost) is free again after 3 s
    for (const p of players.list()) { if (!p.latest || !(clock() - p.heardAt <= TALK_MS)) continue;
      const has = new Set(p.latest.riders.map(c => c.id));
      for (const a of owned(p.n)) { if (has.has(a.id)) { missing.delete(a.id); continue; } const m = (missing.get(a.id) || 0) + dt; if (m >= REPAIR_MS) freeUp(a); else missing.set(a.id, m); } }
  }
  const sync = {
    players, handlers, out, owned, freeUp,
    get game() { return game; }, you: 1,
    before(now) {
      nowMs = now; for (const p of players.list()) p.away = !!p.serverAway || silent(p); // M-39: the roster, the drawing and the dodges use it
      players.sample(now); game.others = players.others(); repair(lastBefore === null ? 0 : now - lastBefore); lastBefore = now;
      for (const p of players.list()) if (!p.away) for (const c of p.carried) { const a = game.herd.animals[c.id]; if (a?.state === 'carried' && a.owner === p.n) Object.assign(a, { x: c.x, y: c.y, z: c.z, yaw: c.yaw, riding: c.riding, anim: c.flying ? 'run' : 'idle' }); }
      for (const p of players.list()) if (p.pose && p.full && p.mode === 'drive' && !p.away) fullDodge(game.herd, p.pose.tractor.p, p.pose.tractor.q, p.pose.cars, out); // M-12, B-14
      if (game.mode === 'drive') bumper.step(1 / 60, game.tractor, game.others, out); // M-7 while driving only: a tractor in its show stays in the barn (M-4)
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now;
      for (const e of events) { if (e.type === 'launch') e.animal.epoch++; // M-15, M-26: the host's own boop changes the owner
        if (e.type === 'treeBreak' && !e.remote) all({ t: 'tree', id: e.tree.id }); if (e.type === 'horn') all({ t: 'horn', n: 1 }); } // M-17, M-8
      if (!players.list().some(p => p.helloed)) return; // nobody to send to yet: a joiner's first keyframe has everything
      if (now - lastKey >= SEND.key) { lastKey = now; for (const p of players.list()) if (p.helloed) send(p.n, welcome(p)); // M-19: again with each keyframe, so a lost one heals (a guest ignores one it has)
        all(encodeFrame({ key: true, sender: 1, time: now, groups: [...world.key(worldNow()), ...mine.key(trainNow())] }), true); } // M-23
      if (now - lastWorld >= SEND.world) { lastWorld = now; all(encodeFrame({ key: false, sender: 1, time: now, groups: world.diff(worldNow()) }), false); }
      if (now - lastTrain >= SEND.train) { lastTrain = now; all(encodeFrame({ key: false, sender: 1, time: now, groups: mine.diff(trainNow()) }), false); }
    },
    setGame(g) { game = g; world.reset(); mine.reset(); missing.clear(); lastKey = -Infinity; for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; if (p.helloed) send(p.n, welcome(p)); } }, // M-19
    setPaint(pt) { myPaint = { ...pt }; },
    showStarted() { all({ t: 'regrow' }); }, // M-17: the host's own startShow already reset its trees
    delivered() {}, requestHelp() {}, // the host's own animals need no message; main.js calls callHelp directly on the host
    close() { closed = true; for (const p of players.list()) { for (const a of owned(p.n)) { a.state = 'gone'; a.epoch++; } if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(p.n); } game.others = []; game.herd.respawn(); }, // M-39: the host keeps playing alone and its herd refills
  };
  return sync;
}
