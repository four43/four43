import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, randomSeed } from '../src/sim/rng.js';

test('same seed gives the same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});
test('different seeds differ', () => {
  assert.notEqual(makeRng(1).next(), makeRng(2).next());
});
test('next is in [0,1)', () => {
  const r = makeRng(7);
  for (let i = 0; i < 10000; i++) { const v = r.next(); assert.ok(v >= 0 && v < 1); }
});
test('int is inclusive and covers the range', () => {
  const r = makeRng(3), seen = new Set();
  for (let i = 0; i < 2000; i++) { const v = r.int(1, 2); assert.ok(v === 1 || v === 2); seen.add(v); }
  assert.equal(seen.size, 2);
});
test('pick and shuffle are deterministic', () => {
  assert.equal(makeRng(9).pick(['a', 'b', 'c', 'd']), makeRng(9).pick(['a', 'b', 'c', 'd']));
  assert.deepEqual(makeRng(9).shuffle([1, 2, 3, 4, 5]), makeRng(9).shuffle([1, 2, 3, 4, 5]));
});
test('randomSeed is a uint32', () => {
  const s = randomSeed(); assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
});
