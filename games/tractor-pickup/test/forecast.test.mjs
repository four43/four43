import test from 'node:test';
import assert from 'node:assert/strict';
import { createForecast, extrapolate, newPose, FORECAST } from '../src/net/forecast.js';
import { createPlayers, stepStamp, SEND } from '../src/net/players.js';
import { DT } from '../src/sim/physics.js';
import { makeRng } from '../src/sim/rng.js';
import { mpWorld } from './mp.harness.mjs';

const near = (a, b, e, msg) => assert.ok(Math.abs(a - b) <= e, `${msg}: ${a} vs ${b}`);
const yawQ = a => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const body = (x, z, o = {}) => ({ p: { x, y: 0.5, z }, q: yawQ(0), v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 }, dirt: 0, ...o });
const rec = (x, vx = 6, o = {}) => ({ mode: 'drive', full: false, riders: [], ...o, bodies: [0, -3, -6].map(d => body(x + d, 0, { v: { x: vx, y: 0, z: 0 } })) });

test('a body moves on at its velocity and turns at its spin (M-65)', () => {
  const out = newPose(), b = body(1, 2, { v: { x: 3, y: 0, z: -1 }, w: { x: 0, y: Math.PI, z: 0 } });
  extrapolate(b, 0.5, out);
  near(out.p.x, 2.5, 1e-9, 'x'); near(out.p.z, 1.5, 1e-9, 'z'); near(out.p.y, 0.5, 1e-9, 'y');
  near(out.q.y, Math.sin(Math.PI / 4), 1e-9, 'a quarter turn about y'); near(out.q.w, Math.cos(Math.PI / 4), 1e-9, 'w');
  extrapolate({ p: { x: 1, y: 0, z: 0 }, q: yawQ(0) }, 1, out); near(out.p.x, 1, 0, 'a record with no velocity holds still');
});

// The host's real send pattern as main.js makes it: frames at hz with timing jitter, fixed 60 Hz steps (0, 1 or 2 a frame), a train frame
// every SEND.train, stamped with stepStamp; the guest draws every frame. The host tractor drives at 6 m/s.
function drive({ hostHz = 60, guestHz = 60, spike = 0.05, seed = 7, vx = 6, curve = 0 } = {}) {
  const rng = makeRng(seed), loop = hz => { const out = []; let acc = 0, last = 0, t = 0, k = 0;
    while (t < 8000) { t += 1000 / hz + (rng.next() - 0.5) * 3; const dt = Math.min(0.1, (t - last) / 1000); last = t; acc = Math.min(acc + dt, 3 * DT);
      const steps = []; while (acc >= DT) { steps.push({ stamp: stepStamp(t, acc), k: ++k }); acc -= DT; } out.push({ now: t, steps }); } return out; };
  const at = k => { const s = k * DT; return curve ? { x: Math.sin(curve * s) * vx / curve, z: (1 - Math.cos(curve * s)) * vx / curve, yaw: curve * s } : { x: vx * s, z: 0, yaw: 0 }; };
  const H = loop(hostHz), G = loop(guestHz), msgs = []; let lastTrain = -Infinity;
  for (const f of H) for (const s of f.steps) if (s.stamp - lastTrain >= SEND.train) { lastTrain = s.stamp; 
    const bodies = [0, 1, 2].map(i => { const B = at(s.k - i * 30); return body(B.x, B.z, { q: yawQ(-B.yaw), v: { x: vx * Math.cos(B.yaw), y: 0, z: vx * Math.sin(B.yaw) }, w: { x: 0, y: -curve, z: 0 } }); });
    msgs.push({ time: Math.floor(s.stamp), arrive: s.stamp + 4 + rng.next() * 6 + (rng.next() < spike ? 80 + rng.next() * 120 : 0), rec: { mode: 'drive', full: false, riders: [], bodies }, k: s.k }); }
  msgs.sort((a, b) => a.arrive - b.arrive);
  const pl = createPlayers(); pl.ensure(1); let i = 0, stamp = 0; const shown = [];
  for (const f of G) { for (const s of f.steps) { stamp = s.stamp; while (i < msgs.length && msgs[i].arrive <= stamp) { pl.push(1, msgs[i].time, msgs[i].rec, stamp, []); i++; } pl.sample(stamp); }
    pl.drawAt(f.now, null); const p = pl.map.get(1).pose; if (p && f.now > 1500) shown.push({ t: f.now, x: p.tractor.p.x, z: p.tractor.p.z, truth: at((f.now) / (DT * 1000)) }); }
  let se = 0, worst = 0, stalls = 0, lag = 0;
  for (let j = 2; j < shown.length; j++) { const a = shown[j - 2], b = shown[j - 1], c = shown[j], d = Math.hypot(c.x - b.x, c.z - b.z);
    se += (d / ((c.t - b.t) / 1000) - vx) ** 2; worst = Math.max(worst, Math.hypot(c.x - 2 * b.x + a.x, c.z - 2 * b.z + a.z)); if (d === 0) stalls++; lag = Math.max(lag, Math.hypot(c.x - c.truth.x, c.z - c.truth.z)); }
  return { speedRms: Math.sqrt(se / (shown.length - 2)), worstCm: worst * 100, stalls, lag };
}
test('the host tractor moves smoothly on the guest with the real send pattern and a bumpy wifi, at 60 and 120 Hz (M-65, M-69)', () => {
  for (const o of [{}, { hostHz: 120 }, { guestHz: 120 }, { hostHz: 40, guestHz: 120, seed: 3 }]) {
    const r = drive(o), at = JSON.stringify(o);
    assert.equal(r.stalls, 0, `${at}: no frame where it stands still`);
    assert.ok(r.speedRms < 0.3, `${at}: drawn speed off by ${r.speedRms.toFixed(2)} m/s rms`); // played back per step (before M-65): 1.5 m/s at 60 Hz, 6 m/s at 120 Hz
    assert.ok(r.worstCm < 3, `${at}: worst jump ${r.worstCm.toFixed(1)} cm`); // before: 20-36 cm
    assert.ok(r.lag < 0.25, `${at}: ${r.lag.toFixed(2)} m behind where it really is`); // before: 100-300 ms of driving (0.6-1.8 m)
  }
});
test('a turning tractor follows its curve (M-65)', () => {
  const r = drive({ curve: 0.8, spike: 0 });
  assert.equal(r.stalls, 0); assert.ok(r.worstCm < 3, `worst jump ${r.worstCm.toFixed(1)} cm`); assert.ok(r.lag < 0.3, `${r.lag.toFixed(2)} m off its curve`);
});
test('a record that disagrees with the forecast fades in; a far one jumps (M-65)', () => {
  const fc = createForecast(1), b = body(0, 0); fc.push(0, [b]); fc.sample(0, 0); near(fc.poses[0].p.x, 0, 1e-9, 'first record: where it is');
  fc.push(50, [body(0.5, 0)]); fc.sample(50, 50); near(fc.poses[0].p.x, 0, 1e-9, 'no jump');
  fc.sample(150, 150); const x1 = fc.poses[0].p.x; assert.ok(x1 > 0.25 && x1 < 0.5, `fading: ${x1}`);
  fc.sample(650, 650); near(fc.poses[0].p.x, 0.5, 0.01, 'there within half a second');
  fc.push(700, [body(0.5 + FORECAST.snap + 1, 0)]); fc.sample(700, 700); near(fc.poses[0].p.x, 0.5 + FORECAST.snap + 1, 1e-9, 'a respawn jumps');
  fc.push(750, [body(0, 0, { q: yawQ(1) })]); fc.sample(750, 750); fc.sample(1500, 1500); near(fc.poses[0].q.y, Math.sin(0.5), 1e-3, 'a turn fades in too');
});
test('the forecast holds 250 ms past the newest record when records stop (M-65)', () => {
  const fc = createForecast(1); fc.push(0, [body(0, 0, { v: { x: 6, y: 0, z: 0 } })]);
  fc.sample(100, 100); near(fc.poses[0].p.x, 0.6, 1e-9, 'moving on'); fc.sample(5000, 5000); near(fc.poses[0].p.x, 6 * FORECAST.horizon / 1000, 1e-9, 'then holds');
});
test('riders sit in their drawn car; the speed and the wheels come from the sent velocity, backward when reversing (M-66, M-67)', () => {
  const pl = createPlayers(); pl.ensure(2);
  const r = rec(10, -2, { riders: [{ id: 5, slot: 7, flying: false, x: 4.5, y: 1.3, z: 0.4, yaw: 0 }] }); // in the wagon (slot 6+), 0.5 m ahead of its center
  pl.push(2, 1000, r, 1000, []); pl.sample(1000); pl.sample(1100);
  const p = pl.map.get(2), wagon = p.pose.cars[1].p, c = p.carried[0];
  near(wagon.x, 4 - 0.2, 1e-6, 'the wagon moved on 100 ms backward');
  near(c.x - wagon.x, 0.5, 1e-6, 'x in the car'); near(c.y - wagon.y, 0.8, 1e-6, 'y'); near(c.z - wagon.z, 0.4, 1e-6, 'z'); near(c.yaw, p.yaw, 1e-9, 'facing with it');
  near(p.speed, 2, 1e-9, 'speed'); near(p.ahead, -2, 1e-9, 'reversing');
});
test('dirt replicates: the guest shows the host train as dirty as it is, and the host the guest one (M-68)', async () => {
  const w = await mpWorld({ seed: 31 }); w.seconds(1);
  const H = w.host.game, g = w.guests[0], G = g.game;
  H.dirt.tractor = 0.5; H.train.cars[0].dirt = 0.25; H.train.cars[1].dirt = 1; G.dirt.tractor = 0.75;
  w.seconds(0.5); // standing still on the road: the sim neither dirties nor cleans
  const onGuest = g.sync.players.map.get(1).dirt, onHost = w.host.sync.players.map.get(2).dirt;
  near(onGuest[0], H.dirt.tractor, 0.006, 'tractor'); near(onGuest[1], H.train.cars[0].dirt, 0.006, 'trailer'); near(onGuest[2], H.train.cars[1].dirt, 0.006, 'wagon');
  near(onHost[0], G.dirt.tractor, 0.006, 'guest tractor on the host');
});
