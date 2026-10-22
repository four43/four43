// test/mp.engine.harness.mjs — mpWorld on the engine path (lion-hawk 2f T7, #75, #88): each device is a headless engine running
// tractorGame(), bound to one in-memory hub by a port (lion-hawk/test mp(), [T-11]), so every message reaches the syncs as a
// command at the next step. It is mpWorld (mp.harness.mjs re-exports it). No tests here. An input with goX is a stick for seat 0's
// controller; one with thr is the raw seam.
import RAPIER from '@dimforge/rapier3d-compat';
import { mp } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
import { HATS } from '../src/sim/progress.js';
import { STILL, PAINTS } from './mp.harness.mjs';

// clampProgress keeps only unlocked paints: 18 shows unlock every one PAINTS uses; the hats that unlocks stay off, as createGame has none
const progressOf = i => ({ shows: 18, hatsOff: HATS.map(h => h.id), paint: PAINTS[i % PAINTS.length] });
export async function engineWorld({ seed = 21, guests = 1, link = {}, join = true, clock = null } = {}) {
  await RAPIER.init(); // #6: before any engine is made
  let inputs = []; // this step's: [hostInput, guest1Input, ...] (missing = STILL), or a function (dev, index) -> input
  const devs = [], seen = []; // seen[i]() notes device i's live sync
  // a device: game (get/set) and sync (get) are the farm's (#88: tests reassign the game and replace sync methods); a sync the room
  // ended (net.peer closed) leaves state.net, and sync still names it, as the old harness's device kept its sync
  const device = p => {
    const st = () => p.engine.scene.state; let last = null;
    const d = { name: p.name, events: [], net: p.net, engine: p.engine, h: p.h,
      get game() { return st().game; }, set game(g) { st().game = g; },
      get sync() { const y = st().net?.sync; if (y) last = y; return y ?? last; } };
    seen.push(() => { last = st().net?.sync ?? last; });
    p.engine.events.on(e => { d.events.push(e); }); // every engine event, with its fields (the payload keeps its objects)
    devs.push(d); return d;
  };
  const w0 = mp(tractorGame({ clock: clock ?? undefined }), { peers: join ? 1 + guests : 1, link, clock: clock ?? undefined,
    argsOf: i => ({ seed: i ? 1000 + i : seed, started: true, trip: false, progress: progressOf(i) }), // a guest's own solo farm until the welcome
    beforeStep: (p, i) => { const d = devs[i]; seen[i](); const inp = (typeof inputs === 'function' ? inputs(d, i) : inputs[i]) || STILL;
      if ('goX' in inp) { p.engine.scene.state.raw = null; p.engine.input.set(inp); } else p.engine.scene.state.raw = inp; } }); // a world-frame stick goes through seat 0's controller (C-2); { thr, steer } is the raw seam
  for (const p of w0.peers) device(p);
  const step = (n = 1, inp = []) => { inputs = inp; try { w0.step(n); } finally { inputs = []; } };
  const seconds = (s, inp) => step(Math.round(s * 60), inp);
  const addGuest = () => device(w0.addPeer());
  return { hub: w0.hub, blackout: (s, o) => w0.blackout(s, o), host: devs[0], get guests() { return devs.slice(1); }, devs, step, seconds, addGuest,
    drop: d => { w0.drop(devs.indexOf(d)); }, // [T-22] the page vanishes (the hub reports peerLeft)
    rejoin: d => { const i = devs.indexOf(d); w0.rejoin(i); const p = w0.peers[i]; d.engine = p.engine; d.h = p.h; d.net = p.net; p.engine.events.on(e => { d.events.push(e); }); return d; }, // a reload: a new engine and transport, the same key
    get now() { return w0.now; } };
}
