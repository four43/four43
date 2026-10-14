// The screens' view halves (view/menus.js) on a headless engine (lion-hawk 2g final review, R-1). view/menus.js imports the
// browser bundle's modules (a .json import), so the test bundles it with esbuild into build/unit/ (packages stay external), as
// serve.mjs bundles the page into build/e2e/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
await R.init();

const outfile = fileURLToPath(new URL('../build/unit/menus.bundle.mjs', import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('../src/view/menus.js', import.meta.url))], bundle: true, format: 'esm', platform: 'node',
  packages: 'external', loader: { '.json': 'json' }, outfile, logLevel: 'warning' });
const { menuHalves } = await import(pathToFileURL(outfile).href);

const ARGS = { seed: 14, started: true };
// a trip up to the sticker card (as flow.test.mjs): the sim holds the train in mode 'reward' with the reward overlay open
function atReward() {
  const h = headless(tractorGame(), { args: ARGS });
  h.jump('farm', 'barn', { n: 1 }, ARGS); const s = h.engine.scene.state; h.seconds(3.1);
  s.raw = { thr: 1, steer: 0, horn: false }; h.untilEvent('show', { maxSeconds: 15 }); s.raw = null;
  h.command('show.done', { spots: [] }); h.untilEvent('reward', { maxSteps: 5 });
  assert.equal(s.game.mode, 'reward'); assert.deepEqual(h.scene.overlays, ['reward']);
  return { h, s };
}
const pics = () => ({ sound: { bells() {}, plop() {} }, voice: { say() {} } });
const view = () => ({ doc: { getElementById: () => null }, ui: { adopt() {} } });
// what boot does with a half's enter: an error is reported, never thrown on (engine src/view/boot.js caught())
const enter = (half, e, v) => { try { half.enter(e, v); } catch (err) { return err; } return null; };

test('R-1: a sticker card that fails to open is hidden and its go tapped, so the child drives on', t => {
  t.mock.method(console, 'warn', () => {}); // the half's own warning
  const { h, s } = atReward(); let hidden = 0;
  const halves = menuHalves(pics, null, { make: () => ({ showReward() { throw new Error('stub: the card cannot draw'); }, hide() { hidden++; } }) });
  const err = enter(halves.reward, h.engine, view());
  assert.equal(err, null, 'the half handles the failure itself');
  assert.match(String(console.warn.mock.calls[0]?.arguments[0]), /reward\.go/, 'and says so');
  assert.ok(hidden >= 1, 'the half-built screen is hidden');
  h.step(2);
  assert.equal(s.game.mode, 'drive'); assert.deepEqual(h.scene.overlays, [], 'the card overlay closed through reward.go');
});
test('R-1: a card that opens leaves the overlay open for the child to tap', () => {
  const { h, s } = atReward(); let shown = 0;
  const halves = menuHalves(pics, null, { make: () => ({ showReward() { shown++; }, hide() {} }) });
  assert.equal(enter(halves.reward, h.engine, view()), null); h.step(2);
  assert.equal(shown, 1); assert.equal(s.game.mode, 'reward'); assert.deepEqual(h.scene.overlays, ['reward']);
});
