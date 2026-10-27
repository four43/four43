// Phase 3k T3 (A-1..A-6, D2): the committed bake matches the sources, the registry and the engine (bake --check), and
// carries what the game needs: 54 models (Kenney's, our dog house and the v3 buildings), anim tables for the two crowds only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import MATERIALS from '../src/defs/materials.js';
import CONFIG from '../game.config.js';

const root = new URL('../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const IDS = ['fence', 'gate', 'planks', 'post', 'oak', 'tree', 'treeFat', 'treeFall', 'bush', 'bushS', 'flowerY', 'flowerR', 'rock', 'pumpkin', 'corn', 'grass', 'grassS',
  'hay', 'hayB', 'apple', 'carrot', 'cabbage', 'cob', 'barrel', 'egg', 'sack', 'wheat', 'sign', 'pig', 'dog', 'chick', 'fox', 'dogHouse',
  // v3 (2.6.0): the buildings, the clinic's Furniture Kit pieces, the vet and her cat
  'coop', 'barn', 'clinic', 'vetTools', 'vet', 'cat', ...['desk', 'chairDesk', 'computerScreen', 'bedSingle', 'pillow', 'kitchenCabinet', 'kitchenSink', 'kitchenFridgeSmall', 'kitchenCoffeeMachine', 'rugRounded', 'pottedPlant', 'lampRoundFloor', 'bookcaseOpenLow', 'trashcan', 'coatRackStanding'].map(f => `furn_${f}`)];

test('lion-hawk bake --check: sources, registry hash and engine version agree with baked/', () => {
  const r = spawnSync('npx', ['lion-hawk', 'bake', '--game', '.', '--check'], { cwd: new URL('.', root), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test('the config bakes the 54 models the game draws, under the ids the code uses', () => {
  assert.deepEqual(Object.keys(CONFIG.bake.models).sort(), [...IDS].sort());
  assert.deepEqual(Object.keys(json('baked/manifest.json').models).sort(), [...IDS].sort());
  assert.deepEqual(Object.keys(json('baked/phys.json').models).sort(), [...IDS].sort());
});
test('phys.json records this registry; only the pig and chick carry anim tables (30 fps, the six clips)', () => {
  const phys = json('baked/phys.json'), man = json('baked/manifest.json');
  assert.equal(phys.materials, MATERIALS.hash);
  for (const id of IDS) assert.equal(man.models[id].anim !== null, id === 'pig' || id === 'chick', id);
  for (const id of ['pig', 'chick']) {
    const a = json(`baked/${man.models[id].anim}`);
    assert.equal(a.fps, 30); assert.deepEqual(Object.keys(a.clips).sort(), ['dance', 'eat', 'gesture-negative', 'idle', 'run', 'walk']);
  }
});
