// Headless flows (lion-hawk 2e, [T-1]–[T-5], [T-9]): Pig Pens' farm scene, its controls, tools and drive mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, canonical } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { TOOLS, START_HINT, TOOL_HINT } from '../src/game/farm.js';
await R.init();

const ARGS = { pigs: 24 };
const hints = (h, m) => h.events.since(m).of('hint').map(e => e.text);

test('the farm starts with the Hand and the start hint; the picker and keys 1–5 switch tools', () => {
  const h = headless(pigPensGame(), { seed: 3, args: ARGS });
  assert.equal(h.scene.name, 'farm'); assert.deepEqual(h.scene.overlays, []);
  assert.equal(h.state().tool, 'hand'); assert.equal(h.state().driving, false); assert.equal(h.state().selected, null);
  h.step(1); assert.deepEqual(hints(h, 0), [START_HINT]);
  let m = h.mark(); h.tap('farm.tool.hose'); h.step(1);
  assert.equal(h.state().tool, 'hose'); assert.deepEqual(hints(h, m), [TOOL_HINT.hose]);
  m = h.mark(); h.step(1, { grab: true }); h.step(1);
  assert.equal(h.state().tool, 'grab'); assert.deepEqual(hints(h, m), [TOOL_HINT.grab]);
  assert.deepEqual(h.engine.ui.tree().filter(c => c.group === 'farm.tool').map(c => [c.id, c.pressed]), TOOLS.map(t => [`farm.tool.${t}`, t === 'grab']));
});

test('the bell fills the troughs; the day/night switch; state is JSON-safe', () => {
  const h = headless(pigPensGame(), { seed: 3, args: ARGS }); h.step(60);
  const sim = h.engine.scene.state.sim;
  let m = h.mark(); h.tap('farm.bell'); h.step(1);
  assert.ok(sim.troughs.every(t => t.level > 0.99)); assert.equal(h.events.since(m).count('bell'), 1);
  assert.deepEqual(hints(h, m), ['Dinner time. Every trough is full.']);
  m = h.mark(); h.step(1, { bell: true }); assert.equal(h.events.since(m).count('bell'), 1); // the B key
  m = h.mark(); h.tap('farm.night'); h.step(1);
  assert.equal(h.state().night, true); assert.equal(h.events.since(m).first('daynight').night, true); assert.match(hints(h, m)[0], /^Night time/);
  m = h.mark(); h.tap('farm.night'); h.step(1); assert.equal(h.state().night, false); assert.match(hints(h, m)[0], /^Good morning!/);
  assert.equal(h.enabled('farm.close'), false); assert.equal(h.enabled('farm.exit'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.state())), h.state());
});

test('the engine path is deterministic: same seed and commands, bit-identical state', () => {
  const run = () => { const h = headless(pigPensGame(), { seed: 9, args: ARGS }); h.step(120); h.tap('farm.bell'); h.step(240); return canonical(h.state(), { digits: 15 }); };
  assert.equal(run(), run());
});
