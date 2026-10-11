// lion-hawk phase 1 (G-2): every workspace resolves the same three and Rapier, and the engine is a real folder
// inside games/ so its bare imports resolve from this workspace, not from wherever a symlink points.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPackageJSON } from 'node:module';
import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const games = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const members = ['lion-hawk-engine', 'pig-pens', 'tractor-pickup'];
const pkgJson = (dir, name) => realpathSync(findPackageJSON(name, pathToFileURL(`${games}/${dir}/package.json`)));

test('the engine is a real folder under games/', () => {
  assert.equal(realpathSync(`${games}/lion-hawk-engine`), `${games}/lion-hawk-engine`);
  assert.equal(pkgJson('pig-pens', 'lion-hawk'), `${games}/lion-hawk-engine/package.json`);
});
for (const name of ['three', '@dimforge/rapier3d-compat']) {
  test(`one copy of ${name} across the workspace`, () => {
    const paths = new Set(members.map(m => pkgJson(m, name)));
    assert.equal(paths.size, 1, [...paths].join('\n'));
  });
}
test('the shared copies satisfy the engine peer ranges', () => {
  const peers = JSON.parse(readFileSync(`${games}/lion-hawk-engine/package.json`, 'utf8')).peerDependencies;
  assert.deepEqual(Object.keys(peers).sort(), ['@dimforge/rapier3d-compat', 'three']);
  const version = name => JSON.parse(readFileSync(pkgJson('tractor-pickup', name), 'utf8')).version;
  assert.match(version('three'), /^0\.186\./);
  assert.match(version('@dimforge/rapier3d-compat'), /^0\.21\./);
});
