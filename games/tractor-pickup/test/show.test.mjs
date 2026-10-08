// The barn show runner (src/ui/show.js) with a tiny fake DOM: it never locks up and one tap finishes a step (R-1, F-8).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShow, SHOW, CHEER, labelScale, LABEL } from '../src/ui/show.js';
import { buildShowSteps, TALLY, LINEUP } from '../src/sim/showSteps.js';

class El {
  constructor() { this.children = []; this.style = {}; this.on = {}; this.hidden = false; this.className = ''; this.innerHTML = ''; this.textContent = ''; this.classList = { add() {}, remove() {} }; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { (this.on[t] ||= []).push(f); }
  setAttribute() {}
  querySelector() { return null; }
  setPointerCapture() {}
  remove() {}
  tap() { for (const f of this.on.pointerdown || []) f({ stopPropagation() {} }); }
  up() { for (const f of this.on.pointerup || []) f({}); }
}
globalThis.document = { createElement: () => new El() }; globalThis.requestAnimationFrame = f => setTimeout(() => f(), 1); globalThis.cancelAnimationFrame = clearTimeout;
// most tests stand in for the parent: a held press (CHEER.fastMs, CHEER.skipMs = 0 here) hurries or skips. The A-3 tests put the real times back.
const HOLD = { ...CHEER }; CHEER.fastMs = 0; CHEER.skipMs = 0; globalThis.innerWidth = 1180; globalThis.innerHeight = 820;
const game = { farm: { yard: { barn: { x: 0, z: 0, yaw: 0 }, side: 1, lineup: { x0: 8.5, x1: 15.5, z0: -24, z1: -8 } } }, train: { cars: [{ body: { rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) } }] } };
const riders = types => types.map((type, k) => ({ animal: { type, golden: false, x: 0, y: 1, z: k, yaw: 0, state: 'ride' }, slot: { car: 0, k } }));
function setup(voice) {
  const root = new El(), show = createShow({ root, camera: new THREE.PerspectiveCamera(), game, voice, sound: null, fx: null });
  const tick = setInterval(() => show.update(0.05), 2);
  return { show, el: root.children[0], stop: () => clearInterval(tick) };
}
const steps = r => buildShowSteps(r.map(x => ({ type: x.animal.type, golden: false })));
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`not done in ${ms} ms`)), ms))]);

for (const [name, say] of [['rejects', () => Promise.reject(new Error('no audio'))], ['throws', () => { throw new Error('no audio'); }]]) {
  test(`a voice that ${name} never stalls the show; every animal ends on the ground of the line-up or the tally circle`, async () => {
    const { show, el, stop } = setup({ say }), r = riders(['pig', 'cow']);
    const taps = setInterval(() => el.tap(), 20); // skip the 0.8 s waits
    const warn = console.warn, warned = []; console.warn = (...a) => warned.push(a);
    try { await within(show.play(r, steps(r)), 3000); } finally { clearInterval(taps); stop(); console.warn = warn; }
    assert.ok(warned.length > 0 && warned.every(w => w[0] === 'voice'), 'the voice failure is reported, not swallowed');
    for (const { animal: a } of r) { assert.equal(a.state, 'show'); assert.equal(a.y, 0); assert.ok(a.x >= 8.5 - TALLY.rMax && a.x <= 15.5 + TALLY.rMax && a.z >= -24 && a.z <= -8 + TALLY.gap + 2 * TALLY.rMax, `${a.x}, ${a.z}`); } // on the line-up, or in the tally circle past its end (F-14)
  });
}
test('one tap finishes the whole step: the voice, the 0.8 s wait and any hop in flight (F-8)', async () => {
  const { show, el, stop } = setup({ say: () => new Promise(() => {}) }), r = riders(['pig', 'cow']); // a voice that never ends
  let done = false; const p = show.play(r, steps(r)).then(() => { done = true; });
  try {
    for (let i = 0; i < 7 && !done; i++) { await new Promise(res => setTimeout(res, 40)); el.tap(); } // intro, hop, group, hop, group, sum, all = 7 steps
    await within(p, 300);
  } finally { stop(); }
  assert.ok(done);
});
test('the hop turns the animal from its riding yaw to face the camera (no snap)', async () => {
  const { show, el, stop } = setup({ say: () => Promise.resolve() }), r = riders(['pig']), a = r[0].animal; a.yaw = -1; // stale yaw: riders are drawn from the car pose
  const car = game.train.cars[0].body, rot = car.rotation; car.rotation = () => ({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }); // car turned 90 deg: faces -z, riding yaw = PI
  const yaws = []; const spy = setInterval(() => yaws.push(a.yaw), 1);
  const taps = setInterval(() => el.tap(), 400);
  try { await within(show.play(r, steps(r)), 5000); } finally { clearInterval(spy); clearInterval(taps); stop(); car.rotation = rot; }
  const first = yaws.find(y => y !== -1);
  assert.ok(Math.abs(Math.atan2(Math.sin(first - Math.PI), Math.cos(first - Math.PI))) < 0.4, `starts near the riding yaw, got ${first}`);
  assert.ok(Math.abs(a.yaw - Math.PI / 2) < 1e-9, 'ends facing the camera (side +x)');
});
test('a hop shows the count in its group above the animal; then the group label reads the number and the name (F-6, W-7)', async () => {
  const { show, el, stop } = setup({ say: () => Promise.resolve() }), r = riders(['cow', 'cow']);
  const nums = new Set(); let group = null;
  const p = show.play(r, steps(r));
  try {
    for (let i = 0; i < 400 && !group; i++) { await new Promise(res => setTimeout(res, 10)); for (const c of el.children) { if (c.className === 'num') nums.add(c.innerHTML); if (c.className === 'group') group = c; } }
    const taps = setInterval(() => el.tap(), 20); await within(p, 3000); clearInterval(taps);
  } finally { stop(); }
  assert.deepEqual([...nums], [1, 2]);
  assert.ok(group, 'no group label'); assert.match(group.innerHTML, /<span class="gn">2<\/span>/);
  assert.equal(group.innerHTML.match(/<b[^>]*>(.)<\/b>/g).map(b => b.replace(/<[^>]+>/g, '')).join(''), 'Cows');
});
test('the skip button ends the whole show at once, with no animal left mid-hop (F-13)', async () => {
  const { show, el, stop } = setup({ say: () => new Promise(() => {}) }), r = riders(['pig', 'cow', 'pig', 'duck']); // a voice that never ends
  const skip = el.children.find(c => c.className === 'skip'); assert.ok(skip, 'no skip button');
  let done = false; const p = show.play(r, steps(r)).then(() => { done = true; });
  try { await new Promise(res => setTimeout(res, 60)); skip.tap(); await within(p, 300); } finally { stop(); }
  assert.ok(done);
  for (const { animal: a } of r) assert.ok(a.state === 'ride' || (a.state === 'show' && a.y === 0), `${a.type} left mid-hop`);
});
test('the running sum starts at zero; after each stage the group moves into the tally circle at the left, and the count goes up (F-7, F-14)', { timeout: 30000 }, async () => {
  const said = [], { show, el, stop } = setup({ say: ids => { said.push(...ids); return Promise.resolve(); } }), r = riders(['pig', 'pig', 'cow', 'duck']);
  const taps = setInterval(() => { if (said.includes('duck')) clearInterval(taps); else el.tap(); }, 30); // hurry to the sum, then let it play at its own pace
  let tSum = 0, tally = null; const counts = [];
  const watch = setInterval(() => { if (!tSum && said.includes('plus')) tSum = Date.now(); tally ||= el.children.find(c => c.className === 'tally');
    if (tally && counts.at(-1) !== tally.innerHTML) counts.push(tally.innerHTML); }, 2);
  try { await within(show.play(r, steps(r)), 25000); } finally { clearInterval(taps); clearInterval(watch); stop(); }
  assert.ok(Date.now() - tSum > 3000, `the sum went by in ${Date.now() - tSum} ms: too fast to follow`);
  const from = said.indexOf('plus') - 1;
  assert.deepEqual(said.slice(from, from + 15), ['zero', 'plus', 'two', 'makes', 'two', 'two', 'plus', 'one', 'makes', 'three', 'three', 'plus', 'one', 'makes', 'four']);
  assert.deepEqual(counts.map(String), ['0', '1', '2', '3', '4']);
  // this fake yard's line-up runs z -24..-8 along the barn axis, on side +x: screen left is +z, so the circle is past its z = -8 end
  const zs = r.map(x => x.animal.z), cz = zs.reduce((a, b) => a + b) / zs.length;
  assert.ok(r.every(x => x.animal.z > -8), `animals not past the line-up end: ${zs.map(z => z.toFixed(1))}`);
  for (const { animal: a } of r) assert.ok(Math.hypot(a.x - r[0].animal.x, a.z - cz) < 6, 'not together in one circle');
});
test('each animal that hops out is reported once, in hop order, so its slot is marked off (F-15)', async () => {
  const root = new El(), seen = [];
  const show = createShow({ root, camera: new THREE.PerspectiveCamera(), game, voice: { say: () => Promise.resolve() }, sound: null, fx: null, onHop: r => seen.push(r) });
  const tick = setInterval(() => show.update(0.05), 2), taps = setInterval(() => root.children[0].tap(), 20), r = riders(['pig', 'cow', 'pig']);
  try { await within(show.play(r, steps(r)), 3000); } finally { clearInterval(tick); clearInterval(taps); }
  assert.deepEqual(seen, [r[0], r[2], r[1]]); // grouped by type: both pigs, then the cow
});
test('the show is faster in version 1.10 (F-6, F-8, F-14)', () => {
  assert.deepEqual(SHOW, { hop: 0.5, step: 350, tallyGap: 150, tallyHop: 0.45 });
});
test('labels scale down with the scene so they fit their blocks, never below the minimum, never above full size (F-12)', () => {
  assert.equal(labelScale(1000), 1);
  assert.equal(labelScale(0.1), LABEL.min);
  const k = labelScale(30); assert.ok(k < 1 && k > LABEL.min); assert.ok(Math.abs(LABEL.pxPerLetter * k - 30 * LINEUP.letter) < 1e-9, 'one letter is as wide as the room a letter has');
});

test('a child\'s short tap does not hurry the show: the counted animal hops and calls (A-3)', async () => {
  CHEER.fastMs = HOLD.fastMs; const calls = [];
  const root = new El(), show = createShow({ root, camera: new THREE.PerspectiveCamera(), game, voice: { say: () => new Promise(() => {}) }, sound: { animal: t => calls.push(t) }, fx: null });
  const tick = setInterval(() => show.update(0.05), 2), el = root.children[0], r = riders(['pig', 'cow']);
  let done = false; show.play(r, steps(r)).then(() => { done = true; });
  try {
    for (let i = 0; i < 10; i++) { await new Promise(res => setTimeout(res, 30)); el.tap(); el.up(); }
    assert.equal(done, false, 'short taps finished the show');
    assert.ok(calls.length >= 5, `the animals did not call: ${calls}`);
  } finally { CHEER.fastMs = 0; show.end(); clearInterval(tick); }
});
test('a short tap on the skip button does nothing; only a hold skips (A-3, F-13)', async () => {
  CHEER.skipMs = 300;
  const root = new El(), show = createShow({ root, camera: new THREE.PerspectiveCamera(), game, voice: { say: () => new Promise(() => {}) }, sound: null, fx: null });
  const tick = setInterval(() => show.update(0.05), 2), el = root.children[0], skip = el.children.find(c => c.className === 'skip'), r = riders(['pig']);
  let done = false; const p = show.play(r, steps(r)).then(() => { done = true; });
  try {
    skip.tap(); await new Promise(res => setTimeout(res, 50)); skip.up(); await new Promise(res => setTimeout(res, 400));
    assert.equal(done, false, 'a short press skipped');
    skip.tap(); await within(p, 1000); assert.ok(done);
  } finally { CHEER.skipMs = 0; clearInterval(tick); }
});
