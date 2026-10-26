// test/helpers/feel.mjs — the overview §5.5 feel samples for Tractor Pickup (3l). No tests here. Run directly to print them:
//   node test/helpers/feel.mjs  →  { course: { seconds, boops }, bump: { bumps, separation } }
// courseRun: seed 14, started, trip off. The train is placed on route 0's third point facing along it; each step the stick points at
// the route point 12 m past the nearest one (searched forward from the last, so the run never jumps to another part of the route);
// the run ends within 8 m of the route's last point, or at `cap` s. boops: 'boop' events on the way (the herd is on the road).
// bumpRun: two peers (host seed 21); after the welcome the guest's train is turned to face the host's, 12 m apart, and both
// drive at each other for `seconds`. bumps: 'bump' events per peer; separation: the two tractors' distance at the end (each from its own sim).
import { pathToFileURL } from 'node:url';
import { headless, mp } from 'lion-hawk/test';
import { tractorGame } from '../../src/game.sim.js';
import { moveTrain } from '../../src/game/farm.js';

const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
export function courseRun({ seed = 14, route = 0, cap = 240 } = {}) {
  const h = headless(tractorGame(), { args: { seed, started: true, trip: false } });
  h.step(1);
  const s = h.engine.scene.state, R = s.game.road.routes[route].pts, last = R.length - 1;
  moveTrain(s.game, R[2].x, R[2].z, yawTo(R[2], R[3]), { ground: true });
  let boops = 0, k = 2, steps = 0;
  const off = h.engine.events.on(e => { if (e.type === 'boop') boops++; });
  for (; steps < cap * 60; steps++) {
    const t = s.game.tractor;
    if (Math.hypot(R[last].x - t.x, R[last].z - t.z) < 8) break;
    for (let j = k; j < Math.min(last, k + 40); j++) if (Math.hypot(R[j].x - t.x, R[j].z - t.z) < Math.hypot(R[k].x - t.x, R[k].z - t.z)) k = j;
    const g = R[Math.min(last, k + 12)], d = Math.hypot(g.x - t.x, g.z - t.z) || 1;
    h.step(1, { goX: (g.x - t.x) / d, goZ: (g.z - t.z) / d });
  }
  off();
  return { seconds: steps / 60, boops };
}
export function bumpRun({ seconds = 3 } = {}) {
  const w = mp(tractorGame(), { peers: 2, argsOf: i => ({ seed: i ? 1001 : 21, started: true, trip: false }) });
  const bumps = [0, 0];
  w.peers.forEach((p, i) => p.engine.events.on(e => { if (e.type === 'bump') bumps[i]++; }));
  w.seconds(3);
  const gs = w.peers.map(p => p.engine.scene.state.game), [a, b] = gs.map(g => g.tractor);
  moveTrain(gs[1], a.x + Math.sin(a.yaw) * 12, a.z + Math.cos(a.yaw) * 12, a.yaw + Math.PI, { ground: true });
  w.seconds(seconds, (p, i) => { const t = gs[i].tractor; return { goX: Math.sin(t.yaw), goZ: Math.cos(t.yaw) }; });
  return { bumps, separation: Math.hypot(a.x - b.x, a.z - b.z) };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const R = (await import('@dimforge/rapier3d-compat')).default; await R.init();
  console.log(JSON.stringify({ course: courseRun(), bump: bumpRun() }));
}
