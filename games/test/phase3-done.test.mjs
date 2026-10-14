// games/test/phase3-done.test.mjs: overview §1.3 for each game whose phase 3 plan is merged into feat/lion-hawk-3: no
// assets.json, no hand-built Rapier world, no ColliderDesc, no literal friction/density/restitution (outside its material
// registry), bake.mjs and build.py retired, builds through lion-hawk build, the version bumped, and every `// lh-allow:`
// line listed in the game's notes (lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from 'lion-hawk/test';
import { jsFiles } from './helpers/scan.mjs';

const games = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const engine = realpathSync(`${games}/../../lion-hawk-engine`);
// The integrator adds a game here in the commit that merges its phase 3 plan (3m Task 18).
export const MIGRATED = [];
const VERSION = { rally: '0.4.0', 'pig-pens': '2.2.0', 'tractor-pickup': '1.9.0' };
const NOTES = { rally: '2026-10-13-phase-3j-rally-notes.md', 'pig-pens': '2026-10-13-phase-3k-pigpens-notes.md', 'tractor-pickup': '2026-10-13-phase-3l-tractor-notes.md' };
export const RULES = [
  ['assets.json', /['"][^'"]*assets\.json['"]/],
  ['a hand-built Rapier world', /\bnew\s+[\w$]+\.World\s*\(/],
  ['ColliderDesc', /\bColliderDesc\s*\./],
  ['a literal friction, density or restitution', /\b(?:setFriction|setDensity|setRestitution)\s*\(\s*-?[\d.]|\b(?:friction|density|restitution)\s*:\s*-?[\d.]/],
];
export function violations(dir) {
  const bad = [], allows = [];
  for (const f of jsFiles(join(dir, 'src'))) {
    const rel = relative(dir, f);
    if (rel === join('src', 'defs', 'materials.js')) continue;
    const raw = readFileSync(f, 'utf8').split('\n'), clean = stripComments(raw.join('\n')).split('\n');
    clean.forEach((line, i) => {
      if (/lh-allow:\s*\S/.test(raw[i])) { allows.push(rel); return; }
      for (const [rule, re] of RULES) if (re.test(line)) bad.push(`${rel}:${i + 1} ${rule}`);
    });
  }
  return { bad, allows: [...new Set(allows)] };
}

test('MIGRATED names only the three games', () => { for (const g of MIGRATED) assert.ok(g in VERSION, g); });
for (const g of MIGRATED) {
  test(`${g}: overview §1.3 done-when`, () => {
    const dir = join(games, g);
    for (const f of ['bake.mjs', 'build.py', 'src/assets.json']) assert.ok(!existsSync(join(dir, f)), `${g}: ${f} should be retired`);
    for (const f of ['game.config.js', 'baked/phys.json', 'baked/manifest.json']) assert.ok(existsSync(join(dir, f)), `${g}: ${f} is missing`);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.version, VERSION[g]);
    assert.match(pkg.scripts?.build ?? '', /^lion-hawk build\b/);
    const { bad, allows } = violations(dir);
    assert.deepEqual(bad, []);
    const notes = readFileSync(join(dir, 'docs/plans', NOTES[g]), 'utf8');
    for (const rel of allows) assert.ok(notes.includes(rel), `${g}: ${rel} has an lh-allow line that ${NOTES[g]} does not list`);
  });
}
