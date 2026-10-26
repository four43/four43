// exp/test/owners.test.mjs: a phase 3 branch may change only its own files (overview §5.2 and the rulings in
// 2026-10-13-phase-3-contract-issues.md), new test files, and its own notes; integrator files are nobody's (lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import { outside, parseNameStatus, OWNS } from './owners.mjs';

const e = (status, path) => ({ status, path });
const paths = list => list.map(x => x.path);

test('a plan stays inside its own files, its notes and new test files', () => {
  assert.deepEqual(outside('3b', [e('M', 'src/defs/materials.js'), e('A', 'src/defs/sidecar.js'), e('A', 'test/materials-pairs.test.mjs'),
    e('A', 'test/helpers/mat.mjs'), e('A', 'docs/plans/2026-10-13-phase-3b-materials-notes.md')]), []);
  assert.deepEqual(outside('3h', [e('A', 'src/kits/terrain/sim.js'), e('M', 'test/kits/terrain.test.mjs')]), []);
});
test('integrator files are outside every plan', () => {
  const integ = ['src/index.sim.js', 'src/index.view.js', 'src/index.net.js', 'testing/index.js', 'src/version.js', 'package.json',
    'package-lock.json', 'CHANGELOG.md', 'docs/spec.md', 'docs/field-notes.md', 'docs/plans/2026-10-13-phase-3-overview.md', 'testing/purity.js'];
  for (const plan of Object.keys(OWNS)) assert.deepEqual(paths(outside(plan, integ.map(p => e('M', p)))), integ, plan);
});
test('an existing test changed by a plan that does not own it is outside; rulings widen a row', () => {
  assert.deepEqual(paths(outside('3b', [e('M', 'test/engine.test.mjs')])), ['test/engine.test.mjs']);
  assert.deepEqual(outside('3c', [e('M', 'test/engine.test.mjs')]), []);
  assert.deepEqual(outside('3a', [e('M', 'src/view/hook.js'), e('M', 'test/gesture.test.mjs'), e('M', 'test/uiDom.test.mjs')]), []);
  assert.deepEqual(outside('3e', [e('A', 'src/view/materials/compiler.js')]), []);
  assert.deepEqual(outside('3i', [e('M', 'test/mp.test.mjs')]), []);
});
test("one plan's files are outside another's; game plans own only their game", () => {
  assert.deepEqual(paths(outside('3f', [e('M', 'src/view/boot.js')])), ['src/view/boot.js']);
  assert.deepEqual(paths(outside('3l', [e('M', 'exp/rally/src/sim.js'), e('M', 'exp/test/workspace.test.mjs'), e('M', 'exp/package-lock.json'),
    e('A', 'exp/tractor-pickup/baked/phys.json'), e('A', 'exp/tractor-pickup/docs/plans/2026-10-13-phase-3l-tractor-notes.md')])),
    ['exp/rally/src/sim.js', 'exp/test/workspace.test.mjs', 'exp/package-lock.json']);
  assert.throws(() => outside('3z', []), /unknown plan '3z'/);
});
test('parseNameStatus takes the new path of a rename', () => {
  assert.deepEqual(parseNameStatus('M\tsrc/a.js\nR087\tsrc/b.js\tsrc/c.js\nA\ttest/x.test.mjs\n'), [e('M', 'src/a.js'), e('R', 'src/c.js'), e('A', 'test/x.test.mjs')]);
});
