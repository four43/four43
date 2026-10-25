// Controller rumble (rally-spec R9): four physical channels mixed into { strong, weak, left, right }, and the output that sends
// them to pads that can rumble (trigger motors where the pad has them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRumble, SURFACE_OF } from '../src/rumble/index.js';
import { createEngine } from '../src/rumble/engine.js';
import { createSuspension } from '../src/rumble/suspension.js';
import { createBody } from '../src/rumble/body.js';
import { createAid } from '../src/rumble/aid.js';
import { rumbleOut } from '../src/rumbleOut.js';
import { PARAMS, RANGES, STRENGTH, tuneParams } from '../src/defs/rumble.js';
import { surfaceOfKey, blendSurface } from '../src/surface.js';
import MATERIALS from '../src/defs/materials.js';

const DT = 1 / 60;
const MATERIAL = Object.fromEntries(Object.entries(SURFACE_OF).map(([id, k]) => [k, id.replace(/^rally-/, '')]));
const NO_SURFACE = { id: null, kp: 0.1, ap: 0.1 };
// A Vehicle's shape, as the channels read it. lock / spin: the worst wheel's slip over its peak (x); jolt: m/s on every wheel.
function car({ surface = 'gravel', surf = null, speed = 0, rpm = 900, throttle = 0, limiter = false, brake = 0, handbrake = 0,
  lock = 0, rearLock = lock, spin = 0, jolt = 0, air = false } = {}) {
  const s = surf ?? (surface ? surfaceOfKey(MATERIAL[surface]) : NO_SURFACE);
  return {
    speed, rpm, cfg: { mass: 1250, drive: { idle: 900, redline: 7500 } }, dt: { limiter },
    out: { throttle }, input: { brake, handbrake },
    wheels: [0, 1, 2, 3].map(i => ({
      contact: !air, front: i < 2, surf: s, drive: 100, jolt, alpha: 0,
      kappa: spin > 0 ? spin * s.kp : -(i < 2 ? lock : rearLock) * s.kp,
    })),
  };
}
const params = () => tuneParams();
// n seconds of one car through fn(car, dt) → levels; returns the per-frame copies
function run(fn, args, secs = 1) {
  const out = [];
  for (let i = 0; i < Math.round(secs / DT); i++) out.push({ ...fn(car(typeof args === 'function' ? args(i * DT) : args), DT) });
  return out;
}
const mean = (f, k) => f.reduce((a, m) => a + m[k], 0) / f.length;
const sum = (f, k) => f.reduce((a, m) => a + m[k], 0);

test('parameters: every Rally tyre material has a rumble surface with numbers, every number a slider range; saves are sanitised', () => {
  for (const id of MATERIALS.ids) if (MATERIALS.get(id).game?.name) assert.ok(PARAMS.suspension.surfaces[SURFACE_OF[id]], `${id} has no rumble surface`);
  const walk = (o, path) => { for (const k in o) typeof o[k] === 'object' ? walk(o[k], `${path}.${k}`) : assert.ok(RANGES[k], `${path}.${k} has no slider range`); };
  walk(PARAMS, 'PARAMS');
  const t = tuneParams({ engine: { idle: 0.2, bogus: 3 }, body: { dvOn: 'x' }, suspension: { surfaces: { ice: { rough: 0.01 } } } });
  assert.equal(t.engine.idle, 0.2); assert.equal(t.engine.bogus, undefined); assert.equal(t.body.dvOn, PARAMS.body.dvOn);
  assert.equal(t.suspension.surfaces.ice.rough, 0.01); assert.equal(t.suspension.surfaces.ice.spacing, PARAMS.suspension.surfaces.ice.spacing);
  assert.notEqual(tuneParams().engine, PARAMS.engine, 'a copy: the panel never edits the defaults');
  assert.deepEqual(STRENGTH, { off: 0, light: 0.5, full: 1 });
});

test('engine: weak motor only, rising with the revs and the throttle; pulses on the limiter', () => {
  const at = args => { const e = createEngine(PARAMS.engine); return run((c, dt) => e.update(c, dt), args, 0.5); };
  const idle = at({ rpm: 900 }), high = at({ rpm: 6000 }), loaded = at({ rpm: 6000, throttle: 1 });
  assert.equal(mean(loaded, 'strong'), 0);
  assert.ok(mean(idle, 'weak') > 0, 'idle hums');
  assert.ok(mean(high, 'weak') > mean(idle, 'weak') && mean(loaded, 'weak') > mean(high, 'weak'));
  assert.ok(mean(loaded, 'weak') < 0.2, 'very light');
  const lim = at({ rpm: 7600, throttle: 1, limiter: true }).map(m => m.weak);
  assert.ok(new Set(lim.map(v => v.toFixed(4))).size >= 2, 'the limiter pulses');
});

test('suspension: silent stopped and airborne; ice ≪ gravel; slow is sparse; the texture planes out at speed', () => {
  const at = (args, secs = 2, p = PARAMS.suspension) => { const s = createSuspension(p); return run((c, dt) => s.update(c, dt), args, secs); };
  const e = f => sum(f, 'strong') + sum(f, 'weak');
  assert.equal(e(at({ speed: 0 })), 0, 'stopped');
  assert.equal(e(at({ speed: 20, air: true })), 0, 'airborne');
  const gravel = e(at({ speed: 20 })), ice = e(at({ surface: 'ice', speed: 20 })), tarmac = e(at({ surface: 'tarmac', speed: 20 }));
  assert.ok(ice < 0.1 * gravel && tarmac < gravel, `ice ${ice.toFixed(2)}, tarmac ${tarmac.toFixed(2)}, gravel ${gravel.toFixed(2)}`);
  // Speed sweep on gravel: little at a crawl, a peak in between, less at 160 km/h (the spring soaks up the short bumps).
  const sweep = [2, 8, 15, 25, 45].map(v => e(at({ speed: v })));
  const peak = Math.max(...sweep);
  assert.ok(sweep[0] < 0.3 * peak, `crawl ${sweep[0].toFixed(2)} vs peak ${peak.toFixed(2)}`);
  assert.ok(sweep[4] < 0.8 * peak, `planing: 45 m/s ${sweep[4].toFixed(2)} vs peak ${peak.toFixed(2)}`);
  // Gain scales the texture only.
  const half = { ...PARAMS.suspension, gain: PARAMS.suspension.gain / 2 };
  assert.ok(Math.abs(e(at({ speed: 20 }, 2, half)) - gravel / 2) < 1e-9);
});

test('suspension: blends mix their surfaces; a real jolt adds onto both motors, under joltOn nothing', () => {
  const e = (args) => { const s = createSuspension(PARAMS.suspension), f = run((c, dt) => s.update(c, dt), args, 2); return sum(f, 'strong') + sum(f, 'weak'); };
  const mid = blendSurface(new Map(), surfaceOfKey('gravel'), surfaceOfKey('ice'), 5);
  const g = e({ speed: 20 }), i = e({ surface: 'ice', speed: 20 }), b = e({ surf: mid, speed: 20 });
  assert.ok(b < g && b > i, `blend ${b.toFixed(2)} between ice ${i.toFixed(2)} and gravel ${g.toFixed(2)}`);
  const s = createSuspension(PARAMS.suspension);
  const quiet = s.update(car({ surface: 'ice', speed: 0, jolt: PARAMS.suspension.joltOn - 0.1 }), DT);
  assert.deepEqual([quiet.strong, quiet.weak], [0, 0]);
  const hit = s.update(car({ surface: 'ice', speed: 0, jolt: PARAMS.suspension.joltFull }), DT);
  assert.equal(hit.strong, 1); assert.equal(hit.weak, PARAMS.suspension.joltWeak, 'a full landing pounds both motors');
});

test('body: a contact sized by its velocity change, decaying, bigger lasts longer; under dvOn nothing', () => {
  const hit = (dv, frames = 60) => { const b = createBody(PARAMS.body), f = [{ ...b.update(dv * 1250, 1250, DT) }]; for (let i = 1; i < frames; i++) f.push({ ...b.update(0, 1250, DT) }); return f; };
  assert.equal(sum(hit(PARAMS.body.dvOn * 0.9), 'strong'), 0);
  const small = hit(1), big = hit(5, 150);
  assert.ok(big[0].strong > small[0].strong && big[0].strong === 1);
  assert.equal(big[0].weak, PARAMS.body.weakShare);
  assert.ok(small[10].strong < small[0].strong, 'decays');
  const lasts = f => f.filter(m => m.strong > 0.05).length;
  assert.ok(lasts(big) > lasts(small));
  assert.equal(big.at(-1).strong, 0, 'and ends');
});

test('aid, brakes: a kick crossing near, once while held; the level rises to the peak; pulses past lock until under unlock', () => {
  const B = PARAMS.aid.brake, a = createAid(PARAMS.aid);
  const at = (x, n = 1, extra = {}) => { const f = []; for (let i = 0; i < n; i++) f.push({ ...a.update(car({ speed: 20, brake: 1, lock: x, ...extra }), DT) }); return f; };
  assert.equal(at(0.5)[0].left, 0, 'well under the peak: nothing');
  const kick = at(B.near + 0.01, 3);
  assert.equal(kick[0].left, B.kickAmp, 'the kick');
  assert.equal(at(B.near + 0.01, 30).at(-1).left < B.kickAmp, true, 'the kick ends; holding near the limit does not re-fire it');
  assert.ok(at(0.98)[0].left > at(B.near + 0.05)[0].left, 'the warning grows towards the peak');
  const pulses = at(1.5, 60).map(m => m.left);
  const flips = pulses.filter((v, i) => i && (v > 0) !== (pulses[i - 1] > 0)).length;
  assert.ok(flips >= 2 * B.pulseHz - 3, `ABS pulses at ~${B.pulseHz} Hz (${flips} flips in 1 s)`);
  assert.equal(Math.max(...pulses), B.amp);
  assert.equal(a.state().brake.locked, true);
  at(B.unlock + 0.02); assert.equal(a.state().brake.locked, true, 'hysteresis: still pulsing just over unlock');
  at(B.unlock - 0.02); assert.equal(a.state().brake.locked, false, 'back to the warning under the peak');
  at(B.rearm - 0.1); const again = at(B.near + 0.01)[0].left;
  assert.equal(again, B.kickAmp, 're-armed after easing off');
  assert.equal(at(0)[0].right, 0, 'brakes never touch the right trigger');
});

test('aid: the handbrake rears are ignored, a stopped car is no lock, and wheelspin is the right trigger with the throttle only', () => {
  const T = PARAMS.aid.traction;
  let a = createAid(PARAMS.aid);
  assert.equal(a.update(car({ speed: 15, brake: 1, handbrake: 1, lock: 0.3, rearLock: 4 }), DT).left, 0, 'handbrake turn');
  assert.ok(a.update(car({ speed: 15, brake: 1, handbrake: 1, lock: 1.5, rearLock: 4 }), DT).left > 0, 'a front lock still counts');
  a = createAid(PARAMS.aid);
  assert.equal(a.update(car({ speed: 0.5, brake: 1, lock: 2 }), DT).left, 0, 'stopped');
  a = createAid(PARAMS.aid);
  assert.equal(a.update(car({ speed: 5, spin: 2 }), DT).right, 0, 'spin without the throttle (a wheel catching up) is nothing');
  const f = []; for (let i = 0; i < 60; i++) f.push({ ...a.update(car({ speed: 5, spin: T.lock + 0.5, throttle: 1 }), DT) });
  assert.ok(f.some(m => m.right === T.amp) && f.some(m => m.right === 0), 'wheelspin pulses the right trigger');
  assert.equal(sum(f, 'left'), 0);
});

test('mix: the channels add per motor through a soft clip, × the setting; a mute takes a channel out', () => {
  const p = params(), r = createRumble(p);
  const big = { speed: 20, brake: 1, lock: 1.5, jolt: 6 };
  for (let i = 0; i < 5; i++) r.update(car(big), DT, { impulse: 5 * 1250 });
  const m = r.update(car(big), DT, { impulse: 5 * 1250 });
  for (const k of ['strong', 'weak', 'left', 'right']) assert.ok(m[k] >= 0 && m[k] <= 1, k);
  assert.ok(m.strong > 0.95, 'a big hit fills the strong motor');
  const half = createRumble(params()); for (let i = 0; i < 6; i++) half.update(car(big), DT, { impulse: 5 * 1250, gain: 0.5 });
  assert.ok(Math.abs(half.out.strong - m.strong / 2) < 1e-9, 'the setting scales the mix');
  const off = createRumble(params()); off.update(car(big), DT, { gain: 0 });
  assert.deepEqual({ ...off.out }, { strong: 0, weak: 0, left: 0, right: 0 });
  const q = createRumble(params()); q.mute.engine = true;
  const e = q.update(car({ speed: 0, rpm: 6000, throttle: 1, surface: 'ice' }), DT);
  assert.equal(e.weak, 0, 'engine muted');
  assert.ok(q.levels.engine.weak > 0, 'the meter still shows the muted channel');
  // The panel edits params in place, and the channels read them every frame.
  const live = createRumble(params()); live.params.engine.idle = 0;  live.params.engine.redline = 0;
  assert.equal(live.update(car({ rpm: 6000, throttle: 1, speed: 0 }), DT).weak, 0);
});

// A pad actuator that records calls; triggers: it lists 'trigger-rumble'. clock.t is the time (ms) rumbleOut sees.
const fakePad = (triggers = false, send = PARAMS.send) => {
  const calls = [], stops = [], h = { paused: false, stop: r => stops.push(r) }, clock = { t: 0 };
  const actuator = { effects: triggers ? ['dual-rumble', 'trigger-rumble'] : ['dual-rumble'],
    playEffect: (type, p) => { const on = p.strongMagnitude + p.weakMagnitude + (p.leftTrigger ?? 0) + (p.rightTrigger ?? 0) > 0; calls.push(on ? ['play', type, { ...p }] : ['zero', type]); return Promise.resolve('preempted'); },
    reset: () => { calls.push(['reset']); return Promise.resolve(); } };
  // lp.pads: live Gamepads only (no null slots); one without an actuator (Firefox) is skipped
  const out = rumbleOut({ pads: () => [{ index: 1, vibrationActuator: actuator }, { index: 2, id: 'no rumble' }], haptics: () => h, fold: () => 0.5, send: () => send, now: () => clock.t });
  // frames(n, m): n frames at 60 Hz, each sending m (or m(i))
  const frames = (n, m) => { for (let i = 0; i < n; i++) { clock.t += 1000 / 60; out.send(typeof m === 'function' ? m(i) : m); } };
  return { calls, stops, h, out, clock, frames };
};
const M = (strong = 0, weak = 0, left = 0, right = 0) => ({ strong, weak, left, right });
const writes = calls => calls.length; // every playEffect and reset is a write to the pad

test('rumbleOut: trigger pads get all four motors in one trigger-rumble; others get dual-rumble with the triggers folded onto weak', () => {
  const t = fakePad(true);
  t.frames(1, M(0.5, 0.2, 0.7, 0.1));
  assert.equal(t.calls[0][1], 'trigger-rumble');
  assert.deepEqual([t.calls[0][2].strongMagnitude, t.calls[0][2].weakMagnitude, t.calls[0][2].leftTrigger, t.calls[0][2].rightTrigger], [0.5, 0.2, 0.7, 0.1]);
  const d = fakePad(false);
  d.frames(1, M(0.5, 0.2, 0.7, 0.1));
  assert.equal(d.calls[0][1], 'dual-rumble');
  assert.equal(d.calls[0][2].leftTrigger, undefined);
  assert.ok(Math.abs(d.calls[0][2].weakMagnitude - (0.2 + 0.7 * 0.5)) < 1e-9, 'the bigger trigger × fold onto weak');
  const a = fakePad(false); a.frames(1, M(0, 0, 0.3, 0)); assert.equal(a.calls[0][0], 'play', 'the aid alone is enough to play');
});

// Playtest 2026-10-25 (Bluetooth Xbox pad, trigger-rumble): one effect per frame queued up below the page, so the pad kept
// rumbling through a pause and after the window closed. Every effect is a write to the pad: they are budgeted.
test('rumbleOut: a steady level is a keep-alive, not a write per frame; each effect outlasts the gap to the next', () => {
  const { calls, frames } = fakePad(true);
  frames(60, M(0.3, 0.1));
  assert.ok(writes(calls) <= Math.ceil(1000 / PARAMS.send.keepMs) + 1, `${writes(calls)} writes in 1 s of a steady level`);
  assert.ok(calls.every(c => c[2].duration > PARAMS.send.keepMs + 1000 / 60), 'no gap between keep-alives');
  assert.ok(calls.every(c => c[2].duration <= 300), 'and short: a lost stop ends by itself within 0.3 s');
});

test('rumbleOut: a level changing every frame is capped at one write per minMs', () => {
  const { calls, frames } = fakePad(true);
  frames(60, i => M(0.1 + 0.8 * (i % 2), 0));
  assert.ok(writes(calls) <= Math.ceil(1000 / PARAMS.send.minMs) + 1, `${writes(calls)} writes in 1 s`);
  const ramp = fakePad(true); ramp.frames(60, i => M(i / 60, 0));
  assert.ok(writes(ramp.calls) <= Math.ceil(1000 / PARAMS.send.minMs) + 1);
  assert.ok(Math.abs(ramp.calls.at(-1)[2].strongMagnitude - 1) < 0.1, 'the latest level gets through');
});

test('rumbleOut: ABS pulses (8 Hz) keep their on and off; a quiet is one zero effect and no reset', () => {
  const { calls, frames } = fakePad(true);
  frames(60, i => M(0, 0, (i * 8 / 60) % 1 < 0.5 ? 0.9 : 0)); // 8 pulses
  assert.equal(calls.filter(c => c[0] === 'zero').length, 8, 'each pulse ends with a zero');
  assert.ok(calls.filter(c => c[0] === 'play').length >= 8);
  assert.equal(calls.filter(c => c[0] === 'reset').length, 0, 'no reset: a reset writes too, and cancels a queued pulse');
  calls.length = 0;
  frames(60, M());
  assert.ok(writes(calls) <= 1, 'a long quiet writes nothing more');
});

test('rumbleOut: one engine stop per transition, exit always; nothing is sent while a pausing overlay is open (lion-hawk C-14)', () => {
  const { calls, stops, h, out, frames } = fakePad(true);
  out.stop('menu');
  assert.deepEqual([calls, stops], [[], []], "nothing sent: nothing to stop; a pad's first sight is the engine's reset");
  frames(1, M(0.5, 0.25));
  out.stop('menu'); out.stop('menu'); out.stop('finish');
  assert.deepEqual(stops, ['menu'], 'once per transition');
  assert.ok(calls.every(c => c[0] !== 'reset'), 'Rally resets nothing itself on a stop');
  out.stop('exit'); assert.deepEqual(stops, ['menu', 'exit'], 'the stage exit always stops');
  calls.length = 0; h.paused = true; frames(5, M(1, 1, 1, 1));
  assert.deepEqual(calls, [], 'paused: no effect is sent (spec C-14)');
  h.paused = false; frames(1, M(1, 1, 1, 1)); assert.equal(calls.length, 1, 'sends at once after the pause');
  assert.doesNotThrow(() => rumbleOut({ pads: () => [] }).send(M(1, 1)));
  assert.doesNotThrow(() => { const o = rumbleOut({ pads: () => undefined }); o.send(M(1, 1)); o.stop('exit'); }, 'no seat yet, no haptics (autoStop off)');
});
