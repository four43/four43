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
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 }), at = b => ({ at: [b.p.x, b.p.y, b.p.z], q: [b.q.x, b.q.y, b.q.z, b.q.w] });
const front = b => ({ translation: () => b.p, rotation: () => b.q }); // carDesc's front: the record's own car pose (at/q win below)
// the remote train's spawn desc: the local train's descs at the record's poses (the net part keeps a driven body as given)
export function spawnTrainDesc(rec) {
  const b = rec.body, car = c => ({ ...carDesc(front(c), ORIGIN), ...at(c) });
  return { ...tractorDesc({ x: b.p.x, z: b.p.z, yaw: yawQ(b.q) }), ...at(b), trailer: car(rec.trailer), wagon: car(rec.wagon) };
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
