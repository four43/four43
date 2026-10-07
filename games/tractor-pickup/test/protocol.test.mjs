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
test('host messages are checked the same way', () => {
  const herd = [{ id: 0, type: 'pig', golden: false, home: 'route', leader: null, line: 0, x: 1, z: 2, yaw: 0, epoch: 0, state: 'free', hidden: false }];
  const w = { t: 'welcome', v: 1, seed: 42, you: 2, players: [{ n: 1, paint, away: false }, { n: 2, paint, away: false }], herd, trees: [3], next: 1 };
  assert.deepEqual(checkFromHost(w), w);
  assert.deepEqual(checkFromHost({ t: 'claimed', ok: [1], no: [2], epochs: [[1, 4]] }), { t: 'claimed', ok: [1], no: [2], epochs: [[1, 4]] });
  assert.deepEqual(checkFromHost({ t: 'help', id: null }), { t: 'help', id: null });
  for (const m of [{ ...w, you: 5 }, { ...w, seed: -1 }, { ...w, herd: [{ ...herd[0], type: 'dragon' }] }, { ...w, herd: [{ ...herd[0], x: NaN }] }, { ...w, next: undefined }, { ...w, next: 70000 }, { ...w, next: 1.5 }, { ...w, next: 0 },
    { t: 'horn', n: 9 }, { t: 'claimed', ok: [1], no: [], epochs: [[1]] }, { t: 'hello', v: 1, paint }]) assert.equal(checkFromHost(m), null, JSON.stringify(m).slice(0, 60));
});
test('the rate limiter allows 60 messages in each second (M-50)', () => {
  const r = createRate(60); let ok = 0;
  for (let i = 0; i < 200; i++) if (r.allow(500)) ok++;
  assert.equal(ok, 60); assert.equal(r.allow(1600), true);
});
