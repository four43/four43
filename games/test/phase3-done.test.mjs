// games/test/phase3-done.test.mjs: overview §1.3 for each game whose phase 3 plan is merged into feat/lion-hawk-3: no
// assets.json, no hand-built Rapier world, no ColliderDesc, no literal friction/density/restitution (outside its material
// registry), bake.mjs and build.py retired, builds through lion-hawk build, the version bumped, and every `// lh-allow:`
// line listed in the game's notes (lion-hawk 3m). Strict: the game is fully on the engine (user ruling), so Rapier object
// construction, raw bodies/colliders/joints/controllers, the renderer and any physical-property assignment are banned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from 'lion-hawk/test';
import { importsOf, jsFiles } from './helpers/scan.mjs';

const games = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
// The integrator adds a game here in the commit that merges its phase 3 plan (3m Task 18).
export const MIGRATED = ['pig-pens', 'rally'];
const VERSION = { rally: '0.4.0', 'pig-pens': '2.2.0', 'tractor-pickup': '1.9.0' };
const NOTES = { rally: '2026-10-13-phase-3j-rally-notes.md', 'pig-pens': '2026-10-13-phase-3k-pigpens-notes.md', 'tractor-pickup': '2026-10-13-phase-3l-tractor-notes.md' };
const MATERIALS = join('src', 'defs', 'materials.js');
// Banned everywhere in game code, including the material registry.
export const RULES = [
  ['assets.json', /['"][^'"]*assets\.json['"]/],
  ['a Rapier RigidBodyDesc, ColliderDesc or JointData', /\b(?:RigidBodyDesc|ColliderDesc|JointData)\b/],
  ['a hand-built Rapier world', /\bnew\s+(?:[\w$]+\.)?World\s*\(/],
  ['a raw createRigidBody, createCollider, createImpulseJoint or createCharacterController call', /\.\s*(?:createRigidBody|createCollider|createImpulseJoint|createCharacterController)\s*\(/],
  ['a WebGLRenderer (the engine owns the renderer)', /\bnew\s+(?:[\w$]+\.)?WebGLRenderer\s*\(/],
];
// Banned everywhere except src/defs/materials.js.
export const PROPERTY_RULES = [
  ['a setFriction, setDensity or setRestitution call', /\b(?:setFriction|setDensity|setRestitution)\s*\(/],
  ['a friction, density or restitution property or assignment', /\b(?:friction|density|restitution)\s*(?::|=(?![=>]))/],
];
const RAPIER_IMPORT = /['"](?:@dimforge\/)?rapier3d[^'"]*['"]/;
const WAIVABLE = /massProps|castRay|castShape|intersection|projectPoint/;
const ENGINE = /^lion-hawk(?:\/|$)/;

// Every .js/.mjs under the game root except tests, dependencies and generated bundles (build/, dist/ are untracked output).
export function gameFiles(dir) {
  return jsFiles(dir).filter(f => {
    const parts = relative(dir, f).split(sep);
    return !/^(?:test|build|dist)$/.test(parts[0]) && !parts.includes('node_modules');
  });
}
export function violations(dir) {
  const bad = [], allows = [];
  const files = gameFiles(dir);
  for (const f of files) {
    const rel = relative(dir, f), isMaterials = rel === MATERIALS;
    const raw = readFileSync(f, 'utf8').split('\n'), clean = stripComments(raw.join('\n')).split('\n');
    const usesDefineGame = /\bdefineGame\b/.test(clean.join('\n'));
    clean.forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      const allow = /lh-allow:(.*)$/.exec(raw[i]);
      if (allow) {
        if (!allow[1].trim()) bad.push(`${at} lh-allow with no reason`);
        else if (!WAIVABLE.test(line)) bad.push(`${at} lh-allow on a line that is not massProps or a raw query`);
        else allows.push(at);
        return;
      }
      for (const [rule, re] of RULES) if (re.test(line)) bad.push(`${at} ${rule}`);
      if (!isMaterials) for (const [rule, re] of PROPERTY_RULES) if (re.test(line)) bad.push(`${at} ${rule}`);
      if (RAPIER_IMPORT.test(line) && !usesDefineGame) bad.push(`${at} a Rapier import outside a defineGame file`);
    });
    if (isMaterials && !importsOf([f], ENGINE).length) bad.push(`${rel} does not import from 'lion-hawk'`);
  }
  const entry = files.filter(f => /^src[\\/]/.test(relative(dir, f)) || relative(dir, f) === 'game.config.js');
  if (!importsOf(entry, ENGINE).length) bad.push(`no src file or game.config.js imports 'lion-hawk'`);
  return { bad, allows };
}
export function emptyJson(dir, rel) {
  try { return Object.keys(JSON.parse(readFileSync(join(dir, rel), 'utf8'))).length === 0 ? `${rel} is empty` : null; }
  catch (e) { return `${rel}: ${e.message}`; }
}

test('MIGRATED names only the three games', () => { for (const g of MIGRATED) assert.ok(g in VERSION, g); });
for (const g of MIGRATED) {
  test(`${g}: overview §1.3 done-when`, () => {
    const dir = join(games, g);
    for (const f of ['bake.mjs', 'build.py', 'src/assets.json']) assert.ok(!existsSync(join(dir, f)), `${g}: ${f} should be retired`);
    for (const f of ['game.config.js', 'baked/phys.json', 'baked/manifest.json']) assert.ok(existsSync(join(dir, f)), `${g}: ${f} is missing`);
    for (const f of ['baked/phys.json', 'baked/manifest.json']) assert.equal(emptyJson(dir, f), null);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.version, VERSION[g]);
    assert.match(pkg.scripts?.build ?? '', /^lion-hawk build\b/);
    const { bad, allows } = violations(dir);
    assert.deepEqual(bad, []);
    const notes = readFileSync(join(dir, 'docs/plans', NOTES[g]), 'utf8');
    for (const at of allows) assert.ok(new RegExp(`${at.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`).test(notes), `${g}: ${at} has an lh-allow line that ${NOTES[g]} does not list`);
  });
}
