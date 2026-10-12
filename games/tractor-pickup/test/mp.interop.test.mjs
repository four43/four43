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
import { disagreements, PAINTS, STILL } from './mp.harness.mjs';
await R.init();

function mixed({ engineHost }) {
  const hub = createMemoryHub(); let now = 0; const clock = () => now, devs = [];
  const oldDev = (isHost, i) => { const d = { name: isHost ? 'host' : 'guest' + i, events: [], game: createGame(R, { seed: isHost ? 31 : 1000 + i, power: 'medium' }) };
    d.net = isHost ? hub.host() : hub.join();
    d.sync = isHost ? createHostSync({ game: d.game, net: d.net, paint: PAINTS[i], clock }) : createGuestSync({ game: d.game, net: d.net, paint: PAINTS[i], clock, onFarm: (s, n) => (d.game = createGame(R, { seed: s, power: 'medium', player: n })) });
    d.tick = () => { d.events.push(...d.sync.before(now)); const ev = d.game.step(STILL); d.events.push(...ev); d.sync.after(ev, now); }; return d; };
  const newDev = (isHost, i) => { const h = headless(tractorGame(), { wall0: now, args: { seed: isHost ? 31 : 1000 + i, started: true, trip: false, progress: { shows: 0, stickers: [], paint: PAINTS[i], hatsOff: [], bookSeen: 0 } } });
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
});
