// L-3 / T-12: Rally's sim half never touches three.js, the DOM, the wall clock, Math.random, browser storage or timers,
// and never imports Rally's view modules (lion-hawk field note #24).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPurity, stripComments } from 'lion-hawk/test';
import { rng } from 'lion-hawk/sim';
import { normalizeSettings, newSeed } from '../src/game/settings.js';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const SIM = ['game.sim.js', 'sim.js', 'vehicle.js', 'drivetrain.js', 'tire.js', 'snow.js', 'cars.js', 'surface.js', 'defs', 'gen', 'world', 'game'].map(p => join(src, p));
const files = p => !existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const RALLY = [/\blocalStorage\b/, /\bset(Timeout|Interval)\s*\(/, /\brequestAnimationFrame\b/,
  /from\s*['"][^'"]*\/(render|snowView|ui|menus|devices|game\.view|main)(\.js)?['"]/];

test('sim modules pass the engine purity scan', () => { assert.deepEqual(scanPurity(SIM), []); });
// Comments are stripped first (line numbers kept), so a trailing `// setTimeout(` or a `/* … */` block never flags.
const rallyScan = (src, f = '') => stripComments(src).split('\n').map((l, i) => [f, i + 1, l])
  .filter(([, , l]) => RALLY.some(r => r.test(l))).map(([f, n, l]) => `${f}:${n}: ${l.trim()}`);
test('sim modules use no browser storage or timers and import no Rally view module', () => {
  assert.deepEqual(SIM.flatMap(files).flatMap(f => rallyScan(readFileSync(f, 'utf8'), f)), []);
});
test('the Rally scan ignores comments but still flags code', () => {
  assert.deepEqual(rallyScan('a(); // setTimeout(f)\n/* localStorage */b'), []);
  assert.equal(rallyScan('a();\nsetTimeout(f);').length, 1);
});
test('settings: normalizeSettings migrates without mutating, newSeed is a seeded 5-char id', () => {
  const saved = { v: 1, assist: true, mode: 'nope', world: 'pad' }, copy = { ...saved };
  const s = normalizeSettings(saved);
  assert.equal(s.assist, false); assert.equal(s.mode, 'freeDrive'); assert.equal(s.world, 'loop'); assert.equal(s.v, 4);
  assert.deepEqual(saved, copy);
  assert.match(newSeed(rng('x')), /^[0-9a-z]{5}$/);
  assert.equal(newSeed(rng('x')), newSeed(rng('x')));
});
