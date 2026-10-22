// test/mp.harness.mjs — two (or more) games in one process over the in-memory hub (M-52). No tests here.
import { encodeFrame, decodeFrame, createRegistry } from 'lion-hawk/sim';
import { ANIMAL, TRAIN, KINDS, animalRecord } from '../src/net/kinds.js';
import { MAX_PLAYERS } from '../src/net/protocol.js';
import { HELD } from '../src/sim/herd.js';
import { engineWorld } from './mp.engine.harness.mjs';
export { moveTrain } from './train.mjs';

export const STILL = { thr: 0, steer: 0, horn: false };
export const PAINTS = [{ body: 'red', trim: 'yellow' }, { body: 'blue', trim: 'white' }, { body: 'green', trim: 'pink' }, { body: 'orange', trim: 'purple' }];
// every mp suite runs on the engine path: each device a headless engine on one hub (mp.engine.harness.mjs; the old createGame world retired in 3l)
export { engineWorld as mpWorld };
// a new farm on the host (M-19), as the parent menu makes one: the set seed, then farm.new through ctx.load; steps all devices until
// the host has it (its then() hands it to the host sync) and returns it
export function hostFarm(w, seed) {
  const h = w.host, old = h.game; h.engine.scene.state.settings.seed = seed; h.engine.command('farm.new', {});
  for (let k = 0; h.game === old && k < 30; k++) w.step(1);
  if (h.game === old) throw new Error('hostFarm: the host made no new farm');
  return h.game;
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
// a hand-made train record (NET_VERSION 5: three F.body() fields, a batched stick input, the dirt list)
const still = (x, y, z) => ({ p: { x, y, z }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 } });
export const parked = (x, z) => ({ body: still(x, 1, z), trailer: still(x - 4, 1, z), wagon: still(x - 8, 1, z), input: { s: 1, list: [{ goX: 0, goZ: 0, goBack: false, horn: false }] },
  mode: 'drive', full: false, dirt: [0, 0, 0], riders: [] });
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
      if (owner || a.state === 'toBarn') { const h = animalRecord(a, {}), r = g.sync.store.get('animal', a.id);
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

// a device goes quiet (its page sleeps, 3l: the engine sends its frames, so the hub drops them): nothing from it reaches the others until
// the returned function is called. ahead: hand-made frames stamped ahead of the hub clock (sendAnimals, trainFrame) still pass
const REG = createRegistry(KINDS, { maxSender: MAX_PLAYERS });
export function quiet(w, dev, { ahead = false, json = false } = {}) { // json: its JSON messages still go
  const id = dev.net.id, prev = w.hub.drop;
  w.hub.drop = (from, to, d) => {
    if (from === id) { if (!(d instanceof ArrayBuffer)) return !json; if (!ahead) return true; try { return !(decodeFrame(d.slice(0), REG)?.time > w.now); } catch { return true; } }
    return prev ? prev(from, to, d) : false;
  };
  return () => { w.hub.drop = prev; };
}
