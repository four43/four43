// games/test/gate.test.mjs: the integrator's gate runs every suite under the phase 3 caps (overview §7.5), browser
// suites one at a time behind the shared lock, and never writes a golden or a site file (lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatePlan, engineFiles, parseCounts, verdict, dirtyGuarded, LOCK } from './gate.mjs';

const M = [
  { name: 'rally', dir: '/g/rally', scripts: { test: 't', 'test:e2e': 'e', 'test:mobile': 'm', bake: 'b' }, extras: [], buildable: true },
  { name: 'tractor-pickup', dir: '/g/tractor-pickup', scripts: { test: 't', 'test:e2e': 'e' },
    extras: [{ name: 'TP_MP=engine', env: { TP_MP: 'engine' }, argv: ['npm', 'test'], allow: [/with the game frozen/] }], buildable: false },
];
const plan = (o = {}) => gatePlan({ engine: '/e', games: '/g', members: M, engineUnit: ['test/a.test.mjs', 'test/kits/b.test.mjs'],
  engineBrowser: ['test/e2e.test.mjs', 'test/hold-e2e.test.mjs'], perf: '/tmp/claude-1000/lion-hawk-phase3/3m/builds/x', ...o });
const arg = (cmd, k) => cmd[cmd.indexOf(k) + 1];

test('unit steps: 2G, no swap, 600 s, a 512 MB heap, never the lock; node --test always runs four files at a time', () => {
  const units = plan().filter(s => s.kind === 'unit');
  assert.equal(units.length, 4);
  for (const s of units) {
    assert.equal(s.cmd[0], 'systemd-run', s.name);
    for (const p of ['MemoryMax=2G', 'MemorySwapMax=0', 'RuntimeMaxSec=600', 'NODE_OPTIONS=--max-old-space-size=512']) assert.ok(s.cmd.includes(p), `${s.name}: ${p}`);
    assert.ok(!s.cmd.includes('flock'), s.name);
    const i = s.cmd.indexOf('node');
    if (i >= 0 && s.cmd[i + 1] === '--test') assert.equal(s.cmd[i + 2], '--test-concurrency=4', s.name);
  }
});
test('browser steps: behind the shared lock, 3G, 900 s, a 2048 MB heap, one file or script each', () => {
  const b = plan().filter(s => s.kind === 'browser');
  assert.deepEqual(b.map(s => s.name), ['engine test/e2e.test.mjs', 'engine test/hold-e2e.test.mjs', 'rally test:e2e', 'rally test:mobile', 'tractor-pickup test:e2e', 'rally probe']);
  for (const s of b) {
    assert.deepEqual(s.cmd.slice(0, 3), ['flock', LOCK, 'systemd-run'], s.name);
    for (const p of ['MemoryMax=3G', 'MemorySwapMax=0', 'RuntimeMaxSec=900', 'NODE_OPTIONS=--max-old-space-size=2048']) assert.ok(s.cmd.includes(p), `${s.name}: ${p}`);
  }
  assert.equal(LOCK, '/tmp/claude-1000/lion-hawk-browser.lock');
  assert.deepEqual(b[0].cmd.slice(-4), ['node', '--test', '--test-concurrency=4', 'test/e2e.test.mjs']);
});
test('game steps run with CI=1 (a missing golden fails) and no step sets LH_BLESS', () => {
  for (const s of plan()) {
    assert.ok(!s.cmd.some(a => /LH_BLESS/.test(a)), s.name);
    if (s.dir !== '/e' && !/ (build|probe)$/.test(s.name)) assert.ok(s.cmd.includes('CI=1'), s.name);
  }
});
test('order: engine unit, engine browser, workspace, extras, game browser, then builds and probes; --only filters', () => {
  assert.deepEqual(plan().map(s => s.name), ['engine unit', 'engine test/e2e.test.mjs', 'engine test/hold-e2e.test.mjs', 'workspace',
    'tractor-pickup TP_MP=engine', 'rally test:e2e', 'rally test:mobile', 'tractor-pickup test:e2e', 'rally build', 'rally probe']);
  assert.deepEqual(plan({ only: ['engine'] }).map(s => s.name), ['engine unit', 'engine test/e2e.test.mjs', 'engine test/hold-e2e.test.mjs']);
  assert.deepEqual(plan({ perf: null }).filter(s => / (build|probe)$/.test(s.name)), []);
});
test('builds go to the scratch dir, never under a site/ dir (global constraint 8)', () => {
  assert.equal(arg(plan().find(s => s.name === 'rally build').cmd, '--out'), '/tmp/claude-1000/lion-hawk-phase3/3m/builds/x/rally');
  assert.throws(() => plan({ perf: '/home/smiller/projects/four43/four43-lh3/site/exp' }), /under a site\/ dir/);
});
test('engineFiles: a test file that calls launch( is a browser suite; test/ is walked recursively', () => {
  const d = mkdtempSync(join(tmpdir(), 'gate-'));
  mkdirSync(join(d, 'test/kits'), { recursive: true });
  writeFileSync(join(d, 'test/a.test.mjs'), "test('x', () => {});");
  writeFileSync(join(d, 'test/e2e.test.mjs'), 'const chrome = await launch();');
  writeFileSync(join(d, 'test/kits/k.test.mjs'), "test('k', () => {});");
  writeFileSync(join(d, 'test/helper.mjs'), 'launch();');
  assert.deepEqual(engineFiles(d), { unit: ['test/a.test.mjs', 'test/kits/k.test.mjs'], browser: ['test/e2e.test.mjs'] });
});
test('parseCounts sums every node:test summary and lists each failing test once', () => {
  const name = 'the rate limits count in wall time: with the game frozen (rAF paused), a new window still opens (M-50)';
  const out = ['✔ a (1ms)', `✖ ${name} (12.5ms)`, 'ℹ pass 3', 'ℹ fail 1', '> rally', 'ℹ pass 26', 'ℹ fail 0', '✖ failing tests:', '', `✖ ${name} (12.5ms)`].join('\n');
  assert.deepEqual(parseCounts(out), { pass: 29, fail: 1, failed: [name] });
});
test('verdict: exit 0 passes; a failure passes only when every failing test is allowed by name', () => {
  const step = { allow: [/with the game frozen/] };
  assert.equal(verdict(step, { status: 0, fail: 0, failed: [] }), 'pass');
  assert.equal(verdict(step, { status: 1, fail: 1, failed: ['… with the game frozen (rAF paused) …'] }), 'pass (allowed)');
  assert.equal(verdict(step, { status: 1, fail: 2, failed: ['… with the game frozen …', 'another'] }), 'FAIL');
  assert.equal(verdict({}, { status: 1, fail: 1, failed: ['x'] }), 'FAIL');
  assert.equal(verdict(step, { status: 1, fail: 0, failed: [] }), 'FAIL'); // a crash or an OOM kill, not a test failure
});
test('dirtyGuarded flags changes under site/ and in game goldens only', () => {
  const porcelain = [' M games/rally/test/goldens/stage-scene.json', '?? site/exp/rally/index.html', ' M games/rally/src/sim.js', '?? games/test/x.mjs', ''].join('\n');
  assert.deepEqual(dirtyGuarded(porcelain), [' M games/rally/test/goldens/stage-scene.json', '?? site/exp/rally/index.html']);
});
