// Overview §5.5 feel samples against the pre-swap row of test/feel-baseline.json, with the tolerances written there before any run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import R from '@dimforge/rapier3d-compat';
import { courseRun, bumpRun } from './helpers/feel.mjs';
await R.init();
const B = JSON.parse(fs.readFileSync(new URL('./feel-baseline.json', import.meta.url))), pre = B.rows[0], T = B.tolerance;

test('course time within 3 % and boops within 1 of the pre-swap sample', { timeout: 240_000 }, () => {
  const c = courseRun();
  assert.ok(Math.abs(c.seconds - pre.course.seconds) <= pre.course.seconds * T.seconds, `course ${c.seconds} s vs ${pre.course.seconds} s`);
  assert.ok(Math.abs(c.boops - pre.course.boops) <= T.boops, `boops ${c.boops} vs ${pre.course.boops}`);
});
test('the soft bump keeps its outcome (until multiplayer makes trains solid)', { timeout: 240_000 }, () => {
  const b = bumpRun();
  for (const i of [0, 1]) assert.ok(Math.abs(b.bumps[i] - pre.bump.bumps[i]) <= T.bumps, `bumps[${i}] ${b.bumps[i]} vs ${pre.bump.bumps[i]}`);
  assert.ok(Math.abs(b.separation - pre.bump.separation) <= T.separation, `separation ${b.separation} vs ${pre.bump.separation}`);
});
