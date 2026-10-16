// Remote trains (lion-hawk 3l, N-12 driven; user decision 2026-10-13: other players' tractors are solid): another player's tractor,
// trailer and wagon as solid jointed bodies in this World. The net part spawns the three entities from spawnTrainDesc (3i Contract
// issue 1: the cars are linked as e.trailer and e.wagon) and calls attachRemoteTrain for what a desc cannot hold (the vehicle kit, the
// hitch joints); stepRemoteTrains drives each from its owner's replicated input before the Rapier step (N-13). Sim-pure.
import { tractorDesc, attachTractor } from './tractor.js';
import { carDesc, attachTrain } from './hitch.js';
import { DT } from './ground.js';
const games = new WeakMap(); // World → the farm game on it (the kind hooks get only the World)
export const bindTrains = (world, game) => { games.set(world, game); };
const yawQ = q => Math.atan2(1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.z - q.w * q.y)); // the chassis heading (+x forward)
// A remote record crosses a trust boundary (another player's device): only its known pose fields are read, positions must be finite
// and are clamped to the farm (±BOUND m, height ±HEIGHT), quaternions finite and normalised. A record that fails is not used (the last
// good one stands) and is counted in TRAIN_STATS.rejected.
export const TRAIN_STATS = { rejected: 0 };
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 }), BOUND = 400, HEIGHT = 50, fin = Number.isFinite, clamp = (v, m) => Math.max(-m, Math.min(m, v));
export function safePose(b) {
  const p = b?.p, q = b?.q;
  if (!p || !q || ![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(fin)) return null;
  const l = Math.hypot(q.x, q.y, q.z, q.w); if (!(l > 1e-6)) return null;
  return { at: [clamp(p.x, BOUND), clamp(p.y, HEIGHT), clamp(p.z, BOUND)], q: [q.x / l, q.y / l, q.z / l, q.w / l] };
}
// the record's three poses, checked; null (and counted) when any fails
export function safeTrain(rec) {
  const body = safePose(rec?.body), trailer = safePose(rec?.trailer), wagon = safePose(rec?.wagon);
  if (body && trailer && wagon) return { body, trailer, wagon };
  TRAIN_STATS.rejected++; return null;
}
const LAST = new WeakMap(); // entity → its last good poses (a rejected record keeps them)
const FALLBACK = { body: { at: [0, 0.3, 0], q: [0, 0, 0, 1] } }; FALLBACK.trailer = { at: [-4, 0.3, 0], q: [0, 0, 0, 1] }; FALLBACK.wagon = { at: [-8, 0.3, 0], q: [0, 0, 0, 1] };
const asQ = a => ({ x: a[0], y: a[1], z: a[2], w: a[3] });
// the remote train's spawn desc, built from explicit fields: the local train's descs at the record's checked poses (the net part keeps
// a driven body as given). A rejected record spawns the train parked at the farm centre until a good one corrects it
export function spawnTrainDesc(rec) {
  const P = safeTrain(rec) ?? FALLBACK, b = P.body;
  const car = c => { const d = carDesc({ translation: () => ({ x: c.at[0], y: c.at[1], z: c.at[2] }), rotation: () => asQ(c.q) }, ORIGIN); d.at = c.at; d.q = c.q; return d; };
  const d = tractorDesc({ x: b.at[0], z: b.at[2], yaw: yawQ(asQ(b.q)) }); d.at = b.at; d.q = b.q;
  d.trailer = car(P.trailer); d.wagon = car(P.wagon);
  return d;
}
// the game fields of a remote record, checked: only known fields, of the right types (riders capped); false when the poses fail
const MODES = new Set(['drive', 'show', 'held', 'wait']);
export function applyTrainRecord(e, rec) {
  const P = safeTrain(rec); if (!P) return false;
  LAST.set(e, P);
  e.mode = MODES.has(rec.mode) ? rec.mode : 'drive'; e.full = rec.full === true;
  const d = Array.isArray(rec.dirt) ? rec.dirt : [], dirt = e.dirt ??= [0, 0, 0];
  for (let i = 0; i < 3; i++) dirt[i] = fin(d[i]) ? Math.max(0, Math.min(1, d[i])) : 0;
  e.riders = Array.isArray(rec.riders) ? rec.riders.filter(r => r && [r.x, r.y, r.z, r.yaw].every(fin) && Number.isInteger(r.id) && Number.isInteger(r.slot)).slice(0, 16) : [];
  return true;
}
export function attachRemoteTrain(e, world) {
  const game = games.get(world), materialAt = game?.ground?.materialAt ?? (() => 'route');
  const tractor = attachTractor(world, e, { power: 'medium', materialAt });
  const train = attachTrain(world, tractor, e.trailer, e.wagon);
  e.remote = { tractor, train }; e.mode ??= 'drive'; e.full ??= false; e.riders ??= []; e.dirt ??= [0, 0, 0];
}
export function stepRemoteTrains(world) {
  const self = world.net?.self ?? 0, list = world.with('net');
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; if (e.net !== 'train' || !e.remote || e.netId === self) continue;
    const { tractor, train } = e.remote, I = e.input;
    tractor.hold = e.mode !== 'drive'; tractor.setInput(I?.thr ?? 0, I?.steer ?? 0, I?.turn ?? 0); tractor.step(DT);
    train.step(DT, { parked: tractor.hold || (Math.abs(I?.thr ?? 0) < 0.05 && tractor.speed < 0.3) });
  }
}
