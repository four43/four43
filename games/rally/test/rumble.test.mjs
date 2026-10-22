// Controller rumble (rally-spec R7): the mixer turns wheels into two motor levels, the output sends them to pads that can
// rumble, and the stage view only rumbles while driving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRumble, DETECT, SURFACE_OF } from '../src/rumble.js';
import { rumbleOut } from '../src/rumbleOut.js';
import { SCENARIOS, PICKS, STRENGTH } from '../src/defs/rumble.js';
import { fakeCar } from '../src/rumbleLab.js';
import { blendSurface, surfaceOfKey } from '../src/surface.js';
import MATERIALS from '../src/defs/materials.js';

const DT = 1 / 60;
// The mechanics tests play option A at gain 1 everywhere, so retuning PICKS in the lab never breaks them.
const ALL_A = { ...Object.fromEntries(Object.keys(SCENARIOS).map(k => [k, { option: 'A', gain: 1 }])), road: { gain: 1 } };
const mixer = (over = {}) => createRumble({ ...ALL_A, ...over });
// Run a mixer for n seconds of one fakeCar; returns the per-frame outputs.
function run(args, secs = 1, mix = mixer(), gain = 1) {
  const out = [];
  for (let i = 0; i < Math.round(secs / DT); i++) { const m = mix.update(fakeCar(typeof args === 'function' ? args(i * DT) : args), DT, gain); out.push({ ...m }); }
  return out;
}
const energy = frames => frames.reduce((a, m) => a + m.strong + m.weak, 0) / frames.length;
const mean = (frames, k) => frames.reduce((a, m) => a + m[k], 0) / frames.length;

test('every Rally tyre material has a rumble surface, and every surface scenario a material', () => {
  for (const id of MATERIALS.ids) if (MATERIALS.get(id).game?.name) assert.ok(SURFACE_OF[id], `${id} has no rumble surface`);
  for (const [k, S] of Object.entries(SCENARIOS)) if (S.kind === 'surface') assert.ok(Object.values(SURFACE_OF).includes(k), k);
});

test('every scenario has options A..C with a description, and every pick names one', () => {
  for (const [k, S] of Object.entries(SCENARIOS)) {
    assert.deepEqual(Object.keys(S.options), ['A', 'B', 'C'], k);
    for (const o of Object.values(S.options)) assert.equal(typeof o.desc, 'string');
    assert.ok(S.options[PICKS[k].option], k);
  }
  assert.deepEqual(STRENGTH, { off: 0, light: 0.5, full: 1 });
});

test('the shipped picks: each names a real option; wheelspin is steady and lock-up pulses', () => {
  const { road, ...scenes } = PICKS;
  for (const [k, p] of Object.entries(scenes)) { assert.ok(SCENARIOS[k].options[p.option], k); assert.ok(p.gain >= 0 && p.gain <= 1.5, k); }
  assert.deepEqual(Object.keys(scenes).sort(), Object.keys(SCENARIOS).sort());
  assert.ok(road.gain >= 0 && road.gain <= 1, 'road noise is a master gain over the surfaces');
  // Wheelspin (C) is a steady buzz on the weak motor; lock-up (B) pulses: they can't be mistaken for each other.
  const spin = run({ speed: 8, spin: 0.6 }, 1, createRumble()), lock = run({ speed: 15, lock: 0.6 }, 1, createRumble());
  assert.ok(mean(spin, 'weak') > mean(spin, 'strong'));
  const flips = f => f.filter((m, i) => i && (m.strong > 0.1) !== (f[i - 1].strong > 0.1)).length;
  assert.ok(flips(lock) >= 10, `lock-up pulses (${flips(lock)} on/off flips in 1 s)`); assert.equal(flips(spin), 0, 'wheelspin is steady');
});

test('silent when stopped, airborne, or with rumble off', () => {
  assert.equal(energy(run({ surface: 'gravel', speed: 0 })), 0);
  const air = fakeCar({ surface: 'gravel', speed: 25 }); for (const w of air.wheels) w.contact = false;
  const mix = mixer(); let e = 0;
  for (let i = 0; i < 60; i++) { const m = mix.update(air, DT); e += m.strong + m.weak; }
  assert.equal(e, 0);
  assert.equal(energy(run({ surface: 'gravel', speed: 25 }, 1, mixer(), 0)), 0);
});

test('surfaces feel different: gravel busier than tarmac, ice quietest, and texture grows with speed', () => {
  const at = (surface, speed) => energy(run({ surface, speed }, 2));
  assert.ok(at('gravel', 20) > 2 * at('tarmac', 20), 'gravel vs tarmac');
  assert.equal(at('ice', 20), 0, 'ice (option A) is silent');
  assert.ok(at('gravel', 25) > at('gravel', 5), 'speed');
  assert.ok(at('sand', 20) > at('tarmac', 20));
  // Gravel's crackle (A) is on the weak motor; mud's squelch (A) on the strong one.
  const g = run({ surface: 'gravel', speed: 20 }, 2), m = run({ surface: 'mud', speed: 20 }, 2);
  assert.ok(mean(g, 'weak') > mean(g, 'strong')); assert.ok(mean(m, 'strong') > mean(m, 'weak'));
});

test('slow is a dull, occasional thud: sparse taps on the strong motor, busy texture only at speed', () => {
  const taps = frames => frames.reduce((n, m, i) => n + (m.strong + m.weak > 0.12 && !(i && frames[i - 1].strong + frames[i - 1].weak > 0.12) ? 1 : 0), 0);
  const slow = run({ surface: 'gravel', speed: 20 / 3.6 }, 10), fast = run({ surface: 'gravel', speed: 60 / 3.6 }, 10);
  assert.ok(taps(slow) / 10 < 2, `gravel at 20 km/h: ${taps(slow) / 10} taps/s`);
  assert.ok(taps(fast) > 3 * taps(slow), `60 km/h ${taps(fast)} vs 20 km/h ${taps(slow)}`);
  assert.ok(mean(slow, 'strong') > 2 * mean(slow, 'weak'), 'slow taps are on the strong motor'); // gravel A is a weak-motor crackle
  assert.ok(mean(fast, 'weak') > mean(fast, 'strong'), 'at speed the crackle is back on the weak motor');
});

test('planing: the road texture peaks around 70 km/h and fades at high speed; impacts do not fade', () => {
  const at = kmh => energy(run({ surface: 'gravel', speed: kmh / 3.6 }, 3));
  assert.ok(at(60) > at(30), 'still builds up to 60 km/h');
  assert.ok(at(140) < 0.6 * at(75), `140 km/h ${at(140).toFixed(3)} vs 75 km/h ${at(75).toFixed(3)}`);
  assert.ok(at(100) < at(75) && at(140) < at(100), 'a steady fade');
  assert.ok(at(140) > 0, 'never silent: a floor');
  const hit = kmh => { const m = mixer(), f = []; for (let i = 0; i < 30; i++) f.push({ ...m.update(fakeCar({ speed: kmh / 3.6, jolt: 3 * 0.5 ** (i * DT / 0.05) }), DT) }); return Math.max(...f.map(x => x.strong)); };
  assert.equal(hit(140), hit(60), 'an impact hits as hard at speed');
});

test('the picked option and its gain change the output', () => {
  const a = energy(run({ surface: 'tarmac', speed: 20 }, 1, mixer({ tarmac: { option: 'A', gain: 1 } })));
  const b = energy(run({ surface: 'tarmac', speed: 20 }, 1, mixer({ tarmac: { option: 'B', gain: 1 } })));
  const half = energy(run({ surface: 'tarmac', speed: 20 }, 1, mixer({ tarmac: { option: 'A', gain: 0.5 } })));
  assert.ok(a > 0); assert.equal(b, 0, 'B is silent'); assert.ok(Math.abs(half - a / 2) < 1e-9);
  // Partial or broken saved picks fall back to the defaults instead of throwing.
  assert.doesNotThrow(() => run({ surface: 'gravel', speed: 20, slide: 0.5 }, 0.2, createRumble({ gravel: { option: 'Z' } })));
});

test('blends split between their surfaces (track hand-overs, snow wearing to ice)', () => {
  const half = blendSurface(new Map(), surfaceOfKey('gravel'), surfaceOfKey('ice'), 5);
  assert.deepEqual(half.ids, ['rally-gravel', 'rally-ice']); assert.equal(half.w, 0.5);
  const car = s => { const c = fakeCar({ surface: 'gravel', speed: 20 }); for (const w of c.wheels) w.surf = s; return c; };
  const e = s => { const mix = mixer(), f = []; for (let i = 0; i < 120; i++) f.push({ ...mix.update(car(s), DT) }); return energy(f); };
  const g = e(surfaceOfKey('gravel')), b = e(half);
  assert.ok(b > 0.3 * g && b < 0.7 * g, `half gravel ${b} vs gravel ${g}`);
});

test('slide onset: the hit fires once when the slide starts, not again while it is held, and again on a new slide', () => {
  const mix = mixer({ slide: { option: 'A', gain: 1 } }), starts = [];
  let was = false;
  const depth = t => (t < 0.5 ? null : t < 2 ? 0.1 + 0.25 * Math.sin(t * 9) : t < 2.5 ? null : 0.5); // a drift wobbling below 'on' (not 'off'), a pause, a new one
  for (let i = 0; i < 180; i++) {
    mix.update(fakeCar({ speed: 20, slide: depth(i * DT) }), DT);
    const on = mix.active().slide; if (on && !was) starts.push(i); was = on;
  }
  assert.equal(starts.length, 2, `starts at ${starts}`);
  // The hit is the strong motor at 0.8 for the first 0.12 s; then the sustain (no hit) is much lighter on it.
  const f = run(t => ({ speed: 20, slide: 0.3 }), 0.5, mixer());
  assert.ok(f[1].strong >= 0.8); assert.ok(f[20].strong < 0.4);
});

test('a crawl is not a slide (slip angles are huge at walking pace)', () => {
  const mix = mixer(); mix.update(fakeCar({ speed: DETECT.slide.v - 1, slide: 1 }), DT);
  assert.equal(mix.active().slide, false);
});

test('wheelspin and lock-up drive different motors, and need the pedal', () => {
  const spin = run({ speed: 8, spin: 0.6 }, 1), lock = run({ speed: 15, lock: 0.6 }, 1);
  assert.ok(mean(spin, 'weak') > 0.1 && mean(spin, 'strong') < 0.01, 'spin is the weak motor');
  assert.ok(mean(lock, 'strong') > 0.1 && mean(lock, 'weak') < 0.01, 'lock-up is the strong motor');
  const noPedal = fakeCar({ speed: 15, lock: 0.6 }); noPedal.input.brake = 0;
  const mix = mixer(); mix.update(noPedal, DT); assert.equal(mix.active().lock, false);
  const coast = fakeCar({ speed: 8, spin: 0.6 }); coast.out.throttle = 0;
  mix.update(coast, DT); assert.equal(mix.active().spin, false);
});

test('braking: the limit warning comes before a lock, the lock takes over past the peak and ends the frame the wheel rolls', () => {
  const mix = mixer(), at = slip => { const m = { ...mix.update(fakeCar({ surface: 'tarmac', speed: 20, slip }), DT) }; return { m, ...mix.active() }; };
  assert.deepEqual([at(0.5).brake, at(0.5).lock], [false, false], 'light braking: nothing');
  const warn = []; for (let i = 0; i < 60; i++) warn.push(at(0.9));
  assert.ok(warn.every(f => f.brake && !f.lock), 'at 0.9 × peak: the warning, not a lock');
  assert.ok(mean(warn.map(f => f.m), 'weak') > 0.05, 'the warning is felt (option A: weak-motor ticks)');
  const lock = []; for (let i = 0; i < 60; i++) lock.push(at(1.6));
  assert.ok(lock.every(f => f.lock && !f.brake), 'past the peak: the lock, and the warning gives way');
  // Lock-up A is heavy ABS pulses: strong-motor pulses, on about half the frames, harder the deeper the lock.
  const pulses = slip => run({ speed: 20, slip }, 1), light = pulses(1.6), full = pulses(4);
  const on = light.filter(m => m.strong > 0.1).length; assert.ok(on > 15 && on < 45, `the ABS pulses pulse (${on}/60 frames on)`);
  assert.ok(Math.max(...light.map(m => m.strong)) >= 0.4 && mean(light, 'weak') === 0, 'a light lock: strong motor only');
  assert.ok(Math.max(...full.map(m => m.strong)) >= 0.75, 'a fully locked wheel: near full strength');
  const rolled = at(0.95); assert.equal(rolled.lock, false, 'released under the peak: the lock ends that frame'); assert.equal(rolled.brake, true, 'back to the warning');
  // The warning quickens towards the peak (speedHz): more on/off edges per second at 1.0 than at 0.8.
  const edges = slip => { const m2 = mixer(); let n = 0, was = false; for (let i = 0; i < 300; i++) { const on2 = m2.update(fakeCar({ surface: 'tarmac', speed: 20, slip }), DT).weak > 0.06; if (on2 && !was) n++; was = on2; } return n; };
  assert.ok(edges(1.0) > edges(0.8), `ticks quicken: ${edges(0.8)} at 0.8 vs ${edges(1.0)} at 1.0`);
});

test('a handbrake turn is not a lock-up; a front lock with the handbrake on still is', () => {
  const mix = mixer();
  // Rears locked by the handbrake while trailing the foot brake lightly (fronts at half their peak slip).
  for (let i = 0; i < 30; i++) mix.update(fakeCar({ surface: 'gravel', speed: 15, slip: 0.5, handbrake: true }), DT);
  assert.deepEqual([mix.active().lock, mix.active().brake], [false, false], 'the handbrake-locked rears are ignored');
  const car = fakeCar({ surface: 'gravel', speed: 15, slip: 1.6, handbrake: true });
  mix.update(car, DT); assert.equal(mix.active().lock, true, 'fronts locked under the foot brake');
});

test('suspension impact: one hit per landing, sized by the jolt, nothing for small chatter', () => {
  const hits = (jolts, mix = mixer()) => { const f = []; for (const j of jolts) f.push({ ...mix.update(fakeCar({ speed: 15, jolt: j }), DT), on: mix.active().impact }); return f; };
  const decay = (peak, n) => Array.from({ length: n }, (_, i) => peak * 0.5 ** (i * DT / 0.05)); // the car's jolt: a decaying peak
  assert.equal(energy(hits(Array(60).fill(1.1))), 0, 'chatter under the threshold (a respawn settling peaks ~1.1)');
  const small = hits(decay(2, 30)), big = hits(decay(6, 30));
  const starts = f => f.filter((m, i) => m.on && !(i && f[i - 1].on)).length;
  assert.equal(starts(small), 1); assert.equal(starts(big), 1, 'one landing, one hit (the cooldown)');
  assert.ok(Math.max(...big.map(m => m.strong)) > Math.max(...small.map(m => m.strong)), 'a landing hits harder than a bump');
  assert.ok(big.filter(m => m.strong > 0).length > small.filter(m => m.strong > 0).length, 'and lasts longer (A: lenK)');
  // Read mid-rise: the hit grows to the peak it reaches in its first frames.
  const rising = hits([1.5, 6, ...decay(6, 20)]), straight = hits(decay(6, 22));
  assert.equal(Math.max(...rising.map(m => m.strong)), Math.max(...straight.map(m => m.strong)));
  // Lumpy ground: separate bumps more than the cooldown apart each get their own hit.
  const lumps = []; for (let k = 0; k < 4; k++) lumps.push(...decay(2.5, 20)); // a bump every 1/3 s
  assert.equal(starts(hits(lumps)), 4);
  // A big landing's jolt stays over the threshold for longer than the cooldown as it decays: still one hit (browser
  // 2026-10-19: a 2 m drop fired twice); a genuine bounce later, rising again, is a second.
  const slow = Array.from({ length: 24 }, (_, i) => 6.5 * 0.5 ** (i * DT / 0.08));
  const felt = f => f.filter(m => m.strong > 0).length;
  assert.equal(felt(hits(slow)), felt(hits(decay(6.5, 24))), 'a slowly decaying landing is one hit, not a hit restarted');
  assert.equal(starts(hits([...slow, ...Array(10).fill(0.5), ...decay(1.8, 20)])), 2, 'the bounce after it is another');
  assert.equal(energy(hits(decay(6, 30), mixer({ impact: { option: 'A', gain: 0 } }))), 0, 'its own gain');
  assert.ok(energy(hits(decay(6, 30), mixer({ road: { gain: 0 } }))) > 0, 'not road noise: road gain 0 keeps impacts');
});

test('jump landing: a touchdown after a flight pounds both motors flat out, replacing the impact; lumps without a flight do not', () => {
  const fly = (secs, jolt, mix = mixer()) => {
    const f = [];
    for (let i = 0; i < Math.round(secs / DT); i++) f.push({ ...mix.update(fakeCar({ speed: 18, air: true }), DT), ...mix.active() });
    for (let i = 0; i < 60; i++) f.push({ ...mix.update(fakeCar({ speed: 17, jolt: jolt * 0.5 ** (i * DT / 0.05) }), DT), ...mix.active() });
    return f;
  };
  const big = fly(0.6, 4), hop = fly(0.25, 1.5);
  assert.ok(big.some(m => m.landing) && !big.some(m => m.impact), 'a landing, not an impact');
  const pound = big.filter(m => m.strong >= 0.99 && m.weak >= 0.99).length;
  assert.ok(pound * DT >= 0.3, `both motors flat out for ${(pound * DT).toFixed(2)} s`);
  assert.ok(Math.max(...hop.map(m => m.strong)) >= 0.75, 'even a short hop lands hard (floor 0.75)');
  assert.ok(hop.filter(m => m.strong > 0).length < big.filter(m => m.strong > 0).length, 'a longer flight pounds longer');
  const short = fly(0.1, 2.5);
  assert.ok(!short.some(m => m.landing) && short.some(m => m.impact), 'a 0.1 s skip is a bump, not a landing');
  assert.equal(energy(fly(0.6, 4, mixer({ landing: { option: 'A', gain: 0 } }))), 0, 'its own gain');
});

const fakePad = () => {
  const calls = [], stops = [], h = { paused: false, stop: r => { stops.push(r); } };
  const actuator = { playEffect: (type, p) => { calls.push(p.strongMagnitude + p.weakMagnitude > 0 ? ['play', { ...p }] : ['zero']); return Promise.resolve('preempted'); },
    reset: () => { calls.push(['reset']); return Promise.resolve(); } };
  // lp.pads: live Gamepads only (no null slots); one without an actuator (Firefox) is skipped
  return { calls, stops, h, out: rumbleOut({ pads: () => [{ index: 1, vibrationActuator: actuator }, { index: 2, id: 'no rumble' }], haptics: () => h }) };
};

test('rumbleOut: one engine stop per transition, exit always; nothing is sent while a pausing overlay is open (lion-hawk C-14, review focus)', () => {
  const { calls, stops, h, out } = fakePad();
  out.stop('menu');
  assert.deepEqual([calls, stops], [[], []], "nothing sent: nothing to stop; a pad's first sight is the engine's reset now");
  out.send({ strong: 0.5, weak: 0.25 });
  assert.equal(calls[0][0], 'play'); assert.equal(calls[0][1].strongMagnitude, 0.5); assert.equal(calls[0][1].weakMagnitude, 0.25);
  assert.ok(calls[0][1].duration >= 50);
  out.stop('menu'); out.stop('menu'); out.stop('finish');
  assert.deepEqual(stops, ['menu'], 'once per transition: the engine repeats its own zero + reset for 20 frames');
  assert.ok(calls.every(c => c[0] !== 'reset'), 'Rally resets nothing itself on a stop');
  out.stop('exit'); assert.deepEqual(stops, ['menu', 'exit'], 'the stage exit always stops');
  calls.length = 0; h.paused = true; out.send({ strong: 1, weak: 1 });
  assert.deepEqual(calls, [], 'paused: no effect is sent (spec C-14)');
  h.paused = false; out.send({ strong: 1, weak: 1 }); assert.equal(calls.length, 1, 'sends again after the pause');
  calls.length = 0; out.kill();
  assert.deepEqual(calls, [['zero'], ['reset']], "kill (the ?rumble lab's pagehide, no engine there): one zero effect + reset on each pad with an actuator (B1)");
  assert.deepEqual(stops, ['menu', 'exit'], 'kill is not an engine stop');
  assert.doesNotThrow(() => rumbleOut({ pads: () => [] }).send({ strong: 1, weak: 1 }));
  assert.doesNotThrow(() => { const o = rumbleOut({ pads: () => undefined }); o.send({ strong: 1, weak: 1 }); o.stop('exit'); }, 'no seat yet, no haptics (autoStop off)');
});

test('rumbleOut: silent gaps between pulses (ABS) never reset, so a queued pulse is never cut; a long quiet is one zero + reset', () => {
  const { calls, stops, out } = fakePad();
  out.send({ strong: 0.8, weak: 0 }); calls.length = 0;
  for (let k = 0; k < 10; k++) { for (let i = 0; i < 3; i++) out.send({ strong: 0.8, weak: 0 }); for (let i = 0; i < 3; i++) out.send({ strong: 0, weak: 0 }); }
  assert.equal(calls.filter(c => c[0] === 'reset').length, 0, 'no reset inside a pulse train');
  assert.equal(calls.filter(c => c[0] === 'zero').length, 10, 'each gap ends its pulse with one queued zero effect');
  assert.equal(calls.filter(c => c[0] === 'play').length, 30);
  calls.length = 0;
  for (let i = 0; i < 40; i++) out.send({ strong: 0, weak: 0 });
  assert.equal(calls.filter(c => c[0] === 'reset').length, 1, 'a quarter second of quiet while driving ends with one zero + reset');
  assert.deepEqual(stops, [], 'not an engine stop: no menu, finish or exit');
});

test('road noise: one master gain over every surface, not the events', () => {
  const at = road => energy(run({ surface: 'gravel', speed: 20 }, 2, mixer({ road: { gain: road } })));
  assert.ok(Math.abs(at(0.4) - 0.4 * at(1)) < 1e-9 && at(0) === 0);
  const lock = road => energy(run({ speed: 20, slip: 3 }, 1, mixer({ road: { gain: road } })));
  assert.equal(lock(0), lock(1), 'the lock-up pulses keep their strength');
  assert.equal(PICKS.road.gain, 0.4);
});
