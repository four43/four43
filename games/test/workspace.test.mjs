// lion-hawk G-2 and phase 3 D9: the games share one three and one Rapier and consume the engine from its own repo, a
// sibling of the four43 checkout (../../lion-hawk-engine from games/). Engine view modules import three directly (bare
// 'three' or 'three/addons/…', which `lion-hawk build` dedupes to the game's copy); engine code never imports Rapier (the
// game injects its initialised module); engine sim code never imports three.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPackageJSON } from 'node:module';
import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { simRoots } from 'lion-hawk/test';
import { jsFiles, importsOf } from './helpers/scan.mjs';

const games = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const engine = process.env.LH_ENGINE ?? realpathSync(`${games}/../../lion-hawk-engine`);
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
test('engine source never imports Rapier (D9: defineGame({ physics: { rapier } }))', () => {
  assert.deepEqual(importsOf(jsFiles(`${engine}/src`), /^@dimforge\//), []);
});
test('engine sim code never imports three (L-3), kit sim halves included', () => {
  assert.deepEqual(importsOf(simRoots(`${engine}/`).flatMap(jsFiles), /^three(\/|$)/), []);
});
test("engine view code imports three only as 'three' or 'three/addons/…', which the build dedupes", () => {
  assert.deepEqual(importsOf(jsFiles(`${engine}/src`), /^three(\/|$)/).filter(h => !/^three(\/addons\/[\w./-]+)?$/.test(h.spec)), []);
});
