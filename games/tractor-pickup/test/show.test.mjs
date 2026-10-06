// The barn show runner (src/ui/show.js) with a tiny fake DOM: it never locks up and one tap finishes a step (R-1, F-8).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShow } from '../src/ui/show.js';
import { buildShowSteps } from '../src/sim/showSteps.js';

class El {
  constructor() { this.children = []; this.style = {}; this.on = {}; this.hidden = false; this.className = ''; this.innerHTML = ''; this.textContent = ''; this.classList = { add() {}, remove() {} }; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { (this.on[t] ||= []).push(f); }
  remove() {}
  tap() { for (const f of this.on.pointerdown || []) f({ stopPropagation() {} }); }
}
globalThis.document = { createElement: () => new El() }; globalThis.innerWidth = 1180; globalThis.innerHeight = 820;
const game = { farm: { yard: { barn: { x: 0, z: 0, yaw: 0 }, side: 1, lineup: { x0: 8.5, x1: 11.5, z0: -21.5, z1: -8.5 } } }, train: { cars: [{ body: { rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) } }] } };
const riders = types => types.map((type, k) => ({ animal: { type, golden: false, x: 0, y: 1, z: k, yaw: 0, state: 'ride' }, slot: { car: 0, k } }));
function setup(voice) {
  const root = new El(), show = createShow({ root, camera: new THREE.PerspectiveCamera(), game, voice, sound: null, fx: null });
  const tick = setInterval(() => show.update(0.05), 2);
  return { show, el: root.children[0], stop: () => clearInterval(tick) };
}
const steps = r => buildShowSteps(r.map(x => ({ type: x.animal.type, golden: false })));
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`not done in ${ms} ms`)), ms))]);

for (const [name, say] of [['rejects', () => Promise.reject(new Error('no audio'))], ['throws', () => { throw new Error('no audio'); }]]) {
  test(`a voice that ${name} never stalls the show; every animal ends on the line-up ground`, async () => {
    const { show, el, stop } = setup({ say }), r = riders(['pig', 'cow']);
    const taps = setInterval(() => el.tap(), 20); // skip the 0.8 s waits
    const warn = console.warn, warned = []; console.warn = (...a) => warned.push(a);
    try { await within(show.play(r, steps(r)), 3000); } finally { clearInterval(taps); stop(); console.warn = warn; }
    assert.ok(warned.length > 0 && warned.every(w => w[0] === 'voice'), 'the voice failure is reported, not swallowed');
    for (const { animal: a } of r) { assert.equal(a.state, 'show'); assert.equal(a.y, 0); assert.ok(a.x >= 8.5 && a.x <= 11.5 && a.z >= -21.5 && a.z <= -8.5, `${a.x}, ${a.z}`); }
  });
}
test('one tap finishes the whole step: the voice, the 0.8 s wait and any hop in flight (F-8)', async () => {
  const { show, el, stop } = setup({ say: () => new Promise(() => {}) }), r = riders(['pig', 'cow']); // a voice that never ends
  let done = false; const p = show.play(r, steps(r)).then(() => { done = true; });
  try {
    for (let i = 0; i < 4 && !done; i++) { await new Promise(res => setTimeout(res, 40)); el.tap(); } // intro, hop, hop, all = 4 steps
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
test('a hop shows a number above the animal and its name below it, letter by letter (F-6, W-7)', async () => {
  const { show, el, stop } = setup({ say: () => Promise.resolve() }), r = riders(['cow']);
  let seen = null;
  const p = show.play(r, steps(r));
  try {
    for (let i = 0; i < 200 && !seen; i++) { await new Promise(res => setTimeout(res, 10)); const num = el.children.find(c => c.className === 'num'); if (num) seen = { num, name: el.children.find(c => c.className === 'name') }; }
    const taps = setInterval(() => el.tap(), 20); await within(p, 3000); clearInterval(taps);
  } finally { stop(); }
  assert.ok(seen, 'no number label'); assert.equal(seen.num.innerHTML, 1);
  assert.ok(seen.name, 'no name label'); assert.equal(seen.name.innerHTML.match(/<b[^>]*>(.)<\/b>/g).map(b => b.replace(/<[^>]+>/g, '')).join(''), 'Cow');
});
