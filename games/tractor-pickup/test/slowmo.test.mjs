import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlowMo, SLOW } from '../src/sim/slowmo.js';
const run = (s, sec) => { const out = []; for (let i = 0; i < Math.round(sec * 60); i++) { out.push(s.scale()); s.step(1 / 60); } return out; };

test('B-7: half speed for 0.3 s of sim time, starting at the top of the arc (dur / 2)', () => {
  const s = createSlowMo(); assert.equal(s.scale(), 1);
  s.onLaunch(1.2);
  const sc = run(s, 2), slow = sc.filter(v => v === SLOW.scale).length, first = sc.indexOf(SLOW.scale);
  assert.equal(SLOW.scale, 0.5); assert.ok(Math.abs(first / 60 - 0.6) < 2 / 60, `starts at ${first / 60}`);
  assert.ok(Math.abs(slow / 60 - 0.3) < 2 / 60, `lasts ${slow / 60}`);
  assert.equal(sc.at(-1), 1);
});
test('B-7: never stacks: launches while one is waiting or running are ignored', () => {
  const s = createSlowMo(); s.onLaunch(1.0); run(s, 0.3); s.onLaunch(1.0); run(s, 0.25); s.onLaunch(1.0); // waiting, then running
  const rest = run(s, 3); assert.ok(rest.filter(v => v !== 1).length < 0.3 * 60, 'stacked');
  s.onLaunch(1.0); assert.ok(run(s, 1).some(v => v !== 1), 'a later launch slows again');
});
