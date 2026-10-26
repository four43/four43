import test from 'node:test';
import assert from 'node:assert/strict';
import { placeArrow, paintCss, rosterRows, RAINBOW, FIND } from '../src/ui/roster.js';
import { honkLook, HONK } from '../src/render/hornMarks.js';
import { createPlayers } from '../src/net/players.js';

const W = 800, H = 600, IN = 44, at = () => ({ x: 0, y: 0, angle: 0, on: false });
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const onEllipse = o => near(Math.hypot((o.x - W / 2) / (W / 2 - IN), (o.y - H / 2) / (H / 2 - IN)), 1);

test('M-77 placeArrow: a player on screen gets a marker just above it, pointing down', () => {
  const o = placeArrow(0.5, 0.5, false, W, H, IN, at());
  assert.equal(o.on, true); near(o.x, 600); near(o.y, 150); near(o.angle, Math.PI / 2);
});
test('M-77 placeArrow: an on-screen marker near an edge stays inside the screen', () => {
  const o = placeArrow(0.999, 0.999, false, W, H, IN, at());
  assert.ok(o.x <= W - IN / 2 && o.y >= IN / 2);
});
test('M-77 placeArrow: off to the right: on the inset ellipse at the right, pointing right', () => {
  const o = placeArrow(3, 0, false, W, H, IN, at());
  assert.equal(o.on, false); near(o.x, W - IN); near(o.y, H / 2); near(o.angle, 0); onEllipse(o);
});
test('M-77 placeArrow: off screen up-left points up-left (screen y down) and sits on the ellipse', () => {
  const o = placeArrow(-2, 2, false, W, H, IN, at());
  assert.ok(o.x < W / 2 && o.y < H / 2); assert.ok(o.angle < -Math.PI / 2 && o.angle > -Math.PI); onEllipse(o);
});
test('M-77 placeArrow: behind the camera the direction flips; straight behind points down', () => {
  const o = placeArrow(0.3, 0, true, W, H, IN, at());
  assert.equal(o.on, false); assert.ok(o.x < W / 2); near(Math.abs(o.angle), Math.PI); onEllipse(o);
  const d = placeArrow(0, 0, true, W, H, IN, at()); near(d.x, W / 2); near(d.y, H - IN); near(d.angle, Math.PI / 2);
});
test('M-77 placeArrow: fills and returns the same object (no allocation)', () => { const o = at(); assert.equal(placeArrow(5, 5, false, W, H, IN, o), o); });

const PAINTS = { red: '#d8342c', yellow: '#f2c230', blue: '#2f6fd6', rainbow: null };
test('M-78 paintCss: a paint is its color, rainbow a gradient, an unknown name red', () => {
  assert.equal(paintCss('blue', PAINTS), '#2f6fd6'); assert.equal(paintCss('rainbow', PAINTS), RAINBOW); assert.equal(paintCss('nope', PAINTS), '#d8342c');
});

const syncOf = (you, others) => { const players = createPlayers(); for (const [n, paint, away] of others) Object.assign(players.ensure(n), { paint, away }); return { you, players }; };
test('M-78 rosterRows: nothing outside a room or before the welcome', () => {
  const rows = []; assert.equal(rosterRows(null, { body: 'red', trim: 'yellow' }, rows), 0); assert.equal(rosterRows({ you: 0, players: createPlayers() }, { body: 'red', trim: 'yellow' }, rows), 0);
});
test('M-78 rosterRows: every player in number order, this device marked, paints and away', () => {
  const rows = [], mine = { body: 'blue', trim: 'red' };
  const k = rosterRows(syncOf(2, [[3, { body: 'rainbow', trim: 'blue' }, true], [1, { body: 'red', trim: 'yellow' }, false]]), mine, rows);
  assert.equal(k, 3);
  assert.deepEqual(rows.slice(0, k).map(r => [r.n, r.body, r.trim, r.you, r.away]), [[1, 'red', 'yellow', false, false], [2, 'blue', 'red', true, false], [3, 'rainbow', 'blue', false, true]]);
  const first = rows[0]; rosterRows(syncOf(1, []), mine, rows); assert.equal(rows[0], first); // rows are reused
  assert.equal(rows[0].n, 1); assert.equal(rows[0].you, true);
});
test('M-78 rosterRows: a host alone in its room shows its own circle', () => { assert.equal(rosterRows(syncOf(1, []), { body: 'red', trim: 'yellow' }, []), 1); });

test('M-75 honkLook: pops in, holds, fades out by 1.5 s', () => {
  const o = {};
  honkLook(0, o); near(o.scale, 0); near(o.opacity, 1);
  honkLook(HONK.pop / 2, o); assert.ok(o.scale > 0.5 && o.scale < 1.1);
  honkLook(0.7, o); assert.ok(o.scale > 0.9 && o.scale < 1.1); near(o.opacity, 1);
  honkLook(HONK.secs - 0.1, o); assert.ok(o.opacity > 0 && o.opacity < 1);
  honkLook(HONK.secs, o); near(o.scale, 0); near(o.opacity, 0);
});
test('M-76 the arrows stay for a few seconds', () => { assert.ok(FIND.secs >= 3 && FIND.secs <= 6); });
