import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFromGuest, checkFromHost, createRate, NET_VERSION } from '../src/net/protocol.js';

const paint = { body: 'red', trim: 'yellow' };
test('good guest messages pass (M-24)', () => {
  for (const m of [{ t: 'hello', v: NET_VERSION, paint }, { t: 'claim', ids: [3, 4, 5] }, { t: 'release', ids: [3] }, { t: 'delivered', ids: [1, 2] },
    { t: 'tree', id: 12 }, { t: 'regrow' }, { t: 'horn' }, { t: 'help' }, { t: 'paint', paint: { body: 'rainbow', trim: 'blue' } }]) assert.deepEqual(checkFromGuest(m), m, m.t);
});
test('bad guest messages are refused (M-50)', () => {
  for (const m of [null, 'x', [], {}, { t: 'nope' }, { t: 'claim' }, { t: 'claim', ids: 'a' }, { t: 'claim', ids: [1.5] }, { t: 'claim', ids: [-1] },
    { t: 'claim', ids: Array.from({ length: 17 }, (_, i) => i) }, { t: 'tree', id: 70000 }, { t: 'paint', paint: { body: 'chartreuse', trim: 'red' } },
    { t: 'hello', v: NET_VERSION }, { t: 'welcome', v: 1 }]) assert.equal(checkFromGuest(m), null, JSON.stringify(m));
});
test('host messages are checked the same way; the herd, trees and players are not messages any more (M-24, M-50)', () => {
  const w = { t: 'welcome', v: NET_VERSION, seed: 42, farm: 3, you: 2, next: 30 };
  assert.deepEqual(checkFromHost(w), w);
  for (const m of [{ t: 'tree', id: 3 }, { t: 'regrow' }, { t: 'horn', n: 1 }, { t: 'help', id: null }, { t: 'help', id: 7 }]) assert.deepEqual(checkFromHost(m), m, m.t);
  for (const m of [{ ...w, you: 5 }, { ...w, you: 1 }, { ...w, seed: -1 }, { ...w, farm: undefined }, { ...w, farm: 1.5 }, { ...w, next: undefined }, { ...w, next: 70000 }, { ...w, next: 1.5 },
    { t: 'horn', n: 9 }, { t: 'hello', v: NET_VERSION, paint }, { t: 'claimed', ok: [1], no: [], epochs: [[1, 4]] }, { t: 'players', list: [] }]) assert.equal(checkFromHost(m), null, JSON.stringify(m).slice(0, 60));
  assert.equal(NET_VERSION, 2, 'M-27: the messages changed');
});
test('the rate limiter allows 60 messages in each second (M-50)', () => {
  const r = createRate(60); let ok = 0;
  for (let i = 0; i < 200; i++) if (r.allow(500)) ok++;
  assert.equal(ok, 60); assert.equal(r.allow(1600), true);
});
