// Tractor's replicated kinds (M-22) as World entity records (lion-hawk 3l, N-8, N-9). Host kinds: animal, tree (the players are the engine's lh.player, plan 5) (bodiless; a
// guest holds each one's last record in e.rec). Owner kind: train, on the tractor entity, driven on the other devices (user decision
// 2026-10-13; Task 23 fills its spawn and apply). Field precisions are 1.8's (M-66); F.body() is the engine's at the same steps.
import { F, kind } from 'lion-hawk/sim';
import { TYPES, HELD } from '../sim/herd.js';
import { ACTIONS } from '../sim/actions.js';
import { MAX_PLAYERS, MAX_ID } from './protocol.js';
import { HATS } from '../sim/progress.js';
import { slotIndex } from '../sim/slots.js';
import { spawnTrainDesc, attachRemoteTrain, applyTrainRecord } from '../sim/trains.js';

const HAT_LIST = ['none', ...HATS.map(h => h.id)], TYPE_LIST = Object.keys(TYPES), ANIMS = ['idle', 'walk', 'run', 'eat', 'dance'], MODES = ['drive', 'show', 'held', 'wait'];
export const LIMIT = { coord: 400, height: 50, animals: 256, trees: 1024, riders: 16 };
const XZ = F.fixed(-LIMIT.coord, LIMIT.coord, 1 / 64), Y = F.fixed(-LIMIT.height, LIMIT.height, 1 / 256);
// a replica's last record, its interp sample (view kinds) and a change counter (netStore, riders.js). 3i never sets e.rec: these hooks
// do, on spawn (also a CI-15 respawn after a guest's world.clear()) and on every apply (view kinds: every recv step, so count changes only)
export const keep = (e, rec, world, s) => { e.s = s ?? null; if (e.rec !== rec) { e.rec = rec; e.recSeq = (e.recSeq ?? 0) + 1; } };
export function animalRecord(a, out) {
  if (a.state === 'gone') return null; // not replicated: its entity is despawned
  const held = HELD.has(a.state), carried = held || a.state === 'carried'; // held: the host's own train has it (M-15)
  out.type = a.type; out.golden = !!a.golden; out.hidden = !!a.hidden; out.home = a.home === 'yard' ? 'yard' : 'route';
  out.state = carried ? 'carried' : a.state === 'toBarn' ? 'busy' : 'free'; out.owner = held ? 1 : carried ? a.owner ?? 0 : 0; out.epoch = a.epoch;
  out.x = carried ? 0 : a.x; out.y = carried ? 0 : a.y || 0; out.z = carried ? 0 : a.z; out.yaw = carried ? 0 : a.yaw;
  out.anim = carried || !ANIMS.includes(a.anim) ? 'idle' : a.anim; out.leader = a.leader ?? null; out.line = a.line || 0;
  return out;
}
export const ANIMAL = kind({ name: 'animal', code: 1, authority: 'host', remote: 'view', max: LIMIT.animals, idMin: 0, idMax: MAX_ID, send: { hz: 15, key: 2 },
  fields: { type: F.oneOf(TYPE_LIST), golden: F.bool(), hidden: F.bool(), home: F.oneOf(['route', 'yard']), state: F.oneOf(['free', 'busy', 'carried']),
    owner: F.uint(1, MAX_PLAYERS), epoch: F.uint(4), x: XZ, y: Y, z: XZ, yaw: F.angle(), anim: F.oneOf(ANIMS), leader: F.id(), line: F.uint(1) },
  record: (e, out) => animalRecord(e.animal, out), spawned: (e, world, rec) => keep(e, rec), apply: keep,
  newer: (old, rec) => rec.epoch >= old.epoch }); // M-26: lower ownership number, older data
export const TREE = kind({ name: 'tree', code: 2, authority: 'host', remote: 'view', max: LIMIT.trees, idMin: 0, idMax: LIMIT.trees - 1, send: { hz: 15, key: 2 },
  fields: { state: F.oneOf(['standing', 'broken', 'growing']) }, record: (e, out) => { out.state = e.tree.state; return out; }, spawned: (e, world, rec) => keep(e, rec), apply: keep });
export const RIDER = F.obj({ id: F.uint(2, MAX_ID), slot: F.uint(1, 11), flying: F.bool(), x: XZ, y: Y, z: XZ, yaw: F.angle(), hat: F.oneOf(HAT_LIST) }); // hat: the one its owner put on it (M-60)
const BODY = { range: LIMIT.coord, height: LIMIT.height };
// the train's record fields on the local tractor entity (1.8's players.js trainRecord, moved): written in place after each step while it
// has a 'net' part; the net part reads them (and the three bodies and the input) for its records (N-9)
const MODE_OF = g => g.mode === 'drive' ? 'drive' : g.barnWait ? 'wait' : g.mode === 'arrive' || g.mode === 'show' ? 'show' : 'held'; // wait: held at the barn, asking for it (M-71)
const yawQ = q => Math.atan2(1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.z - q.w * q.y));
const rider = (list, k) => list[k] ??= { id: 0, slot: 0, flying: false, x: 0, y: 0, z: 0, yaw: 0, hat: 'none' };
export function trainFields(game, e) {
  e.mode = MODE_OF(game); e.full = game.load.full();
  const d = e.dirt ??= [0, 0, 0]; d[0] = game.dirt.tractor; d[1] = game.train.cars[0].dirt; d[2] = game.train.cars[1].dirt; // M-68
  const R = e.riders ??= []; let k = 0;
  for (const f of game.flights) { if (k >= LIMIT.riders || f.animal.id > MAX_ID) continue; const r = rider(R, k++), a = f.animal;
    r.id = a.id; r.slot = slotIndex(f.slot); r.flying = true; r.x = f.pos.x; r.y = f.pos.y; r.z = f.pos.z; r.yaw = a.yaw; r.hat = a.hat || 'none'; }
  for (const s of game.load.slots) { if (!s.landed || k >= LIMIT.riders || s.animal.id > MAX_ID) continue; const r = rider(R, k++), a = s.animal;
    r.id = a.id; r.slot = slotIndex(s); r.flying = false; r.x = a.x; r.y = a.y; r.z = a.z; r.yaw = yawQ(game.train.cars[s.car].body.rotation()); r.hat = a.hat || 'none'; }
  R.length = k;
}
export const TRAIN = kind({ name: 'train', code: 4, authority: 'owner', remote: 'driven', max: 1, idMin: 1, idMax: MAX_PLAYERS, send: { hz: 20, key: 2 },
  tune: { snapAt: 1.5, nudge: 6, smoothMs: 150 },
  fields: { body: F.body(BODY), trailer: F.body(BODY), wagon: F.body(BODY), input: F.actions(ACTIONS), mode: F.oneOf(MODES), full: F.bool(),
    dirt: F.list(F.fixed(0, 1, 1 / 100), 3, 3), riders: F.list(RIDER, LIMIT.riders) }, // M-68 dirt in its own field (F.body carries none)
  // input: the owner seat's stick (plan 5: the train is its pawn)
  spawn: rec => spawnTrainDesc(rec),
  spawned: (e, world, rec) => { keep(e, rec); attachRemoteTrain(e, world); trainApply(e, rec); }, // also the CI-15 respawn after a guest's world.clear()
  apply(e, rec, world, s) { trainApply(e, rec); keep(e, rec, world, s); } });
// the game fields of a remote train (bodies and input are the net part's), checked (sim/trains.js: a bad record is not used and counted):
// mode, full, riders, and its dirt onto its coverage (T-16, M-68)
function trainApply(e, rec) {
  if (!applyTrainRecord(e, rec)) return;
  if (e.coverage) e.coverage.dirt = e.dirt[0]; if (e.trailer?.coverage) e.trailer.coverage.dirt = e.dirt[1]; if (e.wagon?.coverage) e.wagon.coverage.dirt = e.dirt[2];
}
export const KINDS = [ANIMAL, TREE, TRAIN];
