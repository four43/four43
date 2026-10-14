// lion-hawk overview §1.3: Rally's game code builds physics only through the World. No hand-made RAPIER.World, no
// ColliderDesc, no collider property setters and no friction/density/restitution literals outside the registry
// (src/defs/materials.js). massProps (D3) and raw Rapier queries (L-1) are allowed only on a line marked
// `// lh-allow: <reason>` (games/test/phase3-done.test.mjs reads the marker on the same line).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from 'lion-hawk/test';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const files = p => statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const FORBID = [[/new\s+\w+\.World\s*\(/, 'new RAPIER.World'], [/\b(ColliderDesc|RigidBodyDesc)\b/, 'Rapier desc'],
  [/\.(createRigidBody|createCollider)\s*\(/, 'raw body or collider'],
  [/\.set(Friction|Density|Restitution|Mass)\s*\(/, 'collider property setter'], [/\b(friction|density|restitution)\s*:/, 'material literal']];
const ALLOW = [[/\bmassProps\b/, 'massProps'], [/\.(castRay\w*|castShape|intersection\w*|projectPoint)\s*\(/, 'raw Rapier query']];
export function violations(src, f = '') {
  const raw = src.split('\n'), code = stripComments(src).split('\n'), out = [];
  code.forEach((l, i) => {
    for (const [re, what] of FORBID) if (re.test(l)) out.push(`${f}:${i + 1}: ${what}: ${raw[i].trim()}`);
    const marked = /\/\/ lh-allow: \S/.test(raw[i]);
    for (const [re, what] of ALLOW) if (re.test(l) && !marked) out.push(`${f}:${i + 1}: ${what} without // lh-allow: ${raw[i].trim()}`);
  });
  return out;
}
test('src follows the §1.3 physics rules', () => {
  const all = files(SRC).filter(f => !f.endsWith(join('defs', 'materials.js')));
  assert.deepEqual(all.flatMap(f => violations(readFileSync(f, 'utf8'), f)), []);
});
test('the scan catches each rule and honours lh-allow', () => {
  assert.equal(violations('c.setFriction(1);').length, 1);
  assert.equal(violations('const m = { friction: 0.8 };').length, 1);
  assert.equal(violations('w.createCollider(d, b);').length, 1);
  assert.equal(violations('w.castRayAndGetNormal(r);').length, 1);
  assert.equal(violations('w.castRayAndGetNormal(r); // lh-allow: L-1 rays').length, 0);
  assert.equal(violations('const x = 1; // friction: 0.8 in a comment').length, 0);
});
