// Phase 3k T1: the Kenney sources Pig Pens bakes from are vendored (overview §5.4) and pinned, so a re-download that
// changes a model shows up here before it changes a bake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../assets/models/', import.meta.url);
const SOURCES = JSON.parse(readFileSync(new URL('SOURCES.json', dir), 'utf8'));
const sha16 = f => createHash('sha256').update(readFileSync(new URL(f, dir))).digest('hex').slice(0, 16);

test('every vendored file is present and matches its pinned sha256', () => {
  assert.equal(Object.keys(SOURCES.files).length, 62); // 58 models, 4 palettes
  for (const [f, { sha256 }] of Object.entries(SOURCES.files)) assert.equal(sha16(f), sha256, f);
});
test('each kit folder carries its Kenney licence (CC0)', () => {
  for (const kit of ['nature-kit', 'graveyard-kit', 'food-kit', 'cube-pets', 'furniture-kit', 'mini-characters']) {
    assert.ok(existsSync(new URL(`${kit}/License.txt`, dir)), kit);
    assert.match(readFileSync(new URL(`${kit}/License.txt`, dir), 'utf8'), /Creative Commons Zero, CC0/, kit);
  }
});
test('textured kits ship their own palette next to the GLBs', () => {
  for (const kit of ['graveyard-kit', 'food-kit', 'cube-pets', 'mini-characters']) assert.ok(existsSync(new URL(`${kit}/Textures/colormap.png`, dir)), kit);
});
