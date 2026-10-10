// test/mp.harness.mjs — two (or more) games in one process over the in-memory hub (M-52). No tests here.
import RAPIER from '@dimforge/rapier3d-compat';
import { createGame } from '../src/sim/game.js';
import { DT } from '../src/sim/physics.js';
import { createMemoryHub } from '../src/net/link.js';
import { createHostSync } from '../src/net/host.js';
import { createGuestSync } from '../src/net/guest.js';
import { encodeFrame } from '../src/net/replica.js';
import { ANIMAL, TRAIN, animalRecord } from '../src/net/kinds.js';
import { HELD } from '../src/sim/herd.js';
export { moveTrain } from './train.mjs';

export const STILL = { thr: 0, steer: 0, horn: false };
export const PAINTS = [{ body: 'red', trim: 'yellow' }, { body: 'blue', trim: 'white' }, { body: 'green', trim: 'pink' }, { body: 'orange', trim: 'purple' }];
export async function mpWorld({ seed = 21, guests = 1, link = {}, join = true, clock = null, bindings } = {}) { // bindings: the replicated kinds (default: the game's own)
  await RAPIER.init();
  const hub = createMemoryHub(link); let now = 0; const wall = clock || (() => now); // the syncs' wall clock (rate limits, the silence watchdog): the sim clock unless a test drives it
  const host = { name: 'host', events: [], game: createGame(RAPIER, { seed, power: 'medium' }) };
  host.net = hub.host(); host.sync = createHostSync({ game: host.game, net: host.net, paint: PAINTS[0], clock: wall, bindings });
  const devs = [host];
  const addGuest = () => {
    const i = devs.length, g = { name: 'guest' + i, events: [], game: createGame(RAPIER, { seed: 1000 + i, power: 'medium' }) }; // its own solo farm until the welcome
    g.net = hub.join();
    g.sync = createGuestSync({ game: g.game, net: g.net, paint: PAINTS[i % PAINTS.length], clock: wall, bindings, onFarm: (s, n) => (g.game = createGame(RAPIER, { seed: s, power: 'medium', player: n })) });
    devs.push(g); return g;
  };
  if (join) for (let i = 0; i < guests; i++) addGuest();
  // inputs: [hostInput, guest1Input, ...] (missing = STILL), or a function (dev, index) -> input
  const step = (n = 1, inputs = []) => {
    for (let k = 0; k < n; k++) {
      now += DT * 1000; hub.tick(now);
      devs.forEach((d, i) => {
        d.events.push(...d.sync.before(now));
        const inp = typeof inputs === 'function' ? inputs(d, i) : inputs[i]; const ev = d.game.step(inp || STILL);
        d.events.push(...ev); d.sync.after(ev, now);
      });
    }
  };
  const seconds = (s, inputs) => step(Math.round(s * 60), inputs);
  return { hub, host, get guests() { return devs.slice(1); }, devs, step, seconds, addGuest, get now() { return now; } };
}
// Put an animal (by id) in front of a device's tractor, standing still
export function inFront(dev, a, ahead = 2.5) { const p = dev.game.tractorWorld({ x: ahead, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; a.hidden = false; }
export const free = (game, a) => game.herd.free().includes(a);
// A free route animal that is no chick and leads none: a boop takes it alone
export const single = g => g.herd.free().find(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id) && x.home === 'route');
// Put a host animal in front of a guest's tractor, on both devices; returns the guest's copy
export const inFrontOf = (g, ha) => { const ga = g.game.herd.animals[ha.id]; inFront(g, ga); ha.x = ga.x; ha.z = ga.z; ha.state = 'idle'; ha.timer = 99; ha.hidden = false; return ga; };
// Count the calls of one sync handler (it still runs): returns () => the count
export const countCalls = (sync, name) => { const orig = sync.handlers[name]; let n = 0; sync.handlers[name] = (...a) => { n++; return orig(...a); }; return () => n; };
// Run fn with console.warn captured (a test that makes the game warn keeps its output clean): returns the warnings
export const quietWarn = fn => { const warn = console.warn, warned = []; console.warn = (...a) => warned.push(a); try { fn(); } finally { console.warn = warn; } return warned; };
// A hand-made frame from one device to another (M-22): animal records from the host, or a train record from a player
export const sendAnimals = (w, to, records, { key = false, time = w.now + 1 } = {}) => w.host.net.send(to.net.id, encodeFrame({ key, sender: 1, time, groups: [{ kind: ANIMAL, records }] }), key);
export const trainFrame = (sender, id, rec, time) => encodeFrame({ key: false, sender, time, groups: [{ kind: TRAIN, records: [[id, rec]] }] });
export const animalRec = o => ({ type: 'pig', golden: false, hidden: false, home: 'route', state: 'free', owner: 0, epoch: 0, x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', leader: null, line: 0, ...o });
export const parked = (x, z) => ({ mode: 'drive', full: false, bodies: [0, 1, 2].map(() => ({ p: { x, y: 1, z }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 }, dirt: 0 })), riders: [] });
// M-58: what a guest shows that the host does not (empty: all devices agree). Per guest that is not alone:
// - every host animal: gone on the host -> gone, not drawn (elsewhere) or missing here; held by this guest -> held here (fly, ride, show);
//   held by another player -> carried or not drawn here; walking into the barn -> toBarn here; free -> free here;
//   not free on the host (held, carried or walking in) -> this guest's replicated record has the host's owner and ownership number (epoch)
// - every animal held here is carried by this guest on the host; no open claims; every tree broken here exactly when broken on the host
// - the host's farm (its seed); the same players: every host roster number (but its own) is in this guest's players, and no other number is
export function disagreements(w) {
  const out = [], H = w.host.game, roster = [1, ...w.host.sync.players.list().map(p => p.n)];
  for (const g of w.guests) {
    if (g.sync.alone) continue; const G = g.game, you = g.sync.you, at = (b, what) => out.push(`${g.name} animal ${b}: ${what}`);
    if (G.farm.seed !== H.farm.seed) { out.push(`${g.name}: farm ${G.farm.seed}, the host has ${H.farm.seed}`); continue; }
    for (const a of H.herd.animals) {
      const b = G.herd.animals[a.id];
      if (a.state === 'gone') { if (b && b.state !== 'gone' && b.state !== 'elsewhere') at(a.id, `gone on the host, here ${b.state}`); continue; }
      const owner = HELD.has(a.state) ? 1 : a.state === 'carried' ? a.owner : 0;
      if (!b) { at(a.id, 'missing'); continue; }
      if (owner === you) { if (!HELD.has(b.state)) at(a.id, `the host says mine, here ${b.state}`); }
      else if (owner) { if (b.state !== 'carried' && b.state !== 'elsewhere') at(a.id, `player ${owner} has it, here ${b.state}`); }
      else if (a.state === 'toBarn') { if (b.state !== 'toBarn') at(a.id, `walking in on the host, here ${b.state}`); }
      else if (!free(G, b)) at(a.id, `free on the host, here ${b.state}`);
      if (owner || a.state === 'toBarn') { const h = animalRecord(a), r = g.sync.store.get('animal', a.id);
        if (!r || r.owner !== h.owner || r.epoch !== h.epoch) at(a.id, `owner ${h.owner} epoch ${h.epoch} on the host, here ${r ? `owner ${r.owner} epoch ${r.epoch}` : 'no record'}`); }
    }
    for (const b of G.herd.animals) if (HELD.has(b.state) && !(H.herd.animals[b.id]?.state === 'carried' && H.herd.animals[b.id].owner === you)) at(b.id, `held here, ${H.herd.animals[b.id]?.state} on the host`);
    if (g.sync.pending.size) out.push(`${g.name}: ${g.sync.pending.size} open claims`);
    for (const t of H.trees.list) if ((t.state === 'broken') !== (G.trees.list[t.id].state === 'broken')) out.push(`${g.name} tree ${t.id}: ${t.state} on the host, ${G.trees.list[t.id].state} here`);
    for (const n of roster) if (n !== you && !g.sync.players.map.has(n)) out.push(`${g.name}: no player ${n}`);
    for (const n of g.sync.players.map.keys()) if (n !== you && !roster.includes(n)) out.push(`${g.name}: player ${n} is not on the host`);
  }
  return out;
}
// step until every device agrees, at most s seconds; returns the disagreements left (empty: agreed in time)
export function settle(w, s) { let left = disagreements(w); for (let i = 0; i < Math.round(s * 60) && left.length; i++) { w.step(1); left = disagreements(w); } return left; }
// a connection change (M-42, M-53): every claim, release and frame, both ways, is lost for s seconds
export function blackout(w, s, inputs) { w.hub.drop = (from, to, d) => d instanceof ArrayBuffer || d?.t === 'claim' || d?.t === 'release'; w.seconds(s, inputs); w.hub.drop = null; }
