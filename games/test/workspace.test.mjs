// lion-hawk G-2: the games share one three and one Rapier, and they consume the engine from its own repo, a sibling
// of the four43 checkout (../../lion-hawk-engine from games/). The engine keeps its own copies only for its own tests;
// engine source must not import three/Rapier until the build aliases them to the games' copies (phase 3 CLI).
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPackageJSON } from 'node:module';
import { realpathSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const games = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const engine = realpathSync(`${games}/../../lion-hawk-engine`);
const members = ['pig-pens', 'tractor-pickup', 'rally'];
const pkgJson = (dir, name) => realpathSync(findPackageJSON(name, pathToFileURL(`${games}/${dir}/package.json`)));

test('every game consumes the engine from its own repo', () => {
  for (const m of members) assert.equal(pkgJson(m, 'lion-hawk'), `${engine}/package.json`, m);
});
for (const name of ['three', '@dimforge/rapier3d-compat']) {
  test(`one copy of ${name} across the games`, () => {
    const paths = new Set(members.map(m => pkgJson(m, name)));
    assert.equal(paths.size, 1, [...paths].join('\n'));
  });
}
test('the shared copies satisfy the engine peer ranges', () => {
  const peers = JSON.parse(readFileSync(`${engine}/package.json`, 'utf8')).peerDependencies;
  assert.deepEqual(Object.keys(peers).sort(), ['@dimforge/rapier3d-compat', 'three']);
  const version = name => JSON.parse(readFileSync(pkgJson('tractor-pickup', name), 'utf8')).version;
  assert.match(version('three'), /^0\.186\./);
  assert.match(version('@dimforge/rapier3d-compat'), /^0\.21\./);
});
test('engine source does not import three or Rapier yet (no alias in the game builds)', () => {
  const files = readdirSync(`${engine}/src`, { recursive: true }).filter(f => f.endsWith('.js'));
  for (const f of files) assert.doesNotMatch(readFileSync(`${engine}/src/${f}`, 'utf8'), /from\s*['"](three|@dimforge)/, f);
});
