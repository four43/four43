// test/mp.harness.mjs — two (or more) games in one process over the in-memory hub (M-52). No tests here.
import RAPIER from '@dimforge/rapier3d-compat';
import { createGame } from '../src/sim/game.js';
import { DT } from '../src/sim/physics.js';
import { createMemoryHub } from '../src/net/link.js';
import { createHostSync } from '../src/net/host.js';
import { createGuestSync } from '../src/net/guest.js';
import { quatAxes } from '../src/sim/tractor.js';

export const STILL = { thr: 0, steer: 0, horn: false };
export const PAINTS = [{ body: 'red', trim: 'yellow' }, { body: 'blue', trim: 'white' }, { body: 'green', trim: 'pink' }, { body: 'orange', trim: 'purple' }];
export async function mpWorld({ seed = 21, guests = 1, link = {}, join = true } = {}) {
  await RAPIER.init();
  const hub = createMemoryHub(link); let now = 0;
  const host = { name: 'host', events: [], game: createGame(RAPIER, { seed, power: 'medium' }) };
  host.net = hub.host(); host.sync = createHostSync({ game: host.game, net: host.net, paint: PAINTS[0] });
  const devs = [host];
  const addGuest = () => {
    const i = devs.length, g = { name: 'guest' + i, events: [], game: createGame(RAPIER, { seed: 1000 + i, power: 'medium' }) }; // its own solo farm until the welcome
    g.net = hub.join();
    g.sync = createGuestSync({ game: g.game, net: g.net, paint: PAINTS[i], onFarm: (s, n) => (g.game = createGame(RAPIER, { seed: s, power: 'medium', player: n })) });
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
// Move a device's whole (straight, parked) train so the tractor stands at (x, z) facing yaw (copied unchanged from test/game.test.mjs)
export const moveTrain = (g, x, z, yaw) => {
  const tb = g.tractor.body, p0 = tb.translation(), a = yaw - Math.PI / 2, q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, { f, u, r } = quatAxes(q);
  const list = [tb, ...g.train.cars.map(c => c.body)].map(b => { const t = b.translation(); return [b, g.tractorLocal(t.x, t.y, t.z, {})]; });
  for (const [b, l] of list) {
    b.setTranslation({ x: x + f.x * l.x + u.x * l.y + r.x * l.z, y: p0.y + f.y * l.x + u.y * l.y + r.y * l.z, z: z + f.z * l.x + u.z * l.y + r.z * l.z }, true);
    b.setRotation(q, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
};
