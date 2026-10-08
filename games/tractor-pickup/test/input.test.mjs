import test from 'node:test';
import assert from 'node:assert/strict';
import { radial } from '../src/ui/input.js';
const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-3, `${a} vs ${b}`));

test('radial: inside the dead zone the stick is at rest', () => { assert.deepEqual(radial(0, 0), [0, 0]); assert.deepEqual(radial(0.05, -0.05), [0, 0]); });
test('radial: the direction stays the same', () => {
  for (const [x, y] of [[1, 0], [0, -0.5], [0.3, 0.4], [-0.6, 0.6]]) { const [rx, ry] = radial(x, y); near([Math.atan2(rx, ry)], [Math.atan2(x, y)]); }
});
test('radial: full travel is length 1, never more, and the length grows from 0 past the dead zone', () => {
  near([Math.hypot(...radial(Math.SQRT1_2, Math.SQRT1_2))], [1]); near([Math.hypot(...radial(0, 1.3))], [1]);
  near([Math.hypot(...radial(0.55, 0))], [0.5]);
});

// createInput with a tiny fake DOM (A-4, A-6, A-10, D-2)
const fakeDom = () => {
  const mk = () => ({ style: {}, hidden: false, on: {}, children: [], appendChild(c) { this.children.push(c); }, setAttribute() {}, setPointerCapture() {}, addEventListener(t, f) { (this.on[t] ||= []).push(f); }, fire(t, e) { for (const f of this.on[t] || []) f({ stopPropagation() {}, ...e }); } });
  const surface = mk(); surface.clientWidth = 1000; const doc = mk(); doc.visibilityState = 'visible'; const win = mk();
  doc.createElement = mk; doc.getElementById = () => surface;
  globalThis.document = doc; globalThis.addEventListener = win.addEventListener.bind(win);
  return { surface, doc, win, root: mk() };
};
test('the stick starts anywhere, even on the right third, but not at the very left edge (A-4, D-2)', async () => {
  const { createInput } = await import('../src/ui/input.js'), d = fakeDom(), inp = createInput(d.root);
  d.surface.fire('pointerdown', { pointerId: 1, clientX: 900, clientY: 300 }); d.surface.fire('pointermove', { pointerId: 1, clientX: 900, clientY: 230 });
  assert.ok(inp.read().y > 0.9, 'right-third touch did not drive');
  d.surface.fire('pointerup', { pointerId: 1 });
  d.surface.fire('pointerdown', { pointerId: 2, clientX: 10, clientY: 300 }); d.surface.fire('pointermove', { pointerId: 2, clientX: 10, clientY: 230 });
  assert.equal(inp.read().y, 0, 'edge touch drove (Safari swipe-back zone)');
});
test('hiding the page lets go of the stick (A-10)', async () => {
  const { createInput } = await import('../src/ui/input.js'), d = fakeDom(), inp = createInput(d.root);
  d.surface.fire('pointerdown', { pointerId: 1, clientX: 300, clientY: 300 }); d.surface.fire('pointermove', { pointerId: 1, clientX: 300, clientY: 230 });
  d.doc.visibilityState = 'hidden'; d.doc.fire('visibilitychange', {});
  assert.equal(inp.read().y, 0);
});
test('two gamepads: holding A on one fires the horn once (A-6)', async () => {
  const { createInput } = await import('../src/ui/input.js'), d = fakeDom(), inp = createInput(d.root); let n = 0; inp.onHorn(() => n++);
  const pads = [{ index: 0, axes: [0, 0], buttons: [{ pressed: false }] }, { index: 1, axes: [0, 0], buttons: [{ pressed: true }] }];
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true });
  for (let i = 0; i < 5; i++) inp.read();
  assert.equal(n, 1);
});
