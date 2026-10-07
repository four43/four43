// src/net/guest.js
// Guest sync (M-1, M-11..M-19, M-22..M-26, M-40, M-41, M-56). The guest is the authority for its own train only. It shows the host's animals,
// trees and players, and the other trains, from the replicated objects in its store. A claim's answer is the animal's replicated owner (M-13, M-14);
// at each keyframe from the host the guest repairs what a lost message left wrong (M-56).
import { encodeFrame, decodeFrame, createTracker, createStore, isFrame } from './replica.js';
import { REGISTRY, KINDS, TRAIN } from './kinds.js';
import { checkFromHost, createRate, NET_VERSION } from './protocol.js';
import { createPlayers, trainRecord, SEND } from './players.js';
import { createInterp, lerp, lerpAngle } from './interp.js';
import { createBumper } from '../sim/bump.js';
import { NOT_FREE } from '../sim/herd.js';

const OWN = new Set(['fly', 'ride', 'show', 'gone']); // host data never moves these: this guest's own, or unknown since the welcome (Decision 10: not toBarn)
const HELD = new Set(['fly', 'ride', 'show']); // in this guest's train or its show
export const SILENT_MS = 3000; // M-40: no binary message from the host for this long: it is away, whatever the server says (a sleeping page, a dead channel)
export const HELLO_MS = 2000; // M-24: a hello is said again this often until the welcome comes (a lost hello)
export const TREE_GRACE = 1000; // ms: a keyframe does not grow back a tree this guest broke this recently (the keyframe may be older than the host's break) (M-17, M-56)
const MAX_JSON = 2048; // M-50: a longer reliable message from the host is dropped (the welcome is the biggest: about 60 bytes)
const ID_ROOM = 512; // M-44, M-50: herd.ensure() fills every id up to the one asked for, so an id far past the host's herd is dropped, never grown into
const leaderOf = (herd, a, id) => id !== null && id !== a.id && herd.animals[id] ? id : null; // a leader the guest does not have is no leader
export function createGuestSync({ game, net, paint, onFarm, clock = () => performance.now() }) { // clock: wall time for the rate limits (the sim clock stops while the page sleeps)
  const players = createPlayers(), herdBuf = createInterp(), out = [], bumper = createBumper(), rate = { fast: createRate(120), rel: createRate(60) }; // M-50, Decision 9
  const store = createStore(KINDS), mine = createTracker([TRAIN]), pending = new Map(), myBreaks = new Map(), handedIn = new Set(); // pending: animal id -> { e0: its ownership number at the boop, done: the flight is over }; handedIn: delivered, until the host has them
  let you = 0, helloAt = -Infinity, hostNext = 0, hostPeer = null, lastTrain = -Infinity, lastKey = -Infinity, nowMs = 0, alone = false, myPaint = { ...paint }, deferred = null, deferredKey = null;
  let hostAway = false, silent = false, paused = false, lastFast = 0; // M-40: two sources (the server's hostAway, the silence watchdog); the host is away while either says so
  const setPaused = () => { const v = hostAway || silent; if (v === paused) return; paused = v; game.boopsPaused = v; const p = players.map.get(1); if (p) p.away = v; };
  const idLimit = herd => Math.max(herd.animals.length, hostNext) + ID_ROOM; // hostNext: the host's herd size from the welcome
  const toHost = (m, rel = true) => { if (hostPeer && !alone) net.send(hostPeer, m, rel); };
  const hello = () => { helloAt = clock(); toHost({ t: 'hello', v: NET_VERSION, paint: myPaint }); };
  const holds = id => game.flights.some(f => f.animal.id === id) || game.load.slots.some(s => s.animal.id === id);
  const forgetOwner = n => { for (const k of KINDS) if (k.authority === 'owner') store.forget(k.name, n); }; // a player left or came: a new one with its number starts a fresh (lower) clock, and a late frame of the old one must not outrank it
  function applyRoster() { // M-22: the player objects. A new player gets this train's keyframe at once (M-23)
    const seen = new Set();
    for (const [n, r] of store.all('player')) { if (n === you) continue; seen.add(n); if (!players.map.has(n)) { lastKey = -Infinity; forgetOwner(n); }
      const p = players.ensure(n); p.paint = { body: r.body, trim: r.trim }; p.away = r.away || (n === 1 && paused); }
    for (const p of players.list()) if (!seen.has(p.n)) { players.remove(p.n); forgetOwner(p.n); if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); }
  }
  function applyTree(id, state) { // M-17, M-56: the host's state wins, except for a tree this guest just broke itself
    const t = game.trees.list[id]; if (!t) return; // M-50: the id must exist
    if (state === 'broken') { const e = game.trees.breakById(id); if (e) out.push(e); }
    else if (t.state === 'broken' && !(clock() - (myBreaks.get(id) ?? -Infinity) < TREE_GRACE)) game.trees.regrowById(id);
  }
  function repair() { // M-56, at each keyframe from the host
    for (const [id, c] of pending) if (c.done) pending.delete(id); // M-14: the keyframe settles a claim whose flight is over
    const again = []; for (const id of handedIn) { const r = store.get('animal', id); if (r?.state === 'carried' && r.owner === you) again.push(id); else handedIn.delete(id); } // a lost delivered: still ours on the host
    const lost = []; for (const [id, r] of store.all('animal')) if (r.owner === you && !holds(id) && !handedIn.has(id)) lost.push(id); // given to us, but not here (a lost answer)
    for (let i = 0; i < again.length; i += 16) toHost({ t: 'delivered', ids: again.slice(i, i + 16) });
    for (let i = 0; i < lost.length; i += 16) toHost({ t: 'release', ids: lost.slice(i, i + 16) });
    const me = store.get('player', you); if (me && (me.body !== myPaint.body || me.trim !== myPaint.trim)) toHost({ t: 'paint', paint: myPaint }); // a lost paint (M-2)
  }
  function applyFrame(f) {
    const changes = store.apply(f);
    if (changes.some(c => c.kind === 'player')) applyRoster();
    for (const c of changes) {
      if (c.kind === 'tree' && c.rec && !deferred) applyTree(c.id, c.rec.state);
      if (c.kind === 'train' && c.rec && players.map.has(c.id)) { const first = !players.map.get(c.id).latest;
        if (players.push(c.id, f.time, c.rec, nowMs) && first) out.push({ type: 'playerJoined', n: c.id, x: c.rec.bodies[0].p.x, z: c.rec.bodies[0].p.z }); }
    }
    if (f.groups.has('animal') && !deferred) herdBuf.push(f.time, nowMs, store.all('animal')); // M-25: a snapshot of every animal at the frame's time
    if (f.key && f.sender === 1 && !deferred) repair();
  }
  function applyWelcome(m) {
    if (!you) lastFast = clock(); // the watchdog starts with the first welcome
    you = m.you; hostNext = m.next; game = onFarm(m.seed, m.you); // M-1: always rebuild from the host's seed (no solo riders come along). checkFromHost holds you to 2..MAX_PLAYERS
    game.herd.remote = true; game.claims = true; game.boopsPaused = paused; // a host that is away stays away on the new farm (M-40)
    pending.clear(); myBreaks.clear(); handedIn.clear(); herdBuf.reset(); store.clear(); mine.reset(); lastKey = -Infinity;
    for (const a of game.herd.animals) a.state = 'gone'; // M-24: nothing is free until the host's keyframe says so
    for (const p of players.list()) { p.interp.reset(); p.latest = null; p.pose = null; }
  }
  const handlers = {
    welcome(m) { if (m.v !== NET_VERSION) return; if (you && m.you === you && m.seed === game.farm.seed) return; if (deferred?.seed === m.seed) return; // the host repeats it with each keyframe: one we have, or one that waits for the show, changes nothing
      if (['arrive', 'show', 'reward'].includes(game.mode) && you) { deferred = m; return; } applyWelcome(m); }, // M-19: after the show
    tree(m) { if (deferred) return; const e = game.trees.breakById(m.id); if (e) out.push(e); }, // M-17: gibs, no direction (not on the old farm while a new one waits)
    regrow() { if (!deferred) game.trees.reset(); },
    horn(m) { out.push({ type: 'remoteHorn', n: m.n }); }, // M-8
    help(m) { const a = m.id === null || deferred ? null : game.herd.animals[m.id]; if (a) out.push({ type: 'help', animal: a }); }, // M-9
  };
  function goAlone(reason) { // M-41: carry on alone on the same farm; nothing is made again
    if (alone) return; alone = true; deferred = deferredKey = null;
    try {
      for (const f of game.flights.filter(f => f.claim === 'pending')) game.resolveClaim(f.animal.id, true); // decision 3: nobody else can have it now
      pending.clear(); game.claims = false; game.boopsPaused = false; game.herd.remote = false;
      const herd = game.herd, isFree = a => a && !NOT_FREE.has(a.state);
      for (const a of herd.animals) if (a.state === 'carried' || a.state === 'elsewhere') a.state = 'gone';
      for (const a of herd.animals) if (a.state === 'idle' && a.leader !== null && isFree(herd.animals[a.leader])) a.state = 'follow'; // records carry no 'follow': chick lines walk again
      herd.toBarn(herd.animals.filter(a => a.state === 'toBarn')); // real waypoints: the ones from records have none
      herd.respawn();
      for (const p of players.list()) { if (p.pose) out.push({ type: 'playerGone', n: p.n, x: p.pose.tractor.p.x, z: p.pose.tractor.p.z }); players.remove(p.n); }
      game.others = []; out.push({ type: 'alone', reason });
    } catch (e) { console.warn('net alone', e); } // M-44
  }
  net.on('hostAway', () => { hostAway = true; setPaused(); }); // M-40
  net.on('hostBack', () => { hostAway = false; setPaused(); });
  net.on('closed', reason => goAlone(reason));
  net.on('peer', id => { hostPeer = id; hello(); });
  net.on('message', (from, data, reliable) => {
    try {
      if (from !== hostPeer || alone || !(reliable ? rate.rel : rate.fast).allow(clock())) return; // M-50: the guest checks the host's messages too (in wall time)
      if (data instanceof ArrayBuffer) {
        if (!you) return; lastFast = clock();
        const f = isFrame(data) && decodeFrame(data, REGISTRY); if (!f || f.sender === you) return;
        if (deferred && f.key && f.sender === 1) deferredKey = f; // M-19: the new farm's state, for when its welcome is used
        applyFrame(f);
        return;
      }
      if (!(JSON.stringify(data)?.length <= MAX_JSON)) return; // M-50: checks the size first
      const m = checkFromHost(data); if (m) handlers[m.t]?.(m);
    } catch (e) { console.warn('net message', e); } // M-44
  });
  function settleClaims() { // M-14: a claim's answer is the animal's replicated owner, with a newer ownership number than at the boop
    for (const [id, c] of pending) { if (c.done) continue; const r = store.get('animal', id); if (!r || r.epoch <= c.e0) continue;
      if (r.owner === you) { game.resolveClaim(id, true); pending.delete(id); } // it lands (or, if its flight is gone, the next keyframe gives it back)
      else { out.push(...game.resolveClaim(id, false)); c.done = true; } } // somebody else has it: poof; the claim stays open until a keyframe, so the poofed animal stays hidden here until the next host keyframe (at most 2 s, within M-58)
  }
  function applyHerd(now) { // M-23, M-25: the host's animals, smoothly; never our own (R-4) nor one with an open claim (M-14)
    const s = herdBuf.sample(now); if (!s) return;
    const A = s.a, B = s.b, herd = game.herd, lim = idLimit(herd);
    for (const [id, r] of B) {
      if (id > lim) continue;
      const old = herd.animals[id]; if (pending.has(id) || old && HELD.has(old.state)) continue;
      const a = herd.ensure(id, r.type, r.golden); // after the checks: ignored data never changes an animal
      a.epoch = r.epoch; a.home = r.home; a.hidden = r.hidden; a.leader = leaderOf(herd, a, r.leader); a.line = r.line;
      if (r.state === 'carried') { a.owner = r.owner; a.state = 'elsewhere'; continue; } // drawn from its owner's train (applyCarried)
      const o = A.get(id), k = o && o.state !== 'carried' ? s.k : 1, f = k === 1 ? r : o;
      a.owner = null; a.x = lerp(f.x, r.x, k); a.z = lerp(f.z, r.z, k); a.y = lerp(f.y, r.y, k); a.yaw = lerpAngle(f.yaw, r.yaw, k); a.anim = r.anim;
      a.state = r.state === 'busy' ? 'toBarn' : r.hidden ? 'hide' : a.state === 'dodge' ? 'dodge' : 'idle';
    }
    for (const a of herd.animals) if (!B.has(a.id) && !OWN.has(a.state) && !pending.has(a.id)) a.state = 'elsewhere';
  }
  function applyCarried() { // M-11, M-22: animals in other trains, where their owners put them; only an animal whose replicated owner is that player
    for (const p of players.list()) for (const c of p.carried) { const r = store.get('animal', c.id), a = game.herd.animals[c.id];
      if (!r || r.owner !== p.n || !a || pending.has(c.id) || HELD.has(a.state)) continue;
      Object.assign(a, { state: 'carried', x: c.x, y: c.y, z: c.z, yaw: c.yaw, riding: c.riding, anim: c.flying ? 'run' : 'idle' }); }
  }
  const trainNow = () => ({ train: [[you, trainRecord(game)]] });
  const sync = {
    players, handlers, out, pending, store,
    get game() { return game; }, get you() { return you; }, get alone() { return alone; },
    before(now) {
      nowMs = now; if (!you) { if (hostPeer && clock() - helloAt >= HELLO_MS) hello(); return out.splice(0); }
      if (!alone) { silent = clock() - lastFast > SILENT_MS; setPaused(); } // M-40: the silence watchdog
      if (deferred && game.mode === 'drive') { const m = deferred, k = deferredKey; deferred = deferredKey = null; applyWelcome(m); if (k) applyFrame(k); }
      if (!alone) { players.sample(now); if (!deferred) { settleClaims(); applyHerd(now); for (const a of game.herd.animals) if (a.state === 'carried') a.state = 'elsewhere'; applyCarried(); } } // M-19: a waiting welcome's herd is not put on the old farm
      game.others = players.others(); if (game.mode === 'drive') bumper.step(1 / 60, game.tractor, game.others, out); // M-7 while driving only (M-4)
      return out.splice(0);
    },
    after(events, now) {
      nowMs = now; if (!you || alone) return;
      const ids = [];
      for (const e of events) {
        if (e.type === 'launch') { ids.push(e.animal.id); pending.set(e.animal.id, { e0: store.get('animal', e.animal.id)?.epoch ?? e.animal.epoch, done: false }); }
        if (e.type === 'unclaim') { const c = pending.get(e.animal.id); if (c) c.done = true; } // M-14: no re-boop until a keyframe settles it
        if (e.type === 'treeBreak' && !e.remote) { myBreaks.set(e.tree.id, clock()); toHost({ t: 'tree', id: e.tree.id }); } // M-17
        if (e.type === 'horn') toHost({ t: 'horn' }); // M-8
      }
      if (ids.length) toHost({ t: 'claim', ids: ids.slice(0, 16) }); // M-13: a chick line goes in one claim
      if (now - lastKey >= SEND.key) { lastKey = now; toHost(encodeFrame({ key: true, sender: you, time: now, groups: mine.key(trainNow()) }), true); } // M-23
      if (now - lastTrain >= SEND.train) { lastTrain = now; toHost(encodeFrame({ key: false, sender: you, time: now, groups: mine.diff(trainNow()) }), false); }
    },
    setGame(g) { game = g; },
    setPaint(pt) { myPaint = { ...pt }; toHost({ t: 'paint', paint: myPaint }); },
    showStarted() { toHost({ t: 'regrow' }); }, // M-17
    delivered(riders) { const ids = riders.map(r => r.animal.id).filter(id => id < 0x10000); for (const id of ids) handedIn.add(id); if (ids.length) toHost({ t: 'delivered', ids: ids.slice(0, 16) }); }, // M-6, M-16; repair() sends it again while the host still has them in this train
    requestHelp() { if (!you || alone) return false; toHost({ t: 'help' }); return true; }, // M-9
    close() { net.leave?.(); goAlone('left'); },
  };
  return sync;
}
