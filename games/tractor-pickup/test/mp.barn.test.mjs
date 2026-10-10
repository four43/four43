// test/mp.barn.test.mjs — the barn lock (M-70..M-74): one show at a time in a room; the others wait at the barn, then show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mpWorld, moveTrain } from './mp.harness.mjs';
import { newRider } from '../src/sim/slots.js';

// a rider aboard (not a herd animal: the host never sees it as its own) and the train 20 m + extra out from the barn, facing in from end side (1 or -1)
function ready(d, side, extra = 0) {
  const g = d.game, b = g.farm.yard.barn, f = [Math.sin(b.yaw), Math.cos(b.yaw)], out = 20 + extra;
  g.load.land(g.load.reserve({ id: 900, state: 'ride', type: 'pig', golden: false, x: 0, y: 0, z: 0, ride: { rider: newRider() } }));
  moveTrain(g, b.x - side * f[0] * out, b.z - side * f[1] * out, side > 0 ? b.yaw : b.yaw + Math.PI);
}
// as main.js: a barnPass starts the show; it ends after showS (or never: Infinity), then the sticker card (mode 'reward'). Each device drives in while in 'drive'.
function play(w, s, { showS = 3, driving = w.devs } = {}) {
  const log = w.log ||= { shows: [], overlap: 0 };
  for (let k = 0; k < Math.round(s * 60); k++) {
    w.step(1, d => d.game.mode === 'drive' && driving.includes(d) ? { thr: 1, steer: 0, horn: false } : null);
    for (const d of w.devs) {
      for (let i = d.seen || 0; i < d.events.length; i++) if (d.events[i].type === 'barnPass') { d.game.startShow(); d.showEnd = w.now + showS * 1000; log.shows.push({ name: d.name, at: w.now }); }
      d.seen = d.events.length;
      if (d.game.mode === 'show' && w.now >= d.showEnd) d.game.mode = 'reward';
    }
    if (w.devs.filter(d => d.game.mode === 'show' && !d.gone).length > 1) log.overlap++;
  }
  return log;
}
const nOf = (w, d) => d === w.host ? 1 : d.sync.you;

test('host and guest arrive together: one show; the other waits at the barn with the first one shown, then its show starts by itself (M-70, M-71, M-72)', async () => {
  const w = await mpWorld({ seed: 71 }); w.seconds(1);
  const [H, G] = w.devs; ready(H, 1); ready(G, -1); w.seconds(0.3);
  play(w, 14, { showS: 3 }); // both reach 3/4 through in a few seconds; the first show ends at 3 s
  const { shows, overlap } = w.log;
  assert.equal(overlap, 0, 'never two shows at once');
  assert.equal(shows.length, 2, `shows: ${JSON.stringify(shows)}`);
  const gap = shows[1].at - shows[0].at; assert.ok(gap >= 3000 && gap < 3600, `the second show ${gap} ms after the first`);
  assert.ok(H.game.barnWait === 0 && G.game.barnWait === 0);
});
test('the waiting train says so (mode wait), and sees whose show has the barn (M-71, M-72)', async () => {
  const w = await mpWorld({ seed: 72 }); w.seconds(1);
  const [H, G] = w.devs; ready(G, 1); ready(H, -1, 10); w.seconds(0.3); // the guest is first
  play(w, 10, { showS: Infinity });
  assert.equal(G.game.mode, 'show'); assert.equal(H.game.mode, 'arrive'); assert.equal(H.game.barnWait, 2, 'the host waits for player 2');
  assert.equal(w.host.sync.barnHolder, 2); assert.equal(G.sync.barnHolder, 2);
  assert.equal(G.sync.players.map.get(1).latest.mode, 'wait', 'the guest sees the host train wait');
});
test('the guest that has the barn leaves mid-show: the waiting host goes on at once (M-73)', async () => {
  const w = await mpWorld({ seed: 73 }); w.seconds(1);
  const [H, G] = w.devs; ready(G, 1); ready(H, -1, 10); w.seconds(0.3);
  play(w, 10, { showS: Infinity }); assert.equal(H.game.barnWait, 2);
  G.net.leave(); G.gone = true; play(w, 0.5);
  assert.equal(H.game.mode, 'show'); assert.equal(H.game.barnWait, 0); assert.equal(w.host.sync.barnHolder, 1);
});
test('three players: guest 3 waits for guest 2; guest 2 goes away: guest 3 shows (M-72, M-73)', async () => {
  const w = await mpWorld({ seed: 74, guests: 2 }); w.seconds(1);
  const [H, G2, G3] = w.devs; ready(G2, 1); ready(G3, -1, 10); { const b = H.game.farm.yard.barn; moveTrain(H.game, b.x - Math.sin(b.yaw) * 40, b.z - Math.cos(b.yaw) * 40, b.yaw); } w.seconds(0.3); // the host parks out of the way, behind guest 2
  play(w, 10, { showS: Infinity, driving: [G2, G3] });
  assert.equal(G2.game.mode, 'show'); assert.equal(G3.game.barnWait, 2, 'guest 3 knows whose show it is'); assert.equal(w.host.game.mode, 'drive');
  w.hub.away(G2.net.id); G2.gone = true; play(w, 0.5, { driving: [] });
  assert.equal(G3.game.mode, 'show'); assert.equal(w.host.sync.barnHolder, 3);
});
test('a show that never ends gives the barn up after the hold time (M-73, R-1)', async () => {
  const w = await mpWorld({ seed: 75 }); w.seconds(1);
  const [H, G] = w.devs; ready(G, 1); ready(H, -1, 10); w.seconds(0.3);
  w.host.sync.barn.holdMs = 6000; play(w, 10, { showS: Infinity }); assert.equal(H.game.barnWait, 2);
  play(w, 4, { showS: Infinity }); assert.equal(H.game.mode, 'show', 'the host shows after the hold time'); assert.equal(w.host.sync.barnHolder, 1);
});
test('a guest waiting for the host barn goes on when the host is away: nobody can answer (M-73, R-1)', async () => {
  const w = await mpWorld({ seed: 76 }); w.seconds(1);
  const [H, G] = w.devs; ready(H, 1); ready(G, -1, 10); w.seconds(0.3);
  play(w, 10, { showS: Infinity }); assert.equal(H.game.mode, 'show'); assert.equal(G.game.barnWait, 1);
  w.hub.away(H.net.id); play(w, 0.3, { showS: Infinity }); assert.equal(G.game.mode, 'show');
});
test('a host with no guests yet shows at once, as in single player (M-70)', async () => {
  const w = await mpWorld({ seed: 77, join: false }); w.seconds(0.5);
  ready(w.host, 1); w.seconds(0.3); play(w, 10, { showS: Infinity });
  assert.equal(w.log.shows.length, 1); assert.equal(w.host.game.mode, 'show');
});
test('after a show the barn is free again: the next arrival gets it with no wait (M-73)', async () => {
  const w = await mpWorld({ seed: 78 }); w.seconds(1);
  const [H, G] = w.devs; ready(G, 1); w.seconds(0.3);
  play(w, 10, { showS: 1, driving: [G] }); assert.equal(G.game.mode, 'reward'); play(w, 0.3, { driving: [] }); assert.equal(w.host.sync.barnHolder, 0);
  ready(H, -1); w.seconds(0.3); play(w, 10, { showS: Infinity, driving: [H] });
  assert.equal(H.game.mode, 'show');
});
