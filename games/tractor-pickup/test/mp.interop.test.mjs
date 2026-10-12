// NET_VERSION 3 on the wire (lion-hawk 2f T7, #91): an old-path device and an engine-path device play together over one hub.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { createMemoryHub, createPort } from 'lion-hawk/net';
import { tractorGame } from '../src/game.sim.js';
import { createGame } from '../src/sim/game.js';
import { createHostSync } from '../src/net/host.js';
import { createGuestSync } from '../src/net/guest.js';
import { HATS } from '../src/sim/progress.js';
import { disagreements, single, PAINTS, STILL } from './mp.harness.mjs';
await R.init();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function mixed({ engineHost }) {
  // clampProgress keeps only unlocked paints: 18 shows unlock every one PAINTS uses (the hats that unlocks stay off, as createGame has none)
  const hub = createMemoryHub(); let now = 0; const clock = () => now, devs = [];
  const oldDev = (isHost, i) => { const d = { name: isHost ? 'host' : 'guest' + i, events: [], game: createGame(R, { seed: isHost ? 31 : 1000 + i, power: 'medium' }) };
    d.net = isHost ? hub.host() : hub.join();
    d.sync = isHost ? createHostSync({ game: d.game, net: d.net, paint: PAINTS[i], clock }) : createGuestSync({ game: d.game, net: d.net, paint: PAINTS[i], clock, onFarm: (s, n) => (d.game = createGame(R, { seed: s, power: 'medium', player: n })) });
    d.tick = () => { d.events.push(...d.sync.before(now)); const ev = d.game.step(STILL); d.events.push(...ev); d.sync.after(ev, now); }; return d; };
  const newDev = (isHost, i) => { const h = headless(tractorGame(), { wall0: now, args: { seed: isHost ? 31 : 1000 + i, started: true, trip: false, progress: { shows: 18, stickers: [], paint: PAINTS[i], hatsOff: HATS.map(h => h.id), bookSeen: 0 } } });
    const net = isHost ? hub.host() : hub.join(), d = { name: isHost ? 'host' : 'guest' + i, h, net, events: [], get game() { return h.engine.scene.state.game; }, get sync() { return h.engine.scene.state.net.sync; } };
    createPort(h.engine, { transport: net, role: isHost ? 'host' : 'guest', clock }); d.tick = () => { h.engine.scene.state.raw = STILL; h.step(1); }; return d; };
  devs.push(engineHost ? newDev(true, 0) : oldDev(true, 0)); devs.push(engineHost ? oldDev(false, 1) : newDev(false, 1));
  const w = { hub, devs, host: devs[0], get guests() { return devs.slice(1); }, get now() { return now; },
    step(n = 1) { for (let k = 0; k < n; k++) { now += 1000 / 60; hub.tick(now); for (const d of devs) d.tick(); } }, seconds(s) { w.step(Math.round(s * 60)); } };
  return w;
}
for (const engineHost of [false, true]) test(`an ${engineHost ? 'engine host and an old guest' : 'old host and an engine guest'} agree (M-1, M-58)`, () => {
  const w = mixed({ engineHost }); w.seconds(1);
  assert.equal(w.guests[0].game.farm.seed, 31); assert.equal(w.guests[0].sync.you, 2);
  w.seconds(3); assert.deepEqual(disagreements(w), []);
  const H = w.host, G = w.guests[0], p2 = H.sync.players.map.get(2);
  assert.deepEqual(p2.paint, PAINTS[1], "the guest's hello paint");
  assert.ok(p2.latest && dist(p2.latest.bodies[0].p, G.game.tractor) < 0.3, "the host has the guest's train where it is (guest -> host frames)");
  // a cross-path boop: the guest's claim goes to the host, the grant comes back as the animal's record (M-13, M-14)
  const ha = single(H.game), ga = G.game.herd.animals[ha.id], p = G.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {});
  for (const x of [ha, ga]) { x.x = p.x; x.z = p.z; x.state = 'idle'; x.timer = 99; x.hidden = false; }
  w.seconds(3);
  assert.equal(ga.state, 'ride'); assert.equal(ha.state, 'carried'); assert.equal(ha.owner, 2);
  assert.equal(G.sync.store.get('animal', ha.id).owner, 2, "the guest's store has the grant"); assert.equal(G.sync.pending.size, 0);
  w.seconds(0.5); assert.ok(dist(ha, ga) < 0.6, `the host draws it in the guest wagon (${dist(ha, ga).toFixed(2)} m)`);
  assert.deepEqual(disagreements(w), []);
});
