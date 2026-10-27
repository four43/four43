// L-3 / T-12: Pig Pens' sim half never touches three.js, the DOM, the wall clock, Math.random, browser storage or timers,
// and never imports a view module (lion-hawk 2e P1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPurity, stripComments } from 'lion-hawk/test';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const SIM = ['game.sim.js', 'game', 'defs', 'sim.js', 'chickens.js', 'flow.js', 'layout.js'].map(p => join(src, p));
const files = p => !existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const RULES = [/\blocalStorage\b/, /\bset(Timeout|Interval)\s*\(/, /\brequestAnimationFrame\b/,
  /from\s*['"][^'"]*\/(main|entry|game\.view|devices|farm3d|gfx|fur|tiltshift|sound|view\/[^'"]*)(\.js)?['"]/];

test('sim modules pass the engine purity scan', () => { assert.deepEqual(scanPurity(SIM), []); });
test('sim modules use no browser storage or timers and import no view module', () => {
  const bad = SIM.flatMap(files).flatMap(f => stripComments(readFileSync(f, 'utf8')).split('\n').map((l, i) => [f, i + 1, l]))
    .filter(([, , l]) => RULES.some(r => r.test(l))).map(([f, n, l]) => `${f}:${n}: ${l.trim()}`);
  assert.deepEqual(bad, []);
});
