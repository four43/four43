// Game loop (spec tracks T-20 … T-27): the hold, pace/run-up, progress, bests and the Game state
// machine driven headless by the autopilot. Run: node test/game.mjs [filter]
import R from '@dimforge/rapier3d-compat';
import { Sim, DT } from '../src/sim.js';
import { generateTrack } from '../src/gen/track.js';
import { TrackWorld, pointAt } from '../src/world/trackWorld.js';
import { makeLocator } from '../src/gen/locate.js';
import { placeRoadside } from '../src/gen/roadside.js';
import { allowedSpeed, runUpDistance, V_MAX } from '../src/game/pace.js';
import { makeProgress } from '../src/game/progress.js';
import { Game, READY_T, COUNT_T } from '../src/game/game.js';
import { MODES } from '../src/game/modes.js';
import { makeBests, bestKey } from '../src/game/bests.js';
import { autopilot } from './autopilot.js';
await R.init();

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${typeof val === 'number' ? +val.toFixed(3) : val}${unit}  [${lo}..${hi}]`);
  return ok;
}
const test = async (name, f) => { if (!only || name.includes(only)) { console.log(`\n# ${name}`); await f(); } };
const trackSim = (seed, kind, car = 'awd', opts = {}) => {
  const track = generateTrack(seed, { kind, theme: 'summer', ...opts });
  return { track, sim: new Sim(R, { world: new TrackWorld(track), car, assist: true }) };
};

await test('hold', () => {
  for (const car of ['awd', 'rwd']) {
    const { sim } = trackSim('h1', 'stage', car);
    for (let i = 0; i < 1 / DT; i++) sim.step(); // settle on the spawn
    const c = sim.car, p0 = { ...c.body.translation() };
    c.hold = true;
    Object.assign(c.input, { throttle: 1, brake: 0, steer: 0 });
    let rev = false, maxRpm = 0;
    for (let i = 0; i < 4 / DT; i++) { sim.step(); if (c.gear < 0) rev = true; maxRpm = Math.max(maxRpm, c.rpm); }
    const p1 = c.body.translation();
    check(`${car} held at full throttle: moved (m)`, Math.hypot(p1.x - p0.x, p1.z - p0.z), 0, 0.05);
    check(`${car} held: never reverse`, rev ? 1 : 0, 0, 0);
    check(`${car} held: engine revs (rpm)`, maxRpm, 4000, 9000);
    // Brake held at a standstill must not select reverse either (auto-reverse is off while held).
    Object.assign(c.input, { throttle: 0, brake: 1 });
    for (let i = 0; i < 1 / DT; i++) { sim.step(); if (c.gear < 0) rev = true; }
    check(`${car} held with brake: never reverse`, rev ? 1 : 0, 0, 0);
    c.hold = false;
    Object.assign(c.input, { throttle: 1, brake: 0 });
    for (let i = 0; i < 2 / DT; i++) sim.step();
    check(`${car} released: launches (m/s after 2 s)`, c.speed, 5, 30);
    check(`${car} released: in a forward gear`, c.gear, 1, 5);
  }
});

await test('pace', () => {
  for (const seed of ['ta1', 'ta2', 'ta3', 'ta4']) {
    const track = generateTrack(seed, { kind: 'loop', theme: seed === 'ta3' ? 'winter' : 'summer' });
    check(`${seed} run-up (m)`, runUpDistance(track, track.roadside.gates[0].s), 150, 400);
  }
  const straight = synthTrack('stage', 1000);
  check('allowed speed on a straight = V_MAX', allowedSpeed(straight, 500), V_MAX, V_MAX);
});

// Synthetic tracks for progress: a straight stage along +z, or a circular loop, sampled at 1 m,
// with gates and checkpoints placed as roadside.js does (start gate 40 m, checkpoints every 250).
function synthTrack(kind, length) {
  const n = kind === 'loop' ? length : length + 1, x = new Float32Array(n), z = new Float32Array(n);
  const curvature = new Float32Array(n), heading = new Float32Array(n), R0 = length / (2 * Math.PI);
  for (let i = 0; i < n; i++) {
    if (kind === 'loop') { const a = i / R0; x[i] = R0 * (1 - Math.cos(a)); z[i] = R0 * Math.sin(a); curvature[i] = 1 / R0; heading[i] = a; }
    else z[i] = i;
  }
  const layout = { kind, closed: kind === 'loop', ds: 1, n, x, z, heading, curvature, length };
  const roadside = placeRoadside(layout, () => 0, []);
  return { layout, roadside, locator: makeLocator(layout), surfaces: { sections: [{ s0: 0, s1: length, road: 'gravel', verge: 'grass' }] }, features: [] };
}
// Moves the car along the centreline from course position a to b (offset d), collecting events.
function drive(prog, track, a, b, d = 0, step = 2) {
  const ev = [], L = track.layout, dir = Math.sign(b - a);
  for (let p = a; dir > 0 ? p <= b : p >= b; p += dir * step) {
    const pt = pointAt(L, prog.lineS + p), h = Math.atan2(L.x[pt.j] - L.x[pt.i], L.z[pt.j] - L.z[pt.i]);
    ev.push(...prog.update(pt.x + d * Math.cos(h), pt.z - d * Math.sin(h)));
  }
  return ev;
}
const types = (ev) => ev.map((e) => e.type + (e.index !== undefined ? e.index : '')).join(' ');

await test('progress', () => {
  // Stage: 1000 m, start gate at 40, finish at 960 → checkpoints at p = 250, 500, 750.
  const st = synthTrack('stage', 1000), P = makeProgress(st);
  check('stage checkpoints', P.cps.length, 3, 3);
  check('stage lap length (m)', P.lapLength, 920, 920);
  P.reset(-4);
  let ev = drive(P, st, -4, 930);
  check(`stage in order: ${types(ev)}`, +(types(ev) === 'start checkpoint0 checkpoint1 checkpoint2 finish'), 1, 1);
  // Off the road (|d| 20 m) through checkpoint 1: not credited, missed raised once, finish blocked.
  P.reset(-4);
  ev = [...drive(P, st, -4, 400), ...drive(P, st, 402, 600, 20), ...drive(P, st, 602, 930)];
  check(`stage off-road cut: ${types(ev)}`, +(types(ev) === 'start checkpoint0 missed1 blocked1'), 1, 1);
  // Drive back past checkpoint 1 (backwards crossings don't count), then forwards to the finish.
  ev = [...drive(P, st, 930, 400), ...drive(P, st, 402, 930)];
  check(`stage back and through: ${types(ev)}`, +(types(ev) === 'checkpoint1 checkpoint2 finish'), 1, 1);
  check('stage missed cleared', +P.missed, 0, 0);
  // A teleport 120 m forward over a checkpoint credits nothing in between.
  P.reset(-4);
  ev = [...drive(P, st, -4, 200), ...drive(P, st, 320, 330)];
  check(`stage jump: ${types(ev)}`, +(types(ev) === 'start missed0'), 1, 1);

  // Loop: 1200 m circle, line at 40 → checkpoints at p 250, 500, 750, 1000 (1150 is too close).
  const lp = synthTrack('loop', 1200), Q = makeProgress(lp);
  check('loop checkpoints', Q.cps.length, 4, 4);
  Q.reset(-200); // a run-up before the line
  ev = drive(Q, lp, -200, 2410);
  check(`loop two laps: ${types(ev)}`, +(types(ev) === 'start checkpoint0 checkpoint1 checkpoint2 checkpoint3 line checkpoint0 checkpoint1 checkpoint2 checkpoint3 line'), 1, 1);
  check('loop laps valid', ev.filter((e) => e.type === 'line' && e.valid).length, 2, 2);
  check('loop lap count', Q.lap, 2, 2);
  // A cut lap is invalid but the next lap still starts.
  ev = [...drive(Q, lp, 2410, 2800), ...drive(Q, lp, 2802, 3000, 25), ...drive(Q, lp, 3002, 3610)];
  const line = ev.find((e) => e.type === 'line');
  check(`loop cut lap invalid: ${types(ev)}`, +(line && !line.valid), 1, 1);
  check('loop next lap starts at checkpoint 0', Q.next, 0, 0);
  check('loop missed cleared at the line', +Q.missed, 0, 0);
});

// In-memory stand-in for localStorage; `broken` throws like Safari private mode used to.
const memStore = (broken = false) => {
  const m = new Map();
  return { getItem: (k) => { if (broken) throw new Error('denied'); return m.get(k) ?? null; },
    setItem: (k, v) => { if (broken) throw new Error('denied'); m.set(k, v); } };
};

await test('bests', () => {
  const b = makeBests(memStore());
  b.put('k', { time: 100 });
  check('bests round trip', b.get('k').time, 100, 100);
  check('bests unknown key → null', +(b.get('x') === null), 1, 1);
  const bad = makeBests(memStore(true));
  bad.put('k', { time: 1 });
  check('broken storage: put is harmless, get → null', +(bad.get('k') === null), 1, 1);
  const track = { seed: 's', kind: 'stage', style: 'twisty', theme: 'summer', density: 'mild' };
  check(`key ${bestKey('stage', track, 'awd')}`, +(bestKey('stage', track, 'awd') === 'stage|s|stage|twisty|summer|mild|awd'), 1, 1);
});

// Runs the game with the autopilot driving (60 Hz control, like the track tests) until
// until(game, events) is true or maxTime s of sim time pass. Returns the events seen.
function play(game, track, { maxTime = 600, until, onEvent } = {}) {
  const sim = game.sim, ev = [], every = Math.round(1 / (60 * DT));
  const off = game.on((e) => { ev.push({ ...e, at: sim.time }); onEvent?.(e); });
  for (let i = 0; i < maxTime / DT; i++) {
    if (i % every === 0 && game.state === 'running') {
      const c = autopilot(sim, track);
      Object.assign(sim.car.input, { steer: c.steer, throttle: c.throttle, brake: c.brake, handbrake: 0 });
    }
    game.step(); sim.step();
    if (until && until(game, ev)) break;
  }
  off();
  return ev;
}

await test('game stage', () => {
  const { track, sim } = trackSim('g1', 'stage');
  const game = new Game(sim, { bests: makeBests(memStore()) });
  game.setMode(MODES.stage, 'awd');
  game.title();
  check('title holds the car', +sim.car.hold, 1, 1);
  const t0 = sim.time;
  game.begin();
  check('begin → ready', +(game.state === 'ready'), 1, 1);
  let goAt = null;
  const ev = play(game, track, { until: (g) => g.state === 'finished', onEvent: (e) => { if (e.type === 'count' && e.n === 0) goAt = sim.time; } });
  const counts = ev.filter((e) => e.type === 'count').map((e) => e.n).join('');
  check(`countdown 3-2-1-Go: ${counts}`, +(counts === '3210'), 1, 1);
  check('ready + countdown (s)', goAt - t0, READY_T + COUNT_T - DT, READY_T + COUNT_T + 2 * DT);
  check('finished', +(game.state === 'finished'), 1, 1);
  const fin = ev.find((e) => e.type === 'finish');
  check('clock = sim time since Go (s)', Math.abs(fin.time - (fin.at - goAt)), 0, 2 * DT);
  check('one split per checkpoint', ev.filter((e) => e.type === 'split').length, game.progress.cps.length, game.progress.cps.length);
  check('first run is a best', +fin.isBest, 1, 1);
  console.log(`      stage ${track.layout.length.toFixed(0)} m in ${fin.time.toFixed(2)} s`);
  // Rolls to a stop after the finish.
  play(game, track, { maxTime: 15 });
  check('stopped after the finish (m/s)', Math.abs(sim.car.speed), 0, 0.3);

  // Second run, the same: splits now have deltas; a slower or equal time isn't a new best.
  game.restart();
  const ev2 = play(game, track, { until: (g) => g.state === 'finished' });
  const sp = ev2.filter((e) => e.type === 'split');
  check('second run splits have deltas', sp.filter((e) => e.delta !== null).length, sp.length, sp.length);
  const fin2 = ev2.find((e) => e.type === 'finish');
  check('second run delta = time − prev (s)', Math.abs(fin2.delta - (fin2.time - fin.time)), 0, 1e-9);
  check('best kept only if faster', +(fin2.isBest === fin2.time < fin.time), 1, 1);
  check('saved best is the faster', game.bests.get(game.key).time, Math.min(fin.time, fin2.time), Math.min(fin.time, fin2.time));

  // Teleport over a checkpoint: missed, and the finish is blocked until it's driven through.
  game.restart();
  const L = track.layout, P = () => game.progress;
  let jumped = false, back = false;
  const ev3 = play(game, track, {
    until: (g) => g.state === 'finished',
    onEvent: (e) => {
      if (e.type === 'split' && e.index === 0 && !jumped) {
        jumped = true; // land 60 m past checkpoint 1
        const p = pointAt(L, P().lineS + P().cps[1] + 60);
        sim.car.reset({ x: p.x, y: p.road(track.terrain.road) + 0.6, z: p.z }, p.yaw);
      }
      if (e.type === 'blocked' && !back) {
        back = true; // drive back to just before checkpoint 1
        const p = pointAt(L, P().lineS + P().cps[1] - 80);
        sim.car.reset({ x: p.x, y: p.road(track.terrain.road) + 0.6, z: p.z }, p.yaw);
      }
    },
  });
  const seq = ev3.filter((e) => ['missed', 'blocked', 'finish'].includes(e.type)).map((e) => e.type).join(' ');
  check(`teleport: ${seq}`, +(seq === 'missed blocked finish'), 1, 1);
});

await test('game time attack', () => {
  for (const seed of ['ta1', 'ta2']) {
    const { track, sim } = trackSim(seed, 'loop');
    const game = new Game(sim, { bests: makeBests(memStore()) });
    game.setMode(MODES.timeAttack, 'awd');
    game.begin();
    const off = -game.startPose().off;
    let clockAtLine = null;
    const ev = play(game, track, {
      maxTime: 500,
      until: (g, e) => e.filter((x) => x.type === 'lap').length >= 2,
      onEvent: (e) => { if (e.type === 'start') clockAtLine = game.time + game.lapTime; },
    });
    check(`${seed} run-up (m)`, off, 150, 400);
    check(`${seed} clock still 0 at the flying start`, clockAtLine ?? -1, 0, 0);
    const laps = ev.filter((e) => e.type === 'lap');
    check(`${seed} laps`, laps.length, 2, 2);
    check(`${seed} laps valid`, laps.filter((l) => l.valid).length, 2, 2);
    check(`${seed} lap 1 (s)`, laps[0]?.time ?? 0, 30, 250);
    check(`${seed} lap 2 has a delta`, +(laps[1]?.delta !== null), 1, 1);
    check(`${seed} game.laps recorded`, game.laps.length, 2, 2);
    console.log(`      ${seed} loop ${track.layout.length.toFixed(0)} m, laps ${laps.map((l) => l.time.toFixed(2)).join(' / ')} s`);
  }
});

await test('game free drive', () => {
  const { sim } = trackSim('g1', 'loop');
  const game = new Game(sim);
  game.setMode(MODES.freeDrive);
  game.begin();
  check('free drive starts running', +(game.state === 'running'), 1, 1);
  check('free drive not held', +sim.car.hold, 0, 0);
  game.pause();
  check('pause', +(game.state === 'paused'), 1, 1);
  game.resume();
  check('resume → running', +(game.state === 'running'), 1, 1);
});

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
