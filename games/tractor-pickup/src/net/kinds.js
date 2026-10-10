// src/net/kinds.js
// The kinds of replicated objects (M-22) and how the host reads animal and tree records from its game (trains: players.js trainRecord).
// A new kind of shared object in a later version is a new entry here and a row in bindings.js, not a new message.
import { F, kind } from './replica.js';
import { TYPES, HELD } from '../sim/herd.js';
import { PAINT_NAMES, MAX_PLAYERS, MAX_ID } from './protocol.js';

const TYPE_LIST = Object.keys(TYPES), ANIMS = ['idle', 'walk', 'run', 'eat', 'dance'], MODES = ['drive', 'show', 'held'];
export const LIMIT = { coord: 400, height: 50, animals: 256, trees: 1024, riders: 16 };
const XZ = F.fixed(-LIMIT.coord, LIMIT.coord, 1 / 64), Y = F.fixed(-LIMIT.height, LIMIT.height, 1 / 256); // 1.6 cm and 4 mm steps
const VEL = F.fixed(-32, 32, 1 / 1000), SPIN = F.fixed(-16, 16, 1 / 2000); // 1 mm/s and 0.5 mrad/s steps (M-66)
const BODY = F.obj({ p: F.obj({ x: XZ, y: Y, z: XZ }), q: F.quat(), v: F.obj({ x: VEL, y: VEL, z: VEL }), w: F.obj({ x: SPIN, y: SPIN, z: SPIN }), dirt: F.fixed(0, 1, 1 / 100) }); // M-66 velocity and spin for the forecast, M-68 dirt
export const ANIMAL = kind({ name: 'animal', code: 1, authority: 'host', max: LIMIT.animals, idMax: MAX_ID,
  fields: { type: F.oneOf(TYPE_LIST), golden: F.bool(), hidden: F.bool(), home: F.oneOf(['route', 'yard']), state: F.oneOf(['free', 'busy', 'carried']),
    owner: F.uint(1, MAX_PLAYERS), epoch: F.uint(4), x: XZ, y: Y, z: XZ, yaw: F.angle(), anim: F.oneOf(ANIMS), leader: F.id(), line: F.uint(1) },
  newer: (old, rec) => rec.epoch >= old.epoch }); // M-26: lower ownership number, older data
export const TREE = kind({ name: 'tree', code: 2, authority: 'host', max: LIMIT.trees, idMax: LIMIT.trees - 1, fields: { state: F.oneOf(['standing', 'broken', 'growing']) } });
export const PLAYER = kind({ name: 'player', code: 3, authority: 'host', max: MAX_PLAYERS, idMin: 1, idMax: MAX_PLAYERS, fields: { body: F.oneOf(PAINT_NAMES), trim: F.oneOf(PAINT_NAMES), away: F.bool(), join: F.uint(1) } }); // join: which joining of that number (a number given again is a new player)
export const TRAIN = kind({ name: 'train', code: 4, authority: 'owner', max: 1, idMin: 1, idMax: MAX_PLAYERS,
  fields: { mode: F.oneOf(MODES), full: F.bool(), bodies: F.list(BODY, 3, 3), // tractor, trailer, wagon
    riders: F.list(F.obj({ id: F.uint(2, MAX_ID), slot: F.uint(1, 11), flying: F.bool(), x: XZ, y: Y, z: XZ, yaw: F.angle() }), LIMIT.riders) } });
export const KINDS = [ANIMAL, TREE, PLAYER, TRAIN];
// M-22: a carried animal's position comes from its owner's train, so its record holds none (and does not change while it rides)
export function animalRecord(a) {
  if (a.state === 'gone') return null; // not replicated: a keyframe leaves it out
  const held = HELD.has(a.state), carried = held || a.state === 'carried'; // held: the host's own train has it (M-15)
  return { type: a.type, golden: !!a.golden, hidden: !!a.hidden, home: a.home === 'yard' ? 'yard' : 'route', state: carried ? 'carried' : a.state === 'toBarn' ? 'busy' : 'free',
    owner: held ? 1 : carried ? a.owner ?? 0 : 0, epoch: a.epoch, x: carried ? 0 : a.x, y: carried ? 0 : a.y || 0, z: carried ? 0 : a.z, yaw: carried ? 0 : a.yaw,
    anim: carried || !ANIMS.includes(a.anim) ? 'idle' : a.anim, leader: a.leader ?? null, line: a.line || 0 };
}
export const animalRecords = herd => { const out = []; for (const a of herd.animals) { const r = animalRecord(a); if (r) out.push([a.id, r]); } return out.slice(0, LIMIT.animals); };
export const treeRecords = trees => trees.list.slice(0, LIMIT.trees).map(t => [t.id, { state: t.state }]);
export const playerRecords = roster => roster.map(p => [p.n, { body: p.paint.body, trim: p.paint.trim, away: !!p.away, join: p.join ?? 0 }]);
