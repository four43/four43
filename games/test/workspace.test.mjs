// lion-hawk phase 1 (G-2): every workspace resolves the same three and Rapier, and the engine is a real folder
// inside games/ so its bare imports resolve from this workspace, not from wherever a symlink points.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const games = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const members = ['lion-hawk-engine', 'pig-pens', 'tractor-pickup'];
const resolveFrom = (dir, spec) => realpathSync(createRequire(`${games}/${dir}/package.json`).resolve(spec));

test('the engine is a real folder under games/', () => {
  assert.equal(realpathSync(`${games}/lion-hawk-engine`), `${games}/lion-hawk-engine`);
  assert.ok(resolveFrom('pig-pens', 'lion-hawk/package.json').startsWith(`${games}/lion-hawk-engine/`));
});
for (const spec of ['three/package.json', '@dimforge/rapier3d-compat/package.json']) {
  test(`one copy of ${spec.split('/package.json')[0]} across the workspace`, () => {
    const paths = new Set(members.map(m => resolveFrom(m, spec)));
    assert.equal(paths.size, 1, [...paths].join('\n'));
  });
}
test('the shared copies satisfy the engine peer ranges', () => {
  const peers = JSON.parse(readFileSync(`${games}/lion-hawk-engine/package.json`, 'utf8')).peerDependencies;
  assert.deepEqual(Object.keys(peers).sort(), ['@dimforge/rapier3d-compat', 'three']);
  const version = spec => JSON.parse(readFileSync(resolveFrom('tractor-pickup', `${spec}/package.json`), 'utf8')).version;
  assert.match(version('three'), /^0\.186\./);
  assert.match(version('@dimforge/rapier3d-compat'), /^0\.21\./);
});
