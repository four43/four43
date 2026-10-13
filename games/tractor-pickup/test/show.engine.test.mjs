// createShow's engine-path options (lion-hawk 2g G3): waits on update(dt) time, a skip button from the caller, and the layer's
// gestures left to the caller. show.test.mjs keeps testing the defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShow, SHOW } from '../src/ui/show.js';
import { buildShowSteps } from '../src/sim/showSteps.js';

class El {
  constructor() { this.children = []; this.style = {}; this.on = {}; this.hidden = false; this.className = ''; this.innerHTML = ''; this.textContent = ''; this.classList = { add() {}, remove() {} }; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { (this.on[t] ||= []).push(f); }
  setAttribute() {}
  querySelector() { return null; }
  remove() {}
}
globalThis.document ??= { createElement: () => new El() }; globalThis.innerWidth ??= 1180; globalThis.innerHeight ??= 820;
const game = { farm: { yard: { barn: { x: 0, z: 0, yaw: 0 }, side: 1, lineup: { x0: 8.5, x1: 15.5, z0: -24, z1: -8 } } }, train: { cars: [{ body: { rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) } }] } };
const riders = types => types.map((type, k) => ({ animal: { type, golden: false, x: 0, y: 1, z: k, yaw: 0, state: 'ride' }, slot: { car: 0, k } }));
const steps = r => buildShowSteps(r.map(x => ({ type: x.animal.type, golden: false })));
const ms = n => new Promise(res => setTimeout(res, n));
const make = (opts = {}) => { const root = new El(); return { root, show: createShow({ root, camera: new THREE.PerspectiveCamera(), game, voice: { say: () => Promise.resolve() }, sound: null, fx: null, clock: 'update', ...opts }) }; };

test('clock update: the waits count update(dt) time, not the wall clock ([U-5])', async () => {
  const { show } = make(), r = riders(['pig']);
  let done = false; const p = show.play(r, steps(r)).then(() => { done = true; });
  await ms(SHOW.step + 150); // longer than the intro's wait on the wall clock: with no update the show has not moved on
  assert.equal(show.step, 0, 'still on the intro');
  const tick = setInterval(() => show.update(0.05), 2);
  try { for (let i = 0; i < 400 && !done; i++) await ms(5); await p; } finally { clearInterval(tick); }
  assert.ok(done); assert.equal(show.step, -1); assert.equal(r[0].animal.state, 'show');
});
test('skip: the caller\'s button goes in the layer (none of its own) and skip() ends the show at once (F-13)', async () => {
  const skip = new El(), { show } = make({ skip, voice: { say: () => new Promise(() => {}) } }), r = riders(['pig', 'cow']); // a voice that never ends
  assert.ok(show.layer.children.includes(skip)); assert.equal(show.layer.children.filter(c => c.className === 'skip').length, 0);
  assert.equal(skip.on.pointerdown, undefined, 'no hold of its own on the caller\'s button');
  let done = false; const p = show.play(r, steps(r)).then(() => { done = true; });
  const tick = setInterval(() => show.update(0.05), 2);
  try { await ms(20); show.skip(); await Promise.race([p, ms(300)]); } finally { clearInterval(tick); }
  assert.ok(done, 'skip() ended the show');
});
test('gesture: false leaves the layer to the caller; cheer() and hurry() do what a tap and a hold did (A-3, F-8)', async () => {
  const calls = [], { show } = make({ gesture: false, voice: { say: () => new Promise(() => {}) }, sound: { animal: t => calls.push(t) } }), r = riders(['pig']);
  assert.equal(show.layer.on.pointerdown, undefined, 'no listener of its own on the layer');
  let done = false; show.play(r, steps(r)).then(() => { done = true; });
  const tick = setInterval(() => show.update(0.05), 2);
  try {
    show.cheer(); assert.deepEqual(calls, ['pig'], 'a cheer before the first hop: the call only');
    for (let i = 0; i < 12 && !done; i++) { await ms(20); show.hurry(); }
    assert.ok(done, 'each hurry finished a step');
  } finally { show.end(); clearInterval(tick); }
});
test('clock update: a slow frame\'s whole (uncapped) time counts: one 0.4 s update ends the intro\'s wait (#56)', async () => {
  const { show } = make(), r = riders(['pig']);
  show.play(r, steps(r));
  await ms(20); assert.equal(show.step, 0);
  show.update(0.4); await ms(20); // SHOW.step is 350 ms: one frame of 0.4 s (rawDt at 2.5 fps) is enough
  assert.ok(show.step >= 1, `still on step ${show.step}`);
  show.end();
});
