// L-3 / T-12: Tractor's sim half never touches three.js, the DOM, the wall clock, Math.random, storage or timers (lion-hawk 2f T1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPurity, stripComments } from 'lion-hawk/test';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const NET = ['host', 'guest', 'players', 'kinds', 'bindings', 'protocol', 'replica', 'interp', 'forecast'].map(n => join(src, 'net', n + '.js'));
const SIM = ['game.sim.js', 'game', 'sim', ...NET].map(p => p.startsWith('/') ? p : join(src, p));
const files = p => !existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const RULES = [/\blocalStorage\b/, /\bset(Timeout|Interval)\s*\(/, /\brequestAnimationFrame\b/,
  /from\s*['"][^'"]*\/(main|game\.view|devices|ui\/[^'"]*|render\/[^'"]*|audio\/[^'"]*|net\/(session|link|netlog|handshake))(\.js)?['"]/];
// #86: randomSeed() keeps its Math.random (its unit test imports it from sim/rng.js); only view code may call it
const ALLOWED = [['sim/rng.js', 'math-random']];

test('sim modules pass the engine purity scan (one named exception)', () => {
  const found = scanPurity(SIM).filter(v => !ALLOWED.some(([f, r]) => v.file.endsWith(f) && v.rule === r));
  assert.deepEqual(found, []);
});
test('sim modules use no storage, timers or view imports, and never call randomSeed', () => {
  const bad = SIM.flatMap(files).flatMap(f => stripComments(readFileSync(f, 'utf8')).split('\n').map((l, i) => [f, i + 1, l]))
    .filter(([f, , l]) => RULES.some(r => r.test(l)) || (!f.endsWith('sim/rng.js') && /\brandomSeed\b/.test(l))).map(([f, n, l]) => `${f}:${n}: ${l.trim()}`);
  assert.deepEqual(bad, []);
});
